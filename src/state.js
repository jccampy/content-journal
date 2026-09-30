/* =========================================================================
   state.js — storage, data model, and every read/write helper.
   Everything lives in localStorage under a single key so backups are one file.
   ========================================================================= */

window.CJ = window.CJ || {};

(function (CJ) {
  'use strict';

  var STORAGE_KEY = 'atl-content-journal:v1';
  var SCHEMA = 1;

  /* ---------- defaults ---------- */

  var DEFAULT_SETTINGS = {
    ideasPerMonth: 8,
    repostCooldownDays: 120,
    // Hard floor: the same place can never appear in two posts closer than this.
    // The cooldown above is a soft preference; this one is a rule.
    minGapDays: { restaurant: 30, experience: 30, home: 30 },
    preferredDays: [2, 4, 6], // Tue, Thu, Sat

    /* Posting cadence, per platform per week. A platform at 0 is paused: the
       calendar makes nothing for it. Each post takes one real slot on one of
       your posting days, so a week never holds more than this. Set to null to
       fall back to the older concepts-per-month mode (ideasPerMonth). */
    postsPerWeek: { instagram: 5, tiktok: 0, pinterest: 0 },
    showWeather: true,
    horizonMonths: 6,
    // Julia's lanes: food/restaurants + home/lifestyle on Instagram,
    // Atlanta + lifestyle on TikTok, everything on Pinterest.
    platformRules: {
      restaurant: { instagram: true, pinterest: true, tiktok: false },
      experience: { instagram: false, pinterest: true, tiktok: true },
      home: { instagram: true, pinterest: true, tiktok: true }
    },

    /* One concept rolls out across platforms over several days rather than
       landing everywhere at once. Food leads on Instagram, Atlanta/lifestyle
       leads on TikTok, and Pinterest is always last because those pins link
       back to the video — it has to exist first. */
    rollout: {
      leadBy: { restaurant: 'instagram', experience: 'tiktok', home: 'instagram' },
      gapDays: 2,
      pinterestLast: true
    },

    /* A roundup with this many places is a carousel; fewer is a reel. */
    carouselMinItems: 5,

    disabledBuiltinEvents: [],

    /* 'rows' (compact) or 'cards'. A preference, so it syncs across devices. */
    libraryView: 'rows',

    /* How the library list is grouped. Type by default, so the list reads as
       Restaurants / Experiences / At home rather than one long run. */
    libraryGroup: 'type',

    /* Monthly topics you've dismissed from the planning list. */
    hiddenTopics: [],

    ai: { key: '', model: 'claude-sonnet-5-5', voice: '' },

    /* Optional plan focus set by the Plan builder: a collection the plan is
       built from, e.g. { kind: 'neighborhood', value: 'Midtown' }. Occasions
       and themes use only its places; deadlines and history still see the
       whole library. The spacing and geography rules are unchanged. null
       means the whole library. */
    planFocus: null
  };

  function blankState() {
    return {
      schema: SCHEMA,
      items: [],
      events: [],
      ideas: [],
      topics: [],           // your own monthly planning topics
      tagMeta: {},          // tag -> { category, color }
      tagIndex: {},         // lowercase key -> the spelling actually used
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      lastGeneratedAt: null,
      createdAt: new Date().toISOString()
    };
  }

  /* ---------- load / save ---------- */

  var state = null;
  var listeners = [];

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); }
    catch (e) { console.warn('localStorage unavailable', e); }

    if (!raw) { state = blankState(); return state; }

    try {
      var parsed = JSON.parse(raw);
      state = migrate(parsed);
      unifyTags();
    } catch (e) {
      console.error('Could not parse saved journal, starting fresh.', e);
      state = blankState();
    }
    return state;
  }

  function migrate(s) {
    var base = blankState();
    s = s || {};
    // Deep-merge settings so new preferences added in later versions appear.
    var merged = Object.assign({}, base, s);
    merged.settings = Object.assign({}, base.settings, s.settings || {});
    merged.settings.ai = Object.assign({}, base.settings.ai, (s.settings && s.settings.ai) || {});
    // Older builds shipped model ids that aren't valid; move them to current ones.
    var OLD_MODELS = { 'claude-sonnet-5': 'claude-sonnet-5-5', 'claude-opus-5': 'claude-opus-5-5' };
    if (OLD_MODELS[merged.settings.ai.model]) merged.settings.ai.model = OLD_MODELS[merged.settings.ai.model];
    merged.settings.platformRules = Object.assign({}, base.settings.platformRules, (s.settings && s.settings.platformRules) || {});
    merged.settings.minGapDays = Object.assign({}, base.settings.minGapDays, (s.settings && s.settings.minGapDays) || {});
    merged.settings.rollout = Object.assign({}, base.settings.rollout, (s.settings && s.settings.rollout) || {});
    if (s.settings && s.settings.postsPerWeek === null) merged.settings.postsPerWeek = null;
    else merged.settings.postsPerWeek = Object.assign({}, base.settings.postsPerWeek, (s.settings && s.settings.postsPerWeek) || {});
    merged.settings.rollout.leadBy = Object.assign({}, base.settings.rollout.leadBy,
      (s.settings && s.settings.rollout && s.settings.rollout.leadBy) || {});
    merged.items = Array.isArray(s.items) ? s.items.map(normalizeItem) : [];
    merged.events = Array.isArray(s.events) ? s.events : [];
    merged.ideas = Array.isArray(s.ideas) ? s.ideas.map(normalizeIdea) : [];
    merged.topics = Array.isArray(s.topics) ? s.topics.map(normalizeTopic) : [];
    merged.tagMeta = s.tagMeta || {};
    merged.schema = SCHEMA;
    merged.tagIndex = rebuildTagIndex(merged.items, merged.tagMeta);
    return merged;
  }

  var PLATFORM_IDS = ['tiktok', 'instagram', 'pinterest'];

  /** Drop case-duplicate tags before the index exists (used during migration). */
  function dedupeCI(list) {
    var out = [], seen = {};
    (list || []).forEach(function (t) {
      var d = String(t == null ? '' : t).trim().replace(/\s+/g, ' ');
      if (!d) return;
      var k = d.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(d);
    });
    return out;
  }

  function normalizeFit(f) {
    var out = { tiktok: 'auto', instagram: 'auto', pinterest: 'auto' };
    if (!f) return out;
    PLATFORM_IDS.forEach(function (p) {
      if (f[p] === 'yes' || f[p] === 'no') out[p] = f[p];
    });
    return out;
  }

  /** 'auto' | 'yes' | 'no' — how this place is set for a platform. */
  function fitFor(item, platform) {
    var f = item && item.platformFit && item.platformFit[platform];
    return (f === 'yes' || f === 'no') ? f : 'auto';
  }

  /** Does this place belong on this platform at all? */
  function itemAllowsPlatform(item, platform) {
    var f = fitFor(item, platform);
    if (f === 'no') return false;
    if (f === 'yes') return true;
    var rules = (state.settings.platformRules || {})[item.type] || {};
    return !!rules[platform];
  }

  function blankPlatformUse() {
    return { tiktok: { count: 0, lastPosted: null },
             instagram: { count: 0, lastPosted: null },
             pinterest: { count: 0, lastPosted: null } };
  }

  function normalizePlatformUse(pu, fallbackPlatforms, fallbackDate, fallbackCount) {
    var out = blankPlatformUse();
    PLATFORM_IDS.forEach(function (p) {
      var src = pu && pu[p];
      if (src) {
        out[p] = { count: Math.max(0, Number(src.count) || 0), lastPosted: src.lastPosted || null };
      } else if (fallbackPlatforms && fallbackPlatforms.indexOf(p) !== -1) {
        // Old data only knew "posted, on these platforms" — spread it across them.
        out[p] = { count: fallbackCount || 1, lastPosted: fallbackDate || null };
      }
    });
    return out;
  }

  /**
   * A layer is one shoot at a place — a visit, a dish, a season. Places persist;
   * layers accumulate. Adding footage should never overwrite what came before.
   */
  function normalizeLayer(l, inherited) {
    inherited = inherited || {};
    var count = l.postCount;
    if (count == null) count = l.lastPosted ? 1 : 0;
    var now = new Date().toISOString();
    return {
      id: l.id || uid(),
      label: l.label || 'Footage',
      capturedAt: l.capturedAt || null,
      notes: l.notes || '',
      tags: Array.isArray(l.tags) ? dedupeCI(l.tags) : [],
      deadline: l.deadline || null,
      deadlineNote: l.deadlineNote || '',
      priority: l.priority || 'normal',
      postCount: Math.max(0, Number(count) || 0),
      lastPosted: l.lastPosted || null,
      platformUse: normalizePlatformUse(l.platformUse, l.platforms || inherited.platforms, l.lastPosted, count),
      retired: !!l.retired,
      // null = decide from the notes; true = on hold; false = use it anyway.
      hold: l.hold === true ? true : l.hold === false ? false : null,
      createdAt: l.createdAt || now,
      updatedAt: l.updatedAt || l.createdAt || now
    };
  }

  function normalizeWeb(w) {
    if (!w || typeof w !== 'object') return null;
    return {
      url: w.url || '', readAt: w.readAt || null, summary: w.summary || '',
      neighborhood: w.neighborhood || null,
      facts: Object.assign({ hours: '', reservations: '', price: '', happyHour: '', parking: '' }, w.facts || {}),
      suggestedTags: Array.isArray(w.suggestedTags) ? w.suggestedTags : [],
      ideas: Array.isArray(w.ideas) ? w.ideas : []
    };
  }

  function normalizeItem(it) {
    var now = new Date().toISOString();

    // Every place carries at least one layer. Older entries stored their usage
    // and deadline directly on the place, so fold that into a first layer.
    var layers = Array.isArray(it.layers) && it.layers.length
      ? it.layers.map(function (l) { return normalizeLayer(l, it); })
      : [normalizeLayer({
          label: 'Original footage',
          // Deliberately blank. The day you added the entry is not the day you
          // shot it, and guessing puts a wrong date in front of you as fact.
          capturedAt: null,
          notes: '',
          deadline: it.deadline || null,
          deadlineNote: it.deadlineNote || '',
          priority: it.priority || 'normal',
          postCount: it.postCount != null ? it.postCount : (it.lastPosted ? 1 : 0),
          lastPosted: it.lastPosted || null,
          platforms: it.platforms || [],
          createdAt: it.createdAt || now
        }, it)];

    var item = {
      id: it.id || uid(),
      name: it.name || 'Untitled',
      type: it.type || 'restaurant',
      neighborhood: it.neighborhood || '',
      tags: Array.isArray(it.tags) ? dedupeCI(it.tags) : [],
      notes: it.notes || '',
      link: it.link || '',
      layers: layers,
      // Where this place actually works. 'auto' follows the type rules in
      // Settings; 'yes' forces it in; 'no' keeps it off that platform entirely.
      // Some footage is a TikTok and simply is not an Instagram post.
      platformFit: normalizeFit(it.platformFit),
      // Per-platform history drives the spacing rule, which is per platform:
      // an Instagram post and a Pinterest pin about the same place don't
      // compete with each other.
      platformUse: normalizePlatformUse(it.platformUse, it.platforms, it.lastPosted, it.postCount),
      // Readiness: null = decide from the notes; true = on hold (not enough
      // for a post yet); false = use it anyway, whatever the notes say.
      hold: it.hold === true ? true : it.hold === false ? false : null,
      // Enough footage to carry a single-place post on its own.
      solo: !!it.solo,
      // What Claude read on the place's own website: summary, facts, tags you
      // haven't taken yet, and post ideas. Suggestions only; see ui-website.js.
      web: normalizeWeb(it.web),
      // Photos only, no video: carousels on Instagram, never TikTok.
      photosOnly: !!it.photosOnly,
      // When it can post: 'auto' reads the tags and name (Halloween, fall…),
      // 'any' means year-round, 'months' means only seasonMonths (1-12).
      seasonMode: it.seasonMode === 'any' || it.seasonMode === 'months' ? it.seasonMode : 'auto',
      seasonMonths: Array.isArray(it.seasonMonths)
        ? it.seasonMonths.map(Number).filter(function (m) { return m >= 1 && m <= 12; })
        : [],
      createdAt: it.createdAt || now,
      updatedAt: it.updatedAt || it.createdAt || now
    };

    rollUp(item);
    return item;
  }

  /** Recompute the place-level totals from its layers. */
  function rollUp(item) {
    var count = 0, last = null, deadline = null, dNote = '', prio = 'normal';
    (item.layers || []).forEach(function (l) {
      count += l.postCount || 0;
      if (l.lastPosted && (!last || l.lastPosted > last)) last = l.lastPosted;
      if (l.deadline && (!deadline || l.deadline < deadline)) {
        deadline = l.deadline; dNote = l.deadlineNote || ''; prio = l.priority || 'normal';
      }
    });
    item.postCount = count;
    item.lastPosted = last;
    // Soonest live deadline across the layers, surfaced on the place.
    item.deadline = deadline;
    item.deadlineNote = dNote;
    item.priority = prio;
    item.platforms = PLATFORM_IDS.filter(function (p) {
      return item.platformUse[p] && item.platformUse[p].count > 0;
    });
    return item;
  }

  var saveTimer = null;
  function save(immediate) {
    if (saveTimer) clearTimeout(saveTimer);
    var doIt = function () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        console.error('Save failed', e);
        CJ.toast && CJ.toast('Could not save — browser storage may be full. Export a backup now.', 'error');
      }
    };
    if (immediate) doIt(); else saveTimer = setTimeout(doIt, 150);
  }

  function emit() {
    listeners.forEach(function (fn) { try { fn(state); } catch (e) { console.error(e); } });
  }

  function commit(immediate) {
    // Inside a batch, every commit collapses into one at the end. Adding forty
    // places one at a time would otherwise save and re-render forty times,
    // which is slow and makes the screen thrash.
    if (batchDepth > 0) { batchDirty = true; return; }
    save(immediate); emit();
  }

  var batchDepth = 0, batchDirty = false;

  /**
   * Run fn with saves and re-renders deferred to a single commit at the end.
   * Nests safely. Commits if anything changed even when fn throws, so a
   * half-finished import is still written down rather than silently lost.
   */
  function batch(fn) {
    batchDepth++;
    try { return fn(); }
    finally {
      batchDepth--;
      if (batchDepth === 0 && batchDirty) { batchDirty = false; save(); emit(); }
    }
  }

  function subscribe(fn) { listeners.push(fn); }

  /* ---------- ids & helpers ---------- */

  function uid() {
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function slug(s) {
    return String(s || '').toLowerCase().trim()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /* ---------- items ---------- */

  function getItems() { return state.items; }

  function getItem(id) {
    for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i];
    return null;
  }

  function upsertItem(data) {
    var now = new Date().toISOString();
    if (data.id) {
      var existing = getItem(data.id);
      if (existing) {
        // Patching a place must never drop the layers already under it.
        var merged = Object.assign({}, existing, data);
        if (!data.layers) merged.layers = existing.layers;
        if (!data.platformUse) merged.platformUse = existing.platformUse;
        Object.assign(existing, normalizeItem(merged));
        existing.tags = canonicalList(existing.tags);
        if (existing.neighborhood) existing.neighborhood = canonicalTag(existing.neighborhood);
        existing.updatedAt = now;
        registerTags(existing);
        commit();
        return existing;
      }
    }
    var item = normalizeItem(Object.assign({ createdAt: now, updatedAt: now }, data, { id: data.id || uid() }));
    item.tags = canonicalList(item.tags);
    if (item.neighborhood) item.neighborhood = canonicalTag(item.neighborhood);
    state.items.unshift(item);
    registerTags(item);
    commit();
    return item;
  }

  function deleteItem(id) {
    state.items = state.items.filter(function (i) { return i.id !== id; });
    // Drop the item from any generated idea so nothing references a ghost.
    state.ideas.forEach(function (idea) {
      idea.itemIds = (idea.itemIds || []).filter(function (x) { return x !== id; });
    });
    state.ideas = state.ideas.filter(function (idea) {
      return idea.source === 'ai' || idea.pinned || (idea.itemIds && idea.itemIds.length > 0);
    });
    commit();
  }

  /**
   * Log a use. Records it against the place, the specific layer that ran, and
   * the platform it ran on — the platform breakdown is what the spacing rule
   * reads, since the rule is per platform.
   */
  function markPosted(id, opts) {
    var it = getItem(id);
    if (!it) return;
    opts = (typeof opts === 'string') ? { date: opts } : (opts || {});
    var date = opts.date || todayISO();
    var platform = opts.platform || null;

    var layer = null;
    if (opts.layerId) layer = getLayer(it, opts.layerId);
    if (!layer) layer = bestLayerFor(it) || it.layers[0];

    if (layer) {
      layer.postCount = (layer.postCount || 0) + 1;
      layer.lastPosted = date;
      layer.updatedAt = new Date().toISOString();
      if (platform && layer.platformUse[platform]) {
        layer.platformUse[platform].count += 1;
        layer.platformUse[platform].lastPosted = date;
      }
    }

    if (platform && it.platformUse[platform]) {
      it.platformUse[platform].count += 1;
      it.platformUse[platform].lastPosted = date;
    } else if (!platform) {
      // No platform given — treat it as a generic use across the board.
      PLATFORM_IDS.forEach(function (p) {
        if (!it.platformUse[p].lastPosted || it.platformUse[p].lastPosted < date) {
          it.platformUse[p].lastPosted = date;
        }
      });
    }

    rollUp(it);
    it.updatedAt = new Date().toISOString();
    commit();
  }

  /* ---------- layers ---------- */

  function getLayer(item, layerId) {
    if (!item) return null;
    for (var i = 0; i < item.layers.length; i++) if (item.layers[i].id === layerId) return item.layers[i];
    return null;
  }

  /** The layer with the most life left: unused first, then longest unused. */
  function bestLayerFor(item, platform, iso) {
    // With a date, only clips that can actually post then: not on hold and in
    // season. Without one (display), any live clip.
    var live = iso ? usableLayersOn(item, iso) : [];
    if (!live.length) live = (item.layers || []).filter(function (l) { return !l.retired; });
    if (!live.length) return null;
    var scored = live.map(function (l) {
      var s = 0;
      if (!l.postCount) s += 100;
      else s -= Math.min(l.postCount, 6) * 12;
      if (platform && l.platformUse[platform] && !l.platformUse[platform].count) s += 40;
      if (l.lastPosted) s += Math.min(daysSince(l.lastPosted), 400) * 0.15;
      else s += 40;
      if (l.deadline) {
        var left = daysBetween(new Date(), parseDate(l.deadline));
        if (left >= 0 && left < 90) s += (90 - left) * 0.7;
        if (l.priority === 'high') s += 40;
      }
      return { l: l, s: s };
    });
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored[0].l;
  }

  function addLayer(itemId, data) {
    var it = getItem(itemId);
    if (!it) return null;
    var layer = normalizeLayer(Object.assign({ createdAt: new Date().toISOString() }, data));
    layer.tags = canonicalList(layer.tags);
    it.layers.push(layer);
    // Layer tags are searchable on the place, so fold them up.
    (layer.tags || []).forEach(function (t) {
      if (it.tags.indexOf(t) === -1) it.tags.push(t);
    });
    registerTags(it);
    rollUp(it);
    it.updatedAt = new Date().toISOString();
    commit();
    return layer;
  }

  function updateLayer(itemId, layerId, patch) {
    var it = getItem(itemId);
    if (!it) return null;
    var layer = getLayer(it, layerId);
    if (!layer) return null;
    Object.assign(layer, patch);
    if (patch.tags) layer.tags = canonicalList(layer.tags);
    layer.updatedAt = new Date().toISOString();
    rollUp(it);
    it.updatedAt = new Date().toISOString();
    commit();
    return layer;
  }

  function deleteLayer(itemId, layerId) {
    var it = getItem(itemId);
    if (!it) return;
    if (it.layers.length <= 1) return; // a place always keeps at least one layer
    it.layers = it.layers.filter(function (l) { return l.id !== layerId; });
    rollUp(it);
    it.updatedAt = new Date().toISOString();
    commit();
  }

  /** Layers that have never gone up anywhere. */
  function unusedLayers(item) {
    return (item.layers || []).filter(function (l) { return !l.retired && !l.postCount; });
  }

  /* ---------- per-platform history ---------- */

  function lastPostedOn(item, platform) {
    var pu = item && item.platformUse && item.platformUse[platform];
    return pu ? pu.lastPosted : null;
  }

  function postCountOn(item, platform) {
    var pu = item && item.platformUse && item.platformUse[platform];
    return pu ? (pu.count || 0) : 0;
  }

  /* ---------- reuse readiness ---------- */

  var REUSE = [
    { id: 'unused', label: 'Never used',      emoji: '✨', hint: 'Content you have but have never posted' },
    { id: 'ready',  label: 'Ready to reuse',  emoji: '♻️', hint: 'Either enough time has passed, or you have unused footage of it' },
    { id: 'recent', label: 'Recently used',   emoji: '🕐', hint: 'Posted inside your cooldown window' },
    { id: 'due',    label: 'Has a deadline',  emoji: '⏰', hint: 'Needs to go up by a certain date' }
  ];

  /**
   * Which reuse bucket a place sits in. Unshot-but-unposted footage counts:
   * a place you've featured before but that has a fresh unused layer is ready
   * again regardless of the cooldown, because it's genuinely new material.
   */
  function reuseState(item) {
    if (!item.lastPosted) return 'unused';
    if (unusedLayers(item).length) return 'ready';
    var cooldown = state.settings.repostCooldownDays != null ? state.settings.repostCooldownDays : 120;
    return daysSince(item.lastPosted) >= cooldown ? 'ready' : 'recent';
  }

  function reuseInfo(id) {
    for (var i = 0; i < REUSE.length; i++) if (REUSE[i].id === id) return REUSE[i];
    return REUSE[0];
  }

  /** The hard minimum number of days between two posts featuring this place. */
  function minGapFor(item) {
    var g = state.settings.minGapDays || {};
    var v = g[item && item.type];
    return v == null ? 30 : Math.max(0, Number(v) || 0);
  }

  /* ---------- tag canonicalisation ---------- */

  /**
   * "group friendly", "Group Friendly" and "Group friendly " are one tag.
   *
   * A key is the lowercased, whitespace-collapsed form. The index maps each key
   * to the single spelling the app displays — whichever spelling you used most
   * often, so the majority wins rather than whichever you happened to type
   * first. Everything written into the library goes through canonicalTag().
   */
  function tagKey(t) {
    return String(t == null ? '' : t).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function tidy(t) {
    return String(t == null ? '' : t).trim().replace(/\s+/g, ' ');
  }

  function rebuildTagIndex(items, tagMeta) {
    var counts = {};
    function note(t) {
      var k = tagKey(t);
      if (!k) return;
      var disp = tidy(t);
      counts[k] = counts[k] || {};
      counts[k][disp] = (counts[k][disp] || 0) + 1;
    }
    (items || []).forEach(function (it) {
      (it.tags || []).forEach(note);
      if (it.neighborhood) note(it.neighborhood);
      (it.layers || []).forEach(function (l) { (l.tags || []).forEach(note); });
    });
    Object.keys(tagMeta || {}).forEach(note);

    var index = {};
    Object.keys(counts).forEach(function (k) {
      var best = null, n = -1;
      Object.keys(counts[k]).forEach(function (sp) {
        if (counts[k][sp] > n) { n = counts[k][sp]; best = sp; }
      });
      index[k] = best;
    });
    return index;
  }

  /** The one spelling this tag is stored and shown as. */
  function canonicalTag(raw) {
    var k = tagKey(raw);
    if (!k) return '';
    if (!state.tagIndex) state.tagIndex = {};
    if (!state.tagIndex[k]) state.tagIndex[k] = tidy(raw);
    return state.tagIndex[k];
  }

  function canonicalList(list) {
    var out = [], seen = {};
    (list || []).forEach(function (t) {
      var c = canonicalTag(t);
      if (!c) return;
      var k = tagKey(c);
      if (seen[k]) return;      // same tag twice in different casing
      seen[k] = true;
      out.push(c);
    });
    return out;
  }

  /** Fold every existing tag onto its canonical spelling. Runs once on load. */
  function unifyTags() {
    state.tagIndex = rebuildTagIndex(state.items, state.tagMeta);

    state.items.forEach(function (it) {
      it.tags = canonicalList(it.tags);
      if (it.neighborhood) it.neighborhood = canonicalTag(it.neighborhood);
      (it.layers || []).forEach(function (l) { l.tags = canonicalList(l.tags); });
    });

    var meta = {};
    Object.keys(state.tagMeta || {}).forEach(function (t) {
      var c = canonicalTag(t);
      if (!c) return;
      // First one wins if two spellings carried different categories.
      if (!meta[c]) meta[c] = state.tagMeta[t];
    });
    state.tagMeta = meta;
  }

  /* ---------- tags ---------- */

  var TAG_CATEGORIES = [
    { id: 'neighborhood', label: 'Neighborhood', color: '#3f7d6e' },
    { id: 'vibe',         label: 'Vibe',         color: '#b4633a' },
    { id: 'occasion',     label: 'Occasion',     color: '#7b5ea7' },
    { id: 'feature',      label: 'Feature',      color: '#2f6f9e' },
    { id: 'other',        label: 'Other',        color: '#6b6b74' }
  ];

  // Words that let us auto-file a brand-new tag into a sensible category.
  var CATEGORY_HINTS = {
    occasion: ['date night', 'date-night', 'girls night', 'birthday', 'brunch', 'anniversary', 'holiday',
               'group', 'solo', 'family', 'kid friendly', 'kid-friendly', 'first date', 'happy hour', 'late night'],
    feature: ['patio', 'rooftop', 'dog friendly', 'dog-friendly', 'good patio', 'parking', 'reservations',
              'walk in', 'walk-in', 'byob', 'live music', 'view', 'fireplace', 'outdoor', 'takeout', 'delivery'],
    vibe: ['cozy', 'cute', 'aesthetic', 'casual', 'fancy', 'upscale', 'divey', 'dive', 'romantic', 'lively',
           'quiet', 'trendy', 'classic', 'chill', 'moody', 'bright', 'seasonal', 'budget', 'splurge']
  };

  var ATL_NEIGHBORHOODS = [
    'old fourth ward', 'o4w', 'inman park', 'virginia highland', 'va-hi', 'midtown', 'buckhead', 'west midtown',
    'westside', 'poncey-highland', 'little five points', 'l5p', 'east atlanta village', 'eav', 'grant park',
    'summerhill', 'cabbagetown', 'reynoldstown', 'kirkwood', 'decatur', 'downtown', 'castleberry hill',
    'druid hills', 'edgewood', 'sweet auburn', 'chamblee', 'brookhaven', 'sandy springs', 'college park',
    'west end', 'ormewood park', 'candler park', 'morningside', 'atlantic station', 'the battery', 'smyrna',
    'roswell', 'alpharetta', 'marietta', 'avondale estates', 'toco hills', 'vinings', 'dunwoody'
  ];

  function guessCategory(tag) {
    var t = tag.toLowerCase().trim();
    if (ATL_NEIGHBORHOODS.indexOf(t) !== -1) return 'neighborhood';
    for (var cat in CATEGORY_HINTS) {
      for (var i = 0; i < CATEGORY_HINTS[cat].length; i++) {
        if (t === CATEGORY_HINTS[cat][i] || t.indexOf(CATEGORY_HINTS[cat][i]) !== -1) return cat;
      }
    }
    return 'other';
  }

  function registerTags(item) {
    (item.tags || []).forEach(function (t) {
      var c = canonicalTag(t);
      if (c && !state.tagMeta[c]) state.tagMeta[c] = { category: guessCategory(c) };
    });
    if (item.neighborhood) {
      var n = canonicalTag(item.neighborhood);
      if (n && !state.tagMeta[n]) state.tagMeta[n] = { category: 'neighborhood' };
    }
  }

  function tagCategory(tag) {
    var m = state.tagMeta[tag];
    return (m && m.category) || guessCategory(tag);
  }

  function setTagCategory(tag, cat) {
    state.tagMeta[tag] = state.tagMeta[tag] || {};
    state.tagMeta[tag].category = cat;
    commit();
  }

  function categoryColor(cat) {
    for (var i = 0; i < TAG_CATEGORIES.length; i++) if (TAG_CATEGORIES[i].id === cat) return TAG_CATEGORIES[i].color;
    return '#6b6b74';
  }

  /**
   * Every tag in use, with counts, sorted by frequency then alphabetically.
   * Neighborhoods live in their own field but behave like tags everywhere in
   * the UI, so the filter bar asks for them to be folded in.
   */
  function allTags(includeNeighborhoods) {
    var counts = {};
    var forced = {};
    state.items.forEach(function (it) {
      (it.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
      if (includeNeighborhoods && it.neighborhood) {
        var n = it.neighborhood;
        if (!counts[n]) forced[n] = 'neighborhood';
        counts[n] = (counts[n] || 0) + 1;
      }
    });
    return Object.keys(counts).map(function (t) {
      return { tag: t, count: counts[t], category: forced[t] || tagCategory(t) };
    }).sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return a.tag.localeCompare(b.tag);
    });
  }

  function allNeighborhoods() {
    var set = {};
    state.items.forEach(function (it) { if (it.neighborhood) set[it.neighborhood] = true; });
    return Object.keys(set).sort();
  }

  /* ---------- events ---------- */

  /* ---------- your own monthly topics ---------- */

  function normalizeTopic(t) {
    t = t || {};
    var months = t.months;
    if (months !== 'any') {
      months = (Array.isArray(months) ? months : [])
        .map(Number).filter(function (m) { return m >= 1 && m <= 12; });
      if (!months.length) months = 'any';
    }
    return {
      id: t.id || ('own:' + uid()),
      own: true,
      months: months,
      title: t.title || 'Untitled topic',
      why: t.why || '',
      lane: t.lane || 'city',
      platforms: Array.isArray(t.platforms) && t.platforms.length ? t.platforms : ['instagram'],
      types: Array.isArray(t.types) && t.types.length ? t.types : ['restaurant', 'experience', 'home'],
      needs: Array.isArray(t.needs) ? t.needs : [],
      recurring: !!t.recurring,
      evergreen: months === 'any',
      createdAt: t.createdAt || new Date().toISOString()
    };
  }

  function getTopics() { return state.topics || (state.topics = []); }

  function upsertTopic(data) {
    var list = getTopics();
    if (data.id) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === data.id) {
          list[i] = normalizeTopic(Object.assign({}, list[i], data));
          commit();
          return list[i];
        }
      }
    }
    var t = normalizeTopic(data);
    list.unshift(t);
    commit();
    return t;
  }

  function deleteTopic(id) {
    state.topics = getTopics().filter(function (t) { return t.id !== id; });
    commit();
  }

  /** Built-in topics can't be deleted, only hidden. */
  function setTopicHidden(id, hidden) {
    var list = (state.settings.hiddenTopics || []).slice();
    var ix = list.indexOf(id);
    if (hidden && ix === -1) list.push(id);
    if (!hidden && ix !== -1) list.splice(ix, 1);
    updateSettings({ hiddenTopics: list });
  }

  function getEvents() { return state.events; }

  function upsertEvent(data) {
    if (data.id) {
      for (var i = 0; i < state.events.length; i++) {
        if (state.events[i].id === data.id) {
          Object.assign(state.events[i], data);
          commit();
          return state.events[i];
        }
      }
    }
    var ev = Object.assign({ id: uid(), createdAt: new Date().toISOString() }, data);
    if (!ev.id) ev.id = uid();
    state.events.push(ev);
    commit();
    return ev;
  }

  function deleteEvent(id) {
    state.events = state.events.filter(function (e) { return e.id !== id; });
    commit();
  }

  /* ---------- ideas ---------- */

  /**
   * An idea is one concept; a drop is that concept going up on one platform on
   * one day. Older ideas carried a single date and a list of platforms — fold
   * those into drops so nothing on an existing calendar is lost.
   */
  function normalizeIdea(idea) {
    if (!idea) return idea;
    if (Array.isArray(idea.drops) && idea.drops.length) {
      idea.drops = idea.drops.map(function (d) {
        return {
          id: d.id || (idea.id + '::' + d.platform),
          platform: d.platform,
          format: d.format || 'reel',
          date: d.date || idea.date,
          itemIds: Array.isArray(d.itemIds) ? d.itemIds : (idea.itemIds || []),
          layerByItem: d.layerByItem || {},
          linksTo: d.linksTo || null,
          status: d.status || 'suggested',
          pinned: !!d.pinned,
          touched: !!d.touched,
          notes: d.notes || ''
        };
      });
      return idea;
    }

    var platforms = Array.isArray(idea.platforms) && idea.platforms.length ? idea.platforms : ['instagram'];
    idea.drops = platforms.map(function (p, i) {
      return {
        id: idea.id + '::' + p,
        platform: p,
        format: p === 'pinterest' ? 'pins' : (p === 'tiktok' ? 'video' : 'reel'),
        date: idea.date,
        itemIds: idea.itemIds || [],
        layerByItem: {},
        linksTo: null,
        status: idea.status || 'suggested',
        pinned: !!idea.pinned,
        touched: !!idea.touched,
        notes: ''
      };
    });
    return idea;
  }

  function getIdeas() { return state.ideas; }

  /** Every drop across every idea, flattened, each carrying its parent. */
  function getDrops() {
    var out = [];
    state.ideas.forEach(function (idea) {
      (idea.drops || []).forEach(function (d) { out.push({ drop: d, idea: idea }); });
    });
    return out;
  }

  function getDrop(dropId) {
    for (var i = 0; i < state.ideas.length; i++) {
      var ds = state.ideas[i].drops || [];
      for (var j = 0; j < ds.length; j++) {
        if (ds[j].id === dropId) return { drop: ds[j], idea: state.ideas[i] };
      }
    }
    return null;
  }

  function updateDrop(dropId, patch) {
    var found = getDrop(dropId);
    if (!found) return null;
    Object.assign(found.drop, patch);
    found.drop.touched = true;
    // The concept sorts by its earliest remaining drop.
    var dates = (found.idea.drops || []).map(function (d) { return d.date; }).sort();
    if (dates.length) found.idea.date = dates[0];
    commit();
    return found.drop;
  }

  function getIdea(id) {
    for (var i = 0; i < state.ideas.length; i++) if (state.ideas[i].id === id) return state.ideas[i];
    return null;
  }

  function updateIdea(id, patch) {
    var idea = getIdea(id);
    if (!idea) return null;
    Object.assign(idea, patch);
    idea.touched = true;
    commit();
    return idea;
  }

  function setIdeas(list) {
    state.ideas = (list || []).map(normalizeIdea);
    state.lastGeneratedAt = new Date().toISOString();
    commit(true);
  }

  function addIdeas(list) {
    state.ideas = state.ideas.concat((list || []).map(normalizeIdea));
    commit(true);
  }

  /* ---------- settings ---------- */

  function settings() { return state.settings; }

  function updateSettings(patch) {
    Object.assign(state.settings, patch);
    commit();
  }

  function updateAISettings(patch) {
    Object.assign(state.settings.ai, patch);
    commit();
  }

  /* ---------- dates ---------- */

  function todayISO() {
    var d = new Date();
    return isoDate(d);
  }

  function isoDate(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /** Parse 'YYYY-MM-DD' as a LOCAL date (avoids the UTC off-by-one). */
  function parseDate(s) {
    if (!s) return null;
    var p = String(s).split('-');
    if (p.length < 3) return null;
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function daysBetween(a, b) {
    return Math.round((b - a) / 86400000);
  }

  function daysSince(isoStr) {
    var d = parseDate(isoStr);
    if (!d) return Infinity;
    return daysBetween(d, new Date());
  }

  function formatDate(isoStr, opts) {
    var d = parseDate(isoStr);
    if (!d) return '';
    return d.toLocaleDateString('en-US', opts || { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ---------- backup ---------- */

  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }

  /** The raw document, for the cloud sync layer. */
  function exportDoc() { return state; }

  /**
   * Swap in a document produced by a merge. Deliberately does not re-emit a
   * change event — the sync layer decides when to re-render, and emitting here
   * would queue an immediate push back to the server in a loop.
   */
  function replaceState(doc) {
    state = migrate(doc);
    unifyTags();
    save(true);
  }

  function importJSON(text, mode) {
    var incoming = JSON.parse(text);
    if (!incoming || typeof incoming !== 'object') throw new Error('That file is not a journal backup.');
    if (!Array.isArray(incoming.items)) throw new Error('That file has no content library in it.');

    if (mode === 'merge') {
      var byId = {};
      state.items.forEach(function (i) { byId[i.id] = i; });
      incoming.items.forEach(function (raw) {
        var it = normalizeItem(raw);
        var mine = byId[it.id];
        if (!mine) { state.items.push(it); byId[it.id] = it; return; }
        // Keep whichever copy was edited most recently.
        if (new Date(it.updatedAt) > new Date(mine.updatedAt)) Object.assign(mine, it);
      });
      var evIds = {};
      state.events.forEach(function (e) { evIds[e.id] = true; });
      (incoming.events || []).forEach(function (e) { if (!evIds[e.id]) state.events.push(e); });
      state.tagMeta = Object.assign({}, incoming.tagMeta || {}, state.tagMeta);
    } else {
      state = migrate(incoming);
    }
    commit(true);
    return state.items.length;
  }

  function wipe() {
    state = blankState();
    commit(true);
  }

  function storageBytes() {
    try { return (localStorage.getItem(STORAGE_KEY) || '').length; }
    catch (e) { return 0; }
  }

  /* ---------- readiness: "not enough for a post yet" ----------
     You write notes like "not enough footage, go back" or "need to reshoot".
     Those mean: don't build a post out of this yet. The phrases below are the
     ones that say that about the FOOTAGE (not "not enough seating"), and the
     matched words are shown back to you, with a one-click "use anyway". */

  var HOLD_RX = [
    /\bnot enough\b[^.;!\n]{0,40}?\b(footage|clips?|content|videos?|shots?|photos?|pictures?|pics|b-?roll|material|angles?|to (make|do|fill|post)|for (a |the |one )?(full |whole |real )?(post|reel|video|carousel|feature))\b/i,
    /\b(need|needs|want|have) to (get|shoot|film|capture|grab)\b[^.;!\n]{0,20}?\b(more|extra|another)\b/i,
    /\b(need|needs) (a (few|couple)( more)?|more|extra|another)\b[^.;!\n]{0,25}?\b(footage|clips?|content|videos?|shots?|photos?|pics|b-?roll|angles?|visit)\b/i,
    /\b(too few|only (have |got )?(one|two|1|2|a couple( of)?|a few))\b[^.;!\n]{0,20}?\b(clips?|shots?|photos?|pics|videos?|seconds?)\b/i,
    /\b(re-?shoot|re-?film|go back (and|to) (film|shoot)|film more|shoot more|finish (filming|shooting))\b/i,
    /\b(don'?t|do not|can'?t|cannot) (post|use) (this |it |yet)?\s*(yet|for now|until)\b/i,
    /\bnot (a full post|enough yet|ready to (post|use))\b/i,
    /\b(on hold|hold (for now|off on (it|this|posting)))\b/i
  ];

  function holdMatch(text) {
    if (!text) return null;
    for (var i = 0; i < HOLD_RX.length; i++) {
      var m = String(text).match(HOLD_RX[i]);
      if (m) return m[0].trim();
    }
    return null;
  }

  function layerHoldInfo(l) {
    if (!l) return { held: false };
    if (l.hold === true) return { held: true, source: 'manual', reason: 'marked not enough for a post yet' };
    if (l.hold === false) return { held: false, overridden: !!holdMatch(l.notes) };
    var m = holdMatch(l.notes);
    return m ? { held: true, source: 'note', reason: '“' + m + '”' } : { held: false };
  }

  /** Is this whole place on hold? Its own flag or notes, or every clip held. */
  function holdInfo(item) {
    if (!item) return { held: false };
    if (item.hold === true) return { held: true, source: 'manual', reason: 'marked not enough for a post yet' };
    if (item.hold === false) return { held: false, overridden: !!holdMatch(item.notes) };
    var m = holdMatch(item.notes);
    if (m) return { held: true, source: 'note', reason: '“' + m + '”' };
    var live = (item.layers || []).filter(function (l) { return !l.retired; });
    if (live.length && live.every(function (l) { return layerHoldInfo(l).held; })) {
      var first = layerHoldInfo(live[0]);
      return { held: true, source: 'clips', reason: live.length === 1 ? 'its clip is ' + (first.source === 'note' ? 'noted ' + first.reason : 'on hold') : 'every clip is on hold' };
    }
    return { held: false };
  }

  /* ---------- seasons: when a piece of content can post ----------
     Halloween footage belongs in October, not in March. The tags and name of a
     place (and the label and tags of each clip) are read for the occasions
     below. A specific occasion wins over a general season on the same thing,
     so "fall" + "halloween" means Halloween. A holiday window is the ~3 weeks
     before the day and ends on it, because that's when people plan for it (a
     Halloween spot on October 2 is early; on November 2 it's late). Broad
     seasons (fall, summer) keep their whole run.                            */

  var SEASONS = [
    { id: 'halloween',    label: 'Halloween',       emoji: '🎃', specific: true,  from: [10, 10], to: [10, 31], rx: /\b(halloween|spooky|haunted|costumes?|trick[- ]or[- ]treat)\b/i },
    { id: 'thanksgiving', label: 'Thanksgiving',    emoji: '🦃', specific: true,  from: [11, 6],  to: [11, 27], rx: /\b(thanksgiving|friendsgiving)\b/i },
    { id: 'christmas',    label: 'Christmas',       emoji: '🎄', specific: true,  from: [12, 1],  to: [12, 25], rx: /\b(christmas|xmas|santa|gingerbread|hanukkah|holiday (lights|market|markets|decor|tree|party|parties|gift|gifts|cookies))\b/i },
    { id: 'nye',          label: "New Year's",      emoji: '🥂', specific: true,  from: [12, 15], to: [12, 31], rx: /\b(new year'?s( eve)?|nye)\b/i },
    { id: 'valentines',   label: "Valentine's",     emoji: '💘', specific: true,  from: [1, 24],  to: [2, 14],  rx: /\b(valentine'?s?|galentine'?s?)\b/i },
    { id: 'stpats',       label: "St. Patrick's",   emoji: '☘️', specific: true,  from: [2, 24],  to: [3, 17],  rx: /\b(st\.? patrick'?s?|saint patrick'?s?)\b/i },
    { id: 'easter',       label: 'Easter',          emoji: '🐣', specific: true,  from: [3, 10],  to: [4, 20],  rx: /\beaster\b/i },
    { id: 'mothers',      label: "Mother's Day",    emoji: '💐', specific: true,  from: [4, 20],  to: [5, 11],  rx: /\bmother'?s day\b/i },
    { id: 'fathers',      label: "Father's Day",    emoji: '👔', specific: true,  from: [6, 1],   to: [6, 21],  rx: /\bfather'?s day\b/i },
    { id: 'july4',        label: 'the Fourth',      emoji: '🎆', specific: true,  from: [6, 13],  to: [7, 4],   rx: /\b(4th of july|fourth of july|july 4(th)?|independence day)\b/i },
    { id: 'holidays',     label: 'the holidays',    emoji: '🎁', specific: false, from: [11, 1],  to: [12, 31], rx: /\bholidays?\b/i },
    { id: 'fall',         label: 'fall',            emoji: '🍂', specific: false, from: [9, 15],  to: [11, 30], rx: /\b(fall|autumn|pumpkins?|apple picking|leaf peeping|fall foliage)\b/i },
    { id: 'winter',       label: 'winter',          emoji: '❄️', specific: false, from: [12, 1],  to: [2, 28],  rx: /\b(winter|snow|snowy)\b/i },
    { id: 'spring',       label: 'spring',          emoji: '🌸', specific: false, from: [3, 1],   to: [5, 31],  rx: /\b(spring|springtime|cherry blossoms?|dogwoods?)\b/i },
    { id: 'summer',       label: 'summer',          emoji: '☀️', specific: false, from: [6, 1],   to: [8, 31],  rx: /\b(summer|summertime)\b/i }
  ];
  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** Seasons named in a list of strings. Each string is checked on its own so
      "seasonal" (a menu) never reads as a season and a hit can be cited. */
  function seasonsIn(strings) {
    var hits = [];
    SEASONS.forEach(function (se) {
      for (var i = 0; i < strings.length; i++) {
        var str = strings[i];
        if (str && se.rx.test(str)) { hits.push({ season: se, from: str }); return; }
      }
    });
    if (hits.some(function (h) { return h.season.specific; })) {
      hits = hits.filter(function (h) { return h.season.specific; });
    }
    return hits;
  }

  function describeWindows(hits) {
    return hits.map(function (h) { return h.season.emoji + ' ' + h.season.label; }).join(' + ');
  }

  /** When a place may post. windows: [{from:[m,d], to:[m,d]}], [] = any time. */
  function seasonInfo(item) {
    if (!item) return { windows: [], any: true };
    if (item.seasonMode === 'any') return { windows: [], any: true, source: 'manual' };
    if (item.seasonMode === 'months' && (item.seasonMonths || []).length) {
      var ms = item.seasonMonths.slice().sort(function (a, b) { return a - b; });
      return {
        windows: ms.map(function (m) { return { from: [m, 1], to: [m, 31] }; }),
        any: false, source: 'manual',
        label: ms.map(function (m) { return MONTH_SHORT[m - 1]; }).join(', ') + ' only'
      };
    }
    var hits = seasonsIn([item.name].concat(item.tags || []));
    if (!hits.length) return { windows: [], any: true, source: 'auto' };
    return {
      windows: hits.map(function (h) { return { from: h.season.from, to: h.season.to }; }),
      any: false, source: 'auto',
      label: describeWindows(hits) + ' only',
      because: hits.map(function (h) { return '“' + h.from + '”'; }).join(', ')
    };
  }

  function layerSeasonInfo(l) {
    var hits = seasonsIn([l.label].concat(l.tags || []));
    if (!hits.length) return { windows: [], any: true };
    return {
      windows: hits.map(function (h) { return { from: h.season.from, to: h.season.to }; }),
      any: false, label: describeWindows(hits) + ' only',
      because: hits.map(function (h) { return '“' + h.from + '”'; }).join(', ')
    };
  }

  function inWindows(windows, iso) {
    if (!windows || !windows.length) return true;
    var md = Number(iso.slice(5, 7)) * 100 + Number(iso.slice(8, 10));
    return windows.some(function (w) {
      var a = w.from[0] * 100 + w.from[1], b = w.to[0] * 100 + w.to[1];
      return a <= b ? (md >= a && md <= b) : (md >= a || md <= b);
    });
  }

  /** Clips that can go into a post on this date: live, not on hold, in season. */
  function usableLayersOn(item, iso) {
    return (item.layers || []).filter(function (l) {
      if (l.retired || layerHoldInfo(l).held) return false;
      return !iso || inWindows(layerSeasonInfo(l).windows, iso);
    });
  }

  /** Can this place be in a post that goes up on this date? */
  function usableOn(item, iso) {
    if (holdInfo(item).held) return false;
    if (iso && !inWindows(seasonInfo(item).windows, iso)) return false;
    return usableLayersOn(item, iso).length > 0;
  }

  /** Usable on at least one day between two ISO dates (inclusive). */
  function usableBetween(item, fromIso, toIso) {
    if (holdInfo(item).held) return false;
    var d = parseDate(fromIso), end = parseDate(toIso);
    for (var guard = 0; d <= end && guard < 400; guard++) {
      if (usableOn(item, isoDate(d))) return true;
      d.setDate(d.getDate() + 1);
    }
    return false;
  }

  /* ---------- cadence ---------- */

  function cadenceOn() {
    var ppw = state.settings.postsPerWeek;
    return !!ppw && PLATFORM_IDS.some(function (p) { return (ppw[p] || 0) > 0; });
  }

  /** Is the calendar making posts for this platform at all right now? */
  function platformActive(p) {
    if (!cadenceOn()) return true;
    return (state.settings.postsPerWeek[p] || 0) > 0;
  }

  /** Right home for this place AND a platform you're currently posting to. */
  function itemPostsOn(item, p) {
    if (p === 'tiktok' && item && item.photosOnly) return false;   // TikTok needs video
    return platformActive(p) && itemAllowsPlatform(item, p);
  }

  /* The weekdays a platform posts on: your chosen days first, then topped up
     (or trimmed) to the weekly number, filling in the order below. */
  var FILL_ORDER = [4, 2, 6, 3, 5, 1, 0];   // Thu, Tue, Sat, Wed, Fri, Mon, Sun
  function slotDays(p) {
    var ppw = state.settings.postsPerWeek || {};
    var n = Math.max(0, Math.min(7, ppw[p] || 0));
    var pref = (state.settings.preferredDays || []).slice();
    var days = FILL_ORDER.filter(function (d) { return pref.indexOf(d) !== -1; }).slice(0, n);
    FILL_ORDER.forEach(function (d) { if (days.length < n && days.indexOf(d) === -1) days.push(d); });
    return days.sort(function (a, b) { return a - b; });
  }

  /* ---------- collections ----------
     A collection is a saved lens on the library: every place in one
     neighborhood, every place carrying a subject tag, or every place of one
     type. Nothing is stored per collection — membership is always derived, so
     a new place joins the right collections the moment it is tagged. */

  function matchesCollection(item, coll) {
    if (!item || !coll || !coll.value) return false;
    var v = String(coll.value).toLowerCase();
    if (coll.kind === 'neighborhood') return (item.neighborhood || '').toLowerCase() === v;
    if (coll.kind === 'type') return item.type === coll.value;
    if (coll.kind === 'tag') {
      var bag = (item.tags || []).map(function (t) { return t.toLowerCase(); });
      (item.layers || []).forEach(function (l) {
        (l.tags || []).forEach(function (t) { bag.push(t.toLowerCase()); });
      });
      return bag.indexOf(v) !== -1;
    }
    return false;
  }

  function collectionLabel(coll) {
    if (!coll) return '';
    if (coll.kind === 'type') {
      for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === coll.value) return TYPES[i].plural;
    }
    return coll.value;
  }

  /* ---------- constants exposed to the UI ---------- */

  var TYPES = [
    { id: 'restaurant', label: 'Restaurant', emoji: '🍽', plural: 'Restaurants & food' },
    { id: 'experience', label: 'Experience', emoji: '🎟', plural: 'Experiences & things to do' },
    { id: 'home',       label: 'At home',    emoji: '🏠', plural: 'At-home & lifestyle' }
  ];

  var PLATFORMS = [
    { id: 'tiktok',    label: 'TikTok',    emoji: '🎵', color: '#111' },
    { id: 'instagram', label: 'Instagram', emoji: '📸', color: '#c13584' },
    { id: 'pinterest', label: 'Pinterest', emoji: '📌', color: '#bd081c' }
  ];

  /* ---------- export ---------- */

  Object.assign(CJ, {
    STORAGE_KEY: STORAGE_KEY,
    TYPES: TYPES,
    SEASONS: SEASONS,
    holdMatch: holdMatch,
    holdInfo: holdInfo,
    layerHoldInfo: layerHoldInfo,
    seasonInfo: seasonInfo,
    layerSeasonInfo: layerSeasonInfo,
    inWindows: inWindows,
    usableLayersOn: usableLayersOn,
    usableOn: usableOn,
    usableBetween: usableBetween,
    cadenceOn: cadenceOn,
    platformActive: platformActive,
    itemPostsOn: itemPostsOn,
    slotDays: slotDays,
    matchesCollection: matchesCollection,
    collectionLabel: collectionLabel,
    REUSE: REUSE,
    PLATFORMS: PLATFORMS,
    TAG_CATEGORIES: TAG_CATEGORIES,
    ATL_NEIGHBORHOODS: ATL_NEIGHBORHOODS,
    load: load,
    save: save,
    commit: commit,
    batch: batch,
    subscribe: subscribe,
    uid: uid,
    slug: slug,
    getItems: getItems,
    getItem: getItem,
    upsertItem: upsertItem,
    deleteItem: deleteItem,
    markPosted: markPosted,
    getLayer: getLayer,
    bestLayerFor: bestLayerFor,
    addLayer: addLayer,
    updateLayer: updateLayer,
    deleteLayer: deleteLayer,
    unusedLayers: unusedLayers,
    lastPostedOn: lastPostedOn,
    fitFor: fitFor,
    itemAllowsPlatform: itemAllowsPlatform,
    postCountOn: postCountOn,
    rollUp: rollUp,
    PLATFORM_IDS: PLATFORM_IDS,
    reuseState: reuseState,
    reuseInfo: reuseInfo,
    minGapFor: minGapFor,
    allTags: allTags,
    allNeighborhoods: allNeighborhoods,
    tagCategory: tagCategory,
    canonicalTag: canonicalTag,
    canonicalList: canonicalList,
    tagKey: tagKey,
    unifyTags: unifyTags,
    setTagCategory: setTagCategory,
    categoryColor: categoryColor,
    guessCategory: guessCategory,
    registerTags: registerTags,
    getEvents: getEvents,
    getTopics: getTopics,
    upsertTopic: upsertTopic,
    deleteTopic: deleteTopic,
    setTopicHidden: setTopicHidden,
    upsertEvent: upsertEvent,
    deleteEvent: deleteEvent,
    getIdeas: getIdeas,
    getIdea: getIdea,
    getDrops: getDrops,
    getDrop: getDrop,
    updateDrop: updateDrop,
    normalizeIdea: normalizeIdea,
    updateIdea: updateIdea,
    setIdeas: setIdeas,
    addIdeas: addIdeas,
    settings: settings,
    updateSettings: updateSettings,
    updateAISettings: updateAISettings,
    todayISO: todayISO,
    isoDate: isoDate,
    parseDate: parseDate,
    daysBetween: daysBetween,
    daysSince: daysSince,
    formatDate: formatDate,
    exportJSON: exportJSON,
    exportDoc: exportDoc,
    replaceState: replaceState,
    importJSON: importJSON,
    wipe: wipe,
    storageBytes: storageBytes
  });

  // Live accessor. Defined separately because Object.assign would have copied
  // the getter's value (null) instead of the getter itself.
  Object.defineProperty(CJ, 'state', { get: function () { return state; }, configurable: true });

})(window.CJ);
