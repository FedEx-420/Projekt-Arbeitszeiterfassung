const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function main(){
 const source=fs.readFileSync(path.resolve(__dirname,'../../supabase/functions/iphone-arrival/handler.js'),'utf8');
 const {makeIphoneArrivalHandler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 let calls=[],code=null,passed=0;const token='a'.repeat(64),digest=x=>crypto.createHash('sha256').update(x).digest('hex');
 const handler=makeIphoneArrivalHandler({hash:async x=>digest(x),rpc:async(name,args)=>{calls.push({name,args});if(code)throw {code,message:'SECRET PRIVATE DATA'};return {status:args.p_test?'connected':'started',...(args.p_test?{}:{started_at:'2026-10-13T08:00:00Z'})};}});
 const call=(body={event:'arrival'},headers={'X-Worktime-Arrival':token},method='POST',raw)=>handler(new Request('https://test.invalid/functions/iphone-arrival',{method,headers,body:['POST','PUT'].includes(method)?(raw??JSON.stringify(body)):undefined}));
 const test=async(name,fn)=>{calls=[];code=null;await fn();passed++;console.log('PASS '+name);};
 await test('Anonymous, JWT, query-string and malformed capabilities never call database',async()=>{for(const headers of [{},{Authorization:'Bearer valid'},{'X-Worktime-Arrival':'bad'},{'X-Worktime-Arrival':'F'.repeat(64)}])assert.equal((await call(undefined,headers)).status,401);assert.equal(calls.length,0);});
 await test('Only POST at permitted origin; preflight has fixed allowed headers',async()=>{assert.equal((await call(undefined,undefined,'GET')).status,405);assert.equal((await call(undefined,{'X-Worktime-Arrival':token,Origin:'https://evil.test'})).status,403);const res=await call(undefined,{},'OPTIONS');assert.equal(res.headers.get('Access-Control-Allow-Origin'),'https://fedex-420.github.io');assert.equal(calls.length,0);});
 await test('No worker, company, location or timestamp input is accepted',async()=>{for(const body of [{event:'arrival',employee_id:'other'},{event:'arrival',started_at:'past'},{event:'arrival',customer_id:'other'},{event:'arrival',latitude:1},null,[],{event:'stop'},{event:'arrival',extra:'x'.repeat(300)}])assert.equal((await call(body)).status,400);assert.equal((await call(undefined,undefined,'POST','{bad')).status,400);assert.equal(calls.length,0);});
 await test('Narrow hashed capability reaches service RPC, no raw token or JWT',async()=>{const res=await call();assert.equal(res.status,200);assert.deepEqual(calls,[{name:'fire_shortcut_arrival_v870',args:{p_secret_hash:digest(token),p_test:false}}]);assert.doesNotMatch(await res.text(),/aaaa|PRIVATE|employee/);assert.equal(res.headers.get('Cache-Control'),'no-store');});
 await test('Test connection is explicitly non-starting',async()=>{assert.deepEqual(await (await call({event:'test'})).json(),{status:'connected'});assert.equal(calls[0].args.p_test,true);});
 await test('Revoked, role, rate, absence and network errors are safe and bounded',async()=>{for(const [value,status]of [['28000',401],['42501',403],['54000',429],['P0001',409],['other',503]]){code=value;const res=await call();assert.equal(res.status,status);assert.doesNotMatch(await res.text(),/SECRET|PRIVATE|aaaa|stack/);}});
 console.log(JSON.stringify({passed,productionWrites:0}));
}
main().catch(e=>{console.error(e.stack);process.exit(1);});
