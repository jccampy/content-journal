/* =========================================================================
   monthly.js — topics worth posting about, month by month.

   Different job from themes.js. A theme is a recipe the generator executes
   against your library right now. A TOPIC is a thing worth making, whether or
   not you already have the footage — it's the planning layer that sits above
   the calendar and tells you what a month is *for*.

   An honest note about "viral", since that word does a lot of lying in this
   corner of the internet: nothing here is a live trend feed. This app has no
   idea what audio is climbing today, and anything claiming otherwise from a
   static file would be making it up. What IS predictable is the shape of the
   year — the searches, the anxieties and the annual moments that come back
   every single time, and the post formats that reliably travel because of how
   the platforms work rather than because of a sound. That's what's here:
   recurring demand, not today's trend. `evergreen: true` marks the formats
   that work in any month, so a thin month still has something.

   For genuinely current trends, the ✨ AI ideas button on the calendar asks
   Claude, which at least knows what month it is.
   ========================================================================= */

(function (CJ) {
  'use strict';

  /* Each topic:
       id         stable, so "done"/"hidden" marks survive
       months     [1..12], or 'any' for evergreen formats
       title      what you'd call the post
       why        why this lands NOW — the demand behind it
       lane       'city' | 'food' | 'home'  (maps to her three lanes)
       platforms  where it belongs, best-first
       needs      tags/words that make it findable in her library
       types      which content types it draws on
       recurring  true = this moment comes back every year and is searched hard
       evergreen  true = works any month
  */
  var TOPICS = [

    /* ---------------------------------------------------------- January -- */
    { id: 'jan-reset', months: [1], lane: 'home', recurring: true,
      title: 'The realistic January reset',
      why: 'Peak "get my life together" searching. The version that performs is the honest one — ' +
           'the tidy-but-lived-in reset, not the aspirational one nobody achieves.',
      platforms: ['instagram', 'pinterest', 'tiktok'], types: ['home'],
      needs: ['organize', 'cleaning', 'routine', 'decor'] },

    { id: 'jan-cheap-dates', months: [1], lane: 'food', recurring: true,
      title: 'Date nights that don\'t cost anything (January is broke)',
      why: 'Everyone overspent in December and still wants to go out. Cheap-but-nice is the ' +
           'highest-saving food format of the month.',
      platforms: ['tiktok', 'instagram', 'pinterest'], types: ['restaurant', 'experience'],
      needs: ['casual', 'happy hour', 'free', 'budget', 'date night'] },

    { id: 'jan-cozy', months: [1, 2], lane: 'food',
      title: 'Where to sit inside when it\'s grim out',
      why: 'Atlanta in January is grey and damp. Fireplaces, booths and warm rooms are what ' +
           'people are actually searching for.',
      platforms: ['instagram', 'pinterest'], types: ['restaurant'],
      needs: ['cozy', 'fireplace', 'indoor', 'quiet'] },

    /* --------------------------------------------------------- February -- */
    { id: 'feb-valentines', months: [2], lane: 'food', recurring: true,
      title: 'Valentine\'s without the prix fixe',
      why: 'Searched hard for three weeks straight. The contrarian angle — good food, no ' +
           '$95 set menu — outperforms the straight romantic roundup.',
      platforms: ['instagram', 'pinterest', 'tiktok'], types: ['restaurant'],
      needs: ['date night', 'romantic', 'cocktails', 'reservations'] },

    { id: 'feb-galentines', months: [2], lane: 'food', recurring: true,
      title: 'Galentine\'s: group tables that actually fit everyone',
      why: 'A real logistical problem people post about every year — most "romantic" lists ' +
           'are useless for six people.',
      platforms: ['tiktok', 'instagram'], types: ['restaurant', 'experience'],
      needs: ['group', 'group friendly', 'girls night', 'cocktails'] },

    /* ------------------------------------------------------------ March -- */
    { id: 'mar-first-warm-day', months: [3], lane: 'city', recurring: true,
      title: 'The first warm day list — where to go the second it hits 70',
      why: 'Atlanta gets one freak warm week in March and the whole city loses it. ' +
           'Have this filmed and ready BEFORE the day arrives; it is worthless the week after.',
      platforms: ['tiktok', 'instagram', 'pinterest'], types: ['restaurant', 'experience'],
      needs: ['patio', 'outdoor', 'rooftop', 'walk'] },

    { id: 'mar-pollen', months: [3, 4], lane: 'city', recurring: true,
      title: 'Pollen season survival — indoor things that don\'t feel indoor',
      why: 'Genuinely the most Atlanta-specific content moment of the year. Everyone is ' +
           'miserable and posting about it, which makes it a conversation you can join.',
      platforms: ['tiktok', 'instagram'], types: ['experience', 'restaurant'],
      needs: ['indoor', 'museum', 'rainy day'] },

    /* ------------------------------------------------------------ April -- */
    { id: 'apr-patio-ranking', months: [4, 5], lane: 'food', recurring: true,
      title: 'Patios, actually ranked',
      why: 'Ranking beats listing. A number next to each place gives people something to ' +
           'disagree with, and disagreement is the whole comment section.',
      platforms: ['tiktok', 'instagram', 'pinterest'], types: ['restaurant'],
      needs: ['patio', 'good patio', 'outdoor', 'rooftop'] },

    { id: 'apr-beltline', months: [4, 5, 9, 10], lane: 'city',
      title: 'A perfect Beltline afternoon, in order',
      why: 'Route content outperforms list content — people want the sequence, not the options. ' +
           'Also the single most-searched Atlanta thing by visitors.',
      platforms: ['tiktok', 'pinterest', 'instagram'], types: ['experience', 'restaurant'],
      needs: ['beltline', 'walk', 'outdoor'] },

    /* -------------------------------------------------------------- May -- */
    { id: 'may-graduation', months: [5], lane: 'food', recurring: true,
      title: 'Graduation dinner spots that take a group of 10',
      why: 'Emory, Tech and GSU all graduate in May and every family needs a table. ' +
           'Very high-intent, very low-competition search.',
      platforms: ['instagram', 'pinterest'], types: ['restaurant'],
      needs: ['group', 'group friendly', 'reservations', 'upscale'] },

    { id: 'may-visitors', months: [5, 6], lane: 'city', evergreen: true,
      title: 'What to do when someone visits you in Atlanta',
      why: 'The question every Atlantan is asked constantly. Saved and re-shared for years — ' +
           'this is a library post, not a moment post.',
      platforms: ['pinterest', 'tiktok', 'instagram'], types: ['experience', 'restaurant'],
      needs: ['skyline', 'walk', 'photo spot', 'group'] },

    /* ------------------------------------------------------------- June -- */
    { id: 'jun-heat', months: [6, 7, 8], lane: 'city', recurring: true,
      title: 'Too hot to be outside: the AC list',
      why: 'Atlanta summer is genuinely hostile. "Where can I go that is not outside" is a ' +
           'real recurring need, and nobody makes this list well.',
      platforms: ['tiktok', 'instagram'], types: ['experience', 'restaurant'],
      needs: ['indoor', 'museum', 'food hall', 'cocktails'] },

    { id: 'jun-golden-hour', months: [6, 7], lane: 'city',
      title: 'Golden hour spots, with the actual time to arrive',
      why: 'Specificity is the whole post. "Get there at 7:40" is saveable; "great views" is not.',
      platforms: ['instagram', 'pinterest', 'tiktok'], types: ['experience', 'restaurant'],
      needs: ['rooftop', 'view', 'skyline', 'photo spot', 'patio'] },

    /* ------------------------------------------------------------- July -- */
    { id: 'jul-peach', months: [7, 8], lane: 'food', recurring: true,
      title: 'Peak peach season — where it shows up on menus',
      why: 'Georgia peaches peak now and it is the one food story the whole state agrees on. ' +
           'Works for a restaurant roundup and an at-home recipe in the same week.',
      platforms: ['instagram', 'pinterest', 'tiktok'], types: ['restaurant', 'home'],
      needs: ['peach', 'seasonal', 'dessert', 'cocktails'] },

    { id: 'jul-water', months: [7, 8], lane: 'city',
      title: 'Water within an hour of Atlanta',
      why: 'The city is landlocked and everyone is desperate by August. High save rate ' +
           'because people plan these a week ahead.',
      platforms: ['tiktok', 'pinterest'], types: ['experience'],
      needs: ['day trip', 'outdoor', 'drive', 'free'] },

    /* ----------------------------------------------------------- August -- */
    { id: 'aug-back-to-school', months: [8], lane: 'home', recurring: true,
      title: 'Back-to-school reset (even if you don\'t have kids)',
      why: 'September energy arrives in August. Routine, organisation and "getting serious ' +
           'again" content spikes weeks before the month turns.',
      platforms: ['instagram', 'pinterest'], types: ['home'],
      needs: ['routine', 'organize', 'morning', 'decor'] },

    { id: 'aug-newcomers', months: [8, 9], lane: 'city', recurring: true,
      title: 'Just moved to Atlanta? Start here',
      why: 'The biggest move-in wave of the year. Brand new residents following local ' +
           'accounts for the first time — this is a follower-growth post, not a views post.',
      platforms: ['tiktok', 'pinterest', 'instagram'], types: ['restaurant', 'experience'],
      needs: ['beltline', 'food hall', 'walk', 'casual'] },

    /* -------------------------------------------------------- September -- */
    { id: 'sep-football', months: [9, 10, 11], lane: 'food', recurring: true,
      title: 'Where to watch the game that isn\'t a sports bar',
      why: 'Falcons and college football run the city\'s weekends from September. The ' +
           '"but nice" angle separates you from every generic sports-bar list.',
      platforms: ['tiktok', 'instagram'], types: ['restaurant'],
      needs: ['group', 'casual', 'patio', 'rooftop', 'cocktails'] },

    { id: 'sep-shoulder', months: [9], lane: 'city', recurring: true,
      title: 'The two good weeks — patio season part two',
      why: 'Late September is the best weather Atlanta gets and it is over fast. ' +
           'Urgency is real, which is what makes people act on it.',
      platforms: ['instagram', 'tiktok', 'pinterest'], types: ['restaurant', 'experience'],
      needs: ['patio', 'outdoor', 'rooftop', 'walk'] },

    { id: 'sep-crowds', months: [9], lane: 'city',
      title: 'Where to go while downtown is a zoo',
      why: 'Dragon Con and football weekends make half the city unusable. The avoidance ' +
           'guide serves everyone who is NOT going, which is most people.',
      platforms: ['tiktok', 'instagram'], types: ['restaurant', 'experience'],
      needs: ['buckhead', 'westside', 'decatur', 'casual'] },

    /* ---------------------------------------------------------- October -- */
    { id: 'oct-fall-drive', months: [10, 11], lane: 'city', recurring: true,
      title: 'Fall colour within two hours',
      why: 'North Georgia leaf season is a hard annual search spike, and Pinterest traffic ' +
           'on it starts in September and runs for eight weeks.',
      platforms: ['pinterest', 'tiktok', 'instagram'], types: ['experience'],
      needs: ['day trip', 'drive', 'fall', 'north georgia', 'orchard'] },

    { id: 'oct-cozy-switch', months: [10], lane: 'home', recurring: true,
      title: 'The switch to cozy — what actually changes at home',
      why: 'Seasonal home content peaks now. Small, specific and cheap beats a full ' +
           'redecorate, and it is far more repeatable.',
      platforms: ['instagram', 'pinterest'], types: ['home'],
      needs: ['decor', 'cozy', 'fall', 'seasonal'] },

    /* --------------------------------------------------------- November -- */
    { id: 'nov-friendsgiving', months: [11], lane: 'home', recurring: true,
      title: 'Friendsgiving without hosting a whole Thanksgiving',
      why: 'Runs the first three weeks of November. Table setting, one dish, and where to ' +
           'buy the rest — the shortcut version is the one that gets saved.',
      platforms: ['instagram', 'pinterest', 'tiktok'], types: ['home', 'restaurant'],
      needs: ['hosting', 'tablescape', 'entertaining', 'recipe'] },

    { id: 'nov-out-of-towners', months: [11, 12], lane: 'food', recurring: true,
      title: 'Taking family somewhere over the holidays',
      why: 'Everyone is hosting visiting relatives and needs somewhere that suits four ' +
           'generations. Specific and under-served.',
      platforms: ['instagram', 'pinterest'], types: ['restaurant'],
      needs: ['group', 'group friendly', 'classic', 'reservations'] },

    /* --------------------------------------------------------- December -- */
    { id: 'dec-lights', months: [12], lane: 'city', recurring: true,
      title: 'Christmas lights, ranked by effort-to-payoff',
      why: 'Enormous annual search volume. Ranking by whether it is worth the parking ' +
           'is more useful — and more shareable — than listing them.',
      platforms: ['tiktok', 'pinterest', 'instagram'], types: ['experience'],
      needs: ['holiday lights', 'holiday', 'photo spot', 'date night'] },

    { id: 'dec-gift-local', months: [11, 12], lane: 'city', recurring: true,
      title: 'Gifts from Atlanta places, not Amazon',
      why: 'Local gift guides get shared inside group chats, which is the highest-quality ' +
           'reach there is. Pinterest carries it from late November.',
      platforms: ['pinterest', 'instagram'], types: ['experience', 'restaurant'],
      needs: ['shop', 'boutique', 'market', 'vintage'] },

    { id: 'dec-year-in-review', months: [12], lane: 'city', recurring: true,
      title: 'Everywhere I ate this year, ranked',
      why: 'The one time recycling a year of old footage is not just allowed but expected. ' +
           'Costs nothing to make and reliably outperforms.',
      platforms: ['tiktok', 'instagram'], types: ['restaurant', 'experience'],
      needs: [] },

    /* -------------------------------------------------------- evergreen -- */
    { id: 'ever-wrong', months: 'any', lane: 'city', evergreen: true,
      title: 'The mildly controversial take',
      why: 'One opinion you would defend — an overrated spot, a hill you die on. Comments ' +
           'are the strongest signal on TikTok and nothing else generates them like disagreement.',
      platforms: ['tiktok'], types: ['restaurant', 'experience'], needs: [] },

    { id: 'ever-price', months: 'any', lane: 'food', evergreen: true,
      title: 'What it actually costs — the receipt post',
      why: 'Real numbers travel. Nobody else posts the total, and it makes every ' +
           'recommendation more trustworthy.',
      platforms: ['tiktok', 'instagram'], types: ['restaurant', 'experience'], needs: [] },

    { id: 'ever-hidden', months: 'any', lane: 'city', evergreen: true,
      title: 'Been here X years and only just found this',
      why: 'Discovery framing works on locals and newcomers at once, and it flatters the ' +
           'place without sounding like an ad.',
      platforms: ['tiktok', 'instagram', 'pinterest'], types: ['restaurant', 'experience'], needs: [] },

    { id: 'ever-neighborhood', months: 'any', lane: 'city', evergreen: true,
      title: 'One neighborhood, one day, in order',
      why: 'Your most repeatable format: same structure, different area each time. Builds ' +
           'a series people follow you for, and each one is a fresh Pinterest entry.',
      platforms: ['tiktok', 'pinterest', 'instagram'], types: ['restaurant', 'experience'], needs: [] },

    { id: 'ever-vs', months: 'any', lane: 'food', evergreen: true,
      title: 'Two places, same thing, which wins',
      why: 'Head-to-head beats a roundup for engagement — a binary question is easier to ' +
           'answer in the comments than an open one.',
      platforms: ['tiktok', 'instagram'], types: ['restaurant'], needs: [] }
  ];

  /* ------------------------------------------------------------ coverage -- */

  function inMonth(topic, m) {
    return topic.months === 'any' || topic.months.indexOf(m) !== -1;
  }

  /**
   * How well the library covers a topic — reusing the generator's own matching
   * so the number means the same thing here as it does on the calendar.
   */
  function coverage(topic) {
    var items = CJ.getItems().filter(function (it) {
      if (topic.types && topic.types.indexOf(it.type) === -1) return false;
      if (!topic.needs || !topic.needs.length) return true;
      var bag = CJ.generator.searchBag(it);
      for (var i = 0; i < topic.needs.length; i++) {
        if (CJ.themes.tagMatches(bag, topic.needs[i])) return true;
      }
      return false;
    });

    // Which of the needed tags nothing in the library answers.
    var missing = (topic.needs || []).filter(function (need) {
      return !CJ.getItems().some(function (it) {
        return CJ.themes.tagMatches(CJ.generator.searchBag(it), need);
      });
    });

    return {
      items: items,
      count: items.length,
      ready: items.length >= 3,
      thin: items.length > 0 && items.length < 3,
      missing: missing
    };
  }

  /** Topics for one month, best-covered first, with their coverage attached. */
  function forMonth(m, opts) {
    opts = opts || {};
    var hidden = (CJ.settings().hiddenTopics || []);
    var own = (CJ.state && CJ.state.topics) || [];

    var list = TOPICS.concat(own)
      .filter(function (t) { return inMonth(t, m); })
      .filter(function (t) { return opts.includeHidden || hidden.indexOf(t.id) === -1; })
      .map(function (t) {
        return { topic: t, cov: coverage(t), hidden: hidden.indexOf(t.id) !== -1 };
      });

    list.sort(function (a, b) {
      // Ready things you can film-free post first; then seasonal over evergreen.
      if (a.cov.ready !== b.cov.ready) return a.cov.ready ? -1 : 1;
      var aSeason = a.topic.months !== 'any', bSeason = b.topic.months !== 'any';
      if (aSeason !== bSeason) return aSeason ? -1 : 1;
      if (!!a.topic.recurring !== !!b.topic.recurring) return a.topic.recurring ? -1 : 1;
      return b.cov.count - a.cov.count;
    });
    return list;
  }

  CJ.monthly = {
    TOPICS: TOPICS,
    forMonth: forMonth,
    coverage: coverage,
    inMonth: inMonth
  };

})(window.CJ);
