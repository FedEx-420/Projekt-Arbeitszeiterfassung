const fs=require('node:fs'),path=require('node:path');
const {owntracksFixture}=require('./owntracks-fixture.cjs');
const migration='20261011073844_admin_multi_work_accounts_v873.sql';
async function multiWorkFixture(){
 const f=await owntracksFixture();await f.admin();
 await f.db.exec("alter table profiles add column company_name text; update profiles set company_name=case when username='business' then 'Firma A' when username='otherBusiness' then 'Firma B' else null end");
 const before=await f.snapshot();await f.db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',migration),'utf8'));
 return {...f,before};
}
module.exports={multiWorkFixture,migration};
