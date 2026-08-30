Warning: truncated output (original token count: 28326)
Total output lines: 730

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
    businessId: '', employeeId: '', customerId: '', materialId: '', orderId: '', orderCustomer: '', orderOrigin: 'orders', billingKey: '', billingMode: 'open', menu: false, vacationForm: false, appointmentForm: false, composeMessage: false, mailboxFolder: 'received', notice: null, busy: false,
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
    localStorage.setItem(storage, JSON.stringify(data)); await loadApp();
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
    const loadRecipients = async () => { try { state.rows.recipients = (await api('/functions/v1/mailbox-send', { method: 'POST', body: { action: 'recipients' } }))?.recipients || []; } catch { state.rows.recipients = []; } };
    await Promise.all([
      load('people', 'profiles'), load('entries', 'time_entries', 'select=*&order=work_date.desc,created_at.desc'), load('orders', 'work_orders', 'select=*&order=work_date.desc,created_at.desc'),
      load('items', 'work_order_items'), load('customers', 'customers', 'select=*&order=name.asc'), load('days', 'work_days'), load('vacations', 'vacation_requests', 'select=*&order=created_at.desc'),
      load('messages', 'mailbox_messages', 'select=*&order=created_at.desc'), load('attachments', 'mailbox_attachments', 'select=*&order=created_at.asc'), load('materials', 'materials', 'select=*&order=name.asc'), load('appointments', 'appointments'),
      load('payslips', 'employee_payslips', 'select=*&order=created_at.desc'), load('documents', 'work_order_documents'), loadRecipients()
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
  function companyLogoUrl(business = managerBusiness()) { return publicObjectUrl('company-logos', business?.company_logo_path); }
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
    return `${companyBanner}<section class="page-head"><div><span class="eyebrow">Willkommen, ${escape(worker()?.username || '')}</span><h2>${dateText(state.date)}</h2></div><label class="date-field">Tag<input type="date" data-date value="${state.date}"></label></section><section class="stat-grid"><article><span>Überstunden ${state.date.slice(0, 4)}</span><strong class="${extra > 0 ? 'positive' : extra < 0 ? 'negative' : ''}">${extra ? h(extra) : '—'}</strong></article><article><span>Urlaub übrig</span><strong>${vacationLeft(id)} Tage</strong></article><article><span>Krankheitstage</span><strong>${annualSick(id)} Tage</strong></article></section><section class="panel"><h3>Ausgewählter Arbeitstag</h3><p>${locked(id) ? lockedText(id) : dayEntries(id).length ? `${h(dayHours(id))} Arbeitszeit erfasst.` : 'Für diesen Tag wurde noch keine Arbeitszeit erfasst.'}</p></section>`;
  }
  function timeInput(name, value) { return `<input name="${name}" type="time" step="900" value="${value || ''}">`; }
  function customerList() { return `<datalist id="customers">${state.rows.customers.map(row => `<option value="${escape(row.name)}"></option>`).join('')}</datalist>`; }
  function timeView() { const id = workerId(), list = dayEntries(id), previous = list.at(-1)?.end_time?.slice(0, 5) || '07:30'; return `<section class="page-head"><div><span class="eyebrow">Zeiterfassung von ${escape(worker()?.username || '')}</span><h2>${dateText(state.date)}</h2></div><label class="date-field">Tag<input type="date" data-date value="${state.date}"></label></section>${locked(id) ? `<div class="locked">${escape(lockedText(id))}</div>` : `<section class="panel"><h3>Arbeitszeit hinzufügen</h3><form data-form="time" class="entry-form"><label class="wide">Kunde<input name="customer" required list="customers"></label><label>Arbeitsbeginn${timeInput('start', previous)}</label><label>Arbeitsende${timeInput('end', '')}</label><label>Pause in Stunden<input name="pause" type="number" min="0" step="0.25" value="0"></label><label>Ausgeführte Stunden<input name="hours" type="number" min="0.25" step="0.25" required></label><button class="primary wide">Speichern</button></form>${customerList()}</section>`}<section class="list-section"><h3>Einträge des Tages</h3>${list.map(row => `<article class="row-card"><div><b>${escape(row.customer_name)}</b><span>${timeText(row.start_time)} – ${timeText(row.end_time)} · ${h(row.executed_hours)}</span></div><button type="button" class="danger small" data-action="delete-time" data-id="${row.id}">Löschen</button></article>`).join('') || '<p class="empty">Keine Einträge vorhanden.</p>'}</section>`; }

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
    return `<section class="panel"><div class="page-head"><div><span class="eyebrow">Arbeitsschein bearbeiten</span><h3>${escape(order.customer_name || 'Ohne Kunde')}</h3></div><div class="actions">${invoiceButton}<button type="button" class="secondary small" data-action="order-pdf" data-id="${order.id}">PDF drucken / speichern</button><button type="button" class="secondary small" data-action="close-order">Schließen</button></div></div><form data-form="order-edit" class="entry-form"><input type="hidden" name="id" value="${order.id}"><label>Datum<input name="work_date" type="date" value="${order.work_date}"></label><label class="wide">Kunde<input name="customer" required list="customers" value="${escape(order.customer_name || '')}"></label><label class="wide">Beschreibung<input name="title" value="${escape(order.title || '')}"></label><div class="wide" id="material-lines">${rows}</div><button type="button" class="secondary wide" data-action="more-material">Weiteres Material</button><p class="wide">Arbeitsstunden werden beim Speichern automatisch als <b>${escape(hourlyNameForEmployee(order.employee_id))}</b> mit dem Preis aus der Materialliste ergänzt.</p><label>Arbeitsbeginn${timeInput('start', order.start_time?.slice(0, 5))}</label><label>Arbeitsende${timeInput('end', order.end_time?.slice(0, 5))}</label><label>Pause in Stunden<input name="pause" type="number" min="0" step="0.25" value="${n(order.pause_hours)}"></label><label>Ausgeführte Stunden<input name="hours" type="number" min="0.25" step="0.25" value="${n(order.executed_hours)}" required></label><label class="wide">Dokumentation<textarea name="documentation" rows="4">${escape(order.documentation || '')}</textarea></label><label class="wide">Weitere Dokumente hochladen<input name="documents" type="file" multiple accept="image/*,.pdf,.doc,.docx"></label>${documents.length ? `<p class="wide">Vorhandene Dokumente: ${documents.map(document => escape(document.file_name)).join(', ')}</p>` : ''}${signatureFields(order)}<button class="primary wide" data-signature-submit>Änderungen speichern</button></form>${customerList()}${materialList()}</section>`;
  }
  function orderDetailView() { const order = state.rows.orders.find(row => same(row.id, state.orderId)); return order ? orderEditor(order) : `<section class="panel"><h2>Arbeitsschein nicht gefunden</h2><p>Der Arbeitsschein ist nicht mehr verfügbar.</p><button type="button" class="secondary" data-action="close-order">Zurück</button></section>`; }
  function ordersView() {
    const id = workerId(), list = state.rows.orders.filter(row => same(row.employee_id, id) && (isManager() || row.work_date === state.date));
    const previous = dayEntries(id).at(-1)?.end_time?.slice(0, 5) || '07:30';
    const selected = list.find(row => same(row.id, state.orderId));
    const newOrder = locked(id) ? `<div class="locked">${escape(lockedText(id))}</div>` : `<section class="panel"><h3>Neuer Arbeitsschein</h3><form data-form="order" class="entry-form"><label class="wide">Kunde<input name="customer" required list="customers" value="${escape(state.orderCustomer || '')}"></label><label class="wide">Beschreibung<input name="title" placeholder="Ausgeführte Arbeiten"></label><div class="wide" id="material-lines">${materialRow()}</div><button type="button" class="secondary wide" data-action="more-material">Weiteres Material</button><p class="wide">Arbeitsstunden werden beim Speichern automatisch als <b>${escape(hourlyNameForEmployee(id))}</b> mit dem Preis aus der Materialliste ergänzt.</p><label>Arbeitsbeginn${timeInput('start', previous)}</label><label>Arbeitsende${timeInput('end', '')}</label><label>Pause in Stunden<input name="pause" type="number" min="0" step="0.25" value="0"></label><label>Ausgeführte Stunden<input name="hours" type="number" min="0.25" step="0.25" required></label><label class="wide">Dokumentation<textarea name="documentation" rows="4"></textarea></label><label class="wide">Dokumente hochladen<input name="documents" type="file" multiple accept="image/*,.pdf,.doc,.docx"></label>${signatureFields()}<button class="primary wide" data-signature-submit>Arbeitsschein speichern</button></form>${customerList()}${materialList()}</section>`;
    return `<section class="page-head"><div><span class="eyebrow">Arbeitsscheine von ${escape(worker()?.username || '')}</span><h2>${isManager() ? 'Alle Arbeitsscheine' : dateText(state.date)}</h2></div><label cla…14326 tokens truncated…
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
    if (action === 'delete-time') return confirm('Zeiterfassung wirklich löschen?') && perform('Zeiterfassung wurde gelöscht.', () => remove('time_entries', `id=eq.${encodeURIComponent(button.dataset.id)}`));
    if (action === 'delete-order') return confirm('Arbeitsschein wirklich löschen?') && perform('Arbeitsschein wurde gelöscht.', async () => { const id = encodeURIComponent(button.dataset.id); await remove('work_order_items', `work_order_id=eq.${id}`); await remove('work_order_documents', `work_order_id=eq.${id}`); await remove('time_entries', `work_order_id=eq.${id}`); await remove('work_orders', `id=eq.${id}`); });
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
    if (input.matches('[data-date]')) { state.date = input.value || today(); state.month = state.date.slice(0, 7); render(); return; }
    if (input.matches('[data-select="business"]')) { state.businessId = input.value; state.employeeId = ''; render(); return; }
    if (input.matches('[data-select="employee"]')) { state.employeeId = input.value; render(); }
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
    const person = worker(), id = workerId(), ownEntries = state.rows.entries.filter(row => same(row.employee_id, id)), totalHours = ownEntries.reduce((sum, row) => sum + n(row.executed_hours), 0);
    const lines = ownEntries.map(row => `<tr><td>${dateText(row.work_date)}</td><td>${escape(row.customer_name)}</td><td>${timeText(row.start_time)}</td><td>${timeText(row.end_time)}</td><td class="number">${h(row.pause_hours)}</td><td class="number">${h(row.executed_hours)}</td></tr>`).join('');
    const windowRef = window.open('', '_blank'); if (!windowRef) throw new Error('Bitte Pop-ups erlauben, um die PDF zu erstellen.');
    windowRef.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Zeiterfassungsnachweis</title><style>${pdfStyles()}</style></head><body><main class="pdf-page">${pdfBrandHeader('Zeiterfassungsnachweis', state.date.slice(0, 4))}<section class="pdf-grid"><article class="pdf-card"><span class="pdf-card-label">Mitarbeiter</span><b>${escape(person?.display_name || person?.username || '')}</b></article><article class="pdf-card"><span class="pdf-card-label">Jahresübersicht</span>${h(totalHours)} Arbeitsstunden<br>${h(overtime(id))} Überstunden<br>${vacationLeft(id)} Urlaubstage übrig · ${annualSick(id)} Krankheitstage</article></section><section class="pdf-section"><h2>Erfasste Zeiten</h2><table class="pdf-table"><thead><tr><th>Datum</th><th>Kunde</th><th>Von</th><th>Bis</th><th class="number">Pause</th><th class="number">Stunden</th></tr></thead><tbody>${lines || '<tr><td colspan="6" class="pdf-empty">Keine Zeiterfassungen vorhanden.</td></tr>'}</tbody></table></section><p class="pdf-note">Automatisch aus der Arbeitszeiterfassung erstellt.</p></main><script>window.onload=()=>window.print()<\/script></body></html>`); windowRef.document.close(); addPdfReturnBar(windowRef);
  }
  function render() { if (!root) return; if (!base || !key) { root.innerHTML = '<main class="login-page"><section class="login-card"><h1>Zeiterfassung</h1><p>Die App-Konfiguration fehlt.</p></section></main>'; return; } root.innerHTML = state.session && state.profile ? appView() : loginView(); setupSignaturePads(); }
  window.addEventListener('unhandledrejection', event => { event.preventDefault(); notice('Die Aktion konnte nicht ausgeführt werden. Bitte erneut versuchen.', true); render(); });
  state.session = parse(localStorage.getItem(storage) || localStorage.getItem('zeiterfassung-session-v700'));
  if (state.session?.access_token) loadApp(); else render();
})();

