const fs=require('node:fs'),path=require('node:path');
const {weekdaysFixture}=require('./owntracks-weekdays-fixture.cjs');
const migration='20261011200850_discard_arrival_measurements_v875.sql';
async function discardFixture(){const f=await weekdaysFixture();await f.admin();await f.db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',migration),'utf8'));return f;}
module.exports={discardFixture,migration};
