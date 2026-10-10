/* Zeiterfassung v800 – neu aufgebaut, ohne Abhängigkeit von älteren App-Versionen. */
(() => {
  'use strict';

  const cfg = window.WORKTIME_CONFIG || {};
  const base = String(cfg.supabaseUrl || '').replace(/\/$/, '');
  const key = String(cfg.supabasePublishableKey || '');
  const root = document.getElementById('app');
  const storage = 'zeiterfassung-v800-session';
  const today = () => new Date().toISOString().slice(0, 10);
  const state = {
    session: null, profile: null, people: [], view: 'home', date: today(), month: today().slice(0, 7),
    businessId: '', businessBrand: null, employeeId: '', customerId: '', customerSearch: '', materialId: '', orderId: '', timeEntryId: '', orderCustomer: '', orderOrigin: 'orders', billingKey: '', billingMode: 'open', menu: false, vacationForm: false, appointmentForm: false, composeMessage: false, mailboxFolder: 'received', notice: null, busy: false,
    rows: { entries: [], orders: [], items: [], customers: [], days: [], vacations: [], messages: [], attachments: [], recipients: [], materials: [], appointments: [], planningRequests: [], payslips: [], documents: [] }
  };
  /* BEGIN SESSION AUTH V859
   * Keep auth in the app bundle so previously cached index pages also work.
   * Only a definite JWT-expiry rejection may replay a write, once. */
  function createSessionAuth({base,key,storage,getSession,setSession,transientStore=null}){
    let refreshing=null;
    const failure=(message,code='SESSION_EXPIRED')=>Object.assign(new Error(message),{code});
    const changed=()=>failure('Die Anmeldung wurde geändert. Bitte erneut anmelden.','SESSION_CHANGED');
    const expired=()=>failure('Deine Anmeldung ist abgelaufen. Bitte erneut anmelden und danach nochmals speichern.');
    const activeStore=()=>getSession()?.remember_device===false&&transientStore?transientStore:localStorage;
    const read=()=>{try{return JSON.parse(activeStore().getItem(storage)||'null');}catch{return null;}};
    const sameUser=(a,b)=>!!a?.user?.id&&a.user.id===b?.user?.id;
    function expiresAt(session){
      if(Number(session?.expires_at)>0)return Number(session.expires_at);
      try{const payload=session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return Number(JSON.parse(atob(payload)).exp)||0;}catch{return 0;}
    }
    const due=session=>{const expires=expiresAt(session);return !!expires&&expires<=Date.now()/1000+90;};
    function install(session,remember=session?.remember_device??getSession()?.remember_device??true){
      const result={...session,remember_device:remember};
      if(!expiresAt(result)&&Number(result.expires_in)>0)result.expires_at=Math.floor(Date.now()/1000)+Number(result.expires_in);
      setSession(result);activeStore().setItem(storage,JSON.stringify(result));
      if(transientStore)(remember?transientStore:localStorage).removeItem(storage);
      localStorage.removeItem('zeiterfassung-session-v700');return result;
    }
    function clear(){setSession(null);localStorage.removeItem(storage);transientStore?.removeItem(storage);localStorage.removeItem('zeiterfassung-session-v700');}
    async function refresh(rejectedToken=null){
      const original=getSession();if(!original?.access_token)throw expired();
      if(refreshing){await refreshing;const current=getSession();if(!sameUser(original,current))throw changed();return current;}
      const run=async()=>{
        if(getSession()!==original)throw changed();
        // Another tab may already have rotated the single-use refresh token.
        const stored=read();
        if(stored&&!sameUser(stored,original))throw changed();
        if(!stored&&original.refresh_token&&!localStorage.getItem('zeiterfassung-session-v700'))throw changed();
        let current=original;
        if(stored?.access_token&&stored.access_token!==original.access_token){setSession(stored);current=stored;}
        if((!rejectedToken||current.access_token!==rejectedToken)&&!due(current))return current;
        if(!current.refresh_token)throw expired();
        const storedBefore=activeStore().getItem(storage);
        let response;
        try{response=await fetch(base+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:current.refresh_token})});}
        catch{throw failure('Die Anmeldung konnte gerade nicht erneuert werden. Bitte die Verbindung prüfen und nochmals speichern.','SESSION_REFRESH_UNAVAILABLE');}
        let data;try{data=await response.json();}catch{data=null;}
        if(!response.ok){if(response.status===400||response.status===401||response.status===403)throw expired();throw failure('Die Anmeldung konnte gerade nicht erneuert werden. Bitte später nochmals speichern.','SESSION_REFRESH_UNAVAILABLE');}
        if(!data?.access_token||!data.refresh_token||!sameUser(data,current))throw failure('Die Anmeldung konnte nicht sicher erneuert werden. Bitte erneut anmelden.');
        // A late response must never undo logout or replace a newer login.
        if(getSession()!==current||activeStore().getItem(storage)!==storedBefore)throw changed();
        return install(data);
      };
      const pending=(navigator.locks?.request?navigator.locks.request(storage+'-refresh',run):run());
      refreshing=pending;
      try{return await pending;}finally{if(refreshing===pending)refreshing=null;}
    }
    async function ensure(){const session=getSession();if(!session?.access_token)return session;if(due(session))return refresh();return session;}
    function jwtExpired(response,body){
      return response.status===401&&(body?.code==='jwt_expired'||/\bjwt\b[^\n]*\bexpir|\bexpir[^\n]*\bjwt\b|\btoken\b[^\n]*\bexpired/i.test(String(body?.message||body?.error_description||body?.error||'')));
    }
    async function request(path,options={}){
      const anonymous=path.startsWith('/auth/v1/token'),owner=getSession();
      const send=async()=>{
        const session=anonymous?null:await ensure();
        if(!anonymous&&owner?.access_token&&!sameUser(owner,session))throw changed();
        const headers=new Headers(options.headers);headers.set('apikey',key);
        if(session?.access_token)headers.set('Authorization','Bearer '+session.access_token);
        else headers.delete('Authorization');
        return {response:await fetch(base+path,{...options,headers}),token:session?.access_token};
      };
      let {response,token}=await send();
      if(token&&response.status===401){
        let body;try{body=await response.clone().json();}catch{body=null;}
        if(jwtExpired(response,body)){
          await refresh(token);
          ({response}=await send());
          if(response.status===401){let retryBody;try{retryBody=await response.clone().json();}catch{retryBody=null;}if(jwtExpired(response,retryBody))throw expired();}
        }
      }
      return response;
    }
    return {request,ensure,install,clear};
  }
  /* END SESSION AUTH V859 */
  const auth = createSessionAuth({base,key,storage,transientStore:sessionStorage,getSession:()=>state.session,setSession:session=>{state.session=session;}});

  /* BEGIN PLANNING SYNC V867
   * A revision is acknowledged only after a complete verified download.
   * Failure/missing server support always falls back to the original full load.
   * Nothing private is persisted in the shared service-worker/browser cache. */
  function createPlanningSync({readStamp,identity}) {
    let verified=null,epoch=0,sequence=0;
    const changed=()=>new Error('Das Konto oder die Daten wurden inzwischen aktualisiert. Bitte erneut laden.');
    function reset(){epoch++;verified=null;}
    function valid(proof){return proof.epoch===epoch && proof.sequence===sequence && proof.scope===identity();}
    async function begin(ifChanged=false){
      const proof={scope:identity(),epoch,sequence:++sequence,stamp:null,unchanged:false};
      try {const value=await readStamp();if(value?.version===1 && /^[a-f0-9]{32}$/.test(value.stamp))proof.stamp=value.stamp;} catch { /* Full download remains available. */ }
      if(!valid(proof))throw changed();
      proof.unchanged=!!(ifChanged && proof.stamp && verified?.scope===proof.scope && verified?.stamp===proof.stamp);
      return proof;
    }
    function assertCurrent(proof){if(!valid(proof))throw changed();}
    function commit(proof){assertCurrent(proof);verified=proof.stamp?{scope:proof.scope,stamp:proof.stamp}:null;}
    return {begin,commit,assertCurrent,reset};
  }
  /* END PLANNING SYNC V867 */
  const planningSync=createPlanningSync({readStamp:()=>api('/rest/v1/rpc/planning_sync_stamp',{method:'POST',body:{}}),identity:()=>JSON.stringify([state.session?.user?.id,state.profile?.id,businessId()])});

  const escape = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch]);
  const n = value => Number(value || 0);
  const same = (a, b) => String(a || '') === String(b || '');
  const lower = value => String(value || '').trim().toLocaleLowerCase('de-DE');
  const dateText = value => value ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : '';
  const monthText = value => new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date(`${value}-01T12:00:00`));
  const h = value => `${n(value).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
  const timeText = value => value ? `${String(value).slice(0, 5)} Uhr` : '—';
  const isAdmin = () => state.profile?.role === 'administrator';
  const isBusiness = () => state.profile?.role === 'business';
  const isManager = () => isAdmin() || isBusiness();
  const canUse = name => isManager() || state.profile?.menu_permissions?.[name] !== false;

  function notice(message, error = false) { state.notice = message ? { message, error } : null; }
  function noticeHtml() { return state.notice ? `<div class="${state.notice.error ? 'notice error' : 'notice'}">${escape(state.notice.message)}</div>` : ''; }
  function parse(text) { try { return text ? JSON.parse(text) : null; } catch { return null; } }

  async function api(path, options = {}) {
    const headers = { apikey: key, ...(options.headers || {}) };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await auth.request(path, { method: options.method || 'GET', headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    const text = await response.text(); const body = parse(text);
    if (!response.ok) throw Object.assign(new Error(body?.error || body?.message || body?.error_description || 'Die Anfrage konnte nicht verarbeitet werden.'),{status:response.status,code:body?.code});
    return body;
  }
  const rows = (table, query = 'select=*') => api(`/rest/v1/${table}?${query}`);
  const write = (table, data, method = 'POST', query = '') => api(`/rest/v1/${table}${query ? `?${query}` : ''}`, { method, body: data, headers: { Prefer: 'return=representation' } });
  const remove = (table, query) => api(`/rest/v1/${table}?${query}`, { method: 'DELETE' });
  const account = (action, payload = {}) => api('/functions/v1/account-management', { method: 'POST', body: { action, ...payload } });
  const flow = (action, payload = {}) => api('/functions/v1/vacation-workflow', { method: 'POST', body: { action, ...payload } });
  async function upload(bucket, path, file) {
    const response = await auth.request(`/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }, body: file });
    if (!response.ok) throw new Error('Die Datei konnte nicht hochgeladen werden.');
  }
  const publicObjectUrl = (bucket, path) => path ? `${base}/storage/v1/object/public/${bucket}/${String(path).split('/').map(encodeURIComponent).join('/')}` : '';
  async function download(bucket, path, name) {
    const response = await auth.request(`/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`);
    if (!response.ok) throw new Error('Die Datei konnte nicht heruntergeladen werden.');
    const url = URL.createObjectURL(await response.blob()), link = document.createElement('a'); link.href = url; link.download = name || 'Datei'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function removeStoredFile(bucket, path) {
    const response = await auth.request(`/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE' });
    // A missing file is already fully removed, so only actual API failures stop
    // the database deletion.
    if (!response.ok && response.status !== 404) throw new Error('Ein zugehöriges Dokument konnte nicht gelöscht werden.');
  }

  function loginCompanyKey(value) { return lower(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48); }
  function loginUsernameKey(value) { return `u${Array.from(new TextEncoder().encode(String(value || '').trim().normalize('NFKC').toLocaleLowerCase('de-DE')), byte => byte.toString(16).padStart(2, '0')).join('')}`; }
  function legacyLoginUsernameKey(value) { const name = String(value || '').trim().toLowerCase(); return /^[A-Za-z0-9._-]+$/.test(name) ? name : ''; }
  function loginEmails(username, company, administratorLogin = false) {
    const key = loginCompanyKey(company || ''), names = [...new Set([loginUsernameKey(username), legacyLoginUsernameKey(username)].filter(Boolean))];
    return administratorLogin ? names.map(name => `${name}@arbeitszeit.local`) : key ? names.map(name => `${name}--${key}@arbeitszeit.local`) : [];
  }
  async function login(username, password, company, administratorLogin = false, rememberDevice = false) {
    const name = String(username || '').trim();
    if (name.length < 3 || name.length > 80 || /[\u0000-\u001F\u007F]/.test(name)) throw new Error('Bitte einen gültigen Benutzernamen eingeben. Leerzeichen innerhalb des Namens sind erlaubt.');
    if (!administratorLogin && !loginCompanyKey(company || '')) throw new Error('Bitte die Firma eingeben. Nur das Administratorkonto meldet sich ohne Firma an.');
    let data = null, lastError = null;
    for (const email of loginEmails(name, company, administratorLogin)) {
      try { data = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }); break; }
      catch (error) { lastError = error; }
    }
    if (!data) throw lastError || new Error('Firma, Benutzername oder Passwort sind nicht korrekt.');
    auth.install(data,rememberDevice);
    const own = await rows('profiles', `select=role&id=eq.${encodeURIComponent(data.user.id)}`), role = own?.[0]?.role;
    if ((administratorLogin && role !== 'administrator') || (!administratorLogin && role === 'administrator')) {
      try { await api('/auth/v1/logout', { method: 'POST' }); } catch { /* Session wird anschließend lokal verworfen. */ }
      auth.clear();
      throw new Error(administratorLogin ? 'Dieses Konto ist kein Administratorkonto.' : 'Das Administratorkonto meldet sich ohne Firma an.');
    }
    state.view = 'home'; state.menu = false; state.customerId = ''; state.customerSearch = ''; state.orderId = ''; state.timeEntryId = ''; state.billingKey = ''; state.vacationForm = false; state.composeMessage = false;
    await loadApp();
  }
  function logout() { planningSync.reset(); auth.clear(); state.profile = null; state.businessBrand = null; render(); }

  async function loadApp() {
    if (!state.session?.user?.id) return render();
    state.view = 'home'; state.menu = false; state.customerId = ''; state.orderId = ''; state.timeEntryId = ''; state.billingKey = ''; state.vacationForm = false; state.composeMessage = false;
    state.busy = true; render();
    try {
      const own = await rows('profiles', `select=*&id=eq.${encodeURIComponent(state.session.user.id)}`);
      state.profile = own?.[0] || null;
      if (!state.profile) throw new Error('Dieses Konto ist nicht eingerichtet.');
      await reload();
    } catch (error) {
      auth.clear(); state.profile = null; notice(error.message || 'Die Anmeldung ist fehlgeschlagen.', true);
    } finally { state.busy = false; render(); }
  }
  async function reload() {
    const load = async (name, table, query = 'select=*') => { try { state.rows[name] = await rows(table, query) || []; } catch { state.rows[name] = []; } };
    const loadRecipients = async () => { try { state.rows.recipients = (await api('/functions/v1/mailbox-send', { method: 'POST', body: { action: 'recipients' } }))?.recipients || []; } catch { state.rows.recipients = []; } };
    await Promise.all([
      load('people', 'profiles'), load('entries', 'time_entries', 'select=*&order=work_date.desc,created_at.desc'), load('orders', 'work_orders', 'select=*&order=work_date.desc,created_at.desc'),
      load('items', 'work_order_items'), load('customers', 'customers', 'select=*&order=name.asc'), load('days', 'work_days'), load('vacations', 'vacation_requests', 'select=*&order=created_at.desc'),
      load('messages', 'mailbox_messages', 'select=*&order=created_at.desc'), load('attachments', 'mailbox_attachments', 'select=*&order=created_at.asc'), load('materials', 'materials', 'select=*&order=name.asc'), load('appointments', 'appointments'),
      load('payslips', 'employee_payslips', 'select=*&order=created_at.desc'), load('documents', 'work_order_documents'), loadRecipients()
    ]);
    state.people = state.rows.people;
    if (!isManager()) {
      try { state.businessBrand = (await api('/rest/v1/rpc/current_business_branding', { method: 'POST', body: {} }))?.[0] || null; }
      catch { state.businessBrand = null; }
    } else state.businessBrand = null;
    if (isAdmin() && !businesses().some(person => same(person.id, state.businessId))) state.businessId = businesses()[0]?.id || '';
    if (!workers().some(person => same(person.id, state.employeeId))) state.employeeId = workers()[0]?.id || state.profile.id;
  }
  async function perform(message, task) {
    state.busy = true; render();
    try { await task(); await reload(); notice(message); }
    catch (error) { try { await reload(); } catch { /* Originalfehler erhalten */ } notice(error.message || 'Die Aktion konnte nicht gespeichert werden.', true); }
    finally { state.busy = false; render(); }
  }

  function businesses() { return state.people.filter(person => person.role === 'business'); }
  function businessId() { return isAdmin() ? state.businessId : isBusiness() ? state.profile.id : state.profile?.business_id || ''; }
  function workers() {
    if (!state.profile) return [];
    if (!isManager()) return [state.profile];
    return state.people.filter(person => person.role === 'employee' && same(person.business_id, businessId()));
  }
  function worker() { return workers().find(person => same(person.id, state.employeeId)) || workers()[0] || state.profile; }
  function workerId() { return worker()?.id || ''; }
  function managerBusiness() {
    // For employees, the dedicated RPC always represents the current company
    // branding.  Prefer it over a possibly incomplete cached profile list.
    if (!isManager() && state.businessBrand) return state.businessBrand;
    return businesses().find(person => same(person.id, businessId())) || (isBusiness() ? state.profile : null) || state.businessBrand;
  }
  function companyLogoUrl(business = managerBusiness()) { return publicObjectUrl('company-logos', business?.company_logo_path); }
  function sameWorkTime(entry, order) {
    const customerMatches = entry.customer_id && order.customer_id
      ? same(entry.customer_id, order.customer_id)
      : lower(entry.customer_name) === lower(order.customer_name);
    return same(entry.employee_id, order.employee_id)
      && entry.work_date === order.work_date
      && customerMatches
      && String(entry.start_time || '').slice(0, 5) === String(order.start_time || '').slice(0, 5)
      && String(entry.end_time || '').slice(0, 5) === String(order.end_time || '').slice(0, 5)
      && Math.abs(n(entry.pause_hours) - n(order.pause_hours)) < 0.001
      && Math.abs(n(entry.executed_hours) - n(order.executed_hours)) < 0.001;
  }
  function effectiveTimeEntries(id = workerId(), date = '') {
    return state.rows.entries.filter(row => {
      if (!same(row.employee_id, id) || (date && row.work_date !== date)) return false;
      // A manually saved entry and a work order with precisely the same job
      // represent one working period. Keep the work-order source once.
      return row.work_order_id || row.team_work_order_id || !state.rows.orders.some(order => orderPeriods(order).some(period => sameWorkTime(row,{...order,...period})));
    });
  }
  function dayEntries(id = workerId(), date = state.date) { return effectiveTimeEntries(id, date); }
  function dayHours(id = workerId(), date = state.date) { return dayEntries(id, date).reduce((sum, row) => sum + n(row.executed_hours), 0); }
  function dateAt(year, month, day) { return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
  function addDate(date, days) { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); }
  function dayPicker() { return `<div class="actions date-picker"><button type="button" class="secondary small" data-action="shift-day" data-days="-1" aria-label="Vorheriger Tag" title="Vorheriger Tag">‹</button><label class="date-field">Tag<input type="date" data-date value="${state.date}"></label><button type="button" class="secondary small" data-action="shift-day" data-days="1" aria-label="Nächster Tag" title="Nächster Tag">›</button></div>`; }
  function orderDatePicker(value) { return `<label>Datum<div class="actions date-picker"><button type="button" class="secondary small" data-action="shift-order-date" data-days="-1" aria-label="Vorheriger Tag" title="Vorheriger Tag">‹</button><input name="work_date" type="date" value="${escape(value || state.date)}"><button type="button" class="secondary small" data-action="shift-order-date" data-days="1" aria-label="Nächster Tag" title="Nächster Tag">›</button></div></label>`; }
  function easterSunday(year) { const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), month = Math.floor((h + l - 7 * m + 114) / 31), day = (h + l - 7 * m + 114) % 31 + 1; return dateAt(year, month, day); }
  function nrwHoliday(date) {
    const [year, month, day] = String(date || '').split('-').map(Number); if (!year || !month || !day) return '';
    const fixed = { '1-1': 'Neujahr', '5-1': 'Tag der Arbeit', '10-3': 'Tag der Deutschen Einheit', '11-1': 'Allerheiligen', '12-25': '1. Weihnachtstag', '12-26': '2. Weihnachtstag' };
    if (fixed[`${month}-${day}`]) return fixed[`${month}-${day}`];
    const easter = easterSunday(year), movable = { [addDate(easter, -2)]: 'Karfreitag', [addDate(easter, 1)]: 'Ostermontag', [addDate(easter, 39)]: 'Christi Himmelfahrt', [addDate(easter, 50)]: 'Pfingstmontag', [addDate(easter, 60)]: 'Fronleichnam' };
    return movable[date] || '';
  }
  function dueHours(date) { if (nrwHoliday(date)) return 0; const day = new Date(`${date}T12:00:00`).getDay(); return day === 5 ? 5 : day === 0 || day === 6 ? 0 : 8; }
  function sick(id = workerId(), date = state.date) { return state.rows.days.some(row => same(row.employee_id, id) && row.work_date === date && n(row.sick) > 0); }
  function vacation(id = workerId(), date = state.date) { return state.rows.vacations.find(row => same(row.employee_id, id) && row.status === 'approved' && row.start_date <= date && row.end_date >= date); }
  function locked(id = workerId(), date = state.date) { return sick(id, date) || vacation(id, date) || Boolean(nrwHoliday(date)); }
  function lockedText(id = workerId(), date = state.date) { return sick(id, date) ? 'Krank gemeldet – keine Arbeitszeit oder Arbeitsscheine möglich.' : vacation(id, date) ? 'Genehmigter Urlaub – keine Arbeitszeit oder Arbeitsscheine möglich.' : nrwHoliday(date) ? `${nrwHoliday(date)} in NRW – keine Arbeitszeit oder Arbeitsscheine möglich.` : ''; }
  function annualSick(id = workerId()) { const year = state.date.slice(0, 4); return state.rows.days.filter(row => same(row.employee_id, id) && row.work_date.startsWith(year) && n(row.sick) > 0).reduce((sum, row) => sum + n(row.sick), 0); }
  function vacationLeft(id = workerId()) { const person = state.people.find(row => same(row.id, id)) || worker(); const year = state.date.slice(0, 4); const used = state.rows.vacations.filter(row => same(row.employee_id, id) && row.status === 'approved' && row.start_date <= `${year}-12-31` && row.end_date >= `${year}-01-01`).reduce((sum, row) => sum + n(row.requested_days), 0); return Math.max(0, n(person?.vacation_allowance) - used); }
  function overtime(id = workerId()) {
    // Time entries are the primary source, including manually recorded times.
    // A work order is used as a fallback only while its linked time entry has
    // not arrived yet, so it can never be counted twice.
    const year = state.date.slice(0, 4), days = new Map(), linkedOrders = new Set();
    const add = (date, hours) => days.set(date, n(days.get(date)) + n(hours));
    effectiveTimeEntries(id)
      .filter(row => String(row.work_date || '').startsWith(year))
      .forEach(row => { add(row.work_date, row.executed_hours); if (row.work_order_id) linkedOrders.add(String(row.work_order_id)); });
    state.rows.orders
      .filter(row => same(row.employee_id, id) && String(row.work_date || '').startsWith(year) && !linkedOrders.has(String(row.id)))
      .forEach(row => add(row.work_date, row.executed_hours));
    return [...days].reduce((sum, [date, value]) => sum + value - dueHours(date), 0);
  }

  function loginView() { return `<main class="login-page"><section class="login-card"><div class="brand-mark">ZE</div><h1>Zeiterfassung</h1><p>Arbeitszeiten einfach und sicher erfassen.</p><form data-form="login"><label>Firma<input name="company" autocomplete="organization" placeholder="Firmenname" required></label><label>Benutzername<input name="username" autocomplete="username" required></label><label>Passwort<input name="password" type="password" autocomplete="current-password" required></label><label class="login-admin"><input name="administrator_login" type="checkbox"> Anmeldung als Administrator (nur dann ohne Firma)</label><label>Beim nächsten Mal auf diesem Gerät angemeldet bleiben?<select name="remember_device" required><option value="">Bitte auswählen</option><option value="yes">Ja, auf diesem Gerät</option><option value="no">Nein, nur für diese Sitzung</option></select></label><p class="device-help">Nur auf einem eigenen, geschützten Gerät wählen. Dein Passwort wird nicht gespeichert. Abmelden beendet die Geräteanmeldung.</p><button class="primary" ${state.busy ? 'disabled' : ''}>Anmelden</button></form><button class="link-button" type="button" data-action="forgot">Passwort vergessen?</button>${noticeHtml()}</section></main>`; }
  function menuItems() { return [['home','Übersicht',true],['time','Zeiterfassung',canUse('time')],['orders','Arbeitsscheine',canUse('orders')],['calendar','Kalender',canUse('calendar')],['customers','Kunden',canUse('customers')],['mailbox','Postfach',true],['materials','Materialliste',isManager()],['invoices','Abrechnungen Kunden',isManager()],['invoices-paid','Abgerechnete Arbeitsscheine',isManager()],['settings','Einstellungen',true]].filter(([, , yes]) => yes); }
  function selector() {
    if (!isManager()) return '';
    const businessesHtml = isAdmin() ? `<label>Geschäftskonto<select data-select="business"><option value="">Auswählen</option>${businesses().map(person => `<option value="${person.id}" ${same(person.id, businessId()) ? 'selected' : ''}>${escape(person.company_name || person.username)}</option>`).join('')}</select></label>` : '';
    return `<div class="account-selector">${businessesHtml}<label>Mitarbeiter<select data-select="employee">${workers().map(person => `<option value="${person.id}" ${same(person.id, workerId()) ? 'selected' : ''}>${escape(person.username)}</option>`).join('')}</select></label></div>`;
  }
  function appView() {
    const title = managerBusiness()?.company_name || 'Zeiterfassung';
    const overlay = state.menu ? `<section class="app-menu-sheet"><header><b>Menü auswählen</b><button type="button" class="secondary small" data-action="menu">Schließen</button></header><nav>${menuItems().map(([id, text]) => `<button type="button" data-action="nav" data-view="${id}" class="${state.view === id ? 'active' : ''}">${text}</button>`).join('')}<hr><button type="button" data-action="logout">Abmelden</button></nav></section>` : '';
    return `<div class="app-shell"><header class="topbar"><div><span class="eyebrow">${escape(title)}</span><h1>Zeiterfassung</h1></div><div class="top-actions">${selector()}<button type="button" class="menu-toggle" data-action="menu">☰ Menü</button></div></header>${overlay}<main class="content">${viewHtml()}${noticeHtml()}</main></div>`;
  }
  function viewHtml() { return ({ home: homeView, time: timeView, orders: ordersView, 'order-detail': orderDetailView, calendar: calendarView, customers: customersView, mailbox: mailboxView, materials: materialsView, invoices: invoicesView, 'invoices-paid': paidInvoicesView, 'billing-detail': billingDetailView, settings: settingsView }[state.view] || homeView)(); }

  function homeView() {
    const id = workerId(), extra = overtime(id), company = managerBusiness() || {}, logo = companyLogoUrl(company), companyName = company.company_name || 'Ihr Geschäftskonto';
    const companyBanner = `<section class="home-company-banner"><div class="home-company-logo">${logo ? `<img src="${escape(logo)}" alt="Firmenlogo von ${escape(companyName)}">` : '<span>ZE</span>'}</div><div class="home-company-copy"><span class="eyebrow">Ihr Geschäftskonto</span><h3>${escape(companyName)}</h3><p>${logo ? 'Firmenlogo und Unternehmensprofil' : 'Firmenlogo kann in den Einstellungen hinterlegt werden.'}</p></div></section>`;
    const dayOrders = state.rows.orders.filter(row => orderForEmployee(row,id) && row.work_date === state.date);
    const manualEntries = dayEntries(id).filter(row => !row.work_order_id && !row.team_work_order_id);
    const activityCards = [
      ...dayOrders.map(row => `<article class="row-card"><button type="button" class="row-main" data-action="open-order" data-id="${row.id}"><b>${escape(row.customer_name || 'Ohne Kunde')}</b><span>${escape(row.title || 'Arbeitsschein')} · ${orderEmployeeTimeText(row,id)} · Arbeitsschein öffnen</span></button></article>`),
      ...manualEntries.map(row => `<article class="row-card"><button type="button" class="row-main" data-action="open-time" data-id="${row.id}"><b>${escape(row.customer_name || 'Ohne Kunde')}</b><span>${timeText(row.start_time)} – ${timeText(row.end_time)} · Zeiterfassung öffnen</span></button></article>`)
    ].join('');
    const activities = activityCards ? `<section class="list-section"><h3>Kunden des ausgewählten Tages</h3>${activityCards}</section>` : '';
    return `${companyBanner}<section class="page-head"><div><span class="eyebrow">Willkommen, ${escape(worker()?.username || '')}</span><h2>${dateText(state.date)}</h2></div>${dayPicker()}</section><section class="stat-grid"><article><span>Überstunden ${state.date.slice(0, 4)}</span><strong class="${extra > 0 ? 'positive' : extra < 0 ? 'negative' : ''}">${extra ? h(extra) : '—'}</strong></article><article><span>Urlaub übrig</span><strong>${vacationLeft(id)} Tage</strong></article><article><span>Krankheitstage</span><strong>${annualSick(id)} Tage</strong></article></section><section class="panel"><h3>Ausgewählter Arbeitstag</h3><p>${locked(id) ? lockedText(id) : dayEntries(id).length ? `${h(dayHours(id))} Arbeitszeit erfasst.` : 'Für diesen Tag wurde noch keine Arbeitszeit erfasst.'}</p></section>${activities}`;
  }
  function timeInput(name, value) { return `<input name="${name}" type="time" step="900" value="${value || ''}">`; }
  function customerList() { return `<datalist id="customers">${state.rows.customers.map(row => `<option value="${escape(row.name)}"></option>`).join('')}</datalist>`; }
  function noteTemplates() { return `<div class="actions wide note-templates"><button type="button" class="secondary small" data-action="insert-note-template" data-note="Aufräumen des Firmenfahrzeugs">Aufräumen Firmenfahrzeug</button><button type="button" class="secondary small" data-action="insert-note-template" data-note="Aufräumen des Firmenlagers">Aufräumen Firmenlager</button></div>`; }
  function timeView() {
    const id = workerId(), list = dayEntries(id), previous = list.at(-1)?.end_time?.slice(0, 5) || '07:30';
    const selected = list.find(row => same(row.id, state.timeEntryId));
    const detail = selected ? `<section class="panel"><section class="page-head"><div><span class="eyebrow">Ausgewählte Zeiterfassung</span><h3>${escape(selected.customer_name)}</h3></div><div class="actions"><button type="button" class="danger small" data-action="delete-time" data-id="${selected.id}">Zeiterfassung löschen</button><button type="button" class="secondary small" data-action="close-time">Schließen</button></div></section><p>${timeText(selected.start_time)} – ${timeText(selected.end_time)} · Pause ${h(selected.pause_hours)} · ${h(selected.executed_hours)}</p>${selected.custom_fields?.notes ? `<p><b>Notiz:</b><br>${escape(selected.custom_fields.notes).replace(/\n/g, '<br>')}</p>` : ''}</section>` : '';
    const form = locked(id) ? `<div class="locked">${escape(lockedText(id))}</div>` : `<section class="panel"><h3>Arbeitszeit hinzufügen</h3><form data-form="time" class="entry-form"><label class="wide">Kunde<input name="customer" required list="customers"></label><label>Arbeitsbeginn${timeInput('start', previous)}</label><label>Arbeitsende${timeInput('end', '')}</label><label>Pause in Stunden<input name="pause" type="number" min="0" step="0.25" value="0"></label><label>Ausgeführte Stunden<input name="hours" type="number" min="0.25" step="0.25" required></label>${noteTemplates()}<label class="wide">Notiz<textarea name="notes" rows="4" placeholder="Zusätzliche Informationen zur Arbeitszeit"></textarea></label><button class="primary wide">Speichern</button></form>${customerList()}</section>`;
    const cards = list.map(row => `<article class="row-card"><button type="button" class="row-main" data-action="open-time" data-id="${row.id}"><b>${escape(row.customer_name)}</b><span>${timeText(row.start_time)} – ${timeText(row.end_time)} · ${h(row.executed_hours)} · Öffnen</span>${row.custom_fields?.notes ? `<small>${escape(row.custom_fields.notes)}</small>` : ''}</button><button type="button" class="danger small" data-action="delete-time" data-id="${row.id}">Löschen</button></article>`).join('') || '<p class="empty">Keine Einträge vorhanden.</p>';
    return `<section class="page-head"><div><span class="eyebrow">Zeiterfassung von ${escape(worker()?.username || '')}</span><h2>${dateText(state.date)}</h2></div>${dayPicker()}</section><div data-day-plans>${plannedAssignmentsPanel(id, state.date)}</div>${detail}${form}<section class="list-section"><h3>Einträge des Tages</h3>${cards}</section>`;
  }

  const MATERIAL_UNITS = ['Stk','M','H','Pau','Kg'];
  function normalizeUnit(value,hourly=false) { return ({'stk':'Stk','stk.':'Stk','m':'M','h':'H','pau':'Pau','kg':'Kg'})[lower(value)] || (hourly?'H':'Stk'); }
  const materialUnit = material => normalizeUnit(material?.unit,isHourlyMaterial(material));
  const itemUnit = item => normalizeUnit(item?.unit,isHourlyMaterial(item?.position_name || item?.name));
  function unitSelect(name,value,attributes='') { return `<label>Einheit<select name="${escape(name)}" class="material-unit" ${attributes}>${MATERIAL_UNITS.map(unit=>`<option value="${unit}" ${unit===value?'selected':''}>${unit}</option>`).join('')}</select></label>`; }
  function materialRow(item = {}) { return `<div class="material-row"><label>Material<input name="material" list="materials" value="${escape(item.position_name || item.name || '')}"></label><label>Menge<input name="quantity" type="number" min="0.25" step="0.25" value="${escape(item.quantity || 1)}"></label>${unitSelect('unit',itemUnit(item),`data-material-unit data-unit-explicit="${Boolean(item.id || item.unit)}"`)}</div>`; }
  root.addEventListener('change',event=>{if(event.target.matches('[data-material-unit]'))event.target.dataset.unitExplicit='true';});
  root.addEventListener('input',event=>{
    if(event.target.name!=='material')return;
    const row=event.target.closest('.material-row'),select=row?.querySelector('[data-material-unit]');
    if(!select || select.dataset.unitExplicit==='true')return;
    const material=state.rows.materials.find(item=>same(item.business_id,businessId())&&item.active!==false&&lower(item.name)===lower(event.target.value));
    if(material)select.value=materialUnit(material);
  });
  function materialList() { return `<datalist id="materials">${state.rows.materials.filter(row => row.active !== false).map(row => `<option value="${escape(row.name)}"></option>`).join('')}</datalist>`; }
  function signatureFields(order = {}) {
    const signedBy = String(order.signed_by || ''), signature = String(order.signature_data || ''), hasSignature = signature.startsWith('data:image/png;base64,');
    return `<div class="wide signature-field"><span class="field-label">Unterschrift</span><canvas class="signature-pad" width="960" height="320" data-signature="${escape(signature)}" aria-label="Unterschrift mit Finger oder Maus einzeichnen"></canvas><input type="hidden" name="signature_data" value="${escape(signature)}"><div class="actions"><button type="button" class="secondary small" data-action="clear-signature">Unterschrift löschen</button></div><p class="signature-help">Mit Finger oder Maus im Feld unterschreiben. Die Unterschrift ist zum Speichern erforderlich.</p></div><label class="wide">Unterschrieben von<input name="signed_by" required value="${escape(signedBy)}" placeholder="Name der unterschreibenden Person"></label>`;
  }
  function orderEditor(order) {
    if (!order) return '';
    const items = state.rows.items.filter(item => same(item.work_order_id, order.id) && !isHourlyMaterial(item.position_name));
    const documents = state.rows.documents.filter(document => same(document.work_order_id, order.id));
    const rows = items.length ? items.map(materialRow).join('') : materialRow();
    const invoiceButton = isManager() && !order.invoiced ? `<button type="button" class="primary small" data-action="invoice-order" data-id="${order.id}">Rechnung erstellen</button><button type="button" class="secondary small" data-action="mark-invoice-order" data-id="${order.id}">Als abgerechnet markieren</button>` : order.invoiced ? '<span class="badge">Bereits abgerechnet</span>' : '';
    return `<section class="panel"><div class="page-head"><div><span class="eyebrow">Arbeitsschein bearbeiten</span><h3>${escape(order.customer_name || 'Ohne Kunde')}</h3></div><div class="actions">${invoiceButton}<button type="button" class="secondary small" data-action="order-pdf" data-id="${order.id}">PDF drucken / speichern</button><button type="button" class="danger small" data-action="delete-order" data-id="${order.id}">Arbeitsschein löschen</button><button type="button" class="secondary small" data-action="close-order">Schließen</button></div></div><form data-form="order-edit" class="entry-form"><input type="hidden" name="id" value="${order.id}">${orderDatePicker(order.work_date)}<label class="wide">Kunde<input name="customer" required list="customers" value="${escape(order.customer_name || '')}"></label><label class="wide">Beschreibung<input name="title" value="${escape(order.title || '')}"></label><div class="wide" id="material-lines">${rows}</div><button type="button" class="secondary wide" data-action="more-material">Weiteres Material</button>${teamEnabled() ? '' : `<p class="wide">Arbeitsstunden werden beim Speichern automatisch als <b>${escape(hourlyNameForEmployee(order.employee_id))}</b> mit dem Preis aus der Materialliste ergänzt.</p>`}${teamOrderTimeFields(order.employee_id,orderPeriods(order),`<label>Arbeitsbeginn${timeInput('start', order.start_time?.slice(0, 5))}</label><label>Arbeitsende${timeInput('end', order.end_time?.slice(0, 5))}</label><label>Pause in Stunden<input name="pause" type="number" min="0" step="0.25" value="${n(order.pause_hours)}"></label><label>Ausgeführte Stunden<input name="hours" type="number" min="0.25" step="0.25" value="${n(order.executed_hours)}" required></label>`)}${noteTemplates()}<label class="wide">Notiz / Dokumentation<textarea name="documentation" rows="4">${escape(order.documentation || '')}</textarea></label><label class="wide">Weitere Dokumente hochladen<input name="documents" type="file" multiple accept="image/*,.pdf,.doc,.docx"></label>${documents.length ? `<p class="wide">Vorhandene Dokumente: ${documents.map(document => escape(document.file_name)).join(', ')}</p>` : ''}${signatureFields(order)}<button class="primary wide" data-signature-submit>Änderungen speichern</button></form>${customerList()}${materialList()}</section>`;
  }
  function orderDetailView() { const order = state.rows.orders.find(row => same(row.id, state.orderId)); return order ? orderEditor(order) : `<section class="panel"><h2>Arbeitsschein nicht gefunden</h2><p>Der Arbeitsschein ist nicht mehr verfügbar.</p><button type="button" class="secondary" data-action="close-order">Zurück</button></section>`; }
  function ordersView() {
    const id = workerId(), list = state.rows.orders.filter(row => orderForEmployee(row,id) && row.work_date === state.date);
    const previous = dayEntries(id).at(-1)?.end_time?.slice(0, 5) || '07:30';
    const selected = list.find(row => same(row.id, state.orderId));
    const newOrder = locked(id) ? `<div class="locked">${escape(lockedText(id))}</div>` : `<section class="panel"><h3>Neuer Arbeitsschein</h3><form data-form="order" class="entry-form"><label class="wide">Kunde<input name="customer" required list="customers" value="${escape(state.orderCustomer || '')}"></label><label class="wide">Beschreibung<input name="title" placeholder="Ausgeführte Arbeiten"></label><div class="wide" id="material-lines">${materialRow()}</div><button type="button" class="secondary wide" data-action="more-material">Weiteres Material</button><p class="wide">Arbeitsstunden werden beim Speichern automatisch als <b>${escape(hourlyNameForEmployee(id))}</b> mit dem Preis aus der Materialliste ergänzt.</p><label>Arbeitsbeginn${timeInput('start', previous)}</label><label>Arbeitsende${timeInput('end', '')}</label><label>Pause in Stunden<input name="pause" type="number" min="0" step="0.25" value="0"></label><label>Ausgeführte Stunden<input name="hours" type="number" min="0.25" step="0.25" required></label>${noteTemplates()}<label class="wide">Notiz / Dokumentation<textarea name="documentation" rows="4"></textarea></label><label class="wide">Dokumente hochladen<input name="documents" type="file" multiple accept="image/*,.pdf,.doc,.docx"></label>${signatureFields()}<button class="primary wide" data-signature-submit>Arbeitsschein speichern</button></form>${customerList()}${materialList()}</section>`;
    return `<section class="page-head"><div><span class="eyebrow">Arbeitsscheine von ${escape(worker()?.username || '')}</span><h2>${dateText(state.date)}</h2></div>${dayPicker()}</section>${selected ? orderEditor(selected) : newOrder}<section class="list-section"><h3>Arbeitsscheine des ausgewählten Tages</h3>${list.map(row => `<article class="row-card"><button type="button" class="row-main" data-action="open-order" data-id="${row.id}"><b>${escape(row.customer_name || 'Ohne Kunde')}</b><span>${dateText(row.work_date)} · ${escape(row.title || '')} · ${orderEmployeeTimeText(row,id)} · ${h(orderHours(row,id))} · Öffnen</span></button><button type="button" class="danger small" data-action="delete-order" data-id="${row.id}">Löschen</button></article>`).join('') || '<p class="empty">Keine Arbeitsscheine für diesen Tag vorhanden.</p>'}</section>`;
  }

  function monthDays() {
    const start = new Date(`${state.month}-01T12:00:00`), first = new Date(start); first.setDate(1 - ((start.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, index) => { const value = new Date(first); value.setDate(first.getDate() + index); return value.toISOString().slice(0, 10); });
  }
  function calendarView() {
    const id = workerId();
    const grid = monthDays().map(date => {
      const holiday = nrwHoliday(date), isSick = sick(id, date), isApproved = Boolean(vacation(id, date));
      const isRequested = state.rows.vacations.some(row => same(row.employee_id, id) && row.status === 'requested' && row.start_date <= date && row.end_date >= date);
      const hasOrder = state.rows.orders.some(row => orderForEmployee(row,id) && row.work_date === date);
      const classes = ['month-day', date.slice(0, 7) === state.month ? '' : 'outside', date === state.date ? 'selected' : '', holiday ? 'holiday' : '', isSick ? 'sick' : '', isApproved ? 'approved' : '', isRequested ? 'requested' : '', hasOrder ? 'has-order' : ''].join(' ');
      const flags = `${holiday ? `<i class="flag-holiday">${escape(holiday)}</i>` : ''}${isSick ? '<i class="flag-sick">Krank</i>' : ''}${isApproved ? '<i class="flag-approved">Urlaub</i>' : ''}${isRequested ? '<i class="flag-requested">Beantragt</i>' : ''}${hasOrder ? '<i class="flag-order">Arbeitsschein</i>' : ''}`;
      const label = [dateText(date), holiday ? `${holiday} in NRW` : '', isSick ? 'Krankheitstag' : '', isApproved ? 'Urlaub genehmigt' : '', isRequested ? 'Urlaub beantragt' : '', hasOrder ? 'Arbeitsschein vorhanden' : ''].filter(Boolean).join(', ');
      return `<button type="button" class="${classes}" data-action="pick-day" data-date="${date}" aria-label="${escape(label)}"><b>${Number(date.slice(-2))}</b><span class="day-flags">${flags}</span></button>`;
    }).join('');
    const records = state.rows.orders.filter(row => orderForEmployee(row,id) && row.work_date === state.date);
    const manualEntries = dayEntries(id).filter(row => !row.work_order_id && !row.team_work_order_id);
    const recordCards = [
      ...records.map(row => `<article class="row-card"><button type="button" class="row-main" data-action="open-order" data-id="${row.id}"><b>${escape(row.customer_name)}</b><span>${escape(row.title || '')} · ${h(orderHours(row,id))} · Arbeitsschein öffnen</span></button></article>`),
      ...manualEntries.map(row => `<article class="row-card"><button type="button" class="row-main" data-action="open-time" data-id="${row.id}"><b>${escape(row.customer_name)}</b><span>${timeText(row.start_time)} – ${timeText(row.end_time)} · ${h(row.executed_hours)} · Zeiterfassung öffnen</span></button></article>`)
    ].join('') || '<p class="empty">Für diesen Tag existiert kein Arbeitsschein oder keine Zeiterfassung.</p>';
    return `<section class="page-head"><div><span class="eyebrow">Kalender von ${escape(worker()?.username || '')}</span><h2>${dateText(state.date)}</h2></div><label class="date-field">Tag<input type="date" data-date value="${state.date}"></label></section><section class="stat-grid"><article><span>Überstunden</span><strong>${dayEntries(id).length ? h(dayHours(id) - dueHours(state.date)) : '—'}</strong></article><article><span>Urlaub</span><strong>${vacation(id) ? 'Genehmigt' : '—'}</strong></article><article><span>Krank</span><strong>${sick(id) ? 'Ja' : '—'}</strong></article></section><section class="panel calendar-panel"><div class="calendar-head"><button type="button" aria-label="Vorheriger Monat" data-action="month" data-value="-1">‹</button><h3>${monthText(state.month)}</h3><button type="button" aria-label="Nächster Monat" data-action="month" data-value="1">›</button></div><div class="calendar-legend"><span class="legend-order">Arbeitsschein</span><span class="legend-requested">Urlaub beantragt</span><span class="legend-approved">Urlaub genehmigt</span><span class="legend-sick">Krankheitstag</span><span class="legend-holiday">Feiertag NRW</span></div><div class="month-grid"><span class="weekday">Mo</span><span class="weekday">Di</span><span class="weekday">Mi</span><span class="weekday">Do</span><span class="weekday">Fr</span><span class="weekday">Sa</span><span class="weekday">So</span>${grid}</div><div class="actions"><button type="button" class="secondary" data-action="sick">${sick(id) ? 'Krankheitstag entfernen' : 'Krank melden'}</button><button type="button" class="primary" data-action="vacation-form">Urlaub beantragen</button></div></section>${state.vacationForm ? `<section class="panel"><h3>Urlaub beantragen</h3><form data-form="vacation" class="entry-form"><label>Von<input name="start" type="date" required value="${state.date}"></label><label>Bis<input name="end" type="date" required value="${state.date}"></label><button class="primary">Antrag senden</button></form></section>` : ''}<section class="list-section"><h3>Durchgeführt</h3>${nrwHoliday(state.date) ? `<p class="locked">${escape(nrwHoliday(state.date))} in NRW</p>` : ''}${recordCards}</section>`;
  }

  function customerFields(customer) { const fields = customer?.custom_fields || {}; return `<input type="hidden" name="id" value="${customer?.id || ''}"><label>Firmenname<input name="name" required value="${escape(customer?.name || '')}"></label><label>Vorname<input name="first_name" value="${escape(fields.first_name || '')}"></label><label>Straße<input name="street" value="${escape(fields.street || '')}"></label><label>Hausnummer<input name="house_no" value="${escape(fields.house_no || '')}"></label><label>Ort<input name="city" value="${escape(fields.city || '')}"></label><label>Postleitzahl<input name="postal_code" value="${escape(fields.postal_code || '')}"></label><label>Telefon privat<input name="phone_private" value="${escape(fields.phone_private || '')}"></label><label>Telefon mobil<input name="phone_mobile" value="${escape(fields.phone_mobile || '')}"></label><label class="wide">E-Mail-Adresse<input name="email" type="email" value="${escape(fields.email || '')}"></label><label class="wide">Zusätzliche Angaben (eine Zeile je Feld)<textarea name="extra" rows="3">${escape(Object.entries(fields).filter(([name]) => name.startsWith('extra_')).map(([, value]) => value).join('\n'))}</textarea></label>`; }
  function customerSearchKey(value) { return lower(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll('ß', 'ss'); }
  function customerSearchText(customer) { return customerSearchKey([customer?.name || '', ...Object.values(customer?.custom_fields || {})].join(' ')); }
  function setupCustomerSearch() {
    const input = root?.querySelector('[data-customer-search]');
    if (!input || input.dataset.ready === 'true') return;
    input.dataset.ready = 'true';
    const update = () => {
      state.customerSearch = input.value;
      const query = customerSearchKey(input.value), cards = [...root.querySelectorAll('[data-customer-search-item]')];
      let matches = 0;
      cards.forEach(card => {
        const visible = !query || String(card.dataset.customerSearch || '').includes(query);
        card.style.display = visible ? '' : 'none';
        card.setAttribute('aria-hidden', visible ? 'false' : 'true');
        if (visible) matches += 1;
      });
      const empty = root.querySelector('[data-customer-search-empty]');
      if (empty) empty.style.display = query && matches === 0 ? 'block' : 'none';
    };
    input.addEventListener('input', update);
    input.addEventListener('search', update);
    update();
  }

  function customersView() {
    const selected = state.rows.customers.find(row => same(row.id, state.customerId));
    const list = state.rows.customers.map(row => {
      const total = effectiveTimeEntries().filter(entry => same(entry.customer_id, row.id)).reduce((sum, entry) => sum + n(entry.executed_hours), 0);
      const removeButton = isManager() ? '<button type="button" class="danger small" data-action="delete-customer" data-id="' + escape(row.id) + '">Löschen</button>' : '';
      return '<article class="row-card" data-customer-search-item data-customer-search="' + escape(customerSearchText(row)) + '"><button type="button" class="row-main" data-action="customer" data-id="' + escape(row.id) + '"><b>' + escape(row.name) + '</b><span>' + h(total) + ' gesamt</span></button>' + removeButton + '</article>';
    }).join('') || '<p class="empty">Noch keine Kunden angelegt.</p>';
    const edit = selected || state.customerId === 'new'
      ? '<section class="panel" id="customer-profile" tabindex="-1"><h3>' + (selected ? 'Kunde bearbeiten' : 'Neuer Kunde') + '</h3><form data-form="customer" class="entry-form">' + customerFields(selected) + '<button class="primary wide">Kunde speichern</button></form>' + (selected ? '<button type="button" class="secondary wide" data-action="create-order-from-customer" data-id="' + escape(selected.id) + '">Arbeitsschein erstellen</button>' : '') + '</section>'
      : '';
    return '<section class="page-head"><div><span class="eyebrow">Gemeinsame Daten</span><h2>Kundenliste</h2></div><button type="button" class="secondary" data-action="new-customer">Kunde hinzufügen</button></section>' + edit + '<section class="list-section"><label>Kunden suchen<input type="search" data-customer-search value="' + escape(state.customerSearch) + '" placeholder="Name, Ort, Adresse, Telefon oder E-Mail"></label><p class="empty" data-customer-search-empty style="display:none">Kein passender Kunde gefunden.</p>' + list + '</section>';
  }
  function messageRecipients() { return state.rows.recipients || []; }
  function personName(person) { return person?.display_name || person?.username || 'Unbekannt'; }
  function personRole(person) { return person?.role === 'administrator' ? 'Administrator' : person?.role === 'business' ? 'Geschäftskonto' : 'Mitarbeiter'; }
  function mailboxView() {
    const ownId = state.profile?.id || '', recipients = messageRecipients(), all = state.rows.messages || [];
    const folders = [
      { key: 'sent', label: 'Gesendet', test: message => !message.deleted_at && same(message.sender_id, ownId) },
      { key: 'received', label: 'Empfangen', test: message => !message.deleted_at && same(message.recipient_id, ownId) },
      { key: 'trash', label: 'Papierkorb', test: message => Boolean(message.deleted_at) && same(message.recipient_id, ownId) },
      { key: 'unread', label: 'Ungelesen', test: message => !message.deleted_at && same(message.recipient_id, ownId) && !message.read_at },
      { key: 'read', label: 'Gelesen', test: message => !message.deleted_at && same(message.recipient_id, ownId) && Boolean(message.read_at) }
    ];
    const active = folders.find(folder => folder.key === state.mailboxFolder) || folders[1];
    const messages = all.filter(active.test);
    const tabs = `<div class="actions mailbox-folders">${folders.map(folder => `<button type="button" class="${folder.key === active.key ? 'primary' : 'secondary'} small" data-action="mailbox-folder" data-folder="${folder.key}">${folder.label} (${all.filter(folder.test).length})</button>`).join('')}</div>`;
    const payroll = isManager() ? '<button type="button" class="secondary" data-action="payslip-template">Lohnabrechnung</button>' : '';
    const compose = state.composeMessage ? `<section class="panel"><section class="page-head"><div><span class="eyebrow">Neue Nachricht</span><h3>Nachricht schreiben</h3></div><button type="button" class="secondary small" data-action="compose-message">Schließen</button></section>${recipients.length ? `<form data-form="message-send" class="entry-form"><label class="wide">Empfänger<select name="recipient" required><option value="">Bitte auswählen</option>${recipients.map(person => `<option value="${person.id}">${escape(personName(person))} · ${personRole(person)}</option>`).join('')}</select></label><div class="actions wide">${payroll}</div><label class="wide">Betreff<input name="title" maxlength="160" required></label><label class="wide">Nachricht<textarea name="message" rows="6" maxlength="10000" required></textarea></label><label class="wide">Anhänge (PDF, Bilder, Office-Dateien usw.; max. 25 MB je Datei)<input name="attachments" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.txt,.csv,.doc,.docx,.xls,.xlsx"></label><button class="primary wide">Nachricht senden</button></form>` : '<p class="empty">Es ist kein zulässiger Empfänger verfügbar.</p>'}</section>` : '';
    const cards = messages.map(message => {
      const body = message.body || {}, sender = state.rows.people.find(person => same(person.id, message.sender_id)), recipient = state.rows.people.find(person => same(person.id, message.recipient_id)), attachments = state.rows.attachments.filter(attachment => same(attachment.message_id, message.id));
      const decision = message.message_type === 'vacation_request' && isManager() && !message.deleted_at ? `<div class="actions"><button type="button" class="primary small" data-action="vacation-decision" data-id="${message.id}" data-request="${escape(body.request_id || '')}" data-status="approved">Genehmigen</button><button type="button" class="secondary small" data-action="vacation-decision" data-id="${message.id}" data-request="${escape(body.request_id || '')}" data-status="rejected">Ablehnen</button></div>` : '';
      const files = attachments.length ? `<div class="message-actions">${attachments.map(attachment => `<button type="button" class="secondary small" data-action="download-mail-attachment" data-id="${attachment.id}">Anhang: ${escape(attachment.file_name)}</button>`).join('')}</div>` : '';
      const received = same(message.recipient_id, ownId), sent = same(message.sender_id, ownId), canDelete = !message.deleted_at && (isAdmin() || received), canRestore = Boolean(message.deleted_at) && (isAdmin() || received);
      const party = sent ? `<p><b>An:</b> ${escape(personName(recipient))}</p>` : message.sender_id ? `<p><b>Von:</b> ${escape(body.sender_name || personName(sender))}</p>` : '';
      return `<article class="message ${message.read_at ? 'read' : 'unread'}"><header><b>${escape(message.title)}</b><time>${new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(message.created_at))}</time></header>${party}<p>${escape(body.message || body.note || (body.start_date ? `${dateText(body.start_date)} bis ${dateText(body.end_date)}` : ''))}</p>${files}${decision}<div class="message-actions">${!message.read_at && received && !message.deleted_at ? `<button type="button" data-action="read" data-id="${message.id}">Als gelesen markieren</button>` : ''}${canDelete ? `<button type="button" data-action="trash" data-id="${message.id}">Löschen</button>` : ''}${canRestore ? `<button type="button" data-action="restore-mail" data-id="${message.id}">Wiederherstellen</button>` : ''}</div></article>`;
    }).join('') || `<p class="empty">Keine Nachrichten in „${active.label}“ vorhanden.</p>`;
    return `<section class="page-head"><div><span class="eyebrow">Persönlich</span><h2>Postfach</h2></div><button type="button" class="primary" data-action="compose-message">Neue Nachricht</button></section>${tabs}${compose}<section class="message-list">${cards}</section>`;
  }

  function materialEditFields(material) {
    return '<input type="hidden" name="id" value="' + escape(material.id) + '"><label>Artikel<input name="name" required value="' + escape(material.name) + '"></label><label>Preis in €<input name="price" type="number" min="0" step="0.01" value="' + n(material.unit_price) + '"></label>' + unitSelect('unit',materialUnit(material));
  }
  function materialsView() {
    const materials = state.rows.materials.filter(row => same(row.business_id, businessId()) && row.active !== false);
    const others = materials.filter(row => !isHourlyMaterial(row));
    const selected = others.find(row => same(row.id, state.materialId));
    const hourlyCards = HOURLY_MATERIALS.map(name => materials.find(row => lower(row.name) === lower(name))).filter(Boolean).map(material => '<section class="panel"><h3>' + escape(material.name) + '</h3><p>Wird nach der in den Einstellungen hinterlegten Arbeitskraft des Mitarbeiters automatisch in den Arbeitsschein übernommen. Die Position kann nicht gelöscht oder umbenannt werden.</p><form data-form="hourly-price" class="entry-form"><input type="hidden" name="id" value="' + escape(material.id) + '"><label>Preis pro ' + escape(material.name) + ' in €<input name="price" type="number" min="0" step="0.01" value="' + n(material.unit_price) + '"></label>' + unitSelect('unit',materialUnit(material)) + '<button class="primary">Preis speichern</button></form></section>').join('');
    const list = others.map(row => '<article class="row-card"><div><b>' + escape(row.name) + '</b><span>' + n(row.unit_price).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }) + ' / ' + escape(materialUnit(row)) + '</span></div><div class="actions"><button type="button" class="secondary small" data-action="edit-material" data-id="' + escape(row.id) + '">Bearbeiten</button><button type="button" class="danger small" data-action="delete-material" data-id="' + escape(row.id) + '">Löschen</button></div></article>').join('') || '<p class="empty">Keine weiteren Materialien vorhanden.</p>';
    const editor = selected
      ? '<section class="panel"><section class="page-head"><div><span class="eyebrow">Materialliste</span><h3>Material bearbeiten</h3></div><button type="button" class="secondary small" data-action="close-material-edit">Abbrechen</button></section><form data-form="material-edit" class="entry-form">' + materialEditFields(selected) + '<button class="primary wide">Änderungen speichern</button></form><p>Preis- und Namensänderungen werden nur auf offene, noch nicht abgerechnete Arbeitsscheine übertragen.</p></section>'
      : '';
    return '<section class="page-head"><div><span class="eyebrow">Material</span><h2>Materialliste</h2></div></section>' + hourlyCards + '<section class="panel"><h3>Neues Material</h3><form data-form="material" class="entry-form"><label>Artikel<input name="name" required></label><label>Preis in €<input name="price" type="number" min="0" step="0.01" value="0"></label>' + unitSelect('unit','Stk') + '<button class="primary">Artikel speichern</button></form></section><section class="list-section"><h3>Vorhandene Materialien</h3>' + list + '</section>' + editor;
  }
  function orderInCurrentBusiness(order) { return same(state.rows.people.find(person => same(person.id, order.employee_id))?.business_id, businessId()); }
  function invoiceGroups(invoiced) {
    const groups = {};
    state.rows.orders.filter(row => orderInCurrentBusiness(row) && Boolean(row.invoiced) === invoiced).forEach(row => { const key = row.customer_id || `name:${lower(row.customer_name || 'Ohne Kunde')}`; (groups[key] ||= { key, customerName: row.customer_name || 'Ohne Kunde', orders: [] }).orders.push(row); });
    return Object.values(groups).map(group => ({ ...group, hours: group.orders.reduce((sum, row) => sum + n(row.executed_hours), 0) })).sort((a, b) => String(a.customerName).localeCompare(String(b.customerName), 'de'));
  }
  function billingListView(invoiced) {
    const groups = invoiceGroups(invoiced), title = invoiced ? 'Abgerechnete Arbeitsscheine' : 'Abrechnungen Kunden';
    const empty = invoiced ? 'Noch keine Arbeitsscheine abgerechnet.' : 'Alle Arbeitsscheine sind abgerechnet.';
    return `<section class="page-head"><div><span class="eyebrow">Abrechnung</span><h2>${title}</h2></div></section><section class="list-section">${groups.map(group => `<article class="row-card"><button type="button" class="row-main" data-action="open-billing" data-key="${escape(group.key)}" data-mode="${invoiced ? 'paid' : 'open'}"><b>${escape(group.customerName)}</b><span>${group.orders.length} ${invoiced ? 'abgerechnete' : 'offene'} Arbeitsscheine · ${h(group.hours)} · Zusammengefasst öffnen</span></button></article>`).join('') || `<p class="empty">${empty}</p>`}</section>`;
  }
  function invoicesView() { return billingListView(false); }
  function paidInvoicesView() { const orders = state.rows.orders.filter(row => orderInCurrentBusiness(row) && Boolean(row.invoiced)).sort((a, b) => String(b.work_date).localeCompare(String(a.work_date))); return `<section class="page-head"><div><span class="eyebrow">Abrechnung</span><h2>Abgerechnete Arbeitsscheine</h2></div></section><section class="list-section">${orders.map(row => `<article class="row-card"><button type="button" class="row-main" data-action="open-order" data-id="${row.id}"><b>${escape(row.customer_name || 'Ohne Kunde')}</b><span>${dateText(row.work_date)} · ${escape(row.title || 'Arbeitsschein')} · ${h(row.executed_hours)} · Öffnen</span></button></article>`).join('') || '<p class="empty">Noch keine Arbeitsscheine abgerechnet.</p>'}</section>`; }
  function billingDetailView() {
    const invoiced = state.billingMode === 'paid', group = invoiceGroups(invoiced).find(item => same(item.key, state.billingKey));
    if (!group) return `<section class="panel"><h2>Abrechnung nicht gefunden</h2><button type="button" class="secondary" data-action="close-billing">Zurück</button></section>`;
    const total = group.orders.reduce((sum, row) => sum + n(row.executed_hours), 0);
    const combinedDetails = group.orders.map(row => { const materials = state.rows.items.filter(item => same(item.work_order_id, row.id)); return `<div class="row-card"><div><b>${dateText(row.work_date)} · ${escape(row.title || 'Arbeitsschein')}</b><span>${timeText(row.start_time)} – ${timeText(row.end_time)} · Pause ${h(row.pause_hours)} · ${h(row.executed_hours)}</span>${row.documentation ? `<p>${escape(row.documentation)}</p>` : ''}${materials.length ? `<p><b>Material:</b> ${materials.map(item => `${escape(item.position_name)} (${n(item.quantity).toLocaleString('de-DE')} ${escape(itemUnit(item))})`).join(', ')}</p>` : ''}</div></div>`; }).join('');
    return `<section class="page-head"><div><span class="eyebrow">${invoiced ? 'Bereits abgerechnet' : 'Ein gemeinsamer offener Arbeitsschein'}</span><h2>${escape(group.customerName)}</h2><p>${group.orders.length} zusammengefügte Einträge · ${h(total)}</p></div><div class="actions">${invoiced ? '' : '<button type="button" class="primary" data-action="invoice-group">Rechnung erstellen</button><button type="button" class="secondary" data-action="mark-invoice-group">Als abgerechnet markieren</button>'}<button type="button" class="secondary" data-action="billing-pdf">Arbeitsnachweis als PDF</button><button type="button" class="secondary" data-action="close-billing">Zurück</button></div></section><section class="panel"><h3>Gesamter Arbeitsschein</h3>${combinedDetails}</section>`;
  }

  function permissionFields(person) { return [['time','Zeiterfassung'],['customers','Kunden'],['orders','Arbeitsscheine'],['calendar','Kalender']].map(([id, title]) => `<label><input type="checkbox" name="perm-${id}" ${person?.menu_permissions?.[id] !== false ? 'checked' : ''}> ${title}</label>`).join(''); }
  function settingsView() {
    if (!isManager()) return `<section class="page-head"><div><span class="eyebrow">Mein Konto</span><h2>Einstellungen</h2></div></section><section class="panel"><p>Benutzername und Passwort werden durch die Geschäftsverwaltung festgelegt.</p><button type="button" class="secondary" data-action="pdf">Daten als PDF drucken</button></section>`;
    const person = worker(), business = managerBusiness();
    const own = `<section class="panel"><h3>Mein Benutzerkonto</h3><form data-form="self" class="entry-form"><label>Benutzername<input name="username" value="${escape(state.profile.username)}"></label><label>Neues Passwort<input name="password" type="password" minlength="8" placeholder="Nur bei Änderung"></label><label>Urlaubsanspruch pro Jahr<input name="allowance" type="number" min="0" step="0.5" value="${n(state.profile.vacation_allowance)}"></label>${isBusiness() ? `<label>Firma<input name="company" value="${escape(state.profile.company_name || '')}"></label>` : ''}<button class="primary">Eigenes Konto speichern</button></form></section>`;
    const logo = business ? `<section class="panel"><h3>Firmenlogo${isAdmin() ? `: ${escape(business.company_name || business.username)}` : ''}</h3><p>Das Logo erscheint auf neu erstellten Rechnungen dieses Geschäftskontos.</p>${companyLogoUrl(business) ? `<img src="${escape(companyLogoUrl(business))}" alt="Firmenlogo" style="max-width:220px;max-height:100px;object-fit:contain;display:block;margin:12px 0">` : '<p class="empty">Noch kein Firmenlogo hinterlegt.</p>'}<form data-form="company-logo" class="entry-form"><label class="wide">Logo-Datei (PNG, JPG oder WebP, max. 5 MB)<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required></label><button class="secondary">Logo speichern</button>${companyLogoUrl(business) ? '<button type="button" class="danger" data-action="remove-company-logo">Logo entfernen</button>' : ''}</form></section>` : '';
    const employee = person?.role === 'employee' ? `<section class="panel"><h3>Mitarbeiter bearbeiten: ${escape(person.username)}</h3><form data-form="employee-credentials" class="entry-form"><label>Benutzername<input name="username" value="${escape(person.username)}"></label><label>Neues Passwort<input name="password" type="password" minlength="8" placeholder="Nur bei Änderung"></label><button class="secondary">Benutzername und Passwort speichern</button></form><form data-form="employee-labor-type" class="entry-form"><label>Arbeitskraft<select name="labor_type"><option value="monteur" ${person.labor_type === 'monteur' ? 'selected' : ''}>Monteur</option><option value="meister" ${person.labor_type === 'meister' ? 'selected' : ''}>Meister</option><option value="aushilfe" ${person.labor_type === 'aushilfe' ? 'selected' : ''}>Aushilfe</option></select></label><button class="secondary">Arbeitskraft speichern</button></form><form data-form="employee-permissions" class="entry-form"><div class="wide permissions">${permissionFields(person)}</div><button class="secondary wide">Menüfreigaben speichern</button></form><form data-form="employee-vacation" class="entry-form"><label>Urlaubsanspruch pro Jahr<input name="allowance" type="number" min="0" step="0.5" value="${n(person.vacation_allowance)}"></label><button class="secondary">Urlaubsanspruch speichern</button></form><div class="actions"><button type="button" class="danger" data-action="delete-employee" data-id="${person.id}">Mitarbeiter löschen</button></div></section>` : '<section class="panel"><p>Bitte einen Mitarbeiter in der Auswahl oben auswählen.</p></section>';
    const newEmployee = businessId() ? `<section class="panel"><h3>Mitarbeiter hinzufügen</h3><form data-form="employee-new" class="entry-form"><label>Benutzername<input name="username" required></label><label>Passwort<input name="password" type="password" minlength="8" required></label><label>Arbeitskraft<select name="labor_type"><option value="monteur">Monteur</option><option value="meister">Meister</option><option value="aushilfe">Aushilfe</option></select></label><label>Urlaubsanspruch pro Jahr<input name="allowance" type="number" min="0" step="0.5" value="30"></label><div class="wide permissions">${permissionFields({})}</div><button class="primary wide">Mitarbeiter anlegen</button></form></section>` : '';
    const newBusiness = isAdmin() ? `<section class="panel"><h3>Neues Geschäftskonto</h3><form data-form="business-new" class="entry-form"><label>Firma<input name="company" required></label><label>Benutzername<input name="username" required></label><label>Passwort<input name="password" type="password" minlength="8" required></label><button class="primary">Geschäftskonto anlegen</button></form></section>${business ? `<section class="panel"><h3>Ausgewähltes Geschäftskonto</h3><form data-form="business-update" class="entry-form"><label>Firma<input name="company" value="${escape(business.company_name || '')}"></label><label>Benutzername<input name="username" value="${escape(business.username)}"></label><label>Neues Passwort<input name="password" type="password" minlength="8" placeholder="Nur bei Änderung"></label><button class="secondary">Geschäftskonto speichern</button></form><button type="button" class="danger" data-action="delete-business" data-id="${business.id}">Geschäftskonto löschen</button></section>` : ''}` : '';
    return `<section class="page-head"><div><span class="eyebrow">Verwaltung</span><h2>Einstellungen</h2></div><button type="button" class="secondary" data-action="pdf">Daten als PDF drucken</button></section>${own}${newBusiness}${logo}${newEmployee}${employee}`;
  }

  function roundTime(value) { if (!value) return ''; const [hour, minute] = String(value).slice(0, 5).split(':').map(Number); const all = Math.max(0, Math.min(1439, Math.round((hour * 60 + minute) / 15) * 15)); return `${String(Math.floor(all / 60)).padStart(2, '0')}:${String(all % 60).padStart(2, '0')}`; }
  function toMinutes(value) { const [hour, minute] = String(value || '00:00').slice(0, 5).split(':').map(Number); return hour * 60 + minute; }
  function timeValues(form) {
    const hours = Math.max(0.25, Math.round(n(form.elements.hours.value) * 4) / 4);
    const pause = Math.max(0, Math.round(n(form.elements.pause.value) * 4) / 4);
    const start = roundTime(form.elements.start.value);
    let end = roundTime(form.elements.end.value);
    if (!start) throw new Error('Bitte einen Arbeitsbeginn auswählen.');
    if (!end) end = roundTime(`${String(Math.floor((toMinutes(start) + Math.round((hours + pause) * 60)) / 60) % 24).padStart(2, '0')}:${String((toMinutes(start) + Math.round((hours + pause) * 60)) % 60).padStart(2, '0')}`);
    return { start, end, hours, pause };
  }
  function normalized(value) { return lower(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function editDistance(a, b) { const left = String(a), right = String(b), row = Array.from({ length: right.length + 1 }, (_, index) => index); for (let i = 1; i <= left.length; i++) { let previous = row[0]; row[0] = i; for (let j = 1; j <= right.length; j++) { const saved = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1)); previous = saved; } } return row[right.length]; }
  function similarityScore(value, candidate) {
    const query = normalized(value), name = normalized(candidate); if (!query || !name) return 0; if (query === name) return 1;
    if (name.includes(query) || query.includes(name)) return 0.94 - Math.min(0.12, Math.abs(name.length - query.length) / 100);
    const queryTokens = query.split(' '), nameTokens = name.split(' '), shared = queryTokens.filter(token => nameTokens.some(part => part.startsWith(token) || token.startsWith(part))).length;
    const tokenScore = shared / Math.max(queryTokens.length, nameTokens.length);
    const distanceScore = 1 - editDistance(query, name) / Math.max(query.length, name.length);
    return Math.max(tokenScore * 0.85, distanceScore);
  }
  function chooseSimilar(value, records, label) {
    const suggestions = records.map(record => ({ record, score: similarityScore(value, record.name) })).filter(item => item.score >= 0.48).sort((a, b) => b.score - a.score || String(a.record.name).localeCompare(String(b.record.name), 'de')).slice(0, 3);
    if (!suggestions.length) return null;
    const choices = suggestions.map((item, index) => `${index + 1} – ${item.record.name}`).join('\n');
    const answer = window.prompt(`„${value}“ ist noch nicht vorhanden.\n\nMeinten Sie vielleicht:\n${choices}\n\n0 – neuen ${label} anlegen\n\nBitte die Nummer auswählen.`, '1');
    if (answer === null) throw new Error('Die Auswahl wurde abgebrochen.');
    const index = Number(String(answer).trim());
    if (Number.isInteger(index) && index >= 1 && index <= suggestions.length) return suggestions[index - 1].record;
    if (index === 0) return null;
    throw new Error('Bitte eine der vorgeschlagenen Nummern oder 0 auswählen.');
  }
  function rememberCatalogRow(table, result, label) {
    const row = result?.[0];
    if (!row?.id) throw new Error(`${label} konnte nicht im Firmenstamm gespeichert werden. Bitte erneut versuchen.`);
    state.rows[table] = [row, ...state.rows[table].filter(existing => !same(existing.id, row.id))];
    return row;
  }
  async function ensureCustomer(value, employee, candidates = planningCustomers(employee)) {
    const name = String(value || '').trim(); if (!name) throw new Error('Bitte einen Kunden eingeben.');
    const current = candidates.find(row => lower(row.name) === lower(name));
    if (current) return current;
    const selected = chooseSimilar(name, candidates, 'Kunden'); if (selected) return selected;
    const created = await write('customers', { employee_id: employee, name, custom_fields: {} });
    return rememberCatalogRow('customers', created, 'Der Kunde');
  }
  const HOURLY_MATERIALS = ['Monteurstunde', 'Meisterstunde', 'Aushilfsstunde'];
  const LABOR_TYPES = { monteur: 'Monteurstunde', meister: 'Meisterstunde', aushilfe: 'Aushilfsstunde' };
  function laborTypeForEmployee(employeeId) {
    const type = lower(state.rows.people.find(person => same(person.id, employeeId))?.labor_type);
    return Object.prototype.hasOwnProperty.call(LABOR_TYPES, type) ? type : 'monteur';
  }
  function hourlyNameForEmployee(employeeId) { return LABOR_TYPES[laborTypeForEmployee(employeeId)]; }
  function hourlyName(value) {
    const normalized = lower(typeof value === 'string' ? value : value?.name);
    if (normalized === 'meisterstunde' || normalized === 'meister') return 'Meisterstunde';
    if (normalized === 'aushilfsstunde' || normalized === 'aushilfe') return 'Aushilfsstunde';
    return 'Monteurstunde';
  }
  function isHourlyMaterial(material) { return HOURLY_MATERIALS.some(name => lower(name) === lower(typeof material === 'string' ? material : material?.name)); }
  function materialBusinessId(employeeId) { return state.rows.people.find(person => same(person.id, employeeId))?.business_id || businessId(); }
  async function ensureHourlyMaterial(value, targetBusinessId = businessId()) {
    const name = hourlyName(value);
    const current = state.rows.materials.find(row => same(row.business_id, targetBusinessId) && lower(row.name) === lower(name));
    if (current) return current;
    const created = await write('materials', { business_id: targetBusinessId, name, unit_price: 0, active: true });
    return rememberCatalogRow('materials', created, 'Die Stundenposition');
  }
  async function ensureMaterial(value, targetBusinessId = businessId(), unit = 'Stk') {
    const name = String(value || '').trim(); if (!name) return null;
    const current = state.rows.materials.find(row => same(row.business_id, targetBusinessId) && lower(row.name) === lower(name));
    if (current) return current;
    const selected = chooseSimilar(name, state.rows.materials.filter(row => same(row.business_id, targetBusinessId) && row.active !== false), 'Artikel'); if (selected) return selected;
    const created = await write('materials', { business_id: targetBusinessId, name, unit_price: 0, unit: normalizeUnit(unit), active: true });
    return rememberCatalogRow('materials', created, 'Der Artikel');
  }
  async function saveMaterials(form, order, replace = false) {
    const targetBusinessId = materialBusinessId(order.employee_id);
    const materials = [...form.querySelectorAll('[name="material"]')], quantities = [...form.querySelectorAll('[name="quantity"]')], units = [...form.querySelectorAll('[name="unit"]')];
    const resolved = []; for (let index = 0; index < materials.length; index++) { const material = await ensureMaterial(materials[index].value, targetBusinessId, units[index]?.value); if (material && !isHourlyMaterial(material)) resolved.push({ material, quantity: Math.max(0.25, n(quantities[index]?.value || 1)), unit: units[index]?.dataset.unitExplicit==='true' ? normalizeUnit(units[index].value) : materialUnit(material) }); }
    if (replace) await remove('work_order_items', `work_order_id=eq.${encodeURIComponent(order.id)}`);
    for (const item of resolved) await write('work_order_items', { work_order_id: order.id, material_id: item.material.id, position_name: item.material.name, quantity: item.quantity, unit: item.unit, unit_price: n(item.material.unit_price) });
  }
  async function saveHourlyMaterial(order, hours) {
    const name = hourlyNameForEmployee(order.employee_id);
    const material = await ensureHourlyMaterial(name, materialBusinessId(order.employee_id));
    if (!material?.id) throw new Error('Die Stundenposition konnte nicht angelegt werden.');
    await write('work_order_items', { work_order_id: order.id, material_id: material.id, position_name: name, quantity: Math.max(0.25, n(hours)), unit: materialUnit(material), unit_price: n(material.unit_price) });
  }
  function currentMaterialForItem(item, order) {
    const direct = state.rows.materials.find(material => same(material.id, item?.material_id));
    if (direct) return direct;
    const targetBusinessId = order?.employee_id ? materialBusinessId(order.employee_id) : businessId();
    return state.rows.materials.find(material => same(material.business_id, targetBusinessId) && lower(material.name) === lower(item?.position_name));
  }
  function invoiceItemPrice(item, order) {
    const material = currentMaterialForItem(item, order);
    return !order?.invoiced && material ? n(material.unit_price) : n(item?.unit_price);
  }
  function invoiceItemName(item, order) {
    const material = currentMaterialForItem(item, order);
    return !order?.invoiced && material?.name ? material.name : item?.position_name || 'Leistung';
  }
  async function snapshotCurrentPrices(orders) {
    for (const order of orders || []) {
      for (const item of state.rows.items.filter(row => same(row.work_order_id, order.id))) {
        const material = currentMaterialForItem(item, order);
        if (!material) continue;
        const price = n(material.unit_price), name = material.name;
        if (n(item.unit_price) !== price || item.position_name !== name || !same(item.material_id, material.id)) await write('work_order_items', { material_id: material.id, unit_price: price, position_name: name }, 'PATCH', `id=eq.${encodeURIComponent(item.id)}`);
      }
    }
  }
  async function updateHourlyPrice(form) {
    const material = state.rows.materials.find(row => same(row.id, form.elements.id.value) && same(row.business_id, businessId()) && isHourlyMaterial(row));
    if (!material) throw new Error('Die geschützte Stundenposition wurde nicht gefunden.');
    const price = Math.max(0, n(form.elements.price.value));
    await write('materials', { unit_price: price, unit: normalizeUnit(form.elements.unit?.value || materialUnit(material),true) }, 'PATCH', 'id=eq.' + material.id);
    const openOrderIds = new Set(state.rows.orders.filter(order => !order.invoiced).map(order => order.id));
    for (const item of state.rows.items.filter(item => same(item.material_id, material.id) && openOrderIds.has(item.work_order_id))) await write('work_order_items', { unit_price: price }, 'PATCH', 'id=eq.' + item.id);
    await load(); notice('Preis für ' + material.name + ' gespeichert. Offene Arbeitsscheine wurden aktualisiert.'); render();
  }
  async function updateMaterial(form) {
    const material = state.rows.materials.find(row => same(row.id, form.elements.id.value) && same(row.business_id, businessId()));
    if (!material) throw new Error('Das Material wurde nicht gefunden.');
    if (isHourlyMaterial(material)) throw new Error('Geschützte Stundenpositionen können nur über ihren Preis bearbeitet werden.');
    const name = String(form.elements.name.value || '').trim();
    if (!name) throw new Error('Bitte einen Artikelnamen eingeben.');
    const price = Math.max(0, n(form.elements.price.value));
    await write('materials', { name, unit_price: price, unit: normalizeUnit(form.elements.unit?.value || materialUnit(material)) }, 'PATCH', 'id=eq.' + material.id);
    const openOrderIds = new Set(state.rows.orders.filter(order => !order.invoiced).map(order => order.id));
    for (const item of state.rows.items.filter(item => same(item.material_id, material.id) && openOrderIds.has(item.work_order_id))) await write('work_order_items', { position_name: name, unit_price: price }, 'PATCH', 'id=eq.' + item.id);
    state.materialId = '';
  }
  async function saveDocuments(form, order, employee) {
    await deviceFeatures?.attachReceipts(form,order);
    for (const file of [...(form.elements.documents?.files || [])]) { const safe = file.name.replace(/[^A-Za-z0-9._-]/g, '_'); const path = `${employee}/${order.id}-${Date.now()}-${safe}`; await upload('work-order-documents', path, file); await write('work_order_documents', { work_order_id: order.id, employee_id: employee, file_path: path, file_name: file.name, mime_type: file.type || null }); }
  }
  async function deleteWorkOrderCompletely(orderId) {
    const id = String(orderId || '');
    if (!id) throw new Error('Der Arbeitsschein wurde nicht gefunden.');
    if (state.rows.orders.find(order => same(order.id,id))?.team_periods?.length && state.rows.orders.find(order => same(order.id,id))?.invoiced) throw new Error('Ein bereits abgerechneter gemeinsamer Arbeitsschein kann nicht gelöscht werden.');
    const documents = state.rows.documents.filter(document => same(document.work_order_id, id));
    for (const document of documents) await removeStoredFile('work-order-documents', document.file_path);
    const query = `work_order_id=eq.${encodeURIComponent(id)}`;
    if (state.rows.orders.find(order => same(order.id,id))?.team_periods?.length) { await api('/rest/v1/rpc/delete_team_work_order',{method:'POST',body:{p_id:id}}); return; }
    await remove('work_order_items', query);
    await remove('work_order_documents', query);
    await remove('time_entries', query);
    await remove('work_orders', `id=eq.${encodeURIComponent(id)}`);
  }
  function signatureValues(form) {
    const signedBy = String(form.elements.signed_by?.value || '').trim(), signatureData = String(form.elements.signature_data?.value || '');
    if (!signedBy) throw new Error('Bitte eintragen, wer unterschrieben hat.');
    if (!signatureData.startsWith('data:image/png;base64,') || signatureData.length < 200) throw new Error('Bitte zuerst im Unterschriftsfeld unterschreiben.');
    if (signatureData.length > 700000) throw new Error('Die Unterschrift ist zu groß. Bitte löschen und mit wenigen, klaren Strichen erneut unterschreiben.');
    return { signed_by: signedBy, signature_data: signatureData };
  }
  function syncSignatureSubmit(form) {
    if (!form) return;
    const button = form.querySelector('[data-signature-submit]'), signedBy = String(form.elements.signed_by?.value || '').trim(), signatureData = String(form.elements.signature_data?.value || '');
    if (button) { button.disabled = state.busy; button.dataset.signatureReady=String(!!signedBy && signatureData.startsWith('data:image/png;base64,') && signatureData.length >= 200); }
    if(signatureData.startsWith('data:image/png;base64,') && signatureData.length>=200){const canvas=form.querySelector('.signature-pad');canvas?.classList.remove('field-error');canvas?.removeAttribute('aria-invalid');canvas?.parentElement.querySelector(':scope > .field-error-note')?.remove();}
  }
  function clearSignaturePad(canvas) {
    if (!canvas) return;
    const context = canvas.getContext('2d'); context.clearRect(0, 0, canvas.width, canvas.height);
    const form = canvas.closest('form'); if (form?.elements.signature_data) form.elements.signature_data.value = '';
    canvas.classList.remove('is-signed'); syncSignatureSubmit(form);
  }
  function setupSignaturePads() {
    root?.querySelectorAll('canvas.signature-pad').forEach(canvas => {
      if (canvas.dataset.ready === 'true') return;
      const form = canvas.closest('form'), hidden = form?.elements.signature_data;
      if (!form || !hidden) return;
      canvas.dataset.ready = 'true';
      canvas.style.touchAction = 'none';
      const context = canvas.getContext('2d'); context.lineCap = 'round'; context.lineJoin = 'round'; context.strokeStyle = '#075d59'; context.lineWidth = 5;
      const point = event => { const box = canvas.getBoundingClientRect(); return { x: (event.clientX - box.left) * (canvas.width / box.width), y: (event.clientY - box.top) * (canvas.height / box.height) }; };
      const save = () => { hidden.value = canvas.toDataURL('image/png'); canvas.classList.add('is-signed'); syncSignatureSubmit(form); };
      let drawing = false, last = null;
      const preventTouchScroll = event => { if (event.cancelable) event.preventDefault(); };
      canvas.addEventListener('touchstart', preventTouchScroll, { passive: false });
      canvas.addEventListener('touchmove', preventTouchScroll, { passive: false });
      canvas.addEventListener('touchend', preventTouchScroll, { passive: false });
      canvas.addEventListener('pointerdown', event => { event.preventDefault(); drawing = true; last = point(event); canvas.setPointerCapture?.(event.pointerId); context.beginPath(); context.arc(last.x, last.y, 2.5, 0, Math.PI * 2); context.fillStyle = '#075d59'; context.fill(); });
      canvas.addEventListener('pointermove', event => { if (!drawing) return; event.preventDefault(); const next = point(event); context.beginPath(); context.moveTo(last.x, last.y); context.lineTo(next.x, next.y); context.stroke(); last = next; });
      const finish = event => { if (!drawing) return; drawing = false; try { canvas.releasePointerCapture?.(event.pointerId); } catch (_) {} save(); };
      canvas.addEventListener('pointerup', finish); canvas.addEventListener('pointercancel', finish);
      const existing = String(hidden.value || '');
      if (existing.startsWith('data:image/png;base64,')) { const image = new Image(); image.onload = () => { context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height); canvas.classList.add('is-signed'); syncSignatureSubmit(form); }; image.src = existing; }
      syncSignatureSubmit(form);
    });
  }
  async function prepareCompanyLogo(file) {
    // Trim large, purely white borders without changing the actual logo. Images
    // whose content already reaches the edges are uploaded unchanged.
    if (!file?.type?.startsWith('image/') || !window.createImageBitmap) return file;
    let image = null;
    try {
      image = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const source = document.createElement('canvas'); source.width = width; source.height = height;
      const context = source.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      let left = width, top = height, right = -1, bottom = -1;
      for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
        const offset = (y * width + x) * 4;
        const alpha = pixels[offset], red = pixels[offset + 1], green = pixels[offset + 2], blue = pixels[offset + 3];
        if (alpha > 18 && (red < 246 || green < 246 || blue < 246)) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
      }
      if (right < 0) return file;
      const padding = Math.max(12, Math.round(Math.max(right - left + 1, bottom - top + 1) * 0.045));
      left = Math.max(0, left - padding); top = Math.max(0, top - padding);
      right = Math.min(width - 1, right + padding); bottom = Math.min(height - 1, bottom + padding);
      const cropWidth = right - left + 1, cropHeight = bottom - top + 1;
      if (cropWidth >= width * 0.96 && cropHeight >= height * 0.96) return file;
      const output = document.createElement('canvas'); output.width = cropWidth; output.height = cropHeight;
      output.getContext('2d').drawImage(source, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      const blob = await new Promise(resolve => output.toBlob(resolve, 'image/webp', 0.92));
      return blob ? new File([blob], `firmenlogo-${Date.now()}.webp`, { type: 'image/webp' }) : file;
    } catch (_) { return file; } finally { image?.close?.(); }
  }
  async function saveCompanyLogo(form) {
    if (!isManager() || !businessId()) throw new Error('Bitte zuerst ein Geschäftskonto auswählen.');
    const file = form.elements.logo?.files?.[0];
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!file || !allowed.includes(file.type)) throw new Error('Bitte ein Logo im Format PNG, JPG oder WebP auswählen.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Das Firmenlogo darf höchstens 5 MB groß sein.');
    const uploadFile = await prepareCompanyLogo(file);
    const extension = uploadFile.type === 'image/png' ? 'png' : uploadFile.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${businessId()}/logo-${Date.now()}.${extension}`;
    await upload('company-logos', path, uploadFile);
    await account('business-logo-update', { businessId: businessId(), logoPath: path });
  }
  async function sendMailboxMessage(form) {
    const files = [...(form.elements.attachments?.files || [])];
    if (files.length > 10) throw new Error('Bitte höchstens zehn Anhänge auf einmal auswählen.');
    for (const file of files) if (file.size > 25 * 1024 * 1024) throw new Error(`„${file.name}“ ist größer als 25 MB.`);
    const sent = await api('/functions/v1/mailbox-send', { method: 'POST', body: { action: 'send', recipientId: form.elements.recipient.value, title: form.elements.title.value, message: form.elements.message.value } });
    const message = sent?.message;
    if (!message?.id) throw new Error('Die Nachricht konnte nicht erstellt werden.');
    if (files.length) {
      const attachments = [];
      for (const file of files) {
        const safe = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160) || 'Datei';
        const path = `${message.id}/${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0]}-${safe}`.slice(0, 215);
        await upload('mailbox-attachments', path, file);
        attachments.push({ filePath: path, fileName: file.name.slice(0, 180), mimeType: file.type || '', fileSize: file.size });
      }
      await api('/functions/v1/mailbox-send', { method: 'POST', body: { action: 'attach', messageId: message.id, attachments } });
    }
    state.composeMessage = false;
  }
  async function saveTime(form) {
    const id = workerId();
    if (locked(id)) throw new Error(lockedText(id));
    const customer = await ensureCustomer(form.elements.customer.value, id);
    const value = timeValues(form), notes = String(form.elements.notes?.value || '').trim();
    await write('time_entries', {
      employee_id: id, work_date: state.date, customer_id: customer.id, customer_name: customer.name,
      start_time: value.start, end_time: value.end, pause_hours: value.pause, executed_hours: value.hours,
      calculation_mode: 'end_time', custom_fields: notes ? { notes } : {}
    });
  }
  async function saveOrder(form) { const id = workerId(); if (locked(id)) throw new Error(lockedText(id)); const customer = await ensureCustomer(form.elements.customer.value, id); const value = timeValues(form), signature = signatureValues(form); const created = await write('work_orders', { employee_id: id, work_date: state.date, customer_id: customer.id, customer_name: customer.name, title: String(form.elements.title.value || '').trim(), start_time: value.start, end_time: value.end, pause_hours: value.pause, executed_hours: value.hours, calculation_mode: 'end_time', documentation: String(form.elements.documentation.value || ''), ...signature }); const order = created?.[0]; if (!order) throw new Error('Der Arbeitsschein konnte nicht gespeichert werden.'); await saveMaterials(form, order); await saveHourlyMaterial(order, value.hours); await saveDocuments(form, order, id); state.orderCustomer = ''; }
  async function updateOrder(form) { if (teamEnabled() || state.rows.orders.find(row => same(row.id, form.elements.id.value))?.team_periods?.length) return saveTeamOrder(form, state.rows.orders.find(row => same(row.id, form.elements.id.value))); const order = state.rows.orders.find(row => same(row.id, form.elements.id.value)); if (!order) throw new Error('Der Arbeitsschein wurde nicht gefunden.'); const id = order.employee_id, workDate = form.elements.work_date.value || order.work_date; if (workDate !== order.work_date && locked(id, workDate)) throw new Error(lockedText(id, workDate)); const customer = await ensureCustomer(form.elements.customer.value, id), value = timeValues(form), signature = signatureValues(form); const changes = { customer_id: customer.id, customer_name: customer.name, title: String(form.elements.title.value || '').trim(), start_time: value.start, end_time: value.end, pause_hours: value.pause, executed_hours: value.hours, calculation_mode: 'end_time', documentation: String(form.elements.documentation.value || ''), ...signature }; if (workDate !== order.work_date) changes.work_date = workDate; await write('work_orders', changes, 'PATCH', `id=eq.${encodeURIComponent(order.id)}`); await saveMaterials(form, order, true); await saveHourlyMaterial(order, value.hours); await saveDocuments(form, order, id); state.orderId = ''; state.view = state.orderOrigin || 'orders'; }
  function permissions(form) { return Object.fromEntries(['time', 'customers', 'orders', 'calendar'].map(name => [name, form.elements[`perm-${name}`]?.checked !== false])); }
  async function saveCustomer(form) { const id = String(form.elements.id.value || ''); const custom = Object.fromEntries(['first_name','street','house_no','city','postal_code','phone_private','phone_mobile','email'].map(name => [name, String(form.elements[name].value || '').trim()])); String(form.elements.extra.value || '').split('\n').map(value => value.trim()).filter(Boolean).forEach((value, index) => { custom[`extra_${index + 1}`] = value; }); const data = { name: String(form.elements.name.value || '').trim(), custom_fields: custom }; if (!data.name) throw new Error('Bitte einen Kundennamen eingeben.'); if (id) await write('customers', data, 'PATCH', `id=eq.${encodeURIComponent(id)}`); else await write('customers', { ...data, employee_id: workerId() }); state.customerId = ''; }

  function revealCustomerProfile() {
    const move = () => {
      const profile = root?.querySelector('#customer-profile');
      if (profile) { profile.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' }); if (window.innerWidth <= 850) window.scrollBy(0, -110); }
      else window.scrollTo(0, 0);
    };
    move();
    requestAnimationFrame(move);
    setTimeout(move, 40);
  }
  function addPdfReturnBar(windowRef) {
    if (!windowRef) return;
    const addBar = () => {
      if (!windowRef.document?.body || windowRef.document.getElementById('pdf-return-actions')) return;
      const bar = windowRef.document.createElement('div');
      bar.id = 'pdf-return-actions';
      bar.style.cssText = 'position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:12px;padding:10px 0 12px;margin-bottom:18px;background:#fff;border-bottom:1px solid #d9e5e2;font:14px Arial,sans-serif';
      bar.innerHTML = '<span style="flex:1;color:#48645d">PDF geöffnet</span><button type="button">← Zurück zur App</button>';
      const button = bar.querySelector('button');
      button.style.cssText = 'border:0;border-radius:7px;padding:10px 14px;background:#48645d;color:#fff;font-weight:bold;cursor:pointer';
      button.addEventListener('click', () => {
        try { windowRef.opener?.focus(); } catch (_) {}
        try { if (windowRef.history.length > 1) { windowRef.history.back(); return; } } catch (_) {}
        try { windowRef.close(); } catch (_) {}
      });
      windowRef.document.body.prepend(bar);
    };
    if (windowRef.document.readyState === 'complete') addBar(); else windowRef.addEventListener('load', addBar, { once: true });
  }
  function showInvoicePreviewControls(windowRef) {
    if (!windowRef) return;
    addPdfReturnBar(windowRef);
    const nativePrint = windowRef.print.bind(windowRef);
    windowRef.print = () => {};
    const addControls = () => {
      if (!windowRef.document?.body || windowRef.document.getElementById('invoice-preview-actions')) return;
      const bar = windowRef.document.createElement('div');
      bar.id = 'invoice-preview-actions';
      bar.style.cssText = 'position:sticky;top:55px;z-index:10;display:flex;gap:10px;align-items:center;padding:12px 0;background:#fff;border-bottom:1px solid #d9e5e2;margin-bottom:18px;font:14px Arial,sans-serif';
      bar.innerHTML = '<span style="flex:1;color:#48645d">Vorschau: Die Arbeitsscheine bleiben bearbeitbar, bis sie ausdrücklich als abgerechnet markiert werden.</span><button type="button">Drucken / als PDF sichern</button>';
      const button = bar.querySelector('button');
      button.style.cssText = 'border:0;border-radius:7px;padding:10px 14px;background:#238473;color:#fff;font-weight:bold;cursor:pointer';
      button.addEventListener('click', nativePrint);
      windowRef.document.body.prepend(bar);
    };
    if (windowRef.document.readyState === 'complete') addControls(); else windowRef.addEventListener('load', addControls, { once: true });
  }
  function pdfStyles() {
    return `*{box-sizing:border-box}body{margin:0;background:#edf4f2;color:#193631;font:14px/1.5 Arial,sans-serif}.pdf-page{max-width:980px;margin:28px auto;background:#fff;padding:34px 38px 42px;box-shadow:0 14px 34px rgba(17,55,48,.14)}.pdf-banner{display:flex;align-items:stretch;justify-content:space-between;gap:28px;min-height:142px;padding:18px 22px;background:linear-gradient(135deg,#075d59,#15917f);color:#fff;border-radius:16px 16px 6px 6px;overflow:hidden}.pdf-brand{display:flex;align-items:center;gap:18px;min-width:0}.pdf-logo{width:228px;min-width:150px;height:106px;padding:10px;background:#fff;border-radius:11px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(0,0,0,.16)}.pdf-logo img{display:block;width:100%;height:100%;object-fit:contain}.pdf-logo-fallback{font-size:30px;font-weight:800;letter-spacing:.08em;color:#075d59}.pdf-company{font-size:17px;font-weight:700;line-height:1.25}.pdf-subtitle{margin-top:5px;color:#d9faf3;font-size:13px}.pdf-title{text-align:right;display:flex;flex-direction:column;justify-content:center}.pdf-title h1{margin:0;font-size:32px;line-height:1.05;letter-spacing:.01em}.pdf-title span{margin-top:8px;color:#d9faf3;font-size:13px}.pdf-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:24px 0}.pdf-card{padding:15px 17px;border:1px solid #d6e5e1;background:#f7fbfa;border-radius:10px}.pdf-card-label{display:block;margin-bottom:5px;color:#4f6a64;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}.pdf-section{margin:24px 0}.pdf-section h2{margin:0 0 10px;color:#075d59;font-size:18px}.pdf-execution{margin:0 0 20px;padding:14px 17px;border-left:4px solid #15917f;background:#f2f8f6}.pdf-execution-row{padding:9px 0;border-bottom:1px solid #d7e5e1}.pdf-execution-row:last-child{border-bottom:0}.pdf-table{width:100%;border-collapse:collapse;margin:12px 0 0}.pdf-table th,.pdf-table td{padding:11px 9px;border-bottom:1px solid #d9e6e3;text-align:left;vertical-align:top}.pdf-table th{background:#e8f3f0;color:#31574f;font-size:11px;letter-spacing:.04em;text-transform:uppercase}.pdf-table .number{text-align:right;white-space:nowrap}.pdf-table small{display:block;color:#58716b;margin-top:3px}.pdf-tag{display:inline-block;margin:0 0 0 7px;padding:2px 7px;border-radius:999px;background:#d8f0e9;color:#076654;font-size:10px;font-weight:700;vertical-align:middle}.pdf-total{display:flex;justify-content:space-between;gap:18px;max-width:365px;margin:25px 0 0 auto;padding:13px 0 0;border-top:3px solid #15917f;color:#075d59;font-size:19px}.pdf-note{margin-top:35px;padding-top:14px;border-top:1px solid #d9e6e3;color:#5b706a;font-size:12px}.pdf-list{margin:6px 0;padding-left:20px}.pdf-list li{margin:7px 0}.pdf-muted{color:#5b706a}.pdf-empty{padding:14px;background:#f7fbfa;border-radius:9px;color:#5b706a}@media(max-width:650px){.pdf-page{margin:0;padding:18px}.pdf-banner{gap:14px;min-height:0;flex-direction:column}.pdf-logo{width:100%;height:90px}.pdf-title{text-align:left}.pdf-grid{grid-template-columns:1fr}.pdf-table{font-size:12px}.pdf-table th,.pdf-table td{padding:8px 5px}}@media print{body{background:#fff}.pdf-page{max-width:none;margin:0;padding:0;box-shadow:none}.pdf-banner{break-inside:avoid}#pdf-return-actions,#invoice-preview-actions{display:none!important}}`;
  }
  function pdfBrandHeader(title, subtitle = '', company = managerBusiness()) {
    const logo = companyLogoUrl(company), name = company?.company_name || 'Zeiterfassung';
    return `<header class="pdf-banner"><div class="pdf-brand"><div class="pdf-logo">${logo ? `<img src="${escape(logo)}" alt="${escape(name)}">` : '<span class="pdf-logo-fallback">ZE</span>'}</div><div><div class="pdf-company">${escape(name)}</div><div class="pdf-subtitle">Digitale Arbeitszeiterfassung</div></div></div><div class="pdf-title"><h1>${escape(title)}</h1>${subtitle ? `<span>${escape(subtitle)}</span>` : ''}</div></header>`;
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const action = button.dataset.action;
    if (action === 'clear-signature') { clearSignaturePad(button.closest('form')?.querySelector('canvas.signature-pad')); return; }
    if (action === 'insert-note-template') {
      const field = button.closest('form')?.querySelector('textarea[name="notes"], textarea[name="documentation"]');
      const note = String(button.dataset.note || '').trim();
      if (!field || !note) return;
      field.value = field.value.trim() ? `${field.value.trim()}\n${note}` : note;
      field.focus();
      return;
    }
    if (action === 'shift-day') { state.date = addDate(state.date, n(button.dataset.days)); state.month = state.date.slice(0, 7); state.orderId = ''; state.timeEntryId = ''; state.vacationForm = false; render(); return; }
    if (action === 'shift-order-date') { const input = button.closest('label')?.querySelector('input[name="work_date"]'); if (!input) return; input.value = addDate(input.value || state.date, n(button.dataset.days)); input.focus(); return; }
    if (action === 'menu') { state.menu = !state.menu; render(); return; }
    if (action === 'nav') { state.view = button.dataset.view; state.menu = false; state.vacationForm = false; state.composeMessage = false; state.orderId = ''; state.timeEntryId = ''; state.orderCustomer = ''; state.orderOrigin = 'orders'; state.billingKey = ''; render(); return; }
    if (action === 'logout') return logout();
    if (action === 'forgot') return perform('Die zuständige Verwaltung wurde informiert.', () => api('/functions/v1/request-password-help', { method: 'POST', body: { username: root.querySelector('[name="username"]')?.value || '' } }));
    if (action === 'pick-day') { state.date = button.dataset.date; state.month = state.date.slice(0, 7); state.timeEntryId = ''; state.vacationForm = false; render(); return; }
    if (action === 'month') { const date = new Date(`${state.month}-01T12:00:00`); date.setMonth(date.getMonth() + n(button.dataset.value)); state.month = date.toISOString().slice(0, 7); render(); return; }
    if (action === 'vacation-form') { state.vacationForm = true; render(); return; }
    if (action === 'open-order') { const order = state.rows.orders.find(row => same(row.id, button.dataset.id)); if (!order) return; const person = state.rows.people.find(row => same(row.id, order.employee_id)); if (isAdmin() && person?.business_id) state.businessId = person.business_id; state.employeeId = order.employee_id; state.date = order.work_date; state.month = state.date.slice(0, 7); state.orderId = order.id; state.timeEntryId = ''; state.orderOrigin = ['invoices', 'invoices-paid', 'billing-detail', 'planning', 'customers'].includes(state.view) ? state.view : 'orders'; state.view = 'order-detail'; state.menu = false; render(); return; }
    if (action === 'open-time') {
      const entry = state.rows.entries.find(row => same(row.id, button.dataset.id));
      if (!entry) return;
      const linkedOrder = (entry.team_work_order_id || entry.work_order_id) && state.rows.orders.find(order => same(order.id, entry.team_work_order_id || entry.work_order_id));
      if (linkedOrder) { button.dataset.id = linkedOrder.id; button.dataset.action = 'open-order'; button.click(); return; }
      const person = state.rows.people.find(row => same(row.id, entry.employee_id));
      if (isAdmin() && person?.business_id) state.businessId = person.business_id;
      state.employeeId = entry.employee_id; state.date = entry.work_date; state.month = state.date.slice(0, 7);
      state.timeEntryId = entry.id; state.orderId = ''; state.view = 'time'; state.menu = false; render(); return;
    }
    if (action === 'close-time') { state.timeEntryId = ''; render(); return; }
    if (action === 'close-order') { state.orderId = ''; state.view = state.orderOrigin || 'orders'; render(); return; }
    if (action === 'open-billing') { state.billingKey = button.dataset.key; state.billingMode = button.dataset.mode === 'paid' ? 'paid' : 'open'; state.view = 'billing-detail'; state.menu = false; render(); return; }
    if (action === 'close-billing') { state.view = state.billingMode === 'paid' ? 'invoices-paid' : 'invoices'; state.billingKey = ''; render(); return; }
    if (action === 'more-material') { document.getElementById('material-lines')?.insertAdjacentHTML('beforeend', materialRow()); return; }
    if (action === 'new-customer') { state.customerId = 'new'; render(); return; }
    if (action === 'customer') { state.customerId = button.dataset.id; render(); revealCustomerProfile(); return; }
    if (action === 'create-order-from-customer') { const customer = state.rows.customers.find(row => same(row.id, button.dataset.id)); if (!customer) { notice('Der ausgewählte Kunde wurde nicht gefunden.', true); render(); return; } state.orderCustomer = customer.name; state.orderId = ''; state.orderOrigin = 'customers'; state.view = 'orders'; render(); return; }
    if (action === 'edit-material') { state.materialId = button.dataset.id; render(); return; }
    if (action === 'close-material-edit') { state.materialId = ''; render(); return; }
    if (action === 'pdf') return printPdf();
    if (action === 'order-pdf') return printOrderPdf(button.dataset.id);
    if (action === 'billing-pdf') return printBillingPdf(state.billingKey, state.billingMode === 'paid');
    if (action === 'compose-message') { state.composeMessage = !state.composeMessage; render(); return; }
    if (action === 'mailbox-folder') { state.mailboxFolder = button.dataset.folder || 'received'; render(); return; }
    if (action === 'payslip-template') {
      const form = button.closest('form[data-form="message-send"]'), recipient = messageRecipients().find(person => same(person.id, form?.elements.recipient?.value));
      if (!form || !recipient) { notice('Bitte zuerst den Empfänger der Lohnabrechnung auswählen.', true); render(); return; }
      const date = new Date(), month = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(date), company = managerBusiness()?.company_name || 'Ihre Geschäftsleitung';
      form.elements.title.value = `Lohnabrechnung – ${month}`;
      form.elements.message.value = `Guten Tag ${personName(recipient)},\n\nhiermit erhalten Sie Ihre Lohnabrechnung für den Monat ${month}.\n\nMit freundlichen Grüßen\n${company}`;
      form.elements.message.focus();
      return;
    }
    if (action === 'download-mail-attachment') { const attachment = state.rows.attachments.find(row => same(row.id, button.dataset.id)); if (!attachment) { notice('Der Anhang wurde nicht gefunden.', true); render(); return; } return download('mailbox-attachments', attachment.file_path, attachment.file_name); }
    if (action === 'delete-time') {
      const id = button.dataset.id;
      return confirm('Zeiterfassung wirklich vollständig löschen?') && perform('Zeiterfassung wurde vollständig gelöscht.', async () => {
        await remove('time_entries', `id=eq.${encodeURIComponent(id)}`);
        if (same(state.timeEntryId, id)) state.timeEntryId = '';
      });
    }
    if (action === 'delete-order') {
      const id = button.dataset.id;
      return confirm('Arbeitsschein inklusive Material, Dokumenten und zugehöriger Zeiterfassung wirklich vollständig löschen?') && perform('Arbeitsschein wurde vollständig gelöscht.', async () => {
        await deleteWorkOrderCompletely(id);
        if (same(state.orderId, id)) { state.orderId = ''; state.view = state.orderOrigin || 'orders'; }
      });
    }
    if (action === 'delete-customer') return confirm('Kunde wirklich löschen?') && perform('Kunde wurde gelöscht.', () => remove('customers', `id=eq.${encodeURIComponent(button.dataset.id)}`));
    if (action === 'delete-material') { const material = state.rows.materials.find(row => same(row.id, button.dataset.id)); if (isHourlyMaterial(material)) { notice('Diese Stundenposition ist geschützt und kann nicht gelöscht werden.'); render(); return; } return confirm('Material wirklich löschen?') && perform('Material wurde gelöscht.', () => remove('materials', `id=eq.${encodeURIComponent(button.dataset.id)}`)); }
    if (action === 'invoice') return perform('Arbeitsschein wurde als abgerechnet markiert.', async () => { const order = state.rows.orders.find(row => same(row.id, button.dataset.id)); if (!order) throw new Error('Der Arbeitsschein wurde nicht gefunden.'); await snapshotCurrentPrices([order]); await write('work_orders', { invoiced: true }, 'PATCH', `id=eq.${encodeURIComponent(button.dataset.id)}`); });
    if (action === 'remove-company-logo') return confirm('Firmenlogo wirklich entfernen?') && perform('Das Firmenlogo wurde entfernt.', () => account('business-logo-update', { businessId: businessId(), logoPath: null }));
    if (action === 'invoice-order') {
      const group = invoiceGroups(false).find(item => item.orders.some(order => same(order.id, button.dataset.id)));
      if (!group) { notice('Für diesen Arbeitsschein ist keine offene Abrechnung verfügbar.', true); render(); return; }
      if (!confirm(`Rechnung über ${group.orders.length} offenen Arbeitsschein(e) für ${group.customerName} erstellen?`)) return;
      showInvoicePreviewControls(printInvoicePdf(group));
      notice('Rechnungsvorschau geöffnet. Die Arbeitsscheine bleiben offen und können weiter bearbeitet werden.'); render(); return;
    }
    if (action === 'invoice-group') { const group = invoiceGroups(false).find(item => same(item.key, state.billingKey)); if (!group) return; if (!confirm(`Rechnungsvorschau über ${group.orders.length} offenen Arbeitsschein(e) für ${group.customerName} erstellen?`)) return; showInvoicePreviewControls(printInvoicePdf(group)); notice('Rechnungsvorschau geöffnet. Die Arbeitsscheine bleiben offen und können weiter bearbeitet werden.'); render(); return; }
    if (action === 'mark-invoice-order') {
      const group = invoiceGroups(false).find(item => item.orders.some(order => same(order.id, button.dataset.id)));
      if (!group) { notice('Für diesen Arbeitsschein ist keine offene Abrechnung verfügbar.', true); render(); return; }
      if (!confirm(`Wirklich alle ${group.orders.length} offenen Arbeitsschein(e) für ${group.customerName} als abgerechnet markieren? Dies erfolgt erst nach Abschluss der Rechnung.`)) return;
      return perform('Die enthaltenen Arbeitsscheine wurden als abgerechnet markiert.', async () => { await snapshotCurrentPrices(group.orders); for (const order of group.orders) await write('work_orders', { invoiced: true }, 'PATCH', `id=eq.${encodeURIComponent(order.id)}`); state.orderId = ''; state.view = 'invoices-paid'; });
    }
    if (action === 'mark-invoice-group') { const group = invoiceGroups(false).find(item => same(item.key, state.billingKey)); if (!group) return; if (!confirm(`Wirklich alle ${group.orders.length} offenen Arbeitsschein(e) für ${group.customerName} als abgerechnet markieren? Dies erfolgt erst nach Abschluss der Rechnung.`)) return; return perform('Die enthaltenen Arbeitsscheine wurden als abgerechnet markiert.', async () => { await snapshotCurrentPrices(group.orders); for (const order of group.orders) await write('work_orders', { invoiced: true }, 'PATCH', `id=eq.${encodeURIComponent(order.id)}`); state.billingKey = ''; state.view = 'invoices-paid'; }); }
    if (action === 'read') return perform('Nachricht als gelesen markiert.', () => write('mailbox_messages', { read_at: new Date().toISOString() }, 'PATCH', `id=eq.${encodeURIComponent(button.dataset.id)}`));
    if (action === 'trash') return perform('Nachricht wurde in den Papierkorb verschoben.', () => write('mailbox_messages', { deleted_at: new Date().toISOString() }, 'PATCH', `id=eq.${encodeURIComponent(button.dataset.id)}`));
    if (action === 'restore-mail') return perform('Nachricht wurde wiederhergestellt.', () => write('mailbox_messages', { deleted_at: null }, 'PATCH', `id=eq.${encodeURIComponent(button.dataset.id)}`));
    if (action === 'vacation-decision') return perform('Urlaubsantrag wurde entschieden.', async () => { await flow('decide', { requestId: button.dataset.request, status: button.dataset.status }); await write('mailbox_messages', { read_at: new Date().toISOString() }, 'PATCH', `id=eq.${encodeURIComponent(button.dataset.id)}`); });
    if (action === 'sick') return perform(sick() ? 'Krankheitstag wurde entfernt.' : 'Krankheitstag wurde eingetragen.', async () => { const existing = state.rows.days.find(row => same(row.employee_id, workerId()) && row.work_date === state.date); if (sick()) { if (!isManager()) throw new Error('Krankheitstage können nur durch die Verwaltung entfernt werden.'); if (existing) await remove('work_days', `employee_id=eq.${encodeURIComponent(workerId())}&work_date=eq.${state.date}`); } else await api('/rest/v1/work_days?on_conflict=employee_id,work_date', { method: 'POST', body: { employee_id: workerId(), work_date: state.date, sick: 1, vacation: n(existing?.vacation) }, headers: { Prefer: 'resolution=merge-duplicates,return=representation' } }); });
    if (action === 'delete-employee') return confirm('Mitarbeiterkonto wirklich löschen?') && perform('Mitarbeiterkonto wurde gelöscht.', () => account('employee-delete', { employeeId: button.dataset.id }));
    if (action === 'delete-business') return confirm('Geschäftskonto inklusive Mitarbeiter wirklich löschen?') && perform('Geschäftskonto wurde gelöscht.', () => account('business-delete', { businessId: button.dataset.id }));
  });

  root.addEventListener('input', event => {
    const input = event.target;
    if (input.name === 'signed_by') { syncSignatureSubmit(input.closest('form[data-form="order"], form[data-form="order-edit"]')); return; }
    const form = input.closest('form[data-form="time"], form[data-form="order"], form[data-form="order-edit"]');
    if (!form || !['start', 'end', 'pause', 'hours'].includes(input.name)) return;
    const start = roundTime(form.elements.start.value), pause = Math.max(0, n(form.elements.pause.value));
    if (!start) return;
    if (input.name === 'end') {
      const end = roundTime(form.elements.end.value); if (!end) return;
      const minutes = (toMinutes(end) - toMinutes(start) + 1440) % 1440;
      form.elements.hours.value = Math.max(0.25, Math.round(((minutes / 60) - pause) * 4) / 4).toFixed(2);
    } else if (form.elements.hours.value) {
      const minutes = toMinutes(start) + Math.round((Math.max(0.25, n(form.elements.hours.value)) + pause) * 60);
      form.elements.end.value = roundTime(`${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
    }
  });

  root.addEventListener('change', event => {
    const input = event.target;
    if (input.matches('input[type="time"]')) { input.value = roundTime(input.value); input.dispatchEvent(new Event('input', { bubbles: true })); return; }
    if (input.matches('[name="administrator_login"]')) { const form = input.closest('form[data-form="login"]'), company = form?.elements.company; if (company) { company.disabled = input.checked; company.required = !input.checked; if (input.checked) company.value = ''; } return; }
    if (input.matches('[data-date]')) { state.date = input.value || today(); state.month = state.date.slice(0, 7); state.orderId = ''; state.timeEntryId = ''; render(); return; }
    if (input.matches('[data-select="business"]')) { state.businessId = input.value; state.employeeId = ''; state.timeEntryId = ''; render(); return; }
    if (input.matches('[data-select="employee"]')) { state.employeeId = input.value; state.timeEntryId = ''; render(); }
  });

  root.addEventListener('submit', event => {
    const form = event.target; if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault(); const name = form.dataset.form;
    const submitters = {
      login: () => login(form.elements.username.value, form.elements.password.value, form.elements.company.value, form.elements.administrator_login?.checked === true, form.elements.remember_device?.value === 'yes'),
      time: () => saveTime(form), order: () => saveOrder(form), 'order-edit': () => updateOrder(form), customer: () => saveCustomer(form),
      material: () => { if (isHourlyMaterial(form.elements.name.value)) throw new Error('Diese geschützte Stundenposition ist bereits vorhanden.'); return write('materials', { business_id: businessId(), name: String(form.elements.name.value || '').trim(), unit_price: n(form.elements.price.value), unit: normalizeUnit(form.elements.unit?.value), active: true }); },
      'hourly-price': () => updateHourlyPrice(form),
      'material-edit': () => updateMaterial(form),
      vacation: () => flow('request', { employeeId: workerId(), startDate: form.elements.start.value, endDate: form.elements.end.value }),
      'message-send': () => sendMailboxMessage(form),
      'company-logo': () => saveCompanyLogo(form),
      self: () => account('self-update', { username: form.elements.username.value, password: form.elements.password.value, companyName: form.elements.company?.value, vacationAllowance: n(form.elements.allowance.value) }),
      'employee-new': () => account('employee-create', { businessId: businessId(), username: form.elements.username.value, password: form.elements.password.value, laborType: form.elements.labor_type.value, vacationAllowance: n(form.elements.allowance.value), menuPermissions: permissions(form) }),
      'employee-credentials': () => account('employee-credentials-update', { employeeId: workerId(), username: form.elements.username.value, password: form.elements.password.value }),
      'employee-labor-type': () => account('employee-labor-type-update', { employeeId: workerId(), laborType: form.elements.labor_type.value }),
      'employee-permissions': () => account('employee-permissions-update', { employeeId: workerId(), menuPermissions: permissions(form) }),
      'employee-vacation': () => account('employee-vacation-update', { employeeId: workerId(), vacationAllowance: n(form.elements.allowance.value) }),
      'business-new': () => account('business-create', { companyName: form.elements.company.value, username: form.elements.username.value, password: form.elements.password.value }),
      'business-update': () => account('business-update', { businessId: businessId(), companyName: form.elements.company.value, username: form.elements.username.value, password: form.elements.password.value })
    };
    const submit = submitters[name];
    if (submit) return perform(name === 'login' ? '' : 'Änderung wurde sofort gespeichert.', async () => { await submit(); if (name === 'vacation') state.vacationForm = false; });
  });

  function printInvoicePdf(group) {
    if (!isManager()) throw new Error('Rechnungen können nur durch Administrator oder Geschäftskonto erstellt werden.');
    if (!group?.orders?.length) throw new Error('Für diese Rechnung sind keine Arbeitsscheine vorhanden.');
    const money = value => n(value).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }), company = managerBusiness() || {};
    const customer = state.rows.customers.find(row => same(row.id, group.orders[0]?.customer_id)) || state.rows.customers.find(row => lower(row.name) === lower(group.customerName));
    const fields = customer?.custom_fields && typeof customer.custom_fields === 'object' ? customer.custom_fields : {}, customerName = customer?.name || group.customerName || 'Kunde';
    const customerAddress = [[fields.street, fields.house_no].filter(Boolean).join(' '), [fields.postal_code, fields.city].filter(Boolean).join(' '), fields.email].filter(Boolean);
    const first = [...group.orders].sort((left, right) => String(left.work_date).localeCompare(String(right.work_date)))[0], last = [...group.orders].sort((left, right) => String(right.work_date).localeCompare(String(left.work_date)))[0];
    const invoiceNumber = `RE-${today().replaceAll('-', '')}-${String(first?.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase() || 'OFFEN'}`;
    const employeeInfo = order => { const person = state.rows.people.find(row => same(row.id, order.employee_id)); if (order.team_periods?.length) return { name: [...new Set(order.team_periods.map(p=>p.employee_name || personName(teamPerson(p.employee_id))))].join(', '), time: order.team_periods.map(p=>timeText(p.start_time)+' – '+timeText(p.end_time)).join(' / '), hours:h(orderHours(order)) }; return { name: person?.display_name || person?.username || 'Mitarbeiter nicht verfügbar', time: `${timeText(order.start_time)} – ${timeText(order.end_time)}`, hours: h(order.executed_hours) }; };
    const executionRows = group.orders.map(order => { const employee = employeeInfo(order); if (order.team_periods?.length) return `<div><b>${dateText(order.work_date)}</b>${teamExecutionHtml(order)}</div>`; return `<div class="pdf-execution-row"><b>${escape(employee.name)}</b><br><span class="pdf-muted">${dateText(order.work_date)} · ${escape(employee.time)} · ${escape(employee.hours)}</span></div>`; }).join('');
    const itemRows = group.orders.flatMap(order => { const employee = employeeInfo(order), orderItems = state.rows.items.filter(item => same(item.work_order_id, order.id)), items = orderItems.length ? orderItems : [{ position_name: order.title || 'Arbeitsleistung', quantity: n(order.executed_hours), unit_price: 0 }]; return items.map(item => { const price = invoiceItemPrice(item, order), name = invoiceItemName(item, order), hourly = isHourlyMaterial(name); return `<tr><td>${dateText(order.work_date)}</td><td><b>${escape(name)}</b>${hourly ? '<span class="pdf-tag">Arbeitszeit</span>' : ''}<small>${escape(employee.name)} · ${escape(employee.time)}${order.title ? ` · ${escape(order.title)}` : ''}</small></td><td class="number">${n(item.quantity).toLocaleString('de-DE')} ${escape(itemUnit(item))}</td><td class="number">${money(price)}</td><td class="number">${money(n(item.quantity) * price)}</td></tr>`; }); }).join('');
    const total = group.orders.reduce((sum, order) => sum + state.rows.items.filter(item => same(item.work_order_id, order.id)).reduce((itemSum, item) => itemSum + n(item.quantity) * invoiceItemPrice(item, order), 0), 0);
    const windowRef = window.open('', '_blank'); if (!windowRef) throw new Error('Bitte Pop-ups erlauben, um die Rechnung als PDF zu erstellen.');
    windowRef.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Rechnung ${escape(invoiceNumber)}</title><style>${pdfStyles()}</style></head><body><main class="pdf-page">${pdfBrandHeader('Rechnung', invoiceNumber, company)}<section class="pdf-grid"><article class="pdf-card"><span class="pdf-card-label">Rechnung an</span><b>${escape([fields.first_name, customerName].filter(Boolean).join(' ') || customerName)}</b>${customerAddress.length ? `<br>${customerAddress.map(escape).join('<br>')}` : ''}</article><article class="pdf-card"><span class="pdf-card-label">Rechnungsdaten</span>Ausgestellt am ${dateText(today())}<br>Leistungszeitraum: ${dateText(first?.work_date)}${same(first?.work_date, last?.work_date) ? '' : ` bis ${dateText(last?.work_date)}`}<br>${group.orders.length} Arbeitsschein(e)</article></section><section class="pdf-execution"><b>Ausführung durch</b>${executionRows}</section><section class="pdf-section"><h2>Leistungen und Material</h2><table class="pdf-table"><thead><tr><th>Datum</th><th>Position / Ausführung</th><th class="number">Menge / Einheit</th><th class="number">Einzelpreis</th><th class="number">Gesamt</th></tr></thead><tbody>${itemRows}</tbody></table></section><div class="pdf-total"><b>Rechnungsbetrag</b><b>${money(total)}</b></div><p class="pdf-note">Diese Rechnung wurde automatisch aus ${group.orders.length} Arbeitsschein(en) erstellt.</p></main></body></html>`);
    windowRef.document.close(); addPdfReturnBar(windowRef); return windowRef;
  }
  function billingDayGroups(orders) {
    const groups = new Map();
    orders.forEach(order => {
      const key = String(order.work_date || '');
      const group = groups.get(key) || { date: key, orders: [] };
      group.orders.push(order); groups.set(key, group);
    });
    return [...groups.values()].sort((left, right) => String(left.date).localeCompare(String(right.date)));
  }
  function printBillingPdf(key, invoiced) {
    const group = invoiceGroups(invoiced).find(item => same(item.key, key)); if (!group) throw new Error('Die Abrechnung wurde nicht gefunden.');
    const money = value => n(value).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    const dayGroups = billingDayGroups(group.orders);
    const detailRows = dayGroups.map(day => {
      const team = new Map();
      day.orders.forEach(order => orderPeriods(order).forEach(period => {
        const person = state.rows.people.find(row => same(row.id, period.employee_id));
        const employeeName = period.employee_name || person?.display_name || person?.username || 'Mitarbeiter nicht verfügbar';
        const employee = team.get(String(period.employee_id)) || { name: employeeName, shifts: [], hours: 0 };
        employee.shifts.push(`${timeText(period.start_time)} bis ${timeText(period.end_time)} · Pause ${h(period.pause_hours)}`);
        employee.hours += n(period.executed_hours); team.set(String(period.employee_id), employee);
      }));
      const teamRows = [...team.values()].map(employee => `<li><b>${escape(employee.name)}</b>: ${escape(employee.shifts.join(' / '))} · ${h(employee.hours)}</li>`).join('');
      const documentations = day.orders.filter(order => String(order.documentation || '').trim()).map(order => {
        const person = state.rows.people.find(row => same(row.id, order.employee_id));
        return `<li><b>${escape(person?.display_name || person?.username || 'Mitarbeiter')}</b>: ${escape(order.documentation).replace(/\n/g, '<br>')}</li>`;
      }).join('');
      const rows = day.orders.flatMap(order => {
        const items = state.rows.items.filter(item => same(item.work_order_id, order.id));
        return items.map(item => {
          const price = invoiceItemPrice(item, order), name = invoiceItemName(item, order);
          return `<tr><td>${escape(name)}${isHourlyMaterial(name) ? '<span class="pdf-tag">Arbeitszeit</span>' : ''}${order.title ? `<small>${escape(order.title)}</small>` : ''}</td><td class="number">${n(item.quantity).toLocaleString('de-DE')} ${escape(itemUnit(item))}</td><td class="number">${money(price)}</td><td class="number">${money(n(item.quantity) * price)}</td></tr>`;
        });
      }).join('') || '<tr><td colspan="4" class="pdf-empty">Kein Material erfasst.</td></tr>';
      return `<section class="pdf-section"><h2>${dateText(day.date)}</h2><div class="pdf-card"><span class="pdf-card-label">Mitarbeiter auf der Baustelle</span><ul style="margin:6px 0 0;padding-left:20px">${teamRows}</ul>${documentations ? `<br><b>Dokumentation</b><ul style="margin:6px 0 0;padding-left:20px">${documentations}</ul>` : ''}</div><table class="pdf-table"><thead><tr><th>Leistung / Material</th><th class="number">Menge / Einheit</th><th class="number">Einzelpreis</th><th class="number">Gesamt</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    }).join('');
    const totalHours = group.orders.reduce((sum, order) => sum + orderHours(order), 0), totalMaterial = group.orders.reduce((sum, order) => sum + state.rows.items.filter(item => same(item.work_order_id, order.id)).reduce((itemSum, item) => itemSum + n(item.quantity) * invoiceItemPrice(item, order), 0), 0);
    const windowRef = window.open('', '_blank'); if (!windowRef) throw new Error('Bitte Pop-ups erlauben, um die PDF zu erstellen.');
    windowRef.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Arbeitsnachweis</title><style>${pdfStyles()}</style></head><body><main class="pdf-page">${pdfBrandHeader('Arbeitsnachweis', invoiced ? 'Bereits abgerechnet' : 'Offen zur Abrechnung')}<section class="pdf-grid"><article class="pdf-card"><span class="pdf-card-label">Kunde</span><b>${escape(group.customerName)}</b></article><article class="pdf-card"><span class="pdf-card-label">Übersicht</span>${group.orders.length} Arbeitsschein(e) · ${dayGroups.length} Einsatztag(e)<br>${h(totalHours)} Arbeitszeit</article></section>${detailRows}<div class="pdf-total"><b>Gesamtsumme</b><b>${money(totalMaterial)}</b></div><p class="pdf-note">Dieser Arbeitsnachweis fasst alle enthaltenen Arbeitsscheine je Einsatztag zusammen. Die beteiligten Mitarbeiter stehen gemeinsam unter dem jeweiligen Datum.</p></main><script>window.onload=()=>window.print()<\/script></body></html>`); windowRef.document.close(); addPdfReturnBar(windowRef);
  }
  function printOrderPdf(orderId) {
    const order = state.rows.orders.find(row => same(row.id, orderId)); if (!order) throw new Error('Der Arbeitsschein wurde nicht gefunden.');
    const person = state.rows.people.find(row => same(row.id, order.employee_id)) || worker(), items = state.rows.items.filter(item => same(item.work_order_id, order.id)), money = value => n(value).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    const materialRows = items.map(item => { const price = invoiceItemPrice(item, order), name = invoiceItemName(item, order); return `<tr><td><b>${escape(name)}</b>${isHourlyMaterial(name) ? '<span class="pdf-tag">Arbeitszeit</span>' : ''}</td><td class="number">${n(item.quantity).toLocaleString('de-DE')} ${escape(itemUnit(item))}</td><td class="number">${money(price)}</td><td class="number">${money(n(item.quantity) * price)}</td></tr>`; }).join('');
    const total = items.reduce((sum, item) => sum + n(item.quantity) * invoiceItemPrice(item, order), 0), documentation = String(order.documentation || '').trim(), employeeName = person?.display_name || person?.username || 'Mitarbeiter';
    const signature = String(order.signature_data || ''), signatureSection = signature.startsWith('data:image/png;base64,') ? `<section class="pdf-section"><h2>Unterschrift</h2><article class="pdf-card"><img src="${escape(signature)}" alt="Unterschrift" style="display:block;width:min(100%,380px);height:120px;object-fit:contain;object-position:left;border-bottom:1px solid #d9e6e3;margin-bottom:9px"><b>Unterschrieben von:</b> ${escape(order.signed_by || '—')}</article></section>` : '';
    const windowRef = window.open('', '_blank'); if (!windowRef) throw new Error('Bitte Pop-ups erlauben, um die PDF zu erstellen.');
    windowRef.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Arbeitsnachweis</title><style>${pdfStyles()}</style></head><body><main class="pdf-page">${pdfBrandHeader('Arbeitsnachweis', dateText(order.work_date))}<section class="pdf-grid"><article class="pdf-card"><span class="pdf-card-label">Kunde</span><b>${escape(order.customer_name || 'Ohne Kunde')}</b><br>${escape(order.title || 'Ohne Beschreibung')}</article><article class="pdf-card"><span class="pdf-card-label">Ausgeführt von</span>${teamExecutionHtml(order)}</article></section>${documentation ? `<section class="pdf-section"><h2>Dokumentation</h2><article class="pdf-card">${escape(documentation).replace(/\n/g, '<br>')}</article></section>` : ''}${signatureSection}<section class="pdf-section"><h2>Leistungen und Material</h2>${items.length ? `<table class="pdf-table"><thead><tr><th>Position</th><th class="number">Menge / Einheit</th><th class="number">Einzelpreis</th><th class="number">Gesamt</th></tr></thead><tbody>${materialRows}</tbody></table>` : '<p class="pdf-empty">Keine Positionen erfasst.</p>'}</section><div class="pdf-total"><b>Gesamtsumme</b><b>${money(total)}</b></div><p class="pdf-note">Monteur- und Aushilfsstunden erscheinen als Arbeitszeitpositionen mit ihrem jeweiligen Preis.</p></main><script>window.onload=()=>window.print()<\/script></body></html>`); windowRef.document.close(); addPdfReturnBar(windowRef);
  }
  function printPdf() {
    const person = worker(), id = workerId(), ownEntries = effectiveTimeEntries(id), totalHours = ownEntries.reduce((sum, row) => sum + n(row.executed_hours), 0);
    const lines = ownEntries.map(row => `<tr><td>${dateText(row.work_date)}</td><td>${escape(row.customer_name)}</td><td>${timeText(row.start_time)}</td><td>${timeText(row.end_time)}</td><td class="number">${h(row.pause_hours)}</td><td class="number">${h(row.executed_hours)}</td></tr>`).join('');
    const windowRef = window.open('', '_blank'); if (!windowRef) throw new Error('Bitte Pop-ups erlauben, um die PDF zu erstellen.');
    windowRef.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Zeiterfassungsnachweis</title><style>${pdfStyles()}</style></head><body><main class="pdf-page">${pdfBrandHeader('Zeiterfassungsnachweis', state.date.slice(0, 4))}<section class="pdf-grid"><article class="pdf-card"><span class="pdf-card-label">Mitarbeiter</span><b>${escape(person?.display_name || person?.username || '')}</b></article><article class="pdf-card"><span class="pdf-card-label">Jahresübersicht</span>${h(totalHours)} Arbeitsstunden<br>${h(overtime(id))} Überstunden<br>${vacationLeft(id)} Urlaubstage übrig · ${annualSick(id)} Krankheitstage</article></section><section class="pdf-section"><h2>Erfasste Zeiten</h2><table class="pdf-table"><thead><tr><th>Datum</th><th>Kunde</th><th>Von</th><th>Bis</th><th class="number">Pause</th><th class="number">Stunden</th></tr></thead><tbody>${lines || '<tr><td colspan="6" class="pdf-empty">Keine Zeiterfassungen vorhanden.</td></tr>'}</tbody></table></section><p class="pdf-note">Automatisch aus der Arbeitszeiterfassung erstellt.</p></main><script>window.onload=()=>window.print()<\/script></body></html>`); windowRef.document.close(); addPdfReturnBar(windowRef);
  }
  const deviceFeatures=window.WorktimeDeviceFeatures?.create({root,state,api,write,allRows,upload,remove,download,render,businessId,workerId,isManager,isAdmin,orderForEmployee,orderHours,dateText,timeText,h,planningMeta,planEmployeeIds,logout,canUse,locked,openPlanningOrder,teamPeriodFields,teamPersonFields,refreshPlanningData,loadTeamContext});
  function render() { if (!root) return; if (!base || !key) { root.innerHTML = '<main class="login-page"><section class="login-card"><h1>Zeiterfassung</h1><p>Die App-Konfiguration fehlt.</p></section></main>'; return; } root.innerHTML = state.session && state.profile ? appView() : loginView(); setupCustomerSearch(); setupSignaturePads(); setupPlanningCustomerLookup(); updatePlanningWarnings(root.querySelector('form[data-form="planning"]')); updateAssignmentHint(root.querySelector('form[data-form="time"], form[data-form="order"]')); deviceFeatures?.afterRender(); }
  window.addEventListener('unhandledrejection', event => { event.preventDefault(); notice('Die Aktion konnte nicht ausgeführt werden. Bitte erneut versuchen.', true); render(); });
  state.session = parse(sessionStorage.getItem(storage) || localStorage.getItem(storage) || localStorage.getItem('zeiterfassung-session-v700'));
  if (state.session?.access_token) loadApp(); else render();

  // Safety net: always load every available result page and never clear a verified history after a temporary connection error.
  async function allRows(table, query = 'select=*') {
    const pageSize = 500; let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = [];
        for (let offset = 0; ; offset += pageSize) {
          const page = await rows(table, `${query}&limit=${pageSize}&offset=${offset}`) || [];
          result.push(...page); if (page.length < pageSize) return result;
        }
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('Die Daten konnten nicht geladen werden.');
  }
  async function reload() {
    planningSync.reset();
    const issues = [];
    const load = async (name, table, query = 'select=*') => { try { state.rows[name] = await allRows(table, query); } catch { issues.push(name); } };
    const loadRecipients = async () => { try { state.rows.recipients = (await api('/functions/v1/mailbox-send', { method: 'POST', body: { action: 'recipients' } }))?.recipients || []; } catch { issues.push('recipients'); } };
    await Promise.all([
      load('people', 'profiles'), load('entries', 'time_entries', 'select=*&order=work_date.desc,created_at.desc'), load('orders', 'work_orders', 'select=*&order=work_date.desc,created_at.desc'),
      load('items', 'work_order_items'), load('customers', 'customers', 'select=*&order=name.asc'), load('days', 'work_days'), load('vacations', 'vacation_requests', 'select=*&order=created_at.desc'),
      load('messages', 'mailbox_messages', 'select=*&order=created_at.desc'), load('attachments', 'mailbox_attachments', 'select=*&order=created_at.asc'), load('materials', 'materials', 'select=*&order=name.asc'), load('appointments', 'appointments'),
      load('payslips', 'employee_payslips', 'select=*&order=created_at.desc'), load('documents', 'work_order_documents'), loadRecipients(), loadPlanningRequests()
    ]);
    state.people = state.rows.people;
    if (!isManager()) { try { state.businessBrand = (await api('/rest/v1/rpc/current_business_branding', { method: 'POST', body: {} }))?.[0] || null; } catch { state.businessBrand = null; } } else state.businessBrand = null;
    if (isAdmin() && !businesses().some(person => same(person.id, state.businessId))) state.businessId = businesses()[0]?.id || '';
    if (!workers().some(person => same(person.id, state.employeeId))) state.employeeId = workers()[0]?.id || state.profile.id;
    await loadTeamContext();
    await deviceFeatures?.load();
    if (issues.length) notice('Ein Teil der Daten konnte gerade nicht erneut synchronisiert werden. Bereits geladene Aufträge bleiben sichtbar.', true);
  }
  function recordedPeriods(id = workerId(), date = '') {
    const entries = effectiveTimeEntries(id, date);
    const orders = state.rows.orders.filter(order => orderForEmployee(order,id) && (!date || order.work_date === date)).flatMap(order => orderPeriods(order).filter(period => same(period.employee_id,id) && !entries.some(entry => (period.key ? same(entry.team_work_order_id,order.id) && same(entry.team_period_key,period.key) : same(entry.work_order_id,order.id)) || sameWorkTime(entry,{...order,...period}))).map(period => ({...order,...period,id:`work-order-${order.id}-${period.key || 'single'}`,work_order_id:order.id})));
    return [...entries, ...orders];
  }
  function dayHours(id = workerId(), date = state.date) { return recordedPeriods(id, date).reduce((sum, row) => sum + n(row.executed_hours), 0); }
  function overtime(id = workerId()) {
    const year = state.date.slice(0, 4), days = new Map();
    recordedPeriods(id).filter(row => String(row.work_date || '').startsWith(year)).forEach(row => days.set(row.work_date, n(days.get(row.work_date)) + n(row.executed_hours)));
    return [...days].reduce((sum, [date, hours]) => sum + hours - dueHours(date), 0);
  }
  function reportOvertime(entries) { const days = new Map(); entries.forEach(row => days.set(row.work_date, n(days.get(row.work_date)) + n(row.executed_hours))); return [...days].reduce((sum, [date, hours]) => sum + hours - dueHours(date), 0); }
  function receiptTabs(selected) { return [['fuel','Tankbelege'],['vacations','Urlaubsanträge'],['sick','Krankmeldungen'],['training','Schulungstage']].map(([id,title]) => `<button type="button" class="${id === selected ? 'primary' : 'secondary'} small" data-action="receipt-section" data-section="${id}">${title}</button>`).join(''); }
  function receiptsView() {
    const id = workerId(), section = state.receiptSection || 'fuel';
    const vacations = state.rows.vacations.filter(row => same(row.employee_id, id));
    const sickDays = state.rows.days.filter(row => same(row.employee_id, id) && n(row.sick) > 0).sort((a,b) => String(b.work_date).localeCompare(String(a.work_date)));
    const body = section === 'vacations' ? (vacations.map(row => `<article class="row-card"><div class="row-main"><b>${dateText(row.start_date)} bis ${dateText(row.end_date)}</b><span>${escape(row.status === 'approved' ? 'Genehmigt' : row.status === 'requested' ? 'Beantragt' : 'Abgelehnt')} · ${n(row.requested_days)} Tage</span></div></article>`).join('') || '<p class="empty">Keine Urlaubsanträge vorhanden.</p>') : section === 'sick' ? (sickDays.map(row => `<article class="row-card"><div class="row-main"><b>${dateText(row.work_date)}</b><span>Krank gemeldet</span></div></article>`).join('') || '<p class="empty">Keine Krankmeldungen vorhanden.</p>') : section === 'training' ? '<p class="empty">Noch keine Schulungstage erfasst.</p>' : '<p class="empty">Noch keine Tankbelege erfasst.</p>';
    const title = section === 'fuel' ? 'Tankbelege' : section === 'vacations' ? 'Urlaubsanträge' : section === 'sick' ? 'Krankmeldungen' : 'Schulungstage';
    return `<section class="page-head"><div><span class="eyebrow">Persönliche Nachweise</span><h2>Belege</h2></div></section><section class="panel"><div class="actions">${receiptTabs(section)}</div><h3>${escape(title)}</h3>${body}</section>`;
  }
  function planningView() { return '<section class="page-head"><div><span class="eyebrow">Konzeptvorschau</span><h2>Planungsübersicht</h2></div></section><section class="panel"><h3>Planung wird erst nach Freigabe aktiviert</h3><p>Diese Ansicht ändert keine Aufträge und legt keine Termine an. Die vorgeschlagene Umsetzung steht unten als Konzept bereit.</p></section>'; }
  function menuItems() { return [['home','Übersicht',true],['time','Zeiterfassung',canUse('time')],['orders','Arbeitsscheine',canUse('orders')],['calendar','Kalender',canUse('calendar')],['customers','Kunden',canUse('customers')],['receipts','Belege',true],['planning','Planungsübersicht',true],['mailbox','Postfach',true],['materials','Materialliste',isManager()],['invoices','Abrechnungen Kunden',isManager()],['invoices-paid','Abgerechnete Arbeitsscheine',isManager()],['settings','Einstellungen',true]].filter(([, , yes]) => yes); }
  function viewHtml() { return ({ home: homeView, time: timeView, orders: ordersView, 'order-detail': orderDetailView, calendar: calendarView, customers: customersView, receipts: receiptsView, planning: planningView, mailbox: mailboxView, materials: materialsView, invoices: invoicesView, 'invoices-paid': paidInvoicesView, 'billing-detail': billingDetailView, settings: settingsView }[state.view] || homeView)(); }
  function reportDateValid(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value;
  }
  function timeAccountReport(id = workerId()) {
    const entries = recordedPeriods(id).filter(row => reportDateValid(row.work_date)).sort((a,b) => a.work_date.localeCompare(b.work_date) || String(a.start_time || '').localeCompare(String(b.start_time || '')));
    const days = state.rows.days.filter(row => same(row.employee_id,id) && reportDateValid(row.work_date));
    const vacations = state.rows.vacations.filter(row => same(row.employee_id,id) && ['approved','requested'].includes(row.status) && reportDateValid(row.start_date) && reportDateValid(row.end_date) && row.end_date >= row.start_date);
    const yearSet = new Set([String(state.date || today()).slice(0,4)]);
    entries.forEach(row => yearSet.add(row.work_date.slice(0,4)));
    days.filter(row => n(row.sick)>0 || n(row.vacation)>0).forEach(row => yearSet.add(row.work_date.slice(0,4)));
    vacations.forEach(row => { for (let year=Number(row.start_date.slice(0,4)); year<=Number(row.end_date.slice(0,4)); year++) yearSet.add(String(year).padStart(4,'0')); });
    const byDate = new Map();
    entries.forEach(row => { const list=byDate.get(row.work_date) || []; list.push(row); byDate.set(row.work_date,list); });
    const years = [...yearSet].sort().map(year => {
      const months = new Map(), records = [];
      // Calendar-only records are deliberately not passed to reportOvertime:
      // a holiday or absence with no time entry must never create minus hours.
      for (const cursor=new Date(year+'-01-01T12:00:00Z'); cursor.getUTCFullYear()===Number(year); cursor.setUTCDate(cursor.getUTCDate()+1)) {
        const date=cursor.toISOString().slice(0,10), rows=byDate.get(date) || [], day=days.find(row => row.work_date===date);
        const holiday=nrwHoliday(date), sickDays=Math.max(0,n(day?.sick));
        const approved=!sickDays && (n(day?.vacation)>0 || vacations.some(row => row.status==='approved' && row.start_date<=date && row.end_date>=date));
        const requested=!sickDays && !approved && vacations.some(row => row.status==='requested' && row.start_date<=date && row.end_date>=date);
        if (!rows.length && !holiday && !sickDays && !approved && !requested) continue;
        const labels=[...(holiday ? [{kind:'holiday',text:'Feiertag NRW: '+holiday}] : []),...(sickDays ? [{kind:'sick',text:'Krankheit'}] : []),...(approved ? [{kind:'approved',text:'Urlaub (genehmigt)'}] : []),...(requested ? [{kind:'requested',text:'Urlaub (beantragt)'}] : [])];
        const record={date,entries:rows,labels,sickDays,holiday,approvedDays:approved && dueHours(date)>0 ? n(day?.vacation)>0 ? n(day.vacation) : 1 : 0,requestedDays:requested && dueHours(date)>0 ? 1 : 0};
        records.push(record); const month=date.slice(0,7), list=months.get(month) || []; list.push(record); months.set(month,list);
      }
      const yearEntries=entries.filter(row => row.work_date.startsWith(year+'-'));
      const sums=list=>({sickDays:list.reduce((sum,row)=>sum+row.sickDays,0),approvedDays:list.reduce((sum,row)=>sum+row.approvedDays,0),requestedDays:list.reduce((sum,row)=>sum+row.requestedDays,0),holidays:list.filter(row=>row.holiday).length});
      return {year,entries:yearEntries,hours:yearEntries.reduce((sum,row)=>sum+n(row.executed_hours),0),overtime:reportOvertime(yearEntries),...sums(records),months:[...months].map(([month,list])=>({month,days:list,hours:list.flatMap(row=>row.entries).reduce((sum,row)=>sum+n(row.executed_hours),0),...sums(list)}))};
    });
    return {years,totalHours:entries.reduce((sum,row)=>sum+n(row.executed_hours),0)};
  }
  function timeAccountPdfStyles() {
    return `
      .time-account-report .pdf-banner{gap:16px}
      .time-account-report .pdf-title h1{font-size:26px;overflow-wrap:anywhere}
      .time-account-report .pdf-logo{width:190px;min-width:130px}
      .report-year-title{font-size:25px;color:#075d59;margin:28px 0 12px}
      .report-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:15px 0 20px}
      .report-stats .pdf-card{padding:12px;font-size:12px}.report-stats b{font-size:17px}
      .report-legend{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}
      .report-status{display:inline-block;font-size:10px;font-weight:700;padding:4px 7px;border-radius:5px;line-height:1.4;white-space:normal}
      .report-status.holiday{background:#e8edf1;color:#364c5c}.report-status.sick{background:#fce9eb;color:#972f41}
      .report-status.approved{background:#e4f2e8;color:#24603c}.report-status.requested{background:#fff2cd;color:#72510a}
      .report-status-list{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
      .report-calendar-row td{background:#f8faf9}
      .report-month-summary{font-size:11px;line-height:1.7;margin:10px 0 0;color:#46615b}
      .report-table{table-layout:fixed;font-size:11px}.report-table .report-date{width:17%}
      .report-table .report-customer{width:35%}.report-table .report-time{width:12%}
      .report-table th,.report-table td{padding:9px 6px;overflow-wrap:anywhere;hyphens:auto}
      .report-table .number{white-space:normal}.report-month h2{break-after:avoid}
      .report-table tr{break-inside:avoid}.report-table thead{display:table-header-group}
      @media(max-width:650px){.report-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.report-table{font-size:10px}.report-table th{font-size:9px;padding:8px 4px}}
      @media print{
        @page{size:A4;margin:14mm 12mm 17mm}.time-account-report{font-size:12px}
        .time-account-report .pdf-logo{width:165px;min-width:110px;height:92px}
        .time-account-report .pdf-banner{padding:15px;min-height:120px}
        .time-account-report .pdf-company{font-size:15px}.time-account-report .pdf-title h1{font-size:24px}
        .report-month{margin:18px 0}.report-month h2{font-size:16px;margin-bottom:8px}
        .report-month-compact{break-inside:avoid}.report-table{margin-top:8px;break-after:avoid}
        .report-table th,.report-table td{padding:7px 6px}
        .report-month-summary{font-size:10px;line-height:1.5;margin-top:8px;break-before:avoid}
        .report-stats,.report-month-summary,.report-legend{break-inside:avoid}
        .report-year+.report-year{break-before:page}.report-year-title{break-after:avoid}
        .report-status{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      }`;
  }
  function printPdf() {
    const person=worker(), report=timeAccountReport();
    const daysText=value=>n(value).toLocaleString('de-DE',{maximumFractionDigits:2})+' Tage';
    const statusHtml=labels=>labels.length ? `<div class="report-status-list">${labels.map(label=>`<span class="report-status ${label.kind}">${escape(label.text)}</span>`).join('')}</div>` : '';
    const sections=report.years.map(year=>`<section class="report-year"><h1 class="report-year-title">Jahr ${escape(year.year)}</h1><section class="report-stats"><article class="pdf-card"><span class="pdf-card-label">Arbeitszeit</span><b>${h(year.hours)}</b></article><article class="pdf-card"><span class="pdf-card-label">Überstunden</span><b>${h(year.overtime)}</b></article><article class="pdf-card"><span class="pdf-card-label">Krankheit</span><b>${daysText(year.sickDays)}</b></article><article class="pdf-card"><span class="pdf-card-label">Urlaub genehmigt*</span><b>${daysText(year.approvedDays)}</b></article><article class="pdf-card"><span class="pdf-card-label">Urlaub beantragt*</span><b>${daysText(year.requestedDays)}</b></article><article class="pdf-card"><span class="pdf-card-label">Feiertage NRW</span><b>${daysText(year.holidays)}</b></article></section>${year.months.map(month=>{
      const lines=month.days.map(day=>(day.entries.length ? day.entries : [null]).map((entry,index)=>`<tr data-report-date="${escape(day.date)}" class="${entry ? '' : 'report-calendar-row'}"><td>${dateText(day.date)}</td><td>${entry ? escape(entry.customer_name || 'Ohne Kunde') : ''}${index===0 ? statusHtml(day.labels) : ''}</td><td>${entry ? timeText(entry.start_time) : '-'}</td><td>${entry ? timeText(entry.end_time) : '-'}</td><td class="number">${entry ? h(entry.pause_hours) : '-'}</td><td class="number">${entry ? h(entry.executed_hours) : '-'}</td></tr>`).join('')).join('');
      const compact=month.days.reduce((sum,day)=>sum+Math.max(1,day.entries.length),0)<=6;
      return `<section class="pdf-section report-month${compact ? ' report-month-compact' : ''}"><h2>${monthText(month.month)}</h2><table class="pdf-table report-table"><thead><tr><th class="report-date">Datum</th><th class="report-customer">Kunde / Status</th><th class="report-time">Von</th><th class="report-time">Bis</th><th class="number report-time">Pause</th><th class="number report-time">Stunden</th></tr></thead><tbody>${lines}</tbody></table><p class="report-month-summary">Monatssumme: <b>${h(month.hours)}</b> Arbeitszeit · Krankheit: ${daysText(month.sickDays)} · Urlaub genehmigt*: ${daysText(month.approvedDays)} · Urlaub beantragt*: ${daysText(month.requestedDays)} · Feiertage: ${month.holidays}</p></section>`;
    }).join('')}</section>`).join('');
    const windowRef=window.open('', '_blank'); if (!windowRef) throw new Error('Bitte Pop-ups erlauben, um die PDF zu erstellen.');
    windowRef.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Zeiterfassungsnachweis</title><style>${pdfStyles()}${timeAccountPdfStyles()}</style></head><body><main class="pdf-page time-account-report">${pdfBrandHeader('Zeiterfassungsnachweis', 'Arbeitszeiten und Abwesenheiten')}<section class="pdf-grid"><article class="pdf-card"><span class="pdf-card-label">Mitarbeiter</span><b>${escape(person?.display_name || person?.username || '')}</b></article><article class="pdf-card"><span class="pdf-card-label">Gesamt</span><b>${h(report.totalHours)}</b> Arbeitszeit</article></section><div class="report-legend"><span class="report-status holiday">Feiertag NRW</span><span class="report-status approved">Urlaub genehmigt</span><span class="report-status requested">Urlaub beantragt</span><span class="report-status sick">Krankheit</span></div>${sections}<p class="pdf-note">Alle erfassten Zeiten, Urlaubs- und Krankheitstage sowie NRW-Feiertage sind chronologisch nach Jahr und Monat gegliedert. Das ausgewählte Jahr wird auch ohne Zeiteinträge aufgeführt.<br>* Urlaubstage in den Summen sind Arbeitstage ohne NRW-Feiertage und Krankheit. Bei Krankheit hat die Krankmeldung Vorrang. Beantragter Urlaub ist noch nicht genehmigt. Tage ohne Arbeitsbuchung erzeugen keine Minusstunden.</p></main><script>window.onload=()=>window.print()<\/script></body></html>`); windowRef.document.close(); addPdfReturnBar(windowRef);
  }
  root.addEventListener('click', event => { const button = event.target.closest('[data-action="receipt-section"]'); if (!button) return; state.receiptSection = button.dataset.section || 'fuel'; render(); });
  // Planungsübersicht: Die bestehende Tabelle appointments enthält bewusst nur
  // die fachlichen Kerndaten. Zusätzliche Planangaben werden versionssicher im
  // Notizfeld abgelegt, damit keine vorhandenen Daten oder Datenbankregeln
  // geändert werden müssen.
  const PLAN_PREFIX = 'ZE-PLAN-1:';
  const PLAN_CUSTOMER_FIELDS = [['first_name', 'Vorname'], ['street', 'Straße'], ['house_no', 'Hausnummer'], ['postal_code', 'Postleitzahl'], ['city', 'Ort'], ['phone_private', 'Telefon privat'], ['phone_mobile', 'Telefon mobil'], ['email', 'E-Mail-Adresse']];
  function planningCustomerSnapshot(customer) {
    if (!customer || typeof customer !== 'object') return null;
    const fields = customer.custom_fields && typeof customer.custom_fields === 'object' && !Array.isArray(customer.custom_fields) ? customer.custom_fields : {};
    return { name: String(customer.name || '').slice(0, 160), custom_fields: Object.fromEntries(Object.entries(fields).filter(([name, value]) => name !== '__proto__' && name !== 'constructor' && ['string', 'number', 'boolean'].includes(typeof value)).slice(0, 40).map(([name, value]) => [name.slice(0, 80), String(value).slice(0, 2000)])) };
  }
  function planningMeta(appointment) {
    const notes = String(appointment?.notes || '');
    if (notes.startsWith(PLAN_PREFIX)) {
      try {
        const value = JSON.parse(notes.slice(PLAN_PREFIX.length));
        return { start: '', end: '', priority: 'normal', status: 'planned', details: '', workOrderId: '', customerDetails: null, ...value };
      } catch { /* An older malformed planning note remains readable below. */ }
    }
    return { start: '', end: '', priority: 'normal', status: 'planned', details: notes, workOrderId: '', customerDetails: null };
  }
  function planningNotes(meta) {
    return PLAN_PREFIX + JSON.stringify({
      start: roundTime(meta.start || ''), end: roundTime(meta.end || ''),
      priority: ['low', 'normal', 'high'].includes(meta.priority) ? meta.priority : 'normal',
      status: ['planned', 'confirmed', 'completed', 'cancelled'].includes(meta.status) ? meta.status : 'planned',
      details: String(meta.details || '').trim().slice(0, 4000), workOrderId: String(meta.workOrderId || ''), customerDetails: planningCustomerSnapshot(meta.customerDetails)
    });
  }
  function planningPeople() {
    const people = isManager() ? workers() : [state.profile];
    return people.filter(Boolean).filter((person, index, list) => list.findIndex(item => same(item.id, person.id)) === index);
  }
  function planningRows() {
    const allowed = new Set(planningPeople().map(person => String(person.id)));
    return state.rows.appointments.filter(row => planEmployeeIds(row).some(id => allowed.has(id)));
  }
  async function loadPlanningRequests() {
    try { state.rows.planningRequests = await allRows('planning_requests', 'select=*&order=created_at.desc,id.asc'); state.planningRequestsReady = true; }
    catch { state.planningRequestsReady = false; /* Preserve loaded proposals during temporary outages. */ }
  }
  function planningRequests() {
    return (state.rows.planningRequests || []).filter(row => same(row.business_id,businessId()) && (isManager() || same(row.submitted_by,state.profile?.id))).map(row => ({...row,_planningRequest:true}));
  }
  function planningSelection() { return planningRows().find(row => same(row.id,state.planId)) || planningRequests().find(row => same(row.id,state.planId)); }
  function requestStatusText(value) { return ({pending:'Zur Freigabe',approved:'Genehmigt',rejected:'Abgelehnt',withdrawn:'Zurückgezogen'}[value] || 'Zur Freigabe'); }
  function planningRequestList() {
    const list = planningRequests().filter(row => row.status === 'pending' || !isManager() && row.status === 'rejected');
    if (!list.length) return '';
    return `<section class="panel plan-requests"><h3>${isManager() ? 'Planungen zur Freigabe' : 'Meine Planungsvorschläge'} · ${list.length}</h3><p class="plan-customer-hint">Noch nicht veröffentlicht. Erst die Freigabe durch die Geschäftsleitung macht den Auftrag für die Beteiligten sichtbar.</p>${list.map(row => `<article class="row-card"><button type="button" class="row-main" data-action="plan-open" data-id="${escape(row.id)}"><b>${escape(row.customer_name)} · ${escape(row.title)}</b><span>${dateText(row.event_date)} · ${escape(planningMeta(row).start)} - ${escape(planningMeta(row).end)} Uhr</span><small>${escape(requestStatusText(row.status))} · Eingereicht von ${escape(personName(teamPerson(row.submitted_by)))}${row.review_note ? ' · '+escape(row.review_note) : ''}</small></button></article>`).join('')}</section>`;
  }
  function planningCustomers(employeeId = workerId()) {
    const person = teamPerson(employeeId) || state.profile;
    const companyId = person?.role === 'business' ? person.id : person?.business_id || businessId();
    return state.rows.customers.filter(row => {
      const owner = teamPerson(row.employee_id);
      return same(row.business_id, companyId) || same(row.employee_id, companyId) || same(row.employee_id, employeeId) || same(owner?.business_id, companyId);
    });
  }
  function planningCustomerFor(appointment) {
    const candidates = planningCustomers(appointment?.employee_id || workerId());
    return candidates.find(row => appointment?.customer_id && same(row.id, appointment.customer_id)) || candidates.find(row => appointment?.customer_name && normalized(row.name) === normalized(appointment.customer_name)) || null;
  }
  function planningCustomerInformation(appointment) {
    const actual = appointment ? matchingPlanOrder(appointment) : null;
    return planningCustomerSnapshot(planningCustomerFor(actual || appointment)) || (!actual || same(actual.customer_id, appointment?.customer_id) ? planningCustomerSnapshot(planningMeta(appointment).customerDetails) : null);
  }
  function planningCustomerDetailsHtml(customer) {
    const info = planningCustomerSnapshot(customer);
    if (!info) return '<p class="plan-customer-hint">Wählen Sie einen vorhandenen Kunden, um Adresse und Kontaktdaten automatisch zu übernehmen. Für einen neuen Kunden können Sie die Stammdaten anschließend im Kundenmenü ergänzen.</p>';
    const knownKeys = new Set(PLAN_CUSTOMER_FIELDS.map(([name]) => name));
    const fields = [...PLAN_CUSTOMER_FIELDS, ...Object.keys(info.custom_fields).filter(name => !knownKeys.has(name)).map(name => [name, name.startsWith('extra_') ? 'Zusätzliche Angabe' : name.replaceAll('_', ' ')])];
    return `<p class="plan-customer-hint">Kundendaten: ${escape(info.name)} · Automatisch aus der Kundendatenbank. Stammdaten werden hier nicht verändert.</p><div class="plan-customer-grid">${fields.map(([name, label]) => `<label>${escape(label)}<input type="text" readonly data-planning-customer-field="${escape(name)}" value="${escape(info.custom_fields[name] || '')}" placeholder="Nicht hinterlegt"></label>`).join('')}</div>`;
  }
  function planningCustomerPanel(customer) {
    return `<section class="wide plan-customer-details"><h4>Adresse und Kontaktdaten</h4><div data-order-customer-details>${planningCustomerDetailsHtml(customer)}</div></section>`;
  }
  function updatePlanningOrderCustomer(form) {
    const target = form?.querySelector('[data-order-customer-details]'); if (!target || !form.elements.planning_id?.value) return;
    const query = normalized(form.elements.customer.value), customer = planningCustomers(workerId()).find(row => query && normalized(row.name) === query);
    const snapshot = normalized(state.planPrefill?.customerName) === query ? state.planPrefill?.customerDetails : null;
    target.innerHTML = planningCustomerDetailsHtml(planningCustomerSnapshot(customer) || snapshot);
  }
  function updatePlanningCustomer(form) {
    const input = form?.elements.customer, target = form?.querySelector('[data-plan-customer-details]'), matches = form?.querySelector('[data-plan-customer-matches]');
    if (!input || !target || !matches) return;
    const candidates = planningCustomers(form.elements.employee.value), query = lower(input.value), selectedId = form.elements.plan_customer_id.value;
    const customer = candidates.find(row => same(row.id, selectedId) && query && lower(row.name) === query) || candidates.find(row => query && lower(row.name) === query);
    form.elements.plan_customer_id.value = customer?.id || '';
    const appointment = planningRows().find(row => same(row.id, form.elements.id.value));
    const snapshot = appointment && same(appointment.employee_id, form.elements.employee.value) && lower(appointment.customer_name) === query ? planningMeta(appointment).customerDetails : null;
    const info = planningCustomerSnapshot(customer) || planningCustomerSnapshot(snapshot), detailsHtml = planningCustomerDetailsHtml(info);
    if (target.innerHTML !== detailsHtml) target.innerHTML = detailsHtml;
    const suggestions = !customer && query ? candidates.map(row => ({ row, score: normalized(row.name).includes(normalized(query)) ? 1 : query.length >= 3 ? similarityScore(query, row.name) : 0 })).filter(item => item.score >= 0.6).sort((a, b) => b.score - a.score || String(a.row.name).localeCompare(String(b.row.name), 'de')).slice(0, 6) : [];
    const matchesKey = JSON.stringify(suggestions.map(({ row }) => [row.id, row.name, row.custom_fields?.street, row.custom_fields?.house_no, row.custom_fields?.postal_code, row.custom_fields?.city]));
    if (matches.dataset.matchesKey !== matchesKey) {
      matches.innerHTML = suggestions.map(({ row }) => `<button type="button" class="secondary small" data-action="plan-customer-select" data-id="${escape(row.id)}"><b>${escape(row.name)}</b><small>${escape([row.custom_fields?.street, row.custom_fields?.house_no, row.custom_fields?.postal_code, row.custom_fields?.city].filter(Boolean).join(' '))}</small></button>`).join('');
      matches.dataset.matchesKey = matchesKey;
    }
    const list = form.closest('#planning-detail')?.querySelector('#planning-customers');
    if (list) list.innerHTML = candidates.map(row => `<option value="${escape(row.name)}"></option>`).join('');
  }
  function setupPlanningCustomerLookup() { updatePlanningCustomer(root?.querySelector('form[data-form="planning"]')); }
  function planningWeekStart(value = state.planWeek || state.date) {
    const date = new Date(`${value || today()}T12:00:00`);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  }
  function planningDays() {
    const start = planningWeekStart();
    return Array.from({ length: 7 }, (_, index) => addDate(start, index));
  }
  function planningStatusText(value) {
    return ({ planned: 'Geplant', confirmed: 'Bestätigt · Arbeitsschein-Entwurf', completed: 'Erledigt', cancelled: 'Abgesagt' }[value] || 'Geplant');
  }
  function planningPriorityText(value) { return ({ high: 'Hoch', normal: 'Normal', low: 'Niedrig' }[value] || 'Normal'); }
  function planningPdfForm() {
    const days=planningDays();
    return `<section class="panel"><h3>Planung als PDF herunterladen</h3><p class="plan-customer-hint">${isManager() ? 'Veröffentlichte Aufträge aller Mitarbeiter der ausgewählten Firma.' : 'Ihre veröffentlichten Aufträge.'} Vorschläge zur Freigabe werden nicht exportiert.</p><form data-form="planning-pdf" class="entry-form"><label>Von<input name="from" type="date" required value="${escape(state.planPdfFrom || days[0])}"></label><label>Bis<input name="to" type="date" required value="${escape(state.planPdfTo || days.at(-1))}"></label><button class="primary wide">PDF herunterladen</button></form></section>`;
  }
  function planningPdfData(from,to) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(Date.parse(from+'T12:00:00')) || !Number.isFinite(Date.parse(to+'T12:00:00')) || from>to) throw new Error('Bitte einen gültigen Zeitraum von/bis auswählen.');
    const span=Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000)+1;
    if (span>366) throw new Error('Bitte höchstens 366 Tage pro PDF auswählen.');
    const people=planningPeople(),list=planningRows().filter(row=>row.event_date>=from && row.event_date<=to && planningMeta(row).status!=='cancelled');
    const days=Array.from({length:span},(_,index)=>{
      const day=addDate(from,index);
      return {label:new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(new Date(day+'T12:00:00')),monthLabel:monthText(day.slice(0,7)),holiday:nrwHoliday(day),absences:people.flatMap(person=>sick(person.id,day)?[personName(person)+': Krank gemeldet']:vacation(person.id,day)?[personName(person)+': Urlaub genehmigt']:requestedVacation(person.id,day)?[personName(person)+': Urlaub beantragt']:[]),orders:list.filter(row=>row.event_date===day).sort((a,b)=>planningMeta(a).start.localeCompare(planningMeta(b).start)).map(row=>{
        const meta=planningMeta(row),actual=matchingPlanOrder(row),fields=planningCustomerInformation(row)?.custom_fields || {};
        return {time:(meta.start || 'Zeit offen')+(meta.end?' - '+meta.end+' Uhr':''),customer:row.customer_name || 'Ohne Kunde',title:row.title || 'Auftrag',people:planEmployeeIds(row).map(id=>personName(teamPerson(id))).join(', '),status:planningStatusText(actual?'completed':meta.status),priority:planningPriorityText(meta.priority),address:[fields.street,fields.house_no,fields.postal_code,fields.city].filter(Boolean).join(' '),details:meta.details,actual:actual?orderPeriods(actual).map(period=>`${period.employee_name || personName(teamPerson(period.employee_id))}: ${timeText(period.start_time)} - ${timeText(period.end_time)} (${h(period.executed_hours)})`).join('; '):''};
      })};
    });
    return {company:managerBusiness()?.company_name || 'Zeiterfassung',rangeLabel:dateText(from)+' - '+dateText(to),generatedLabel:new Intl.DateTimeFormat('de-DE',{dateStyle:'short',timeStyle:'short'}).format(new Date()),summary:`${list.length} ${list.length===1?'veröffentlichter Auftrag':'veröffentlichte Aufträge'} · ${span} Kalendertage`,peopleLabel:(isManager()?'Mitarbeiter: ':'Persönliche Planung: ')+people.map(personName).join(', '),days};
  }
  async function planningLogoBytes(company=managerBusiness()) {
    const url=companyLogoUrl(company);if (!url) return null;
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(8000)});if (!response.ok) return null;
      const blob=await response.blob(),objectUrl=URL.createObjectURL(blob);
      try {
        const image=new Image();image.src=objectUrl;await image.decode();
        const canvas=document.createElement('canvas'),scale=Math.min(1,1200/image.naturalWidth,500/image.naturalHeight);
        canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
        const base64=canvas.toDataURL('image/jpeg',.92).split(',')[1];return Uint8Array.from(atob(base64),char=>char.charCodeAt(0));
      } finally { URL.revokeObjectURL(objectUrl); }
    } catch { return null; }
  }
  async function downloadPlanningPdf(form) {
    const from=form.elements.from.value,to=form.elements.to.value;
    planningPdfData(from,to);await refreshPlanningData();
    const data=planningPdfData(from,to);data.logoBytes=await planningLogoBytes();
    const bytes=await window.PlanningPdf.create(data),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),link=document.createElement('a');
    link.href=url;link.download=`Planung_${from}_bis_${to}.pdf`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    state.planPdfFrom=from;state.planPdfTo=to;
  }
  function requestedVacation(id, date) { return state.rows.vacations.some(row => same(row.employee_id, id) && row.status === 'requested' && row.start_date <= date && row.end_date >= date); }
  function timesOverlap(firstStart, firstEnd, secondStart, secondEnd) {
    if (!firstStart || !firstEnd || !secondStart || !secondEnd) return false;
    return toMinutes(firstStart) < toMinutes(secondEnd) && toMinutes(secondStart) < toMinutes(firstEnd);
  }
  function planConflicts(values, ignoredId = '') {
    const issues = [], employee = values.employeeId, date = values.eventDate;
    if (locked(employee, date)) issues.push({ kind: 'blocked', text: lockedText(employee, date) });
    else if (requestedVacation(employee, date)) issues.push({ kind: 'warning', text: 'Für diesen Tag liegt bereits ein offener Urlaubsantrag vor.' });
    const overlap = planningRows().some(row => {
      const meta = planningMeta(row);
      return !same(row.id, ignoredId) && planEmployeeIds(row).includes(String(employee)) && row.event_date === date && meta.status !== 'cancelled' && timesOverlap(values.start, values.end, meta.start, meta.end);
    });
    if (overlap) issues.push({ kind: 'blocked', text: 'Dieser Mitarbeiter hat zu dieser Zeit bereits einen geplanten Auftrag.' });
    const recorded = recordedPeriods(employee, date).some(row => !same(row.work_order_id, ignoredId) && timesOverlap(values.start, values.end, row.start_time, row.end_time));
    if (recorded) issues.push({ kind: 'warning', text: 'Für diesen Zeitraum ist bereits Arbeitszeit erfasst.' });
    return issues;
  }
  function planBadge(appointment) {
    const meta = planningMeta(appointment), actual = matchingPlanOrder(appointment), conflicts = planConflicts({ employeeId: appointment.employee_id, eventDate: appointment.event_date, start: meta.start, end: meta.end }, appointment.id);
    const stateClass = actual || meta.status === 'completed' ? 'positive' : meta.status === 'cancelled' ? 'negative' : '';
    const issue = conflicts.find(item => item.kind === 'blocked') || conflicts[0];
    return `<button type="button" class="plan-card ${stateClass}" data-action="plan-open" data-id="${escape(appointment.id)}"><b>${escape(actual?.customer_name || appointment.customer_name || 'Ohne Kunde')}</b><span>${escape(actual ? String(actual.start_time || '').slice(0, 5) || '—' : meta.start || '—')} – ${escape(actual ? String(actual.end_time || '').slice(0, 5) || '—' : meta.end || '—')} · ${escape(actual?.title || appointment.title || 'Auftrag')}${actual ? ' · ' + h(orderHours(actual)) : ''}</span><small>${escape(planningStatusText(actual ? 'completed' : meta.status))} · Priorität ${escape(planningPriorityText(meta.priority))}${issue && !actual && meta.status !== 'cancelled' && meta.status !== 'completed' ? ` · ${escape(issue.text)}` : ''}</small></button>`;
  }
  function matchingPlanOrder(appointment) {
    if (appointment?._planningRequest) return null;
    const meta = planningMeta(appointment);
    return state.rows.orders.find(order => same(order.employee_id, appointment.employee_id) && same(order.id, meta.workOrderId || appointment.id)) || state.rows.orders.find(order =>
      same(order.employee_id, appointment.employee_id) && order.work_date === appointment.event_date &&
      (appointment.customer_id ? same(order.customer_id, appointment.customer_id) : lower(order.customer_name) === lower(appointment.customer_name)) &&
      meta.start && meta.end && String(order.start_time || '').slice(0, 5) === meta.start && String(order.end_time || '').slice(0, 5) === meta.end
    );
  }
  function planActions(appointment) {
    if (appointment?._planningRequest) return '';
    const meta = planningMeta(appointment), order = matchingPlanOrder(appointment);
    if (order) return `<div class="actions"><button type="button" class="primary" data-action="open-order" data-id="${escape(order.id)}">Arbeitsschein öffnen</button></div>`;
    if (meta.status === 'completed' || meta.status === 'cancelled' || locked(appointment.employee_id, appointment.event_date) || !canUse('orders')) return '';
    return `<div class="actions"><button type="button" class="primary" data-action="plan-start" data-id="${escape(appointment.id)}">${meta.status === 'confirmed' ? 'Arbeitsschein-Entwurf öffnen' : 'Als Arbeitsschein beginnen'}</button>${!isManager() && meta.status === 'planned' ? `<button type="button" class="secondary" data-action="plan-confirm" data-id="${escape(appointment.id)}">Auftrag bestätigen</button>` : ''}</div>`;
  }
  function planningActualSummary(appointment) {
    const actual = matchingPlanOrder(appointment); if (!actual) return '';
    const meta = planningMeta(appointment), plannedHours = meta.start && meta.end ? (toMinutes(meta.end) - toMinutes(meta.start)) / 60 : null;
    if (actual.team_periods?.length) {
      const participants=[...new Set(actual.team_periods.map(period => period.employee_id))];
      const summary=participants.map(id => { const periods=actual.team_periods.filter(period => same(period.employee_id,id)), total=orderHours(actual,id), difference=plannedHours===null ? null : total-plannedHours; return `<article><h4>${escape(periods[0].employee_name || personName(teamPerson(id)))}</h4>${periods.map(period => `<p>${timeText(period.start_time)} – ${timeText(period.end_time)} · Pause ${h(period.pause_hours)} · ${h(period.executed_hours)}</p>`).join('')}<p><b>${h(total)} insgesamt</b>${difference===null ? '' : `<br>Abweichung zur Planung: ${difference>0 ? '+' : ''}${h(difference)}`}</p></article>`; }).join('');
      return `<section class="plan-customer-details"><h4>Erledigt · Tatsächliche Ausführung</h4>${summary}<p><b>${h(orderHours(actual))} Mitarbeiterstunden insgesamt</b></p></section>`;
    }
    const difference = plannedHours === null ? null : n(actual.executed_hours) - plannedHours;
    return `<section class="plan-customer-details"><h4>Erledigt · Tatsächliche Ausführung</h4><p>${escape(actual.customer_name || appointment.customer_name)} · ${dateText(actual.work_date)}${actual.title ? '<br>' + escape(actual.title) : ''}</p><p><b>${timeText(actual.start_time)} – ${timeText(actual.end_time)}</b> · ${h(actual.executed_hours)} Arbeitszeit · ${h(actual.pause_hours)} Pause</p>${plannedHours === null ? '' : `<p class="plan-customer-hint">Geplant: ${escape(meta.start)} – ${escape(meta.end)} Uhr · ${h(plannedHours)}${difference ? `<br>Abweichung: ${difference > 0 ? '+' : ''}${h(difference)} Arbeitszeit gegenüber der Planung.` : '<br>Arbeitszeit entspricht der Planung.'}</p>`}${actual.documentation ? `<p>${escape(actual.documentation).replace(/\n/g, '<br>')}</p>` : ''}</section>`;
  }
  function planningOrderDrafts(employeeId = workerId(), workDate = state.date) {
    return planningRows().filter(appointment => planEmployeeIds(appointment).includes(String(employeeId)) && appointment.event_date === workDate && planningMeta(appointment).status === 'confirmed' && !matchingPlanOrder(appointment));
  }
  function dayPlanningAssignments(employeeId = workerId(), workDate = state.date) {
    // Only published, assigned appointments belong here. Pending employee
    // proposals are kept separate and never become a work-order draft.
    return planningRows().filter(appointment => {
      const status = planningMeta(appointment).status;
      return !appointment._planningRequest && appointment.event_date === workDate &&
        planEmployeeIds(appointment).includes(String(employeeId)) &&
        (['planned', 'confirmed'].includes(status) || status === 'completed' && matchingPlanOrder(appointment));
    }).sort((a, b) => String(planningMeta(a).start || '').localeCompare(String(planningMeta(b).start || '')) || String(a.customer_name || '').localeCompare(String(b.customer_name || ''), 'de') || String(a.id).localeCompare(String(b.id)));
  }
  function dayPlanCard(appointment, employeeId = workerId()) {
    const meta = planningMeta(appointment), order = matchingPlanOrder(appointment);
    const active = same(state.planPrefill?.id, appointment.id) && state.view === 'orders';
    const blocked = !order && (locked(employeeId, appointment.event_date) || locked(appointment.employee_id, appointment.event_date));
    const enabled = canUse('orders') && !blocked && !active;
    const status = order ? 'Bereits erfasst' : meta.status === 'confirmed' ? 'Bestätigt' : 'Geplant';
    const team = planEmployeeIds(appointment).map(id => personName(teamPerson(id))).join(', ');
    const body = `<span class="day-plan-status ${order ? 'recorded' : meta.status === 'confirmed' ? 'confirmed' : ''}">${escape(status)}</span><b>${escape(order?.customer_name || appointment.customer_name || 'Ohne Kunde')}</b><span>${escape(appointment.title || 'Geplanter Auftrag')}</span><small>${escape(meta.start || '—')} – ${escape(meta.end || '—')} Uhr${team ? ' · '+escape(team) : ''}</small><strong class="day-plan-link">${active ? 'Unten zur Bearbeitung geöffnet' : blocked ? 'An diesem Tag ist keine neue Arbeitsbuchung möglich' : !canUse('orders') ? 'Arbeitsschein-Menü nicht freigegeben' : order ? 'Vorhandenen Arbeitsschein öffnen →' : 'Geplanten Arbeitsschein öffnen →'}</strong>`;
    return `<article class="day-plan-card${active ? ' selected' : ''}" data-assignment-id="${escape(appointment.id)}">${enabled ? `<button type="button" class="day-plan-main" data-action="${order ? 'open-order' : 'plan-start'}" data-id="${escape(order?.id || appointment.id)}">${body}</button>` : `<div class="day-plan-main">${body}</div>`}</article>`;
  }
  function plannedAssignmentsPanel(employeeId = workerId(), workDate = state.date) {
    const appointments = dayPlanningAssignments(employeeId, workDate);
    if (!appointments.length) return '';
    return `<section class="panel day-plans" aria-label="Geplante Aufträge des ausgewählten Tages"><header><div><span class="eyebrow">Für diesen Tag bereits eingeplant</span><h3>Ihre geplanten Aufträge</h3></div><span class="day-plans-count">${appointments.length}</span></header><p>Bitte den geplanten Auftrag öffnen, statt für denselben Auftrag einen neuen Arbeitsschein oder Zeiteintrag anzulegen. Arbeitsstunden werden erst beim Speichern des Arbeitsscheins gebucht.</p><div class="day-plan-list">${appointments.map(appointment => dayPlanCard(appointment, employeeId)).join('')}</div></section>`;
  }
  function matchingDayAssignments(form) {
    if (!form || !['time', 'order'].includes(form.dataset.form) || form.elements.planning_id?.value) return [];
    const query = normalized(form.elements.customer?.value);
    if (!query) return [];
    return dayPlanningAssignments().filter(appointment => {
      const customer = state.rows.customers.find(row => same(row.id, appointment.customer_id));
      return [appointment.customer_name, customer?.name].filter(Boolean).some(name => normalized(name) === query || query.length >= 3 && similarityScore(query, name) >= 0.8);
    });
  }
  function updateAssignmentHint(form) {
    if (!form || !['time', 'order'].includes(form.dataset.form)) return;
    let target = form.querySelector('[data-assignment-hint]');
    if (!target) {
      target = document.createElement('div'); target.className = 'wide assignment-hint'; target.dataset.assignmentHint = '';
      form.elements.customer?.closest('label')?.after(target);
    }
    const matches = matchingDayAssignments(form);
    const html = matches.length ? `<p><b>Für diesen Kunden ist heute bereits ein Auftrag eingeplant oder erfasst.</b> Öffnen Sie ihn hier, um die Planung und die Mitarbeiterzeiten zusammenzuführen.</p>${matches.map(appointment => dayPlanCard(appointment)).join('')}` : '';
    if (target.innerHTML !== html) target.innerHTML = html;
  }
  function updateDayPlanningPanels() {
    const target = root.querySelector('[data-day-plans]');
    const html = plannedAssignmentsPanel();
    if (target && target.innerHTML !== html) target.innerHTML = html;
    updateAssignmentHint(root.querySelector('form[data-form="time"], form[data-form="order"]'));
  }
  // Check before perform() re-renders: declining the extra-entry warning must
  // retain every typed field, signature and selected attachment.
  root.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || state.busy) return;
    const matches = matchingDayAssignments(form);
    if (!matches.length) return;
    const names = [...new Set(matches.map(appointment => appointment.customer_name))].join(', ');
    if (!confirm(`Für ${names} ist am ausgewählten Tag bereits ein Auftrag eingeplant oder erfasst.\n\nBitte öffnen Sie den geplanten Arbeitsschein oben, wenn es derselbe Auftrag ist.\n\nTrotzdem einen separaten zusätzlichen ${form.dataset.form === 'time' ? 'Zeiteintrag' : 'Arbeitsschein'} speichern?`)) {
      event.preventDefault(); event.stopImmediatePropagation(); updateAssignmentHint(form);
      form.querySelector('[data-assignment-hint]')?.scrollIntoView({block: 'center', behavior: 'smooth'});
    }
  }, true);
  function openPlanningOrder(appointment) {
    const meta = planningMeta(appointment), customerDetails = planningCustomerInformation(appointment);
    state.date = appointment.event_date; state.month = state.date.slice(0, 7); state.employeeId = isManager() ? appointment.employee_id : state.profile.id;
    state.orderOrigin = 'planning'; state.menu = false;
    state.planPrefill = { id: appointment.id, employeeId: workerId(), ownerId: appointment.employee_id, participants: planEmployeeIds(appointment), date: appointment.event_date, customerName: customerDetails?.name || appointment.customer_name, customerDetails, title: appointment.title, details: meta.details, start: meta.start, end: meta.end, confirmed: meta.status === 'confirmed' };
    state.orderCustomer = state.planPrefill.customerName; state.orderId = ''; state.view = 'orders';
  }
  async function refreshPlanningData({ifChanged=false}={}) {
    const actor = state.profile?.id;
    if (!actor) throw new Error('Bitte erneut anmelden.');
    const proof=await planningSync.begin(ifChanged);
    if(proof.unchanged)return false;
    const [appointments, days, vacations, orders, entries, customers, requests] = await Promise.all([
      allRows('appointments', 'select=*&order=event_date.asc,id.asc'), allRows('work_days', 'select=*&order=employee_id.asc,work_date.asc'),
      allRows('vacation_requests', 'select=*&order=id.asc'), allRows('work_orders', 'select=*&order=id.asc'), allRows('time_entries', 'select=*&order=id.asc'), allRows('customers', 'select=*&order=name.asc,id.asc'),
      allRows('planning_requests', 'select=*&order=created_at.desc,id.asc').catch(()=>null)
    ]);
    if (!same(actor, state.profile?.id)) throw new Error('Das Benutzerkonto hat sich geändert. Bitte die Planung erneut öffnen.');
    planningSync.assertCurrent(proof);
    Object.assign(state.rows, { appointments, days, vacations, orders, entries, customers });
    state.planningRequestsReady=requests!==null;
    if(requests!==null){state.rows.planningRequests=requests;planningSync.commit(proof);}
    return true;
  }
  function revealPlanningDetail() {
    const detail = root.querySelector('#planning-detail');
    if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function updatePlanningWarnings(form) {
    const target = form?.querySelector('[data-plan-warnings]'); if (!target) return;
    const issues = form.elements.status.value === 'cancelled' ? [] : [form.elements.employee.value,...selectedPlanTeam(form)].flatMap(employeeId => planConflicts({ employeeId, eventDate: form.elements.event_date.value, start: form.elements.start.value, end: form.elements.end.value }, form.elements.id.value).map(issue => ({...issue,text:personName(teamPerson(employeeId))+': '+issue.text})));
    target.innerHTML = issues.map(issue => `<p class="plan-alert ${issue.kind === 'blocked' ? 'blocked' : ''}">${escape(issue.text)}</p>`).join('');
  }
  function planningStyles() {
    return `<style>
      .plan-customer-details{border:1px solid #d9e6e3;border-radius:12px;padding:14px;background:#fff}.plan-customer-details h4{margin:0 0 8px}.plan-customer-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.plan-customer-grid label{min-width:0;display:grid;gap:5px;font-size:.85rem}.plan-customer-grid input{width:100%;min-width:0;background:#f7faf9}.plan-customer-hint{font-size:.8rem;color:#56716c;line-height:1.5}.plan-customer-matches{display:grid;gap:6px}.plan-customer-matches:empty{display:none}.plan-customer-matches button{text-align:left;white-space:normal}.plan-customer-matches b,.plan-customer-matches small{display:block}.plan-customer-matches small{font-weight:400;margin-top:3px}.plan-toolbar label{min-width:160px}.plan-toolbar .actions{flex-wrap:wrap}.plan-toolbar{display:flex;align-items:end;gap:10px;justify-content:space-between;flex-wrap:wrap}.plan-week{display:grid;grid-template-columns:repeat(7,minmax(148px,1fr));gap:8px;overflow-x:auto;padding-bottom:4px}.plan-day{background:#f7faf9;border:1px solid #d9e6e3;border-radius:12px;padding:9px;min-height:130px}.plan-day h4{margin:0 0 7px;font-size:.9rem}.plan-day.today{border-color:#0b7a69;box-shadow:inset 0 0 0 1px #0b7a69}.plan-person{margin:15px 0 6px;font-weight:800;color:#20514a}.plan-card{display:block;width:100%;text-align:left;border:1px solid #c8d9d5;background:white;border-radius:9px;padding:8px;margin:6px 0;cursor:pointer;color:#183a35}.plan-card:hover{border-color:#0b7a69}.plan-card b,.plan-card span,.plan-card small{display:block}.plan-card span{font-size:.82rem;margin-top:3px}.plan-card small{font-size:.72rem;color:#56716c;margin-top:4px}.plan-card.positive{border-color:#53a878;background:#f1fbf5}.plan-card.negative{border-color:#d78484;background:#fff5f5}.plan-empty{font-size:.78rem;color:#718782;margin:12px 0}.plan-alert{border-left:4px solid #e4a735;background:#fff9ec;padding:8px 10px;border-radius:7px;margin:5px 0;font-size:.83rem}.plan-alert.vacation{border-left-color:#7966b8;background:#f3effa}.plan-alert.holiday{border-left-color:#74858a;background:#edf2f3}.plan-alert.blocked{border-left-color:#c75555;background:#fff4f4}@media(max-width:720px){.plan-week{grid-template-columns:1fr;overflow:visible}.plan-day{min-height:0}.plan-person{margin-top:22px}}
    </style>`;
  }
  function planForm(appointment = null) {
    const meta = planningMeta(appointment || {}), selected = appointment?.id || '', defaultDate = appointment?.event_date || (planningDays().includes(state.date) ? state.date : planningDays()[0]);
    const people = planningPeople();
    const employeeId = appointment?.employee_id || workerId() || people[0]?.id || '';
    const options = people.map(person => `<option value="${escape(person.id)}" ${same(person.id, employeeId) ? 'selected' : ''}>${escape(personName(person))}</option>`).join('');
    const customer = planningCustomerFor(appointment), customerInformation = planningCustomerInformation(appointment);
    const proposal = !!appointment?._planningRequest || !isManager();
    if (!isManager() && selected && (!proposal || !same(appointment.submitted_by,state.profile.id))) return '';
    const statusField = proposal ? '<input type="hidden" name="status" value="planned">' : `<label>Status<select name="status"><option value="planned" ${meta.status === 'planned' ? 'selected' : ''}>Geplant</option><option value="confirmed" ${meta.status === 'confirmed' ? 'selected' : ''}>Bestätigt</option><option value="completed" ${meta.status === 'completed' ? 'selected' : ''}>Erledigt</option><option value="cancelled" ${meta.status === 'cancelled' ? 'selected' : ''}>Abgesagt</option></select></label>`;
    return `<section class="panel" id="planning-detail">
      <div class="page-head"><div><span class="eyebrow">${proposal ? 'Planungsvorschlag · '+escape(requestStatusText(appointment?.status)) : selected ? 'Auftrag bearbeiten' : 'Neuen Auftrag planen'}</span><h3>${selected ? escape(appointment.customer_name || 'Geplanter Auftrag') : proposal ? 'Planung zur Freigabe einreichen' : 'Planung anlegen'}</h3></div><button type="button" class="secondary small" data-action="plan-close">Schließen</button></div>
      ${proposal ? '<p class="plan-alert">Noch nicht veröffentlicht. Die Geschäftsleitung kann alle Angaben bearbeiten und den Vorschlag anschließend genehmigen.</p>' : selected ? planActions(appointment)+planningActualSummary(appointment) : ''}
      <form data-form="planning" class="entry-form">
        <input type="hidden" name="id" value="${escape(selected)}"><input type="hidden" name="proposal" value="${proposal ? 'yes' : ''}"><input type="hidden" name="revision" value="${escape(appointment?.revision || '')}"><input type="hidden" name="plan_customer_id" value="${escape(customer?.id || appointment?.customer_id || '')}">
        <label>Mitarbeiter<select name="employee" required>${options}</select></label>${teamChoice(employeeId,appointment?.team_employee_ids || [],true)}
        <label>Datum<input name="event_date" type="date" required value="${escape(defaultDate)}"></label>
        <label class="wide">Kunde<input name="customer" required list="planning-customers" autocomplete="off" placeholder="Kundenname eingeben oder auswählen" value="${escape(customer?.name || appointment?.customer_name || '')}"></label><div class="wide plan-customer-matches" data-plan-customer-matches aria-label="Passende Kunden"></div>
        <section class="wide plan-customer-details"><h4>Adresse und Kontaktdaten</h4><div data-plan-customer-details>${planningCustomerDetailsHtml(customerInformation)}</div></section>
        <label class="wide">Auftrag / Beschreibung<input name="title" maxlength="160" required value="${escape(appointment?.title || '')}" placeholder="Zum Beispiel: Steckdosen erneuern"></label>
        <label>Beginn${timeInput('start',meta.start || '07:30')}</label><label>Ende${timeInput('end',meta.end || '08:30')}</label>
        <label>Priorität<select name="priority"><option value="low" ${meta.priority==='low'?'selected':''}>Niedrig</option><option value="normal" ${!['low','high'].includes(meta.priority)?'selected':''}>Normal</option><option value="high" ${meta.priority==='high'?'selected':''}>Hoch</option></select></label>${statusField}
        <label class="wide">Hinweise<textarea name="details" rows="3" placeholder="Adresse, Ansprechpartner, Besonderheiten">${escape(meta.details || '')}</textarea></label><div class="wide" data-plan-warnings aria-live="polite"></div>
        <button class="primary wide" name="decision" value="save">${proposal ? isManager() ? 'Änderungen als Vorschlag speichern' : 'Zur Freigabe senden' : selected ? 'Planung speichern' : 'Auftrag einplanen'}</button>
        ${proposal && isManager() ? '<button class="primary wide" name="decision" value="approve">Genehmigen und veröffentlichen</button>' : ''}
      </form>
      ${proposal && selected && appointment.status==='pending' ? isManager() ? `<label>Begründung (optional)<textarea data-plan-reason rows="2"></textarea></label><button type="button" class="danger" data-action="plan-reject" data-id="${escape(selected)}">Vorschlag ablehnen</button>` : `<button type="button" class="danger" data-action="plan-withdraw" data-id="${escape(selected)}">Vorschlag zurückziehen</button>` : !proposal && selected ? `<button type="button" class="danger wide" data-action="plan-delete" data-id="${escape(selected)}">Auftrag löschen</button>` : ''}
      <datalist id="planning-customers">${planningCustomers(employeeId).map(row=>`<option value="${escape(row.name)}"></option>`).join('')}</datalist>
    </section>`;
  }
  function planningView() {
    state.planWeek = planningWeekStart();
    const days = planningDays(), people = planningPeople(), selected = planningSelection();
    const grid = people.map(person => `<div class="plan-person">${escape(personName(person))}</div><div class="plan-week">${days.map(day => {
      const records = planningRows().filter(row => planEmployeeIds(row).includes(String(person.id)) && row.event_date === day).sort((left, right) => String(planningMeta(left).start).localeCompare(String(planningMeta(right).start)));
      const holiday = nrwHoliday(day), unavailable = locked(person.id, day), requested = requestedVacation(person.id, day);
      return `<section class="plan-day ${day === today() ? 'today' : ''}"><h4>${escape(new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(`${day}T12:00:00`)))}</h4>${holiday ? `<div class="plan-alert holiday">${escape(holiday)}</div>` : ''}${sick(person.id, day) ? '<div class="plan-alert blocked">Krank gemeldet</div>' : ''}${vacation(person.id, day) ? '<div class="plan-alert vacation">Urlaub genehmigt</div>' : ''}${!unavailable && requested ? '<div class="plan-alert">Urlaub beantragt</div>' : ''}${records.map(planBadge).join('') || '<p class="plan-empty">Keine Planung</p>'}</section>`;
    }).join('')}</div>`).join('') || '<p class="empty">Für dieses Geschäftskonto sind noch keine Mitarbeiter angelegt.</p>';
    const employeeHint = !isManager() ? '<section class="panel"><p>Hier sehen Sie Ihre freigegebenen Einsätze. Eigene Vorschläge können Sie zur Freigabe einreichen. Ein genehmigter Auftrag lässt sich wie bisher als Arbeitsschein übernehmen.</p></section>' : '';
    return `${planningStyles()}<section class="page-head"><div><span class="eyebrow">Aufträge planen und abstimmen</span><h2>Planungsübersicht</h2></div></section><section class="panel"><div class="plan-toolbar"><div class="actions"><button type="button" class="secondary small" data-action="plan-week" data-days="-7">‹ Vorige Woche</button><button type="button" class="secondary small" data-action="plan-today">Heute</button><button type="button" class="secondary small" data-action="plan-week" data-days="7">Nächste Woche ›</button></div><label>Woche auswählen<input type="date" data-plan-week value="${escape(days[0])}"></label><button type="button" class="secondary small" data-action="plan-refresh">Aktualisieren</button><b>${dateText(days[0])} – ${dateText(days.at(-1))}</b>${isManager() || state.planningRequestsReady ? `<button type="button" class="primary small" data-action="plan-new">${isManager() ? '+ Auftrag planen' : '+ Planung vorschlagen'}</button>` : ''}<button type="button" class="secondary small" data-action="plan-pdf-toggle">Planung als PDF herunterladen</button></div></section>${state.planPdfForm ? planningPdfForm() : ''}${selected ? selected._planningRequest || isManager() ? planForm(selected) : planEmployeeDetail(selected) : state.planForm ? planForm() : ''}${planningRequestList()}${employeeHint}<section class="panel">${grid}</section>`;
  }
  function planEmployeeDetail(appointment) {
    const meta = planningMeta(appointment), actual = matchingPlanOrder(appointment), customerInformation = planningCustomerInformation(appointment), blocked = locked(appointment.employee_id, appointment.event_date) || meta.status === 'cancelled' || meta.status === 'completed';
    return `<section class="panel" id="planning-detail"><h3>${escape(actual?.customer_name || appointment.customer_name || 'Geplanter Auftrag')}</h3><p><b>${escape(actual?.title || appointment.title || '')}</b><br>${dateText(appointment.event_date)} · ${escape(actual ? String(actual.start_time || '').slice(0, 5) || '—' : meta.start || '—')} – ${escape(actual ? String(actual.end_time || '').slice(0, 5) || '—' : meta.end || '—')} Uhr · ${planningStatusText(actual ? 'completed' : meta.status)}</p>${customerInformation ? planningCustomerPanel(customerInformation) : ''}${planningActualSummary(appointment)}${meta.details ? `<p>${escape(meta.details).replace(/\n/g, '<br>')}</p>` : ''}${blocked ? `<p class="locked">${meta.status === 'completed' ? 'Der Auftrag wurde bereits abgeschlossen.' : locked(appointment.employee_id, appointment.event_date) ? escape(lockedText(appointment.employee_id, appointment.event_date)) : 'Dieser Auftrag ist abgesagt.'}</p>` : ''}${planActions(appointment)}<button type="button" class="secondary" data-action="plan-close">Zurück zur Planung</button></section>`;
  }
  async function savePlanning(form, approve = false) {
    const proposal = form.elements.proposal?.value === 'yes';
    if (!isManager() && (!proposal || !state.planningRequestsReady)) throw new Error('Planungsvorschläge sind gerade nicht verfügbar. Bitte erneut laden.');
    state.planSaveWarning = '';
    await refreshPlanningData();
    const id = String(form.elements.id.value || ''), employeeId = String(form.elements.employee.value || ''), eventDate = String(form.elements.event_date.value || ''), customerName = String(form.elements.customer.value || '').trim(), title = String(form.elements.title.value || '').trim().slice(0, 160);
    const start = roundTime(form.elements.start.value), end = roundTime(form.elements.end.value);
    if (!planningPeople().some(person => same(person.id, employeeId))) throw new Error('Bitte einen Mitarbeiter dieses Geschäftskontos auswählen.');
    if (!eventDate || !customerName || !title || !start || !end || toMinutes(end) <= toMinutes(start)) throw new Error('Bitte Kunde, Auftrag, Datum sowie eine gültige Anfangs- und Endzeit eingeben.');
    const old = (proposal ? planningRequests() : planningRows()).find(row => same(row.id,id));
    if (id && !old) throw new Error('Dieser Auftrag wurde zwischenzeitlich gelöscht. Bitte erneut laden.');
    if (old && matchingPlanOrder(old) && (!same(old.employee_id, employeeId) || old.event_date !== eventDate || !(old.customer_id && same(old.customer_id, form.elements.plan_customer_id?.value)) && lower(old.customer_name) !== lower(customerName) || planningMeta(old).start !== start || planningMeta(old).end !== end)) throw new Error('Zu dieser Planung existiert bereits ein Arbeitsschein. Bitte Mitarbeiter, Kunde und ausgeführte Zeiten direkt im Arbeitsschein bearbeiten.');
    const participantIds = teamEnabled() ? selectedPlanTeam(form) : [];
    if (old && matchingPlanOrder(old) && [...(old.team_employee_ids || [])].sort().join(',')!==[...participantIds].sort().join(',')) throw new Error('Dieser Auftrag ist bereits abgeschlossen. Die beteiligten Mitarbeiter bitte direkt im Arbeitsschein ändern.');
    if (participantIds.some(member => !teamEmployees().some(person => same(person.id,member)))) throw new Error('Bitte nur Mitarbeiter dieser Firma auswählen.');
    const issues = [employeeId,...participantIds].flatMap(member => planConflicts({ employeeId:member, eventDate, start, end }, id).map(issue => ({...issue,text:personName(teamPerson(member))+': '+issue.text})));
    const blocked = form.elements.status.value === 'cancelled' ? null : issues.find(issue => issue.kind === 'blocked');
    if (blocked) throw new Error(blocked.text);
    const candidates = planningCustomers(employeeId), selectedCustomer = candidates.find(row => same(row.id, form.elements.plan_customer_id?.value) && lower(row.name) === lower(customerName));
    const customer = selectedCustomer || await ensureCustomer(customerName, employeeId, candidates);
    if (!customer?.id) throw new Error('Der Kunde konnte nicht gespeichert werden.');
    if (proposal) {
      const saved = await api('/rest/v1/rpc/save_planning_request',{method:'POST',body:{p_data:{id:id || null,employee_id:employeeId,team_employee_ids:participantIds,event_date:eventDate,customer_id:customer.id,title,start,end,priority:form.elements.priority.value,details:form.elements.details.value},p_revision:id ? n(form.elements.revision.value) : null}});
      if (!saved?.id) throw new Error('Der Vorschlag konnte nicht gespeichert werden.');
      state.planId = ''; state.planForm = false; state.planWeek = planningWeekStart(eventDate);
      if (approve) {
        if (!isManager()) throw new Error('Nur die Geschäftsleitung darf Planungen genehmigen.');
        try { await api('/rest/v1/rpc/review_planning_request',{method:'POST',body:{p_id:saved.id,p_revision:saved.revision,p_action:'approve',p_note:''}}); }
        catch (error) { await loadPlanningRequests(); state.planId=saved.id; throw new Error('Der Vorschlag wurde gespeichert, aber noch nicht veröffentlicht: '+error.message); }
      }
      return;
    }
    const meta = { start, end, priority: form.elements.priority.value, status: form.elements.status.value, details: form.elements.details.value, workOrderId: planningMeta(old).workOrderId, customerDetails: planningCustomerSnapshot(customer) };
    const data = { ...(teamEnabled() ? {team_employee_ids: participantIds} : {}), employee_id: employeeId, event_date: eventDate, customer_id: customer.id, customer_name: customer.name, title, notes: planningNotes(meta) };
    const saved = id ? await write('appointments', data, 'PATCH', `id=eq.${encodeURIComponent(id)}`) : await write('appointments', data);
    if (!saved?.length) throw new Error('Der Auftrag konnte nicht gespeichert werden. Bitte die Berechtigung prüfen.');
    state.planId = ''; state.planForm = false;
    state.planWeek = planningWeekStart(eventDate); state.planSaveWarning = '';
    for (const recipientId of [employeeId,...participantIds].filter(member => !same(member,state.profile?.id))) {
      const person = teamPerson(recipientId);
      const action = id ? 'wurde geändert' : 'wurde geplant';
      try { await api('/functions/v1/mailbox-send', { method: 'POST', body: { action: 'send', recipientId, title: `Geplanter Auftrag: ${customer.name}`.slice(0, 160), message: `Hallo ${personName(person)},\n\nder Auftrag „${title}“ bei ${customer.name} am ${dateText(eventDate)} von ${start} bis ${end} Uhr ${action}.\nStatus: ${planningStatusText(meta.status)}.\n\nBitte prüfen Sie die Planungsübersicht.` } }); } catch { state.planSaveWarning = 'Die Planung ist gespeichert. Die Postfach-Benachrichtigung konnte gerade nicht gesendet werden.'; }
    }
  }
  async function saveOrder(form) {
    if (teamEnabled()) return saveTeamOrder(form);
    const id = workerId(), planId = String(form.elements.planning_id?.value || '');
    let appointment = null;
    if (planId) {
      await refreshPlanningData();
      appointment = planningRows().find(row => same(row.id, planId));
      if (!appointment || !same(appointment.employee_id, id) || appointment.event_date !== state.date) throw new Error('Die Planung wurde geändert. Bitte den Auftrag erneut aus der Planungsübersicht öffnen.');
      const existing = matchingPlanOrder(appointment);
      if (existing) { state.orderId = existing.id; state.view = 'order-detail'; state.planPrefill = null; throw new Error('Für diesen geplanten Auftrag ist bereits ein Arbeitsschein gespeichert. Sie können ihn jetzt hier bearbeiten.'); }
      if (['completed', 'cancelled'].includes(planningMeta(appointment).status)) throw new Error('Dieser geplante Auftrag ist bereits abgeschlossen oder abgesagt.');
    }
    if (locked(id)) throw new Error(lockedText(id));
    const customer = await ensureCustomer(form.elements.customer.value, id, planningCustomers(id)), value = timeValues(form), signature = signatureValues(form);
    // The appointment UUID is also the order UUID for a converted assignment.
    // The database primary key therefore prevents duplicate work orders even
    // if two devices submit the same assignment concurrently.
    const created = await write('work_orders', { ...(planId ? { id: planId } : {}), employee_id: id, work_date: state.date, customer_id: customer.id, customer_name: customer.name, title: String(form.elements.title.value || '').trim(), start_time: value.start, end_time: value.end, pause_hours: value.pause, executed_hours: value.hours, calculation_mode: 'end_time', documentation: String(form.elements.documentation.value || ''), ...signature });
    const order = created?.[0]; if (!order) throw new Error('Der Arbeitsschein konnte nicht gespeichert werden.');
    await saveMaterials(form, order); await saveHourlyMaterial(order, value.hours); await saveDocuments(form, order, id);
    if (planId) {
      if (appointment) await write('appointments', { notes: planningNotes({ ...planningMeta(appointment), status: 'completed', workOrderId: order.id }) }, 'PATCH', `id=eq.${encodeURIComponent(planId)}`);
    }
    state.orderCustomer = ''; state.planPrefill = null;
  }
  function ordersView() {
    const id = workerId(), list = state.rows.orders.filter(row => orderForEmployee(row,id) && row.work_date === state.date), selected = list.find(row => same(row.id, state.orderId)), prefill = same(state.planPrefill?.employeeId, id) && state.planPrefill?.date === state.date ? state.planPrefill : null;
    const previous = prefill?.start || dayEntries(id).at(-1)?.end_time?.slice(0, 5) || '07:30';
    const prefillEnd = prefill?.end || '';
    const newOrder = locked(id) ? `<div class="locked">${escape(lockedText(id))}</div>` : `<section class="panel"><h3>Neuer Arbeitsschein</h3>${prefill ? `<p class="plan-alert">Übernahme aus der Planung: ${escape(prefill.title)} · ${escape(prefill.start)} – ${escape(prefill.end)} Uhr</p>` : ''}<form data-form="order" class="entry-form"><input type="hidden" name="planning_id" value="${escape(prefill?.id || '')}"><label class="wide">Kunde<input name="customer" required list="customers" value="${escape(prefill?.customerName || state.orderCustomer || '')}"></label>${prefill?.customerDetails ? planningCustomerPanel(prefill.customerDetails) : ''}<label class="wide">Beschreibung<input name="title" placeholder="Ausgeführte Arbeiten" value="${escape(prefill?.title || '')}"></label><div class="wide" id="material-lines">${materialRow()}</div><button type="button" class="secondary wide" data-action="more-material">Weiteres Material</button>${teamEnabled() ? '' : `<p class="wide">Arbeitsstunden werden beim Speichern automatisch als <b>${escape(hourlyNameForEmployee(id))}</b> mit dem Preis aus der Materialliste ergänzt.</p>`}${teamOrderTimeFields(prefill?.ownerId || id,newOrderPeriods(prefill,id,previous,prefillEnd),`<label>Arbeitsbeginn${timeInput('start', previous)}</label><label>Arbeitsende${timeInput('end', prefillEnd)}</label><label>Pause in Stunden<input name="pause" type="number" min="0" step="0.25" value="0"></label><label>Ausgeführte Stunden<input name="hours" type="number" min="0.25" step="0.25" required value="${escape(prefill ? String(prefillEnd ? Math.max(0.25, Math.round(((toMinutes(prefillEnd) - toMinutes(previous)) / 60) * 4) / 4) : '') : '')}"></label>`)}${noteTemplates()}<label class="wide">Notiz / Dokumentation<textarea name="documentation" rows="4">${escape(prefill?.details || '')}</textarea></label><label class="wide">Dokumente hochladen<input name="documents" type="file" multiple accept="image/*,.pdf,.doc,.docx"></label>${signatureFields()}<button class="primary wide" data-signature-submit>${prefill?.confirmed ? 'Arbeitsschein abschließen' : 'Arbeitsschein speichern'}</button></form>${customerList()}${materialList()}</section>`;
    return `${prefill ? planningStyles() : ''}<section class="page-head"><div><span class="eyebrow">Arbeitsscheine von ${escape(worker()?.username || '')}</span><h2>${dateText(state.date)}</h2></div>${dayPicker()}</section><div data-day-plans>${plannedAssignmentsPanel(id, state.date)}</div>${selected ? orderEditor(selected) : newOrder}<section class="list-section"><h3>Arbeitsscheine des ausgewählten Tages</h3>${list.map(row => `<article class="row-card"><button type="button" class="row-main" data-action="open-order" data-id="${row.id}"><b>${escape(row.customer_name || 'Ohne Kunde')}</b><span>${dateText(row.work_date)} · ${escape(row.title || '')} · ${orderEmployeeTimeText(row,id)} · ${h(orderHours(row,id))} · Öffnen</span></button><button type="button" class="danger small" data-action="delete-order" data-id="${row.id}">Löschen</button></article>`).join('') || '<p class="empty">Keine Arbeitsscheine für diesen Tag vorhanden.</p>'}</section>`;
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const action = button.dataset.action;
    if (action === 'plan-customer-select') {
      const form = button.closest('form[data-form="planning"]'); if (!form) return;
      const customer = planningCustomers(form.elements.employee.value).find(row => same(row.id, button.dataset.id)); if (!customer) return;
      form.elements.plan_customer_id.value = customer.id; form.elements.customer.value = customer.name;
      updatePlanningCustomer(form); form.elements.customer.focus({ preventScroll: true }); return;
    }
    if (action === 'nav' && button.dataset.view === 'planning') {
      if (!state.busy) perform('', refreshPlanningData);
      return;
    }
    if (action === 'nav' && ['time', 'orders'].includes(button.dataset.view)) { syncPlanningIfVisible(); return; }
    if (action === 'plan-refresh') { if (!state.busy) perform('Planung aktualisiert.', refreshPlanningData); return; }
    if (action === 'plan-week') { state.planWeek = addDate(planningWeekStart(), n(button.dataset.days)); state.planId = ''; state.planForm = false; render(); return; }
    if (action === 'plan-today') { state.planWeek = planningWeekStart(today()); state.planId = ''; state.planForm = false; render(); return; }
    if (action === 'plan-new') { state.planId = ''; state.planForm = true; render(); revealPlanningDetail(); return; }
    if (action === 'plan-open') { state.planId = button.dataset.id; state.planForm = false; render(); revealPlanningDetail(); return; }
    if (action === 'plan-close') { state.planId = ''; state.planForm = false; render(); return; }
    if (action === 'plan-pdf-toggle') { state.planPdfForm = !state.planPdfForm; render(); return; }
    if (action === 'plan-reject' || action === 'plan-withdraw') {
      if (state.busy) return;
      const request = planningRequests().find(row=>same(row.id,button.dataset.id)); if (!request) return;
      const note = root.querySelector('[data-plan-reason]')?.value || '';
      if (!confirm(action==='plan-reject' ? 'Planungsvorschlag ablehnen?' : 'Eigenen Vorschlag zurückziehen?')) return;
      return perform(action==='plan-reject' ? 'Der Vorschlag wurde abgelehnt.' : 'Der Vorschlag wurde zurückgezogen.',async()=>{
        await api('/rest/v1/rpc/review_planning_request',{method:'POST',body:{p_id:request.id,p_revision:request.revision,p_action:action==='plan-reject'?'reject':'withdraw',p_note:note}});
        state.planId='';state.planForm=false;
      });
    }
    if (action === 'plan-delete') {
      if (!isManager() || state.busy || !confirm('Geplanten Auftrag wirklich löschen?')) return;
      return perform('Der geplante Auftrag wurde gelöscht.', async () => {
        const appointment = planningRows().find(row => same(row.id, button.dataset.id)); if (!appointment) throw new Error('Der geplante Auftrag wurde nicht gefunden.');
        await remove('appointments', `id=eq.${encodeURIComponent(appointment.id)}`); state.planId = ''; state.planForm = false;
        if (!same(appointment.employee_id, state.profile?.id)) {
          try { await api('/functions/v1/mailbox-send', { method: 'POST', body: { action: 'send', recipientId: appointment.employee_id, title: `Auftrag abgesagt: ${appointment.customer_name}`.slice(0, 160), message: `Der geplante Auftrag „${appointment.title}“ am ${dateText(appointment.event_date)} wurde entfernt.` } }); }
          catch { state.planSaveWarning = 'Der Auftrag wurde gelöscht. Die Benachrichtigung konnte gerade nicht gesendet werden.'; }
        }
      });
    }
    if (action === 'plan-confirm') {
      if (state.busy || isManager()) return;
      return perform('Der geplante Auftrag wurde bestätigt.', async () => {
        await refreshPlanningData();
        const appointment = planningRows().find(row => same(row.id, button.dataset.id));
        if (!appointment || !planEmployeeIds(appointment).includes(String(state.profile.id)) || planningMeta(appointment).status !== 'planned') throw new Error('Dieser Auftrag kann nicht mehr bestätigt werden.');
        if (locked(appointment.employee_id, appointment.event_date)) throw new Error(lockedText(appointment.employee_id, appointment.event_date));
        const confirmed = appointment.team_employee_ids?.length ? await api('/rest/v1/rpc/confirm_team_appointment',{method:'POST',body:{p_id:appointment.id}}) : (await write('appointments', { notes: planningNotes({ ...planningMeta(appointment), status: 'confirmed', customerDetails: planningCustomerInformation(appointment) }) }, 'PATCH', `id=eq.${encodeURIComponent(appointment.id)}`))?.[0];
        if (!confirmed) throw new Error('Der Auftrag konnte nicht bestätigt werden.');
        openPlanningOrder(confirmed);
      });
    }
    if (action === 'plan-start') {
      if (state.busy || !canUse('orders')) return;
      const origin = ['time', 'orders'].includes(state.view) ? state.view : 'planning';
      return perform('', async () => {
        await refreshPlanningData();
        const appointment = planningRows().find(row => same(row.id, button.dataset.id)); if (!appointment) throw new Error('Der geplante Auftrag wurde entfernt.');
        const meta = planningMeta(appointment), existing = matchingPlanOrder(appointment);
        if (!existing && (locked(appointment.employee_id, appointment.event_date) || meta.status === 'cancelled' || meta.status === 'completed')) throw new Error('Dieser Auftrag kann derzeit nicht als Arbeitsschein begonnen werden.');
        state.date = appointment.event_date; state.month = state.date.slice(0, 7); state.employeeId = isManager() ? appointment.employee_id : state.profile.id;
        state.orderOrigin = origin; state.menu = false;
        if (existing) { state.orderId = existing.id; state.view = 'order-detail'; state.planPrefill = null; return; }
        openPlanningOrder(appointment);
        state.orderOrigin = origin;
      }).then(() => {
        if (!same(state.planPrefill?.id, button.dataset.id) && state.view !== 'order-detail') return;
        const panel = root.querySelector('form[data-form="order"], form[data-form="order-edit"]')?.closest('.panel');
        if (!panel) return;
        const topbar = root.querySelector('.topbar');
        const offset = topbar && getComputedStyle(topbar).position === 'sticky' ? topbar.getBoundingClientRect().bottom + 12 : 16;
        window.scrollTo({top: Math.max(0, window.scrollY + panel.getBoundingClientRect().top - offset), behavior: 'smooth'});
      });
    }
  });
  root.addEventListener('submit', event => {
    const form = event.target;
    if (form instanceof HTMLFormElement && form.dataset.form==='planning-pdf') { event.preventDefault();if (!state.busy) perform('Die Planungs-PDF wurde erstellt.',()=>downloadPlanningPdf(form));return; }
    if (!(form instanceof HTMLFormElement) || form.dataset.form !== 'planning') return;
    event.preventDefault(); if (state.busy) return;
    const approve = event.submitter?.value === 'approve';
    perform(approve ? 'Die Planung wurde genehmigt und veröffentlicht.' : form.elements.proposal?.value==='yes' ? 'Der Planungsvorschlag wurde gespeichert und zur Freigabe eingereicht.' : 'Die Planung wurde sofort gespeichert.', () => savePlanning(form,approve)).then(() => { if (state.planSaveWarning) { notice(state.planSaveWarning); state.planSaveWarning = ''; render(); } });
  });

  root.addEventListener('input', event => {
    const form = event.target.closest('form[data-form="planning"]');
    if (form) { if (event.target.name === 'customer') updatePlanningCustomer(form); updatePlanningWarnings(form); }
    else if (event.target.name === 'customer') { updatePlanningOrderCustomer(event.target.closest('form[data-form="order"]')); updateAssignmentHint(event.target.closest('form[data-form="time"], form[data-form="order"]')); }
  });
  root.addEventListener('change', event => {
    const input = event.target;
    if (input.matches('[data-plan-week]')) { state.planWeek = planningWeekStart(input.value || today()); state.planId = ''; state.planForm = false; render(); }
    const form = input.closest('form[data-form="planning"]'); if (form) { if (['customer', 'employee'].includes(input.name)) updatePlanningCustomer(form); updatePlanningWarnings(form); }
    if (input.matches('[data-date], [data-select="employee"], [data-select="business"]')) syncPlanningIfVisible();
  });
  // Clear a conversion when the person, day, or menu changes. Do this before
  // the existing app handlers render, so another employee never gets its data.
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (button && ['nav', 'logout', 'shift-day', 'pick-day', 'create-order-from-customer', 'open-order'].includes(button.dataset.action)) state.planPrefill = null;
    if (button?.dataset.action === 'logout') { state.planId = ''; state.planForm = false; state.planWeek = ''; }
  }, true);
  root.addEventListener('change', event => {
    if (event.target.matches('[data-date], [data-select="employee"], [data-select="business"]')) state.planPrefill = null;
    if (event.target.matches('[data-select="business"]')) { state.planId = ''; state.planForm = false; }
  }, true);
  let planningSyncBusy = false;
  async function syncPlanningIfVisible() {
    if (!state.session || !['planning', 'time', 'orders'].includes(state.view) || state.busy || planningSyncBusy || document.visibilityState === 'hidden') return;
    planningSyncBusy = true;
    try {
      if(await refreshPlanningData({ifChanged:true})===false)return;
      // Preserve focus and typed values while a manager edits a planning form.
      if (['time', 'orders'].includes(state.view)) updateDayPlanningPanels();
      else if (state.view === 'planning') {
        const form = root.querySelector('form[data-form="planning"]');
        if (form) { updatePlanningWarnings(form); updatePlanningCustomer(form); } else if (!state.menu) render();
      }
    } catch { /* Keep the last verified plan during temporary network outages. */ }
    finally { planningSyncBusy = false; }
  }
  window.setInterval(syncPlanningIfVisible, 20000);
  document.addEventListener('visibilitychange', syncPlanningIfVisible);

  // Team orders are enabled only after the additive server migration is live.
  // A missing RPC never disables the existing single-employee workflow.
  async function loadTeamContext() {
    const actor = state.profile?.id, company = businessId();
    if (!actor || !company) { state.teamContext = null; return; }
    try {
      const context = await api('/rest/v1/rpc/work_order_team_context', { method: 'POST', body: { p_company: company } });
      if (same(actor, state.profile?.id) && same(company, businessId())) state.teamContext = context?.version === 1 && Array.isArray(context.roster) ? { ...context, company } : null;
    } catch {
      // A cached context may survive a temporary outage, but never a tenant switch.
      if (!same(state.teamContext?.company, company)) state.teamContext = null;
    }
  }
  function teamEnabled() { return state.teamContext?.version === 1 && same(state.teamContext.company, businessId()); }
  function teamEmployees() { return teamEnabled() ? state.teamContext.roster.filter(person => same(person.business_id, businessId())) : []; }
  function teamPerson(id) { return teamEmployees().find(person => same(person.id, id)) || state.people.find(person => same(person.id, id)) || (same(id, state.profile?.id) ? state.profile : null); }
  function orderPeriods(order) {
    return Array.isArray(order?.team_periods) && order.team_periods.length ? order.team_periods : [{ employee_id: order?.employee_id, employee_name: personName(teamPerson(order?.employee_id)), start_time: order?.start_time, end_time: order?.end_time, pause_hours: order?.pause_hours, executed_hours: order?.executed_hours }];
  }
  function orderForEmployee(order, id) { return orderPeriods(order).some(period => same(period.employee_id, id)); }
  function orderHours(order, id = '') { return orderPeriods(order).filter(period => !id || same(period.employee_id, id)).reduce((sum, period) => sum + n(period.executed_hours), 0); }
  function orderEmployeeTimeText(order,id) { return orderPeriods(order).filter(period => same(period.employee_id,id)).map(period => `${timeText(period.start_time)} – ${timeText(period.end_time)}`).join(' / '); }
  function planEmployeeIds(plan) { return [...new Set([plan?.employee_id, ...(Array.isArray(plan?.team_employee_ids) ? plan.team_employee_ids : [])].filter(Boolean).map(String))]; }
  function teamStyles() { return `<style>.team-choice{border:1px solid #d9e6e3;border-radius:12px;padding:12px;background:#f7faf9}.team-choice summary{font-weight:700;cursor:pointer}.team-choice-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;padding-top:10px}.team-choice-list label{display:flex;align-items:center;gap:9px;margin:0;padding:10px;border-radius:8px;background:white}.team-choice-list input{width:20px;height:20px;flex:none}.team-person{min-width:0;border:1px solid #d9e6e3;border-radius:12px;padding:14px;margin-bottom:12px}.team-person h4{margin:0 0 12px}.team-period{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:12px 0;border-bottom:1px solid #e5eeeb}.team-period label{min-width:0}.team-period input{width:100%;min-width:0}.team-person>.actions{margin-top:10px}.team-hint{font-size:.85rem;color:#56716c}.team-times{min-width:0}@media(min-width:900px){.team-period{grid-template-columns:repeat(4,minmax(0,1fr))}}</style>`; }
  function teamChoice(owner, selected = [], planning = false) {
    if (!teamEnabled()) return '';
    const options = teamEmployees().filter(person => !same(person.id, owner));
    return `${teamStyles()}<details class="wide team-choice" ${selected.length ? 'open' : ''}><summary>Weitere Mitarbeiter auswählen</summary><p class="team-hint">${planning ? 'Der Auftrag erscheint bei allen ausgewählten Mitarbeitern.' : 'Die Arbeitszeit wird für jeden Beteiligten separat erfasst.'}</p><div class="team-choice-list">${options.map(person => `<label><input type="checkbox" name="team_employee" value="${escape(person.id)}" ${selected.some(id => same(id, person.id)) ? 'checked' : ''} ${planning ? 'data-plan-team-choice' : 'data-order-team-choice'}>${escape(personName(person))}</label>`).join('') || '<p>Keine weiteren Mitarbeiter dieser Firma vorhanden.</p>'}</div></details>`;
  }
  function teamPeriodFields(period, primary = false) {
    const key = period.key || crypto.randomUUID(), names = primary ? { start: 'start', end: 'end', pause: 'pause', hours: 'hours' } : Object.fromEntries(['start','end','pause','hours'].map(name => [name, `team_${name}_${key}`]));
    const hours = period.executed_hours ?? (period.start_time && period.end_time ? Math.max(0, (toMinutes(period.end_time)-toMinutes(period.start_time))/60-n(period.pause_hours)) : '');
    return `<div class="team-period" data-team-period data-team-key="${escape(key)}" data-team-person="${escape(period.employee_id)}" ${primary ? 'data-team-primary' : ''}><label>Arbeitsbeginn<input type="time" step="900" name="${names.start}" data-team-time="start" required value="${escape(String(period.start_time || '').slice(0,5))}"></label><label>Arbeitsende<input type="time" step="900" name="${names.end}" data-team-time="end" required value="${escape(String(period.end_time || '').slice(0,5))}"></label><label>Pause in Stunden<input type="number" min="0" step="0.25" name="${names.pause}" data-team-time="pause" value="${n(period.pause_hours)}" required></label><label>Ausgeführte Stunden<input type="number" min="0.25" step="0.25" name="${names.hours}" data-team-time="hours" value="${escape(hours)}" required></label>${primary ? '' : '<button type="button" class="danger small" data-action="team-remove-period">Zeitabschnitt entfernen</button>'}</div>`;
  }
  function teamPersonFields(id, periods, primary = false) {
    const name = periods[0]?.employee_name || personName(teamPerson(id));
    return `<section class="team-person" data-team-employee="${escape(id)}"><h4>${escape(name || 'Mitarbeiter')}</h4><div data-person-periods>${periods.map((period,index) => teamPeriodFields(period, primary && index===0)).join('')}</div><div class="actions"><button type="button" class="secondary small" data-action="team-add-period" data-employee="${escape(id)}">+ Weiteren Zeitabschnitt hinzufügen</button></div></section>`;
  }
  function teamTimeFields(owner, initial) {
    const periods = initial?.length ? initial : [{ employee_id: owner, start_time: '07:30', end_time: '', pause_hours: 0 }];
    const people = [...new Set([owner,...periods.map(period => period.employee_id)])];
    return `<section class="wide team-times" data-team-times data-team-owner="${escape(owner)}"><p class="team-hint">Jeder Zeitabschnitt zählt nur für den angegebenen Mitarbeiter. Die passende Stundenposition und ihr Preis werden automatisch ergänzt.</p>${people.map(id => teamPersonFields(id,periods.filter(period => same(period.employee_id,id)),same(id,owner))).join('')}</section>`;
  }
  function teamOrderTimeFields(owner, initial, legacyHtml) {
    if (!teamEnabled()) return legacyHtml;
    const otherIds = [...new Set((initial || []).map(period => period.employee_id).filter(id => !same(id,owner)))];
    return teamChoice(owner,otherIds) + teamTimeFields(owner,initial);
  }
  function newOrderPeriods(prefill,id,start,end) {
    if (prefill?.timerPeriods) return prefill.timerPeriods;
    const owner=prefill?.ownerId || id, people=[owner,...(prefill?.participants || []).filter(person => !same(person,owner))];
    return people.map(employee_id => ({employee_id,start_time:start,end_time:end,pause_hours:0}));
  }
  function selectedPlanTeam(form) { return [...form.querySelectorAll('[name="team_employee"]:checked')].map(input => input.value).filter(id => !same(id,form.elements.employee.value)); }
  function collectTeamPeriods(form) {
    const blocks = [...form.querySelectorAll('[data-team-period]')], periods = [];
    if (!blocks.length) throw new Error('Die Zeitabschnitte fehlen. Bitte den Arbeitsschein erneut öffnen.');
    for (const block of blocks) {
      const value = name => block.querySelector(`[data-team-time="${name}"]`)?.value;
      const start = roundTime(value('start')), end = roundTime(value('end')), pause = Number(value('pause'));
      const hours = start && end ? (toMinutes(end)-toMinutes(start))/60-pause : NaN;
      if (!Number.isFinite(hours) || !Number.isFinite(pause) || pause<0 || pause*4%1!==0 || hours<0.25 || hours*4%1!==0 || toMinutes(end)<=toMinutes(start)) throw new Error('Bitte für jeden Mitarbeiter einen gültigen Zeitabschnitt mit Pause in Viertelstunden eingeben.');
      const period = { key: block.dataset.teamKey, employee_id: block.dataset.teamPerson, start_time:start, end_time:end, pause_hours:pause, executed_hours:hours };
      if (periods.some(previous => same(previous.employee_id,period.employee_id) && timesOverlap(previous.start_time,previous.end_time,start,end))) throw new Error('Die Zeitabschnitte eines Mitarbeiters dürfen sich nicht überschneiden.');
      periods.push(period);
    }
    const owner = form.querySelector('[data-team-times]').dataset.teamOwner;
    const selected = [owner,...form.querySelectorAll('[name="team_employee"]:checked')].map(value => typeof value==='string' ? value : value.value);
    if (selected.some(id => !periods.some(period => same(period.employee_id,id)))) throw new Error('Für jeden ausgewählten Mitarbeiter muss mindestens ein Zeitabschnitt eingetragen werden.');
    return periods;
  }
  async function saveTeamOrder(form, existing = null) {
    if (!teamEnabled()) throw new Error('Die Mehrpersonen-Buchung ist noch nicht verbunden. Bestehende Daten bleiben erhalten.');
    const planId = String(form.elements.planning_id?.value || ''), owner = existing?.employee_id || form.querySelector('[data-team-times]')?.dataset.teamOwner || workerId();
    const date = existing ? form.elements.work_date.value || existing.work_date : state.date;
    const periods = collectTeamPeriods(form), signature = signatureValues(form);
    const customer = await ensureCustomer(form.elements.customer.value,owner,planningCustomers(owner));
    if (!customer?.id) throw new Error('Der Kunde konnte nicht gespeichert werden.');
    const inputs = [...form.querySelectorAll('[name="material"]')], quantities = [...form.querySelectorAll('[name="quantity"]')], units = [...form.querySelectorAll('[name="unit"]')], items = [];
    for (let index=0; index<inputs.length; index++) {
      const material = await ensureMaterial(inputs[index].value,businessId(),units[index]?.value);
      if (material && !isHourlyMaterial(material)) items.push({ material_id:material.id, quantity:Math.max(0.25,n(quantities[index]?.value || 1)), unit:units[index]?.dataset.unitExplicit==='true' ? normalizeUnit(units[index].value) : materialUnit(material) });
    }
    const timerId=form.dataset.timerId,timerDevice=form.dataset.timerDevice;
    const saved = await api('/rest/v1/rpc/'+(timerId?(timerDevice?'save_team_work_order_from_device_timer':'save_team_work_order_from_timer'):'save_team_work_order'),{method:'POST',body:{...(timerId?{p_timer_id:timerId}:{}),...(timerDevice?{p_device:timerDevice}:{}),p_order:{ ...(existing ? {id:existing.id} : {}),employee_id:owner,work_date:date,customer_id:customer.id,title:String(form.elements.title.value || '').trim(),documentation:String(form.elements.documentation.value || ''),...signature},p_periods:periods,p_items:items,p_plan_id:planId || null}});
    const order = Array.isArray(saved) ? saved[0] : saved;
    if (!order?.id) throw new Error('Der gemeinsame Arbeitsschein konnte nicht gespeichert werden.');
    if (timerId) deviceFeatures?.timerSaved(timerId);
    state.orderCustomer=''; state.planPrefill=null; state.orderId=order.id; state.view='order-detail';
    // Core data is already committed atomically. A failed file upload never
    // causes the next attempt to create another work order.
    try { await saveDocuments(form,order,state.profile.id); }
    catch { throw new Error('Der Arbeitsschein und alle Mitarbeiterzeiten sind gespeichert. Ein Dokument konnte nicht hochgeladen werden; bitte hier erneut hinzufügen.'); }
  }
  function teamExecutionHtml(order) { return orderPeriods(order).map(period => `<div class="pdf-execution-row"><b>${escape(period.employee_name || personName(teamPerson(period.employee_id)))}</b><br>${timeText(period.start_time)} bis ${timeText(period.end_time)} · Pause ${h(period.pause_hours)} · ${h(period.executed_hours)}</div>`).join(''); }
  root.addEventListener('change',event => {
    const input=event.target, form=input.closest('form');
    if (input.matches('[data-order-team-choice]')) {
      const target=form.querySelector('[data-team-times]'), present=[...target.querySelectorAll('[data-team-employee]')].find(section => same(section.dataset.teamEmployee,input.value));
      if (!input.checked) { present?.remove(); return; }
      if (!present) {
        const start=form.elements.start.value || '07:30', end=form.elements.end.value || '', pause=n(form.elements.pause.value);
        target.insertAdjacentHTML('beforeend',teamPersonFields(input.value,[{employee_id:input.value,start_time:start,end_time:end,pause_hours:pause}]));
      }
    }
    if (input.matches('[data-plan-team-choice]')) updatePlanningWarnings(form);
    if (input.name==='employee' && form?.dataset.form==='planning' && teamEnabled()) {
      const selected=selectedPlanTeam(form), choice=form.querySelector('.team-choice');
      if (choice) { const wrapper=document.createElement('div'); wrapper.innerHTML=teamChoice(input.value,selected,true); choice.replaceWith(wrapper.querySelector('.team-choice')); }
      updatePlanningWarnings(form);
    }
    if (input.matches('[data-select="business"]')) loadTeamContext().then(() => { if (!state.busy) render(); });
  });
  root.addEventListener('input',event => {
    const input=event.target, block=input.closest('[data-team-period]');
    if (!block || block.hasAttribute('data-team-primary') || !input.dataset.teamTime) return;
    const field=name => block.querySelector(`[data-team-time="${name}"]`), start=roundTime(field('start').value), pause=n(field('pause').value);
    if (!start) return;
    if (input.dataset.teamTime==='end') {
      const end=roundTime(field('end').value); if (end) field('hours').value=Math.max(0,Math.round(((toMinutes(end)-toMinutes(start))/60-pause)*4)/4).toFixed(2);
    } else if (field('hours').value) {
      const minutes=toMinutes(start)+Math.round((n(field('hours').value)+pause)*60);
      field('end').value=minutes<1440 ? `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}` : '';
    }
  });
  root.addEventListener('click',event => {
    const button=event.target.closest('[data-action]'); if (!button) return;
    if (button.dataset.action==='team-add-period') {
      const section=button.closest('[data-team-employee]'), periods=section.querySelector('[data-person-periods]'), last=periods.lastElementChild;
      const start=last?.querySelector('[data-team-time="end"]')?.value || '07:30';
      periods.insertAdjacentHTML('beforeend',teamPeriodFields({employee_id:section.dataset.teamEmployee,start_time:start,end_time:'',pause_hours:0}));
      periods.lastElementChild.querySelector('input')?.focus();
    }
    if (button.dataset.action==='team-remove-period') {
      const block=button.closest('[data-team-period]'), section=block.closest('[data-team-employee]');
      if (section.querySelectorAll('[data-team-period]').length<2) {
        const choice=[...section.closest('form').querySelectorAll('[data-order-team-choice]')].find(input => same(input.value,section.dataset.teamEmployee));
        if (choice) { choice.checked=false; section.remove(); }
        return;
      }
      block.remove();
    }
    if (button.dataset.action==='delete-time') {
      const entry=state.rows.entries.find(row => same(row.id,button.dataset.id));
      if (entry?.team_work_order_id) {
        event.stopImmediatePropagation(); state.orderId=entry.team_work_order_id; state.orderOrigin='time'; state.view='order-detail';
        notice('Diesen Zeitabschnitt bitte im gemeinsamen Arbeitsschein entfernen. So bleiben Auftrag, Abrechnung und Mitarbeiterzeiten synchron.');
        render();
        root.querySelector('.panel')?.scrollIntoView({block:'start'});
      }
    }
  },true);

  // v857 extends existing screens without changing bookings or invoices.
  function annualDownloadPanel() {
    const report=timeAccountReport(),selected=String(state.date||today()).slice(0,4);
    return `<section class="panel pdf-download-panel"><h3>Jahresübersicht herunterladen</h3><p>${escape(personName(worker()))} · Mit Arbeitszeiten, Urlaub, Krankheit und NRW-Feiertagen. Nach Monaten sortiert.</p><form data-form="time-account-download" class="entry-form"><label>Jahr<select name="year">${report.years.map(row=>`<option value="${row.year}" ${row.year===selected?'selected':''}>${row.year}</option>`).join('')}</select></label><button class="primary">PDF auf Gerät herunterladen</button><p class="wide" role="status" data-download-status></p></form></section>`;
  }
  async function downloadAnnualPdf(form) {
    const button=form.querySelector('button'),message=form.querySelector('[data-download-status]');
    if(button.disabled)return;
    button.disabled=true;message.textContent='PDF wird erstellt …';
    try {
      const year=timeAccountReport().years.find(row=>row.year===form.elements.year.value);
      if(!year)throw new Error('Bitte ein verfügbares Jahr auswählen.');
      const company=managerBusiness(),person=personName(worker()),data={year:structuredClone(year),person,company:company?.company_name||'Zeiterfassung'};
      data.logoBytes=await planningLogoBytes(company);
      const bytes=await window.DevicePdf.createTimeAccount(data);
      window.DevicePdf.download(bytes,`Jahresübersicht_${person}_${year.year}.pdf`);
      message.textContent='PDF wurde zum Herunterladen an das Gerät übergeben.';
    } catch(error) { message.textContent=error.message||'PDF konnte nicht erstellt werden. Bitte erneut versuchen.'; }
    finally { button.disabled=false; }
  }
  const settingsBeforeV857=settingsView;
  settingsView=()=>{const html=settingsBeforeV857(),end=html.indexOf('</section>')+10;return html.slice(0,end)+annualDownloadPanel()+html.slice(end);};
  const offersFeature=window.OffersFeature?.create({state,root,escape,n,same,lower,isManager,businessId,managerBusiness,api,allRows,render:()=>render(),chooseSimilar,normalizeUnit,materialUnit,unitSelect,customers:()=>planningCustomers(businessId()),today,dateText,logoBytes:planningLogoBytes});
  if(offersFeature){
    const menusBeforeV857=menuItems,viewBeforeV857=viewHtml,reloadBeforeV857=reload,renderBeforeV857=render;
    menuItems=()=>{const items=menusBeforeV857();if(isManager())items.splice(items.findIndex(row=>row[0]==='materials'),0,['offers','Angebote',true]);return items;};
    viewHtml=()=>state.view==='offers'?offersFeature.view():viewBeforeV857();
    reload=async()=>{await reloadBeforeV857();await offersFeature.load();};
    render=()=>{renderBeforeV857();offersFeature.setup();};
    offersFeature.bind();
  }
  root.addEventListener('submit',event=>{if(event.target.dataset.form!=='time-account-download')return;event.preventDefault();event.stopImmediatePropagation();downloadAnnualPdf(event.target);},true);
})();
