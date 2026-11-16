import { checkLogin, openWorksheets, portalLogin, ServicepadError, worksheetDetail } from './portal.mjs';
import { customerPage } from './customers.mjs';

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
      if (!input || !['status', 'connect', 'list', 'disconnect', 'customers-preview', 'customers-import', 'worksheet-detail'].includes(input.action)) {
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
      if (input.action === 'customers-preview' || input.action === 'customers-import') {
        const applying = input.action === 'customers-import';
        if (applying && (typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint))) {
          throw new ServicepadError('customer_preview', 400, 'Erstelle vor der Übernahme eine Kundenvorschau.');
        }
        const { customers, next } = await customerPage(fetcher, verified.auth, mandant.customerMandantId, input.cursor ?? '0');
        const selected = applying && Array.isArray(input.newCustomers)
          ? new Set(input.newCustomers.filter(id=>typeof id==='string'&&/^[1-9][0-9]{0,14}$/.test(id)).slice(0,401)) : new Set();
        const result = await rest('rpc/juprowa_customer_batch', { method: 'POST', body: {
          p_business: company, p_revision: connection.revision,
          p_customers: customers.map(customer=>({...customer,add_new:selected.has(customer.source_id)})),
          p_expected: applying ? input.fingerprint : null,
        } });
        if (result.changed) throw changed();
        return json({ ...result, next });
      }
      if (input.action === 'worksheet-detail') {
        const detail = await worksheetDetail(fetcher, verified.auth, connection.mandant_id, input.worksheetId);
        const [current] = await rest(filter + '&select=revision');
        if (current?.revision !== connection.revision) throw changed();
        return json({ detail });
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
