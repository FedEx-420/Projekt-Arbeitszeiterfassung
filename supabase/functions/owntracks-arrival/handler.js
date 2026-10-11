// OwnTracks HTTPS Basic capability. Never log credentials, coordinates or body.
export function makeOwntracksHandler({rpc,hash}) {
 return async request=>{
  const origin='https://fedex-420.github.io';
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type,authorization','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Expose-Headers':'X-Worktime-Status','Vary':'Origin'};
  const reply=(status=200,result='ignored')=>new Response('[]',{status,headers:{...headers,'X-Worktime-Status':result}});
  if(request.method==='OPTIONS')return reply();
  if(request.method!=='POST')return reply(405);
  if(request.headers.get('origin')&&request.headers.get('origin')!==origin)return reply(403);
  let secret='';
  try {const match=/^Basic ([A-Za-z0-9+/=]{1,160})$/.exec(request.headers.get('authorization')||'');if(match){const auth=atob(match[1]);const m=/^worktime:([a-f0-9]{64})$/.exec(auth);if(m)secret=m[1];}}catch{}
  if(!secret)return reply(401,'unauthorized');
  try {
   if(Number(request.headers.get('content-length')||0)>8192)return reply(413);
   const raw=await request.text();if(raw.length>8192)return reply(413);
   let body;try{body=raw?JSON.parse(raw):{};}catch{return reply(400);}
   if(!body||Array.isArray(body)||typeof body!=='object')return reply(400);
   const digest=await hash(secret);
   if(body._type!=='location'){
    const result=await rpc('receive_owntracks_v871',{p_secret_hash:digest,p_fix:null});return reply(200,result.status);
   }
   const {lat,lon,acc,tst}=body;
   if(![lat,lon,acc,tst].every(v=>typeof v==='number'&&Number.isFinite(v))||Math.abs(lat)>90||Math.abs(lon)>180||acc<0||acc>100||tst<0||tst>4102444800){await rpc('receive_owntracks_v871',{p_secret_hash:digest,p_fix:null});return reply(200,'invalid_fix');}
   const result=await rpc('receive_owntracks_v871',{p_secret_hash:digest,p_fix:{lat,lon,acc,tst}});
   return reply(200,result.status);
  }catch(error){return reply(error?.code==='28000'?401:error?.code==='42501'?403:503,'unavailable');}
 };
}
