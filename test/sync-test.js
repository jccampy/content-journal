/**
 * Sync tests against a fake Supabase. Covers the cases that actually lose data:
 * two devices editing the same library, offline queueing, and sign-in adoption.
 */
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

// ---- fake Supabase ----
let row = null;                       // { data, updated_at }
let stamp = 0;
const fakeApi = (req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(obj));
  };
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    const u = req.url;
    if (u.startsWith('/auth/v1/token') || u.startsWith('/auth/v1/signup')) {
      const b = JSON.parse(body || '{}');
      return send(200, {
        access_token: 'tok', refresh_token: 'ref', expires_in: 3600,
        user: { id: 'user-uuid-1', email: b.email || 'julia@example.com' }
      });
    }
    if (u.startsWith('/rest/v1/journals')) {
      const nextStamp = () => { stamp++; return '2026-01-01T00:00:' + String(stamp).padStart(2, '0') + 'Z'; };
      if (req.method === 'GET') return send(200, row ? [row] : []);
      if (req.method === 'POST') {
        if (row) return send(409, { message: 'duplicate key' });     // row already exists
        const b = JSON.parse(body)[0];
        row = { data: b.data, updated_at: nextStamp() };
        return send(201, [row]);
      }
      if (req.method === 'PATCH') {
        // honour the ?updated_at=eq.<stamp> precondition
        const m = /updated_at=eq\.([^&]+)/.exec(u);
        const expected = m ? decodeURIComponent(m[1]) : null;
        if (!row || (expected && row.updated_at !== expected)) return send(200, []);  // version moved
        const b = JSON.parse(body);
        row = { data: b.data, updated_at: nextStamp() };
        return send(200, [row]);
      }
    }
    send(404, { error: 'nope' });
  });
};

const staticSrv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
  res.end(fs.readFileSync(f));
});

const API = 'http://localhost:8896';

async function newDevice(browser, label) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(`[${label} pageerror]`, e.message));
  await page.route('**/api.open-meteo.com/**', r => r.abort());
  await page.goto('http://localhost:8895/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  return { ctx, page };
}

async function connect(page, email) {
  await page.evaluate(async ({ api, email }) => {
    CJ.cloud.saveConfig(api, 'anon-key');
    await CJ.cloud.signIn(email, 'password123');
  }, { api: API, email });
  await page.waitForTimeout(300);
}

(async () => {
  await new Promise(r => staticSrv.listen(8895, r));
  const api = http.createServer(fakeApi);
  await new Promise(r => api.listen(8896, r));

  const launchOpts = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
  const browser = await chromium.launch(launchOpts);

  // ===== Device A: seed a library, connect, push =====
  const A = await newDevice(browser, 'A');
  await A.page.click('#tabs .tab[data-view="settings"]');
  await A.page.click('#btn-seed');
  await A.page.waitForTimeout(800);
  const aCount = await A.page.evaluate(() => CJ.getItems().length);
  console.log('A seeded:', aCount, 'items');

  await connect(A.page, 'julia@example.com');
  await A.page.evaluate(() => CJ.sync.adoptAfterSignIn());
  await A.page.waitForTimeout(2000);
  console.log('A pushed to cloud:', row ? row.data.items.length + ' items' : 'NOTHING');
  console.log('A chip:', await A.page.textContent('#sync-label'));

  // ===== Device B: empty, signs in, should receive everything =====
  const B = await newDevice(browser, 'B');
  const bBefore = await B.page.evaluate(() => CJ.getItems().length);
  await connect(B.page, 'julia@example.com');
  await B.page.evaluate(() => CJ.sync.adoptAfterSignIn());
  await B.page.waitForTimeout(2000);
  const bAfter = await B.page.evaluate(() => CJ.getItems().length);
  console.log(`B: ${bBefore} items before sign-in -> ${bAfter} after  ${bAfter === aCount ? '✓' : '✗ MISMATCH'}`);

  // ===== Concurrent edits: A adds one, B adds a different one =====
  await A.page.evaluate(() => CJ.upsertItem({ name: 'ADDED ON PHONE', type: 'restaurant', tags: ['patio'] }));
  await B.page.evaluate(() => CJ.upsertItem({ name: 'ADDED ON LAPTOP', type: 'home', tags: ['decor'] }));
  await A.page.waitForTimeout(3200);
  await B.page.waitForTimeout(3200);
  // let each pull the other's work
  await A.page.evaluate(() => CJ.sync.pull());
  await B.page.evaluate(() => CJ.sync.pull());
  await A.page.waitForTimeout(1500);
  await B.page.waitForTimeout(1500);

  const dbg = async (p, label) => {
    const d = await p.evaluate(() => ({ ...CJ.sync.debug(), n: CJ.getItems().length }));
    console.log(`   [${label}] items=${d.n} lastRemoteStamp=${d.lastRemoteStamp} dirty=${d.dirty} inFlight=${d.inFlight}`);
  };
  console.log('   cloud row now:', row.updated_at, row.data.items.length, 'items');
  await dbg(A.page, 'A'); await dbg(B.page, 'B');

  const names = async (p) => p.evaluate(() => CJ.getItems().map(i => i.name));
  const aNames = await names(A.page), bNames = await names(B.page);
  const bothOnA = aNames.includes('ADDED ON PHONE') && aNames.includes('ADDED ON LAPTOP');
  const bothOnB = bNames.includes('ADDED ON PHONE') && bNames.includes('ADDED ON LAPTOP');
  console.log('concurrent edits — A has both:', bothOnA ? '✓' : '✗', '| B has both:', bothOnB ? '✓' : '✗');
  console.log('  A count:', aNames.length, '| B count:', bNames.length, '| neither lost:', aNames.length === bNames.length ? '✓' : '✗');

  // ===== Same item edited on both — newest edit should win =====
  const targetId = await A.page.evaluate(() => CJ.getItems().filter(i => i.name === 'Kimball House')[0].id);
  await B.page.evaluate(id => CJ.upsertItem({ id, notes: 'OLD EDIT from laptop' }), targetId);
  await B.page.waitForTimeout(3200);
  await new Promise(r => setTimeout(r, 1100));
  await A.page.evaluate(id => CJ.upsertItem({ id, notes: 'NEWER EDIT from phone' }), targetId);
  await A.page.waitForTimeout(3200);
  await B.page.evaluate(() => CJ.sync.pull());
  await B.page.waitForTimeout(1500);
  const winner = await B.page.evaluate(id => CJ.getItem(id).notes, targetId);
  console.log('last-write-wins:', winner === 'NEWER EDIT from phone' ? '✓ newest edit won' : '✗ got: ' + winner);

  // ===== Idea decisions beat suggestions =====
  await A.page.click('#tabs .tab[data-view="calendar"]');
  await A.page.click('#btn-refresh');
  await A.page.waitForTimeout(2000);
  const ideaId = await A.page.evaluate(() => {
    const i = CJ.getIdeas().filter(x => x.status === 'suggested')[0];
    CJ.updateIdea(i.id, { status: 'planned', pinned: true });
    return i.id;
  });
  await A.page.waitForTimeout(3200);
  await B.page.evaluate(() => CJ.sync.pull());
  await B.page.waitForTimeout(1500);
  const bStatus = await B.page.evaluate(id => { const i = CJ.getIdea(id); return i ? i.status : 'MISSING'; }, ideaId);
  console.log('planned idea reached other device:', bStatus === 'planned' ? '✓' : '✗ got ' + bStatus);

  // ===== Offline: changes queue, then flush on reconnect =====
  await A.ctx.setOffline(true);
  await A.page.evaluate(() => CJ.upsertItem({ name: 'ADDED WHILE OFFLINE', type: 'experience', tags: ['free'] }));
  await A.page.waitForTimeout(3500);
  const offlineChip = await A.page.textContent('#sync-label');
  const stillLocal = await A.page.evaluate(() => CJ.getItems().some(i => i.name === 'ADDED WHILE OFFLINE'));
  console.log('offline — kept locally:', stillLocal ? '✓' : '✗', '| chip:', offlineChip);
  await A.ctx.setOffline(false);
  await A.page.evaluate(() => { window.dispatchEvent(new Event('online')); });
  await A.page.waitForTimeout(4000);
  const madeItUp = row.data.items.some(i => i.name === 'ADDED WHILE OFFLINE');
  console.log('offline change uploaded after reconnect:', madeItUp ? '✓' : '✗');

  // ===== Simulating "cleared my browser": wipe local, sign in again =====
  const C = await newDevice(browser, 'C');
  await connect(C.page, 'julia@example.com');
  await C.page.evaluate(() => CJ.sync.adoptAfterSignIn());
  await C.page.waitForTimeout(2500);
  const recovered = await C.page.evaluate(() => CJ.getItems().length);
  const hasOffline = await C.page.evaluate(() => CJ.getItems().some(i => i.name === 'ADDED WHILE OFFLINE'));
  console.log('fresh browser recovered:', recovered, 'items | includes the offline one:', hasOffline ? '✓' : '✗');

  await C.page.click('#tabs .tab[data-view="settings"]');
  await C.page.waitForTimeout(500);
  await C.page.screenshot({ path: '/tmp/cj-shot-sync.png' });

  await browser.close();
  staticSrv.close(); api.close();
})();
