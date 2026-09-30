/* =========================================================================
   ui-plan.js — the Plan builder.

   One screen that answers "build me a plan" in the terms a person thinks in:
   how far ahead, how many posts a week on each platform (0 = paused), which
   days, and (optionally) one collection to build from. It sets horizonMonths,
   postsPerWeek, preferredDays and planFocus, then runs a normal refresh. It
   also says plainly how many posts a week the library can really carry.

   Nothing here bypasses the generator's rules. A refresh never touches
   anything planned, posted, moved or pinned, the spacing rule is still a hard
   floor, and a scoped plan only ever narrows the pool. The screen says so,
   because "will this wreck my calendar" is the first thing anyone wonders.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var $ = CJ.ui.$, el = CJ.ui.el;

  var HORIZONS = [
    { n: 1, label: 'This month' },
    { n: 3, label: '3 months' },
    { n: 6, label: '6 months' },
    { n: 12, label: '12 months' }
  ];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var FILL_ORDER = [4, 2, 6, 3, 5, 1, 0];

  /** The days a platform will actually post on for n posts a week (mirrors CJ.slotDays). */
  function daysFor(n, pref) {
    var days = FILL_ORDER.filter(function (d) { return pref.indexOf(d) !== -1; }).slice(0, n);
    FILL_ORDER.forEach(function (d) { if (days.length < n && days.indexOf(d) === -1) days.push(d); });
    return days.sort(function (a, b) { return a - b; });
  }

  function primaryOf(ppw) {
    return CJ.PLATFORM_IDS.slice().sort(function (a, b) { return (ppw[b] || 0) - (ppw[a] || 0); })[0];
  }

  var draft = null;

  function collKey(c) { return c ? c.kind + '::' + c.value : ''; }
  function parseKey(k) {
    if (!k) return null;
    var i = k.indexOf('::');
    return { kind: k.slice(0, i), value: k.slice(i + 2) };
  }

  /** Every collection worth focusing on, for the focus picker. */
  function focusOptions() {
    var groups = [];
    var hoods = CJ.allNeighborhoods().map(function (n) {
      var c = { kind: 'neighborhood', value: n };
      return { coll: c, n: CJ.collectionsUI.statsFor(c).items.length };
    }).filter(function (o) { return o.n; }).sort(function (a, b) { return b.n - a.n; });
    if (hoods.length) groups.push({ label: 'Locations', opts: hoods });

    var subs = CJ.collectionsUI.subjectTags().map(function (s) {
      return { coll: { kind: 'tag', value: s.tag }, n: s.n };
    });
    if (subs.length) groups.push({ label: 'Subjects', opts: subs });

    var types = CJ.TYPES.map(function (t) {
      var c = { kind: 'type', value: t.id };
      return { coll: c, n: CJ.collectionsUI.statsFor(c).items.length };
    }).filter(function (o) { return o.n; });
    if (types.length) groups.push({ label: 'Types', opts: types });
    return groups;
  }

  /* ---------- rendering ---------- */

  function segmented(options, current, onPick) {
    return el('div', { class: 'plan-seg' }, options.map(function (o) {
      return el('button', {
        type: 'button',
        class: 'plan-seg-btn' + (o.n === current ? ' is-active' : ''),
        onclick: function () { onPick(o.n); }
      }, [
        el('strong', { text: o.label }),
        o.hint ? el('span', { text: o.hint }) : null
      ]);
    }));
  }

  function summary() {
    var focus = draft.focus;
    var pool = focus ? CJ.collectionsUI.statsFor(focus) : null;
    var active = CJ.PLATFORM_IDS.filter(function (p) { return draft.ppw[p] > 0; });

    var lines = [
      active.map(function (p) {
        var n = draft.ppw[p];
        return '<strong>' + n + ' ' + CJ.ui.platformInfo(p).label + ' post' + (n === 1 ? '' : 's') + ' a week</strong> on ' +
          daysFor(n, draft.days).map(function (d) { return DAYS[d]; }).join(', ');
      }).join('; ') +
      ', for ' + (draft.months === 1 ? 'the rest of this month' : 'the next ' + draft.months + ' months') + '.',
      'Seasonal content only goes out in its season, places on hold sit out, and only places marked ' +
        '<strong>enough for its own post</strong> get a post to themselves.'
    ];
    var paused = CJ.PLATFORM_IDS.filter(function (p) { return !draft.ppw[p]; });
    if (paused.length) lines.push(paused.map(function (p) { return CJ.ui.platformInfo(p).label; }).join(' and ') + ' paused: nothing gets planned there.');

    // The honest part: can the library actually carry this?
    var p0 = primaryOf(draft.ppw);
    var cap = CJ.generator.capacity(p0);
    var want = draft.ppw[p0];
    var capLine = 'Right now your library can carry about <strong>' + cap.perWeek + ' ' + CJ.ui.platformInfo(p0).label +
      ' post' + (cap.perWeek === 1 ? '' : 's') + ' a week</strong>: ' + cap.solo + ' place' + (cap.solo === 1 ? '' : 's') +
      ' marked for their own post, ' + cap.group + ' more for roundups' +
      (cap.held ? ', ' + cap.held + ' on hold' : '') + (cap.offSeason ? ', ' + cap.offSeason + ' out of season this month' : '') + '.';
    lines.push(cap.perWeek + 0.05 < want
      ? '<span class="plan-warn">' + capLine + ' So expect fewer than ' + want + ' a week; the calendar leaves the rest empty rather than stretch. ' +
        'To get closer: tick “enough for its own post” on places that can carry one, add footage, or shorten the spacing gap in Settings.</span>'
      : capLine);

    if (pool) {
      lines.push('Built only from <strong>' + CJ.ui.esc(CJ.collectionLabel(focus)) + '</strong>: ' +
        pool.items.length + ' place' + (pool.items.length === 1 ? '' : 's') + ', ' +
        pool.freeNow + ' free to use right now. Deadlines from the rest of your library still get placed.');
    }
    lines.push('Anything you\'ve planned, posted, moved or pinned stays exactly where it is.');
    return lines;
  }

  function stepper(p) {
    var n = draft.ppw[p] || 0;
    var info = CJ.ui.platformInfo(p);
    function set(v) { draft.ppw[p] = Math.max(0, Math.min(7, v)); render(); }
    return el('div', { class: 'ppw-row' + (n ? '' : ' is-off') }, [
      el('span', { class: 'ppw-name', text: info.emoji + ' ' + info.label }),
      el('div', { class: 'ppw-step' }, [
        el('button', { type: 'button', class: 'ppw-btn', 'aria-label': 'Fewer ' + info.label + ' posts', text: '−', onclick: function () { set(n - 1); } }),
        el('span', { class: 'ppw-n', 'data-platform': p, text: n ? n + ' a week' : 'Paused' }),
        el('button', { type: 'button', class: 'ppw-btn', 'aria-label': 'More ' + info.label + ' posts', text: '+', onclick: function () { set(n + 1); } })
      ])
    ]);
  }

  function render() {
    var body = $('#plan-body');
    body.innerHTML = '';

    if (!CJ.getItems().length) {
      body.appendChild(el('div', { class: 'empty' }, [
        el('h3', { text: 'Add some footage first' }),
        el('p', { text: 'Plans are built entirely out of content you already have. Add a few places and come back.' }),
        el('button', { class: 'btn btn-primary', type: 'button', text: '⚡ Quick add', onclick: function () { close(); CJ.importUI.open(); } })
      ]));
      return;
    }

    body.appendChild(el('div', { class: 'field' }, [
      el('span', { text: 'How far ahead' }),
      segmented(HORIZONS, draft.months, function (n) { draft.months = n; render(); })
    ]));

    body.appendChild(el('div', { class: 'field' }, [
      el('span', { text: 'Posts per week' }),
      el('div', { class: 'ppw' }, CJ.PLATFORM_IDS.map(stepper))
    ]));

    body.appendChild(el('div', { class: 'field' }, [
      el('span', { text: 'Posting days' }),
      el('p', { class: 'field-hint', text: 'Your favourite days go first. If you post more times a week than you picked days, the extra days are added for you.' }),
      el('div', { class: 'chipset' }, DAYS.map(function (label, i) {
        var on = draft.days.indexOf(i) !== -1;
        return el('button', {
          type: 'button', class: 'chip' + (on ? ' is-on' : ''), text: label,
          onclick: function () {
            var at = draft.days.indexOf(i);
            if (at === -1) draft.days.push(i); else draft.days.splice(at, 1);
            render();
          }
        });
      }))
    ]));

    var select = el('select', { class: 'input', id: 'plan-focus' }, [
      el('option', { value: '', text: 'Whole library' })
    ]);
    focusOptions().forEach(function (g) {
      var og = el('optgroup', { label: g.label });
      g.opts.forEach(function (o) {
        og.appendChild(el('option', {
          value: collKey(o.coll),
          text: CJ.collectionLabel(o.coll) + ' (' + o.n + ')'
        }));
      });
      select.appendChild(og);
    });
    select.value = collKey(draft.focus);
    if (select.value !== collKey(draft.focus)) { draft.focus = null; select.value = ''; }
    select.addEventListener('change', function () { draft.focus = parseKey(this.value); render(); });

    body.appendChild(el('label', { class: 'field' }, [
      el('span', { text: 'Build from' }),
      select,
      el('p', { class: 'field-hint', text: 'Plan just one location, subject or type. Posts come only from places in that collection; the spacing and event-area rules still apply.' })
    ]));

    body.appendChild(el('div', { class: 'plan-summary' }, [
      el('h4', { text: 'What you\'ll get' }),
      el('ul', {}, summary().map(function (l) { return el('li', { html: l }); }))
    ]));

    body.appendChild(el('div', { class: 'modal-foot' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', text: 'Cancel', onclick: close }),
      el('span', { class: 'push' }),
      el('button', {
        class: 'btn btn-primary', type: 'button', id: 'plan-build', text: '✦ Build my plan', onclick: build,
        disabled: CJ.PLATFORM_IDS.every(function (p) { return !draft.ppw[p]; })
      })
    ]));
  }

  /* ---------- actions ---------- */

  function build() {
    CJ.updateSettings({
      horizonMonths: draft.months,
      postsPerWeek: Object.assign({}, draft.ppw),
      preferredDays: draft.days.slice().sort(),
      planFocus: draft.focus ? { kind: draft.focus.kind, value: draft.focus.value } : null
    });
    CJ.calendarUI.setMonths(draft.months);
    close();
    CJ.app.showView('calendar');
    CJ.calendarUI.refresh();
  }

  function open(opts) {
    opts = opts || {};
    var s = CJ.settings();
    draft = {
      months: s.horizonMonths || 6,
      ppw: Object.assign({ instagram: 0, tiktok: 0, pinterest: 0 }, s.postsPerWeek || { instagram: 5 }),
      days: (s.preferredDays || [2, 4, 6]).slice(),
      focus: opts.focus !== undefined ? opts.focus : (s.planFocus || null)
    };
    render();
    $('#plan-modal').hidden = false;
  }

  function close() { $('#plan-modal').hidden = true; }

  function init() {
    $('#plan-close').addEventListener('click', close);
    $('#plan-modal').addEventListener('mousedown', function (e) { if (e.target === $('#plan-modal')) close(); });
    $('#btn-plan').addEventListener('click', function () { open(); });
  }

  CJ.planUI = { init: init, open: open, close: close };

})(window.CJ);
