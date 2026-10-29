/* Real browser downloads and manager quotation UI with disposable PostgreSQL. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright'),{PDFDocument}=require('pdf-lib'),{fixture}=require('./team-db-fixture.cjs');
const directory=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(directory,'app-v800.js'),'utf8').replace(/\}\)\(\);\s*$/,`window.__appTest={state,render,reload,timeAccountReport,offersFeature,planningPdfData};})();`);
const output=process.env.PDF_QA_OUTPUT_DIR||path.join(os.tmpdir(),'worktime-pdf-qa-v857');fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(name==='config.js'){res.setHeader('Content-Type','application/javascript');return res.end('window.WORKTIME_CONFIG={supabaseUrl:"https://test.invalid",supabasePublishableKey:"test"}');}
  if(name==='app-v800.js'){res.setHeader('Content-Type','application/javascript');return res.end(source);}
  if(name==='service-worker.js'){res.statusCode=404;return res.end();}
  const file=path.resolve(directory,name);if(!file.startsWith(directory+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));
});
async function main(){
  const {db,ids,actor,admin}=await fixture({legacyRecords:true,offers:true,units:true,catalog:true});let releaseImport;let current='business',queue=Promise.resolve(),passed=0,saveCalls=0,failSave=false,failOffers=false,failCatalog=false;const errors=[];
  await admin();await db.query('update customers set custom_fields=$1 where id=$2',[JSON.stringify({first_name:'Peter',street:'Teststraße',house_no:'12',postal_code:'44135',city:'Dortmund',email:'peter@example.test'}),ids.customer]);
  await db.query("insert into work_days(employee_id,work_date,sick) values($1,'2026-10-07',1)",[ids.anna]);
  await db.query("insert into vacation_requests(employee_id,start_date,end_date,status) values($1,'2026-10-08','2026-10-09','approved'),($1,'2026-10-14','2026-10-16','requested')",[ids.anna]);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Berlin',serviceWorkers:'block',acceptDownloads:true}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',route=>{
      const request=route.request(),url=new URL(request.url());if(url.hostname==='127.0.0.1')return route.continue();if(url.hostname!=='test.invalid')return route.abort();
      queue=queue.then(async()=>{
        const method=request.method(),body=request.postDataJSON(),send=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value,(key,value)=>['work_date','event_date','start_date','end_date','offer_date','valid_until'].includes(key)&&typeof value==='string'?value.slice(0,10):value)});
        try{
          await actor(current);
          if(url.pathname==='/functions/v1/mailbox-send'&&body.action==='recipients')return send({recipients:[]});
          if(url.pathname.includes('/rpc/')){
            const name=url.pathname.split('/').at(-1);
            if(name==='work_order_team_context')return send((await db.query('select work_order_team_context($1) result',[body.p_company])).rows[0].result);
            if(name==='current_business_branding')return send([{id:ids.business,company_name:'Elektro Test & Partner'}]);
            if(name==='save_offer_v857'){saveCalls++;if(failSave)return send({message:'Test: Verbindung unterbrochen'},503);return send((await db.query('select to_jsonb(save_offer_v857($1::jsonb,$2)) result',[JSON.stringify(body.p_data),body.p_revision])).rows[0].result);}
            if(name==='delete_offer_v857')return send((await db.query('select delete_offer_v857($1,$2) result',[body.p_id,body.p_revision])).rows[0].result);
            if(/^import_material_catalog_v(?:911|921|925)$/.test(name))return new Promise(resolve=>{releaseImport=async()=>{await send({catalog_import_version:911,standard_price_source:'recommended_price_1',company_id:body.p_company,created:body.p_rows.length,updated:0,unchanged:0});resolve();};});
            throw Error('Unexpected RPC '+name);
          }
          const table=url.pathname.split('/').at(-1),tables=['profiles','customers','appointments','planning_requests','mailbox_messages','work_days','vacation_requests','time_entries','work_orders','work_order_items','materials','work_order_documents','offers'];
          if(method!=='GET')throw Error('Unexpected mutation '+table);
          if(!tables.includes(table))return send([]);if(table==='offers'&&failOffers)return send({message:'Test: offline'},503);if(failCatalog&&['customers','materials'].includes(table))return send({message:'Test: Katalog vorübergehend offline'},503);
          const params=[],conditions=[];for(const [field,value] of url.searchParams)if(value.startsWith('eq.')&&/^[a-z_]+$/.test(field)){params.push(value.slice(3));conditions.push(field+'=$'+params.length);}
          const where=conditions.length?' where '+conditions.join(' and '):'',rows=(await db.query('select * from '+table+where+' limit '+Number(url.searchParams.get('limit')||1000)+' offset '+Number(url.searchParams.get('offset')||0),params)).rows;
          if(table==='profiles')rows.forEach(row=>{row.company_name=row.id===ids.otherBusiness?'Andere Firma':'Elektro Test & Partner';row.display_name={anna:'Anna Müller',max:'Max Meister',business:'Geschäftsleitung',admin:'Administrator'}[row.username]||row.username;});
          return send(rows);
        }catch(error){return send({message:error.message},400);}
      });return queue;
    });
    await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!!window.__appTest);
    async function role(name,view='offers'){
      await queue;await admin();const profile=(await db.query('select * from profiles where id=$1',[ids[name]])).rows[0];current=name;profile.display_name=name==='anna'?'Anna Müller':name;profile.company_name='Elektro Test & Partner';
      await page.evaluate(async({profile,company,employee,view})=>{const app=window.__appTest;Object.assign(app.state,{profile,session:{user:{id:profile.id},access_token:'synthetic'},businessId:company,employeeId:employee,view,date:'2026-10-05',month:'2026-10',notice:null,menu:false,offerId:''});await app.reload();app.render();},{profile,company:ids.business,employee:ids.anna,view});
    }
    const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
    const form=()=>page.locator('form[data-form="offer"]');
    async function download(click,filename){const pending=page.waitForEvent('download');await click();const item=await pending;assert.match(item.suggestedFilename(),/\.pdf$/);const file=path.join(output,filename);await item.saveAs(file);const bytes=fs.readFileSync(file);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok((await PDFDocument.load(bytes)).getPageCount()>0);assert.equal(new URL(page.url()).hostname,'127.0.0.1');return file;}
    await role('business');



    await context.route('https://assets.example.test/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5V0AAAAASUVORK5CYII=','base64')}));
    await page.evaluate(()=>{const app=window.__appTest,company=app.state.businessId;app.state.view='materials';const source=[['h0','Berker S.1 HDMI High Definition Steckdose polarweiß matt'],['h1','Berker S.1 USB-Ladesteckdose polarweiß matt'],['bp','Berker LS-Schalter C20 1P 6kA'],['a','Hager Leitungsschutzschalter B16 1P 6kA'],['b','Hager Leitungsschutzschalter C16 1P 6kA'],['c','Hager Leitungsschutzschalter B10 1P 6kA'],['d','Hager FI-Schalter 40A 30mA Typ A 4P'],['e','Hager FI/LS B16 30mA Typ A 1P+N 6kA'],['s1','Berker S.1 SCHUKO Steckdose reinweiß glänzend mit erhöhtem Berührungsschutz'],['s2','Berker S.1 SCHUKO Steckdose reinweiß glänzend ohne erhöhten Berührungsschutz'],['s3','Berker S.1 SCHUKO Steckdose schwarz matt mit erhöhtem Berührungsschutz'],['s4','Berker S.1/B.3/B.7 SCHUKO Steckdose reinweiß glänzend mit erhöhtem Berührungsschutz']];app.state.rows.materials.push(...source.map(([id,name])=>({id,business_id:company,name,catalog_product_name:name,unit:'Stk',active:true,unit_price:4,purchase_price:2,catalog_supplier:'Testgroßhandel',catalog_article_number:id,catalog_manufacturer:name.startsWith('Hager')?'Hager':'Berker',catalog_category:(name.startsWith('Hager')||id==='bp')?'Verteilung und Schutzgeräte':'Schaltermaterial',catalog_gtin:null,catalog_features:{},catalog_image_url:id==='a'?'https://assets.example.test/a.png':null,catalog_revision:1})));app.render();window.__guideSubmits=0;document.querySelector('#app').addEventListener('submit',()=>window.__guideSubmits++);});
    await page.locator('[data-material-start="manufacturer"]').click();await page.locator('[data-material-filter="manufacturer"]').selectOption('Berker');
    await test('starting at a manufacturer with mixed products asks for the article category first',async()=>{assert.equal(await page.locator('[data-assistant-category="Schaltermaterial"]').count(),1);});
    await page.locator('[data-assistant-category="Schaltermaterial"]').click();await page.locator('[data-spec-key="switch_kind"][data-spec-value="Steckdose"]').click();
    await test('socket function is asked before series and color',async()=>{assert.match(await page.locator('[data-product-assistant]').innerText(),/Welche Funktion soll die Steckdose haben/);assert.equal(await page.locator('[data-spec-key="socket_use"][data-spec-value="HDMI / Video"]').count(),1);});
    await page.locator('[data-spec-key="socket_use"][data-spec-value="Strom / SCHUKO"]').click();
    await test('normal power sockets are shown without scrolling through HDMI or USB-only articles',async()=>{const ids=await page.locator('[data-action="edit-material"]').evaluateAll(nodes=>nodes.map(n=>n.dataset.id));assert.deepEqual(ids.sort(),['s1','s2','s3','s4']);assert.ok(!ids.includes('h0'));assert.ok(!ids.includes('h1'));});await page.locator('[data-material-reset]').click();
    await page.locator('[data-material-filter="category"]').selectOption('Verteilung und Schutzgeräte');
    await test('selecting protection devices automatically starts the relevant product questions',async()=>{assert.match(await page.locator('[data-product-assistant]').innerText(),/Welche Schutzfunktion/);assert.ok(await page.locator('[data-spec-key="protection"][data-spec-value="MCB"]').count());});
    await page.locator('[data-spec-key="protection"][data-spec-value="MCB"]').click();await page.locator('[data-spec-key="curve"][data-spec-value="B"]').click();await page.locator('[data-spec-key="rated_a"][data-spec-value="16"]').click();
    await test('protection type, B curve and 16 A narrow the result to the correct LS article',async()=>{assert.equal(await page.locator('[data-action="edit-material"]').count(),1);assert.equal(await page.locator('[data-action="edit-material"]').getAttribute('data-id'),'a');assert.match(await page.locator('.product-feature-chips').innerText(),/LS-Kennlinie: B/);});
    await test('an actual catalog image appears beside its article and missing photos are explicit',async()=>{assert.equal(await page.locator('.product-visual img').getAttribute('src'),'https://assets.example.test/a.png');assert.equal(await page.locator('.product-visual img').getAttribute('referrerpolicy'),'no-referrer');});
    await page.locator('[data-material-filter="category"]').selectOption('Verteilung und Schutzgeräte');await page.locator('[data-spec-key="protection"][data-spec-value="RCD"]').click();
    await test('FI questions ask for rated current and residual milliamperes without an LS curve',async()=>{assert.match(await page.locator('[data-product-assistant]').innerText(),/Bemessungsstrom/);assert.equal(await page.locator('[data-spec-key="curve"]').count(),0);await page.locator('[data-spec-key="rated_a"][data-spec-value="40"]').click();assert.match(await page.locator('[data-product-assistant]').innerText(),/Bemessungsfehlerstrom/);assert.equal(await page.locator('[data-spec-key="residual_ma"][data-spec-value="30"]').innerText(),'30 mA');});
    await page.locator('[data-material-filter="category"]').selectOption('Schaltermaterial');await page.locator('[data-spec-key="switch_kind"][data-spec-value="Steckdose"]').click();await page.locator('[data-spec-key="socket_use"][data-spec-value="Strom / SCHUKO"]').click();await page.locator('[data-spec-key="series"][data-spec-value="S.1"]').click();await page.locator('[data-spec-key="color"][data-spec-value="Reinweiß"]').click();await page.locator('[data-spec-key="finish"][data-spec-value="glänzend"]').click();await page.locator('[data-spec-key="touch"][data-spec-value="Ja"]').click();
    await test('switch series, color, finish and touch protection exclude the wrong variants',async()=>{const ids=await page.locator('[data-action="edit-material"]').evaluateAll(nodes=>nodes.map(n=>n.dataset.id));assert.deepEqual(ids.sort(),['s1','s4']);assert.match(await page.locator('.product-photo-missing').first().innerText(),/Kein Artikelfoto hinterlegt/);assert.equal(await page.evaluate(()=>window.__guideSubmits),0);});
    await page.locator('[data-flow-next]').click();await test('common guidance moves to an input without submitting anything',async()=>{assert.equal(await page.evaluate(()=>document.activeElement?.hasAttribute('data-material-filter')),true);assert.equal(await page.evaluate(()=>window.__guideSubmits),0);});
    for(const width of [320,390,1366])await test('product questions and common guidance fit '+width+' pixels',async()=>{await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));});
    await test('all main app sections have three understandable workflow steps',async()=>{const result=await page.evaluate(()=>{const root=document.createElement('div');document.body.append(root);const state={profile:{id:'test'},businessId:'test',view:'home'},guide=window.WorktimeAppFlow.create({root,state});let count=0;for(const view of Object.keys(window.WorktimeAppFlow.flows)){state.view=view;root.innerHTML='<section class="page-head"><h2>Test</h2></section><form><label>Eingabe<input name="test" required></label></form>';guide.afterRender();if(root.querySelectorAll('[data-app-flow] li').length!==3)throw Error(view);count++;}root.remove();return count;});assert.ok(result>=17);});
    await page.setViewportSize({width:390,height:844});await page.locator('[data-material-browser]').screenshot({path:path.join(directory,'../../product-assistant-v928-mobile.png')});await page.setViewportSize({width:1366,height:1000});await page.locator('[data-material-browser]').screenshot({path:path.join(directory,'../../product-assistant-v928-desktop.png')});

    await test('catalogs have a dedicated permitted menu and no import panel in materials',async()=>{await page.evaluate(()=>{__appTest.state.view='materials';__appTest.render();});assert.equal(await page.locator('.supplier-catalog').count(),0);assert.equal(await page.locator('[data-cw-source]').isChecked(),false);await page.locator('[data-cw-source]').check();assert.equal(await page.locator('[data-cw-choose]').count(),1);await page.evaluate(()=>{__appTest.state.view='catalogs';__appTest.render();});await page.locator('[name="cw_master"]').waitFor();assert.equal(await page.locator('[name="supplier_price_policy"]').count(),0);});
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,productionWrites:0}));await context.close();
  }finally{await browser.close();await new Promise(r=>server.close(r));await db.close();}
}
main().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
