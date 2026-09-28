/**
 * Refresh preservation, event geography, monthly topics, post briefs.
 *
 *   node test/planning-test.js
 *
 * The refresh assertions are the important ones. "A refresh must not undo a
 * decision" is easy to state and easy to break, and the failure is silent —
 * you only notice when a post you planned has quietly moved.
 */
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
  res.end(fs.readFileSync(f));
});

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ FAIL ' + label + (extra !== undefined ? '\n        ' + JSON.stringify(extra) : '')); }
};

// A library with three distinct areas and no downtown at all — exactly the
// shape that produced the bad Dragon Con line-up.
const SEED = `
  CJ.wipe();
  [['Le Bon Nosh','Buckhead','restaurant',['french','wine bar','date night']],
   ["Henri's Bakery",'Buckhead','restaurant',['bakery','pastries','casual']],
   ['Bar Margot','Buckhead','restaurant',['cocktails','date night','group']],
   ['Battery Bites','The Battery','restaurant',['casual','group','people watching']],
   ['Punch Bowl Social','The Battery','experience',['group','games','people watching']],
   ['Truist Park Tour','The Battery','experience',['sports','people watching','group']],
   ['Miller Union','West Midtown','restaurant',['upscale','date night','farm to table']],
   ['Bacchanalia','West Midtown','restaurant',['upscale','tasting menu','splurge']],
   ['Westside Provisions','West Midtown','experience',['shop','walk','boutique']],
   ['Sunday reset','', 'home',['routine','organize','decor']],
   ['Fall mantel','', 'home',['decor','fall','cozy','seasonal']]
  ].forEach(([n,h,t,tags])=>CJ.upsertItem({
     name:n, neighborhood:h, type:t, tags:tags,
     notes:'Good for groups, easy parking, nice light in the afternoon.'}));
`;

(async () => {
  await new Promise(r => server.listen(8905, r));
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  // Pin "today" to mid-August. Several assertions are about Dragon Con
  // (early September); run the suite between September and spring and it falls
  // outside the 6-month horizon, so those checks failed for date reasons, not
  // code reasons. setFixedTime fixes Date only — timers keep running.
  const FIXED_TODAY = new Date(new Date().getFullYear() + '-08-10T12:00:00');
  await page.clock.setFixedTime(FIXED_TODAY);
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_/.test(m.text())) errors.push('CONSOLE: ' + m.text()); });
  await page.route('**/api.open-meteo.com/**', r => r.abort());
  await page.route('**/fonts.googleapis.com/**', r => r.abort());
  await page.goto('http://localhost:8905/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);

  /* ================================================== 1. refresh keeps ==== */
  console.log('\n1. A refresh never undoes a decision');

  const kept = await page.evaluate('(()=>{' + SEED + `
    CJ.setIdeas(CJ.generator.generate({months:3}).ideas);
    const before = CJ.getIdeas();

    // Plan three, mark one posted, move one, dismiss two.
    const live = before.filter(i => i.status === 'suggested');
    const planned = live.slice(0, 3).map(i => i.id);
    planned.forEach(id => CJ.updateIdea(id, { status: 'planned' }));

    const doneId = live[3].id;
    CJ.updateIdea(doneId, { status: 'done' });

    const movedId = live[4].id;
    const movedDrop = CJ.getIdea(movedId).drops[0];
    CJ.updateDrop(movedDrop.id, { date: '2026-11-19', touched: true });

    const dismissed = live.slice(5, 7).map(i => i.id);
    dismissed.forEach(id => CJ.updateIdea(id, { status: 'dismissed' }));

    const snapshot = {};
    [].concat(planned, [doneId]).forEach(id => {
      const i = CJ.getIdea(id);
      snapshot[id] = { date: i.date, drops: i.drops.map(d => d.platform + '@' + d.date), items: i.itemIds.slice() };
    });

    // Refresh twice — a decision has to survive more than one pass.
    CJ.setIdeas(CJ.generator.generate({months:3}).ideas);
    const res = CJ.generator.generate({months:3});
    CJ.setIdeas(res.ideas);

    const after = {};
    [].concat(planned, [doneId]).forEach(id => {
      const i = CJ.getIdea(id);
      after[id] = i ? { date: i.date, drops: i.drops.map(d => d.platform + '@' + d.date), items: i.itemIds.slice() } : null;
    });

    return {
      snapshot, after, planned, doneId, dismissed,
      dismissedStillDismissed: dismissed.every(id => {
        const i = CJ.getIdea(id);
        return i && i.status === 'dismissed';
      }),
      dismissedNotResurrected: dismissed.every(id => {
        const i = CJ.getIdea(id);
        return i && i.status !== 'suggested';
      }),
      // getDrop returns { drop, idea } — the drop is nested.
      movedDate: CJ.getDrop(movedDrop.id) ? CJ.getDrop(movedDrop.id).drop.date : null,
      stats: res.stats
    };
  ` + '})()');

  check('every planned idea survived, unchanged',
        kept.planned.every(id => JSON.stringify(kept.snapshot[id]) === JSON.stringify(kept.after[id])),
        kept.planned.map(id => ({ before: kept.snapshot[id], after: kept.after[id] })).filter((x, i) =>
          JSON.stringify(x.before) !== JSON.stringify(x.after)));
  check('a posted idea survived, unchanged',
        JSON.stringify(kept.snapshot[kept.doneId]) === JSON.stringify(kept.after[kept.doneId]),
        { before: kept.snapshot[kept.doneId], after: kept.after[kept.doneId] });
  check('a manually moved drop stayed on its new date', kept.movedDate === '2026-11-19', kept.movedDate);
  check('dismissed ideas stay dismissed after two refreshes', kept.dismissedStillDismissed);
  check('dismissed ideas are never re-suggested', kept.dismissedNotResurrected);
  check('the refresh reports what it locked', kept.stats.locked > 0, kept.stats);

  /* -------------------------------------- 2. a dismissal frees its slot -- */
  console.log('\n2. Saying no makes room for something else');

  const freed = await page.evaluate('(()=>{' + SEED + `
    CJ.setIdeas(CJ.generator.generate({months:3}).ideas);
    const mk = CJ.todayISO().slice(0,7);
    const inMonth = () => CJ.getIdeas().filter(i =>
      i.date.slice(0,7) === mk && i.status !== 'dismissed');

    const beforeCount = inMonth().length;
    const victims = inMonth().filter(i => i.source === 'theme').slice(0, 2);
    const victimThemes = victims.map(v => v.themeId);
    const victimIds = victims.map(v => v.id);
    const victimTitles = victims.map(v => v.title);
    victims.forEach(v => CJ.updateIdea(v.id, { status: 'dismissed' }));

    const res = CJ.generator.generate({months:3});
    CJ.setIdeas(res.ideas);

    const afterList = inMonth();
    return {
      beforeCount,
      afterCount: afterList.length,
      freed: res.stats.dismissed,
      victimCount: victims.length,
      // The replacements must not be the same theme wearing a hat.
      reusedTheme: afterList.some(i => victimThemes.indexOf(i.themeId) !== -1),
      resurrectedId: afterList.some(i => victimIds.indexOf(i.id) !== -1),
      sameTitle: afterList.some(i => victimTitles.indexOf(i.title) !== -1)
    };
  ` + '})()');

  check('the month refills to roughly its old size',
        freed.afterCount >= freed.beforeCount - 1, freed);
  check('the exact dismissed idea never returns', !freed.resurrectedId);
  check('and neither does its title', !freed.sameTitle);
  check('the replacement is a different theme, not the same one reshuffled',
        !freed.reusedTheme, { freed });
  check('the refresh counts every freed slot',
        freed.freed === freed.victimCount && freed.victimCount > 0,
        { counted: freed.freed, dismissed: freed.victimCount });

  /* ============================================ 3. event geography ======= */
  console.log('\n3. An event post is set where the event is');

  const geo = await page.evaluate('(()=>{' + SEED + `
    const res = CJ.generator.generate({months:6});
    const byOcc = {};
    res.ideas.filter(i => i.occasion).forEach(i => {
      byOcc[i.occasion.name] = {
        title: i.title,
        mode: i.occasion.mode,
        area: i.occasion.area || [],
        hoods: i.itemIds.map(id => (CJ.getItem(id)||{}).neighborhood).filter(Boolean)
      };
    });
    return { byOcc, escapes: res.stats.escapes, stats: res.stats };
  ` + '})()');

  const dc = geo.byOcc['Dragon Con'];
  check('Dragon Con still produces a post', !!dc, Object.keys(geo.byOcc));
  if (dc) {
    check('with no downtown content it becomes an explicit avoid-the-crowds post',
          dc.mode === 'escape', dc);
    check('and the title says so rather than pretending to be a downtown guide',
          /skip|instead|avoid/i.test(dc.title), dc.title);
    check('none of its places are downtown',
          dc.hoods.every(h => !/downtown/i.test(h)), dc.hoods);
  }

  // Every in-area post must be entirely inside its area. This is the assertion
  // that would have caught the original bug.
  const leaks = Object.keys(geo.byOcc).map(k => [k, geo.byOcc[k]])
    .filter(([, o]) => o.mode === 'in-area' && o.area.length)
    .filter(([, o]) => o.hoods.some(h =>
      !o.area.some(a => h.toLowerCase().includes(a) || a.includes(h.toLowerCase()))));
  check('no in-area event post features a place from another area', leaks.length === 0, leaks);

  const inArea = await page.evaluate(`(()=>{
    ['Sweet Auburn BBQ','Alma Cocina','Skyview'].forEach(n =>
      CJ.upsertItem({ name:n, neighborhood:'Downtown', type:'restaurant',
                      tags:['casual','group','people watching'], notes:'Downtown spot.' }));
    const res = CJ.generator.generate({months:6});
    const i = res.ideas.find(x => x.occasion && x.occasion.name === 'Dragon Con');
    return i ? { title: i.title, mode: i.occasion.mode,
                 hoods: i.itemIds.map(id => CJ.getItem(id).neighborhood) } : null;
  })()`);
  check('once downtown content exists it switches back to a real downtown guide',
        inArea && inArea.mode === 'in-area', inArea);
  check('and that guide is downtown-only',
        inArea && inArea.hoods.every(h => /downtown/i.test(h)), inArea && inArea.hoods);

  const cov = await page.evaluate(`(()=>{
    const e = CJ.atlanta.EVENTS.find(x => x.id === 'dogwood');
    return CJ.generator.coverageDetail(e);
  })()`);
  check('My Events reports coverage using the same area rule',
        cov.area.indexOf('midtown') !== -1, cov);

  /* ================================================ 4. monthly topics ==== */
  console.log('\n4. Monthly plan');

  await page.evaluate(() => CJ.app.showView('monthly'));
  await page.waitForTimeout(400);
  const cards = await page.locator('.topic-card').count();
  check('the month shows topics', cards > 4, cards);
  check('each says whether you can make it now',
        await page.locator('.topic-state').count() === cards);
  check('at least one is marked ready', await page.locator('.topic-card.is-ready').count() > 0);

  const missingShown = await page.locator('.topic-missing').count();
  check('topics you cannot make say what to shoot', missingShown >= 0);

  await page.click('#monthly-next');
  await page.waitForTimeout(300);
  const t1 = await page.locator('#monthly-title').textContent();
  await page.click('#monthly-prev');
  await page.waitForTimeout(300);
  const t2 = await page.locator('#monthly-title').textContent();
  check('you can page between months', t1 !== t2, { t1, t2 });

  // Scheduling from a topic must produce something a refresh cannot touch.
  const scheduled = await page.evaluate(`(()=>{
    const before = CJ.getIdeas().length;
    document.querySelector('.topic-card.is-ready .btn-primary').click();
    const added = CJ.getIdeas().find(i => i.source === 'topic');
    const res = CJ.generator.generate({months:3});
    CJ.setIdeas(res.ideas);
    const after = CJ.getIdeas().find(i => i.id === added.id);
    return { added: !!added, pinned: added.pinned, survived: !!after,
             sameDate: after && after.date === added.date, count: CJ.getIdeas().length - before };
  })()`);
  check('a topic can be put on the calendar', scheduled.added);
  check('it lands pinned', scheduled.pinned);
  check('and a refresh leaves it exactly where it is',
        scheduled.survived && scheduled.sameDate, scheduled);

  /* =================================================== 5. post briefs ==== */
  console.log('\n5. Per-post briefs');

  const briefs = await page.evaluate(`(()=>{
    const idea = CJ.getIdeas().find(i => i.drops && i.drops.length >= 2);
    const out = idea.drops.map(d => {
      const b = CJ.voice.brief(idea, d);
      return { p: d.platform, title: b.title, voice: b.voice, structure: b.structure,
               thread: b.thread, diff: b.difference, roles: b.roles.length,
               text: CJ.voice.briefText(idea, d) };
    });
    return { platforms: out.map(o => o.p), out };
  })()`);

  check('every platform gets its own brief', briefs.out.length >= 2, briefs.platforms);
  const byP = {}; briefs.out.forEach(o => byP[o.p] = o);

  check('the briefs differ between platforms',
        new Set(briefs.out.map(o => o.voice)).size === briefs.out.length);
  check('each explains how it differs from its siblings',
        briefs.out.every(o => o.diff && o.diff.length > 30));
  check('each says why those places belong together',
        briefs.out.every(o => o.thread && o.thread.length > 20), briefs.out[0].thread);
  check('each has a beat-by-beat structure',
        briefs.out.every(o => o.structure.length >= 3));

  if (byP.pinterest) {
    check('the Pinterest brief is a searchable title, not a hook',
          byP.pinterest.title.length <= 40 && !/POV|^If you/i.test(byP.pinterest.title),
          byP.pinterest.title);
    check('Pinterest is told to make one pin per place',
          byP.pinterest.structure.some(s => /separate pin|one per place/i.test(s)),
          byP.pinterest.structure);
  }
  if (byP.tiktok) {
    check('the TikTok brief is about the spoken hook',
          /spoken|out loud|say/i.test(byP.tiktok.structure.join(' ') + byP.tiktok.voice));
  }
  check('the copyable text includes phrasing and structure',
        /PHRASING:/.test(briefs.out[0].text) && /STRUCTURE:/.test(briefs.out[0].text));

  /* ---- in the UI ---- */
  await page.evaluate(() => CJ.app.showView('calendar'));
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const idea = CJ.getIdeas().find(i => i.drops && i.drops.length >= 2);
    CJ.calendarUI.openIdea(idea.id);
  });
  await page.waitForTimeout(400);
  check('the idea modal shows brief tabs', await page.locator('.brief-tab').count() >= 2);
  const firstPane = await page.locator('.brief-pane').textContent();
  await page.locator('.brief-tab').nth(1).click();
  await page.waitForTimeout(250);
  const secondPane = await page.locator('.brief-pane').textContent();
  check('switching platform changes the brief', firstPane !== secondPane);
  await page.screenshot({ path: '/tmp/cj-brief.png' });
  await page.click('#idea-modal-close');

  /* ------------------------------------------------------- 6. mobile ---- */
  console.log('\n6. Mobile');
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mob.clock.setFixedTime(FIXED_TODAY);
  await mob.route('**/api.open-meteo.com/**', r => r.abort());
  await mob.route('**/fonts.googleapis.com/**', r => r.abort());
  await mob.goto('http://localhost:8905/index.html', { waitUntil: 'domcontentloaded' });
  await mob.waitForTimeout(700);
  await mob.evaluate(() => CJ.app.showView('monthly'));
  await mob.waitForTimeout(400);
  check('monthly plan has no horizontal overflow',
        !(await mob.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  await mob.screenshot({ path: '/tmp/cj-monthly-mobile.png' });

  console.log('\n' + '='.repeat(46));
  console.log(pass + ' passed, ' + fail + ' failed');
  if (errors.length) console.log('\nJS errors:\n' + errors.join('\n'));
  await browser.close();
  server.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
