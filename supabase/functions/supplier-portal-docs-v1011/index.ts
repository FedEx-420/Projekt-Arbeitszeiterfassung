import md5 from "npm:blueimp-md5@2.19.0";
import {connectEfg, fault} from "./portal.mjs";
import {connectFif} from "./fif.mjs";
import {scanSupplier} from "./scan.mjs";

const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers = {apikey:key, Authorization:'Bearer ' + key};
const respond = (data:unknown, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});

async function requestRpc(name:string, body:object) {
  const response = await fetch(url + '/rest/v1/rpc/' + name, {
    method:'POST', headers:{...headers, 'Content-Type':'application/json'},
    body:JSON.stringify(body), signal:AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw fault(response.status === 401 || response.status === 403 ? 'permission' : 'storage');
  }
  return response.json();
}

const rpc = (p_op:string, p_body:object) => requestRpc('klarwerk_supplier_job_v1011', {p_op,p_body});

async function upload(path:string, bytes:Uint8Array) {
  if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/original\.pdf$/.test(path)) throw fault('storage');
  const response = await fetch(url + '/storage/v1/object/purchase-receipts-v1007/' + path, {
    method:'POST', headers:{...headers, 'Content-Type':'application/pdf', 'x-upsert':'false'},
    body:bytes, signal:AbortSignal.timeout(20000)
  });
  if (response.ok || response.status === 409) {
    await response.body?.cancel();
    return;
  }
  // Older Storage releases report an existing object through a JSON status code.
  const data = await response.json().catch(() => ({}));
  if (response.status === 400 && (String(data.statusCode) === '409' || data.error === 'Duplicate')) return;
  throw fault('storage');
}

function resultCode(error:unknown) {
  const code = (error as {code?:string})?.code || '';
  if (['permission','document','storage'].includes(code)) return code;
  if (['LOGIN','CUSTOMER','FIF_LOGIN','FIF_FORM','SHOP_ACTION','RECONNECT'].includes(code)) return 'login';
  return 'portal';
}

type Job = {provider:'efg'|'fif', company_id:string, account_id:string, lease:string, cursor_data:object};
async function run(job:Job) {
  const scope = {provider:job.provider, account_id:job.account_id, lease:job.lease};
  let summary;
  try {
    const name = job.provider === 'efg' ? 'neugart_account_v971' : 'fif_account_v997';
    const saved = await requestRpc(name, {
      actor:job.company_id, operation:'credentials', payload:{company:job.company_id, id:job.account_id}
    });
    if (saved.company !== job.company_id || !saved.credentials) throw fault('permission');
    let portal;
    try {
      portal = job.provider === 'efg' ? await connectEfg(saved.credentials, {md5}) : await connectFif(saved.credentials);
    } finally {
      saved.credentials.password = '';
    }
    summary = await scanSupplier(job, portal, rpc, upload);
  } catch (error) {
    summary = {result:resultCode(error), added:0};
  }
  try {
    await rpc('finish', {...scope,...summary});
  } catch (error) {
    return {provider:job.provider, result:resultCode(error), added:0};
  }
  return {provider:job.provider, result:summary.result, added:summary.added, ...('issues' in summary ? {issues:summary.issues} : {})};
}

Deno.serve(async request => {
  const secret = request.headers.get('x-klarwerk-job');
  if (request.method !== 'POST' || !secret || !/^[a-f0-9]{64}$/.test(secret)) return respond({error:'Abruf abgewiesen.'}, 403);
  try {
    const jobs:Job[] = await rpc('claim', {secret});
    const results = await Promise.all(jobs.map(run));
    return respond({results});
  } catch {
    return respond({error:'Abruf abgewiesen.'}, 403);
  }
});
