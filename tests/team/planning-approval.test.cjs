const assert=require('node:assert/strict');
const {fixture}=require('./team-db-fixture.cjs');
async function main() {
  const {db,ids,actor,admin}=await fixture();let passed=0;
  const payload={employee_id:ids.anna,team_employee_ids:[ids.max],event_date:'2026-10-05',customer_id:ids.customer,title:'Vorschlag mit zwei Mitarbeitern',start:'08:00',end:'10:00',priority:'high',details:'Bitte Schlüssel abholen.'};
  const save=async(data=payload,revision=null)=>(await db.query('select to_jsonb(save_planning_request($1,$2)) result',[JSON.stringify(data),revision])).rows[0].result;
  const review=async(request,action='approve',note='')=>(await db.query('select to_jsonb(review_planning_request($1,$2,$3,$4)) result',[request.id,request.revision,action,note])).rows[0].result;
  async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
  let request;
  try {
    await actor('anna');
    await test('Employee submits a private proposal with multiple participants, but creates no plan or hours',async()=>{
      request=await save();assert.equal(request.status,'pending');
      assert.equal((await db.query('select * from appointments')).rows.length,0);
      assert.equal((await db.query('select * from work_orders')).rows.length,0);
      assert.equal((await db.query('select * from time_entries')).rows.length,0);
    });
    await test('Employee cannot bypass review by directly inserting a published appointment',async()=>{
      await assert.rejects(db.query("insert into appointments(employee_id,event_date,title,notes) values($1,'2026-10-05','Bypass','')",[ids.anna]),/freigegeben/);
      await assert.rejects(db.query("update planning_requests set status='approved' where id=$1",[request.id]),/permission denied/);
    });
    await test('Proposal cannot use another employee as its submitter, foreign team member or customer',async()=>{
      await assert.rejects(save({...payload,employee_id:ids.max}),/eigene/);
      await assert.rejects(save({...payload,team_employee_ids:[ids.felix]}),/derselben Firma/);
      await assert.rejects(save({...payload,customer_id:ids.otherCustomer}),/Kunden dieser Firma/);
    });
    await test('Invalid quarter-hours and reverse times are rejected server-side',async()=>{
      await assert.rejects(save({...payload,start:'08:07'}),/Viertelstunden/);
      await assert.rejects(save({...payload,end:'07:00'}),/Viertelstunden/);
    });
    await actor('max');
    await test('An assigned coworker cannot see or approve an unpublished proposal',async()=>{
      assert.equal((await db.query('select * from planning_requests')).rows.length,0);
      await assert.rejects(review(request),/Geschäftsleitung/);
    });
    await actor('otherBusiness');
    await test('Other companies cannot read, modify or approve a proposal',async()=>{
      assert.equal((await db.query('select * from planning_requests')).rows.length,0);
      await assert.rejects(save({...payload,id:request.id},request.revision),/nicht verfügbar/);
      await assert.rejects(review(request),/Geschäftsleitung/);
    });
    await actor('business');
    await test('Company chief sees the proposal and receives its inbox notification atomically',async()=>{
      assert.equal((await db.query('select * from planning_requests')).rows.length,1);
      const mail=(await db.query('select * from mailbox_messages')).rows;assert.equal(mail.length,1);assert.equal(mail[0].body.planning_request_id,request.id);
    });
    await test('Chief can edit the proposal without publishing it; stale edits are rejected',async()=>{
      const previous=request;request=await save({...payload,id:request.id,title:'Vom Chef überarbeitet',end:'11:00'},request.revision);
      assert.equal(request.revision,2);assert.equal(request.title,'Vom Chef überarbeitet');
      assert.equal((await db.query('select * from appointments')).rows.length,0);
      await assert.rejects(save({...payload,id:request.id},previous.revision),/inzwischen geändert/);
      await assert.rejects(review(previous),/inzwischen geändert/);
    });
    await test('Approval publishes exactly the edited shared plan without booking hours',async()=>{
      const approved=await review(request);assert.equal(approved.status,'approved');
      const plans=(await db.query('select * from appointments')).rows;assert.equal(plans.length,1);assert.equal(plans[0].title,'Vom Chef überarbeitet');assert.equal(plans[0].id,request.id);assert.deepEqual(plans[0].team_employee_ids,[ids.max]);
      assert.equal((await db.query('select * from time_entries')).rows.length,0);
      await review(request);assert.equal((await db.query('select * from appointments')).rows.length,1);
      await actor('max');assert.equal((await db.query('select * from appointments')).rows.length,1);
      await actor('anna');assert.equal((await db.query('select * from mailbox_messages where recipient_id=$1',[ids.anna])).rows.length,1);
    });
    let rejected;
    await actor('anna');rejected=await save({...payload,event_date:'2026-10-06'});
    await actor('business');
    await test('Rejection leaves no published plan and sends the reason to the submitter',async()=>{
      rejected=await review(rejected,'reject','Zeit bitte abstimmen');assert.equal(rejected.status,'rejected');
      assert.equal((await db.query('select * from appointments where id=$1',[rejected.id])).rows.length,0);
      await actor('anna');const mail=(await db.query('select * from mailbox_messages where recipient_id=$2 and body->>\'planning_request_id\'=$1',[rejected.id,ids.anna])).rows;assert.match(mail[0].body.message,/Zeit bitte abstimmen/);
    });
    await test('Rejected proposals can be corrected and resubmitted; employees cannot self-approve',async()=>{
      rejected=await save({...payload,id:rejected.id,event_date:'2026-10-06',start:'09:00',end:'10:00'},rejected.revision);assert.equal(rejected.status,'pending');
      await assert.rejects(review(rejected),/Geschäftsleitung/);
    });
    await test('Own pending proposal can be withdrawn and cannot be subsequently approved',async()=>{
      const withdrawn=await review(rejected,'withdraw');assert.equal(withdrawn.status,'withdrawn');
      await actor('business');await assert.rejects(review(withdrawn),/nicht mehr offen/);
    });
    await actor('anna');const conflict=await save({...payload,start:'09:00',end:'10:00'});
    await actor('business');
    await test('Approval rechecks conflicts against the current published plans',async()=>{
      await assert.rejects(review(conflict),/bereits einen geplanten Auftrag/);
      assert.equal((await db.query('select status from planning_requests where id=$1',[conflict.id])).rows[0].status,'pending');
    });
    await actor('anna');const sickRequest=await save({...payload,event_date:'2026-10-07'});
    await admin();await db.query("insert into work_days(employee_id,work_date,sick) values($1,'2026-10-07',1)",[ids.max]);await actor('business');
    await test('New sickness between submission and approval blocks the complete publication',async()=>{
      await assert.rejects(review(sickRequest),/krank/);assert.equal((await db.query('select * from appointments where id=$1',[sickRequest.id])).rows.length,0);
    });
    await actor('anna');
    await test('Sick days, approved vacation and NRW holidays also block new proposals',async()=>{
      await assert.rejects(save({...payload,event_date:'2026-10-07'}),/krank/);
      await assert.rejects(save({...payload,event_date:'2026-12-25'}),/Feiertagen/);
      await admin();await db.query("insert into vacation_requests(employee_id,start_date,end_date,status) values($1,'2026-10-08','2026-10-08','approved')",[ids.max]);await actor('anna');
      await assert.rejects(save({...payload,event_date:'2026-10-08'}),/Urlaub/);
    });
    await admin();await db.query("update profiles set labor_type='aushilfe' where id=$1",[ids.anna]);await actor('anna');let helper=await save({...payload,event_date:'2026-10-09',team_employee_ids:[]});await actor('admin');
    await test('Aushilfe submits normally and the administrator can approve it',async()=>{
      helper=await review(helper);assert.equal(helper.status,'approved');
    });
    await admin();await db.exec('set role anon');
    await test('Anonymous users cannot read proposals or invoke either workflow endpoint',async()=>{
      await assert.rejects(db.query('select * from planning_requests'),/permission denied/);
      await assert.rejects(save(),/permission denied/);await assert.rejects(review(request),/permission denied/);
    });
    console.log(JSON.stringify({passed,productionWrites:0}));
  } finally {await db.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
