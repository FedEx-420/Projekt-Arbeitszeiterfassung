'use strict';
// Disposable local DOM only. Every external request is blocked, no live account.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),dir=path.resolve(__dirname,'../..');
const styles=[...fs.readFileSync(path.join(dir,'index.html'),'utf8').matchAll(/<link rel="stylesheet" href="([^"?]+)(?:\?[^"]*)?"/g)].map(m=>m[1]);
const allowed=new Set([...styles,'invoice-ledger-ui-v908.js','legal-v900.js']);
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+styles.map(s=>`<link rel="stylesheet" href="/${s}">`).join('')+'</head><body><main class="app-shell" id="root"></main><script src="/legal-v900.js"></script><script src="/invoice-ledger-ui-v908.js"></script></body></html>';
const server=http.createServer((req,res)=>{const file=new URL(req.url,'http://127.0.0.1').pathname.slice(1);if(!file){res.setHeader('Content-Type','text/html');return res.end(html);}if(!allowed.has(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(path.join(dir,file)));});
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});let count=0;
 const test=async(name,fn)=>{await fn();count++;console.log('PASS '+name);};
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{
   const root=document.querySelector('#root'),state={profile:{id:'founder',role:'administrator'},company:'A',rows:{orders:[]},view:'invoices'};let manager=true;
   const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.WorktimeLegalTemplates={};
   const infos=[{company_id:'A',details:{name:'Fiktiver Betrieb A',street:'Synthetische Firmenstraße',house_no:'7',postcode:'53343',city:'Teststadt',taxId:'SYNTHETISCHE-STNR',vatId:'DE123456789'}},{company_id:'B',details:{name:'Fiktiver Betrieb B',street:'Andere Firmenstraße',house_no:'1',postcode:'12345',city:'Anderer Ort'}}];
   const legal=window.WorktimeLegal.create({root,state,api:()=>{throw Error('Writes forbidden');},allRows:async table=>table==='company_legal_info_v900'?structuredClone(infos):[],render:()=>{},escape:esc,isManager:()=>manager,businessId:()=>state.company,managerBusiness:()=>({company_name:'Testbetrieb'})});await legal.load();
   const prepared={company_id:'A',selection:[{id:'order',fingerprint:'test'}],document:{invoice_rules_version:909,company:'Testbetrieb',customer:'Vorname Kundenname',items:[{derived_from_work_time:true,employee_name:'Anna Muster',name:'Monteurstunde',quantity:1,price:55}]},source_snapshot:{customer:{custom_fields:{street:'Kundenstraße',house_no:'8',postal_code:'12345',city:'Kundenstadt'}}}};
   let ledger;const render=()=>{root.innerHTML=ledger.draftView();};ledger=window.WorktimeInvoiceLedger.create({root,state,api:async()=>structuredClone(prepared),allRows:async()=>[],reload:()=>{},render,isManager:()=>manager,businessId:()=>state.company,today:()=> '2026-10-25',escape:esc,getCompanyDetails:()=>legal.getCompanyDetails(),askTax:(_data,accept)=>accept({version:905,basis:'net',gross:6545,net:5500,vat:1045,groups:[{code:'standard'}]}),openPdf:()=>{},scopeOrder:()=>true});await ledger.start([{id:'order'}]);
   window.__invoice={state,legal,ledger,infos,setManager:v=>manager=v};
  });
  await test('real invoice fields contain the current firm and customer, including first name and address',async()=>{
   for(const [name,value]of Object.entries({issuer_name:'Fiktiver Betrieb A',issuer_street:'Synthetische Firmenstraße 7',issuer_city:'53343 Teststadt',issuer_tax:'SYNTHETISCHE-STNR',issuer_vat:'DE123456789',customer_name:'Vorname Kundenname',customer_street:'Kundenstraße 8',customer_city:'12345 Kundenstadt'}))assert.equal(await page.locator(`[name="${name}"]`).inputValue(),value);
   assert.match(await page.locator('.invoice-ledger-note').last().innerText(),/Stundenart und aktueller Preis/);assert.equal(await page.locator('[name="small_amount_confirmed"]').isChecked(),false);
  });
  for(const [width,height]of [[320,780],[390,844],[844,390],[1366,768],[1920,1080]])await test(`invoice address, tax fields and buttons stay inside ${width} x ${height}`,async()=>{
   await page.setViewportSize({width,height});const overflow=await page.evaluate(()=>[...document.querySelectorAll('input,button,fieldset')].filter(el=>el.getBoundingClientRect().width&& (el.getBoundingClientRect().left<-.5||el.getBoundingClientRect().right>innerWidth+.5)).map(el=>el.name||el.tagName));assert.deepEqual(overflow,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  });
  await test('legal details are cloned and scoped to the selected firm and current manager identity',async()=>{
   const values=await page.evaluate(()=>{const h=window.__invoice,copy=h.legal.getCompanyDetails();copy.details.taxId='MUTATED';const original=h.legal.getCompanyDetails().details.taxId;h.state.company='B';const second=h.legal.getCompanyDetails().details.name;h.setManager(false);const employee=h.legal.getCompanyDetails();h.setManager(true);h.state.profile={id:'another-actor'};const stale=h.legal.getCompanyDetails();return {original,second,employee,stale};});assert.deepEqual(values,{original:'SYNTHETISCHE-STNR',second:'Fiktiver Betrieb B',employee:null,stale:null});
  });
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:count,externalRequests:0,productionWrites:0,physicalIphoneVerified:false}));await context.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(error=>{console.error(error.stack);server.close();process.exitCode=1;});
