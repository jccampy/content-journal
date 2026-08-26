/* =========================================================================
   ui-events.js — your own key dates, plus toggles for the built-in Atlanta ones.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var $ = CJ.ui.$, el = CJ.ui.el, toast = CJ.ui.toast;

  function openEventForm(id) {
    var ev = null;
    if (id) {
      CJ.getEvents().forEach(function (e) { if (e.id === id) ev = e; });
    }
    $('#event-modal-title').textContent = ev ? 'Edit event' : 'Add event';
    $('#e-id').value = ev ? ev.id : '';
    $('#e-name').value = ev ? ev.name : '';
    $('#e-date').value = ev ? ev.date : '';
    $('#e-repeat').value = ev ? (ev.repeat || 'no') : 'no';
    $('#e-angle').value = ev ? (ev.angle || '') : '';
    $('#e-tags').value = ev ? (ev.tags || '') : '';
    $('#e-delete').hidden = !ev;
    $('#event-modal').hidden = false;
    setTimeout(function () { $('#e-name').focus(); }, 40);
  }

  function saveEvent(e) {
    e.preventDefault();
    var name = $('#e-name').value.trim();
    var raw = ($('#e-date').value || '').trim();
    var date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
    if (!name) { toast('Give the event a name.', 'error'); return; }
    if (!date) { toast('An event needs a full date — that is the whole point of it.', 'error'); $('#e-date').focus(); return; }
    CJ.upsertEvent({
      id: $('#e-id').value || undefined,
      name: name,
      date: date,
      repeat: $('#e-repeat').value,
      angle: $('#e-angle').value.trim(),
      tags: $('#e-tags').value.trim()
    });
    $('#event-modal').hidden = true;
    toast('Saved. Refresh the calendar to work it in.');
    CJ.calendarUI.markStale();
    render();
  }

  function render() {
    if (!CJ.state) return;

    /* --- your events --- */
    var box = $('#events-body');
    box.innerHTML = '';
    var evs = CJ.getEvents().slice().sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });

    if (!evs.length) {
      box.appendChild(el('div', { class: 'empty', style: { padding: '30px 18px' } }, [
        el('p', { text: 'Nothing yet. Add a trip, an opening, a brand deadline, anything the calendar should plan around.' }),
        el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: '+ Add event', onclick: function () { openEventForm(); } })
      ]));
    } else {
      evs.forEach(function (ev) {
        box.appendChild(el('div', { class: 'event-row' }, [
          el('span', { class: 'ev-date', text: CJ.formatDate(ev.date, { month: 'short', day: 'numeric', year: 'numeric' }) }),
          el('span', { class: 'ev-name', text: ev.name }),
          ev.repeat === 'yes' ? el('span', { class: 'pill pill-quiet', text: '↻ yearly' }) : null,
          ev.angle ? el('span', { class: 'ev-angle', text: '· ' + ev.angle }) : null,
          el('span', { class: 'push' }),
          el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Edit', onclick: function () { openEventForm(ev.id); } })
        ]));
      });
    }

    /* --- built-in Atlanta calendar --- */
    var bi = $('#builtin-events-body');
    bi.innerHTML = '';
    var disabled = CJ.settings().disabledBuiltinEvents || [];

    var all = CJ.atlanta.HOLIDAYS.map(function (h) {
      var d = h.date(new Date().getFullYear());
      return { id: h.id, name: h.name, month: d.getMonth() + 1, day: d.getDate(), kind: 'holiday',
               angles: h.angles, types: h.types };
    }).concat(CJ.atlanta.EVENTS.map(function (e) {
      return { id: e.id, name: e.name, month: e.month, day: e.day, kind: 'event', approx: e.approx,
               angles: e.angles, types: e.types };
    }));

    all.sort(function (a, b) { return a.month - b.month || a.day - b.day; });

    var list = el('div', { class: 'builtin-list' });
    all.forEach(function (o) {
      var on = disabled.indexOf(o.id) === -1;
      var cb = el('input', {
        type: 'checkbox', checked: on,
        onchange: function () {
          var d = (CJ.settings().disabledBuiltinEvents || []).slice();
          var ix = d.indexOf(o.id);
          if (this.checked) { if (ix !== -1) d.splice(ix, 1); }
          else if (ix === -1) d.push(o.id);
          CJ.updateSettings({ disabledBuiltinEvents: d });
          CJ.calendarUI.markStale();
        }
      });
      var dateLabel = new Date(2000, o.month - 1, o.day)
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      // How many places in the library actually fit this date. Below the
      // threshold it will never be scheduled — showing the number makes that
      // obvious instead of mysterious.
      var n = CJ.generator.coverageFor(o);
      var min = CJ.generator.MIN_OCCASION_MATCHES;
      var covered = n >= min;

      list.appendChild(el('label', { class: 'builtin-row' + (covered ? '' : ' is-uncovered') }, [
        cb,
        el('span', { class: 'bi-date', text: (o.approx ? '~' : '') + dateLabel }),
        el('span', { text: o.name }),
        el('span', { class: 'push' }),
        covered
          ? el('span', { class: 'pill pill-good', text: n + ' match' + (n === 1 ? '' : 'es') })
          : el('span', {
              class: 'pill pill-quiet',
              text: n ? n + ' match — needs ' + min : 'no content',
              title: 'Skipped until at least ' + min + ' places in your library fit it. Tag content for: ' +
                     ((o.angles || []).slice(0, 3).join(', ') || o.name)
            })
      ]));
    });
    bi.appendChild(list);
  }

  function init() {
    $('#btn-add-event').addEventListener('click', function () { openEventForm(); });
    $('#event-modal-close').addEventListener('click', function () { $('#event-modal').hidden = true; });
    $('#e-cancel').addEventListener('click', function () { $('#event-modal').hidden = true; });
    $('#event-form').addEventListener('submit', saveEvent);
    $('#event-modal').addEventListener('mousedown', function (e) {
      if (e.target === $('#event-modal')) $('#event-modal').hidden = true;
    });
    $('#e-delete').addEventListener('click', function () {
      var id = $('#e-id').value;
      if (!id) return;
      if (!CJ.ui.confirmDanger('Delete this event?')) return;
      CJ.deleteEvent(id);
      $('#event-modal').hidden = true;
      render();
      toast('Deleted.');
    });
  }

  CJ.eventsUI = { init: init, render: render };

})(window.CJ);
