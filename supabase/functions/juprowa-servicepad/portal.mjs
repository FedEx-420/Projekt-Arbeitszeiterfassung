const serviceUrl = 'https://services.juprowa.net/Cloud/WebService/v6.0/jsondata.php';
const label = (value, max = 160) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const remoteId = value => typeof value === 'number' || typeof value === 'string'
  ? /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(String(value)) ? String(value) : ''
  : '';

export class ServicepadError extends Error {
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const loginRejected = () => new ServicepadError('portal_login', 422,
  'ServicePad hat die Anmeldung abgelehnt. Prüfe Seriennummer, Benutzer und Passwort.');
const portalUnavailable = () => new ServicepadError('portal_unavailable', 502,
  'ServicePad konnte die Anfrage gerade nicht beantworten. Versuche es erneut.');
const unexpectedReply = () => new ServicepadError('portal_reply', 502,
  'ServicePad hat eine unerwartete Antwort geliefert. Der Abruf wurde abgebrochen.');

async function requestPortal(fetcher, type, auth) {
  const url = new URL(serviceUrl);
  url.searchParams.set('type', type);
  url.searchParams.set('UID', auth.uid);
  url.searchParams.set('PASSPORT', auth.passport);
  if (type === 'Userdata') url.searchParams.set('ts', String(Date.now()));
  let response, raw;
  try {
    response = await fetcher(url, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(14000),
    });
    if (response.ok) raw = await response.text();
  } catch {
    throw portalUnavailable();
  }
  if (response.status === 401 || response.status === 403) throw loginRejected();
  if (!response.ok) throw portalUnavailable();
  if (raw === '' && type === 'WorksheetList') return [];
  try {
    return JSON.parse(raw);
  } catch {
    throw unexpectedReply();
  }
}

function allowedMandants(customer, user) {
  if (user.ALLOWED_MANDANT != null && typeof user.ALLOWED_MANDANT !== 'string') {
    throw unexpectedReply();
  }
  const allowed = (user.ALLOWED_MANDANT || '').split(',').map(name => name.trim().toUpperCase()).filter(Boolean);
  const result = [];
  if (!allowed.length || allowed.includes('BASIS')) {
    result.push({ id: '0', label: customer.MANDANTEN ? 'Basismandant' : label(customer.NAME) || 'ServicePad' });
  }
  for (const row of Object.values(customer.MANDANTEN ?? {})) {
    const id = remoteId(row?.ID);
    const name = label(row?.MANDANT_ID);
    if (id && id !== '0' && name && (!allowed.length || allowed.includes(name.toUpperCase()))) {
      if (!result.some(entry => entry.id === id)) result.push({ id, label: name });
    }
  }
  return result;
}

export async function checkLogin(fetcher, auth) {
  const result = await requestPortal(fetcher, 'Userdata', auth);
  const customer = result?.CURR_CUSTOMER;
  const user = result?.CURR_USER;
  const customerId = remoteId(customer?.ID) || remoteId(customer?.KUNDENNR);
  if (!customerId || !user || typeof user.UID !== 'string') throw unexpectedReply();
  if (user.UID !== auth.uid) throw loginRejected();
  const mandants = allowedMandants(customer, user);
  if (!mandants.length) throw new ServicepadError('portal_scope', 403,
    'Dieser ServicePad-Zugang ist keinem abrufbaren Mandanten zugeordnet.');
  // ServicePad returns the URL-encoded passport it uses for subsequent requests.
  let passport = auth.passport;
  if (typeof user.PASSPORT === 'string' && user.PASSPORT.length <= 2048 && user.PASSPORT) {
    try { passport = decodeURIComponent(user.PASSPORT); } catch { passport = user.PASSPORT; }
  }
  return { customerId, mandants, auth: { uid: auth.uid, passport } };
}

export function portalLogin({ serial, username, password }) {
  const company = typeof serial === 'string' ? serial.trim() : '';
  const name = typeof username === 'string' ? username.trim().toUpperCase() : '';
  const secret = typeof password === 'string' ? password.trim() : '';
  if (!company || company.length > 80 || !name || name.length > 120 || !secret || secret.length > 512) {
    throw new ServicepadError('portal_fields', 400, 'Gib Seriennummer, ServicePad-Benutzer und Passwort ein.');
  }
  return { uid: company + name, passport: company + name + secret };
}

export async function openWorksheets(fetcher, auth, mandantId) {
  const result = await requestPortal(fetcher, 'WorksheetList', auth);
  if (!Array.isArray(result) || result.some(row => !row || !remoteId(row.ID)
      || !/^-?\d+$/.test(String(row.AK_AUFSTATUS ?? '')))) throw unexpectedReply();
  const matches = new Map();
  for (const row of result) {
    const scope = row.ID_MANDANT == null || row.ID_MANDANT === '' ? '0' : remoteId(row.ID_MANDANT);
    if (scope !== mandantId || Number(row.AK_AUFSTATUS) >= 5) continue;
    const id = remoteId(row.ID);
    const date = /^\d{4}-\d{2}-\d{2}/.exec(label(row.AK_TERMIN) || label(row.STARTDATE))?.[0];
    matches.set(id, {
      id,
      number: label(row.AK_SCHEINNR) || id,
      customer: [label(row.AK_BAUADR_NAM1), label(row.AK_BAUADR_NAM2)].filter(Boolean).join(' '),
      location: [label(row.AK_BAUADR_STR), [label(row.AK_BAUADR_PLZ), label(row.AK_BAUADR_ORT)].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      technician: label(row.AK_MONTEUR_TEXT),
      description: label(row.AK_ARBEITEN, 1600),
      date: date && date > '1970-01-02' && date < '2999-01-01' ? date : null,
    });
  }
  return [...matches.values()].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')
    || a.number.localeCompare(b.number, 'de', { numeric: true }));
}
