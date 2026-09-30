/* =========================================================================
   import.js — turning a pasted blob of text into places.

   Three shapes of paste, detected automatically, because the whole point is
   that you don't have to remember a format:

     1. BLOCKS   Name: / Type: / Neighborhood: / Tags: / Notes:, one record
                 per block. This is what a written-up entry looks like, so a
                 batch of them can be pasted straight in, markdown stars and
                 all. A `---` line ends a record, so trailing commentary after
                 the last entry gets dropped rather than swallowed as notes.

     2. TABLE    One place per line, columns split by tab or `|`. A tab-split
                 paste is what comes out of a spreadsheet. If the first row
                 looks like headers, the columns are mapped by name; otherwise
                 the order is Name | Neighborhood | Tags | Notes.

     3. NAMES    Just a list of names, one per line, bullets and numbering
                 tolerated. Everything else gets filled in later.

   Deliberately pure — no DOM, no state writes in the parser. parse() gives
   you records, plan() says what would happen to them, and only apply()
   touches the library. That split is what makes the preview honest: the same
   function that decides "this is a duplicate" is the one that runs on import.
   ========================================================================= */

(function (CJ) {
  'use strict';

  /* ---------------------------------------------------------------- keys -- */

  // Every spelling of a field that should be understood. Long keys must be
  // tested before short ones ("last posted" before "posted"), which is why
  // lookup sorts by length rather than trusting object order.
  var KEY_ALIASES = {
    'name': 'name', 'place': 'name', 'spot': 'name', 'title': 'name', 'restaurant': 'name',
    'type': 'type', 'category': 'type', 'kind': 'type',
    'neighborhood': 'neighborhood', 'neighbourhood': 'neighborhood', 'hood': 'neighborhood',
    'area': 'neighborhood', 'where': 'neighborhood', 'location': 'neighborhood', 'part of town': 'neighborhood',
    'tags': 'tags', 'tag': 'tags', 'keywords': 'tags', 'labels': 'tags',
    'notes': 'notes', 'note': 'notes', 'description': 'notes', 'desc': 'notes',
    'about': 'notes', 'details': 'notes', 'detail': 'notes',
    'link': 'link', 'website': 'link', 'url': 'link', 'site': 'link', 'web': 'link',
    'footage': 'footage', 'clip': 'footage', 'clips': 'footage', 'video': 'footage', 'content': 'footage',
    'shot': 'capturedAt', 'shot on': 'capturedAt', 'filmed': 'capturedAt', 'captured': 'capturedAt',
    'date shot': 'capturedAt', 'filmed on': 'capturedAt',
    'last posted': 'lastPosted', 'posted': 'lastPosted', 'last used': 'lastPosted', 'used': 'lastPosted',
    'times posted': 'postCount', 'times': 'postCount', 'post count': 'postCount', 'uses': 'postCount',
    'deadline': 'deadline', 'by': 'deadline', 'post by': 'deadline', 'due': 'deadline',
    'needs to go up by': 'deadline', 'up by': 'deadline',
    'why': 'deadlineNote', 'deadline note': 'deadlineNote', 'reason': 'deadlineNote',
    'priority': 'priority',
    'platforms': 'platforms', 'platform': 'platforms', 'only on': 'platforms',
    'post on': 'platforms', 'channels': 'platforms', 'fit': 'platforms',
    'solo': 'solo', 'own post': 'solo', 'its own post': 'solo', 'enough for its own post': 'solo',
    'solo post': 'solo', 'individual post': 'solo',
    'photos only': 'photosOnly', 'photo only': 'photosOnly', 'photos': 'photosOnly', 'pictures only': 'photosOnly',
    'hold': 'hold', 'on hold': 'hold'
  };

  var KEY_LIST = Object.keys(KEY_ALIASES).sort(function (a, b) { return b.length - a.length; });

  // Fields where an unkeyed follow-on line is a continuation rather than junk.
  // Notes run to several sentences; a tag list never does.
  var CONTINUES = { notes: true, footage: true, deadlineNote: true };

  /* ------------------------------------------------------------- helpers -- */

  function clean(s) {
    // Strip the markdown a written-up entry carries: **bold**, leading #, >,
    // bullets, and the smart quotes a phone keyboard inserts.
    return String(s == null ? '' : s)
      .replace(/\*\*/g, '')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .trim();
  }

  function stripBullet(line) {
    return line.replace(/^\s*(?:[-*•·●+]|\d+[.)])\s+/, '');
  }

  function isSeparator(line) {
    return /^\s*(?:[-=_*—]\s*){3,}$/.test(line);
  }

  /** Split "a, b; c" and "#a #b" into a clean list. */
  function splitList(s) {
    return clean(s)
      .split(/[,;\n•]|\s+\/\s+/)
      .map(function (t) { return clean(t).replace(/^#/, '').replace(/\.$/, '').trim(); })
      .filter(Boolean);
  }

  var MONTHS = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
  };

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /**
   * Dates people actually type. `dir` decides which year a date with no year
   * belongs to: 'past' for "last posted", 'future' for a deadline. Anything
   * not understood returns null and the caller flags it — a date that quietly
   * vanishes is worse than one that's called out.
   */
  function parseLooseDate(raw, dir) {
    var s = clean(raw).toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1');
    if (!s) return null;

    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);

    var y, mo, d;

    m = /^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?$/.exec(s);   // 9/12 or 9/12/26
    if (m) { mo = +m[1]; d = +m[2]; y = m[3] ? +m[3] : null; }

    if (!m) {                                                          // sep 12, 2026
      m = /^([a-z]+)\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?$/.exec(s);
      if (m && MONTHS[m[1].slice(0, 4)] != null) { mo = MONTHS[m[1].slice(0, 4)]; d = +m[2]; y = m[3] ? +m[3] : null; }
      else m = null;
    }
    if (!m) {                                                          // 12 sep 2026
      m = /^(\d{1,2})\s+([a-z]+)\.?(?:,?\s*(\d{4}))?$/.exec(s);
      if (m && MONTHS[m[2].slice(0, 4)] != null) { mo = MONTHS[m[2].slice(0, 4)]; d = +m[1]; y = m[3] ? +m[3] : null; }
      else m = null;
    }
    if (!m || !mo || !d || mo > 12 || d > 31) return null;

    if (y != null && y < 100) y += 2000;

    if (y == null) {
      var now = new Date();
      y = now.getFullYear();
      var guess = new Date(y, mo - 1, d);
      if (dir === 'future' && guess < new Date(now.getFullYear(), now.getMonth(), now.getDate())) y += 1;
      if (dir === 'past' && guess > now) y -= 1;
    }
    return y + '-' + pad(mo) + '-' + pad(d);
  }

  function findUrl(s) {
    var m = /(https?:\/\/[^\s<>"')]+|www\.[^\s<>"')]+)/i.exec(String(s || ''));
    if (!m) return '';
    var u = m[1].replace(/[.,;:]+$/, '');
    return /^https?:/i.test(u) ? u : 'https://' + u;
  }

  /* ---------------------------------------------------------------- type -- */

  var TYPE_WORDS = {
    restaurant: ('restaurant food eat eats dining diner cafe coffee espresso latte bakery bake pastry deli ' +
                 'bar cocktail wine beer brewery taproom pub brunch breakfast lunch dinner supper menu chef ' +
                 'kitchen pizza taco sushi bbq barbecue burger sandwich ramen dessert ice cream donut ' +
                 'patio rooftop happy hour tasting bistro trattoria steakhouse seafood').split(' '),
    experience: ('experience thing to do activity park trail hike walk garden museum gallery exhibit mural ' +
                 'festival fair concert show theatre theater venue tour class workshop shop shopping boutique ' +
                 'market vintage thrift bookstore aquarium zoo skyline overlook beltline event outing ' +
                 'attraction stadium game').split(' '),
    home: ('home house apartment apt decor decorating diy craft recipe cooking baking cleaning organize ' +
           'organizing closet pantry bedroom bathroom living room tablescape hosting entertaining ' +
           'at home routine morning routine skincare self care get ready grwm haul').split(' ')
  };

  function guessType(rec, fallback) {
    var hay = (' ' + [rec.name, rec.neighborhood, (rec.tags || []).join(' '), rec.notes, rec.footage]
      .join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ');

    var best = null, bestScore = 0;
    Object.keys(TYPE_WORDS).forEach(function (t) {
      var score = 0;
      TYPE_WORDS[t].forEach(function (w) { if (hay.indexOf(' ' + w + ' ') !== -1) score++; });
      if (score > bestScore) { bestScore = score; best = t; }
    });
    return bestScore > 0 ? best : (fallback || 'restaurant');
  }

  function normalizeType(raw, rec, fallback) {
    var s = clean(raw).toLowerCase();
    if (!s) return { type: guessType(rec, fallback), guessed: true };
    if (/rest|food|eat|drink|cafe|coffee|bar|bakery|dining/.test(s)) return { type: 'restaurant', guessed: false };
    if (/exp|thing|activ|do|out|event|place/.test(s)) return { type: 'experience', guessed: false };
    if (/home|house|life|indoor|at-home/.test(s)) return { type: 'home', guessed: false };
    return { type: guessType(rec, fallback), guessed: true };
  }

  /* ----------------------------------------------------------- platforms -- */

  var PLAT_WORDS = {
    tiktok: /tik\s*tok|^tt$/i,
    instagram: /insta|^ig$|reels?$/i,
    pinterest: /pin(terest|s)?/i
  };

  /**
   * "Platforms: tiktok, pinterest" reads as "this is a TikTok and a pin, not
   * an Instagram post" — so naming any platform pins the unnamed ones to 'no'.
   * That is the whole reason the field exists; a list that changed nothing
   * would be decoration.
   */
  function parsePlatforms(raw) {
    var parts = splitList(raw);
    if (!parts.length) return null;
    var fit = {}, sawYes = false, sawNo = false;
    parts.forEach(function (p) {
      var neg = /^(?:not?|no|never|skip|-)\s+/i.test(p) || /^-/.test(p);
      var body = p.replace(/^(?:not?|no|never|skip)\s+/i, '').replace(/^-\s*/, '');
      Object.keys(PLAT_WORDS).forEach(function (id) {
        if (PLAT_WORDS[id].test(body)) {
          fit[id] = neg ? 'no' : 'yes';
          if (neg) sawNo = true; else sawYes = true;
        }
      });
    });
    if (!sawYes && !sawNo) return null;
    if (sawYes) {
      // Named some, so the rest are out.
      ['tiktok', 'instagram', 'pinterest'].forEach(function (id) { if (!fit[id]) fit[id] = 'no'; });
    } else {
      ['tiktok', 'instagram', 'pinterest'].forEach(function (id) { if (!fit[id]) fit[id] = 'auto'; });
    }
    return fit;
  }

  /* --------------------------------------------------------------- parse -- */

  function blankRecord(lineNo) {
    return {
      name: '', type: '', typeGuessed: false, neighborhood: '', tags: [], notes: '',
      link: '', footage: '', capturedAt: null, lastPosted: null, postCount: null,
      deadline: null, deadlineNote: '', priority: 'normal', platformFit: null,
      warnings: [], lineNo: lineNo
    };
  }

  /** Does this line start with a recognised `Key:` label? */
  function keyOf(line) {
    var stripped = clean(stripBullet(line)).replace(/^#+\s*/, '').replace(/^>\s*/, '');
    var ix = stripped.search(/[:：]/);
    if (ix < 1 || ix > 24) return null;
    var label = stripped.slice(0, ix).toLowerCase().replace(/[^a-z ]/g, '').trim();
    for (var i = 0; i < KEY_LIST.length; i++) {
      if (label === KEY_LIST[i]) {
        return { field: KEY_ALIASES[KEY_LIST[i]], value: stripped.slice(ix + 1).trim() };
      }
    }
    return null;
  }

  function finishRecord(rec, defaults) {
    if (!rec) return null;
    rec.name = clean(rec.name).replace(/[,:;]+$/, '');
    if (!rec.name) return null;

    rec.tags = splitList(rec.tagsRaw || (rec.tags || []).join(', '));
    delete rec.tagsRaw;

    var t = normalizeType(rec.typeRaw, rec, defaults.type);
    rec.type = t.type;
    rec.typeGuessed = t.guessed;
    delete rec.typeRaw;

    rec.neighborhood = clean(rec.neighborhood) || defaults.neighborhood || '';
    rec.notes = clean(rec.notes);
    rec.footage = clean(rec.footage);

    if (!rec.link) rec.link = findUrl(rec.notes) || '';

    ['capturedAt', 'lastPosted', 'deadline'].forEach(function (f) {
      var raw = rec[f + 'Raw'];
      delete rec[f + 'Raw'];
      if (!raw) return;
      var dir = f === 'deadline' ? 'future' : 'past';
      var got = parseLooseDate(raw, dir);
      if (got) rec[f] = got;
      else rec.warnings.push('Couldn\'t read the date "' + clean(raw) + '" — left blank.');
    });

    if (rec.postCountRaw != null) {
      var n = parseInt(String(rec.postCountRaw).replace(/[^0-9]/g, ''), 10);
      rec.postCount = isNaN(n) ? null : Math.max(0, n);
      delete rec.postCountRaw;
    }
    if (rec.lastPosted && !rec.postCount) rec.postCount = 1;

    if (rec.platformsRaw) {
      rec.platformFit = parsePlatforms(rec.platformsRaw);
      delete rec.platformsRaw;
    }
    if (rec.priority) {
      rec.priority = /high|urgent|asap|top/i.test(rec.priority) ? 'high' : 'normal';
    }
    // Yes/no flags. Anything that isn't clearly yes or no is left unset and
    // called out, the same as a date it couldn't read.
    ['solo', 'photosOnly', 'hold'].forEach(function (f) {
      if (rec[f] == null || typeof rec[f] === 'boolean') return;
      var v = clean(rec[f]).toLowerCase();
      if (/^(y|yes|true|x|✓|✔|1|yep|yeah)$/.test(v)) rec[f] = true;
      else if (/^(n|no|false|0|nope)$/.test(v)) rec[f] = false;
      else { rec.warnings.push('Couldn\'t tell if "' + clean(rec[f]) + '" means yes or no — left unset.'); delete rec[f]; }
    });
    return rec;
  }

  function parseBlocks(lines, defaults) {
    var out = [], cur = null, lastField = null;

    function push() { var r = finishRecord(cur, defaults); if (r) out.push(r); cur = null; lastField = null; }

    lines.forEach(function (line, i) {
      if (isSeparator(line)) { push(); return; }
      if (!clean(line)) { lastField = null; return; }   // blank line just ends a paragraph

      var k = keyOf(line);
      if (k && k.field === 'name') { push(); cur = blankRecord(i + 1); }
      if (!cur) return;                                  // preamble before the first Name:

      if (k) {
        lastField = k.field;
        switch (k.field) {
          case 'name': cur.name = k.value; break;
          case 'type': cur.typeRaw = k.value; break;
          case 'tags': cur.tagsRaw = (cur.tagsRaw ? cur.tagsRaw + ', ' : '') + k.value; break;
          case 'capturedAt': cur.capturedAtRaw = k.value; break;
          case 'lastPosted': cur.lastPostedRaw = k.value; break;
          case 'deadline': cur.deadlineRaw = k.value; break;
          case 'postCount': cur.postCountRaw = k.value; break;
          case 'platforms': cur.platformsRaw = k.value; break;
          default: cur[k.field] = (cur[k.field] ? cur[k.field] + ' ' : '') + k.value;
        }
        return;
      }

      // Unkeyed line: a continuation of the last free-text field, or noise.
      if (lastField && CONTINUES[lastField]) {
        cur[lastField] = (cur[lastField] ? cur[lastField] + '\n' : '') + clean(line);
      }
    });

    push();
    return out;
  }

  var POSITIONAL = ['name', 'neighborhood', 'tags', 'notes'];

  function looksLikeHeader(cells) {
    var hits = 0;
    cells.forEach(function (c) {
      var label = clean(c).toLowerCase().replace(/[^a-z ]/g, '').trim();
      if (KEY_ALIASES[label]) hits++;
    });
    return hits >= 2 && hits >= Math.ceil(cells.length / 2);
  }

  function parseTable(lines, defaults) {
    var sep = lines.some(function (l) { return l.indexOf('\t') !== -1; }) ? '\t' : '|';
    var rows = lines
      .filter(function (l) { return clean(l) && !isSeparator(l); })
      .map(function (l) { return stripBullet(l).split(sep).map(clean); });

    if (!rows.length) return [];

    var cols = POSITIONAL;
    if (looksLikeHeader(rows[0])) {
      cols = rows[0].map(function (c) {
        return KEY_ALIASES[clean(c).toLowerCase().replace(/[^a-z ]/g, '').trim()] || null;
      });
      rows = rows.slice(1);
    }

    var out = [];
    rows.forEach(function (cells, i) {
      var rec = blankRecord(i + 1);
      cells.forEach(function (v, ci) {
        var f = cols[ci];
        if (!f || !v) return;
        if (f === 'tags') rec.tagsRaw = v;
        else if (f === 'type') rec.typeRaw = v;
        else if (f === 'capturedAt') rec.capturedAtRaw = v;
        else if (f === 'lastPosted') rec.lastPostedRaw = v;
        else if (f === 'deadline') rec.deadlineRaw = v;
        else if (f === 'postCount') rec.postCountRaw = v;
        else if (f === 'platforms') rec.platformsRaw = v;
        else rec[f] = v;
      });
      var r = finishRecord(rec, defaults);
      if (r) out.push(r);
    });
    return out;
  }

  function parseNames(lines, defaults) {
    var out = [];
    lines.forEach(function (line, i) {
      if (isSeparator(line)) return;
      var name = clean(stripBullet(line));
      if (!name) return;
      var rec = blankRecord(i + 1);
      // "Bacchanalia — Westside" and "Bacchanalia (Westside)" are common
      // shorthand, so read a trailing dash or bracket as the neighborhood.
      var m = /^(.*?)\s+[–—-]\s+(.+)$/.exec(name) || /^(.*?)\s*\(([^)]+)\)\s*$/.exec(name);
      if (m && m[1].trim().length > 1) { rec.name = m[1].trim(); rec.neighborhood = m[2].trim(); }
      else rec.name = name;
      var r = finishRecord(rec, defaults);
      if (r) out.push(r);
    });
    return out;
  }

  /**
   * Work out which of the three shapes this is, then parse it.
   * defaults: { type, neighborhood } applied where the paste says nothing.
   */
  function parse(text, defaults) {
    defaults = defaults || {};
    var lines = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');

    var keyed = 0, sawName = false;
    lines.forEach(function (l) {
      var k = keyOf(l);
      if (k) { keyed++; if (k.field === 'name') sawName = true; }
    });

    var mode;
    if (sawName && keyed >= 2) mode = 'blocks';
    else if (lines.some(function (l) { return /\t/.test(l) || (l.indexOf('|') !== -1 && clean(l)); })) mode = 'table';
    else mode = 'names';

    var records = mode === 'blocks' ? parseBlocks(lines, defaults)
                : mode === 'table' ? parseTable(lines, defaults)
                : parseNames(lines, defaults);

    return { mode: mode, records: records };
  }

  /* ---------------------------------------------------------------- plan -- */

  /** Two entries are the same place when the name AND neighborhood match. */
  function matchKey(name, neighborhood) {
    return CJ.slug(name) + '@' + CJ.slug(neighborhood || '');
  }

  /**
   * Decide what each record would do without doing it. onDuplicate is one of
   * 'merge' (fold new tags and notes onto the existing place), 'skip', or
   * 'new' (add it as a separate place regardless).
   */
  function plan(records, opts) {
    opts = opts || {};
    var mode = opts.onDuplicate || 'merge';

    var existing = {};
    CJ.getItems().forEach(function (it) {
      existing[matchKey(it.name, it.neighborhood)] = it;
      // A place entered without a neighborhood should still be recognised when
      // it's pasted again with one, and the other way round.
      var bare = matchKey(it.name, '');
      if (!existing[bare]) existing[bare] = it;
    });

    var seen = {};
    return records.map(function (rec) {
      var row = { rec: rec, status: 'new', match: null, note: '' };
      var key = matchKey(rec.name, rec.neighborhood);
      var hit = existing[key] || existing[matchKey(rec.name, '')] || null;

      if (seen[key]) {
        row.status = 'duplicate-in-paste';
        row.note = 'Listed twice in this paste — only the first one is added.';
      } else if (hit) {
        row.match = hit;
        if (mode === 'skip') { row.status = 'skip'; row.note = 'Already in your library.'; }
        else if (mode === 'new') { row.status = 'new'; row.note = 'Already in your library — adding a second entry.'; }
        else {
          row.status = 'merge';
          var adds = [];
          var newTags = rec.tags.filter(function (t) {
            return (hit.tags || []).every(function (h) { return CJ.tagKey(h) !== CJ.tagKey(t); });
          });
          if (newTags.length) adds.push(newTags.length + ' new tag' + (newTags.length === 1 ? '' : 's'));
          if (rec.notes && clean(hit.notes) !== rec.notes) adds.push('notes as new footage');
          row.note = adds.length ? 'Already there — adding ' + adds.join(' and ') + '.'
                                 : 'Already there, nothing new to add.';
          if (!adds.length) row.status = 'skip';
        }
      }
      seen[key] = true;
      return row;
    });
  }

  /* --------------------------------------------------------------- apply -- */

  /**
   * Write the plan to the library. One batch, so it saves and re-renders once.
   * Returns the ids it created so the import can be undone in a single click
   * — bulk actions need a way back.
   */
  function apply(rows) {
    var res = { added: 0, merged: 0, skipped: 0, newIds: [] };

    CJ.batch(function () {
      rows.forEach(function (row) {
        var rec = row.rec;

        if (row.status === 'skip' || row.status === 'duplicate-in-paste') { res.skipped++; return; }

        if (row.status === 'merge' && row.match) {
          var item = row.match;
          var patch = { id: item.id };

          var tags = (item.tags || []).slice();
          rec.tags.forEach(function (t) {
            if (tags.every(function (h) { return CJ.tagKey(h) !== CJ.tagKey(t); })) tags.push(t);
          });
          patch.tags = tags;

          // Never overwrite something already written down; only fill blanks.
          if (!item.neighborhood && rec.neighborhood) patch.neighborhood = rec.neighborhood;
          if (!item.link && rec.link) patch.link = rec.link;
          if (!clean(item.notes) && rec.notes) patch.notes = rec.notes;
          // Flags only switch ON in a merge; a paste never unticks something.
          if (rec.solo === true && !item.solo) patch.solo = true;
          if (rec.photosOnly === true && !item.photosOnly) patch.photosOnly = true;
          if (rec.hold === true && item.hold !== true) patch.hold = true;

          CJ.upsertItem(patch);

          // New notes stack as another layer rather than replacing what's
          // there — the same rule as editing a place by hand.
          if (rec.notes && clean(item.notes) && clean(item.notes) !== rec.notes) {
            CJ.addLayer(item.id, {
              label: rec.footage || 'Added ' + CJ.formatDate(CJ.todayISO(), { month: 'short', day: 'numeric' }),
              notes: rec.notes, tags: rec.tags, capturedAt: rec.capturedAt,
              deadline: rec.deadline, deadlineNote: rec.deadlineNote, priority: rec.priority,
              lastPosted: rec.lastPosted, postCount: rec.postCount || 0
            });
          }
          res.merged++;
          return;
        }

        var data = {
          name: rec.name,
          type: rec.type,
          neighborhood: rec.neighborhood,
          tags: rec.tags,
          notes: rec.notes,
          link: rec.link,
          layers: [{
            label: rec.footage || 'Original footage',
            capturedAt: rec.capturedAt,
            notes: '',
            tags: [],
            deadline: rec.deadline,
            deadlineNote: rec.deadlineNote,
            priority: rec.priority,
            lastPosted: rec.lastPosted,
            postCount: rec.postCount || 0
          }]
        };
        if (rec.platformFit) data.platformFit = rec.platformFit;
        if (rec.solo != null) data.solo = rec.solo;
        if (rec.photosOnly != null) data.photosOnly = rec.photosOnly;
        if (rec.hold != null) data.hold = rec.hold;

        var made = CJ.upsertItem(data);
        if (made) { res.added++; res.newIds.push(made.id); }
      });
    });

    return res;
  }

  /** Undo a just-finished import. Only ever touches places it created. */
  function undo(ids) {
    CJ.batch(function () {
      (ids || []).forEach(function (id) { CJ.deleteItem(id); });
    });
    return (ids || []).length;
  }

  CJ.importer = {
    parse: parse,
    plan: plan,
    apply: apply,
    undo: undo,
    // exported for the tests
    parseLooseDate: parseLooseDate,
    parsePlatforms: parsePlatforms,
    guessType: guessType,
    matchKey: matchKey
  };

})(window.CJ);
