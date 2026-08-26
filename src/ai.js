/* =========================================================================
   ai.js — optional Claude enrichment.

   The calendar is fully functional without any of this. When a key is present,
   the ✨ button asks Claude for fresh themes, hooks and captions built from the
   real contents of your library, and merges them in as extra ideas.

   The key lives only in this browser's localStorage. It is never written to the
   repo and never sent anywhere but api.anthropic.com.
   ========================================================================= */

(function (CJ) {
  'use strict';

  var ENDPOINT = 'https://api.anthropic.com/v1/messages';

  function hasKey() {
    var ai = CJ.settings().ai || {};
    return !!(ai.key && ai.key.trim());
  }

  function callClaude(messages, system, maxTokens) {
    var ai = CJ.settings().ai || {};
    if (!ai.key) return Promise.reject(new Error('No API key saved. Add one in Settings.'));

    return fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ai.key.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: ai.model || 'claude-sonnet-5',
        max_tokens: maxTokens || 4000,
        system: system,
        messages: messages
      })
    }).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try { data = JSON.parse(text); } catch (e) { data = null; }
        if (!res.ok) {
          var msg = (data && data.error && data.error.message) || text || ('HTTP ' + res.status);
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  function textOf(response) {
    if (!response || !response.content) return '';
    return response.content
      .filter(function (b) { return b.type === 'text'; })
      .map(function (b) { return b.text; })
      .join('\n');
  }

  function extractJSON(text) {
    // Models sometimes wrap JSON in prose or a code fence. Grab the outermost array.
    var fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) text = fenced[1];
    var start = text.indexOf('[');
    var end = text.lastIndexOf(']');
    if (start === -1 || end === -1 || end < start) throw new Error('Claude did not return a usable list of ideas.');
    return JSON.parse(text.slice(start, end + 1));
  }

  /* ---------- library summary sent to the model ---------- */

  function libraryDigest() {
    var items = CJ.getItems();
    var lines = items.map(function (it) {
      var bits = [];
      bits.push('id=' + it.id);
      bits.push('"' + it.name + '"');
      bits.push('type=' + it.type);
      if (it.neighborhood) bits.push('area=' + it.neighborhood);
      if (it.tags && it.tags.length) bits.push('tags=[' + it.tags.join(', ') + ']');
      bits.push('timesPosted=' + (it.postCount || 0));
      bits.push('lastPosted=' + (it.lastPosted || 'never'));
      if (it.deadline) bits.push('MUST POST BY ' + it.deadline + (it.deadlineNote ? ' (' + it.deadlineNote + ')' : ''));
      if (it.notes) bits.push('notes="' + String(it.notes).slice(0, 140) + '"');
      return '- ' + bits.join(' | ');
    });
    return lines.join('\n');
  }

  function monthContext(months) {
    var today = new Date();
    var out = [];
    for (var i = 0; i < months; i++) {
      var d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      var info = CJ.atlanta.monthInfo(d.getMonth() + 1);
      var occs = CJ.atlanta.occurrencesBetween(
        new Date(d.getFullYear(), d.getMonth(), 1),
        new Date(d.getFullYear(), d.getMonth() + 1, 0),
        CJ.settings().disabledBuiltinEvents || []
      );
      out.push(
        info.name + ' ' + d.getFullYear() +
        ' — avg ' + info.hi + '°/' + info.lo + '°F. ' + info.mood +
        '\n  Dates: ' + (occs.length ? occs.map(function (o) {
          return o.name + ' (' + CJ.formatDate(CJ.isoDate(o.date), { month: 'short', day: 'numeric' }) + ')';
        }).join('; ') : 'nothing major') +
        '\n  Usual angles: ' + info.angles.join('; ')
      );
    }
    return out.join('\n\n');
  }

  var SYSTEM = [
    'You are a content strategist for an Atlanta-based lifestyle creator.',
    'She posts on three platforms with distinct lanes:',
    '  • TikTok — Atlanta city content and lifestyle',
    '  • Instagram — food/restaurants and home/lifestyle',
    '  • Pinterest — everything',
    'You will be given her content library and the Atlanta calendar for the coming months.',
    'Every item in the library is footage she has ALREADY SHOT. Your job is to find new ways',
    'to reuse it — fresh angles, fresh groupings, fresh timing for content that already exists.',
    '',
    'Propose post ideas that use the places ALREADY IN HER LIBRARY. Never invent a restaurant,',
    'venue, or place that is not in the library — reference items only by their id.',
    'Weight ideas toward items she has never posted (timesPosted=0) or has not posted in a long',
    'time. Items with a high timesPosted have been used a lot already — only bring them back if',
    'the angle is genuinely different from an obvious repeat.',
    'Respect any item marked MUST POST BY — schedule those before their deadline.',
    '',
    'Return ONLY a JSON array. No prose before or after. Each element:',
    '{',
    '  "date": "YYYY-MM-DD",              // when to post',
    '  "title": "short post theme",        // e.g. "Favorite Atlanta patios"',
    '  "blurb": "one sentence on why this works right now",',
    '  "itemIds": ["id1","id2"],           // ids from the library ONLY',
    '  "platforms": ["tiktok","instagram","pinterest"],',
    '  "format": "roundup|guide|single|split|vlog",',
    '  "hooks": ["3 scroll-stopping opening lines"],',
    '  "captions": ["2-3 caption starters"]',
    '}'
  ].join('\n');

  /**
   * Ask Claude for a batch of fresh ideas across the horizon.
   * Returns idea objects in the app's own shape, tagged source:'ai'.
   */
  function generateIdeas(opts) {
    opts = opts || {};
    var months = opts.months || CJ.settings().horizonMonths || 6;
    var count = opts.count || Math.min(24, months * 4);
    var voice = (CJ.settings().ai || {}).voice || '';

    var items = CJ.getItems();
    if (!items.length) return Promise.reject(new Error('Add some content to your library first — Claude builds ideas out of what you already have.'));

    var existingTitles = CJ.getIdeas()
      .filter(function (i) { return i.status !== 'dismissed'; })
      .slice(0, 60)
      .map(function (i) { return '- ' + i.date + ': ' + i.title; })
      .join('\n');

    var prompt = [
      'HER CONTENT LIBRARY (' + items.length + ' items):',
      libraryDigest(),
      '',
      'ATLANTA CALENDAR AHEAD:',
      monthContext(months),
      '',
      'ALREADY ON HER CALENDAR (do not duplicate these — go somewhere new):',
      existingTitles || '(nothing yet)',
      '',
      voice ? 'HER VOICE / STYLE NOTES: ' + voice : '',
      '',
      'Today is ' + CJ.todayISO() + '.',
      'Give me ' + count + ' fresh ideas spread across the next ' + months + ' months.',
      'Prioritise: (1) anything with a MUST POST BY date, (2) places never posted,',
      '(3) real dates on the Atlanta calendar, (4) weather-driven angles.',
      'Mix formats. Make the hooks specific to the actual places, not generic.'
    ].filter(Boolean).join('\n');

    return callClaude([{ role: 'user', content: prompt }], SYSTEM, 8000).then(function (res) {
      var raw = extractJSON(textOf(res));
      var validIds = {};
      items.forEach(function (i) { validIds[i.id] = true; });

      var stamp = Date.now().toString(36);
      var out = [];
      raw.forEach(function (r, idx) {
        var ids = (Array.isArray(r.itemIds) ? r.itemIds : []).filter(function (id) { return validIds[id]; });
        if (!r.title) return;
        var date = /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : CJ.todayISO();
        out.push({
          id: 'ai:' + stamp + ':' + idx,
          date: date,
          source: 'ai',
          themeId: null,
          title: String(r.title).slice(0, 160),
          blurb: String(r.blurb || '').slice(0, 400),
          format: r.format || 'roundup',
          itemIds: ids,
          platforms: Array.isArray(r.platforms) && r.platforms.length
            ? r.platforms.filter(function (p) { return ['tiktok', 'instagram', 'pinterest'].indexOf(p) !== -1; })
            : CJ.generator.platformsFor(ids.map(CJ.getItem).filter(Boolean), { format: r.format }, CJ.settings()),
          hooks: (Array.isArray(r.hooks) ? r.hooks : []).slice(0, 4).map(String),
          captions: (Array.isArray(r.captions) ? r.captions : []).slice(0, 4).map(String),
          occasion: null,
          deadlineFor: null,
          status: 'suggested',
          pinned: false,
          touched: false,
          priority: 0,
          notes: ''
        });
      });
      return out;
    });
  }

  /** Rewrite the hooks and captions for one existing idea. */
  function punchUp(idea) {
    var items = (idea.itemIds || []).map(CJ.getItem).filter(Boolean);
    var voice = (CJ.settings().ai || {}).voice || '';
    var prompt = [
      'Post theme: ' + idea.title,
      'Posting on: ' + CJ.formatDate(idea.date),
      'Platforms: ' + (idea.platforms || []).join(', '),
      'Places featured: ' + (items.length ? items.map(function (i) {
        return i.name + ' (' + i.type + (i.neighborhood ? ', ' + i.neighborhood : '') +
               (i.tags && i.tags.length ? '; ' + i.tags.join(', ') : '') + ')';
      }).join(' | ') : 'none yet'),
      voice ? 'Voice notes: ' + voice : '',
      '',
      'Write 4 hooks and 3 caption starters for this post. Specific to these places.',
      'Return ONLY a JSON array with a single object: [{"hooks":[...],"captions":[...]}]'
    ].filter(Boolean).join('\n');

    return callClaude(
      [{ role: 'user', content: prompt }],
      'You write scroll-stopping social copy for an Atlanta lifestyle creator. Be specific and human. No hashtag spam, no "hidden gem".',
      1500
    ).then(function (res) {
      var arr = extractJSON(textOf(res));
      var o = arr[0] || {};
      return {
        hooks: (o.hooks || []).map(String).slice(0, 4),
        captions: (o.captions || []).map(String).slice(0, 4)
      };
    });
  }

  function test() {
    return callClaude(
      [{ role: 'user', content: 'Reply with exactly: ok' }],
      'Reply with exactly the word requested.',
      20
    ).then(function (r) { return textOf(r).trim(); });
  }

  CJ.ai = { hasKey: hasKey, generateIdeas: generateIdeas, punchUp: punchUp, test: test };

})(window.CJ);
