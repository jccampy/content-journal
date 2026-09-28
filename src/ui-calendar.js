/* =========================================================================
   ui-calendar.js — the generated content calendar.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var $ = CJ.ui.$, $$ = CJ.ui.$$, el = CJ.ui.el, toast = CJ.ui.toast;

  var view = {
    mode: 'list',
    platforms: ['tiktok', 'instagram', 'pinterest'],
    formats: [],          // empty = all
    status: 'active',
    months: 6
  };
  var stale = false;

  /* ---------- refresh nudge ---------- */

  function markStale() {
    stale = true;
    showNote('You\'ve changed your library since the last refresh. Hit <strong>↻ Refresh calendar</strong> to work the new content in.', 'info');
  }

  function showNote(html, kind) {
    var n = $('#gen-note');
    n.innerHTML = html;
    n.className = 'notice' + (kind === 'error' ? ' is-error' : '');
    n.hidden = false;
  }
  function hideNote() { $('#gen-note').hidden = true; }

  /* ---------- refresh ---------- */

  function refresh(silent) {
    if (!CJ.getItems().length) {
      showNote('Add a few places to your library first — the calendar is built entirely out of content you already have.', 'error');
      render();
      return;
    }
    var btn = $('#btn-refresh');
    btn.disabled = true;
    btn.textContent = '↻ Working…';

    setTimeout(function () {
      var res;
      try {
        res = CJ.generator.refresh({ months: view.months });
      } catch (err) {
        console.error(err);
        showNote('Something went wrong generating the calendar: ' + CJ.ui.esc(err.message), 'error');
        btn.disabled = false; btn.textContent = '↻ Refresh';
        return;
      }
      stale = false;
      btn.disabled = false;
      btn.textContent = '↻ Refresh';

      var st = res.stats;
      var bits = [];
      if (st.deadline) bits.push('<strong>' + st.deadline + '</strong> deadline post' + (st.deadline === 1 ? '' : 's') + ' placed first');
      if (st.occasion) bits.push('<strong>' + st.occasion + '</strong> built around real Atlanta dates');
      if (st.theme) bits.push('<strong>' + st.theme + '</strong> from your tags');

      var msg = 'Calendar rebuilt: ' + (bits.join(' · ') || 'nothing new to add yet') + '.';

      // Say plainly what a refresh did NOT touch. The whole anxiety about
      // pressing this button is "will it undo my decisions" — answer it.
      if (st.locked) {
        msg += ' <br><strong>' + st.locked + '</strong> post' + (st.locked === 1 ? '' : 's') +
               ' you\'d planned, posted or moved stayed exactly where ' +
               (st.locked === 1 ? 'it was' : 'they were') + '.';
      }
      if (st.dismissed) {
        msg += ' <strong>' + st.dismissed + '</strong> you dismissed ' +
               (st.dismissed === 1 ? 'was' : 'were') + ' not brought back — those slots were ' +
               'refilled with different ideas.';
      }
      if (st.escapes) {
        msg += ' <br>' + st.escapes + ' event' + (st.escapes === 1 ? '' : 's') +
               ' ran as an <em>avoid-the-crowds</em> angle because you have no content ' +
               'in the area they happen in.';
      }
      if (st.areaSkipped && st.areaSkipped.length) {
        var names = st.areaSkipped.slice(0, 3).map(function (a) {
          return CJ.ui.esc(a.name) + ' (' + CJ.ui.esc(a.area.join('/')) + ')';
        });
        msg += ' <br><strong>Skipped on geography:</strong> ' + names.join(', ') +
               (st.areaSkipped.length > 3 ? ' and ' + (st.areaSkipped.length - 3) + ' more' : '') +
               ' — these happen somewhere you have no footage, and a guide to one part of ' +
               'town can\'t be filled with another.';
      }

      // If the spacing rule capped the output, say so plainly — a thin calendar
      // should never look like a bug.
      if (st.shortBy > 0) {
        var gaps = CJ.settings().minGapDays || {};
        var lo = Math.min(gaps.restaurant || 30, gaps.experience || 30, gaps.home || 30);
        msg += ' <br><strong>Note:</strong> ' + st.shortBy + ' slot' +
               (st.shortBy === 1 ? '' : 's') + ' across ' + st.shortMonths + ' month' +
               (st.shortMonths === 1 ? '' : 's') + ' came up empty — every place that fit was ' +
               'already booked inside your ' + lo + '-day spacing rule. That\'s the rule working. ' +
               'To fill them: add more content, or shorten the gap in Settings.';
      }

      // A scoped plan draws from one collection, so say so — otherwise a
      // thinner calendar after "Build a plan" reads like something broke.
      if (st.focus) {
        msg += ' <br><strong>Plan scope:</strong> new posts come only from <strong>' + CJ.ui.esc(st.focus) +
               '</strong> (' + st.focusPlaces + ' place' + (st.focusPlaces === 1 ? '' : 's') + ').' +
               ' Deadlines elsewhere are still placed. Clear the scope in <em>Build a plan</em> to use the whole library.';
      }

      if (!silent) showNote(msg, 'info');
      render();
    }, 30);
  }

  /* ---------- AI ---------- */

  function runAI() {
    if (!CJ.ai.hasKey()) {
      CJ.app.showView('settings');
      toast('Add an Anthropic API key in Settings to use AI ideas.', 'error');
      return;
    }
    var btn = $('#btn-ai');
    btn.disabled = true;
    btn.textContent = '✨ Thinking…';
    showNote('Asking Claude for fresh ideas built from your library…', 'info');

    CJ.ai.generateIdeas({ months: view.months })
      .then(function (ideas) {
        if (!ideas.length) { showNote('Claude did not return any usable ideas. Try again.', 'error'); return; }
        CJ.addIdeas(ideas);
        showNote('Added <strong>' + ideas.length + '</strong> AI ideas (the purple ones). They stay put through refreshes — dismiss any you don\'t want.', 'info');
        render();
      })
      .catch(function (err) {
        console.error(err);
        showNote('Claude call failed: ' + CJ.ui.esc(err.message), 'error');
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = '✨ AI ideas';
      });
  }

  /* ---------- weather ---------- */

  var weatherLoaded = false;

  function loadWeather() {
    if (weatherLoaded) return;
    if (!CJ.settings().showWeather) { $('#weather-strip').hidden = true; return; }
    weatherLoaded = true;

    var url = 'https://api.open-meteo.com/v1/forecast?latitude=33.749&longitude=-84.388' +
              '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code' +
              '&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=7';

    fetch(url)
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('weather unavailable')); })
      .then(function (data) {
        var d = data.daily;
        if (!d || !d.time) throw new Error('no data');
        var strip = $('#weather-strip');
        strip.innerHTML = '';
        strip.appendChild(el('span', { class: 'wx-label', html: 'Atlanta<br>7-day' }));
        d.time.forEach(function (day, i) {
          var hi = Math.round(d.temperature_2m_max[i]);
          var lo = Math.round(d.temperature_2m_min[i]);
          var rain = d.precipitation_probability_max ? d.precipitation_probability_max[i] : 0;
          var good = hi >= 62 && hi <= 86 && rain < 40;
          var date = CJ.parseDate(day);
          strip.appendChild(el('div', { class: 'wx-day' + (good ? ' wx-good' : '') }, [
            el('div', { class: 'wx-dow', text: date.toLocaleDateString('en-US', { weekday: 'short' }) }),
            el('div', { class: 'wx-temp', text: hi + '°' }),
            el('div', { class: 'wx-note', text: lo + '° · ' + rain + '%' }),
            el('div', { class: 'wx-note', text: good ? '☀️ patio day' : (rain >= 40 ? '🌧 indoor' : (hi > 86 ? '🥵 hot' : '🧥 cool')) })
          ]));
        });
        strip.hidden = false;
      })
      .catch(function () { $('#weather-strip').hidden = true; });
  }

  /* ---------- reschedule ---------- */

  var rescheduleId = null;   // drop id

  function shiftDate(iso, days) {
    var d = CJ.parseDate(iso);
    if (!d) return iso;
    d.setDate(d.getDate() + days);
    return CJ.isoDate(d);
  }

  function renderRescheduleWarning() {
    var box = $('#reschedule-warning');
    box.innerHTML = '';
    var newDate = $('#reschedule-date').value;
    if (!rescheduleId || !newDate) return;

    var conflicts = CJ.generator.conflictsAt(rescheduleId, newDate);
    if (!conflicts.length) {
      box.appendChild(el('div', { class: 'notice', text: '✓ Clear — nothing in this post runs too close to another one.' }));
      return;
    }

    var lines = conflicts.slice(0, 4).map(function (c) {
      return el('li', {
        text: c.name + ' — only ' + c.gap + ' day' + (c.gap === 1 ? '' : 's') + ' from ' +
              (c.isHistory ? 'when you last posted about it' : '"' + c.otherLabel + '"') +
              ' on ' + CJ.formatDate(c.otherDate, { month: 'short', day: 'numeric' }) +
              '. Your rule is ' + c.need + ' days.'
      });
    });

    box.appendChild(el('div', { class: 'notice is-error' }, [
      el('strong', { text: '⚠ That date breaks your spacing rule' }),
      el('ul', { style: { margin: '6px 0 0', paddingLeft: '18px' } }, lines),
      conflicts.length > 4 ? el('div', { class: 'muted-xs', text: '…and ' + (conflicts.length - 4) + ' more.' }) : null,
      el('div', { style: { marginTop: '6px' } }, ['You can still move it — the calendar will just flag it.'])
    ]));
  }

  function openReschedule(dropId) {
    var found = CJ.getDrop(dropId);
    if (!found) return;
    rescheduleId = dropId;
    var d = found.drop, idea = found.idea;

    $('#reschedule-what').textContent =
      'The ' + CJ.ui.platformInfo(d.platform).label + ' ' + fmtLabel(d.format).toLowerCase() +
      ' for "' + idea.title + '" is currently set for ' +
      CJ.formatDate(d.date, { weekday: 'long', month: 'long', day: 'numeric' }) +
      '. Moving it leaves the other platforms where they are.';
    $('#reschedule-date').value = d.date;

    var quick = $('#reschedule-quick');
    quick.innerHTML = '';
    [
      { label: '−1 week', days: -7 },
      { label: '+3 days', days: 3 },
      { label: '+1 week', days: 7 },
      { label: '+2 weeks', days: 14 },
      { label: '+1 month', days: 30 }
    ].forEach(function (q) {
      quick.appendChild(el('button', {
        class: 'chip', type: 'button', text: q.label,
        onclick: function () {
          $('#reschedule-date').value = shiftDate($('#reschedule-date').value || d.date, q.days);
          renderRescheduleWarning();
        }
      }));
    });

    renderRescheduleWarning();
    $('#reschedule-modal').hidden = false;
  }

  function saveReschedule() {
    var newDate = $('#reschedule-date').value;
    if (!rescheduleId || !newDate) { toast('Pick a date first.', 'error'); return; }
    var found = CJ.getDrop(rescheduleId);
    // Pinning it means the next refresh leaves your choice alone.
    CJ.updateDrop(rescheduleId, { date: newDate, pinned: true });
    $('#reschedule-modal').hidden = true;
    toast('Moved to ' + CJ.formatDate(newDate, { month: 'short', day: 'numeric' }) + ' and pinned there.');
    rescheduleId = null;
    render();
    if (found && !$('#idea-modal').hidden) openIdea(found.idea.id);
  }

  function fmtLabel(f) {
    var m = CJ.generator.FORMATS[f];
    return m ? m.label : (f || 'Post');
  }
  function fmtEmoji(f) {
    var m = CJ.generator.FORMATS[f];
    return m ? m.emoji : '📄';
  }

  /* ---------- idea card ---------- */

  /* ---------- drop cards ---------- */

  var conflictMap = {};

  function dropClasses(drop, idea) {
    var c = ['idea-card', 'plat-' + drop.platform];
    if (conflictMap[drop.id] && conflictMap[drop.id].length) c.push('has-conflict');
    if (idea.source === 'deadline') c.push(idea.deadlineFor && idea.deadlineFor.priority === 'high' ? 'is-deadline-high' : 'is-deadline');
    if (idea.source === 'ai') c.push('is-ai');
    c.push('status-' + (drop.status || 'suggested'));
    return c.join(' ');
  }

  function placeChip(id, layerId) {
    var item = CJ.getItem(id);
    if (!item) return null;
    var t = CJ.ui.typeInfo(item.type);
    var layer = layerId ? CJ.getLayer(item, layerId) : null;
    // Only name the clip when there's more than one to choose between.
    var showLayer = layer && (item.layers || []).length > 1;
    return el('button', {
      class: 'place-chip', type: 'button', title: 'Open ' + item.name,
      onclick: function () { CJ.library.openForm(item.id); }
    }, [
      t.emoji + ' ' + item.name,
      showLayer ? el('span', { class: 'place-layer', text: '· ' + layer.label }) : null,
      item.neighborhood ? el('span', { class: 'place-hood', text: '· ' + item.neighborhood }) : null
    ]);
  }

  function dropCard(drop, idea) {
    var d = CJ.parseDate(drop.date);
    var items = (drop.itemIds || []).map(CJ.getItem).filter(Boolean);
    var pinfo = CJ.ui.platformInfo(drop.platform);

    var foot = [];
    foot.push(el('span', { class: 'pill pill-' + drop.platform, text: pinfo.emoji + ' ' + pinfo.label }));
    foot.push(el('span', { class: 'pill pill-quiet', text: fmtEmoji(drop.format) + ' ' + fmtLabel(drop.format) }));

    if (drop.platform === 'pinterest' && drop.linksTo) {
      foot.push(el('span', {
        class: 'pill pill-quiet',
        text: '↗ links to the ' + CJ.ui.platformInfo(drop.linksTo).label,
        title: 'Post these pins after that video is live so they have something to link to'
      }));
    }
    if (idea.occasion) {
      foot.push(el('span', {
        class: 'pill pill-good',
        text: '📅 ' + idea.occasion.name + (idea.occasion.approx ? ' (~)' : ''),
        title: idea.occasion.approx ? 'Approximate date — confirm the official one before you post' : ''
      }));
    }
    if (idea.deadlineFor) {
      foot.push(el('span', { class: 'pill pill-warn', text: '⏰ due ' + CJ.formatDate(idea.deadlineFor.date, { month: 'short', day: 'numeric' }) }));
    }
    if (idea.source === 'ai') foot.push(el('span', { class: 'pill pill-ai', text: '✨ AI' }));
    if (drop.status === 'planned') foot.push(el('span', { class: 'pill pill-good', text: '✓ planned' }));
    if (drop.status === 'done') foot.push(el('span', { class: 'pill pill-good', text: '✅ posted' }));
    if (drop.status === 'dismissed') foot.push(el('span', { class: 'pill', text: 'skipped' }));

    var conflicts = conflictMap[drop.id];
    if (conflicts && conflicts.length) {
      var names = [];
      conflicts.forEach(function (c) { if (names.indexOf(c.name) === -1) names.push(c.name); });
      foot.push(el('span', {
        class: 'pill pill-danger',
        text: '⚠ too close on ' + pinfo.label + ': ' + names.slice(0, 2).join(', ') + (names.length > 2 ? ' +' + (names.length - 2) : ''),
        title: conflicts.map(function (c) {
          return c.name + ': ' + c.gap + ' days from ' + (c.isHistory ? 'your last post there' : '"' + c.otherLabel + '"') +
                 ' (rule: ' + c.need + ')';
        }).join('\n')
      }));
    }

    foot.push(el('span', { class: 'push' }));
    foot.push(el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button', text: '📅 Move',
      title: 'Reschedule just this platform',
      onclick: function () { openReschedule(drop.id); }
    }));
    foot.push(el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button', text: 'Open',
      onclick: function () { openIdea(idea.id); }
    }));
    if (drop.status !== 'planned' && drop.status !== 'done') {
      foot.push(el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: '✓ Plan',
        title: 'Locks this one to this date',
        onclick: function () { CJ.updateDrop(drop.id, { status: 'planned', pinned: true }); toast('Planned.'); render(); }
      }));
    }
    if (drop.status !== 'dismissed') {
      foot.push(el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: '✕',
        title: 'Skip this platform for this concept',
        onclick: function () { CJ.updateDrop(drop.id, { status: 'dismissed' }); render(); }
      }));
    } else {
      foot.push(el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: '↺',
        title: 'Bring it back',
        onclick: function () { CJ.updateDrop(drop.id, { status: 'suggested', touched: false }); render(); }
      }));
    }

    var siblings = (idea.drops || []).filter(function (x) { return x.id !== drop.id && x.status !== 'dismissed'; });

    return el('div', { class: dropClasses(drop, idea) }, [
      el('div', { class: 'idea-date' }, [
        el('div', { class: 'dow', text: d.toLocaleDateString('en-US', { weekday: 'short' }) }),
        el('div', { class: 'day', text: String(d.getDate()) }),
        el('div', { class: 'mon', text: d.toLocaleDateString('en-US', { month: 'short' }) })
      ]),
      el('div', { class: 'idea-body' }, [
        el('div', { class: 'idea-title' }, [
          el('button', { type: 'button', text: idea.title, onclick: function () { openIdea(idea.id); } })
        ]),
        idea.blurb ? el('div', { class: 'idea-blurb', text: idea.blurb }) : null,
        items.length ? el('div', { class: 'idea-places' }, items.map(function (i) {
          return placeChip(i.id, (drop.layerByItem || {})[i.id]);
        })) : null,
        (idea.hooks && idea.hooks.length)
          ? el('ul', { class: 'hook-list' }, [el('li', { text: '💬 ' + idea.hooks[0] })])
          : null,
        siblings.length ? el('div', { class: 'sibling-note' }, [
          'Also going out: ' + siblings.map(function (x) {
            return CJ.ui.platformInfo(x.platform).label + ' ' + CJ.formatDate(x.date, { month: 'short', day: 'numeric' });
          }).join(' · ')
        ]) : null,
        el('div', { class: 'idea-foot' }, foot)
      ])
    ]);
  }

  /* ---------- render ---------- */

  function visible(entry) {
    var drop = entry.drop, idea = entry.idea;
    if (view.platforms.indexOf(drop.platform) === -1) return false;
    if (view.formats.length && view.formats.indexOf(drop.format) === -1) return false;
    if (view.status === 'active' && drop.status === 'dismissed') return false;
    if (view.status === 'planned' && drop.status !== 'planned') return false;
    if (view.status === 'done' && drop.status !== 'done') return false;
    if (idea.status === 'dismissed' && view.status !== 'all') return false;
    return true;
  }

  function renderToggles() {
    var pbox = $('#cal-platform-toggles');
    if (pbox) {
      pbox.innerHTML = '';
      CJ.PLATFORMS.forEach(function (p) {
        var on = view.platforms.indexOf(p.id) !== -1;
        var n = CJ.getDrops().filter(function (e) { return e.drop.platform === p.id && e.drop.status !== 'dismissed'; }).length;
        pbox.appendChild(el('button', {
          class: 'chip plat-chip plat-' + p.id + (on ? ' is-on' : ''), type: 'button',
          onclick: function () {
            var ix = view.platforms.indexOf(p.id);
            if (ix === -1) view.platforms.push(p.id); else view.platforms.splice(ix, 1);
            if (!view.platforms.length) view.platforms = CJ.PLATFORMS.map(function (x) { return x.id; });
            render();
          }
        }, [p.emoji + ' ' + p.label, el('span', { class: 'chip-count', text: String(n) })]));
      });
    }

    var fbox = $('#cal-format-toggles');
    if (fbox) {
      fbox.innerHTML = '';
      var present = {};
      CJ.getDrops().forEach(function (e) { if (e.drop.status !== 'dismissed') present[e.drop.format] = (present[e.drop.format] || 0) + 1; });
      Object.keys(present).sort().forEach(function (f) {
        var on = view.formats.indexOf(f) !== -1;
        fbox.appendChild(el('button', {
          class: 'chip' + (on ? ' is-on' : ''), type: 'button',
          title: (CJ.generator.FORMATS[f] || {}).hint || '',
          onclick: function () {
            var ix = view.formats.indexOf(f);
            if (ix === -1) view.formats.push(f); else view.formats.splice(ix, 1);
            render();
          }
        }, [fmtEmoji(f) + ' ' + fmtLabel(f), el('span', { class: 'chip-count', text: String(present[f]) })]));
      });
      if (view.formats.length) {
        fbox.appendChild(el('button', {
          class: 'chip', type: 'button', text: 'clear',
          onclick: function () { view.formats = []; render(); }
        }));
      }
    }
  }

  /* ---------- month grid ---------- */

  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function gridChip(entry) {
    var d = entry.drop, idea = entry.idea;
    var pinfo = CJ.ui.platformInfo(d.platform);
    var conflicted = conflictMap[d.id] && conflictMap[d.id].length;
    var movable = d.status !== 'done';
    return el('button', {
      class: 'g-chip plat-' + d.platform + ' status-' + (d.status || 'suggested') + (conflicted ? ' has-conflict' : ''),
      type: 'button',
      draggable: movable ? 'true' : null,
      'data-drop': d.id,
      ondragstart: movable ? function (ev) {
        dragId = d.id;
        ev.dataTransfer.effectAllowed = 'move';
        try { ev.dataTransfer.setData('text/plain', d.id); } catch (e) { /* old browsers */ }
        ev.currentTarget.classList.add('is-dragging');
        document.body.classList.add('is-dragging-drop');
      } : null,
      ondragend: function (ev) {
        ev.currentTarget.classList.remove('is-dragging');
        document.body.classList.remove('is-dragging-drop');
        dragId = null;
      },
      title: pinfo.label + ' · ' + fmtLabel(d.format) + '\n' + idea.title +
             ((d.itemIds || []).length ? '\n' + (d.itemIds || []).map(function (id) {
               var it = CJ.getItem(id); return it ? it.name : '';
             }).filter(Boolean).join(', ') : '') +
             (conflicted ? '\n⚠ too close to another post on ' + pinfo.label : ''),
      onclick: function () { openIdea(idea.id); }
    }, [
      el('span', { class: 'g-dot' }),
      el('span', { class: 'g-text', text: idea.title })
    ]);
  }

  /* Drag a post to another day. Same write as the Move dialog: the drop is
     pinned where you put it, only that platform moves, and a spacing clash
     warns rather than blocks — the rule constrains the generator, not you. */
  var dragId = null;

  function moveDropTo(dropId, iso) {
    var found = CJ.getDrop(dropId);
    if (!found || !iso || found.drop.date === iso) return false;
    var conflicts = CJ.generator.conflictsAt(dropId, iso);
    CJ.updateDrop(dropId, { date: iso, pinned: true });
    var when = CJ.formatDate(iso, { month: 'short', day: 'numeric' });
    if (conflicts.length) {
      toast('Moved to ' + when + ', but ' + conflicts[0].name + ' is only ' + conflicts[0].gap +
            ' days from another post on ' + CJ.ui.platformInfo(found.drop.platform).label + '.', 'error');
    } else {
      toast('Moved to ' + when + ' and pinned there.');
    }
    render();
    return true;
  }

  function dropTarget(cell, iso) {
    cell.setAttribute('data-date', iso);
    cell.addEventListener('dragover', function (ev) {
      if (!dragId) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      cell.classList.add('is-drop-target');
    });
    cell.addEventListener('dragleave', function () { cell.classList.remove('is-drop-target'); });
    cell.addEventListener('drop', function (ev) {
      ev.preventDefault();
      cell.classList.remove('is-drop-target');
      var id = dragId;
      try { id = ev.dataTransfer.getData('text/plain') || id; } catch (e) { /* ignore */ }
      dragId = null;
      document.body.classList.remove('is-dragging-drop');
      if (id) moveDropTo(id, iso);
    });
  }

  function renderGrid(body, entries) {
    var byDate = {};
    entries.forEach(function (e) { (byDate[e.drop.date] = byDate[e.drop.date] || []).push(e); });

    var months = {}, order = [];
    entries.forEach(function (e) {
      var mk = e.drop.date.slice(0, 7);
      if (!months[mk]) { months[mk] = true; order.push(mk); }
    });
    order.sort();

    var todayISO = CJ.todayISO();

    order.forEach(function (mk) {
      var parts = mk.split('-');
      var y = Number(parts[0]), m = Number(parts[1]);
      var info = CJ.atlanta.monthInfo(m);
      var first = new Date(y, m - 1, 1);
      var daysInMonth = new Date(y, m, 0).getDate();
      var lead = first.getDay();
      var label = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      var counts = {};
      entries.forEach(function (e) {
        if (e.drop.date.slice(0, 7) !== mk) return;
        counts[e.drop.platform] = (counts[e.drop.platform] || 0) + 1;
      });
      var breakdown = CJ.PLATFORM_IDS.filter(function (p) { return counts[p]; })
        .map(function (p) { return CJ.ui.platformInfo(p).emoji + ' ' + counts[p]; }).join('  ');

      var grid = el('div', { class: 'cal-grid' });
      DOW.forEach(function (d) { grid.appendChild(el('div', { class: 'cal-dow', text: d })); });

      for (var i = 0; i < lead; i++) grid.appendChild(el('div', { class: 'cal-cell is-blank' }));

      for (var day = 1; day <= daysInMonth; day++) {
        var iso = y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        var here = (byDate[iso] || []).slice().sort(function (a, b) {
          return CJ.PLATFORM_IDS.indexOf(a.drop.platform) - CJ.PLATFORM_IDS.indexOf(b.drop.platform);
        });
        var cell = el('div', {
          class: 'cal-cell' + (iso === todayISO ? ' is-today' : '') + (here.length ? ' has-posts' : '')
        }, [
          el('div', { class: 'cal-daynum', text: String(day) })
        ]);
        here.forEach(function (e) { cell.appendChild(gridChip(e)); });
        dropTarget(cell, iso);
        grid.appendChild(cell);
      }

      body.appendChild(el('div', { class: 'month-block' }, [
        el('div', { class: 'month-head' }, [
          el('h3', { text: label }),
          el('span', { class: 'month-weather', text: '🌡 avg ' + info.hi + '°/' + info.lo + '°' }),
          el('span', { class: 'month-count', text: breakdown })
        ]),
        el('div', { class: 'cal-grid-wrap' }, [grid])
      ]));
    });
  }

  function render() {
    if (!CJ.state) return;
    var body = $('#calendar-body');
    body.innerHTML = '';

    conflictMap = CJ.generator.conflictReport();
    renderToggles();

    var entries = CJ.getDrops().filter(visible);
    var last = CJ.state.lastGeneratedAt;

    $('#calendar-sub').textContent = last
      ? entries.length + ' posts across ' + CJ.getIdeas().length + ' concepts · last refreshed ' +
        new Date(last).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'Not generated yet';

    if (!CJ.getItems().length) {
      body.appendChild(el('div', { class: 'empty' }, [
        el('h3', { text: 'Your library is empty' }),
        el('p', { text: 'The calendar only ever suggests footage you already have. Add a few things first, then come back and hit Refresh.' }),
        el('button', { class: 'btn btn-primary', type: 'button', text: '+ Add content', onclick: function () { CJ.library.openForm(); } })
      ]));
      return;
    }

    if (!CJ.getIdeas().length) {
      body.appendChild(el('div', { class: 'empty' }, [
        el('h3', { text: 'Nothing generated yet' }),
        el('p', { text: 'Hit refresh and the generator will build a month-by-month plan out of your library, Atlanta\'s calendar, and the season — staggered across your three platforms.' }),
        el('button', { class: 'btn btn-primary', type: 'button', text: '↻ Generate my calendar', onclick: function () { refresh(); } })
      ]));
      return;
    }

    if (!entries.length) {
      body.appendChild(el('div', { class: 'empty' }, [
        el('h3', { text: 'Nothing matches these filters' }),
        el('p', { text: 'Turn a platform or format back on above.' })
      ]));
      return;
    }

    entries.sort(function (a, b) {
      if (a.drop.date !== b.drop.date) return a.drop.date < b.drop.date ? -1 : 1;
      return CJ.PLATFORM_IDS.indexOf(a.drop.platform) - CJ.PLATFORM_IDS.indexOf(b.drop.platform);
    });

    if (view.mode === 'grid') { renderGrid(body, entries); return; }

    var months = {}, order = [];
    entries.forEach(function (e) {
      var mk = e.drop.date.slice(0, 7);
      if (!months[mk]) { months[mk] = []; order.push(mk); }
      months[mk].push(e);
    });
    order.sort();

    order.forEach(function (mk) {
      var parts = mk.split('-');
      var y = Number(parts[0]), m = Number(parts[1]);
      var info = CJ.atlanta.monthInfo(m);
      var label = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      var counts = {};
      months[mk].forEach(function (e) { counts[e.drop.platform] = (counts[e.drop.platform] || 0) + 1; });
      var breakdown = CJ.PLATFORM_IDS.filter(function (p) { return counts[p]; })
        .map(function (p) { return CJ.ui.platformInfo(p).emoji + ' ' + counts[p]; }).join('  ');

      body.appendChild(el('div', { class: 'month-block' }, [
        el('div', { class: 'month-head' }, [
          el('h3', { text: label }),
          el('span', { class: 'month-weather', text: '🌡 avg ' + info.hi + '°/' + info.lo + '° · ' + info.mood }),
          el('span', { class: 'month-count', text: breakdown + '  ·  ' + months[mk].length + ' posts' })
        ]),
        el('div', { class: 'idea-list' }, months[mk].map(function (e) { return dropCard(e.drop, e.idea); }))
      ]));
    });
  }

  /* ---------- idea detail ---------- */

  function copyLine(text) {
    return el('div', { class: 'copyline' }, [
      el('span', { text: text }),
      el('button', {
        class: 'btn btn-ghost btn-sm push', type: 'button', text: 'Copy',
        onclick: function (e) {
          var btn = e.currentTarget;
          var done = function () { btn.textContent = 'Copied ✓'; setTimeout(function () { btn.textContent = 'Copy'; }, 1400); };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
          } else { fallbackCopy(text); done(); }
        }
      })
    ]);
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* nothing to do */ }
    document.body.removeChild(ta);
  }

  function openIdea(id) {
    var idea = CJ.getIdea(id);
    if (!idea) return;
    var items = (idea.itemIds || []).map(CJ.getItem).filter(Boolean);
    var body = $('#idea-modal-body');
    body.innerHTML = '';
    $('#idea-modal-title').textContent = idea.title;

    // When & where
    var rollout = el('div', { class: 'idea-detail-section' }, [el('h4', { text: 'Rollout' })]);
    (idea.drops || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (drop) {
      var pinfo = CJ.ui.platformInfo(drop.platform);
      var conf = CJ.generator.conflictsAt(drop.id, drop.date);
      rollout.appendChild(el('div', { class: 'rollout-row plat-' + drop.platform }, [
        el('span', { class: 'pill pill-' + drop.platform, text: pinfo.emoji + ' ' + pinfo.label }),
        el('span', { class: 'rollout-date', text: CJ.formatDate(drop.date, { weekday: 'short', month: 'short', day: 'numeric' }) }),
        el('select', {
          class: 'input input-sm', style: { width: 'auto' },
          onchange: function () { CJ.updateDrop(drop.id, { format: this.value }); openIdea(id); render(); }
        }, Object.keys(CJ.generator.FORMATS).map(function (f) {
          var o = el('option', { value: f, text: CJ.generator.FORMATS[f].label });
          if (f === drop.format) o.selected = true;
          return o;
        })),
        drop.linksTo ? el('span', { class: 'muted-xs', text: '↗ links to the ' + CJ.ui.platformInfo(drop.linksTo).label }) : null,
        drop.pinned ? el('span', { class: 'pill pill-good', text: '📌' }) : null,
        drop.status !== 'suggested' ? el('span', { class: 'pill pill-quiet', text: drop.status }) : null,
        el('span', { class: 'push' }),
        el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', text: 'Move',
          onclick: function () { openReschedule(drop.id); }
        }),
        el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', text: '✅ Posted',
          title: 'Logs this against every place in it, on ' + pinfo.label,
          onclick: function () {
            CJ.updateDrop(drop.id, { status: 'done', pinned: true });
            (drop.itemIds || []).forEach(function (iid) {
              CJ.markPosted(iid, { platform: drop.platform, layerId: (drop.layerByItem || {})[iid], date: CJ.todayISO() });
            });
            toast('Logged on ' + pinfo.label + '.');
            openIdea(id); render(); CJ.library.render();
          }
        }),
        conf.length ? el('span', { class: 'pill pill-danger', text: '⚠ too close' }) : null
      ]));
    });
    body.appendChild(rollout);

    if (idea.blurb) {
      body.appendChild(el('div', { class: 'idea-detail-section' }, [
        el('h4', { text: 'Why now' }),
        el('p', { class: 'muted-xs', style: { fontSize: '13px', color: 'var(--ink-2)' }, text: idea.blurb })
      ]));
    }

    body.appendChild(el('div', { class: 'idea-detail-section' }, [
      el('h4', { text: 'Places in this post' }),
      items.length
        ? el('div', { class: 'idea-places' }, items.map(function (i) {
            var lead = (idea.drops || [])[0] || {};
            return placeChip(i.id, (lead.layerByItem || {})[i.id]);
          }))
        : el('p', { class: 'muted-xs', text: 'No places attached yet.' })
    ]));

    /* ---- the brief: what each platform's version actually is ------------
       One tab per platform, because the whole point is that the TikTok and
       the Pinterest version of the same footage are different posts. */
    var drops = (idea.drops || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (drops.length) {
      var briefSec = el('div', { class: 'idea-detail-section' }, [el('h4', { text: 'How to make each one' })]);
      var tabs = el('div', { class: 'brief-tabs' });
      var pane = el('div', { class: 'brief-pane' });

      function showBrief(ix) {
        CJ.ui.$$('.brief-tabs button', tabs).forEach(function (b, i) { b.classList.toggle('is-active', i === ix); });
        pane.innerHTML = '';
        var drop = drops[ix];
        var b = CJ.voice.brief(idea, drop);

        function row(label, value, cls) {
          if (!value) return null;
          return el('div', { class: 'brief-row ' + (cls || '') }, [
            el('span', { class: 'brief-label', text: label }),
            el('span', { class: 'brief-value', text: value })
          ]);
        }

        pane.appendChild(el('div', { class: 'brief-head' }, [
          el('span', { class: 'pill pill-' + drop.platform, text: CJ.ui.platformInfo(drop.platform).emoji + ' ' + b.platformLabel }),
          el('span', { class: 'muted-xs', text: CJ.formatDate(drop.date, { weekday: 'long', month: 'short', day: 'numeric' }) }),
          el('span', { class: 'push' }),
          el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '⧉ Copy this brief',
            onclick: function (e) {
              navigator.clipboard.writeText(CJ.voice.briefText(idea, drop))
                .then(function () { toast('Brief copied.'); })
                .catch(function () { toast('Could not copy.', 'error'); });
            }
          })
        ]));

        pane.appendChild(row('What it is', b.is));
        pane.appendChild(row('Who sees it', b.audience));
        if (b.thread) pane.appendChild(row('Why these together', b.thread, 'is-thread'));

        pane.appendChild(el('div', { class: 'brief-row is-hook' }, [
          el('span', { class: 'brief-label', text: b.titleLabel }),
          copyLine(b.title)
        ]));
        pane.appendChild(row('How to phrase it', b.voice));
        pane.appendChild(row('Hook rule', b.hookRule));
        pane.appendChild(row('Length', b.length));

        pane.appendChild(el('div', { class: 'brief-row' }, [
          el('span', { class: 'brief-label', text: 'Structure' }),
          el('ol', { class: 'brief-list' }, b.structure.map(function (line) { return el('li', { text: line }); }))
        ]));

        if (b.roles.length) {
          pane.appendChild(el('div', { class: 'brief-row' }, [
            el('span', { class: 'brief-label', text: 'Each place' }),
            el('div', { class: 'brief-roles' }, b.roles.map(function (r) {
              return el('div', { class: 'brief-role' }, [
                el('strong', { text: r.name }),
                r.clip ? el('span', { class: 'pill pill-quiet', text: '🎬 ' + r.clip }) : null,
                el('span', { class: 'brief-slot', text: r.slot }),
                r.why ? el('span', { class: 'brief-why', text: r.why }) : null
              ]);
            }))
          ]));
        }

        pane.appendChild(row('On screen', b.onScreen));
        pane.appendChild(row('Caption', b.caption));
        pane.appendChild(row('Call to action', b.cta));
        pane.appendChild(row('Avoid', b.avoid, 'is-avoid'));
        if (b.difference) pane.appendChild(row('vs the other platforms', b.difference, 'is-diff'));
      }

      drops.forEach(function (d, i) {
        tabs.appendChild(el('button', {
          class: 'brief-tab plat-' + d.platform, type: 'button',
          text: CJ.ui.platformInfo(d.platform).emoji + ' ' + CJ.ui.platformInfo(d.platform).label,
          onclick: function () { showBrief(i); }
        }));
      });
      briefSec.appendChild(tabs);
      briefSec.appendChild(pane);
      body.appendChild(briefSec);
      showBrief(0);
    }

    if (idea.hooks && idea.hooks.length) {
      body.appendChild(el('div', { class: 'idea-detail-section' }, [
        el('h4', { text: 'Other hooks to try' })
      ].concat(idea.hooks.map(copyLine))));
    }

    if (idea.captions && idea.captions.length) {
      body.appendChild(el('div', { class: 'idea-detail-section' }, [
        el('h4', { text: 'Caption starters' })
      ].concat(idea.captions.map(copyLine))));
    }

    body.appendChild(el('div', { class: 'idea-detail-section' }, [
      el('h4', { text: 'Your notes' }),
      el('textarea', {
        class: 'input', rows: 3, placeholder: 'Shot list, reminders, what you still need to film…',
        onchange: function () { CJ.updateIdea(id, { notes: this.value }); toast('Note saved.'); }
      })
    ]));
    var ta = body.querySelector('textarea');
    if (ta) ta.value = idea.notes || '';

    // Actions
    var actions = el('div', { class: 'modal-foot' }, [
      CJ.ai.hasKey() ? el('button', {
        class: 'btn btn-ghost', type: 'button', text: '✨ Rewrite hooks',
        onclick: function (e) {
          var b = e.currentTarget; b.disabled = true; b.textContent = '✨ Writing…';
          CJ.ai.punchUp(CJ.getIdea(id)).then(function (out) {
            CJ.updateIdea(id, { hooks: out.hooks.length ? out.hooks : idea.hooks, captions: out.captions.length ? out.captions : idea.captions });
            openIdea(id); render(); toast('Fresh copy.');
          }).catch(function (err) {
            toast('Claude call failed: ' + err.message, 'error');
            b.disabled = false; b.textContent = '✨ Rewrite hooks';
          });
        }
      }) : null,
      el('span', { class: 'push' }),
      el('button', {
        class: 'btn btn-primary', type: 'button', text: 'Done',
        onclick: function () { $('#idea-modal').hidden = true; }
      })
    ]);
    body.appendChild(actions);

    $('#idea-modal').hidden = false;
  }

  /* ---------- wiring ---------- */

  function init() {
    $('#btn-refresh').addEventListener('click', function () { hideNote(); refresh(); });
    $('#btn-ai').addEventListener('click', runAI);
    $('#idea-modal-close').addEventListener('click', function () { $('#idea-modal').hidden = true; });

    $('#reschedule-close').addEventListener('click', function () { $('#reschedule-modal').hidden = true; });
    $('#reschedule-cancel').addEventListener('click', function () { $('#reschedule-modal').hidden = true; });
    $('#reschedule-save').addEventListener('click', saveReschedule);
    $('#reschedule-date').addEventListener('change', renderRescheduleWarning);
    $('#reschedule-date').addEventListener('input', renderRescheduleWarning);
    $('#reschedule-modal').addEventListener('mousedown', function (e) {
      if (e.target === $('#reschedule-modal')) $('#reschedule-modal').hidden = true;
    });
    $('#idea-modal').addEventListener('mousedown', function (e) { if (e.target === $('#idea-modal')) $('#idea-modal').hidden = true; });

    $('#cal-status').addEventListener('change', function () { view.status = this.value; render(); });

    $$('#cal-view button').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#cal-view button').forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active');
        view.mode = b.getAttribute('data-mode');
        render();
      });
    });
    $('#cal-months').addEventListener('change', function () {
      view.months = Number(this.value);
      CJ.updateSettings({ horizonMonths: view.months });
      refresh(true);
    });

    view.months = CJ.settings().horizonMonths || 6;
    $('#cal-months').value = String(view.months);
  }

  CJ.calendarUI = {
    init: init,
    render: render,
    refresh: refresh,
    markStale: markStale,
    loadWeather: loadWeather,
    openIdea: openIdea,
    openReschedule: openReschedule,
    moveDropTo: moveDropTo,
    setMonths: function (n) {
      view.months = n;
      var sel = $('#cal-months');
      if (sel) sel.value = String(n);
    },
    setMode: function (m) {
      view.mode = m === 'grid' ? 'grid' : 'list';
      $$('#cal-view button').forEach(function (x) {
        x.classList.toggle('is-active', x.getAttribute('data-mode') === view.mode);
      });
      render();
    },
    reloadWeather: function () { weatherLoaded = false; loadWeather(); }
  };

})(window.CJ);
