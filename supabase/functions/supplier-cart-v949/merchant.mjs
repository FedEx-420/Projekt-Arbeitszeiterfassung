/* ONLINE PLUS account protocol, based on the verified v948 stock adapter. */
const shops={efg:{origin:'https://efgonlineplus.de',layout:'EFG',domain:'efgonlineplus.de'},gc:{origin:'https://www.gconlineplus.de',layout:'GC',domain:'gconlineplus.de'}};
const fail=(code,message,status=400)=>Object.assign(new Error(message),{code,status});
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
  if(data!==undefined){const rand=String(crypto.getRandomValues(new Uint32Array(1))[0]%10000000);url.searchParams.set('rand',rand);url.searchParams.set('crsfKey',md5(String(session.csrf??'null')+rand));if(session.userHash)url.searchParams.set('u',session.userHash);}
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
  s.csrf=login.crsfKey??s.csrf;s.loginTransfer=typeof login.authenticationToken==='string'?login.authenticationToken:'';
  const settings=await call(s,'/api/account/getsettingsremaining?domain='+encodeURIComponent(shops[shop].domain)),u=settings.user;
  if(!u||String(u.customerNumber||'').replace(/^0+/,'')!==customer.replace(/^0+/,''))throw fail('CUSTOMER','Die Kundennummer stimmt nicht mit dem angemeldeten Händlerkonto überein.',403);
  s.csrf=settings.crsfKey??s.csrf;s.userHash=md5(['companyNumber','username','customerNumber'].map(k=>String(u[k]||'').trim().toUpperCase()).join('_'));
  s.warehouses=(settings.warehouses||[]).filter(w=>typeof w.mfv==='string'&&typeof w.warehouseNumber==='string'&&typeof w.name==='string').slice(0,300).map(w=>({id:w.mfv.trim()+w.warehouseNumber.trim(),stockId:u.customer?.company?.isSap?w.mfv.trim()+w.warehouseNumber.trim():w.warehouseNumber.trim(),name:clean(w.name,200)}));
  if(!s.warehouses.length)throw fail('WAREHOUSE','Der Händler hat kein Lager zur Auswahl geliefert.',502);
  return s;
 }
 return {connect,call};
}
