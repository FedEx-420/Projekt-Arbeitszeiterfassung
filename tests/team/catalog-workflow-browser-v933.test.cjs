'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{chromium}=require('playwright');
const dir=path.resolve(__dirname,'../..'),styles=[...fs.readFileSync(path.join(dir,'index.html'),'utf8').matchAll(/<link rel="stylesheet" href="([^"?]+)(?:\?[^"]*)?"/g)].map(m=>m[1]);
const scripts=['catalog-classify-v925.js','product-features-v928.js','catalog-format-v908.js','catalog-import-v909.js','catalog-store-v933.js','catalog-workflow-v933.js'],allowed=new Set([...styles,...scripts]);
const html='<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+styles.map(s=>`<link rel="stylesheet" href="/${s}">`).join('')+'<body><main class="app-shell" id="root"></main>'+scripts.map(s=>`<script src="/${s}"></script>`).join('')+'</body></html>';
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://127.0.0.1').pathname.slice(1);if(!name){res.setHeader('Content-Type','text/html');return res.end(html);}if(!allowed.has(name)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(path.join(dir,name)));});
async function main(){await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 try{const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let dialogs=0;page.on('dialog',d=>{dialogs++;d.accept();});await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto('http://127.0.0.1:'+server.address().port);

 // Isolate the batch/resume regression from the separately tested German evidence policy.
 await page.evaluate(()=>{window.WorktimeGermanProducts={allowed:()=>true,loaded:Promise.resolve(),status:()=> 'Test evidence policy'};const root=document.querySelector('#root'),state={profile:{id:'chief',role:'business'},company:'A',view:'catalogs',rows:{materials:[{id:'seed',business_id:'A',name:'Bestand',unit:'Stk',catalog_gtin:null,catalog_manufacturer:null,catalog_features:null}]}};let wizard;const calls=[];const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const render=()=>{root.innerHTML=wizard.view();wizard.mount();};wizard=WorktimeCatalogWizard.create({root,state,api:async(url,req)=>{if(window.__wizard.hold)await new Promise(r=>window.__wizard.release=r);if(window.__wizard.fail&&calls.length===1)throw Error('Verbindung unterbrochen');calls.push(req.body);for(const row of req.body.p_rows)state.rows.materials.push({...row,id:crypto.randomUUID(),business_id:req.body.p_company,catalog_supplier:req.body.p_supplier,catalog_article_number:row.article_number});return {catalog_import_version:911,standard_price_source:'recommended_price_1',company_id:req.body.p_company,created:req.body.p_rows.length,updated:0,unchanged:0};},reload:async()=>{},render,businessId:()=>state.company,isManager:()=>state.profile.role==='business',escape:esc});window.__wizard={state,wizard,render,calls,fail:false};root.addEventListener('click',e=>{const b=e.target.closest('[data-action="nav"]');if(b){state.view=b.dataset.view;render();}});render();});
 await page.waitForTimeout(100);
 const data='Artikelnummer;Name;Einheit;EK;VK*;VK**;source_list_price;Hersteller;Kategorie\n'+Array.from({length:1060},(_,i)=>`${String(i).padStart(5,'0')};${i<1005?'Wago Klemme':'Berker Steckdose'} ${i};Stk;1,00;${i%2?'':'2,00'};3,00;4,00;${i<1005?'Wago':'Berker'};Installationsmaterial`).join('\n');
 await page.locator('[name="cw_master"]').setInputFiles({name:'catalog.csv',mimeType:'text/csv',buffer:Buffer.from(data)});await page.locator('[data-cw-form="files"] button').click();await page.locator('[data-cw-filter="manufacturer"]').first().waitFor();
 await test('file page disappears and automatic price mapping needs no selling-price question',async()=>{assert.equal(await page.locator('[name="cw_master"]').count(),0);assert.equal(await page.locator('[name="supplier_price_policy"]').count(),0);const cats=await page.evaluate(()=>WorktimeCatalogStore.list('chief:A'));assert.equal(cats[0].count,1060);});
 await page.locator('[data-cw-filter="manufacturer"][value="Wago"]').check();await page.locator('[data-cw-filter="manufacturer"][value="Berker"]').check();await page.locator('[data-cw-filter="manufacturer"][value="Berker"]').uncheck();
 await test('multiple checkbox changes do not restart the reader or hide filter choices',async()=>{assert.equal(await page.locator('[data-cw-form="filters"]').count(),1);assert.equal(await page.locator('[data-catalog-progress]').count(),0);assert.equal(await page.evaluate(()=>__wizard.calls.length),0);});
 for(const width of [320,390,1366]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}await page.screenshot({path:path.join(dir,'../../outputs/Katalog_v933_Filter_Desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:900});await page.screenshot({path:path.join(dir,'../../outputs/Katalog_v933_Filter_Handy.png'),fullPage:true});
 await page.locator('[data-cw-form="filters"] button[type="submit"]').click();await page.locator('[name="cw_supplier"]').waitFor();
 await test('explicit search finds all 1005 matching articles beyond the old cap and hides the filters',async()=>{assert.match(await page.locator('.catalog-wizard').innerText(),/1.005 Artikel übernehmen/);assert.match(await page.locator('.catalog-wizard').innerText(),/Hersteller: Wago/);assert.equal(await page.locator('[data-cw-filter]').count(),0);assert.equal(await page.locator('[data-cw-form="confirm"] input').count(),1);});
 for(const width of [320,390,1366]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await page.locator('[name="cw_supplier"]').fill('Test Fachhandel');await page.locator('[data-cw-form="confirm"] button.primary').click();await page.locator('[name="cw_master"]').waitFor({timeout:30000});
 await test('one confirmation imports every matching article and returns to the file page',async()=>{const calls=await page.evaluate(()=>__wizard.calls);assert.equal(calls.reduce((n,c)=>n+c.p_rows.length,0),1005);assert.ok(calls.every(c=>c.p_rows.length<=25));const rows=calls.flatMap(c=>c.p_rows);assert.equal(rows[0].recommended_price_1,2);assert.equal(rows[1].recommended_price_1,4);assert.equal(rows[0].recommended_price_2,3);assert.equal(rows[0].purchase_price,1);});
 await page.locator('[data-view="supplier-catalogs"]').click();await page.locator('[data-cw="use"]').waitFor();
 await test('stored original and complete index remain in the supplier catalog library',async()=>{assert.match(await page.locator('#root').innerText(),/Test Fachhandel/);const list=await page.evaluate(()=>WorktimeCatalogStore.list('chief:A'));assert.equal(list[0].masterName,'catalog.csv');assert.equal(await page.evaluate(async()=>{const c=(await WorktimeCatalogStore.list('chief:A'))[0];return (await c.master.text()).startsWith('Artikelnummer;');}),true);assert.equal(list[0].resume,null);assert.equal(await page.evaluate(async()=>{const c=(await WorktimeCatalogStore.list('chief:A'))[0];return (await WorktimeCatalogStore.batch('articles',c.id,999,500)).length;}),60);});

 await page.locator('[data-cw="files"]').click();const second='Artikelnummer;Name;Einheit;VK*\n'+Array.from({length:61},(_,i)=>`R${i};Wago zweiter Artikel ${i};Stk;2,00`).join('\n');
 await page.locator('[name="cw_master"]').setInputFiles({name:'resume.csv',mimeType:'text/csv',buffer:Buffer.from(second)});await page.locator('[data-cw-form="files"] button').click();await page.locator('[data-cw-form="filters"] button[type="submit"]').waitFor();await page.locator('[data-cw-form="filters"] button[type="submit"]').click();await page.locator('[name="cw_supplier"]').waitFor();await page.locator('[name="cw_supplier"]').fill('Fortsetzen Fachhandel');
 await page.evaluate(()=>{__wizard.calls.length=0;__wizard.fail=true;});await page.locator('[data-cw-form="confirm"] button.primary').click();await page.locator('[role="alert"]').waitFor();
 await test('a failed second batch retains exactly the 25 confirmed articles and persists its resume marker',async()=>{const cats=await page.evaluate(()=>WorktimeCatalogStore.list('chief:A'));const c=cats.find(c=>c.masterName==='resume.csv');assert.equal(c.resume.saved,25);assert.equal(c.resume.total,61);assert.ok(c.resume.job);});
 await page.locator('[data-view="supplier-catalogs"]').click();const row=page.locator('.row-card').filter({hasText:'Fortsetzen Fachhandel'});await row.locator('[data-cw="use"]').click();await page.locator('[name="cw_supplier"]').waitFor();await page.evaluate(()=>{__wizard.fail=false;});await page.locator('[data-cw-form="confirm"] button.primary').click();await page.locator('[name="cw_master"]').waitFor();
 await test('resume imports only the remaining rows without repeating the confirmed batch',async()=>{const calls=await page.evaluate(()=>__wizard.calls);assert.equal(calls.reduce((n,c)=>n+c.p_rows.length,0),61);assert.equal(new Set(calls.flatMap(c=>c.p_rows).map(r=>r.article_number)).size,61);});
 await page.locator('[data-view="supplier-catalogs"]').click();

 await page.locator('[data-cw="files"]').click();const correction='Artikelnummer;Name;Einheit;VK*\nBAD;Wago unklare Verpackung;SET;2,00\nGOOD;Wago normales Material;Stk;2,00\nUNIT-EMPTY;Wago ohne Einheit;;2,00\nPRICE-EMPTY;Wago ohne VK;Stk;';
 await page.locator('[name="cw_master"]').setInputFiles({name:'correction.csv',mimeType:'text/csv',buffer:Buffer.from(correction)});await page.locator('[data-cw-form="files"] button').click();await page.locator('[data-cw-form="filters"] button[type="submit"]').waitFor();await page.locator('[data-cw-form="filters"] button[type="submit"]').click();await page.locator('[data-cw-form="correct"]').first().waitFor();
 const correctionForm = sku => page.locator('[data-cw-form="correct"]').filter({ hasText: sku });
 await test('missing price and unit name the affected article before saving', async () => {
   assert.equal(await page.locator('[name="cw_supplier"]').count(), 0);
   assert.match(await correctionForm('UNIT-EMPTY').innerText(), /Mengeneinheit fehlt/);
   assert.match(await correctionForm('PRICE-EMPTY').innerText(), /Nettoverkaufspreis VK \* fehlt/);
   assert.doesNotMatch(await correctionForm('BAD').innerText(), /Zeile 2:/);
   await page.locator('[data-cw="skip-issues"]').click();
   await page.locator('[name="cw_supplier"]').waitFor();
   assert.match(await page.locator('.catalog-wizard').innerText(), /1 Artikel übernehmen/);
   assert.match(await page.locator('.catalog-wizard').innerText(), /ausdrücklich ausgelassen/);
 });
 await page.locator('[data-view="supplier-catalogs"]').click();
 await page.locator('.row-card').filter({hasText:'correction.csv'}).locator('[data-cw="use"]').click();
 await page.locator('[data-cw-form="filters"] button[type="submit"]').click();
 await test('skipped articles can be corrected later, including a confirmed zero price', async () => {
   for (const sku of ['BAD', 'UNIT-EMPTY']) {
     const row = correctionForm(sku);
     await row.locator('[name="unit"]').fill('Stk');
     await row.locator('button.primary').click();
     await row.waitFor({ state: 'detached' });
   }
   const row = correctionForm('PRICE-EMPTY');
   await row.locator('[name="recommended_price_1"]').fill('0');
   await row.locator('button.primary').click();
   await page.locator('[name="cw_supplier"]').waitFor();
   assert.match(await page.locator('.catalog-wizard').innerText(), /4 Artikel übernehmen/);
 });
 await page.locator('[data-view="supplier-catalogs"]').click();const removeRow=page.locator('.row-card').filter({hasText:'correction.csv'});const id=await removeRow.locator('[data-cw="delete"]').getAttribute('data-id');const materialCount=await page.evaluate(()=>__wizard.state.rows.materials.length);await removeRow.locator('[data-cw="delete"]').click();await page.waitForFunction(id=>!document.querySelector('[data-cw="delete"][data-id="'+id+'"]'),id);
 await test('deleting a saved catalog clears its index and pending selection but preserves imported materials',async()=>{assert.equal(await page.evaluate(async id=>(await WorktimeCatalogStore.batch('articles',id)).length,id),0);assert.equal(await page.evaluate(()=>__wizard.state.rows.materials.length),materialCount);});

 await test('JSON requires correction before import and preserves zero and price per 100', async () => {
   const rows = [
     {article_number:'JSON-UNIT',name:'Wago JSON ohne Einheit',recommended_price_1:125.5,price_unit:100},
     {article_number:'JSON-PRICE',name:'Wago JSON ohne Verkaufspreis',unit:'Stk',price_unit:1}
   ];
   await page.locator('[data-cw="files"]').click();
   await page.evaluate(() => { __wizard.calls.length = 0; });
   await page.locator('[name="cw_master"]').setInputFiles({name:'correction.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(rows))});
   await page.locator('[data-cw-form="files"] button.primary').click();
   await page.locator('[data-cw-form="filters"] button[type="submit"]').click();
   const unit = correctionForm('JSON-UNIT'), price = correctionForm('JSON-PRICE');
   assert.match(await unit.innerText(), /Mengeneinheit fehlt/);
   assert.match(await price.innerText(), /Nettoverkaufspreis/);
   assert.equal(await page.evaluate(() => __wizard.calls.length), 0);
   await unit.locator('[name="unit"]').fill('Stk');
   await unit.locator('button.primary').click();
   await unit.waitFor({state:'detached'});
   await price.locator('[name="recommended_price_1"]').fill('0');
   await price.locator('button.primary').click();
   await page.locator('[name="cw_supplier"]').fill('JSON Testlieferant');
   await page.locator('[data-cw-form="confirm"] button.primary').click();
   await page.locator('[name="cw_master"]').waitFor();
   const saved = (await page.evaluate(() => __wizard.calls)).flatMap(call => call.p_rows);
   assert.deepEqual(Object.fromEntries(saved.map(row => [row.article_number, row.recommended_price_1])), {
     'JSON-UNIT': 1.255, 'JSON-PRICE': 0
   });
 });

 await test('BMEcat preserves net prices and asks for missing units and net selling prices', async () => {
   const xml = `<BMECAT><HEADER><CATALOG><CURRENCY>EUR</CURRENCY></CATALOG></HEADER>
     <ARTICLE><SUPPLIER_AID>XML-UNIT</SUPPLIER_AID>
       <ARTICLE_DETAILS><DESCRIPTION_SHORT>Wago BMEcat ohne Einheit</DESCRIPTION_SHORT></ARTICLE_DETAILS>
       <ARTICLE_ORDER_DETAILS><PRICE_QUANTITY>100</PRICE_QUANTITY></ARTICLE_ORDER_DETAILS>
       <ARTICLE_PRICE_DETAILS>
         <ARTICLE_PRICE price_type="net_list"><PRICE_AMOUNT>125.50</PRICE_AMOUNT></ARTICLE_PRICE>
         <ARTICLE_PRICE price_type="net_customer"><PRICE_AMOUNT>80.00</PRICE_AMOUNT></ARTICLE_PRICE>
       </ARTICLE_PRICE_DETAILS>
     </ARTICLE>
     <ARTICLE><SUPPLIER_AID>XML-GROSS</SUPPLIER_AID>
       <ARTICLE_DETAILS><DESCRIPTION_SHORT>Wago BMEcat nur Bruttoempfehlung</DESCRIPTION_SHORT></ARTICLE_DETAILS>
       <ARTICLE_ORDER_DETAILS><ORDER_UNIT>C62</ORDER_UNIT><PRICE_QUANTITY>1</PRICE_QUANTITY></ARTICLE_ORDER_DETAILS>
       <ARTICLE_PRICE_DETAILS><ARTICLE_PRICE price_type="nrp"><PRICE_AMOUNT>11.90</PRICE_AMOUNT></ARTICLE_PRICE></ARTICLE_PRICE_DETAILS>
     </ARTICLE></BMECAT>`;
   await page.evaluate(() => { __wizard.calls.length = 0; });
   await page.locator('[name="cw_master"]').setInputFiles({name:'correction.xml',mimeType:'application/xml',buffer:Buffer.from(xml)});
   await page.locator('[data-cw-form="files"] button.primary').click();
   await page.locator('[data-cw-form="filters"] button[type="submit"]').click();
   const unit = correctionForm('XML-UNIT'), price = correctionForm('XML-GROSS');
   assert.match(await unit.innerText(), /Mengeneinheit fehlt/);
   assert.match(await price.innerText(), /Nettoverkaufspreis/);
   assert.equal(await price.locator('[name="recommended_price_1"]').inputValue(), '');
   assert.equal(await page.evaluate(() => __wizard.calls.length), 0);
   await unit.locator('[name="unit"]').fill('Stk');
   await unit.locator('button.primary').click();
   await unit.waitFor({state:'detached'});
   await price.locator('[name="recommended_price_1"]').fill('10.00');
   await price.locator('button.primary').click();
   await page.locator('[name="cw_supplier"]').fill('BMEcat Testlieferant');
   await page.locator('[data-cw-form="confirm"] button.primary').click();
   await page.locator('[name="cw_master"]').waitFor();
   const saved = (await page.evaluate(() => __wizard.calls)).flatMap(call => call.p_rows);
   assert.deepEqual(saved.map(row => [row.article_number, row.unit, row.purchase_price ?? null, row.recommended_price_1]), [
     ['XML-UNIT', 'Stk', 0.8, 1.255], ['XML-GROSS', 'Stk', null, 10]
   ]);
 });

 const dn5Row = (sku, name, unit, amount) => {
   const fields = Array(30).fill('');
   Object.assign(fields, {0:'A',1:'N',2:sku,3:name,5:unit,6:'1',7:'100',8:amount});
   return fields.join(';');
 };
 for (const [version, source] of [
   [4, ['V'.padEnd(123, ' ') + '04EUR',
     'A;N;0004;;Wago fehlende Einheit;;1;2;;12550;RG;WG;LG',
     'A;N;0005;;Wago fehlender Preis;;1;2;ST;0;RG;WG;LG']],
   [5, ['V;050;A;20261025;EUR;Test;;TEST;Testlieferant;;;;;;;',
     dn5Row('0004','Wago fehlende Einheit','','12550'),
     dn5Row('0005','Wago fehlender Preis','ST','0'), 'E;4;Ende;']]
 ]) {
   await test(`DATANORM ${version} corrects missing fields without losing the exact SKU or price basis`, async () => {
     await page.evaluate(() => { __wizard.calls.length = 0; });
     await page.locator('[name="cw_master"]').setInputFiles({name:'DATANORM.001',mimeType:'text/plain',buffer:Buffer.from(source.join('\r\n'))});
     await page.locator('[data-cw-form="files"] button.primary').click();
     await page.locator('[data-cw-form="filters"] button[type="submit"]').click();
     const unit = correctionForm('0004'), price = correctionForm('0005');
     assert.match(await unit.innerText(), /Mengeneinheit fehlt/);
     assert.match(await price.innerText(), /Nettoverkaufspreis/);
     assert.equal(await page.evaluate(() => __wizard.calls.length), 0);
     await unit.locator('[name="unit"]').fill('Stk');
     await unit.locator('button.primary').click();
     await unit.waitFor({state:'detached'});
     await price.locator('[name="recommended_price_1"]').fill('210.00');
     await price.locator('button.primary').click();
     await page.locator('[name="cw_supplier"]').fill(`DATANORM ${version} Testlieferant`);
     await page.locator('[data-cw-form="confirm"] button.primary').click();
     await page.locator('[name="cw_master"]').waitFor();
     const saved = (await page.evaluate(() => __wizard.calls)).flatMap(call => call.p_rows);
     assert.deepEqual(saved.map(row => [row.article_number, row.unit, row.recommended_price_1]), [
       ['0004', 'Stk', 1.255], ['0005', 'Stk', 2.1]
     ]);
   });
 }

 const scopeFile='Artikelnummer;Name;Einheit;VK*\n'+Array.from({length:40},(_,i)=>`S${i};Wago Kontowechsel ${i};Stk;2,00`).join('\n');await page.locator('[name="cw_master"]').setInputFiles({name:'scope.csv',mimeType:'text/csv',buffer:Buffer.from(scopeFile)});await page.locator('[data-cw-form="files"] button').click();await page.locator('[data-cw-form="filters"] button[type="submit"]').waitFor();await page.locator('[data-cw-form="filters"] button[type="submit"]').click();await page.locator('[name="cw_supplier"]').waitFor();await page.locator('[name="cw_supplier"]').fill('Nur Firma A');await page.evaluate(()=>{__wizard.calls.length=0;__wizard.hold=true;});await page.locator('[data-cw-form="confirm"] button.primary').click();await page.waitForFunction(()=>typeof __wizard.release==='function');await page.evaluate(()=>{__wizard.state.company='B';__wizard.state.view='supplier-catalogs';__wizard.render();__wizard.hold=false;__wizard.release();});await page.waitForTimeout(200);
 await test('company switch confirms the in-flight atomic batch only for its original company and sends no further batch',async()=>{const a=await page.evaluate(()=>WorktimeCatalogStore.list('chief:A'));assert.equal(a.find(c=>c.masterName==='scope.csv').resume.saved,25);assert.equal(await page.evaluate(()=>__wizard.calls.length),1);assert.equal(await page.evaluate(()=>__wizard.calls[0].p_company),'A');assert.equal(await page.locator('[data-cw="use"]').count(),0);});
 await page.evaluate(()=>{__wizard.state.company='B';__wizard.render();});await page.waitForTimeout(100);assert.equal(await page.locator('[data-cw="use"]').count(),0);
 await test('another company cannot see the saved catalog',async()=>{assert.match(await page.locator('#root').innerText(),/Noch keine Kataloge/);});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,productionWrites:0}));await context.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
