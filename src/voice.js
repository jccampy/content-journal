/* =========================================================================
   voice.js — what each post actually IS, and how it should be phrased.

   The calendar was telling you WHEN to post and WHICH places to feature. It
   wasn't telling you what the post is or how it should sound, and the three
   platforms want genuinely different things from the same footage:

     TikTok     is spoken. It lives or dies on the first two seconds, it wants
                one clear opinion, and the comments are the point.
     Instagram  is composed. The image does the hooking, the caption does the
                work, and a carousel is a swipeable list people save.
     Pinterest  is searched. Nobody is browsing a feed — they typed something
                in months before they need it. Keywords in the title do more
                than any hook, one image per pin, and the whole job is the
                click through to the video.

   Everything here is derived — nothing is stored. brief(idea, drop) is pure,
   so the guidance stays correct if you edit the line-up or move the date.
   ========================================================================= */

(function (CJ) {
  'use strict';

  /* ------------------------------------------------------- platform DNA -- */

  var PLATFORM = {
    tiktok: {
      label: 'TikTok',
      is: 'A spoken video. You on camera, or your voice over the b-roll.',
      audience: 'People scrolling with sound on who have never heard of you.',
      hookRule: 'The first 2 seconds are spoken out loud, before any visual settles. ' +
                'Say the payoff, not the setup — "three patios where you can actually hear each other" ' +
                'beats "hey guys, so today I wanted to talk about…"',
      voice: 'Second person, present tense, casual. Short sentences. One opinion you would ' +
             'actually defend. A little friction — a mild take, a caveat, something you did not ' +
             'love — is what makes people comment.',
      length: '20–35 seconds. Roughly 55–90 spoken words.',
      onScreen: 'Text on screen repeats the hook, then names each place as it appears. ' +
                'Assume half your viewers have the sound off for the first second.',
      cta: 'Ask something answerable in four words. "Which one first?" beats "let me know your thoughts".',
      caption: 'One line. The caption is not the hook here — the audio is. ' +
               'Use it to add the detail you did not have time to say.',
      avoid: 'Do not open with a greeting. Do not save the best place for last if the ' +
             'video is under 20 seconds — nobody gets there.'
    },

    instagram: {
      label: 'Instagram',
      is: 'A composed post. A reel if it moves, a carousel if it is a list.',
      audience: 'People who mostly already follow you, plus whatever Explore sends.',
      hookRule: 'The cover frame IS the hook. Pick the single most striking shot you have and ' +
                'put three to five words on it. The caption\'s first line has to survive being ' +
                'truncated at "… more".',
      voice: 'Warmer and more personal than TikTok. You are allowed a full sentence and a bit ' +
             'of a story — where you were, who you were with, why it stuck. Specifics over adjectives: ' +
             '"the corner table by the window at 4pm" beats "such a cute vibe".',
      length: 'Caption 40–120 words. Reel 15–30 seconds.',
      onScreen: 'Carousel: one place per slide, name and neighborhood on every slide, ' +
                'and make the last slide a recap so the whole list is saveable in one screenshot.',
      cta: 'Saves and shares are what Instagram rewards. "Save this for your next…" ' +
           'is not a cliché here, it is the mechanic.',
      caption: 'Line one hooks. Then the places in order, one short line each with the ' +
               'neighborhood. Then one line of context. Then the ask.',
      avoid: 'Do not put the list only in the video — people screenshot captions. ' +
             'Do not bury the neighborhood; it is the most-asked comment.'
    },

    pinterest: {
      label: 'Pinterest',
      is: 'Individual pins — one image each — linking back to the video.',
      audience: 'Someone searching months ahead. They will never see your face and do not care.',
      hookRule: 'There is no hook, there is a search query. The title should read like the thing ' +
                'someone types into the box: "Atlanta patio restaurants", "where to eat in Buckhead". ' +
                'Front-load the words, skip the personality.',
      voice: 'Plain, descriptive, keyword-first. This is the one place where being a bit boring ' +
             'is correct. Say the city, the neighborhood, and what the place is.',
      length: 'Title under 40 characters so it does not truncate. Description 1–2 sentences.',
      onScreen: 'Vertical stills, 2:3. Text overlay naming the place and the city. ' +
                'One pin per place — that is the whole point, each one is a separate door in.',
      cta: 'None. The link is the call to action. Point every pin at the video it came from.',
      caption: 'Description: what it is, where it is, why someone would go. ' +
               'Include "Atlanta" and the neighborhood in words, not just tags.',
      avoid: 'Do not reuse the TikTok caption — in-jokes and slang kill search. ' +
             'Do not make one pin with all six places; make six pins.'
    }
  };

  /* ------------------------------------------------------------ formats -- */

  var FORMAT_NOTE = {
    carousel: 'A swipeable list. Cover slide, one place per slide, recap slide at the end.',
    reel:     'Short vertical video, cut to a beat, text on screen throughout.',
    video:    'Talking or voiceover video. Sound matters more than the edit.',
    pins:     'One still per place, each linking back to the video.',
    single:   'One place, one post. Go deeper than a roundup would.'
  };

  /* -------------------------------------------------- the connective thread -- */

  function uniq(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (x) {
      if (!x) return;
      var k = String(x).toLowerCase();
      if (!seen[k]) { seen[k] = 1; out.push(x); }
    });
    return out;
  }

  /**
   * WHY these places belong in one post. This is the sentence that decides
   * whether a roundup reads as a real recommendation or as a list of things
   * that happen to be in your library, so it's built from what the places
   * actually share — the tags they have in common, their neighborhood, the
   * occasion — rather than asserted.
   */
  function thread(idea, items) {
    if (!items.length) return '';

    var hoods = uniq(items.map(function (i) { return i.neighborhood; }));
    var oneHood = hoods.length === 1 && items.every(function (i) { return i.neighborhood; });

    // Tags shared by most of the line-up are the honest through-line.
    var counts = {};
    items.forEach(function (it) {
      uniq(it.tags || []).forEach(function (t) {
        var k = CJ.tagKey(t);
        counts[k] = counts[k] || { tag: t, n: 0 };
        counts[k].n++;
      });
    });
    var shared = Object.keys(counts).map(function (k) { return counts[k]; })
      .filter(function (c) { return c.n >= Math.max(2, Math.ceil(items.length * 0.6)); })
      .sort(function (a, b) { return b.n - a.n; })
      .map(function (c) { return c.tag; })
      .filter(function (t) { return hoods.indexOf(t) === -1; })
      .slice(0, 3);

    var occ = idea.occasion;
    var bits = [];

    if (occ && occ.mode === 'escape') {
      bits.push('The thread is avoidance: ' + occ.name + ' owns ' +
        (occ.area || []).join(' and ') + ' that weekend, and every place here is somewhere else.');
      if (hoods.length) bits.push('They are all in ' + hoods.slice(0, 3).join(', ') + '.');
    } else if (occ) {
      bits.push('The thread is timing: they all work for ' + occ.name + '.');
      if (oneHood) bits.push('All of them are in ' + hoods[0] + ', so it doubles as a neighborhood guide.');
    } else if (oneHood) {
      bits.push('The thread is geography: every one is in ' + hoods[0] + ', so this works as a walkable route.');
    }

    if (shared.length) {
      bits.push((bits.length ? 'They also share ' : 'The thread is what they share — ') +
        shared.join(', ') + '.');
    }

    if (!bits.length) {
      bits.push('These are grouped by fit rather than by area — say what connects them ' +
        'in your own words in the first line, or the post reads as a random list.');
    }
    return bits.join(' ');
  }

  /** What each place is doing in this specific post. */
  function roles(idea, items, drop) {
    return items.map(function (it, i) {
      var layerId = drop && drop.layerByItem ? drop.layerByItem[it.id] : null;
      var layer = layerId ? CJ.getLayer(it, layerId) : null;
      var why = [];
      if (it.neighborhood) why.push(it.neighborhood);
      if (layer && layer.notes) why.push(layer.notes.split(/[.!?]/)[0]);
      else if (it.notes) why.push(it.notes.split(/[.!?]/)[0]);

      var slot = drop && drop.platform === 'pinterest'
        ? 'Pin ' + (i + 1)
        : i === 0 ? 'Opens the post'
        : i === items.length - 1 ? 'Closes it'
        : 'Slide ' + (i + 1);

      return {
        name: it.name,
        clip: layer ? layer.label : null,
        slot: slot,
        why: why.join(' — ').slice(0, 140)
      };
    });
  }

  /* -------------------------------------------------------- the structure -- */

  function structureFor(drop, items, idea) {
    var n = items.length;
    var p = drop.platform;
    var occ = idea.occasion;

    if (p === 'pinterest') {
      return [
        'Make ' + n + ' separate pin' + (n === 1 ? '' : 's') + ' — one per place, not one combined graphic.',
        'Each: your best vertical still, place name + "Atlanta" as overlay text.',
        'Title each one the way someone would search for it, not the way you would caption it.',
        'Link every pin to the ' + (drop.linksTo ? PLATFORM[drop.linksTo].label : 'video') + ' version of this post.'
      ];
    }

    if (drop.format === 'carousel') {
      var out = ['Slide 1 — cover: the strongest single image, 3–5 words of text on it.'];
      items.forEach(function (it, i) {
        out.push('Slide ' + (i + 2) + ' — ' + it.name + (it.neighborhood ? ' (' + it.neighborhood + ')' : '') +
                 ': one line on what it is good for.');
      });
      out.push('Last slide — recap all ' + n + ' names in a list so it screenshots cleanly.');
      return out;
    }

    var beats = [];
    beats.push('0:00–0:02 — the hook, said out loud. No greeting, no preamble.');
    if (occ) beats.push('0:02 — name the date. People need to know why this is now.');
    beats.push('Then ' + n + ' beat' + (n === 1 ? '' : 's') +
               ', roughly ' + Math.max(3, Math.round(24 / Math.max(n, 1))) + 's each: ' +
               items.map(function (i) { return i.name; }).join(' → ') + '.');
    beats.push('Each beat: the shot, the name on screen, one reason. Cut the moment the reason lands.');
    beats.push('End on the question. Do not sign off.');
    return beats;
  }

  /* ------------------------------------------------------------- titles -- */

  function pinterestTitle(idea, items) {
    var hoods = uniq(items.map(function (i) { return i.neighborhood; }).filter(Boolean));
    var where = hoods.length === 1 ? hoods[0] : 'Atlanta';
    var kind = items.every(function (i) { return i.type === 'restaurant'; }) ? 'restaurants'
             : items.every(function (i) { return i.type === 'home'; }) ? 'at home'
             : 'things to do';
    if (idea.occasion && idea.occasion.mode !== 'escape') {
      return (idea.occasion.name + ' ' + where + ' guide').slice(0, 40);
    }
    return (where + ' ' + kind).slice(0, 40);
  }

  /**
   * The full brief for one platform's version of one concept.
   * Pure: give it the same idea and drop, get the same brief.
   */
  function brief(idea, drop) {
    var p = PLATFORM[drop.platform] || PLATFORM.instagram;
    var items = (drop.itemIds || []).map(function (id) { return CJ.getItem(id); }).filter(Boolean);

    var hook = (idea.hooks && idea.hooks.length)
      ? idea.hooks[drop.platform === 'tiktok' ? 0 : drop.platform === 'instagram' ? Math.min(1, idea.hooks.length - 1) : 0]
      : idea.title;

    var title = drop.platform === 'pinterest' ? pinterestTitle(idea, items) : hook;

    // What makes THIS platform's version different from its siblings, said in
    // terms of this specific post rather than in the abstract.
    var siblings = (idea.drops || []).filter(function (d) { return d.platform !== drop.platform; });
    var diff = '';
    if (siblings.length) {
      var others = siblings.map(function (d) { return PLATFORM[d.platform].label; }).join(' and ');
      if (drop.platform === 'pinterest') {
        diff = 'Same footage as the ' + others + ' post, but this is not a repost. ' +
               'Those are a feed moment; these ' + items.length + ' pins are ' + items.length +
               ' separate search results that keep working for months. Strip the personality, add the keywords.';
      } else if (drop.platform === 'tiktok') {
        diff = 'Louder and more opinionated than the ' + others + ' version. ' +
               'Say the thing you would only say out loud. The ' + others + ' cut can be prettier; this one should be more honest.';
      } else {
        diff = 'More considered than the ' + others + ' version. ' +
               'Where TikTok gets your voice, this gets your eye — the best-looking frame you have — ' +
               'and a caption people can screenshot.';
      }
    }

    return {
      platform: drop.platform,
      platformLabel: p.label,
      is: p.is + ' ' + (FORMAT_NOTE[drop.format] || ''),
      audience: p.audience,
      title: title,
      titleLabel: drop.platform === 'pinterest' ? 'Pin title (searchable)' : 'Hook',
      hookRule: p.hookRule,
      voice: p.voice,
      length: p.length,
      onScreen: p.onScreen,
      caption: p.caption,
      cta: p.cta,
      avoid: p.avoid,
      thread: thread(idea, items),
      structure: structureFor(drop, items, idea),
      roles: roles(idea, items, drop),
      difference: diff
    };
  }

  /** Plain-text version, for the copy-everything button. */
  function briefText(idea, drop) {
    var b = brief(idea, drop);
    var lines = [];
    lines.push(b.platformLabel.toUpperCase() + ' — ' + CJ.formatDate(drop.date, { weekday: 'long', month: 'short', day: 'numeric' }));
    lines.push(idea.title);
    lines.push('');
    lines.push('WHAT IT IS: ' + b.is);
    if (b.thread) lines.push('WHY THESE TOGETHER: ' + b.thread);
    lines.push('');
    lines.push(b.titleLabel.toUpperCase() + ': ' + b.title);
    lines.push('PHRASING: ' + b.voice);
    lines.push('LENGTH: ' + b.length);
    lines.push('');
    lines.push('STRUCTURE:');
    b.structure.forEach(function (s) { lines.push('  - ' + s); });
    lines.push('');
    if (b.roles.length) {
      lines.push('PLACES:');
      b.roles.forEach(function (r) {
        lines.push('  - ' + r.name + (r.clip ? ' [' + r.clip + ']' : '') + ' — ' + r.slot + (r.why ? ': ' + r.why : ''));
      });
      lines.push('');
    }
    lines.push('CAPTION: ' + b.caption);
    lines.push('CTA: ' + b.cta);
    lines.push('AVOID: ' + b.avoid);
    if (b.difference) { lines.push(''); lines.push('VS THE OTHER PLATFORMS: ' + b.difference); }
    return lines.join('\n');
  }

  CJ.voice = {
    PLATFORM: PLATFORM,
    FORMAT_NOTE: FORMAT_NOTE,
    brief: brief,
    briefText: briefText,
    thread: thread
  };

})(window.CJ);
