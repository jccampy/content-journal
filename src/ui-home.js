/* =========================================================================
   ui-home.js — Overview: the whole journal on one screen.

   Four questions, in the order you'd ask them opening the app:
     1. What's going up next?            → the next few posts
     2. How healthy is the library?      → counts that matter for reuse
     3. What should I use next?          → places with the most life left
     4. Where are the holes?             → a short version of the gap report

   Everything is derived on render. Nothing here is stored.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var $ = CJ.ui.$, el = CJ.ui.el;

  function fmtLabel(f) {
    var m = CJ.generator.FORMATS[f];
    return m ? m.label : (f || 'Post');
  }

  function addDaysISO(n) {
    var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n);
    return CJ.isoDate(d);
  }

  function activeDrops() {
    return CJ.getDrops().filter(function (e) { return e.drop.status !== 'dismissed'; });
  }

  /* ---------- pieces ---------- */

  function tile(value, label, sub, onclick, cls) {
    return el(onclick ? 'button' : 'div', {
      class: 'ov-tile ' + (cls || ''), type: onclick ? 'button' : null, onclick: onclick || null
    }, [
      el('span', { class: 'ov-tile-value', text: String(value) }),
      el('span', { class: 'ov-tile-label', text: label }),
      sub ? el('span', { class: 'ov-tile-sub', text: sub }) : null
    ]);
  }

  function card(title, action, children) {
    return el('section', { class: 'ov-card' }, [
      el('div', { class: 'ov-card-head' }, [
        el('h3', { text: title }),
        action ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: action.label, onclick: action.onclick }) : null
      ])
    ].concat(children));
  }

  function nextUp() {
    var today = CJ.todayISO();
    var list = activeDrops()
      .filter(function (e) { return e.drop.status !== 'done' && e.drop.date >= today; })
      .sort(function (a, b) { return a.drop.date.localeCompare(b.drop.date); })
      .slice(0, 6);

    if (!list.length) {
      return el('div', { class: 'ov-empty' }, [
        el('p', { text: 'Nothing on the calendar yet.' }),
        el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: '✦ Build a plan', onclick: function () { CJ.planUI.open(); } })
      ]);
    }

    return el('ol', { class: 'ov-next' }, list.map(function (e) {
      var d = e.drop, pinfo = CJ.ui.platformInfo(d.platform);
      var places = (d.itemIds || []).map(CJ.getItem).filter(Boolean);
      var when = d.date === today ? 'Today'
        : d.date === addDaysISO(1) ? 'Tomorrow'
        : CJ.formatDate(d.date, { weekday: 'short', month: 'short', day: 'numeric' });
      return el('li', { class: 'ov-next-row plat-' + d.platform }, [
        el('div', { class: 'ov-next-when' }, [
          el('strong', { text: when }),
          el('span', { class: 'pill pill-' + d.platform, text: pinfo.emoji + ' ' + pinfo.label })
        ]),
        el('div', { class: 'ov-next-main' }, [
          el('button', {
            class: 'ov-next-title', type: 'button', text: e.idea.title,
            onclick: function () { CJ.app.showView('calendar'); CJ.calendarUI.openIdea(e.idea.id); }
          }),
          el('span', {
            class: 'muted-xs',
            text: fmtLabel(d.format) + (places.length ? ' · ' + places.map(function (p) { return p.name; }).slice(0, 3).join(', ') +
              (places.length > 3 ? ' +' + (places.length - 3) : '') : '')
          })
        ]),
        d.status === 'planned' ? el('span', { class: 'pill pill-good', text: '✓ planned' }) : null
      ]);
    }));
  }

  function platformMix() {
    var today = CJ.todayISO(), end = addDaysISO(30);
    var counts = {}, max = 0;
    activeDrops().forEach(function (e) {
      if (e.drop.date < today || e.drop.date > end) return;
      counts[e.drop.platform] = (counts[e.drop.platform] || 0) + 1;
    });
    CJ.PLATFORM_IDS.forEach(function (p) { max = Math.max(max, counts[p] || 0); });

    return el('div', { class: 'ov-mix' }, CJ.PLATFORMS.map(function (p) {
      var n = counts[p.id] || 0;
      return el('div', { class: 'ov-mix-row' }, [
        el('span', { class: 'ov-mix-label', text: p.emoji + ' ' + p.label }),
        el('span', { class: 'ov-mix-track' }, [
          el('span', { class: 'ov-mix-bar bar-' + p.id, style: { width: (max ? Math.max(4, n / max * 100) : 0) + '%' } })
        ]),
        el('span', { class: 'ov-mix-n', text: String(n) })
      ]);
    }));
  }

  function readyToUse() {
    var items = CJ.getItems().filter(function (it) {
      var r = CJ.reuseState(it);
      return (r === 'unused' || r === 'ready') && !CJ.library.nextFreeAny(it);
    }).sort(function (a, b) {
      // Never-posted clips first, then the longest-rested places.
      var ua = CJ.unusedLayers(a).length, ub = CJ.unusedLayers(b).length;
      if (!!ub !== !!ua) return ub - ua;
      return (a.lastPosted || '').localeCompare(b.lastPosted || '');
    }).slice(0, 6);

    if (!items.length) {
      return el('p', { class: 'muted-xs', text: 'Everything is resting under the spacing rule right now. New footage is the fastest way to open things up.' });
    }

    return el('ul', { class: 'ov-ready' }, items.map(function (it) {
      var unused = CJ.unusedLayers(it).length;
      var t = CJ.ui.typeInfo(it.type);
      return el('li', {}, [
        el('button', { class: 'ov-ready-name', type: 'button', onclick: function () { CJ.journalUI.open(it.id); } }, [
          el('span', { text: t.emoji + ' ' + it.name }),
          el('span', { class: 'muted-xs', text: it.neighborhood || t.label })
        ]),
        el('span', {
          class: 'pill ' + (unused ? 'pill-good' : 'pill-quiet'),
          text: unused ? '✨ ' + unused + ' unused clip' + (unused === 1 ? '' : 's')
            : 'rested ' + Math.round(CJ.daysSince(it.lastPosted) / 30) + 'mo'
        })
      ]);
    }));
  }

  function gapsSummary() {
    var r;
    try { r = CJ.gaps.report(3); } catch (e) { return null; }
    var bits = [];
    if (r.uncovered.length) {
      bits.push(r.uncovered.length + ' Atlanta date' + (r.uncovered.length === 1 ? '' : 's') + ' in the next 3 months your library can\'t cover yet');
    }
    if (r.starved.length) {
      bits.push(r.starved.length + ' post idea' + (r.starved.length === 1 ? ' is' : 's are') + ' one or two places short');
    }
    if (r.thinHoods.length) {
      bits.push(r.thinHoods.slice(0, 3).map(function (h) { return h.neighborhood; }).join(', ') +
        (r.thinHoods.length > 3 ? ' and ' + (r.thinHoods.length - 3) + ' more' : '') +
        ' need' + (r.thinHoods.length === 1 ? 's' : '') + ' a third place for a guide');
    }
    if (!bits.length) return el('p', { class: 'muted-xs', text: 'No obvious holes. Your library covers what\'s coming up.' });
    return el('ul', { class: 'ov-gaps' }, bits.map(function (b) { return el('li', { text: b }); }));
  }

  function topCollections() {
    var hoods = CJ.allNeighborhoods().map(function (n) {
      var c = { kind: 'neighborhood', value: n };
      return { coll: c, st: CJ.collectionsUI.statsFor(c), icon: '📍' };
    });
    var subs = CJ.collectionsUI.subjectTags().slice(0, 8).map(function (s) {
      var c = { kind: 'tag', value: s.tag };
      return { coll: c, st: CJ.collectionsUI.statsFor(c), icon: '#' };
    });
    var all = hoods.concat(subs).filter(function (x) { return x.st.items.length >= 2; })
      .sort(function (a, b) { return (b.st.unused + b.st.freeNow) - (a.st.unused + a.st.freeNow); })
      .slice(0, 8);
    if (!all.length) return el('p', { class: 'muted-xs', text: 'Tag places with a neighborhood and subjects and collections appear here.' });

    return el('div', { class: 'ov-colls' }, all.map(function (x) {
      return el('button', {
        class: 'ov-coll', type: 'button',
        title: x.st.items.length + ' places · ' + x.st.unused + ' never-posted clips · ' + x.st.freeNow + ' free now',
        onclick: function () { CJ.app.showView('library'); CJ.collectionsUI.browse(x.coll); }
      }, [
        el('span', { class: 'ov-coll-name', text: x.icon + ' ' + CJ.collectionLabel(x.coll) }),
        el('span', { class: 'ov-coll-n', text: x.st.freeNow + ' of ' + x.st.items.length + ' free now' })
      ]);
    }));
  }

  /* ---------- the view ---------- */

  function render() {
    var body = $('#home-body');
    if (!body || !CJ.state) return;
    body.innerHTML = '';

    var now = new Date();
    var hour = now.getHours();
    $('#home-greeting').textContent = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    var focus = CJ.settings().planFocus;
    $('#home-sub').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) +
      (focus && focus.value ? ' · plan built from ' + CJ.collectionLabel(focus) : '');

    var items = CJ.getItems();
    if (!items.length) {
      body.appendChild(el('div', { class: 'empty' }, [
        el('h3', { text: 'Your journal starts with what you\'ve already shot' }),
        el('p', { text: 'Add places and footage, tag them by neighborhood and subject, and this page turns into your content plan.' }),
        el('div', { class: 'empty-actions' }, [
          el('button', { class: 'btn btn-primary', type: 'button', text: '⚡ Paste a list', onclick: function () { CJ.importUI.open(); } }),
          el('button', { class: 'btn', type: 'button', text: '+ Add one place', onclick: function () { CJ.library.openForm(); } }),
          el('button', { class: 'btn btn-ghost', type: 'button', text: 'Load sample data', onclick: function () { CJ.settingsUI.seed(); } })
        ])
      ]));
      return;
    }

    var today = CJ.todayISO(), week = addDaysISO(7), monthAgo = addDaysISO(-30);
    var drops = activeDrops();
    var thisWeek = drops.filter(function (e) { return e.drop.status !== 'done' && e.drop.date >= today && e.drop.date <= week; }).length;
    var slipped = drops.filter(function (e) { return e.drop.status !== 'done' && e.drop.date < today; }).length;
    var posted30 = drops.filter(function (e) { return e.drop.status === 'done' && e.drop.date >= monthAgo && e.drop.date <= today; }).length;
    var clips = items.reduce(function (a, it) { return a + (it.layers || []).length; }, 0);
    var unused = items.reduce(function (a, it) { return a + CJ.unusedLayers(it).length; }, 0);

    body.appendChild(el('div', { class: 'ov-tiles' }, [
      tile(thisWeek, 'posts this week', slipped ? slipped + ' slipped' : 'next 7 days',
        function () { CJ.app.showView('week'); }, slipped ? 'is-warn' : ''),
      tile(posted30, 'posted', 'last 30 days'),
      tile(items.length, 'places', clips + ' clips on file', function () { CJ.app.showView('library'); }),
      tile(unused, 'never-posted clips', unused ? 'free content waiting' : 'all used at least once',
        function () {
          CJ.app.showView('library'); CJ.collectionsUI.setMode('places');
          CJ.library.clearFilters(); CJ.library.filters.reuse.push('unused'); CJ.library.render();
        }, unused ? 'is-good' : '')
    ]));

    body.appendChild(el('div', { class: 'ov-grid' }, [
      card('Next up', { label: 'Calendar →', onclick: function () { CJ.app.showView('calendar'); } }, [nextUp()]),
      el('div', { class: 'ov-stack' }, [
        card('Next 30 days by platform', null, [platformMix()]),
        card('Ready to use', { label: 'Library →', onclick: function () { CJ.app.showView('library'); } }, [readyToUse()])
      ])
    ]));

    body.appendChild(el('div', { class: 'ov-grid ov-grid-even' }, [
      card('Collections with the most to give', {
        label: 'All collections →',
        onclick: function () { CJ.app.showView('library'); CJ.collectionsUI.setMode('collections'); }
      }, [topCollections()]),
      card('What to shoot next', { label: 'Full report →', onclick: function () { CJ.app.showView('week'); } }, [gapsSummary()])
    ].filter(Boolean)));
  }

  function init() {
    $('#btn-home-plan').addEventListener('click', function () { CJ.planUI.open(); });
  }

  CJ.homeUI = { init: init, render: render };

})(window.CJ);
