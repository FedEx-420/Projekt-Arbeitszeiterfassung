/* ONLINE PLUS account protocol, based on the verified v948 stock adapter. */
import {createOnlineMerchant,normalizeArticle} from '../supplier-stock-v948/online.mjs';
const shops={efg:{origin:'https://efgonlineplus.de',layout:'EFG',domain:'efgonlineplus.de'},gc:{origin:'https://www.gconlineplus.de',layout:'GC',domain:'gconlineplus.de'}};
const fail=(code,message,status=400)=>Object.assign(new Error(message),{code,status});
const settingsPath='/api/account/getsettingsremaining';
const cookiePresent=session=>Object.keys(session.cookies||{}).length>0;
const upstreamMessages={
 login:'Neugart beantwortet die Anmeldung derzeit nicht. Du kannst den Shop direkt öffnen.',
 cart:'Neugart beantwortet die Warenkorbanfrage derzeit nicht. Bitte prüfe den Händlerwarenkorb.',
 stock:'Der Händler antwortet gerade nicht auf die Bestandsabfrage.'
};
function clean(value,max=1000){return typeof value==='string'?value.replace(/<[^>]*>/g,'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max).trim():'';}
export function normalizeStock(raw,sku,warehouse,checkedAt){
 const unknown={sku,status:'unknown',quantity:null,text:'Der Händler hat für diesen Artikel keinen eindeutigen Bestand geliefert.',warehouse,checked_at:checkedAt};
 if(!raw||raw.successful!==true||!Array.isArray(raw.obj?.stockArray)||raw.obj.stockArray.length!==1)return unknown;
 const row=raw.obj.stockArray[0],text=clean(row.stockText||row.stockTextShort),quantity=typeof row.stockQuantity==='number'&&Number.isFinite(row.stockQuantity)&&row.stockQuantity>=0?row.stockQuantity:null;
 if(!text||row.followerSymbol||/nicht gefunden|unbekannt|keine angaben/i.test(text))return {...unknown,text:text||unknown.text};
 return {sku,status:quantity>0&&/verfügbar|vorrätig|auf lager/i.test(text)&&!/nicht verfügbar|nicht vorrätig/i.test(text)?'in_stock':quantity===0?'not_in_stock':'unknown',quantity,text,warehouse,checked_at:checkedAt};
}
export function loginToken(value){
 if(value&&typeof value==='object'&&value.successful===false)return '';
 const candidates=[value,value?.authKey,value?.authenticationToken,value?.obj,value?.obj?.authKey,value?.obj?.authenticationToken];
 return candidates.find(token=>typeof token==='string'&&token.length>8&&token.length<20000&&!/[\u0000-\u001f\u007f]/.test(token))||'';
}
export function createMerchant({fetch,md5,now=Date.now,report=()=>{}}){
 async function call(session,path,data,timeoutMs=15000){
  const shop=shops[session.shop],url=new URL(shop.origin+path);url.searchParams.set('layout',shop.layout);
  const settings=url.pathname===settingsPath,cart=url.pathname.startsWith('/api/carts/');
  const endpoint=settings?(session.userHash?'session-refresh':cookiePresent(session)?'session-verify':'session-start'):url.pathname==='/api/account/login'?'login':url.pathname==='/api/user/getauthkeylocalapp'?'handoff':cart?'cart':'product';
  const purpose=cart?'cart':settings||endpoint==='login'||endpoint==='handoff'?'login':'stock';
  const unavailable=()=>fail('SHOP_UNAVAILABLE',upstreamMessages[purpose],502);
  const cookie=Object.entries(session.cookies||{}).map(([k,v])=>k+'='+v).join('; ');
  const request=()=>{
   const rand=String(crypto.getRandomValues(new Uint32Array(1))[0]%10000000);
   url.searchParams.set('rand',rand);url.searchParams.set('crsfKey',md5(String(session.csrf??'null')+rand));if(session.userHash)url.searchParams.set('u',session.userHash);
   return fetch(url.href,{method:data===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{'Content-Type':'application/json; charset=UTF-8','Accept':'application/json','Accept-Language':'de-DE','Referer':shop.origin+'/',...(cookie?{Cookie:cookie}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});
  };
  let r;
  for(let attempt=0;attempt<(settings?2:1);attempt++){
   try{r=await request();}catch{r=null;}
   if(r?.ok)break;
   report({shop:session.shop,endpoint,status:r?.status??0});
   if(!settings||attempt||r&&![500,502,503,504].includes(r.status))throw unavailable();
   try{await r?.body?.cancel();}catch{/* Continue with the single read retry. */}
  }
  const set=r.headers.getSetCookie?.()||[];for(const line of set){const part=line.split(';')[0],index=part.indexOf('=');if(index<1)continue;const name=part.slice(0,index),value=part.slice(index+1);if(!/^[A-Za-z0-9_.-]{1,100}$/.test(name)||/[\r\n;]/.test(value)||value.length>12000)continue;if(/(?:^|;)\s*max-age=0(?:;|$)/i.test(line))delete session.cookies[name];else session.cookies[name]=value;}
  const text=await r.text();if(text.length>2000000)throw fail('SHOP_RESPONSE','Die Händlerantwort ist zu groß.',502);try{return JSON.parse(text);}catch{report({shop:session.shop,endpoint,status:r.status,response:'invalid-json'});throw fail('SHOP_RESPONSE',upstreamMessages[purpose],502);}
 }
 async function browserLogin({username,password}){
  const session={shop:'gc',cookies:{},csrf:null,userHash:''};
  const settings=await call(session,'/api/account/getsettingsremaining?domain=gconlineplus.de');
  session.csrf=settings.crsfKey??null;
  const result=await call(session,'/api/account/login',{username,password,layout:'GC',language:'DE'});
  let destination;try{destination=new URL(result.redirect.startsWith('https://')?result.redirect:'https://'+result.redirect);}catch{}
  // ONLINE PLUS marks a cross-layout redirect as unsuccessful, status REDIRECT (11).
  // Its authenticationToken is nevertheless the official one-use browser handoff.
  const token=loginToken(result.authenticationToken);
  if(result.status===11&&result.layout==='EFG'&&token&&destination?.origin==='https://efgonlineplus.de'&&!destination.username&&!destination.password&&destination.pathname==='/'&&!destination.search&&!destination.hash)return {token,origin:destination.origin};
  return null;
 }
 async function connect({shop,username,password,customer,requireWarehouse=true}){
  if(!shops[shop])throw fail('SHOP','Bitte GC oder EFG ONLINE PLUS auswählen.');
  const s={shop,cookies:{},csrf:null,userHash:'',expires:now()+12*3600000};
  const initial=await call(s,'/api/account/getsettingsremaining?domain='+encodeURIComponent(shops[shop].domain));s.csrf=initial.crsfKey??null;
  const login=await call(s,'/api/account/login',{username,password,layout:shops[shop].layout,language:'DE'});
  if(login.successful!==true)throw fail('LOGIN','Die Anmeldung beim Fachhändler wurde nicht bestätigt. Bitte Zugangsdaten und Onlinezugang prüfen.',401);
  if(login.mandatoryActions?.length)throw fail('SHOP_ACTION','Bitte zuerst die vom Händler angezeigten Schritte direkt im Shop abschließen.',409);
  s.csrf=login.crsfKey??s.csrf;s.loginTransfer=loginToken(login);
  const settings=await call(s,'/api/account/getsettingsremaining?domain='+encodeURIComponent(shops[shop].domain)),u=settings.user;
  if(!u||String(u.customerNumber||'').replace(/^0+/,'')!==customer.replace(/^0+/,''))throw fail('CUSTOMER','Die Kundennummer stimmt nicht mit dem angemeldeten Händlerkonto überein.',403);
  s.csrf=settings.crsfKey??s.csrf;s.userHash=md5(['companyNumber','username','customerNumber'].map(k=>String(u[k]||'').trim().toUpperCase()).join('_'));
  s.warehouses=(Array.isArray(settings.warehouses)?settings.warehouses:[]).filter(w=>typeof w.mfv==='string'&&typeof w.warehouseNumber==='string'&&typeof w.name==='string').slice(0,300).map(w=>({id:w.mfv.trim()+w.warehouseNumber.trim(),stockId:u.customer?.company?.isSap?w.mfv.trim()+w.warehouseNumber.trim():w.warehouseNumber.trim(),name:clean(w.name,200)}));
  if(requireWarehouse&&!s.warehouses.length)throw fail('WAREHOUSE','Der Händler hat kein Lager zur Auswahl geliefert.',502);
  return s;
 }
 async function refresh(session,needsToken=false){
  const settings=await call(session,'/api/account/getsettingsremaining?domain='+encodeURIComponent(shops[session.shop].domain)),user=settings.user;
  if(!user||md5(['companyNumber','username','customerNumber'].map(k=>String(user[k]||'').trim().toUpperCase()).join('_'))!==session.userHash)throw fail('RECONNECT','Bitte den Neugart-Zugang erneut verbinden.',401);
  session.csrf=settings.crsfKey??session.csrf;
  if(typeof settings.jsonWebToken==='string'&&settings.jsonWebToken.length<=20000)session.apiToken=settings.jsonWebToken;
  if(needsToken&&!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(session.apiToken||''))throw fail('RECONNECT','Die Neugart-Artikelsuche ist noch nicht freigeschaltet.',401);
 }
 const online=createOnlineMerchant({call,refresh,fetch,now});
 async function prices(session,skus){
  const warehouse=session.warehouses[0];if(!warehouse||!skus.length)return new Map();
  const result=await call(session,'/api/products/getnetpricesandstocksbykbnlist',{kbns:skus,stockId:warehouse.stockId});
  const rows=result?.successful===true&&Array.isArray(result.obj?.priceArray)?result.obj.priceArray:[],found=new Map(),seen=new Set();
  for(const row of rows){
   const sku=row.productKey?.productnumber??row.productNumber??row.kbn??(skus.length===1&&rows.length===1?skus[0]:'');
   if(!skus.includes(sku))continue;
   if(seen.has(sku)){found.delete(sku);continue;}seen.add(sku);
   try{const data=normalizeArticle({successful:true,obj:{productKey:{productnumber:sku}}},{successful:true,obj:{priceArray:[row]}},sku);
    found.set(sku,{unit:data.unit,purchase_price:data.purchase_price,recommended_price_1:data.recommended_price_1,unit_price:data.recommended_price_1});
   }catch{/* Missing currency, price unit or identity is never interpreted as a zero price. */}
  }
  return found;
 }
 async function handoffToken(session,credentials){
  if(session.shop==='efg'){
   try{
    const handoff=await browserLogin(credentials);
    if(handoff?.token)return handoff.token;
   }catch{/* The validated shop session can still issue a handoff. */}
  }
  try{
   const token=loginToken(await call(session,'/api/user/getauthkeylocalapp'));
   if(token)return token;
  }catch{/* Use the token from the validated login if present. */}
  return session.loginTransfer||'';
 }
 return {connect,call,online,browserLogin,handoffToken,prices};
}
