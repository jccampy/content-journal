/* =========================================================================
   ui-library.js — shared DOM helpers, the library view, and the add/edit form.
   ========================================================================= */

(function (CJ) {
  'use strict';

  /* ================= shared helpers ================= */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (k === 'style' && typeof attrs[k] === 'object') Object.assign(n.style, attrs[k]);
      else if (attrs[k] === true) n.setAttribute(k, '');
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var toastTimer = null;
  function toast(msg, kind) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (kind === 'error' ? ' is-error' : '');
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, kind === 'error' ? 5200 : 2600);
  }

  function typeInfo(id) {
    for (var i = 0; i < CJ.TYPES.length; i++) if (CJ.TYPES[i].id === id) return CJ.TYPES[i];
    return CJ.TYPES[0];
  }
  function platformInfo(id) {
    for (var i = 0; i < CJ.PLATFORMS.length; i++) if (CJ.PLATFORMS[i].id === id) return CJ.PLATFORMS[i];
    return { id: id, label: id, emoji: '' };
  }

  function hexToSoft(hex) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',.11)';
  }

  /** A clickable tag pill. Clicking it filters the library by that tag. */
  function tagEl(tag, opts) {
    opts = opts || {};
    var cat = CJ.tagCategory(tag);
    var node = el('button', {
      class: 'tag' + (opts.active ? ' is-on' : ''),
      type: 'button',
      'data-cat': cat,
      title: cat.charAt(0).toUpperCase() + cat.slice(1) + ' tag — click to filter',
      onclick: function (e) {
        e.stopPropagation();
        if (opts.onclick) return opts.onclick(tag);
        CJ.library.toggleTagFilter(tag, true);
      }
    }, [tag + (opts.count ? ' ' : '')]);
    if (opts.count) node.appendChild(el('span', { class: 'chip-count', text: String(opts.count) }));
    return node;
  }

  function platformPill(p) {
    var info = platformInfo(p);
    return el('span', { class: 'pill pill-' + p, text: info.emoji + ' ' + info.label });
  }

  function confirmDanger(msg) { return window.confirm(msg); }

  CJ.ui = {
    $: $, $$: $$, el: el, esc: esc, toast: toast,
    typeInfo: typeInfo, platformInfo: platformInfo,
    tagEl: tagEl, platformPill: platformPill, hexToSoft: hexToSoft, confirmDanger: confirmDanger
  };
  CJ.toast = toast;

  /* ================= library view ================= */

  var filters = {
    q: '',
    types: [],
    reuse: [],
    tags: [],
    tagMode: 'any',
    sort: 'stale',
    group: 'none'
  };

  var tagsExpanded = false;

  function matchesFilters(item) {
    if (filters.types.length && filters.types.indexOf(item.type) === -1) return false;

    if (filters.reuse.length) {
      // "Has a deadline" sits alongside the three readiness buckets, so an item
      // qualifies if it matches any selected chip.
      var hit = filters.reuse.indexOf(CJ.reuseState(item)) !== -1;
      if (!hit && filters.reuse.indexOf('due') !== -1 && item.deadline) hit = true;
      if (!hit) return false;
    }

    if (filters.tags.length) {
      var bag = (item.tags || []).map(function (t) { return t.toLowerCase(); });
      if (item.neighborhood) bag.push(item.neighborhood.toLowerCase());
      var hits = filters.tags.filter(function (t) { return bag.indexOf(t.toLowerCase()) !== -1; });
      if (filters.tagMode === 'all') { if (hits.length !== filters.tags.length) return false; }
      else if (hits.length === 0) return false;
    }

    if (filters.q) {
      var q = filters.q.toLowerCase();
      var hay = [item.name, item.notes, item.neighborhood]
        .concat(item.tags || [])
        .concat((item.layers || []).map(function (l) { return l.label + ' ' + l.notes + ' ' + (l.tags || []).join(' '); }))
        .join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function sortItems(list) {
    var l = list.slice();
    switch (filters.sort) {
      case 'name': l.sort(function (a, b) { return a.name.localeCompare(b.name); }); break;
      case 'recent': l.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }); break;
      case 'lastPostedDesc':
        l.sort(function (a, b) {
          var av = a.lastPosted ? CJ.parseDate(a.lastPosted).getTime() : -Infinity;
          var bv = b.lastPosted ? CJ.parseDate(b.lastPosted).getTime() : -Infinity;
          return bv - av;
        }); break;
      case 'mostUsed':
        l.sort(function (a, b) {
          if ((b.postCount || 0) !== (a.postCount || 0)) return (b.postCount || 0) - (a.postCount || 0);
          return a.name.localeCompare(b.name);
        }); break;
      case 'leastUsed':
        l.sort(function (a, b) {
          if ((a.postCount || 0) !== (b.postCount || 0)) return (a.postCount || 0) - (b.postCount || 0);
          return a.name.localeCompare(b.name);
        }); break;
      case 'deadline':
        l.sort(function (a, b) {
          var av = a.deadline ? CJ.parseDate(a.deadline).getTime() : Infinity;
          var bv = b.deadline ? CJ.parseDate(b.deadline).getTime() : Infinity;
          return av - bv;
        }); break;
      case 'type':
        l.sort(function (a, b) {
          if (a.type !== b.type) return a.type.localeCompare(b.type);
          return a.name.localeCompare(b.name);
        }); break;
      default: // 'stale' — never used first, then longest since last use
        l.sort(function (a, b) {
          var av = a.lastPosted ? CJ.parseDate(a.lastPosted).getTime() : -Infinity;
          var bv = b.lastPosted ? CJ.parseDate(b.lastPosted).getTime() : -Infinity;
          if (av !== bv) return av - bv;
          if ((a.postCount || 0) !== (b.postCount || 0)) return (a.postCount || 0) - (b.postCount || 0);
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
    }
    return l;
  }

  function groupItems(list) {
    if (filters.group === 'none') return [{ key: '', label: null, items: list }];

    var buckets = {};
    var order = [];

    function push(key, label, item) {
      if (!buckets[key]) { buckets[key] = { key: key, label: label, items: [] }; order.push(key); }
      buckets[key].items.push(item);
    }

    list.forEach(function (item) {
      if (filters.group === 'type') push(item.type, typeInfo(item.type).emoji + ' ' + typeInfo(item.type).plural, item);
      else if (filters.group === 'neighborhood') push(item.neighborhood || '~none', item.neighborhood || 'No neighborhood set', item);
      else if (filters.group === 'reuse') {
        var r = CJ.reuseInfo(CJ.reuseState(item));
        push(r.id, r.emoji + ' ' + r.label, item);
      } else if (filters.group === 'tag') {
        if (!item.tags || !item.tags.length) push('~none', 'Untagged', item);
        else item.tags.forEach(function (t) { push('t:' + t, t, item); });
      }
    });

    var groups = order.map(function (k) { return buckets[k]; });
    var reuseOrder = ['unused', 'ready', 'recent'];
    groups.sort(function (a, b) {
      if (a.key === '~none') return 1;
      if (b.key === '~none') return -1;
      if (filters.group === 'reuse') return reuseOrder.indexOf(a.key) - reuseOrder.indexOf(b.key);
      if (filters.group === 'tag' || filters.group === 'neighborhood') return b.items.length - a.items.length;
      return 0;
    });
    return groups;
  }

  function daysAgoLabel(iso) {
    if (!iso) return null;
    var d = CJ.daysSince(iso);
    if (d < 0) return 'scheduled ' + CJ.formatDate(iso, { month: 'short', day: 'numeric' });
    if (d === 0) return 'last used today';
    if (d === 1) return 'last used yesterday';
    if (d < 60) return 'last used ' + d + ' days ago';
    if (d < 365) return 'last used ' + Math.round(d / 30) + ' months ago';
    return 'last used ' + (d / 365).toFixed(1) + ' years ago';
  }

  function itemCard(item) {
    var t = typeInfo(item.type);
    var reuse = CJ.reuseInfo(CJ.reuseState(item));

    var classes = ['item-card'];
    if (item.deadline) {
      classes.push('has-deadline');
      if (item.priority === 'high') classes.push('deadline-high');
      if (CJ.parseDate(item.deadline) < new Date()) classes.push('overdue');
    }

    var meta = [];
    meta.push(el('span', {
      class: 'pill ' + (reuse.id === 'unused' ? 'pill-good' : reuse.id === 'ready' ? 'pill-good' : 'pill-quiet'),
      text: reuse.emoji + ' ' + reuse.label,
      title: reuse.hint
    }));
    if (item.neighborhood) meta.push(el('span', { text: '📍 ' + item.neighborhood }));

    var used = item.postCount || 0;
    if (used > 0) {
      meta.push(el('span', { text: '·' }));
      meta.push(el('span', { text: 'used ' + used + '×' }));
      var ago = daysAgoLabel(item.lastPosted);
      if (ago) { meta.push(el('span', { text: '·' })); meta.push(el('span', { text: ago })); }
    }

    var deadlinePill = null;
    if (item.deadline) {
      var left = CJ.daysBetween(new Date(), CJ.parseDate(item.deadline));
      var label = left < 0 ? 'overdue by ' + Math.abs(left) + 'd'
                : left === 0 ? 'due today'
                : 'post by ' + CJ.formatDate(item.deadline, { month: 'short', day: 'numeric' }) + ' · ' + left + 'd';
      deadlinePill = el('span', {
        class: 'pill ' + (left < 3 ? 'pill-danger' : 'pill-warn'),
        text: '⏰ ' + label,
        title: item.deadlineNote || ''
      });
    }

    return el('div', { class: classes.join(' ') }, [
      el('div', { class: 'item-top' }, [
        el('span', { class: 'item-emoji', text: t.emoji }),
        el('div', { class: 'item-name' }, [
          el('button', { type: 'button', text: item.name, onclick: function () { openForm(item.id); } })
        ]),
        deadlinePill
      ]),
      el('div', { class: 'item-meta' }, meta),
      (item.tags && item.tags.length)
        ? el('div', { class: 'tag-row' }, item.tags.map(function (tg) {
            return tagEl(tg, { active: filters.tags.indexOf(tg) !== -1 });
          }))
        : null,
      item.notes ? el('div', { class: 'item-notes', text: item.notes }) : null,
      fitRow(item),
      layerStrip(item),
      el('div', { class: 'item-actions' }, [
        el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', text: '＋ Add footage',
          title: 'Log new material for this place without touching what\'s already here',
          onclick: function () { CJ.layersUI.open(item.id); }
        }),
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Edit', onclick: function () { openForm(item.id); } }),
        item.link ? el('a', { class: 'btn btn-ghost btn-sm', href: item.link, target: '_blank', rel: 'noopener', text: '↗ Link' }) : null
      ])
    ]);
  }

  /** Only shown when you've overridden the usual lanes for this place. */
  function fitRow(item) {
    var bits = [];
    CJ.PLATFORMS.forEach(function (p) {
      var f = CJ.fitFor(item, p.id);
      if (f === 'auto') return;
      bits.push(el('span', {
        class: 'pill ' + (f === 'no' ? 'pill-quiet' : 'pill-' + p.id),
        text: (f === 'no' ? '✕ not ' : '✓ ') + p.label
      }));
    });
    return bits.length ? el('div', { class: 'tag-row' }, bits) : null;
  }

  /** The stack of footage under a place — each one clickable to edit. */
  function layerStrip(item) {
    var layers = item.layers || [];
    if (!layers.length) return null;
    var rows = layers.slice().sort(function (a, b) {
      return (b.capturedAt || b.createdAt || '').localeCompare(a.capturedAt || a.createdAt || '');
    }).map(function (l) {
      var bits = [];
      if (!l.postCount) bits.push(el('span', { class: 'pill pill-good', text: '✨ unused' }));
      else bits.push(el('span', { class: 'pill pill-quiet', text: 'used ' + l.postCount + '×' }));
      if (l.deadline) {
        var left = CJ.daysBetween(new Date(), CJ.parseDate(l.deadline));
        bits.push(el('span', {
          class: 'pill ' + (left < 3 ? 'pill-danger' : 'pill-warn'),
          text: '⏰ ' + (left < 0 ? 'overdue' : 'by ' + CJ.formatDate(l.deadline, { month: 'short', day: 'numeric' })),
          title: l.deadlineNote || ''
        }));
      }
      return el('button', {
        class: 'layer-row' + (l.postCount ? '' : ' is-unused'), type: 'button',
        title: (l.notes || 'Edit this footage'),
        onclick: function (e) { e.stopPropagation(); CJ.layersUI.open(item.id, l.id); }
      }, [
        el('span', { class: 'layer-label', text: l.label }),
        l.capturedAt ? el('span', { class: 'layer-date', text: CJ.formatDate(l.capturedAt, { month: 'short', year: '2-digit' }) }) : null,
        el('span', { class: 'push' })
      ].concat(bits));
    });
    return el('div', { class: 'layer-strip' }, rows);
  }

  /* ---------- render ---------- */

  function renderFilterChips() {
    var typeBox = $('#type-filters');
    typeBox.innerHTML = '';
    CJ.TYPES.forEach(function (t) {
      var n = CJ.getItems().filter(function (i) { return i.type === t.id; }).length;
      typeBox.appendChild(el('button', {
        class: 'chip' + (filters.types.indexOf(t.id) !== -1 ? ' is-on' : ''), type: 'button',
        onclick: function () { toggle(filters.types, t.id); render(); }
      }, [t.emoji + ' ' + t.label, el('span', { class: 'chip-count', text: String(n) })]));
    });

    var reuseBox = $('#reuse-filters');
    reuseBox.innerHTML = '';
    CJ.REUSE.forEach(function (r) {
      var n = CJ.getItems().filter(function (i) {
        return r.id === 'due' ? !!i.deadline : CJ.reuseState(i) === r.id;
      }).length;
      reuseBox.appendChild(el('button', {
        class: 'chip' + (filters.reuse.indexOf(r.id) !== -1 ? ' is-on' : ''), type: 'button',
        title: r.hint,
        onclick: function () { toggle(filters.reuse, r.id); render(); }
      }, [r.emoji + ' ' + r.label, el('span', { class: 'chip-count', text: String(n) })]));
    });

    var tagBox = $('#tag-filters');
    tagBox.innerHTML = '';
    var tags = CJ.allTags(true);
    if (!tags.length) {
      tagBox.appendChild(el('span', { class: 'muted-xs', text: 'Tags you add will show up here — click any of them to group your content.' }));
    } else {
      // Group tags by category so neighborhoods sit together, vibes together, etc.
      var byCat = {};
      tags.forEach(function (t) { (byCat[t.category] = byCat[t.category] || []).push(t); });
      var ordered = [];
      CJ.TAG_CATEGORIES.forEach(function (cat) {
        (byCat[cat.id] || []).forEach(function (t) { ordered.push(t); });
      });

      // Long tag lists swallow the page. Collapsed shows the most-used tags;
      // expanded shows everything, grouped by category. Selected tags always show.
      var LIMIT = 26;
      var collapsed = !tagsExpanded && ordered.length > LIMIT;
      var shownTags = collapsed
        ? tags.filter(function (t, i) { return i < LIMIT || filters.tags.indexOf(t.tag) !== -1; })
        : ordered;

      shownTags.forEach(function (t) {
        tagBox.appendChild(tagEl(t.tag, {
          count: t.count,
          active: filters.tags.indexOf(t.tag) !== -1,
          onclick: function (tag) { toggleTagFilter(tag); }
        }));
      });

      if (ordered.length > LIMIT) {
        tagBox.appendChild(el('button', {
          class: 'chip', type: 'button',
          text: collapsed ? '+ ' + (ordered.length - shownTags.length) + ' more tags' : '− show fewer',
          onclick: function () { tagsExpanded = !tagsExpanded; render(); }
        }));
      }
    }
    $('#tag-mode-hint').textContent = filters.tags.length
      ? '· ' + filters.tags.length + ' selected (' + filters.tagMode + ')' : '';
  }

  function toggle(arr, v) {
    var i = arr.indexOf(v);
    if (i === -1) arr.push(v); else arr.splice(i, 1);
  }

  function toggleTagFilter(tag, switchView) {
    toggle(filters.tags, tag);
    if (switchView) CJ.app.showView('library');
    render();
  }

  function clearFilters() {
    filters.q = ''; filters.types = []; filters.reuse = []; filters.tags = [];
    $('#search').value = '';
    render();
  }

  function render() {
    if (!CJ.state) return;
    renderFilterChips();

    var all = CJ.getItems();
    var shown = all.filter(matchesFilters);
    var body = $('#library-body');
    body.innerHTML = '';

    var countLabel = all.length === 0
      ? 'Nothing saved yet'
      : shown.length + ' of ' + all.length + ' item' + (all.length === 1 ? '' : 's') +
        (filters.tags.length ? ' · filtered by ' + filters.tags.join(filters.tagMode === 'all' ? ' + ' : ' / ') : '');
    $('#library-count').textContent = countLabel;

    if (!all.length) {
      body.appendChild(el('div', { class: 'empty' }, [
        el('h3', { text: 'Start your archive' }),
        el('p', { text: 'Add everything you\'ve already shot — restaurants, experiences, at-home content. Tag each one with its neighborhood and vibe, and the calendar starts finding new ways to run footage you already have.' }),
        el('div', { class: 'empty-actions' }, [
          el('button', { class: 'btn btn-primary', type: 'button', text: '+ Add your first place', onclick: function () { openForm(); } }),
          // Filling an archive one form at a time is the slow way in. Anyone
          // starting from an existing list wants this button, not that one.
          el('button', { class: 'btn', type: 'button', text: '⚡ Paste a whole list', onclick: function () { CJ.importUI.open(); } })
        ]),
        el('p', { class: 'muted-xs', style: { marginTop: '14px' } }, ['Want to see how it works first? ']),
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Load sample data', onclick: function () { CJ.settingsUI.seed(); } })
      ]));
      return;
    }

    if (!shown.length) {
      body.appendChild(el('div', { class: 'empty' }, [
        el('h3', { text: 'Nothing matches' }),
        el('p', { text: 'Try loosening the filters — or switch tag matching from "All" to "Any".' }),
        el('button', { class: 'btn', type: 'button', text: 'Clear filters', onclick: clearFilters })
      ]));
      return;
    }

    groupItems(sortItems(shown)).forEach(function (g) {
      var block = el('div', { class: 'group-block' });
      if (g.label) {
        block.appendChild(el('div', { class: 'group-head' }, [
          el('h3', { text: g.label }),
          el('span', { class: 'count', text: g.items.length + ' item' + (g.items.length === 1 ? '' : 's') })
        ]));
      }
      block.appendChild(el('div', { class: 'card-grid' }, g.items.map(itemCard)));
      body.appendChild(block);
    });
  }

  /* ================= add / edit form ================= */

  var formTags = [];

  function renderFormTags() {
    var wrap = $('#f-tag-chips');
    wrap.innerHTML = '';
    formTags.forEach(function (t, i) {
      wrap.appendChild(el('span', {
        class: 'tag-chip', 'data-cat': CJ.tagCategory(t)
      }, [
        t,
        el('button', {
          type: 'button', text: '✕', title: 'Remove',
          onclick: function () { formTags.splice(i, 1); renderFormTags(); }
        })
      ]));
    });
  }

  function renderTagSuggestions(query) {
    var box = $('#tag-suggest');
    box.innerHTML = '';
    var pool = CJ.allTags().filter(function (t) { return formTags.indexOf(t.tag) === -1; });
    if (query) {
      var q = query.toLowerCase();
      pool = pool.filter(function (t) { return t.tag.toLowerCase().indexOf(q) !== -1; });
    }
    pool.slice(0, 12).forEach(function (t) {
      box.appendChild(tagEl(t.tag, {
        count: t.count,
        onclick: function (tag) { addFormTag(tag); }
      }));
    });
  }

  function addFormTag(raw) {
    var t = String(raw).trim().replace(/,$/, '');
    if (!t) return;
    // Snap to however this tag is already spelled in the library, so "Group
    // friendly" and "group friendly" never become two separate tags.
    t = CJ.canonicalTag(t);
    if (!t) return;
    if (formTags.some(function (x) { return CJ.tagKey(x) === CJ.tagKey(t); })) return;
    formTags.push(t);
    renderFormTags();
    renderTagSuggestions('');
  }

  var FIT_CYCLE = { auto: 'yes', yes: 'no', no: 'auto' };
  var FIT_LABEL = { auto: 'auto', yes: '✓ always', no: '✕ never' };
  var formFit = { tiktok: 'auto', instagram: 'auto', pinterest: 'auto' };

  function renderFormFit() {
    var box = $('#f-fit');
    if (!box) return;
    box.innerHTML = '';
    CJ.PLATFORMS.forEach(function (p) {
      var state = formFit[p.id] || 'auto';
      var chip = el('button', {
        class: 'chip fit-chip fit-' + state + ' plat-' + p.id, type: 'button',
        title: state === 'auto'
          ? 'Following your usual lanes for this content type'
          : (state === 'yes' ? 'Always considered for ' + p.label : 'Never posted to ' + p.label),
        onclick: function () {
          formFit[p.id] = FIT_CYCLE[formFit[p.id] || 'auto'];
          renderFormFit();
        }
      }, [p.emoji + ' ' + p.label, el('span', { class: 'chip-count', text: FIT_LABEL[state] })]);
      box.appendChild(chip);
    });
  }

  function renderFormLayers(item) {
    var list = $('#layers-list');
    var count = $('#layers-count');
    var addBtn = $('#btn-add-layer');
    if (!list) return;
    list.innerHTML = '';

    if (!item) {
      count.textContent = '';
      list.appendChild(el('p', { class: 'muted-xs', text: 'Save the place first, then you can log the footage you have of it — and keep adding more over time.' }));
      addBtn.disabled = true;
      return;
    }

    addBtn.disabled = false;
    var layers = item.layers || [];
    var unused = CJ.unusedLayers(item).length;
    count.textContent = '· ' + layers.length + ' clip' + (layers.length === 1 ? '' : 's') +
                        (unused ? ', ' + unused + ' unused' : '');
    list.appendChild(layerStrip(item) || el('span'));
  }

  function openForm(id) {
    var item = id ? CJ.getItem(id) : null;
    $('#modal-title').textContent = item ? 'Edit content' : 'Add content';
    $('#f-id').value = item ? item.id : '';
    $('#f-name').value = item ? item.name : '';
    $('#f-type').value = item ? item.type : 'restaurant';
    $('#f-neighborhood').value = item ? item.neighborhood : '';
    $('#f-notes').value = item ? item.notes : '';
    $('#f-link').value = item ? item.link : '';
    $('#btn-delete').hidden = !item;
    formFit = item ? Object.assign({}, item.platformFit) : { tiktok: 'auto', instagram: 'auto', pinterest: 'auto' };
    renderFormFit();
    renderFormLayers(item);

    formTags = item ? (item.tags || []).slice() : [];
    renderFormTags();
    renderTagSuggestions('');
    $('#f-tag-entry').value = '';

    // Neighborhood autocomplete from what you've used plus the Atlanta list.
    var dl = $('#neighborhood-list');
    dl.innerHTML = '';
    var used = CJ.allNeighborhoods();
    var seen = {};
    used.forEach(function (n) { seen[n.toLowerCase()] = true; dl.appendChild(el('option', { value: n })); });
    CJ.ATL_NEIGHBORHOODS.forEach(function (n) {
      if (seen[n]) return;
      dl.appendChild(el('option', { value: n.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) }));
    });

    $('#modal').hidden = false;
    setTimeout(function () { $('#f-name').focus(); }, 40);
  }

  function closeForm() { $('#modal').hidden = true; }

  function saveForm(e) {
    e.preventDefault();
    var name = $('#f-name').value.trim();
    if (!name) { toast('Give it a name first.', 'error'); return; }

    // Sweep up anything half-typed in the tag box.
    var pending = $('#f-tag-entry').value.trim();
    if (pending) { addFormTag(pending); $('#f-tag-entry').value = ''; }

    var isNew = !$('#f-id').value;

    var saved = CJ.upsertItem({
      id: $('#f-id').value || undefined,
      name: name,
      type: $('#f-type').value,
      neighborhood: $('#f-neighborhood').value.trim(),
      tags: formTags.slice(),
      platformFit: Object.assign({}, formFit),
      notes: $('#f-notes').value.trim(),
      link: $('#f-link').value.trim()
    });

    closeForm();
    if (isNew && saved) {
      // A brand-new place starts with one empty layer — name the footage now
      // while it's fresh, and flag it if it has to go up by a date.
      CJ.layersUI.open(saved.id, saved.layers[0].id, { firstRun: true });
    }
    toast(isNew ? 'Added "' + name + '". Hit Refresh on the calendar to work it in.' : 'Saved.');
    if (isNew) CJ.calendarUI.markStale();
  }

  function deleteCurrent() {
    var id = $('#f-id').value;
    if (!id) return;
    var item = CJ.getItem(id);
    if (!confirmDanger('Delete "' + (item ? item.name : 'this') + '" from your journal? This cannot be undone.')) return;
    CJ.deleteItem(id);
    closeForm();
    toast('Deleted.');
  }

  /* ---------- wiring ---------- */

  function init() {
    $('#btn-add').addEventListener('click', function () { openForm(); });
    $('#modal-close').addEventListener('click', closeForm);
    $('#btn-cancel').addEventListener('click', closeForm);
    $('#btn-delete').addEventListener('click', deleteCurrent);
    $('#content-form').addEventListener('submit', saveForm);

    $('#modal').addEventListener('mousedown', function (e) { if (e.target === $('#modal')) closeForm(); });

    // Deadlines live on layers of footage now, not on the place — see ui-layers.js.

    var entry = $('#f-tag-entry');
    entry.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addFormTag(entry.value);
        entry.value = '';
        renderTagSuggestions('');
      } else if (e.key === 'Backspace' && !entry.value && formTags.length) {
        formTags.pop(); renderFormTags();
      }
    });
    entry.addEventListener('input', function () { renderTagSuggestions(entry.value.trim()); });

    $('#search').addEventListener('input', function () { filters.q = this.value.trim(); render(); });
    $('#sort-by').addEventListener('change', function () { filters.sort = this.value; render(); });
    $('#group-by').addEventListener('change', function () { filters.group = this.value; render(); });
    $('#btn-clear-filters').addEventListener('click', clearFilters);

    $$('#tag-match button').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#tag-match button').forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active');
        filters.tagMode = b.getAttribute('data-mode');
        render();
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('#modal').hidden) closeForm();
        if (!$('#event-modal').hidden) $('#event-modal').hidden = true;
        if (!$('#idea-modal').hidden) $('#idea-modal').hidden = true;
        if (!$('#text-modal').hidden) $('#text-modal').hidden = true;
        if (!$('#reschedule-modal').hidden) $('#reschedule-modal').hidden = true;
        if (!$('#layer-modal').hidden) $('#layer-modal').hidden = true;
      }
    });
  }

  CJ.library = {
    init: init,
    render: render,
    openForm: openForm,
    toggleTagFilter: toggleTagFilter,
    filters: filters
  };

})(window.CJ);
