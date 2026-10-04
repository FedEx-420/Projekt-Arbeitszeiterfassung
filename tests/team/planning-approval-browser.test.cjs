/* Real isolated database/RLS with browser workflow and downloadable PDF. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright');
const {fixture}=require('./team-db-fixture.cjs');
const directory=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(directory,'app-v800.js'),'utf8').replace(/\}\)\(\);\s*$/,`window.__appTest={state,render,reload,planningRows,planningRequests,planningPdfData};})();`);
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(name==='config.js'){res.setHeader('Content-Type','application/javascript');return res.end('window.WORKTIME_CONFIG={supabaseUrl:"https://test.invalid",supabasePublishableKey:"test"}');}
  if(name==='app-v800.js'){res.setHeader('Content-Type','application/javascript');return res.end(source);}
  if(name==='service-worker.js'){res.statusCode=404;return res.end();}
  const file=path.resolve(directory,name);if(!file.startsWith(directory+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));
});
async function main(){
  const {db,ids,actor,admin}=await fixture();let current='anna',queue=Promise.resolve(),passed=0;const errors=[];
  await admin();await db.query("update customers set custom_fields=$1 where id=$2",[JSON.stringify({street:'Teststraße',house_no:'12',city:'Münster',postal_code:'48143'}),ids.customer]);
  await db.query("update profiles set labor_type='aushilfe' where id=$1",[ids.anna]);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true}),page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.type()==='confirm'?dialog.accept():dialog.dismiss());
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());if(url.hostname==='127.0.0.1')return route.continue();
      if(url.hostname!=='test.invalid')return route.abort();
      queue=queue.then(async()=>{
        const request=route.request(),body=request.postDataJSON(),method=request.method();
        const send=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value,(key,value)=>['work_date','event_date','start_date','end_date'].includes(key)&&typeof value==='string'?value.slice(0,10):value)});
        try{
          await actor(current);
          if(url.pathname==='/functions/v1/mailbox-send')return send(body.action==='recipients'?{recipients:[]}:{success:true});
          if(url.pathname.includes('/rpc/')){
            const name=url.pathname.split('/').at(-1);let value;
            if(name==='work_order_team_context')value=(await db.query('select work_order_team_context($1) result',[body.p_company])).rows[0].result;
            else if(name==='current_business_branding')value=[{id:ids.business,company_name:'Firma Test & Partner'}];
            else if(name==='save_planning_request')value=(await db.query('select to_jsonb(save_planning_request($1,$2)) result',[JSON.stringify(body.p_data),body.p_revision])).rows[0].result;
            else if(name==='review_planning_request')value=(await db.query('select to_jsonb(review_planning_request($1,$2,$3,$4)) result',[body.p_id,body.p_revision,body.p_action,body.p_note])).rows[0].result;
            else throw Error('Unexpected RPC '+name);
            return send(value);
          }
          const table=url.pathname.split('/').at(-1),tables=['profiles','customers','appointments','planning_requests','mailbox_messages','work_days','vacation_requests','work_orders','time_entries','work_order_items','materials','work_order_documents'];
          if(!tables.includes(table))return send([]);
          const params=[],conditions=[];for(const [field,value]of url.searchParams)if(value.startsWith('eq.')&&/^[a-z_]+$/.test(field)){params.push(value.slice(3));conditions.push(field+'=$'+params.length);}
          const where=conditions.length?' where '+conditions.join(' and '):'';
          if(method==='GET')return send((await db.query('select * from '+table+where+' limit '+Number(url.searchParams.get('limit')||1000)+' offset '+Number(url.searchParams.get('offset')||0),params)).rows);
          throw Error('Unexpected mutation '+method+' '+table);
        }catch(error){return send({message:error.message},400);}
      });return queue;
    });
    await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!!window.__appTest);
    async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
    async function role(name){await queue;await admin();const profile=(await db.query('select * from profiles where id=$1',[ids[name]])).rows[0];current=name;
      await page.evaluate(async({profile,company})=>{const a=window.__appTest;Object.assign(a.state,{profile,session:{user:{id:profile.id},access_token:'synthetic'},businessId:company,employeeId:'00000000-0000-4000-8000-000000000004',view:'planning',date:'2026-10-05',month:'2026-10',planWeek:'2026-10-05',planId:'',planForm:false,planPdfForm:false,notice:null});await a.reload();a.render();},{profile,company:ids.business});}
    const submit=async(value='save')=>{await page.locator('form[data-form="planning"] button[value="'+value+'"]').click();await page.waitForFunction(()=>!window.__appTest.state.busy);};
    await role('anna');
    await test('Aushilfe can propose a team assignment on a mobile screen without publishing permissions',async()=>{
      await page.locator('[data-action="plan-new"]').click();assert.equal(await page.locator('select[name="employee"] option').count(),1);assert.equal(await page.locator('button[value="approve"]').count(),0);
      await page.locator('[name="customer"]').fill('Klostermanns Hof');await page.locator('[name="title"]').fill('Vorschlag - Licht montieren');await page.locator('[name="event_date"]').fill('2026-10-05');await page.locator('[name="start"]').fill('08:00');await page.locator('[name="end"]').fill('10:00');
      await page.locator('.team-choice summary').click();await page.locator('[data-plan-team-choice]').check();await page.locator('[name="details"]').fill('Schlüssel im Büro abholen.');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await submit();assert.match(await page.locator('.notice').innerText(),/zur Freigabe/);
      assert.equal(await page.locator('.plan-card').count(),0);assert.equal(await page.locator('.plan-requests [data-action="plan-open"]').count(),1);
      assert.equal(await page.evaluate(()=>window.__appTest.state.rows.entries.length),0);
    });
    const id=await page.evaluate(()=>window.__appTest.state.rows.planningRequests[0].id);
    await role('max');
    await test('Coworker sees neither the unpublished proposal nor a work-order draft',async()=>{assert.equal(await page.locator('.plan-card').count(),0);assert.equal(await page.locator('.plan-requests').count(),0);});
    await role('business');
    await test('Chief edits the pending request before explicit approval and has an inbox notification',async()=>{
      assert.equal(await page.evaluate(()=>window.__appTest.state.rows.messages.length),1);await page.locator('.plan-requests [data-action="plan-open"]').click();
      await page.locator('[name="title"]').fill('Vom Chef geprüft - Licht montieren');await page.locator('[name="end"]').fill('11:00');await submit();
      assert.equal(await page.locator('.plan-card').count(),0);await page.locator('.plan-requests [data-action="plan-open"]').click();assert.equal(await page.locator('[name="end"]').inputValue(),'11:00');
      await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(__dirname,'planning-approval-desktop.png'),fullPage:true});
      await submit('approve');assert.match(await page.locator('.notice').innerText(),/genehmigt und veröffentlicht/);assert.equal(await page.locator('.plan-card').count(),2);assert.equal(await page.locator('.plan-requests').count(),0);
    });
    await role('anna');
    await test('Approved plan appears immediately for submitter with the edited times and no booked hours',async()=>{assert.equal(await page.locator('.plan-card').count(),1);assert.match(await page.locator('.plan-card').innerText(),/08:00 – 11:00/);await page.locator('.plan-card').click();assert.equal(await page.locator('[data-action="plan-confirm"]').count(),1);assert.equal(await page.evaluate(()=>window.__appTest.state.rows.entries.length),0);});
    await role('business');
    await test('Planning PDF selects an exact range, groups shared assignments once and remains in the app',async()=>{
      await page.locator('[data-action="plan-pdf-toggle"]').click();await page.locator('[name="from"]').fill('2026-10-05');await page.locator('[name="to"]').fill('2026-10-11');
      const promise=page.waitForEvent('download');await page.locator('form[data-form="planning-pdf"] button').click();const download=await promise;
      const output=process.env.PDF_QA_OUTPUT_DIR || path.join(os.tmpdir(),'worktime-pdf-qa');fs.mkdirSync(output,{recursive:true});const filename=path.join(output,download.suggestedFilename());await download.saveAs(filename);await page.waitForFunction(()=>!window.__appTest.state.busy);
      assert.equal(fs.readFileSync(filename).subarray(0,5).toString(),'%PDF-');assert.match(await page.locator('.notice').innerText(),/PDF wurde erstellt/);assert.match(page.url(),/^http:\/\/127\.0\.0\.1:/);assert.equal(await page.locator('form[data-form="planning-pdf"]').isVisible(),true);
      const values=await page.evaluate(()=>{const a=window.__appTest;return {included:a.planningPdfData('2026-10-05','2026-10-11').days.flatMap(d=>d.orders),excluded:a.planningPdfData('2026-10-06','2026-10-11').days.flatMap(d=>d.orders)};});
      assert.equal(values.included.length,1);assert.match(values.included[0].people,/anna, max/);assert.equal(values.excluded.length,0);assert.match(values.included[0].address,/Teststraße 12 48143 Münster/);
      console.log('PDF_QA_OUTPUT '+filename);
    });
    await test('Inverted and excessive PDF ranges produce a readable error without downloading',async()=>{
      await page.locator('[name="from"]').fill('2026-10-11');await page.locator('[name="to"]').fill('2026-10-05');await page.locator('form[data-form="planning-pdf"] button').click();await page.waitForFunction(()=>!window.__appTest.state.busy);assert.match(await page.locator('.notice.error').innerText(),/gültigen Zeitraum/);
      await page.locator('[name="from"]').fill('2025-01-01');await page.locator('[name="to"]').fill('2026-12-31');await page.locator('form[data-form="planning-pdf"] button').click();await page.waitForFunction(()=>!window.__appTest.state.busy);assert.match(await page.locator('.notice.error').innerText(),/366 Tage/);
    });
    await role('max');await page.setViewportSize({width:390,height:844});
    await test('Coworker can see the approved shared plan and a personal PDF view only',async()=>{
      assert.equal(await page.locator('.plan-card[data-id="'+id+'"]').count(),1);await page.locator('[data-action="plan-pdf-toggle"]').click();assert.equal(await page.evaluate(()=>window.__appTest.planningPdfData('2026-10-05','2026-10-11').days.flatMap(d=>d.orders).length),1);await page.screenshot({path:path.join(__dirname,'planning-approval-mobile.png'),fullPage:true});
    });
    await test('PDF renders a large logo, long notes, repeated page headers and a month transition',async()=>{
      const bytes=await page.evaluate(async()=>{
        const data=window.__appTest.planningPdfData('2026-09-28','2026-10-11');data.company='Testbetrieb Elektro & Partner';
        const canvas=document.createElement('canvas');canvas.width=550;canvas.height=180;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,550,180);ctx.fillStyle='#075d59';ctx.font='bold 40px Arial';ctx.fillText('ELEKTRO TEST',30,105);data.logoBytes=Uint8Array.from(atob(canvas.toDataURL('image/jpeg').split(',')[1]),char=>char.charCodeAt(0));
        for(let index=0;index<data.days.length;index++)data.days[index].orders=[{time:'07:30 - 11:45 Uhr',customer:'Klostermanns Hof',title:'Beleuchtung überprüfen und Montage durchführen',people:'Anna Beispiel, Max Mustermann',status:'Geplant',priority:'Hoch',address:'Teststraße 12, 48143 Münster',details:'Bitte Schlüssel im Büro abholen. '.repeat(index===0?90:3),actual:''}];
        return Array.from(await window.PlanningPdf.create(data));
      });
      const output=process.env.PDF_QA_OUTPUT_DIR || path.join(os.tmpdir(),'worktime-pdf-qa');fs.mkdirSync(output,{recursive:true});const filename=path.join(output,'Planung_Layoutpruefung.pdf');fs.writeFileSync(filename,Buffer.from(bytes));console.log('PDF_QA_OUTPUT '+filename);
    });
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,productionWrites:0,runtimeErrors:0}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));await db.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
