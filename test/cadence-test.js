/**
 * v2.2: posting cadence, readiness and websites.
 *
 *   npm install playwright
 *   node test/cadence-test.js
 *
 * Covers: Instagram-only 5-a-week default, weekly slots, seasonal windows
 * (place and clip), "not enough" notes and the hold override, the "enough for
 * its own post" and "photos only" boxes, capacity honesty, exact event areas,
 * Quick add flags, the form's hold box, and Read website (against a mocked
 * API: request shape, suggestions, scheduling, survival across refresh).
 *
 * Run after any change to generator.js, the readiness/season/cadence helpers
 * in state.js, ui-plan.js, ui-website.js or ai.js.
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
  else { failed++; console.log('  ✗ FAIL ' + label + (extra != null ? ' — ' + extra : '')); }
}

(async () => {
  await new Promise(r => server.listen(8894, r));
  const launchOpts = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  // Pin "today" so the seasonal windows are exercised the same way every run.
  await page.clock.setFixedTime(new Date(new Date().getFullYear() + '-09-29T12:00:00'));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api.open-meteo.com/**', r => r.abort());

  let sentBody = null;
  await page.route('**/api.anthropic.com/**', async r => {
    sentBody = JSON.parse(r.request().postData());
    const payload = {
      summary: 'Bistro in Inman Park known for wood-fired chicken and a shaded patio.',
      neighborhood: 'Inman Park',
      tags: [{ tag: 'wood fired', why: 'menu' }, { tag: 'Brunch', why: 'weekend brunch' }, { tag: 'patio', why: 'already has it' }],
      facts: { hours: 'Tue-Sun 5-10', reservations: 'Resy', price: '$$', happyHour: '', parking: '' },
      ideas: [
        { title: 'The wood-fired chicken', angle: 'Signature dish', hook: 'Order the chicken. Don\'t share it.', months: [], format: 'reel' },
        { title: 'Halloween costume brunch', angle: 'Yearly party', hook: 'Brunch, but in costume', months: [10], format: 'carousel' }
      ]
    };
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [
      { type: 'server_tool_use', id: 's1', name: 'web_fetch', input: { url: 'https://example-bistro.com' } },
      { type: 'web_fetch_tool_result', tool_use_id: 's1', content: { type: 'web_fetch_result', url: 'https://example-bistro.com', content: { type: 'document', source: { type: 'text', media_type: 'text/plain', data: '…' } } } },
      { type: 'text', text: 'Here you go:\n```json\n' + JSON.stringify(payload) + '\n```' }
    ] }) });
  });

  await page.goto('http://localhost:8894/index.html');
  await page.waitForTimeout(500);

  console.log('--- defaults ---');
  const def = await page.evaluate(() => CJ.settings().postsPerWeek);
  check('default is 5 Instagram posts a week, TikTok and Pinterest paused',
    def.instagram === 5 && def.tiktok === 0 && def.pinterest === 0, JSON.stringify(def));

  await page.evaluate(() => { CJ.settingsUI.seed(); });
  await page.waitForTimeout(1200);

  const setup = await page.evaluate(() => {
    const add = d => CJ.upsertItem(Object.assign({ type: 'restaurant', neighborhood: 'Midtown', tags: ['date night', 'cocktails'] }, d));
    const spooky = add({ name: 'Spooky Sips', tags: ['halloween', 'cocktails', 'date night'], solo: true });
    const held = add({ name: 'Half Shot Bakery', notes: 'Not enough footage for a full post, go back in Nov', solo: true });
    const heldOk = add({ name: 'Override Cafe', notes: 'only have 2 clips but they are great', solo: true, hold: false });
    const manual = add({ name: 'Manual Hold Bar', solo: true, hold: true });
    const photos = add({ name: 'Photo Only Deli', photosOnly: true, solo: true });
    const notSolo = add({ name: 'Group Only Grill', solo: false, tags: ['zzz-unique-tag'] });
    const winter = add({ name: 'Two Season Tavern', solo: true });
    CJ.updateLayer(winter.id, winter.layers[0].id, { label: 'Fire pit night, winter' });
    const due = new Date(); due.setDate(due.getDate() + 20);
    const heldDeadline = add({ name: 'Paid Deal Held', notes: 'need to reshoot the dessert', solo: true });
    CJ.updateLayer(heldDeadline.id, heldDeadline.layers[0].id, { deadline: CJ.isoDate(due), deadlineNote: 'Brand deal' });
    return { spooky: spooky.id, held: held.id, heldOk: heldOk.id, manual: manual.id, photos: photos.id, notSolo: notSolo.id, winter: winter.id, heldDeadline: heldDeadline.id };
  });

  const res = await page.evaluate(() => {
    const r = CJ.generator.refresh({ months: 6 });
    return { stats: r.stats };
  });
  const drops = await page.evaluate(() => CJ.getDrops().filter(e => e.drop.status !== 'dismissed').map(e => ({
    id: e.drop.id, p: e.drop.platform, date: e.drop.date, fmt: e.drop.format, items: e.drop.itemIds,
    source: e.idea.source, layers: e.drop.layerByItem
  })));

  console.log('--- cadence ---');
  check('only Instagram posts are planned', drops.length > 0 && drops.every(d => d.p === 'instagram'),
    [...new Set(drops.map(d => d.p))].join(','));
  const slotDays = await page.evaluate(() => CJ.slotDays('instagram'));
  check('five posting days a week', slotDays.length === 5, slotDays.join(','));
  const weekOf = iso => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  const perWeek = {};
  drops.filter(d => d.source !== 'deadline').forEach(d => { perWeek[weekOf(d.date)] = (perWeek[weekOf(d.date)] || 0) + 1; });
  check('never more than 5 Instagram posts in a week', Object.values(perWeek).every(n => n <= 5), JSON.stringify(perWeek));
  check('generated posts only land on posting days',
    drops.filter(d => d.source !== 'deadline').every(d => slotDays.indexOf(new Date(d.date + 'T12:00:00').getDay()) !== -1));
  const days = drops.map(d => d.date);
  check('one Instagram post per day at most (outside deadlines)',
    new Set(drops.filter(d => d.source !== 'deadline').map(d => d.date)).size === drops.filter(d => d.source !== 'deadline').length);
  check('the calendar says how short it came up', typeof res.stats.shortBy === 'number');

  console.log('--- seasons ---');
  const spookyDates = drops.filter(d => d.items.includes(setup.spooky)).map(d => d.date);
  check('Halloween place posts', spookyDates.length > 0);
  check('...only in October', spookyDates.every(d => d.slice(5, 7) === '10'), spookyDates.join(','));
  check('...and in the last three weeks before Halloween', spookyDates.every(d => Number(d.slice(8, 10)) >= 10), spookyDates.join(','));
  const winterClip = await page.evaluate(id => CJ.getItem(id).layers[0].id, setup.winter);
  const winterUses = drops.filter(d => d.items.includes(setup.winter));
  check('a winter-labelled clip only posts in winter',
    winterUses.every(d => ['12', '01', '02'].includes(d.date.slice(5, 7))), winterUses.map(d => d.date).join(','));
  check('Mercier (tagged fall) never posts outside fall',
    await page.evaluate(() => {
      const it = CJ.getItems().find(i => i.name.indexOf('Mercier') === 0);
      return CJ.getDrops().filter(e => e.drop.itemIds.includes(it.id)).every(e => CJ.inWindows(CJ.seasonInfo(it).windows, e.drop.date));
    }));

  console.log('--- readiness ---');
  check('a "not enough footage" note keeps a place out', !drops.some(d => d.items.includes(setup.held) ));
  check('a manual hold keeps a place out', !drops.some(d => d.items.includes(setup.manual)));
  const overrideInfo = await page.evaluate(id => CJ.holdInfo(CJ.getItem(id)), setup.heldOk);
  check('"use anyway" overrides the note', overrideInfo.held === false && overrideInfo.overridden === true);
  const dl = drops.filter(d => d.items.includes(setup.heldDeadline));
  check('a deadline still gets placed even when on hold', dl.length === 1 && dl[0].source === 'deadline');
  check('...with a warning in its blurb', await page.evaluate(id => {
    const i = CJ.getIdeas().find(x => x.source === 'deadline' && x.itemIds.includes(id)); return !!i && i.blurb.indexOf('on hold') !== -1;
  }, setup.heldDeadline));
  const singles = await page.evaluate(() => CJ.getDrops().filter(e => e.drop.itemIds.length === 1 && e.idea.source !== 'deadline')
    .map(e => CJ.getItem(e.drop.itemIds[0])).filter(it => !it.solo).map(it => it.name));
  check('a single-place post always uses a place marked "enough for its own post"', singles.length === 0, singles.join(','));
  check('spotlights happen', (res.stats.spotlight || 0) > 0, res.stats.spotlight);

  console.log('--- photos only ---');
  const photoDrops = await page.evaluate(() => CJ.getDrops().filter(e => e.drop.itemIds.some(id => (CJ.getItem(id) || {}).photosOnly)).map(e => e.drop.platform + ':' + e.drop.format));
  check('photos-only places never go out as a Reel', photoDrops.every(x => x.indexOf(':reel') === -1), photoDrops.join(','));
  await page.evaluate(() => CJ.updateSettings({ postsPerWeek: { instagram: 5, tiktok: 3, pinterest: 0 } }));
  await page.evaluate(() => CJ.generator.refresh({ months: 3 }));
  const tt = await page.evaluate(() => CJ.getDrops().filter(e => e.drop.platform === 'tiktok' && e.drop.itemIds.some(id => CJ.getItem(id).photosOnly)).length);
  check('photos-only places never go on TikTok', tt === 0);
  check('turning TikTok on produces TikTok posts', await page.evaluate(() => CJ.getDrops().some(e => e.drop.platform === 'tiktok')));
  await page.evaluate(() => CJ.updateSettings({ postsPerWeek: { instagram: 5, tiktok: 0, pinterest: 0 } }));
  await page.evaluate(() => CJ.generator.refresh({ months: 3 }));

  console.log('--- capacity ---');
  const cap = await page.evaluate(() => CJ.generator.capacity('instagram'));
  check('capacity counts held and out-of-season places separately', cap.held >= 2 && cap.solo > 0, JSON.stringify(cap));
  await page.click('#tabs .tab[data-view="calendar"]');
  await page.click('#btn-plan');
  await page.waitForTimeout(200);
  const sum = await page.locator('.plan-summary').textContent();
  check('plan builder says what the library can carry', /can carry about [0-9.]+ Instagram post/.test(sum));
  check('plan builder shows TikTok and Pinterest paused', (await page.locator('.ppw-row.is-off').count()) === 2);
  await page.click('#plan-close');

  console.log('--- event areas ---');
  const mismatch = await page.evaluate(() => {
    const bad = [];
    CJ.getIdeas().filter(i => i.occasion && i.occasion.mode === 'in-area' && (i.occasion.area || []).length).forEach(i => {
      i.itemIds.forEach(id => {
        const it = CJ.getItem(id);
        if (!i.occasion.area.some(a => a === (it.neighborhood || '').toLowerCase())) bad.push(i.title + ' → ' + it.name + ' (' + it.neighborhood + ')');
      });
    });
    return bad;
  });
  check('an event guide only uses places in exactly that neighborhood (no West Midtown in a Midtown guide)', mismatch.length === 0, mismatch.slice(0, 3).join(' | '));

  console.log('--- quick add ---');
  const imp = await page.evaluate(() => {
    const recs = CJ.importer.parse('Name: Flag Test Cafe\nNeighborhood: Decatur\nSolo: yes\nPhotos only: y\nHold: maybe\n', {}).records;
    return recs[0];
  });
  check('Quick add reads Solo / Photos only', imp && imp.solo === true && imp.photosOnly === true);
  check('...and flags a yes/no it can\'t read instead of guessing', imp && imp.hold === undefined && imp.warnings.some(w => /yes or no/.test(w)));

  console.log('--- the form ---');
  await page.click('#tabs .tab[data-view="library"]');
  await page.click('#btn-add');
  await page.fill('#f-name', 'Form Test Spot');
  await page.fill('#f-notes', 'Need more b-roll of the bar');
  await page.waitForTimeout(100);
  check('the hold box ticks itself from the notes', await page.isChecked('#f-hold'));
  check('...and says which words it read', (await page.textContent('#f-hold-hint')).indexOf('Need more b-roll') !== -1);
  await page.uncheck('#f-hold');
  await page.check('#f-solo');
  await page.selectOption('#f-season', 'months');
  await page.locator('#f-season-months button', { hasText: 'Dec' }).click();
  await page.click('#btn-save');
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.querySelector('#layer-modal').hidden = true; });
  const saved = await page.evaluate(() => CJ.getItems().find(i => i.name === 'Form Test Spot'));
  check('unticking saves "use anyway"', saved.hold === false);
  check('solo box saves', saved.solo === true);
  check('month choice saves', saved.seasonMode === 'months' && saved.seasonMonths.join() === '12');
  check('the row shows its readiness', await page.evaluate(n => {
    const row = [...document.querySelectorAll('.lib-row')].find(r => r.querySelector('.row-title').textContent === n);
    return !!row && row.textContent.indexOf('★ Solo') !== -1 && row.textContent.indexOf('Dec') !== -1;
  }, 'Form Test Spot'));

  console.log('--- website ---');
  await page.evaluate(() => CJ.updateAISettings({ key: 'sk-ant-test' }));
  await page.evaluate(id => CJ.library.openForm(id), saved.id);
  await page.fill('#f-link', 'https://www.example-bistro.com/menu');
  await page.click('#f-web-read');
  await page.waitForTimeout(500);
  check('asks Claude with the web fetch tool', sentBody && sentBody.tools && sentBody.tools[0].type === 'web_fetch_20260318');
  check('...limited to that restaurant\'s own site', sentBody && sentBody.tools[0].allowed_domains.indexOf('example-bistro.com') !== -1);
  check('...on a current model', sentBody && sentBody.model === 'claude-sonnet-5-5', sentBody && sentBody.model);
  check('...with the link in the message', sentBody && sentBody.messages[0].content.indexOf('https://www.example-bistro.com/menu') !== -1);
  const tagChips = await page.locator('#f-web .web-tag').allTextContents();
  check('suggested tags show, spelled to match existing tags', tagChips.some(t => /wood fired/.test(t)) && tagChips.some(t => /brunch/i.test(t)), tagChips.join('|'));
  await page.locator('#f-web .web-tag', { hasText: 'wood fired' }).click();
  await page.locator('#f-web .web-summary button').click();
  await page.click('#btn-save');
  await page.waitForTimeout(300);
  const after = await page.evaluate(id => CJ.getItem(id), saved.id);
  check('nothing is added without a tap, and the tapped tag is', after.tags.indexOf('wood fired') !== -1 && after.tags.indexOf('Brunch') === -1 && after.tags.indexOf('brunch') === -1);
  check('summary added to notes on request', after.notes.indexOf('wood-fired chicken') !== -1 && after.notes.indexOf('Need more b-roll') === 0);
  check('ideas are kept on the place', after.web && after.web.ideas.length === 2);

  await page.evaluate(id => CJ.journalUI.open(id), saved.id);
  await page.waitForTimeout(150);
  await page.locator('#journal-body .web-ideas li', { hasText: 'Halloween costume brunch' }).locator('button').click();
  await page.waitForTimeout(150);
  const planned = await page.evaluate(id => {
    const it = CJ.getItem(id); const x = it.web.ideas.find(y => y.months.length);
    const idea = CJ.getIdea(x.scheduledIdeaId); return idea && { date: idea.date, status: idea.status, p: idea.drops[0].platform };
  }, saved.id);
  check('a website idea goes on the calendar', !!planned && planned.status === 'planned' && planned.p === 'instagram');
  check('...inside its months, near the holiday', planned && planned.date.slice(5, 7) === '10' && Number(planned.date.slice(8, 10)) >= 10, planned && planned.date);
  const survived = await page.evaluate(id => { CJ.generator.refresh({ months: 3 }); const it = CJ.getItem(id); return !!CJ.getIdea(it.web.ideas.find(y => y.months.length).scheduledIdeaId); }, saved.id);
  check('...and a refresh leaves it where it is', survived);
  const weekCount = await page.evaluate(d => {
    const w = x => { const t = new Date(x + 'T12:00:00'); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
    return CJ.getDrops().filter(e => e.drop.platform === 'instagram' && e.drop.status !== 'dismissed' && e.idea.source !== 'deadline' && w(e.drop.date) === w(d)).length;
  }, planned.date);
  check('...and it counts toward that week\'s 5', weekCount <= 5, weekCount);
  await page.click('#journal-close');

  const oldModel = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem(CJ.STORAGE_KEY));
    raw.settings.ai.model = 'claude-sonnet-5';
    localStorage.setItem(CJ.STORAGE_KEY, JSON.stringify(raw));
    return true;
  });
  await page.reload();
  await page.waitForTimeout(500);
  check('an old saved model id is upgraded on load', oldModel && await page.evaluate(() => CJ.settings().ai.model) === 'claude-sonnet-5-5');

  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
