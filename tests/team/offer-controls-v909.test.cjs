/* Real offer DOM/CSS in a disposable local browser. No backend, credentials or records. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const directory=path.resolve(__dirname,'../..');
const styles=[...fs.readFileSync(path.join(directory,'index.html'),'utf8').matchAll(/<link rel="stylesheet" href="([^"?]+)(?:\?[^"]*)?"/g)].map(match=>match[1]);
const allowed=new Set([...styles,'offer-model-v908.js','invoice-tax-v905.js','offers-v857.js']);
const html='<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+styles.map(name=>`<link rel="stylesheet" href="/${name}">`).join('')+'</head><body><main class="app-shell" id="root"></main><script src="/offer-model-v908.js"></script><script src="/invoice-tax-v905.js"></script><script src="/offers-v857.js"></script></body></html>';
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://127.0.0.1').pathname.slice(1);
  if(!name){res.setHeader('Content-Type','text/html');return res.end(html);}
  if(!allowed.has(name)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(path.join(directory,name)));
});
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});let passed=0;
  const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.evaluate(()=>{
      const root=document.querySelector('#root'),state={profile:{id:'synthetic-business',role:'business'},view:'offers',offerId:'new',rows:{offers:[],materials:[{id:'synthetic-material',business_id:'synthetic-business',name:'Testartikel mit längerer Bezeichnung',unit:'Stk',unit_price:12.34,recommended_price_1:22.22,recommended_price_2:25}],customers:[]}};
      const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let feature;
      const render=()=>{root.innerHTML=feature.view();feature.setup();};
      feature=window.OffersFeature.create({state,root,escape,n:value=>Number(String(value||0).replace(',','.')),same:(a,b)=>String(a||'')===String(b||''),lower:value=>String(value||'').toLowerCase().trim(),isManager:()=>true,businessId:()=>state.profile.id,managerBusiness:()=>({id:state.profile.id,company_name:'Synthetische Testfirma'}),api:()=>{throw Error('No backend writes allowed');},allRows:async()=>[],render,chooseSimilar:()=>null,normalizeUnit:(unit,labor)=>unit||(labor?'H':'Stk'),materialUnit:row=>row.unit||'Stk',unitSelect:(name,value,attrs)=>`<label>Einheit<select ${attrs}><option selected>${escape(value)}</option><option>M</option></select></label>`,customers:()=>state.rows.customers,today:()=> '2026-10-25',dateText:value=>value,logoBytes:async()=>null});
      feature.bind();render();window.__offersHarness={feature,state,render};
    });
    const form=()=>page.locator('form[data-form="offer"]');
    await form().locator('[name="customer_name"]').fill('Synthetischer Testkunde');
    await form().locator('.offer-address summary').click();
    await form().locator('[name="customer_postal_code"]').fill('53343');
    await form().locator('[name="title"]').fill('Synthetischer Test ohne Speichern');
    await form().locator('[data-offer-name]').fill('Testartikel mit längerer Bezeichnung');
    await test('Selected material anchors its slider and shows explicit net/gross labels',async()=>{
      const slider=form().locator('[data-offer-price-slider]');assert.equal(await slider.getAttribute('min'),'11.106');assert.equal(await slider.getAttribute('max'),'13.574');
      assert.match(await form().locator('.offer-net-price').innerText(),/Netto-Verkaufspreis/);assert.match(await form().locator('[data-offer-price-gross]').innerText(),/14,68.*19 %.*Vorschau/);
    });
    await test('Dragging keeps the selected fine band stable and does not replace the focused input',async()=>{
      const bounds=await form().locator('[data-offer-price-slider]').evaluate(el=>[el.min,el.max]);
      await form().locator('[data-offer-price-slider]').evaluate(el=>{el.focus();el.value='12.5000';el.dispatchEvent(new Event('input',{bubbles:true}));});
      assert.equal(Number(await form().locator('[data-offer-price]').inputValue()),12.5);assert.deepEqual(await form().locator('[data-offer-price-slider]').evaluate(el=>[el.min,el.max]),bounds);assert.equal(await form().locator('[data-offer-price-slider]').evaluate(el=>document.activeElement===el),true);
    });
    await test('Typing a large new amount deliberately re-anchors rather than truncating the price',async()=>{
      await form().locator('[data-offer-price]').fill('100');assert.equal(await form().locator('[data-offer-price-slider]').getAttribute('min'),'90');assert.equal(await form().locator('[data-offer-price-slider]').getAttribute('max'),'110');assert.equal(await form().locator('[data-offer-price]').inputValue(),'100');
      await form().locator('[data-action="offer-recommended"][data-level="1"]').click();assert.equal(Number(await form().locator('[data-offer-price]').inputValue()),22.22);assert.equal(await form().locator('[data-offer-price-slider]').getAttribute('min'),'19.998');
    });
    for(const [width,height] of [[320,780],[390,844],[844,390],[1366,768],[1920,1080]]){
      await test(`All offer fields including postal code stay within ${width} x ${height}`,async()=>{
        await page.setViewportSize({width,height});
        const result=await page.evaluate(()=>{
          const width=document.documentElement.clientWidth;return {width,scroll:document.documentElement.scrollWidth,bad:[...document.querySelectorAll('#offer-editor input,#offer-editor select,#offer-editor textarea,#offer-editor button')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').map(el=>({name:el.name||el.getAttribute('data-action')||el.type,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})).filter(box=>box.left<-.5||box.right>width+.5)};
        });assert.ok(result.scroll<=result.width+1,JSON.stringify(result));assert.deepEqual(result.bad,[]);
      });
    }
    await test('Pauschal categories use cent steps and stay responsive without invalid fractional prices',async()=>{
      await page.setViewportSize({width:390,height:844});await form().locator('[name="offer_kind"]').selectOption('fixed');const slider=form().locator('[data-offer-category-slider]');assert.equal(await slider.getAttribute('step'),'0.01');
      await slider.evaluate(el=>{el.value=String(Number(el.value)+.01);el.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await form().locator('[data-offer-category-price]').evaluate(el=>el.validity.stepMismatch),false);assert.match(await form().locator('[data-offer-category-gross]').innerText(),/Brutto/);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
    });
    await test('Opening a historic gross offer converts only the edit draft with a visible warning',async()=>{
      await page.evaluate(()=>{const h=window.__offersHarness;h.state.rows.offers=[{id:'historic',revision:3,business_id:h.state.profile.id,customer_name:'Altkunde',customer_snapshot:{postal_code:'53343'},offer_date:'2026-01-21',title:'Altangebot',status:'draft',items:[{kind:'material',name:'Altartikel',quantity:2,unit_price:119}],offer_config:{kind:'itemized',tax_choice:{basis:'gross',mode:'standard',confirmed:true,overrides:{},reasons:{}}}}];h.state.offerId='historic';h.render();});
      assert.equal(Number(await form().locator('[data-offer-price]').inputValue()),100);assert.match(await page.locator('.notice').innerText(),/gespeicherte Angebot und sein PDF bleiben.*unverändert/);assert.equal(await page.evaluate(()=>window.__offersHarness.state.rows.offers[0].items[0].unit_price),119);assert.match(await form().locator('[data-offer-price-gross]').innerText(),/119,00.*19 %/);
    });
    await test('Net input basis is fixed in the actual tax dialog',async()=>{
      await form().locator('button.primary').click();const dialog=page.locator('.invoice-tax-dialog');await dialog.waitFor();assert.equal(await dialog.locator('[name="basis"]').inputValue(),'net');assert.equal(await dialog.locator('[name="basis"]').isDisabled(),true);await dialog.locator('[data-tax-cancel]').click();
    });
    assert.deepEqual(errors,[]);await context.close();console.log(JSON.stringify({passed,productionWrites:0,externalRequests:0,viewports:5}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error.stack);process.exit(1);});
