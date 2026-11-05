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
   ledger=window.WorktimeInvoiceLedger.create({root,state,render,reload:async()=>{},allRows:async()=>[],isManager:()=>true,businessId:()=>state.company,today:()=> '2026-10-27',escape:esc,scopeOrder:()=>true,getCompanyDetails:()=>({company_id:'A',details:{name:'Testbetrieb',street:'Teststraße',house_no:'1',postcode:'12345',city:'Teststadt',taxId:'TEST-STNR'}}),askTax:(doc,accept)=>accept(window.WorktimeInvoiceTax.calculate(doc.items,{basis:'net',mode:'standard',confirmed:true})),openPdf:data=>pdfs.push(data),api:async(url,request)=>{calls.push({url,body:structuredClone(request.body)});if(url.includes('issue_invoice_fixed_'))return {id:'invoice',customer_key:'customer'};const p=structuredClone(prepared);if(url.endsWith('prepare_invoice_fixed_v984')){p.document.invoice_fixed_version=984;delete p.document.invoice_pricing_version;p.document.items=[{name:request.body.p_fixed.description,quantity:1,unit:'Pauschal',price:request.body.p_fixed.price}];p.document.days=[];}return p;}});window.__pricing={ledger,state,calls,pdfs};await ledger.start([{id:'order'}]);
  });

  await page.locator('[name="invoice_number"]').fill('TEST-FIXED');
  await page.locator('[name="pricing_kind"]').selectOption('fixed');
  await page.locator('[name="fixed_description"]').fill('Elektroinstallation zum vereinbarten Festpreis');
  await page.locator('[name="fixed_price"]').fill('1234.56');
  await test('edited fixed price blocks outdated preview and finalization',async()=>{assert.equal(await page.locator('[data-ledger-action="preview-draft"]').isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Rechnung verbindlich abschließen'}).isDisabled(),true);});
  await page.locator('[data-ledger-form="fixed"] button').click();
  await page.waitForFunction(()=>document.querySelector('.invoice-ledger-totals')?.hidden===false);
  await test('fixed preview uses server-confirmed line and newly checked tax',async()=>{assert.equal(await page.locator('[data-invoice-price]').count(),0);assert.match(await page.locator('.invoice-ledger-totals').innerText(),/1.234,56/);assert.equal(await page.locator('[name="invoice_number"]').inputValue(),'TEST-FIXED');await page.locator('[data-ledger-action="preview-draft"]').click();const p=await page.evaluate(()=>__pricing.pdfs[0]);assert.equal(p.invoice_fixed_version,984);assert.equal(p.items.length,1);assert.equal(p.tax.gross,146913);});
  await test('small and desktop forms stay inside the viewport',async()=>{for(const width of [320,390,1366]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}});
  await page.locator('[name="confirmed"]').check();await page.getByRole('button',{name:'Rechnung verbindlich abschließen'}).click();
  await page.waitForFunction(()=>__pricing.calls.some(c=>c.url.endsWith('issue_invoice_fixed_v984')));
  await test('explicit issue transmits reviewed fixed price, tax and original request identity',async()=>{const c=await page.evaluate(()=>__pricing.calls.find(c=>c.url.endsWith('issue_invoice_fixed_v984')));assert.equal(c.body.p_fixed.price,1234.56);assert.equal(c.body.p_tax.gross,146913);assert.equal(c.body.p_number,'TEST-FIXED');assert.equal(c.body.p_prices,undefined);});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:count,productionRequests:0}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
