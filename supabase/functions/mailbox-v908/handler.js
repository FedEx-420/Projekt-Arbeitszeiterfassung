/* Authenticated internal mail. No email delivery or external financial service. */
export function makeMailboxHandler({authenticate,prepare,publish,allowedOrigins}){
 const origins=new Set(allowedOrigins),uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
 const response=(status,data,origin)=>new Response(status===204?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',Vary:'Origin',...(origins.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'}:{})}});
 return async request=>{
  const origin=request.headers.get('origin')||'';
  if(origin&&!origins.has(origin))return response(403,{error:'Nicht freigegebene Herkunft.'},origin);
  if(request.method==='OPTIONS')return response(204,null,origin);
  if(request.method!=='POST')return response(405,{error:'POST erforderlich.'},origin);
  const authorization=request.headers.get('authorization')||'';if(!/^Bearer \S+$/i.test(authorization))return response(401,{error:'Bitte erneut anmelden.'},origin);
  let actor;try{actor=await authenticate(authorization);}catch{return response(401,{error:'Anmeldung konnte nicht bestätigt werden.'},origin);}
  if(!actor?.id)return response(401,{error:'Bitte erneut anmelden.'},origin);
  let data;try{if(Number(request.headers.get('content-length')||0)>32000)return response(413,{error:'Nachricht zu groß.'},origin);const text=await request.text();if(text.length>32000)return response(413,{error:'Nachricht zu groß.'},origin);data=JSON.parse(text);}catch{return response(400,{error:'Ungültige Nachricht.'},origin);}
  if(!data||typeof data!=='object'||Array.isArray(data))return response(400,{error:'Ungültige Nachricht.'},origin);
  try{
   let message;
   if(data.action==='prepare'){
    if(!uuid(data.requestId)||!uuid(data.recipientId)||Object.keys(data).some(key=>!['action','requestId','recipientId','category','title','message','commission'].includes(key)))return response(400,{error:'Gültige Nachricht und Empfänger erforderlich.'},origin);
    message=await prepare(actor.id,data.requestId,{recipientId:data.recipientId,category:data.category,title:data.title,message:data.message,commission:data.commission||''});
   }else if(data.action==='publish'){
    if(!uuid(data.messageId)||!Array.isArray(data.attachments)||data.attachments.length>10||Object.keys(data).some(key=>!['action','messageId','attachments'].includes(key)))return response(400,{error:'Gültigen Entwurf und höchstens zehn Anhänge auswählen.'},origin);
    message=await publish(actor.id,data.messageId,data.attachments);
   }else return response(400,{error:'Unbekannte Postfach-Aktion.'},origin);
   if(!message?.id)throw Error('Nicht bestätigt');
   return response(200,{ok:true,message},origin);
  }catch(error){
   const safe=/^(Bitte |Keine |Dieser |Dieses |Konto |Absender |Nachrichten|Betreff|Datei|Ein Anhang |Ungültiger |Firmenzuordnung )/.test(error?.message||'')?String(error.message).slice(0,240):'Versand nicht bestätigt. Ein vorhandener Entwurf bleibt erhalten. Bitte erneut versuchen.';
   return response(error?.code==='42501'?403:400,{error:safe},origin);
  }
 };
}
