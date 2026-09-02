/* =========================================================================
   ui-monthly.js — the monthly planning board.

   Sits above the calendar. The calendar answers "what am I posting on the
   14th"; this answers "what is September even for". Each topic says why it
   works now, which of your lanes it belongs to, and — the part that matters —
   whether your library can actually make it today or what you'd have to shoot.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var $ = CJ.ui.$, $$ = CJ.ui.$$, el = CJ.ui.el, toast = CJ.ui.toast;

  var offset = 0;             // months from now
  var laneFilter = '';        // '', 'city', 'food', 'home'
  var readyOnly = false;

  var LANES = {
    city: { label: 'Atlanta / lifestyle', hint: 'mostly TikTok' },
    food: { label: 'Food & restaurants', hint: 'mostly Instagram' },
    home: { label: 'Home & lifestyle', hint: 'Instagram + Pinterest' }
  };

  function cursor() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + offset, 1);
  }

  /* ------------------------------------------------------------- render -- */

  function topicCard(row) {
    var t = row.topic, cov = row.cov;

    var state = cov.ready ? 'ready' : cov.thin ? 'thin' : 'none';
    var stateLabel = cov.ready ? '✓ You can make this now'
                   : cov.thin ? '◑ ' + cov.count + ' place' + (cov.count === 1 ? '' : 's') + ' — needs 3'
                   : '○ Nothing for this yet';

    var badges = [];
    if (t.recurring) badges.push(el('span', { class: 'pill pill-warn', text: '↻ every year',
      title: 'This moment comes back annually and gets searched hard. Worth having ready in advance.' }));
    if (t.months === 'any') badges.push(el('span', { class: 'pill pill-quiet', text: 'any month' }));
    if (t.own) badges.push(el('span', { class: 'pill pill-ai', text: 'yours' }));

    return el('div', { class: 'topic-card is-' + state }, [
      el('div', { class: 'topic-top' }, [
        el('h4', { class: 'topic-title', text: t.title }),
        el('span', { class: 'push' })
      ].concat(badges)),

      el('p', { class: 'topic-why', text: t.why }),

      el('div', { class: 'topic-meta' }, [
        el('span', { class: 'topic-lane', text: (LANES[t.lane] || {}).label || t.lane }),
        el('span', { class: 'topic-plats' }, (t.platforms || []).map(function (p) {
          var info = CJ.ui.platformInfo(p);
          return el('span', { class: 'pill pill-' + p, text: info.emoji + ' ' + info.label });
        })),
        el('span', { class: 'push' }),
        el('span', { class: 'topic-state topic-state-' + state, text: stateLabel })
      ]),

      cov.count
        ? el('div', { class: 'topic-places' }, cov.items.slice(0, 6).map(function (it) {
            return el('button', {
              class: 'tag', type: 'button', 'data-cat': 'other', text: it.name,
              title: 'Open ' + it.name,
              onclick: function () { CJ.app.showView('library'); CJ.library.openForm(it.id); }
            });
          }).concat(cov.items.length > 6
            ? [el('span', { class: 'muted-xs', text: '+' + (cov.items.length - 6) + ' more' })] : []))
        : null,

      cov.missing.length
        ? el('p', { class: 'topic-missing', text: 'To unlock it, shoot or tag: ' + cov.missing.join(', ') })
        : null,

      el('div', { class: 'topic-actions' }, [
        cov.count >= 2 ? el('button', {
          class: 'btn btn-sm btn-primary', type: 'button', text: '+ Put on the calendar',
          title: 'Creates a pinned idea, so a refresh will never move or replace it',
          onclick: function () { schedule(row); }
        }) : null,
        el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', text: t.own ? 'Edit' : 'Hide',
          onclick: function () {
            if (t.own) return openTopicForm(t.id);
            CJ.setTopicHidden(t.id, true);
            toast('Hidden. Turn it back on with "Show hidden".');
            render();
          }
        }),
        row.hidden ? el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', text: 'Unhide',
          onclick: function () { CJ.setTopicHidden(t.id, false); render(); }
        }) : null
      ])
    ]);
  }

  /**
   * Turn a topic into a real calendar idea. Pinned, because you chose it
   * deliberately — a refresh must never move or replace it.
   */
  function schedule(row) {
    var t = row.topic, cov = row.cov;
    var c = cursor();
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var start = (c.getFullYear() === today.getFullYear() && c.getMonth() === today.getMonth())
      ? today : c;
    var date = new Date(start.getTime());
    date.setDate(date.getDate() + 7);

    var items = cov.items.slice(0, 6);
    var settings = CJ.settings();
    var platforms = (t.platforms || []).filter(function (p) {
      return items.some(function (it) { return CJ.itemAllowsPlatform(it, p); });
    });
    if (!platforms.length) platforms = [t.platforms[0]];

    var gap = (settings.rollout && settings.rollout.gapDays != null) ? settings.rollout.gapDays : 2;
    var drops = platforms.map(function (p, i) {
      var d = new Date(date.getTime());
      d.setDate(d.getDate() + i * gap);
      var use = items.filter(function (it) { return CJ.itemAllowsPlatform(it, p); });
      if (!use.length) use = items;
      var layerByItem = {};
      use.forEach(function (it) {
        var l = CJ.bestLayerFor(it, p);
        if (l) layerByItem[it.id] = l.id;
      });
      return {
        id: 'topic:' + t.id + ':' + CJ.isoDate(c).slice(0, 7) + '::' + p,
        platform: p,
        format: CJ.generator.formatFor(p, use.length, { format: 'roundup' }, settings),
        date: CJ.isoDate(d),
        itemIds: use.map(function (x) { return x.id; }),
        layerByItem: layerByItem,
        linksTo: p === 'pinterest' && platforms.length > 1 ? platforms[0] : null,
        status: 'suggested', pinned: true, touched: true, notes: ''
      };
    });

    CJ.addIdeas([{
      id: 'topic:' + t.id + ':' + CJ.isoDate(c).slice(0, 7),
      date: drops[0].date,
      drops: drops,
      source: 'topic',
      themeId: null,
      title: t.title,
      blurb: t.why,
      format: 'roundup',
      itemIds: items.map(function (i) { return i.id; }),
      platforms: platforms,
      hooks: [t.title],
      captions: [t.title + ' — ' + CJ.generator.listNames(items.slice(0, 3))],
      occasion: null,
      deadlineFor: null,
      status: 'suggested',
      pinned: true,
      touched: true,
      priority: 1,
      notes: 'Added from the ' + monthName() + ' plan.'
    }]);

    CJ.calendarUI.markStale();
    toast('Added to ' + monthName() + ' and pinned — a refresh won\'t move it.');
    render();
  }

  function monthName() {
    return cursor().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function render() {
    if (!CJ.state) return;
    var c = cursor();
    var m = c.getMonth() + 1;
    var info = CJ.atlanta.monthInfo(m);

    $('#monthly-title').textContent = monthName();
    $('#monthly-mood').textContent = info.mood || '';

    var showHidden = $('#monthly-hidden').checked;
    var rows = CJ.monthly.forMonth(m, { includeHidden: showHidden });
    if (laneFilter) rows = rows.filter(function (r) { return r.topic.lane === laneFilter; });
    if (readyOnly) rows = rows.filter(function (r) { return r.cov.ready; });

    var readyCount = rows.filter(function (r) { return r.cov.ready; }).length;
    $('#monthly-sub').textContent = rows.length + ' topic' + (rows.length === 1 ? '' : 's') +
      ' · ' + readyCount + ' you can make with what you already have';

    var body = $('#monthly-body');
    body.innerHTML = '';

    if (!rows.length) {
      body.appendChild(el('div', { class: 'empty' }, [
        el('h3', { text: 'Nothing here' }),
        el('p', { text: laneFilter || readyOnly ? 'Loosen the filters above.' : 'Add a topic of your own.' })
      ]));
      return;
    }

    body.appendChild(el('div', { class: 'topic-grid' }, rows.map(topicCard)));
  }

  /* ---------------------------------------------------------- own topics -- */

  function openTopicForm(id) {
    var t = null;
    if (id) CJ.getTopics().forEach(function (x) { if (x.id === id) t = x; });

    $('#topic-modal-title').textContent = t ? 'Edit topic' : 'Add a topic';
    $('#t-id').value = t ? t.id : '';
    $('#t-title').value = t ? t.title : '';
    $('#t-why').value = t ? t.why : '';
    $('#t-lane').value = t ? t.lane : 'city';
    $('#t-needs').value = t && t.needs ? t.needs.join(', ') : '';
    $('#t-months').value = t ? (t.months === 'any' ? '' : t.months.join(', ')) : String(cursor().getMonth() + 1);
    $$('#t-platforms input').forEach(function (cb) {
      cb.checked = t ? (t.platforms || []).indexOf(cb.value) !== -1 : true;
    });
    $('#t-delete').hidden = !t;
    $('#topic-modal').hidden = false;
    setTimeout(function () { $('#t-title').focus(); }, 40);
  }

  function saveTopic(e) {
    e.preventDefault();
    var title = $('#t-title').value.trim();
    if (!title) { toast('Give the topic a title.', 'error'); return; }

    var months = $('#t-months').value.split(/[^0-9]+/).map(Number).filter(function (n) { return n >= 1 && n <= 12; });
    var platforms = $$('#t-platforms input').filter(function (cb) { return cb.checked; }).map(function (cb) { return cb.value; });

    CJ.upsertTopic({
      id: $('#t-id').value || undefined,
      title: title,
      why: $('#t-why').value.trim(),
      lane: $('#t-lane').value,
      months: months.length ? months : 'any',
      platforms: platforms.length ? platforms : ['instagram'],
      needs: $('#t-needs').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
    });
    $('#topic-modal').hidden = true;
    toast('Saved.');
    render();
  }

  /* --------------------------------------------------------------- init -- */

  function init() {
    $('#monthly-prev').addEventListener('click', function () { offset--; render(); });
    $('#monthly-next').addEventListener('click', function () { offset++; render(); });
    $('#monthly-today').addEventListener('click', function () { offset = 0; render(); });
    $('#monthly-hidden').addEventListener('change', render);
    $('#monthly-ready').addEventListener('change', function () { readyOnly = this.checked; render(); });

    $$('#monthly-lanes button').forEach(function (b) {
      b.addEventListener('click', function () {
        laneFilter = b.getAttribute('data-lane') === laneFilter ? '' : b.getAttribute('data-lane');
        $$('#monthly-lanes button').forEach(function (x) {
          x.classList.toggle('is-on', x.getAttribute('data-lane') === laneFilter);
        });
        render();
      });
    });

    $('#btn-add-topic').addEventListener('click', function () { openTopicForm(); });
    $('#topic-modal-close').addEventListener('click', function () { $('#topic-modal').hidden = true; });
    $('#t-cancel').addEventListener('click', function () { $('#topic-modal').hidden = true; });
    $('#topic-form').addEventListener('submit', saveTopic);
    $('#topic-modal').addEventListener('mousedown', function (e) {
      if (e.target === $('#topic-modal')) $('#topic-modal').hidden = true;
    });
    $('#t-delete').addEventListener('click', function () {
      var id = $('#t-id').value;
      if (!id || !CJ.ui.confirmDanger('Delete this topic?')) return;
      CJ.deleteTopic(id);
      $('#topic-modal').hidden = true;
      render();
    });
  }

  CJ.monthlyUI = { init: init, render: render };

})(window.CJ);
