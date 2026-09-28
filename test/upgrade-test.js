/**
 * Tests for the v2 upgrade: Overview, Collections, the place journal, the
 * Plan builder (including scoped plans), drag-to-move on the grid, and the phone
 * bottom bar.
 *
 *   npm install playwright
 *   node test/upgrade-test.js
 *
 * Run after any change to ui-home.js, ui-collections.js, ui-journal.js,
 * ui-plan.js, the grid code in ui-calendar.js, or the planFocus scope in
 * generator.js.
 */
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
  res.end(fs.readFileSync(file));
});

let passed = 0, failed = 0;
function check(label, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; console.log('  ✗ FAIL ' + label + (extra ? ' — ' + extra : '')); }
}

(async () => {
  await new Promise(r => server.listen(8893, r));
  const launchOpts = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_CONNECTION|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.route('**/api.open-meteo.com/**', r => r.abort());

  await page.goto('http://localhost:8893/index.html');
  await page.waitForTimeout(500);

  console.log('--- overview ---');
  check('lands on the Overview with no hash', await page.locator('#view-home').evaluate(n => n.classList.contains('is-active')));
  check('empty Overview is an onboarding screen', (await page.locator('#home-body .empty h3').count()) === 1);

  await page.click('#tabs .tab[data-view="settings"]');
  await page.click('#btn-seed');
  await page.waitForTimeout(1500);
  await page.click('#tabs .tab[data-view="home"]');
  await page.waitForTimeout(300);
  check('four stat tiles', (await page.locator('.ov-tile').count()) === 4);
  const placesTile = await page.locator('.ov-tile').nth(2).locator('.ov-tile-value').textContent();
  const itemCount = await page.evaluate(() => CJ.getItems().length);
  check('places tile matches the library', Number(placesTile) === itemCount, placesTile + ' vs ' + itemCount);
  check('next-up list renders', (await page.locator('.ov-next-row').count()) > 0);
  check('platform mix shows all three platforms', (await page.locator('.ov-mix-row').count()) === 3);

  console.log('--- collections ---');
  await page.click('#tabs .tab[data-view="library"]');
  await page.click('#lib-mode button[data-mode="collections"]');
  await page.waitForTimeout(200);
  check('collections mode hides the place list', !(await page.locator('#library-body').isVisible()));
  check('collection cards render', (await page.locator('.coll-card').count()) > 5);

  const hood = await page.evaluate(() => {
    const counts = {};
    CJ.getItems().forEach(i => { if (i.neighborhood) counts[i.neighborhood] = (counts[i.neighborhood] || 0) + 1; });
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  });
  const expected = await page.evaluate(h => CJ.getItems().filter(i => i.neighborhood === h).length, hood);
  const firstCard = page.locator('.coll-section').first().locator('.coll-card').first();
  check('biggest neighborhood is first', (await firstCard.locator('.coll-name').textContent()) === hood);
  check('card counts its places', (await firstCard.locator('.coll-stat strong').first().textContent()) === String(expected));

  await firstCard.locator('.coll-foot button', { hasText: 'Browse' }).click();
  await page.waitForTimeout(200);
  check('Browse switches back to places', await page.locator('#library-body').isVisible());
  const shown = await page.evaluate(() => document.querySelectorAll('#library-body .lib-row, #library-body .item-card').length);
  check('Browse filters to that neighborhood', shown === expected, shown + ' vs ' + expected);

  await page.click('#lib-mode button[data-mode="collections"]');
  await page.fill('#coll-search', 'zzzz-nothing');
  await page.waitForTimeout(150);
  check('collection search can come up empty honestly', (await page.locator('#collections-body .empty').count()) === 1);
  await page.fill('#coll-search', '');
  await page.waitForTimeout(150);

  const subjectOk = await page.evaluate(() => CJ.collectionsUI.subjectTags().every(s => s.n >= 2));
  check('subjects are tags on 2+ places', subjectOk);

  console.log('--- journal ---');
  const target = await page.evaluate(() => {
    const drops = CJ.getDrops().filter(e => e.drop.status !== 'dismissed' && e.drop.date >= CJ.todayISO());
    const id = drops[0].drop.itemIds[0];
    const upcoming = drops.filter(e => e.drop.itemIds.indexOf(id) !== -1).length;
    return { id, upcoming, layers: CJ.getItem(id).layers.length };
  });
  await page.evaluate(id => CJ.journalUI.open(id), target.id);
  await page.waitForTimeout(200);
  check('journal opens', await page.locator('#journal-modal').isVisible());
  const up = await page.locator('#journal-body .jr-upcoming').count();
  check('journal lists every upcoming post with this place', up === target.upcoming, up + ' vs ' + target.upcoming);
  const shoots = await page.locator('#journal-body .jr-shoot').count();
  check('journal lists every clip', shoots === target.layers, shoots + ' vs ' + target.layers);
  check('journal shows three lanes', (await page.locator('.jr-lane').count()) === 3);
  await page.click('#journal-close');

  console.log('--- plan builder ---');
  // Plan one drop first, so we can prove a plan never moves a decision.
  const locked = await page.evaluate(() => {
    const e = CJ.getDrops().find(x => x.drop.status === 'suggested' && x.drop.date > CJ.todayISO());
    CJ.updateDrop(e.drop.id, { status: 'planned' });
    return { id: e.drop.id, date: e.drop.date };
  });
  await page.click('#tabs .tab[data-view="calendar"]');
  await page.click('#btn-plan');
  await page.waitForTimeout(200);
  check('plan builder opens', await page.locator('#plan-modal').isVisible());
  await page.locator('.plan-seg').first().locator('button', { hasText: '3 months' }).click();
  await page.locator('.plan-seg').nth(1).locator('button', { hasText: 'Light' }).click();
  await page.selectOption('#plan-focus', 'neighborhood::' + hood);
  await page.waitForTimeout(100);
  check('summary names the focus', (await page.locator('.plan-summary').textContent()).indexOf(hood) !== -1);
  await page.click('#plan-build');
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => CJ.settings());
  check('horizon saved', st.horizonMonths === 3);
  check('pace saved', st.ideasPerMonth === 4);
  check('focus saved', st.planFocus && st.planFocus.value === hood);
  check('calendar horizon select follows', (await page.inputValue('#cal-months')) === '3');
  const after = await page.evaluate(id => { const f = CJ.getDrop(id); return f && { date: f.drop.date, status: f.drop.status }; }, locked.id);
  check('a planned post did not move', after && after.date === locked.date && after.status === 'planned');

  // A scoped plan: every new occasion/theme post comes only from the
  // collection, and deadlines elsewhere in the library are still placed.
  const scope = await page.evaluate(h => {
    const inScope = id => (CJ.getItem(id) || {}).neighborhood === h;
    CJ.updateSettings({ planFocus: null });
    CJ.generator.refresh({ months: 3 });
    const deadlinesOff = CJ.getIdeas().filter(x => x.source === 'deadline').length;
    CJ.updateSettings({ planFocus: { kind: 'neighborhood', value: h } });
    const leaks = [];
    let posts = 0, deadlinesOn = 0;
    for (let i = 0; i < 6; i++) {
      const res = CJ.generator.refresh({ months: 3 });
      if (i === 0) deadlinesOn = CJ.getIdeas().filter(x => x.source === 'deadline').length;
      CJ.getIdeas().forEach(x => {
        // Locked ideas (anything decided, on any platform) pass through a
        // refresh untouched by design, so they aren't the plan's output.
        if (x.pinned || x.touched || x.status !== 'suggested') return;
        if ((x.drops || []).some(d => d.pinned || d.touched || (d.status && d.status !== 'suggested'))) return;
        if (x.source !== 'theme' && x.source !== 'occasion') return;
        posts++;
        x.itemIds.forEach(id => { if (!inScope(id)) leaks.push(x.title + ' → ' + CJ.getItem(id).name); });
      });
      if (i === 0 && res.stats.focus !== h) leaks.push('stats.focus missing');
    }
    return { leaks: leaks.slice(0, 3), n: leaks.length, posts, deadlinesOff, deadlinesOn };
  }, hood);
  check('scoped plan still makes posts', scope.posts > 0);
  check('scoped plan never uses places outside the collection', scope.n === 0, scope.leaks.join(' | '));
  check('deadlines outside the scope are still placed', scope.deadlinesOn === scope.deadlinesOff,
    scope.deadlinesOn + ' vs ' + scope.deadlinesOff);
  await page.evaluate(() => CJ.calendarUI.refresh());
  await page.waitForTimeout(400);
  check('refresh banner names the scope', (await page.locator('#gen-note').textContent()).indexOf('Plan scope') !== -1);
  const stillLocked = await page.evaluate(id => { const f = CJ.getDrop(id); return f && f.drop.date; }, locked.id);
  check('planned post survived every refresh', stillLocked === locked.date);

  console.log('--- drag to move ---');
  await page.evaluate(() => CJ.calendarUI.setMode('grid'));
  await page.waitForTimeout(300);
  const drag = await page.evaluate(() => {
    const chip = document.querySelector('.g-chip[draggable="true"]');
    const id = chip.getAttribute('data-drop');
    const from = CJ.getDrop(id).drop.date;
    const cells = Array.from(document.querySelectorAll('.cal-cell[data-date]'));
    const to = cells.map(c => c.getAttribute('data-date')).find(d => d !== from && d > CJ.todayISO());
    return { id, from, to };
  });
  // Centre the target first: scrolled to the top edge it sits under the
  // sticky header, and the drop would land on the header instead.
  await page.evaluate(to => document.querySelector(`.cal-cell[data-date="${to}"]`).scrollIntoView({ block: 'center' }), drag.to);
  await page.dragAndDrop(`.g-chip[data-drop="${drag.id}"]`, `.cal-cell[data-date="${drag.to}"]`);
  await page.waitForTimeout(300);
  const moved = await page.evaluate(id => CJ.getDrop(id).drop, drag.id);
  check('dragging a post moves it', moved.date === drag.to, moved.date + ' vs ' + drag.to);
  check('and pins it so a refresh leaves it', moved.pinned === true);
  const doneChipsDraggable = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.g-chip.status-done')).some(c => c.getAttribute('draggable') === 'true'));
  check('posted items are not draggable', !doneChipsDraggable);

  console.log('--- phone ---');
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.route('**/api.open-meteo.com/**', r => r.abort());
  await phone.goto('http://localhost:8893/index.html');
  await phone.waitForTimeout(400);
  const bar = await phone.evaluate(() => {
    const r = document.querySelector('#tabs').getBoundingClientRect();
    return { bottom: Math.round(r.bottom), top: Math.round(r.top), vh: innerHeight, pos: getComputedStyle(document.querySelector('#tabs')).position };
  });
  check('tabs are a bottom bar on phones', bar.pos === 'fixed' && bar.bottom === bar.vh && bar.top > bar.vh - 90, JSON.stringify(bar));
  check('all seven sections visible in the bar', (await phone.locator('#tabs .tab:visible').count()) === 7);
  for (const v of ['home', 'library', 'calendar', 'monthly']) {
    await phone.click(`#tabs .tab[data-view="${v}"]`);
    await phone.waitForTimeout(150);
    const over = await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    check('no sideways scroll on ' + v, !over);
  }

  check('no page errors', errors.length === 0, errors.join(' | '));

  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
