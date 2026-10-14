const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./team-db-fixture.cjs');
async function main(){
 const {db,ids,actor,admin}=await fixture({legacyRecords:true});let passed=0;
 const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 const info=(company,revision,details={name:'Testfirma'})=>db.query('select to_jsonb(save_company_legal_info_v900($1,$2,$3::jsonb)) data',[company,revision,JSON.stringify(details)]);
 const append=(company,rev,documents)=>db.query('select to_jsonb(d) data from append_company_legal_documents_v900($1,$2,$3::jsonb) d',[company,rev,JSON.stringify(documents)]);
 const draft=(kind='privacy',version=0)=>({kind,expected_version:version,content:'Entwurf, keine rechtliche Abnahme.',status:'draft'});
 try{
  await admin();await db.exec('alter function app_private.fixture_manager(uuid) set search_path=public,pg_temp');const before=JSON.stringify((await db.query("select jsonb_build_object('profiles',(select jsonb_agg(p order by id) from profiles p),'times',(select jsonb_agg(t order by id) from time_entries t),'orders',(select jsonb_agg(w order by id) from work_orders w)) data")).rows);
  for(const file of ['20261013232648_creator_account_policy_v900.sql','20261014085106_company_documents_v900.sql'])await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',file),'utf8'));
  await actor('business');await info(ids.business,0);await append(ids.business,1,[draft()]);
  await check('Business can save its own company information and draft, not a foreign company',async()=>{assert.equal((await db.query('select * from company_legal_documents_v900')).rows.length,1);await assert.rejects(info(ids.otherBusiness,0),/permission/);await assert.rejects(append(ids.otherBusiness,1,[draft()]),/permission/);});
  await check('Stale information and document versions are rejected without overwriting',async()=>{await assert.rejects(info(ids.business,9),/changed/);await assert.rejects(append(ids.business,1,[draft('privacy',0)]),/changed/);assert.equal((await db.query('select content from company_legal_documents_v900')).rows[0].content,draft().content);});
  await check('Draft bundles are atomic when any later document is invalid',async()=>{await assert.rejects(append(ids.business,1,[draft('imprint'),draft('not-valid')]),/check constraint/);assert.equal((await db.query('select count(*)::int n from company_legal_documents_v900')).rows[0].n,1);});
  await check('Null, empty and oversized document batches are rejected',async()=>{for(const batch of [null,[],Array.from({length:7},()=>draft('imprint'))])await assert.rejects(append(ids.business,1,batch),/One to six/);});
  await actor('anna');
  await check('Employees see neither draft documents nor private company form data and cannot write them',async()=>{assert.equal((await db.query('select * from company_legal_documents_v900')).rows.length,0);assert.equal((await db.query('select * from company_legal_info_v900')).rows.length,0);await assert.rejects(info(ids.business,0),/permission/);await assert.rejects(append(ids.business,1,[draft()]),/permission/);});
  await actor('business');
  await check('A review without real reviewer/date/evidence/confirmation cannot be recorded',async()=>{for(const changed of [{reviewer:''},{review_date:null},{evidence:''},{confirmed:false},{review_date:'2099-01-01'}])await assert.rejects(append(ids.business,1,[{...draft('privacy',1),status:'released',reviewer:'Tatsächlich prüfende Person',review_date:'2026-10-01',evidence:'Schriftlicher Vermerk im firmeneigenen Archiv',confirmed:true,...changed}]));});
  await append(ids.business,1,[{...draft('privacy',1),status:'released',reviewer:'Synthetische Testperson - kein realer Prüfnachweis',review_date:'2026-10-01',evidence:'Nur isolierter Datenbanktest',confirmed:true}]);
  await actor('anna');await check('Employee sees only the current explicitly released document of their own firm',async()=>{const rows=(await db.query('select * from company_legal_documents_v900')).rows;assert.equal(rows.length,1);assert.equal(rows[0].version,2);assert.equal(rows[0].company_id,ids.business);});
  await actor('felix');await check('Foreign-company employee sees no other company release',async()=>assert.equal((await db.query('select * from company_legal_documents_v900')).rows.length,0));
  await actor('business');await info(ids.business,1,{name:'Neue tatsächliche Angabe'});
  await actor('anna');await check('Changing company information withdraws the previous release from employee view',async()=>assert.equal((await db.query('select * from company_legal_documents_v900')).rows.length,0));
  await actor('business');await append(ids.business,2,[draft('privacy',2)]);
  await check('Draft editing keeps all older versions, with no delete/update grant',async()=>{assert.equal((await db.query('select * from company_legal_documents_v900 order by version')).rows.length,3);await assert.rejects(db.query('update company_legal_documents_v900 set content=\'changed\''),/permission/);await assert.rejects(db.query('delete from company_legal_documents_v900'),/permission/);});
  await check('Identity, timestamps and consecutive versions are server-stamped',async()=>{const row=(await db.query('select * from company_legal_documents_v900 order by version desc limit 1')).rows[0];assert.equal(row.created_by,ids.business);await assert.rejects(db.query("insert into company_legal_documents_v900(company_id,kind,version,info_revision,content) values($1,'privacy',99,2,'x')",[ids.business]),/changed/);});
  await actor('admin');await check('Existing pinned founder can administer both firms without a second account',async()=>{await info(ids.otherBusiness,0);await append(ids.otherBusiness,1,[draft('imprint')]);assert.equal((await db.query('select * from company_legal_info_v900')).rows.length,2);});
  await db.exec('set role anon');await check('Anonymous access is denied for both tables and write RPCs',async()=>{await assert.rejects(db.query('select * from company_legal_info_v900'),/permission/);await assert.rejects(db.query('select * from company_legal_documents_v900'),/permission/);await assert.rejects(info(ids.business,0),/permission/);});
  await admin();await check('All original profiles, orders and times are untouched',async()=>assert.equal(JSON.stringify((await db.query("select jsonb_build_object('profiles',(select jsonb_agg(p order by id) from profiles p),'times',(select jsonb_agg(t order by id) from time_entries t),'orders',(select jsonb_agg(w order by id) from work_orders w)) data")).rows),before));
  console.log(`${passed} document/RLS checks passed. Only disposable synthetic data used.`);
 }finally{await db.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
