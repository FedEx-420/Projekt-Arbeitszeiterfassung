/* Browser -> real isolated PostgreSQL/RLS/RPC, not a pretend successful save. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const {fixture}=require('./team-db-fixture.cjs');
const directory=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(directory,'app-v800.js'),'utf8').replace(/\}\)\(\);\s*$/,`window.__appTest={state,render,reload,collectTeamPeriods,recordedPeriods,dayHours,overtime,orderHours,teamEnabled,printOrderPdf,printBillingPdf,printInvoicePdf,invoiceGroups};})();`);
const server=http.createServer((request,response)=>{
  const name=new URL(request.url,'http://localhost').pathname.slice(1)||'index.html';
  if(name==='config.js'){response.setHeader('Content-Type','application/javascript');return response.end('window.WORKTIME_CONFIG={supabaseUrl:"https://test.invalid",supabasePublishableKey:"test"}');}
  if(name==='app-v800.js'){response.setHeader('Content-Type','application/javascript');return response.end(source);}
  if(name==='service-worker.js'){response.statusCode=404;return response.end();}
  const target=path.resolve(directory,name);if(!target.startsWith(directory+path.sep)||!fs.existsSync(target)){response.statusCode=404;return response.end();}
  response.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/octet-stream');response.end(fs.readFileSync(target));
});
async function main(){
  const data=await fixture(),{db,ids,actor,admin}=data;let current='business',queue=Promise.resolve(),passed=0;const errors=[],notifications=[];
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='confirm'?d.accept():d.dismiss());
    await page.route('https://test.invalid/**',route=>{
      queue=queue.then(async()=>{
        const request=route.request(),url=new URL(request.url()),method=request.method(),body=request.postDataJSON();
        const send=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value,(key,value)=>['work_date','event_date','start_date','end_date'].includes(key)&&typeof value==='string'?value.slice(0,10):value)});
        try{
          await actor(current);
          if(url.pathname==='/functions/v1/mailbox-send'){if(body.action==='recipients')return send({recipients:[]});notifications.push(body);return send({success:true});}
          if(url.pathname.includes('/rpc/')){
            const name=url.pathname.split('/').at(-1);let result;
            if(name==='work_order_team_context')result=(await db.query('select work_order_team_context($1) result',[body.p_company])).rows[0].result;
            else if(name==='current_business_branding')result=[{id:ids.business,company_name:'Testfirma'}];
            else if(name==='save_team_work_order')result=await data.save(body.p_order,body.p_periods,body.p_items,body.p_plan_id);
            else if(name==='confirm_team_appointment')result=(await db.query('select to_jsonb(confirm_team_appointment($1)) result',[body.p_id])).rows[0].result;
            else if(name==='delete_team_work_order'){await db.query('select delete_team_work_order($1)',[body.p_id]);result=null;}
            else throw Error('Unexpected RPC '+name);
            return send(result);
          }
          const table=url.pathname.split('/').at(-1),tables=['profiles','customers','appointments','planning_requests','mailbox_messages','work_days','vacation_requests','time_entries','work_orders','work_order_items','materials','work_order_documents'];
          if(!tables.includes(table))return send([]);
          const params=[],conditions=[];
          for(const [field,value] of url.searchParams){if(value.startsWith('eq.')&&/^[a-z_]+$/.test(field)){params.push(value.slice(3));conditions.push(field+'=$'+params.length);}}
          const where=conditions.length?' where '+conditions.join(' and '):'';
          if(method==='GET'){
            const order=url.searchParams.get('order');let orderSql='';if(order)orderSql=' order by '+order.split(',').map(s=>{const [name,direction]=s.split('.');if(!/^[a-z_]+$/.test(name))throw Error('column');return name+(direction==='desc'?' desc':' asc');}).join(',');
            const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);
            return send((await db.query('select * from '+table+where+orderSql+' limit '+limit+' offset '+offset,params)).rows);
          }
          if(method==='POST'){
            const names=Object.keys(body);assert.ok(names.every(name=>/^[a-z_]+$/.test(name)));
            return send((await db.query('insert into '+table+'('+names.join(',')+') values('+names.map((_,i)=>'$'+(i+1)).join(',')+') returning *',Object.values(body))).rows);
          }
          if(method==='PATCH'){
            const names=Object.keys(body),values=Object.values(body);assert.ok(names.every(name=>/^[a-z_]+$/.test(name)));
            return send((await db.query('update '+table+' set '+names.map((name,i)=>name+'=$'+(i+params.length+1)).join(',')+where+' returning *',[...params,...values])).rows);
          }
          if(method==='DELETE'){await db.query('delete from '+table+where,params);return send(null);}
          throw Error('Unexpected request');
        }catch(e){return send({message:e.message},400);}
      });return queue;
    });
    await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!!window.__appTest);
    async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
    async function setRole(name,view='orders',date='2026-10-05'){
      await queue;await admin();const profile=(await db.query('select * from profiles where id=$1',[ids[name]])).rows[0];current=name;
      await page.evaluate(async({profile,view,date,company})=>{const a=window.__appTest;Object.assign(a.state,{profile,session:{user:{id:profile.id},access_token:'synthetic'},businessId:company,employeeId:profile.role==='employee'?profile.id:'00000000-0000-4000-8000-000000000004',view,date,month:date.slice(0,7),planWeek:'2026-10-05',planId:'',planForm:false,planPrefill:null,orderId:'',notice:null});await a.reload();a.render();},{profile,view,date,company:ids.business});
    }
    const group=id=>page.locator('[data-team-employee="'+id+'"]');
    const submit=async form=>{await page.locator('form[data-form="'+form+'"] button[data-signature-submit],form[data-form="'+form+'"]>button.primary').click();await page.waitForFunction(()=>!window.__appTest.state.busy);};
    const sign=async()=>{const canvas=page.locator('.signature-pad'),r=await canvas.boundingBox();await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();await page.mouse.move(box.x+20,box.y+35);await page.mouse.down();await page.mouse.move(box.x+120,box.y+80,{steps:8});await page.mouse.up();await page.locator('[name="signed_by"]').fill('Testkunde');};
    await setRole('anna');
    await test('Employee sees a same-company multi-selection without receiving other profile data',async()=>{
      assert.equal(await page.locator('[data-order-team-choice]').count(),1);
      assert.equal(await page.locator('[data-order-team-choice]').getAttribute('value'),ids.max);
      assert.equal(await page.evaluate(()=>window.__appTest.state.people.length),1);
      assert.equal(await page.locator('[data-order-team-choice][value="'+ids.felix+'"]').count(),0);
    });
    await test('Manual order supports several independent shifts per employee and keeps typed notes',async()=>{
      await page.locator('[name="customer"]').fill('Klostermanns Hof');await page.locator('[name="title"]').fill('Team Montage');await page.locator('[name="documentation"]').fill('Notiz bleibt erhalten');
      await page.locator('[name="start"]').fill('08:00');await page.locator('[name="hours"]').fill('2');
      await page.locator('.team-choice summary').click();
      await page.locator('[data-order-team-choice]').check();
      assert.equal(await page.locator('[name="documentation"]').inputValue(),'Notiz bleibt erhalten');
      await group(ids.anna).locator('[data-action="team-add-period"]').click();
      const extra=group(ids.anna).locator('[data-team-period]').nth(1);
      await extra.locator('[data-team-time="start"]').fill('10:30');await extra.locator('[data-team-time="pause"]').fill('0.25');await extra.locator('[data-team-time="hours"]').fill('1.25');
      assert.equal(await extra.locator('[data-team-time="end"]').inputValue(),'12:00');
      await group(ids.max).locator('[data-team-time="start"]').fill('08:30');await group(ids.max).locator('[data-team-time="pause"]').fill('0.5');await group(ids.max).locator('[data-team-time="end"]').fill('12:00');
      assert.equal(await group(ids.max).locator('[data-team-time="hours"]').inputValue(),'3.00');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:path.join(__dirname,'team-order-mobile.png'),fullPage:true});
      await sign();await submit('order');assert.equal(await page.locator('form[data-form="order-edit"]').count(),1);
      assert.match(await page.locator('.notice').innerText(),/gespeichert/);
      assert.equal(await page.evaluate(()=>window.__appTest.dayHours()),3.25);
    });
    let orderId=await page.evaluate(()=>window.__appTest.state.orderId);
    await setRole('max','home');
    await test('Coworker immediately sees the common order, calendar marker and their own three hours',async()=>{
      assert.equal(await page.evaluate(()=>window.__appTest.dayHours()),3);
      assert.equal(await page.locator('[data-action="open-order"][data-id="'+orderId+'"]').count(),1);
      await page.evaluate(()=>{window.__appTest.state.view='calendar';window.__appTest.render();});
      assert.equal(await page.locator('.month-day[data-date="2026-10-05"] .flag-order').count(),1);
      await page.locator('[data-action="open-order"][data-id="'+orderId+'"]').click();assert.equal(await page.locator('[data-team-period]').count(),3);
      assert.equal(await page.evaluate(()=>window.__appTest.overtime()),-5);
    });
    await test('Participant edits propagate without double counting to every account',async()=>{
      await group(ids.max).locator('[data-team-time="end"]').fill('12:30');await submit('order-edit');
      assert.equal(await page.evaluate(()=>window.__appTest.dayHours()),3.5);
      await setRole('anna','home');assert.equal(await page.evaluate(()=>window.__appTest.dayHours()),3.25);
      assert.equal(await page.evaluate(()=>window.__appTest.orderHours(window.__appTest.state.rows.orders[0])),6.75);
    });
    await setRole('business','planning','2026-10-06');
    await test('Planning keeps the same weekly layout and shares one assignment with all selected employees',async()=>{
      assert.equal(await page.locator('.plan-day').count(),14);await page.locator('[data-action="plan-new"]').click();
      await page.locator('[name="event_date"]').fill('2026-10-06');await page.locator('[name="customer"]').fill('Klostermanns Hof');await page.locator('[name="title"]').fill('Geplante Team Montage');await page.locator('[name="start"]').fill('08:00');await page.locator('[name="end"]').fill('10:00');await page.locator('.team-choice summary').click();await page.locator('[data-plan-team-choice]').check();
      await submit('planning');assert.match(await page.locator('.notice').innerText(),/gespeichert/);
      assert.equal(await page.locator('.plan-card').count(),2);assert.equal(notifications.length,2);
      await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(__dirname,'team-planning-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});
    });
    const planId=await page.evaluate(()=>window.__appTest.state.rows.appointments[0].id);
    await setRole('max','planning','2026-10-06');
    await test('A second assigned employee confirms and opens the shared draft with all participants',async()=>{
      assert.equal(await page.locator('.plan-card').count(),1);await page.locator('[data-action="plan-open"]').click();await page.locator('[data-action="plan-confirm"]').click();await page.waitForFunction(()=>!window.__appTest.state.busy);
      assert.equal(await page.locator('form[data-form="order"]').count(),1);assert.equal(await page.locator('[data-team-period]').count(),2);
      assert.equal(await page.evaluate(()=>window.__appTest.dayHours()),0);
      await group(ids.max).locator('[data-team-time="hours"]').fill('3');await sign();await submit('order');
      assert.equal(await page.evaluate(()=>window.__appTest.dayHours()),3);
      assert.equal(await page.evaluate(()=>window.__appTest.state.orderId),planId);
    });
    await setRole('business','planning','2026-10-06');
    await test('Completion shows each employee actual time separately and keeps one underlying work order',async()=>{
      await page.locator('[data-action="plan-open"]').first().click();assert.match(await page.locator('#planning-detail').innerText(),/Erledigt/);assert.match(await page.locator('#planning-detail').innerText(),/5,00 h Mitarbeiterstunden/);
      assert.equal(await page.evaluate(()=>window.__appTest.state.rows.orders.filter(o=>o.id===window.__appTest.state.rows.appointments[0].id).length),1);
    });
    await test('Work order PDF and invoice include every employee, each shift and labor prices once',async()=>{
      const pdfPromise=context.waitForEvent('page');await page.evaluate(id=>window.__appTest.printOrderPdf(id),planId);const pdf=await pdfPromise;await pdf.waitForLoadState();
      const text=await pdf.locator('body').innerText();assert.match(text,/anna/);assert.match(text,/max/);assert.match(text,/08:00 Uhr bis 11:00 Uhr/);assert.match(text,/Meisterstunde/);assert.match(text,/75,00/);await pdf.close();
      const invoicePromise=context.waitForEvent('page');await page.evaluate(()=>window.__appTest.printInvoicePdf(window.__appTest.invoiceGroups(false)[0]));const invoice=await invoicePromise;await invoice.waitForLoadState();const bill=await invoice.locator('body').innerText();assert.match(bill,/anna/);assert.match(bill,/max/);assert.match(bill,/Monteurstunde/);assert.match(bill,/Meisterstunde/);await invoice.close();
    });
    await setRole('anna','orders','2026-10-06');
    await test('Deleting the shared work order removes all linked account times and draft markers',async()=>{
      await page.locator('[data-action="open-order"][data-id="'+planId+'"]').click();await page.locator('[data-action="delete-order"][data-id="'+planId+'"]').click();await page.waitForFunction(()=>!window.__appTest.state.busy);
      assert.equal(await page.evaluate(()=>window.__appTest.dayHours()),0);assert.equal(await page.locator('[data-action="plan-start"]').count(),0);
      await setRole('max','calendar','2026-10-06');assert.equal(await page.evaluate(()=>window.__appTest.dayHours()),0);assert.equal(await page.locator('.month-day[data-date="2026-10-06"] .flag-order').count(),0);
    });
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,runtimeErrors:errors.length,productionWrites:0}));
  }finally{await browser.close();server.close();await db.close();}
}
main().catch(e=>{console.error(e.stack);process.exit(1)});
