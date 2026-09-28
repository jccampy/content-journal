/* =========================================================================
   ui-collections.js — the library, browsed as collections.

   The same places, seen by where they are (neighborhood), what they're about
   (subject tags), and what kind of content they are (type). Each collection
   answers the questions you'd ask before planning around it: how much is
   there, how much has never been posted, how much is free to use right now,
   and what's already coming up.

   Membership is derived from tags and neighborhoods via CJ.matchesCollection,
   never stored, so a newly tagged place joins its collections immediately.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var $ = CJ.ui.$, $$ = CJ.ui.$$, el = CJ.ui.el;

  var mode = 'places';        // 'places' | 'collections'
  var query = '';
  var showAllSubjects = false;

  /* ---------- derivations ---------- */

  function placesIn(coll) {
    return CJ.getItems().filter(function (it) { return CJ.matchesCollection(it, coll); });
  }

  /** Subject tags: anything that isn't a neighborhood, on at least 2 places. */
  function subjectTags() {
    var counts = {};
    CJ.getItems().forEach(function (it) {
      var seen = {};
      var tags = (it.tags || []).slice();
      (it.layers || []).forEach(function (l) { tags = tags.concat(l.tags || []); });
      tags.forEach(function (t) {
        var k = t.toLowerCase();
        if (seen[k]) return;
        seen[k] = true;
        if (CJ.tagCategory(t) === 'neighborhood') return;
        if (it.neighborhood && it.neighborhood.toLowerCase() === k) return;
        counts[k] = counts[k] || { tag: t, n: 0 };
        counts[k].n++;
      });
    });
    return Object.keys(counts).map(function (k) { return counts[k]; })
      .filter(function (c) { return c.n >= 2; })
      .sort(function (a, b) { return b.n - a.n || a.tag.localeCompare(b.tag); });
  }

  function statsFor(coll) {
    var items = placesIn(coll);
    var ids = {};
    items.forEach(function (it) { ids[it.id] = true; });

    var clips = 0, unused = 0, freeNow = 0, last = null;
    items.forEach(function (it) {
      clips += (it.layers || []).length;
      unused += CJ.unusedLayers(it).length;
      var anyLane = CJ.PLATFORM_IDS.some(function (p) { return CJ.itemAllowsPlatform(it, p); });
      if (anyLane && !CJ.library.nextFreeAny(it)) freeNow++;
      if (it.lastPosted && (!last || it.lastPosted > last)) last = it.lastPosted;
    });

    var today = CJ.todayISO();
    var upcoming = 0;
    CJ.getDrops().forEach(function (e) {
      var d = e.drop;
      if (d.status === 'dismissed' || d.status === 'done' || d.date < today) return;
      if ((d.itemIds || []).some(function (id) { return ids[id]; })) upcoming++;
    });

    return { items: items, clips: clips, unused: unused, freeNow: freeNow, upcoming: upcoming, last: last };
  }

  function isFocus(coll) {
    var f = CJ.settings().planFocus;
    return !!(f && f.kind === coll.kind && String(f.value).toLowerCase() === String(coll.value).toLowerCase());
  }

  /* ---------- actions ---------- */

  function browse(coll) {
    CJ.library.clearFilters();
    var f = CJ.library.filters;
    if (coll.kind === 'type') f.types.push(coll.value);
    else f.tags.push(coll.value);
    setMode('places');
    CJ.library.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- rendering ---------- */

  function collCard(coll, icon) {
    var st = statsFor(coll);
    if (!st.items.length) return null;
    var focused = isFocus(coll);

    var names = st.items.slice().sort(function (a, b) {
      // Surface what's most usable first: never-posted, then oldest-posted.
      return (a.lastPosted || '').localeCompare(b.lastPosted || '');
    }).slice(0, 4);

    return el('article', { class: 'coll-card' + (focused ? ' is-focus' : '') }, [
      el('div', { class: 'coll-head' }, [
        el('span', { class: 'coll-icon', text: icon, 'aria-hidden': 'true' }),
        el('button', {
          class: 'coll-name', type: 'button', text: CJ.collectionLabel(coll),
          onclick: function () { browse(coll); }
        }),
        focused ? el('span', { class: 'pill pill-good', text: '◎ plan scope' }) : null
      ]),
      el('div', { class: 'coll-stats' }, [
        stat(st.items.length, st.items.length === 1 ? 'place' : 'places'),
        stat(st.clips, st.clips === 1 ? 'clip' : 'clips'),
        stat(st.unused, 'never posted', st.unused ? 'is-good' : ''),
        stat(st.freeNow, 'free now', st.freeNow ? '' : 'is-quiet')
      ]),
      el('ul', { class: 'coll-places' }, names.map(function (it) {
        return el('li', {}, [
          el('button', {
            type: 'button', text: it.name, title: 'Open the journal for ' + it.name,
            onclick: function () { CJ.journalUI.open(it.id); }
          }),
          el('span', { class: 'coll-place-meta', text: it.lastPosted ? CJ.formatDate(it.lastPosted, { month: 'short', year: '2-digit' }) : 'new' })
        ]);
      }).concat(st.items.length > names.length
        ? [el('li', { class: 'coll-more' }, [
            el('button', { type: 'button', text: '+' + (st.items.length - names.length) + ' more', onclick: function () { browse(coll); } })
          ])]
        : [])),
      el('div', { class: 'coll-foot' }, [
        el('span', {
          class: 'muted-xs',
          text: st.upcoming ? st.upcoming + ' post' + (st.upcoming === 1 ? '' : 's') + ' coming up' : 'Nothing scheduled'
        }),
        el('span', { class: 'push' }),
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Browse', onclick: function () { browse(coll); } }),
        el('button', {
          class: 'btn btn-sm' + (focused ? '' : ' btn-soft'), type: 'button',
          text: focused ? 'Edit plan' : 'Plan this',
          onclick: function () { CJ.planUI.open({ focus: coll }); }
        })
      ])
    ]);
  }

  function stat(n, label, cls) {
    return el('div', { class: 'coll-stat ' + (cls || '') }, [
      el('strong', { text: String(n) }),
      el('span', { text: label })
    ]);
  }

  function section(title, hint, cards) {
    cards = cards.filter(Boolean);
    if (!cards.length) return null;
    return el('section', { class: 'coll-section' }, [
      el('div', { class: 'coll-section-head' }, [
        el('h3', { text: title }),
        hint ? el('span', { class: 'muted-xs', text: hint }) : null
      ]),
      el('div', { class: 'coll-grid' }, cards)
    ]);
  }

  function matchesQuery(label) {
    return !query || String(label).toLowerCase().indexOf(query) !== -1;
  }

  function render() {
    var body = $('#collections-body');
    if (!body || !CJ.state) return;
    body.innerHTML = '';

    if (!CJ.getItems().length) {
      body.appendChild(el('div', { class: 'empty' }, [
        el('h3', { text: 'Collections fill themselves' }),
        el('p', { text: 'Add places with a neighborhood and a few tags, and they group here automatically, by where they are and what they\'re about.' })
      ]));
      return;
    }

    var hoods = CJ.allNeighborhoods().filter(matchesQuery).map(function (n) {
      return { coll: { kind: 'neighborhood', value: n }, n: placesIn({ kind: 'neighborhood', value: n }).length };
    }).sort(function (a, b) { return b.n - a.n; });

    var subjects = subjectTags().filter(function (s) { return matchesQuery(s.tag); });
    var subjectLimit = showAllSubjects || query ? subjects.length : 12;

    var types = CJ.TYPES.filter(function (t) { return matchesQuery(t.plural); });

    var parts = [
      section('By location', 'Neighborhoods, from the most footage down',
        hoods.map(function (h) { return collCard(h.coll, '📍'); })),
      section('By subject', 'Tags on two or more places',
        subjects.slice(0, subjectLimit).map(function (s) { return collCard({ kind: 'tag', value: s.tag }, '#'); })),
      subjects.length > subjectLimit
        ? el('div', { class: 'coll-showall' }, [
            el('button', {
              class: 'btn btn-ghost btn-sm', type: 'button',
              text: 'Show all ' + subjects.length + ' subjects',
              onclick: function () { showAllSubjects = true; render(); }
            })
          ])
        : null,
      section('By type', null,
        types.map(function (t) { return collCard({ kind: 'type', value: t.id }, t.emoji); }))
    ].filter(Boolean);

    if (!parts.length) {
      body.appendChild(el('div', { class: 'empty' }, [
        el('h3', { text: 'No collection by that name' }),
        el('p', { text: 'Collections come from neighborhoods and tags. Try a different word.' })
      ]));
      return;
    }
    parts.forEach(function (p) { body.appendChild(p); });
  }

  function setMode(m) {
    mode = m === 'collections' ? 'collections' : 'places';
    $('#view-library').classList.toggle('is-collections', mode === 'collections');
    $$('#lib-mode button').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-mode') === mode);
    });
    if (mode === 'collections') render();
  }

  function init() {
    $$('#lib-mode button').forEach(function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
    });
    $('#coll-search').addEventListener('input', function () {
      query = this.value.trim().toLowerCase();
      render();
    });
    CJ.subscribe(function () { if (mode === 'collections') render(); });
    setMode('places');
  }

  CJ.collectionsUI = {
    init: init, render: render, setMode: setMode, browse: browse,
    statsFor: statsFor, subjectTags: subjectTags,
    mode: function () { return mode; }
  };

})(window.CJ);
