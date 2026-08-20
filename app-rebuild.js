import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const root = document.querySelector('#app')
const config = window.WORKTIME_CONFIG

if (!config?.supabaseUrl || !config?.supabasePublishableKey) {
  root.innerHTML = '<main class="boot-error">Die App-Konfiguration fehlt.</main>'
  throw new Error('WORKTIME_CONFIG fehlt')
}

const db = createClient(config.supabaseUrl, config.supabasePublishableKey)
const today = () => new Date().toISOString().slice(0, 10)

const state = {
  session: null,
  profile: null,
  people: [],
  employeeId: null,
  customerId: null,
  view: 'time',
  date: today(),
  month: new Date().getMonth(),
  year: new Date().getFullYear(),
  folder: 'all',
  busy: false,
  toast: null,
  channel: null,
  reloadTimer: 0,
  data: emptyData(),
}

function emptyData() {
  return {
    customers: [], days: [], entries: [], orders: [], items: [], documents: [],
    materials: [], messages: [], appointments: [], vacations: [], columns: [],
  }
}

const NRW_2026 = {
  '2026-01-01': 'Neujahr', '2026-04-03': 'Karfreitag', '2026-04-06': 'Ostermontag',
  '2026-05-01': 'Tag der Arbeit', '2026-05-14': 'Christi Himmelfahrt',
  '2026-05-25': 'Pfingstmontag', '2026-06-04': 'Fronleichnam',
  '2026-10-03': 'Tag der Deutschen Einheit', '2026-11-01': 'Allerheiligen',
  '2026-12-25': '1. Weihnachtstag', '2026-12-26': '2. Weihnachtstag',
}

const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char])
const num = value => {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}
const money = value => num(value).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
const hours = value => `${num(value).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`
const dateText = value => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
const shortDate = value => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(new Date(`${value}T12:00:00`))
const timeText = value => value ? `${String(value).slice(0, 5)} Uhr` : '–'
const same = (a, b) => String(a) === String(b)
const isChief = () => state.profile?.role === 'chief'
const currentEmployee = () => isChief() ? (state.employeeId || state.profile?.id) : state.profile?.id
const uid = () => crypto.randomUUID()

function dateObject(value) { return new Date(`${value}T12:00:00`) }
function isoDate(value) { return value.toISOString().slice(0, 10) }
function shift(value, amount) { const result = dateObject(value); result.setDate(result.getDate() + amount); return isoDate(result) }
function monthStart(year = state.year, month = state.month) { return `${year}-${String(month + 1).padStart(2, '0')}-01` }
function weekday(value) { return dateObject(value).getDay() }
function workTarget(value) { const day = weekday(value); return day >= 1 && day <= 4 ? 8 : day === 5 ? 5 : 0 }
function holiday(value) { return NRW_2026[value] || '' }
function weekdayRange(start, end) {
  const result = []
  for (let cursor = start; cursor <= end; cursor = shift(cursor, 1)) if (weekday(cursor) > 0 && weekday(cursor) < 6 && !holiday(cursor)) result.push(cursor)
  return result
}
function minutes(value) {
  if (!/^\d{2}:\d{2}/.test(String(value || ''))) return null
  const [hour, minute] = String(value).slice(0, 5).split(':').map(Number)
  return hour * 60 + minute
}
function addMinutes(value, amount) {
  const initial = minutes(value)
  if (initial === null) return ''
  const total = ((initial + Math.round(amount)) % 1440 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
function calculateTimes({ start, end, pause, duration }) {
  const pauseHours = Math.max(0, num(pause))
  const hasEnd = minutes(end) !== null
  const hasDuration = String(duration ?? '').trim() !== ''
  if (!hasEnd && !hasDuration) throw new Error('Bitte Arbeitsstunden oder eine Endzeit eintragen.')
  const safeStart = minutes(start) === null ? '07:30' : String(start).slice(0, 5)
  if (hasEnd) {
    const from = minutes(safeStart), to = minutes(end)
    const total = (to < from ? to + 1440 : to) - from
    return { start_time: safeStart, end_time: String(end).slice(0, 5), pause_hours: pauseHours, executed_hours: Math.max(0, total / 60 - pauseHours), calculation_mode: 'end_time' }
  }
  const executed = Math.max(0, num(duration))
  return { start_time: safeStart, end_time: addMinutes(safeStart, (executed + pauseHours) * 60), pause_hours: pauseHours, executed_hours: executed, calculation_mode: 'hours' }
}

async function api(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

function notify(message, error = false) {
  state.toast = { message, error }
  render()
  clearTimeout(notify.timer)
  notify.timer = setTimeout(() => { state.toast = null; render() }, 4000)
}

async function run(message, action) {
  if (state.busy) return
  state.busy = true
  render()
  try {
    await action()
    await load()
    if (message) notify(message)
  } catch (error) {
    const text = error?.message || 'Die Aktion konnte nicht ausgeführt werden.'
    notify(text, true)
  } finally {
    state.busy = false
    render()
  }
}

function table(query) { return api(query).catch(() => []) }

async function load() {
  const { data: auth } = await db.auth.getSession()
  state.session = auth.session
  if (!state.session) {
    state.profile = null
    state.people = []
    state.data = emptyData()
    render()
    return
  }
  state.profile = await api(db.from('profiles').select('*').eq('id', state.session.user.id).single())
  const [people, customers, days, entries, orders, items, documents, materials, messages, appointments, vacations, columns] = await Promise.all([
    table(db.from('profiles').select('*').order('username')),
    table(db.from('customers').select('*').order('name')),
    table(db.from('work_days').select('*').order('work_date')),
    table(db.from('time_entries').select('*').order('work_date', { ascending: false }).order('created_at')),
    table(db.from('work_orders').select('*').order('work_date', { ascending: false }).order('created_at')),
    table(db.from('work_order_items').select('*').order('created_at')),
    table(db.from('work_order_documents').select('*').order('created_at')),
    table(db.from('materials').select('*').eq('active', true).order('name')),
    table(db.from('mailbox_messages').select('*').order('created_at', { ascending: false })),
    table(db.from('appointments').select('*').order('event_date')),
    table(db.from('vacation_requests').select('*').order('created_at', { ascending: false })),
    table(db.from('custom_columns').select('*').order('position')),
  ])
  state.people = people?.length ? people : [state.profile]
  state.data = { customers: customers || [], days: days || [], entries: entries || [], orders: orders || [], items: items || [], documents: documents || [], materials: materials || [], messages: messages || [], appointments: appointments || [], vacations: vacations || [], columns: columns || [] }
  if (!state.people.some(person => person.id === state.employeeId)) state.employeeId = state.profile.id
  setupRealtime()
  render()
}

function setupRealtime() {
  if (state.channel) return
  const tables = ['customers', 'work_days', 'time_entries', 'work_orders', 'work_order_items', 'work_order_documents', 'materials', 'mailbox_messages', 'appointments', 'vacation_requests', 'custom_columns']
  let channel = db.channel(`arbeitszeit-neu-${state.profile.id}`)
  tables.forEach(name => { channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: name }, () => scheduleReload()) })
  state.channel = channel.subscribe()
}

function scheduleReload() {
  clearTimeout(state.reloadTimer)
  state.reloadTimer = setTimeout(() => load().catch(() => {}), 350)
}

function person(id) { return state.people.find(item => item.id === id) || state.profile }
function employeeName(id) { return person(id)?.username || 'Unbekannt' }
function own(list, id = currentEmployee()) { return (list || []).filter(row => row.employee_id === id) }
function dayInfo(value = state.date, employeeId = currentEmployee()) {
  const sick = own(state.data.days, employeeId).find(row => same(row.work_date, value) && num(row.sick) > 0)
  const vacation = own(state.data.vacations, employeeId).find(row => row.status !== 'rejected' && row.start_date <= value && row.end_date >= value)
  const approvedVacation = vacation?.status === 'approved'
  return { sick: Boolean(sick), vacation, approvedVacation, holiday: holiday(value), locked: Boolean(sick || approvedVacation || holiday(value)) }
}
function entriesFor(value = state.date, employeeId = currentEmployee()) { return own(state.data.entries, employeeId).filter(row => same(row.work_date, value)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))) }
function ordersFor(value = state.date, employeeId = currentEmployee()) { return own(state.data.orders, employeeId).filter(row => same(row.work_date, value)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))) }
function nextStart(value = state.date, employeeId = currentEmployee()) {
  const endings = [...entriesFor(value, employeeId), ...ordersFor(value, employeeId)].map(row => String(row.end_time || '').slice(0, 5)).filter(time => minutes(time) !== null).sort()
  return endings.at(-1) || '07:30'
}
function remainingVacation(employeeId = currentEmployee()) {
  const allowance = num(person(employeeId)?.vacation_allowance)
  const taken = own(state.data.vacations, employeeId).filter(row => row.status === 'approved').reduce((sum, row) => sum + num(row.requested_days), 0)
  return Math.max(0, allowance - taken)
}
function summary(employeeId = currentEmployee()) {
  const entries = own(state.data.entries, employeeId)
  const executed = entries.reduce((sum, row) => sum + num(row.executed_hours), 0)
  const overtime = entries.reduce((sum, row) => sum + num(row.executed_hours) - workTarget(row.work_date), 0)
  const sick = own(state.data.days, employeeId).filter(row => num(row.sick) > 0).length
  return { executed, overtime, sick, remaining: remainingVacation(employeeId) }
}

function permitted(view) {
  if (['inbox', 'settings', 'assignments'].includes(view)) return true
  if (isChief()) return true
  const permissions = state.profile?.menu_permissions || {}
  return permissions[view] !== false
}

function weekStrip() {
  const day = dateObject(state.date)
  const offset = (day.getDay() + 6) % 7
  const monday = shift(state.date, -offset)
  return `<div class="week-strip">${Array.from({ length: 7 }, (_, index) => {
    const value = shift(monday, index), info = dayInfo(value)
    const className = ['week-day', same(value, state.date) ? 'selected' : '', info.sick ? 'sick' : '', info.approvedVacation ? 'vacation' : '', info.vacation?.status === 'requested' ? 'requested' : '', info.holiday ? 'holiday' : ''].filter(Boolean).join(' ')
    return `<button class="${className}" data-action="date" data-date="${value}"><span>${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][index]}</span><strong>${dateObject(value).getDate()}</strong></button>`
  }).join('')}</div>`
}

function employeePicker() {
  if (!isChief()) return ''
  return `<label class="select-label">Mitarbeiter<select data-action="employee">${state.people.map(item => `<option value="${item.id}" ${item.id === currentEmployee() ? 'selected' : ''}>${esc(item.username)}${item.role === 'chief' ? ' · Chef' : ''}</option>`).join('')}</select></label>`
}

function page(title, eyebrow, content, actions = '') {
  return `<main class="page"><section class="hero"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1></div>${actions}</section>${content}</main>`
}

function lockMessage(info) {
  if (!info.locked) return ''
  const text = info.sick ? 'Krankheitstag: Zeiterfassung und Arbeitsscheine sind gesperrt.' : info.approvedVacation ? 'Genehmigter Urlaub: Zeiterfassung und Arbeitsscheine sind gesperrt.' : `${info.holiday}: Feiertag` 
  return `<p class="notice lock">${esc(text)}</p>`
}

function metrics(employeeId = currentEmployee()) {
  const data = summary(employeeId)
  return `<section class="metrics"><article><span>Stunden</span><strong>${hours(data.executed)}</strong></article><article><span>Überstunden</span><strong class="${data.overtime > 0 ? 'positive' : data.overtime < 0 ? 'negative' : ''}">${data.overtime === 0 ? '–' : hours(data.overtime)}</strong></article><article><span>Krankheit</span><strong>${data.sick} Tage</strong></article><article><span>Resturlaub</span><strong>${data.remaining} Tage</strong></article></section>`
}

function customerList() { return `<datalist id="customer-list">${state.data.customers.map(row => `<option value="${esc(row.name)}"></option>`).join('')}</datalist>` }

function timeForm(existing = null) {
  const value = existing || { customer_name: '', start_time: nextStart(), end_time: '', pause_hours: 0, executed_hours: '' }
  const info = dayInfo()
  const columns = own(state.data.columns)
  const custom = value.custom_fields || {}
  return `<form class="card form-grid" data-form="${existing ? 'entry-update' : 'entry'}"><input type="hidden" name="id" value="${existing?.id || ''}"><label>Kunde<input name="customer" list="customer-list" value="${esc(value.customer_name)}" required></label><label>Beginn<input name="start" type="time" value="${String(value.start_time || nextStart()).slice(0, 5)}" required></label><label>Ende<input name="end" type="time" value="${String(value.end_time || '').slice(0, 5)}"></label><label>Pause in Stunden<input name="pause" inputmode="decimal" value="${esc(value.pause_hours)}"></label><label>Arbeitsstunden<input name="hours" inputmode="decimal" value="${existing?.calculation_mode === 'hours' ? esc(value.executed_hours) : ''}" placeholder="oder Ende eintragen"></label>${columns.map(column => `<label>${esc(column.name)}<input name="custom-${column.id}" value="${esc(custom[column.id] || '')}"></label>`).join('')}<div class="form-actions"><button class="primary" ${info.locked ? 'disabled' : ''}>${existing ? 'Eintrag speichern' : 'Zeiteintrag hinzufügen'}</button>${existing ? `<button type="button" class="danger ghost" data-action="entry-delete" data-id="${existing.id}">Löschen</button>` : ''}</div></form>`
}

function timeView() {
  const info = dayInfo(), entries = entriesFor(), total = entries.reduce((sum, row) => sum + num(row.executed_hours), 0), target = info.locked ? 0 : workTarget(state.date)
  return page(dateText(state.date), 'ZEITERFASSUNG', `${employeePicker()}${weekStrip()}${lockMessage(info)}<section class="day-summary"><span>Ausgeführt <strong>${hours(total)}</strong></span><span>Zu leisten <strong>${hours(target)}</strong></span><span>Überstunden <strong class="${total - target > 0 ? 'positive' : total - target < 0 ? 'negative' : ''}">${total === target ? '–' : hours(total - target)}</strong></span></section><section class="split"><div><h2>Zeiteinträge</h2>${entries.length ? entries.map(row => timeForm(row)).join('') : '<p class="empty">Noch keine Zeiteinträge.</p>'}</div><div><h2>Neuer Eintrag</h2>${timeForm()}</div></section><section class="card slim"><h2>Krankheit</h2><p>${info.sick ? 'Dieser Tag ist als Krankheitstag markiert.' : 'Krankheitstage sperren Arbeitszeit und Arbeitsscheine.'}</p><button class="${info.sick ? 'danger' : 'warning'}" data-action="sick">${info.sick ? (isChief() ? 'Krankheitstag entfernen' : 'Krankheitstag gemeldet') : 'Als krank markieren'}</button></section>${customerList()}`)
}

function orderCard(order, compact = false) {
  const items = state.data.items.filter(item => item.work_order_id === order.id)
  const documents = state.data.documents.filter(item => item.work_order_id === order.id)
  const editable = order.employee_id === currentEmployee() || isChief()
  return `<article class="card order-card"><div class="card-head"><div><p class="eyebrow">${esc(order.customer_name || 'Ohne Kunde')}</p><h3>${esc(order.title || 'Arbeitsschein')}</h3><p>${shortDate(order.work_date)} · ${timeText(order.start_time)} – ${timeText(order.end_time)} · ${hours(order.executed_hours)}</p></div>${isChief() ? `<label class="check"><input type="checkbox" data-action="invoice" data-id="${order.id}" ${order.invoiced ? 'checked' : ''}> Abgerechnet</label>` : ''}</div>${order.notes ? `<p>${esc(order.notes)}</p>` : ''}${order.documentation ? `<details><summary>Dokumentation</summary><p>${esc(order.documentation)}</p></details>` : ''}<section class="subsection"><h4>Material</h4>${items.length ? `<ul class="positions">${items.map(item => `<li>${esc(item.position_name)} · ${num(item.quantity)} × ${money(item.unit_price)}${editable ? `<button class="icon danger" data-action="item-delete" data-id="${item.id}" aria-label="Position löschen">×</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Keine Materialpositionen.</p>'}${editable && !compact ? `<form data-form="item" class="inline-form"><input type="hidden" name="orderId" value="${order.id}"><label>Artikel<input name="material" required placeholder="Artikel eingeben"></label><label>Menge<input name="quantity" inputmode="decimal" value="1"></label><button class="secondary">Hinzufügen</button></form>` : ''}</section><section class="subsection"><h4>Dokumente</h4>${documents.length ? documents.map(doc => `<p class="file"><button class="link" data-action="document-open" data-id="${doc.id}">${esc(doc.file_name)}</button>${editable ? `<button class="icon danger" data-action="document-delete" data-id="${doc.id}" aria-label="Dokument löschen">×</button>` : ''}</p>`).join('') : '<p class="muted">Keine Dokumente.</p>'}${editable && !compact ? `<form data-form="document" class="inline-form" enctype="multipart/form-data"><input type="hidden" name="orderId" value="${order.id}"><input name="documents" type="file" multiple><button class="secondary">Dateien hochladen</button></form>` : ''}</section>${editable ? `<div class="card-actions"><button class="danger ghost" data-action="order-delete" data-id="${order.id}">Arbeitsschein löschen</button></div>` : ''}</article>`
}

function orderView() {
  const info = dayInfo(), orders = ordersFor()
  return page(`Arbeitsscheine · ${dateText(state.date)}`, 'ARBEITSSCHEINE', `${employeePicker()}${weekStrip()}${lockMessage(info)}<section class="split"><div><h2>Vorhandene Arbeitsscheine</h2>${orders.length ? orders.map(order => orderCard(order)).join('') : '<p class="empty">Noch keine Arbeitsscheine für diesen Tag.</p>'}</div><div><h2>Neuer Arbeitsschein</h2><form class="card form-grid" data-form="order"><label>Kunde<input name="customer" list="customer-list" required></label><label>Bezeichnung<input name="title" placeholder="z. B. Reparatur"></label><label>Beginn<input name="start" type="time" value="${nextStart()}" required></label><label>Ende<input name="end" type="time"></label><label>Pause in Stunden<input name="pause" inputmode="decimal" value="0"></label><label>Arbeitsstunden<input name="hours" inputmode="decimal" placeholder="oder Ende eintragen"></label><label class="wide">Notiz<textarea name="notes" rows="3"></textarea></label><label class="wide">Dokumentation<textarea name="documentation" rows="4" placeholder="Durchgeführte Arbeiten dokumentieren"></textarea></label><button class="primary" ${info.locked ? 'disabled' : ''}>Arbeitsschein anlegen</button></form></div></section>${customerList()}`)
}

function customerCard(customer) {
  const fields = customer.custom_fields || {}
  const labels = [['address', 'Adresse'], ['city', 'Ort'], ['postal_code', 'Postleitzahl'], ['email', 'E-Mail Adresse'], ['phone_private', 'Tel. privat'], ['phone_mobile', 'Tel. Mobil']]
  return `<article class="card customer-card"><div class="card-head"><h3>${esc(customer.name)}</h3><button class="link" data-action="customer-orders" data-id="${customer.id}">Arbeitsscheine ansehen</button></div><form data-form="customer-update" class="form-grid"><input type="hidden" name="id" value="${customer.id}"><label>Kundenname<input name="name" value="${esc(customer.name)}" required></label>${labels.map(([key, label]) => `<label>${label}<input name="${key}" value="${esc(fields[key] || '')}"></label>`).join('')}<div class="form-actions"><button class="secondary">Speichern</button>${isChief() ? `<button type="button" class="danger ghost" data-action="customer-delete" data-id="${customer.id}">Kunde löschen</button>` : ''}</div></form></article>`
}

function customerView() {
  const cards = state.data.customers.map(customerCard).join('') || '<p class="empty">Noch keine Kunden.</p>'
  return page('Kunden', 'GEMEINSAME KUNDENDATEN', `<section class="card"><h2>Kunde hinzufügen</h2><form data-form="customer" class="inline-form"><label>Kundenname<input name="name" required></label><button class="primary">Hinzufügen</button></form></section><section class="cards">${cards}</section>`)
}

function customerOrdersView() {
  const customer = state.data.customers.find(row => row.id === state.customerId)
  if (!customer) { state.view = 'customers'; return customerView() }
  const orders = state.data.orders.filter(row => row.customer_id === customer.id || row.customer_name === customer.name)
  const open = orders.filter(row => !row.invoiced), billed = orders.filter(row => row.invoiced)
  return page(customer.name, 'KUNDEN · ARBEITSSCHEINE', `<button class="back" data-action="customers-back">← Zu den Kunden</button><section class="card"><h2>Offene Arbeitsscheine</h2>${open.length ? `<div class="bundle">${open.map(row => orderCard(row, true)).join('')}</div>` : '<p class="empty">Keine offenen Arbeitsscheine.</p>'}</section><section class="card"><h2>Abgerechnete Arbeitsscheine</h2>${billed.length ? billed.map(row => orderCard(row, true)).join('') : '<p class="empty">Keine abgerechneten Arbeitsscheine.</p>'}</section>`)
}

function calendarCells() {
  const start = dateObject(monthStart())
  const firstOffset = (start.getDay() + 6) % 7
  const cells = []
  for (let position = 0; position < 42; position += 1) {
    const value = isoDate(new Date(start.getFullYear(), start.getMonth(), 1 - firstOffset + position, 12))
    const inMonth = dateObject(value).getMonth() === state.month
    const info = dayInfo(value), appointmentCount = own(state.data.appointments).filter(row => same(row.event_date, value)).length
    const classes = ['calendar-day', inMonth ? '' : 'outside', same(value, state.date) ? 'selected' : '', info.sick ? 'sick' : '', info.approvedVacation ? 'vacation' : '', info.vacation?.status === 'requested' ? 'requested' : '', info.holiday ? 'holiday' : ''].filter(Boolean).join(' ')
    cells.push(`<button class="${classes}" data-action="calendar-date" data-date="${value}"><strong>${dateObject(value).getDate()}</strong>${info.holiday ? '<span>Feiertag</span>' : ''}${info.sick ? '<span>Krank</span>' : ''}${info.approvedVacation ? '<span>Urlaub</span>' : ''}${info.vacation?.status === 'requested' ? '<span>Antrag</span>' : ''}${appointmentCount ? `<em>${appointmentCount} Termin${appointmentCount > 1 ? 'e' : ''}</em>` : ''}</button>`)
  }
  return cells.join('')
}

function calendarView() {
  const current = new Date(state.year, state.month, 1)
  const selectedAppointments = own(state.data.appointments).filter(row => same(row.event_date, state.date))
  const vacations = own(state.data.vacations).filter(row => row.status !== 'rejected')
  const info = dayInfo()
  return page(`${current.toLocaleString('de-DE', { month: 'long', year: 'numeric' })}`, 'PERSÖNLICHER KALENDER', `${employeePicker()}<div class="calendar-controls"><button data-action="month-prev">←</button><button data-action="month-today">Heute</button><button data-action="month-next">→</button></div><section class="calendar"><div class="calendar-head">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => `<span>${day}</span>`).join('')}</div><div class="calendar-grid">${calendarCells()}</div></section><section class="split"><div class="card"><h2>Urlaub beantragen</h2><form data-form="vacation" class="form-grid"><label>Von<input name="start" type="date" value="${state.date}" required></label><label>Bis<input name="end" type="date" value="${state.date}" required></label><button class="primary">Urlaub beantragen</button></form><h3>Meine Urlaubsanträge</h3>${vacations.length ? vacations.map(row => `<p>${shortDate(row.start_date)} – ${shortDate(row.end_date)} · <strong>${row.status === 'approved' ? 'Genehmigt' : 'Angefragt'}</strong>${isChief() ? `<button class="icon danger" data-action="vacation-delete" data-id="${row.id}">×</button>` : ''}</p>`).join('') : '<p class="muted">Keine Urlaubsanträge.</p>'}<hr><h3>Krankheit am ${shortDate(state.date)}</h3><button class="${info.sick ? 'danger' : 'warning'}" data-action="sick">${info.sick ? (isChief() ? 'Krankheitstag entfernen' : 'Krankheitstag gemeldet') : 'Als krank markieren'}</button></div><div class="card"><h2>Kundentermin vormerken</h2><form data-form="appointment" class="form-grid"><label>Kunde<input name="customer" list="customer-list"></label><label>Titel<input name="title" required></label><label class="wide">Notiz<textarea name="notes" rows="3"></textarea></label><button class="secondary">Termin speichern</button></form><div class="appointments">${selectedAppointments.length ? selectedAppointments.map(row => `<p><strong>${esc(row.title)}</strong> ${row.customer_name ? `· ${esc(row.customer_name)}` : ''}<button class="icon danger" data-action="appointment-delete" data-id="${row.id}">×</button></p>`).join('') : '<p class="muted">Keine Termine am ausgewählten Tag.</p>'}</div></div></section>${customerList()}`)
}

function messageBody(message) {
  const body = message.body || {}
  const parts = Object.entries(body).filter(([key]) => !['request_id', 'employee_id'].includes(key)).map(([key, value]) => `${key.replaceAll('_', ' ')}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
  return parts.length ? `<p>${esc(parts.join(' · '))}</p>` : ''
}

function inboxView() {
  const messages = state.data.messages.filter(message => state.folder === 'trash' ? Boolean(message.deleted_at) : !message.deleted_at && (state.folder === 'all' || state.folder === 'read' && message.read_at || state.folder === 'unread' && !message.read_at))
  return page('Postfach', 'BENACHRICHTIGUNGEN', `<div class="folders">${[['all', 'Alle'], ['unread', 'Ungelesen'], ['read', 'Gelesen'], ['trash', 'Papierkorb']].map(([id, label]) => `<button class="${state.folder === id ? 'selected' : ''}" data-action="folder" data-folder="${id}">${label}</button>`).join('')}</div><section class="cards">${messages.length ? messages.map(message => `<article class="card message ${message.read_at ? 'read' : 'unread'}"><div class="card-head"><div><p class="eyebrow">${esc(message.message_type)}</p><h3>${esc(message.title)}</h3><small>${new Date(message.created_at).toLocaleString('de-DE')}</small></div>${!message.read_at ? '<span class="unread-dot">Neu</span>' : ''}</div>${messageBody(message)}<div class="card-actions">${!message.read_at ? `<button class="secondary" data-action="message-read" data-id="${message.id}">Öffnen / als gelesen</button>` : ''}${message.deleted_at ? `<button class="secondary" data-action="message-restore" data-id="${message.id}">Wiederherstellen</button>` : `<button class="danger ghost" data-action="message-delete" data-id="${message.id}">Löschen</button>`}${isChief() && message.message_type === 'vacation_request' && message.body?.request_id ? `<button class="primary" data-action="vacation-approve" data-id="${message.body.request_id}">Genehmigen</button><button class="danger ghost" data-action="vacation-reject" data-id="${message.body.request_id}">Ablehnen</button>` : ''}</div></article>`).join('') : '<p class="empty">In diesem Ordner befinden sich keine Nachrichten.</p>'}</section>`)
}

function materialManager() {
  if (!isChief()) return ''
  return `<section class="card"><h2>Materialliste</h2><p class="muted">Ein Preis ist optional. Neue Artikel erhalten ohne Preis automatisch 0,00 €.</p><form data-form="material" class="inline-form"><label>Artikel<input name="name" required></label><label>Preis pro Stück (€)<input name="price" inputmode="decimal" placeholder="optional"></label><button class="primary">Artikel hinzufügen</button></form><div class="material-list">${state.data.materials.map(row => `<p><strong>${esc(row.name)}</strong><span>${money(row.unit_price)}</span><button class="link" data-action="material-price" data-id="${row.id}">Preis ändern</button><button class="link danger" data-action="material-delete" data-id="${row.id}">Entfernen</button></p>`).join('') || '<p class="empty">Noch keine Artikel.</p>'}</div></section>`
}

function employeeCard(profile) {
  const data = summary(profile.id), permission = profile.menu_permissions || {}
  const self = profile.id === state.profile.id
  return `<article class="card employee-card"><div class="card-head"><div><h3>${esc(profile.username)}</h3><p>${profile.role === 'chief' ? 'Chef' : 'Mitarbeiter'}</p></div><button class="link" data-action="settings-employee" data-id="${profile.id}">Statistik anzeigen</button></div><p>Stunden: ${hours(data.executed)} · Überstunden: ${hours(data.overtime)} · Resturlaub: ${data.remaining} Tage</p>${!self && profile.role === 'employee' ? `<form data-form="employee-update" class="form-grid"><input type="hidden" name="id" value="${profile.id}"><label>Benutzername<input name="username" value="${esc(profile.username)}"></label><label>Neues Passwort<input name="password" type="password" placeholder="unverändert lassen"></label><label>Urlaubstage<input name="allowance" inputmode="decimal" value="${esc(profile.vacation_allowance)}"></label><fieldset class="wide permissions"><legend>Sichtbare Menüs</legend>${[['planner', 'Zeiterfassung'], ['customers', 'Kunden'], ['orders', 'Arbeitsscheine'], ['calendar', 'Kalender']].map(([key, label]) => `<label class="check"><input type="checkbox" name="perm-${key}" ${permission[key] !== false ? 'checked' : ''}> ${label}</label>`).join('')}</fieldset><div class="form-actions"><button class="secondary">Mitarbeiter speichern</button><button type="button" class="danger ghost" data-action="employee-delete" data-id="${profile.id}">Mitarbeiter löschen</button></div></form>` : ''}</article>`
}

function pdfButton(employeeId = currentEmployee()) { return `<button class="secondary" data-action="pdf" data-id="${employeeId}">Daten als PDF herunterladen</button>` }

function settingsView() {
  const selected = person(currentEmployee()), account = `<section class="card"><h2>Mein Benutzerkonto</h2><form data-form="account" class="form-grid"><label>Benutzername<input name="username" value="${esc(state.profile.username)}" required></label>${isChief() ? `<label>Neues Passwort<input name="password" type="password" placeholder="unverändert lassen"></label><label>Vorhandene Urlaubstage<input name="allowance" inputmode="decimal" value="${esc(state.profile.vacation_allowance)}"></label>` : '<p class="muted wide">Passwörter werden ausschließlich vom Chef geändert.</p>'}<button class="primary">Konto speichern</button></form></section>`
  const staff = isChief() ? `<section class="card"><h2>Mitarbeiter hinzufügen</h2><form data-form="employee-create" class="inline-form"><label>Benutzername<input name="username" required></label><label>Passwort<input name="password" type="password" required></label><button class="primary">Mitarbeiter anlegen</button></form></section><section><h2>Team & Berechtigungen</h2><div class="cards">${state.people.map(employeeCard).join('')}</div></section>` : ''
  const columns = isChief() ? `<section class="card"><h2>Zusätzliche Eingabefelder Zeiterfassung</h2><form data-form="column" class="inline-form"><label>Feldbezeichnung<input name="name" required placeholder="z. B. Fahrzeug"></label><button class="secondary">Feld hinzufügen</button></form>${own(state.data.columns).length ? own(state.data.columns).map(row => `<p>${esc(row.name)} <button class="link danger" data-action="column-delete" data-id="${row.id}">Entfernen</button></p>`).join('') : '<p class="muted">Keine zusätzlichen Eingabefelder.</p>'}</section>` : ''
  return page('Einstellungen', 'KONTO & TEAM', `${employeePicker()}${metrics(currentEmployee())}${pdfButton(currentEmployee())}${account}${isChief() ? `<section class="card"><h2>Statistik: ${esc(selected?.username || '')}</h2><p>Ausgeführte Stunden: <strong>${hours(summary(currentEmployee()).executed)}</strong></p><p>Überstunden: <strong>${hours(summary(currentEmployee()).overtime)}</strong></p><p>Krankheitstage: <strong>${summary(currentEmployee()).sick}</strong></p><p>Vorhandene Urlaubstage: <strong>${summary(currentEmployee()).remaining}</strong></p></section>${columns}${materialManager()}${staff}` : ''}`)
}

function assignmentsView() {
  if (!isChief()) return page('Nicht verfügbar', 'CHEFBEREICH', '<p class="empty">Dieser Bereich ist nur für den Chef sichtbar.</p>')
  return page(`Aufträge Mitarbeiter · ${dateText(state.date)}`, 'CHEFBEREICH', `${weekStrip()}<section class="cards">${state.people.map(profile => { const orders = ordersFor(state.date, profile.id); return `<article class="card"><h2>${esc(profile.username)}</h2><p>${orders.length} Arbeitsschein${orders.length === 1 ? '' : 'e'}</p><button class="secondary" data-action="assignment-open" data-id="${profile.id}">Arbeitsscheine ansehen</button></article>` }).join('')}</section>`)
}

function assignmentDetailView() {
  const profile = person(currentEmployee()), orders = ordersFor(state.date, currentEmployee())
  return page(`${profile?.username || ''} · ${dateText(state.date)}`, 'AUFTRÄGE MITARBEITER', `<button class="back" data-action="assignments-back">← Zur Übersicht</button>${orders.length ? orders.map(order => orderCard(order, true)).join('') : '<p class="empty">Keine Arbeitsscheine an diesem Tag.</p>'}`)
}

function navigation() {
  const items = [['time', 'Zeiterfassung'], ['customers', 'Kunden'], ['orders', 'Arbeitsscheine'], ['calendar', 'Kalender'], ['inbox', 'Postfach'], ['settings', 'Einstellungen']]
  if (isChief()) items.splice(5, 0, ['assignments', 'Aufträge Mitarbeiter'])
  return `<nav>${items.filter(([view]) => permitted(view)).map(([view, label]) => `<button data-action="nav" data-view="${view}" class="${state.view === view ? 'selected' : ''}">${label}</button>`).join('')}</nav>`
}

function appView() {
  if (!state.session || !state.profile) return loginView()
  const view = state.view === 'customers-orders' ? customerOrdersView : state.view === 'assignment-detail' ? assignmentDetailView : ({ time: timeView, customers: customerView, orders: orderView, calendar: calendarView, inbox: inboxView, settings: settingsView, assignments: assignmentsView }[state.view] || timeView)
  return `<div class="app-shell"><header><div class="brand"><span>AZ</span><div><strong>Arbeitszeit</strong><small>${esc(state.profile.username)}</small></div></div>${navigation()}<button class="logout" data-action="logout">Abmelden</button></header>${view()}${state.toast ? `<div class="toast ${state.toast.error ? 'error' : ''}">${esc(state.toast.message)}</div>` : ''}${state.busy ? '<div class="busy">Wird gespeichert …</div>' : ''}</div>`
}

function loginView() {
  return `<main class="login"><section class="login-card"><div class="logo">AZ</div><p class="eyebrow">ARBEITSZEIT</p><h1>Willkommen</h1><p>Bitte mit Benutzername und Passwort anmelden.</p><form data-form="login" class="form-grid"><label>Benutzername<input name="username" autocomplete="username" required></label><label>Passwort<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">Anmelden</button></form><button class="link" data-action="password-help">Passwort vergessen?</button></section>${state.toast ? `<div class="toast ${state.toast.error ? 'error' : ''}">${esc(state.toast.message)}</div>` : ''}</main>`
}

function render() { root.innerHTML = appView() }

function values(form) {
  const data = new FormData(form)
  const get = key => String(data.get(key) ?? '').trim()
  return { data, get }
}

async function ensureCustomer(name) {
  const value = String(name || '').trim()
  if (!value) throw new Error('Bitte einen Kundennamen eingeben.')
  const exact = state.data.customers.find(customer => customer.name.localeCompare(value, 'de', { sensitivity: 'accent' }) === 0)
  if (exact) return exact
  const similar = state.data.customers.find(customer => customer.name.toLocaleLowerCase('de-DE').includes(value.toLocaleLowerCase('de-DE')) || value.toLocaleLowerCase('de-DE').includes(customer.name.toLocaleLowerCase('de-DE')))
  if (similar && window.confirm(`Meintest du „${similar.name}“?\n\nOK: vorhandenen Kunden verwenden\nAbbrechen: neuen Kunden anlegen`)) return similar
  return api(db.from('customers').insert({ id: uid(), employee_id: state.profile.id, name: value, custom_fields: {} }).select().single())
}

async function ensureMaterial(name, price = null) {
  const value = String(name || '').trim()
  if (!value) throw new Error('Bitte einen Artikel eingeben.')
  const exact = state.data.materials.find(material => material.name.localeCompare(value, 'de', { sensitivity: 'accent' }) === 0)
  let material = exact
  if (!material) {
    const restored = await api(db.rpc('reactivate_material_for_team', { p_name: value }))
    if (restored && typeof restored === 'object' && restored.id) material = restored
  }
  if (!material) {
    const normalized = value.toLocaleLowerCase('de-DE')
    const similar = state.data.materials.find(item => {
      const candidate = String(item.name || '').trim().toLocaleLowerCase('de-DE')
      return candidate && candidate !== normalized && (candidate.includes(normalized) || normalized.includes(candidate))
    })
    if (similar) {
      if (window.confirm(`Meintest du den Artikel „${similar.name}“?\n\nOK: vorhandenen Artikel verwenden\nAbbrechen: „${value}“ neu anlegen`)) material = similar
    } else if (!window.confirm(`„${value}“ ist noch nicht in der Materialliste.\n\nAls neuen Artikel ohne Preis anlegen?`)) {
      throw new Error('Artikel wurde nicht angelegt.')
    }
  }
  if (!material) material = await api(db.from('materials').insert({ id: uid(), name: value, unit_price: 0, active: true }).select().single())
  if (price !== null && isChief() && num(price) !== num(material.unit_price)) {
    await api(db.rpc('update_material_price_for_open_orders', { p_material_id: material.id, p_unit_price: Math.max(0, num(price)) }))
    material = { ...material, unit_price: Math.max(0, num(price)) }
  }
  return material
}

async function saveEntry(form, update = false) {
  const { get } = values(form), employeeId = currentEmployee(), info = dayInfo(state.date, employeeId)
  if (info.locked) throw new Error('Für diesen Tag können keine Arbeitszeiten erfasst werden.')
  const customer = await ensureCustomer(get('customer'))
  const times = calculateTimes({ start: get('start'), end: get('end'), pause: get('pause'), duration: get('hours') })
  const custom_fields = Object.fromEntries(own(state.data.columns, employeeId).map(column => [column.id, get(`custom-${column.id}`)]))
  const row = { employee_id: employeeId, work_date: state.date, customer_id: customer.id, customer_name: customer.name, custom_fields, ...times }
  if (update) await api(db.from('time_entries').update(row).eq('id', get('id')).select().single())
  else await api(db.from('time_entries').insert({ id: uid(), ...row, custom_fields: {} }).select().single())
}

async function createOrder(form) {
  const { get } = values(form), employeeId = currentEmployee(), info = dayInfo(state.date, employeeId)
  if (info.locked) throw new Error('Für diesen Tag können keine Arbeitsscheine angelegt werden.')
  const customer = await ensureCustomer(get('customer'))
  const times = calculateTimes({ start: get('start'), end: get('end'), pause: get('pause'), duration: get('hours') })
  const order = await api(db.from('work_orders').insert({ id: uid(), employee_id: employeeId, work_date: state.date, customer_id: customer.id, customer_name: customer.name, title: get('title'), notes: get('notes'), documentation: get('documentation'), invoiced: false, ...times }).select().single())
  try {
    await api(db.from('time_entries').insert({ id: uid(), employee_id: employeeId, work_date: state.date, customer_id: customer.id, customer_name: customer.name, work_order_id: order.id, custom_fields: {}, ...times }).select().single())
  } catch (error) {
    await api(db.from('work_orders').delete().eq('id', order.id))
    throw error
  }
}

async function deleteOrder(id) {
  const documents = state.data.documents.filter(row => row.work_order_id === id)
  await api(db.from('time_entries').delete().eq('work_order_id', id))
  await api(db.from('work_order_items').delete().eq('work_order_id', id))
  await api(db.from('work_order_documents').delete().eq('work_order_id', id))
  await api(db.from('work_orders').delete().eq('id', id))
  if (documents.length) await db.storage.from('work-order-documents').remove(documents.map(row => row.file_path)).catch(() => {})
}

async function setSick() {
  const employeeId = currentEmployee(), existing = own(state.data.days, employeeId).find(row => same(row.work_date, state.date))
  const current = num(existing?.sick) > 0
  if (current && !isChief()) throw new Error('Nur der Chef kann Krankheitstage entfernen.')
  if (existing) await api(db.from('work_days').update({ sick: current ? 0 : 1 }).eq('employee_id', employeeId).eq('work_date', state.date).select().single())
  else await api(db.from('work_days').insert({ employee_id: employeeId, work_date: state.date, vacation: 0, sick: 1 }).select().single())
}

async function vacation(action, requestId, status) {
  const result = await db.functions.invoke('vacation-workflow', { body: action === 'request' ? requestId : { action, requestId, status } })
  if (result.error || result.data?.error) throw new Error(result.error?.message || result.data?.error)
}

async function uploadDocuments(form) {
  const { data, get } = values(form), orderId = get('orderId'), files = data.getAll('documents').filter(file => file instanceof File && file.size)
  if (!files.length) throw new Error('Bitte mindestens eine Datei auswählen.')
  const order = state.data.orders.find(row => row.id === orderId)
  if (!order) throw new Error('Arbeitsschein nicht gefunden.')
  for (const file of files) {
    if (file.size > 25 * 1024 * 1024) throw new Error('Eine Datei darf höchstens 25 MB groß sein.')
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_')
    const path = `${order.employee_id}/${orderId}/${uid()}-${safeName}`
    await api(db.storage.from('work-order-documents').upload(path, file, { contentType: file.type || undefined }))
    await api(db.from('work_order_documents').insert({ id: uid(), work_order_id: orderId, employee_id: order.employee_id, file_path: path, file_name: file.name, mime_type: file.type || null }).select().single())
  }
}

async function downloadDocument(id) {
  const row = state.data.documents.find(item => item.id === id)
  if (!row) throw new Error('Dokument nicht gefunden.')
  const result = await db.storage.from('work-order-documents').createSignedUrl(row.file_path, 60)
  if (result.error || !result.data?.signedUrl) throw new Error(result.error?.message || 'Dokument konnte nicht geöffnet werden.')
  window.open(result.data.signedUrl, '_blank', 'noopener')
}

async function deleteCustomer(id) {
  await api(db.from('time_entries').update({ customer_id: null }).eq('customer_id', id))
  await api(db.from('work_orders').update({ customer_id: null }).eq('customer_id', id))
  await api(db.from('appointments').update({ customer_id: null }).eq('customer_id', id))
  await api(db.from('customers').delete().eq('id', id))
}

async function downloadPdf(employeeId) {
  const profile = person(employeeId), entries = own(state.data.entries, employeeId).sort((a, b) => String(a.work_date).localeCompare(String(b.work_date))), total = summary(employeeId)
  if (!window.jspdf?.jsPDF) throw new Error('Die PDF-Erstellung wird noch geladen. Bitte erneut versuchen.')
  const pdf = new window.jspdf.jsPDF()
  let y = 18
  const line = text => { if (y > 278) { pdf.addPage(); y = 18 } pdf.text(String(text).slice(0, 120), 14, y); y += 7 }
  line(`Arbeitszeit · ${profile?.username || ''}`); line(`Erstellt am ${new Date().toLocaleDateString('de-DE')}`); y += 4
  entries.forEach(entry => line(`${dateText(entry.work_date)} · ${entry.customer_name || '–'} · ${hours(entry.executed_hours)} · Überstunden ${hours(num(entry.executed_hours) - workTarget(entry.work_date))}`))
  const sickness = own(state.data.days, employeeId).filter(row => num(row.sick) > 0).map(row => row.work_date)
  const vacations = own(state.data.vacations, employeeId).filter(row => row.status !== 'rejected')
  y += 4; line(`Gesamtstunden: ${hours(total.executed)}`); line(`Überstunden: ${hours(total.overtime)}`); line(`Krankheitstage: ${total.sick}${sickness.length ? ` (${sickness.map(shortDate).join(', ')})` : ''}`); line(`Resturlaub: ${total.remaining} Tage`)
  vacations.forEach(row => line(`Urlaub ${row.status === 'approved' ? 'genehmigt' : 'angefragt'}: ${dateText(row.start_date)} bis ${dateText(row.end_date)} · ${num(row.requested_days)} Tage`))
  pdf.save(`Arbeitszeit-${profile?.username || 'Daten'}.pdf`)
}

root.addEventListener('submit', event => {
  const form = event.target.closest('form')
  if (!form) return
  event.preventDefault()
  const task = async () => {
    const type = form.dataset.form
    if (type === 'login') {
      const { get } = values(form)
      const result = await db.auth.signInWithPassword({ email: `${get('username').toLowerCase()}@arbeitszeit.local`, password: get('password') })
      if (result.error) throw result.error
      await load()
      return
    }
    if (type === 'entry') return saveEntry(form)
    if (type === 'entry-update') return saveEntry(form, true)
    if (type === 'order') return createOrder(form)
    if (type === 'customer') { const { get } = values(form); await ensureCustomer(get('name')); return }
    if (type === 'customer-update') {
      const { get } = values(form), fields = { address: get('address'), city: get('city'), postal_code: get('postal_code'), email: get('email'), phone_private: get('phone_private'), phone_mobile: get('phone_mobile') }
      await api(db.from('customers').update({ name: get('name'), custom_fields: fields }).eq('id', get('id')).select().single()); return
    }
    if (type === 'item') { const { get } = values(form), material = await ensureMaterial(get('material')); await api(db.from('work_order_items').insert({ id: uid(), work_order_id: get('orderId'), material_id: material.id, position_name: material.name, quantity: Math.max(0, num(get('quantity'))), unit_price: material.unit_price }).select().single()); return }
    if (type === 'document') return uploadDocuments(form)
    if (type === 'vacation') { const { get } = values(form); return vacation('request', { action: 'request', startDate: get('start'), endDate: get('end') }) }
    if (type === 'appointment') { const { get } = values(form), customer = get('customer') ? await ensureCustomer(get('customer')) : null; await api(db.from('appointments').insert({ id: uid(), employee_id: currentEmployee(), event_date: state.date, customer_id: customer?.id || null, customer_name: customer?.name || '', title: get('title'), notes: get('notes') }).select().single()); return }
    if (type === 'material') { const { get } = values(form); await ensureMaterial(get('name'), get('price') === '' ? null : get('price')); return }
    if (type === 'account') { const { get } = values(form); const body = { action: 'self-update', username: get('username') }; if (isChief() && get('password')) body.password = get('password'); if (isChief()) body.vacationAllowance = get('allowance'); const response = await db.functions.invoke('manage-employees', { body }); if (response.error || response.data?.error) throw new Error(response.error?.message || response.data?.error); return }
    if (type === 'employee-create') { const { get } = values(form), response = await db.functions.invoke('manage-employees', { body: { action: 'create', username: get('username'), password: get('password') } }); if (response.error || response.data?.error) throw new Error(response.error?.message || response.data?.error); return }
    if (type === 'employee-update') { const { get, data } = values(form), response = await db.functions.invoke('manage-employees', { body: { action: 'update', employeeId: get('id'), username: get('username'), password: get('password'), vacationAllowance: get('allowance'), menuPermissions: { planner: data.get('perm-planner') === 'on', customers: data.get('perm-customers') === 'on', orders: data.get('perm-orders') === 'on', calendar: data.get('perm-calendar') === 'on' } } }); if (response.error || response.data?.error) throw new Error(response.error?.message || response.data?.error); return }
    if (type === 'column') { const { get } = values(form); await api(db.from('custom_columns').insert({ id: uid(), employee_id: currentEmployee(), name: get('name'), position: own(state.data.columns).length }).select().single()); return }
  }
  const messages = { login: '', entry: 'Zeiteintrag hinzugefügt.', 'entry-update': 'Zeiteintrag gespeichert.', order: 'Arbeitsschein und Zeiterfassung angelegt.', customer: 'Kunde hinzugefügt.', 'customer-update': 'Kundendaten gespeichert.', item: 'Materialposition hinzugefügt.', document: 'Dokument hochgeladen.', vacation: 'Urlaubsantrag gespeichert.', appointment: 'Termin gespeichert.', material: 'Artikel gespeichert.', account: 'Benutzerkonto gespeichert.', 'employee-create': 'Mitarbeiter angelegt.', 'employee-update': 'Mitarbeiter gespeichert.', column: 'Eingabefeld hinzugefügt.' }
  run(messages[form.dataset.form] || '', task)
})

root.addEventListener('change', event => {
  const target = event.target
  if (target.matches('[data-action="employee"]')) { state.employeeId = target.value; render(); return }
  if (target.matches('[data-action="invoice"]')) run(target.checked ? 'Arbeitsschein als abgerechnet markiert.' : 'Arbeitsschein wieder geöffnet.', () => api(db.from('work_orders').update({ invoiced: target.checked }).eq('id', target.dataset.id).select().single()))
})

root.addEventListener('click', event => {
  const button = event.target.closest('button')
  if (!button) return
  const action = button.dataset.action
  if (!action) return
  if (action === 'nav') { state.view = button.dataset.view; state.customerId = null; render(); return }
  if (action === 'logout') { run('', () => db.auth.signOut()); return }
  if (action === 'date' || action === 'calendar-date') { state.date = button.dataset.date; const date = dateObject(state.date); state.month = date.getMonth(); state.year = date.getFullYear(); render(); return }
  if (action === 'month-prev') { const date = new Date(state.year, state.month - 1, 1); state.year = date.getFullYear(); state.month = date.getMonth(); render(); return }
  if (action === 'month-next') { const date = new Date(state.year, state.month + 1, 1); state.year = date.getFullYear(); state.month = date.getMonth(); render(); return }
  if (action === 'month-today') { const date = new Date(); state.year = date.getFullYear(); state.month = date.getMonth(); state.date = today(); render(); return }
  if (action === 'sick') { run('Krankheitstag gespeichert.', setSick); return }
  if (action === 'entry-delete') { if (window.confirm('Zeiteintrag löschen?')) run('Zeiteintrag gelöscht.', () => api(db.from('time_entries').delete().eq('id', button.dataset.id))); return }
  if (action === 'order-delete') { if (window.confirm('Arbeitsschein, Materialpositionen und zugehörige Zeiterfassung löschen?')) run('Arbeitsschein gelöscht.', () => deleteOrder(button.dataset.id)); return }
  if (action === 'item-delete') { if (window.confirm('Materialposition löschen?')) run('Materialposition gelöscht.', () => api(db.from('work_order_items').delete().eq('id', button.dataset.id))); return }
  if (action === 'document-open') { run('', () => downloadDocument(button.dataset.id)); return }
  if (action === 'document-delete') { if (window.confirm('Dokument löschen?')) run('Dokument gelöscht.', async () => { const doc = state.data.documents.find(row => row.id === button.dataset.id); await api(db.from('work_order_documents').delete().eq('id', button.dataset.id)); if (doc) await db.storage.from('work-order-documents').remove([doc.file_path]) }); return }
  if (action === 'customer-orders') { state.customerId = button.dataset.id; state.view = 'customers-orders'; render(); return }
  if (action === 'customers-back') { state.view = 'customers'; state.customerId = null; render(); return }
  if (action === 'customer-delete') { if (window.confirm('Kunde löschen? Zugeordnete historische Einträge bleiben ohne Kundenzuordnung erhalten.')) run('Kunde gelöscht.', () => deleteCustomer(button.dataset.id)); return }
  if (action === 'appointment-delete') { if (window.confirm('Termin löschen?')) run('Termin gelöscht.', () => api(db.from('appointments').delete().eq('id', button.dataset.id))); return }
  if (action === 'folder') { state.folder = button.dataset.folder; render(); return }
  if (action === 'message-read') { run('Nachricht als gelesen markiert.', () => api(db.from('mailbox_messages').update({ read_at: new Date().toISOString() }).eq('id', button.dataset.id).select().single())); return }
  if (action === 'message-delete') { run('Nachricht in den Papierkorb verschoben.', () => api(db.from('mailbox_messages').update({ deleted_at: new Date().toISOString() }).eq('id', button.dataset.id).select().single())); return }
  if (action === 'message-restore') { run('Nachricht wiederhergestellt.', () => api(db.from('mailbox_messages').update({ deleted_at: null }).eq('id', button.dataset.id).select().single())); return }
  if (action === 'vacation-approve' || action === 'vacation-reject') { run(action === 'vacation-approve' ? 'Urlaub genehmigt.' : 'Urlaub abgelehnt.', () => vacation('decide', button.dataset.id, action === 'vacation-approve' ? 'approved' : 'rejected')); return }
  if (action === 'vacation-delete') { if (window.confirm('Urlaubsantrag entfernen?')) run('Urlaubsantrag entfernt.', () => vacation('delete', button.dataset.id)); return }
  if (action === 'material-delete') { if (window.confirm('Artikel aus der Materialliste entfernen? Bereits verwendete Positionen bleiben erhalten.')) run('Artikel entfernt.', () => api(db.from('materials').update({ active: false }).eq('id', button.dataset.id).select().single())); return }
  if (action === 'material-price') { const row = state.data.materials.find(item => item.id === button.dataset.id); const value = window.prompt(`Neuer Preis für ${row?.name || 'Artikel'} (€):`, String(row?.unit_price ?? 0)); if (value !== null) run('Materialpreis gespeichert.', () => ensureMaterial(row?.name, value)); return }
  if (action === 'employee-delete') { if (window.confirm('Mitarbeiterkonto wirklich löschen?')) run('Mitarbeiter gelöscht.', async () => { const response = await db.functions.invoke('manage-employees', { body: { action: 'delete', employeeId: button.dataset.id } }); if (response.error || response.data?.error) throw new Error(response.error?.message || response.data?.error) }); return }
  if (action === 'column-delete') { if (window.confirm('Zusätzliches Eingabefeld entfernen? Bereits gespeicherte Werte bleiben erhalten.')) run('Eingabefeld entfernt.', () => api(db.from('custom_columns').delete().eq('id', button.dataset.id))); return }
  if (action === 'settings-employee') { state.employeeId = button.dataset.id; render(); return }
  if (action === 'pdf') { run('', () => downloadPdf(button.dataset.id)); return }
  if (action === 'assignment-open') { state.employeeId = button.dataset.id; state.view = 'assignment-detail'; render(); return }
  if (action === 'assignments-back') { state.view = 'assignments'; render(); return }
  if (action === 'password-help') { const username = window.prompt('Bitte Benutzernamen eingeben:'); if (username !== null) run('Wenn ein Konto gefunden wurde, wurde der Chef informiert.', async () => { const response = await db.functions.invoke('request-password-help', { body: { username } }); if (response.error || response.data?.error) throw new Error(response.error?.message || response.data?.error) }); return }
})

db.auth.onAuthStateChange(() => load().catch(error => notify(error.message || 'Anmeldung konnte nicht aktualisiert werden.', true)))
window.addEventListener('visibilitychange', () => { if (!document.hidden && state.session) load().catch(() => {}) })
setInterval(() => { if (state.session && !state.busy) load().catch(() => {}) }, 30000)
load().catch(error => notify(error.message || 'App konnte nicht geladen werden.', true))
