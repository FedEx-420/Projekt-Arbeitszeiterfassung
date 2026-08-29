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
    businessId: '', employeeId: '', customerId: '', materialId: '', orderId: '', orderCustomer: '', orderOrigin: 'orders', billingKey: '', billingMode: 'open', menu: false, vacationForm: false, appointmentForm: false, notice: null, busy: false,
    rows: { entries: [], orders: [], items: [], customers: [], days: [], vacations: [], messages: [], materials: [], appointments: [], payslips: [], documents: [] }
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
  async function download(bucket, path, name) {
    const response = await fetch(`${base}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, { headers: { apikey: key, Authorization: `Bearer ${state.session.access_token}` } });
    if (!response.ok) throw new Error('Die Datei konnte nicht heruntergeladen werden.');
    const url = URL.createObjectURL(await response.blob()), link = document.createElement('a'); link.href = url; link.download = name || 'Datei'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function loginCompanyKey(value) { return lower(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48); }
  function loginEmails(username, company) {
    const name = String(username || '').trim().toLowerCase(); const key = loginCompanyKey(company || '');
    return [...new Set([key ? `${name}--${key}@arbeitszeit.local` : '', `${name}@arbeitszeit.local`].filter(Boolean))];
  }
  async function login(username, password, company) {
    const name = String(username || '').trim();
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(name)) throw new Error('Bitte einen gültigen Benutzernamen eingeben.');
    let data = null, lastError = null;
    for (const email of loginEmails(name, company)) {
      try { data = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }); break; }
      catch (error) { lastError = error; }
    }
    if (!data) throw lastError || new Error('Firma, Benutzername oder Passwort sind nicht korrekt.');
    state.session = data; localStorage.setItem(storage, JSON.stringify(data)); await loadApp();
  }
  function logout() { state.session = null; state.profile = null; localStorage.removeItem(storage); render(); }

  async function loadApp() {
    if (!state.session?.user?.id) return render();
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
    await Promise.all([
      load('people', 'profiles'), load('entries', 'time_entries', 'select=*&order=work_date.desc,created_at.desc'), load('orders', 'work_orders', 'select=*&order=work_date.desc,created_at.desc'),
      load('items', 'work_order_items'), load('customers', 'customers', 'select=*&order=name.asc'), load('days', 'work_days'), load('vacations', 'vacation_requests', 'select=*&order=created_at.desc'),
      load('messages', 'mailbox_messages', 'select=*&order=created_at.desc'), load('materials', 'materials', 'select=*&order=name.asc'), load('appointments', 'appointments'),
      load('payslips', 'employee_payslips', 'select=*&order=created_at.desc'), load('documents', 'work_order_documents')
    ]);
    state.people = state.rows.people;
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
  function managerBusiness() { return businesses().find(person => same(person.id, businessId())) || (isBusiness() ? state.profile : null); }
  function dayEntries(id = workerId(), date = state.date) { return state.rows.entries.filter(row => same(row.employee_id, id) && row.work_date === date); }
  function dayHours(id = workerId(), date = state.date) { return dayEntries(id, date).reduce((sum, row) => sum + n(row.executed_hours), 0); }
  function dateAt(year, month, day) { return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
  function addDate(date, days) { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); }
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
  function overtime(id = workerId()) { const year = state.date.slice(0, 4), days = new Map(); dayEntries(id); state.rows.entries.filter(row => same(row.employee_id, id) && row.work_date.startsWith(year)).forEach(row => days.set(row.work_date, n(days.get(row.work_date)) + n(row.executed_hours))); return [...days].reduce((sum, [date, value]) => sum + value - dueHours(date), 0); }

  function loginView() { return `<main class="login-page"><section class="login-card"><div class="brand-mark">ZE</div><h1>Zeiterfassung</h1><p>Arbeitszeiten einfach und sicher erfassen.</p><form data-form="login"><label>Firma<input name="company" autocomplete="organization" placeholder="Firmenname (bei Administrator leer lassen)"></label><label>Benutzername<input name="username" autocomplete="username" required></label><label>Passwort<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" ${state.busy ? 'disabled' : ''}>Anmelden</button></form><button class="link-button" type="button" data-action="forgot">Passwort vergessen?</button>${noticeHtml()}</section></main>`; }
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

  function homeView() { const id = workerId(), extra = overtime(id); return `<section class="page-head"><div><span class="eyebrow">Willkommen, ${escape(worker()?.username || '')}</span><h2>${dateText(state.date)}</h2></div><label class="date-field">Tag<input type="date" data-date value="${state.date}"></label></section><section class="stat-grid"><article><span>Überstunden ${state.date.slice(0, 4)}</span><strong class="${extra > 0 ? 'positive' : extra < 0 ? 'negative' : ''}">${extra ? h(extra) : '—'}</strong></article><article><span>Urlaub übrig</span><strong>${vacationLeft(id)} Tage</strong></article><article><span>Krankheitstage</span><strong>${annualSick(id)} Tage</strong></article></section><section class="panel"><h3>Ausgewählter Arbeitstag</h3><p>${locked(id) ? lockedText(id) : dayEntries(id).length ? `${h(dayHours(id))} Arbeitszeit erfasst.` : 'Für diesen Tag wurde noch keine Arbeitszeit erfasst.'}</p></section>`; }
  function timeInput(name, value) { return `<input name="${name}" type="time" step="900" value="${value || ''}">`; }
  function customerList() { return `<datalist id="customers">${state.rows.customers.map(row => `<option value="${escape(row.name)}"></option>`).join('')}</datalist>`; }
  function timeView() { const id = workerId(), list = dayEntries(id), previous = list.at(-1)?.end_time?.slice(0, 5) || '07:30'; return `<section class="page-head"><div><span class="eyebrow">Zeiterfassung von ${escape(worker()?.username || '')}</span><h2>${dateText(state.date)}</h2></div><label class="date-field">Tag<input type="date" data-date value="${state.date}"></label></section>${locked(id) ? `<div class="locked">${escape(lockedText(id))}</div>` : `<section class="panel"><h3>Arbeitszeit hinzufügen</h3><form data-form="time" class="entry-form"><label class="wide">Kunde<input name="customer" required list="customers"></label><label>Arbeitsbeginn${timeInput('start', previous)}</label><label>Arbeitsende${timeInput('end', '')}</label><label>Pause in Stunden<input name="pause" type="number" min="0" step="0.25" value="0"></label><label>Ausgeführte Stunden<input name="hours" type="number" min="0.25" step="0.25" required></label><button class="primary wide">Speichern</button></form>${customerList()}</section>`}<section class="list-section"><h3>Einträge des Tages</h3>${list.map(row => `<article class="row-card"><div><b>${escape(row.customer_name)}</b><span>${timeText(row.start_time)} – ${timeText(row.end_time)} · ${h(row.executed_hours)}</span></div><button type="button" class="danger small" data-action="delete-time" data-id="${row.id}">Löschen</button></article>`).join('') || '<p class="empty">Keine Einträge vorhanden.</p>'}</section>`; }

  function materialRow(item = {}) { return `<div class="material-row"><label>Material<input name="material" list="materials" value="${escape(item.position_name || item.name || '')}"></label><label>Stückzahl<input name="quantity" type="number" min="0.25" step="0.25" value="${escape(item.quantity || 1)}"></label></div>`; }
  function materialList() { return `<datalist id="materials">${state.rows.materials.filter(row => row.active !== false).map(row => `<option value="${escape(row.name)}"></option>`).join('')}</datalist>`; }
  function hourlyTypeButtons(value) {
    const selected = isAushilfsstunde(value) ? 'Aushilfsstunde' : 'Monteurstunde';
    const monteurClass = selected === 'Monteurstunde' ? 'primary' : 'secondary';
    const aushilfsClass = selected === 'Aushilfsstunde' ? 'primary' : 'secondary';
    return '<div class="wide"><span class="field-label">Stundenart</span><input type="hidden" name="hourly_type" value="' + selected + '"><div class="actions"><button type="button" class="' + monteurClass + ' small" data-action="hourly-type" data-type="Monteurstunde">Monteurstunden</button><button type="button" class="' + aushilfsClass + ' small" data-action="hourly-type" data-type="Aushilfsstunde">Aushilfsstunden</button></div></div>';
  }
  function hourlyTypeForOrder(order) {
    return state.rows.items.some(item => same(item.work_order_id, order.id) && isAushilfsstunde(item.position_name)) ? 'Aushilfsstunde' : 'Monteurstunde';
  }
  function orderEditor(order) {
    if (!order) return '';
    const items = state.rows.items.filter(item => same(item.work_order_id, order.id));
    const documents = state.rows.documents.filter(document => same(document.work_order_id, order.id));
    const rows = items.length ? items.map(materialRow).join('') : materialRow();
    return `<section class="panel"><div class="page-head"><div><span class="eyebrow">Arbeitsschein bearbeiten</span><h3>${escape(order.customer_name || 'Ohne Kunde')}</h3></div><div class="actions"><button type="button" class="secondary small" data-action="order-pdf" data-id="${order.id}">PDF drucken / speichern</button><button type="button" class="secondary small" data-action="close-order">Schließen</button></div></div><form data-form="order-edit" class="entry-form"><input type="hidden" name="id" value="${order.id}"><label>Datum<input name="work_date" type="date" value="${order.work_date}"></label><label class="wide">Kunde<input name="customer" required list="customers" value="${escape(order.customer_name || '')}"></label><label class="wide">Beschreibung<input name="title" value="${escape(order.title || '')}"></label><div class="wide" id="material-lines">${rows}</div><button type="button" class="secondary wide" data-action="more-material">Weiteres Material</button>${hourlyTypeButtons(hourlyTypeForOrder(order))}<label>Arbeitsbeginn${timeInput('start', order.start_time?.slice(0, 5))}</label><label>Arbeitsende${timeInput('end', order.end_time?.slice(0, 5))}</label><label>Pause in Stunden<input name="pause" type="number" min="0" step="0.25" value="${n(order.pause_hours)}"></label><label>Ausgeführte Stunden<input name="hours" type="number" min="0.25" step="0.25" value="${n(order.executed_hours)}" required></label><label class="wide">Dokumentation<textarea name="documentation" rows="4">${escape(order.documentation || '')}</textarea></label><label class="wide">Weitere Dokumente hochladen<input name="documents" type="file" multiple accept="image/*,.pdf,.doc,.docx"></label>${documents.length ? `<p class="wide">Vorhandene Dokumente: ${documents.map(document => escape(document.file_name)).join(', ')}</p>` : ''}<button class="primary wide">Änderungen speichern</button></form>${customerList()}${materialList()}</section>`;
  }
  function orderDetailView() { const order = state.rows.orders.find(row => same(row.id, state.orderId)); return order ? orderEditor(order) : `<section class="panel"><h2>Arbeitsschein nicht gefunden</h2><p>Der Arbeitsschein ist nicht mehr verfügbar.</p><button type="button" class="secondary" data-action="close-order">Zurück</button></section>`; }
  function ordersView() {
    const id = workerId(), list = state.rows.orders.filter(row => same(row.employee_id, id) && (isManager() || row.work_date === state.date));
    const previous = dayEntries(id).at(-1)?.end_time?.slice(0, 5) || '07:30';
    const selected = list.find(row => same(row.id, state.orderId));
    const newOrder = locked(id) ? `<div class="locked">${escape(lockedText(id))}</div>` : `<section class="panel"><h3>Neuer Arbeitsschein</h3><form data-form="order" class="entry-form"><label class="wide">Kunde<input name="customer" required list="customers" value="${escape(state.orderCustomer || '')}"></label><label class="wide">Beschreibung<input name="title" placeholder="Ausgeführte Arbeiten"></label><div class="wide" id="material-lines">${materialRow()}</div><button type="button" class="secondary wide" data-action="more-material">Weiteres Material</button>${hourlyTypeButtons('Monteurstunde')}<label>Arbeitsbeginn${timeInput('start', previous)}</label><label>Arbeitsende${timeInput('end', '')}</label><label>Pause in Stunden<input name="pause" type="number" min="0" step="0.25" value="0"></label><label>Ausgeführte Stunden<input name="hours" type="number" min="0.25" step="0.25" required></label><label class="wide">Dokumentation<textarea name="documentation" rows="4"></textarea></label><label class="wide">Dokumente hochladen<input name="documents" type="file" multiple accept="image/*,.pdf,.doc,.docx"></label><button class="primary wide">Arbeitsschein speichern</button></form>${customerList()}${materialList()}</section>`;
    return `<section class="page-head"><div><span class="eyebrow">Arbeitsscheine von ${escape(worker()?.username || '')}</span><h2>${isManager() ? 'Alle Arbeitsscheine' : dateText(state.date)}</h2></div><label class="date-field">Tag<input type="date" data-date value="${state.date}"></label></section>${selected ? orderEditor(selected) : newOrder}<section class="list-section"><h3>Gespeicherte Arbeitsscheine</h3>${list.map(row => `<article class="row-card"><button type="button" class="row-main" data-action="open-order" data-id="${row.id}"><b>${escape(row.customer_name || 'Ohne Kunde')}</b><span>${dateText(row.work_date)} · ${escape(row.title || '')} · ${timeText(row.start_time)} – ${timeText(row.end_time)} · ${h(row.executed_hours)} · Öffnen</span></button><button type="button" class="danger small" data-action="delete-order" data-id="${row.id}">Löschen</button></article>`).join('') || '<p class="empty">Keine Arbeitsscheine vorhanden.</p>'}</section>`;
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
    return `<section class="page-head"><div><span class="eyebrow">Kalender von ${escape(worker()?.username || '')}</span><h2>${dateText(state.date)}</h2></div><label class="date-field">Tag<input type="date" data-date value="${state.date}"></label></section><section class="stat-grid"><article><span>Überstunden</span><strong>${dayEntries(id).length ? h(dayHours(id) - dueHours(state.date)) : '—'}</strong></article><article><span>Urlaub</span><strong>${vacation(id) ? 'Genehmigt' : '—'}</strong></article><article><span>Krank</span><strong>${sick(id) ? 'Ja' : '—'}</strong></article></section><section class="panel calendar-panel"><div class="calendar-head"><button type="button" aria-label="Vorheriger Monat" data-action="month" data-value="-1">‹</button><h3>${monthText(state.month)}</h3><button type="button" aria-label="Nächster Monat" data-action="month" data-value="1">›</button></div><div class="calendar-legend"><span class="legend-order">Arbeitsschein</span><span class="legend-requested">Urlaub beantragt</span><span class="legend-approved">Urlaub genehmigt</span><span class="legend-sick">Krankheitstag</span><span class="legend-holiday">Feiertag NRW</span></div><div class="month-grid"><span class="weekday">Mo</span><span class="weekday">Di</span><span class="weekday">Mi</span><span class="weekday">Do</span><span class="weekday">Fr</span><span class="weekday">Sa</span><span class="weekday">So</span>${grid}</div><div class="actions"><button type="button" class="secondary" data-action="sick">${sick(id) ? 'Krankheitstag entfernen' : 'Krank melden'}</button><button type="button" class="primary" data-action="vacation-form">Urlaub beantragen</button></div></section>${state.vacationForm ? `<section class="panel"><h3>Urlaub beantragen</h3><form data-form="vacation" class="entry-form"><label>Von<input name="start" type="date" required value="${state.date}"></label><label>Bis<input name="end" type="date" required value="${state.date}"></label><button class="primary">Antrag senden</button></form></section>` : ''}<section class="list-section"><h3>Durchgeführt</h3>${nrwHoliday(state.date) ? `<p class="locked">${escape(nrwHoliday(state.date))} in NRW</p>` : ''}${records.map(row => `<article class="row-card"><div><b>${escape(row.customer_name)}</b><span>${escape(row.title || '')} · ${h(row.executed_hours)}</span></div></article>`).join('') || '<p class="empty">Für diesen Tag existiert kein Arbeitsschein.</p>'}</section>`;
  }

  function customerFields(customer) { const fields = customer?.custom_fields || {}; return `<input type="hidden" name="id" value="${customer?.id || ''}"><label>Firmenname<input name="name" required value="${escape(customer?.name || '')}"></label><label>Vorname<input name="first_name" value="${escape(fields.first_name || '')}"></label><label>Straße<input name="street" value="${escape(fields.street || '')}"></label><label>Hausnummer<input name="house_no" value="${escape(fields.house_no || '')}"></label><label>Ort<input name="city" value="${escape(fields.city || '')}"></label><label>Postleitzahl<input name="postal_code" value="${escape(fields.postal_code || '')}"></label><label>Telefon privat<input name="phone_private" value="${escape(fields.phone_private || '')}"></label><label>Telefon mobil<input name="phone_mobile" value="${escape(fields.phone_mobile || '')}"></label><label class="wide">E-Mail-Adresse<input name="email" type="email" value="${escape(fields.email || '')}"></label><label class="wide">Zusätzliche Angaben (eine Zeile je Feld)<textarea name="extra" rows="3">${escape(Object.entries(fields).filter(([name]) => name.startsWith('extra_')).map(([, value]) => value).join('\n'))}</textarea></label>`; }

  function customersView() {
    const selected = state.rows.customers.find(row => same(row.id, state.customerId));
    const list = state.rows.customers.map(row => {
      const total = state.rows.entries.filter(entry => same(entry.customer_id, row.id)).reduce((sum, entry) => sum + n(entry.executed_hours), 0);
      const removeButton = isManager() ? '<button type="button" class="danger small" data-action="delete-customer" data-id="' + escape(row.id) + '">Löschen</button>' : '';
      return '<article class="row-card"><button type="button" class="row-main" data-action="customer" data-id="' + escape(row.id) + '"><b>' + escape(row.name) + '</b><span>' + h(total) + ' gesamt</span></button>' + removeButton + '</article>';
    }).join('') || '<p class="empty">Noch keine Kunden angelegt.</p>';
    const edit = selected || state.customerId === 'new'
      ? '<section class="panel" id="customer-profile" tabindex="-1"><h3>' + (selected ? 'Kunde bearbeiten' : 'Neuer Kunde') + '</h3><form data-form="customer" class="entry-form">' + customerFields(selected) + '<button class="primary wide">Kunde speichern</button></form>' + (selected ? '<button type="button" class="secondary wide" data-action="create-order-from-customer" data-id="' + escape(selected.id) + '">Arbeitsschein erstellen</button>' : '') + '</section>'
      : '';
    return '<section class="page-head"><div><span class="eyebrow">Gemeinsame Daten</span><h2>Kundenliste</h2></div><button type="button" class="secondary" data-action="new-customer">Kunde hinzufügen</button></section>' + edit + '<section class="list-section">' + list + '</section>';
  }
  function mailboxView() { const messages = state.rows.messages.filter(row => !row.deleted_at); return `<section class="page-head"><div><span class="eyebrow">Persönlich</span><h2>Postfach</h2></div></section><section class="message-list">${messages.map(message => { const body = message.body || {}; const decision = message.message_type === 'vacation_request' && isManager() ? `<div class="actions"><button type="button" class="primary small" data-action="vacation-decision" data-id="${message.id}" data-request="${escape(body.request_id || '')}" data-status="approved">Genehmigen</button><button type="button" class="secondary small" data-action="vacation-decision" data-id="${message.id}" data-request="${escape(body.request_id || '')}" data-status="rejected">Ablehnen</button></div>` : ''; return `<article class="message ${message.read_at ? 'read' : 'unread'}"><header><b>${escape(message.title)}</b><time>${new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(message.created_at))}</time></header><p>${escape(body.message || body.note || (body.start_date ? `${dateText(body.start_date)} bis ${dateText(body.end_date)}` : ''))}</p>${decision}<div class="message-actions">${!message.read_at ? `<button type="button" data-action="read" data-id="${message.id}">Als gelesen markieren</button>` : ''}<button type="button" data-action="trash" data-id="${message.id}">Löschen</button></div></article>`; }).join('') || '<p class="empty">Keine Nachrichten vorhanden.</p>'}</section>`; }

  function materialEditFields(material) {
    return '<input type="hidden" name="id" value="' + escape(material.id) + '"><label>Artikel<input name="name" required value="' + escape(material.name) + '"></label><label>Preis in €<input name="price" type="number" min="0" step="0.01" value="' + n(material.unit_price) + '"></label>';
  }
  function materialsView() {
    const materials = state.rows.materials.filter(row => same(row.business_id, businessId()) && row.active !== false);
    const others = materials.filter(row => !isHourlyMaterial(row));
    const selected = others.find(row => same(row.id, state.materialId));
    const hourlyCards = HOURLY_MATERIALS.map(name => materials.find(row => lower(row.name) === lower(name))).filter(Boolean).map(material => '<section class="panel"><h3>' + escape(material.name) + '</h3><p>Wird im Arbeitsschein als auswählbare Stundenart verwendet und kann nicht gelöscht oder umbenannt werden.</p><form data-form="hourly-price" class="entry-form"><input type="hidden" name="id" value="' + escape(material.id) + '"><label>Preis pro ' + escape(material.name) + ' in €<input name="price" type="number" min="0" step="0.01" value="' + n(material.unit_price) + '"></label><button class="primary">Preis speichern</button></form></section>').join('');
    const list = others.map(row => '<article class="row-card"><div><b>' + escape(row.name) + '</b><span>' + n(row.unit_price).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }) + '</span></div><div class="actions"><button type="button" class="secondary small" data-action="edit-material" data-id="' + escape(row.id) + '">Bearbeiten</button><button type="button" class="danger small" data-action="delete-material" data-id="' + escape(row.id) + '">Löschen</button></div></article>').join('') || '<p class="empty">Keine weiteren Materialien vorhanden.</p>';
    const editor = selected
      ? '<section class="panel"><section class="page-head"><div><span class="eyebrow">Materialliste</span><h3>Material bearbeiten</h3></div><button type="button" class="secondary small" data-action="close-material-edit">Abbrechen</button></section><form data-form="material-edit" class="entry-form">' + materialEditFields(selected) + '<button class="primary wide">Änderungen speichern</button></form><p>Preis- und Namensänderungen werden nur auf offene, noch nicht abgerechnete Arbeitsscheine übertragen.</p></section>'
      : '';
    return '<section class="page-head"><div><span class="eyebrow">Material</span><h2>Materialliste</h2></div></section>' + hourlyCards + '<section class="panel"><h3>Neues Material</h3><form data-form="material" class="entry-form"><label>Artikel<input name="name" required></label><label>Preis in €<input name="price" type="number" min="0" step="0.01" value="0"></label><button class="primary">Artikel speichern</button></form></section><section class="list-section"><h3>Vorhandene Materialien</h3>' + list + '</section>' + editor;
  }
  function invoiceGroups(invoiced) {
    const groups = {};
    state.rows.orders.filter(row => Boolean(row.invoiced) === invoiced).forEach(row => { const key = row.customer_id || `name:${lower(row.customer_name || 'Ohne Kunde')}`; (groups[key] ||= { key, customerName: row.customer_name || 'Ohne Kunde', orders: [] }).orders.push(row); });
    return Object.values(groups).map(group => ({ ...group, hours: group.orders.reduce((sum, row) => sum + n(row.executed_hours), 0) })).sort((a, b) => String(a.customerName).localeCompare(String(b.customerName), 'de'));
  }
  function billingListView(invoiced) {
    const groups = invoiceGroups(invoiced), title = invoiced ? 'Abgerechnete Arbeitsscheine' : 'Abrechnungen Kunden';
    const empty = invoiced ? 'Noch keine Arbeitsscheine abgerechnet.' : 'Alle Arbeitsscheine sind abgerechnet.';
    return `<section class="page-head"><div><span class="eyebrow">Abrechnung</span><h2>${title}</h2></div></section><section class="list-section">${groups.map(group => `<article class="row-card"><button type="button" class="row-main" data-action="open-billing" data-key="${escape(group.key)}" data-mode="${invoiced ? 'paid' : 'open'}"><b>${escape(group.customerName)}</b><span>${group.orders.length} ${invoiced ? 'abgerechnete' : 'offene'} Arbeitsscheine · ${h(group.hours)} · Zusammengefasst öffnen</span></button></article>`).join('') || `<p class="empty">${empty}</p>`}</section>`;
  }
  function invoicesView() { return billingListView(false); }
  function paidInvoicesView() { const orders = state.rows.orders.filter(row => Boolean(row.invoiced)).sort((a, b) => String(b.work_date).localeCompare(String(a.work_date))); return `<section class="page-head"><div><span class="eyebrow">Abrechnung</span><h2>Abgerechnete Arbeitsscheine</h2></div></section><section class="list-section">${orders.map(row => `<article class="row-card"><button type="button" class="row-main" data-action="open-order" data-id="${row.id}"><b>${escape(row.customer_name || 'Ohne Kunde')}</b><span>${dateText(row.work_date)} · ${escape(row.title || 'Arbeitsschein')} · ${h(row.executed_hours)} · Öffnen</span></button></article>`).join('') || '<p class="empty">Noch keine Arbeitsscheine abgerechnet.</p>'}</section>`; }
  function billingDetailView() {
    const invoiced = state.billingMode === 'paid', group = invoiceGroups(invoiced).find(item => same(item.key, state.billingKey));
    if (!group) return `<section class="panel"><h2>Abrechnung nicht gefunden</h2><button type="button" class="secondary" data-action="close-billing">Zurück</button></section>`;
    const total = group.orders.reduce((sum, row) => sum + n(row.executed_hours), 0);
    const combinedDetails = group.orders.map(row => { const materials = state.rows.items.filter(item => same(item.work_order_id, row.id)); return `<div class="row-card"><div><b>${dateText(row.work_date)} · ${escape(row.title || 'Arbeitsschein')}</b><span>${timeText(row.start_time)} – ${timeText(row.end_time)} · Pause ${h(row.pause_hours)} · ${h(row.executed_hours)}</span>${row.documentation ? `<p>${escape(row.documentation)}</p>` : ''}${materials.length ? `<p><b>Material:</b> ${materials.map(item => `${escape(item.position_name)} (${n(item.quantity).toLocaleString('de-DE')})`).join(', ')}</p>` : ''}</div></div>`; }).join('');
    return `<section class="page-head"><div><span class="eyebrow">${invoiced ? 'Bereits abgerechnet' : 'Ein gemeinsamer offener Arbeitsschein'}</span><h2>${escape(group.customerName)}</h2><p>${group.orders.length} zusammengefügte Einträge · ${h(total)}</p></div><div class="actions"><button type="button" class="secondary" data-action="billing-pdf">PDF drucken / speichern</button><button type="button" class="secondary" data-action="close-billing">Zurück</button></div></section><section class="panel"><h3>Gesamter Arbeitsschein</h3>${combinedDetails}</section>${invoiced ? '' : `<section class="panel"><button type="button" class="primary" data-action="invoice-group">Gesamten Arbeitsschein als abgerechnet markieren</button></section>`}`;
  }

  function permissionFields(person) { return [['time','Zeiterfassung'],['customers','Kunden'],['orders','Arbeitsscheine'],['calendar','Kalender']].map(([id, title]) => `<label><input type="checkbox" name="perm-${id}" ${person?.menu_permissions?.[id] !== false ? 'checked' : ''}> ${title}</label>`).join(''); }
  function settingsView() {
    if (!isManager()) return `<section class="page-head"><div><span class="eyebrow">Mein Konto</span><h2>Einstellungen</h2></div></section><section class="panel"><p>Benutzername und Passwort werden durch die Geschäftsverwaltung festgelegt.</p><button type="button" class="secondary" data-action="pdf">Daten als PDF drucken</button></section>`;
    const person = worker(), business = managerBusiness();
    const own = `<section class="panel"><h3>Mein Benutzerkonto</h3><form data-form="self" class="entry-form"><label>Benutzername<input name="username" value="${escape(state.profile.username)}"></label><label>Neues Passwort<input name="password" type="password" minlength="8" placeholder="Nur bei Änderung"></label><label>Urlaubsanspruch pro Jahr<input name="allowance" type="number" min="0" step="0.5" value="${n(state.profile.vacation_allowance)}"></label>${isBusiness() ? `<label>Firma<input name="company" value="${escape(state.profile.company_name || '')}"></label>` : ''}<button class="primary">Eigenes Konto speichern</button></form></section>`;
    const employee = person?.role === 'employee' ? `<section class="panel"><h3>Mitarbeiter bearbeiten: ${escape(person.username)}</h3><form data-form="employee-credentials" class="entry-form"><label>Benutzername<input name="username" value="${escape(person.username)}"></label><label>Neues Passwort<input name="password" type="password" minlength="8" placeholder="Nur bei Änderung"></label><button class="secondary">Benutzername und Passwort speichern</button></form><form data-form="employee-permissions" class="entry-form"><div class="wide permissions">${permissionFields(person)}</div><button class="secondary wide">Menüfreigaben speichern</button></form><form data-form="employee-vacation" class="entry-form"><label>Urlaubsanspruch pro Jahr<input name="allowance" type="number" min="0" step="0.5" value="${n(person.vacation_allowance)}"></label><button class="secondary">Urlaubsanspruch speichern</button></form><div class="actions"><button type="button" class="danger" data-action="delete-employee" data-id="${person.id}">Mitarbeiter löschen</button></div></section>` : '<section class="panel"><p>Bitte einen Mitarbeiter in der Auswahl oben auswählen.</p></section>';
    const newEmployee = businessId() ? `<section class="panel"><h3>Mitarbeiter hinzufügen</h3><form data-form="employee-new" class="entry-form"><label>Benutzername<input name="username" required></label><label>Passwort<input name="password" type="password" minlength="8" required></label><label>Urlaubsanspruch pro Jahr<input name="allowance" type="number" min="0" step="0.5" value="30"></label><div class="wide permissions">${permissionFields({})}</div><button class="primary wide">Mitarbeiter anlegen</button></form></section>` : '';
    const newBusiness = isAdmin() ? `<section class="panel"><h3>Neues Geschäftskonto</h3><form data-form="business-new" class="entry-form"><label>Firma<input name="company" required></label><label>Benutzername<input name="username" required></label><label>Passwort<input name="password" type="password" minlength="8" required></label><button class="primary">Geschäftskonto anlegen</button></form></section>${business ? `<section class="panel"><h3>Ausgewähltes Geschäftskonto</h3><form data-form="business-update" class="entry-form"><label>Firma<input name="company" value="${escape(business.company_name || '')}"></label><label>Benutzername<input name="username" value="${escape(business.username)}"></label><label>Neues Passwort<input name="password" type="password" minlength="8" placeholder="Nur bei Änderung"></label><button class="secondary">Geschäftskonto speichern</button></form><button type="button" class="danger" data-action="delete-business" data-id="${business.id}">Geschäftskonto löschen</button></section>` : ''}` : '';
    return `<section class="page-head"><div><span class="eyebrow">Verwaltung</span><h2>Einstellungen</h2></div><button type="button" class="secondary" data-action="pdf">Daten als PDF drucken</button></section>${own}${newBusiness}${newEmployee}${employee}`;
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
  const HOURLY_MATERIALS = ['Monteurstunde', 'Aushilfsstunde'];
  function hourlyName(value) { return lower(typeof value === 'string' ? value : value?.name) === 'aushilfsstunde' ? 'Aushilfsstunde' : 'Monteurstunde'; }
  function isHourlyMaterial(material) { return HOURLY_MATERIALS.some(name => lower(name) === lower(typeof material === 'string' ? material : material?.name)); }
  function isMonteurstunde(material) { return hourlyName(material) === 'Monteurstunde' && lower(typeof material === 'string' ? material : material?.name) === 'monteurstunde'; }
  function isAushilfsstunde(material) { return hourlyName(material) === 'Aushilfsstunde'; }
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
  async function saveHourlyMaterial(order, hours, type) {
    const name = hourlyName(type);
    const material = await ensureHourlyMaterial(name, materialBusinessId(order.employee_id));
    if (!material?.id) throw new Error('Die Stundenposition konnte nicht angelegt werden.');
    await write('work_order_items', { work_order_id: order.id, material_id: material.id, position_name: name, quantity: Math.max(0.25, n(hours)), unit_price: n(material.unit_price) });
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
  async function saveTime(form) { const id = workerId(); if (locked(id)) throw new Error(lockedText(id)); const customer = await ensureCustomer(form.elements.customer.value, id); const value = timeValues(form); await write('time_entries', { employee_id: id, work_date: state.date, customer_id: customer.id, customer_name: customer.name, start_time: value.start, end_time: value.end, pause_hours: value.pause, executed_hours: value.hours, calculation_mode: 'end_time' }); }
  async function saveOrder(form) { const id = workerId(); if (locked(id)) throw new Error(lockedText(id)); const customer = await ensureCustomer(form.elements.customer.value, id); const value = timeValues(form); const created = await write('work_orders', { employee_id: id, work_date: state.date, customer_id: customer.id, customer_name: customer.name, title: String(form.elements.title.value || '').trim(), start_time: value.start, end_time: value.end, pause_hours: value.pause, executed_hours: value.hours, calculation_mode: 'end_time', documentation: String(form.elements.documentation.value || '') }); const order = created?.[0]; if (!order) throw new Error('Der Arbeitsschein konnte nicht gespeichert werden.'); await saveMaterials(form, order); await saveHourlyMaterial(order, value.hours, form.elements.hourly_type.value); await saveDocuments(form, order, id); state.orderCustomer = ''; }
  async function updateOrder(form) { const order = state.rows.orders.find(row => same(row.id, form.elements.id.value)); if (!order) throw new Error('Der Arbeitsschein wurde nicht gefunden.'); const id = order.employee_id, workDate = form.elements.work_date.value || order.work_date; if (workDate !== order.work_date && locked(id, workDate)) throw new Error(lockedText(id, workDate)); const customer = await ensureCustomer(form.elements.customer.value, id), value = timeValues(form); const changes = { customer_id: customer.id, customer_name: customer.name, title: String(form.elements.title.value || '').trim(), start_time: value.start, end_time: value.end, pause_hours: value.pause, executed_hours: value.hours, calculation_mode: 'end_time', documentation: String(form.elements.documentation.value || '') }; if (workDate !== order.work_date) changes.work_date = workDate; await write('work_orders', changes, 'PATCH', `id=eq.${encodeURIComponent(order.id)}`); await saveMaterials(form, order, true); await saveHourlyMaterial(order, value.hours, form.elements.hourly_type.value); await saveDocuments(form, order, id); state.orderId = ''; state.view = state.orderOrigin || 'orders'; }
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
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const action = button.dataset.action;
    if (action === 'menu') { state.menu = !state.menu; render(); return; }
    if (action === 'nav') { state.view = button.dataset.view; state.menu = false; state.vacationForm = false; state.orderId = ''; state.orderCustomer = ''; state.orderOrigin = 'orders'; state.billingKey = ''; render(); return; }
    if (action === 'logout') return logout();
    if (action === 'forgot') return perform('Die zuständige Verwaltung wurde informiert.', () => api('/functions/v1/request-password-help', { method: 'POST', body: { username: root.querySelector('[name="username"]')?.value || '' } }));
    if (action === 'pick-day') { state.date = button.dataset.date; state.month = state.date.slice(0, 7); state.vacationForm = false; render(); return; }
    if (action === 'month') { const date = new Date(`${state.month}-01T12:00:00`); date.setMonth(date.getMonth() + n(button.dataset.value)); state.month = date.toISOString().slice(0, 7); render(); return; }
    if (action === 'vacation-form') { state.vacationForm = true; render(); return; }
    if (action === 'open-order') { const order = state.rows.orders.find(row => same(row.id, button.dataset.id)); if (!order) return; const person = state.rows.people.find(row => same(row.id, order.employee_id)); if (isAdmin() && person?.business_id) state.businessId = person.business_id; state.employeeId = order.employee_id; state.date = order.work_date; state.month = state.date.slice(0, 7); state.orderId = order.id; state.orderOrigin = ['invoices', 'invoices-paid', 'billing-detail'].includes(state.view) ? state.view : 'orders'; state.view = 'order-detail'; state.menu = false; render(); return; }
    if (action === 'close-order') { state.orderId = ''; state.view = state.orderOrigin || 'orders'; render(); return; }
    if (action === 'open-billing') { state.billingKey = button.dataset.key; state.billingMode = button.dataset.mode === 'paid' ? 'paid' : 'open'; state.view = 'billing-detail'; state.menu = false; render(); return; }
    if (action === 'close-billing') { state.view = state.billingMode === 'paid' ? 'invoices-paid' : 'invoices'; state.billingKey = ''; render(); return; }
    if (action === 'more-material') { document.getElementById('material-lines')?.insertAdjacentHTML('beforeend', materialRow()); return; }
    if (action === 'hourly-type') { const form = button.closest('form'); if (!form?.elements.hourly_type) return; form.elements.hourly_type.value = hourlyName(button.dataset.type); form.querySelectorAll('[data-action="hourly-type"]').forEach(choice => { const active = choice.dataset.type === form.elements.hourly_type.value; choice.classList.toggle('primary', active); choice.classList.toggle('secondary', !active); }); return; }
    if (action === 'new-customer') { state.customerId = 'new'; render(); return; }
    if (action === 'customer') { state.customerId = button.dataset.id; render(); revealCustomerProfile(); return; }
    if (action === 'create-order-from-customer') { const customer = state.rows.customers.find(row => same(row.id, button.dataset.id)); if (!customer) { notice('Der ausgewählte Kunde wurde nicht gefunden.', true); render(); return; } state.orderCustomer = customer.name; state.orderId = ''; state.orderOrigin = 'customers'; state.view = 'orders'; render(); return; }
    if (action === 'edit-material') { state.materialId = button.dataset.id; render(); return; }
    if (action === 'close-material-edit') { state.materialId = ''; render(); return; }
    if (action === 'pdf') return printPdf();
    if (action === 'order-pdf') return printOrderPdf(button.dataset.id);
    if (action === 'billing-pdf') return printBillingPdf(state.billingKey, state.billingMode === 'paid');
    if (action === 'delete-time') return confirm('Zeiterfassung wirklich löschen?') && perform('Zeiterfassung wurde gelöscht.', () => remove('time_entries', `id=eq.${encodeURIComponent(button.dataset.id)}`));
    if (action === 'delete-order') return confirm('Arbeitsschein wirklich löschen?') && perform('Arbeitsschein wurde gelöscht.', async () => { const id = encodeURIComponent(button.dataset.id); await remove('work_order_items', `work_order_id=eq.${id}`); await remove('work_order_documents', `work_order_id=eq.${id}`); await remove('time_entries', `work_order_id=eq.${id}`); await remove('work_orders', `id=eq.${id}`); });
    if (action === 'delete-customer') return confirm('Kunde wirklich löschen?') && perform('Kunde wurde gelöscht.', () => remove('customers', `id=eq.${encodeURIComponent(button.dataset.id)}`));
    if (action === 'delete-material') { const material = state.rows.materials.find(row => same(row.id, button.dataset.id)); if (isHourlyMaterial(material)) { notice('Diese Stundenposition ist geschützt und kann nicht gelöscht werden.'); render(); return; } return confirm('Material wirklich löschen?') && perform('Material wurde gelöscht.', () => remove('materials', `id=eq.${encodeURIComponent(button.dataset.id)}`)); }
    if (action === 'invoice') return perform('Arbeitsschein wurde als abgerechnet markiert.', () => write('work_orders', { invoiced: true }, 'PATCH', `id=eq.${encodeURIComponent(button.dataset.id)}`));
    if (action === 'invoice-group') { const group = invoiceGroups(false).find(item => same(item.key, state.billingKey)); if (!group) return; return perform('Die zusammengefassten Arbeitsscheine wurden als abgerechnet markiert.', async () => { for (const order of group.orders) await write('work_orders', { invoiced: true }, 'PATCH', `id=eq.${encodeURIComponent(order.id)}`); state.billingKey = ''; state.view = 'invoices'; }); }
    if (action === 'read') return perform('Nachricht als gelesen markiert.', () => write('mailbox_messages', { read_at: new Date().toISOString() }, 'PATCH', `id=eq.${encodeURIComponent(button.dataset.id)}`));
    if (action === 'trash') return perform('Nachricht wurde gelöscht.', () => write('mailbox_messages', { deleted_at: new Date().toISOString() }, 'PATCH', `id=eq.${encodeURIComponent(button.dataset.id)}`));
    if (action === 'vacation-decision') return perform('Urlaubsantrag wurde entschieden.', async () => { await flow('decide', { requestId: button.dataset.request, status: button.dataset.status }); await write('mailbox_messages', { read_at: new Date().toISOString() }, 'PATCH', `id=eq.${encodeURIComponent(button.dataset.id)}`); });
    if (action === 'sick') return perform(sick() ? 'Krankheitstag wurde entfernt.' : 'Krankheitstag wurde eingetragen.', async () => { const existing = state.rows.days.find(row => same(row.employee_id, workerId()) && row.work_date === state.date); if (sick()) { if (!isManager()) throw new Error('Krankheitstage können nur durch die Verwaltung entfernt werden.'); if (existing) await remove('work_days', `employee_id=eq.${encodeURIComponent(workerId())}&work_date=eq.${state.date}`); } else await api('/rest/v1/work_days?on_conflict=employee_id,work_date', { method: 'POST', body: { employee_id: workerId(), work_date: state.date, sick: 1, vacation: n(existing?.vacation) }, headers: { Prefer: 'resolution=merge-duplicates,return=representation' } }); });
    if (action === 'delete-employee') return confirm('Mitarbeiterkonto wirklich löschen?') && perform('Mitarbeiterkonto wurde gelöscht.', () => account('employee-delete', { employeeId: button.dataset.id }));
    if (action === 'delete-business') return confirm('Geschäftskonto inklusive Mitarbeiter wirklich löschen?') && perform('Geschäftskonto wurde gelöscht.', () => account('business-delete', { businessId: button.dataset.id }));
  });

  root.addEventListener('input', event => {
    const input = event.target;
    const form = input.closest('form[data-form="time"], form[data-form="order"]');
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
    if (input.matches('[data-date]')) { state.date = input.value || today(); state.month = state.date.slice(0, 7); render(); return; }
    if (input.matches('[data-select="business"]')) { state.businessId = input.value; state.employeeId = ''; render(); return; }
    if (input.matches('[data-select="employee"]')) { state.employeeId = input.value; render(); }
  });

  root.addEventListener('submit', event => {
    const form = event.target; if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault(); const name = form.dataset.form;
    const submitters = {
      login: () => login(form.elements.username.value, form.elements.password.value, form.elements.company.value),
      time: () => saveTime(form), order: () => saveOrder(form), 'order-edit': () => updateOrder(form), customer: () => saveCustomer(form),
      material: () => { if (isHourlyMaterial(form.elements.name.value)) throw new Error('Diese geschützte Stundenposition ist bereits vorhanden.'); return write('materials', { business_id: businessId(), name: String(form.elements.name.value || '').trim(), unit_price: n(form.elements.price.value), active: true }); },
      'hourly-price': () => updateHourlyPrice(form),
      'material-edit': () => updateMaterial(form),
      vacation: () => flow('request', { employeeId: workerId(), startDate: form.elements.start.value, endDate: form.elements.end.value }),
      self: () => account('self-update', { username: form.elements.username.value, password: form.elements.password.value, companyName: form.elements.company?.value, vacationAllowance: n(form.elements.allowance.value) }),
      'employee-new': () => account('employee-create', { businessId: businessId(), username: form.elements.username.value, password: form.elements.password.value, vacationAllowance: n(form.elements.allowance.value), menuPermissions: permissions(form) }),
      'employee-credentials': () => account('employee-credentials-update', { employeeId: workerId(), username: form.elements.username.value, password: form.elements.password.value }),
      'employee-permissions': () => account('employee-permissions-update', { employeeId: workerId(), menuPermissions: permissions(form) }),
      'employee-vacation': () => account('employee-vacation-update', { employeeId: workerId(), vacationAllowance: n(form.elements.allowance.value) }),
      'business-new': () => account('business-create', { companyName: form.elements.company.value, username: form.elements.username.value, password: form.elements.password.value }),
      'business-update': () => account('business-update', { businessId: businessId(), companyName: form.elements.company.value, username: form.elements.username.value, password: form.elements.password.value })
    };
    const submit = submitters[name];
    if (submit) return perform(name === 'login' ? '' : 'Änderung wurde sofort gespeichert.', async () => { await submit(); if (name === 'vacation') state.vacationForm = false; });
  });

  function printBillingPdf(key, invoiced) {
    const group = invoiceGroups(invoiced).find(item => same(item.key, key)); if (!group) throw new Error('Die Abrechnung wurde nicht gefunden.');
    const money = value => n(value).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    const detailRows = group.orders.map(order => { const items = state.rows.items.filter(item => same(item.work_order_id, order.id)); const materials = items.length ? `<ul>${items.map(item => `<li>${escape(item.position_name)} · ${n(item.quantity).toLocaleString('de-DE')} × ${money(item.unit_price)} = ${money(n(item.quantity) * n(item.unit_price))}</li>`).join('')}</ul>` : '<p>Kein Material erfasst.</p>'; return `<section><h2>${dateText(order.work_date)} · ${escape(order.title || 'Arbeitsschein')}</h2><p><b>Arbeitszeit:</b> ${timeText(order.start_time)} bis ${timeText(order.end_time)} · <b>Pause:</b> ${h(order.pause_hours)} · <b>Stunden:</b> ${h(order.executed_hours)}</p>${order.documentation ? `<p><b>Dokumentation:</b><br>${escape(order.documentation).replace(/\n/g, '<br>')}</p>` : ''}<h3>Material</h3>${materials}</section>`; }).join('');
    const totalHours = group.orders.reduce((sum, order) => sum + n(order.executed_hours), 0), totalMaterial = group.orders.reduce((sum, order) => sum + state.rows.items.filter(item => same(item.work_order_id, order.id)).reduce((itemSum, item) => itemSum + n(item.quantity) * n(item.unit_price), 0), 0);
    const windowRef = window.open('', '_blank'); if (!windowRef) throw new Error('Bitte Pop-ups erlauben, um die PDF zu erstellen.');
    windowRef.document.write(`<!doctype html><title>Zusammengefasster Arbeitsschein</title><style>body{font:14px Arial;padding:24px;color:#183431}h1{margin:0 0 4px}h2{margin:26px 0 8px;padding-top:18px;border-top:1px solid #d7e3e0}h3{font-size:14px;margin:14px 0 5px}p,li{line-height:1.55}ul{margin:0;padding-left:20px}.summary{background:#edf5f3;padding:14px;border-radius:8px}</style><h1>Zusammengefasster Arbeitsschein</h1><p>${escape(managerBusiness()?.company_name || 'Zeiterfassung')}<br><b>Kunde:</b> ${escape(group.customerName)}<br><b>Status:</b> ${invoiced ? 'Bereits abgerechnet' : 'Offen zur Abrechnung'}</p><p class="summary"><b>${group.orders.length} Arbeitsscheine</b><br>Arbeitsstunden gesamt: ${h(totalHours)}<br>Material gesamt: ${money(totalMaterial)}</p>${detailRows}<p class="summary"><b>Gesamtsumme aller enthaltenen Arbeitsscheine: ${money(totalMaterial)}</b></p><script>window.onload=()=>window.print()<\/script>`); windowRef.document.close();
  }
  function printOrderPdf(orderId) {
    const order = state.rows.orders.find(row => same(row.id, orderId)); if (!order) throw new Error('Der Arbeitsschein wurde nicht gefunden.');
    const person = state.rows.people.find(row => same(row.id, order.employee_id)) || worker(), items = state.rows.items.filter(item => same(item.work_order_id, order.id));
    const money = value => n(value).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    const materialRows = items.map(item => `<tr><td>${escape(item.position_name)}</td><td>${n(item.quantity).toLocaleString('de-DE')}</td><td>${money(item.unit_price)}</td><td>${money(n(item.quantity) * n(item.unit_price))}</td></tr>`).join('');
    const total = items.reduce((sum, item) => sum + n(item.quantity) * n(item.unit_price), 0), documentation = String(order.documentation || '').trim();
    const windowRef = window.open('', '_blank'); if (!windowRef) throw new Error('Bitte Pop-ups erlauben, um die PDF zu erstellen.');
    windowRef.document.write(`<!doctype html><title>Arbeitsschein</title><style>body{font:14px Arial;padding:24px;color:#183431}h1{margin:0 0 4px}h2{margin-top:28px;font-size:17px}p{line-height:1.55}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}th{background:#edf5f3}.total{font-weight:bold;text-align:right}</style><h1>Arbeitsschein</h1><p>${escape(managerBusiness()?.company_name || 'Zeiterfassung')}<br>Mitarbeiter: ${escape(person?.username || '')}</p><h2>${escape(order.customer_name || 'Ohne Kunde')}</h2><p><b>Datum:</b> ${dateText(order.work_date)}<br><b>Beschreibung:</b> ${escape(order.title || '—')}<br><b>Arbeitszeit:</b> ${timeText(order.start_time)} bis ${timeText(order.end_time)}<br><b>Pause:</b> ${h(order.pause_hours)}<br><b>Ausgeführte Stunden:</b> ${h(order.executed_hours)}</p>${documentation ? `<h2>Dokumentation</h2><p>${escape(documentation).replace(/\n/g, '<br>')}</p>` : ''}${items.length ? `<h2>Material</h2><table><thead><tr><th>Artikel</th><th>Menge</th><th>Preis</th><th>Gesamt</th></tr></thead><tbody>${materialRows}<tr><td colspan="3" class="total">Material gesamt</td><td><b>${money(total)}</b></td></tr></tbody></table>` : ''}<p class="total">Gesamtsumme dieses Arbeitsscheins: ${money(total)}</p><script>window.onload=()=>window.print()<\/script>`); windowRef.document.close();
  }
  function printPdf() { const person = worker(), id = workerId(); const lines = state.rows.entries.filter(row => same(row.employee_id, id)).map(row => `<tr><td>${dateText(row.work_date)}</td><td>${escape(row.customer_name)}</td><td>${timeText(row.start_time)}</td><td>${timeText(row.end_time)}</td><td>${h(row.pause_hours)}</td><td>${h(row.executed_hours)}</td></tr>`).join(''); const windowRef = window.open('', '_blank'); if (!windowRef) throw new Error('Bitte Pop-ups erlauben, um die PDF zu erstellen.'); windowRef.document.write(`<!doctype html><title>Zeiterfassung</title><style>body{font:14px Arial;padding:24px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}</style><h1>Zeiterfassung – ${escape(person?.username)}</h1><p>Arbeitsstunden: ${h(state.rows.entries.filter(row => same(row.employee_id, id)).reduce((sum, row) => sum + n(row.executed_hours), 0))}<br>Überstunden: ${h(overtime(id))}<br>Urlaub übrig: ${vacationLeft(id)} Tage<br>Krankheitstage: ${annualSick(id)} Tage</p><table><thead><tr><th>Datum</th><th>Kunde</th><th>Von</th><th>Bis</th><th>Pause</th><th>Stunden</th></tr></thead><tbody>${lines}</tbody></table><script>window.onload=()=>window.print()<\/script>`); windowRef.document.close(); }
  function render() { if (!root) return; if (!base || !key) { root.innerHTML = '<main class="login-page"><section class="login-card"><h1>Zeiterfassung</h1><p>Die App-Konfiguration fehlt.</p></section></main>'; return; } root.innerHTML = state.session && state.profile ? appView() : loginView(); }
  window.addEventListener('unhandledrejection', event => { event.preventDefault(); notice('Die Aktion konnte nicht ausgeführt werden. Bitte erneut versuchen.', true); render(); });
  state.session = parse(localStorage.getItem(storage) || localStorage.getItem('zeiterfassung-session-v700'));
  if (state.session?.access_token) loadApp(); else render();
})();

