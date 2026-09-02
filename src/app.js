/* =========================================================================
   app.js — boot, tab routing, and the render fan-out.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var $ = CJ.ui.$, $$ = CJ.ui.$$;
  var current = 'library';

  function showView(name) {
    current = name;
    $$('.view').forEach(function (v) { v.classList.toggle('is-active', v.id === 'view-' + name); });
    $$('#tabs .tab').forEach(function (t) { t.classList.toggle('is-active', t.getAttribute('data-view') === name); });
    if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);

    if (name === 'week') {
      CJ.weekUI.render();
    } else if (name === 'calendar') {
      CJ.calendarUI.loadWeather();
      CJ.calendarUI.render();
    } else if (name === 'monthly') {
      CJ.monthlyUI.render();
    } else if (name === 'events') {
      CJ.eventsUI.render();
    } else if (name === 'settings') {
      CJ.settingsUI.render();
      CJ.syncUI.render();
    } else {
      CJ.library.render();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderAll() {
    CJ.weekUI.render();
    CJ.library.render();
    CJ.calendarUI.render();
    CJ.monthlyUI.render();
    CJ.eventsUI.render();
    CJ.settingsUI.render();
    CJ.syncUI.render();
  }

  function boot() {
    CJ.load();

    // A setup link from another device carries the Supabase connection in the
    // hash, so a new phone only has to sign in. Consume it before anything else
    // reads the hash for routing, and strip it so it isn't left in the address
    // bar or a bookmark.
    var hash = location.hash || '';
    var setupHandoff = false;
    if (hash.indexOf('#setup=') === 0) {
      setupHandoff = CJ.cloud.applySetupPayload(hash.slice(7));
      history.replaceState(null, '', location.pathname + location.search + '#settings');
    }

    CJ.library.init();
    CJ.layersUI.init();
    CJ.importUI.init();
    CJ.weekUI.init();
    CJ.calendarUI.init();
    CJ.monthlyUI.init();
    CJ.eventsUI.init();
    CJ.settingsUI.init();
    CJ.syncUI.init();

    $$('#tabs .tab').forEach(function (t) {
      t.addEventListener('click', function () { showView(t.getAttribute('data-view')); });
    });

    // Re-render whatever's on screen whenever the data changes.
    CJ.subscribe(function () {
      if (current === 'week') CJ.weekUI.render();
      else if (current === 'library') CJ.library.render();
      else if (current === 'calendar') CJ.calendarUI.render();
      else if (current === 'monthly') CJ.monthlyUI.render();
      else if (current === 'events') CJ.eventsUI.render();
      else if (current === 'settings') { CJ.settingsUI.render(); CJ.syncUI.render(); }
    });

    renderAll();
    var start = (location.hash || '').slice(1);
    var known = ['week', 'library', 'calendar', 'monthly', 'events', 'settings'];
    // Land on This Week once there's a calendar to act on; on the Library while
    // it's still being built, since that's where the work is then.
    var fallback = CJ.getIdeas().length ? 'week' : 'library';
    showView(known.indexOf(start) !== -1 ? start : fallback);

    if (setupHandoff) {
      CJ.ui.toast('Connected to your database. Sign in below and your library appears.');
    }

    // First run with content but no calendar yet — build one so it isn't empty.
    if (CJ.getItems().length && !CJ.getIdeas().length) {
      CJ.calendarUI.refresh(true);
    }

    // Cloud sync last, so it can render over whatever the local cache showed.
    CJ.sync.start();

    window.addEventListener('beforeunload', function () { CJ.save(true); });
  }

  CJ.app = { showView: showView, renderAll: renderAll };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window.CJ);
