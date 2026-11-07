/* Regular FiF session/cart protocol. Fixed destination; no order or checkout routes. */
export const origin='https://www.onlinesystem.de';
const fail=(code,message,status=502)=>Object.assign(Error(message),{code,status});
const decode=s=>s.replace(/&(?:amp|quot|apos|lt|gt);/g,x=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}[x]));
function attrs(tag){return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(m=>[m[1].toLowerCase(),decode(m[3])]));}
function csrf(html){for(const tag of html.match(/<input\b[^>]*>/gi)||[]){const a=attrs(tag);if(a.name==='__RequestVerificationToken'&&a.value&&a.value.length<12000)return a.value;}throw fail('FIF_FORM','Das sichere FiF-Anmeldeformular konnte nicht gelesen werden.');}
const allowed=path=>path==='/'||/^\/(?:Login|Manage|Warenkorb(?:\/(?:Create|Add|\d+))?|Cart\/Scan2FiFRead|Product\/[^/?#]+\/1|Error(?:\/Forbidden)?)$/.test(path);
export const cartId=data=>String(data?.activeCart?.cartId??data?.activeCart?.id??'');
const validId=id=>/^[1-9]\d{0,14}$/.test(String(id));
export function collectProducts(value,skus){
 const found=new Map();let count=0;
 function visit(x,depth){
  if(typeof x==='string'&&x.includes('data-product-id')){for(const tag of x.match(/<(?:article|div)\b[^>]*\bdata-product-id\s*=[^>]*>/gi)||[]){const a=attrs(tag),sku=a['data-product-number'],id=a['data-product-id'];if(skus.has(sku)&&/^[A-Za-z0-9._-]{1,100}$/.test(id||'')){const prior=found.get(sku);if(prior&&prior.id!==id)throw fail('FIF_ARTICLE','FiF liefert widersprüchliche Artikelkennungen.');found.set(sku,{id,sku});}}return;}
  if(!x||typeof x!=='object'||depth>24||++count>100000)return;
  if(!Array.isArray(x)){
   const sku=typeof x.productNumber==='string'?x.productNumber:typeof x.articleNumber==='string'?x.articleNumber:'';
   const id=x.productId??x.id;
   if(skus.has(sku)&&id!=null&&/^[A-Za-z0-9._-]{1,100}$/.test(String(id))){const prior=found.get(sku);if(prior&&prior.id!==String(id))throw fail('FIF_ARTICLE','FiF liefert widersprüchliche Artikelkennungen.');found.set(sku,{id:String(id),sku});}
  }
  for(const child of Object.values(x))visit(child,depth+1);
 }visit(value,0);return found;
}
export function createFifMerchant({fetch=globalThis.fetch,now=Date.now,report=()=>{}}={}){
 async function request(s,path,{data,json=false}={}){
  let url=new URL(path,origin);if(url.origin!==origin||url.username||url.password||!allowed(url.pathname))throw fail('FIF_ROUTE','Ungültiger FiF-Aufruf.');
  for(let hop=0;hop<6;hop++){
   const headers={Accept:json?'application/json':'text/html','Accept-Language':'de-DE',...(Object.keys(s.cookies).length?{Cookie:Object.entries(s.cookies).map(([k,v])=>k+'='+v).join('; ')}:{})};
   let body;if(data!==undefined){body=new URLSearchParams(data);if(s.csrf){body.set('__RequestVerificationToken',s.csrf);headers.RequestVerificationToken=s.csrf;}headers['Content-Type']='application/x-www-form-urlencoded; charset=UTF-8';headers['X-Requested-With']='XMLHttpRequest';}
   const response=await fetch(url.href,{method:data===undefined?'GET':'POST',headers,body,redirect:'manual',signal:AbortSignal.timeout(25000)});
   for(const cookie of response.headers.getSetCookie?.()||[]){const part=cookie.split(';')[0],i=part.indexOf('=');if(i<1)continue;const name=part.slice(0,i),value=part.slice(i+1);if(!/^[A-Za-z0-9_.-]{1,100}$/.test(name)||/[\r\n;]/.test(value)||value.length>20000)continue;if(/max-age=0\b/i.test(cookie))delete s.cookies[name];else s.cookies[name]=value;}
   if([301,302,303,307,308].includes(response.status)){
    const next=new URL(response.headers.get('location')||'',url);if(next.origin!==origin||next.username||next.password||!allowed(next.pathname))throw fail('FIF_REDIRECT','FiF verlangt einen zusätzlichen Schritt im Händlerportal.');
    if(data!==undefined&&[307,308].includes(response.status))throw fail('FIF_REDIRECT','FiF hat die Anmeldung nicht eindeutig angenommen.');
    url=next;data=undefined;continue;
   }
   report({stage:path.split('?')[0].replace(/^\/Product\/[^/]+\/1$/,'/Product/:sku/1').replace(/\/\d+/g,'/:id'),status:response.status});
   if(!response.ok)throw fail('FIF_HTTP','FiF hat die Anfrage nicht angenommen (HTTP '+response.status+').',response.status===401?401:502);
   const text=await response.text();if(text.length>3000000)throw fail('FIF_SIZE','Die FiF-Antwort ist zu groß.');
   if(!json)return text;
   try{return JSON.parse(text);}catch{throw fail('FIF_RESPONSE','FiF hat keine bestätigte Warenkorbantwort geliefert.');}
  }throw fail('FIF_REDIRECT','FiF hat die Anfrage mehrfach weitergeleitet.');
 }
 async function connect({username,password}){
  if(typeof username!=='string'||!username.trim()||username.length>100||/[\u0000-\u001f\u007f]/.test(username)||typeof password!=='string'||!password||password.length>512||/[\u0000-\u001f\u007f]/.test(password))throw fail('FIF_LOGIN','Bitte FiF-Benutzername und FiF-Kennwort eingeben.',400);
  const s={cookies:{},csrf:'',username:username.trim(),expires:now()+15*60000};
  s.csrf=csrf(await request(s,'/Login'));
  await request(s,'/Login',{data:{Username:s.username,Password:password,RememberMe:'false',ReturnUrl:'/Warenkorb'}});
  const html=await request(s,'/Manage');
  if(!/<form\b[^>]*action=["']\/Logout(?:[?"'])/i.test(html))throw fail('FIF_LOGIN','Die FiF-Anmeldung wurde nicht bestätigt. Bitte den normalen Geschäftszugang prüfen.',401);
  s.csrf=csrf(html);return s;
 }
 async function products(s,lines){
  const found=new Map();
  for(let offset=0;offset<lines.length;offset+=20){const group=lines.slice(offset,offset+20),want=new Set(group.map(l=>l.sku));
   const data=await request(s,'/Cart/Scan2FiFRead',{data:{scanInput:group.map(l=>l.sku).join('\r\n'),scanType:'1'},json:true});
   const result=collectProducts(data,want);for(const [sku,p]of result)found.set(sku,p);
   report({stage:'article_schema',keys:Object.keys(data||{}).slice(0,20),matched:result.size,expected:group.length});
   for(const row of group){if(found.has(row.sku))continue;
    const html=await request(s,'/Product/'+encodeURIComponent(row.sku)+'/1');
    for(const tag of html.match(/<(?:article|div)\b[^>]*\bdata-product-id\s*=[^>]*>/gi)||[]){const a=attrs(tag);if(a['data-product-number']===row.sku&&/^[A-Za-z0-9._-]{1,100}$/.test(a['data-product-id']||'')){const prior=found.get(row.sku);if(prior&&prior.id!==a['data-product-id'])throw fail('FIF_ARTICLE','Der FiF-Artikel ist nicht eindeutig.');found.set(row.sku,{id:a['data-product-id'],sku:row.sku});}}
    if(!found.has(row.sku))throw fail('FIF_ARTICLE','FiF hat die Artikelnummer '+row.sku+' nicht eindeutig bestätigt.');
   }
  }return lines.map(l=>({...l,productId:found.get(l.sku).id}));
 }
 async function create(s){const data=await request(s,'/Warenkorb/Create',{data:{},json:true}),id=cartId(data);report({stage:'create_schema',keys:Object.keys(data?.activeCart||{}).slice(0,60)});if(!validId(id)||!Array.isArray(data?.activeCart?.products)||data.activeCart.products.length)throw fail('FIF_CREATE','FiF hat keinen eindeutig leeren neuen Warenkorb bestätigt.');return id;}
 async function add(s,id,lines){if(!validId(id))throw fail('FIF_CART','Ungültiger FiF-Warenkorb.');for(let offset=0;offset<lines.length;offset+=100){const body={cartId:String(id)};lines.slice(offset,offset+100).forEach((l,i)=>{body['insertProducts['+i+'][productId]']=l.productId;body['insertProducts['+i+'][quantity]']=(l.cents/100).toFixed(2).replace('.',',');body['insertProducts['+i+'][offerId]']='';body['insertProducts['+i+'][offerPosition]']='';body['insertProducts['+i+'][isSpecialItem]']='false';});await request(s,'/Warenkorb/Add',{data:body,json:true});}}
 async function read(s,id){if(!validId(id))throw fail('FIF_CART','Ungültiger FiF-Warenkorb.');const data=await request(s,'/Warenkorb/'+id,{data:{},json:true});report({stage:'cart_schema',keys:Object.keys(data?.activeCart||{}).slice(0,60),product_keys:Object.keys(data?.activeCart?.products?.[0]||{}).filter(k=>/unit|quantity|number|^id$|productid/i.test(k)).slice(0,80)});if(cartId(data)!==String(id))throw fail('FIF_CART','Die FiF-Antwort gehört zu einem anderen Warenkorb.');return data.activeCart.products;}
 return {connect,products,create,add,read};
}
