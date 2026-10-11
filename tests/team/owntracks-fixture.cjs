const fs=require('node:fs'),path=require('node:path');
const {iphoneFixture}=require('./iphone-shortcuts-fixture.cjs');
const migration='20261011063806_owntracks_arrivals_v871.sql';
async function owntracksFixture(){const f=await iphoneFixture();await f.admin();await f.db.query("update customers set custom_fields=$1",[JSON.stringify({street:'Teststraße',house_no:'1',postal_code:'12345',city:'Teststadt'})]);const before=await f.snapshot();await f.db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',migration),'utf8'));return {...f,before};}
module.exports={owntracksFixture,migration};
