/* =========================================================================
   ui-layers.js — adding and editing layers of footage under a place.

   A place is permanent; footage accumulates under it. "Add footage" never
   overwrites what's already there — it stacks a new clip alongside the old
   ones, with its own notes, its own usage history, and its own deadline.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var $ = CJ.ui.$, el = CJ.ui.el, toast = CJ.ui.toast;

  var ctx = { itemId: null, layerId: null, firstRun: false };

  function open(itemId, layerId, opts) {
    opts = opts || {};
    var item = CJ.getItem(itemId);
    if (!item) return;

    var layer = layerId ? CJ.getLayer(item, layerId) : null;
    ctx = { itemId: itemId, layerId: layer ? layer.id : null, firstRun: !!opts.firstRun };

    $('#layer-modal-title').textContent = layer
      ? (opts.firstRun ? 'What footage do you have?' : 'Edit footage')
      : 'Add footage';

    $('#l-context').textContent = opts.firstRun
      ? 'Saved "' + item.name + '". Now describe what you actually shot there — you can add more clips to it any time without touching this one.'
      : item.name + (item.neighborhood ? ' · ' + item.neighborhood : '') +
        ' — ' + (item.layers || []).length + ' clip' + ((item.layers || []).length === 1 ? '' : 's') + ' on file.';

    $('#l-item-id').value = itemId;
    $('#l-id').value = layer ? layer.id : '';
    $('#l-label').value = layer && !opts.firstRun ? layer.label : '';
    $('#l-captured').value = layer && layer.capturedAt ? layer.capturedAt : '';
    // Blank, not zero — nothing has been posted until you say so.
    $('#l-postcount').value = layer && layer.postCount ? String(layer.postCount) : '';
    $('#l-lastposted').value = layer && layer.lastPosted ? layer.lastPosted : '';
    $('#l-notes').value = layer ? layer.notes : '';
    $('#l-tags').value = layer && layer.tags ? layer.tags.join(', ') : '';

    var hasD = !!(layer && layer.deadline);
    $('#l-has-deadline').checked = hasD;
    $('#l-deadline-fields').hidden = !hasD;
    $('#l-deadline').value = layer && layer.deadline ? layer.deadline : '';
    $('#l-deadline-note').value = layer ? layer.deadlineNote : '';
    $('#l-priority').value = layer ? layer.priority : 'normal';

    // A place must keep at least one clip, and the very first one isn't
    // deletable because it is the place's only footage.
    $('#l-delete').hidden = !layer || (item.layers || []).length <= 1;

    $('#layer-modal').hidden = false;
    setTimeout(function () { $('#l-label').focus(); }, 40);
  }

  function close() { $('#layer-modal').hidden = true; }

  function save(e) {
    e.preventDefault();
    var itemId = $('#l-item-id').value;
    var layerId = $('#l-id').value;
    var label = $('#l-label').value.trim();
    if (!label) { toast('Give the footage a short name.', 'error'); return; }

    // Dates are all optional. A partially typed date comes back as '' from the
    // browser, so treat anything that isn't a full YYYY-MM-DD as simply blank
    // rather than blocking the save.
    function dateVal(sel) {
      var v = ($(sel).value || '').trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
    }

    var hasD = $('#l-has-deadline').checked;
    var deadline = hasD ? dateVal('#l-deadline') : null;
    if (hasD && !deadline) {
      toast('You ticked "needs to go up by" — pick the date, or untick it.', 'error');
      $('#l-deadline').focus();
      return;
    }

    // Empty means zero, and a last-posted date implies at least one use.
    var raw = $('#l-postcount').value.trim();
    var postCount = raw === '' ? 0 : Math.max(0, Number(raw) || 0);
    var lastPosted = dateVal('#l-lastposted');
    if (lastPosted && postCount === 0) postCount = 1;

    var data = {
      label: label,
      capturedAt: dateVal('#l-captured'),
      notes: $('#l-notes').value.trim(),
      tags: CJ.canonicalList($('#l-tags').value.split(',')),
      postCount: postCount,
      lastPosted: lastPosted,
      deadline: deadline,
      deadlineNote: hasD ? $('#l-deadline-note').value.trim() : '',
      priority: hasD ? $('#l-priority').value : 'normal'
    };

    if (layerId) {
      CJ.updateLayer(itemId, layerId, data);
      // Layer tags are searchable on the place, so fold any new ones up.
      var item = CJ.getItem(itemId);
      var changed = false;
      data.tags.forEach(function (t) {
        if (item.tags.indexOf(t) === -1) { item.tags.push(t); changed = true; }
      });
      if (changed) { CJ.registerTags(item); CJ.commit(); }
      toast('Footage updated.');
    } else {
      CJ.addLayer(itemId, data);
      toast('Footage added. Refresh the calendar to work it in.');
    }

    close();
    CJ.calendarUI.markStale();
    CJ.library.render();
    // Keep the place form in step if it's open behind this.
    if (!$('#modal').hidden) CJ.library.openForm(itemId);
  }

  function remove() {
    var itemId = $('#l-item-id').value, layerId = $('#l-id').value;
    if (!itemId || !layerId) return;
    var item = CJ.getItem(itemId);
    var layer = CJ.getLayer(item, layerId);
    if (!CJ.ui.confirmDanger('Delete "' + (layer ? layer.label : 'this footage') + '"? The place itself stays.')) return;
    CJ.deleteLayer(itemId, layerId);
    close();
    toast('Footage deleted.');
    CJ.library.render();
    if (!$('#modal').hidden) CJ.library.openForm(itemId);
  }

  function init() {
    $('#layer-close').addEventListener('click', close);
    $('#l-cancel').addEventListener('click', close);
    $('#l-delete').addEventListener('click', remove);
    $('#layer-form').addEventListener('submit', save);
    $('#layer-modal').addEventListener('mousedown', function (e) {
      if (e.target === $('#layer-modal')) close();
    });
    $('#l-has-deadline').addEventListener('change', function () {
      $('#l-deadline-fields').hidden = !this.checked;
      if (this.checked && !$('#l-deadline').value) {
        var d = new Date(); d.setDate(d.getDate() + 21);
        $('#l-deadline').value = CJ.isoDate(d);
        $('#l-deadline').focus();
      }
    });
    var addBtn = $('#btn-add-layer');
    if (addBtn) addBtn.addEventListener('click', function () {
      var id = $('#f-id').value;
      if (id) open(id);
    });
  }

  CJ.layersUI = { init: init, open: open, close: close };

})(window.CJ);
