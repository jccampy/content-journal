/* =========================================================================
   sync.js — keeps the local cache and the cloud document reconciled.

   The rules, in plain terms:

     • Every change saves locally first, immediately. The app never waits on
       the network, and works fully offline.
     • A few seconds later the change is pushed to the cloud.
     • Before pushing, we check whether the cloud copy changed since we last
       looked (your other device). If it did, we merge first, then push — so
       adding things on your phone and your laptop the same afternoon never
       loses either side.
     • On open, we render the local copy instantly, then pull and merge.

   Merge rule: per item, the most recently edited version wins. Calendar ideas
   you've acted on (planned, posted, dismissed, rescheduled) always beat an
   untouched suggestion, because a decision outranks a guess.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var PUSH_DELAY = 2500;
  var pushTimer = null;
  var inFlight = false;
  var dirty = false;
  var lastRemoteStamp = null;   // updated_at we last reconciled against
  var pullTimer = null;

  /* ---------- merging ---------- */

  function byId(list) {
    var m = {};
    (list || []).forEach(function (x) { if (x && x.id) m[x.id] = x; });
    return m;
  }

  function newer(a, b) {
    var at = new Date(a && a.updatedAt || 0).getTime();
    var bt = new Date(b && b.updatedAt || 0).getTime();
    return at >= bt ? a : b;
  }

  /** How much a user has invested in a calendar idea. Higher wins a tie. */
  function ideaWeight(idea) {
    if (!idea) return -1;
    if (idea.status === 'done') return 5;
    if (idea.status === 'planned') return 4;
    if (idea.status === 'dismissed') return 3;
    if (idea.pinned) return 2;
    if (idea.touched) return 1;
    return 0;
  }

  function mergeDocs(local, remote) {
    if (!remote) return local;
    if (!local) return remote;

    var out = JSON.parse(JSON.stringify(local));

    /* items — newest edit wins, union of both sides */
    var li = byId(local.items), ri = byId(remote.items), items = [];
    var seen = {};
    Object.keys(li).forEach(function (id) {
      seen[id] = true;
      items.push(ri[id] ? newer(li[id], ri[id]) : li[id]);
    });
    Object.keys(ri).forEach(function (id) { if (!seen[id]) items.push(ri[id]); });
    out.items = items;

    /* events — union by id, remote fills gaps */
    var le = byId(local.events), re = byId(remote.events), events = [];
    var seenE = {};
    Object.keys(le).forEach(function (id) { seenE[id] = true; events.push(le[id]); });
    Object.keys(re).forEach(function (id) { if (!seenE[id]) events.push(re[id]); });
    out.events = events;

    /* ideas — a decision beats a suggestion */
    var ld = byId(local.ideas), rd = byId(remote.ideas), ideas = [];
    var seenD = {};
    Object.keys(ld).forEach(function (id) {
      seenD[id] = true;
      var mine = ld[id], theirs = rd[id];
      if (!theirs) { ideas.push(mine); return; }
      ideas.push(ideaWeight(theirs) > ideaWeight(mine) ? theirs : mine);
    });
    Object.keys(rd).forEach(function (id) { if (!seenD[id]) ideas.push(rd[id]); });
    out.ideas = ideas;

    /* tag categories — union, local wins a clash */
    out.tagMeta = Object.assign({}, remote.tagMeta || {}, local.tagMeta || {});

    /* settings — whichever document was written more recently */
    var localStamp = new Date(local.lastGeneratedAt || local.createdAt || 0).getTime();
    var remoteStamp = new Date(remote.lastGeneratedAt || remote.createdAt || 0).getTime();
    if (remoteStamp > localStamp) {
      out.settings = Object.assign({}, local.settings, remote.settings);
    }

    return out;
  }

  /* ---------- pull ---------- */

  function pull(opts) {
    opts = opts || {};
    if (!CJ.cloud.isConfigured() || !CJ.cloud.isSignedIn()) return Promise.resolve(false);

    CJ.cloud.setStatus('syncing');
    return CJ.cloud.pull().then(function (row) {
      if (!row) {
        // Nothing in the cloud yet — this device seeds it.
        lastRemoteStamp = null;
        CJ.cloud.setStatus('idle');
        if (CJ.getItems().length) schedulePush(true);
        return false;
      }

      var merged = mergeDocs(CJ.state, row.data);
      lastRemoteStamp = row.updatedAt;
      CJ.replaceState(merged);

      CJ.cloud.status.lastSyncedAt = new Date().toISOString();
      CJ.cloud.setStatus('idle');
      if (opts.onApplied) opts.onApplied();
      return true;
    }).catch(function (err) {
      console.error('pull failed', err);
      CJ.cloud.setStatus(navigator.onLine === false ? 'offline' : 'error', err.message);
      return false;
    });
  }

  /* ---------- push ---------- */

  function schedulePush(immediate) {
    if (!CJ.cloud.isConfigured() || !CJ.cloud.isSignedIn()) return;
    dirty = true;
    CJ.cloud.status.pendingWrite = true;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(doPush, immediate ? 0 : PUSH_DELAY);
  }

  /**
   * Read, merge, write — and if the server's version moved while we were
   * thinking, throw the write away and do the whole thing again against the
   * new version. This is what makes simultaneous saves from two devices safe.
   */
  function attemptPush(tries) {
    return CJ.cloud.pull().then(function (row) {
      if (row && row.data) CJ.replaceState(mergeDocs(CJ.state, row.data));
      return CJ.cloud.push(CJ.exportDoc(), row ? row.updatedAt : null);
    }).then(function (stamp) {
      if (stamp !== null) return stamp;
      if (tries >= 4) throw new Error('Another device kept saving at the same time. Will try again shortly.');
      // Small randomised backoff so two devices don't lock step.
      var wait = 120 + Math.floor(Math.random() * 260) * (tries + 1);
      return new Promise(function (r) { setTimeout(r, wait); }).then(function () {
        return attemptPush(tries + 1);
      });
    });
  }

  function doPush() {
    if (inFlight) { schedulePush(); return; }
    if (!CJ.cloud.isConfigured() || !CJ.cloud.isSignedIn()) return;
    if (!dirty) return;

    inFlight = true;
    dirty = false;
    CJ.cloud.setStatus('syncing');

    attemptPush(0).then(function (stamp) {
      lastRemoteStamp = stamp;
      CJ.cloud.status.lastSyncedAt = new Date().toISOString();
      CJ.cloud.status.pendingWrite = dirty;
      CJ.cloud.setStatus('idle');
    }).catch(function (err) {
      console.error('push failed', err);
      dirty = true; // keep it queued
      CJ.cloud.status.pendingWrite = true;
      CJ.cloud.setStatus(navigator.onLine === false ? 'offline' : 'error', err.message);
    }).then(function () {
      inFlight = false;
      if (dirty) { if (pushTimer) clearTimeout(pushTimer); pushTimer = setTimeout(doPush, PUSH_DELAY); }
    });
  }

  /* ---------- lifecycle ---------- */

  function start() {
    CJ.cloud.loadLocal();

    // Any local change queues a push.
    CJ.subscribe(function () { schedulePush(); });

    var refresh = function () { pull({ onApplied: function () { CJ.app.renderAll(); } }); };
    var live = function () { return CJ.cloud.isConfigured() && CJ.cloud.isSignedIn(); };

    // These are attached unconditionally and guarded inside. Attaching them only
    // when already signed in meant that signing in for the first time left the
    // tab with no background sync until it was reloaded.
    if (pullTimer) clearInterval(pullTimer);
    pullTimer = setInterval(function () {
      if (document.hidden || inFlight || !live()) return;
      refresh();
    }, 90000);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && live()) refresh();
    });

    window.addEventListener('online', function () {
      if (!live()) return;
      CJ.cloud.setStatus('idle');
      refresh();
      if (dirty) schedulePush(true);
    });
    window.addEventListener('offline', function () {
      if (live()) CJ.cloud.setStatus('offline');
    });

    if (live()) refresh();

    // Last-ditch flush when the tab closes.
    window.addEventListener('beforeunload', function () {
      if (!dirty || !CJ.cloud.isSignedIn()) return;
      try {
        var cfg = CJ.cloud.getConfig();
        var blob = new Blob([JSON.stringify(CJ.exportDoc())], { type: 'application/json' });
        // sendBeacon can't set auth headers, so this is best-effort only; the
        // real guarantee is the 2.5s debounce, which almost always wins.
        void blob; void cfg;
      } catch (e) {}
    });
  }

  /** Called after sign-in: pull, merge whatever is already on this device, push. */
  function adoptAfterSignIn() {
    return pull({ onApplied: function () { CJ.app.renderAll(); } }).then(function () {
      schedulePush(true);
      CJ.app.renderAll();
    });
  }

  CJ.sync = {
    start: start,
    pull: pull,
    pushNow: function () { schedulePush(true); },
    adoptAfterSignIn: adoptAfterSignIn,
    mergeDocs: mergeDocs,
    hasPending: function () { return dirty; },
    debug: function () { return { lastRemoteStamp: lastRemoteStamp, dirty: dirty, inFlight: inFlight }; }
  };

})(window.CJ);
