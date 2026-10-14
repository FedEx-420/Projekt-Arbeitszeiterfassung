const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./team-db-fixture.cjs');
const sql=fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261013232648_creator_account_policy_v900.sql'),'utf8');
async function main(){
 const {db,ids,actor,admin}=await fixture({legacyRecords:true});let passed=0;
 const test=async(name,fn)=>{await fn();console.log('PASS '+name);passed++;};
 try{
  await admin();const before=await db.query("select to_jsonb(p) row from profiles p order by id");const times=await db.query('select to_jsonb(t) row from time_entries t order by id');
  await db.exec(sql);
  await test('All existing accounts and recorded times remain byte-for-byte unchanged',async()=>{assert.deepEqual((await db.query('select to_jsonb(p) row from profiles p order by id')).rows,before.rows);assert.deepEqual((await db.query('select to_jsonb(t) row from time_entries t order by id')).rows,times.rows);});
  await test('All current firms are free with immutable client-side protection',async()=>{const rows=(await db.query('select * from company_entitlements_v900')).rows;assert.equal(rows.length,2);assert.ok(rows.every(r=>r.account_policy==='existing_free'&&r.monthly_cents===0));});
  await db.exec('set role anon');
  await test('Anonymous users cannot inspect plans or edit prices',async()=>{await assert.rejects(db.query('select * from platform_policy_v900'),/permission denied/);await assert.rejects(db.query('select save_future_price_v900(0,\'A\',100)'),/permission denied/);});
  await actor('business');
  await test('Business sees only its own plan and cannot change pricing',async()=>{assert.equal((await db.query('select * from company_entitlements_v900')).rows.length,1);assert.equal((await db.query('select * from platform_policy_v900')).rows.length,0);await assert.rejects(db.query("select save_future_price_v900(0,'Unauthorized',1)"),/permission missing/);await assert.rejects(db.query('update company_entitlements_v900 set monthly_cents=1'),/permission denied/);});
  await actor('anna');
  await test('Employee sees only own-company policy and cannot edit it',async()=>{assert.deepEqual((await db.query('select company_id from company_entitlements_v900')).rows.map(r=>r.company_id),[ids.business]);await assert.rejects(db.query("select save_future_price_v900(0,'Unauthorized',1)"),/permission missing/);});
  await actor('admin');
  await test('Creator changes future price without modifying existing free accounts',async()=>{const saved=(await db.query("select to_jsonb(save_future_price_v900(0,' Team ',3990)) s")).rows[0].s;assert.equal(saved.revision,1);assert.equal(saved.future_plan_name,'Team');assert.equal(saved.founder_profile_id,ids.admin);assert.ok((await db.query('select * from company_entitlements_v900')).rows.every(r=>r.monthly_cents===0));});
  await test('Stale edits and invalid prices are rejected',async()=>{await assert.rejects(db.query("select save_future_price_v900(0,'Old',99)"),/Price changed/);await assert.rejects(db.query("select save_future_price_v900(1,'Invalid',-1)"),/check constraint/);await assert.rejects(db.query("select save_future_price_v900(1,' ',0)"),/check constraint/);});
  await test('Clients cannot change founder identity or delete plan protection',async()=>{await assert.rejects(db.query('update platform_policy_v900 set founder_profile_id=$1',[ids.anna]),/permission denied/);await assert.rejects(db.query('delete from platform_policy_v900'),/permission denied/);await assert.rejects(db.query('delete from company_entitlements_v900'),/permission denied/);});
  await admin();const newId='00000000-0000-4000-8000-000000009000';await db.query("insert into profiles(id,username,role) values($1,'New Firm','business')",[newId]);
  await test('New firms receive the current fixed price, never a mutable live reference',async()=>{const row=(await db.query('select * from company_entitlements_v900 where company_id=$1',[newId])).rows[0];assert.equal(row.monthly_cents,3990);assert.equal(row.price_revision,1);assert.equal(row.account_policy,'new_fixed_price');await actor('admin');await db.query("select save_future_price_v900(1,'New price',4990)");assert.equal((await db.query('select monthly_cents from company_entitlements_v900 where company_id=$1',[newId])).rows[0].monthly_cents,3990);});
  await admin();
  await test('Internal assignment function is not callable by authenticated users',async()=>{await actor('admin');await assert.rejects(db.query('select app_private.company_price_snapshot_v900()'),/permission denied/);});
  console.log(`${passed} creator policy checks passed. Production untouched.`);
 }finally{await db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
