import {createMerchant,loginToken} from './merchant.mjs';
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const shops={efg:'https://efgonlineplus.de',gc:'https://www.gconlineplus.de'};
const headers={'Access-Control-Allow-Origin':'https://fedex-420.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
const fail=(code,message,status=400)=>Object.assign(Error(message),{code,status});
const quantity=v=>{const s=String(v??'').replace(',','.');if(!/^\d{1,6}(?:\.\d{1,2})?$/.test(s)||Number(s)<=0||Number(s)>999999.99)throw fail('QUANTITY','Bitte eine gültige Menge eingeben.');return Math.round(Number(s)*100);};
const units={stk:'PCE',stück:'PCE',st:'PCE',pce:'PCE',m:'MTR',meter:'MTR',mtr:'MTR',kg:'KGM',kgm:'KGM',paar:'PR',pr:'PR',satz:'SET',set:'SET',l:'LTR',ltr:'LTR',m2:'MTK','m²':'MTK',mtk:'MTK',m3:'MTQ','m³':'MTQ',mtq:'MTQ',cm:'CMT',mm:'MMT',g:'GRM',km:'KTM'};
export function checkCart(data,expected){
 const rows=data?.cart?.cartPositions;if(!Array.isArray(rows)||rows.length>2000)return null;
 const got=new Map();for(const r of rows){const sku=String(r.product?.productNumber??'').trim();if(!sku)continue;const n=Number(r.quantity);if(!Number.isFinite(n)||n<0||Math.abs(n*100-Math.round(n*100))>0.001)return null;const unit=r.product?.quantityUnit||r.quantityUnit||'';if(unit&&expected.some(e=>e.sku===sku)&&!units[String(unit).trim().toLowerCase()])return null;got.set(sku,(got.get(sku)||0)+Math.round(n*100));}
 return expected.map(e=>({material_ids:e.material_ids,sku:e.sku,quantity:e.cents/100,confirmed:got.get(e.sku)===e.cents,actual_quantity:(got.get(e.sku)||0)/100}));
}
export function createHandler({fetch=globalThis.fetch,env,md5,crypto=globalThis.crypto,now=Date.now}){
 const merchant=createMerchant({fetch,md5,now}),json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 return async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return json({code:'METHOD',message:'Bitte POST verwenden.'},405);
  let secret='';
  try{
   const auth=req.headers.get('authorization')||'';if(!/^Bearer [A-Za-z0-9._-]+$/.test(auth))throw fail('AUTH','Bitte in der Arbeitszeit-App anmelden.',401);
   const userHeaders={apikey:env.anonKey,Authorization:auth};
   const read=async path=>{const r=await fetch(env.url+path,{headers:userHeaders,signal:AbortSignal.timeout(10000)});if(!r.ok)throw fail('AUTH','Das Arbeitskonto konnte nicht bestätigt werden.',401);return r.json();};
   const user=await read('/auth/v1/user');if(!uuid.test(user.id||''))throw fail('AUTH','Anmeldung nicht bestätigt.',401);
   const profiles=await read('/rest/v1/profiles?select=id,role,business_id&id=eq.'+user.id),profile=profiles.find(p=>p.id===user.id);if(!profile||!['administrator','business','employee'].includes(profile.role))throw fail('FORBIDDEN','Nur Geschäftsleitung und Verwaltung können Einkaufswarenkörbe übertragen.',403);
   const raw=await req.text();if(raw.length>180000)throw fail('SIZE','Der Einkaufswarenkorb ist zu groß.');let body;try{body=JSON.parse(raw);}catch{throw fail('JSON','Ungültige Anfrage.');}
   const serviceHeaders={apikey:env.serviceKey,Authorization:'Bearer '+env.serviceKey,'Content-Type':'application/json'};
   const scopedCompany=profile.role==='administrator'?body.company:profile.role==='business'?user.id:profile.business_id;
   const account=async(operation,payload={})=>{
    const response=await fetch(env.url+'/rest/v1/rpc/neugart_account_v971',{method:'POST',headers:serviceHeaders,body:JSON.stringify({actor:user.id,operation,payload:{...payload,company:scopedCompany}}),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw fail('ACCOUNT','Der Neugart-Zugang ist nicht verfügbar oder nicht freigegeben.',response.status>=500?502:403);
    return response.json();
   };
   const validCredentials=values=>{
    for(const [key,max] of [['customer',40],['username',50],['password',50]])if(typeof values?.[key]!=='string'||!values[key].trim()||values[key].length>max)throw fail('LOGIN','Bitte Kundennummer, Benutzername und Kennwort eingeben.');
    return {customer:values.customer.trim(),username:values.username.trim(),password:values.password};
   };
   if(body.action==='accounts')return json(await account('list'));
   if(['account-create','account-grant','account-delete'].includes(body.action)){
    if(!['business','administrator'].includes(profile.role))throw fail('FORBIDDEN','Nur die Geschäftsleitung und Verwaltung können Neugart-Zugänge verwalten.',403);
    if(!uuid.test(scopedCompany||''))throw fail('ACCOUNT','Bitte einen Betrieb auswählen.');
    if(body.action==='account-create'){
     const label=typeof body.label==='string'?body.label.trim():'';
     if(!label||label.length>80)throw fail('LABEL','Bitte einen Namen für den Zugang eingeben.');
     const credentials=validCredentials(body);
     await merchant.connect({shop:'efg',...credentials});
     return json(await account('create',{label,credentials}));
    }
    if(!uuid.test(body.account_id||''))throw fail('ACCOUNT','Bitte einen Zugang auswählen.');
    if(body.action==='account-delete')return json(await account('delete',{id:body.account_id}));
    if(!Array.isArray(body.employee_ids)||body.employee_ids.length>500||body.employee_ids.some(id=>!uuid.test(id)))throw fail('EMPLOYEES','Ungültige Mitarbeiterauswahl.');
    return json(await account('grant',{id:body.account_id,employee_ids:body.employee_ids}));
   }
   const readMaterials=async params=>{
    const response=await fetch(env.url+'/rest/v1/materials?'+params,{headers:serviceHeaders,signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw fail('MATERIALS','Die Neugart-Artikel konnten nicht geladen werden.',502);
    return response.json();
   };
   const onlineSession=async()=>{
    const saved=await account('credentials',{id:body.account_id});
    if(saved?.company!==scopedCompany)throw fail('ACCOUNT','Der Zugang gehört nicht zu diesem Betrieb.',403);
    const credentials=validCredentials(saved.credentials);
    try{return await merchant.connect({shop:'efg',...credentials});}
    finally{credentials.password='';saved.credentials.password='';}
   };
   if(body.action==='check-login'){
    if(!uuid.test(body.account_id||''))throw fail('ACCOUNT','Bitte einen Zugang auswählen.');
    const saved=await account('credentials',{id:body.account_id});
    if(saved?.company!==scopedCompany)throw fail('ACCOUNT','Der Zugang gehört nicht zu diesem Betrieb.',403);
    const credentials=validCredentials(saved.credentials);
    try{
     await merchant.connect({shop:'efg',...credentials});
     const handoff=await merchant.browserLogin(credentials);
     return json({login_confirmed:true,handoff_available:!!handoff,...(handoff?{handoff:{action:handoff.origin+'/?login=true',token:handoff.token}}:{})});
    }finally{credentials.password='';saved.credentials.password='';}
   }
   if(body.action==='article-add'){
    if(!uuid.test(body.account_id||'')||!uuid.test(scopedCompany||'')||typeof body.sku!=='string'||!body.sku.trim()||body.sku.length>120||/[\u0000-\u001f]/.test(body.sku))throw fail('ARTICLE','Bitte einen gültigen Artikel auswählen.');
    const session=await onlineSession(),warehouse=session.warehouses[0]?.id;
    const detail=await merchant.online.article(session,body.sku.trim(),warehouse);
    const response=await fetch(env.url+'/rest/v1/rpc/neugart_import_article_v975',{method:'POST',headers:serviceHeaders,body:JSON.stringify({actor:user.id,company:scopedCompany,account_id:body.account_id,article:detail.data}),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw fail('ARTICLE_SAVE','Der geprüfte Händlerartikel konnte noch nicht gespeichert werden.',502);
    return json(await response.json());
   }
   if(body.action==='search'){
    if(!uuid.test(scopedCompany||'')||!(await account('list')).some(a=>a.id===body.account_id))throw fail('ACCOUNT','Dieser Neugart-Zugang ist nicht freigegeben.',403);
    const clean=value=>String(value||'').normalize('NFKC').trim().replace(/[^\p{L}\p{N} .-]/gu,' ').trim().slice(0,80);
    const term=clean(body.query),brand=clean(body.manufacturer),category=clean(body.category);
    if(term.length<2&&brand.length<2&&category.length<2)return json([]);
    const params=new URLSearchParams({
     select:'id,name,unit,catalog_article_number,catalog_supplier,catalog_product_name,catalog_manufacturer,catalog_manufacturer_number,catalog_gtin,catalog_category,catalog_image_url',
     business_id:'eq.'+scopedCompany,active:'eq.true',catalog_supplier:'ilike.*neugart*',order:'name.asc,id.asc',limit:'40'
    });
    if(brand)params.set('catalog_manufacturer','ilike.*'+brand+'*');
    if(category)params.set('catalog_category','ilike.*'+category+'*');
    const tokens=term.split(/\s+/).filter(Boolean).slice(0,6);
    const exact=[];
    if(tokens.length===1&&/\d/.test(term)){
     const byNumber=new URLSearchParams(params);
     byNumber.set('or','(catalog_article_number.ilike.'+term+',catalog_manufacturer_number.ilike.'+term+',catalog_gtin.eq.'+term+')');
     byNumber.set('limit','10');
     exact.push(...await readMaterials(byNumber));
     if(exact.length)return json(exact);
    }
    if(tokens.length)params.set('and','('+tokens.map(token=>'or(name.ilike.*'+token+'*,catalog_product_name.ilike.*'+token+'*,catalog_manufacturer.ilike.*'+token+'*,catalog_article_number.ilike.*'+token+'*,catalog_manufacturer_number.ilike.*'+token+'*)').join(',')+')');
    const local=await readMaterials(params);
    if(local.length)return json(local);
    const session=await onlineSession();
    const remote=await merchant.online.search(session,{query:[term,brand,category].filter(Boolean).join(' '),warehouse:session.warehouses[0]?.id,inStockOnly:true});
    return json(remote.products.filter(p=>!p.locked).slice(0,40).map(p=>({
      id:'online:'+p.sku,online_sku:p.sku,name:p.name,catalog_product_name:p.name,
      catalog_article_number:p.sku,catalog_supplier:'Neugart',
      catalog_manufacturer_number:p.manufacturer_number,catalog_gtin:p.gtin,catalog_image_url:p.image_url
    })));
   }
   const delegated=uuid.test(body.account_id||'');
   if(profile.role==='employee'&&!delegated)throw fail('FORBIDDEN','Bitte einen freigegebenen Neugart-Zugang wählen.',403);
   const {company,request_id:id}=body,supplier=String(body.supplier||'').trim();if(!uuid.test(company||'')||!uuid.test(id||'')||supplier.length>120||!/neugart|\bgc\b|efg/i.test(supplier))throw fail('SUPPLIER','Für diesen Fachhändler ist noch keine automatische Warenkorbanbindung vorhanden.');
   if(delegated&&!/neugart/i.test(supplier))throw fail('ACCOUNT','Gespeicherte Zugänge sind nur für Neugart verfügbar.',403);
   if(profile.role==='employee'&&company!==profile.business_id)throw fail('FORBIDDEN','Der Einkauf gehört nicht zu diesem Konto.',403);
   if(profile.role==='business'&&company!==user.id)throw fail('FORBIDDEN','Der Einkauf gehört nicht zu diesem Konto.',403);
   const saved=delegated?await account('credentials',{id:body.account_id}):null;
   if(delegated&&saved?.company!==company)throw fail('ACCOUNT','Dieser Neugart-Zugang gehört nicht zu dieser Firma.',403);
   const companies=profile.role==='employee'?[{id:company}]:await read('/rest/v1/profiles?select=id,role&id=eq.'+company+'&role=eq.business');if(!companies.some(p=>p.id===company))throw fail('FORBIDDEN','Die Firma ist nicht verfügbar.',403);
   if(!Array.isArray(body.lines)||!body.lines.length||body.lines.length>1000)throw fail('LINES','Bitte 1 bis 1000 Artikel auswählen.');
   const ids=body.lines.map(l=>l.material_id);if(ids.some(x=>!uuid.test(x))||new Set(ids).size!==ids.length)throw fail('LINES','Die Artikelauswahl ist ungültig.');
   const params=new URLSearchParams({select:'id,catalog_article_number,catalog_supplier,business_id,unit',business_id:'eq.'+company,active:'eq.true',catalog_supplier:'eq.'+supplier,id:'in.('+ids.join(',')+')'}),materials=[];for(let offset=0;offset<ids.length;offset+=100){params.set('id','in.('+ids.slice(offset,offset+100).join(',')+')');materials.push(...await (profile.role==='employee'?readMaterials(params):read('/rest/v1/materials?'+params)));}
   if(materials.length!==ids.length||materials.some(m=>m.business_id!==company||m.catalog_supplier!==supplier))throw fail('LINES','Ein Artikel gehört nicht zum ausgewählten Fachhändler oder zur Firma.',403);
   const grouped=new Map();for(const l of body.lines){const m=materials.find(m=>m.id===l.material_id),sku=String(m.catalog_article_number||'').trim(),qu=units[String(m.unit||'').toLowerCase().trim()];if(!sku||sku.length>120||/[\u0000-\u001f]/.test(sku)||!qu)throw fail('ARTICLE','Artikelnummer oder Bestelleinheit ist unvollständig.');const cents=quantity(l.quantity),existing=grouped.get(sku);if(existing&&existing.qu!==qu)throw fail('UNIT','Eine Artikelnummer enthält widersprüchliche Bestelleinheiten.');if(existing){existing.cents+=cents;existing.material_ids.push(m.id);}else grouped.set(sku,{sku,qu,cents,material_ids:[m.id]});}
   const lines=[...grouped.values()].sort((a,b)=>a.sku.localeCompare(b.sku));
   const credentials=validCredentials(saved?.credentials||body);
   const shop=/neugart|efg/i.test(supplier)?'efg':'gc',customer=credentials.customer,username=credentials.username;secret=credentials.password;
   const cartName=!/neugart/i.test(supplier)||body.cart_name===undefined?'':typeof body.cart_name==='string'?body.cart_name.trim():null;
   if(cartName===null||cartName.length>60||/[\u0000-\u001f\u007f]/.test(cartName))throw fail('CART_NAME','Bitte einen Warenkorbnamen mit höchstens 60 Zeichen eingeben.');
   const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([company,supplier,shop,customer.replace(/^0+/,''),username.toUpperCase(),lines,...(cartName?[cartName]:[]),...(delegated?[body.account_id]:[])]))))).map(n=>n.toString(16).padStart(2,'0')).join('');
   const session=await merchant.connect({shop,customer,username,password:secret});
   body.password='';credentials.password='';if(saved?.credentials)saved.credentials.password='';
   const db=async(method,query,data)=>{const r=await fetch(env.url+'/rest/v1/supplier_cart_transfers_v949'+query,{method,headers:{apikey:env.serviceKey,Authorization:'Bearer '+env.serviceKey,'Content-Type':'application/json',Prefer:method==='POST'?'resolution=ignore-duplicates,return=representation':'return=representation'},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw fail('RECEIPT','Die Übertragung konnte nicht sicher protokolliert werden. Bitte nicht erneut senden.',502);return r.json();};
   const inserted=await db('POST','?on_conflict=id',{id,user_id:user.id,company_id:company,fingerprint,state:'started'}),where='?id=eq.'+id+'&user_id=eq.'+user.id+'&company_id=eq.'+company;
   let job=inserted[0];if(!job){const previous=await db('GET',where);job=previous[0];if(!job||job.fingerprint!==fingerprint)throw fail('CONFLICT','Dieser Übertragungsversuch gehört zu einer anderen Auswahl.',409);if(!job.cart_ref)throw fail('PENDING','Die erste Übertragung ist noch nicht eindeutig abgeschlossen. Es werden keine Artikel erneut gesendet.',409);}
   let ref=job.cart_ref;const validRef=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{10,200}$/.test(x);
   if(!ref){const q=new URLSearchParams({customerOrderText:cartName||'Arbeitszeit-App '+id.slice(0,8),customerOrderNumber:'',customerBaseCommission:'',abex247:'false'}),created=await merchant.call(session,'/api/carts/createCart?'+q,{});ref=created?.resultId;if(!validRef(ref))throw fail('CREATE','Der Händler hat keinen eindeutigen Warenkorb zurückgegeben.',502);await db('PATCH',where,{cart_ref:ref,state:'created',updated_at:new Date(now()).toISOString()});
    const payload=lines.map(l=>({productKeyWithProductnumber:{productnumber:l.sku,id:0,intRunNumber:0,runNumber:'',variant:'',supplier:'',supplierSap:'',materialNumber:''},notetext1:'',notetext2:'',quantity:l.cents/100,addMode:3,idsValues:null,referenceProcess:null,referenceConfigurationsId:null,bidDocumentPositionNo:null,customerPositionNo:null,positionCreateType:19}));
    try{await merchant.call(session,'/api/carts/cart/positions/list?secCartNumber='+encodeURIComponent(ref)+'&returnPositonDetails=false&strPostionsType=ON',payload,45000);await db('PATCH',where,{state:'sent',updated_at:new Date(now()).toISOString()});}catch{/* Always read the cart after a lost/partial answer; never blindly submit twice. */}
   }
   if(!validRef(ref))throw fail('CART','Der gespeicherte Warenkorb ist ungültig.',502);
   let items=null;try{items=checkCart(await merchant.call(session,'/api/carts/cart/positions/0?secCartNumber='+encodeURIComponent(ref)),lines);}catch{}
   const confirmed=!!items&&items.every(x=>x.confirmed),receipt={company,supplier,request_id:id,confirmed,cart_url:shops[shop]+'/p/cart/'+ref+'/positions',items:items||[],checked_at:new Date(now()).toISOString(),message:confirmed?'Alle Artikel und Mengen wurden im Händlerwarenkorb bestätigt.':'Der Händlerwarenkorb wurde nicht vollständig bestätigt. Es wird nichts erneut gesendet.'};
   await db('PATCH',where,{state:confirmed?'confirmed':'uncertain',receipt,updated_at:new Date(now()).toISOString()});
   // Normal shop sign-in handoff, transient only: never saved with the receipt.
   let browserHandoff=null;
   try{if(shop==='efg')browserHandoff=await merchant.browserLogin({username,password:secret});}catch{/* Preserve the verified cart even if browser sign-in is temporarily unavailable. */}
   secret='';
   let token=browserHandoff?.token||'';if(!token)try{const answer=await merchant.call(session,'/api/user/getauthkeylocalapp');token=loginToken(answer);}catch{}if(!token)token=session.loginTransfer;
   return json({...receipt,...(typeof token==='string'&&token.length>8&&token.length<20000?{handoff:{action:receipt.cart_url+'?login=true',token}}:{})});
  }catch(e){return json({code:e.code||'UNAVAILABLE',message:e.code?e.message:'Die Übertragung konnte nicht bestätigt werden. Bitte den Händlerwarenkorb prüfen; es wird nichts automatisch erneut gesendet.'},e.status||502);}finally{secret='';}
 };
}
