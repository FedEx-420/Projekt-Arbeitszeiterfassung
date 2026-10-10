// Framework-free handler is tested with mocked provider and auth; never logs URLs or tokens.
const ORIGIN='https://fedex-420.github.io';
export function normalizeCandidates(body) {
 return (Array.isArray(body?.results)?body.results:[]).filter(row=>row.country_code==='de'&&Number.isFinite(row.lat)&&Number.isFinite(row.lon)&&Math.abs(row.lat)<=90&&Math.abs(row.lon)<=180).slice(0,5).map(row=>({
  latitude:row.lat,longitude:row.lon,formatted:String(row.formatted||[row.street,row.housenumber,row.postcode,row.city].filter(Boolean).join(' ')).slice(0,400),
  precision:String(row.result_type||'unknown').slice(0,30),confidence:Number.isFinite(row.rank?.confidence)?Math.max(0,Math.min(1,row.rank.confidence)):0,
 }));
}
export function makeGeocodingHandler(deps) {
 return async request=>{
  const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(request.method==='OPTIONS')return reply({});
  if(request.method!=='POST')return reply({error:'Methode nicht erlaubt.'},405);
  if(request.headers.get('origin')&&request.headers.get('origin')!==ORIGIN)return reply({error:'Nicht erlaubt.'},403);
  try{
   const token=(request.headers.get('authorization')||'').match(/^Bearer ([^\s]+)$/i)?.[1];
   const actor=token?await deps.authenticate(token):null;
   if(!actor)return reply({error:'Bitte erneut anmelden.'},401);
   if(Number(request.headers.get('content-length')||0)>2048)return reply({error:'Ungültige Anfrage.'},400);
   const raw=await request.text();if(raw.length>2048)return reply({error:'Ungültige Anfrage.'},400);
   const body=JSON.parse(raw),customer=body?.customer_id;
   if(typeof customer!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(customer))return reply({error:'Bitte einen Kunden wählen.'},400);
   const key=deps.key();if(!key)return reply({error:'Adresserkennung ist noch nicht eingerichtet.'},503);
   const claimed=await deps.rpc('claim_customer_geocoding_v869',{p_actor:actor,p_customer:customer});
   if(claimed.status!=='fetch')return reply(claimed);
   const params=new URLSearchParams({format:'json',limit:'5',lang:'de',filter:'countrycode:de',bias:'countrycode:de',apiKey:key});
   // Only database address components, never caller text, names, phones or email.
   for(const name of ['street','housenumber','city','postcode','country'])if(claimed.address?.[name])params.set(name,claimed.address[name]);
   let candidates=[],failed=false;
   try{
    const response=await deps.fetchProvider('https://api.geoapify.com/v1/geocode/search?'+params,{signal:AbortSignal.timeout(12000),redirect:'error'});
    if(!response.ok)throw Error('provider');
    candidates=normalizeCandidates(await response.json());
   }catch{failed=true;}
   const result=await deps.rpc('finish_customer_geocoding_v869',{p_actor:actor,p_customer:customer,p_lease:claimed.lease,p_candidates:candidates,p_error:failed});
   return reply(result);
  }catch(error){
   return reply({error:error?.code==='42501'?'Nur die zuständige Geschäftsleitung darf Adressen ermitteln.':error?.code==='P0001'?'Das kostenlose Abruflimit ist erreicht. Bitte später erneut versuchen.':'Die Adresse konnte gerade nicht ermittelt werden. Bitte erneut versuchen.'},error?.code==='42501'?403:error?.code==='P0001'?429:400);
  }
 };
}
