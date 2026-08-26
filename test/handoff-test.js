const { chromium } = require('playwright');
const path=require('path'),http=require('http'),fs=require('fs');
const ROOT=path.resolve(__dirname,'..');
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript'};
let row=null,stamp=0;
const fakeApi=(req,res)=>{const send=(c,o)=>{res.writeHead(c,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(o));};
let body='';req.on('data',c=>body+=c);req.on('end',()=>{const u=req.url;
if(u.startsWith('/auth/v1/token')||u.startsWith('/auth/v1/signup')){const b=JSON.parse(body||'{}');return send(200,{access_token:'tok',refresh_token:'ref',expires_in:3600,user:{id:'uid1',email:b.email||'j@e.com'}});}
if(u.startsWith('/rest/v1/journals')){const ns=()=>{stamp++;return '2026-01-01T00:00:'+String(stamp).padStart(2,'0')+'Z';};
if(req.method==='GET')return send(200,row?[row]:[]);
if(req.method==='POST'){if(row)return send(409,{message:'dup'});const b=JSON.parse(body)[0];row={data:b.data,updated_at:ns()};return send(201,[row]);}
if(req.method==='PATCH'){const m=/updated_at=eq\.([^&]+)/.exec(u);const e=m?decodeURIComponent(m[1]):null;if(!row||(e&&row.updated_at!==e))return send(200,[]);const b=JSON.parse(body);row={data:b.data,updated_at:ns()};return send(200,[row]);}}
send(404,{});});};
const srv=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'});res.end(fs.readFileSync(f));});
(async()=>{
await new Promise(r=>srv.listen(8893,r));
const api=http.createServer(fakeApi);await new Promise(r=>api.listen(8894,r));
const b=await chromium.launch(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{});

// laptop
const L=await b.newContext();const lp=await L.newPage();
lp.on('pageerror',e=>console.log('[laptop]',e.message));
await lp.route('**/api.open-meteo.com/**',r=>r.abort());
await lp.goto('http://localhost:8893/index.html',{waitUntil:'domcontentloaded'});
await lp.waitForTimeout(600);
await lp.click('#tabs .tab[data-view="settings"]');
await lp.click('#btn-seed');await lp.waitForTimeout(800);
await lp.evaluate(async a=>{CJ.cloud.saveConfig(a,'anon-key');await CJ.cloud.signIn('j@e.com','pw12345678');},'http://localhost:8894');
await lp.evaluate(()=>CJ.sync.adoptAfterSignIn());
await lp.waitForTimeout(2500);
await lp.click('#tabs .tab[data-view="settings"]');
await lp.waitForTimeout(400);
console.log('panel text:', (await lp.locator('#sync-body').textContent()).slice(0,200));
console.log('buttons:', (await lp.locator('#sync-body button').allTextContents()).join(' | '));
await lp.locator('#sync-body button',{hasText:'Set up another device'}).click();
await lp.waitForTimeout(400);
const link=await lp.inputValue('#device-link-input');
console.log('handoff link generated:', link.slice(0,60)+'…');
await lp.screenshot({path:'/tmp/cj-shot-handoff.png'});

// phone: fresh context, opens the link, should need only sign-in
const P=await b.newContext({viewport:{width:390,height:844}});const pp=await P.newPage();
pp.on('pageerror',e=>console.log('[phone]',e.message));
await pp.route('**/api.open-meteo.com/**',r=>r.abort());
await pp.goto(link.replace('http://localhost:8893','http://localhost:8893'),{waitUntil:'domcontentloaded'});
await pp.waitForTimeout(900);
console.log('phone URL after load:', await pp.evaluate(()=>location.hash));
const cfgOK=await pp.evaluate(()=>CJ.cloud.isConfigured());
console.log('phone auto-configured:', cfgOK?'✓':'✗');
const seesUrlFields=await pp.locator('#sync-body input[type="url"]:visible').count();
console.log('phone shows Supabase fields up front:', seesUrlFields===0?'no ✓ (tucked away)':'YES ✗');
console.log('phone sees Sign in heading:', (await pp.locator('#sync-body').textContent()).includes('Sign in')?'✓':'✗');
await pp.screenshot({path:'/tmp/cj-shot-phone.png'});
await pp.evaluate(async()=>{await CJ.cloud.signIn('j@e.com','pw12345678');await CJ.sync.adoptAfterSignIn();});
await pp.waitForTimeout(2500);
console.log('phone library after sign-in:', await pp.evaluate(()=>CJ.getItems().length),'items');
console.log('phone chip:', await pp.textContent('#sync-label'));
await b.close();srv.close();api.close();
})();
