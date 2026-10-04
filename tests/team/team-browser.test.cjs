/* Browser -> real isolated PostgreSQL/RLS/RPC, not a pretend successful save. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const {fixture}=require('./team-db-fixture.cjs');
const directory=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(directory,'app-v800.js'),'utf8').replace(/\}\)\(\);\s*$/,`window.__appTest={state,render,reload,collectTeamPeriods,recordedPeriods,dayHours,overtime,orderHours,teamEnabled,printOrderPdf,printBillingPdf,printInvoicePdf,invoiceGroups,syncPlanningIfVisible};})();`);
const server=http.createServer((request,response)=>{
  const name=new URL(request.url,'http://localhost').pathname.slice(1)||'index.html';
  if(name==='config.js'){response.setHeader('Content-Type','application/javascript');return response.end('window.WORKTIME_CONFIG={supabaseUrl:"https://test.invalid",supabasePublishableKey:"test"}');}
  if(name==='app-v800.js'){response.setHeader('Content-Type','application/javascript');return response.end(source);}
  if(name==='service-worker.js'){response.statusCode=404;return response.end();}
  const target=path.resolve(directory,name);if(!target.startsWith(directory+path.sep)||!fs.existsSync(target)){response.statusCode=404;return response.end();}
  response.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/octet-stream');response.end(fs.readFileSync(target));
});
async function main(){
  const data=await fixture(),{db,ids,actor,admin}=data;let current='business',queue=Promise.resolve(),passed=0,acceptExtraEntry=true,failPlanRead=false;const errors=[],notifications=[],dialogs=[];
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{dialogs.push(d.message());return d.type()==='confirm'&&acceptExtraEntry?d.accept():d.dismiss();});
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
            if(failPlanRead&&table==='appointments')return send({message:'Temporary planning outage'},503);
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
    await setRole('anna','orders','2026-10-06');
    await test('An unconfirmed published assignment is above the new work-order form, not below it',async()=>{
      const card=page.locator('[data-day-plans] [data-assignment-id="'+planId+'"]');
      assert.equal(await card.count(),1);assert.match(await card.innerText(),/Geplant/);
      assert.match(await card.innerText(),/08:00 – 10:00 Uhr/);assert.match(await card.innerText(),/anna, max/);
      assert.ok((await page.locator('[data-day-plans]').boundingBox()).y<(await page.locator('form[data-form="order"]').boundingBox()).y);
      assert.equal(await page.evaluate(()=>window.__appTest.dayHours()),0);
      await page.screenshot({path:path.join(__dirname,'planned-orders-mobile.png'),fullPage:true});
    });
    await setRole('max','time','2026-10-06');
    await test('A team participant sees the same assignment above time tracking, with live customer matching and stable focus',async()=>{
      assert.equal(await page.locator('[data-day-plans] [data-assignment-id="'+planId+'"] [data-action="plan-start"]').count(),1);
      assert.ok((await page.locator('[data-day-plans]').boundingBox()).y<(await page.locator('form[data-form="time"]').boundingBox()).y);
      await page.locator('[name="customer"]').pressSequentially('Klostermann');
      assert.equal(await page.locator('[data-assignment-hint] [data-assignment-id="'+planId+'"]').count(),1);
      assert.equal(await page.evaluate(()=>document.activeElement.name),'customer');
      await page.locator('[name="customer"]').fill('Klostermanns Hof');
      await page.locator('[name="start"]').fill('08:00');await page.locator('[name="hours"]').fill('2');await page.locator('[name="notes"]').fill('Eigene ungespeicherte Notiz');
      await page.evaluate(()=>window.__originalTimeForm=document.querySelector('form[data-form="time"]'));
      await page.screenshot({path:path.join(__dirname,'planned-time-mobile.png'),fullPage:true});
    });
    await test('Declining a separate time entry keeps all inputs and writes no hours or work order',async()=>{
      acceptExtraEntry=false;
      await page.locator('form[data-form="time"] button.primary').click();await queue;
      assert.match(dialogs.at(-1),/separaten zusätzlichen Zeiteintrag/);
      assert.equal(await page.evaluate(()=>window.__originalTimeForm===document.querySelector('form[data-form="time"]')),true);
      assert.equal(await page.locator('[name="notes"]').inputValue(),'Eigene ungespeicherte Notiz');
      assert.equal(await page.locator('[name="hours"]').inputValue(),'2');assert.equal(await page.locator('[name="end"]').inputValue(),'10:00');
      assert.equal(await page.evaluate(()=>window.__appTest.dayHours()),0);
      await admin();assert.equal((await db.query("select count(*)::int count from work_orders where work_date='2026-10-06'")).rows[0].count,0);
      assert.equal((await db.query("select count(*)::int count from time_entries where work_date='2026-10-06'")).rows[0].count,0);
    });
    await setRole('max','orders','2026-10-06');
    await test('Declining a duplicate manual work order preserves notes, material, signature and selected attachment',async()=>{
      await page.locator('[name="customer"]').fill('Klostermanns Hof');await page.locator('[name="title"]').fill('Nicht versehentlich duplizieren');
      await page.locator('[name="hours"]').fill('2');await page.locator('[name="material"]').fill('Kabel');await page.locator('[name="quantity"]').fill('3');await page.locator('[name="documentation"]').fill('Diese Notiz behalten');
      await page.locator('[name="documents"]').setInputFiles({name:'hinweis.txt',mimeType:'text/plain',buffer:Buffer.from('Ungespeicherter Anhang')});await sign();
      const signature=await page.locator('[name="signature_data"]').inputValue();
      await page.evaluate(()=>window.__originalOrderForm=document.querySelector('form[data-form="order"]'));
      await submit('order');
      assert.match(dialogs.at(-1),/separaten zusätzlichen Arbeitsschein/);
      assert.equal(await page.evaluate(()=>window.__originalOrderForm===document.querySelector('form[data-form="order"]')),true);
      assert.equal(await page.locator('[name="documentation"]').inputValue(),'Diese Notiz behalten');
      assert.equal(await page.locator('[name="material"]').inputValue(),'Kabel');
      assert.equal(await page.locator('[name="signature_data"]').inputValue(),signature);
      assert.equal(await page.locator('[name="documents"]').evaluate(input=>input.files[0].name),'hinweis.txt');
      await admin();assert.equal((await db.query("select count(*)::int count from work_orders where work_date='2026-10-06'")).rows[0].count,0);
      acceptExtraEntry=true;
    });
    await test('Background refresh updates only the assignment panel and keeps the complete unsaved work-order form',async()=>{
      await admin();const old=(await db.query('select notes from appointments where id=$1',[planId])).rows[0].notes;
      const meta=JSON.parse(old.slice(10));meta.status='confirmed';
      await db.query('update appointments set notes=$2 where id=$1',[planId,'ZE-PLAN-1:'+JSON.stringify(meta)]);
      await page.locator('[name="documentation"]').focus();
      await page.evaluate(()=>window.__appTest.syncPlanningIfVisible());
      assert.match(await page.locator('[data-day-plans]').innerText(),/Bestätigt/);
      assert.equal(await page.evaluate(()=>window.__originalOrderForm===document.querySelector('form[data-form="order"]')),true);
      assert.equal(await page.evaluate(()=>document.activeElement.name),'documentation');
      assert.equal(await page.locator('[name="documentation"]').inputValue(),'Diese Notiz behalten');
      assert.equal(await page.locator('[name="documents"]').evaluate(input=>input.files[0].name),'hinweis.txt');
      failPlanRead=true;try{await page.evaluate(()=>window.__appTest.syncPlanningIfVisible());assert.match(await page.locator('[data-day-plans]').innerText(),/Bestätigt/);}finally{failPlanRead=false;}
      await admin();await db.query('update appointments set notes=$2 where id=$1',[planId,old]);
    });
    await test('The list is restricted to the selected date and assigned employee, including manager and administrator selection',async()=>{
      await setRole('anna','orders','2026-10-05');assert.equal(await page.locator('[data-day-plans] .day-plan-card').count(),0);
      await setRole('felix','orders','2026-10-06');assert.equal(await page.locator('[data-day-plans] .day-plan-card').count(),0);
      await setRole('business','time','2026-10-06');assert.equal(await page.locator('[data-day-plans] .day-plan-card').count(),1);
      await setRole('admin','orders','2026-10-06');assert.equal(await page.locator('[data-day-plans] .day-plan-card').count(),1);
      await page.locator('[data-select="business"]').selectOption(ids.otherBusiness);
      assert.equal(await page.locator('[data-day-plans] .day-plan-card').count(),0);
    });
    await test('Unpublished proposals, cancelled plans, other employees and empty completed plans never create draft cards',async()=>{
      await admin();
      const notes=status=>'ZE-PLAN-1:'+JSON.stringify({start:'08:00',end:'10:00',status});
      const inserted=[];
      for(const [employee,status] of [[ids.anna,'cancelled'],[ids.max,'planned'],[ids.anna,'completed']])inserted.push((await db.query("insert into appointments(employee_id,event_date,customer_id,customer_name,title,notes) values($1,'2026-10-12',$2,'Klostermanns Hof','Nicht anzeigen',$3) returning id",[employee,ids.customer,notes(status)])).rows[0].id);
      const request=(await db.query("insert into planning_requests(business_id,submitted_by,employee_id,event_date,customer_id,customer_name,title,notes) values($1,$2,$2,'2026-10-12',$3,'Klostermanns Hof','Vorschlag zur Freigabe',$4) returning id",[ids.business,ids.anna,ids.customer,notes('planned')])).rows[0].id;
      await setRole('anna','orders','2026-10-12');assert.equal(await page.locator('[data-day-plans] .day-plan-card').count(),0);
      await setRole('anna','time','2026-10-12');assert.equal(await page.locator('[data-day-plans] .day-plan-card').count(),0);
      await admin();await db.query('delete from appointments where id=any($1::uuid[])',[inserted]);await db.query('delete from planning_requests where id=$1',[request]);
    });
    await test('A sick team participant still sees the plan, but cannot begin a new work order',async()=>{
      await admin();await db.query("insert into work_days(employee_id,work_date,sick) values($1,'2026-10-06',1)",[ids.max]);
      await setRole('max','time','2026-10-06');
      assert.equal(await page.locator('[data-day-plans] .day-plan-card').count(),1);assert.equal(await page.locator('[data-day-plans] [data-action="plan-start"]').count(),0);
      assert.equal(await page.locator('form[data-form="time"]').count(),0);
      await admin();await db.query("delete from work_days where employee_id=$1 and work_date='2026-10-06'",[ids.max]);
    });
    await test('Unrelated manual time remains usable without a planning warning',async()=>{
      await admin();const unrelated=(await db.query("insert into customers(employee_id,name) values($1,'Neubau Weber') returning id",[ids.anna])).rows[0].id;
      await setRole('anna','time','2026-10-06');
      await page.locator('[name="customer"]').fill('Neubau Weber');await page.locator('[name="start"]').fill('13:00');await page.locator('[name="hours"]').fill('1');
      assert.equal(await page.locator('[data-assignment-hint] .day-plan-card').count(),0);
      const count=dialogs.length;await page.locator('form[data-form="time"] button.primary').click();await page.waitForFunction(()=>!window.__appTest.state.busy);
      assert.equal(dialogs.length,count);assert.equal(await page.evaluate(()=>window.__appTest.dayHours()),1);
      await admin();await db.query('delete from time_entries where customer_id=$1',[unrelated]);await db.query('delete from customers where id=$1',[unrelated]);
    });
    await setRole('anna','time','2026-10-06');
    await test('Opening from time tracking reuses the assignment and every team member without booking preliminary hours',async()=>{
      await page.locator('[data-day-plans] [data-action="plan-start"]').click();await page.waitForFunction(()=>!window.__appTest.state.busy);
      assert.equal(await page.locator('[name="planning_id"]').inputValue(),planId);
      assert.equal(await page.locator('[name="customer"]').inputValue(),'Klostermanns Hof');
      assert.equal(await page.locator('[name="title"]').inputValue(),'Geplante Team Montage');
      assert.equal(await page.locator('[data-team-period]').count(),2);
      assert.equal(await page.evaluate(()=>window.__appTest.dayHours()),0);
      assert.match(await page.locator('[data-day-plans]').innerText(),/Unten zur Bearbeitung geöffnet/);
      assert.equal(await page.evaluate(()=>window.__appTest.state.orderOrigin),'time');
    });
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
    await test('After completion the top panel opens the one existing shared order rather than another draft',async()=>{
      await setRole('max','orders','2026-10-06');
      assert.match(await page.locator('[data-day-plans]').innerText(),/Bereits erfasst/);
      assert.equal(await page.locator('[data-day-plans] [data-action="plan-start"]').count(),0);
      await page.locator('[data-day-plans] [data-action="open-order"]').click();
      assert.equal(await page.locator('form[data-form="order-edit"] [name="id"]').inputValue(),planId);
      assert.equal(await page.evaluate(()=>window.__appTest.dayHours()),3);
      await page.setViewportSize({width:844,height:390});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.setViewportSize({width:1440,height:1000});await setRole('business','orders','2026-10-06');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:path.join(__dirname,'planned-orders-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});
    });
    await test('Work order PDF and invoice include every employee, each shift and labor prices once',async()=>{
      const pdfPromise=context.waitForEvent('page');await page.evaluate(id=>window.__appTest.printOrderPdf(id),planId);const pdf=await pdfPromise;await pdf.waitForLoadState();
      const text=await pdf.locator('body').innerText();assert.match(text,/anna/);assert.match(text,/max/);assert.match(text,/08:00 Uhr bis 11:00 Uhr/);assert.match(text,/Meisterstunde/);assert.match(text,/75,00/);await pdf.close();
      const invoicePromise=context.waitForEvent('page');await page.evaluate(()=>window.__appTest.printInvoicePdf(window.__appTest.invoiceGroups(false)[0]));const invoice=await invoicePromise;await invoice.waitForLoadState();const bill=await invoice.locator('body').innerText();assert.match(bill,/anna/);assert.match(bill,/max/);assert.match(bill,/Monteurstunde/);assert.match(bill,/Meisterstunde/);await invoice.close();
    });
    await setRole('anna','orders','2026-10-06');
    await test('Deleting the shared work order removes all linked account times and draft markers',async()=>{
      await page.locator('.list-section [data-action="open-order"][data-id="'+planId+'"]').click();await page.locator('[data-action="delete-order"][data-id="'+planId+'"]').click();await page.waitForFunction(()=>!window.__appTest.state.busy);
      assert.equal(await page.evaluate(()=>window.__appTest.dayHours()),0);assert.equal(await page.locator('[data-action="plan-start"]').count(),0);
      await setRole('max','calendar','2026-10-06');assert.equal(await page.evaluate(()=>window.__appTest.dayHours()),0);assert.equal(await page.locator('.month-day[data-date="2026-10-06"] .flag-order').count(),0);
    });
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,runtimeErrors:errors.length,productionWrites:0}));
  }finally{await browser.close();server.close();await db.close();}
}
main().catch(e=>{console.error(e.stack);process.exit(1)});
