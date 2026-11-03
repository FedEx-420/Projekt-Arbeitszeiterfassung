/* Settings PDF regression using isolated PostgreSQL/RLS and the current PDF viewer. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const {fixture}=require('./team-db-fixture.cjs');
const directory=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(directory,'app-v800.js'),'utf8').replace(/\}\)\(\);\s*$/,`window.__appTest={state,render,reload,timeAccountReport,printPdf,reportDateValid};})();`);
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(name==='config.js'){res.setHeader('Content-Type','application/javascript');return res.end('window.WORKTIME_CONFIG={supabaseUrl:"https://test.invalid",supabasePublishableKey:"test"}');}
  if(name==='app-v800.js'){res.setHeader('Content-Type','application/javascript');return res.end(source);}
  if(name==='service-worker.js'){res.statusCode=404;return res.end();}
  const file=path.resolve(directory,name);if(!file.startsWith(directory+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.mjs')||name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));
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
      if(url.pathname==='/storage/v1/object/public/company-logos/qa-logo.svg'){
        return route.fulfill({contentType:'image/svg+xml',headers:{'Access-Control-Allow-Origin':'*'},body:'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#0a685c"/></svg>'});
      }
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
      assert.equal(day(data,'2026-10-09').approvedDays,0.5);assert.equal(day(data,'2026-10-10'),undefined);assert.equal(day(data,'2026-04-03').approvedDays,0);
      assert.deepEqual(day(data,'2026-04-03').labels.map(row=>row.kind),['holiday']);
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
      await role('anna','anna','2027-02-02');const data=await report();assert.equal(year(data,'2027').calendarHolidays,11);assert.equal(year(data,'2027').holidays,7);assert.equal(year(data,'2027').hours,0);assert.equal(year(data,'2027').overtime,0);
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
    await page.evaluate(() => {
      const open = window.WorktimePdfViewer.open;
      window.WorktimePdfViewer.open = options => window.__pdfJob = open(options);
    });
    async function readPdf({ expectLogo = false } = {}) {
      await page.locator('[data-action="pdf"]').click();
      const dialog = page.getByRole('dialog', { name: 'Zeiterfassungsnachweis' });
      await dialog.locator('[data-pdf-download][href]').waitFor();
      const result = await page.evaluate(async expectLogo => {
        const job = window.__pdfJob;
        await job.ready;
        const text = [];
        for (let number = 1; number <= job.pdf.numPages; number++) {
          const page = await job.pdf.getPage(number);
          text.push((await page.getTextContent()).items.map(item => item.str).join(' '));
        }
        let hasLogo = false;
        if (expectLogo) {
          const { OPS } = await import('./vendor/pdfjs-6.4.299/pdf.mjs');
          const firstPage = await job.pdf.getPage(1);
          hasLogo = (await firstPage.getOperatorList()).fnArray.includes(OPS.paintImageXObject);
        }
        return { text: text.join(' '), pages: job.pdf.numPages, type: job.file.type, hasLogo };
      }, expectLogo);
      if (expectLogo) assert.equal(result.hasLogo, true);
      assert.equal(result.type, 'application/pdf');
      assert.equal(await dialog.locator('canvas').count(), result.pages);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        dialog.locator('[data-pdf-download]').click()
      ]);
      assert.equal(fs.readFileSync(await download.path()).subarray(0, 5).toString(), '%PDF-');
      await dialog.locator('[data-pdf-close]').click();
      assert.ok(await page.locator('[data-action="pdf"]').evaluate(button => document.activeElement === button));
      return result;
    }
    await test('The settings button opens the rendered PDF and preserves report labels', async () => {
      const { text } = await readPdf();
      for (const label of ['2024', '2025', '2026', 'genehmigt', 'beantragt', 'Krankheit', 'Karfreitag', '09:00', '11:00']) {
        assert.ok(text.includes(label), `PDF is missing ${label}`);
      }
    });
    await test('A long month prints all separate working periods, long customer names and a logo across multiple PDF pages',async()=>{
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
      const { text, pages } = await readPdf({ expectLogo: true });
      assert.ok(pages > 1);
      for (let index = 1; index <= 60; index++) {
        const name = 'Auftrag ' + String(index).padStart(2, '0') + ' -';
        assert.ok(text.includes(name), `PDF is missing ${name}`);
      }
      await role('anna');
    });
    await test('Export leaves all source data unchanged and makes no mutation request',async()=>{await queue;assert.deepEqual(await snapshot(),before);assert.equal(mutations,0);});
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,productionWrites:0,runtimeErrors:errors.length}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));await db.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
