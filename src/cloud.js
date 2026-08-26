/* =========================================================================
   cloud.js — Supabase sync.

   Your library lives in the cloud and is mirrored into this browser. The local
   copy is a cache, not the source of truth, which means:

     • clearing your browser doesn't lose anything
     • a new phone just needs a sign-in
     • phone and laptop share one library
     • it still works with no signal — changes queue and push when you're back

   Plain fetch against the Supabase REST + Auth endpoints. No SDK, no CDN, no
   build step, consistent with the rest of the app.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var CFG_KEY = 'atl-content-journal:cloud-config';
  var SESSION_KEY = 'atl-content-journal:cloud-session';

  var config = { url: '', anonKey: '' };
  var session = null;         // { access_token, refresh_token, expires_at, email, user_id }
  var listeners = [];

  var status = {
    state: 'off',             // off | signed-out | idle | syncing | error | offline
    lastSyncedAt: null,
    pendingWrite: false,
    message: ''
  };

  /* ---------- config + session persistence ---------- */

  function loadLocal() {
    // Whatever is baked into config.js is the starting point, so a brand-new
    // device needs nothing but a sign-in. Anything saved here wins over it.
    var baked = window.CJ && window.CJ.DEFAULT_CLOUD;
    if (baked && baked.url && baked.anonKey) {
      config = { url: String(baked.url).replace(/\/+$/, ''), anonKey: String(baked.anonKey) };
    }
    try {
      var c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
      if (c && c.url && c.anonKey) config = c;
      var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (s && s.access_token) session = s;
    } catch (e) { /* first run */ }
    status.state = !isConfigured() ? 'off' : (session ? 'idle' : 'signed-out');
  }

  /**
   * Accept a connection handed over from another device via a setup link.
   * The phone then only has to sign in.
   */
  function applySetupPayload(encoded) {
    try {
      var b64 = String(encoded).replace(/-/g, '+').replace(/_/g, '/');
      var cfg = JSON.parse(decodeURIComponent(escape(atob(b64))));
      if (!cfg || !cfg.u || !cfg.k) return false;
      saveConfig(cfg.u, cfg.k);
      return true;
    } catch (e) {
      console.error('bad setup link', e);
      return false;
    }
  }

  /** Build the link that carries this connection to another device. */
  function setupLink() {
    if (!isConfigured()) return '';
    var json = JSON.stringify({ u: config.url, k: config.anonKey });
    var b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_');
    return location.origin + location.pathname + '#setup=' + b64;
  }

  function saveConfig(url, anonKey) {
    config = { url: String(url || '').trim().replace(/\/+$/, ''), anonKey: String(anonKey || '').trim() };
    try { localStorage.setItem(CFG_KEY, JSON.stringify(config)); } catch (e) {}
    status.state = !config.url ? 'off' : (session ? 'idle' : 'signed-out');
    emit();
  }

  function saveSession(s) {
    session = s;
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
    status.state = !config.url ? 'off' : (session ? 'idle' : 'signed-out');
    emit();
  }

  function isConfigured() { return !!(config.url && config.anonKey); }
  function isSignedIn() { return !!(session && session.access_token); }
  function currentEmail() { return session ? session.email : ''; }
  function getConfig() { return { url: config.url, anonKey: config.anonKey }; }

  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (fn) { try { fn(status); } catch (e) { console.error(e); } }); }

  function setStatus(state, message) {
    status.state = state;
    status.message = message || '';
    emit();
  }

  /* ---------- low-level requests ---------- */

  function authFetch(path, opts) {
    opts = opts || {};
    var headers = Object.assign({
      'apikey': config.anonKey,
      'content-type': 'application/json'
    }, opts.headers || {});
    if (session && session.access_token) headers.authorization = 'Bearer ' + session.access_token;

    return fetch(config.url + path, Object.assign({}, opts, { headers: headers }))
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
          if (!res.ok) {
            var msg = (data && (data.msg || data.message || data.error_description || data.error)) ||
                      text || ('HTTP ' + res.status);
            var err = new Error(msg);
            err.statusCode = res.status;
            throw err;
          }
          return data;
        });
      });
  }

  /** Refresh an expired access token, then retry once. */
  function withFreshToken(run) {
    var needsRefresh = session && session.expires_at && (Date.now() > (session.expires_at - 60000));
    var prep = needsRefresh ? refreshSession() : Promise.resolve();
    return prep.then(run).catch(function (err) {
      if (err && (err.statusCode === 401 || err.statusCode === 403) && session && session.refresh_token) {
        return refreshSession().then(run);
      }
      throw err;
    });
  }

  function storeAuth(data, email) {
    if (!data || !data.access_token) throw new Error('That sign-in did not return a session. Check the email and password.');
    saveSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + ((data.expires_in || 3600) * 1000),
      email: (data.user && data.user.email) || email || '',
      user_id: (data.user && data.user.id) || (session && session.user_id) || ''
    });
    return session;
  }

  function refreshSession() {
    if (!session || !session.refresh_token) return Promise.reject(new Error('Signed out.'));
    var token = session.refresh_token;
    // Clear first so authFetch doesn't send the stale bearer token.
    var email = session.email;
    return fetch(config.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'apikey': config.anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: token })
    }).then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.access_token) { saveSession(null); throw new Error('Your session expired. Sign in again.'); }
        storeAuth(data, email);
      });
  }

  /* ---------- auth ---------- */

  function signUp(email, password) {
    return authFetch('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ email: email, password: password })
    }).then(function (data) {
      // With email confirmation on, no session comes back until they confirm.
      if (data && data.access_token) { storeAuth(data, email); return { confirmed: true }; }
      return { confirmed: false };
    });
  }

  function signIn(email, password) {
    return authFetch('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: email, password: password })
    }).then(function (data) { storeAuth(data, email); return session; });
  }

  function signOut() {
    saveSession(null);
    return Promise.resolve();
  }

  function resetPassword(email, redirectTo) {
    return authFetch('/auth/v1/recover', {
      method: 'POST',
      body: JSON.stringify({ email: email, redirect_to: redirectTo || location.href })
    });
  }

  /* ---------- the journal row ---------- */

  /** Fetch the remote document, or null if this account has never saved one. */
  function pull() {
    if (!isConfigured() || !isSignedIn()) return Promise.resolve(null);
    return withFreshToken(function () {
      return authFetch('/rest/v1/journals?select=data,updated_at&user_id=eq.' + encodeURIComponent(session.user_id), {
        method: 'GET'
      });
    }).then(function (rows) {
      if (!rows || !rows.length) return null;
      return { data: rows[0].data, updatedAt: rows[0].updated_at };
    });
  }

  /**
   * Write the document, but only if the server still holds the version we read.
   *
   * `expectedStamp` is the `updated_at` from the pull that fed this write.
   * Resolves to the new timestamp on success, or **null** if someone else wrote
   * in between — the caller then re-reads, re-merges, and tries again.
   *
   * Without this, two devices saving at the same moment both read the old copy,
   * both merge into it, and the second write silently erases the first one's
   * new entries. A last-write-wins upsert is not safe here.
   */
  function push(doc, expectedStamp) {
    if (!isConfigured() || !isSignedIn()) return Promise.reject(new Error('Not signed in.'));
    var nowIso = new Date().toISOString();

    if (!expectedStamp) {
      // No row yet — insert. A 409 means another device created it first.
      return withFreshToken(function () {
        return authFetch('/rest/v1/journals', {
          method: 'POST',
          headers: { 'prefer': 'return=representation' },
          body: JSON.stringify([{ user_id: session.user_id, data: doc, updated_at: nowIso }])
        });
      }).then(function (rows) {
        return rows && rows[0] ? rows[0].updated_at : nowIso;
      }).catch(function (err) {
        if (err.statusCode === 409) return null;   // lost the create race — retry
        throw err;
      });
    }

    var q = '/rest/v1/journals?user_id=eq.' + encodeURIComponent(session.user_id) +
            '&updated_at=eq.' + encodeURIComponent(expectedStamp);

    return withFreshToken(function () {
      return authFetch(q, {
        method: 'PATCH',
        headers: { 'prefer': 'return=representation' },
        body: JSON.stringify({ data: doc, updated_at: nowIso })
      });
    }).then(function (rows) {
      // Zero rows updated = the version moved under us.
      if (!rows || !rows.length) return null;
      return rows[0].updated_at;
    });
  }

  /** One-time check that the table exists and the policies let us read it. */
  function testConnection() {
    if (!isConfigured()) return Promise.reject(new Error('Add your project URL and anon key first.'));
    if (!isSignedIn()) return Promise.reject(new Error('Sign in first.'));
    return pull().then(function (row) {
      return row ? 'Connected — found your saved library.' : 'Connected — no library saved yet, this device will create it.';
    });
  }

  CJ.cloud = {
    loadLocal: loadLocal,
    saveConfig: saveConfig,
    applySetupPayload: applySetupPayload,
    setupLink: setupLink,
    getConfig: getConfig,
    isConfigured: isConfigured,
    isSignedIn: isSignedIn,
    currentEmail: currentEmail,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    resetPassword: resetPassword,
    pull: pull,
    push: push,
    testConnection: testConnection,
    status: status,
    setStatus: setStatus,
    onChange: onChange
  };

})(window.CJ);
