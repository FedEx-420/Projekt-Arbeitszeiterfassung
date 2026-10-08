/* Real quote UI + disposable PostgreSQL. Synthetic authentication only. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),{fixture}=require('./team-db-fixture.cjs');
const directory=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(directory,'app-v800.js'),'utf8').replace(/\}\)\(\);\s*$/,`window.__appTest={state,render,reload,api,auth,logout};})();`);
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(name==='config.js'){res.setHeader('Content-Type','application/javascript');return res.end('window.WORKTIME_CONFIG={supabaseUrl:"https://test.invalid",supabasePublishableKey:"test"}');}
  if(name==='app-v800.js'){res.setHeader('Content-Type','application/javascript');return res.end(source);}
  if(name==='service-worker.js'){res.statusCode=404;return res.end();}
  const file=path.resolve(directory,name);if(!file.startsWith(directory+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));
});
async function main(){
  const {db,ids,actor,admin}=await fixture({offers:true,units:true,catalog:true});let queue=Promise.resolve(),passed=0,refreshes=0,saves=0,failRefresh=false,failSave=false,expireServer=false,serial=0;const errors=[];
  const token=(exp,label)=>'test.'+Buffer.from(JSON.stringify({exp})).toString('base64url')+'.'+label;
  const session=(label='fresh',expired=false)=>{const exp=Math.floor(Date.now()/1000)+(expired?60:12000);return {access_token:token(exp,label+'-'+(++serial)),refresh_token:'synthetic-refresh-'+serial,expires_at:exp,expires_in:12000,user:{id:ids.business}};};
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',route=>{
      const request=route.request(),url=new URL(request.url());if(url.hostname==='127.0.0.1')return route.continue();if(url.hostname!=='test.invalid')return route.abort();
      queue=queue.then(async()=>{
        const body=request.postDataJSON(),send=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value,(key,value)=>['offer_date','valid_until','work_date'].includes(key)&&typeof value==='string'?value.slice(0,10):value)});
        try{
          if(url.pathname==='/auth/v1/token'){if(url.searchParams.get('grant_type')==='refresh_token'){refreshes++;if(failRefresh)return send({error:'invalid_grant',message:'Refresh token expired'},400);}return send(session());}
          await actor('business');
          if(url.pathname==='/rest/v1/rpc/save_offer_v857'){
            saves++;if(expireServer){expireServer=false;return send({code:'PGRST301',message:'JWT expired'},401);}if(failSave)return send({message:'Test: Verbindung unterbrochen'},503);
            return send((await db.query('select to_jsonb(save_offer_v857($1::jsonb,$2)) result',[JSON.stringify(body.p_data),body.p_revision])).rows[0].result);
          }
          if(url.pathname==='/rest/v1/rpc/work_order_team_context')return send((await db.query('select work_order_team_context($1) result',[body.p_company])).rows[0].result);
          if(url.pathname==='/functions/v1/mailbox-send')return send({recipients:[]});
          const table=url.pathname.split('/').at(-1),tables=['profiles','customers','offers','materials','appointments','planning_requests','work_days','vacation_requests','time_entries','work_orders','work_order_items','work_order_documents','mailbox_messages'];if(!tables.includes(table))return send([]);
          assert.equal(request.method(),'GET');const conditions=[],params=[];for(const [field,value] of url.searchParams)if(value.startsWith('eq.')&&/^[a-z_]+$/.test(field)){params.push(value.slice(3));conditions.push(field+'=$'+params.length);}
          const rows=(await db.query('select * from '+table+(conditions.length?' where '+conditions.join(' and '):'')+' limit '+Number(url.searchParams.get('limit')||1000)+' offset '+Number(url.searchParams.get('offset')||0),params)).rows;
          if(table==='profiles')rows.forEach(row=>{row.company_name='Elektro Test';row.display_name=row.username;});return send(rows);
        }catch(error){return send({message:error.message},400);}
      });return queue;
    });
    await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!!window.__appTest);
    await admin();const profile=(await db.query('select * from profiles where id=$1',[ids.business])).rows[0];profile.company_name='Elektro Test';
    await page.evaluate(async({profile,session})=>{const app=window.__appTest;app.auth.install(session);Object.assign(app.state,{profile,businessId:profile.id,view:'offers'});await app.reload();app.render();},{profile,session:session()});
    const form=()=>page.locator('form[data-form="offer"]'),backup=()=>page.evaluate(()=>{const app=window.__appTest;return sessionStorage.getItem('zeiterfassung-offer-draft-v859:'+app.state.profile.id+':'+app.state.profile.id);});
    const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
    let draftSerial=0;
    async function newOffer(names){
      draftSerial++;names??=Array.from({length:5},(_,index)=>'Kabel neu '+(draftSerial===1?'':draftSerial+'-')+(index+1));
      await page.locator('[data-action="offer-new"]').click();await form().locator('[name="customer_name"]').fill('Klostermanns Hof');await form().locator('[name="title"]').fill('Angebot mit fünf freien Artikeln');
      for(let index=0;index<names.length;index++){if(index)await form().locator('[data-action="offer-add-material"]').click();const row=form().locator('[data-offer-line]').nth(index);await row.locator('[data-offer-name]').fill(names[index]);await row.locator('[data-offer-quantity]').fill(String(index+1));await row.locator('[data-offer-price]').fill(String(index+10));}await form().locator('[name="notes"]').fill('Bitte diese Notiz und alle Positionen behalten');await form().locator('[name="vat_rate"]').fill('19');
    }
    async function ageDuringPrompts(){await page.evaluate(()=>{window.__clockOffset=0;const now=Date.now;Date.now=()=>now()+window.__clockOffset;const prompt=window.prompt;window.prompt=(...args)=>{const answer=prompt(...args);window.__clockOffset+=120000;return answer;};});}
    let dialogs=0;const acceptZero=async dialog=>{dialogs++;await dialog.accept('0');};page.on('dialog',acceptZero);
    await test('Five new-article choices can outlast the JWT and still save exactly once',async()=>{
      await newOffer();await page.evaluate(data=>window.__appTest.auth.install(data),session('old',true));await ageDuringPrompts();const before=refreshes,start=saves;await form().locator('button.primary').click();await page.waitForFunction(()=>document.querySelector('[data-offer-status]')?.textContent.includes('gespeichert')&&!document.querySelector('form[data-form="offer"] button.primary')?.disabled);
      assert.equal(dialogs,5);assert.equal(refreshes-before,1);assert.equal(saves-start,1);await admin();const rows=(await db.query('select * from offers')).rows;assert.equal(rows.length,1);assert.deepEqual(rows[0].items.map(row=>row.name),['Kabel neu 1','Kabel neu 2','Kabel neu 3','Kabel neu 4','Kabel neu 5']);assert.equal(rows[0].total,'226.10');assert.equal(await backup(),null);assert.equal((await db.query('select count(*)::int n from materials')).rows[0].n,9);
    });
    await test('A JWT expiry rejection from the server refreshes and saves only one quote',async()=>{await newOffer(['Kabel']);expireServer=true;const before=refreshes,start=saves;await form().locator('button.primary').click();await page.waitForFunction(()=>document.querySelector('[data-offer-status]')?.textContent.includes('gespeichert')&&!document.querySelector('form[data-form="offer"] button.primary')?.disabled);assert.equal(refreshes-before,1);assert.equal(saves-start,2);await admin();assert.equal((await db.query('select count(*)::int n from offers')).rows[0].n,2);});
    await test('Failed refresh keeps all positions, prices, notes and choices in the unlocked form',async()=>{
      await newOffer();await page.evaluate(data=>window.__appTest.auth.install(data),session('expired',true));failRefresh=true;const before=saves,startDialogs=dialogs;await form().locator('button.primary').click();await page.waitForFunction(()=>document.querySelector('[data-offer-status]')?.textContent.includes('erneut anmelden'));assert.equal(saves,before);assert.equal(dialogs-startDialogs,5);assert.equal(await form().locator('[name="notes"]').inputValue(),'Bitte diese Notiz und alle Positionen behalten');assert.equal(await form().locator('button.primary').isEnabled(),true);assert.equal(await form().locator('[data-offer-name]').first().isEnabled(),true);assert.equal(JSON.parse(await backup()).items.length,5);
    });
    await test('Reload and re-login recover the quote and do not repeat the five accepted choices',async()=>{
      await page.reload();await page.waitForSelector('form[data-form="login"]');failRefresh=false;const login=page.locator('form[data-form="login"]');await login.locator('[name="username"]').fill('business');await login.locator('[name="password"]').fill('synthetic-test-password');await login.locator('[name="company"]').fill('Elektro Test');await login.locator('button.primary').click();await page.waitForSelector('[data-action="menu"]');await page.evaluate(()=>{const app=window.__appTest;app.state.view='offers';app.render();});
      assert.match(await page.locator('#app').innerText(),/wiederhergestellt/);assert.equal(await form().locator('[data-offer-line]').count(),5);assert.equal(await form().locator('[data-offer-price]').nth(4).inputValue(),'14');assert.equal(await form().locator('[name="notes"]').inputValue(),'Bitte diese Notiz und alle Positionen behalten');const before=dialogs;await form().locator('button.primary').click();await page.waitForFunction(()=>document.querySelector('[data-offer-status]')?.textContent.includes('gespeichert')&&!document.querySelector('form[data-form="offer"] button.primary')?.disabled);assert.equal(dialogs,before);assert.equal(await backup(),null);await admin();assert.equal((await db.query('select count(*)::int n from offers')).rows[0].n,3);
    });
    await test('A 503 does not automatically resend a create and its input survives re-render',async()=>{await newOffer(['Kabel']);failSave=true;const before=saves;await form().locator('button.primary').click();await page.waitForFunction(()=>document.querySelector('[data-offer-status]')?.textContent.includes('unterbrochen'));assert.equal(saves-before,1);await page.evaluate(()=>window.__appTest.render());assert.equal(await form().locator('[name="notes"]').inputValue(),'Bitte diese Notiz und alle Positionen behalten');assert.ok(await backup());failSave=false;});
    await test('Saved quote edits recover their ID and revision, and update rather than duplicate',async()=>{
      await page.locator('[data-action="offer-close"]').click();await page.locator('#offer-list [data-action="offer-open"]').first().click();const id=await form().locator('[name="id"]').inputValue();await form().locator('[name="notes"]').fill('Wiederhergestellte Bearbeitung');await page.reload();await page.waitForSelector('[data-action="menu"]');await page.evaluate(()=>{const app=window.__appTest;app.state.view='offers';app.render();});assert.equal(await form().locator('[name="id"]').inputValue(),id);assert.equal(await form().locator('[name="notes"]').inputValue(),'Wiederhergestellte Bearbeitung');await form().locator('button.primary').click();await page.waitForFunction(()=>document.querySelector('[data-offer-status]')?.textContent.includes('gespeichert')&&!document.querySelector('form[data-form="offer"] button.primary')?.disabled);await admin();assert.equal((await db.query('select count(*)::int n from offers')).rows[0].n,3);assert.equal((await db.query('select revision from offers where id=$1',[id])).rows[0].revision,2);
    });
    await test('Draft backups are not displayed to a different account or company',async()=>{
      await newOffer(['Kabel']);await page.evaluate(company=>{const app=window.__appTest;app.state.profile={id:'other-user',role:'business',company_name:'Andere Firma'};app.state.businessId=company;app.state.offerId='';app.render();},ids.otherBusiness);assert.equal(await form().count(),0);await page.evaluate(()=>{const app=window.__appTest;app.state.profile={id:'employee',role:'employee',business_id:'other-user'};app.render();});assert.equal(await form().count(),0);assert.equal(await page.locator('[data-action="offer-new"]').count(),0);
    });
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,productionWrites:0,runtimeErrors:0}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));await db.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
