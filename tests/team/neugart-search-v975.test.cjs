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
    const b=options?.body;calls.push({path,body:b,method:options?.method});
    if(path.includes('material_favorite_lists'))return [{id:'favorites',owner_id:'manager',name:'Werkzeug'}];
    if(path.includes('material_favorite_items'))return [{id:'favorite',list_id:'favorites',snapshot:{name:'Wago Favorit',catalog_article_number:'221-412',catalog_supplier:'Neugart'}}];
    if(b.action==='accounts')return [{id:'account',label:'Neugart Betrieb'}];
    if(b.action==='search'){
     if(b.query==='Langsam')await new Promise(resolve=>setTimeout(resolve,800));
     return [{id:'online:'+b.query,online_sku:b.query,name:b.query+' Katalogartikel',catalog_supplier:'Neugart',catalog_article_number:b.query}];
    }
    if(b.action==='transfer')return {confirmed:true,company:b.company,supplier:b.supplier,request_id:b.request_id,cart_url:'https://efgonlineplus.de/p/cart/FIXTURE_CART_976/positions',handoff:{action:'https://efgonlineplus.de/p/cart/FIXTURE_CART_976/positions?login=true',token:'synthetic-login-transfer'}};
    if(b.action==='article-add')return {id:'material',business_id:'company',catalog_supplier:'Neugart',catalog_article_number:b.sku,name:'Hager Katalogartikel',unit:'Stk',purchase_price:10,recommended_price_1:20,unit_price:19};
    throw Error('Unexpected fixture call');
   };
   const render=()=>{root.innerHTML=state.view==='shopping-cart'?shop.cartView():shop.shopping();tools.afterRender();};
   const shop=WorktimeNeugartAccounts.create({root,state,api,businessId:()=>state.profile.business_id,render,escape:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')});
   const tools=WorktimeArticleTools.create({root,state,api,businessId:()=>state.profile.business_id});
   window.qa={state,render};render();
  });
  await page.locator('[data-favorites-content]').getByText('Wago Favorit').waitFor({state:'attached'});
  await page.locator('[data-article-favorites] > summary').click();
  assert.equal(await page.locator('[data-favorite-remove]').count(),0,'employees have no remove control');
  await page.evaluate(()=>{const b=document.createElement('button');b.dataset.favoriteRemove='favorite';b.textContent='forged remove';document.querySelector('main').append(b);b.click();b.remove();});
  assert.equal(await page.evaluate(()=>calls.some(c=>c.method==='DELETE')),false,'forged remove button is ignored');
  const searchesBefore=await page.evaluate(()=>calls.filter(c=>c.body?.action==='search').length);
  for(const text of ['B','Be','Ber']){await page.locator('[data-neugart-search] [name=query]').fill(text);await page.waitForTimeout(400);}
  assert.equal(await page.evaluate(()=>calls.filter(c=>c.body?.action==='search').length),searchesBefore,'slow typing never starts merchant search');
  await page.locator('[data-neugart-search] [name=manufacturer]').fill('Wrong manufacturer');
  await page.locator('[data-neugart-search] [name=category]').fill('Wrong category');
  await page.locator('[data-favorite-find]').click();
  await page.locator('[data-neugart-results]').getByText('221-412 Katalogartikel',{exact:false}).waitFor();
  assert.equal(await page.locator('[data-neugart-search] [name=query]').inputValue(),'221-412');
  assert.equal(await page.locator('[data-neugart-search] [name=manufacturer]').inputValue(),'');
  assert.equal(await page.locator('[data-neugart-search] [name=category]').inputValue(),'');
  assert.equal(await page.locator('[data-article-favorites]').getAttribute('open'),null,'results are revealed immediately');
  for(const role of ['business','administrator']){
   await page.evaluate(role=>{qa.state.profile.role=role;qa.render();},role);
   assert.equal(await page.locator('[data-favorite-remove]').count(),1);
  }
  await page.evaluate(()=>{qa.state.profile.role='employee';qa.render();});
  await page.locator('[data-neugart-search] [name=query]').fill('Hager');await page.locator('[data-neugart-search] [name=query]').press('Enter');
  await page.locator('[data-neugart-results]').getByText('Hager Katalogartikel',{exact:false}).waitFor();
  assert.match(await page.locator('[data-article-favorites]').textContent(),/Wago Favorit/);
  assert.doesNotMatch(await page.locator('[data-neugart-results]').innerText(),/Wago Favorit/);
  await page.locator('[data-neugart-results] [data-ng-action=add]').click();
  assert.equal(await page.locator('[data-ng-form=cart]').count(),0);
  await page.getByRole('button',{name:'Warenkorb öffnen (1)'}).click();
  await page.locator('[data-ng-form=cart]').waitFor();
  assert.match(await page.locator('[data-ng-form=cart]').innerText(),/Hager Katalogartikel/);assert.match(await page.locator('[data-ng-form=cart]').innerText(),/EK netto: 10,00/);assert.match(await page.locator('[data-ng-totals]').innerText(),/23,80/);
  await page.getByRole('button',{name:'Weitere Artikel suchen'}).click();
  await page.locator('[data-neugart-search] [name=query]').fill('Langsam');await page.locator('[data-neugart-search] [name=query]').press('Enter');
  await page.waitForFunction(()=>calls.some(c=>c.body?.query==='Langsam'));
  await page.locator('[data-neugart-search] [name=query]').fill('Neu');await page.locator('[data-neugart-search] [name=query]').press('Enter');
  await page.locator('[data-neugart-results]').getByText('Neu Katalogartikel',{exact:false}).waitFor();
  await page.waitForTimeout(900);
  assert.doesNotMatch(await page.locator('[data-neugart-results]').innerText(),/Langsam Katalogartikel/);
  assert.ok(await page.evaluate(()=>calls.some(c=>c.body?.action==='article-add'&&c.body.sku==='Hager')));
  await page.getByRole('button',{name:'Warenkorb öffnen (1)'}).click();
  await page.locator('[name=cart_name]').fill('Baustelle Test');
  await page.locator('[data-ng-form=cart] input[type=number]').fill('2.5');assert.match(await page.locator('[data-ng-totals]').innerText(),/29,75/);assert.match(await page.locator('[data-ng-totals]').innerText(),/59,50/);
  await page.getByRole('button',{name:'Weitere Artikel suchen'}).click();
  await page.evaluate(()=>{qa.state.profile.id='employee-two';qa.state.session.user.id='employee-two';qa.render();});
  await page.getByRole('button',{name:'Warenkorb öffnen (0)'}).waitFor();
  await page.evaluate(()=>{qa.state.profile.id='employee';qa.state.session.user.id='employee';qa.state.view='shopping-cart';qa.render();});
  await page.locator('[data-ng-form=cart]').waitFor();
  assert.equal(await page.locator('[data-ng-form=cart] input[type=number]').inputValue(),'2.5');
  assert.equal(await page.locator('[name=cart_name]').inputValue(),'Baustelle Test');
  let post;
  await page.route('https://efgonlineplus.de/p/cart/FIXTURE_CART_976/positions?login=true',route=>{
    post={method:route.request().method(),body:route.request().postData()};
    return route.fulfill({contentType:'text/html; charset=utf-8',body:'<h1>Bestätigter Händlerwarenkorb</h1>'});
  });
  await page.getByRole('button',{name:'Artikel bestellen',exact:true}).click();
  await page.getByRole('heading',{name:'Bestätigter Händlerwarenkorb'}).waitFor();
  assert.equal(post.method,'POST');
  assert.equal(new URLSearchParams(post.body).get('TOKEN'),'synthetic-login-transfer');
  console.log('PASS independent catalog search, personal cart menu, employee isolation, saved quantities, authenticated same-tab POST and late-result isolation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
