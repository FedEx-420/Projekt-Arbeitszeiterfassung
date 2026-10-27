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
   ledger=window.WorktimeInvoiceLedger.create({root,state,render,reload:async()=>{},allRows:async()=>[],isManager:()=>true,businessId:()=>state.company,today:()=> '2026-10-27',escape:esc,scopeOrder:()=>true,getCompanyDetails:()=>({company_id:'A',details:{name:'Testbetrieb',street:'Teststraße',house_no:'1',postcode:'12345',city:'Teststadt',taxId:'TEST-STNR'}}),askTax:(doc,accept)=>accept(window.WorktimeInvoiceTax.calculate(doc.items,{basis:'net',mode:'standard',confirmed:true})),openPdf:data=>pdfs.push(data),api:async(url,request)=>{calls.push({url,body:structuredClone(request.body)});if(url.endsWith('issue_invoice_batch_v919'))return {id:'invoice',customer_key:'customer'};const p=structuredClone(prepared);p.document.items[0].price=request.body.p_prices?.['order:item']??4;return p;}});window.__pricing={ledger,state,calls,pdfs};await ledger.start([{id:'order'}]);
  });
  await test('material editor shows net VK-star default and separate EK',async()=>{assert.equal(await page.locator('[data-invoice-price]').inputValue(),'4');assert.match(await page.locator('.invoice-price-row').innerText(),/Einkaufspreis.*1,50/s);});
  await page.locator('[name="invoice_number"]').fill('TEST-919');await page.locator('[data-invoice-price]').fill('3.1256');
  await test('a changed price blocks finalization and hides outdated totals until repricing',async()=>{assert.equal(await page.getByRole('button',{name:'Rechnung verbindlich abschließen'}).isDisabled(),true);assert.equal(await page.locator('.invoice-ledger-totals').isVisible(),false);assert.equal(await page.locator('[data-invoice-price]').evaluate(e=>e===document.activeElement),true);});
  await page.locator('[data-ledger-form="prices"] button').click();await page.waitForFunction(()=>document.querySelector('.invoice-ledger-totals')?.hidden===false);
  await test('reprice preserves invoice fields and uses the new tax amounts',async()=>{assert.equal(await page.locator('[name="invoice_number"]').inputValue(),'TEST-919');assert.equal(await page.locator('[data-invoice-price]').inputValue(),'3.1256');assert.match(await page.locator('.invoice-ledger-totals').innerText(),/6,25/);assert.equal(await page.locator('[name="confirmed"]').isChecked(),false);});
  await page.locator('[data-ledger-action="preview-draft"]').click();
  await test('PDF draft receives the same reviewed material price',async()=>{const p=await page.evaluate(()=>window.__pricing.pdfs[0]);assert.equal(p.items[0].price,3.1256);assert.equal(p.tax.net,625);});
  for(const width of [320,390,1366])await test('invoice price controls fit viewport '+width,async()=>{await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));});
  await page.locator('[name="confirmed"]').check();await page.getByRole('button',{name:'Rechnung verbindlich abschließen'}).click();await page.waitForFunction(()=>window.__pricing.calls.some(c=>c.url.endsWith('issue_invoice_batch_v919')));
  await test('final request sends only the reviewed price overrides to the new endpoint',async()=>{const call=await page.evaluate(()=>window.__pricing.calls.find(c=>c.url.endsWith('issue_invoice_batch_v919')));assert.deepEqual(call.body.p_prices,{'order:item':3.1256});assert.equal(call.body.p_number,'TEST-919');});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:count,productionWrites:0}));await context.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
