import { checkLogin, openWorksheets, portalLogin, ServicepadError, worksheetDetail } from './portal.mjs';
import { customerPage } from './customers.mjs';
import { saveExistingWorksheet } from './worksheet-write.mjs';
import { transferSavedWorksheet } from './worktime-transfer.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const to64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const from64 = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const changed = () => new ServicepadError('connection_changed', 409,
  'Die ServicePad-Verbindung wurde geändert. Lade den Verbindungsstatus neu.');
const mapping = row => row ? { label: row.label, revision: row.revision } : null;

export function createServicepadHandler({ baseUrl, serviceKey, fetcher = fetch }) {
  const headers = {
    'Access-Control-Allow-Origin': 'https://fedex-420.github.io',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  let encryptionKey;
  function getEncryptionKey() {
    encryptionKey ??= crypto.subtle.digest('SHA-256', encoder.encode('worktime/juprowa-servicepad/v1\0' + serviceKey))
      .then(bytes => crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']));
    return encryptionKey;
  }
  const scopeBytes = (businessId, customerId, mandantId) =>
    encoder.encode(JSON.stringify([businessId, customerId, mandantId]));
  async function encrypt(auth, scope) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: scope },
      await getEncryptionKey(), encoder.encode(JSON.stringify(auth)));
    return to64(iv) + '.' + to64(ciphertext);
  }
  async function decrypt(row) {
    try {
      const [iv, ciphertext] = row.encrypted_login.split('.').map(from64);
      const additionalData = scopeBytes(row.business_id, row.portal_customer_id, row.mandant_id);
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData },
        await getEncryptionKey(), ciphertext);
      return JSON.parse(decoder.decode(plaintext));
    } catch {
      throw new ServicepadError('reconnect', 409, 'Bitte melde die ServicePad-Verbindung erneut an.');
    }
  }
  async function supabase(path, { method = 'GET', body, token = 'Bearer ' + serviceKey } = {}) {
    return fetcher(baseUrl + path, {
      method,
      headers: { apikey: serviceKey, Authorization: token, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
  }
  async function rest(path, options) {
    const response = await supabase('/rest/v1/' + path, options);
    if (!response.ok) {
      if (response.status === 409) throw changed();
      throw new Error('Database request failed');
    }
    return response.json();
  }
  async function activeBusiness(req, businessId) {
    const token = req.headers.get('authorization');
    const deny = () => new ServicepadError('forbidden', 403,
      'Du hast keinen Zugriff auf die ServicePad-Verbindung dieses Geschäftskontos.');
    if (!token?.startsWith('Bearer ')) throw new ServicepadError('auth', 401, 'Bitte melde dich erneut an.');
    const auth = await supabase('/auth/v1/user', { token });
    if (!auth.ok) {
      if (auth.status >= 500) throw new Error('Authentication unavailable');
      throw new ServicepadError('auth', 401, 'Bitte melde dich erneut an.');
    }
    const user = await auth.json();
    if (!uuid.test(user.id) || typeof businessId !== 'string' || !uuid.test(businessId)) throw deny();
    const userId = user.id.toLowerCase();
    const companyId = businessId.toLowerCase();
    const [profile] = await rest('profiles?select=role&id=eq.' + userId);
    if (profile?.role === 'business' && userId === companyId) return companyId;
    if (profile?.role !== 'administrator') throw deny();
    const [business] = await rest('profiles?select=role&id=eq.' + companyId);
    if (business?.role !== 'business') throw deny();
    return companyId;
  }

  return async function servicepad(req) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return json({ error: 'Diese Aktion erfordert POST.' }, 405);
    try {
      if (!baseUrl || !serviceKey) throw new Error('Missing configuration');
      let input;
      try { input = await req.json(); } catch { input = null; }
      if (!input || !['status', 'connect', 'list', 'disconnect', 'customers-preview', 'customers-import', 'worksheet-detail','worksheet-save','worksheet-close',
        'worksheet-link','worksheet-transfer'].includes(input.action)) {
        return json({ error: 'Diese ServicePad-Aktion ist ungültig.' }, 400);
      }
      const company = await activeBusiness(req, input.businessId);
      const table = 'juprowa_servicepad_connections';
      const filter = table + '?business_id=eq.' + company;
      const [connection] = await rest(filter + '&select=*');
      if (input.action === 'status') return json({ connection: mapping(connection) });
      if (input.action === 'connect') {
        if ((input.revision || null) !== (connection?.revision ?? null)) throw changed();
        const verified = await checkLogin(fetcher, portalLogin(input));
        const selected = verified.mandants.find(entry => entry.id === input.mandantId)
          ?? (input.mandantId == null && verified.mandants.length === 1 ? verified.mandants[0] : null);
        if (!selected) return json({ mandants: verified.mandants.map(({ id, label }) => ({ id, label })) });
        if (connection && (verified.customerId !== connection.portal_customer_id || selected.id !== connection.mandant_id)) {
          throw new ServicepadError('different_mandant', 409,
            'Der gewählte Mandant weicht von der bestehenden Verbindung ab. Trenne die Verbindung vor einem Wechsel.');
        }
        const worksheets = await openWorksheets(fetcher, verified.auth, selected.id);
        const body = {
          business_id: company,
          portal_customer_id: verified.customerId,
          mandant_id: selected.id,
          label: selected.label,
          encrypted_login: await encrypt(verified.auth, scopeBytes(company, verified.customerId, selected.id)),
          revision: crypto.randomUUID(),
        };
        const [saved] = connection
          ? await rest(filter + '&revision=eq.' + connection.revision, { method: 'PATCH', body })
          : await rest(table, { method: 'POST', body });
        if (!saved) throw changed();
        return json({ connection: mapping(saved), worksheets });
      }
      if (!connection || input.revision !== connection.revision) throw changed();
      if (input.action === 'disconnect') {
        const [removed] = await rest(filter + '&revision=eq.' + connection.revision, { method: 'DELETE' });
        if (!removed) throw changed();
        return json({ connection: null });
      }
      const verified = await checkLogin(fetcher, await decrypt(connection));
      const mandant = verified.mandants.find(entry => entry.id === connection.mandant_id);
      if (verified.customerId !== connection.portal_customer_id || !mandant) {
        throw new ServicepadError('portal_scope', 403, 'Der verknüpfte ServicePad-Mandant ist mit diesem Zugang nicht mehr verfügbar.');
      }
      const bindings='juprowa_work_order_links?business_id=eq.'+company+'&portal_customer_id=eq.'+
        encodeURIComponent(connection.portal_customer_id)+'&mandant_id=eq.'+encodeURIComponent(connection.mandant_id);
      if(input.action==='worksheet-link'||input.action==='worksheet-transfer'){
        if(typeof input.localOrderId!=='string'||!uuid.test(input.localOrderId))throw changed();
        const localOrderId=input.localOrderId.toLowerCase();
        const path=bindings+'&local_order_id=eq.'+localOrderId;
        const snapshot=await rest('rpc/juprowa_work_order_export',{method:'POST',body:{
          p_business:company,p_revision:connection.revision,p_order:localOrderId}});
        if(!snapshot?.order||snapshot.order.id!==localOrderId)throw new ServicepadError('local_order',404,
          'Der offene Arbeitsschein konnte im ausgewählten Betrieb nicht gelesen werden.');
        const baseLink={business_id:company,portal_customer_id:connection.portal_customer_id,mandant_id:connection.mandant_id,local_order_id:localOrderId};
        let [link]=await rest(path+'&select=*');
        if(input.action==='worksheet-link'){
          const original=await worksheetDetail(fetcher,verified.auth,connection.mandant_id,input.worksheetId,verified.workers);
          if(original.revision!==input.sheetRevision||link&&link.worksheet_id!==original.id)throw changed();
          if(!link)await rest('juprowa_work_order_links',{method:'POST',body:{...baseLink,worksheet_id:original.id,sheet_revision:original.revision}});
          return json({localOrderId,worksheetId:original.id});
        }
        if(input.confirmed!==true)throw new ServicepadError('worksheet_invalid',400,'Bestätige die Übergabe des gespeicherten Arbeitsscheins.');
        const assignments=input.workers??{};
        if(typeof assignments!=='object'||Array.isArray(assignments)||Object.keys(assignments).length>100||
           Object.entries(assignments).some(([id,worker])=>!uuid.test(id)||typeof worker!=='string'||!verified.workers.some(entry=>entry.id===worker)))
          throw new ServicepadError('invalid_workers',422,'Bitte die ServicePad-Monteure prüfen.');
        if(!link) {
          [link]=await rest('juprowa_work_order_links',{method:'POST',body:baseLink});
          if(!link)throw changed();
        }
        const nonce=crypto.randomUUID();
        const leaseKey=link.worksheet_id||String(100000000000000+parseInt(localOrderId.replaceAll('-','').slice(0,11),16));
        const lease=p_release=>rest('rpc/juprowa_worksheet_lease',{method:'POST',body:{
          p_business:company,p_revision:connection.revision,p_sheet:leaseKey,p_nonce:nonce,p_release}});
        if(!await lease(false))throw new ServicepadError('worksheet_busy',409,'Dieser Arbeitsschein wird bereits an Juprowa übergeben.');
        try{
          const result=await transferSavedWorksheet(fetcher,{auth:verified.auth,mandantId:connection.mandant_id,
            technician:verified.technician,workers:verified.workers,snapshot,link,assignments,
            markAttempt:async()=>Boolean((await rest(path+'&attempted_at=is.null',{method:'PATCH',body:{attempted_at:new Date().toISOString()}}))[0]),
            updateLink:async(id,revision)=>{
              const [confirmed]=await rest(path,{method:'PATCH',body:{worksheet_id:id,sheet_revision:revision,transferred_at:new Date().toISOString()}});
              if(!confirmed)throw changed();
            },
            beforeSend:async()=>{
              const [current]=await rest(filter+'&select=revision');
              const [order]=await rest('work_orders?id=eq.'+localOrderId+'&select=updated_at,invoiced');
              if(current?.revision!==connection.revision||!order||order.invoiced||order.updated_at!==snapshot.order.updated_at)throw changed();
            },
            loadFile:async file=>{
              if(typeof file.path!=='string'||file.path.split('/').length!==2||!file.path.split('/')[1].startsWith(localOrderId+'-'))
                throw new ServicepadError('worksheet_file',422,'Ein Anhang konnte dem Arbeitsschein nicht sicher zugeordnet werden.');
              const response=await supabase('/storage/v1/object/work-order-documents/'+file.path.split('/').map(encodeURIComponent).join('/'));
              if(!response.ok||Number(response.headers.get('content-length'))>8388608)
                throw new ServicepadError('worksheet_file',422,'Ein Anhang konnte nicht übertragen werden oder ist größer als 8 MB.');
              const bytes=new Uint8Array(await response.arrayBuffer());
              if(!bytes.length||bytes.length>8388608)throw new ServicepadError('worksheet_file',422,'Ein Anhang ist leer oder größer als 8 MB.');
              let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
              return 'data:'+(file.mime||'application/octet-stream')+';base64,'+btoa(binary);
            }});
          return json(result);
        }finally{await lease(true).catch(()=>{});}
      }
      if (input.action==='worksheet-save'||input.action==='worksheet-close') {
        if(typeof input.worksheetId!=='string'||!/^[1-9]\d{0,14}$/.test(input.worksheetId)||input.confirmed!==true) {
          throw new ServicepadError('worksheet_invalid',400,'Öffne den gewünschten Arbeitsschein und bestätige die Änderung.');
        }
        const nonce=crypto.randomUUID();
        const lease=p_release=>rest('rpc/juprowa_worksheet_lease',{method:'POST',body:{
          p_business:company,p_revision:connection.revision,p_sheet:input.worksheetId,p_nonce:nonce,p_release,
        }});
        if(!await lease(false))throw new ServicepadError('worksheet_busy',409,'Dieser Arbeitsschein wird gerade gespeichert. Prüfe den Stand erneut.');
        try{
          const result=await saveExistingWorksheet(fetcher,{auth:verified.auth,mandantId:connection.mandant_id,
            technician:verified.technician,workers:verified.workers,input,beforeSend:async()=>{
              const [current]=await rest(filter+'&select=revision');
              if(current?.revision!==connection.revision)throw changed();
            }});
          return json(result);
        } finally {
          await lease(true).catch(()=>{});
        }
      }
      if (input.action === 'customers-preview' || input.action === 'customers-import') {
        const applying = input.action === 'customers-import';
        if (applying && (typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint))) {
          throw new ServicepadError('customer_preview', 400, 'Erstelle vor der Übernahme eine Kundenvorschau.');
        }
        const { customers, next } = await customerPage(fetcher, verified.auth, mandant.customerMandantId, input.cursor ?? '0');
        const selected = applying && Array.isArray(input.newCustomers)
          ? new Set(input.newCustomers.filter(id=>typeof id==='string'&&/^[1-9][0-9]{0,14}$/.test(id)).slice(0,401)) : new Set();
        const requestedAssignments=applying ? input.customerAssignments ?? {} : {};
        const entries=requestedAssignments && typeof requestedAssignments==='object' && !Array.isArray(requestedAssignments)
          ? Object.entries(requestedAssignments) : null;
        const available=new Set(customers.map(customer=>customer.source_id));
        if (!entries || entries.length>401 || entries.some(([source,target])=>!available.has(source) || typeof target!=='string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(target))) {
          throw new ServicepadError('customer_assignment', 400, 'Mindestens eine Kundenzuordnung ist ungültig. Bitte lade die Kundenvorschau erneut.');
        }
        const assignments=new Map(entries);
        const result = await rest('rpc/juprowa_customer_batch', { method: 'POST', body: {
          p_business: company, p_revision: connection.revision,
          p_customers: customers.map(customer=>({...customer,add_new:selected.has(customer.source_id),review_target:assignments.get(customer.source_id)})),
          p_expected: applying ? input.fingerprint : null,
        } });
        if (result.changed) throw changed();
        if (result.selection_error) throw new ServicepadError('customer_assignment',409,result.selection_error==='duplicate'
          ? 'Mehrere Juprowa-Kunden sind demselben Kunden zugeordnet. Bitte wähle pro Kundenkonto höchstens einen Eintrag.'
          : 'Mindestens eine Zuordnung ist für diese Kundenvorschau nicht verfügbar. Bitte prüfe die Auswahl.');
        return json({ ...result, next });
      }
      if (input.action === 'worksheet-detail') {
        const detail = await worksheetDetail(fetcher, verified.auth, connection.mandant_id, input.worksheetId, verified.workers);
        const [current] = await rest(filter + '&select=revision');
        if (current?.revision !== connection.revision) throw changed();
        const [local]=await rest(bindings+'&worksheet_id=eq.'+encodeURIComponent(detail.id)+'&select=local_order_id');
        return json({ detail:{...detail,...(local?{localOrderId:local.local_order_id}:{})} });
      }
      const worksheets = await openWorksheets(fetcher, verified.auth, connection.mandant_id);
      const [current] = await rest(filter + '&select=revision');
      if (current?.revision !== connection.revision) throw changed();
      return json({ connection: mapping(connection), worksheets });
    } catch (error) {
      if (error instanceof ServicepadError) return json({ code: error.code, error: error.message }, error.status);
      return json({ code: 'internal', error: 'Die ServicePad-Verbindung konnte gerade nicht verarbeitet werden.' }, 500);
    }
  };
}
