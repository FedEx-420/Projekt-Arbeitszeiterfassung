import {createMerchant} from './merchant.mjs';
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
   const profiles=await read('/rest/v1/profiles?select=id,role&id=eq.'+user.id),profile=profiles.find(p=>p.id===user.id);if(!profile||!['administrator','business'].includes(profile.role))throw fail('FORBIDDEN','Nur Geschäftsleitung und Verwaltung können Einkaufswarenkörbe übertragen.',403);
   const raw=await req.text();if(raw.length>180000)throw fail('SIZE','Der Einkaufswarenkorb ist zu groß.');let body;try{body=JSON.parse(raw);}catch{throw fail('JSON','Ungültige Anfrage.');}
   const {company,request_id:id}=body,supplier=String(body.supplier||'').trim();if(!uuid.test(company||'')||!uuid.test(id||'')||supplier.length>120||!/neugart|\bgc\b|efg/i.test(supplier))throw fail('SUPPLIER','Für diesen Fachhändler ist noch keine automatische Warenkorbanbindung vorhanden.');
   if(profile.role==='business'&&company!==user.id)throw fail('FORBIDDEN','Der Einkauf gehört nicht zu diesem Konto.',403);
   const companies=await read('/rest/v1/profiles?select=id,role&id=eq.'+company+'&role=eq.business');if(!companies.some(p=>p.id===company))throw fail('FORBIDDEN','Die Firma ist nicht verfügbar.',403);
   if(!Array.isArray(body.lines)||!body.lines.length||body.lines.length>1000)throw fail('LINES','Bitte 1 bis 1000 Artikel auswählen.');
   const ids=body.lines.map(l=>l.material_id);if(ids.some(x=>!uuid.test(x))||new Set(ids).size!==ids.length)throw fail('LINES','Die Artikelauswahl ist ungültig.');
   const params=new URLSearchParams({select:'id,catalog_article_number,catalog_supplier,business_id,unit',business_id:'eq.'+company,active:'eq.true',catalog_supplier:'eq.'+supplier,id:'in.('+ids.join(',')+')'}),materials=[];for(let offset=0;offset<ids.length;offset+=100){params.set('id','in.('+ids.slice(offset,offset+100).join(',')+')');materials.push(...await read('/rest/v1/materials?'+params));}
   if(materials.length!==ids.length||materials.some(m=>m.business_id!==company||m.catalog_supplier!==supplier))throw fail('LINES','Ein Artikel gehört nicht zum ausgewählten Fachhändler oder zur Firma.',403);
   const grouped=new Map();for(const l of body.lines){const m=materials.find(m=>m.id===l.material_id),sku=String(m.catalog_article_number||'').trim(),qu=units[String(m.unit||'').toLowerCase().trim()];if(!sku||sku.length>120||/[\u0000-\u001f]/.test(sku)||!qu)throw fail('ARTICLE','Artikelnummer oder Bestelleinheit ist unvollständig.');const cents=quantity(l.quantity),existing=grouped.get(sku);if(existing&&existing.qu!==qu)throw fail('UNIT','Eine Artikelnummer enthält widersprüchliche Bestelleinheiten.');if(existing){existing.cents+=cents;existing.material_ids.push(m.id);}else grouped.set(sku,{sku,qu,cents,material_ids:[m.id]});}
   const lines=[...grouped.values()].sort((a,b)=>a.sku.localeCompare(b.sku));
   for(const [key,max]of [['customer',40],['username',50],['password',50]])if(typeof body[key]!=='string'||!body[key].length||body[key].length>max)throw fail('LOGIN','Bitte Kundennummer, Benutzername und Kennwort eingeben.');
   const shop=/neugart|efg/i.test(supplier)?'efg':'gc',customer=body.customer.trim(),username=body.username.trim();secret=body.password;
   const cartName=!/neugart/i.test(supplier)||body.cart_name===undefined?'':typeof body.cart_name==='string'?body.cart_name.trim():null;
   if(cartName===null||cartName.length>60||/[\u0000-\u001f\u007f]/.test(cartName))throw fail('CART_NAME','Bitte einen Warenkorbnamen mit höchstens 60 Zeichen eingeben.');
   const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([company,supplier,shop,customer.replace(/^0+/,''),username.toUpperCase(),lines,...(cartName?[cartName]:[])]))))).map(n=>n.toString(16).padStart(2,'0')).join('');
   const session=await merchant.connect({shop,customer,username,password:secret});secret='';body.password='';
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
   let token=session.loginTransfer;try{if(!token){const answer=await merchant.call(session,'/api/user/getauthkeylocalapp');token=answer?.authKey;}}catch{}
   return json({...receipt,...(typeof token==='string'&&token.length>8&&token.length<20000?{handoff:{action:receipt.cart_url+'?login=true',token}}:{})});
  }catch(e){return json({code:e.code||'UNAVAILABLE',message:e.code?e.message:'Die Übertragung konnte nicht bestätigt werden. Bitte den Händlerwarenkorb prüfen; es wird nichts automatisch erneut gesendet.'},e.status||502);}finally{secret='';}
 };
}
