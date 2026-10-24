/* Synthetic VM lifecycle tests, no browser driver or production calls. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const code=fs.readFileSync(path.resolve(__dirname,'../../invoice-ledger-ui-v908.js'),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
function fixture(options={}){
 const context={window:{},crypto:{randomUUID}};vm.runInNewContext(code,context);
 const listeners={},root={addEventListener:(name,fn)=>{(listeners[name]||=[]).push(fn);},querySelectorAll:()=>[],querySelector:()=>null};
 const state={profile:{id:'manager',role:'business'},company:'A',view:'invoices',rows:{orders:[]}},calls=[];
 let manager=true,acceptTax=null,rendered=0;
 const batch={id:'invoice-A',company_id:'A',invoice_number:'TEST-001',customer_key:'customer-A',customer_name:'Testkunde',issued_on:'2026-10-17',created_at:'2026-10-17T12:00:00Z',selection:[{id:'order-A'}],document:{tax:{gross:11900},issuer:{name:'Fiktiver Betrieb'}},source_snapshot:{orders:[]}};
 const prepared={company_id:'A',customer_key:'customer-A',customer_name:'Testkunde',selection:[{id:'order-A',fingerprint:'frozen'}],document:{company:'Fiktiver Betrieb',customer:'Testkunde',items:[{name:'Fiktive Position',quantity:1,price:100}]},source_snapshot:{customer:{custom_fields:{street:'Teststraße',house_no:'1',postal_code:'12345',city:'Teststadt'}}}};
 const allRows=options.allRows||((table,query)=>{calls.push({table,query});return Promise.resolve(table==='invoice_batches_v908'?[copy(batch)]:table==='invoice_order_links_v908'?[{invoice_id:batch.id,company_id:'A',order_id:'order-A'}]:[]);});
 const api=async(url,request)=>{calls.push({url,request:copy(request)});return options.api?options.api(url,request):copy(prepared);};
 let feature;
 feature=context.window.WorktimeInvoiceLedger.create({root,state,api,allRows,render:()=>rendered++,reload:async()=>{if(options.reload)await options.reload();else await feature.load();},isManager:()=>manager,businessId:()=>state.company,today:()=> '2026-10-17',escape:value=>String(value??'').replaceAll('<','&lt;'),askTax:(_data,accept)=>{acceptTax=accept;return {close(){}};},openPdf:()=>{},scopeOrder:()=>true});
 const form=(kind='issue')=>{
  const values={invoice_number:'TEST-001',issued_on:'2026-10-17',confirmed:true,issuer_name:'Fiktiver Betrieb',issuer_street:'Teststraße 1',issuer_city:'12345 Teststadt',issuer_tax:'Fiktive Steuernummer',issuer_vat:'',issuer_email:'',issuer_phone:'',issuer_iban:'',customer_name:'Testkunde',customer_street:'Kundenstraße 2',customer_city:'12345 Teststadt'};
  return {dataset:{ledgerForm:kind},reportValidity:()=>true,elements:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value,checked:!!value}]))};
 };
 return {feature,state,calls,batch,prepared,form,api:context.window.WorktimeInvoiceLedger,setManager:value=>manager=value,acceptTax:tax=>acceptTax(tax),getRendered:()=>rendered,submit:async form=>{for(const listener of listeners.submit||[])await listener({target:{closest:()=>form},preventDefault(){}});}};
}
const tax={version:905,basis:'net',net:10000,vat:1900,gross:11900,groups:[{code:'standard',rate:19,net:10000,vat:1900,gross:11900}],lines:[{index:0,code:'standard',rate:19,net:10000,vat:1900,gross:11900}],notes:[]};
async function main(){
 await test('billable filter rejects internal and already invoiced orders',async()=>{
  const f=fixture();assert.equal(f.api.billable({id:'o',invoiced:false}),true);assert.equal(f.api.billable({id:'o',invoiced:false,work_kind:'customer'}),true);
  for(const work_kind of ['vehicle_cleanup','warehouse_cleanup','office','nonbillable','complaint','other'])assert.equal(f.api.billable({invoiced:false,work_kind}),false);
  assert.equal(f.api.billable({invoiced:true,work_kind:'customer'}),false);assert.equal(f.api.billable(null),false);
 });
 await test('customer folders keep individual invoice batches and attach the correct cancellation',async()=>{
  const f=fixture(),batches=[f.batch,{...f.batch,id:'invoice-A2',invoice_number:'TEST-002',issued_on:'2026-10-18'},{...f.batch,id:'invoice-B',customer_key:'customer-B',customer_name:'Anderer Kunde'}],groups=f.api.folders(batches,[{id:'cancel-A',invoice_id:'invoice-A',reopen_orders:true}]);
  assert.equal(groups.length,2);const a=groups.find(g=>g.key==='customer-A');assert.equal(a.invoices.length,2);assert.equal(a.invoices[0].id,'invoice-A2');assert.equal(a.invoices.find(i=>i.id==='invoice-A').cancellation.id,'cancel-A');assert.equal(a.invoices[0].cancellation,null);
 });
 await test('company-specific reads are cleared immediately when changing account context',async()=>{
  const f=fixture();await f.feature.load();assert.equal(f.feature.getBatches().length,1);assert.ok(f.calls.every(call=>call.query.includes('company_id=eq.A')));
  f.state.company='B';f.feature.afterRender();assert.equal(f.feature.getBatches().length,0);assert.match(f.feature.view(),/noch nicht geladen/);
 });
 await test('slow responses from the previous company cannot populate the new company register',async()=>{
  const releases=[],f=fixture({allRows:()=>new Promise(resolve=>releases.push(resolve))});const pending=f.feature.load();
  f.state.company='B';f.feature.afterRender();releases.forEach((resolve,index)=>resolve(index===0?[f.batch]:[]));await pending;
  assert.equal(f.feature.getBatches().length,0);assert.match(f.feature.view(),/noch nicht geladen/);
 });
 await test('employees trigger no register network read and cannot start a draft',async()=>{
  const f=fixture();await f.feature.load();f.setManager(false);f.feature.afterRender();const prior=f.calls.length;await f.feature.load();
  assert.equal(f.calls.length,prior);assert.equal(f.feature.getBatches().length,0);assert.match(f.feature.view(),/Nur Geschäftsführung/);await assert.rejects(f.feature.start([{id:'order-A'}]),/Nur Geschäftsführung/);
 });
 await test('preparing and accepting tax only creates a local draft, never an issue write',async()=>{
  const f=fixture();await f.feature.start([{id:'order-A',work_kind:'customer'}]);f.acceptTax(tax);
  assert.equal(f.state.view,'invoice-draft');assert.equal(f.calls.length,1);assert.ok(f.calls[0].url.endsWith('prepare_invoice_batch_v908'));
  assert.match(f.feature.draftView(),/Rechnung verbindlich abschließen/);assert.match(f.feature.draftView(),/Rechnungsempfänger/);
 });
 await test('an old tax-dialog callback after a company change cannot create a cross-company draft',async()=>{
  const f=fixture();await f.feature.start([{id:'order-A'}]);f.state.company='B';f.feature.afterRender();f.state.view='planning';f.acceptTax(tax);assert.equal(f.state.view,'planning');assert.match(f.feature.draftView(),/Kein Entwurf/);
 });
 await test('failed same-company refresh retains saved originals rather than making them disappear',async()=>{
  let fail=false;const f=fixture({allRows:async table=>{if(fail)throw Error('Synthetic offline');return table==='invoice_batches_v908'?[f.batch]:[];}});
  await f.feature.load();fail=true;await f.feature.load();assert.equal(f.feature.getBatches().length,1);assert.match(f.feature.view(),/nicht aktualisiert/);
 });
 await test('uncertain issue retries reuse the same request UUID and do not reset the entered issuer',async()=>{
  let attempts=0;const f=fixture({api:async(url)=>{if(url.endsWith('prepare_invoice_batch_v908'))return copy(f.prepared);if(++attempts===1)throw Error('Synthetic lost response');return copy(f.batch);}});
  await f.feature.start([{id:'order-A'}]);f.acceptTax(tax);const form=f.form();await f.submit(form);assert.equal(f.state.view,'invoice-draft');assert.match(f.feature.draftView(),/Synthetic lost response/);await f.submit(form);
  const issues=f.calls.filter(call=>call.url?.endsWith('issue_invoice_batch_v908'));assert.equal(issues.length,2);assert.equal(issues[0].request.body.p_id,issues[1].request.body.p_id);assert.deepEqual(issues[0].request.body.p_parties,issues[1].request.body.p_parties);assert.equal(f.state.view,'invoices-paid');
 });
 await test('slow finalization response cannot navigate or overwrite the newly selected company view',async()=>{
  let resolveIssue;const f=fixture({api:async url=>url.endsWith('prepare_invoice_batch_v908')?copy(f.prepared):new Promise(resolve=>resolveIssue=resolve)});
  await f.feature.start([{id:'order-A'}]);f.acceptTax(tax);const pending=f.submit(f.form());f.state.company='B';f.feature.afterRender();f.state.view='planning';resolveIssue(copy(f.batch));await pending;
  assert.equal(f.state.view,'planning');assert.equal(f.feature.getBatches().length,0);
 });
 console.log(passed+' invoice-ledger UI tests passed.');
}
main().catch(error=>{console.error(error);process.exit(1);});
