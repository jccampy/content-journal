/* =========================================================================
   atlanta.js — the built-in Atlanta calendar: weather rhythm, holidays,
   and recurring annual events. This is the layer that makes the generator
   work with zero setup and zero API keys.
   ========================================================================= */

(function (CJ) {
  'use strict';

  /* ---------- date helpers for floating holidays ---------- */

  /** nth weekday of a month. n = 1..5, or -1 for "last". weekday: 0=Sun. */
  function nthWeekday(year, month /*1-12*/, weekday, n) {
    if (n > 0) {
      var d = new Date(year, month - 1, 1);
      var offset = (weekday - d.getDay() + 7) % 7;
      return new Date(year, month - 1, 1 + offset + (n - 1) * 7);
    }
    var last = new Date(year, month, 0); // last day of month
    var back = (last.getDay() - weekday + 7) % 7;
    return new Date(year, month - 1, last.getDate() - back);
  }

  /** Anonymous Gregorian computus — Easter Sunday. */
  function easter(year) {
    var a = year % 19, b = Math.floor(year / 100), c = year % 100;
    var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function fixed(month, day) {
    return function (year) { return new Date(year, month - 1, day); };
  }

  /* ---------- Atlanta's weather + seasonal rhythm, month by month ---------- */
  /* Normals are rounded NWS-style averages for Atlanta (Hartsfield). They only
     need to be directionally right — they drive copy, not forecasts. */

  var MONTHS = [
    { m: 1,  name: 'January',   season: 'winter', hi: 53, lo: 35,
      mood: 'Cold, grey, everyone is hibernating and broke after the holidays.',
      angles: ['cozy at-home reset', 'soup and comfort food', 'no-spend / cheap date nights', 'new year new spots', 'fireplace bars', 'January blues fixes'],
      patio: false },
    { m: 2,  name: 'February',  season: 'winter', hi: 58, lo: 38,
      mood: 'Still cold but the light is coming back. Valentine\'s runs the whole month.',
      angles: ['date night', 'Galentine\'s', 'romantic restaurants', 'cozy nights in', 'planning spring'],
      patio: false },
    { m: 3,  name: 'March',     season: 'spring', hi: 66, lo: 45,
      mood: 'Pollen apocalypse. Everything turns yellow, everything blooms, everyone goes outside anyway.',
      angles: ['pollen season survival', 'first patio day of the year', 'cherry blossoms & blooms', 'spring cleaning + home reset', 'March Madness watch spots'],
      patio: 'early' },
    { m: 4,  name: 'April',     season: 'spring', hi: 73, lo: 52,
      mood: 'Genuinely the best weather of the year. Peak outdoor everything.',
      angles: ['peak patio season', 'festival weekends', 'walkable neighborhood guides', 'spring brunch', 'picnic spots', 'porch / balcony refresh'],
      patio: true },
    { m: 5,  name: 'May',       season: 'spring', hi: 81, lo: 61,
      mood: 'Warm and gorgeous, humidity starting. Graduations, Mother\'s Day, Memorial Day.',
      angles: ['Mother\'s Day brunch', 'graduation dinner spots', 'rooftop season opens', 'summer prep at home', 'farmers markets'],
      patio: true },
    { m: 6,  name: 'June',      season: 'summer', hi: 87, lo: 69,
      mood: 'Hot and humid, afternoon thunderstorms, but the evenings are magic.',
      angles: ['golden hour rooftops', 'pool & patio days', 'frozen drinks', 'Father\'s Day', 'Pride', 'peach season begins', 'AC-blasting indoor picks'],
      patio: true },
    { m: 7,  name: 'July',      season: 'summer', hi: 89, lo: 72,
      mood: 'The hottest, stickiest stretch. Nobody wants to stand outside at noon.',
      angles: ['ice cream & frozen treats', 'best AC in the city', 'Fourth of July', 'peach everything', 'staycation guide', 'summer at-home hosting'],
      patio: 'evening' },
    { m: 8,  name: 'August',    season: 'summer', hi: 88, lo: 71,
      mood: 'Still brutal, but back-to-school energy and football is coming.',
      angles: ['back-to-school routines', 'last-of-summer lists', 'football watch spots', 'late-summer produce', 'home organization reset'],
      patio: 'evening' },
    { m: 9,  name: 'September', season: 'fall',   hi: 82, lo: 65,
      mood: 'Still hot in the first half, then the first cool morning hits and the city loses it.',
      angles: ['first fall feeling', 'football Saturdays & tailgates', 'festival season returns', 'transitional home decor', 'patio weather comes back'],
      patio: true },
    { m: 10, name: 'October',   season: 'fall',   hi: 73, lo: 54,
      mood: 'The other perfect month. Fall in Atlanta is short and everyone knows it.',
      angles: ['peak fall guide', 'Halloween', 'day trips to north GA', 'cozy fall restaurants', 'pumpkin & apple everything', 'fall home decor'],
      patio: true },
    { m: 11, name: 'November',  season: 'fall',   hi: 64, lo: 45,
      mood: 'Crisp, cozy, holiday lights start. Thanksgiving takes over.',
      angles: ['Friendsgiving hosting', 'Thanksgiving prep', 'holiday lights open', 'shop small / local gift guides', 'cozy comfort food'],
      patio: 'heaters' },
    { m: 12, name: 'December',  season: 'winter', hi: 55, lo: 38,
      mood: 'Holiday everything. Lights, markets, parties, and then a dead quiet week.',
      angles: ['holiday lights & markets', 'gift guides', 'holiday party outfits & hosting', 'NYE plans', 'restaurants open on the holidays', 'year in review'],
      patio: 'heaters' }
  ];

  /* ---------- holidays ---------- */

  var HOLIDAYS = [
    { id: 'nye',           name: "New Year's Eve",     date: fixed(12, 31), lead: 14, angles: ['NYE plans', 'dressy dinner', 'places to actually get a table'] },
    { id: 'nyd',           name: "New Year's Day",     date: fixed(1, 1),   lead: 7,  angles: ['hangover food', 'reset day at home'] },
    { id: 'mlk',           name: 'MLK Day',            date: function (y) { return nthWeekday(y, 1, 1, 3); }, lead: 10, angles: ['Black-owned Atlanta', 'Sweet Auburn & the King Center', 'history + food pairing'] },
    { id: 'superbowl',     name: 'Super Bowl Sunday',  date: function (y) { return nthWeekday(y, 2, 0, 2); }, lead: 10, angles: ['watch party spots', 'game day snacks at home', 'best bar TVs'] },
    { id: 'galentines',    name: "Galentine's Day",    date: fixed(2, 13),  lead: 12, angles: ['girls night', 'group-friendly tables', 'brunch with friends'] },
    { id: 'valentines',    name: "Valentine's Day",    date: fixed(2, 14),  lead: 18, angles: ['date night', 'romantic restaurants', 'cook at home date night', 'walk-in friendly backup plans'] },
    { id: 'stpats',        name: "St. Patrick's Day",  date: fixed(3, 17),  lead: 10, angles: ['Irish pubs', 'day drinking patios'] },
    { id: 'easter',        name: 'Easter',             date: easter,        lead: 14, angles: ['Easter brunch', 'spring tablescape', 'family-friendly patios'] },
    { id: 'cincodemayo',   name: 'Cinco de Mayo',      date: fixed(5, 5),   lead: 10, angles: ['margaritas & tacos', 'best patios for day drinking'] },
    { id: 'mothersday',    name: "Mother's Day",       date: function (y) { return nthWeekday(y, 5, 0, 2); }, lead: 18, angles: ['brunch reservations', 'places that take a big group', 'gift guide'] },
    { id: 'memorialday',   name: 'Memorial Day',       date: function (y) { return nthWeekday(y, 5, 1, -1); }, lead: 12, angles: ['long weekend guide', 'pool & rooftop', 'cookout at home'] },
    { id: 'pride',         name: 'Pride month',        date: fixed(6, 1),   lead: 10, angles: ['queer-owned spots', 'Midtown guide'] },
    { id: 'fathersday',    name: "Father's Day",       date: function (y) { return nthWeekday(y, 6, 0, 3); }, lead: 14, angles: ['steak & BBQ', 'sports bars', 'gift guide'] },
    { id: 'juneteenth',    name: 'Juneteenth',         date: fixed(6, 19),  lead: 12, angles: ['Black-owned restaurants', 'festival coverage', 'Atlanta history'] },
    { id: 'julyfourth',    name: 'Fourth of July',     date: fixed(7, 4),   lead: 12, angles: ['fireworks views', 'cookout hosting', 'Peachtree Road Race morning'] },
    { id: 'laborday',      name: 'Labor Day',          date: function (y) { return nthWeekday(y, 9, 1, 1); }, lead: 12, angles: ['last-hurrah-of-summer weekend', 'day trip'] },
    { id: 'halloween',     name: 'Halloween',          date: fixed(10, 31), lead: 18, angles: ['costume-friendly bars', 'Little Five Points parade', 'spooky home decor', 'haunted Atlanta'] },
    { id: 'friendsgiving', name: 'Friendsgiving season', date: fixed(11, 12), lead: 14, angles: ['hosting at home', 'catering & takeout to order', 'tablescape'] },
    { id: 'thanksgiving',  name: 'Thanksgiving',       date: function (y) { return nthWeekday(y, 11, 4, 4); }, lead: 21, angles: ['restaurants open on Thanksgiving', 'pie & bakery orders', 'day-after leftovers'] },
    { id: 'smallbiz',      name: 'Small Business Saturday', date: function (y) { return new Date(nthWeekday(y, 11, 4, 4).getTime() + 2 * 86400000); }, lead: 14, angles: ['shop small Atlanta', 'local maker gift guide'] },
    { id: 'christmas',     name: 'Christmas',          date: fixed(12, 25), lead: 28, angles: ['holiday lights', 'gift guides', 'restaurants open Christmas Day', 'holiday markets'] }
  ];

  /* ---------- recurring Atlanta events ---------- */
  /* `approx: true` means "around this date, confirm before posting" — the app
     shows a small ~ so you know to double-check the official date each year. */

  var EVENTS = [
    // Winter
    { id: 'garden-lights',   name: 'Garden Lights, Holiday Nights (Botanical Garden)', month: 11, day: 15, through: { month: 1, day: 15 }, approx: true, lead: 14, angles: ['holiday lights', 'date night', 'photo spots'], types: ['experience'] },
    { id: 'christkindl',     name: 'Atlanta Christkindl Market',    month: 11, day: 21, approx: true, lead: 12, angles: ['holiday market', 'gift guide', 'mulled wine'], types: ['experience'] },
    { id: 'winter-wine',     name: 'Atlanta Winter Wine Festival',  month: 1,  day: 24, approx: true, lead: 12, angles: ['wine', 'winter events'], types: ['experience'] },
    { id: 'oysterfest',      name: 'Atlanta Oysterfest',            month: 2,  day: 14, approx: true, lead: 10, angles: ['oysters', 'seafood spots'], types: ['restaurant', 'experience'] },
    { id: 'beer-bourbon-bbq',name: 'Beer, Bourbon & BBQ Festival',  month: 2,  day: 28, approx: true, lead: 10, angles: ['BBQ', 'bourbon bars'], types: ['restaurant', 'experience'] },

    // Spring
    { id: 'brunch-fest',     name: 'Atlanta Brunch Festival',       month: 3,  day: 7,  approx: true, lead: 12, angles: ['brunch roundup', 'bottomless mimosas'], types: ['restaurant'] },
    { id: 'cherry-blossom',  name: 'Brookhaven Cherry Blossom Festival', month: 3, day: 28, approx: true, lead: 12, angles: ['blooms & photo spots', 'Brookhaven guide'], types: ['experience'] },
    { id: 'science-fest',    name: 'Atlanta Science Festival',      month: 3,  day: 14, approx: true, lead: 10, angles: ['family things to do', 'nerdy date night'], types: ['experience'] },
    { id: 'ga-food-wine',    name: 'Georgia Food + Wine Festival',  month: 3,  day: 27, approx: true, lead: 14, angles: ['chef spotlight', 'food festival'], types: ['restaurant', 'experience'] },
    { id: 'dogwood',         name: 'Dogwood Festival (Piedmont Park)', month: 4, day: 11, approx: true, lead: 14, angles: ['festival weekend guide', 'Midtown walk-and-eat', 'artist market'], types: ['experience'] },
    { id: 'sweetwater420',   name: 'SweetWater 420 Fest',           month: 4,  day: 17, approx: true, lead: 12, angles: ['music festival', 'what to eat nearby'], types: ['experience'] },
    { id: 'inman-park-fest', name: 'Inman Park Festival & Tour of Homes', month: 4, day: 24, approx: true, lead: 12, angles: ['home tour', 'Inman Park guide', 'porch inspo'], types: ['experience', 'home'] },
    { id: 'atl-film-fest',   name: 'Atlanta Film Festival',         month: 4,  day: 23, approx: true, lead: 12, angles: ['indie film', 'dinner + a movie'], types: ['experience'] },
    { id: 'sweet-auburn',    name: 'Sweet Auburn Springfest',       month: 5,  day: 9,  approx: true, lead: 12, angles: ['Sweet Auburn guide', 'Black-owned food'], types: ['experience', 'restaurant'] },
    { id: 'jazz-fest',       name: 'Atlanta Jazz Festival (Piedmont Park)', month: 5, day: 23, approx: true, lead: 14, angles: ['free things to do', 'picnic setup', 'Memorial Day weekend'], types: ['experience'] },
    { id: 'caribbean-carnival', name: 'Atlanta Caribbean Carnival', month: 5, day: 23, approx: true, lead: 12, angles: ['Caribbean food', 'festival fits'], types: ['experience', 'restaurant'] },

    // Summer
    { id: 'vahi-summerfest', name: 'Virginia-Highland Summerfest',  month: 6,  day: 6,  approx: true, lead: 12, angles: ['Va-Hi neighborhood guide', 'walkable festival day'], types: ['experience'] },
    { id: 'juneteenth-fest', name: 'Juneteenth Atlanta Parade & Music Festival', month: 6, day: 19, approx: true, lead: 12, angles: ['Black-owned Atlanta', 'downtown guide'], types: ['experience', 'restaurant'] },
    { id: 'peachtree',       name: 'AJC Peachtree Road Race',       month: 7,  day: 4,  approx: false, lead: 14, angles: ['race morning', 'post-race brunch', 'Buckhead-to-Midtown route eats'], types: ['experience', 'restaurant'] },
    { id: 'ice-cream-fest',  name: 'Atlanta Ice Cream Festival',    month: 7,  day: 25, approx: true, lead: 10, angles: ['ice cream shops', 'beating the heat'], types: ['restaurant', 'experience'] },
    { id: 'peach-season',    name: 'Georgia peach season peaks',    month: 7,  day: 15, approx: true, lead: 14, angles: ['peach dishes & cocktails', 'peach recipes at home', 'farmers market haul'], types: ['restaurant', 'home'] },
    { id: 'peachfest',       name: 'Peachfest',                     month: 8,  day: 8,  approx: true, lead: 10, angles: ['peach everything', 'Midtown guide'], types: ['restaurant', 'experience'] },
    { id: 'dragoncon',       name: 'Dragon Con',                    month: 9,  day: 4,  approx: true, lead: 12, angles: ['downtown chaos survival guide', 'people watching', 'where to eat downtown'], types: ['experience', 'restaurant'] },

    // Fall
    { id: 'atl-food-wine',   name: 'Atlanta Food & Wine Festival',  month: 9,  day: 12, approx: true, lead: 14, angles: ['chef tastings', 'what to wear', 'best bites'], types: ['restaurant', 'experience'] },
    { id: 'yellow-daisy',    name: 'Yellow Daisy Festival (Stone Mountain)', month: 9, day: 5, approx: true, lead: 12, angles: ['craft market', 'day trip'], types: ['experience'] },
    { id: 'shaky-knees',     name: 'Shaky Knees Music Festival',    month: 9,  day: 19, approx: true, lead: 14, angles: ['festival guide', 'Old Fourth Ward food nearby', 'festival fits'], types: ['experience', 'restaurant'] },
    { id: 'japanfest',       name: 'JapanFest',                     month: 9,  day: 19, approx: true, lead: 10, angles: ['Japanese food in Atlanta', 'Chamblee/Duluth guide'], types: ['experience', 'restaurant'] },
    { id: 'oktoberfest-o4w', name: 'Oktoberfest (Old Fourth Ward)', month: 9,  day: 26, approx: true, lead: 10, angles: ['beer gardens', 'O4W guide'], types: ['experience', 'restaurant'] },
    { id: 'pride-fest',      name: 'Atlanta Pride Festival & Parade', month: 10, day: 10, approx: true, lead: 14, angles: ['Midtown guide', 'queer-owned spots', 'parade day plan'], types: ['experience', 'restaurant'] },
    { id: 'one-musicfest',   name: 'ONE Musicfest',                 month: 10, day: 10, approx: true, lead: 12, angles: ['festival guide', 'downtown eats'], types: ['experience'] },
    { id: 'candler-park-fest', name: 'Candler Park Fall Fest',      month: 10, day: 3,  approx: true, lead: 10, angles: ['neighborhood festival', 'Candler Park guide'], types: ['experience'] },
    { id: 'l5p-halloween',   name: 'Little Five Points Halloween Parade', month: 10, day: 17, approx: true, lead: 12, angles: ['costume inspo', 'L5P guide', 'weird Atlanta'], types: ['experience'] },
    { id: 'pumpkin-fest',    name: 'Stone Mountain Pumpkin Festival', month: 10, day: 5, approx: true, lead: 12, angles: ['family day out', 'fall photos'], types: ['experience'] },
    { id: 'north-ga-leaves', name: 'North Georgia leaf season peaks', month: 10, day: 25, approx: true, lead: 14, angles: ['day trip from Atlanta', 'apple orchards', 'mountain cabins'], types: ['experience'] },
    { id: 'fall-wine-fest',  name: 'Atlanta Fall Wine Festival',    month: 11, day: 14, approx: true, lead: 10, angles: ['wine bars', 'O4W guide'], types: ['experience', 'restaurant'] },

    // Season-long
    { id: 'braves-opening',  name: 'Braves home opener (The Battery)', month: 4, day: 4, approx: true, lead: 12, angles: ['Battery food guide', 'game day plan'], types: ['experience', 'restaurant'] },
    { id: 'falcons-opener',  name: 'Falcons season opener',         month: 9,  day: 12, approx: true, lead: 10, angles: ['sports bars', 'downtown game day'], types: ['experience', 'restaurant'] }
  ];

  /* ---------- resolution ---------- */

  function monthInfo(m) { return MONTHS[m - 1]; }

  /**
   * Every built-in occasion (holiday + event) that falls inside a window,
   * resolved to concrete dates for the relevant years.
   */
  function occurrencesBetween(startDate, endDate, disabledIds) {
    disabledIds = disabledIds || [];
    var out = [];
    var y0 = startDate.getFullYear(), y1 = endDate.getFullYear();

    for (var y = y0; y <= y1; y++) {
      HOLIDAYS.forEach(function (h) {
        if (disabledIds.indexOf(h.id) !== -1) return;
        var d = h.date(y);
        if (d >= startDate && d <= endDate) {
          out.push({ kind: 'holiday', id: h.id, name: h.name, date: d, lead: h.lead || 12, angles: h.angles || [], types: null, approx: false });
        }
      });
      EVENTS.forEach(function (e) {
        if (disabledIds.indexOf(e.id) !== -1) return;
        var d = new Date(y, e.month - 1, e.day);
        if (d >= startDate && d <= endDate) {
          out.push({ kind: 'event', id: e.id, name: e.name, date: d, lead: e.lead || 12, angles: e.angles || [], types: e.types || null, approx: !!e.approx });
        }
      });
    }
    out.sort(function (a, b) { return a.date - b.date; });
    return out;
  }

  CJ.atlanta = {
    MONTHS: MONTHS,
    HOLIDAYS: HOLIDAYS,
    EVENTS: EVENTS,
    monthInfo: monthInfo,
    occurrencesBetween: occurrencesBetween,
    nthWeekday: nthWeekday,
    easter: easter
  };

})(window.CJ);
