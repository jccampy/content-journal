/* =========================================================================
   ui-settings.js — backup, platform routing, generator prefs, AI key.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var $ = CJ.ui.$, el = CJ.ui.el, toast = CJ.ui.toast;

  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /* ---------- backup ---------- */

  function download(filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /* Some places a web page runs — a hosted preview, an in-app browser — block
     file downloads outright. So the backup is always shown as text you can copy
     as well as offered as a file. Copy/paste works everywhere. */

  function openTextModal(title, note, value, actions) {
    $('#text-modal-title').textContent = title;
    $('#text-modal-note').textContent = note;
    var area = $('#text-modal-area');
    area.value = value;
    area.readOnly = !!actions.readOnly;
    var foot = $('#text-modal-actions');
    foot.innerHTML = '';
    (actions.buttons || []).forEach(function (b) {
      foot.appendChild(el('button', { class: b.class || 'btn', type: 'button', text: b.label, onclick: b.onclick }));
    });
    foot.appendChild(el('span', { class: 'push' }));
    foot.appendChild(el('button', {
      class: 'btn btn-ghost', type: 'button', text: 'Close',
      onclick: function () { $('#text-modal').hidden = true; }
    }));
    $('#text-modal').hidden = false;
    if (!actions.readOnly) setTimeout(function () { area.focus(); }, 40);
  }

  function exportBackup() {
    var json = CJ.exportJSON();
    var stamp = CJ.todayISO();
    openTextModal(
      'Your backup',
      'This is your whole journal. Download it as a file, or copy it and paste it somewhere safe — ' +
      'a note, an email to yourself, a file in iCloud. Either version can be imported back later.',
      json,
      {
        readOnly: true,
        buttons: [
          {
            label: '📋 Copy to clipboard', class: 'btn btn-primary',
            onclick: function (e) {
              var b = e.currentTarget;
              var area = $('#text-modal-area');
              area.select();
              var done = function () { b.textContent = 'Copied ✓'; setTimeout(function () { b.textContent = '📋 Copy to clipboard'; }, 1600); };
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(area.value).then(done, function () {
                  try { document.execCommand('copy'); done(); } catch (err) { toast('Select the text and copy it manually.', 'error'); }
                });
              } else {
                try { document.execCommand('copy'); done(); } catch (err) { toast('Select the text and copy it manually.', 'error'); }
              }
            }
          },
          {
            label: '⬇ Download as file',
            onclick: function () {
              download('content-journal-backup-' + stamp + '.json', json);
              toast('If nothing downloaded, use Copy instead — some browsers block it.');
            }
          }
        ]
      }
    );
  }

  function applyImport(text) {
    var mode = 'replace';
    if (CJ.getItems().length) {
      mode = window.confirm(
        'You already have ' + CJ.getItems().length + ' items.\n\n' +
        'OK = MERGE the backup into what\'s here (safest)\n' +
        'Cancel = REPLACE everything with the backup'
      ) ? 'merge' : 'replace';
    }
    try {
      var n = CJ.importJSON(text, mode);
      $('#text-modal').hidden = true;
      toast('Imported — ' + n + ' items in your library now.');
      CJ.app.renderAll();
      CJ.calendarUI.markStale();
    } catch (err) {
      console.error(err);
      toast('That doesn\'t look like a backup: ' + err.message, 'error');
    }
  }

  function importFromText() {
    openTextModal(
      'Paste a backup',
      'Paste the backup text you copied from another device, then hit Import.',
      '',
      {
        readOnly: false,
        buttons: [{
          label: 'Import', class: 'btn btn-primary',
          onclick: function () {
            var v = $('#text-modal-area').value.trim();
            if (!v) { toast('Paste the backup text first.', 'error'); return; }
            applyImport(v);
          }
        }]
      }
    );
  }

  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () { applyImport(String(reader.result)); };
    reader.onerror = function () { toast('Could not read that file.', 'error'); };
    reader.readAsText(file);
  }

  /* ---------- sample data ---------- */

  /* Sample library. `ago` = days since it was last posted, so the sample always
     shows a realistic mix of never-used, ready-to-reuse, and recently-used. */
  var SAMPLE = [
    { name: 'Ladybird Grove & Mess Hall', type: 'restaurant', neighborhood: 'Old Fourth Ward',
      tags: ['patio', 'good patio', 'dog friendly', 'beltline', 'casual', 'group'],
      notes: 'Huge patio right on the Beltline. Fire pits in winter. Big groups work here.',
      extraLayer: 'Fire pit night, winter',
      extraNotes: 'Shot the fire pits after dark — saves for a cold-weather post.',
      ago: 240, postCount: 2, platforms: ['instagram', 'pinterest'] },
    { name: 'Kimball House', type: 'restaurant', neighborhood: 'Decatur',
      tags: ['date night', 'oysters', 'cocktails', 'upscale', 'romantic'],
      notes: 'Old train depot. Oyster happy hour is the move.',
      extraLayer: 'Oyster happy hour close-ups',
      extraNotes: 'Tight shots of the oysters and the bar. Never posted.' },
    { name: 'Fox Bros Bar-B-Q', type: 'restaurant', neighborhood: 'Candler Park',
      tags: ['bbq', 'casual', 'comfort', 'group', 'classic'],
      ago: 40, postCount: 3, platforms: ['instagram', 'pinterest'] },
    { name: 'Miller Union', type: 'restaurant', neighborhood: 'West Midtown',
      tags: ['upscale', 'date night', 'seasonal', 'farm to table', 'splurge'] },
    { name: 'Talat Market', type: 'restaurant', neighborhood: 'Summerhill',
      tags: ['thai', 'date night', 'reservations', 'trendy'], ago: 310, postCount: 1 },
    { name: 'Little Bear', type: 'restaurant', neighborhood: 'Summerhill',
      tags: ['tasting menu', 'date night', 'splurge', 'trendy'] },
    { name: 'Antico Pizza', type: 'restaurant', neighborhood: 'West Midtown',
      tags: ['pizza', 'casual', 'group', 'classic', 'byob'],
      ago: 165, postCount: 2, platforms: ['instagram', 'tiktok'] },
    { name: 'Bar Vegan', type: 'restaurant', neighborhood: 'Old Fourth Ward',
      tags: ['vegan', 'ponce city market', 'girls night', 'cocktails', 'lively'] },
    { name: 'Chattahoochee Food Works', type: 'restaurant', neighborhood: 'West Midtown',
      tags: ['food hall', 'group', 'casual', 'indoor', 'variety'] },
    { name: 'Brash Coffee', type: 'restaurant', neighborhood: 'West Midtown',
      tags: ['coffee', 'morning', 'aesthetic', 'quick'], ago: 21, postCount: 1 },
    { name: 'Bellwoods Social House', type: 'restaurant', neighborhood: 'Poncey-Highland',
      tags: ['patio', 'rooftop', 'brunch', 'group', 'lively'] },

    { name: 'Skyline Park at Ponce City Market', type: 'experience', neighborhood: 'Old Fourth Ward',
      tags: ['rooftop', 'view', 'date night', 'skyline', 'fun'], ago: 400, postCount: 1,
      extraLayer: 'Sunset from the roof', extraNotes: 'Golden hour skyline. Unused.' },
    { name: 'Beltline Eastside Trail walk', type: 'experience', neighborhood: 'Old Fourth Ward',
      tags: ['free', 'walk', 'outdoor', 'beltline', 'dog friendly'],
      ago: 130, postCount: 4, platforms: ['tiktok', 'pinterest'] },
    { name: 'Atlanta Botanical Garden', type: 'experience', neighborhood: 'Midtown',
      tags: ['outdoor', 'photo spot', 'date night', 'holiday lights', 'seasonal'],
      ago: 255, postCount: 2, platforms: ['tiktok', 'pinterest'] },
    { name: 'Krog Street Market', type: 'experience', neighborhood: 'Inman Park',
      tags: ['food hall', 'indoor', 'walk', 'group', 'shop'] },
    { name: 'High Museum of Art', type: 'experience', neighborhood: 'Midtown',
      tags: ['indoor', 'museum', 'rainy day', 'date night', 'art'] },
    { name: 'Piedmont Park picnic', type: 'experience', neighborhood: 'Midtown',
      tags: ['free', 'outdoor', 'park', 'picnic', 'skyline', 'dog friendly'], ago: 190, postCount: 1 },
    { name: 'Mercier Orchards day trip', type: 'experience', neighborhood: 'Blue Ridge',
      tags: ['day trip', 'north georgia', 'orchard', 'fall', 'drive'] },

    { name: 'Sunday reset routine', type: 'home', neighborhood: '',
      tags: ['routine', 'cozy', 'reset', 'morning'], ago: 75, postCount: 3 },
    { name: 'Fall mantel styling', type: 'home', neighborhood: '',
      tags: ['decor', 'fall', 'cozy', 'seasonal', 'hosting'], ago: 330, postCount: 1 },
    { name: 'Peach galette recipe', type: 'home', neighborhood: '',
      tags: ['recipe', 'baking', 'peach', 'dessert', 'summer'] },
    { name: 'Friendsgiving tablescape', type: 'home', neighborhood: '',
      tags: ['hosting', 'tablescape', 'holiday', 'entertaining', 'decor'] },
    { name: 'Balcony patio refresh', type: 'home', neighborhood: '',
      tags: ['decor', 'patio', 'outdoor', 'spring', 'plants'], ago: 150, postCount: 1 }
  ];

  function seed() {
    if (CJ.getItems().length && !window.confirm('This adds ' + SAMPLE.length + ' sample Atlanta places on top of what you already have. Continue?')) return;
    var base = new Date();
    SAMPLE.forEach(function (s, i) {
      var created = new Date(base.getTime() - (SAMPLE.length - i) * 3 * 86400000);
      var row = Object.assign({}, s, { createdAt: created.toISOString() });
      var lastPosted = null;
      if (row.ago != null) {
        lastPosted = CJ.isoDate(new Date(base.getTime() - row.ago * 86400000));
        row.lastPosted = lastPosted;
      }
      delete row.ago;
      // Demo the readiness flags: restaurants and at-home pieces carry a post
      // of their own, every third place is photos only.
      if (row.solo == null) row.solo = row.type !== 'experience';
      if (row.photosOnly == null) row.photosOnly = i % 3 === 2;
      var saved = CJ.upsertItem(row);

      // Give a few places a second, unused clip so the layer behaviour is
      // visible straight away.
      if (saved && s.extraLayer) {
        CJ.addLayer(saved.id, {
          label: s.extraLayer,
          capturedAt: CJ.isoDate(new Date(base.getTime() - 9 * 86400000)),
          notes: s.extraNotes || '',
          postCount: 0
        });
      }
    });
    // Two realistic deadlines so the deadline behaviour is visible immediately.
    var soon = new Date(); soon.setDate(soon.getDate() + 12);
    var later = new Date(); later.setDate(later.getDate() + 34);
    var items = CJ.getItems();
    var bell = items.filter(function (i) { return i.name === 'Bellwoods Social House'; })[0];
    var brash = items.filter(function (i) { return i.name === 'Brash Coffee'; })[0];
    if (bell) CJ.upsertItem({ id: bell.id, deadline: CJ.isoDate(soon), deadlineNote: 'Paid partnership — deliverable due', priority: 'high' });
    if (brash) CJ.upsertItem({ id: brash.id, deadline: CJ.isoDate(later), deadlineNote: 'Seasonal drink comes off the menu', priority: 'normal' });

    toast('Sample library loaded. Head to the Calendar and hit Refresh.');
    CJ.library.filters.sort = 'stale';
    CJ.app.renderAll();
    CJ.calendarUI.refresh(true);
    CJ.app.showView('library');
  }

  function wipe() {
    if (!window.confirm('This erases your entire journal from this browser. Export a backup first if you might want it back.\n\nErase everything?')) return;
    if (!window.confirm('Really sure? There is no undo.')) return;
    CJ.wipe();
    CJ.app.renderAll();
    toast('Journal erased.');
  }

  /* ---------- render ---------- */

  function renderMatrix() {
    var box = $('#platform-matrix');
    box.innerHTML = '';
    var rules = CJ.settings().platformRules;

    var table = el('table', { class: 'matrix' });
    var head = el('tr', {}, [el('th', { text: 'Content type' })].concat(
      CJ.PLATFORMS.map(function (p) { return el('th', { text: p.emoji + ' ' + p.label }); })
    ));
    table.appendChild(el('thead', {}, [head]));

    var tbody = el('tbody');
    CJ.TYPES.forEach(function (t) {
      var row = el('tr', {}, [el('td', { text: t.emoji + ' ' + t.plural })].concat(
        CJ.PLATFORMS.map(function (p) {
          var cb = el('input', {
            type: 'checkbox',
            checked: !!(rules[t.id] && rules[t.id][p.id]),
            onchange: function () {
              var r = CJ.settings().platformRules;
              r[t.id] = r[t.id] || {};
              r[t.id][p.id] = this.checked;
              CJ.updateSettings({ platformRules: r });
              CJ.calendarUI.markStale();
            }
          });
          return el('td', {}, [cb]);
        })
      ));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    box.appendChild(el('div', { class: 'matrix-wrap' }, [table]));
  }

  function renderGaps() {
    var box = $('#gap-grid');
    box.innerHTML = '';
    var gaps = CJ.settings().minGapDays || {};
    CJ.TYPES.forEach(function (t) {
      var input = el('input', {
        type: 'number', class: 'input input-sm', min: 0, max: 365, step: 1,
        value: gaps[t.id] == null ? 30 : gaps[t.id],
        onchange: function () {
          var v = Math.max(0, Math.min(365, Number(this.value) || 0));
          this.value = v;
          var g = Object.assign({}, CJ.settings().minGapDays);
          g[t.id] = v;
          CJ.updateSettings({ minGapDays: g });
          CJ.calendarUI.markStale();
        }
      });
      box.appendChild(el('label', {}, [
        t.emoji + ' Days between posts about the same ' + t.label.toLowerCase(),
        input
      ]));
    });
  }

  function renderRollout() {
    var box = $('#rollout-grid');
    if (!box) return;
    box.innerHTML = '';
    var r = CJ.settings().rollout || {};
    var leadBy = r.leadBy || {};

    var table = el('table', { class: 'matrix' });
    table.appendChild(el('thead', {}, [
      el('tr', {}, [el('th', { text: 'Content type' }), el('th', { text: 'Leads on' })])
    ]));
    var tbody = el('tbody');
    CJ.TYPES.forEach(function (t) {
      var sel = el('select', { class: 'input input-sm' }, CJ.PLATFORMS
        .filter(function (p) { return p.id !== 'pinterest'; })
        .map(function (p) {
          var o = el('option', { value: p.id, text: p.emoji + ' ' + p.label });
          if ((leadBy[t.id] || 'instagram') === p.id) o.selected = true;
          return o;
        }));
      sel.addEventListener('change', function () {
        var next = Object.assign({}, CJ.settings().rollout);
        next.leadBy = Object.assign({}, next.leadBy);
        next.leadBy[t.id] = this.value;
        CJ.updateSettings({ rollout: next });
        CJ.calendarUI.markStale();
      });
      tbody.appendChild(el('tr', {}, [
        el('td', { text: t.emoji + ' ' + t.plural }),
        el('td', { style: { textAlign: 'left', width: 'auto' } }, [sel])
      ]));
    });
    table.appendChild(tbody);
    box.appendChild(el('div', { class: 'matrix-wrap' }, [table]));

    $('#pref-gap').value = r.gapDays != null ? r.gapDays : 2;
    $('#pref-carousel').value = CJ.settings().carouselMinItems || 5;
  }

  function renderPrefs() {
    var s = CJ.settings();
    $('#pref-per-month').value = s.ideasPerMonth;
    // With a weekly cadence set, "ideas per month" doesn't drive anything, so
    // show the cadence instead of a setting that would silently do nothing.
    var cad = CJ.cadenceOn();
    $('#pref-per-month-wrap').hidden = cad;
    $('#pref-cadence').hidden = !cad;
    if (cad) {
      $('#pref-cadence-text').textContent = 'Posting cadence: ' + CJ.PLATFORM_IDS.map(function (p) {
        var n = (s.postsPerWeek || {})[p] || 0;
        return CJ.ui.platformInfo(p).label + ' ' + (n ? n + '/week' : 'paused');
      }).join(' · ');
    }
    $('#pref-cooldown').value = s.repostCooldownDays;
    $('#pref-weather').checked = !!s.showWeather;

    var box = $('#pref-days');
    box.innerHTML = '';
    DAYS.forEach(function (label, i) {
      var on = (s.preferredDays || []).indexOf(i) !== -1;
      box.appendChild(el('button', {
        class: 'chip' + (on ? ' is-on' : ''), type: 'button', text: label,
        onclick: function () {
          var d = (CJ.settings().preferredDays || []).slice();
          var ix = d.indexOf(i);
          if (ix === -1) d.push(i); else d.splice(ix, 1);
          if (!d.length) { toast('Keep at least one posting day.', 'error'); return; }
          d.sort();
          CJ.updateSettings({ preferredDays: d });
          renderPrefs();
          CJ.calendarUI.markStale();
        }
      }));
    });
  }

  function renderAI() {
    var ai = CJ.settings().ai || {};
    $('#ai-key').value = ai.key || '';
    $('#ai-model').value = ai.model || CJ.ai.DEFAULT_MODEL;
    $('#ai-voice').value = ai.voice || '';
  }

  function renderStorage() {
    var bytes = CJ.storageBytes();
    var kb = (bytes / 1024).toFixed(1);
    $('#storage-stat').textContent =
      CJ.getItems().length + ' items · ' + CJ.getIdeas().length + ' calendar ideas · ' +
      kb + ' KB used in this browser' +
      (CJ.state.lastGeneratedAt ? ' · last refresh ' + new Date(CJ.state.lastGeneratedAt).toLocaleString() : '');
  }

  function render() {
    if (!CJ.state) return;
    renderMatrix();
    renderRollout();
    renderGaps();
    renderPrefs();
    renderAI();
    renderStorage();
  }

  /* ---------- wiring ---------- */

  function init() {
    $('#btn-export').addEventListener('click', exportBackup);
    $('#btn-import-text').addEventListener('click', importFromText);
    $('#text-modal-close').addEventListener('click', function () { $('#text-modal').hidden = true; });
    $('#text-modal').addEventListener('mousedown', function (e) {
      if (e.target === $('#text-modal')) $('#text-modal').hidden = true;
    });
    $('#btn-seed').addEventListener('click', seed);
    $('#btn-wipe').addEventListener('click', wipe);
    $('#import-file').addEventListener('change', function () {
      if (this.files && this.files[0]) importBackup(this.files[0]);
      this.value = '';
    });

    $('#pref-gap').addEventListener('change', function () {
      var v = Math.max(0, Math.min(30, Number(this.value) || 0));
      this.value = v;
      var next = Object.assign({}, CJ.settings().rollout, { gapDays: v });
      CJ.updateSettings({ rollout: next });
      CJ.calendarUI.markStale();
    });
    $('#pref-carousel').addEventListener('change', function () {
      var v = Math.max(2, Math.min(12, Number(this.value) || 5));
      this.value = v;
      CJ.updateSettings({ carouselMinItems: v });
      CJ.calendarUI.markStale();
    });
    $('#pref-cadence-edit').addEventListener('click', function () { CJ.planUI.open(); });
    $('#pref-per-month').addEventListener('change', function () {
      var v = Math.max(2, Math.min(20, Number(this.value) || 8));
      this.value = v;
      CJ.updateSettings({ ideasPerMonth: v });
      CJ.calendarUI.markStale();
    });
    $('#pref-cooldown').addEventListener('change', function () {
      var v = Math.max(0, Math.min(365, Number(this.value) || 0));
      this.value = v;
      CJ.updateSettings({ repostCooldownDays: v });
      CJ.calendarUI.markStale();
    });
    $('#pref-weather').addEventListener('change', function () {
      CJ.updateSettings({ showWeather: this.checked });
      if (this.checked) CJ.calendarUI.reloadWeather();
      else $('#weather-strip').hidden = true;
    });

    $('#ai-key').addEventListener('change', function () {
      CJ.updateAISettings({ key: this.value.trim() });
      $('#ai-test-result').textContent = '';
      toast(this.value.trim() ? 'Key saved to this browser only.' : 'Key removed.');
    });
    $('#ai-model').addEventListener('change', function () { CJ.updateAISettings({ model: this.value }); });
    $('#ai-voice').addEventListener('change', function () { CJ.updateAISettings({ voice: this.value.trim() }); });

    $('#btn-ai-test').addEventListener('click', function () {
      var out = $('#ai-test-result');
      var key = $('#ai-key').value.trim();
      if (!key) { out.textContent = 'Paste a key first.'; return; }
      CJ.updateAISettings({ key: key });
      out.textContent = 'Testing…';
      CJ.ai.test().then(function (r) {
        out.textContent = '✅ Connected (' + r + ')';
      }).catch(function (err) {
        out.textContent = '❌ ' + err.message;
      });
    });
  }

  CJ.settingsUI = { init: init, render: render, seed: seed, exportBackup: exportBackup };

})(window.CJ);
