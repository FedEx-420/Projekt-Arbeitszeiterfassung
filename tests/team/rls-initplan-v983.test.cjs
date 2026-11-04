const assert=require('node:assert/strict'),fs=require('node:fs'),{fixture}=require('./team-db-fixture.cjs');
(async()=>{const {db,ids,actor,admin,save}=await fixture();try{
 await actor('anna');const order=await save();await actor('business');
 await db.query("insert into appointments(employee_id,event_date,title,team_employee_ids) values($1,'2026-11-04','Fixture team planning',$2)",[ids.anna,[ids.anna,ids.max]]);
 async function access(){const out={};for(const role of ['anna','max','felix','business','otherBusiness','admin']){
  await actor(role);const planning=(await db.query('select id from appointments order by id')).rows;
  const insert=async employee=>{await db.exec('begin');try{await db.query("insert into work_order_documents(work_order_id,employee_id,file_path,file_name) values($1,$2,'fixture.pdf','fixture.pdf')",[order.id,employee]);await db.exec('rollback');return true;}catch{await db.exec('rollback');return false;}};
  out[role]={planning,own:await insert(ids[role]),forged:await insert(ids.felix)};
 }return out;}
 const before=await access();await admin();await db.exec(fs.readFileSync('supabase/migrations/20261104124139_planning_document_rls_initplans_v983.sql','utf8'));const after=await access();
 assert.deepEqual(after,before,'optimization must preserve access for all company/team roles');
 assert.equal(after.anna.own,true);assert.equal(after.max.own,true);assert.equal(after.felix.own,false);assert.equal(after.anna.forged,false);assert.equal(after.otherBusiness.own,false);
 assert.equal(after.max.planning.length,1);assert.equal(after.felix.planning.length,0);
 await actor('max');const plan=await db.query('explain (format json) select * from appointments');assert.match(JSON.stringify(plan.rows),/InitPlan/);
 console.log('PASS RLS initplans: unchanged planning and attachment permissions across six actors, spoofed employee and foreign company denied, statement identity InitPlan verified; isolated database only');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
