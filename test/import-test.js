/**
 * Quick add / bulk import tests.
 *
 *   node test/import-test.js
 *
 * Run this after ANY change to src/import.js. The parser is lenient by design,
 * and lenient parsers drift: the assertions here pin down the three shapes it
 * has to recognise and, just as importantly, the things it must NOT do —
 * swallow trailing commentary as notes, overwrite existing notes on a merge,
 * or silently drop a date it couldn't read.
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
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
  res.end(fs.readFileSync(file));
});

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ FAIL ' + label + (extra ? '\n        ' + JSON.stringify(extra) : '')); }
}

(async () => {
  await new Promise(r => server.listen(8901, r));
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.route('**/api.open-meteo.com/**', r => r.abort());
  await page.goto('http://localhost:8901/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.evaluate(() => { localStorage.clear(); CJ.wipe(); });

  /* ---------------------------------------------------------- 1. blocks -- */
  console.log('\n1. Block format — a written-up entry pasted straight in');

  const blocks = await page.evaluate(() => {
    const text = [
      '**Le Bon Nosh**',
      '',
      '**Name:** Le Bon Nosh',
      '**Type:** Restaurant',
      '**Neighborhood:** Buckhead',
      '**Tags:** french, coffee, Wine Bar, brunch',
      '**Notes:** French-influenced restaurant, market and wine bar.',
      'Counter service by day, full service at night.',
      '**Platforms:** instagram, pinterest',
      '',
      'Name: Ladybird Grove & Mess Hall',
      'Neighborhood: Old Fourth Ward',
      'Tags: patio, beltline, group friendly',
      'Notes: Big shaded patio on the Beltline.',
      'Footage: Golden hour patio b-roll',
      'Last posted: 6/14',
      '',
      '---',
      '',
      'Two things worth flagging: the daypart split is unusual here.',
      'You should probably add a third Buckhead spot.'
    ].join('\n');
    return CJ.importer.parse(text, {});
  });

  check('detects block mode', blocks.mode === 'blocks', blocks.mode);
  check('finds exactly 2 places (commentary after --- is dropped)', blocks.records.length === 2,
        blocks.records.map(r => r.name));
  const lbn = blocks.records[0], lady = blocks.records[1];
  check('strips markdown from the name', lbn.name === 'Le Bon Nosh', lbn.name);
  check('reads the explicit type', lbn.type === 'restaurant' && !lbn.typeGuessed);
  check('reads the neighborhood', lbn.neighborhood === 'Buckhead');
  check('reads 4 tags', lbn.tags.length === 4, lbn.tags);
  check('unkeyed line continues the notes', /full service at night/.test(lbn.notes), lbn.notes);
  check('Platforms: names two → third goes to no',
        lbn.platformFit && lbn.platformFit.instagram === 'yes' && lbn.platformFit.pinterest === 'yes'
        && lbn.platformFit.tiktok === 'no', lbn.platformFit);
  check('ampersand survives in the name', lady.name === 'Ladybird Grove & Mess Hall', lady.name);
  check('Footage: becomes the clip label', lady.footage === 'Golden hour patio b-roll', lady.footage);
  check('"6/14" reads as a past date', /^\d{4}-06-14$/.test(lady.lastPosted || ''), lady.lastPosted);
  check('a last-posted date implies one use', lady.postCount === 1, lady.postCount);
  check('type is guessed when not stated', lady.type === 'restaurant' && lady.typeGuessed === true,
        [lady.type, lady.typeGuessed]);

  /* ----------------------------------------------------------- 2. table -- */
  console.log('\n2. One place per line');

  const table = await page.evaluate(() => CJ.importer.parse(
    'Bacchanalia | Westside | date night, tasting menu | Fine dining, book ahead\n' +
    'Ponce City Market | Old Fourth Ward | food hall, rooftop, group friendly\n',
    {}));
  check('detects table mode', table.mode === 'table', table.mode);
  check('two rows', table.records.length === 2);
  check('positional columns map to name/hood/tags/notes',
        table.records[0].name === 'Bacchanalia' &&
        table.records[0].neighborhood === 'Westside' &&
        table.records[0].tags.length === 2 &&
        /book ahead/.test(table.records[0].notes), table.records[0]);

  const tabbed = await page.evaluate(() => CJ.importer.parse(
    'Name\tNeighborhood\tType\tTags\n' +
    'Piedmont Park\tMidtown\texperience\tskyline, walk\n' +
    'Krog Street Market\tInman Park\trestaurant\tfood hall\n', {}));
  check('spreadsheet paste: header row is used, not imported',
        tabbed.records.length === 2 && tabbed.records[0].name === 'Piedmont Park', tabbed.records.map(r => r.name));
  check('header maps the type column', tabbed.records[0].type === 'experience', tabbed.records[0].type);

  /* ----------------------------------------------------------- 3. names -- */
  console.log('\n3. Just a list of names');

  const names = await page.evaluate(() => CJ.importer.parse(
    '- Fox Bros Bar-B-Q\n' +
    '2. Krog Street Market\n' +
    'Bacchanalia — Westside\n' +
    'Miller Union (Westside)\n', {}));
  check('detects name mode', names.mode === 'names', names.mode);
  check('four names, bullets and numbering stripped',
        names.records.length === 4 && names.records[0].name === 'Fox Bros Bar-B-Q', names.records.map(r => r.name));
  check('em-dash suffix reads as the neighborhood',
        names.records[2].name === 'Bacchanalia' && names.records[2].neighborhood === 'Westside', names.records[2]);
  check('bracket suffix reads as the neighborhood',
        names.records[3].name === 'Miller Union' && names.records[3].neighborhood === 'Westside', names.records[3]);

  /* ----------------------------------------------------------- 4. dates -- */
  console.log('\n4. Dates people actually type');

  const dates = await page.evaluate(() => {
    const p = CJ.importer.parseLooseDate;
    const yr = new Date().getFullYear();
    return {
      iso: p('2026-09-12', 'past'),
      slash: p('9/12/2026', 'past'),
      short: p('9/12/26', 'past'),
      words: p('Sept 12, 2026', 'past'),
      dayFirst: p('12 Sep 2026', 'past'),
      ordinal: p('Sep 12th, 2026', 'past'),
      junk: p('sometime last spring', 'past'),
      empty: p('', 'past'),
      yr
    };
  });
  check('ISO', dates.iso === '2026-09-12', dates.iso);
  check('9/12/2026', dates.slash === '2026-09-12', dates.slash);
  check('two-digit year', dates.short === '2026-09-12', dates.short);
  check('"Sept 12, 2026"', dates.words === '2026-09-12', dates.words);
  check('"12 Sep 2026"', dates.dayFirst === '2026-09-12', dates.dayFirst);
  check('"Sep 12th, 2026"', dates.ordinal === '2026-09-12', dates.ordinal);
  check('unreadable date returns null rather than guessing', dates.junk === null, dates.junk);
  check('empty is null', dates.empty === null);

  const warned = await page.evaluate(() => CJ.importer.parse(
    'Name: Somewhere\nLast posted: sometime last spring\n', {}));
  check('an unreadable date is FLAGGED, not silently dropped',
        warned.records[0].lastPosted === null && warned.records[0].warnings.length === 1,
        warned.records[0].warnings);

  /* ------------------------------------------------------------ 5. plan -- */
  console.log('\n5. Duplicate detection');

  await page.evaluate(() => {
    CJ.wipe();
    CJ.upsertItem({ name: 'Ladybird Grove & Mess Hall', neighborhood: 'Old Fourth Ward',
                    tags: ['patio'], notes: 'Existing note.' });
  });

  const planned = await page.evaluate(() => {
    const parsed = CJ.importer.parse(
      'Name: ladybird grove and mess hall\n' +
      'Neighborhood: Old Fourth Ward\n' +
      'Tags: patio, beltline\n' +
      'Notes: A different note.\n' +
      '\n' +
      'Name: Somewhere New\n' +
      'Neighborhood: Westside\n' +
      '\n' +
      'Name: Somewhere New\n' +
      'Neighborhood: Westside\n', {});
    return CJ.importer.plan(parsed.records, { onDuplicate: 'merge' }).map(r => ({ n: r.rec.name, s: r.status, note: r.note }));
  });
  check('case and punctuation differences still match an existing place',
        planned[0].s === 'merge', planned[0]);
  check('merge note says what it would add', /new tag/.test(planned[0].note), planned[0].note);
  check('a genuinely new place is new', planned[1].s === 'new', planned[1]);
  check('the same place twice in one paste is caught',
        planned[2].s === 'duplicate-in-paste', planned[2]);

  const skipPlan = await page.evaluate(() => {
    const parsed = CJ.importer.parse('Name: Ladybird Grove & Mess Hall\nNeighborhood: Old Fourth Ward\n', {});
    return CJ.importer.plan(parsed.records, { onDuplicate: 'skip' })[0].status;
  });
  check('"leave it alone" skips', skipPlan === 'skip', skipPlan);

  /* ----------------------------------------------------------- 6. apply -- */
  console.log('\n6. Applying it');

  const applied = await page.evaluate(() => {
    CJ.wipe();
    const parsed = CJ.importer.parse(
      'Name: Le Bon Nosh\nNeighborhood: Buckhead\nTags: french, Coffee\nNotes: Wine bar.\nPlatforms: instagram, pinterest\n' +
      '\nName: Piedmont Park\nNeighborhood: Midtown\nType: Experience\nTags: skyline, walk\n', {});
    const rows = CJ.importer.plan(parsed.records, { onDuplicate: 'merge' });
    const res = CJ.importer.apply(rows);
    const items = CJ.getItems();
    return {
      res,
      count: items.length,
      allHaveALayer: items.every(i => Array.isArray(i.layers) && i.layers.length >= 1),
      fit: (items.find(i => i.name === 'Le Bon Nosh') || {}).platformFit,
      type: (items.find(i => i.name === 'Piedmont Park') || {}).type
    };
  });
  check('both added', applied.res.added === 2 && applied.count === 2, applied.res);
  check('every imported place gets a layer', applied.allHaveALayer);
  check('platform fit survives the write',
        applied.fit && applied.fit.tiktok === 'no' && applied.fit.instagram === 'yes', applied.fit);
  check('explicit type survives the write', applied.type === 'experience', applied.type);

  const merged = await page.evaluate(() => {
    // Re-paste one of them with a new tag and different notes.
    const parsed = CJ.importer.parse(
      'Name: Le Bon Nosh\nNeighborhood: Buckhead\nTags: coffee, pastries\nNotes: Second visit, pastry case.\n', {});
    const res = CJ.importer.apply(CJ.importer.plan(parsed.records, { onDuplicate: 'merge' }));
    const it = CJ.getItems().find(i => i.name === 'Le Bon Nosh');
    return { res, count: CJ.getItems().length, tags: it.tags, notes: it.notes, layers: it.layers.length,
             layerNotes: it.layers.map(l => l.notes) };
  });
  check('merging does not create a second place', merged.count === 2, merged.count);
  check('merge counted as an update', merged.res.merged === 1 && merged.res.added === 0, merged.res);
  check('new tag folded in, no duplicate casing',
        merged.tags.filter(t => /coffee/i.test(t)).length === 1 && merged.tags.some(t => /pastries/i.test(t)),
        merged.tags);
  check('EXISTING NOTES ARE NOT OVERWRITTEN', merged.notes === 'Wine bar.', merged.notes);
  check('new notes stack as another layer',
        merged.layers === 2 && merged.layerNotes.some(n => /pastry case/.test(n)), merged.layerNotes);

  /* ------------------------------------------------------------ 7. tags -- */
  console.log('\n7. Tag casing folds on import');

  const casing = await page.evaluate(() => {
    CJ.wipe();
    CJ.upsertItem({ name: 'Anchor', tags: ['group friendly'] });
    const parsed = CJ.importer.parse('Name: Somewhere Else\nTags: Group Friendly, PATIO\n', {});
    CJ.importer.apply(CJ.importer.plan(parsed.records, {}));
    return CJ.allTags().map(t => t.tag || t);
  });
  check('"Group Friendly" folds onto the existing "group friendly"',
        casing.filter(t => /group friendly/i.test(t)).length === 1, casing);

  /* ------------------------------------------------------------ 8. undo -- */
  console.log('\n8. Undo');

  const undone = await page.evaluate(() => {
    CJ.wipe();
    CJ.upsertItem({ name: 'Keep Me', tags: ['x'] });
    const parsed = CJ.importer.parse('Name: One\n\nName: Two\n\nName: Keep Me\nTags: y\n', {});
    const res = CJ.importer.apply(CJ.importer.plan(parsed.records, { onDuplicate: 'merge' }));
    const before = CJ.getItems().length;
    CJ.importer.undo(res.newIds);
    return { before, after: CJ.getItems().length, names: CJ.getItems().map(i => i.name), res };
  });
  check('undo removes only what the import created',
        undone.after === 1 && undone.names[0] === 'Keep Me', undone);

  /* ------------------------------------------------------------- 9. UI --- */
  console.log('\n9. The modal itself');

  await page.evaluate(() => { CJ.wipe(); });
  await page.click('#btn-quick-add');
  await page.waitForTimeout(200);
  check('modal opens', await page.isVisible('#imp-text'));
  check('button starts disabled', await page.locator('#imp-go').isDisabled());

  await page.fill('#imp-text', 'Fox Bros Bar-B-Q\nKrog Street Market\nPiedmont Park');
  await page.waitForTimeout(320);
  const rows = await page.locator('.import-row').count();
  check('live preview shows 3 rows', rows === 3, rows);
  check('button label counts them', /Add 3/.test(await page.locator('#imp-go').textContent()),
        await page.locator('#imp-go').textContent());

  await page.click('#imp-go');
  await page.waitForTimeout(300);
  check('result panel appears', await page.isVisible('#imp-result'));
  check('3 places landed in the library', await page.evaluate(() => CJ.getItems().length) === 3);
  check('undo button offered', await page.locator('#imp-result .btn-danger-ghost').count() === 1);

  // Playwright auto-dismisses confirm() to false, so say yes explicitly.
  page.on('dialog', d => d.accept());
  await page.click('#imp-result .btn-danger-ghost');
  await page.waitForTimeout(300);
  check('undo from the result panel empties the library again',
        await page.evaluate(() => CJ.getItems().length) === 0);
  check('undo closes the modal', await page.locator('#import-modal').isHidden());

  /* --------------------------------------------------------- 10. mobile -- */
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mob.route('**/api.open-meteo.com/**', r => r.abort());
  await mob.goto('http://localhost:8901/index.html', { waitUntil: 'domcontentloaded' });
  await mob.waitForTimeout(500);
  await mob.click('#btn-quick-add');
  await mob.waitForTimeout(250);
  console.log('\n10. Mobile');
  check('no horizontal overflow with the modal open',
        !(await mob.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  await mob.screenshot({ path: '/tmp/cj-import-mobile.png' });

  await page.screenshot({ path: '/tmp/cj-import.png', fullPage: true });

  console.log('\n' + '='.repeat(46));
  console.log(pass + ' passed, ' + fail + ' failed');
  if (errors.length) console.log('\nJS errors:\n' + errors.join('\n'));
  console.log('shots: /tmp/cj-import.png, /tmp/cj-import-mobile.png');

  await browser.close();
  server.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
