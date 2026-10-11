const fs=require('node:fs'),path=require('node:path');
const {multiWorkFixture}=require('./multi-work-fixture.cjs');
const migration='20261011142852_owntracks_weekdays_v874.sql';
async function weekdaysFixture(){
 const f=await multiWorkFixture();await f.actor('anna');
 const legacy=(await f.db.query('select create_owntracks_device_v871($1,$2,360,1200) r',['40000000-0000-4000-8000-000000000099','a'.repeat(64)])).rows[0].r;
 await f.admin();const old=(await f.db.query('select to_jsonb(d) r from app_private.owntracks_devices_v871 d where id=$1',[legacy.id])).rows[0].r;
 await f.db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',migration),'utf8'));
 return {...f,legacy,legacyBefore:old};
}
module.exports={weekdaysFixture,migration};
