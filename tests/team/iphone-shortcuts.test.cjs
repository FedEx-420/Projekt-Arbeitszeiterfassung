// Run this addition after the complete pre-existing regression suite.
const {spawnSync}=require('node:child_process');
for(const file of require('../../package.json').iphoneTestFiles){
 const result=spawnSync(process.execPath,[file],{stdio:'inherit',env:process.env});
 if(result.status!==0)process.exit(result.status||1);
}
