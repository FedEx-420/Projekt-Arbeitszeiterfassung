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
  const {db,ids,actor,admin}=await fixture({legacyRecords:true,offers:true,units:true,catalog:true});let current='business',queue=Promise.resolve(),passed=0,saveCalls=0,failSave=false,failOffers=false,failCatalog=false;const errors=[];
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

    await page.evaluate(()=>{const app=window.__appTest;app.state.rows.materials.push({id:'11111111-1111-4111-8111-111111111111',business_id:app.state.businessId,name:'Interner Name A',catalog_product_name:'Gemeinsamer Testartikel',unit:'Stk',active:true,unit_price:4,recommended_price_1:4,purchase_price:2,catalog_supplier:'Händler A',catalog_article_number:'0001',catalog_gtin:'04006381333931'},{id:'22222222-2222-4222-8222-222222222222',business_id:app.state.businessId,name:'Interner Name B',catalog_product_name:'Anderer Lieferantentext',unit:'Stk',active:true,unit_price:6,recommended_price_1:6,purchase_price:3,catalog_supplier:'Händler B',catalog_article_number:'9999',catalog_gtin:'04006381333931'});app.render();});
    await page.locator('[data-action="offer-new"]').click();
    await form().locator('[data-offer-name]').fill('Gemeinsamer Testartikel');
    await test('one product suggestion opens two wholesaler offers with their own EK and VK star',async()=>{assert.equal(await page.locator('#offer-materials option[value="Gemeinsamer Testartikel"]').count(),1);assert.equal(await form().locator('[data-offer-supplier] option').count(),2);assert.match(await form().locator('[data-offer-supplier-wrap]').innerText(),/Händler A.*2,00.*Händler B.*3,00/s);});
    await form().locator('[data-offer-supplier]').selectOption('22222222-2222-4222-8222-222222222222');
    await test('supplier choice changes exact material ID, human description and net price',async()=>{assert.equal(await form().locator('[data-offer-line]').getAttribute('data-material-id'),'22222222-2222-4222-8222-222222222222');assert.equal(await form().locator('[data-offer-price]').inputValue(),'6');assert.equal(await form().locator('[data-offer-name]').inputValue(),'Anderer Lieferantentext');});
    await page.evaluate(()=>window.__appTest.render());
    await test('supplier choice survives a rerender and does not duplicate the product suggestion',async()=>{assert.equal(await form().locator('[data-offer-supplier]').inputValue(),'22222222-2222-4222-8222-222222222222');assert.equal(await form().locator('[data-offer-price]').inputValue(),'6');});
    for(const width of [320,390,1366])await test('supplier controls fit viewport '+width,async()=>{await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));});
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,productionWrites:0}));await context.close();
  }finally{await browser.close();await new Promise(r=>server.close(r));await db.close();}
}
main().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
