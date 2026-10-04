const assert=require('node:assert/strict');
const {fixture}=require('./team-db-fixture.cjs');
async function main(){
  const {db,ids,actor,admin,order,periods,save}=await fixture(); let passed=0;
  async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
  let saved;
  await test('Migration compiles in PostgreSQL and is additive',async()=>{
    const {rows}=await db.query("select column_name from information_schema.columns where table_name='time_entries' and column_name like 'team_%'");assert.equal(rows.length,2);
  });
  await actor('anna');
  await test('Narrow employee roster contains only the assigned company',async()=>{
    const context=(await db.query('select work_order_team_context($1) c',[ids.otherBusiness])).rows[0].c;
    assert.equal(context.version,1);assert.deepEqual(context.roster.map(p=>p.username).sort(),['anna','max']);
    assert.equal((await db.query('select * from profiles')).rows.length,1);
  });
  await test('One order books separate shifts, pauses and labor types for two employees',async()=>{
    saved=await save();assert.equal(saved.team_periods.length,3);
    assert.deepEqual(saved.team_periods.map(p=>Number(p.executed_hours)),[2,1.25,3]);
    assert.equal((await db.query('select * from time_entries')).rows.length,2);
    const items=(await db.query('select position_name,quantity,unit_price from work_order_items order by position_name')).rows;
    assert.deepEqual(items.map(i=>[i.position_name,Number(i.quantity),Number(i.unit_price)]),[['Kabel',3,2],['Meisterstunde',3,75],['Monteurstunde',3.25,55]]);
  });
  await actor('max');
  await test('A participating employee sees the shared order but only their own account times',async()=>{
    assert.equal((await db.query('select * from work_orders')).rows.length,1);
    assert.equal((await db.query('select * from time_entries')).rows.length,1);
    assert.equal(Number((await db.query('select sum(executed_hours) n from time_entries')).rows[0].n),3);
    assert.equal((await db.query('select * from work_order_items')).rows.length,3);
  });
  await test('Participant edits replace all periods atomically without duplicating hours',async()=>{
    saved=await save({...order,id:saved.id},periods.map((p,i)=>i===2?{...p,end_time:'12:30'}:p));
    assert.equal(Number((await db.query('select sum(executed_hours) n from time_entries')).rows[0].n),3.5);
    await admin();assert.equal((await db.query('select count(*) n from time_entries')).rows[0].n,3);
  });
  await actor('felix');
  await test('Another company cannot read, update or delete the order',async()=>{
    assert.equal((await db.query('select * from work_orders')).rows.length,0);
    await assert.rejects(save({...order,id:saved.id}),/nicht zu Ihrem Auftrag/);
    await assert.rejects(db.query('select delete_team_work_order($1)',[saved.id]),/nicht verfügbar/);
  });
  await actor('anna');
  await test('Cross-company participants, clients and invalid overlapping periods are rejected',async()=>{
    await assert.rejects(save({...order,id:saved.id},[...periods,{...periods[2],employee_id:ids.felix}]),/derselben Firma/);
    await assert.rejects(save({...order,id:saved.id,customer_id:ids.otherCustomer}),/Kunde gehört/);
    await assert.rejects(save({...order,id:saved.id},[periods[0],{...periods[1],start_time:'09:00'}]),/überschneiden/);
    await assert.rejects(save({...order,id:saved.id},[{...periods[0],start_time:'08:07'}]),/Viertelstunden/);
    assert.equal((await db.query('select team_periods from work_orders')).rows[0].team_periods[2].end_time,'12:30');
  });
  await test('Invalid material rolls back the complete multi-employee transaction',async()=>{
    await assert.rejects(save({...order,id:saved.id,title:'Muss zurückrollen'},periods,[{material_id:ids.otherCustomer,quantity:1}]),/Ungültiges Material/);
    assert.equal((await db.query('select title from work_orders')).rows[0].title,order.title);
    assert.equal((await db.query('select count(*) n from work_order_items')).rows[0].n,3);
  });
  await admin();await db.query('insert into work_days(employee_id,work_date,sick) values($1,$2,1)',[ids.max,order.work_date]);await actor('anna');
  await test('A coworker sick day blocks the whole save without changing anyone else',async()=>{
    await assert.rejects(save({...order,id:saved.id}),/krank gemeldet/);
    assert.equal((await db.query('select team_periods from work_orders')).rows[0].team_periods[2].end_time,'12:30');
  });
  await admin();await db.exec('delete from work_days');await db.query('insert into vacation_requests(employee_id,start_date,end_date,status) values($1,$2,$2,$3)',[ids.max,order.work_date,'approved']);await actor('anna');
  await test('Approved coworker vacation and NRW holidays block recording',async()=>{
    await assert.rejects(save({...order,id:saved.id}),/genehmigten Urlaub/);
    await assert.rejects(save({...order,work_date:'2026-12-25'}),/NRW-Feiertagen/);
  });
  await admin();await db.exec('delete from vacation_requests');await actor('anna');
  await test('Legacy direct writes cannot desynchronize a team order or remove one linked time',async()=>{
    await assert.rejects(db.query('update work_orders set executed_hours=9 where id=$1',[saved.id]),/zusammen gespeichert/);
    await assert.rejects(db.query('delete from time_entries where team_work_order_id=$1',[saved.id]),/gemeinsamen Arbeitsschein/);
  });
  await test('Removing a coworker and an extra shift removes only their former linked times',async()=>{
    await save({...order,id:saved.id},[periods[0]]);
    assert.equal((await db.query('select count(*) n from time_entries')).rows[0].n,1);
    await admin();assert.equal((await db.query('select count(*) n from time_entries')).rows[0].n,1);
  });
  await actor('business');
  await test('Team planning is assigned to every member and can be confirmed by a coworker',async()=>{
    await db.query('insert into appointments(id,employee_id,event_date,customer_id,customer_name,title,notes,team_employee_ids) values($1,$2,$3,$4,$5,$6,$7,$8)',[ids.plan,ids.anna,'2026-10-06',ids.customer,'Klostermanns Hof','Teamauftrag','ZE-PLAN-1:'+JSON.stringify({start:'08:00',end:'10:00',status:'planned'}),[ids.max]]);
    await actor('max');assert.equal((await db.query('select * from appointments')).rows.length,1);
    await db.query('select confirm_team_appointment($1)',[ids.plan]);
    assert.match((await db.query('select notes from appointments')).rows[0].notes,/confirmed/);
  });
  await test('Coworker completes planned work once and both accounts get their own shifts',async()=>{
    const planned=await save({...order,work_date:'2026-10-06'},[periods[0],periods[2]],[],ids.plan);
    assert.equal(planned.id,ids.plan);
    assert.match((await db.query('select notes from appointments')).rows[0].notes,/completed/);
    await assert.rejects(save({...order,work_date:'2026-10-06'},[periods[0],periods[2]],[],ids.plan),/bereits abgeschlossen/);
  });
  await actor('anna');
  await test('Full deletion removes the common order, positions and all participant times',async()=>{
    await db.query('select delete_team_work_order($1)',[ids.plan]);await admin();
    assert.equal((await db.query('select count(*) n from time_entries where team_work_order_id=$1',[ids.plan])).rows[0].n,0);
    assert.equal((await db.query('select count(*) n from work_order_items where work_order_id=$1',[ids.plan])).rows[0].n,0);
    assert.match((await db.query('select notes from appointments')).rows[0].notes,/cancelled/);
  });
  await actor('anna');
  await test('A stale editor cannot recreate a deleted order',async()=>{
    await assert.rejects(save({...order,id:ids.plan,work_date:'2026-10-06'},[periods[0],periods[2]]),/zwischenzeitlich gelöscht/);
  });
  await actor('business');
  await test('Team planning cannot assign an employee from another company',async()=>{
    await assert.rejects(db.query('insert into appointments(employee_id,event_date,customer_id,customer_name,title,notes,team_employee_ids) values($1,$2,$3,$4,$5,$6,$7)',[ids.anna,'2026-10-07',ids.customer,'Klostermanns Hof','Ungültige Planung','ZE-PLAN-1:'+JSON.stringify({status:'planned'}),[ids.felix]]),/derselben Firma/);
  });
  await actor('anna');
  await test('An employee cannot clear coworker assignment through the legacy endpoint',async()=>{
    await assert.rejects(db.query("update appointments set team_employee_ids='{}' where id=$1",[ids.plan]),/Nur die Geschäftsleitung/);
  });
  console.log(JSON.stringify({passed,productionWrites:0}));await db.close();
}
main().catch(e=>{console.error(e.message,e.detail||'');process.exit(1)});

