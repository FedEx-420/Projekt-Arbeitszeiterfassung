import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {loginToken,createMerchant} from '../../supabase/functions/supplier-cart-v949/merchant.mjs';
import {createHandler,checkCart} from '../../supabase/functions/supplier-cart-v949/handler.mjs';
for(const response of ['SYNTHETIC_LOGIN_TOKEN',{authKey:'SYNTHETIC_LOGIN_TOKEN'},{successful:true,obj:'SYNTHETIC_LOGIN_TOKEN'},{successful:true,obj:{authKey:'SYNTHETIC_LOGIN_TOKEN'}},{authenticationToken:'SYNTHETIC_LOGIN_TOKEN'}])assert.equal(loginToken(response),'SYNTHETIC_LOGIN_TOKEN');
for(const response of [{successful:false,authKey:'SYNTHETIC_LOGIN_TOKEN'},{authKey:'short'},{authKey:'BAD\nLOGIN_TOKEN'},null])assert.equal(loginToken(response),'');
const owner='10000000-0000-4000-8000-000000000001',company='20000000-0000-4000-8000-000000000001',article='30000000-0000-4000-8000-000000000001',job='40000000-0000-4000-8000-000000000001';
const md5=x=>createHash('md5').update(x).digest('hex'),env={url:'https://db.invalid',anonKey:'public-fixture',serviceKey:'SYNTHETIC_SERVER_KEY'};
const json=(x,headers={})=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json',...headers}});
// Cross-layout redirects are intentionally unsuccessful login responses in ONLINE PLUS.
let redirectResult={successful:false,status:11,layout:'EFG',redirect:'efgonlineplus.de',authenticationToken:'SYNTHETIC_REDIRECT_TOKEN'};
const redirectMerchant=createMerchant({md5,fetch:async(url,options)=>{
 const u=new URL(url);assert.equal(u.origin,'https://www.gconlineplus.de');
 if(u.pathname==='/api/account/getsettingsremaining')return json({crsfKey:null});
 assert.equal(u.pathname,'/api/account/login');assert.equal(JSON.parse(options.body).layout,'GC');return json(redirectResult);
}});
assert.deepEqual(await redirectMerchant.browserLogin({username:'TEST_USER',password:'TEST_PASSWORD'}),{origin:'https://efgonlineplus.de',token:'SYNTHETIC_REDIRECT_TOKEN'});
for(const change of [{status:1},{layout:'GC'},{redirect:'attacker.invalid'},{redirect:'efgonlineplus.de/private'},{redirect:'efgonlineplus.de?leak=true'},{authenticationToken:'bad\nTOKEN_VALUE'}]){
 const previous=redirectResult;redirectResult={...previous,...change};assert.equal(await redirectMerchant.browserLogin({username:'TEST_USER',password:'TEST_PASSWORD'}),null);redirectResult=previous;
}
const accountId='50000000-0000-4000-8000-000000000001'; let granted=true, onlineFallback=false;
const jobs=new Map();let adds=0,creates=0,role='administrator',actual=2.5,throwAfterAdd=false;
const fetch=async(url,options={})=>{const u=new URL(url),body=options.body?JSON.parse(options.body):null,method=options.method||'GET';
 if(u.hostname==='db.invalid'){
  if(u.pathname==='/auth/v1/user')return json({id:owner});
  if(u.pathname==='/rest/v1/profiles')return json(u.searchParams.get('id')==='eq.'+owner?[{id:owner,role,business_id:company}]:u.searchParams.get('id')==='eq.'+company?[{id:company,role:'business'}]:[]);
  if(u.pathname==='/rest/v1/rpc/neugart_account_v971'){
   assert.equal(options.headers.apikey,env.serviceKey);assert.equal(body.actor,owner);
   if(body.operation==='list')return json(granted?[{id:accountId,label:'Test access',employee_ids:[]}]:[]);
   if(body.operation==='credentials'&&granted&&body.payload.id===accountId)return json({company,credentials:{customer:'000011',username:'TEST_USER',password:'TEST_PASSWORD'}});
   return new Response('{}',{status:403});
  }
  if(u.pathname==='/rest/v1/materials'){if(onlineFallback&&u.searchParams.has('and'))return json([]);assert.equal(options.headers.Authorization,role==='employee'?'Bearer '+env.serviceKey:'Bearer synthetic');assert.equal(u.searchParams.get('business_id'),'eq.'+company);return json([{id:article,business_id:company,catalog_supplier:'Neugart',catalog_article_number:'000123',unit:'Stk'}]);}
  if(u.pathname==='/rest/v1/rpc/neugart_import_article_v975'){
   assert.equal(options.headers.apikey,env.serviceKey);
   assert.equal(body.article.article_number,'HAGER123');
   assert.equal(body.article.unit,'Stk');
   assert.equal(body.actor,owner);assert.equal(body.company,company);assert.equal(body.account_id,accountId);
   return json({id:article,business_id:company,catalog_supplier:'Neugart',catalog_article_number:'HAGER123',name:'Hager fixture',unit:'Stk'});
  }
  if(u.pathname==='/rest/v1/supplier_cart_transfers_v949'){assert.equal(options.headers.apikey,env.serviceKey);if(method==='POST'){if(jobs.has(body.id))return json([]);jobs.set(body.id,structuredClone(body));return json([body]);}const id=u.searchParams.get('id').slice(3),record=jobs.get(id);if(method==='PATCH')Object.assign(record,body);return json(record?[record]:[]);}
  throw Error('Unexpected database request');
 }
 if(u.hostname==='api.onlineplus.store'){
  assert.equal(u.pathname,'/api/v2/search/products/search');
  assert.equal(u.searchParams.get('searchterm'),'Hager');
  assert.equal(options.headers.Authorization,'Bearer synthetic.token.fixture');
  return json({products:[{productNumber:'HAGER123',description:'Hager fixture',gtiNs:[],supplierProductNumber:[]}],hits:1});
 }
 assert.equal(u.origin,'https://efgonlineplus.de');assert.equal(options.redirect,'error');assert.ok(!/checkout|delete|sendOffer/.test(u.pathname),'never order or delete');
 const logged=options.headers.Cookie?.includes('sid=PRIVATE_COOKIE');
 assert.equal(u.searchParams.get('crsfKey'),md5((logged?'CSRF':'null')+u.searchParams.get('rand')));
 if(u.pathname==='/api/account/getsettingsremaining')return json({jsonWebToken:'synthetic.token.fixture',crsfKey:logged?'CSRF':null,user:logged?{companyNumber:'777',username:'TEST_USER',customerNumber:'000011',customer:{company:{isSap:false}}}:null,warehouses:[{mfv:'070',warehouseNumber:'070',name:'Testlager'}]});
 if(u.pathname==='/api/account/login'){assert.equal(body.password,'TEST_PASSWORD');return json({successful:true,mandatoryActions:[],crsfKey:'CSRF'},{'Set-Cookie':'sid=PRIVATE_COOKIE; Path=/; HttpOnly; Secure'});}
 assert.ok(logged);
 if(u.pathname==='/api/carts/createCart'){assert.equal(u.searchParams.get('customerOrderText'),'Baustelle Nord & West');creates++;return json({resultId:'SYNTHETIC_CART_REFERENCE'});}
 if(u.pathname==='/api/carts/cart/positions/list'){adds++;assert.equal(body[0].productKeyWithProductnumber.productnumber,'000123');assert.equal(body[0].quantity,2.5);assert.ok(!JSON.stringify(body).includes('price'));if(throwAfterAdd)throw Error('Lost response after accepted request');return json({successful:true});}
 if(u.pathname==='/api/carts/cart/positions/0')return json({cart:{cartPositions:[{product:{productNumber:'000123',quantityUnit:'Stk'},quantity:actual}]}});
 if(u.pathname==='/api/products/getproductdetailsbykbn'){
  assert.equal(u.searchParams.get('kbn'),'HAGER123');
  return json({successful:true,obj:{productKey:{productnumber:'HAGER123'},description1:'Hager fixture',quantityUnit:'ST',oX_Supplier:'Hager'}});
 }
 if(u.pathname==='/api/products/getnetpricesandstocksbykbnlist')return json({successful:true,obj:{priceArray:[{priceUnit:1,unit:'ST',netPrice:2,grosPrice:4,grosPriceCurrency:'EUR',netPriceCurrency:'EUR'}]}});
 if(u.pathname==='/api/user/getauthkeylocalapp')return json({successful:true,obj:'SYNTHETIC_TRANSIENT_HANDOFF'});
 throw Error('Unexpected merchant request');
};
const handler=createHandler({fetch,env,md5,crypto:webcrypto}),body={company,supplier:'Neugart',request_id:job,cart_name:'  Baustelle Nord & West  ',customer:'000011',username:'TEST_USER',password:'TEST_PASSWORD',lines:[{material_id:article,quantity:'2.50'}]};
const request=(b=body,auth=true)=>handler(new Request('https://edge.invalid',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer synthetic'}:{})},body:JSON.stringify(b)}));
assert.equal((await request({},false)).status,401);role='employee';assert.equal((await request()).status,403);role='administrator';assert.equal((await request({...body,company:'20000000-0000-4000-8000-000000000099'})).status,403);assert.equal(adds,0);
let r=await request(),data=await r.json();assert.equal(r.status,200);assert.equal(data.confirmed,true);assert.equal(data.items[0].actual_quantity,2.5);assert.match(data.cart_url,/SYNTHETIC_CART_REFERENCE\/positions$/);assert.equal(data.handoff.action,data.cart_url+'?login=true');assert.equal(adds,1);assert.equal(creates,1);
for(const secret of ['TEST_PASSWORD','PRIVATE_COOKIE','CSRF','SYNTHETIC_TRANSIENT_HANDOFF'])assert.ok(!JSON.stringify([...jobs]).includes(secret),'receipt cannot persist '+secret);
data=await(await request()).json();assert.equal(data.confirmed,true);assert.equal(adds,1,'repeated request reads existing cart and never adds again');assert.equal(creates,1);
actual=1;data=await(await request()).json();assert.equal(data.confirmed,false);assert.equal(adds,1,'partial cart must not trigger automatic resend');
actual=2.5;throwAfterAdd=true;data=await(await request({...body,request_id:'40000000-0000-4000-8000-000000000002'})).json();assert.equal(data.confirmed,true,'lost add reply is recovered by exact cart readback');assert.equal(adds,2);
assert.equal(checkCart({},[]),null);assert.equal(checkCart({cart:{cartPositions:[{product:{productNumber:'wrong'},quantity:2.5}]}},[{sku:'000123',cents:250,material_ids:[article]}])[0].confirmed,false);
role='employee';
const delegated={...body,account_id:accountId,request_id:'40000000-0000-4000-8000-000000000003'};
delete delegated.customer;delete delegated.username;delete delegated.password;
assert.equal((await request({...delegated,company:'20000000-0000-4000-8000-000000000099'})).status,403);
assert.equal((await request({...delegated,action:'account-grant',employee_ids:[owner]})).status,403);
const list=await (await request({action:'accounts'})).json();
assert.deepEqual(list,[{id:accountId,label:'Test access',employee_ids:[]}]);
const cart=await (await request(delegated)).json();
assert.equal(cart.confirmed,true);assert.equal(adds,3);
assert.ok(!JSON.stringify(cart).includes('TEST_PASSWORD'));
onlineFallback=true;
const search=await(await request({action:'search',account_id:accountId,query:'Hager'})).json();
assert.equal(search[0].online_sku,'HAGER123');
const imported=await(await request({action:'article-add',account_id:accountId,sku:search[0].online_sku})).json();
assert.equal(imported.id,article);
assert.equal(adds,3,'article search and selection never submit cart positions');
granted=false;
assert.equal((await request(delegated)).status,403);
assert.equal((await request({action:'search',account_id:accountId,query:'000123'})).status,403);
assert.equal(adds,3);
console.log('PASS verified checkout edge: caller/role/company/material authorization, normal merchant sign-in, server-only transfer ledger, exact readback, zero false success, no duplicate add on retry or lost response, no price/password/cookie persistence and no checkout/order calls; realShopWrites=0');
