/* =========================================================================
   ui-website.js — turn a place's own website into tags and post ideas.

   Every place can carry a link to its website. With a Claude key saved,
   "✨ Read website" has Claude read it (see CJ.ai.readWebsite) and comes back
   with SUGGESTIONS, never edits:

     - tags people plan by (cuisine, patio, brunch, happy hour…), each with
       the reason from the site — tap to add
     - a one-line summary and practical facts — tap to add to your notes
     - 4-6 post ideas grounded in what's really on the site — "Add to
       calendar" books one on the next free posting day that respects the
       spacing rule (and the months, for a seasonal menu)

   Results live on the place as `item.web`, so they sync with everything
   else. Website ideas also feed the hooks of that place's spotlight posts.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var $ = CJ.ui.$, el = CJ.ui.el, toast = CJ.ui.toast;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var formWeb = null;       // results for the place open in the form
  var formBusy = false;

  /* ---------- scheduling a website idea ---------- */

  function addDaysISO(iso, n) {
    var d = CJ.parseDate(iso); d.setDate(d.getDate() + n); return CJ.isoDate(d);
  }

  /** Next posting day for this place: a slot day on its platform, free that
      day, inside the idea's months, and clear of the spacing rule. */
  function nextSlotFor(item, months) {
    var active = CJ.PLATFORM_IDS.filter(CJ.platformActive);
    var p = active.filter(function (x) { return CJ.itemPostsOn(item, x); })[0] || active[0] || 'instagram';
    var days = CJ.cadenceOn() ? CJ.slotDays(p) : (CJ.settings().preferredDays || [2, 4, 6]);
    var booked = {}, mine = [];
    CJ.getDrops().forEach(function (e) {
      var d = e.drop;
      if (d.status === 'dismissed' || d.platform !== p) return;
      booked[d.date] = true;
      if ((d.itemIds || []).indexOf(item.id) !== -1) mine.push(d.date);
    });
    var last = CJ.lastPostedOn(item, p);
    if (last) mine.push(last.slice(0, 10));
    var gap = CJ.minGapFor(item) || 0;
    var today = CJ.todayISO();
    var fallback = null;
    // A seasonal idea (Halloween brunch) belongs in the last three weeks of
    // its window, like seasonal places do. Look there first, then anywhere.
    var starts = [1];
    if (months && months.length) {
      for (var k = 1; k <= 400; k++) {
        var dk = CJ.parseDate(addDaysISO(today, k));
        var nextDay = new Date(dk.getFullYear(), dk.getMonth(), dk.getDate() + 1);
        if (months.indexOf(dk.getMonth() + 1) !== -1 && months.indexOf(nextDay.getMonth() + 1) === -1) {
          starts.unshift(Math.max(1, k - 21));   // window ends on day k
          break;
        }
      }
    }
    for (var si = 0; si < starts.length; si++) {
    for (var i = starts[si]; i <= 400; i++) {
      var iso = addDaysISO(today, i);
      var dt = CJ.parseDate(iso);
      if (days.indexOf(dt.getDay()) === -1) continue;
      if (months && months.length && months.indexOf(dt.getMonth() + 1) === -1) continue;
      if (booked[iso]) continue;
      if (!fallback) fallback = iso;
      var clear = mine.every(function (m) { return Math.abs(CJ.daysBetween(CJ.parseDate(m), dt)) >= gap; });
      if (clear) return { platform: p, date: iso, clear: true };
    }
    }
    return fallback ? { platform: p, date: fallback, clear: false } : null;
  }

  function schedule(itemId, ideaId) {
    var item = CJ.getItem(itemId);
    if (!item || !item.web) return null;
    var wi = (item.web.ideas || []).filter(function (x) { return x.id === ideaId; })[0];
    if (!wi) return null;
    var slot = nextSlotFor(item, wi.months);
    if (!slot) { toast('No open posting day found in the next year for that one.', 'error'); return null; }
    var id = 'web:' + item.id + ':' + wi.id;
    var layer = CJ.bestLayerFor(item, slot.platform, slot.date);
    var lbi = {}; if (layer) lbi[item.id] = layer.id;
    var fmt = slot.platform === 'pinterest' ? 'pins' : slot.platform === 'tiktok' ? 'video'
      : (item.photosOnly ? 'carousel' : wi.format || 'reel');
    CJ.addIdeas([{
      id: id,
      date: slot.date,
      source: 'ai',
      themeId: null,
      title: wi.title,
      blurb: (wi.angle ? wi.angle + ' ' : '') + '(From ' + item.name + '\'s website.)',
      format: 'single',
      itemIds: [item.id],
      platforms: [slot.platform],
      hooks: wi.hook ? [wi.hook] : [],
      captions: [],
      occasion: null,
      deadlineFor: null,
      status: 'planned',
      pinned: true,
      touched: true,
      priority: 1,
      notes: '',
      drops: [{
        id: id + '::' + slot.platform, platform: slot.platform, format: fmt, date: slot.date,
        itemIds: [item.id], layerByItem: lbi, linksTo: null,
        status: 'planned', pinned: true, touched: true, notes: ''
      }]
    }]);
    var web = JSON.parse(JSON.stringify(item.web));
    web.ideas.forEach(function (x) { if (x.id === ideaId) x.scheduledIdeaId = id; });
    CJ.upsertItem({ id: item.id, web: web });
    toast('Planned for ' + CJ.formatDate(slot.date, { weekday: 'short', month: 'short', day: 'numeric' }) +
      (slot.clear ? '.' : ', though it lands inside your spacing rule. Move it if you like.'), slot.clear ? null : 'error');
    return id;
  }

  /* ---------- the results panel (shared by the form and the journal) ---------- */

  function factsLine(f) {
    if (!f) return '';
    return [
      f.price, f.hours && 'Hours: ' + f.hours, f.reservations && 'Reservations: ' + f.reservations,
      f.happyHour && 'Happy hour: ' + f.happyHour, f.parking && 'Parking: ' + f.parking
    ].filter(Boolean).join(' · ');
  }

  /**
   * opts: { web, onAddTag(tag), onAddNotes(text), onUseHood(n), itemId (saved places
   *         can schedule), hasTag(tag), notesHave(text), hoodEmpty }
   */
  function panel(opts) {
    var w = opts.web;
    if (!w) return null;
    var kids = [
      el('div', { class: 'web-head' }, [
        el('strong', { text: '✨ From their website' }),
        el('span', { class: 'muted-xs', text: 'read ' + CJ.formatDate(w.readAt.slice(0, 10), { month: 'short', day: 'numeric' }) })
      ])
    ];

    if (w.summary) {
      var inNotes = opts.notesHave && opts.notesHave(w.summary);
      kids.push(el('div', { class: 'web-summary' }, [
        el('p', { text: w.summary }),
        opts.onAddNotes && !inNotes ? el('button', {
          type: 'button', class: 'btn btn-ghost btn-sm', text: '＋ Add to notes',
          onclick: function () { opts.onAddNotes(w.summary + (factsLine(w.facts) ? '\n' + factsLine(w.facts) : '')); }
        }) : null
      ]));
    }
    var fl = factsLine(w.facts);
    if (fl) kids.push(el('p', { class: 'web-facts muted-xs', text: fl }));

    if (w.neighborhood && opts.hoodEmpty && opts.onUseHood) {
      kids.push(el('p', { class: 'muted-xs' }, [
        'Neighborhood looks like ', el('strong', { text: w.neighborhood }), '. ',
        el('button', { type: 'button', class: 'linkbtn', text: 'Use it', onclick: function () { opts.onUseHood(w.neighborhood); } })
      ]));
    }

    var tags = (w.suggestedTags || []).filter(function (t) { return !(opts.hasTag && opts.hasTag(t.tag)); });
    if (tags.length) {
      kids.push(el('div', { class: 'web-sub', text: 'Suggested tags — tap to add' }));
      kids.push(el('div', { class: 'chipset web-tags' }, tags.map(function (t) {
        return el('button', {
          type: 'button', class: 'chip web-tag', title: t.why || '', text: '＋ ' + t.tag,
          onclick: function () { opts.onAddTag(t.tag); }
        });
      })));
    }

    if ((w.ideas || []).length) {
      kids.push(el('div', { class: 'web-sub', text: 'Post ideas' }));
      kids.push(el('ul', { class: 'web-ideas' }, w.ideas.map(function (x) {
        var planned = x.scheduledIdeaId && CJ.getIdea(x.scheduledIdeaId);
        return el('li', {}, [
          el('div', { class: 'web-idea-main' }, [
            el('strong', { text: x.title }),
            x.months && x.months.length ? el('span', { class: 'pill pill-amber', text: x.months.map(function (m) { return MONTHS[m - 1]; }).join(', ') }) : null,
            x.angle ? el('span', { class: 'muted-xs', text: x.angle }) : null,
            x.hook ? el('span', { class: 'web-hook', text: '💬 ' + x.hook }) : null
          ]),
          planned
            ? el('span', { class: 'pill pill-good', text: '✓ ' + CJ.formatDate(planned.date, { month: 'short', day: 'numeric' }) })
            : opts.itemId
              ? el('button', {
                  type: 'button', class: 'btn btn-soft btn-sm', text: 'Add to calendar',
                  onclick: function () { schedule(opts.itemId, x.id); }
                })
              : el('span', { class: 'muted-xs', text: 'Save to plan it' })
        ]);
      })));
    }
    return el('div', { class: 'web-panel' }, kids);
  }

  /* ---------- in the add / edit form ---------- */

  function formDraft() {
    return {
      name: $('#f-name').value.trim() || 'this place', type: $('#f-type').value,
      neighborhood: $('#f-neighborhood').value.trim(), notes: $('#f-notes').value,
      tags: CJ.library.formTags(), link: $('#f-link').value.trim()
    };
  }

  function renderForm() {
    var box = $('#f-web');
    box.innerHTML = '';
    var link = $('#f-link').value.trim();
    var btn = $('#f-web-read');
    btn.disabled = formBusy || !/^https?:\/\//i.test(link);
    btn.textContent = formBusy ? 'Reading…' : (formWeb ? '↻ Read again' : '✨ Read website');
    $('#f-web-hint').textContent = !CJ.ai.hasKey()
      ? 'Add your Claude key in Settings → AI to pull tags and post ideas from this link.'
      : !link ? 'Paste their website and Claude will suggest tags and post ideas from it.' : '';
    var id = $('#f-id').value;
    var p = panel({
      web: formWeb,
      itemId: id || null,
      hasTag: function (t) { return CJ.library.formTags().some(function (x) { return x.toLowerCase() === t.toLowerCase(); }); },
      onAddTag: function (t) { CJ.library.addFormTag(t); renderForm(); },
      notesHave: function (txt) { return $('#f-notes').value.indexOf(txt) !== -1; },
      onAddNotes: function (txt) {
        var n = $('#f-notes');
        n.value = n.value.trim() ? n.value.trim() + '\n\n' + txt : txt;
        n.dispatchEvent(new Event('input'));
        renderForm();
      },
      hoodEmpty: !$('#f-neighborhood').value.trim(),
      onUseHood: function (h) { $('#f-neighborhood').value = h; renderForm(); }
    });
    if (p) box.appendChild(p);
  }

  function readFromForm() {
    formBusy = true; renderForm();
    CJ.ai.readWebsite(formDraft()).then(function (w) {
      formWeb = w;
      formBusy = false; renderForm();
      toast('Read their website: ' + w.suggestedTags.length + ' tag ideas, ' + w.ideas.length + ' post ideas.');
    }).catch(function (err) {
      formBusy = false; renderForm();
      toast(err.message, 'error');
    });
  }

  function formOpen(item) {
    formWeb = item && item.web ? JSON.parse(JSON.stringify(item.web)) : null;
    formBusy = false;
    renderForm();
  }

  function formValue() { return formWeb; }

  /* ---------- in the journal ---------- */

  var journalBusy = {};

  function readForItem(itemId) {
    var item = CJ.getItem(itemId);
    if (!item) return Promise.resolve(null);
    journalBusy[itemId] = true;
    CJ.journalUI && CJ.journalUI.refresh && CJ.journalUI.refresh();
    return CJ.ai.readWebsite(item).then(function (w) {
      // Keep plans already made from an earlier read.
      var old = (item.web && item.web.ideas) || [];
      old.filter(function (x) { return x.scheduledIdeaId; }).forEach(function (x) { w.ideas.unshift(x); });
      delete journalBusy[itemId];
      CJ.upsertItem({ id: itemId, web: w });
      return w;
    }).catch(function (err) {
      delete journalBusy[itemId];
      CJ.journalUI && CJ.journalUI.refresh && CJ.journalUI.refresh();
      throw err;
    });
  }

  function journalSection(item) {
    var hasLink = /^https?:\/\//i.test(item.link || '');
    if (!hasLink && !item.web) return null;
    var busy = !!journalBusy[item.id];
    var head = el('div', { class: 'web-actions' }, [
      el('button', {
        type: 'button', class: 'btn btn-sm' + (item.web ? ' btn-ghost' : ' btn-soft'),
        disabled: busy || !hasLink,
        text: busy ? 'Reading…' : item.web ? '↻ Read website again' : '✨ Read their website for tags & post ideas',
        onclick: function () {
          if (!CJ.ai.hasKey()) { toast('Add your Claude key in Settings → AI first.', 'error'); return; }
          readForItem(item.id).then(function (w) {
            if (w) toast('Read their website: ' + w.suggestedTags.length + ' tag ideas, ' + w.ideas.length + ' post ideas.');
          }).catch(function (err) { toast(err.message, 'error'); });
        }
      }),
      hasLink ? el('a', { class: 'muted-xs', href: item.link, target: '_blank', rel: 'noopener', text: item.link.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') }) : null
    ]);
    var p = panel({
      web: item.web,
      itemId: item.id,
      hasTag: function (t) { return (item.tags || []).some(function (x) { return x.toLowerCase() === t.toLowerCase(); }); },
      onAddTag: function (t) {
        CJ.upsertItem({ id: item.id, tags: (item.tags || []).concat([t]) });
        toast('Tagged "' + t + '".');
      },
      notesHave: function (txt) { return (item.notes || '').indexOf(txt) !== -1; },
      onAddNotes: function (txt) {
        CJ.upsertItem({ id: item.id, notes: item.notes ? item.notes.trim() + '\n\n' + txt : txt });
        toast('Added to notes.');
      },
      hoodEmpty: !item.neighborhood,
      onUseHood: function (h) { CJ.upsertItem({ id: item.id, neighborhood: h }); }
    });
    return el('div', { class: 'web-section' }, [head, p]);
  }

  /* ---------- every place at once (Settings) ---------- */

  var bulkRunning = false;

  function unread() {
    return CJ.getItems().filter(function (it) { return /^https?:\/\//i.test(it.link || '') && !it.web; });
  }

  function renderBulk() {
    var box = $('#web-bulk');
    if (!box) return;
    var n = unread().length;
    $('#web-bulk-text').textContent = bulkRunning ? 'Reading…'
      : n ? n + ' place' + (n === 1 ? ' has a website' : 's have websites') + ' that haven\'t been read yet.'
      : 'Every place with a website has been read.';
    $('#btn-web-bulk').disabled = bulkRunning || !n || !CJ.ai.hasKey();
  }

  function readAll() {
    var list = unread();
    if (!list.length) return;
    bulkRunning = true;
    var done = 0, failed = 0;
    function next(i) {
      if (i >= list.length) {
        bulkRunning = false; renderBulk();
        toast('Read ' + done + ' website' + (done === 1 ? '' : 's') + (failed ? ', ' + failed + ' couldn\'t be opened' : '') + '. Open a place\'s journal to use what it found.', failed ? 'error' : null);
        return;
      }
      $('#web-bulk-text').textContent = 'Reading ' + (i + 1) + ' of ' + list.length + ': ' + list[i].name + '…';
      readForItem(list[i].id).then(function () { done++; }, function () { failed++; }).then(function () { next(i + 1); });
    }
    next(0);
  }

  function init() {
    $('#f-web-read').addEventListener('click', readFromForm);
    $('#f-link').addEventListener('input', renderForm);
    if ($('#btn-web-bulk')) $('#btn-web-bulk').addEventListener('click', readAll);
    CJ.subscribe(renderBulk);
    renderBulk();
  }

  CJ.websiteUI = {
    init: init, formOpen: formOpen, formValue: formValue, journalSection: journalSection,
    schedule: schedule, nextSlotFor: nextSlotFor, readAll: readAll, renderBulk: renderBulk, panel: panel
  };

})(window.CJ);
