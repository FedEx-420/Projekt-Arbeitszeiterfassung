/* Full offer editor, synthetic data, no remote writes. Optional pinned baseline comparison. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process'),{chromium}=require('playwright');
const dir=path.resolve(__dirname,'../..'),baseline=process.env.OFFER_BASELINE_REF;
const changed=new Set(['article-tools-v959.js','offers-v857.js','product-features-v928.js','catalog-ui-v908.js','german-products-v936.js','supplier-stock-v948.js']);
const app=(baseline?cp.execFileSync('git',['show',baseline+':app-v800.js'],{cwd:dir,maxBuffer:10000000}).toString():fs.readFileSync(path.join(dir,'app-v800.js'),'utf8')).replace('if (state.session?.access_token) loadApp(); else render();','/* Isolated fixture */').replace(/\}\)\(\);\s*$/,'window.__offerQA={state,render};})();');
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local'),name=u.pathname.slice(1)||'index.html';if(name==='service-worker.js'){res.statusCode=404;return res.end();}if(name==='config.js'){res.setHeader('Content-Type','application/javascript');return res.end('window.WORKTIME_CONFIG={supabaseUrl:"https://test.invalid",supabasePublishableKey:"synthetic"}');}const file=path.resolve(dir,name);if(!file.startsWith(dir+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(name==='app-v800.js'?app:baseline&&changed.has(name)?cp.execFileSync('git',['show',baseline+':'+name],{cwd:dir,maxBuffer:10000000}):fs.readFileSync(file));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});page.setDefaultTimeout(20000);
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!!window.__offerQA);
 const renderMs=await page.evaluate(()=>{const a=__offerQA,profile={id:'admin',role:'administrator',username:'Fixture'};
 Object.assign(a.state,{session:{user:{id:'admin'},access_token:'synthetic'},profile,businessId:'company',employeeId:'admin',view:'offers'});a.state.rows.people=[profile,{id:'company',role:'business',company_name:'Fixture'}];
 a.state.rows.materials=Array.from({length:30000},(_,i)=>({id:'m'+i,business_id:'company',name:i===29999?'Berker Wechselschalter-Einsatz':'Berker Kontrollwechselschalter Einsatz '+i,catalog_manufacturer:'Berker',catalog_supplier:'Fixture',catalog_article_number:'SKU'+i,unit:'Stk',active:true,unit_price:2,recommended_price_1:3}));
 a.state.rows.materials.push({id:'foreign',business_id:'foreign-company',name:'Wechselschalter',unit:'Stk',active:true,unit_price:1});
 const start=performance.now();a.render();return performance.now()-start;});
 const menus=await page.evaluate(()=>{const a=__offerQA,rows=a.state.rows.materials;let reads=0;a.state.rows.materials=new Proxy(rows,{get(target,key,receiver){if(/^\d+$/.test(String(key)))reads++;return Reflect.get(target,key,receiver);}});const out=[];for(const view of ['home','customers','settings','offers']){a.state.view=view;const before=reads,start=performance.now();for(let i=0;i<5;i++)a.render();out.push({view,material_reads:reads-before,render_ms:Math.round(performance.now()-start)});}return out;});
 console.log(JSON.stringify({menus}));
 if(!baseline)assert.ok(menus.every(m=>m.material_reads===0),'menus without article fields must not scan the material table');
 await page.locator('[data-action="offer-new"]').click();
 const input=page.locator('[data-offer-name]').first();
 const searchStart=performance.now();
 const dispatch=await input.evaluate(el=>{const values=['W','We','Wec','Wech','Wechselschalter'],times=[];for(const value of values){el.value=value;const start=performance.now();el.dispatchEvent(new Event('input',{bubbles:true}));times.push(performance.now()-start);}return times;});
 await page.locator('[data-article-input-choice="m29999"]').waitFor();const resultMs=performance.now()-searchStart;
 assert.equal(await page.locator('[data-article-input-choice]').first().getAttribute('data-article-input-choice'),'m29999');
 assert.equal(await page.locator('[data-article-input-choice="foreign"]').count(),0);
 if(!baseline){assert.equal(await page.locator('#offer-materials option').count(),0);assert.ok(Math.max(...dispatch)<150,'typing should not synchronously scan 30000 articles');}
 if(!baseline){for(const width of [320,390,844,1366,1920]){await page.setViewportSize({width,height:1000});const layout=await page.locator('[data-article-input-results]').evaluate(box=>{const parent=box.parentElement.getBoundingClientRect(),r=box.getBoundingClientRect(),button=box.querySelector('[data-article-input-choice]').getBoundingClientRect();return {width:r.width,parent:parent.width,button:button.width,overflow:document.documentElement.scrollWidth>innerWidth+1};});assert.ok(layout.width>layout.parent*.85,JSON.stringify({width,...layout}));assert.ok(layout.button>180,JSON.stringify({width,...layout}));assert.equal(layout.overflow,false);}
 await page.screenshot({path:path.join(dir,'tests/team/offer-results-v984.png'),fullPage:true});}
 await page.locator('[data-article-input-choice="m29999"]').click();
 assert.equal(await page.locator('[data-offer-line]').first().getAttribute('data-material-id'),'m29999');assert.equal(await page.locator('[data-offer-price]').first().inputValue(),'3');
 console.log(JSON.stringify({mode:baseline||'current',articles:30000,menus,render_ms:Math.round(renderMs),results_ms:Math.round(resultMs),input_dispatch_ms:dispatch.map(Math.round),longest_input_ms:Math.round(Math.max(...dispatch))}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
