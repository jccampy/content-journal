/* =========================================================================
   gaps.js — what to shoot next.

   The calendar only schedules what your library can actually support, which
   means the interesting question is the inverse: what is it *not* able to
   schedule, and what would you have to film to unlock it?

   Everything here is derived. No stored state.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var MIN = 2;   // matches an occasion needs before it can be scheduled

  function monthsAhead(n) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    return { from: today, to: new Date(today.getFullYear(), today.getMonth() + n, 0) };
  }

  /* ---------- 1. Atlanta dates you can't cover ---------- */

  function uncoveredDates(months) {
    var range = monthsAhead(months || 6);
    var disabled = CJ.settings().disabledBuiltinEvents || [];
    var occs = CJ.atlanta.occurrencesBetween(range.from, range.to, disabled);

    var out = [];
    occs.forEach(function (o) {
      if (o.kind === 'custom') return;
      var n = CJ.generator.coverageFor(o);
      if (n >= MIN) return;
      out.push({
        id: o.id, name: o.name, date: CJ.isoDate(o.date), approx: !!o.approx,
        have: n, need: MIN, angles: (o.angles || []).slice(0, 4), types: o.types
      });
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return out;
  }

  /** Angles that keep coming up across the dates you can't cover. */
  function angleDemand(uncovered) {
    var counts = {};
    uncovered.forEach(function (u) {
      u.angles.forEach(function (a) {
        var k = String(a).toLowerCase().trim();
        if (!k) return;
        (counts[k] = counts[k] || { angle: a, dates: [] }).dates.push(u.name);
      });
    });
    return Object.keys(counts)
      .map(function (k) { return counts[k]; })
      .filter(function (c) { return c.dates.length >= 2; })
      .sort(function (a, b) { return b.dates.length - a.dates.length; })
      .slice(0, 8);
  }

  /* ---------- 2. Themes that can't fire ---------- */

  function starvedThemes() {
    var items = CJ.getItems();
    var out = [];
    CJ.themes.THEMES.forEach(function (theme) {
      if (theme.byNeighborhood) return;   // handled separately
      var pool = items.filter(function (it) { return CJ.generator.itemMatchesTheme(it, theme); });
      var need = theme.min || 1;
      if (pool.length >= need) return;
      out.push({
        id: theme.id,
        title: String(theme.title).replace(/\{[^}]+\}/g, '…'),
        have: pool.length,
        need: need,
        wants: ((theme.match || {}).anyTags || []).slice(0, 5),
        types: (theme.match || {}).types || null,
        months: theme.months
      });
    });
    // Closest to unlocking first — one more place is a better ask than five.
    out.sort(function (a, b) { return (a.need - a.have) - (b.need - b.have); });
    return out;
  }

  /* ---------- 3. Neighborhoods too thin for a guide ---------- */

  function thinNeighborhoods() {
    var counts = {};
    CJ.getItems().forEach(function (it) {
      if (!it.neighborhood) return;
      counts[it.neighborhood] = (counts[it.neighborhood] || 0) + 1;
    });
    return Object.keys(counts)
      .map(function (n) { return { neighborhood: n, have: counts[n], need: 3 }; })
      .filter(function (n) { return n.have < 3; })
      .sort(function (a, b) { return b.have - a.have; });
  }

  /* ---------- 4. Housekeeping on the library itself ---------- */

  function libraryIssues() {
    var items = CJ.getItems();
    var out = [];

    var untagged = items.filter(function (i) { return !(i.tags || []).length; });
    if (untagged.length) {
      out.push({
        kind: 'untagged',
        headline: untagged.length + ' place' + (untagged.length === 1 ? '' : 's') + ' with no tags',
        detail: 'The generator can only group by tags you actually applied, so these barely ever get picked.',
        items: untagged.slice(0, 8)
      });
    }

    var noNotes = items.filter(function (i) { return !i.notes && (i.tags || []).length < 3; });
    if (noNotes.length) {
      out.push({
        kind: 'thin',
        headline: noNotes.length + ' place' + (noNotes.length === 1 ? '' : 's') + ' with very little to go on',
        detail: 'Under three tags and no notes. A sentence about what it is good for goes a long way.',
        items: noNotes.slice(0, 8)
      });
    }

    var noHood = items.filter(function (i) { return !i.neighborhood && i.type !== 'home'; });
    if (noHood.length) {
      out.push({
        kind: 'nohood',
        headline: noHood.length + ' without a neighborhood',
        detail: 'Neighborhood guides are some of the strongest posts, and these can never be in one.',
        items: noHood.slice(0, 8)
      });
    }

    var wornOut = items.filter(function (i) {
      return (i.postCount || 0) >= 4 && !CJ.unusedLayers(i).length;
    });
    if (wornOut.length) {
      out.push({
        kind: 'worn',
        headline: wornOut.length + ' you have run four or more times',
        detail: 'Nothing unused left on these. Worth a fresh shoot if you still love them, or leave them to rest.',
        items: wornOut.slice(0, 8)
      });
    }

    return out;
  }

  /* ---------- 5. Platforms running dry ---------- */

  function platformBalance(months) {
    var counts = { tiktok: 0, instagram: 0, pinterest: 0 };
    CJ.getDrops().forEach(function (e) {
      if (e.drop.status === 'dismissed') return;
      counts[e.drop.platform] = (counts[e.drop.platform] || 0) + 1;
    });

    var eligible = { tiktok: 0, instagram: 0, pinterest: 0 };
    CJ.getItems().forEach(function (it) {
      CJ.PLATFORM_IDS.forEach(function (p) {
        if (CJ.itemAllowsPlatform(it, p)) eligible[p]++;
      });
    });

    return CJ.PLATFORM_IDS.map(function (p) {
      return { platform: p, scheduled: counts[p] || 0, eligible: eligible[p] || 0 };
    });
  }

  /* ---------- the report ---------- */

  function report(months) {
    months = months || 6;
    var uncovered = uncoveredDates(months);
    return {
      months: months,
      uncovered: uncovered,
      demand: angleDemand(uncovered),
      starved: starvedThemes(),
      thinHoods: thinNeighborhoods(),
      issues: libraryIssues(),
      balance: platformBalance(months)
    };
  }

  CJ.gaps = {
    report: report,
    uncoveredDates: uncoveredDates,
    starvedThemes: starvedThemes,
    MIN: MIN
  };

})(window.CJ);
