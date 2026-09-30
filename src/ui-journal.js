/* =========================================================================
   ui-journal.js — one place's journal: everything that ever happened to it.

   A place accumulates clips (layers) and posts (drops) over months. The
   library shows its current state; this shows its story, in order: what's
   coming up, then every shoot and every post, newest first.

   Entirely derived — nothing here is stored. Reads items, layers, drops and
   platformUse, so it stays right after any edit, sync or refresh.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var $ = CJ.ui.$, el = CJ.ui.el;
  var openId = null;

  function fmtLabel(f) {
    var m = CJ.generator.FORMATS[f];
    return m ? m.label : (f || 'Post');
  }

  function dateLabel(iso) {
    return CJ.formatDate(iso, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /** Every entry on this place's timeline, split into upcoming and history. */
  function entriesFor(item) {
    var today = CJ.todayISO();
    var upcoming = [], history = [];
    var postedKeys = {};

    (item.layers || []).forEach(function (l) {
      var d = (l.capturedAt || l.createdAt || '').slice(0, 10);
      if (!d) return;
      history.push({
        kind: 'shoot', date: d, layer: l,
        title: 'Shot: ' + (l.label || 'footage'),
        body: l.notes || '',
        tags: l.tags || []
      });
    });

    CJ.getDrops().forEach(function (e) {
      var d = e.drop;
      if ((d.itemIds || []).indexOf(item.id) === -1) return;
      if (d.status === 'dismissed') return;
      var layer = CJ.getLayer(item, (d.layerByItem || {})[item.id]);
      var entry = {
        kind: d.status === 'done' ? 'posted' : (d.date >= today ? 'upcoming' : 'slipped'),
        date: d.date, drop: d, idea: e.idea, layer: layer,
        title: e.idea.title,
        platform: d.platform
      };
      if (entry.kind === 'posted') { postedKeys[d.platform + '|' + d.date] = true; history.push(entry); }
      else if (entry.kind === 'upcoming') upcoming.push(entry);
      else history.push(entry);
    });

    // Posting history that predates the calendar lives only in platformUse.
    // Show it so a place's story doesn't start the day the app was installed.
    CJ.PLATFORM_IDS.forEach(function (p) {
      var pu = (item.platformUse || {})[p];
      if (!pu || !pu.lastPosted) return;
      var d = pu.lastPosted.slice(0, 10);
      if (postedKeys[p + '|' + d]) return;
      history.push({
        kind: 'posted', date: d, platform: p, legacy: true,
        title: 'Last posted on ' + CJ.ui.platformInfo(p).label +
               (pu.count > 1 ? ' (' + pu.count + '× in total)' : '')
      });
    });

    upcoming.sort(function (a, b) { return a.date.localeCompare(b.date); });
    history.sort(function (a, b) { return b.date.localeCompare(a.date); });
    return { upcoming: upcoming, history: history };
  }

  function entryEl(entry, item) {
    var icon = entry.kind === 'shoot' ? '🎬'
      : entry.kind === 'posted' ? '✅'
      : entry.kind === 'slipped' ? '⏳'
      : entry.drop && entry.drop.status === 'planned' ? '📌' : '💡';

    var meta = [];
    if (entry.platform) {
      var pinfo = CJ.ui.platformInfo(entry.platform);
      meta.push(el('span', { class: 'pill pill-' + entry.platform, text: pinfo.emoji + ' ' + pinfo.label }));
    }
    if (entry.drop) meta.push(el('span', { class: 'pill pill-quiet', text: fmtLabel(entry.drop.format) }));
    if (entry.kind === 'upcoming') {
      meta.push(el('span', {
        class: 'pill ' + (entry.drop.status === 'planned' ? 'pill-good' : 'pill-quiet'),
        text: entry.drop.status === 'planned' ? 'planned' : 'suggested'
      }));
    }
    if (entry.kind === 'slipped') meta.push(el('span', { class: 'pill pill-warn', text: 'date passed, not posted' }));
    if (entry.kind === 'shoot') {
      meta.push(el('span', {
        class: 'pill ' + (entry.layer.postCount ? 'pill-quiet' : 'pill-good'),
        text: entry.layer.postCount ? 'used ' + entry.layer.postCount + '×' : '✨ unused'
      }));
    }
    if (entry.layer && entry.kind !== 'shoot' && (item.layers || []).length > 1) {
      meta.push(el('span', { class: 'pill pill-quiet', text: 'clip: ' + entry.layer.label }));
    }

    var titleNode = entry.idea
      ? el('button', {
          class: 'jr-title jr-link', type: 'button', text: entry.title,
          onclick: function () { close(); CJ.app.showView('calendar'); CJ.calendarUI.openIdea(entry.idea.id); }
        })
      : entry.layer
        ? el('button', {
            class: 'jr-title jr-link', type: 'button', text: entry.title,
            onclick: function () { close(); CJ.layersUI.open(item.id, entry.layer.id); }
          })
        : el('div', { class: 'jr-title', text: entry.title });

    return el('li', { class: 'jr-entry jr-' + entry.kind }, [
      el('span', { class: 'jr-icon', text: icon, 'aria-hidden': 'true' }),
      el('div', { class: 'jr-main' }, [
        el('div', { class: 'jr-date', text: dateLabel(entry.date) }),
        titleNode,
        meta.length ? el('div', { class: 'tag-row' }, meta) : null,
        entry.body ? el('p', { class: 'jr-body', text: entry.body }) : null,
        entry.tags && entry.tags.length
          ? el('div', { class: 'tag-row' }, entry.tags.map(function (t) { return CJ.ui.tagEl(t); }))
          : null
      ])
    ]);
  }

  /** Per-platform standing: off, free now, or free on a date. */
  function laneStatus(item) {
    return el('div', { class: 'jr-lanes' }, CJ.PLATFORMS.map(function (p) {
      var allowed = CJ.itemAllowsPlatform(item, p.id);
      var free = allowed ? CJ.library.nextFreeOn(item, p.id) : null;
      var text = !allowed ? 'not on this lane'
        : free ? 'free ' + CJ.formatDate(free, { month: 'short', day: 'numeric' })
        : 'free now';
      return el('div', { class: 'jr-lane' + (allowed ? '' : ' is-off') + (free ? ' is-waiting' : '') }, [
        el('span', { class: 'jr-lane-name', text: p.emoji + ' ' + p.label }),
        el('span', { class: 'jr-lane-state', text: text }),
        el('span', { class: 'jr-lane-count', text: CJ.postCountOn(item, p.id) + ' post' + (CJ.postCountOn(item, p.id) === 1 ? '' : 's') })
      ]);
    }));
  }

  function render() {
    var item = openId && CJ.getItem(openId);
    var body = $('#journal-body');
    if (!item) { close(); return; }
    body.innerHTML = '';

    var t = CJ.ui.typeInfo(item.type);
    $('#journal-title').textContent = item.name;

    var unused = CJ.unusedLayers(item).length;
    var sub = [t.emoji + ' ' + t.label];
    if (item.neighborhood) sub.push('📍 ' + item.neighborhood);
    sub.push((item.layers || []).length + ' clip' + ((item.layers || []).length === 1 ? '' : 's'));
    if (unused) sub.push(unused + ' never posted');

    body.appendChild(el('p', { class: 'muted-xs', text: sub.join(' · ') }));
    if (item.notes) body.appendChild(el('p', { class: 'jr-notes', text: item.notes }));
    if ((item.tags || []).length) {
      body.appendChild(el('div', { class: 'tag-row' }, item.tags.map(function (tg) { return CJ.ui.tagEl(tg); })));
    }
    body.appendChild(laneStatus(item));

    var web = CJ.websiteUI && CJ.websiteUI.journalSection(item);
    if (web) body.appendChild(web);

    var e = entriesFor(item);

    body.appendChild(el('h4', { class: 'jr-section', text: 'Coming up' }));
    body.appendChild(e.upcoming.length
      ? el('ol', { class: 'jr-list' }, e.upcoming.map(function (x) { return entryEl(x, item); }))
      : el('p', { class: 'muted-xs', text: 'Nothing scheduled with this place yet. A refresh or a plan will pick it up once the spacing rule allows.' }));

    body.appendChild(el('h4', { class: 'jr-section', text: 'History' }));
    body.appendChild(e.history.length
      ? el('ol', { class: 'jr-list' }, e.history.map(function (x) { return entryEl(x, item); }))
      : el('p', { class: 'muted-xs', text: 'No shoots or posts recorded yet.' }));

    body.appendChild(el('div', { class: 'modal-foot' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', text: 'Edit place', onclick: function () { close(); CJ.library.openForm(item.id); } }),
      el('span', { class: 'push' }),
      el('button', { class: 'btn btn-primary', type: 'button', text: '＋ Add footage', onclick: function () { close(); CJ.layersUI.open(item.id); } })
    ]));
  }

  function open(itemId) {
    openId = itemId;
    render();
    $('#journal-modal').hidden = false;
  }

  function close() {
    openId = null;
    $('#journal-modal').hidden = true;
  }

  function init() {
    $('#journal-close').addEventListener('click', close);
    $('#journal-modal').addEventListener('mousedown', function (e) { if (e.target === $('#journal-modal')) close(); });
    // Keep an open journal honest if data changes underneath it (sync, posting).
    CJ.subscribe(function () { if (openId && !$('#journal-modal').hidden) render(); });
  }

  CJ.journalUI = {
    init: init, open: open, close: close, entriesFor: entriesFor,
    refresh: function () { if (openId && !$('#journal-modal').hidden) render(); }
  };

})(window.CJ);
