/* Atomic company catalog registration with real disposable PostgreSQL + RLS. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./team-db-fixture.cjs');
async function main(){
  const {db,ids,actor,admin}=await fixture({legacyRecords:true,offers:true,units:true,catalog:true});let passed=0;
  const history={orders:(await db.query('select to_jsonb(w) record from work_orders w order by id')).rows.map(r=>r.record),times:(await db.query('select to_jsonb(t) record from time_entries t order by id')).rows.map(r=>r.record)};
  const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
  const quote=(customer='Neukunde',name='Neuer Artikel',extra={})=>({business_id:ids.business,customer_id:null,customer_name:customer,customer_snapshot:{street:'Teststraße',house_no:'7',city:'Dortmund',email:'kunde@example.test'},offer_date:'2026-10-06',title:'Angebot mit neuen Stammdaten',items:[{kind:'material',name,material_id:null,quantity:2,unit_price:12.5,unit:'Kg'}],vat_rate:19,...extra});
  const save=async(data,revision=null)=>(await db.query('select to_jsonb(save_offer_v857($1::jsonb,$2)) result',[JSON.stringify(data),revision])).rows[0].result;
  const catalog=async()=>{await admin();return (await db.query("select jsonb_build_object('customers',(select jsonb_agg(to_jsonb(c) order by id) from customers c),'materials',(select jsonb_agg(to_jsonb(m) order by id) from materials m),'offers',(select coalesce(jsonb_agg(to_jsonb(o) order by id),'[]') from offers o)) result")).rows[0].result;};
  let initial,created;
  await test('New offer customer includes address and new article includes price/unit in shared catalogs',async()=>{
    initial=await catalog();await actor('business');created=await save(quote());assert.ok(created.customer_id&&created.items[0].material_id);assert.equal(created.total,29.75);
    const data=await catalog(),customer=data.customers.find(c=>c.id===created.customer_id),material=data.materials.find(m=>m.id===created.items[0].material_id);
    assert.equal(customer.employee_id,ids.business);assert.equal(customer.custom_fields.city,'Dortmund');assert.equal(customer.custom_fields.email,'kunde@example.test');assert.equal(material.business_id,ids.business);assert.equal(Number(material.unit_price),12.5);assert.equal(material.unit,'Kg');
  });
  await test('Krämer remains separate from Kremer and Hager B16 remains separate from Döpke W16',async()=>{
    await admin();await db.query("insert into customers(employee_id,name) values($1,'Kremer')",[ids.anna]);await db.query("insert into materials(business_id,name,unit_price,unit) values($1,'Döpke W16',7,'Stk')",[ids.business]);
    await actor('business');const saved=await save(quote('Krämer','Hager B16'));const rows=await catalog();assert.deepEqual(rows.customers.filter(c=>['Krämer','Kremer'].includes(c.name)).map(c=>c.name).sort(),['Kremer','Krämer']);assert.equal(rows.materials.filter(m=>m.name==='Hager B16').length,1);assert.equal(rows.materials.filter(m=>m.name==='Döpke W16').length,1);assert.equal(saved.customer_name,'Krämer');
  });
  await test('Exact names with spaces/case differences reuse catalog IDs without changing master data',async()=>{
    const before=await catalog();await actor('business');const saved=await save(quote('  NEUKUNDE  ','  neuer artikel  ',{customer_snapshot:{city:'Andere Adresse'},items:[{kind:'material',name:'  neuer artikel  ',quantity:1,unit_price:99,unit:'Pau'}]}));
    assert.equal(saved.customer_id,created.customer_id);assert.equal(saved.items[0].material_id,created.items[0].material_id);assert.equal(saved.items[0].unit_price,99);assert.equal(saved.items[0].unit,'Pau');const after=await catalog();assert.deepEqual(after.customers,before.customers);assert.deepEqual(after.materials,before.materials);
  });
  await test('Several repeated new positions register only one article',async()=>{
    await actor('business');const saved=await save(quote('Mehrfachkunde','Mehrfachartikel',{items:Array.from({length:5},()=>({kind:'material',name:'Mehrfachartikel',quantity:1,unit_price:0,unit:'Stk'}))}));assert.equal(new Set(saved.items.map(i=>i.material_id)).size,1);assert.equal((await catalog()).materials.filter(m=>m.name==='Mehrfachartikel').length,1);
  });
  await test('Price-free articles and all five units are supported',async()=>{
    await actor('business');const saved=await save(quote('Einheitenkunde','Einheitenartikel',{items:['Stk','M','H','Pau','Kg'].map(unit=>({kind:'material',name:'Einheitenartikel '+unit,unit,quantity:1,unit_price:0}))}));assert.equal(saved.total,0);const data=await catalog();for(const item of saved.items){const record=data.materials.find(m=>m.id===item.material_id);assert.equal(record.unit,item.unit);assert.equal(Number(record.unit_price),0);}
  });
  await test('Previously inactive exact articles are reactivated without changing their price or unit',async()=>{
    await admin();const old=(await db.query("insert into materials(business_id,name,unit_price,unit,active) values($1,'Archivartikel',41,'M',false) returning *",[ids.business])).rows[0];await actor('business');const saved=await save(quote('Archivkunde','Archivartikel'));assert.equal(saved.items[0].material_id,old.id);const record=(await catalog()).materials.find(m=>m.id===old.id);assert.equal(record.active,true);assert.equal(Number(record.unit_price),41);assert.equal(record.unit,'M');
  });
  await test('Failure in the fifth position rolls back the offer AND every newly added catalog row',async()=>{
    const before=await catalog();await actor('business');await assert.rejects(save(quote('Rollbackkunde','Rollbackartikel',{items:Array.from({length:5},(_,i)=>({kind:'material',name:'Rollbackartikel '+i,quantity:i===4?0:1,unit_price:2,unit:'Stk'}))})),/gültigen Bereich/);assert.deepEqual(await catalog(),before);
  });
  await test('Invalid address, unit, price and customer name cannot leave partial catalogs behind',async()=>{
    for(const change of [{customer_snapshot:[]},{items:[{kind:'material',name:'Ungültiger Artikel',quantity:1,unit_price:5,unit:'Liter'}]},{items:[{kind:'material',name:'Ungültiger Artikel',quantity:1,unit_price:-1,unit:'Stk'}]},{customer_name:'X'.repeat(161)}]){const before=await catalog();await actor('business');await assert.rejects(save(quote('Ungültiger Kunde','Ungültiger Artikel',change)));assert.deepEqual(await catalog(),before);}
  });
  await test('Foreign customer/material IDs are rejected and all preceding new rows roll back',async()=>{
    await admin();const foreign=(await db.query("insert into materials(business_id,name,unit_price,unit) values($1,'Fremdmaterial',9,'Stk') returning id",[ids.otherBusiness])).rows[0].id;
    for(const change of [{customer_id:ids.otherCustomer},{items:[{kind:'material',name:'Erster Rollbackartikel',quantity:1,unit_price:2,unit:'Stk'},{kind:'material',name:'Fremdmaterial',material_id:foreign,quantity:1,unit_price:9,unit:'Stk'}]}]){const before=await catalog();await actor('business');await assert.rejects(save(quote('Fremd-ID-Test','Fremd-ID-Artikel',change)),/gehört nicht/);assert.deepEqual(await catalog(),before);}
  });
  await test('Company separation allows the same exact names in a different business',async()=>{
    await actor('otherBusiness');const other=await save(quote('Neukunde','Neuer Artikel',{business_id:ids.otherBusiness}));assert.notEqual(other.customer_id,created.customer_id);assert.notEqual(other.items[0].material_id,created.items[0].material_id);const data=await catalog();assert.equal(data.materials.find(m=>m.id===other.items[0].material_id).business_id,ids.otherBusiness);
  });
  await test('Employees cannot create offers or write catalog entries through the offer RPC',async()=>{
    const before=await catalog();await actor('anna');await assert.rejects(save(quote('Nicht erlaubt','Nicht erlaubt')),/Keine Berechtigung/);assert.deepEqual(await catalog(),before);
  });
  await test('An administrator registers records only in the explicitly selected company',async()=>{
    await actor('admin');const saved=await save(quote('Adminkunde','Adminartikel',{business_id:ids.otherBusiness}));const data=await catalog();assert.equal(data.customers.find(c=>c.id===saved.customer_id).employee_id,ids.otherBusiness);assert.equal(data.materials.find(m=>m.id===saved.items[0].material_id).business_id,ids.otherBusiness);
  });
  await test('A stale offer edit is rejected before creating newly typed catalog records',async()=>{
    const before=await catalog();await actor('business');await assert.rejects(save({...created,customer_id:null,customer_name:'Veralteter Kunde',items:[{kind:'material',name:'Veralteter Artikel',quantity:1,unit_price:5,unit:'Stk'}]},0),/inzwischen geändert/);assert.deepEqual(await catalog(),before);
  });
  await test('Saving an existing offer registers added free-text names and keeps its number',async()=>{
    await actor('business');const saved=await save({...created,customer_id:null,customer_name:'Nachträglicher Kunde',items:[...created.items,{kind:'material',name:'Nachträglicher Artikel',quantity:1,unit_price:0,unit:'Pau'}]},created.revision);assert.equal(saved.revision,2);assert.equal(saved.offer_number,created.offer_number);const data=await catalog();assert.ok(data.customers.some(c=>c.name==='Nachträglicher Kunde'));assert.ok(data.materials.some(m=>m.name==='Nachträglicher Artikel'));
  });
  await test('Deleting a referenced catalog record does not erase a document or recreate it merely on edit',async()=>{
    await actor('business');const saved=await save(quote('Löschkunde','Löschartikel'));await admin();await db.query('delete from customers where id=$1',[saved.customer_id]);await db.query('delete from materials where id=$1',[saved.items[0].material_id]);await actor('business');const edited=await save({...saved,notes:'Nur die Notiz ändern'},saved.revision);assert.equal(edited.customer_id,null);assert.equal(edited.items[0].material_id,null);assert.equal(edited.items[0].unit_price,12.5);const rows=await catalog();assert.equal(rows.customers.some(c=>c.name==='Löschkunde'),false);assert.equal(rows.materials.some(m=>m.name==='Löschartikel'),false);
  });
  await test('Business-owned customers are visible and editable by another same-company employee',async()=>{
    await actor('anna');const record=(await db.query("select * from customers where name='Krämer'")).rows[0];assert.ok(record);assert.equal(record.employee_id,ids.business);await db.query("update customers set custom_fields=custom_fields||'{\"city\":\"Bochum\"}' where id=$1 returning id",[record.id]);await actor('max');assert.equal((await db.query('select custom_fields from customers where id=$1',[record.id])).rows[0].custom_fields.city,'Bochum');
  });
  await test('Employees cannot delete customers or move business-owned records to another company',async()=>{
    await actor('anna');const record=(await db.query("select * from customers where name='Krämer'")).rows[0];assert.equal((await db.query('delete from customers where id=$1 returning id',[record.id])).rows.length,0);await assert.rejects(()=>db.query('update customers set employee_id=$1 where id=$2',[ids.otherBusiness,record.id]));assert.ok((await db.query('select id from customers where id=$1',[record.id])).rows[0]);
  });
  await test('Other company managers cannot read, edit or delete registered business-owned customers',async()=>{
    await actor('otherBusiness');assert.equal((await db.query('select * from customers where id=$1',[created.customer_id])).rows.length,0);assert.equal((await db.query('update customers set name=\'Forbidden\' where id=$1 returning id',[created.customer_id])).rows.length,0);assert.equal((await db.query('delete from customers where id=$1 returning id',[created.customer_id])).rows.length,0);
  });
  await test('Company managers may delete registered company-owned customers without deleting saved offers',async()=>{
    await actor('business');const saved=await save(quote('Kunde zum Entfernen','Kabel'));const deleted=(await db.query('delete from customers where id=$1 returning id',[saved.customer_id])).rows;assert.equal(deleted.length,1);assert.ok((await db.query('select id from offers where id=$1',[saved.id])).rows[0]);
  });
  await test('Fixture reproduces the original live permission error and migration fixes it without bypassing RLS',async()=>{
    await admin();await db.exec('alter policy "Business customers are visible to team" on customers using(app_private.same_business(employee_id))');await actor('business');await assert.rejects(save(quote('Vorher nicht lesbar','Vorher Artikel')),/row-level security/);await admin();await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261006135926_offer_catalog_registration_v862.sql'),'utf8'));await actor('business');assert.ok((await save(quote('Nachher lesbar','Nachher Artikel'))).customer_id);
  });
  await test('Migration is repeatable, keeps all history untouched and grants no anonymous/elevated access',async()=>{
    const before=await catalog();await admin();await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261006135926_offer_catalog_registration_v862.sql'),'utf8'));assert.deepEqual(await catalog(),before);
    assert.deepEqual((await db.query('select to_jsonb(w) record from work_orders w order by id')).rows.map(r=>r.record),history.orders);assert.deepEqual((await db.query('select to_jsonb(t) record from time_entries t order by id')).rows.map(r=>r.record),history.times);
    const permissions=(await db.query("select p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') anonymous,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated from pg_proc p where p.oid='public.save_offer_v857(jsonb,integer)'::regprocedure")).rows[0];assert.equal(permissions.prosecdef,false);assert.equal(permissions.anonymous,false);assert.equal(permissions.authenticated,true);
    assert.equal(initial.customers.length,2);
  });
  await db.close();console.log(JSON.stringify({passed,productionWrites:0,atomicCatalog:true}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
