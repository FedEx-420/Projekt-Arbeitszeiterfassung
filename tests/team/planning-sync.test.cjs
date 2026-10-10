/* Pure change-check tests. No credentials, network or production data. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.resolve(__dirname,'../../app-v800.js'),'utf8').split('/* BEGIN PLANNING SYNC V867')[1].split('/* END PLANNING SYNC V867 */')[0];
const factory=vm.runInNewContext('/*'+code+';createPlanningSync');
async function main(){let passed=0,scope='employee-a/company-a',stamp='a'.repeat(32),reads=0,fail=false;
 const sync=factory({identity:()=>scope,readStamp:async()=>{reads++;if(fail)throw Error('offline');return {version:1,stamp};}});
 const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 await test('First load and explicit refresh always download all history',async()=>{const p=await sync.begin(true);assert.equal(p.unchanged,false);sync.commit(p);assert.equal((await sync.begin(false)).unchanged,false);});
 await test('Unchanged revision skips payload but still checks server',async()=>{const before=reads;assert.equal((await sync.begin(true)).unchanged,true);assert.equal(reads,before+1);});
 await test('Changed revision is not acknowledged until successful complete load',async()=>{stamp='b'.repeat(32);assert.equal((await sync.begin(true)).unchanged,false);assert.equal((await sync.begin(true)).unchanged,false);sync.commit(await sync.begin(true));assert.equal((await sync.begin(true)).unchanged,true);});
 await test('Changes during download remain discoverable on next check',async()=>{stamp='c'.repeat(32);const p=await sync.begin(true);stamp='d'.repeat(32);sync.commit(p);assert.equal((await sync.begin(true)).unchanged,false);});
 await test('Offline revision endpoint safely falls back to full download',async()=>{fail=true;const p=await sync.begin(true);assert.equal(p.unchanged,false);sync.commit(p);fail=false;assert.equal((await sync.begin(true)).unchanged,false);});
 await test('Unsupported/malformed revisions never hide updates',async()=>{for(const value of [{version:2,stamp:'a'.repeat(32)},{version:1,stamp:''},{version:1,stamp:'<unsafe>'},null]){const s=factory({identity:()=>scope,readStamp:async()=>value});const p=await s.begin(true);s.commit(p);assert.equal((await s.begin(true)).unchanged,false);}});
 await test('Account or company switch refuses an old snapshot',async()=>{const p=await sync.begin();scope='employee-b/company-b';assert.throws(()=>sync.commit(p),/inzwischen/);assert.equal((await sync.begin(true)).unchanged,false);});
 await test('Reload/reset invalidates already running background refresh',async()=>{const p=await sync.begin();sync.reset();assert.throws(()=>sync.assertCurrent(p),/inzwischen/);assert.equal((await sync.begin(true)).unchanged,false);});
 await test('Account switch while stamp request is pending is rejected',async()=>{let resolve;const s=factory({identity:()=>scope,readStamp:()=>new Promise(r=>resolve=r)}),pending=s.begin(true);scope='employee-c/company-c';resolve({version:1,stamp:'a'.repeat(32)});await assert.rejects(()=>pending,/inzwischen/);});
 await test('Reload while stamp request is pending is rejected',async()=>{let resolve;const s=factory({identity:()=>scope,readStamp:()=>new Promise(r=>resolve=r)}),pending=s.begin(true);s.reset();resolve({version:1,stamp:'a'.repeat(32)});await assert.rejects(()=>pending,/inzwischen/);});
 await test('Newer refresh supersedes an older pending payload',async()=>{const first=await sync.begin(),second=await sync.begin();sync.commit(second);assert.throws(()=>sync.commit(first),/inzwischen/);});
 await test('A slow stamp response cannot supersede a later completed refresh',async()=>{const resolvers=[],s=factory({identity:()=>scope,readStamp:()=>new Promise(r=>resolvers.push(r))}),first=s.begin(),second=s.begin();resolvers[1]({version:1,stamp:'b'.repeat(32)});s.commit(await second);resolvers[0]({version:1,stamp:'a'.repeat(32)});await assert.rejects(()=>first,/inzwischen/);});
 console.log(JSON.stringify({passed,productionWrites:0}));
}
main().catch(e=>{console.error(e.stack);process.exit(1);});
