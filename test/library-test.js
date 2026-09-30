/**
 * Library view + tag input tests.
 *
 *   node test/library-test.js
 *
 * The tag assertions exist because of a real bug: the tag box used to live
 * inside a <label>, and a label forwards clicks to its first labelable
 * descendant — which, once a chip existed, was that chip's ✕ remove button.
 * Adding a 4th tag silently deleted the 1st. Never wrap that widget in a label.
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
const chips = p => p.evaluate(() => [...document.querySelectorAll('#f-tag-chips .tag-chip')].map(c => c.textContent.replace('✕', '')));

(async () => {
  await new Promise(r => server.listen(8903, r));
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_/.test(m.text())) errors.push('CONSOLE: ' + m.text()); });
  await page.route('**/api.open-meteo.com/**', r => r.abort());
  await page.route('**/fonts.googleapis.com/**', r => r.abort());
  await page.goto('http://localhost:8903/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  // Platform-lane assertions below assume every platform is on.
  await page.evaluate(() => { CJ.wipe(); CJ.updateSettings({ postsPerWeek: null }); CJ.settingsUI.seed(); });
  await page.waitForTimeout(700);
  await page.evaluate(() => CJ.app.showView('library'));
  await page.waitForTimeout(400);

  /* ------------------------------------------------ 1. the tag regression -- */
  console.log('\n1. Tag input — the label-forwarding bug');

  check('the tag box is NOT inside a <label>',
        await page.evaluate(() => !document.querySelector('#tag-input-wrap').closest('label')));

  await page.evaluate(() => CJ.library.openForm());
  await page.waitForTimeout(250);
  await page.fill('#f-name', 'Tag Test');

  for (const t of ['patio', 'date night', 'group friendly', 'dog friendly', 'beltline', 'brunch']) {
    await page.click('#f-tag-entry');
    await page.type('#f-tag-entry', t, { delay: 8 });
    await page.press('#f-tag-entry', 'Enter');
    await page.waitForTimeout(60);
  }
  check('typing 6 tags gives 6 chips', (await chips(page)).length === 6, await chips(page));

  // Clicking the box itself used to delete the first chip.
  const before = await chips(page);
  await page.click('#tag-input-wrap', { position: { x: 5, y: 5 } });
  await page.waitForTimeout(120);
  check('clicking the tag box does NOT delete a tag',
        JSON.stringify(await chips(page)) === JSON.stringify(before), await chips(page));

  // Clicking a suggestion used to delete the first chip too.
  const n0 = (await chips(page)).length;
  if (await page.locator('#tag-suggest .tag').count()) {
    await page.locator('#tag-suggest .tag').first().click();
    await page.waitForTimeout(140);
    check('clicking a suggestion ADDS one and deletes none',
          (await chips(page)).length === n0 + 1, await chips(page));
  }

  const n1 = (await chips(page)).length;
  await page.click('#f-tag-entry');
  await page.type('#f-tag-entry', 'rooftop, cocktails; skyline', { delay: 6 });
  await page.click('#f-tag-add');
  await page.waitForTimeout(140);
  check('the + button commits, and splits a comma list into 3',
        (await chips(page)).length === n1 + 3, await chips(page));

  const n2 = (await chips(page)).length;
  await page.click('#f-tag-entry');
  await page.type('#f-tag-entry', 'blurred out', { delay: 6 });
  await page.click('#f-name');
  await page.waitForTimeout(300);
  check('tapping away keeps what was typed', (await chips(page)).length === n2 + 1, await chips(page));

  await page.click('#f-tag-entry');
  await page.type('#f-tag-entry', 'PATIO', { delay: 6 });
  await page.press('#f-tag-entry', 'Enter');
  await page.waitForTimeout(120);
  check('a differently-cased repeat is not added twice', (await chips(page)).length === n2 + 1);

  const expect = await chips(page);
  await page.click('#btn-save');
  await page.waitForTimeout(350);
  // Saving a brand-new place pops the "what footage do you have?" prompt.
  if (await page.locator('#layer-modal').isVisible()) {
    await page.click('#layer-close');
    await page.waitForTimeout(200);
  }
  const saved = await page.evaluate(() => (CJ.getItems().find(i => i.name === 'Tag Test') || {}).tags);
  check('every chip survives the save', JSON.stringify(saved) === JSON.stringify(expect), { saved, expect });

  await page.evaluate(() => {
    const it = CJ.getItems().find(i => i.name === 'Tag Test');
    CJ.library.openForm(it.id);
  });
  await page.waitForTimeout(250);
  const reopened = await chips(page);
  check('and they are all there on reopen', reopened.length === expect.length, reopened);
  await page.locator('#f-tag-chips .tag-chip button').first().click();
  await page.waitForTimeout(120);
  check('the ✕ still removes exactly one', (await chips(page)).length === expect.length - 1);
  await page.click('#btn-cancel');
  await page.waitForTimeout(200);

  /* --------------------------------------------------- 2. the row layout -- */
  console.log('\n2. Compact rows');

  check('rows is the default view', await page.evaluate(() => CJ.settings().libraryView) === 'rows');
  const rows = await page.locator('.lib-row').count();
  check('every place gets a row', rows === await page.evaluate(() => CJ.getItems().length), rows);

  const h = await page.evaluate(() => {
    const r = document.querySelector('.lib-row');
    return Math.round(r.getBoundingClientRect().height);
  });
  check('a row is under 70px tall (cards were ~180)', h < 70, h);

  check('platform dots use letters, not emoji',
        await page.evaluate(() => [...document.querySelectorAll('.lib-row .pdot')].slice(0, 3).map(d => d.textContent).join('')) === 'TIP');

  // An experience should be off Instagram under her default lanes.
  const dots = await page.evaluate(() => {
    const it = CJ.getItems().find(i => i.type === 'experience' && !i.photosOnly);
    const row = [...document.querySelectorAll('.lib-row')].find(r => r.querySelector('.row-title').textContent === it.name);
    return [...row.querySelectorAll('.pdot')].map(d => ({ t: d.textContent, off: d.className.includes('is-off') }));
  });
  check('an experience shows Instagram dimmed, TikTok lit',
        dots.find(d => d.t === 'I').off === true && dots.find(d => d.t === 'T').off === false, dots);

  await page.locator('.lib-row .row-clips').first().click();
  await page.waitForTimeout(250);
  check('clicking the clip count opens a detail panel', await page.locator('.row-detail').count() === 1);
  await page.locator('.lib-row .row-clips').first().click();
  await page.waitForTimeout(250);
  check('and closes it again', await page.locator('.row-detail').count() === 0);

  /* ------------------------------------------------------ 3. one bar/pops -- */
  console.log('\n3. One filter bar');

  check('the library has exactly one filter bar',
        await page.locator('#view-library .filterbar').count() === 1,
        await page.locator('#view-library .filterbar').count());
  check('the tag list lives in a popover, not loose in the bar',
        await page.evaluate(() => !!document.querySelector('#tag-filters').closest('.pop-panel')));

  await page.click('#fpop-tags .fbtn');
  await page.waitForTimeout(200);
  check('the tags popover opens', await page.isVisible('#tag-filters'));
  const allTagCount = await page.evaluate(() => CJ.allTags(true).length);
  check('it lists every tag, not a truncated subset',
        await page.locator('#tag-filters .tag').count() === allTagCount, allTagCount);

  await page.fill('#tag-search', 'patio');
  await page.waitForTimeout(200);
  const filtered = await page.locator('#tag-filters .tag').count();
  check('the search box narrows it', filtered > 0 && filtered < allTagCount, filtered);

  await page.fill('#tag-search', '');
  await page.waitForTimeout(150);
  await page.locator('#tag-filters .tag', { hasText: 'patio' }).first().click();
  await page.waitForTimeout(250);
  check('picking a tag filters the list',
        await page.locator('.lib-row').count() < rows);
  check('the popover stays open for a second pick', await page.isVisible('#tag-filters'));
  check('the button shows a count badge', await page.isVisible('#fpop-tags .fbtn-n'));
  check('an active-filter chip appears', await page.locator('.af-chip').count() >= 1);

  await page.locator('.af-chip').first().click();
  await page.waitForTimeout(250);
  check('removing that chip restores the full list', await page.locator('.lib-row').count() === rows);
  check('the active filter row hides itself when empty', await page.locator('#active-filters').isHidden());

  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check('Escape closes the popover', await page.locator('#fpop-tags .pop-panel').isHidden());

  /* --------------------------------------------------------- 4. the toggle -- */
  console.log('\n4. Rows / cards toggle');

  await page.click('#lib-view button[data-mode="cards"]');
  await page.waitForTimeout(300);
  check('switching to cards renders cards', await page.locator('.item-card').count() === rows);
  check('the choice is stored in settings (so it syncs)',
        await page.evaluate(() => CJ.settings().libraryView) === 'cards');

  const stripCount = await page.locator('.item-card .layer-strip').count();
  const multi = await page.evaluate(() => CJ.getItems().filter(i =>
    i.layers.length > 1 || i.layers.some(l => l.deadline)).length);
  check('the footage strip only shows where it says something new',
        stripCount === multi && stripCount < rows, { stripCount, multi, rows });

  await page.click('#lib-view button[data-mode="rows"]');
  await page.waitForTimeout(300);
  check('and back to rows', await page.locator('.lib-row').count() === rows);

  await page.screenshot({ path: '/tmp/cj-library.png' });

  /* --------------------------------------------------------- 5. mobile ----- */
  console.log('\n5. Mobile');
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mob.route('**/api.open-meteo.com/**', r => r.abort());
  await mob.route('**/fonts.googleapis.com/**', r => r.abort());
  await mob.goto('http://localhost:8903/index.html', { waitUntil: 'domcontentloaded' });
  await mob.waitForTimeout(600);
  await mob.evaluate(() => CJ.app.showView('library'));
  await mob.waitForTimeout(400);
  check('no horizontal overflow',
        !(await mob.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  await mob.click('#fpop-tags .fbtn');
  await mob.waitForTimeout(250);
  check('the tag popover fits the screen',
        !(await mob.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  await mob.screenshot({ path: '/tmp/cj-library-mobile.png' });

  console.log('\n' + '='.repeat(46));
  console.log(pass + ' passed, ' + fail + ' failed');
  if (errors.length) console.log('\nJS errors:\n' + errors.join('\n'));
  console.log('shots: /tmp/cj-library.png, /tmp/cj-library-mobile.png');
  await browser.close();
  server.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
