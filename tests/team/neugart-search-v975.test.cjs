const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 try{
  const page=await browser.newPage();
  page.setDefaultTimeout(8000);
  await page.route('https://fixture.test/',r=>r.fulfill({contentType:'text/html',body:'<main></main>'}));
  await page.goto('https://fixture.test/');
  await page.addScriptTag({path:'article-tools-v959.js'});
  await page.addScriptTag({path:'neugart-accounts-v971.js'});
  await page.evaluate(()=>{
   const root=document.querySelector('main');
   const state={profile:{id:'employee',role:'employee',business_id:'company'},session:{user:{id:'employee'}},view:'shopping',people:[]};
   window.calls=[];
   const api=async(path,options)=>{
    const b=options?.body;calls.push({path,body:b});
    if(path.includes('material_favorite_lists'))return [{id:'favorites',owner_id:'manager',name:'Werkzeug'}];
    if(path.includes('material_favorite_items'))return [{id:'favorite',list_id:'favorites',snapshot:{name:'Wago Favorit',catalog_article_number:'221-412',catalog_supplier:'Neugart'}}];
    if(b.action==='accounts')return [{id:'account',label:'Neugart Betrieb'}];
    if(b.action==='search'){
     if(b.query==='Langsam')await new Promise(resolve=>setTimeout(resolve,800));
     return [{id:'online:'+b.query,online_sku:b.query,name:b.query+' Katalogartikel',catalog_supplier:'Neugart',catalog_article_number:b.query}];
    }
    if(b.action==='article-add')return {id:'material',business_id:'company',catalog_supplier:'Neugart',catalog_article_number:b.sku,name:'Hager Katalogartikel',unit:'Stk'};
    throw Error('Unexpected fixture call');
   };
   const render=()=>{root.innerHTML=shop.shopping();tools.afterRender();};
   const shop=WorktimeNeugartAccounts.create({root,state,api,businessId:()=>state.profile.business_id,render,escape:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')});
   const tools=WorktimeArticleTools.create({root,state,api,businessId:()=>state.profile.business_id});
   render();
  });
  await page.locator('[data-favorites-content]').getByText('Wago Favorit').waitFor({state:'attached'});
  await page.locator('[data-article-favorites] > summary').click();
  await page.locator('[data-neugart-search] [name=query]').fill('Hager');
  await page.locator('[data-neugart-results]').getByText('Hager Katalogartikel',{exact:false}).waitFor();
  assert.match(await page.locator('[data-article-favorites]').innerText(),/Wago Favorit/);
  assert.doesNotMatch(await page.locator('[data-neugart-results]').innerText(),/Wago Favorit/);
  await page.locator('[data-neugart-results] [data-ng-action=add]').click();
  await page.locator('[data-ng-form=cart]').waitFor();
  assert.match(await page.locator('[data-ng-form=cart]').innerText(),/Hager Katalogartikel/);
  await page.locator('[data-neugart-search] [name=query]').fill('Langsam');
  await page.waitForFunction(()=>calls.some(c=>c.body?.query==='Langsam'));
  await page.locator('[data-neugart-search] [name=query]').fill('Neu');
  await page.locator('[data-neugart-results]').getByText('Neu Katalogartikel',{exact:false}).waitFor();
  await page.waitForTimeout(900);
  assert.doesNotMatch(await page.locator('[data-neugart-results]').innerText(),/Langsam Katalogartikel/);
  assert.ok(await page.evaluate(()=>calls.some(c=>c.body?.action==='article-add'&&c.body.sku==='Hager')));
  console.log('PASS independent catalog search, preserved favorites, automatic search, exact online article selection and late-result isolation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
