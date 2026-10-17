/* Authenticated generation of the app's own CSV. Never contacts DATEV. */
export function makeDatevExportHandler({authenticate,readBatch,readArtifact,generate,saveArtifact,allowedOrigins}){
 const allowed=new Set(allowedOrigins);
 const response=(status,body,origin)=>new Response(status===204?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(allowed.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'}:{})}});
 return async request=>{
  const origin=request.headers.get('origin')||'';
  if(origin&&!allowed.has(origin))return response(403,{error:'Nicht freigegebene Herkunft.'},origin);
  if(request.method==='OPTIONS')return response(204,null,origin);
  if(request.method!=='POST')return response(405,{error:'POST erforderlich.'},origin);
  if(!/^Bearer \S+$/i.test(request.headers.get('authorization')||''))return response(401,{error:'Bitte erneut anmelden.'},origin);
  if(Number(request.headers.get('content-length')||0)>1000)return response(413,{error:'Anfrage zu groß.'},origin);
  let actor;try{actor=await authenticate(request.headers.get('authorization'));}catch{return response(401,{error:'Anmeldung konnte nicht bestätigt werden.'},origin);}
  if(!actor?.id)return response(401,{error:'Bitte erneut anmelden.'},origin);
  let payload;try{const raw=await request.text();if(raw.length>1000)return response(413,{error:'Anfrage zu groß.'},origin);payload=JSON.parse(raw);}catch{return response(400,{error:'Ungültige Anfrage.'},origin);}
  if(!payload||Object.keys(payload).length!==1||!/^([a-f0-9]{8}-){1}[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(payload.exportId||''))return response(400,{error:'Gültige Export-ID erforderlich.'},origin);
  try{
   const batch=await readBatch(request.headers.get('authorization'),payload.exportId);
   if(!batch?.id)return response(404,{error:'Export nicht verfügbar oder keine Berechtigung.'},origin);
   const existing=await readArtifact(request.headers.get('authorization'),batch.id);
   if(existing)return response(200,{export_id:batch.id,sha256:existing.sha256,byte_count:existing.byte_count,already_saved:true,online_transmitted:false},origin);
   const output=generate({...batch,period:batch.period.slice(0,7)});
   const saved=await saveArtifact(batch.id,actor.id,output.bytes,output.filename);
   return response(200,{...saved,online_transmitted:false},origin);
  }catch(error){if(error?.field)return response(422,{error:'Datei konnte nicht erzeugt werden: '+error.message},origin);return response(503,{error:'Dateierzeugung nicht bestätigt. Der gespeicherte Exportstand bleibt erhalten. Bitte erneut versuchen.'},origin);}
 };
}
