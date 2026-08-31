/* =========================================================================
   ui-import.js — the Quick add screen.

   Paste on the left, live preview on the right. The preview runs the same
   plan() the import runs, so what it shows is what will happen — including
   which rows are already in the library and what merging one would actually
   add. Nothing is written until the button is pressed, and once it is, the
   result panel keeps an Undo for as long as the modal is open.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var $ = CJ.ui.$, el = CJ.ui.el, toast = CJ.ui.toast;

  var lastPlan = [];
  var lastResult = null;

  var EXAMPLE =
    'Name: Le Bon Nosh\n' +
    'Type: Restaurant\n' +
    'Neighborhood: Buckhead\n' +
    'Tags: french, coffee, pastries, wine bar, brunch\n' +
    'Notes: French-influenced restaurant, market and wine bar in The Irby.\n' +
    'Counter service by day, full service at night.\n' +
    'Platforms: instagram, pinterest\n' +
    '\n' +
    'Name: Ladybird Grove & Mess Hall\n' +
    'Neighborhood: Old Fourth Ward\n' +
    'Tags: patio, beltline, group friendly, dog friendly\n' +
    'Notes: Big shaded patio right on the Beltline. Camp-themed.\n' +
    'Footage: Golden hour patio b-roll\n' +
    'Last posted: 6/14\n' +
    '\n' +
    '---\n' +
    '\n' +
    'Or one per line, fastest on a phone:\n' +
    'Bacchanalia | Westside | date night, tasting menu | Fine dining, book ahead\n' +
    'Ponce City Market | Old Fourth Ward | food hall, rooftop, group friendly\n' +
    '\n' +
    'Or just names:\n' +
    'Fox Bros Bar-B-Q\n' +
    'Krog Street Market\n';

  /* ------------------------------------------------------------ preview -- */

  function defaults() {
    return {
      type: $('#imp-type').value || '',
      neighborhood: ($('#imp-neighborhood').value || '').trim()
    };
  }

  var MODE_LABEL = {
    blocks: 'Reading it as full entries',
    table:  'Reading it as one place per line',
    names:  'Reading it as a list of names'
  };

  function statusPill(row) {
    if (row.status === 'merge') return el('span', { class: 'pill pill-amber', text: 'update' });
    if (row.status === 'skip') return el('span', { class: 'pill pill-quiet', text: 'skip' });
    if (row.status === 'duplicate-in-paste') return el('span', { class: 'pill pill-quiet', text: 'repeat' });
    return el('span', { class: 'pill pill-good', text: 'new' });
  }

  function renderPreview() {
    var text = $('#imp-text').value;
    var body = $('#imp-preview');
    var summary = $('#imp-summary');
    body.innerHTML = '';

    if (!text.trim()) {
      lastPlan = [];
      summary.textContent = '';
      body.appendChild(el('div', { class: 'import-empty' }, [
        el('p', { text: 'Paste on the left and everything you\'re about to add shows up here first.' }),
        el('p', { class: 'muted-xs', text: 'Nothing is saved until you press the button.' })
      ]));
      $('#imp-go').disabled = true;
      $('#imp-go').textContent = 'Add to library';
      return;
    }

    var parsed = CJ.importer.parse(text, defaults());
    lastPlan = CJ.importer.plan(parsed.records, { onDuplicate: $('#imp-dupes').value });

    var counts = { new: 0, merge: 0, skip: 0 };
    lastPlan.forEach(function (r) {
      if (r.status === 'new') counts.new++;
      else if (r.status === 'merge') counts.merge++;
      else counts.skip++;
    });

    summary.textContent = MODE_LABEL[parsed.mode] + ' · ' + lastPlan.length +
      ' place' + (lastPlan.length === 1 ? '' : 's') + ' found';

    if (!lastPlan.length) {
      body.appendChild(el('div', { class: 'import-empty' }, [
        el('p', { text: 'Nothing readable yet.' }),
        el('p', { class: 'muted-xs', text: 'Each place needs at least a name on its own line. Hit "Show me an example" if it helps.' })
      ]));
      $('#imp-go').disabled = true;
      $('#imp-go').textContent = 'Add to library';
      return;
    }

    lastPlan.forEach(function (row) {
      var rec = row.rec;
      var bits = [];
      if (rec.neighborhood) bits.push(rec.neighborhood);
      bits.push(CJ.ui.typeInfo(rec.type).label + (rec.typeGuessed ? ' (guessed)' : ''));
      if (rec.footage) bits.push('clip: ' + rec.footage);
      if (rec.lastPosted) bits.push('last posted ' + CJ.formatDate(rec.lastPosted, { month: 'short', day: 'numeric' }));
      if (rec.deadline) bits.push('by ' + CJ.formatDate(rec.deadline, { month: 'short', day: 'numeric' }));
      if (rec.platformFit) {
        var only = Object.keys(rec.platformFit).filter(function (p) { return rec.platformFit[p] === 'yes'; });
        if (only.length) bits.push('only ' + only.join(' + '));
      }

      var tagRow = rec.tags.length
        ? el('div', { class: 'import-tags' }, rec.tags.slice(0, 8).map(function (t) {
            return el('span', { class: 'tag tag-static', text: t });
          }).concat(rec.tags.length > 8 ? [el('span', { class: 'muted-xs', text: '+' + (rec.tags.length - 8) })] : []))
        : null;

      body.appendChild(el('div', { class: 'import-row is-' + row.status }, [
        el('div', { class: 'import-row-head' }, [
          el('strong', { text: rec.name }),
          el('span', { class: 'push' }),
          statusPill(row)
        ]),
        el('div', { class: 'import-meta', text: bits.join(' · ') }),
        tagRow,
        rec.notes ? el('div', { class: 'import-note', text: rec.notes.length > 160 ? rec.notes.slice(0, 160) + '…' : rec.notes }) : null,
        row.note ? el('div', { class: 'import-flag', text: row.note }) : null,
        rec.warnings.length ? el('div', { class: 'import-warn', text: rec.warnings.join(' ') }) : null
      ]));
    });

    var todo = counts.new + counts.merge;
    $('#imp-go').disabled = todo === 0;
    $('#imp-go').textContent = todo === 0
      ? 'Nothing to add'
      : (counts.new ? 'Add ' + counts.new : '') +
        (counts.new && counts.merge ? ' · ' : '') +
        (counts.merge ? 'Update ' + counts.merge : '');

    $('#imp-counts').textContent = counts.skip
      ? counts.skip + ' will be left alone.' : '';
  }

  /* --------------------------------------------------------------- open -- */

  function open() {
    lastResult = null;
    $('#imp-text').value = '';
    $('#imp-neighborhood').value = '';
    $('#imp-type').value = '';
    $('#imp-dupes').value = 'merge';
    $('#imp-result').hidden = true;
    $('#imp-form-wrap').hidden = false;
    fillNeighborhoodList();
    renderPreview();
    $('#import-modal').hidden = false;
    setTimeout(function () { $('#imp-text').focus(); }, 40);
  }

  function close() { $('#import-modal').hidden = true; }

  function fillNeighborhoodList() {
    var dl = $('#imp-neighborhood-list');
    dl.innerHTML = '';
    CJ.allNeighborhoods().forEach(function (n) { dl.appendChild(el('option', { value: n })); });
  }

  /* --------------------------------------------------------------- save -- */

  function run() {
    if (!lastPlan.length) return;
    var res = CJ.importer.apply(lastPlan);
    lastResult = res;

    $('#imp-form-wrap').hidden = true;
    var box = $('#imp-result');
    box.hidden = false;
    box.innerHTML = '';

    var parts = [];
    if (res.added) parts.push(res.added + ' place' + (res.added === 1 ? '' : 's') + ' added');
    if (res.merged) parts.push(res.merged + ' updated');
    if (res.skipped) parts.push(res.skipped + ' skipped');

    box.appendChild(el('div', { class: 'import-done' }, [
      el('h4', { text: parts.join(' · ') || 'Nothing changed' }),
      el('p', { class: 'muted-xs', text: 'Your calendar is out of date now — refresh it to work the new places in.' }),
      el('div', { class: 'import-done-actions' }, [
        el('button', {
          class: 'btn btn-primary', type: 'button', text: 'Refresh the calendar',
          onclick: function () { close(); CJ.app.showView('calendar'); CJ.calendarUI.refresh(true); }
        }),
        el('button', {
          class: 'btn', type: 'button', text: 'Add more',
          onclick: function () { open(); }
        }),
        el('button', {
          class: 'btn btn-ghost', type: 'button', text: 'See them in the library',
          onclick: function () { close(); CJ.app.showView('library'); }
        }),
        res.newIds.length ? el('button', {
          class: 'btn btn-danger-ghost', type: 'button',
          text: 'Undo (' + res.newIds.length + ')',
          onclick: function () {
            if (!CJ.ui.confirmDanger('Remove the ' + res.newIds.length + ' place' +
              (res.newIds.length === 1 ? '' : 's') + ' just added? Anything that was merged into a place you already had stays.')) return;
            CJ.importer.undo(res.newIds);
            toast('Undone.');
            close();
          }
        }) : null
      ])
    ]));

    CJ.calendarUI.markStale();
    CJ.library.render();
  }

  /* --------------------------------------------------------------- init -- */

  function init() {
    var btn = $('#btn-quick-add');
    if (btn) btn.addEventListener('click', open);

    $('#import-close').addEventListener('click', close);
    $('#imp-cancel').addEventListener('click', close);
    $('#imp-go').addEventListener('click', run);

    $('#import-modal').addEventListener('mousedown', function (e) {
      if (e.target === $('#import-modal')) close();
    });

    var t = null;
    $('#imp-text').addEventListener('input', function () {
      if (t) clearTimeout(t);
      t = setTimeout(renderPreview, 140);
    });
    ['#imp-type', '#imp-neighborhood', '#imp-dupes'].forEach(function (sel) {
      $(sel).addEventListener('input', renderPreview);
      $(sel).addEventListener('change', renderPreview);
    });

    $('#imp-example').addEventListener('click', function () {
      $('#imp-text').value = EXAMPLE;
      renderPreview();
      $('#imp-text').focus();
    });

    // Tab inside the textarea should indent a column, not jump focus — a
    // spreadsheet paste is tab separated and gets edited in place.
    $('#imp-text').addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || e.shiftKey) return;
      e.preventDefault();
      var s = this.selectionStart, en = this.selectionEnd;
      this.value = this.value.slice(0, s) + '\t' + this.value.slice(en);
      this.selectionStart = this.selectionEnd = s + 1;
      renderPreview();
    });
  }

  CJ.importUI = { init: init, open: open, close: close, renderPreview: renderPreview };

})(window.CJ);
