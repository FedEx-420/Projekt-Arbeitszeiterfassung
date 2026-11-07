import assert from 'node:assert/strict';
import {createFifMerchant,collectProducts} from '../../supabase/functions/supplier-fif-v995/merchant.mjs';
import {createHandler,checkFifCart} from '../../supabase/functions/supplier-fif-v995/handler.mjs';
import {createCodec} from '../../supabase/functions/supplier-fif-v995/session.mjs';
const company='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002',material='30000000-0000-4000-8000-000000000001',id='40000000-0000-4000-8000-000000000001',supplier='H. Gautzsch',env={url:'https://fixture.invalid',anonKey:'PUBLIC_FIXTURE',serviceKey:'SERVER_ONLY_FIXTURE_KEY_'.repeat(3)};
const line={sku:'000123',qu:'PCE',cents:250,material_ids:[material]};
assert.equal(checkFifCart([{productNumber:'000123',quantity:2.5,quantityUnit:'STCK'}],[line])[0].confirmed,true);
for(const rows of [[{productNumber:'123',quantity:2.5,quantityUnit:'STCK'}],[{productNumber:'000123',quantity:2.5}],[{productNumber:'000123',quantity:3,quantityUnit:'STCK'}],[{productNumber:'000123',quantity:2.5,quantityUnit:'M'}]])assert.ok(!checkFifCart(rows,[line])?.every(x=>x.confirmed));
assert.throws(()=>collectProducts({a:{productNumber:'001',id:1},b:{productNumber:'001',id:2}},new Set(['001'])),/widersprüchliche/);
assert.equal(collectProducts({HtmlData:[{html:'<article data-product-number="001" data-product-id="42"></article>'}]},new Set(['001'])).get('001').id,'42');
// Native login includes the anti-forgery token and server cookies, never an IDS route.
const wire=[],diagnostics=[];let freshToken='LOGIN_CSRF';
const protocol=createFifMerchant({report:event=>diagnostics.push(event),fetch:async(url,options)=>{const u=new URL(url);wire.push({u,options});assert.equal(u.origin,'https://www.onlinesystem.de');assert.ok(!u.pathname.includes('IDS'));
 if(u.pathname==='/Login'&&options.method==='GET')return new Response('<form><input value="LOGIN_CSRF" name="__RequestVerificationToken"></form>',{headers:{'set-cookie':'FiFSession=opaque; HttpOnly; Secure'}});
 if(u.pathname==='/Login'){const f=new URLSearchParams(options.body);assert.equal(f.get('Username'),'FIXTURE_USER');assert.equal(f.get('Password'),'FIXTURE_PASSWORD');assert.equal(f.get('__RequestVerificationToken'),'LOGIN_CSRF');assert.match(options.headers.Cookie,/FiFSession=opaque/);return new Response(null,{status:302,headers:{location:'/Warenkorb','set-cookie':'Auth=secret-fixture-cookie; HttpOnly; Secure'}});}
 if(u.pathname==='/Warenkorb')return new Response('Cart page');
 if(u.pathname==='/Manage')return new Response('<form method="post" action="/Logout"><input name="__RequestVerificationToken" value="SIGNED_CSRF"></form>');
 if(options.method==='POST')assert.equal(new URLSearchParams(options.body).get('__RequestVerificationToken'),'SIGNED_CSRF');assert.match(options.headers.Cookie,/Auth=secret-fixture-cookie/);
 if(u.pathname==='/Product/W00793/1')return new Response('<article data-product-id="29" data-product-number="W00793"></article>');
 if(u.pathname==='/Cart/Scan2FiFRead')return Response.json({jsRenderData:[{data:{productNumber:'000123',productId:19}}]});
 if(u.pathname==='/Warenkorb/Create')return Response.json({activeCart:{id:91,products:[]}});
 if(u.pathname==='/Warenkorb/Add'){const f=new URLSearchParams(options.body);assert.equal(f.get('cartId'),'91');assert.equal(f.get('insertProducts[0][productId]'),'19');assert.equal(f.get('insertProducts[0][quantity]'),'2.50');return Response.json({clientMessage:{type:'Success'}});}
 if(u.pathname==='/Warenkorb/91')return Response.json({activeCart:{id:91,products:[{productNumber:'000123',quantity:2.5,quantityUnit:'STCK'}]}});
 throw Error('Unexpected merchant route '+u.pathname);
}});
const s=await protocol.connect({username:'FIXTURE_USER',password:'FIXTURE_PASSWORD'}),mapped=await protocol.products(s,[line]);assert.equal(mapped[0].productId,'19');assert.equal(await protocol.create(s),'91');await protocol.add(s,'91',mapped);assert.equal(checkFifCart(await protocol.read(s,'91'),[line])[0].confirmed,true);
assert.equal((await protocol.products(s,[{...line,sku:'W00793'}]))[0].productId,'29');assert.ok(!JSON.stringify(diagnostics).includes('W00793'),'private dealer article numbers are not logged');
const codec=createCodec(env.serviceKey),context={owner:company,company,supplier},connection=await codec.seal(s,context);assert.ok(!connection.includes('secret-fixture-cookie'));assert.equal((await codec.open(connection,context)).username,'FIXTURE_USER');await assert.rejects(codec.open(connection,{...context,company:other}),/erneut verbinden/);
// Full handler uses authoritative company/SKU data and writes each cart only once.
const ledger=new Map(),actions=[];let role='business',materialCompany=company,wrongReadback=false,holdAdd;
const merchant=()=>({connect:async({username})=>({cookies:{opaque:'secret'},csrf:'secret',username,expires:Date.now()+600000}),products:async(s,ls)=>ls.map(l=>({...l,productId:'19'})),create:async()=>{actions.push('create');return '91';},add:async()=>{actions.push('add');if(holdAdd)await holdAdd;},read:async()=>{actions.push('read');return [{productNumber:'000123',quantity:wrongReadback?3:2.5,quantityUnit:'STCK'}];}});
const fetcher=async(url,options={})=>{const u=new URL(url),path=u.pathname;
 if(path==='/auth/v1/user')return Response.json({id:company});
 if(path==='/rest/v1/profiles')return Response.json(u.searchParams.has('role')?[{id:company,role:'business'}]:[{id:company,role}]);
 if(path==='/rest/v1/materials')return Response.json([{id:material,business_id:materialCompany,catalog_supplier:supplier,catalog_article_number:'000123',unit:'Stk'}]);
 if(path==='/rest/v1/supplier_cart_transfers_v949'){assert.equal(options.headers.Authorization,'Bearer '+env.serviceKey);const key=u.searchParams.get('id')?.slice(3),body=options.body?JSON.parse(options.body):null;
  if(options.method==='GET')return Response.json(ledger.has(key)?[ledger.get(key)]:[]);
  if(options.method==='POST'){if(ledger.has(body.id))return Response.json([]);ledger.set(body.id,body);return Response.json([body]);}
  if(options.method==='PATCH'){Object.assign(ledger.get(key),body);return Response.json([ledger.get(key)]);}
 }throw Error('Unexpected application route '+path);
};
const handler=createHandler({env,fetch:fetcher,merchant});
const request=(body={})=>new Request('https://fixture.invalid/functions/v1/supplier-fif-v995',{method:'POST',headers:{authorization:'Bearer SYNTHETIC_TOKEN'},body:JSON.stringify({action:'transfer',company,supplier,request_id:id,username:'FIXTURE_USER',password:'FIXTURE_PASSWORD',lines:[{material_id:material,quantity:'2.50'}],...body})});
let response=await handler(request()),result=await response.json();assert.equal(result.confirmed,true);assert.equal(result.cart_url,'https://www.onlinesystem.de/Warenkorb/91');assert.deepEqual(actions,['create','add','read']);assert.ok(!JSON.stringify([...ledger.values()]).includes('secret'));assert.ok(!JSON.stringify([...ledger.values()]).includes('FIXTURE_PASSWORD'));
result=await (await handler(request({connection:result.connection,password:undefined}))).json();assert.equal(result.confirmed,true);assert.deepEqual(actions,['create','add','read'],'repeat returns identical receipt without another write');
result=await (await handler(request({lines:[{material_id:material,quantity:'4'}]}))).json();assert.equal(result.code,'CHANGED');assert.equal(actions.filter(a=>a==='add').length,1);
result=await (await handler(request({username:'fixture_user'}))).json();assert.equal(result.code,'CHANGED','different merchant user spelling cannot reuse a confirmed receipt');
role='employee';assert.equal((await handler(request())).status,403);role='business';assert.equal((await handler(request({company:other}))).status,403);materialCompany=other;result=await (await handler(request())).json();assert.equal(result.code,'LINES');materialCompany=company;
wrongReadback=true;const nextId='40000000-0000-4000-8000-000000000002';result=await (await handler(request({request_id:nextId}))).json();assert.equal(result.confirmed,false);wrongReadback=false;result=await (await handler(request({request_id:nextId}))).json();assert.equal(result.confirmed,true);assert.equal(actions.filter(a=>a==='add').length,2,'uncertain readback is retried without re-adding');
console.log('PASS FiF: native login/CSRF/cookie isolation; exact product mapping; explicit fresh cart; SKU/quantity/unit readback; encrypted scoped sessions; no credentials in receipts; stable retries; employee/company boundaries; no real orders');
