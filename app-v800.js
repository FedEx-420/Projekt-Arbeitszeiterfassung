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
    rows: { entries: [], orders: [], items: [], customers: [], days: [], vacations: [], messages: [], attachments: [], recipients: [], materials: [], appointments: [], payslips: [], documents: [] }
  };

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
    if (state.session?.access_token) headers.Authorization = `Bearer ${state.session.access_token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}${path}`, { method: options.method || 'GET', headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    const text = await response.text(); const body = parse(text);
    if (!response.ok) throw new Error(body?.error || body?.message || body?.error_description || 'Die Anfrage konnte nicht verarbeitet werden.');
    return body;
  }
  const rows = (table, query = 'select=*') => api(`/rest/v1/${table}?${query}`);
  const write = (table, data, method = 'POST', query = '') => api(`/rest/v1/${table}${query ? `?${query}` : ''}`, { method, body: data, headers: { Prefer: 'return=representation' } });
  const remove = (table, query) => api(`/rest/v1/${table}?${query}`, { method: 'DELETE' });
  const account = (action, payload = {}) => api('/functions/v1/account-management', { method: 'POST', body: { action, ...payload } });
  const flow = (action, payload = {}) => api('/functions/v1/vacation-workflow', { method: 'POST', body: { action, ...payload } });
  async function upload(bucket, path, file) {
    const response = await fetch(`${base}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${state.session.access_token}`, 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }, body: file });
    if (!response.ok) throw new Error('Die Datei konnte nicht hochgeladen werden.');
  }
  const publicObjectUrl = (bucket, path) => path ? `${base}/storage/v1/object/public/${bucket}/${String(path).split('/').map(encodeURIComponent).join('/')}` : '';
  async function download(bucket, path, name) {
    const response = await fetch(`${base}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, { headers: { apikey: key, Authorization: `Bearer ${state.session.access_token}` } });
    if (!response.ok) throw new Error('Die Datei konnte nicht heruntergeladen werden.');
    const url = URL.createObjectURL(await response.blob()), link = document.createElement('a'); link.href = url; link.download = name || 'Datei'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function removeStoredFile(bucket, path) {
    const response = await fetch(`${base}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${state.session.access_token}` } });
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
  async function login(username, password, company, administratorLogin = false) {
    const name = String(username || '').trim();
    if (name.length < 3 || name.length > 80 || /[\u0000-\u001F\u007F]/.test(name)) throw new Error('Bitte einen gültigen Benutzernamen eingeben. Leerzeichen innerhalb des Namens sind erlaubt.');
    if (!administratorLogin && !loginCompanyKey(company || '')) throw new Error('Bitte die Firma eingeben. Nur das Administratorkonto meldet sich ohne Firma an.');
    let data = null, lastError = null;
    for (const email of loginEmails(name, company, administratorLogin)) {
      try { data = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }); break; }
      catch (error) { lastError = error; }
    }
    if (!data) throw lastError || new Error('Firma, Benutzername oder Passwort sind nicht korrekt.');
    state.session = data;
    const own = await rows('profiles', `select=role&id=eq.${encodeURIComponent(data.user.id)}`), role = own?.[0]?.role;
    if ((administratorLogin && role !== 'administrator') || (!administratorLogin && role === 'administrator')) {
      try { await api('/auth/v1/logout', { method: 'POST' }); } catch { /* Session wird anschließend lokal verworfen. */ }
      state.session = null;
      throw new Error(administratorLogin ? 'Dieses Konto ist kein Administratorkonto.' : 'Das Administratorkonto meldet sich ohne Firma an.');
    }
    state.view = 'home'; state.menu = false; state.customerId = ''; state.customerSearch = ''; state.orderId = ''; state.timeEntryId = ''; state.billingKey = ''; state.vacationForm = false; state.composeMessage = false;
    localStorage.setItem(storage, JSON.stringify(data)); await loadApp();
  }
  function logout() { state.session = null; state.profile = null; state.businessBrand = null; localStorage.removeItem(storage); render(); }

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
      state.session = null; state.profile = null; localStorage.removeItem(storage); notice(error.message || 'Die Anmeldung ist fehlgeschlagen.', true);
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
      return row.work_order_id || !state.rows.orders.some(order => sameWorkTime(row, order));
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

  function loginView() { return `<main class="login-page"><section class="login-card"><div class="brand-mark">ZE</div><h1>Zeiterfassung</h1><p>Arbeitszeiten einfach und sicher erfassen.</p><form data-form="login"><label>Firma<input name="company" autocomplete="organization" placeholder="Firmenname" required></label><label>Benutzername<input name="username" autocomplete="username" required></label><label>Passwort<input name="password" type="password" autocomplete="current-password" required></label><label class="login-admin"><input name="administrator_login" type="checkbox"> Anmeldung als Administrator (nur dann ohne Firma)</label><button class="primary" ${state.busy ? 'disabled' : ''}>Anmelden</button></form><button class="link-button" type="button" data-action="forgot">Passwort vergessen?</button>${noticeHtml()}</section></main>`; }
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
    const dayOrders = state.rows.orders.filter(row => same(row.employee_id, id) && row.work_date === state.date);
    const manualEntries = dayEntries(id).filter(row => !row.work_order_id);
    const activityCards = [
      ...dayOrders.map(row => `<article class="row-card"><button type="button" class="row-main" data-action="open-order" data-id="${row.id}"><b>${escape(row.customer_name || 'Ohne Kunde')}</b><span>${escape(row.title || 'Arbeitsschein')} · ${timeText(row.start_time)} – ${timeText(row.end_time)} · Arbeitsschein öffnen</span></button></article>`),
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
    return `<section class="page-head"><div><span class="eyebrow">Zeiterfassung von ${escape(worker()?.username || '')}</span><h2>${dateText(state.date)}</h2></div>${dayPicker()}</section>${detail}${form}<section class="list-section"><h3>Einträge des Tages</h3>${cards}</section>`;
  }

  function materialRow(item = {}) { return `<div class="material-row"><label>Material<input name="material" list="materials" value="${escape(item.position_name || item.name || '')}"></label><label>Stückzahl<input name="quantity" type="number" min="0.25" step="0.25" value="${escape(item.quantity || 1)}"></label></div>`; }
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
    return `<section class="panel"><div class="page-head"><div><span class="eyebrow">Arbeitsschein bearbeiten</span><h3>${escape(order.customer_name || 'Ohne Kunde')}</h3></div><div class="actions">${invoiceButton}<button type="button" class="secondary small" data-action="order-pdf" data-id="${order.id}">PDF drucken / speichern</button><button type="button" class="danger small" data-action="delete-order" data-id="${order.id}">Arbeitsschein löschen</button><button type="button" class="secondary small" data-action="close-order">Schließen</button></div></div><form data-form="order-edit" class="entry-form"><input type="hidden" name="id" value="${order.id}">${orderDatePicker(order.work_date)}<label class="wide">Kunde<input name="customer" required list="customers" value="${escape(order.customer_name || '')}"></label><label class="wide">Beschreibung<input name="title" value="${escape(order.title || '')}"></label><div class="wide" id="material-lines">${rows}</div><button type="button" class="secondary wide" data-action="more-material">Weiteres Material</button><p class="wide">Arbeitsstunden werden beim Speichern automatisch als <b>${escape(hourlyNameForEmployee(order.employee_id))}</b> mit dem Preis aus der Materialliste ergänzt.</p><label>Arbeitsbeginn${timeInput('start', order.start_time?.slice(0, 5))}</label><label>Arbeitsende${timeInput('end', order.end_time?.slice(0, 5))}</label><label>Pause in Stunden<input name="pause" type="number" min="0" step="0.25" value="${n(order.pause_hours)}"></label><label>Ausgeführte Stunden<input name="hours" type="number" min="0.25" step="0.25" value="${n(order.executed_hours)}" required></label>${noteTemplates()}<label class="wide">Notiz / Dokumentation<textarea name="documentation" rows="4">${escape(order.documentation || '')}</textarea></label><label class="wide">Weitere Dokumente hochladen<input name="documents" type="file" multiple accept="image/*,.pdf,.doc,.docx"></label>${documents.length ? `<p class="wide">Vorhandene Dokumente: ${documents.map(document => escape(document.file_name)).join(', ')}</p>` : ''}${signatureFields(order)}<button class="primary wide" data-signature-submit>Änderungen speichern</button></form>${customerList()}${materialList()}</section>`;
  }
  function orderDetailView() { const order = state.rows.orders.find(row => same(row.id, state.orderId)); return order ? orderEditor(order) : `<section class="panel"><h2>Arbeitsschein nicht gefunden</h2><p>Der Arbeitsschein ist nicht mehr verfügbar.</p><button type="button" class="secondary" data-action="close-order">Zurück</button></section>`; }
  function ordersView() {
    const id = workerId(), list = state.rows.orders.filter(row => same(row.employee_id, id) && row.work_date === state.date);
    const previous = dayEntries(id).at(-1)?.end_time?.slice(0, 5) || '07:30';
    const selected = list.find(row => same(row.id, state.orderId));
    const newOrder = locked(id) ? `<div class="locked">${escape(lockedText(id))}</div>` : `<section class="panel"><h3>Neuer Arbeitsschein</h3><form data-form="order" class="entry-form"><label class="wide">Kunde<input name="customer" required list="customers" value="${escape(state.orderCustomer || '')}"></label><label class="wide">Beschreibung<input name="title" placeholder="Ausgeführte Arbeiten"></label><div class="wide" id="material-lines">${materialRow()}</div><button type="button" class="secondary wide" data-action="more-material">Weiteres Material</button><p class="wide">Arbeitsstunden werden beim Speichern automatisch als <b>${escape(hourlyNameForEmployee(id))}</b> mit dem Preis aus der Materialliste ergänzt.</p><label>Arbeitsbeginn${timeInput('start', previous)}</label><label>Arbeitsende${timeInput('end', '')}</label><label>Pause in Stunden<input name="pause" type="number" min="0" step="0.25" value="0"></label><label>Ausgeführte Stunden<input name="hours" type="number" min="0.25" step="0.25" required></label>${noteTemplates()}<label class="wide">Notiz / Dokumentation<textarea name="documentation" rows="4"></textarea></label><label class="wide">Dokumente hochladen<input name="documents" type="file" multiple accept="image/*,.pdf,.doc,.docx"></label>${signatureFields()}<button class="primary wide" data-signature-submit>Arbeitsschein speichern</button></form>${customerList()}${materialList()}</section>`;
    return `<section class="page-head"><div><span class="eyebrow">Arbeitsscheine von ${escape(worker()?.username || '')}</span><h2>${dateText(state.date)}</h2></div>${dayPicker()}</section>${selected ? orderEditor(selected) : newOrder}<section class="list-section"><h3>Arbeitsscheine des ausgewählten Tages</h3>${list.map(row => `<article class="row-card"><button type="button" class="row-main" data-action="open-order" data-id="${row.id}"><b>${escape(row.customer_name || 'Ohne Kunde')}</b><span>${dateText(row.work_date)} · ${escape(row.title || '')} · ${timeText(row.start_time)} – ${timeText(row.end_time)} · ${h(row.executed_hours)} · Öffnen</span></button><button type="button" class="danger small" data-action="delete-order" data-id="${row.id}">Löschen</button></article>`).join('') || '<p class="empty">Keine Arbeitsscheine für diesen Tag vorhanden.</p>'}</section>`;
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
      const hasOrder = state.rows.orders.some(row => same(row.employee_id, id) && row.work_date === date);
      const classes = ['month-day', date.slice(0, 7) === state.month ? '' : 'outside', date === state.date ? 'selected' : '', holiday ? 'holiday' : '', isSick ? 'sick' : '', isApproved ? 'approved' : '', isRequested ? 'requested' : '', hasOrder ? 'has-order' : ''].join(' ');
      const flags = `${holiday ? `<i class="flag-holiday">${escape(holiday)}</i>` : ''}${isSick ? '<i class="flag-sick">Krank</i>' : ''}${isApproved ? '<i class="flag-approved">Urlaub</i>' : ''}${isRequested ? '<i class="flag-requested">Beantragt</i>' : ''}${hasOrder ? '<i class="flag-order">Arbeitsschein</i>' : ''}`;
      const label = [dateText(date), holiday ? `${holiday} in NRW` : '', isSick ? 'Krankheitstag' : '', isApproved ? 'Urlaub genehmigt' : '', isRequested ? 'Urlaub beantragt' : '', hasOrder ? 'Arbeitsschein vorhanden' : ''].filter(Boolean).join(', ');
      return `<button type="button" class="${classes}" data-action="pick-day" data-date="${date}" aria-label="${escape(label)}"><b>${Number(date.slice(-2))}</b><span class="day-flags">${flags}</span></button>`;
    }).join('');
    const records = state.rows.orders.filter(row => same(row.employee_id, id) && row.work_date === state.date);
    const manualEntries = dayEntries(id).filter(row => !row.work_order_id);
    const recordCards = [
      ...records.map(row => `<article class="row-card"><button type="button" class="row-main" data-action="open-order" data-id="${row.id}"><b>${escape(row.customer_name)}</b><span>${escape(row.title || '')} · ${h(row.executed_hours)} · Arbeitsschein öffnen</span></button></article>`),
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
    return '<input type="hidden" name="id" value="' + escape(material.id) + '"><label>Artikel<input name="name" required value="' + escape(material.name) + '"></label><label>Preis in €<input name="price" type="number" min="0" step="0.01" value="' + n(material.unit_price) + '"></label>';
  }
  function materialsView() {
    const materials = state.rows.materials.filter(row => same(row.business_id, businessId()) && row.active !== false);
    const others = materials.filter(row => !isHourlyMaterial(row));
    const selected = others.find(row => same(row.id, state.materialId));
    const hourlyCards = HOURLY_MATERIALS.map(name => materials.find(row => lower(row.name) === lower(name))).filter(Boolean).map(material => '<section class="panel"><h3>' + escape(material.name) + '</h3><p>Wird nach der in den Einstellungen hinterlegten Arbeitskraft des Mitarbeiters automatisch in den Arbeitsschein übernommen. Die Position kann nicht gelöscht oder umbenannt werden.</p><form data-form="hourly-price" class="entry-form"><input type="hidden" name="id" value="' + escape(material.id) + '"><label>Preis pro ' + escape(material.name) + ' in €<input name="price" type="number" min="0" step="0.01" value="' + n(material.unit_price) + '"></label><button class="primary">Preis speichern</button></form></section>').join('');
    const list = others.map(row => '<article class="row-card"><div><b>' + escape(row.name) + '</b><span>' + n(row.unit_price).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }) + '</span></div><div class="actions"><button type="button" class="secondary small" data-action="edit-material" data-id="' + escape(row.id) + '">Bearbeiten</button><button type="button" class="danger small" data-action="delete-material" data-id="' + escape(row.id) + '">Löschen</button></div></article>').join('') || '<p class="empty">Keine weiteren Materialien vorhanden.</p>';
    const editor = selected
      ? '<section class="panel"><section class="page-head"><div><span class="eyebrow">Materialliste</span><h3>Material bearbeiten</h3></div><button type="button" class="secondary small" data-action="close-material-edit">Abbrechen</button></section><form data-form="material-edit" class="entry-form">' + materialEditFields(selected) + '<button class="primary wide">Änderungen speichern</button></form><p>Preis- und Namensänderungen werden nur auf offene, noch nicht abgerechnete Arbeitsscheine übertragen.</p></section>'
      : '';
    return '<section class="page-head"><div><span class="eyebrow">Material</span><h2>Materialliste</h2></div></section>' + hourlyCards + '<section class="panel"><h3>Neues Material</h3><form data-form="material" class="entry-form"><label>Artikel<input name="name" required></label><label>Preis in €<input name="price" type="number" min="0" step="0.01" value="0"></label><button class="primary">Artikel speichern</button></form></section><section class="list-section"><h3>Vorhandene Materialien</h3>' + list + '</section>' + editor;
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
    const combinedDetails = group.orders.map(row => { const materials = state.rows.items.filter(item => same(item.work_order_id, row.id)); return `<div class="row-card"><div><b>${dateText(row.work_date)} · ${escape(row.title || 'Arbeitsschein')}</b><span>${timeText(row.start_time)} – ${timeText(row.end_time)} · Pause ${h(row.pause_hours)} · ${h(row.executed_hours)}</span>${row.documentation ? `<p>${escape(row.documentation)}</p>` : ''}${materials.length ? `<p><b>Material:</b> ${materials.map(item => `${escape(item.position_name)} (${n(item.quantity).toLocaleString('de-DE')})`).join(', ')}</p>` : ''}</div></div>`; }).join('');
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
  async function ensureCustomer(value, employee) {
    const name = String(value || '').trim(); if (!name) throw new Error('Bitte einen Kunden eingeben.');
    const current = state.rows.customers.find(row => lower(row.name) === lower(name));
    if (current) return current;
    const selected = chooseSimilar(name, state.rows.customers, 'Kunden'); if (selected) return selected;
    const created = await write('customers', { employee_id: employee, name, custom_fields: {} });
    return created?.[0] || { id: null, name };
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
    return created?.[0] || null;
  }
  async function ensureMaterial(value, targetBusinessId = businessId()) {
    const name = String(value || '').trim(); if (!name) return null;
    const current = state.rows.materials.find(row => same(row.business_id, targetBusinessId) && lower(row.name) === lower(name));
    if (current) return current;
    const selected = chooseSimilar(name, state.rows.materials.filter(row => same(row.business_id, targetBusinessId) && row.active !== false), 'Artikel'); if (selected) return selected;
    const created = await write('materials', { business_id: targetBusinessId, name, unit_price: 0, active: true });
    return created?.[0] || null;
  }
  async function saveMaterials(form, order, replace = false) {
    const targetBusinessId = materialBusinessId(order.employee_id);
    const materials = [...form.querySelectorAll('[name="material"]')], quantities = [...form.querySelectorAll('[name="quantity"]')];
    const resolved = []; for (let index = 0; index < materials.length; index++) { const material = await ensureMaterial(materials[index].value, targetBusinessId); if (material && !isHourlyMaterial(material)) resolved.push({ material, quantity: Math.max(0.25, n(quantities[index]?.value || 1)) }); }
    if (replace) await remove('work_order_items', `work_order_id=eq.${encodeURIComponent(order.id)}`);
    for (const item of resolved) await write('work_order_items', { work_order_id: order.id, material_id: item.material.id, position_name: item.material.name, quantity: item.quantity, unit_price: n(item.material.unit_price) });
  }
  async function saveHourlyMaterial(order, hours) {
    const name = hourlyNameForEmployee(order.employee_id);
    const material = await ensureHourlyMaterial(name, materialBusinessId(order.employee_id));
    if (!material?.id) throw new Error('Die Stundenposition konnte nicht angelegt werden.');
    await write('work_order_items', { work_order_id: order.id, material_id: material.id, position_name: name, quantity: Math.max(0.25, n(hours)), unit_price: n(material.unit_price) });
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
    await write('materials', { unit_price: price }, 'PATCH', 'id=eq.' + material.id);
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
    await write('materials', { name, unit_price: price }, 'PATCH', 'id=eq.' + material.id);
    const openOrderIds = new Set(state.rows.orders.filter(order => !order.invoiced).map(order => order.id));
    for (const item of state.rows.items.filter(item => same(item.material_id, material.id) && openOrderIds.has(item.work_order_id))) await write('work_order_items', { position_name: name, unit_price: price }, 'PATCH', 'id=eq.' + item.id);
    state.materialId = '';
  }
  async function saveDocuments(form, order, employee) {
    for (const file of [...(form.elements.documents?.files || [])]) { const safe = file.name.replace(/[^A-Za-z0-9._-]/g, '_'); const path = `${employee}/${order.id}-${Date.now()}-${safe}`; await upload('work-order-documents', path, file); await write('work_order_documents', { work_order_id: order.id, employee_id: employee, file_path: path, file_name: file.name, mime_type: file.type || null }); }
  }
  async function deleteWorkOrderCompletely(orderId) {
    const id = String(orderId || '');
    if (!id) throw new Error('Der Arbeitsschein wurde nicht gefunden.');
    const documents = state.rows.documents.filter(document => same(document.work_order_id, id));
    for (const document of documents) await removeStoredFile('work-order-documents', document.file_path);
    const query = `work_order_id=eq.${encodeURIComponent(id)}`;
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
    if (button) button.disabled = !signedBy || !signatureData.startsWith('data:image/png;base64,') || signatureData.length < 200;
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
  async function updateOrder(form) { const order = state.rows.orders.find(row => same(row.id, form.elements.id.value)); if (!order) throw new Error('Der Arbeitsschein wurde nicht gefunden.'); const id = order.employee_id, workDate = form.elements.work_date.value || order.work_date; if (workDate !== order.work_date && locked(id, workDate)) throw new Error(lockedText(id, workDate)); const customer = await ensureCustomer(form.elements.customer.value, id), value = timeValues(form), signature = signatureValues(form); const changes = { customer_id: customer.id, customer_name: customer.name, title: String(form.elements.title.value || '').trim(), start_time: value.start, end_time: value.end, pause_hours: value.pause, executed_hours: value.hours, calculation_mode: 'end_time', documentation: String(form.elements.documentation.value || ''), ...signature }; if (workDate !== order.work_date) changes.work_date = workDate; await write('work_orders', changes, 'PATCH', `id=eq.${encodeURIComponent(order.id)}`); await saveMaterials(form, order, true); await saveHourlyMaterial(order, value.hours); await saveDocuments(form, order, id); state.orderId = ''; state.view = state.orderOrigin || 'orders'; }
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
    if (action === 'open-order') { const order = state.rows.orders.find(row => same(row.id, button.dataset.id)); if (!order) return; const person = state.rows.people.find(row => same(row.id, order.employee_id)); if (isAdmin() && person?.business_id) state.businessId = person.business_id; state.employeeId = order.employee_id; state.date = order.work_date; state.month = state.date.slice(0, 7); state.orderId = order.id; state.timeEntryId = ''; state.orderOrigin = ['invoices', 'invoices-paid', 'billing-detail'].includes(state.view) ? state.view : 'orders'; state.view = 'order-detail'; state.menu = false; render(); return; }
    if (action === 'open-time') {
      const entry = state.rows.entries.find(row => same(row.id, button.dataset.id));
      if (!entry) return;
      const linkedOrder = entry.work_order_id && state.rows.orders.find(order => same(order.id, entry.work_order_id));
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
      login: () => login(form.elements.username.value, form.elements.password.value, form.elements.company.value, form.elements.administrator_login?.checked === true),
      time: () => saveTime(form), order: () => saveOrder(form), 'order-edit': () => updateOrder(form), customer: () => saveCustomer(form),
      material: () => { if (isHourlyMaterial(form.elements.name.value)) throw new Error('Diese geschützte Stundenposition ist bereits vorhanden.'); return write('materials', { business_id: businessId(), name: String(form.elements.name.value || '').trim(), unit_price: n(form.elements.price.value), active: true }); },
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
    const employeeInfo = order => { const person = state.rows.people.find(row => same(row.id, order.employee_id)); return { name: person?.display_name || person?.username || 'Mitarbeiter nicht verfügbar', time: `${timeText(order.start_time)} – ${timeText(order.end_time)}`, hours: h(order.executed_hours) }; };
    const executionRows = group.orders.map(order => { const employee = employeeInfo(order); return `<div class="pdf-execution-row"><b>${escape(employee.name)}</b><br><span class="pdf-muted">${dateText(order.work_date)} · ${escape(employee.time)} · ${escape(employee.hours)}</span></div>`; }).join('');
    const itemRows = group.orders.flatMap(order => { const employee = employeeInfo(order), orderItems = state.rows.items.filter(item => same(item.work_order_id, order.id)), items = orderItems.length ? orderItems : [{ position_name: order.title || 'Arbeitsleistung', quantity: n(order.executed_hours), unit_price: 0 }]; return items.map(item => { const price = invoiceItemPrice(item, order), name = invoiceItemName(item, order), hourly = isHourlyMaterial(name); return `<tr><td>${dateText(order.work_date)}</td><td><b>${escape(name)}</b>${hourly ? '<span class="pdf-tag">Arbeitszeit</span>' : ''}<small>${escape(employee.name)} · ${escape(employee.time)}${order.title ? ` · ${escape(order.title)}` : ''}</small></td><td class="number">${n(item.quantity).toLocaleString('de-DE')}</td><td class="number">${money(price)}</td><td class="number">${money(n(item.quantity) * price)}</td></tr>`; }); }).join('');
    const total = group.orders.reduce((sum, order) => sum + state.rows.items.filter(item => same(item.work_order_id, order.id)).reduce((itemSum, item) => itemSum + n(item.quantity) * invoiceItemPrice(item, order), 0), 0);
    const windowRef = window.open('', '_blank'); if (!windowRef) throw new Error('Bitte Pop-ups erlauben, um die Rechnung als PDF zu erstellen.');
    windowRef.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Rechnung ${escape(invoiceNumber)}</title><style>${pdfStyles()}</style></head><body><main class="pdf-page">${pdfBrandHeader('Rechnung', invoiceNumber, company)}<section class="pdf-grid"><article class="pdf-card"><span class="pdf-card-label">Rechnung an</span><b>${escape([fields.first_name, customerName].filter(Boolean).join(' ') || customerName)}</b>${customerAddress.length ? `<br>${customerAddress.map(escape).join('<br>')}` : ''}</article><article class="pdf-card"><span class="pdf-card-label">Rechnungsdaten</span>Ausgestellt am ${dateText(today())}<br>Leistungszeitraum: ${dateText(first?.work_date)}${same(first?.work_date, last?.work_date) ? '' : ` bis ${dateText(last?.work_date)}`}<br>${group.orders.length} Arbeitsschein(e)</article></section><section class="pdf-execution"><b>Ausführung durch</b>${executionRows}</section><section class="pdf-section"><h2>Leistungen und Material</h2><table class="pdf-table"><thead><tr><th>Datum</th><th>Position / Ausführung</th><th class="number">Menge</th><th class="number">Einzelpreis</th><th class="number">Gesamt</th></tr></thead><tbody>${itemRows}</tbody></table></section><div class="pdf-total"><b>Rechnungsbetrag</b><b>${money(total)}</b></div><p class="pdf-note">Diese Rechnung wurde automatisch aus ${group.orders.length} Arbeitsschein(en) erstellt.</p></main></body></html>`);
    windowRef.document.close(); addPdfReturnBar(windowRef); return windowRef;
  }
  function printBillingPdf(key, invoiced) {
    const group = invoiceGroups(invoiced).find(item => same(item.key, key)); if (!group) throw new Error('Die Abrechnung wurde nicht gefunden.');
    const money = value => n(value).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    const detailRows = group.orders.map(order => { const person = state.rows.people.find(row => same(row.id, order.employee_id)), employeeName = person?.display_name || person?.username || 'Mitarbeiter nicht verfügbar', items = state.rows.items.filter(item => same(item.work_order_id, order.id)); const rows = items.length ? items.map(item => { const price = invoiceItemPrice(item, order), name = invoiceItemName(item, order); return `<tr><td>${escape(name)}${isHourlyMaterial(name) ? '<span class="pdf-tag">Arbeitszeit</span>' : ''}</td><td class="number">${n(item.quantity).toLocaleString('de-DE')}</td><td class="number">${money(price)}</td><td class="number">${money(n(item.quantity) * price)}</td></tr>`; }).join('') : '<tr><td colspan="4" class="pdf-empty">Kein Material erfasst.</td></tr>'; return `<section class="pdf-section"><h2>${dateText(order.work_date)} · ${escape(order.title || 'Arbeitsnachweis')}</h2><div class="pdf-card"><b>${escape(employeeName)}</b><br><span class="pdf-muted">${timeText(order.start_time)} bis ${timeText(order.end_time)} · Pause ${h(order.pause_hours)} · ${h(order.executed_hours)}</span>${order.documentation ? `<br><br><b>Dokumentation</b><br>${escape(order.documentation).replace(/\n/g, '<br>')}` : ''}</div><table class="pdf-table"><thead><tr><th>Leistung / Material</th><th class="number">Menge</th><th class="number">Einzelpreis</th><th class="number">Gesamt</th></tr></thead><tbody>${rows}</tbody></table></section>`; }).join('');
    const totalHours = group.orders.reduce((sum, order) => sum + n(order.executed_hours), 0), totalMaterial = group.orders.reduce((sum, order) => sum + state.rows.items.filter(item => same(item.work_order_id, order.id)).reduce((itemSum, item) => itemSum + n(item.quantity) * invoiceItemPrice(item, order), 0), 0);
    const windowRef = window.open('', '_blank'); if (!windowRef) throw new Error('Bitte Pop-ups erlauben, um die PDF zu erstellen.');
    windowRef.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Arbeitsnachweis</title><style>${pdfStyles()}</style></head><body><main class="pdf-page">${pdfBrandHeader('Arbeitsnachweis', invoiced ? 'Bereits abgerechnet' : 'Offen zur Abrechnung')}<section class="pdf-grid"><article class="pdf-card"><span class="pdf-card-label">Kunde</span><b>${escape(group.customerName)}</b></article><article class="pdf-card"><span class="pdf-card-label">Übersicht</span>${group.orders.length} Arbeitsschein(e)<br>${h(totalHours)} Arbeitszeit</article></section>${detailRows}<div class="pdf-total"><b>Gesamtsumme</b><b>${money(totalMaterial)}</b></div><p class="pdf-note">Dieser Arbeitsnachweis fasst alle enthaltenen Arbeitsscheine mit Material- und Stundenpositionen zusammen.</p></main><script>window.onload=()=>window.print()<\/script></body></html>`); windowRef.document.close(); addPdfReturnBar(windowRef);
  }
  function printOrderPdf(orderId) {
    const order = state.rows.orders.find(row => same(row.id, orderId)); if (!order) throw new Error('Der Arbeitsschein wurde nicht gefunden.');
    const person = state.rows.people.find(row => same(row.id, order.employee_id)) || worker(), items = state.rows.items.filter(item => same(item.work_order_id, order.id)), money = value => n(value).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    const materialRows = items.map(item => { const price = invoiceItemPrice(item, order), name = invoiceItemName(item, order); return `<tr><td><b>${escape(name)}</b>${isHourlyMaterial(name) ? '<span class="pdf-tag">Arbeitszeit</span>' : ''}</td><td class="number">${n(item.quantity).toLocaleString('de-DE')}</td><td class="number">${money(price)}</td><td class="number">${money(n(item.quantity) * price)}</td></tr>`; }).join('');
    const total = items.reduce((sum, item) => sum + n(item.quantity) * invoiceItemPrice(item, order), 0), documentation = String(order.documentation || '').trim(), employeeName = person?.display_name || person?.username || 'Mitarbeiter';
    const signature = String(order.signature_data || ''), signatureSection = signature.startsWith('data:image/png;base64,') ? `<section class="pdf-section"><h2>Unterschrift</h2><article class="pdf-card"><img src="${escape(signature)}" alt="Unterschrift" style="display:block;width:min(100%,380px);height:120px;object-fit:contain;object-position:left;border-bottom:1px solid #d9e6e3;margin-bottom:9px"><b>Unterschrieben von:</b> ${escape(order.signed_by || '—')}</article></section>` : '';
    const windowRef = window.open('', '_blank'); if (!windowRef) throw new Error('Bitte Pop-ups erlauben, um die PDF zu erstellen.');
    windowRef.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Arbeitsnachweis</title><style>${pdfStyles()}</style></head><body><main class="pdf-page">${pdfBrandHeader('Arbeitsnachweis', dateText(order.work_date))}<section class="pdf-grid"><article class="pdf-card"><span class="pdf-card-label">Kunde</span><b>${escape(order.customer_name || 'Ohne Kunde')}</b><br>${escape(order.title || 'Ohne Beschreibung')}</article><article class="pdf-card"><span class="pdf-card-label">Ausgeführt von</span><b>${escape(employeeName)}</b><br>${timeText(order.start_time)} bis ${timeText(order.end_time)} · Pause ${h(order.pause_hours)}<br>${h(order.executed_hours)} ausgeführte Stunden</article></section>${documentation ? `<section class="pdf-section"><h2>Dokumentation</h2><article class="pdf-card">${escape(documentation).replace(/\n/g, '<br>')}</article></section>` : ''}${signatureSection}<section class="pdf-section"><h2>Leistungen und Material</h2>${items.length ? `<table class="pdf-table"><thead><tr><th>Position</th><th class="number">Menge</th><th class="number">Einzelpreis</th><th class="number">Gesamt</th></tr></thead><tbody>${materialRows}</tbody></table>` : '<p class="pdf-empty">Keine Positionen erfasst.</p>'}</section><div class="pdf-total"><b>Gesamtsumme</b><b>${money(total)}</b></div><p class="pdf-note">Monteur- und Aushilfsstunden erscheinen als Arbeitszeitpositionen mit ihrem jeweiligen Preis.</p></main><script>window.onload=()=>window.print()<\/script></body></html>`); windowRef.document.close(); addPdfReturnBar(windowRef);
  }
  function printPdf() {
    const person = worker(), id = workerId(), ownEntries = effectiveTimeEntries(id), totalHours = ownEntries.reduce((sum, row) => sum + n(row.executed_hours), 0);
    const lines = ownEntries.map(row => `<tr><td>${dateText(row.work_date)}</td><td>${escape(row.customer_name)}</td><td>${timeText(row.start_time)}</td><td>${timeText(row.end_time)}</td><td class="number">${h(row.pause_hours)}</td><td class="number">${h(row.executed_hours)}</td></tr>`).join('');
    const windowRef = window.open('', '_blank'); if (!windowRef) throw new Error('Bitte Pop-ups erlauben, um die PDF zu erstellen.');
    windowRef.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Zeiterfassungsnachweis</title><style>${pdfStyles()}</style></head><body><main class="pdf-page">${pdfBrandHeader('Zeiterfassungsnachweis', state.date.slice(0, 4))}<section class="pdf-grid"><article class="pdf-card"><span class="pdf-card-label">Mitarbeiter</span><b>${escape(person?.display_name || person?.username || '')}</b></article><article class="pdf-card"><span class="pdf-card-label">Jahresübersicht</span>${h(totalHours)} Arbeitsstunden<br>${h(overtime(id))} Überstunden<br>${vacationLeft(id)} Urlaubstage übrig · ${annualSick(id)} Krankheitstage</article></section><section class="pdf-section"><h2>Erfasste Zeiten</h2><table class="pdf-table"><thead><tr><th>Datum</th><th>Kunde</th><th>Von</th><th>Bis</th><th class="number">Pause</th><th class="number">Stunden</th></tr></thead><tbody>${lines || '<tr><td colspan="6" class="pdf-empty">Keine Zeiterfassungen vorhanden.</td></tr>'}</tbody></table></section><p class="pdf-note">Automatisch aus der Arbeitszeiterfassung erstellt.</p></main><script>window.onload=()=>window.print()<\/script></body></html>`); windowRef.document.close(); addPdfReturnBar(windowRef);
  }
  function render() { if (!root) return; if (!base || !key) { root.innerHTML = '<main class="login-page"><section class="login-card"><h1>Zeiterfassung</h1><p>Die App-Konfiguration fehlt.</p></section></main>'; return; } root.innerHTML = state.session && state.profile ? appView() : loginView(); setupCustomerSearch(); setupSignaturePads(); }
  window.addEventListener('unhandledrejection', event => { event.preventDefault(); notice('Die Aktion konnte nicht ausgeführt werden. Bitte erneut versuchen.', true); render(); });
  state.session = parse(localStorage.getItem(storage) || localStorage.getItem('zeiterfassung-session-v700'));
  if (state.session?.access_token) loadApp(); else render();
})();

