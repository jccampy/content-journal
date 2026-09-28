/* =========================================================================
   ui-plan.js — the Plan builder.

   One screen that answers "build me a plan" in the terms a person thinks in:
   how far ahead, how busy, which days, and (optionally) what to lean into.
   It sets the same settings the calendar already reads — horizonMonths,
   ideasPerMonth, preferredDays — plus planFocus (a collection to build the
   plan from), then runs a normal refresh.

   Nothing here bypasses the generator's rules. A refresh never touches
   anything planned, posted, moved or pinned, the spacing rule is still a hard
   floor, and a scoped plan only ever narrows the pool. The screen says so,
   because "will this wreck my calendar" is the first thing anyone wonders.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var $ = CJ.ui.$, el = CJ.ui.el;

  var PACES = [
    { n: 4,  label: 'Light',  hint: 'About 2 posts a week across platforms' },
    { n: 8,  label: 'Steady', hint: 'About 4 posts a week — the default' },
    { n: 12, label: 'Busy',   hint: 'About 6 posts a week, if the library can carry it' }
  ];
  var HORIZONS = [
    { n: 1, label: 'This month' },
    { n: 3, label: '3 months' },
    { n: 6, label: '6 months' },
    { n: 12, label: '12 months' }
  ];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
    var items = CJ.getItems();
    var focus = draft.focus;
    var pool = focus ? CJ.collectionsUI.statsFor(focus) : null;
    var perWeek = Math.round(draft.perMonth * 2.3 / 4.3 * 10) / 10;

    var lines = [
      'Up to <strong>' + draft.perMonth + ' concepts a month</strong> for <strong>' +
        (draft.months === 1 ? 'the rest of this month' : 'the next ' + draft.months + ' months') +
        '</strong>, each rolling out across its platforms over a few days (roughly ' + perWeek + ' posts a week).',
      'Posts land on <strong>' + (draft.days.length
        ? draft.days.slice().sort().map(function (d) { return DAYS[d]; }).join(', ')
        : 'any day') + '</strong> where possible; dated occasions keep their own dates.'
    ];
    if (pool) {
      lines.push('Built only from <strong>' + CJ.ui.esc(CJ.collectionLabel(focus)) + '</strong>: ' +
        pool.items.length + ' place' + (pool.items.length === 1 ? '' : 's') + ', ' +
        pool.unused + ' clip' + (pool.unused === 1 ? '' : 's') + ' never posted, ' +
        pool.freeNow + ' free to use right now. Deadlines from the rest of your library still get placed.');
      var gap = CJ.settings().minGapDays.restaurant || 30;
      lines.push('<span class="plan-warn">Expect fewer posts than a whole-library plan. The ' + gap +
        '-day spacing rule caps how often the same ' + pool.items.length + ' place' +
        (pool.items.length === 1 ? '' : 's') + ' can run' + (pool.items.length < 3 ? ', and most post ideas need 3 or more' : '') + '.</span>');
    }
    lines.push('Anything you\'ve planned, posted, moved or pinned stays exactly where it is.');

    if (items.length && items.length < 12 && draft.perMonth >= 12) {
      lines.push('<span class="plan-warn">With ' + items.length + ' places and a ' +
        (CJ.settings().minGapDays.restaurant || 30) + '-day spacing rule, a busy pace will likely come up short. The calendar will say by how much.</span>');
    }
    return lines;
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
      el('span', { text: 'Pace' }),
      segmented(PACES, draft.perMonth, function (n) { draft.perMonth = n; render(); }),
      PACES.every(function (p) { return p.n !== draft.perMonth; })
        ? el('p', { class: 'field-hint', text: 'Currently a custom pace of ' + draft.perMonth + ' concepts a month (set in Settings).' })
        : null
    ]));

    body.appendChild(el('div', { class: 'field' }, [
      el('span', { text: 'Posting days' }),
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
      el('button', { class: 'btn btn-primary', type: 'button', id: 'plan-build', text: '✦ Build my plan', onclick: build })
    ]));
  }

  /* ---------- actions ---------- */

  function build() {
    CJ.updateSettings({
      horizonMonths: draft.months,
      ideasPerMonth: draft.perMonth,
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
      perMonth: s.ideasPerMonth || 8,
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
