// Custom, narrow capability auth. No Supabase JWT/password accepted or logged here.
export function makeIphoneArrivalHandler({rpc,hash}) {
 return async request=>{
  const origin='https://fedex-420.github.io',headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type,x-worktime-arrival','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(request.method==='OPTIONS')return reply({});
  if(request.method!=='POST')return reply({error:'Nur POST ist erlaubt.'},405);
  if(request.headers.get('origin')&&request.headers.get('origin')!==origin)return reply({error:'Nicht erlaubt.'},403);
  const token=request.headers.get('x-worktime-arrival')||'';
  if(!/^[a-f0-9]{64}$/.test(token))return reply({error:'Persönliche Freigabe fehlt.'},401);
  try{
   if(Number(request.headers.get('content-length')||0)>256)return reply({error:'Ungültige Anfrage.'},400);
   const raw=await request.text();if(raw.length>256)return reply({error:'Ungültige Anfrage.'},400);
   let body;try{body=raw?JSON.parse(raw):{};}catch{return reply({error:'Ungültige Anfrage.'},400);}
   if(!body||Array.isArray(body)||Object.keys(body).some(k=>k!=='event')||!['arrival','test'].includes(body.event))return reply({error:'Bitte arrival oder test angeben.'},400);
   const result=await rpc('fire_shortcut_arrival_v870',{p_secret_hash:await hash(token),p_test:body.event==='test'});
   return reply(result);
  }catch(error){
   const code=error?.code,status=code==='28000'?401:code==='42501'?403:code==='54000'?429:code==='P0001'?409:503;
   // Never forward arbitrary DB messages, keys, customer data or stack traces.
   const messages={'28000':'Freigabe ungültig, abgelaufen oder Arbeitskonto geändert.','42501':'Keine Berechtigung.','54000':'Zu viele Anfragen. Bitte eine Minute warten.','P0001':'Timerstart derzeit nicht möglich. Bitte Planung, Abwesenheit und laufenden Timer in der App prüfen.'};
   return reply({error:messages[code]||'Verbindung momentan nicht verfügbar. Bitte später erneut versuchen.'},status);
  }
 };
}
