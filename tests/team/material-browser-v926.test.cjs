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


    await page.evaluate(()=>{const app=window.__appTest;app.state.view='materials';for(let i=0;i<500;i++)app.state.rows.materials.push({id:'catalog-'+i,business_id:app.state.businessId,name:(i%4===0?'Knipex':'Wera')+' Schraubendreher '+i,unit:'Stk',active:true,unit_price:4,purchase_price:2,catalog_supplier:i%3===0?'Großhändler A':'Großhändler B',catalog_article_number:String(i).padStart(6,'0'),catalog_manufacturer:i%4===0?'Knipex':'Wera',catalog_category:i%2===0?'Werkzeug':'Schaltermaterial',catalog_gtin:null,catalog_revision:1});app.render();});
    await test('initial material view renders search controls and no infinite material cards',async()=>{assert.equal(await page.locator('[data-material-browser]').count(),1);assert.equal(await page.locator('[data-action="edit-material"]').count(),0);assert.match(await page.locator('[data-material-result-count]').innerText(),/Wähle eine Gruppe/);});
    await page.locator('[data-material-filter="category"]').selectOption('Werkzeug');
    await test('a category reveals only the first 20 matching products',async()=>{assert.equal(await page.locator('[data-action="edit-material"]').count(),20);assert.match(await page.locator('[data-material-result-count]').innerText(),/250 passende Artikel/);});
    await page.locator('[data-material-filter="manufacturer"]').selectOption('Knipex');await page.locator('[data-material-filter="supplier"]').selectOption('Großhändler B');await page.locator('[data-material-query]').fill('000044');
    await test('category, manufacturer, wholesaler and article-number search combine',async()=>{assert.equal(await page.locator('[data-action="edit-material"]').count(),1);assert.equal(await page.locator('[data-action="edit-material"]').getAttribute('data-id'),'catalog-44');assert.equal(await page.locator('[data-material-query]').evaluate(el=>el===document.activeElement),true);});
    await page.locator('[data-material-query]').fill('');await page.locator('[data-material-page="1"]').click();
    await test('pagination replaces cards instead of appending an unbounded list',async()=>{assert.equal(await page.locator('[data-action="edit-material"]').count(),20);assert.ok(!(await page.locator('[data-action="edit-material"]').evaluateAll(nodes=>nodes.map(n=>n.dataset.id))).includes('catalog-4'));});
    await page.locator('[data-material-reset]').click();assert.equal(await page.locator('[data-action="edit-material"]').count(),0);
    await page.locator('[data-material-start="supplier"]').click();await page.locator('[data-material-filter="supplier"]').selectOption('Großhändler A');assert.equal(await page.locator('[data-action="edit-material"]').count(),20);
    for(const width of [320,390,1366])await test('guided material search fits viewport '+width,async()=>{await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));});
    await page.evaluate(()=>{const input=document.querySelector('[name="supplier_file"]'),text='Artikelnummer;Name;Einheit;EK;VK*\nX1;Wera Testwerkzeug;Stk;1,00;2,00\n',file=new File([text],'laufender-katalog.csv');Object.defineProperty(file,'stream',{value:()=>{let sent=false;return new ReadableStream({async pull(controller){if(sent){controller.close();return;}await new Promise(resolve=>window.__releaseFile=resolve);sent=true;controller.enqueue(new TextEncoder().encode(text));}});}});Object.defineProperty(input,'files',{value:[file],configurable:true});input.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.locator('[data-supplier-action="read"]').click();await page.waitForFunction(()=>!!window.__releaseFile);
    await test('file processing remains visibly busy even when scrolled away from the catalog',async()=>{const banner=page.locator('[data-file-operation]');assert.equal(await banner.isVisible(),true);assert.match(await banner.innerText(),/laufender-katalog.csv/);await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));assert.ok(await banner.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));});
    await page.evaluate(()=>window.__releaseFile());await page.locator('.supplier-row').first().waitFor();await page.waitForFunction(()=>document.querySelector('[data-file-operation]')?.hidden===true);
    await test('busy status clears after the file has finished reading',async()=>{assert.equal(await page.locator('[data-file-operation]').isVisible(),false);assert.equal(await page.locator('.supplier-row').count(),1);});
    await page.locator('[name="supplier_name"]').fill('Testvertrieb');await page.locator('[name="supplier_net"]').check();await page.locator('form[data-form="supplier-prepare"] button').click();await page.locator('[data-supplier-prepared]').waitFor();await page.locator('[name="supplier_confirm"]').check();await page.locator('form[data-form="supplier-import"] button').click();
    for(let attempt=0;!releaseImport&&attempt<100;attempt++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(releaseImport);
    await test('saving retains the visible operation banner until the server confirms completion',async()=>{assert.equal(await page.locator('[data-file-operation]').isVisible(),true);assert.match(await page.locator('[data-file-operation]').innerText(),/laufender-katalog.csv/);});
    await releaseImport();await page.waitForFunction(()=>document.querySelector('[data-file-operation]')?.hidden===true);
    await test('after saving the banner clears its filename as well as its busy state',async()=>{assert.equal(await page.locator('[data-file-operation]').isVisible(),false);assert.equal(await page.locator('[data-file-operation]').textContent(),'');});
    await page.evaluate(()=>{const input=document.querySelector('[name="supplier_file"]'),file=new File(['Artikelnummer;Name;Einheit;EK;VK*\n'],'alter-firmenkatalog.csv');Object.defineProperty(file,'stream',{value:()=>new ReadableStream({async pull(controller){await new Promise(resolve=>window.__releaseOldFile=resolve);controller.close();}})});Object.defineProperty(input,'files',{value:[file],configurable:true});input.dispatchEvent(new Event('change',{bubbles:true}));});await page.locator('[data-supplier-action="read"]').click();await page.waitForFunction(()=>!!window.__releaseOldFile);await role('otherBusiness','materials');
    await test('company change clears both the guided search and an old company file status',async()=>{assert.equal(await page.locator('[data-file-operation]').isVisible(),false);assert.equal(await page.locator('[data-file-operation]').textContent(),'');assert.equal(await page.locator('[data-material-query]').inputValue(),'');assert.equal(await page.locator('[data-action="edit-material"]').count(),0);});await page.evaluate(()=>window.__releaseOldFile());
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,productionWrites:0}));await context.close();
  }finally{await browser.close();await new Promise(r=>server.close(r));await db.close();}
}
main().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
