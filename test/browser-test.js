/**
 * Browser test suite for the Content Journal.
 *
 *   npm install playwright
 *   node test/browser-test.js
 *
 * Starts its own static server on :8899, blocks the live weather API for
 * determinism, and screenshots to /tmp/cj-shot-*.png.
 *
 * Run this after ANY change to src/generator.js. The spacing and rollout
 * assertions are the ones that catch real regressions.
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

const ok = (b) => (b ? '✓' : '✗ FAIL');

(async () => {
  await new Promise(r => server.listen(8899, r));
  const launchOpts = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });

  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/ERR_CONNECTION|ERR_FAILED/.test(m.text())) errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.route('**/api.open-meteo.com/**', r => r.abort());

  await page.goto('http://localhost:8899/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  console.log('--- loaded ---');
  console.log('empty state:', await page.locator('#library-body .empty h3').textContent());

  /* ---------- 1. seed ---------- */
  await page.click('#tabs .tab[data-view="settings"]');
  await page.click('#btn-seed');
  await page.waitForTimeout(1200);
  const seeded = await page.evaluate(() => ({
    items: CJ.getItems().length,
    layers: CJ.getItems().reduce((a, i) => a + i.layers.length, 0),
    withUnused: CJ.getItems().filter(i => CJ.unusedLayers(i).length).length
  }));
  console.log(`seeded: ${seeded.items} places, ${seeded.layers} layers, ${seeded.withUnused} with unused footage`);
  console.log('every place has >=1 layer:', ok(await page.evaluate(() => CJ.getItems().every(i => i.layers.length >= 1))));

  /* ---------- 2. add a place, then layers ---------- */
  await page.click('#btn-add');
  await page.fill('#f-name', 'Test Patio Spot');
  await page.fill('#f-neighborhood', 'Inman Park');
  for (const t of ['patio', 'date night', 'good patio']) {
    await page.fill('#f-tag-entry', t); await page.keyboard.press('Enter');
  }
  await page.fill('#f-notes', 'Great golden hour light on the back patio.');
  await page.click('#btn-save');
  await page.waitForTimeout(600);
  console.log('first-run footage prompt:', ok(await page.locator('#layer-modal').isVisible()));
  console.log('times-posted starts blank:', ok((await page.inputValue('#l-postcount')) === ''));
  await page.fill('#l-label', 'Golden hour patio');
  await page.check('#l-has-deadline');
  await page.waitForTimeout(150);
  const due = new Date(); due.setDate(due.getDate() + 9);
  await page.fill('#l-deadline', due.toISOString().slice(0, 10));
  await page.fill('#l-deadline-note', 'Brand deal due');
  await page.selectOption('#l-priority', 'high');
  await page.click('#layer-form button[type="submit"]');
  await page.waitForTimeout(600);
  console.log('place count:', await page.locator('#library-count').textContent());

  const testId = await page.evaluate(() => CJ.getItems().find(i => i.name === 'Test Patio Spot').id);
  await page.evaluate(id => CJ.layersUI.open(id), testId);
  await page.waitForTimeout(300);
  await page.fill('#l-label', 'Winter fire pit visit');
  await page.fill('#l-notes', 'Second shoot, totally different look.');
  await page.click('#layer-form button[type="submit"]');
  await page.waitForTimeout(500);
  const layers = await page.evaluate(id => CJ.getItem(id).layers.map(l => l.label), testId);
  console.log('layers stack, not overwrite:', ok(layers.length === 2), '|', layers.join(' + '));

  /* ---------- 3. filters, grouping ---------- */
  await page.locator('#tag-filters .tag', { hasText: 'patio' }).first().click();
  await page.waitForTimeout(300);
  console.log('tag filter:', await page.locator('#library-count').textContent());
  await page.click('#btn-clear-filters');
  await page.waitForTimeout(200);
  console.log('reuse chips:', (await page.locator('#reuse-filters .chip').allTextContents()).join(' | '));
  await page.selectOption('#group-by', 'reuse');
  await page.waitForTimeout(250);
  console.log('reuse groups:', (await page.locator('.group-head h3').allTextContents()).join(' | '));
  await page.selectOption('#group-by', 'none');
  await page.screenshot({ path: '/tmp/cj-shot-library.png' });

  /* ---------- 4. generate ---------- */
  await page.click('#tabs .tab[data-view="calendar"]');
  await page.click('#btn-refresh');
  await page.waitForTimeout(1600);

  const gen = await page.evaluate(() => {
    const ds = CJ.getDrops();
    const byP = {}, byF = {};
    ds.forEach(e => { byP[e.drop.platform] = (byP[e.drop.platform] || 0) + 1; byF[e.drop.format] = (byF[e.drop.format] || 0) + 1; });
    return { ideas: CJ.getIdeas().length, drops: ds.length, byP, byF };
  });
  console.log(`concepts: ${gen.ideas} | scheduled posts: ${gen.drops}`);
  console.log('  by platform:', JSON.stringify(gen.byP));
  console.log('  by format:  ', JSON.stringify(gen.byF));
  await page.screenshot({ path: '/tmp/cj-shot-calendar.png' });

  /* ---------- 5. rollout staggering ---------- */
  const rollout = await page.evaluate(() => {
    const bad = [];
    let sample = null;
    CJ.getIdeas().forEach(i => {
      const ds = (i.drops || []).slice().sort((a, b) => a.date.localeCompare(b.date));
      if (ds.length < 2) return;
      if (!sample) sample = { title: i.title, rows: ds.map(d => `${d.platform} ${d.date} ${d.format}`) };
      for (let k = 1; k < ds.length; k++) if (ds[k].date === ds[k - 1].date) bad.push(i.title + ' same-day');
      if (ds.findIndex(d => d.platform === 'pinterest') === 0) bad.push(i.title + ' pinterest-first');
    });
    return { bad, sample };
  });
  console.log('rollout staggered, Pinterest never first:', ok(rollout.bad.length === 0),
              rollout.bad.length ? '| ' + rollout.bad.slice(0, 3).join(', ') : '');
  if (rollout.sample) {
    console.log('  example — ' + rollout.sample.title);
    rollout.sample.rows.forEach(r => console.log('     ' + r));
  }

  /* ---------- 6. formats ---------- */
  const fmt = await page.evaluate(() => {
    const min = CJ.settings().carouselMinItems;
    const bad = [];
    CJ.getDrops().forEach(({ drop }) => {
      if (drop.platform === 'pinterest' && drop.format !== 'pins') bad.push('pinterest ' + drop.format);
      if (drop.platform === 'tiktok' && drop.format !== 'video') bad.push('tiktok ' + drop.format);
      if (drop.platform === 'instagram' && drop.format === 'carousel' && drop.itemIds.length < min) {
        bad.push('carousel with ' + drop.itemIds.length);
      }
    });
    return { min, bad };
  });
  console.log(`formats correct (carousel at ${fmt.min}+):`, ok(fmt.bad.length === 0), fmt.bad.slice(0, 3).join(', '));

  /* ---------- 7. spacing is PER PLATFORM ---------- */
  const spacing = await page.evaluate(() => {
    const byKey = {};
    CJ.getDrops().forEach(e => {
      if (e.drop.status === 'dismissed') return;
      (e.drop.itemIds || []).forEach(id => {
        const k = id + '|' + e.drop.platform;
        (byKey[k] = byKey[k] || []).push(e.drop.date);
      });
    });
    CJ.getItems().forEach(it => CJ.PLATFORM_IDS.forEach(p => {
      const l = CJ.lastPostedOn(it, p);
      if (l) { const k = it.id + '|' + p; (byKey[k] = byKey[k] || []).push(l); }
    }));
    const bad = [];
    Object.keys(byKey).forEach(k => {
      const it = CJ.getItem(k.split('|')[0]);
      if (!it) return;
      const need = CJ.minGapFor(it);
      const list = byKey[k].slice().sort();
      for (let i = 1; i < list.length; i++) {
        const g = Math.round((CJ.parseDate(list[i]) - CJ.parseDate(list[i - 1])) / 86400000);
        if (g < need) bad.push(`${it.name} on ${k.split('|')[1]}: ${g}d < ${need}d`);
      }
    });
    return bad;
  });
  console.log('per-platform spacing violations:', spacing.length ? '✗ ' + spacing.slice(0, 4).join(' | ') : 'none ✓');

  const crossOk = await page.evaluate(() => CJ.getIdeas().some(i => {
    const ds = i.drops || [];
    if (ds.length < 2) return false;
    const span = Math.abs(Math.round((CJ.parseDate(ds[ds.length - 1].date) - CJ.parseDate(ds[0].date)) / 86400000));
    return span > 0 && span <= 10 && ds[0].itemIds.length > 0;
  }));
  console.log('same places run across platforms within a week:', ok(crossOk));

  /* ---------- 8. no invented line-ups ---------- */
  const mismatch = await page.evaluate(() => {
    const hoods = CJ.allNeighborhoods().map(h => h.toLowerCase());
    const bad = [];
    CJ.getIdeas().forEach(i => {
      const t = (i.title || '').toLowerCase();
      const named = hoods.filter(h => h.length > 3 && t.indexOf(h) !== -1);
      if (!named.length) return;
      ((i.drops[0] || {}).itemIds || []).forEach(id => {
        const it = CJ.getItem(id);
        if (it && it.neighborhood && named.indexOf(it.neighborhood.toLowerCase()) === -1) {
          bad.push(`${i.title} -> ${it.name} (${it.neighborhood})`);
        }
      });
    });
    return bad;
  });
  console.log('neighborhood mismatches:', mismatch.length ? '✗ ' + mismatch.slice(0, 3).join(' | ') : 'none ✓');

  /* ---------- 9. per-drop plan survives refresh ---------- */
  const target = await page.evaluate(() => {
    const e = CJ.getDrops().find(x => x.drop.status === 'suggested' && x.idea.drops.length > 1);
    CJ.updateDrop(e.drop.id, { status: 'planned', pinned: true });
    const sib = e.idea.drops.find(d => d.id !== e.drop.id);
    return { planned: e.drop.id, date: e.drop.date, sibling: sib ? sib.id : null };
  });
  await page.click('#btn-refresh');
  await page.waitForTimeout(1600);
  const after = await page.evaluate(t => {
    const f = CJ.getDrop(t.planned);
    const s = t.sibling ? CJ.getDrop(t.sibling) : null;
    return { status: f ? f.drop.status : 'GONE', date: f ? f.drop.date : null, siblingAlive: !!s };
  }, target);
  console.log('planned drop survived refresh:', ok(after.status === 'planned' && after.date === target.date));
  console.log('its sibling platforms preserved too:', ok(after.siblingAlive));

  /* ---------- 10. per-drop reschedule ---------- */
  const rid = await page.evaluate(() => CJ.getDrops().find(x => x.drop.status === 'suggested').drop.id);
  const before = await page.evaluate(id => CJ.getDrop(id).drop.date, rid);
  await page.evaluate(id => CJ.calendarUI.openReschedule(id), rid);
  await page.waitForTimeout(400);
  console.log('reschedule modal:', ok(await page.locator('#reschedule-modal').isVisible()));
  await page.locator('#reschedule-quick button', { hasText: '+1 week' }).click();
  await page.waitForTimeout(300);
  const proposed = await page.inputValue('#reschedule-date');
  await page.click('#reschedule-save');
  await page.waitForTimeout(600);
  const moved = await page.evaluate(id => CJ.getDrop(id).drop, rid);
  console.log('moved one platform only:', ok(moved.date === proposed && moved.date !== before), `${before} -> ${moved.date}`);
  await page.screenshot({ path: '/tmp/cj-shot-reschedule.png' });

  /* ---------- 11. toggles ---------- */
  const total = await page.locator('.idea-card').count();
  await page.locator('#cal-platform-toggles .chip', { hasText: 'Pinterest' }).click();
  await page.waitForTimeout(400);
  const noPin = await page.locator('.idea-card').count();
  console.log('platform toggle filters:', ok(noPin < total), `${total} -> ${noPin}`);
  await page.locator('#cal-platform-toggles .chip', { hasText: 'Pinterest' }).click();
  await page.waitForTimeout(300);

  /* ---------- 12. posting logs per platform + per layer ---------- */
  const logged = await page.evaluate(() => {
    const e = CJ.getDrops().find(x => x.drop.itemIds.length && x.drop.status !== 'done');
    const itemId = e.drop.itemIds[0];
    const platform = e.drop.platform;
    const beforeCount = CJ.postCountOn(CJ.getItem(itemId), platform);
    CJ.markPosted(itemId, { platform, layerId: (e.drop.layerByItem || {})[itemId], date: CJ.todayISO() });
    const it = CJ.getItem(itemId);
    return {
      bumped: CJ.postCountOn(it, platform) === beforeCount + 1,
      layerBumped: it.layers.some(l => l.lastPosted === CJ.todayISO())
    };
  });
  console.log('marking posted logs per platform:', ok(logged.bumped), '| layer logged:', ok(logged.layerBumped));

  /* ---------- 13. events ---------- */
  await page.click('#tabs .tab[data-view="events"]');
  await page.waitForTimeout(300);
  await page.click('#btn-add-event');
  await page.fill('#e-name', 'My friend opens her bakery');
  const ed = new Date(); ed.setDate(ed.getDate() + 40);
  await page.fill('#e-date', ed.toISOString().slice(0, 10));
  await page.fill('#e-tags', 'coffee, bakery, morning');
  await page.click('#event-form button[type="submit"]');
  await page.waitForTimeout(500);
  await page.click('#tabs .tab[data-view="calendar"]');
  await page.click('#btn-refresh');
  await page.waitForTimeout(1600);
  console.log('custom event on calendar:', ok(await page.locator('.idea-title button', { hasText: 'My friend opens her bakery' }).count() > 0));

  /* ---------- 14. backup + reload ---------- */
  await page.click('#tabs .tab[data-view="settings"]');
  await page.click('#btn-export');
  await page.waitForTimeout(400);
  const backup = await page.inputValue('#text-modal-area');
  const parsed = (() => { try { return JSON.parse(backup).items.every(i => Array.isArray(i.layers)); } catch (e) { return false; } })();
  console.log('backup includes layers:', ok(parsed));
  await page.click('#text-modal-close');

  await page.evaluate(() => { location.hash = 'library'; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  console.log('after reload:', await page.locator('#library-count').textContent());
  console.log('layers survived reload:', ok(await page.evaluate(() => CJ.getItems().every(i => i.layers.length >= 1))));

  /* ---------- 15. mobile ---------- */
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mob.route('**/api.open-meteo.com/**', r => r.abort());
  await mob.goto('http://localhost:8899/index.html', { waitUntil: 'domcontentloaded' });
  await mob.waitForTimeout(600);
  console.log('mobile horizontal overflow:', ok(!(await mob.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1))));
  await mob.screenshot({ path: '/tmp/cj-shot-mobile.png' });

  console.log('\n--- errors ---');
  console.log(errors.length ? errors.join('\n') : 'none');

  await browser.close();
  server.close();
})();
