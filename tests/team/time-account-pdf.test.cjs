/* Settings PDF regression using isolated PostgreSQL/RLS and real browser printing. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright');
const {fixture}=require('./team-db-fixture.cjs');
const directory=path.resolve(__dirname,'../..');
// Keep report HTML/CSS intact, but use page.pdf instead of a native dialog.
const source=fs.readFileSync(path.join(directory,'app-v800.js'),'utf8').replaceAll('window.onload=()=>window.print()','window.onload=()=>{}').replace(/\}\)\(\);\s*$/,`window.__appTest={state,render,reload,timeAccountReport,printPdf,reportDateValid};})();`);
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(name==='config.js'){res.setHeader('Content-Type','application/javascript');return res.end('window.WORKTIME_CONFIG={supabaseUrl:"https://test.invalid",supabasePublishableKey:"test"}');}
  if(name==='app-v800.js'){res.setHeader('Content-Type','application/javascript');return res.end(source);}
  if(name==='service-worker.js'){res.statusCode=404;return res.end();}
  const file=path.resolve(directory,name);if(!file.startsWith(directory+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));
});
async function main(){
  const {db,ids,actor,admin}=await fixture({legacyRecords:true});let current='anna',queue=Promise.resolve(),passed=0,mutations=0;const errors=[];
  await admin();
  for(const [person,date,sick,vacation] of [['anna','2026-10-07',1,0],['anna','2026-10-08',0.5,0],['anna','2026-10-09',0,0.5],['anna','2024-02-29',1,0],['anna','2026-01-01',1,0],['max','2026-10-13',1,0]])await db.query('insert into work_days(employee_id,work_date,sick,vacation) values($1,$2,$3,$4)',[ids[person],date,sick,vacation]);
  for(const [person,from,to,status] of [['anna','2026-10-08','2026-10-12','approved'],['anna','2026-10-14','2026-10-16','requested'],['anna','2026-10-20','2026-10-21','rejected'],['anna','2025-12-31','2026-01-02','approved'],['anna','2026-04-03','2026-04-06','approved'],['max','2026-10-22','2026-10-23','approved']])await db.query('insert into vacation_requests(employee_id,start_date,end_date,status) values($1,$2,$3,$4)',[ids[person],from,to,status]);
  const snapshot=async()=>{await admin();return (await db.query("select jsonb_build_object('days',(select jsonb_agg(d order by employee_id,work_date) from work_days d),'vacations',(select jsonb_agg(v order by id) from vacation_requests v),'entries',(select jsonb_agg(t order by id) from time_entries t),'orders',(select jsonb_agg(w order by id) from work_orders w)) data")).rows[0].data;};
  const before=await snapshot();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Berlin',serviceWorkers:'block'}),page=await context.newPage();
    context.on('page',popup=>popup.on('pageerror',e=>errors.push(e.message)));
    await context.route('**/*',route=>{
      const request=route.request(),url=new URL(request.url());if(url.hostname==='127.0.0.1')return route.continue();
      if(url.hostname!=='test.invalid')return route.abort();
      if(url.pathname.startsWith('/storage/v1/object/public/company-logos/'))return route.abort();
      queue=queue.then(async()=>{
        const method=request.method(),body=request.postDataJSON();
        const send=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value,(key,value)=>['work_date','event_date','start_date','end_date'].includes(key)&&typeof value==='string'?value.slice(0,10):value)});
        try{
          await actor(current);
          if(url.pathname==='/functions/v1/mailbox-send'&&body.action==='recipients')return send({recipients:[]});
          if(url.pathname.includes('/rpc/')){
            const name=url.pathname.split('/').at(-1);
            if(name==='work_order_team_context')return send((await db.query('select work_order_team_context($1) result',[body.p_company])).rows[0].result);
            if(name==='current_business_branding')return send([{id:ids.business,company_name:'Elektro Test & Partner'}]);
            throw Error('Unexpected RPC '+name);
          }
          const table=url.pathname.split('/').at(-1),tables=['profiles','customers','appointments','planning_requests','mailbox_messages','work_days','vacation_requests','time_entries','work_orders','work_order_items','materials','work_order_documents'];
          if(method!=='GET'){mutations++;throw Error('PDF must not mutate data');}
          if(!tables.includes(table))return send([]);
          const params=[],conditions=[];for(const [field,value] of url.searchParams)if(value.startsWith('eq.')&&/^[a-z_]+$/.test(field)){params.push(value.slice(3));conditions.push(field+'=$'+params.length);}
          const where=conditions.length?' where '+conditions.join(' and '):'';
          return send((await db.query('select * from '+table+where+' limit '+Number(url.searchParams.get('limit')||1000)+' offset '+Number(url.searchParams.get('offset')||0),params)).rows);
        }catch(error){return send({message:error.message},400);}
      });return queue;
    });
    await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!!window.__appTest);
    async function role(name,employee='anna',date='2026-10-05'){
      await queue;await admin();const profile=(await db.query('select * from profiles where id=$1',[ids[name]])).rows[0];current=name;
      await page.evaluate(async({profile,company,employee,date})=>{const app=window.__appTest;Object.assign(app.state,{profile,session:{user:{id:profile.id},access_token:'synthetic'},businessId:company,employeeId:employee,view:'settings',date,month:date.slice(0,7),notice:null,menu:false});await app.reload();app.render();},{profile,company:ids.business,employee:ids[employee],date});
    }
    async function report(){return page.evaluate(()=>window.__appTest.timeAccountReport());}
    async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
    const year=(data,value)=>data.years.find(row=>row.year===value),day=(data,date)=>year(data,date.slice(0,4)).months.flatMap(month=>month.days).find(row=>row.date===date);
    await role('anna');
    await test('The settings report includes absence-only years and keeps chronological year/month headings',async()=>{
      const data=await report();assert.deepEqual(data.years.map(row=>row.year),['2024','2025','2026']);
      assert.deepEqual(year(data,'2026').months.map(row=>row.month),['2026-01','2026-04','2026-05','2026-06','2026-09','2026-10','2026-11','2026-12']);
      assert.equal(year(data,'2024').hours,0);assert.equal(day(data,'2024-02-29').sickDays,1);
    });
    await test('NRW holidays include all fixed and movable dates without requiring a work entry',async()=>{
      const data=await report(),holidays=year(data,'2026').months.flatMap(month=>month.days).filter(row=>row.holiday);
      assert.equal(holidays.length,11);assert.equal(day(data,'2026-04-03').holiday,'Karfreitag');assert.equal(day(data,'2026-04-06').holiday,'Ostermontag');assert.equal(day(data,'2026-06-04').holiday,'Fronleichnam');assert.equal(day(data,'2026-10-03').holiday,'Tag der Deutschen Einheit');
      assert.equal(day(data,'2026-12-25').entries.length,0);
    });
    await test('Sickness and half-days are visible; sickness takes precedence over overlapping vacation',async()=>{
      const data=await report();assert.equal(year(data,'2026').sickDays,2.5);assert.equal(day(data,'2026-10-08').sickDays,0.5);
      assert.deepEqual(day(data,'2026-10-08').labels.map(row=>row.kind),['sick']);assert.equal(day(data,'2026-10-08').approvedDays,0);
      assert.deepEqual(day(data,'2026-01-01').labels.map(row=>row.kind),['holiday','sick']);
    });
    await test('Vacation crossing a year boundary is split correctly and weekdays/holidays are not counted twice',async()=>{
      const data=await report();assert.equal(year(data,'2025').approvedDays,1);assert.equal(year(data,'2026').approvedDays,2.5);
      assert.equal(day(data,'2026-10-09').approvedDays,0.5);assert.equal(day(data,'2026-10-10').approvedDays,0);assert.equal(day(data,'2026-04-03').approvedDays,0);
      assert.equal(day(data,'2026-04-03').labels.some(row=>row.kind==='approved'),true);
    });
    await test('Pending vacation is distinct from approved vacation, while rejected requests are excluded',async()=>{
      const data=await report();assert.equal(year(data,'2026').requestedDays,3);
      assert.deepEqual(day(data,'2026-10-14').labels.map(row=>row.kind),['requested']);assert.equal(day(data,'2026-10-20'),undefined);
    });
    await test('Manual time and synchronized work-order time are counted once, with no minus hours from calendar-only days',async()=>{
      const data=await report();assert.equal(data.totalHours,3.75);assert.equal(year(data,'2026').overtime,-12.25);
      assert.equal(year(data,'2024').overtime,0);assert.equal(year(data,'2025').overtime,0);
      assert.equal(day(data,'2026-09-30').entries.length,1);assert.equal(day(data,'2026-09-30').entries[0].executed_hours,'2.75');
    });
    await test('An empty selected year still shows its holidays and no invented work hours',async()=>{
      await role('anna','anna','2027-02-02');const data=await report();assert.equal(year(data,'2027').holidays,11);assert.equal(year(data,'2027').hours,0);assert.equal(year(data,'2027').overtime,0);
    });
    await test('Chief and administrator exports select the same employee without mixing other employees',async()=>{
      await role('business');const chief=await report();await role('admin');assert.deepEqual(await report(),chief);
      assert.equal(day(chief,'2026-10-13'),undefined);assert.equal(day(chief,'2026-10-22'),undefined);
    });
    await test('Employees see only their own absence data through the real RLS path',async()=>{
      await role('max','max');const data=await report();assert.equal(data.totalHours,0);assert.equal(year(data,'2026').sickDays,1);assert.equal(year(data,'2026').approvedDays,2);
      assert.deepEqual(data.years.map(row=>row.year),['2026']);assert.equal(day(data,'2026-10-07'),undefined);
      await role('felix','felix');const foreign=await report();assert.equal(year(foreign,'2026').sickDays,0);assert.equal(year(foreign,'2026').approvedDays,0);
    });
    await test('Invalid dates are rejected without breaking valid leap-day records',async()=>{
      assert.deepEqual(await page.evaluate(()=>['2024-02-29','2026-02-29','2026-13-10','not-a-date'].map(value=>window.__appTest.reportDateValid(value))),[true,false,false,false]);
    });
    await role('anna');
    let popup;
    await test('The actual employee settings button opens the complete PDF preview with status labels and a return button',async()=>{
      const promise=page.waitForEvent('popup');await page.locator('[data-action="pdf"]').click();popup=await promise;await popup.waitForLoadState('load');
      const text=await popup.locator('body').innerText();assert.match(text,/Jahr 2024/);assert.match(text,/Jahr 2025/);assert.match(text,/Jahr 2026/);assert.match(text,/Urlaub \(genehmigt\)/);assert.match(text,/Urlaub \(beantragt\)/);assert.match(text,/Krankheit/);assert.match(text,/Feiertag NRW: Karfreitag/);assert.match(text,/09:00 Uhr/);assert.match(text,/11:00 Uhr/);assert.match(text,/3,75 h/);
      assert.equal(await popup.locator('[data-report-date="2026-10-08"] .report-status.approved').count(),0);assert.equal(await popup.locator('#pdf-return-actions button').count(),1);
      assert.equal(await popup.locator('[data-report-date="2026-12-25"] td').nth(5).innerText(),'-');
    });
    await test('Mobile preview and A4 printing have no clipped table cells or runtime errors',async()=>{
      const mobileBounds=await popup.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('h1,header,table,th,td')].filter(element=>element.getBoundingClientRect().right>innerWidth+1 || element.scrollWidth>element.clientWidth+1).slice(0,12).map(element=>({tag:element.tagName,text:element.innerText.slice(0,100),right:element.getBoundingClientRect().right,width:element.clientWidth,scroll:element.scrollWidth}))}));
      await popup.screenshot({path:path.join(__dirname,'time-account-pdf-mobile.png'),fullPage:true});
      assert.ok(mobileBounds.scroll<=mobileBounds.width+1,JSON.stringify(mobileBounds));
      await popup.emulateMedia({media:'print'});await popup.setViewportSize({width:794,height:1123});
      const bounds=await popup.locator('.report-table td').evaluateAll(cells=>cells.map(cell=>({scroll:cell.scrollWidth,client:cell.clientWidth})));assert.ok(bounds.every(cell=>cell.scroll<=cell.client+1));
      const output=process.env.PDF_QA_OUTPUT_DIR || path.join(os.tmpdir(),'worktime-pdf-qa-v856');fs.mkdirSync(output,{recursive:true});
      const filename=path.join(output,'Arbeitsstundenkonto_Abwesenheiten.pdf');await popup.pdf({path:filename,format:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font:9px Arial;width:100%;text-align:center;color:#526c66">Arbeitsstundenkonto · Seite <span class="pageNumber"></span> von <span class="totalPages"></span></div>'});
      assert.equal(fs.readFileSync(filename).subarray(0,5).toString(),'%PDF-');console.log('PDF_QA_OUTPUT '+filename);await popup.close();
    });
    await test('A long month prints all separate working periods, long customer names and the company logo across multiple pages',async()=>{
      await page.evaluate(employee=>{
        const app=window.__appTest,entries=[];let index=0;
        for(let date=5;date<=23;date++){
          const work_date='2026-10-'+String(date).padStart(2,'0'),weekday=new Date(work_date+'T12:00:00Z').getUTCDay();
          if(weekday===0||weekday===6)continue;
          for(let shift=0;shift<4;shift++){
            const hour=8+shift*2;
            entries.push({id:'qa-period-'+index++,employee_id:employee,work_date,customer_name:'Auftrag '+String(index).padStart(2,'0')+' - Kundenname mit langem Zusatz & Gebäudetechnik',start_time:String(hour).padStart(2,'0')+':00',end_time:String(hour+1).padStart(2,'0')+':00',pause_hours:0,executed_hours:1});
          }
        }
        app.state.rows.entries=entries;app.state.rows.orders=[];app.state.rows.days=[];app.state.rows.vacations=[];
        app.state.businessBrand.company_logo_path='qa-logo.svg';
      },ids.anna);
      const data=await report();assert.equal(data.totalHours,60);assert.equal(year(data,'2026').months.find(month=>month.month==='2026-10').hours,60);
      const promise=page.waitForEvent('popup');await page.locator('[data-action="pdf"]').click();const long=await promise;await long.waitForLoadState('load');
      assert.match(await long.locator('.pdf-logo img').getAttribute('src'),/company-logos\/qa-logo\.svg$/);
      // This is a layout test, not a live Storage test. Load a synthetic bitmap
      // directly so external image networking cannot stall the headless popup.
      const logo=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=600;canvas.height=200;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,600,200);ctx.fillStyle='#eab600';ctx.beginPath();ctx.moveTo(85,15);ctx.lineTo(35,105);ctx.lineTo(80,105);ctx.lineTo(55,185);ctx.lineTo(135,75);ctx.lineTo(90,75);ctx.closePath();ctx.fill();ctx.fillStyle='#a61122';ctx.font='bold 62px Arial';ctx.fillText('Elektro Test',155,125);return canvas.toDataURL('image/png');});
      await long.locator('.pdf-logo img').evaluate((image,src)=>{image.src=src;},logo);
      await long.waitForFunction(()=>{const image=document.querySelector('.pdf-logo img');return image?.complete&&image.naturalWidth>0;},{},{timeout:10000});
      assert.equal(await long.locator('tbody tr').count(),71);assert.equal(await long.locator('td').filter({hasText:/Auftrag \d/}).count(),60);
      await long.emulateMedia({media:'print'});await long.setViewportSize({width:794,height:1123});
      const bounds=await long.locator('th,td').evaluateAll(cells=>cells.map(cell=>({scroll:cell.scrollWidth,client:cell.clientWidth})));assert.ok(bounds.every(cell=>cell.scroll<=cell.client+1));
      const output=process.env.PDF_QA_OUTPUT_DIR||path.join(os.tmpdir(),'worktime-pdf-qa-v856');fs.mkdirSync(output,{recursive:true});
      const filename=path.join(output,'Arbeitsstundenkonto_Langer_Monat.pdf');await long.pdf({path:filename,format:'A4',preferCSSPageSize:true,printBackground:true});
      assert.equal(fs.readFileSync(filename).subarray(0,5).toString(),'%PDF-');console.log('PDF_QA_OUTPUT '+filename);await long.close();await role('anna');
    });
    await test('Export leaves all source data unchanged and makes no mutation request',async()=>{await queue;assert.deepEqual(await snapshot(),before);assert.equal(mutations,0);});
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,productionWrites:0,runtimeErrors:errors.length}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));await db.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
