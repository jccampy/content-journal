/* =========================================================================
   themes.js — the recipe book. Each theme says which months it belongs to,
   what kind of content it needs, and how to write the hook.

   match:
     types        – restrict to these content types
     anyTags      – item must carry at least one of these (matched loosely)
     allTags      – item must carry all of these
     notTags      – item must carry none of these
     seasonalOnly – prefer items tagged for this season
   ========================================================================= */

(function (CJ) {
  'use strict';

  var ALL = ['restaurant', 'experience', 'home'];

  /**
   * Tag matching on WORD BOUNDARIES.
   *
   * "patio" matches "good patio", "patio vibes", "PATIO", and a note that says
   * "the patio is the whole point". It does NOT match "fun" against "fun things
   * to do downtown" — an earlier version compared substrings in both directions,
   * which let any short tag satisfy almost any angle and produced line-ups that
   * had nothing to do with the theme. Don't loosen this back up.
   */
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function containsPhrase(hay, needle) {
    if (!hay || !needle) return false;
    if (hay === needle) return true;
    return (' ' + hay + ' ').indexOf(' ' + needle + ' ') !== -1;
  }

  function tagMatches(itemTags, needle) {
    var n = norm(needle);
    if (!n) return false;
    for (var i = 0; i < itemTags.length; i++) {
      var t = norm(itemTags[i]);
      if (!t) continue;
      if (t === n) return true;
      // the angle appears as whole words inside the tag / note / name
      if (containsPhrase(t, n)) return true;
      // …or a substantial tag appears as whole words inside the angle
      if (t.length >= 5 && containsPhrase(n, t)) return true;
    }
    return false;
  }

  var THEMES = [

    /* ---------------- Evergreen roundups (any month) ---------------- */
    {
      id: 'new-to-me', title: 'Places I tried for the first time this {season}',
      blurb: 'A running roundup of the newest spots in your library — the easiest post to make because it uses whatever you just filmed.',
      months: [1,2,3,4,5,6,7,8,9,10,11,12], format: 'roundup',
      match: { types: ALL }, min: 3, max: 5, preferNew: true, weight: 0.8,
      hooks: ['{n} places I went for the first time this {season} — ranked',
              'I tried {n} new Atlanta spots this {season}. Only some of them made it.',
              'New-to-me {season} roundup, saving you the research']
    },
    {
      id: 'never-posted', title: 'The ones I never got around to posting',
      blurb: 'Content sitting in your camera roll that has never gone up anywhere. Free post.',
      months: [1,2,3,4,5,6,7,8,9,10,11,12], format: 'roundup',
      match: { types: ALL }, min: 3, max: 6, requireNeverPosted: true, weight: 1.1,
      hooks: ['Spots I loved and somehow never told you about',
              'Clearing out my camera roll: {n} Atlanta places that deserved a post',
              'The backlog dump — every one of these is worth your time']
    },

    /* ---------------- Patio / outdoor ---------------- */
    {
      id: 'patio-season-open', title: 'Patio season is officially open',
      blurb: 'The first genuinely warm week of the year — patio content performs hardest right here.',
      months: [3, 4], format: 'roundup',
      match: { types: ['restaurant', 'experience'], anyTags: ['patio', 'outdoor', 'rooftop', 'porch'] },
      min: 3, max: 5, weight: 1.5,
      hooks: ['It hit 70 degrees so here are the {n} patios I\'m running to',
              'Patio season is open. Bookmark these {n}.',
              'Atlanta patio tier list, spring edition']
    },
    {
      id: 'best-patios', title: 'Best patios in Atlanta right now',
      blurb: 'The classic Atlanta roundup. Works every warm month with a different angle each time.',
      months: [4, 5, 6, 9, 10], format: 'roundup',
      match: { types: ['restaurant', 'experience'], anyTags: ['patio', 'outdoor', 'rooftop'] },
      min: 3, max: 5, weight: 1.3,
      hooks: ['Atlanta patios that actually have shade',
              'The {n} patios I take everyone who visits',
              'Ranking Atlanta patios by how long you can sit there']
    },
    {
      id: 'rooftop-golden-hour', title: 'Rooftops for golden hour',
      blurb: 'Summer evenings in Atlanta are the whole personality of the city. Shoot vertical, shoot late.',
      months: [5, 6, 7, 8, 9], format: 'roundup',
      match: { types: ['restaurant', 'experience'], anyTags: ['rooftop', 'view', 'patio', 'skyline'] },
      min: 2, max: 4, weight: 1.2,
      hooks: ['Golden hour in Atlanta hits different from {n} feet up',
              'Rooftop bars ranked by skyline view',
              'Where to catch the sunset without leaving the city']
    },
    {
      id: 'dog-friendly', title: 'Dog-friendly spots in Atlanta',
      blurb: 'Evergreen, high-save, and Pinterest loves it.',
      months: [3, 4, 5, 9, 10], format: 'roundup',
      match: { types: ['restaurant', 'experience'], anyTags: ['dog friendly', 'dog-friendly', 'dogs', 'patio'] },
      min: 2, max: 5, weight: 0.9,
      hooks: ['Places your dog is genuinely welcome, not just tolerated',
              'Dog-friendly Atlanta: the shortlist']
    },

    /* ---------------- Date night / occasion ---------------- */
    {
      id: 'date-night', title: 'Date night spots that never miss',
      blurb: 'Your highest-intent save. People plan around this one.',
      months: [1,2,3,4,5,6,7,8,9,10,11,12], format: 'roundup',
      match: { types: ['restaurant', 'experience'], anyTags: ['date night', 'date-night', 'romantic', 'cozy', 'intimate'] },
      min: 3, max: 5, weight: 1.2,
      hooks: ['Date night spots I send to everyone who asks',
              '{n} Atlanta date nights, sorted by how much effort you want to make',
              'Third date restaurants > first date restaurants and here\'s the list']
    },
    {
      id: 'valentines-week', title: "Where to actually get a Valentine's table",
      blurb: 'Post this 2–3 weeks out. Everyone is panicking about reservations.',
      months: [1, 2], format: 'guide',
      match: { types: ['restaurant'], anyTags: ['date night', 'romantic', 'cozy', 'intimate', 'upscale'] },
      min: 3, max: 5, weight: 1.4,
      hooks: ["Valentine's reservations are already gone — here's the backup list",
              "The {n} romantic Atlanta restaurants worth the effort",
              "Skip the prix fixe. Go here instead."]
    },
    {
      id: 'galentines', title: "Galentine's / girls night lineup",
      blurb: 'Group-friendly places, big tables, good lighting.',
      months: [2], format: 'roundup',
      match: { types: ['restaurant', 'experience'], anyTags: ['girls night', 'group', 'brunch', 'cocktails', 'fun'] },
      min: 2, max: 5, weight: 1.1,
      hooks: ["Galentine's plans, handled",
              'Where to take a group of 6+ without a two-hour wait']
    },
    {
      id: 'brunch', title: 'Atlanta brunch, ranked',
      blurb: 'Perennial performer. Rotate the angle: bottomless, quiet, walk-in, patio.',
      months: [3, 4, 5, 6, 9, 10, 11], format: 'roundup',
      match: { types: ['restaurant'], anyTags: ['brunch', 'breakfast', 'coffee', 'pastry', 'bakery'] },
      min: 3, max: 5, weight: 1.0,
      hooks: ['Atlanta brunch, ranked by how long you\'ll wait',
              'Brunch spots where you can actually hear each other',
              'The {n} brunches worth setting an alarm for']
    },
    {
      id: 'out-of-towners', title: 'Where I take people visiting Atlanta',
      blurb: 'Broad appeal, big saves, works on all three platforms.',
      months: [3,4,5,6,7,8,9,10], format: 'guide',
      match: { types: ['restaurant', 'experience'] }, min: 4, max: 6, weight: 1.0,
      hooks: ['My Atlanta itinerary for anyone visiting for 48 hours',
              'What I make every out-of-towner do in Atlanta',
              'You have one weekend in Atlanta. Do this.']
    },

    /* ---------------- Neighborhood ---------------- */
    {
      id: 'neighborhood-guide', title: '{neighborhood} in one day',
      blurb: 'Groups everything you have in a single neighborhood into a walkable guide. Generates one per neighborhood you have enough content for.',
      months: [1,2,3,4,5,6,7,8,9,10,11,12], format: 'guide',
      match: { types: ['restaurant', 'experience'] }, min: 3, max: 5,
      byNeighborhood: true, weight: 1.15,
      hooks: ['How to do {neighborhood} in one perfect day',
              '{neighborhood} but you only have 4 hours',
              'Everything worth stopping for in {neighborhood}']
    },
    {
      id: 'walkable-block', title: 'Park once, eat three times: {neighborhood}',
      blurb: 'Atlanta parking is the villain — leaning into that is reliably relatable.',
      months: [3,4,5,9,10,11], format: 'guide',
      match: { types: ['restaurant'] }, min: 3, max: 4, byNeighborhood: true, weight: 0.95,
      hooks: ['Park once in {neighborhood} and hit all {n} of these',
              'The {neighborhood} crawl I do every time']
    },

    /* ---------------- Seasonal food ---------------- */
    {
      id: 'cozy-winter-food', title: 'Cozy winter food in Atlanta',
      blurb: 'Soup, fireplaces, dark wood, warm lighting. January and February\'s whole thing.',
      months: [11, 12, 1, 2], format: 'roundup',
      match: { types: ['restaurant'], anyTags: ['cozy', 'comfort', 'soup', 'ramen', 'fireplace', 'warm', 'italian'] },
      min: 2, max: 5, weight: 1.2,
      hooks: ['It\'s 38 degrees. Here\'s where to eat.',
              'Atlanta restaurants with a fireplace — the full list',
              'Cold weather comfort food, {n} deep']
    },
    {
      id: 'frozen-and-cold', title: 'How to survive an Atlanta summer',
      blurb: 'Ice cream, frozen drinks, and the best air conditioning in the city.',
      months: [6, 7, 8], format: 'roundup',
      match: { types: ['restaurant', 'experience'], anyTags: ['ice cream', 'frozen', 'cold', 'dessert', 'cocktails', 'indoor', 'ac'] },
      min: 2, max: 5, weight: 1.25,
      hooks: ['It is 94 degrees. These {n} places are the plan.',
              'Ranking Atlanta by air conditioning quality',
              'Frozen drinks that make July survivable']
    },
    {
      id: 'peach-season', title: 'Peach season, Atlanta edition',
      blurb: 'Georgia peaches peak June–August. Extremely on-brand, extremely Pinterest.',
      months: [6, 7, 8], format: 'roundup',
      match: { types: ['restaurant', 'home'], anyTags: ['peach', 'dessert', 'cocktails', 'farmers market', 'baking', 'recipe'] },
      min: 2, max: 4, weight: 1.1,
      hooks: ['Peach season is short. Here\'s where to spend it.',
              'Every peach thing I ate this summer',
              'Georgia peach recipes I actually make']
    },
    {
      id: 'fall-cozy', title: 'The first cold day list',
      blurb: 'Atlanta\'s fall is about three weeks long. Post the second the weather turns.',
      months: [9, 10, 11], format: 'roundup',
      match: { types: ['restaurant', 'experience', 'home'], anyTags: ['cozy', 'fall', 'coffee', 'comfort', 'fireplace', 'candle'] },
      min: 2, max: 5, weight: 1.3,
      hooks: ['The first cool morning hit and I have a list ready',
              'Fall in Atlanta lasts 3 weeks. Do these {n} things.',
              'Cozy season starts now']
    },
    {
      id: 'holiday-table', title: 'Holiday hosting, handled',
      blurb: 'Tablescapes, what to order in, what to make. Pinterest gold.',
      months: [11, 12], format: 'guide',
      match: { types: ['home', 'restaurant'], anyTags: ['hosting', 'holiday', 'decor', 'recipe', 'baking', 'catering', 'tablescape', 'entertaining'] },
      min: 2, max: 5, weight: 1.3,
      hooks: ['Hosting this year? Steal my entire setup.',
              'What I\'m ordering vs. what I\'m actually cooking',
              'Holiday table on a budget, {n} steps']
    },
    {
      id: 'gift-guide', title: 'Atlanta local gift guide',
      blurb: 'Shop-small angle. Pin it in early November, it earns all season.',
      months: [11, 12], format: 'guide',
      match: { types: ['experience', 'home', 'restaurant'], anyTags: ['shop', 'local', 'gift', 'maker', 'market', 'boutique'] },
      min: 2, max: 6, weight: 1.15,
      hooks: ['Everything on this gift guide is from an Atlanta small business',
              'Gifts that aren\'t from Amazon, {n} ideas',
              'Local gift guide — bookmark before December']
    },

    /* ---------------- At home / lifestyle ---------------- */
    {
      id: 'home-reset', title: 'Seasonal home reset',
      blurb: 'Your at-home content, framed around the turn of the season.',
      months: [1, 3, 6, 9], format: 'single',
      match: { types: ['home'] }, min: 1, max: 3, weight: 1.2,
      hooks: ['{season} reset: everything I changed at home',
              'The 20-minute reset I do every {season}',
              'My home in {month} vs. three months ago']
    },
    {
      id: 'home-hosting', title: 'Hosting at home without losing it',
      blurb: 'Ties your at-home content to a specific occasion so it doesn\'t feel like filler.',
      months: [2, 5, 6, 7, 11, 12], format: 'guide',
      match: { types: ['home'], anyTags: ['hosting', 'entertaining', 'recipe', 'cocktails', 'tablescape', 'decor'] },
      min: 1, max: 4, weight: 1.0,
      hooks: ['Hosting {n} people with zero stress',
              'The at-home version of a $200 dinner out',
              'Everything I set out before people arrive']
    },
    {
      id: 'cook-vs-order', title: 'Cook it at home vs. go out for it',
      blurb: 'Pairs one at-home item with a restaurant item. Great hybrid format for Reels.',
      months: [1,2,3,4,5,6,7,8,9,10,11,12], format: 'split',
      match: { types: ['home', 'restaurant'] }, min: 2, max: 4, needsBothTypes: ['home', 'restaurant'], weight: 0.9,
      hooks: ['The restaurant version vs. my version — be honest',
              'Recreating my favorite Atlanta dish at home',
              'When to go out and when to just make it']
    },
    {
      id: 'slow-morning', title: 'A slow morning in Atlanta',
      blurb: 'Soft, aesthetic, low-effort to film. Coffee shop + at-home footage stitched together.',
      months: [1,2,3,4,5,9,10,11,12], format: 'vlog',
      match: { types: ['restaurant', 'home'], anyTags: ['coffee', 'bakery', 'brunch', 'cozy', 'morning', 'routine'] },
      min: 2, max: 4, weight: 0.85,
      hooks: ['A slow Saturday morning in Atlanta',
              'Come with me on my actual weekend morning',
              'Romanticizing a Tuesday']
    },

    /* ---------------- Experiences ---------------- */
    {
      id: 'free-things', title: 'Free things to do in Atlanta',
      blurb: 'Big reach, big saves, and it costs you nothing to make.',
      months: [1, 3, 4, 5, 9, 10], format: 'roundup',
      match: { types: ['experience'], anyTags: ['free', 'park', 'walk', 'outdoor', 'museum', 'market', 'trail'] },
      min: 3, max: 6, weight: 1.05,
      hooks: ['{n} free things to do in Atlanta this {month}',
              'Broke weekend? These are all free.',
              'You do not need to spend money to have a good Atlanta weekend']
    },
    {
      id: 'weekend-plan', title: 'A perfect Atlanta weekend in {month}',
      blurb: 'Friday-to-Sunday itinerary stitched from what you already have.',
      months: [1,2,3,4,5,6,7,8,9,10,11,12], format: 'guide',
      match: { types: ['restaurant', 'experience'] }, min: 4, max: 6, weight: 1.1,
      hooks: ['Your {month} weekend in Atlanta, planned for you',
              'Friday night through Sunday brunch — the full plan',
              'Screenshot this for the weekend']
    },
    {
      id: 'day-trip', title: 'Day trips from Atlanta',
      blurb: 'North Georgia in October, coast in spring. Pinterest performs hard on these.',
      months: [3, 4, 10, 11], format: 'guide',
      match: { types: ['experience'], anyTags: ['day trip', 'drive', 'north georgia', 'mountains', 'orchard', 'winery', 'hike', 'trail'] },
      min: 1, max: 4, weight: 1.0,
      hooks: ['Under 2 hours from Atlanta and worth the drive',
              '{n} day trips that fix a bad week',
              'Leaf season day trip, fully planned']
    },
    {
      id: 'rainy-day', title: 'Rainy day in Atlanta',
      blurb: 'Keep this one loaded — post it the morning a storm rolls in.',
      months: [1,2,3,4,5,6,7,8,9,10,11,12], format: 'roundup',
      match: { types: ['experience', 'restaurant', 'home'], anyTags: ['indoor', 'museum', 'cozy', 'coffee', 'movie', 'shop', 'bookstore'] },
      min: 2, max: 5, weight: 0.7, reactive: true,
      hooks: ['It\'s pouring. Here\'s the plan.',
              'Rainy Atlanta day, {n} options',
              'Indoor plans for when the sky opens up']
    },

    /* ---------------- Recency / maintenance ---------------- */
    {
      id: 'still-good', title: 'Places I still think about',
      blurb: 'Recycles your best older content that hasn\'t been posted in a long time.',
      months: [1,2,3,4,5,6,7,8,9,10,11,12], format: 'roundup',
      match: { types: ALL }, min: 3, max: 5, requireStale: 150, weight: 1.0,
      hooks: ['Old favorites I haven\'t mentioned in a while',
              'Still the best in the city and I\'ll say it again',
              'A reminder that these {n} exist']
    },
    {
      id: 'year-in-review', title: 'My Atlanta year in review',
      blurb: 'End-of-year recap built from everything you posted. Huge on all three platforms.',
      months: [12], format: 'roundup',
      match: { types: ALL }, min: 5, max: 8, weight: 1.4,
      hooks: ['Everywhere I ate in Atlanta this year, ranked',
              'My {n} favorite things I did in Atlanta this year',
              'The year in Atlanta, condensed']
    }
  ];

  CJ.themes = { THEMES: THEMES, tagMatches: tagMatches, norm: norm, containsPhrase: containsPhrase };

})(window.CJ);
