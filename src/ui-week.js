/* =========================================================================
   ui-week.js — "This Week": the screen you open on your phone.

   The calendar is for planning. This is for doing: what goes up today, what's
   coming in the next seven days, what slipped, and — underneath — what you
   should film next to unlock the dates you can't currently cover.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var $ = CJ.ui.$, el = CJ.ui.el, toast = CJ.ui.toast;

  function fmtLabel(f) {
    var m = CJ.generator.FORMATS[f];
    return m ? m.label : (f || 'Post');
  }
  function fmtEmoji(f) {
    var m = CJ.generator.FORMATS[f];
    return m ? m.emoji : '📄';
  }

  /* ---------- one post ---------- */

  function postRow(entry) {
    var d = entry.drop, idea = entry.idea;
    var pinfo = CJ.ui.platformInfo(d.platform);
    var items = (d.itemIds || []).map(CJ.getItem).filter(Boolean);

    var hook = (idea.hooks && idea.hooks[0]) || '';
    var caption = (idea.captions && idea.captions[0]) || '';

    return el('div', { class: 'wk-post plat-' + d.platform + ' status-' + (d.status || 'suggested') }, [
      el('div', { class: 'wk-post-head' }, [
        el('span', { class: 'pill pill-' + d.platform, text: pinfo.emoji + ' ' + pinfo.label }),
        el('span', { class: 'pill pill-quiet', text: fmtEmoji(d.format) + ' ' + fmtLabel(d.format) }),
        d.linksTo ? el('span', { class: 'pill pill-quiet', text: '↗ link to the ' + CJ.ui.platformInfo(d.linksTo).label }) : null,
        d.status === 'done' ? el('span', { class: 'pill pill-good', text: '✅ posted' }) : null,
        d.status === 'planned' ? el('span', { class: 'pill pill-good', text: '✓ planned' }) : null
      ]),

      el('div', { class: 'wk-title' }, [
        el('button', { type: 'button', text: idea.title, onclick: function () {
          CJ.app.showView('calendar'); CJ.calendarUI.openIdea(idea.id);
        } })
      ]),

      items.length ? el('div', { class: 'idea-places' }, items.map(function (it) {
        var layer = CJ.getLayer(it, (d.layerByItem || {})[it.id]);
        var showLayer = layer && (it.layers || []).length > 1;
        return el('button', {
          class: 'place-chip', type: 'button',
          onclick: function () { CJ.app.showView('library'); CJ.library.openForm(it.id); }
        }, [
          CJ.ui.typeInfo(it.type).emoji + ' ' + it.name,
          showLayer ? el('span', { class: 'place-layer', text: '· ' + layer.label }) : null
        ]);
      })) : null,

      hook ? el('div', { class: 'wk-hook', text: '💬 ' + hook }) : null,

      el('div', { class: 'wk-actions' }, [
        el('button', {
          class: 'btn btn-sm', type: 'button', text: '📋 Copy it all',
          title: 'Hook, caption and the place list, ready to paste',
          onclick: function (e) {
            var text = [
              idea.title,
              '',
              hook ? 'HOOK: ' + hook : '',
              caption ? 'CAPTION: ' + caption : '',
              '',
              items.length ? 'PLACES: ' + items.map(function (i) {
                var l = CJ.getLayer(i, (d.layerByItem || {})[i.id]);
                return i.name + (i.neighborhood ? ' (' + i.neighborhood + ')' : '') +
                       (l && (i.layers || []).length > 1 ? ' — use: ' + l.label : '');
              }).join('\n        ') : '',
              '',
              pinfo.label + ' · ' + fmtLabel(d.format) + ' · ' + CJ.formatDate(d.date)
            ].filter(function (x) { return x !== ''; }).join('\n');
            copy(text, e.currentTarget, '📋 Copy it all');
          }
        }),
        d.status !== 'done' ? el('button', {
          class: 'btn btn-sm btn-primary', type: 'button', text: '✅ Posted',
          onclick: function () {
            CJ.updateDrop(d.id, { status: 'done', pinned: true });
            (d.itemIds || []).forEach(function (iid) {
              CJ.markPosted(iid, { platform: d.platform, layerId: (d.layerByItem || {})[iid], date: CJ.todayISO() });
            });
            toast('Logged on ' + pinfo.label + '.');
            render();
          }
        }) : null,
        el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', text: '📅 Move',
          onclick: function () { CJ.app.showView('calendar'); CJ.calendarUI.openReschedule(d.id); }
        })
      ])
    ]);
  }

  function copy(text, btn, restore) {
    var done = function () { btn.textContent = 'Copied ✓'; setTimeout(function () { btn.textContent = restore; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { toast('Could not copy — select it manually.', 'error'); });
    } else {
      toast('Copying is not available in this browser.', 'error');
    }
  }

  /* ---------- the week ---------- */

  function renderSchedule(box) {
    var today = CJ.todayISO();
    var end = new Date(); end.setDate(end.getDate() + 7);
    var endISO = CJ.isoDate(end);

    var all = CJ.getDrops().filter(function (e) {
      return e.drop.status !== 'dismissed' && e.idea.status !== 'dismissed';
    });

    var overdue = all.filter(function (e) { return e.drop.date < today && e.drop.status !== 'done'; });
    var upcoming = all.filter(function (e) { return e.drop.date >= today && e.drop.date <= endISO; });

    overdue.sort(function (a, b) { return a.drop.date < b.drop.date ? -1 : 1; });
    upcoming.sort(function (a, b) { return a.drop.date < b.drop.date ? -1 : 1; });

    if (!all.length) {
      box.appendChild(el('div', { class: 'empty' }, [
        el('h3', { text: 'Nothing scheduled yet' }),
        el('p', { text: 'Build a calendar first and this becomes your daily screen — what goes up today, what is coming, what slipped.' }),
        el('button', {
          class: 'btn btn-primary', type: 'button', text: 'Go to the calendar',
          onclick: function () { CJ.app.showView('calendar'); }
        })
      ]));
      return;
    }

    if (overdue.length) {
      box.appendChild(el('div', { class: 'wk-group is-late' }, [
        el('h3', { class: 'wk-group-title', text: '⚠ Slipped — ' + overdue.length + ' post' + (overdue.length === 1 ? '' : 's') }),
        el('p', { class: 'muted-xs', text: 'These were scheduled for dates that have passed. Post them, move them, or skip them.' })
      ].concat(overdue.slice(0, 6).map(function (e) {
        return el('div', {}, [
          el('div', { class: 'wk-date-label', text: CJ.formatDate(e.drop.date, { weekday: 'short', month: 'short', day: 'numeric' }) }),
          postRow(e)
        ]);
      }))));
    }

    // Group the next seven days by day
    var byDay = {}, order = [];
    upcoming.forEach(function (e) {
      if (!byDay[e.drop.date]) { byDay[e.drop.date] = []; order.push(e.drop.date); }
      byDay[e.drop.date].push(e);
    });
    order.sort();

    if (!order.length) {
      box.appendChild(el('div', { class: 'wk-group' }, [
        el('h3', { class: 'wk-group-title', text: 'Nothing due in the next seven days' }),
        el('p', { class: 'muted-xs', text: 'Quiet week. Good time to shoot something from the list below.' })
      ]));
    }

    order.forEach(function (date) {
      var d = CJ.parseDate(date);
      var isToday = date === CJ.todayISO();
      var label = isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      box.appendChild(el('div', { class: 'wk-group' + (isToday ? ' is-today' : '') }, [
        el('h3', { class: 'wk-group-title', text: label + (isToday ? ' · ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '') })
      ].concat(byDay[date].map(postRow))));
    });
  }

  /* ---------- what to shoot next ---------- */

  function renderGaps(box) {
    var g = CJ.gaps.report(6);

    var anything = g.uncovered.length || g.starved.length || g.issues.length || g.thinHoods.length;
    if (!anything) {
      box.appendChild(el('div', { class: 'notice', text: '✓ Nothing obvious missing — your library covers everything on the calendar for the next six months.' }));
      return;
    }

    // The most useful single number: angles wanted by several upcoming dates.
    if (g.demand.length) {
      box.appendChild(el('div', { class: 'gap-block' }, [
        el('h4', { class: 'sub-title', text: 'Shoot these and several dates unlock at once' })
      ].concat(g.demand.slice(0, 5).map(function (d) {
        return el('div', { class: 'gap-row' }, [
          el('strong', { text: d.angle }),
          el('span', { class: 'muted-xs', text: 'wanted by ' + d.dates.length + ' upcoming dates — ' + d.dates.slice(0, 3).join(', ') + (d.dates.length > 3 ? '…' : '') })
        ]);
      }))));
    }

    if (g.uncovered.length) {
      box.appendChild(el('div', { class: 'gap-block' }, [
        el('h4', { class: 'sub-title', text: g.uncovered.length + ' Atlanta dates you cannot cover yet' }),
        el('p', { class: 'muted-xs', text: 'Each needs at least ' + g.uncovered[0].need + ' matching places before it gets scheduled. Nothing is invented to fill them.' })
      ].concat(g.uncovered.slice(0, 8).map(function (u) {
        return el('div', { class: 'gap-row' }, [
          el('span', { class: 'gap-date', text: (u.approx ? '~' : '') + CJ.formatDate(u.date, { month: 'short', day: 'numeric' }) }),
          el('strong', { text: u.name }),
          el('span', { class: 'muted-xs', text: (u.have ? u.have + ' of ' + u.need + ' — needs ' : 'needs ') + (u.angles.join(', ') || 'matching content') })
        ]);
      })).concat(g.uncovered.length > 8 ? [el('p', { class: 'muted-xs', text: '…and ' + (g.uncovered.length - 8) + ' more. The full list with match counts is under My Events.' })] : [])));
    }

    if (g.starved.length) {
      box.appendChild(el('div', { class: 'gap-block' }, [
        el('h4', { class: 'sub-title', text: 'Post types you are one or two places away from' })
      ].concat(g.starved.slice(0, 6).map(function (t) {
        return el('div', { class: 'gap-row' }, [
          el('strong', { text: t.title }),
          el('span', { class: 'muted-xs', text: t.have + ' of ' + t.need + ' — tag more with ' + (t.wants.join(', ') || 'the right tags') })
        ]);
      }))));
    }

    if (g.thinHoods.length) {
      box.appendChild(el('div', { class: 'gap-block' }, [
        el('h4', { class: 'sub-title', text: 'Neighborhoods too thin for a guide' }),
        el('p', { class: 'muted-xs', text: 'Three places in one neighborhood unlocks a walkable guide, which is one of the strongest formats you have.' }),
        el('div', { class: 'tag-row' }, g.thinHoods.slice(0, 10).map(function (h) {
          return el('span', { class: 'pill pill-quiet', text: h.neighborhood + ' · ' + h.have + '/3' });
        }))
      ]));
    }

    g.issues.forEach(function (iss) {
      box.appendChild(el('div', { class: 'gap-block' }, [
        el('h4', { class: 'sub-title', text: iss.headline }),
        el('p', { class: 'muted-xs', text: iss.detail }),
        el('div', { class: 'tag-row' }, iss.items.map(function (it) {
          return el('button', {
            class: 'place-chip', type: 'button', text: it.name,
            onclick: function () { CJ.app.showView('library'); CJ.library.openForm(it.id); }
          });
        }))
      ]));
    });
  }

  /* ---------- render ---------- */

  function render() {
    if (!CJ.state) return;
    var sched = $('#week-schedule');
    var gaps = $('#week-gaps');
    if (!sched || !gaps) return;

    sched.innerHTML = '';
    gaps.innerHTML = '';

    var today = new Date();
    $('#week-sub').textContent = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    renderSchedule(sched);
    renderGaps(gaps);
  }

  function init() { /* nothing to wire — it's read-only plus row actions */ }

  CJ.weekUI = { init: init, render: render };

})(window.CJ);
