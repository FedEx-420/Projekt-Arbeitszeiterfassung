import {createFifMerchant,origin} from './merchant.mjs';
import {createCodec} from './session.mjs';
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const headers={'Access-Control-Allow-Origin':'https://fedex-420.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
const fail=(code,message,status=400)=>Object.assign(Error(message),{code,status});
const units={stk:'PCE',stck:'PCE',stück:'PCE',st:'PCE',pce:'PCE',m:'MTR',meter:'MTR',mtr:'MTR',kg:'KGM',kgm:'KGM',paar:'PR',pr:'PR',satz:'SET',set:'SET',l:'LTR',ltr:'LTR',m2:'MTK','m²':'MTK',mtk:'MTK',m3:'MTQ','m³':'MTQ',mtq:'MTQ',cm:'CMT',mm:'MMT',g:'GRM',km:'KTM'};
const toUnit=v=>{const raw=typeof v==='object'&&v?(v.shortName??v.symbol??v.code??v.name):v;return typeof raw==='string'?units[raw.trim().toLowerCase()]||'':'';};
const cents=v=>{const text=String(v??'').replace(',','.');if(!/^\d{1,6}(?:\.\d{1,2})?$/.test(text)||Number(text)<=0||Number(text)>999999.99)throw fail('QUANTITY','Bitte eine gültige Menge eingeben.');return Math.round(Number(text)*100);};
export function checkFifCart(rows,lines){
 if(!Array.isArray(rows)||rows.length>2000)return null;
 const got=new Map();for(const r of rows){const sku=r?.productNumber??r?.articleNumber??r?.product?.productNumber,quantity=r?.quantity,unit=[...new Set([r?.salesQuantityUnit,r?.salesQuantityUnitTranslation,r?.salesQuantityUnitCode,r?.quantityUnit,r?.unit,r?.unitSymbol,r?.salesUnit,r?.quantityUnitName,r?.unitName,r?.product?.unit].map(toUnit).filter(Boolean))];if(typeof sku!=='string'||!sku||got.has(sku)||!lines.some(l=>l.sku===sku))return null;let actual;try{actual=cents(quantity);}catch{return null;}got.set(sku,{cents:actual,unit:unit.length===1?unit[0]:''});}
 return lines.map(l=>({material_ids:l.material_ids,sku:l.sku,quantity:l.cents/100,unit:l.qu,actual_quantity:got.get(l.sku)?.cents/100||0,confirmed:got.get(l.sku)?.cents===l.cents&&got.get(l.sku)?.unit===l.qu}));
}
export function createHandler({fetch=globalThis.fetch,env,crypto=globalThis.crypto,now=Date.now,report=()=>{},merchant:createMerchant=createFifMerchant}){
 const codec=createCodec(env.serviceKey,crypto,now),merchant=createMerchant({fetch,now,report}),json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 return async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers});if(request.method!=='POST')return json({code:'METHOD',message:'Bitte POST verwenden.'},405);
  let session,context,body,ref='',writeStarted=false;
  try{
   const auth=request.headers.get('authorization')||'';if(!/^Bearer [A-Za-z0-9._-]+$/.test(auth))throw fail('AUTH','Bitte in der App anmelden.',401);
   const userHeaders={apikey:env.anonKey,Authorization:auth};
   const read=async path=>{const r=await fetch(env.url+path,{headers:userHeaders,signal:AbortSignal.timeout(15000)});if(!r.ok)throw fail('AUTH','Das Arbeitskonto konnte nicht bestätigt werden.',401);return r.json();};
   const user=await read('/auth/v1/user');if(!uuid.test(user?.id||''))throw fail('AUTH','Die Anmeldung ist nicht bestätigt.',401);
   const p=(await read('/rest/v1/profiles?select=id,role,business_id&id=eq.'+user.id)).find(p=>p.id===user.id);
   if(!p||!['administrator','business','employee'].includes(p.role))throw fail('FORBIDDEN','Der FiF-Zugang ist für dieses Arbeitskonto noch nicht freigegeben.',403);
   const raw=await request.text();if(raw.length>220000)throw fail('SIZE','Der Warenkorb ist zu groß.');try{body=JSON.parse(raw);}catch{throw fail('JSON','Ungültige Anfrage.');}
   const company=p.role==='business'?user.id:p.role==='employee'?p.business_id:body.company,supplier=String(body.supplier||'').trim();
   if(!uuid.test(company||'')||body.company!==company||!['connect','transfer','accounts','account-create','account-grant','account-delete','search','browser-login'].includes(body.action)||supplier.length>120||body.supplier!=null&&!/\bgautzsch\b/i.test(supplier))throw fail('SCOPE','Bitte die richtige Firma und Gautzsch auswählen.',403);
   const serviceHeaders={apikey:env.serviceKey,Authorization:'Bearer '+env.serviceKey,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=representation'};
   const privileged=async(path,options={})=>{const r=await fetch(env.url+path,{...options,headers:serviceHeaders,signal:AbortSignal.timeout(15000)});if(!r.ok)throw fail('FORBIDDEN','Der FiF-Zugang ist nicht verfügbar oder nicht mehr freigegeben.',403);return r.json();};
   const companies=await privileged('/rest/v1/profiles?select=id,role&id=eq.'+company+'&role=eq.business');if(!companies.some(c=>c.id===company&&c.role==='business'))throw fail('SCOPE','Diese Firma ist nicht verfügbar.',403);
   const account=async(operation,payload={})=>privileged('/rest/v1/rpc/fif_account_v997',{method:'POST',body:JSON.stringify({actor:user.id,operation,payload:{company,...payload}})});
   if(body.action==='accounts')return json(await account('list'));
   if(['account-create','account-grant','account-delete'].includes(body.action)){
    if(!['administrator','business'].includes(p.role))throw fail('FORBIDDEN','Nur die Geschäftsleitung und Administration verwalten FiF-Zugänge.',403);
    if(body.action==='account-create'){
     const label=String(body.label||'').trim();if(!label||label.length>80)throw fail('LABEL','Bitte einen Namen für den Zugang eingeben.');
     await merchant.connect({username:body.username,password:body.password});
     return json(await account('create',{label,credentials:{username:body.username.trim(),password:body.password}}));
    }
    if(!uuid.test(body.account_id||''))throw fail('ACCOUNT','Bitte einen FiF-Zugang auswählen.');
    return json(await account(body.action==='account-grant'?'grant':'delete',{id:body.account_id,employee_ids:body.employee_ids,browser_login_consent:body.browser_login_consent===true}));
   }
   let saved=null;
   if(body.account_id){if(!uuid.test(body.account_id))throw fail('ACCOUNT','Ungültiger FiF-Zugang.');saved=await account('credentials',{id:body.account_id});if(saved.company!==company)throw fail('FORBIDDEN','Der Zugang gehört zu einer anderen Firma.',403);}
   else if(p.role==='employee'||['search','browser-login'].includes(body.action))throw fail('FORBIDDEN','Bitte einen freigegebenen FiF-Zugang auswählen.',403);
   if(body.action==='search'){
    const q=String(body.query||'').trim().replace(/[^\p{L}\p{N} ._\/-]/gu,'').slice(0,80),offset=Math.min(10000,Math.max(0,Number(body.offset)||0));
    if(q.length<2||!/[\p{L}\p{N}]/u.test(q))return json([]);
    const params=new URLSearchParams({select:'id,business_id,name,unit,catalog_supplier,catalog_article_number,catalog_product_name,catalog_image_url,catalog_gtin,catalog_manufacturer,catalog_manufacturer_number,purchase_price,unit_price,recommended_price_1,recommended_price_2',business_id:'eq.'+company,active:'eq.true',catalog_supplier:'ilike.*gautzsch*',and:'('+q.split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0,8).map(term=>{const aliases={schuko:['schutzkontakt'],schutzkontakt:['schuko'],steckdose:['schuko','schutzkontakt'],ls:['leitungsschutzschalter'],fi:['fehlerstromschutzschalter'],rcd:['fehlerstromschutzschalter']},forms=[...new Set([term,term.replace(/ae/gi,'ä').replace(/oe/gi,'ö').replace(/ue/gi,'ü').replace(/ss/gi,'ß'),...(aliases[term.toLowerCase()]||[])])];return 'or('+forms.flatMap(word=>['name','catalog_product_name','catalog_manufacturer','catalog_article_number','catalog_manufacturer_number','catalog_gtin'].map(field=>field+'.ilike.*'+word+'*')).join(',')+')';}).join(',')+')',order:'catalog_article_number.asc,id.asc',limit:'50',offset:String(offset)});
    return json(await privileged('/rest/v1/materials?'+params));
   }
   if(body.action==='browser-login'){
    if(!uuid.test(body.request_id||''))throw fail('RECEIPT','Bitte zuerst den Warenkorb übertragen.');
    const rows=await privileged('/rest/v1/supplier_cart_transfers_v949?id=eq.'+body.request_id);
    const job=rows[0],receipt=job?.receipt,cartURL=receipt?.cart_url;
    if(job?.user_id!==user.id||job?.company_id!==company||receipt?.confirmed!==true||receipt?.account_id!==body.account_id||typeof cartURL!=='string'||!/^https:\/\/www\.onlinesystem\.de\/Warenkorb\/[1-9]\d{0,14}$/.test(cartURL))throw fail('RECEIPT','Der bestätigte Warenkorb gehört nicht zu diesem Arbeitskonto und Zugang.',403);
    return json({company,account_id:body.account_id,request_id:body.request_id,cart_url:cartURL,action:origin+'/default.aspx',fields:{strLogin:saved.credentials.username,strPass:saved.credentials.password,BtnLogin:'',ReturnUrl:new URL(cartURL).pathname}});
   }
   if(!/\bgautzsch\b/i.test(supplier))throw fail('SCOPE','Bitte Gautzsch auswählen.');
   context={owner:user.id,company,supplier};
   session=saved?await merchant.connect(saved.credentials):body.connection?await codec.open(body.connection,context):await merchant.connect({username:body.username,password:body.password});body.password='';
   const attach=async data=>({company,supplier,...(saved?{account_id:body.account_id}:{connection:await codec.seal(session,context)}),...data});
   if(body.action==='connect')return json(await attach({login_confirmed:true}));
   const id=body.request_id;if(!uuid.test(id||'')||!Array.isArray(body.lines)||!body.lines.length||body.lines.length>1000)throw fail('LINES','Bitte 1 bis 1000 gültige Positionen auswählen.');
   const ids=body.lines.map(l=>l.material_id);if(ids.some(x=>!uuid.test(x||''))||new Set(ids).size!==ids.length)throw fail('LINES','Die Artikelauswahl ist ungültig.');
   const materials=[];for(let offset=0;offset<ids.length;offset+=100){const params=new URLSearchParams({select:'id,business_id,catalog_supplier,catalog_article_number,unit',business_id:'eq.'+company,catalog_supplier:saved?'ilike.*gautzsch*':'eq.'+supplier,active:'eq.true',id:'in.('+ids.slice(offset,offset+100).join(',')+')'});materials.push(...await (saved?privileged:read)('/rest/v1/materials?'+params));}
   if(materials.length!==ids.length||materials.some(m=>m.business_id!==company||(saved?!/\bgautzsch\b/i.test(m.catalog_supplier||''):m.catalog_supplier!==supplier)))throw fail('LINES','Ein Artikel gehört nicht zu dieser Firma und diesem Fachhändler.',403);
   const grouped=new Map();for(const item of body.lines){const m=materials.find(m=>m.id===item.material_id),sku=m.catalog_article_number,qu=toUnit(m.unit),quantity=cents(item.quantity);if(typeof sku!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/.test(sku)||!qu)throw fail('ARTICLE','Artikelnummer oder Bestelleinheit fehlt.');const prior=grouped.get(sku);if(prior){if(prior.qu!==qu)throw fail('UNIT','Die Artikelnummer enthält unterschiedliche Einheiten.');prior.cents+=quantity;if(prior.cents>99999999)throw fail('QUANTITY','Die Gesamtmenge ist zu groß.');prior.material_ids.push(m.id);}else grouped.set(sku,{sku,qu,cents:quantity,material_ids:[m.id]});}
   for(const line of grouped.values())line.material_ids.sort();
   const lines=[...grouped.values()].sort((a,b)=>a.sku.localeCompare(b.sku));
   const fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['fif-v995',company,supplier,session.username.trim(),lines,...(saved?[body.account_id]:[])]))))].map(b=>b.toString(16).padStart(2,'0')).join('');
   const db=async(method,query,data)=>{const r=await fetch(env.url+'/rest/v1/supplier_cart_transfers_v949'+query,{method,headers:serviceHeaders,...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw fail('RECEIPT','Die Übertragung konnte nicht sicher protokolliert werden. Bitte nicht erneut senden.',502);return r.json();};
   const where='?id=eq.'+id;let job=(await db('GET',where))[0];
   if(job)writeStarted=true;
   if(job&&(job.user_id!==user.id||job.company_id!==company||job.fingerprint!==fingerprint))throw fail('CHANGED','Dieser Übertragungsvorgang gehört zu einer anderen Auswahl oder Anmeldung.',409);
   if(job?.receipt?.confirmed)return json(await attach(job.receipt));
   if(job&&!job.cart_ref)throw fail('UNCERTAIN','Die vorherige Anfrage ist noch nicht eindeutig abgeschlossen. Es werden keine Artikel erneut gesendet.',409);
   if(!job){
    const products=await merchant.products(session,lines);
    const created=await db('POST','?on_conflict=id',{id,user_id:user.id,company_id:company,fingerprint,state:'started'});if(!created.length)throw fail('UNCERTAIN','Die Anfrage läuft bereits. Bitte den Vorgang prüfen.',409);
    if(saved)await account('credentials',{id:body.account_id});
    writeStarted=true;ref=await merchant.create(session);if(!/^[1-9]\d{0,14}$/.test(ref))throw fail('FIF_CART','FiF hat keinen gültigen Warenkorb bestätigt.',502);
    await db('PATCH',where,{cart_ref:ref,state:'created',updated_at:new Date(now()).toISOString()});
    if(saved)await account('credentials',{id:body.account_id});
    try{await merchant.add(session,ref,products);}catch{/* Read back after uncertain/partial writes. Never automatically resend. */}
    await db('PATCH',where,{state:'sent',updated_at:new Date(now()).toISOString()});
   }else {if(!/^[1-9]\d{0,14}$/.test(String(job.cart_ref)))throw fail('FIF_CART','Die gespeicherte FiF-Warenkorbkennung ist ungültig.',502);ref=String(job.cart_ref);}
   let items=null;try{items=checkFifCart(await merchant.read(session,ref),lines);}catch{}
   const confirmed=!!items&&items.every(x=>x.confirmed),receipt={company,supplier,...(saved?{account_id:body.account_id}:{}),request_id:id,confirmed,cart_url:origin+'/Warenkorb/'+ref,items:items||[],checked_at:new Date(now()).toISOString(),message:confirmed?'Alle Artikel und Mengen wurden im FiF-Warenkorb bestätigt.':'Der FiF-Warenkorb wurde noch nicht vollständig bestätigt. Bitte beim Händler prüfen; es wird nichts erneut gesendet.'};
   await db('PATCH',where,{receipt,state:confirmed?'confirmed':'uncertain',updated_at:new Date(now()).toISOString()});return json(await attach(receipt));
  }catch(error){
   const code=error.code||'FIF_UNAVAILABLE',message=error.code?error.message:'Die FiF-Verbindung konnte gerade nicht abgeschlossen werden.';
   report({stage:'result',code});
   if(session&&context)return json({company:context.company,supplier:context.supplier,request_id:body?.request_id,...(body?.account_id?{account_id:body.account_id}:{connection:await codec.seal(session,context)}),confirmed:false,code,message,write_started:writeStarted,...(ref?{cart_url:origin+'/Warenkorb/'+ref}:{})});
   return json({code,message},error.status||502);
  }finally{if(body)body.password='';}
 };
}
