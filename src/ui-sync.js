/* =========================================================================
   ui-sync.js — the sync status chip and the Settings panel that sets it up.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var $ = CJ.ui.$, el = CJ.ui.el, toast = CJ.ui.toast;

  /* ---------- status chip in the top bar ---------- */

  var LABELS = {
    'off':        { text: 'Local only',  cls: 'sync-off',     title: 'Not syncing. Your library lives only in this browser. Set up sync in Settings.' },
    'signed-out': { text: 'Sign in',     cls: 'sync-warn',    title: 'Sync is configured but you are signed out. Your changes are staying on this device.' },
    'idle':       { text: 'Synced',      cls: 'sync-ok',      title: 'Everything is saved to the cloud.' },
    'syncing':    { text: 'Syncing…',    cls: 'sync-busy',    title: 'Talking to the server.' },
    'offline':    { text: 'Offline',     cls: 'sync-warn',    title: 'No connection. Your changes are saved here and will upload when you are back online.' },
    'error':      { text: 'Sync issue',  cls: 'sync-error',   title: 'Something went wrong syncing. Open Settings for details.' }
  };

  function renderChip() {
    var s = CJ.cloud.status;
    var info = LABELS[s.state] || LABELS.off;
    var chip = $('#sync-chip');
    if (!chip) return;

    var text = info.text;
    if (s.state === 'idle' && s.pendingWrite) text = 'Saving…';
    else if (s.state === 'idle' && s.lastSyncedAt) text = 'Synced';

    chip.className = 'sync-chip ' + info.cls;
    $('#sync-label').textContent = text;
    chip.title = (info.title + (s.message ? '\n\n' + s.message : '') +
                 (s.lastSyncedAt ? '\n\nLast sync: ' + new Date(s.lastSyncedAt).toLocaleTimeString() : ''));
  }

  /* ---------- settings panel ---------- */

  function field(labelText, input, hint) {
    return el('label', { class: 'field' }, [
      el('span', { text: labelText }),
      input,
      hint ? el('span', { class: 'field-hint', text: hint }) : null
    ]);
  }

  function renderPanel() {
    var box = $('#sync-body');
    if (!box) return;
    box.innerHTML = '';

    var configured = CJ.cloud.isConfigured();
    var signedIn = CJ.cloud.isSignedIn();
    var cfg = CJ.cloud.getConfig();

    /* --- state summary --- */
    if (signedIn) {
      var s = CJ.cloud.status;
      box.appendChild(el('div', { class: 'notice' }, [
        el('strong', { text: '✓ Syncing as ' + CJ.cloud.currentEmail() }),
        el('div', { class: 'muted-xs', style: { color: 'inherit', marginTop: '4px' } }, [
          'Your library is stored in the cloud. Sign in with this email on any other device and everything is there. ' +
          (s.lastSyncedAt ? 'Last synced ' + new Date(s.lastSyncedAt).toLocaleString() + '.' : 'Syncing now…')
        ])
      ]));
    } else if (configured) {
      box.appendChild(el('div', { class: 'notice is-error' }, [
        el('strong', { text: 'Signed out — changes are staying on this device' }),
        el('div', { style: { marginTop: '4px' } }, ['Sign in below to start syncing again.'])
      ]));
    } else {
      box.appendChild(el('div', { class: 'callout' }, [
        el('strong', { text: 'Sync is not set up yet.' }),
        ' Right now your library lives only in this browser — clearing your browsing data would erase it, and your phone and laptop keep separate copies. ',
        'Follow ', el('strong', { text: 'SUPABASE-SETUP.md' }), ' in your repo (about 15 minutes, free) and paste the two values below.'
      ]));
    }

    /* --- account first when we already have a connection: a new phone should
           see nothing but email + password --- */
    if (configured) { renderAccount(box); }

    /* --- project connection --- */
    var urlInput = el('input', { type: 'url', class: 'input input-sm', value: cfg.url, placeholder: 'https://xxxxxxxx.supabase.co' });
    var keyInput = el('input', { type: 'password', class: 'input input-sm', value: cfg.anonKey, placeholder: 'eyJhbGci…', autocomplete: 'off' });

    var connBox = el('div', { class: 'settings-grid' }, [
      field('Project URL', urlInput, 'Supabase → Connect button, or read it off the dashboard address bar: https://<project-id>.supabase.co'),
      field('Publishable key', keyInput, 'The key labelled "publishable" (sb_publishable_…) or the legacy "anon" one (eyJ…). Either works. Never the secret / service_role key.')
    ]);

    var saveBtn = el('div', { class: 'row-actions' }, [
      el('button', {
        class: 'btn', type: 'button', text: 'Save connection',
        onclick: function () {
          if (!urlInput.value.trim() || !keyInput.value.trim()) { toast('Both the URL and the key are needed.', 'error'); return; }
          CJ.cloud.saveConfig(urlInput.value, keyInput.value);
          toast('Connection saved. Now sign in or create your account.');
          renderPanel();
        }
      })
    ]);

    if (configured) {
      // Already connected — tuck the plumbing away behind a disclosure.
      var det = el('details', { class: 'disclosure' }, [
        el('summary', { text: 'Database connection' }),
        el('p', { class: 'muted-xs', text: 'Already set. You only need this if you switch to a different Supabase project.' }),
        connBox, saveBtn
      ]);
      box.appendChild(det);
    } else {
      box.appendChild(el('h4', { class: 'sub-title', text: 'Your Supabase project' }));
      box.appendChild(connBox);
      box.appendChild(saveBtn);
    }
    return;
  }

  /* ---------- account section ---------- */

  function renderAccount(box) {
    var signedIn = CJ.cloud.isSignedIn();
    box.appendChild(el('h4', { class: 'sub-title', text: signedIn ? 'Your account' : 'Sign in' }));

    if (signedIn) {
      box.appendChild(el('div', { class: 'row-actions' }, [
        el('button', {
          class: 'btn', type: 'button', text: '↻ Sync now',
          onclick: function (e) {
            var b = e.currentTarget; b.disabled = true; b.textContent = '↻ Syncing…';
            CJ.sync.pull({ onApplied: function () { CJ.app.renderAll(); } }).then(function () {
              CJ.sync.pushNow();
              toast('Synced.');
            }).then(function () { b.disabled = false; b.textContent = '↻ Sync now'; });
          }
        }),
        el('button', {
          class: 'btn', type: 'button', text: '📱 Set up another device',
          title: 'Creates a link that carries the connection over, so the other device only has to sign in',
          onclick: function () { showDeviceLink(box); }
        }),
        el('button', {
          class: 'btn btn-danger-ghost', type: 'button', text: 'Sign out',
          onclick: function () {
            if (CJ.sync.hasPending() && !window.confirm('There are changes that have not uploaded yet. Sign out anyway?')) return;
            CJ.cloud.signOut().then(function () { toast('Signed out. This device keeps its own copy.'); renderPanel(); });
          }
        })
      ]));
      return;
    }

    var emailInput = el('input', { type: 'email', class: 'input input-sm', placeholder: 'you@example.com', autocomplete: 'username' });
    var passInput = el('input', { type: 'password', class: 'input input-sm', placeholder: 'At least 8 characters', autocomplete: 'current-password' });

    box.appendChild(el('div', { class: 'settings-grid' }, [
      field('Email', emailInput),
      field('Password', passInput)
    ]));

    var result = el('span', { class: 'muted-xs' });

    box.appendChild(el('div', { class: 'row-actions' }, [
      el('button', {
        class: 'btn btn-primary', type: 'button', text: 'Sign in',
        onclick: function (e) {
          var b = e.currentTarget;
          if (!emailInput.value.trim() || !passInput.value) { toast('Email and password, please.', 'error'); return; }
          b.disabled = true; result.textContent = 'Signing in…';
          CJ.cloud.signIn(emailInput.value.trim(), passInput.value)
            .then(function () {
              result.textContent = '';
              toast('Signed in — pulling your library.');
              renderPanel();
              return CJ.sync.adoptAfterSignIn();
            })
            .catch(function (err) { result.textContent = '❌ ' + err.message; })
            .then(function () { b.disabled = false; });
        }
      }),
      el('button', {
        class: 'btn', type: 'button', text: 'Create account',
        onclick: function (e) {
          var b = e.currentTarget;
          if (!emailInput.value.trim() || passInput.value.length < 8) { toast('Email, and a password of at least 8 characters.', 'error'); return; }
          b.disabled = true; result.textContent = 'Creating…';
          CJ.cloud.signUp(emailInput.value.trim(), passInput.value)
            .then(function (out) {
              if (out.confirmed) {
                result.textContent = '';
                toast('Account created and signed in.');
                renderPanel();
                return CJ.sync.adoptAfterSignIn();
              }
              result.textContent = '✉️ Check your email and click the confirmation link, then come back and hit Sign in.';
            })
            .catch(function (err) { result.textContent = '❌ ' + err.message; })
            .then(function () { b.disabled = false; });
        }
      }),
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: 'Forgot password',
        onclick: function () {
          if (!emailInput.value.trim()) { toast('Enter your email first.', 'error'); return; }
          CJ.cloud.resetPassword(emailInput.value.trim())
            .then(function () { result.textContent = '✉️ Reset link sent.'; })
            .catch(function (err) { result.textContent = '❌ ' + err.message; });
        }
      }),
      result
    ]));

    box.appendChild(el('p', { class: 'muted-xs' }, [
      'First time anywhere? Use ', el('strong', { text: 'Create account' }), '. On a second device, use ',
      el('strong', { text: 'Sign in' }), ' with the same email and password — anything already on that device gets merged in, nothing is thrown away.'
    ]));
  }

  /* ---------- handing the connection to another device ---------- */

  function showDeviceLink(box) {
    var link = CJ.cloud.setupLink();
    if (!link) { toast('Connect to your project first.', 'error'); return; }

    var existing = $('#device-link-box');
    if (existing) existing.remove();

    var input = el('input', { class: 'input input-sm', value: link, readonly: true, id: 'device-link-input' });

    var wrap = el('div', { class: 'callout', id: 'device-link-box' }, [
      el('strong', { text: 'Open this link on your other device' }),
      el('p', { class: 'muted-xs', style: { color: 'inherit', margin: '6px 0' } }, [
        'Text or email it to yourself, then open it on your phone. It carries the database connection across, ' +
        'so all the phone asks for is your email and password. Keep it to yourself — it is not a password, ' +
        'but there is no reason to post it publicly.'
      ]),
      input,
      el('div', { class: 'row-actions' }, [
        el('button', {
          class: 'btn btn-primary btn-sm', type: 'button', text: '📋 Copy link',
          onclick: function (e) {
            var b = e.currentTarget;
            input.select();
            var done = function () { b.textContent = 'Copied ✓'; setTimeout(function () { b.textContent = '📋 Copy link'; }, 1600); };
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(link).then(done, function () {
                try { document.execCommand('copy'); done(); } catch (err) { toast('Select the link and copy it manually.', 'error'); }
              });
            } else {
              try { document.execCommand('copy'); done(); } catch (err) { toast('Select the link and copy it manually.', 'error'); }
            }
          }
        }),
        navigator.share ? el('button', {
          class: 'btn btn-sm', type: 'button', text: 'Share…',
          onclick: function () { navigator.share({ title: 'Content Journal setup', url: link }).catch(function () {}); }
        }) : null,
        el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', text: 'Hide',
          onclick: function () { wrap.remove(); }
        })
      ])
    ]);

    box.appendChild(wrap);
    input.focus();
    input.select();
  }

  function init() {
    CJ.cloud.onChange(renderChip);
    renderChip();

    var chip = $('#sync-chip');
    if (chip) chip.addEventListener('click', function () { CJ.app.showView('settings'); });
  }

  CJ.syncUI = { init: init, render: renderPanel, renderChip: renderChip };

})(window.CJ);
