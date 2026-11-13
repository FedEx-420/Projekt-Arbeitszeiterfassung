// Isolated module UI. Synthetic identities; no network and no business records.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const dir=path.resolve(__dirname,'../..'),company='10000000-0000-4000-8000-000000000001';
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/module.js'?'text/javascript':'text/html');res.end(req.url==='/module.js'?fs.readFileSync(path.join(dir,'klarwerk-connection-v1007.js')):'<!doctype html><html lang="de"><meta charset="utf-8"><body><main id="root"></main><script src="/module.js"></script></body></html>')});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('http://127.0.0.1:'+server.address().port);await page.evaluate(company=>{
 const state={profile:{id:company,role:'business'}},root=document.querySelector('#root'),calls=[];let currentCompany=company;
 const link={id:'existing',label:'Vorhandene Verbindung',claimed_at:'2026-11-08T12:00:00Z',offers_allowed:false};
 window.confirm=()=>true;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const api=async(url,opts={})=>{calls.push({url,...opts});const {action}=opts.body;if(action==='links')return [link];if(action==='pair')return{id:'link',code:'f'.repeat(64),expires:new Date(Date.now()+600000).toISOString()};if(action==='revoke')return {ok:true};throw Error('Unexpected action '+action);};
 const c=WorktimeKlarwerkConnection.create({root,state,businessId:()=>currentCompany,isManager:()=>state.profile.role==='business',escape:esc,api});
 window.qa={c,state,calls,setCompany:x=>currentCompany=x,draw:()=>{root.innerHTML=c.settings();c.afterRender()}};qa.draw();
 },company);
 await page.locator('[name=klarwerk_consent]').check();await page.getByRole('button',{name:'Freigabecode erzeugen',exact:true}).click();await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Klarwerk-Freigabecode"]')?.value.length===64);assert.equal(await page.locator('[name=klarwerk_consent]').count(),1);assert.match(await page.locator('[data-klarwerk-settings]').innerText(),/Arbeitsscheine mit Material und Arbeitsstunden/);
 assert.equal(await page.locator('[name=file], [data-klarwerk-action=offer-scope]').count(),0);
 assert.deepEqual(await page.evaluate(()=>qa.calls.find(call=>call.body?.action==='pair').body.data),{label:'Meine Buchhaltung'});
 await page.evaluate(()=>{qa.state.profile.role='employee';qa.draw()});assert.equal(await page.locator('[data-klarwerk-settings]').count(),0);
 await page.evaluate(()=>{qa.setCompany('10000000-0000-4000-8000-000000000009');qa.state.profile.role='business';qa.draw()});assert.equal(await page.locator('textarea[aria-label="Klarwerk-Freigabecode"]').count(),0);assert.deepEqual(errors,[]);console.log('PASS business-only pairing for work-sheet data and company-switch code reset; no production traffic.');
}finally{await browser.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
