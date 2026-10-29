'use strict';
// Disposable local DOM only. Every external request is blocked, no live account.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),dir=path.resolve(__dirname,'../..');
const styles=[...fs.readFileSync(path.join(dir,'index.html'),'utf8').matchAll(/<link rel="stylesheet" href="([^"?]+)(?:\?[^"]*)?"/g)].map(m=>m[1]);
const allowed=new Set([...styles,'invoice-ledger-ui-v908.js','legal-v900.js','invoice-tax-v905.js']);
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+styles.map(s=>`<link rel="stylesheet" href="/${s}">`).join('')+'</head><body><main class="app-shell" id="root"></main><script src="/legal-v900.js"></script><script src="/invoice-tax-v905.js"></script><script src="/invoice-ledger-ui-v908.js"></script></body></html>';
const server=http.createServer((req,res)=>{const file=new URL(req.url,'http://127.0.0.1').pathname.slice(1);if(!file){res.setHeader('Content-Type','text/html');return res.end(html);}if(!allowed.has(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(path.join(dir,file)));});
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});let count=0;
 const test=async(name,fn)=>{await fn();count++;console.log('PASS '+name);};
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto('http://127.0.0.1:'+server.address().port);

  await page.evaluate(async()=>{
   const root=document.querySelector('#root'),state={profile:{id:'chief',role:'business'},company:'A',view:'invoices',rows:{orders:[]}},calls=[],pdfs=[];
   const prepared={company_id:'A',selection:[{id:'order',fingerprint:'frozen'}],document:{invoice_rules_version:909,invoice_pricing_version:919,company:'Testbetrieb',customer:'Testkunde',items:[{name:'Kabel',quantity:2,unit:'M',price:4,standard_net_price:4,purchase_price:1.5,price_editable:true,pricing_key:'order:item'}]},source_snapshot:{customer:{custom_fields:{street:'Kundenstraße',house_no:'1',postal_code:'12345',city:'Teststadt'}}}};
   const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let ledger;const render=()=>root.innerHTML=ledger.draftView();
   ledger=window.WorktimeInvoiceLedger.create({root,state,render,reload:async()=>{},allRows:async()=>[],isManager:()=>true,businessId:()=>state.company,today:()=> '2026-10-27',escape:esc,scopeOrder:()=>true,getCompanyDetails:()=>({company_id:'A',details:{name:'Testbetrieb',street:'Teststraße',house_no:'1',postcode:'12345',city:'Teststadt',taxId:'TEST-STNR'}}),askTax:(doc,accept)=>accept(window.WorktimeInvoiceTax.calculate(doc.items,{basis:'net',mode:'standard',confirmed:true})),openPdf:data=>pdfs.push(data),api:async(url,request)=>{calls.push({url,body:structuredClone(request.body)});if(url.endsWith('invoice_number_status_v934'))return {automatic_invoice_numbers:true};if(url.endsWith('issue_invoice_auto_v934')||url.endsWith('issue_invoice_batch_v919'))return {id:'invoice',customer_key:'customer'};const p=structuredClone(prepared);p.document.items[0].price=request.body.p_prices?.['order:item']??4;return p;}});window.__pricing={ledger,state,calls,pdfs};await ledger.load();await ledger.start([{id:'order'}]);
  });

  await test('enabled automatic numbering starts checked and does not reserve a number in the draft',async()=>{assert.equal(await page.locator('[name="auto_invoice_number"]').isChecked(),true);assert.equal(await page.locator('[name="invoice_number"]').getAttribute('readonly'),'');assert.equal(await page.locator('[name="invoice_number"]').inputValue(),'');assert.equal((await page.evaluate(()=>__pricing.calls.filter(c=>c.url.includes('issue_invoice')).length)),0);});
  for(const width of [320,390,1366]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await page.locator('[name="confirmed"]').check();await page.locator('[data-ledger-form="issue"] button.primary').click();await page.waitForFunction(()=>__pricing.state.view==='invoices-paid');
  await test('final confirmation uses the automatic RPC with the unchanged price engine and no invented client number',async()=>{const call=await page.evaluate(()=>__pricing.calls.find(c=>c.url.endsWith('issue_invoice_auto_v934')));assert.equal(call.body.p_engine,919);assert.equal(call.body.p_number,undefined);assert.ok(call.body.p_id);});
  await page.evaluate(()=>__pricing.ledger.start([{id:'order'}]));await page.locator('[name="auto_invoice_number"]').uncheck();await page.locator('[name="invoice_number"]').fill('MANUELL-934');await page.locator('[name="confirmed"]').check();await page.locator('[data-ledger-form="issue"] button.primary').click();await page.waitForFunction(()=>__pricing.calls.some(c=>c.url.endsWith('issue_invoice_batch_v919')));
  await test('a deliberately selected manual number still uses the established invoice endpoint',async()=>{const call=await page.evaluate(()=>__pricing.calls.find(c=>c.url.endsWith('issue_invoice_batch_v919')));assert.equal(call.body.p_number,'MANUELL-934');assert.equal(call.body.p_engine,undefined);});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:count,productionWrites:0}));await context.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
