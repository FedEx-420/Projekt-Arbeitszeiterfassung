import {createOnlineMerchant} from './online.mjs';
/* Read-only ONLINE PLUS stock adapter. Merchant passwords are never persisted. */
const te=new TextEncoder(),td=new TextDecoder(),uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const shops={efg:{origin:'https://efgonlineplus.de',layout:'EFG',domain:'efgonlineplus.de'},gc:{origin:'https://www.gconlineplus.de',layout:'GC',domain:'gconlineplus.de'}};
const cors={'Access-Control-Allow-Origin':'https://fedex-420.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const fail=(code,message,status=400)=>Object.assign(new Error(message),{code,status});
const b64=b=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
export function createCodec(secret,crypto=globalThis.crypto,now=Date.now){
 if(typeof secret!=='string'||secret.length<32)throw Error('Stock session encryption is not configured.');
 const key=crypto.subtle.importKey('raw',te.encode(secret),'HKDF',false,['deriveKey']).then(k=>crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:te.encode('worktime-stock-session-v948'),info:te.encode('merchant-session-only')},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt']));
 const aad=c=>te.encode(JSON.stringify([c.owner,c.company,c.supplier]));
 return {async seal(data,c){const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(c)},await key,te.encode(JSON.stringify(data)));return 'v1.'+b64(iv)+'.'+b64(new Uint8Array(cipher));},async open(token,c){try{if(typeof token!=='string'||token.length>60000)throw Error();const parts=token.split('.');if(parts.length!==3)throw Error();const [v,i,t]=parts;if(v!=='v1'||!i||!t)throw Error();const data=JSON.parse(td.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(i),additionalData:aad(c)},await key,unb64(t))));if(!Number.isFinite(data.expires)||data.expires<=now()||data.expires>now()+13*3600000||!shops[data.shop])throw Error();return data;}catch{throw fail('RECONNECT','Bitte den Fachhändler erneut verbinden.',401);}}};
}
function clean(value,max=1000){return typeof value==='string'?value.replace(/<[^>]*>/g,'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max).trim():'';}
export function normalizeStock(raw,sku,warehouse,checkedAt){
 const unknown={sku,status:'unknown',quantity:null,text:'Der Händler hat für diesen Artikel keinen eindeutigen Bestand geliefert.',warehouse,checked_at:checkedAt};
 if(!raw||raw.successful!==true||!Array.isArray(raw.obj?.stockArray)||raw.obj.stockArray.length!==1)return unknown;
 const row=raw.obj.stockArray[0],text=clean(row.stockText||row.stockTextShort),quantity=typeof row.stockQuantity==='number'&&Number.isFinite(row.stockQuantity)&&row.stockQuantity>=0?row.stockQuantity:null;
 if(!text||row.followerSymbol||/nicht gefunden|unbekannt|keine angaben/i.test(text))return {...unknown,text:text||unknown.text};
 return {sku,status:quantity>0&&/verfügbar|vorrätig|auf lager/i.test(text)&&!/nicht verfügbar|nicht vorrätig/i.test(text)?'in_stock':quantity===0?'not_in_stock':'unknown',quantity,text,warehouse,checked_at:checkedAt};
}
export function createMerchant({fetch,md5,now=Date.now}){
 async function call(session,path,data,timeoutMs=15000){
  const shop=shops[session.shop],url=new URL(shop.origin+path);url.searchParams.set('layout',shop.layout);
  {const rand=String(crypto.getRandomValues(new Uint32Array(1))[0]%10000000);url.searchParams.set('rand',rand);url.searchParams.set('crsfKey',md5(String(session.csrf??'null')+rand));if(session.userHash)url.searchParams.set('u',session.userHash);}
  const cookie=Object.entries(session.cookies||{}).map(([k,v])=>k+'='+v).join('; '),r=await fetch(url.href,{method:data===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{'Content-Type':'application/json; charset=UTF-8','Accept':'application/json','Accept-Language':'de-DE','Referer':shop.origin+'/',...(cookie?{Cookie:cookie}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});
  if(!r.ok)throw fail('SHOP_UNAVAILABLE','Der Händler antwortet gerade nicht auf die Bestandsabfrage.',502);
  const set=r.headers.getSetCookie?.()||[];for(const line of set){const part=line.split(';')[0],index=part.indexOf('=');if(index<1)continue;const name=part.slice(0,index),value=part.slice(index+1);if(!/^[A-Za-z0-9_.-]{1,100}$/.test(name)||/[\r\n;]/.test(value)||value.length>12000)continue;if(/(?:^|;)\s*max-age=0(?:;|$)/i.test(line))delete session.cookies[name];else session.cookies[name]=value;}
  const text=await r.text();if(text.length>2000000)throw fail('SHOP_RESPONSE','Die Händlerantwort ist zu groß.',502);try{return JSON.parse(text);}catch{throw fail('SHOP_RESPONSE','Der Händler hat keine lesbare Bestandsantwort geliefert.',502);}
 }
 async function connect({shop,username,password,customer}){
  if(!shops[shop])throw fail('SHOP','Bitte GC oder EFG ONLINE PLUS auswählen.');
  const s={shop,cookies:{},csrf:null,userHash:'',expires:now()+12*3600000};
  const initial=await call(s,'/api/account/getsettingsremaining?domain='+encodeURIComponent(shops[shop].domain));s.csrf=initial.crsfKey??null;
  const login=await call(s,'/api/account/login',{username,password,layout:shops[shop].layout,language:'DE'});
  if(login.successful!==true)throw fail('LOGIN','Die Anmeldung beim Fachhändler wurde nicht bestätigt. Bitte Zugangsdaten und Onlinezugang prüfen.',401);
  if(login.mandatoryActions?.length)throw fail('SHOP_ACTION','Bitte zuerst die vom Händler angezeigten Schritte direkt im Shop abschließen.',409);
  s.csrf=login.crsfKey??s.csrf;
  const settings=await call(s,'/api/account/getsettingsremaining?domain='+encodeURIComponent(shops[shop].domain)),u=settings.user;
  if(!u||String(u.customerNumber||'').replace(/^0+/,'')!==customer.replace(/^0+/,''))throw fail('CUSTOMER','Die Kundennummer stimmt nicht mit dem angemeldeten Händlerkonto überein.',403);
  s.csrf=settings.crsfKey??s.csrf;s.userHash=md5(['companyNumber','username','customerNumber'].map(k=>String(u[k]||'').trim().toUpperCase()).join('_'));
  s.warehouses=(settings.warehouses||[]).filter(w=>typeof w.mfv==='string'&&typeof w.warehouseNumber==='string'&&typeof w.name==='string').slice(0,300).map(w=>({id:w.mfv.trim()+w.warehouseNumber.trim(),stockId:u.customer?.company?.isSap?w.mfv.trim()+w.warehouseNumber.trim():w.warehouseNumber.trim(),name:clean(w.name,200)}));
  if(!s.warehouses.length)throw fail('WAREHOUSE','Der Händler hat kein Lager zur Auswahl geliefert.',502);
  return s;
 }
 async function refreshSession(session,needsToken=false){const settings=await call(session,'/api/account/getsettingsremaining?domain='+encodeURIComponent(shops[session.shop].domain)),user=settings.user;if(!user||md5(['companyNumber','username','customerNumber'].map(k=>String(user[k]||'').trim().toUpperCase()).join('_'))!==session.userHash)throw fail('RECONNECT','Die Händleranmeldung ist abgelaufen. Bitte erneut verbinden.',401);session.csrf=settings.crsfKey??session.csrf;if(typeof settings.jsonWebToken==='string'&&settings.jsonWebToken.length<=20000)session.apiToken=settings.jsonWebToken;if(needsToken&&!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(session.apiToken||''))throw fail('RECONNECT','Bitte den Fachhändler für die Online-Artikelsuche erneut verbinden.',401);return settings;}
 async function stocks(session,skus,warehouseId){await refreshSession(session);const warehouse=session.warehouses.find(w=>w.id===warehouseId);if(!warehouse)throw fail('WAREHOUSE','Bitte ein gültiges Händlerlager auswählen.');const results=new Array(skus.length),deadline=Date.now()+30000;let next=0;await Promise.all(Array.from({length:Math.min(3,skus.length)},async()=>{while(next<skus.length){const i=next++,sku=skus[i];try{if(Date.now()>=deadline)throw Error('Timeout');const answer=await call(session,'/api/products/getnetpricesandstocksbykbnlist',{kbns:[sku],stockId:warehouse.stockId},Math.max(1,Math.min(10000,deadline-Date.now())));results[i]=normalizeStock(answer,sku,{id:warehouse.id,name:warehouse.name},new Date(now()).toISOString());}catch(e){if(e.code==='RECONNECT')throw e;results[i]={sku,status:'unknown',quantity:null,text:'Die aktuelle Händlerabfrage konnte nicht abgeschlossen werden.',warehouse:{id:warehouse.id,name:warehouse.name},checked_at:new Date(now()).toISOString()};}}}));return results;}
 const online=createOnlineMerchant({call,refresh:refreshSession,fetch,now});
 return {connect,stocks,onlineSearch:online.search,onlineArticle:online.article};
}
export function createHandler({fetch=globalThis.fetch,env,md5,now=Date.now,crypto=globalThis.crypto}){
 const codec=createCodec(env.serviceKey,crypto,now),merchant=createMerchant({fetch,md5,now});
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
 return async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'METHOD',message:'Bitte POST verwenden.'},405);
  try{
   const auth=req.headers.get('authorization')||'';if(!/^Bearer [A-Za-z0-9._-]+$/.test(auth))throw fail('AUTH','Bitte in der Arbeitszeit-App anmelden.',401);
   const dbHeaders={apikey:env.anonKey,Authorization:auth};
   const userResponse=await fetch(env.url+'/auth/v1/user',{headers:dbHeaders,signal:AbortSignal.timeout(8000)});if(!userResponse.ok)throw fail('AUTH','Bitte erneut in der Arbeitszeit-App anmelden.',401);const user=await userResponse.json();if(!uuid.test(user.id||''))throw fail('AUTH','Anmeldung nicht bestätigt.',401);
   const profileResponse=await fetch(env.url+'/rest/v1/profiles?select=id,role&id=eq.'+user.id,{headers:dbHeaders,signal:AbortSignal.timeout(8000)});const profiles=profileResponse.ok?await profileResponse.json():[];const profile=profiles.find?.(p=>p.id===user.id);if(!profile||!['administrator','business'].includes(profile.role))throw fail('FORBIDDEN','Diese Funktion ist für die Verwaltung und Geschäftsleitung vorgesehen.',403);
   const raw=await req.text();if(raw.length>70000)throw fail('SIZE','Die Anfrage ist zu groß.');let body;try{body=JSON.parse(raw);}catch{throw fail('JSON','Ungültige Anfrage.');}
   const company=body.company,supplier=typeof body.supplier==='string'?body.supplier.trim():'';if(!uuid.test(company||'')||!supplier||supplier.length>120)throw fail('SCOPE','Firma und Fachhändler auswählen.');if(profile.role==='business'&&company!==user.id)throw fail('FORBIDDEN','Diese Firma gehört nicht zu diesem Konto.',403);
   const companyResponse=await fetch(env.url+'/rest/v1/profiles?select=id,role&id=eq.'+company+'&role=eq.business',{headers:dbHeaders,signal:AbortSignal.timeout(8000)});const companies=companyResponse.ok?await companyResponse.json():[];if(!companies.some?.(p=>p.id===company))throw fail('FORBIDDEN','Die ausgewählte Firma ist nicht verfügbar.',403);
   if(!/neugart|\bgc\b|efg/i.test(supplier))throw fail('UNSUPPORTED','Für diesen Fachhändler ist noch keine Bestandsanbindung eingerichtet.');
   const context={owner:user.id,company,supplier};
   if(body.action==='connect'){
    for(const [k,max] of [['username',50],['password',50],['customer',40]])if(typeof body[k]!=='string'||!body[k].length||body[k].length>max)throw fail('CREDENTIALS','Bitte Kundennummer, Benutzername und Kennwort vollständig eingeben.');
    const session=await merchant.connect(body);body.password='';return json({company,supplier,connection:await codec.seal(session,context),expires_at:new Date(session.expires).toISOString(),warehouses:session.warehouses.map(({id,name})=>({id,name}))});
   }
   if(['search','article','import_article'].includes(body.action)){
    const session=await codec.open(body.connection,context);if(!session.cookies||!session.userHash||!Array.isArray(session.warehouses))throw fail('RECONNECT','Bitte den Fachh\u00e4ndler erneut verbinden.',401);
    const warehouse=session.warehouses.find(w=>w.id===body.warehouse);if(!warehouse)throw fail('WAREHOUSE','Bitte ein g\u00fcltiges H\u00e4ndlerlager ausw\u00e4hlen.');
    const openProof=async(token,kind)=>{try{return await codec.open(token,{...context,supplier:supplier+':'+kind});}catch{throw fail('SEARCH_EXPIRED','Die gepr\u00fcfte Auswahl ist abgelaufen oder ung\u00fcltig. Bitte die Online-Suche aktualisieren.',409);}};
    const attach=async data=>({company,supplier,warehouse:warehouse.id,connection:await codec.seal(session,context),expires_at:new Date(session.expires).toISOString(),...data});
    if(body.action==='search'){
     const query=typeof body.query==='string'?body.query.trim():'';if(query.length<2||query.length>200||/[\u0000-\u001f]/.test(query))throw fail('QUERY','Bitte 2 bis 200 Zeichen als Suchbegriff eingeben.');
     const inStockOnly=body.in_stock_only!==false;let cursor={page:0,offset:0,search_id:'',search_pass:1,page_size:0};
     if(body.cursor){const c=await openProof(body.cursor,'search');if(c.query!==query||c.warehouse!==warehouse.id||c.in_stock_only!==inStockOnly)throw fail('CURSOR','Die Suche hat sich ge\u00e4ndert. Bitte neu suchen.');cursor=c;}
     const result=await merchant.onlineSearch(session,{query,page:cursor.page,warehouse:warehouse.id,inStockOnly,searchId:cursor.search_id,searchPass:cursor.search_pass});
     const selected=result.products.slice(cursor.offset,cursor.offset+20),pageSize=cursor.page_size||result.products.length;
     const moreInPage=cursor.offset+selected.length<result.products.length,more=selected.length>0&&(moreInPage||(cursor.page+1)*pageSize<result.hits);
     const next=more?await codec.seal({shop:session.shop,expires:now()+15*60000,query,warehouse:warehouse.id,in_stock_only:inStockOnly,page:moreInPage?cursor.page:cursor.page+1,offset:moreInPage?cursor.offset+selected.length:0,search_id:result.search_id,search_pass:result.search_pass,page_size:pageSize},{...context,supplier:supplier+':search'}):null;
     const items=await Promise.all(selected.map(async p=>({...p,item_ref:await codec.seal({shop:session.shop,expires:now()+15*60000,warehouse:warehouse.id,summary:p},{...context,supplier:supplier+':item'})})));
     return json(await attach({items,total:result.hits,cursor:next}));
    }
    if(body.action==='article'){
     const ref=await openProof(body.item_ref,'item');if(ref.warehouse!==warehouse.id||!ref.summary?.sku)throw fail('ARTICLE','Der Suchtreffer passt nicht zum gew\u00e4hlten Lager.');
     const article=await merchant.onlineArticle(session,ref.summary.sku,warehouse.id,ref.summary);
     const q=new URLSearchParams({select:'id,catalog_revision',business_id:'eq.'+company,catalog_supplier:'eq.'+supplier,catalog_article_number:'eq.'+article.data.article_number});
     const existingResponse=await fetch(env.url+'/rest/v1/materials?'+q,{headers:dbHeaders,signal:AbortSignal.timeout(8000)});if(!existingResponse.ok)throw fail('MATERIALS','Die Materialzuordnung konnte nicht gepr\u00fcft werden.',502);const existing=await existingResponse.json();if(!Array.isArray(existing)||existing.length>1)throw fail('MATERIALS','Die Materialzuordnung ist nicht eindeutig.',409);
     const data={...article.data,expected_id:existing[0]?.id||null,expected_revision:existing[0]?.catalog_revision||null},stock=normalizeStock(article.pricing,data.article_number,article.warehouse,article.checked_at);
     const proof=await codec.seal({shop:session.shop,expires:now()+5*60000,warehouse:warehouse.id,data},{...context,supplier:supplier+':offer'});
     return json(await attach({data,stock,offer_ref:proof,offer_expires_at:new Date(now()+5*60000).toISOString()}));
    }
    const offer=await openProof(body.offer_ref,'offer');if(offer.warehouse!==warehouse.id||!offer.data?.article_number)throw fail('ARTICLE','Der gepr\u00fcfte Artikel passt nicht zu dieser Auswahl.');
    const row=offer.data;
    const rpc=await fetch(env.url+'/rest/v1/rpc/import_material_catalog_v954',{method:'POST',headers:{...dbHeaders,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({p_company:company,p_supplier:supplier,p_rows:[row],p_confirm_net_eur:true,p_use_vk1:true})});
    if(!rpc.ok){const e=await rpc.json().catch(()=>({}));throw fail('ARTICLE_IMPORT',e.code==='40001'?'Der Artikel wurde inzwischen ge\u00e4ndert. Bitte die Suche aktualisieren.':'Der Artikel konnte nicht best\u00e4tigt gespeichert werden. Bitte die Materialliste pr\u00fcfen.',rpc.status>=500?502:409);}
    const result=await rpc.json(),counts=['created','updated','unchanged'].map(k=>result?.[k]);if(result.company_id!==company||result.catalog_import_version!==911||result.standard_price_source!=='recommended_price_1'||counts.some(n=>!Number.isSafeInteger(n)||n<0)||counts.reduce((a,b)=>a+b,0)!==1)throw fail('ARTICLE_IMPORT','Die Speicherung wurde nicht eindeutig best\u00e4tigt. Bitte die Materialliste pr\u00fcfen.',502);
    const q=new URLSearchParams({select:'*',business_id:'eq.'+company,catalog_supplier:'eq.'+supplier,catalog_article_number:'eq.'+row.article_number,active:'eq.true'}),response=await fetch(env.url+'/rest/v1/materials?'+q,{headers:dbHeaders,signal:AbortSignal.timeout(8000)});const found=response.ok?await response.json():null;
    if(!Array.isArray(found)||found.length!==1||found[0].business_id!==company||found[0].catalog_supplier!==supplier||found[0].catalog_article_number!==row.article_number)throw fail('ARTICLE_IMPORT','Der gespeicherte Artikel konnte nicht eindeutig geladen werden. Bitte die Materialliste pr\u00fcfen.',502);
    return json(await attach({material:found[0]}));
   }
   if(body.action==='stock_catalog'){
    const session=await codec.open(body.connection,context),articles=body.articles;
    if(!Array.isArray(articles)||!articles.length||articles.length>20||articles.some(a=>typeof a?.id!=='string'||a.id.length>240||!a.id.length||/[\u0000-\u001f]/.test(a.id)||typeof a.sku!=='string'||!a.sku.trim()||a.sku.length>120||/[\u0000-\u001f]/.test(a.sku))||new Set(articles.map(a=>a.id)).size!==articles.length)throw fail('ARTICLES','Bitte höchstens 20 gültige Katalogartikel abfragen.');
    const skus=[...new Set(articles.map(a=>a.sku))],results=await merchant.stocks(session,skus,body.warehouse),bySKU=new Map(results.map(r=>[r.sku,r]));
    return json({company,supplier,warehouse:body.warehouse,connection:await codec.seal(session,context),expires_at:new Date(session.expires).toISOString(),items:articles.map(a=>({item_id:a.id,...bySKU.get(a.sku)}))});
   }
   if(body.action!=='stock')throw fail('ACTION','Unbekannte Aktion.');
   const session=await codec.open(body.connection,context),ids=body.material_ids;
   if(!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(id=>!uuid.test(id)))throw fail('ARTICLES','Bitte höchstens 20 gültige Materialien abfragen.');
   const q=new URLSearchParams({select:'id,catalog_article_number,catalog_supplier,business_id',business_id:'eq.'+company,active:'eq.true',catalog_supplier:'eq.'+supplier,id:'in.('+[...new Set(ids)].join(',')+')'}),materialsResponse=await fetch(env.url+'/rest/v1/materials?'+q,{headers:dbHeaders,signal:AbortSignal.timeout(8000)});if(!materialsResponse.ok)throw fail('MATERIALS','Die Materialien konnten nicht geprüft werden.',502);const materials=await materialsResponse.json();if(!Array.isArray(materials)||materials.length!==new Set(ids).size||materials.some(m=>m.business_id!==company||m.catalog_supplier!==supplier||!m.catalog_article_number))throw fail('MATERIALS','Eine Position gehört nicht zur aktuellen Firmen- und Händlerauswahl.',403);
   const skus=[...new Set(materials.map(m=>m.catalog_article_number))];if(skus.some(s=>typeof s!=='string'||s.length>120))throw fail('ARTICLES','Eine Artikelnummer ist ungültig.');
   const results=await merchant.stocks(session,skus,body.warehouse),bySKU=new Map(results.map(r=>[r.sku,r]));
   return json({company,supplier,warehouse:body.warehouse,connection:await codec.seal(session,context),expires_at:new Date(session.expires).toISOString(),items:materials.map(m=>({material_id:m.id,...bySKU.get(m.catalog_article_number)}))});
  }catch(e){return json({error:e.code||'UNAVAILABLE',code:e.code||'UNAVAILABLE',message:e.code?e.message:'Die Bestandsabfrage konnte nicht abgeschlossen werden. Bitte später erneut versuchen.'},e.status||502);}
 };
}
