import webpush from 'npm:web-push@3.6.7';

const base=Deno.env.get('SUPABASE_URL')!;
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const publicKey=Deno.env.get('WORKTIME_VAPID_PUBLIC')!;
const privateKey=Deno.env.get('WORKTIME_VAPID_PRIVATE')!;
const cronSecret=Deno.env.get('WORKTIME_PUSH_CRON_SECRET')!;
const origin='https://fedex-420.github.io';
const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
type Subscription={id?:string;subscription_id?:string;appointment_id?:string;scheduled_at?:string;endpoint:string;p256dh:string;auth:string};

function canonicalPrivateKey(value:string){
  // OpenSSL/Node ECDH can export a scalar without its leading zero byte.
  // Padding restores the same P-256 key; this is not a key rotation.
  const encoded=value.replace(/-/g,'+').replace(/_/g,'/'),raw=Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'=')),char=>char.charCodeAt(0));
  if(raw.length<1||raw.length>32)throw Error('Invalid VAPID private-key length');
  const padded=new Uint8Array(32);padded.set(raw,32-raw.length);
  return btoa(String.fromCharCode(...padded)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function rest(path:string,method='GET',body?:unknown){
  const res=await fetch(base+'/rest/v1/'+path,{method,headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw Error('Database operation failed');
  return res.status===204?null:res.json();
}
function allowedEndpoint(endpoint:string){
  try{const url=new URL(endpoint);const trusted=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(url.hostname)||/^([a-z0-9-]+\.)?notify\.windows\.com$/.test(url.hostname);return url.protocol==='https:'&&trusted&&(!url.port||url.port==='443')&&!url.username&&!url.password;}catch{return false;}
}
async function currentUser(req:Request){
  const authorization=req.headers.get('Authorization');if(!authorization?.startsWith('Bearer '))return null;
  const result=await fetch(base+'/auth/v1/user',{headers:{apikey:serviceKey,Authorization:authorization},signal:AbortSignal.timeout(10000)});
  if(!result.ok)return null;
  const user=await result.json();
  // A deleted/deactivated profile cannot register or trigger test delivery,
  // even if an old access token has not yet expired.
  const profiles=await rest('profiles?select=id&id=eq.'+encodeURIComponent(user.id));
  return profiles?.length===1?user:null;
}
async function send(subscription:Subscription,test=false){
  if(!allowedEndpoint(subscription.endpoint))return {status:'invalid',code:'invalid_endpoint',providerStatus:0};
  const payload={title:'Zeiterfassung',body:test?'Push-Mitteilungen auf diesem Gerät funktionieren.':'Ein geplanter Kundentermin steht an. Bitte die Planung in der App öffnen.',tag:test?'worktime-test':'worktime-plan-'+subscription.appointment_id,data:{view:'planning'},icon:origin+'/Projekt-Arbeitszeiterfassung/icon.svg'};
  try{
    const accepted=await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},JSON.stringify(payload),{TTL:900,urgency:'normal',timeout:15000,vapidDetails:{subject:origin+'/Projekt-Arbeitszeiterfassung/',publicKey,privateKey:canonicalPrivateKey(privateKey)}});
    if(!test)await rest(`push_deliveries?appointment_id=eq.${subscription.appointment_id}&subscription_id=eq.${subscription.subscription_id}&scheduled_at=eq.${encodeURIComponent(subscription.scheduled_at!)}`,'PATCH',{sent_at:new Date().toISOString()});
    return {status:'sent',code:'accepted',providerStatus:Number(accepted.statusCode)||201};
  }catch(error){
    if([404,410].includes(Number((error as {statusCode?:number}).statusCode))){await rest('push_subscriptions?id=eq.'+(subscription.subscription_id||subscription.id),'PATCH',{enabled:false});return {status:'expired',code:'device_expired',providerStatus:Number((error as {statusCode?:number}).statusCode)};}
    const providerStatus=Number((error as {statusCode?:number}).statusCode)||0;
    const diagnostic=String((error as {message?:string}).message||'Unknown push transport error').replaceAll(privateKey,'[redacted]').replaceAll(serviceKey,'[redacted]').replaceAll(cronSecret,'[redacted]').replace(/https?:\/\/\S+/g,'[URL]').replace(/[A-Za-z0-9_-]{40,}/g,'[redacted]').slice(0,500);
    return {status:'retry',code:[400,401,403].includes(providerStatus)?'push_auth_rejected':providerStatus===429?'push_rate_limited':'push_temporarily_unavailable',providerStatus,diagnostic};
  }
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
    const action=new URL(req.url).searchParams.get('action');
    if(action==='diagnostic-test'){
      // Operator-only one-device probe; never callable with a normal user JWT.
      if(req.method!=='POST'||!cronSecret||req.headers.get('x-worktime-cron')!==cronSecret)return response({error:'Unauthorized'},401);
      let input:{subscription_id?:string}={};try{input=await req.json();}catch{}
      if(!input.subscription_id||!/^[0-9a-f-]{36}$/i.test(input.subscription_id))return response({error:'A single subscription is required'},400);
      const subscriptions=await rest('push_subscriptions?select=*&enabled=eq.true&id=eq.'+encodeURIComponent(input.subscription_id));
      if(subscriptions.length!==1)return response({sent:0,code:'device_not_registered',providerStatus:0});
      const result=await send(subscriptions[0],true);
      return response({sent:result.status==='sent'?1:0,code:result.code,providerStatus:result.providerStatus,...('diagnostic' in result?{diagnostic:result.diagnostic}:{})});
    }
    if(action==='public-key'){
      if(req.method!=='GET')return response({error:'Method not allowed'},405);
      if(!await currentUser(req))return response({error:'Bitte anmelden.'},401);
      return publicKey?response({publicKey}):response({error:'Push ist noch nicht eingerichtet.'},503);
    }
    if(action==='test'){
      if(req.method!=='POST')return response({error:'Method not allowed'},405);
      const user=await currentUser(req);if(!user)return response({error:'Bitte anmelden.'},401);
      let input:{subscription_id?:string}={};try{input=await req.json();}catch{}
      if(input.subscription_id&&!/^[0-9a-f-]{36}$/i.test(input.subscription_id))return response({error:'Ungültige Geräteauswahl.'},400);
      const subscriptions=await rest('push_subscriptions?select=*&enabled=eq.true&user_id=eq.'+encodeURIComponent(user.id)+(input.subscription_id?'&id=eq.'+encodeURIComponent(input.subscription_id):''));
      const results=await Promise.all(subscriptions.map((subscription:Subscription)=>send(subscription,true)));
      const failed=results.find(result=>result.status!=='sent');
      return response({sent:results.filter(result=>result.status==='sent').length,code:failed?.code|| (results.length?'accepted':'device_not_registered'),providerStatus:failed?.providerStatus||results[0]?.providerStatus||0});
    }
    // Cron is custom-authenticated. Never permit a publishable/anon key or a
    // normal user's JWT to invoke server-wide notification delivery.
    if(req.method!=='POST'||!cronSecret||req.headers.get('x-worktime-cron')!==cronSecret)return response({error:'Unauthorized'},401);
    if(!publicKey||!privateKey)return response({error:'Push is not configured'},503);
    const due:Subscription[]=await rest('rpc/claim_appointment_push_v863','POST',{}),counts:Record<string,number>={};
    for(let index=0;index<due.length;index+=5){const results=await Promise.all(due.slice(index,index+5).map(subscription=>send(subscription)));for(const result of results)counts[result.status]=(counts[result.status]||0)+1;}
    return response({claimed:due.length,...counts});
  }catch{return response({error:'Mitteilungen konnten gerade nicht verarbeitet werden.'},503);}
});
