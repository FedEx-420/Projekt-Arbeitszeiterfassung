/* Pure/VM integration checks; no browser automation and no production writes. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {fixture}=require('./document-pdf-v904-fixture.cjs'),dir=path.resolve(__dirname,'../..');
async function main(){
 let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);},window={WORKTIME_CONFIG:{},addEventListener(){},setInterval(){}};
 vm.runInNewContext(fs.readFileSync(path.join(dir,'billing-selection-v906.js'),'utf8'),{window});
 const pick=window.WorktimeBillingSelection.select,f=fixture(),second={...structuredClone(f.order),id:'order-2',work_date:'2026-10-15',executed_hours:2},paid={...f.order,id:'paid',invoiced:true};
 second.team_periods=[{employee_id:'anna',employee_name:'Anna Muster',start_time:'08:00',end_time:'10:00',executed_hours:2}];
 const group={key:'customer',customerName:'Klostermanns Hof',orders:[f.order,second]};
 await test('Selection includes only explicitly selected orders and sums their hours',()=>{const selected=pick(group,['order-2']);assert.equal(selected.orders.length,1);assert.equal(selected.orders[0].id,'order-2');assert.equal(selected.hours,2);assert.equal(group.orders.length,2);});
 await test('Empty, unknown, other-customer, paid and stale IDs fail closed',()=>{for(const ids of [[],['missing'],['order-1','foreign']])assert.throws(()=>pick(group,ids));assert.throws(()=>pick({...group,orders:[paid]},['paid']));assert.throws(()=>pick({...group,orders:[second]},['order-1']));});
 await test('Duplicate input IDs do not double the invoice',()=>{assert.equal(pick(group,['order-1','order-1']).orders.length,1);});
 await test('A multi-employee order shows all participant hours, matching its invoice model',()=>{assert.equal(pick(group,['order-1']).hours,7);assert.equal(pick(group,['order-1','order-2']).hours,9);});
 const root={addEventListener(){},querySelector(){return null;},querySelectorAll(){return []}},context={window,document:{getElementById:()=>root,addEventListener(){}},localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},setTimeout,clearTimeout,console,Intl,Date,Map,Set,URL,AbortController,structuredClone,atob};
 let source=fs.readFileSync(path.join(dir,'app-v800.js'),'utf8');source=source.replace('if (state.session?.access_token) loadApp(); else render();','/* No startup. */').replace(/\}\)\(\);\s*$/,'window.qa={state,chooseBillingOrders,documentPdfModel,invoiceGroups};})();');vm.runInNewContext(source,context);
 const app=window.qa;Object.assign(app.state,{profile:f.business,businessId:'business',employeeId:'anna'});Object.assign(app.state.rows,f.rows,{orders:[f.order,second,paid]});let args;
 window.WorktimeBillingSelection.choose=async options=>{args=options;return pick(options.resolve(),['order-2']);};
 await test('Actual app starts an individual invoice with only the clicked order preselected',async()=>{await app.chooseBillingOrders(group,'invoice','order-1');assert.deepEqual(Array.from(args.initialIds),['order-1']);assert.equal(args.resolve().orders.length,2);});
 await test('Actual finalization selector remembers the last invoice selection in this firm',async()=>{await app.chooseBillingOrders(group,'mark');assert.deepEqual(Array.from(args.initialIds),['order-2']);assert.equal(args.purpose,'mark');});
 await test('Actual invoice model contains only selected dates, materials, employees and periods',()=>{const selected=pick(group,['order-1']),model=app.documentPdfModel(selected.orders,'invoice');assert.equal(model.days.length,1);assert.equal(model.days[0].periods.length,3);assert.equal(model.items.length,3);assert.equal(model.hours,7);});
 await test('A company switch while the dialog is open invalidates the resolver',async()=>{window.WorktimeBillingSelection.choose=async options=>{app.state.businessId='other';assert.equal(options.resolve(),null);return null;};assert.equal(await app.chooseBillingOrders(group),null);app.state.businessId='business';});
 await test('Cancel makes no records invoiced and changes no historical time data',()=>{assert.equal(f.order.invoiced,false);assert.equal(second.invoiced,false);assert.equal(paid.invoiced,true);assert.equal(f.order.team_periods.length,3);});
 await test('All effective invoice and finalize routes use selected orders, not a whole group implicitly',()=>{const section=source.slice(source.indexOf("if (action === 'invoice-order')"),source.indexOf("if (action === 'read')"));assert.equal((section.match(/await chooseBillingOrders\(/g)||[]).length,4);assert.equal((section.match(/snapshotCurrentPrices\(selected.orders\)/g)||[]).length,2);assert.ok(!section.includes('printInvoicePdf(group)'));assert.ok(!section.includes('for (const order of group.orders)'));});
 await test('Legal audit explicitly identifies gaps rather than claiming a DATEV connection or certification',()=>{vm.runInNewContext(fs.readFileSync(path.join(dir,'business-readiness-v906.js'),'utf8'),{window});const html=window.WorktimeBusinessReadiness.html();for(const word of ['Nicht verbunden','Offen','unveränderliches Rechnungsregister','keine individuelle Rechts- oder Steuerberatung','Keine DATEV-Zugangsdaten'])assert.ok(html.includes(word),word);});
 console.log(JSON.stringify({passed,productionWrites:0}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
