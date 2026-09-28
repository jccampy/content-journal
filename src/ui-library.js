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

  var tagQuery = '';
  var expanded = {};        // itemId -> row is showing its detail panel

  function viewMode() {
    return (CJ.settings().libraryView === 'cards') ? 'cards' : 'rows';
  }

  /* ---------- at-a-glance derivations (nothing stored) ---------- */

  /**
   * The first date this place could run again on a platform under the spacing
   * rule. null means it's free now. This is the number the calendar is already
   * enforcing silently — worth showing rather than leaving you to work out.
   */
  function nextFreeOn(item, platform) {
    var last = CJ.lastPostedOn(item, platform);
    if (!last) return null;
    var gap = CJ.minGapFor(item);
    if (!gap) return null;
    var d = CJ.parseDate(last);
    d.setDate(d.getDate() + gap);
    return d > new Date() ? CJ.isoDate(d) : null;
  }

  /** The soonest deadline sitting on any clip, with its note. */
  function deadlineOf(item) {
    var best = null;
    (item.layers || []).forEach(function (l) {
      if (l.deadline && (!best || l.deadline < best.deadline)) best = l;
    });
    if (!best && item.deadline) best = { deadline: item.deadline, deadlineNote: item.deadlineNote, priority: item.priority };
    return best;
  }

  /**
   * Three dots — one per platform. Lit means this place is cleared for it,
   * dimmed means it isn't, and a dot with a date under it is blocked by the
   * spacing rule until then. Makes the "TikTok but not Instagram" rule visible
   * in the library instead of buried in the edit form.
   */
  function platformDots(item) {
    return el('div', { class: 'plat-dots' }, CJ.PLATFORMS.map(function (p) {
      var allowed = CJ.itemAllowsPlatform(item, p.id);
      var fit = CJ.fitFor(item, p.id);
      var free = allowed ? nextFreeOn(item, p.id) : null;
      var title = p.label + ': ' +
        (!allowed ? (fit === 'no' ? 'switched off for this place' : 'not one of your usual lanes for ' + typeInfo(item.type).label.toLowerCase())
         : free ? 'blocked by the ' + CJ.minGapFor(item) + '-day rule until ' + CJ.formatDate(free, { month: 'short', day: 'numeric' })
         : 'free to use');
      // A letter, not the platform emoji — at 18px an emoji is a smudge and
      // all three read the same. T / I / P stay distinct.
      return el('span', {
        class: 'pdot pdot-' + p.id + (allowed ? '' : ' is-off') + (free ? ' is-waiting' : '') +
               (fit === 'yes' ? ' is-forced' : ''),
        title: title, text: p.label.charAt(0).toUpperCase()
      });
    }));
  }

  /** "8mo ago" — the row subline has no room for the long form. */
  function shortAgo(iso) {
    if (!iso) return null;
    var d = CJ.daysSince(iso);
    if (d < 0) return 'scheduled';
    if (d === 0) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 45) return d + 'd ago';
    if (d < 365) return Math.round(d / 30) + 'mo ago';
    return (d / 365).toFixed(1).replace(/\.0$/, '') + 'y ago';
  }

  /** The soonest date this place is free again on any lane it's cleared for. */
  function nextFreeAny(item) {
    var best = null, blocked = 0, allowed = 0;
    CJ.PLATFORMS.forEach(function (p) {
      if (!CJ.itemAllowsPlatform(item, p.id)) return;
      allowed++;
      var f = nextFreeOn(item, p.id);
      if (!f) { best = 'now'; return; }
      blocked++;
      if (best !== 'now' && (!best || f < best)) best = f;
    });
    if (!allowed || best === 'now' || !blocked) return null;
    return best;
  }

  function statusCell(item) {
    var reuse = CJ.reuseInfo(CJ.reuseState(item));
    var dl = deadlineOf(item);
    var bits = [el('span', {
      class: 'pill ' + (reuse.id === 'recent' ? 'pill-quiet' : 'pill-good'),
      text: reuse.emoji + ' ' + reuse.label, title: reuse.hint
    })];

    if (dl) {
      var left = CJ.daysBetween(new Date(), CJ.parseDate(dl.deadline));
      bits.push(el('span', {
        class: 'pill ' + (left < 3 ? 'pill-danger' : 'pill-warn'),
        text: '⏰ ' + (left < 0 ? 'overdue ' + Math.abs(left) + 'd'
                     : left === 0 ? 'due today'
                     : CJ.formatDate(dl.deadline, { month: 'short', day: 'numeric' })),
        title: dl.deadlineNote || 'Needs to go up by this date'
      }));
    }

    var used = item.postCount || 0;
    var parts = [];
    if (used) {
      var ago = shortAgo(item.lastPosted);
      parts.push(ago ? ago + ' · ' + used + '×' : 'used ' + used + '×');
    }
    // The spacing rule is a hard floor the calendar enforces silently. Say when
    // it lifts, so a place that looks available but isn't stops being a mystery.
    var free = nextFreeAny(item);
    if (free) parts.push('free ' + CJ.formatDate(free, { month: 'short', day: 'numeric' }));

    return el('div', { class: 'row-status' }, [
      el('div', { class: 'row-pills' }, bits),
      parts.length ? el('span', { class: 'row-sub', text: parts.join(' · ') }) : null
    ]);
  }

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

  /** Up to `max` tag pills, then a quiet "+N". */
  function tagCell(item, max) {
    var tags = item.tags || [];
    if (!tags.length) return el('div', { class: 'row-tags' }, [el('span', { class: 'muted-xs', text: 'no tags yet' })]);
    var shown = tags.slice(0, max);
    var kids = shown.map(function (tg) {
      return tagEl(tg, { active: filters.tags.indexOf(tg) !== -1, onclick: function (t) { toggleTagFilter(t); } });
    });
    if (tags.length > max) {
      kids.push(el('button', {
        class: 'tag tag-more', type: 'button', text: '+' + (tags.length - max),
        title: tags.slice(max).join(', '),
        onclick: function (e) { e.stopPropagation(); openForm(item.id); }
      }));
    }
    return el('div', { class: 'row-tags' }, kids);
  }

  function rowActions(item) {
    return el('div', { class: 'row-actions' }, [
      el('button', {
        class: 'iconbtn', type: 'button', text: '＋', title: 'Add footage for this place',
        onclick: function (e) { e.stopPropagation(); CJ.layersUI.open(item.id); }
      }),
      el('button', {
        class: 'iconbtn', type: 'button', text: '✎', title: 'Edit',
        onclick: function (e) { e.stopPropagation(); openForm(item.id); }
      }),
      el('button', {
        class: 'iconbtn', type: 'button', text: '📖', title: 'Journal: every clip and post for this place',
        onclick: function (e) { e.stopPropagation(); CJ.journalUI.open(item.id); }
      }),
      item.link ? el('a', {
        class: 'iconbtn', href: item.link, target: '_blank', rel: 'noopener', text: '↗', title: item.link,
        onclick: function (e) { e.stopPropagation(); }
      }) : null
    ]);
  }

  /** The compact row. Six aligned columns, ~44px tall. */
  function itemRow(item) {
    var t = typeInfo(item.type);
    var dl = deadlineOf(item);
    var clips = (item.layers || []).length;
    var isOpen = !!expanded[item.id];

    var cls = ['lib-row'];
    if (dl) cls.push(CJ.parseDate(dl.deadline) < new Date() ? 'overdue' : 'has-deadline');
    if (isOpen) cls.push('is-open');

    var row = el('div', { class: cls.join(' ') }, [
      el('span', { class: 'row-emoji', title: t.label, text: t.emoji }),

      el('div', { class: 'row-name' }, [
        el('button', { class: 'row-title', type: 'button', text: item.name, onclick: function () { openForm(item.id); } }),
        item.neighborhood
          ? el('button', {
              class: 'row-hood', type: 'button', text: item.neighborhood,
              title: 'Filter to ' + item.neighborhood,
              onclick: function (e) { e.stopPropagation(); toggleTagFilter(item.neighborhood); }
            })
          : el('span', { class: 'row-hood is-empty', text: '—' })
      ]),

      tagCell(item, 4),
      statusCell(item),
      platformDots(item),

      el('button', {
        class: 'row-clips' + (isOpen ? ' is-on' : ''), type: 'button',
        title: clips + ' clip' + (clips === 1 ? '' : 's') + ' on file — click for detail',
        text: '🎬 ' + clips,
        onclick: function (e) {
          e.stopPropagation();
          if (expanded[item.id]) delete expanded[item.id]; else expanded[item.id] = true;
          render();
        }
      }),

      rowActions(item)
    ]);

    if (!isOpen) return row;

    return el('div', { class: 'lib-row-wrap' }, [
      row,
      el('div', { class: 'row-detail' }, [
        item.notes ? el('p', { class: 'row-detail-notes', text: item.notes }) : null,
        fitRow(item),
        layerStrip(item),
        el('div', { class: 'item-actions' }, [
          el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '＋ Add footage',
            onclick: function () { CJ.layersUI.open(item.id); }
          }),
          el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Edit place', onclick: function () { openForm(item.id); } }),
          el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '📖 Journal',
            onclick: function () { CJ.journalUI.open(item.id); }
          })
        ])
      ])
    ]);
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

    // The footage strip used to appear on every card saying the same thing.
    // It only earns its space when there's more than one clip, or a clip has a
    // date on it — otherwise the reuse pill above already told you.
    var layers = item.layers || [];
    var stripWorthIt = layers.length > 1 || layers.some(function (l) { return l.deadline; });

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
            return tagEl(tg, { active: filters.tags.indexOf(tg) !== -1, onclick: function (t) { toggleTagFilter(t); } });
          }))
        : null,
      item.notes ? el('div', { class: 'item-notes', text: item.notes }) : null,
      fitRow(item),
      stripWorthIt ? layerStrip(item) : null,
      el('div', { class: 'item-foot' }, [
        platformDots(item),
        el('span', { class: 'clip-count', text: '🎬 ' + layers.length + ' clip' + (layers.length === 1 ? '' : 's') }),
        el('span', { class: 'push' }),
        rowActions(item)
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

    // Every tag, grouped by category, inside the popover. No truncation — the
    // panel scrolls and has its own search box, so length stops being a problem.
    var tagBox = $('#tag-filters');
    tagBox.innerHTML = '';
    var tags = CJ.allTags(true);
    if (!tags.length) {
      tagBox.appendChild(el('span', { class: 'muted-xs', text: 'Tags you add will show up here.' }));
    } else {
      var byCat = {};
      tags.forEach(function (t) { (byCat[t.category] = byCat[t.category] || []).push(t); });
      var q = tagQuery.toLowerCase();
      var any = false;

      CJ.TAG_CATEGORIES.forEach(function (cat) {
        var list = (byCat[cat.id] || []).filter(function (t) {
          return !q || t.tag.toLowerCase().indexOf(q) !== -1;
        });
        if (!list.length) return;
        any = true;
        tagBox.appendChild(el('div', { class: 'pop-cat' }, [
          el('span', { class: 'pop-cat-label', text: cat.label }),
          el('div', { class: 'chipset' }, list.map(function (t) {
            return tagEl(t.tag, {
              count: t.count,
              active: filters.tags.indexOf(t.tag) !== -1,
              onclick: function (tag) { toggleTagFilter(tag); }
            });
          }))
        ]));
      });
      if (!any) tagBox.appendChild(el('span', { class: 'muted-xs', text: 'No tag matches "' + tagQuery + '".' }));
    }

    // Counts on the buttons themselves, so a collapsed filter is never invisible.
    setBadge('type', filters.types.length);
    setBadge('reuse', filters.reuse.length);
    setBadge('tags', filters.tags.length);

    renderActiveFilters();
  }

  function setBadge(which, n) {
    var b = $('#fpop-' + which + ' .fbtn');
    var badge = b.querySelector('.fbtn-n');
    badge.textContent = n ? String(n) : '';
    badge.hidden = !n;
    b.classList.toggle('is-on', !!n);
  }

  /** Whatever is currently narrowing the list, as removable chips. */
  function renderActiveFilters() {
    var box = $('#active-filters');
    box.innerHTML = '';
    var bits = [];

    filters.types.forEach(function (id) {
      bits.push({ label: typeInfo(id).emoji + ' ' + typeInfo(id).label, off: function () { toggle(filters.types, id); } });
    });
    filters.reuse.forEach(function (id) {
      var r = CJ.reuseInfo(id);
      bits.push({ label: r.emoji + ' ' + r.label, off: function () { toggle(filters.reuse, id); } });
    });
    filters.tags.forEach(function (t) {
      bits.push({ label: t, off: function () { toggle(filters.tags, t); } });
    });
    if (filters.q) bits.push({ label: '“' + filters.q + '”', off: function () { filters.q = ''; $('#search').value = ''; } });

    var on = bits.length > 0;
    box.hidden = !on;
    $('#btn-clear-filters').hidden = !on;
    if (!on) return;

    if (filters.tags.length > 1) {
      box.appendChild(el('span', { class: 'af-label', text: 'matching ' + filters.tagMode + ' of:' }));
    }
    bits.forEach(function (b) {
      box.appendChild(el('button', {
        class: 'af-chip', type: 'button', title: 'Remove this filter',
        onclick: function () { b.off(); render(); }
      }, [b.label, el('span', { class: 'af-x', text: '✕' })]));
    });
  }

  /* ---------- popovers ---------- */

  function closePops(except) {
    $$('.fpop').forEach(function (p) {
      if (p === except) return;
      p.querySelector('.pop-panel').hidden = true;
      p.classList.remove('is-open');
    });
  }

  function initPops() {
    $$('.fpop').forEach(function (pop) {
      var btn = pop.querySelector('.fbtn');
      var panel = pop.querySelector('.pop-panel');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var willOpen = panel.hidden;
        closePops(pop);
        panel.hidden = !willOpen;
        pop.classList.toggle('is-open', willOpen);
        if (willOpen && pop.id === 'fpop-tags') {
          setTimeout(function () { $('#tag-search').focus(); }, 30);
        }
      });
      // Clicks inside the panel must not fall through to the document handler
      // that closes it — filtering is a repeated action, not a one-shot.
      panel.addEventListener('click', function (e) { e.stopPropagation(); });
    });
    document.addEventListener('click', function () { closePops(null); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePops(null); });
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
    tagQuery = '';
    $('#search').value = '';
    if ($('#tag-search')) $('#tag-search').value = '';
    render();
  }

  function render() {
    if (!CJ.state) return;
    renderFilterChips();

    $$('#lib-view button').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-mode') === viewMode());
    });

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
      block.appendChild(viewMode() === 'cards'
        ? el('div', { class: 'card-grid' }, g.items.map(itemCard))
        : el('div', { class: 'row-list' }, g.items.map(itemRow)));
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

  /**
   * Add one or more tags. Accepts "patio, date night" in a single go, so a
   * pasted or typed list doesn't have to be broken up by hand.
   */
  function addFormTag(raw) {
    var added = false;
    String(raw == null ? '' : raw).split(/[,;]/).forEach(function (part) {
      var t = part.trim().replace(/^#/, '');
      if (!t) return;
      // Snap to however this tag is already spelled in the library, so "Group
      // friendly" and "group friendly" never become two separate tags.
      t = CJ.canonicalTag(t);
      if (!t) return;
      if (formTags.some(function (x) { return CJ.tagKey(x) === CJ.tagKey(t); })) return;
      formTags.push(t);
      added = true;
    });
    if (!added) return;
    renderFormTags();
    renderTagSuggestions('');
  }

  /** Commit whatever is sitting in the entry box. Safe to call repeatedly. */
  function commitPendingTag() {
    var entry = $('#f-tag-entry');
    if (!entry) return;
    var v = entry.value.trim();
    if (!v) return;
    addFormTag(v);
    entry.value = '';
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
    commitPendingTag();

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
      // 229 is the keyCode phone keyboards send while autocorrect is still
      // composing a word; the real key arrives later. Ignoring it here means
      // the keyup fallback below is what commits the tag on a phone.
      if (e.keyCode === 229 || e.isComposing) return;
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        commitPendingTag();
      } else if (e.key === 'Backspace' && !entry.value && formTags.length) {
        formTags.pop(); renderFormTags();
      }
    });
    // Backstop for keyboards whose keydown didn't carry a usable key.
    entry.addEventListener('keyup', function (e) {
      if (e.key === 'Enter' && entry.value.trim()) commitPendingTag();
    });
    // Tapping away should keep what you typed, not throw it out.
    entry.addEventListener('blur', function () { setTimeout(commitPendingTag, 120); });
    entry.addEventListener('input', function () { renderTagSuggestions(entry.value.trim()); });

    // A visible button, because "press Enter" is not obvious and a phone's
    // return key can't always be trusted to reach us.
    $('#f-tag-add').addEventListener('click', function () {
      commitPendingTag();
      entry.focus();
    });

    // The box used to be wrapped in a <label>, which focused the entry for
    // free. It isn't any more (that forwarding was deleting tags), so do it
    // explicitly — but only for clicks on the box itself, never on a chip.
    $('#tag-input-wrap').addEventListener('mousedown', function (e) {
      if (e.target === this) { e.preventDefault(); entry.focus(); }
    });

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

    initPops();

    $('#tag-search').addEventListener('input', function () { tagQuery = this.value.trim(); renderFilterChips(); });

    // Rows vs cards is a preference, so it lives in settings and follows you
    // to your other devices rather than being per-browser.
    $$('#lib-view button').forEach(function (b) {
      b.addEventListener('click', function () {
        CJ.updateSettings({ libraryView: b.getAttribute('data-mode') });
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
    clearFilters: clearFilters,
    nextFreeOn: nextFreeOn,
    nextFreeAny: nextFreeAny,
    filters: filters
  };

})(window.CJ);
