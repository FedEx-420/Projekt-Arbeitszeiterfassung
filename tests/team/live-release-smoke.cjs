/* Public production smoke test: no sign-in and no production data mutation. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { chromium } = require('playwright');
const directory = path.resolve(__dirname, '../..');
const base = 'https://fedex-420.github.io/Projekt-Arbeitszeiterfassung/';
const version = '854';
async function get(url) {
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, 'Public resource failed: ' + new URL(url).pathname);
  return response.text();
}
async function main() {
  const scope = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'config.js'), 'utf8'), scope, { timeout: 500 });
  const config = scope.window.WORKTIME_CONFIG;
  assert.ok(config.supabasePublishableKey);
  if (config.supabasePublishableKey.split('.').length === 3) {
    assert.equal(JSON.parse(Buffer.from(config.supabasePublishableKey.split('.')[1], 'base64url').toString()).role, 'anon', 'Only a public client key is allowed');
  }
  for (const [name,body] of Object.entries({work_order_team_context:{p_company:null},work_order_team_roster:{p_company:null},save_team_work_order:{p_order:{},p_periods:[],p_items:[],p_plan_id:null},confirm_team_appointment:{p_id:'00000000-0000-4000-8000-000000000000'},delete_team_work_order:{p_id:'00000000-0000-4000-8000-000000000000'},save_planning_request:{p_data:{},p_revision:null},review_planning_request:{p_id:'00000000-0000-4000-8000-000000000000',p_revision:1,p_action:'approve',p_note:''}})) {
    const response = await fetch(config.supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    const data = await response.json();
    assert.ok([401,403].includes(response.status), name+' must deny anonymous access');
    assert.equal(data.code,'42501',name+' must exist and enforce its execution privilege');
    console.log('PASS Live RPC exists and denies anonymous access: '+name);
  }
  if(process.argv.includes('--backend-only')) return;
  const index=await get(base+'?version='+version+'&verify='+Date.now());
  assert.match(index,/app-v800\.js\?v=854/);
  assert.match(index,/planning-pdf\.js\?v=854/);
  const worker=await get(base+'service-worker.js?verify='+version+'-'+Date.now());
  assert.match(worker,/arbeitszeit-neu-v854/);
  const bundle=await get(base+'app-v800.js?v='+version);
  assert.equal(bundle.replace(/\r\n/g,'\n'),fs.readFileSync(path.join(directory,'app-v800.js'),'utf8').replace(/\r\n/g,'\n'),'Published application matches the tested source');
  for (const file of ['planning-pdf.js?v=854','vendor/pdf-lib-1.17.1.min.js']) assert.equal((await get(base+file)).replace(/\r\n/g,'\n'),fs.readFileSync(path.join(directory,file.split('?')[0]),'utf8').replace(/\r\n/g,'\n'));
  console.log('PASS Published v854 index, cache, application and PDF modules match the tested release');
  const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  try {
    const context=await browser.newContext({serviceWorkers:'block'}), page=await context.newPage(), errors=[], failed=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400) failed.push(new URL(r.url()).pathname+' '+r.status());});
    for(const [name,viewport] of [['mobile',{width:390,height:844}],['desktop',{width:1440,height:1000}]]) {
      await page.setViewportSize(viewport);
      await page.goto(base+'?version='+version+'&smoke='+Date.now(),{waitUntil:'networkidle'});
      await page.locator('form[data-form="login"]').waitFor();
      assert.equal(await page.locator('input[name="company"]').count(),1);
      assert.equal(await page.locator('input[name="username"]').count(),1);
      assert.equal(await page.locator('input[name="password"]').count(),1);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'No horizontal overflow on '+name);
      await page.screenshot({path:path.join(__dirname,'live-login-'+name+'.png'),fullPage:true});
      console.log('PASS Live '+name+' login renders without horizontal overflow');
    }
    assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
    console.log(JSON.stringify({productionWrites:0,runtimeErrors:errors.length,failedAssets:failed.length}));
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
