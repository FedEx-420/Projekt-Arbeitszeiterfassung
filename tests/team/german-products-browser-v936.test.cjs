const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const dir=path.resolve(__dirname,'../..');
async function main(){const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
 await page.setContent('<meta name="viewport" content="width=device-width"><main id="app"></main>');
 for(const file of ['catalog-products-v921.js','catalog-classify-v925.js','product-features-v928.js','german-products-v936.js','material-browser-v926.js'])await page.addScriptTag({content:fs.readFileSync(path.join(dir,file),'utf8')});
 await page.evaluate(async()=>{await WorktimeGermanProducts.loaded;const app=document.querySelector('#app');window.__state={profile:{id:'manager'},company:'A',view:'materials',rows:{materials:[
 {id:'de',business_id:'A',active:true,name:'Berker S.1 SCHUKO Steckdose',catalog_gtin:'4011334233008',catalog_manufacturer:'Berker',catalog_category:'Schaltermaterial',unit:'Stk'},
 {id:'foreign',business_id:'A',active:true,name:'Berker S.1 Steckdose britisch BS 1363',catalog_gtin:'4011334233008',catalog_manufacturer:'Berker',catalog_category:'Schaltermaterial',unit:'Stk'},
 {id:'unknown',business_id:'A',active:true,name:'Berker S.1 SCHUKO Steckdose ohne Nachweis',catalog_manufacturer:'Berker',catalog_category:'Schaltermaterial',unit:'Stk'},
 {id:'other',business_id:'B',active:true,name:'Andere Firma',catalog_gtin:'4011334233008'}]}};
 const state=__state,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let instance;window.__render=()=>{app.innerHTML=WorktimeMaterialBrowser.view()+WorktimeMaterialBrowser.visible(state.rows.materials).map(m=>'<article data-result="'+m.id+'">'+esc(m.name)+'</article>').join('')+'<datalist id="materials"></datalist><datalist id="offer-materials"></datalist>';};
 instance=WorktimeMaterialBrowser.create({root:app,state,businessId:()=>state.company,isManager:()=>true,render:__render,escape:esc});WorktimeGermanProducts.install({root:app,state,businessId:()=>state.company,render:__render});
 window.__e={market:'DE',document_scope:'electrical-safety',brand:'Berker',sku:'47229909',gtin:'04011334233008',full_name:'Berker S.1 SCHUKO Steckdose',source_url:'https://hager.com/de/katalog/produkt/47229909-test',document_url:'https://assets.hager.com/step-content/test.pdf',document_sha256:'a'.repeat(64),evidence_type:'manufacturer-eu-declaration',type_reference:'47229909',checked_at:new Date().toISOString()};
 WorktimeGermanProducts.setIndex({entries:{one:__e}});__render();});
 await page.locator('[data-material-query]').fill('Berker S1');assert.deepEqual(await page.locator('[data-result]').evaluateAll(ns=>ns.map(n=>n.dataset.result)),['de']);
 assert.match(await page.locator('[data-material-browser]').innerText(),/2 gespeicherte Materialien/);
 assert.deepEqual(await page.locator('#materials option').evaluateAll(ns=>ns.map(n=>n.value)),['Berker S.1 SCHUKO Steckdose']);
 assert.deepEqual(await page.locator('#offer-materials option').evaluateAll(ns=>ns.map(n=>n.value)),['Berker S.1 SCHUKO Steckdose']);
 await page.locator('[data-spec-unknown]').check();assert.equal(await page.locator('[data-result="foreign"],[data-result="unknown"]').count(),0);
 await page.evaluate(()=>{__state.company='B';__render();});await page.locator('[data-material-query]').fill('Andere');assert.deepEqual(await page.locator('[data-result]').evaluateAll(ns=>ns.map(n=>n.dataset.result)),['other']);
 await page.evaluate(()=>WorktimeGermanProducts.setIndex({entries:{}}));assert.equal(await page.locator('[data-result]').count(),0);assert.equal(await page.locator('#materials option').count(),0);
 assert.equal(await page.evaluate(()=>__state.rows.materials.length),4,'existing materials never deleted');assert.deepEqual(errors,[]);console.log('PASS real browser: existing search, hidden foreign and unknown, datalists, company switch, evidence revocation, no deletions');
 }finally{await browser.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
