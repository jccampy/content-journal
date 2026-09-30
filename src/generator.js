/* =========================================================================
   generator.js — turns the library + the Atlanta calendar into dated ideas.

   Rules it follows, in priority order:
     1. Anything with a hard deadline gets placed first, before its due date.
     2. Real dated occasions (holidays, festivals) get placed next, with lead time.
     3. Everything else fills the month from the highest-scoring themes.
     4. Anything you've touched (planned / posted / dismissed / edited / pinned)
        is never moved or overwritten by a refresh.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var tagMatches = CJ.themes.tagMatches;

  /* ---------- small helpers ---------- */

  function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

  function seasonOf(m) { return CJ.atlanta.monthInfo(m).season; }

  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }

  function clampDate(d, min, max) {
    if (min && d < min) d = new Date(min.getTime());
    if (max && d > max) d = new Date(max.getTime());
    return d;
  }

  function fill(str, ctx) {
    return String(str)
      .replace(/\{n\}/g, ctx.n != null ? ctx.n : 'a few')
      .replace(/\{season\}/g, ctx.season || '')
      .replace(/\{month\}/g, ctx.month || '')
      .replace(/\{neighborhood\}/g, ctx.neighborhood || 'the neighborhood')
      .replace(/\{name\}/g, ctx.name || '')
      .replace(/\{items\}/g, ctx.items || '');
  }

  function uniq(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (x) { var k = String(x).toLowerCase(); if (!seen[k]) { seen[k] = 1; out.push(x); } });
    return out;
  }

  function titleCase(s) {
    return String(s || '').replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
  }

  function listNames(items) {
    var names = items.map(function (i) { return i.name; });
    if (names.length <= 1) return names[0] || '';
    if (names.length === 2) return names[0] + ' and ' + names[1];
    return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
  }

  /* ---------- matching ---------- */

  /**
   * Everything about a place that a theme or an occasion can match against —
   * its tags, its neighborhood, its name, its notes, and the label and notes on
   * each layer of footage. Notes matter: if you wrote "great downtown view" on
   * a place, a downtown guide should find it.
   */
  function searchBag(item) {
    var bag = (item.tags || []).slice();
    if (item.neighborhood) bag.push(item.neighborhood);
    if (item.name) bag.push(item.name);
    if (item.notes) bag.push(item.notes);
    // What its own website says it is ("rooftop bar with brunch") is fair
    // game for matching it to themes and occasions.
    if (item.web && item.web.summary) bag.push(item.web.summary);
    (item.layers || []).forEach(function (l) {
      if (l.label) bag.push(l.label);
      if (l.notes) bag.push(l.notes);
      (l.tags || []).forEach(function (t) { bag.push(t); });
    });
    return bag;
  }

  /**
   * Is this neighborhood the event's area? Whole-name match only. The old
   * substring test put West Midtown inside "Midtown" (and would have put
   * Downtown Decatur inside "Downtown"), so a Midtown guide listed West
   * Midtown spots. "Old Fourth Ward" still matches "old 4th ward"-style
   * spellings via the normaliser.
   */
  function sameArea(hood, area) {
    function norm(x) {
      return String(x || '').toLowerCase().replace(/&/g, 'and').replace(/\b4th\b/g, 'fourth')
        .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    return !!hood && norm(hood) === norm(area);
  }

  /** Neighborhood names that appear in an occasion's angles. */
  function neighborhoodsIn(text, known) {
    var t = String(text || '').toLowerCase();
    var hits = [];
    known.forEach(function (n) {
      var ln = String(n).toLowerCase();
      if (ln.length < 4) return;
      if (t.indexOf(ln) !== -1 && hits.indexOf(n) === -1) hits.push(n);
    });
    return hits;
  }

  function itemMatchesTheme(item, theme) {
    var m = theme.match || {};
    if (m.types && m.types.indexOf(item.type) === -1) return false;

    var tags = searchBag(item);

    if (m.allTags && m.allTags.length) {
      for (var i = 0; i < m.allTags.length; i++) if (!tagMatches(tags, m.allTags[i])) return false;
    }
    if (m.notTags && m.notTags.length) {
      for (var j = 0; j < m.notTags.length; j++) if (tagMatches(tags, m.notTags[j])) return false;
    }
    if (m.anyTags && m.anyTags.length) {
      var hit = false;
      for (var k = 0; k < m.anyTags.length; k++) if (tagMatches(tags, m.anyTags[k])) { hit = true; break; }
      if (!hit) return false;
    }
    if (theme.requireNeverPosted && item.lastPosted) return false;
    if (theme.requireStale) {
      if (!item.lastPosted) return true; // never posted is maximally stale
      if (CJ.daysSince(item.lastPosted) < theme.requireStale) return false;
    }
    return true;
  }

  /** How much unused life this piece of content has. Higher = pick me. */
  function itemScore(item, ctx) {
    var s = 0;
    var platform = ctx.platform || null;

    // Recency is measured on the platform this post is going to, since the
    // rule and the audience are both per platform.
    var last = platform ? CJ.lastPostedOn(item, platform) : item.lastPosted;

    if (!last) s += 90;                          // never used here — top of the pile
    else {
      var d = CJ.daysSince(last);
      s += Math.min(d, 400) * 0.22;              // the longer since, the more due
      if (d < ctx.cooldown) s -= (ctx.cooldown - d) * 0.8; // inside cooldown = push away
    }

    // Fresh footage you've never posted makes a place worth revisiting even if
    // the place itself has been featured before.
    var unused = CJ.unusedLayers(item).length;
    if (unused) s += 45 + Math.min(unused, 3) * 10;

    // Cadence mode, building a roundup: a place that can carry its own post is
    // worth more alone, so roundups lean on the places that can't.
    if (ctx.roundup && item.solo) s -= 35;

    // Something you've already run four times is less fresh than something
    // you've run once, even if both were a year ago.
    s -= Math.min(platform ? CJ.postCountOn(item, platform) : (item.postCount || 0), 6) * 12;

    if (item.deadline) {
      var left = CJ.daysBetween(new Date(), CJ.parseDate(item.deadline));
      if (left >= 0 && left < 90) s += (90 - left) * 0.6;
      if (item.priority === 'high') s += 40;
    }

    // Freshly added things are exciting.
    var age = CJ.daysBetween(new Date(item.createdAt), new Date());
    if (age <= 21) s += 25 - age;

    // Don't stack the same place into five posts in one refresh.
    s -= (ctx.used[item.id] || 0) * 55;

    return s;
  }

  function pickItems(pool, theme, ctx, limitOverride) {
    var max = limitOverride || theme.max || 4;
    var scored = pool.map(function (it) { return { it: it, s: itemScore(it, ctx) }; });
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored.slice(0, max).map(function (x) { return x.it; });
  }

  /* ---------- spacing: the hard rule ---------- */

  /**
   * Tracks every date each place is booked for — real past posts and everything
   * already on the calendar. The generator will not place a place within its
   * minimum gap of any of them. This is a floor, not a preference: unlike the
   * cooldown, no score can outweigh it.
   */
  function makeSpacer() {
    var uses = {}; // "itemId|platform" -> [ms timestamps]

    function key(itemId, platform) { return itemId + '|' + platform; }

    function record(itemId, platform, isoDate) {
      var d = CJ.parseDate(isoDate);
      if (!d) return;
      var k = key(itemId, platform);
      (uses[k] = uses[k] || []).push(d.getTime());
    }

    /** Days to the nearest other use of this place ON THIS PLATFORM. */
    function nearest(itemId, platform, isoDate) {
      var list = uses[key(itemId, platform)];
      if (!list || !list.length) return null;
      var t = CJ.parseDate(isoDate);
      if (!t) return null;
      t = t.getTime();
      var best = null;
      for (var i = 0; i < list.length; i++) {
        var gap = Math.abs(Math.round((list[i] - t) / 86400000));
        if (best === null || gap < best) best = gap;
      }
      return best;
    }

    function allows(item, platform, isoDate) {
      var need = CJ.minGapFor(item);
      if (!need) return true;
      var got = nearest(item.id, platform, isoDate);
      return got === null || got >= need;
    }

    return { record: record, nearest: nearest, allows: allows, uses: uses };
  }

  /* ---------- platforms ---------- */

  /**
   * Which platforms this line-up can go to at all.
   *
   * A platform qualifies when at least one of the places is allowed there —
   * and a place marked "never" for a platform is excluded from that platform's
   * drop entirely, further down in buildDrops. Not every piece of content
   * belongs everywhere, and forcing it does more harm than a missing post.
   */
  function platformsFor(items, theme, settings) {
    var rules = settings.platformRules || {};
    var out = {};

    CJ.PLATFORM_IDS.forEach(function (p) {
      if (items.some(function (it) { return CJ.itemPostsOn(it, p); })) out[p] = true;
    });

    // An itinerary or a day-in-the-life is Atlanta lifestyle content, which is
    // TikTok's lane — even when every stop on it is a restaurant. But an
    // explicit "never on TikTok" on the places still wins.
    if (theme && (theme.format === 'guide' || theme.format === 'vlog')) {
      var anyOkOnTikTok = items.some(function (it) { return CJ.fitFor(it, 'tiktok') !== 'no'; });
      if (anyOkOnTikTok && CJ.platformActive('tiktok') &&
          (!rules.experience || rules.experience.tiktok !== false)) out.tiktok = true;
    }

    return CJ.PLATFORM_IDS.filter(function (p) { return out[p]; });
  }

  /* ---------- rollout: one concept becomes several dated posts ---------- */

  var FORMATS = {
    video:    { label: 'Video',    emoji: '🎬', hint: 'Vertical video' },
    reel:     { label: 'Reel',     emoji: '🎬', hint: 'Vertical video' },
    carousel: { label: 'Carousel', emoji: '🖼', hint: 'Swipeable stills — one per place' },
    photo:    { label: 'Photo',    emoji: '📷', hint: 'Single still' },
    pins:     { label: 'Pins',     emoji: '📌', hint: 'One pin per place, each linking back to the video' }
  };

  function dominantType(items) {
    var counts = {};
    items.forEach(function (i) { counts[i.type] = (counts[i.type] || 0) + 1; });
    var best = null, n = -1;
    Object.keys(counts).forEach(function (t) { if (counts[t] > n) { n = counts[t]; best = t; } });
    return best || 'restaurant';
  }

  /** Which platform this concept leads on — food leads on IG, Atlanta on TikTok. */
  function leadPlatformFor(items, settings) {
    var lead = (settings.rollout && settings.rollout.leadBy) || {};
    var want = lead[dominantType(items)] || 'instagram';
    if (CJ.platformActive(want)) return want;
    // That lane is paused — lead on an active platform these places belong on.
    var active = CJ.PLATFORM_IDS.filter(CJ.platformActive);
    for (var i = 0; i < active.length; i++) {
      if ((items || []).some(function (it) { return CJ.itemPostsOn(it, active[i]); })) return active[i];
    }
    return active[0] || want;
  }

  /**
   * Format per platform. A roundup big enough to be worth swiping through is a
   * carousel; a tighter group is a reel. Pinterest is always a set of pins, one
   * per place, pointing back at the video.
   */
  function formatFor(platform, count, theme, settings, items) {
    if (platform === 'pinterest') return 'pins';
    if (platform === 'tiktok') return 'video';
    // Any photos-only place in the line-up means Instagram gets stills: a
    // carousel (a single place's photos are a carousel too).
    if ((items || []).some(function (it) { return it && it.photosOnly; })) return 'carousel';
    if (theme && (theme.format === 'single' || theme.format === 'vlog' || theme.format === 'split')) return 'reel';
    return count >= (settings.carouselMinItems || 5) ? 'carousel' : 'reel';
  }

  /**
   * Stagger one concept across its platforms instead of dumping it everywhere
   * at once. The lead platform goes first, the rest follow a couple of days
   * apart, and Pinterest is always last — those pins link to the video, so the
   * video has to exist first.
   *
   * Each drop re-checks the spacing rule for its own platform and date, and a
   * platform is simply skipped if too many of the places are still resting there.
   */
  function buildDrops(ideaId, chosen, theme, baseDate, settings, spacer, slots, reservedFor) {
    var platforms = platformsFor(chosen, theme, settings);
    if (!platforms.length || !chosen.length) return [];

    var lead = leadPlatformFor(chosen, settings);
    var pinLast = !settings.rollout || settings.rollout.pinterestLast !== false;
    var gap = (settings.rollout && settings.rollout.gapDays != null) ? settings.rollout.gapDays : 2;

    var order = [];
    if (platforms.indexOf(lead) !== -1) order.push(lead);
    platforms.forEach(function (p) {
      if (p === 'pinterest' && pinLast) return;
      if (order.indexOf(p) === -1) order.push(p);
    });
    if (pinLast && platforms.indexOf('pinterest') !== -1) order.push('pinterest');

    var start = CJ.parseDate(baseDate);
    var drops = [];
    var reservedUsed = false;
    var minKeep = Math.max(1, Math.ceil(chosen.length / 2));

    order.forEach(function (p, i) {
      var date = CJ.isoDate(addDays(start, i * gap));
      var booked = false, usingReserved = false;
      // Cadence mode: every drop takes a real slot on its own platform. The
      // caller already booked baseDate for `reservedFor`; the rest find the
      // next free slot on their own platform.
      if (slots && slots.on) {
        if (p === reservedFor && !reservedUsed) { date = baseDate; usingReserved = true; }
        else {
          date = slots.place(CJ.parseDate(date), CJ.parseDate(date), addDays(CJ.parseDate(date), 10), p);
          if (!date) return;
          booked = true;
        }
      }
      var free = chosen.filter(function (it) {
        if (!CJ.itemPostsOn(it, p)) return false;        // wrong home, or a paused platform
        if (!CJ.usableOn(it, date)) return false;        // on hold, or out of season on this date
        return spacer.allows(it, p, date);
      });
      if (free.length < minKeep) {                         // too little of the line-up belongs here
        if (booked) slots.release(p, date);
        return;
      }
      // A post of ONE place needs a place you marked "enough for its own
      // post". Otherwise it only goes out alongside others. Deadlines are
      // exempt: a commitment gets posted either way.
      if (free.length === 1 && !free[0].solo && !(theme && theme.allowSingle)) {
        if (booked) slots.release(p, date);
        return;
      }
      if (usingReserved) reservedUsed = true;

      var layerByItem = {};
      free.forEach(function (it) {
        var l = CJ.bestLayerFor(it, p, date);
        if (l) layerByItem[it.id] = l.id;
      });

      drops.push({
        id: ideaId + '::' + p,
        platform: p,
        format: formatFor(p, free.length, theme, settings, free),
        date: date,
        itemIds: free.map(function (it) { return it.id; }),
        layerByItem: layerByItem,
        linksTo: (p === 'pinterest' && drops.length) ? drops[0].platform : null,
        status: 'suggested',
        pinned: false,
        touched: false,
        notes: ''
      });

      free.forEach(function (it) { spacer.record(it.id, p, date); });
    });
    // The caller's slot went unused (that platform dropped out): give it back.
    if (slots && slots.on && reservedFor && !reservedUsed) slots.release(reservedFor, baseDate);
    return drops;
  }

  /* ---------- caption starters ---------- */

  function buildCaptions(theme, items, ctx) {
    var names = listNames(items);
    var caps = [];
    if (theme.format === 'roundup' || theme.format === 'guide') {
      caps.push('Saving you the scroll — ' + (items.length ? names : 'the full list') + '. Which one are you doing first?');
      caps.push('Full list in order: ' + items.map(function (i, n) { return (n + 1) + '. ' + i.name; }).join('  ') + '  📍 all in Atlanta');
    } else if (theme.format === 'split') {
      caps.push('The going-out version vs. the staying-in version. Tell me which one you\'d pick.');
      caps.push('I tried to recreate ' + (items[0] ? items[0].name : 'it') + ' at home. Verdict below 👇');
    } else if (theme.format === 'vlog') {
      caps.push('An unedited hour of my actual ' + (ctx.season || '') + ' weekend.');
      caps.push('Come with me — ' + names + '.');
    } else {
      caps.push(names + '. Notes and details below 👇');
      caps.push('Everything I love about this one, in 30 seconds.');
    }
    caps.push('Save this for the next time someone asks you where to go in Atlanta.');
    return caps.slice(0, 3);
  }

  function buildHooks(theme, items, ctx) {
    var pool = (theme.hooks || []).slice();
    var out = [];
    var n = Math.min(3, pool.length);
    // Rotate the starting point so refreshes don't always surface the same line.
    var start = ctx.hookRotation % (pool.length || 1);
    for (var i = 0; i < n; i++) {
      out.push(fill(pool[(start + i) % pool.length], Object.assign({}, ctx, { n: items.length })));
    }
    return out;
  }

  /* ---------- date placement ---------- */

  /*
   * Two modes.
   *
   * LEGACY (settings.postsPerWeek is null): one concept per day, preferring
   * your posting days, falling back to any free day. This is the original
   * behaviour and the one the older tests pin down.
   *
   * CADENCE (postsPerWeek set): each platform has real weekly SLOTS — its
   * posting days (CJ.slotDays), one post per slot. A date is only ever handed
   * out if it is a free slot for that platform, so a week can never hold more
   * posts than you asked for. No slot in range → null, and the caller skips.
   * Deadlines pass {force:true}: a due date outranks the cadence.
   */
  function makeDatePicker(settings) {
    var preferred = (settings.preferredDays && settings.preferredDays.length) ? settings.preferredDays : [2, 4, 6];
    var cadence = CJ.cadenceOn();
    var dayCache = {};
    function daysFor(p) { return dayCache[p] || (dayCache[p] = CJ.slotDays(p)); }
    var taken = {};
    function key(p, iso) { return cadence ? (p || 'instagram') + '|' + iso : iso; }

    function place(target, minDate, maxDate, platform, opts) {
      opts = opts || {};
      var d = new Date(target.getTime());
      d = clampDate(d, minDate, maxDate);

      if (cadence) {
        var p = platform || 'instagram';
        var days = daysFor(p);
        if (days.length) {
          for (var r = 0; r <= 62; r++) {
            var cs = r === 0 ? [0] : [-r, r];
            for (var j = 0; j < cs.length; j++) {
              var c = addDays(d, cs[j]);
              if (minDate && c < minDate) continue;
              if (maxDate && c > maxDate) continue;
              if (days.indexOf(c.getDay()) === -1) continue;
              var k = key(p, CJ.isoDate(c));
              if (taken[k]) continue;
              taken[k] = true;
              return CJ.isoDate(c);
            }
          }
        }
        if (!opts.force) return null;
        // A deadline with no slot left: take the nearest free day of any kind.
        for (var f = 0; f <= 14; f++) {
          var alt0 = addDays(d, f);
          var kf = key(p, CJ.isoDate(alt0));
          if (!taken[kf]) { taken[kf] = true; return CJ.isoDate(alt0); }
        }
        return CJ.isoDate(d);
      }

      // Walk outward from the target looking for a preferred, unclaimed day.
      for (var radius = 0; radius <= 10; radius++) {
        var candidates = radius === 0 ? [0] : [-radius, radius];
        for (var c2 = 0; c2 < candidates.length; c2++) {
          var cand = addDays(d, candidates[c2]);
          if (minDate && cand < minDate) continue;
          if (maxDate && cand > maxDate) continue;
          var key2 = CJ.isoDate(cand);
          if (preferred.indexOf(cand.getDay()) === -1) continue;
          if (taken[key2]) continue;
          taken[key2] = true;
          return key2;
        }
      }
      // No preferred day free — take any free day near the target.
      for (var r2 = 0; r2 <= 14; r2++) {
        var alt = addDays(d, r2);
        if (maxDate && alt > maxDate) break;
        var k2 = CJ.isoDate(alt);
        if (!taken[k2]) { taken[k2] = true; return k2; }
      }
      return CJ.isoDate(d);
    }

    place.on = cadence;
    place.place = place;
    place.reserve = function (p, iso) { taken[key(p, iso)] = true; };
    place.release = function (p, iso) { delete taken[key(p, iso)]; };
    place.isHeld = function (p, iso) { return !!taken[key(p, iso)]; };
    /** Free slot dates for a platform between two Dates, in order. */
    place.freeSlots = function (p, from, to) {
      var out = [], days = daysFor(p);
      for (var x = new Date(from.getTime()); x <= to; x = addDays(x, 1)) {
        if (days.indexOf(x.getDay()) === -1) continue;
        if (!taken[key(p, CJ.isoDate(x))]) out.push(CJ.isoDate(x));
      }
      return out;
    };
    return place;
  }

  /* ---------- the main event ---------- */

  function generate(options) {
    options = options || {};
    var settings = CJ.settings();
    var horizon = options.months || settings.horizonMonths || 6;
    var perMonth = settings.ideasPerMonth || 8;
    var cooldown = settings.repostCooldownDays != null ? settings.repostCooldownDays : 120;
    // Plan focus (set by the Plan builder) SCOPES the plan: occasions and
    // themes draw only from that collection. Tried first as a scoring bias and
    // measured it: the generator already runs close to the spacing rule's
    // ceiling, so a bias can't create room for more focused posts — it only
    // reshuffled line-ups and cost 4-6 posts a quarter. A scope is honest about
    // what it does. Deadlines and real posting history still use the whole
    // library, so nothing due is dropped and spacing stays correct.
    var focus = settings.planFocus && settings.planFocus.value ? settings.planFocus : null;

    var today = new Date(); today.setHours(0, 0, 0, 0);
    var end = new Date(today.getFullYear(), today.getMonth() + horizon, 0);

    var items = CJ.getItems();
    var cadence = CJ.cadenceOn();
    var activePlatforms = CJ.PLATFORM_IDS.filter(CJ.platformActive);
    // The busiest active platform sets the monthly rhythm in cadence mode.
    var primary = activePlatforms.slice().sort(function (a, b) {
      return ((settings.postsPerWeek || {})[b] || 0) - ((settings.postsPerWeek || {})[a] || 0);
    })[0] || 'instagram';
    if (cadence) perMonth = Math.round(((settings.postsPerWeek || {})[primary] || 0) * 52 / 12);

    /* What a plan may build from: places that can actually post somewhere
       you're posting right now, and that aren't on hold. Held places (your
       notes say there isn't enough for a post yet) sit out until you add more
       or tell it to use them anyway. It's fine for a lot of the library to
       sit out — a thin post is worse than no post. Deadlines are the one
       exception, further down: a commitment still gets placed. */
    var planItems = (focus
      ? items.filter(function (it) { return CJ.matchesCollection(it, focus); })
      : items
    ).filter(function (it) {
      if (CJ.holdInfo(it).held) return false;
      return activePlatforms.some(function (p) { return CJ.itemPostsOn(it, p); });
    });

    // "Can this place post at some point in this range?" gets asked a lot for
    // the same month; cache it.
    var rangeCache = {};
    function usableIn(it, fromD, toD) {
      var k = it.id + '|' + CJ.isoDate(fromD) + '|' + CJ.isoDate(toD);
      if (!(k in rangeCache)) rangeCache[k] = CJ.usableBetween(it, CJ.isoDate(fromD), CJ.isoDate(toD));
      return rangeCache[k];
    }
    var existing = CJ.getIdeas();
    var knownNeighborhoods = CJ.allNeighborhoods();

    /* --- 1. keep every decision, in the two different senses of "keep" ------

       A refresh must never overwrite a decision. There are two kinds:

         LOCKED   — planned, done, pinned, rescheduled, or edited. These come
                    through untouched: same concept, same places, same dates.
                    Deciding on one platform locks the whole concept, so
                    planning the Instagram drop never wipes its Pinterest one.

         DISMISSED — you said no. The concept must never reappear (its id is
                    deterministic, so an exact match is skipped forever), AND
                    the slot it occupied must open back up for something
                    genuinely different. That second half is the part that used
                    to be missing: a dismissal still counted toward the month's
                    quota and still held its date, so saying no just left a
                    hole. Now the month refills, and the theme you rejected is
                    penalised there so the replacement isn't a near-twin.

       Everything else is a live suggestion and is free to be regenerated and
       moved. Occasion and deadline ideas are anchored to their date either
       way, so "move things around" never drags a Dragon Con post off Dragon
       Con weekend.                                                          */
    var kept = existing.filter(function (idea) {
      if (idea.pinned || idea.touched) return true;
      if (idea.status && idea.status !== 'suggested') return true;
      if (idea.source === 'ai') return true;
      return (idea.drops || []).some(function (d) {
        return d.pinned || d.touched || (d.status && d.status !== 'suggested');
      });
    });
    // Drop kept ideas that have fallen out of the window and were never acted
    // on. A dismissal is kept as a tombstone well beyond that, because its
    // whole job is to stop the concept coming back.
    kept = kept.filter(function (idea) {
      var d = CJ.parseDate(idea.date);
      if (!d) return false;
      if (idea.status === 'done' || idea.status === 'planned') return true;
      if (idea.status === 'dismissed') return d >= addDays(today, -400);
      return d >= addDays(today, -45);
    });

    function isDismissed(idea) {
      if (idea.status === 'dismissed') return true;
      // Every platform individually dismissed is a dismissed concept.
      var drops = idea.drops || [];
      return drops.length > 0 && drops.every(function (d) { return d.status === 'dismissed'; });
    }

    var keptIds = {};
    var keptPerMonth = {};
    var usedCount = {};
    var rejectedThemeInMonth = {};   // "themeId|2026-09" -> times you said no
    var freedSlots = 0;

    kept.forEach(function (idea) {
      keptIds[idea.id] = true;
      var mk = (idea.date || '').slice(0, 7);

      if (isDismissed(idea)) {
        // Does NOT fill a slot and does NOT hold its date — that is the whole
        // point of dismissing it.
        freedSlots++;
        if (idea.themeId) {
          var k = idea.themeId + '|' + mk;
          rejectedThemeInMonth[k] = (rejectedThemeInMonth[k] || 0) + 1;
        }
        return;
      }

      keptPerMonth[mk] = (keptPerMonth[mk] || 0) + 1;
      (idea.itemIds || []).forEach(function (id) { usedCount[id] = (usedCount[id] || 0) + 1; });
    });

    var ctxBase = { cooldown: cooldown, used: usedCount, hookRotation: Math.floor(Math.random() * 7) };
    var pickDate = makeDatePicker(settings);
    // Reserve every date a live kept idea is sitting on. Dismissed ones release
    // theirs so the replacement can take that day. In cadence mode each kept
    // drop holds its own platform's slot, so a planned post counts toward
    // that week's number.
    kept.forEach(function (idea) {
      if (!idea.date || isDismissed(idea)) return;
      if (cadence) {
        (idea.drops || []).forEach(function (d) {
          if (d.status !== 'dismissed' && d.date) pickDate.reserve(d.platform, d.date);
        });
      } else {
        pickDate(CJ.parseDate(idea.date), null, null);
      }
    });

    // Seed the spacing rule with real history and everything already booked.
    var spacer = makeSpacer();
    // Real history, per platform.
    items.forEach(function (it) {
      CJ.PLATFORM_IDS.forEach(function (p) {
        var last = CJ.lastPostedOn(it, p);
        if (last) spacer.record(it.id, p, last);
      });
    });
    // Everything already booked on the calendar, per platform.
    kept.forEach(function (idea) {
      if (isDismissed(idea)) return;
      (idea.drops || []).forEach(function (d) {
        if (d.status === 'dismissed') return;
        (d.itemIds || []).forEach(function (id) { spacer.record(id, d.platform, d.date); });
      });
    });

    var fresh = [];
    var stats = { deadline: 0, occasion: 0, theme: 0, spotlight: 0, skippedThin: 0, spacingBlocks: 0,
                  held: items.filter(function (it) { return CJ.holdInfo(it).held; }).map(function (it) { return it.name; }),
                  cadence: cadence ? { platform: primary, perWeek: (settings.postsPerWeek || {})[primary] || 0 } : null,
                  shortMonths: 0, shortBy: 0, uncovered: [],
                  locked: 0, dismissed: freedSlots, escapes: 0, areaSkipped: [],
                  focus: focus ? CJ.collectionLabel(focus) : null, focusPlaces: planItems.length };

    /** Filter a pool down to places that are actually free on this date. */
    function freeOn(pool, isoDate, platform) {
      var out = [];
      for (var i = 0; i < pool.length; i++) {
        // In season on this date, and with a clip that isn't on hold.
        if (!CJ.usableOn(pool[i], isoDate)) continue;
        if (spacer.allows(pool[i], platform, isoDate)) out.push(pool[i]);
        else stats.spacingBlocks++;
      }
      return out;
    }

    /* --- 2. deadlines first --- */
    items.forEach(function (item) {
      if (!item.deadline) return;
      var due = CJ.parseDate(item.deadline);
      if (!due || due > end) return;
      // Already posted close to the due date? The deadline is satisfied.
      if (item.lastPosted && CJ.parseDate(item.lastPosted) >= addDays(due, -30)) return;

      var id = 'deadline:' + item.id + ':' + item.deadline;
      if (keptIds[id]) return;

      var overdue = due < today;
      var target = overdue ? today : addDays(due, -5);
      var dlLead = leadPlatformFor([item], settings);
      var date = pickDate(target, today, overdue ? addDays(today, 10) : due, dlLead, { force: true });

      var ctx = Object.assign({}, ctxBase, {
        season: seasonOf(due.getMonth() + 1),
        month: CJ.atlanta.monthInfo(due.getMonth() + 1).name,
        name: item.name, n: 1
      });

      var dlDrops = buildDrops(id, [item], { format: 'single', allowSingle: true }, date, settings, spacer, pickDate, dlLead);
      if (!dlDrops.length) {
        // Spacing blocked every platform — place it anyway on the lead one,
        // because a deadline outranks the rule.
        var lp = dlLead;
        if (cadence) pickDate.reserve(lp, date);
        var lyr = CJ.bestLayerFor(item, lp, date);
        var lbi = {}; if (lyr) lbi[item.id] = lyr.id;
        dlDrops = [{
          id: id + '::' + lp, platform: lp,
          format: formatFor(lp, 1, { format: 'single' }, settings, [item]),
          date: date, itemIds: [item.id], layerByItem: lbi, linksTo: null,
          status: 'suggested', pinned: false, touched: false, notes: ''
        }];
        spacer.record(item.id, lp, date);
      }

      fresh.push({
        id: id,
        date: dlDrops[0].date,
        drops: dlDrops,
        source: 'deadline',
        themeId: null,
        title: (overdue ? '⚠️ Overdue: ' : '⏰ Post by ' + CJ.formatDate(item.deadline, { month: 'short', day: 'numeric' }) + ': ') + item.name,
        blurb: (item.deadlineNote
          ? item.deadlineNote
          : 'You flagged this one as time-sensitive when you added it.') +
          (CJ.holdInfo(item).held
            ? ' ⚠ Heads up: this place is on hold (' + CJ.holdInfo(item).reason + '). It\'s here because the deadline outranks that — shoot what you need before this date.'
            : ''),
        format: 'single',
        itemIds: [item.id],
        platforms: dlDrops.map(function (d) { return d.platform; }),
        hooks: [
          'The one I\'ve been holding onto — ' + item.name,
          'Okay I have to tell you about ' + item.name + ' before it\'s too late'
        ],
        captions: buildCaptions({ format: 'single' }, [item], ctx),
        occasion: null,
        deadlineFor: { itemId: item.id, date: item.deadline, note: item.deadlineNote || '', priority: item.priority || 'normal' },
        status: 'suggested',
        pinned: false,
        touched: false,
        priority: item.priority === 'high' ? 2 : 1,
        notes: ''
      });
      usedCount[item.id] = (usedCount[item.id] || 0) + 1;
      stats.deadline++;
    });

    /* --- 3. dated occasions --- */
    var occs = CJ.atlanta.occurrencesBetween(today, addDays(end, 7), settings.disabledBuiltinEvents || []);

    // Fold in the user's own events, expanding yearly repeats across the window.
    CJ.getEvents().forEach(function (ev) {
      var base = CJ.parseDate(ev.date);
      if (!base) return;
      var years = ev.repeat === 'yes'
        ? [today.getFullYear(), today.getFullYear() + 1]
        : [base.getFullYear()];
      years.forEach(function (y) {
        var d = new Date(y, base.getMonth(), base.getDate());
        if (d < today || d > addDays(end, 7)) return;
        occs.push({
          kind: 'custom', id: 'custom:' + ev.id + ':' + y, name: ev.name, date: d,
          lead: 12, approx: false, types: null,
          angles: (ev.tags ? String(ev.tags).split(',') : []).map(function (s) { return s.trim(); }).filter(Boolean),
          note: ev.angle || ''
        });
      });
    });
    occs.sort(function (a, b) { return a.date - b.date; });

    // Score every occasion first, then take only the strongest few per month —
    // otherwise a festival-heavy month would crowd out everything else.
    var occCandidates = [];
    occs.forEach(function (occ) {
      var id = 'occ:' + occ.id + ':' + occ.date.getFullYear();
      if (keptIds[id]) return;

      /* ---- geography comes first, before any tag matching -----------------

         An event happens somewhere. A post about it has to be set somewhere
         that makes sense with it. There are exactly two honest ways to write
         one, and the generator picks between them explicitly:

           IN-AREA — places inside the event's own area. "Where to eat downtown
                     during Dragon Con", featuring downtown spots.

           ESCAPE  — places deliberately OUTSIDE it, for an event big enough
                     that the crowds are the story. "Where to go while downtown
                     is a zoo", featuring Buckhead and the Battery. The angle
                     names the avoidance, so the geography is the point rather
                     than a mistake.

         What it must never do is take the in-area framing and fill it with
         wherever-you-happen-to-have-footage. A Dragon Con guide listing
         Buckhead is not a thinner version of a good post; it's a wrong one. */
      var area = occ.area || [];
      var angleText = (occ.angles || []).join(' ') + ' ' + (occ.name || '') + ' ' + (occ.note || '');
      // Fall back to reading a neighborhood out of the angle text for events
      // with no declared area, and for your own events.
      if (!area.length) area = neighborhoodsIn(angleText, knownNeighborhoods).map(function (n) { return String(n).toLowerCase(); });

      function inArea(it) {
        if (!area.length) return true;
        var hood = (it.neighborhood || '').toLowerCase();
        if (!hood) return false;
        return area.some(function (a) { return sameArea(hood, a); });
      }

      function matchesAngle(it) {
        if (occ.types && occ.types.indexOf(it.type) === -1) return false;
        if (!occ.angles || !occ.angles.length) return true;
        var bag = searchBag(it);
        for (var i = 0; i < occ.angles.length; i++) if (tagMatches(bag, occ.angles[i])) return true;
        return false;
      }

      // Only places that can genuinely post in the run-up to this date: in
      // season then, and not on hold. Halloween content is for Halloween.
      var runFrom = addDays(occ.date, -((occ.lead || 12) + 10));
      if (runFrom < today) runFrom = today;
      var runTo = addDays(occ.date, -1) < runFrom ? runFrom : addDays(occ.date, -1);
      var typeOk = planItems.filter(function (it) {
        if (occ.types && occ.types.indexOf(it.type) === -1) return false;
        return usableIn(it, runFrom, runTo);
      });

      // In-area candidates: right place, and either the right vibe or simply
      // being in the right place (which is itself the point of a local guide).
      var tagged = typeOk.filter(function (it) {
        return inArea(it) && (matchesAngle(it) || area.length > 0);
      });

      var pool = tagged;
      var mode = 'in-area';

      /* A built-in Atlanta date only earns a slot if your library genuinely
         covers it. Two real matches minimum — one loose hit is not a guide.

         Your own events are different: you added them deliberately, so they
         stay on the calendar as a date to plan around even with nothing
         attached, with a note saying what to tag. */
      var MIN_OCCASION_MATCHES = 2;

      if (occ.kind !== 'custom' && pool.length < MIN_OCCASION_MATCHES && area.length && occ.crowds) {
        // Not enough in the area — but this event snarls that part of town, so
        // the avoidance angle is a real post rather than a consolation prize.
        // It needs a proper line-up of its own, clearly outside the area.
        var away = typeOk.filter(function (it) { return it.neighborhood && !inArea(it); });
        if (away.length >= 3) {
          pool = away;
          mode = 'escape';
          stats.escapes++;
        }
      }

      if (occ.kind !== 'custom' && pool.length < MIN_OCCASION_MATCHES) {
        stats.skippedThin++;
        stats.uncovered.push(occ.name);
        if (area.length) stats.areaSkipped.push({ name: occ.name, area: area.slice() });
        return;
      }
      if (!pool.length && occ.kind !== 'custom') { stats.skippedThin++; return; }

      // Your own events outrank holidays, which outrank festivals. Real tag
      // matches count for a lot — a festival you have no content for is filler.
      var score = (occ.kind === 'custom' ? 120 : occ.kind === 'holiday' ? 55 : 30)
                + Math.min(pool.length, 5) * 14
                + (pool.length === 0 ? -25 : 0);
      // An escape angle is a real post but a second choice — rank it below any
      // event you can actually cover from inside its own area.
      if (mode === 'escape') score *= 0.7;

      occCandidates.push({
        occ: occ, id: id, pool: pool, score: score, mode: mode, area: area,
        loose: pool.length === 0, mk: monthKey(occ.date)
      });
    });

    // Cadence mode keeps holiday/event posts to about half your weekly number
    // per month: each one books up to 4 places for the whole spacing gap.
    var occPerMonth = cadence
      ? Math.max(2, Math.ceil(((settings.postsPerWeek || {})[primary] || 0) * 0.5))
      : Math.max(2, Math.ceil(perMonth * 0.45));
    var occTakenByMonth = {};
    occCandidates.sort(function (a, b) { return b.score - a.score; });

    occCandidates
      .filter(function (c) {
        var n = occTakenByMonth[c.mk] || 0;
        if (n >= occPerMonth) return false;
        occTakenByMonth[c.mk] = n + 1;
        return true;
      })
      .sort(function (a, b) { return a.occ.date - b.occ.date; })
      .forEach(function (cand) {
      var occ = cand.occ, id = cand.id, pool = cand.pool;
      var m = occ.date.getMonth() + 1;
      var ctx = Object.assign({}, ctxBase, { season: seasonOf(m), month: CJ.atlanta.monthInfo(m).name });

      // Date first, then places — the spacing rule can only be applied once we
      // know when the post is going up.
      var occLead = leadPlatformFor(pool.length ? pool : planItems, settings);
      var postDate = pickDate(addDays(occ.date, -(occ.lead || 12)), today, addDays(occ.date, -1), occLead);
      if (!postDate) { stats.noSlot = (stats.noSlot || 0) + 1; return; }
      var occCtx = Object.assign({}, ctxBase, { platform: occLead, roundup: cadence });
      // Cadence mode caps holiday line-ups at 4: each place in a post is
      // booked for the whole spacing gap, so a 6-place post empties the month.
      var occMax = cadence ? 4 : 6;
      var chosen = pool.length ? pickItems(freeOn(pool, postDate, occLead), { max: occMax }, occCtx, occMax) : [];
      if (!chosen.length && occ.kind !== 'custom') {
        stats.skippedThin++;
        if (cadence) pickDate.release(occLead, postDate);
        return;
      }
      ctx.n = chosen.length;

      var occDrops = chosen.length
        ? buildDrops(id, chosen, { format: 'guide' }, postDate, settings, spacer, pickDate, occLead)
        : [{
            id: id + '::' + occLead, platform: occLead, format: occLead === 'tiktok' ? 'video' : 'reel', date: postDate,
            itemIds: [], layerByItem: {}, linksTo: null,
            status: 'suggested', pinned: false, touched: false, notes: ''
          }];
      if (!occDrops.length) { stats.skippedThin++; return; }

      var pseudoTheme = { format: chosen.length > 1 ? 'roundup' : 'single', hooks: [] };
      var angle = (occ.angles && occ.angles[0]) || 'what to do';

      // The escape angle has to SAY it's an escape, in the title and the hooks,
      // or it reads as a guide that got its geography wrong. Name the area
      // being avoided and the areas you're sending people to instead.
      var areaLabel = titleCase((cand.area || []).join(' & '));
      var awayHoods = uniq(chosen.map(function (i) { return i.neighborhood; }).filter(Boolean));
      var isEscape = cand.mode === 'escape';

      var title = isEscape
        ? 'Skip ' + areaLabel + ' during ' + occ.name + ' — go here instead'
        : occ.kind === 'holiday'
          ? occ.name + ': ' + angle
          : (occ.kind === 'custom' ? occ.name : occ.name + ' — ' + angle);

      fresh.push({
        id: id,
        date: occDrops[0].date,
        drops: occDrops,
        source: 'occasion',
        themeId: null,
        title: title,
        blurb: isEscape
          ? occ.name + ' takes over ' + areaLabel + ' on ' +
            CJ.formatDate(CJ.isoDate(occ.date)) +
            (occ.approx ? ' (approximate — confirm the date)' : '') +
            '. You have no ' + areaLabel.toLowerCase() + ' footage, so this runs as the counter-programme: ' +
            'the people avoiding the crowds are a real, searching audience that weekend. ' +
            'Everything featured is outside ' + areaLabel.toLowerCase() + ' — ' + listNames(chosen.slice(0, 3)) +
            (awayHoods.length ? ' (' + awayHoods.slice(0, 3).join(', ') + ')' : '') + '.'
          : (occ.note ? occ.note + ' ' : '') +
            (occ.kind === 'custom'
              ? 'Your event on ' + CJ.formatDate(CJ.isoDate(occ.date)) + '.'
              : occ.name + ' lands on ' + CJ.formatDate(CJ.isoDate(occ.date)) +
                (occ.approx ? ' (approximate — confirm the official date).' : '.') +
                ' Post ahead of it so people can actually plan.') +
            (!chosen.length
              ? ' — Nothing in your library fits this yet, so no places are attached. Add or tag content for ' +
                ((occ.angles || []).slice(0, 3).join(', ') || occ.name) + ' and refresh.'
              : ''),
        format: pseudoTheme.format,
        itemIds: chosen.map(function (i) { return i.id; }),
        platforms: occDrops.map(function (d) { return d.platform; }),
        hooks: isEscape ? [
          'If you are NOT doing ' + occ.name + ' this weekend, this one\'s for you',
          'POV: ' + areaLabel + ' is a zoo and you just want a normal dinner',
          'Where to go in Atlanta while everyone else is at ' + occ.name
        ] : [
          occ.name + ' is ' + CJ.formatDate(CJ.isoDate(occ.date), { month: 'long', day: 'numeric' }) + ' — here\'s the plan',
          'If you\'re doing ' + occ.name + ' in Atlanta, save this',
          fill('{n} Atlanta spots for ' + occ.name, { n: chosen.length })
        ],
        captions: buildCaptions(pseudoTheme, chosen, ctx),
        occasion: { name: occ.name, date: CJ.isoDate(occ.date), approx: !!occ.approx, kind: occ.kind,
                    area: cand.area || [], mode: cand.mode },
        deadlineFor: null,
        status: 'suggested',
        pinned: false,
        touched: false,
        priority: 1,
        notes: ''
      });
      chosen.forEach(function (i) { usedCount[i.id] = (usedCount[i.id] || 0) + 1; });
      stats.occasion++;
    });

    /* --- spotlights: one place, one post -----------------------------------
       Your standard feature format (what it is, the vibe, what to order, good
       to know). Fills free slots in date order with the most-due place that is
       free under the spacing rule, in season that day, and not on hold. It
       will leave a slot empty rather than post something that doesn't fit. */
    var SPOT_HOOKS = {
      restaurant: ['What to order at {name}', 'This is the one: {name}', 'Make the reservation: {name}'],
      experience: ['{name} is worth the trip', 'Your next plan: {name}', 'Save this for the weekend: {name}'],
      home: ['{name}', 'The at-home version: {name}', 'Doing this again: {name}']
    };
    function placeSpotlights(mi, monthStart, monthEnd, mk, info, remaining, onPlaced) {
      var dates = pickDate.freeSlots(primary, monthStart, monthEnd);
      for (var di = 0; di < dates.length && remaining() > 0; di++) {
        var date = dates[di];
        if (weekFull(date)) continue;
        var ctxS = Object.assign({}, ctxBase, { platform: primary });
        var best = null, bestScore = -Infinity;
        planItems.forEach(function (it) {
          if (!it.solo) return;                                      // you said it can't carry a post alone
          if (!CJ.itemPostsOn(it, primary)) return;
          if (keptIds['spot:' + it.id + ':' + mk]) return;           // dismissed or kept already
          if (fresh.some(function (f) { return f.id === 'spot:' + it.id + ':' + mk; })) return;
          if (!CJ.usableOn(it, date)) return;
          if (!spacer.allows(it, primary, date)) return;
          var sc = itemScore(it, ctxS) + seasonTiming(it, date);
          if (sc > bestScore) { bestScore = sc; best = it; }
        });
        if (!best) continue;
        var id = 'spot:' + best.id + ':' + mk;
        pickDate.reserve(primary, date);
        var drops = buildDrops(id, [best], { format: 'single' }, date, settings, spacer, pickDate, primary);
        if (!drops.length) continue;
        var layer = CJ.getLayer(best, drops[0].layerByItem[best.id]);
        var sctx = Object.assign({}, ctxBase, { season: info.season, month: info.name, name: best.name, n: 1 });
        fresh.push({
          id: id,
          date: drops[0].date,
          drops: drops,
          source: 'spotlight',
          themeId: 'spotlight',
          title: best.type === 'restaurant' ? 'Spotlight: ' + best.name : best.name,
          blurb: 'A single-place feature' + (best.neighborhood ? ' in ' + best.neighborhood : '') +
                 (layer && (best.layers || []).length > 1 ? ', using your “' + layer.label + '” clip' : '') +
                 (best.photosOnly ? '. Photos only, so it runs as a carousel' : '') +
                 '. Run it in your usual format: what it is, the vibe, what to order, good to know.',
          format: 'single',
          itemIds: [best.id],
          platforms: drops.map(function (d) { return d.platform; }),
          // Hooks from its own website come first: they name real dishes and events.
          hooks: ((best.web && best.web.ideas) || []).filter(function (x) {
            return x.hook && !x.scheduledIdeaId && (!x.months || !x.months.length || x.months.indexOf(Number(date.slice(5, 7))) !== -1);
          }).map(function (x) { return x.hook; }).slice(0, 2)
            .concat((SPOT_HOOKS[best.type] || SPOT_HOOKS.restaurant).map(function (h) { return fill(h, sctx); })).slice(0, 4),
          captions: buildCaptions({ format: 'single' }, [best], sctx),
          occasion: null,
          deadlineFor: null,
          status: 'suggested',
          pinned: false,
          touched: false,
          priority: 0,
          notes: '',
          weatherNote: info.mood
        });
        usedCount[best.id] = (usedCount[best.id] || 0) + 1;
        stats.spotlight++;
        onPlaced();
      }
    }

    /* --- even pacing -------------------------------------------------------
       If the library can carry fewer posts a week than you asked for, spread
       what it can carry evenly instead of filling the first few weeks to the
       brim and then going silent for a month while every place rests. */
    var weekCap = 7;
    if (cadence) {
      var want = (settings.postsPerWeek || {})[primary] || 0;
      var capNow = capacity(primary).perWeek;
      weekCap = Math.max(1, Math.min(want, Math.ceil(capNow)));
    }
    function weekKeyOf(iso) {
      var d = CJ.parseDate(iso);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));        // back to Monday
      return CJ.isoDate(d);
    }
    function weekFull(iso) {
      if (!cadence) return false;
      var wk = weekKeyOf(iso), n = 0;
      kept.concat(fresh).forEach(function (idea) {
        if (isDismissed(idea)) return;
        (idea.drops || []).forEach(function (d) {
          if (d.platform === primary && d.status !== 'dismissed' && weekKeyOf(d.date) === wk) n++;
        });
      });
      return n >= weekCap;
    }

    /* Seasonal content lands close to its moment: a Halloween place is worth
       most in the last three weeks of October, not on the 1st. */
    function seasonTiming(item, iso) {
      var se = CJ.seasonInfo(item);
      if (se.any) return 0;
      var d = CJ.parseDate(iso);
      var best = null;
      se.windows.forEach(function (w) {
        if (!CJ.inWindows([w], iso)) return;
        var end = new Date(d.getFullYear(), w.to[0] - 1, w.to[1]);
        if (end < d) end = new Date(d.getFullYear() + 1, w.to[0] - 1, w.to[1]);
        var left = CJ.daysBetween(d, end);
        if (best === null || left < best) best = left;
      });
      if (best === null) return 0;
      return best <= 21 ? 40 : -80;
    }

    /* --- 4. fill each month with the best-fitting themes --- */
    var neighborhoods = CJ.allNeighborhoods();
    var lastUsedMonth = {}; // themeId -> month index, to avoid back-to-back repeats

    for (var mi = 0; mi < horizon; mi++) {
      var cursor = new Date(today.getFullYear(), today.getMonth() + mi, 1);
      var monthNum = cursor.getMonth() + 1;
      var mk = monthKey(cursor);
      var monthStart = mi === 0 ? today : cursor;
      var monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

      var already = (keptPerMonth[mk] || 0) + fresh.filter(function (f) { return f.date.slice(0, 7) === mk; }).length;
      // Cadence: the month holds exactly as many posts as it has free slots.
      var slots = cadence
        ? pickDate.freeSlots(primary, monthStart, monthEnd).length
        : Math.max(0, perMonth - already);
      if (slots === 0) continue;

      var info = CJ.atlanta.monthInfo(monthNum);
      var mctx = Object.assign({}, ctxBase, { season: info.season, month: info.name });

      // Build every candidate (theme × optional neighborhood) for this month.
      var candidates = [];
      CJ.themes.THEMES.forEach(function (theme) {
        if (theme.months.indexOf(monthNum) === -1) return;

        var variants = theme.byNeighborhood
          ? neighborhoods.map(function (n) { return { neighborhood: n }; })
          : [{ neighborhood: null }];

        variants.forEach(function (v) {
          var pool = planItems.filter(function (it) {
            if (!itemMatchesTheme(it, theme)) return false;
            if (v.neighborhood && (it.neighborhood || '').toLowerCase() !== v.neighborhood.toLowerCase()) return false;
            // Only what can post this month: in season, a clip that isn't held.
            return usableIn(it, monthStart, monthEnd);
          });
          if (theme.needsBothTypes) {
            for (var t = 0; t < theme.needsBothTypes.length; t++) {
              var has = pool.some(function (it) { return it.type === theme.needsBothTypes[t]; });
              if (!has) return;
            }
          }
          if (pool.length < (theme.min || 1)) { stats.skippedThin++; return; }

          var vid = 'theme:' + theme.id + (v.neighborhood ? ':' + CJ.slug(v.neighborhood) : '') + ':' + mk;
          if (keptIds[vid]) return;

          var scoreCtx = Object.assign({}, ctxBase, { platform: leadPlatformFor(pool, settings) });
          var chosen = pickItems(pool, theme, scoreCtx);
          var avgScore = chosen.reduce(function (a, it) { return a + itemScore(it, scoreCtx); }, 0) / (chosen.length || 1);
          var fitness = Math.min(pool.length / (theme.max || 4), 1.4);
          var score = (theme.weight || 1) * (avgScore * 0.55 + fitness * 40);

          if (theme.reactive) score *= 0.55;                       // keep-in-your-pocket ideas rank lower
          if (lastUsedMonth[theme.id] === mi - 1) score *= 0.6;     // no back-to-back repeats

          // You dismissed this theme in this month. The exact idea can't come
          // back (its id is remembered), but re-offering the same theme with
          // one place swapped is the same post wearing a hat. Push it right
          // down so the freed slot gets something you haven't rejected.
          var rej = rejectedThemeInMonth[theme.id + '|' + mk] || 0;
          if (rej) score *= Math.pow(0.18, rej);

          score += (Math.random() - 0.5) * 12;                      // gentle shuffle so refreshes feel alive

          candidates.push({ theme: theme, neighborhood: v.neighborhood, pool: pool, chosen: chosen, score: score, id: vid });
        });
      });

      candidates.sort(function (a, b) { return b.score - a.score; });

      var placed = 0;
      var usedThemeThisMonth = {};
      var tried = {};

      function placeThemes(limit) {
      for (var ci = 0; ci < candidates.length && placed < limit; ci++) {
        var c = candidates[ci];
        if (tried[ci]) continue;
        // One instance per theme per month, except neighborhood guides (max 2).
        var cap = c.theme.byNeighborhood ? 2 : 1;
        if ((usedThemeThisMonth[c.theme.id] || 0) >= cap) continue;
        tried[ci] = true;

        // Date first, then places, so the spacing rule can be applied. Try a
        // couple of dates before giving up — a different week in the same month
        // often frees up the places this theme needs.
        var themeLead = leadPlatformFor(c.pool, settings);
        var themeCtx = Object.assign({}, ctxBase, { platform: themeLead, roundup: cadence });
        var postDate = null, chosen = null;
        for (var attempt = 0; attempt < 6; attempt++) {
          var tryDate = pickDate(
            addDays(monthStart, Math.floor(Math.random() * Math.max(1, CJ.daysBetween(monthStart, monthEnd)))),
            monthStart, monthEnd, themeLead
          );
          if (!tryDate) break;                     // cadence: no slot left this month
          if (weekFull(tryDate)) { pickDate.release(themeLead, tryDate); continue; }
          var candidates2 = pickItems(freeOn(c.pool, tryDate, themeLead), c.theme, themeCtx);
          if (candidates2.length >= (c.theme.min || 1)) { postDate = tryDate; chosen = candidates2; break; }
          if (cadence) { pickDate.release(themeLead, tryDate); continue; }
          if (!postDate) postDate = tryDate; // remember the first, in case all fail
        }
        if (!chosen) continue;

        var themeDrops = buildDrops(c.id, chosen, c.theme, postDate, settings, spacer, pickDate, themeLead);
        if (!themeDrops.length) continue;

        var tctx = Object.assign({}, mctx, { neighborhood: c.neighborhood, n: chosen.length });
        var title = fill(c.theme.title, tctx);

        fresh.push({
          id: c.id,
          date: themeDrops[0].date,
          drops: themeDrops,
          source: 'theme',
          themeId: c.theme.id,
          title: title,
          blurb: c.theme.blurb,
          format: c.theme.format,
          itemIds: chosen.map(function (i) { return i.id; }),
          platforms: themeDrops.map(function (d) { return d.platform; }),
          hooks: buildHooks(c.theme, chosen, tctx),
          captions: buildCaptions(c.theme, chosen, tctx),
          occasion: null,
          deadlineFor: null,
          status: 'suggested',
          pinned: false,
          touched: false,
          priority: 0,
          notes: '',
          neighborhood: c.neighborhood || null,
          weatherNote: info.mood
        });

        chosen.forEach(function (i) { usedCount[i.id] = (usedCount[i.id] || 0) + 1; });
        usedThemeThisMonth[c.theme.id] = (usedThemeThisMonth[c.theme.id] || 0) + 1;
        lastUsedMonth[c.theme.id] = mi;
        placed++;
        stats.theme++;
      }
      }

      if (!cadence) {
        placeThemes(slots);
      } else {
        /* Cadence mode fills a month in three passes. Single-place spotlights
           first (your standard feature post) for up to ~75% of the slots,
           then roundups, then spotlights again for anything left. Measured
           the other way round: roundups first booked 3-5 places each for the
           whole spacing gap and left ONE spotlight in six months. */
        var spotCap = Math.ceil(slots * 0.75);
        placeSpotlights(mi, monthStart, monthEnd, mk, info, function () { return Math.min(spotCap, slots) - placed; },
          function () { placed++; });
        placeThemes(slots);
        placeSpotlights(mi, monthStart, monthEnd, mk, info, function () { return slots - placed; },
          function () { placed++; });
      }

      // Couldn't fill the month? Almost always the spacing rule — every place
      // that fits the remaining themes is already booked too close by.
      if (placed < slots) {
        stats.shortMonths++;
        stats.shortBy += (slots - placed);
      }
    }

    var all = kept.concat(fresh);
    all.forEach(function (idea) {
      if (idea.drops && idea.drops.length) {
        var first = idea.drops.map(function (d) { return d.date; }).sort()[0];
        if (first) idea.date = first;
      }
    });
    all.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (b.priority || 0) - (a.priority || 0);
    });

    stats.locked = kept.filter(function (i) { return !isDismissed(i); }).length;

    return { ideas: all, stats: stats, kept: kept.length, fresh: fresh.length };
  }

  /* ---------- coverage ---------- */

  /**
   * How many places in the library genuinely match a built-in occasion.
   * Powers the "you have no content for this" markers in My Events, so it's
   * obvious why something never shows up rather than mysterious.
   */
  /**
   * Same geography rule the generator uses, so the number shown in My Events is
   * the number that will actually be scheduled. Returns a detail object; the
   * old numeric behaviour is coverageFor().
   */
  function coverageDetail(occLike) {
    var items = CJ.getItems();
    var known = CJ.allNeighborhoods();
    var angles = occLike.angles || [];
    var types = occLike.types || null;
    var angleText = angles.join(' ') + ' ' + (occLike.name || '');

    var area = (occLike.area || []).map(function (a) { return String(a).toLowerCase(); });
    if (!area.length) area = neighborhoodsIn(angleText, known).map(function (n) { return String(n).toLowerCase(); });

    function inArea(it) {
      if (!area.length) return true;
      var hood = (it.neighborhood || '').toLowerCase();
      if (!hood) return false;
      return area.some(function (a) { return sameArea(hood, a); });
    }

    var typeOk = items.filter(function (it) { return !types || types.indexOf(it.type) !== -1; });

    var here = typeOk.filter(function (it) {
      if (!inArea(it)) return false;
      if (area.length) return true;               // right area is itself the match
      if (!angles.length) return true;
      var bag = searchBag(it);
      for (var i = 0; i < angles.length; i++) if (tagMatches(bag, angles[i])) return true;
      return false;
    });

    var away = area.length ? typeOk.filter(function (it) { return it.neighborhood && !inArea(it); }) : [];

    return {
      count: here.length,
      area: area,
      inArea: here.length,
      awayCount: away.length,
      // What the generator would actually do with this date today.
      mode: here.length >= 2 ? 'in-area'
          : (occLike.crowds && area.length && away.length >= 3) ? 'escape'
          : 'none'
    };
  }

  function coverageFor(occLike) { return coverageDetail(occLike).count; }

  /* ---------- spacing conflicts (for manual moves) ---------- */

  /**
   * Where does the same place appear twice inside its minimum gap?
   * The generator never creates these, but you can by rescheduling by hand —
   * so the calendar flags them instead of silently letting them through.
   *
   * `override` = { ideaId, date } to ask "what if I moved this one there?"
   * Returns { ideaId: [ {name, need, gap, otherDate, otherLabel} ] }.
   */
  function conflictReport(override) {
    var ideas = CJ.getIdeas().filter(function (i) { return i.status !== 'dismissed'; });
    var byKey = {};   // "itemId|platform" -> [{dropId, date, label}]

    function dateOf(drop) {
      return (override && override.dropId === drop.id) ? override.date : drop.date;
    }

    function eachDrop(fn) {
      ideas.forEach(function (idea) {
        (idea.drops || []).forEach(function (d) {
          if (d.status === 'dismissed') return;
          fn(d, idea);
        });
      });
    }

    eachDrop(function (d, idea) {
      var date = dateOf(d);
      if (!date) return;
      (d.itemIds || []).forEach(function (id) {
        var k = id + '|' + d.platform;
        (byKey[k] = byKey[k] || []).push({ dropId: d.id, date: date, label: idea.title });
      });
    });

    // Real history counts too, on the platform it actually ran on.
    CJ.getItems().forEach(function (it) {
      CJ.PLATFORM_IDS.forEach(function (p) {
        var last = CJ.lastPostedOn(it, p);
        if (!last) return;
        var k = it.id + '|' + p;
        (byKey[k] = byKey[k] || []).push({ dropId: null, date: last, label: 'you posted it there' });
      });
    });

    var out = {};   // keyed by DROP id
    eachDrop(function (d) {
      var date = dateOf(d);
      if (!date) return;
      var t = CJ.parseDate(date);
      if (!t) return;

      (d.itemIds || []).forEach(function (id) {
        var item = CJ.getItem(id);
        if (!item) return;
        var need = CJ.minGapFor(item);
        if (!need) return;

        (byKey[id + '|' + d.platform] || []).forEach(function (entry) {
          if (entry.dropId === d.id) return;
          var o = CJ.parseDate(entry.date);
          if (!o) return;
          var gap = Math.abs(Math.round((o.getTime() - t.getTime()) / 86400000));
          if (gap >= need) return;
          (out[d.id] = out[d.id] || []).push({
            itemId: id, name: item.name, need: need, gap: gap, platform: d.platform,
            otherDate: entry.date, otherLabel: entry.label, isHistory: entry.dropId === null
          });
        });
      });
    });
    return out;
  }

  /** Conflicts this one drop would have at a given date. */
  function conflictsAt(dropId, dateISO) {
    var report = conflictReport({ dropId: dropId, date: dateISO });
    return report[dropId] || [];
  }

  /* ---------- refresh ---------- */

  /* ---------- capacity: how many posts a week can the library carry? ----
     The honest ceiling. Every place can post on a platform at most once per
     its spacing gap. A place marked "enough for its own post" can fill a slot
     by itself; any other place only goes out in a roundup, which needs ~3-4
     of them per post. Counts places that can post in the next 30 days (in
     season, not on hold). A rough ceiling, not a promise — occasions and
     line-up overlap usually land a little under it. */
  function capacity(platform) {
    var p = platform || 'instagram';
    var today = CJ.todayISO();
    var d30 = new Date(); d30.setDate(d30.getDate() + 30);
    var to = CJ.isoDate(d30);
    var solo = 0, group = 0, perWeek = 0, held = 0, offSeason = 0;
    CJ.getItems().forEach(function (it) {
      if (!CJ.itemAllowsPlatform(it, p) || (p === 'tiktok' && it.photosOnly)) return;
      if (CJ.holdInfo(it).held) { held++; return; }
      if (!CJ.usableBetween(it, today, to)) { offSeason++; return; }
      var gap = CJ.minGapFor(it) || 30;
      if (it.solo) { solo++; perWeek += 7 / gap; }
      else { group++; perWeek += 7 / gap / 3.5; }
    });
    return { platform: p, perWeek: Math.round(perWeek * 10) / 10, solo: solo, group: group, held: held, offSeason: offSeason };
  }

  function refresh(options) {
    var before = CJ.getIdeas().length;
    var result = generate(options);
    CJ.setIdeas(result.ideas);
    result.before = before;
    return result;
  }

  CJ.generator = {
    FORMATS: FORMATS,
    formatFor: formatFor,
    capacity: capacity,
    leadPlatformFor: leadPlatformFor,
    generate: generate,
    refresh: refresh,
    conflictReport: conflictReport,
    coverageFor: coverageFor,
    coverageDetail: coverageDetail,
    MIN_OCCASION_MATCHES: 2,
    conflictsAt: conflictsAt,
    itemMatchesTheme: itemMatchesTheme,
    searchBag: searchBag,
    listNames: listNames,
    platformsFor: platformsFor
  };

})(window.CJ);
