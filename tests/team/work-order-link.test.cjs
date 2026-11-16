const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname,'../../app-v800.js'),'utf8');
const id='a5090000-0000-4000-8000-000000000001', firm='a5090000-0000-4000-8000-000000000002', employee='a5090000-0000-4000-8000-000000000003';
const order={id,employee_id:employee,work_date:'2025-11-15',customer_name:'Testkunde',service_location:{label:'Objekt B',street:'Nebenweg',house_no:'7',city:'Hürth',postal_code:'50354'},team_periods:[{employee_id:employee,work_date:'2025-11-14'}]};
const state={rows:{orders:[order],people:[{id:employee,business_id:firm}],customers:[]},profile:{id:firm}};
const scope={state,URLSearchParams,window:{location:{search:'?order='+id+'&day=2025-11-14&business='+firm}},
  businessId:()=>firm,isManager:()=>true,canUse:()=>true,same:(a,b)=>a===b,orderPeriods:order=>order.team_periods,
  notice:message=>{scope.message=message;},escape:String,personName:()=> 'Testmonteur',teamPerson:()=>null};
const {open,site,additional}=vm.runInNewContext(app.slice(app.indexOf('  function siteAddress('),app.indexOf('  function customerSites('))+
  '\n({open:openLinkedWorkOrder,site:orderSiteCaption,additional:otherWorkOrdersOnDay})',scope);
assert.equal(open(),true);
assert.equal(state.orderId,id);
assert.equal(state.employeeId,employee);
assert.equal(state.date,'2025-11-14');
assert.match(site(order,{custom_fields:{street:'Hauptweg'}}),/Objekt B · Nebenweg 7 50354 Hürth/);
assert.equal(site({...order,service_location:{label:'Objekt C'}},{custom_fields:{street:'Hauptweg'}}),'Objekt C · Objektanschrift fehlt');
assert.match(additional([],'2025-11-14'),/Nebenweg 7/);
assert.equal(additional([order],'2025-11-14'),'');
scope.window.location.search='?order='+id+'&business=foreign';
assert.equal(open(),true);
assert.equal(state.view,'orders');
assert.match(scope.message,/ausgewählten Geschäftskonto/);
console.log('PASS work-order links keep the selected company and actual service date, and site labels preserve the stored address.');
