import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const root = document.querySelector('#app')
const config = window.WORKTIME_CONFIG

if (!config?.supabaseUrl || !config?.supabasePublishableKey) {
  root.innerHTML = '<main class="boot-error">Die App-Konfiguration fehlt.</main>'
  throw new Error('WORKTIME_CONFIG fehlt')
}

const db = createClient(config.supabaseUrl, config.supabasePublishableKey)
const today = () => new Date().toISOString().slice(0, 10)
const HOLIDAYS = {
  '2026-01-01': 'Neujahr', '2026-04-03': 'Karfreitag', '2026-04-06': 'Ostermontag',
  '2026-05-01': 'Tag der Arbeit', '2026-05-14': 'Christi Himmelfahrt',
  '2026-05-25': 'Pfingstmontag', '2026-06-04': 'Fronleichnam',
  '2026-10-03': 'Tag der Deutschen Einheit', '2026-11-01': 'Allerheiligen',
  '2026-12-25': '1. Weihnachtstag', '2026-12-26': '2. Weihnachtstag',
}

const state = {
  session: null,
  profile: null,
  people: [],
  data: emptyData(),
  view: 'time',
  selectedEmployeeId: null,
  selectedBusinessId: null,
  selectedSettingsAccountId: null,
  selectedCustomerId: null,
  date: today(),
  month: new Date().getMonth(),
  year: new Date().getFullYear(),
  folder: 'all',
  menuOpen: false,
  openMessageId: null,
  busy: false,
  toast: null,
  channel: null,
  refreshTimer: 0,
}

function emptyData() {
  return { customers: [], workDays: [], entries: [], orders: [], items: [], documents: [], materials: [], messages: [], appointments: [], vacations: [], columns: [], payslips: [] }
}

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char])
const number = value => { const parsed = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(parsed) ? parsed : 0 }
const money = value => number(value).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
const hours = value => `${number(value).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`
const timeText = value => value ? `${String(value).slice(0, 5)} Uhr` : '–'
const dateText = value => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
const shortDate = value => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(new Date(`${value}T12:00:00`))
const same = (a, b) => String(a ?? '') === String(b ?? '')
const isAdmin = () => state.profile?.role === 'administrator'
const isBusiness = () => state.profile?.role === 'business'
const isChief = () => isAdmin() || isBusiness()
const person = id => state.people.find(row => same(row.id, id)) || null
const selectedEmployee = () => {
  const selected = person(state.selectedEmployeeId)
  return selected?.role === 'employee' ? selected : null
}
// Administrators are never used as an employee profile. They explicitly choose an
// employee only when they want to inspect that person's work data.
const activeEmployeeId = () => isAdmin() ? (selectedEmployee()?.id || '') : isBusiness() ? (state.selectedEmployeeId || state.profile?.id || '') : (state.profile?.id || '')
const employeeName = id => person(id)?.username || (isAdmin() ? 'Kein Mitarbeiter ausgewählt' : 'Unbekannt')
const businesses = () => state.people.filter(row => row.role === 'business')
const businessIdOf = row => row?.business_id || (row?.role === 'business' ? row.id : '')
const activeBusinessId = () => isAdmin() ? (state.selectedBusinessId || businesses()[0]?.id || '') : (businessIdOf(state.profile) || '')
const peopleForBusiness = businessId => state.people.filter(row => same(businessIdOf(row), businessId))
const managedPeople = () => peopleForBusiness(activeBusinessId())
const managedEmployees = () => managedPeople().filter(row => row.role === 'employee')
const roleLabel = role => role === 'administrator' ? 'Administrator' : role === 'business' ? 'Geschäftskonto' : 'Mitarbeiter'
const activeBusiness = () => state.people.find(row => same(row.id, activeBusinessId()) && row.role === 'business') || null
const settingsAccount = () => person(state.selectedSettingsAccountId) || state.profile
const companyName = () => activeBusiness()?.company_name || activeBusiness()?.username || 'Zeiterfassung'
const companyLogoUrl = () => {
  const path = activeBusiness()?.company_logo_path
  if (!path) return ''
  return db.storage.from('company-logos').getPublicUrl(path).data.publicUrl || ''
}
const companyInitials = () => companyName().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'AZ'
const dateObject = value => new Date(`${value}T12:00:00`)
const isoDate = value => value.toISOString().slice(0, 10)
const shiftDate = (value, days) => { const result = dateObject(value); result.setDate(result.getDate() + days); return isoDate(result) }
const weekday = value => dateObject(value).getDay()
const holiday = value => HOLIDAYS[value] || ''
const targetHours = value => { const day = weekday(value); return day >= 1 && day <= 4 ? 8 : day === 5 ? 5 : 0 }
const normalize = value => String(value ?? '').trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ')
const own = (rows, employeeId = activeEmployeeId()) => (rows || []).filter(row => same(row.employee_id, employeeId))

function quarterNumber(value, label) {
  const result = number(value)
  if (result < 0 || Math.round(result * 4) !== result * 4) throw new Error(`${label} müssen in 15-Minuten-Schritten eingegeben werden.`)
  return result
}

function minutes(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value ?? ''))) return null
  const [hour, minute] = String(value).split(':').map(Number)
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

function quarterTime(value, label) {
  const result = minutes(String(value ?? '').slice(0, 5))
  if (result === null) throw new Error(`${label} ist ungültig.`)
  const rounded = Math.round(result / 15) * 15
  const normalized = rounded === 1440 ? 0 : rounded
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

function addMinutes(value, amount) {
  const start = minutes(value)
  if (start === null) return ''
  const total = ((start + amount) % 1440 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function durationOptions(value = '', maximum = 16, empty = 'Auswählen') {
  const current = String(value ?? '')
  const values = Array.from({ length: maximum * 4 + 1 }, (_, index) => index / 4)
  return `<select name="hours"><option value="">${empty}</option>${values.slice(1).map(item => `<option value="${item}" ${same(current, item) ? 'selected' : ''}>${hours(item)}</option>`).join('')}</select>`
}

function pauseOptions(value = 0) {
  const current = String(value ?? 0)
  const values = Array.from({ length: 17 }, (_, index) => index / 4)
  return `<select name="pause">${values.map(item => `<option value="${item}" ${same(current, item) ? 'selected' : ''}>${hours(item)}</option>`).join('')}</select>`
}

function api(query) {
  return query.then(({ data, error }) => { if (error) throw error; return data })
}

function notify(message, error = false) {
  state.toast = { message, error }
  render()
  clearTimeout(notify.timer)
  notify.timer = setTimeout(() => { state.toast = null; render() }, 4200)
}

async function perform(message, work) {
  if (state.busy) return
  state.busy = true
  render()
  try {
    await work()
    await loadData()
    if (message) notify(message)
  } catch (error) {
    notify(error?.message || 'Die Aktion konnte nicht ausgeführt werden.', true)
  } finally {
    state.busy = false
    render()
  }
}

async function optional(query) {
  try { return await api(query) } catch { return [] }
}

async function loadData() {
  const { data: auth } = await db.auth.getSession()
  state.session = auth.session
  if (!state.session) {
    state.channel?.unsubscribe()
    state.channel = null
    state.profile = null
    state.people = []
    state.data = emptyData()
    render()
    return
  }
  state.profile = await api(db.from('profiles').select('*').eq('id', state.session.user.id).single())
  const people = await optional(db.from('profiles').select('*').order('username'))
  state.people = people?.length ? people : [state.profile]
  if (isAdmin() && !businesses().some(row => same(row.id, state.selectedBusinessId))) state.selectedBusinessId = businesses()[0]?.id || null
  if (isAdmin()) {
    const available = peopleForBusiness(state.selectedBusinessId).filter(row => row.role === 'employee')
    if (!available.some(row => same(row.id, state.selectedEmployeeId))) state.selectedEmployeeId = null
    if (!person(state.selectedSettingsAccountId)) state.selectedSettingsAccountId = state.profile.id
  } else if (!peopleForBusiness(activeBusinessId()).some(row => same(row.id, state.selectedEmployeeId))) {
    state.selectedEmployeeId = state.profile.id
    if (!person(state.selectedSettingsAccountId)) state.selectedSettingsAccountId = state.profile.id
  }
  const businessId = activeBusinessId()
  const [customers, workDays, entries, orders, items, documents, materials, messages, appointments, vacations, columns, payslips] = await Promise.all([
    optional(db.from('customers').select('*').order('name')),
    optional(db.from('work_days').select('*').order('work_date', { ascending: false })),
    optional(db.from('time_entries').select('*').order('work_date', { ascending: false }).order('created_at')),
    optional(db.from('work_orders').select('*').order('work_date', { ascending: false }).order('created_at')),
    optional(db.from('work_order_items').select('*').order('created_at')),
    optional(db.from('work_order_documents').select('*').order('created_at')),
    optional(db.from('materials').select('*').eq('active', true).eq('business_id', businessId).order('name')),
    optional(db.from('mailbox_messages').select('*').order('created_at', { ascending: false })),
    optional(db.from('appointments').select('*').order('event_date')),
    optional(db.from('vacation_requests').select('*').order('created_at', { ascending: false })),
    optional(db.from('custom_columns').select('*').order('position').order('created_at')),
    optional(db.from('employee_payslips').select('*').order('created_at', { ascending: false })),
  ])
  state.data = { customers, workDays, entries, orders, items, documents, materials, messages, appointments, vacations, columns, payslips }
  setupRealtime()
  render()
}

function setupRealtime() {
  if (state.channel || !state.profile) return
  const tables = ['profiles', 'customers', 'work_days', 'time_entries', 'work_orders', 'work_order_items', 'work_order_documents', 'materials', 'mailbox_messages', 'appointments', 'vacation_requests', 'custom_columns', 'employee_payslips']
  let channel = db.channel(`arbeitszeit-v400-${state.profile.id}`)
  tables.forEach(table => { channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => scheduleRefresh()) })
  state.channel = channel.subscribe()
}

function scheduleRefresh() {
  clearTimeout(state.refreshTimer)
  state.refreshTimer = setTimeout(() => loadData().catch(() => {}), 250)
}

function dayState(date = state.date, employeeId = activeEmployeeId()) {
  const sickness = own(state.data.workDays, employeeId).find(row => same(row.work_date, date) && number(row.sick) > 0)
  const vacation = own(state.data.vacations, employeeId).find(row => row.status !== 'rejected' && row.start_date <= date && row.end_date >= date)
  const approvedVacation = vacation?.status === 'approved'
  const holidayName = holiday(date)
  return { sickness: Boolean(sickness), vacation, approvedVacation, holiday: holidayName, locked: Boolean(sickness || approvedVacation || holidayName) }
}

function entriesFor(date = state.date, employeeId = activeEmployeeId()) {
  return own(state.data.entries, employeeId).filter(row => same(row.work_date, date)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
}

function ordersFor(date = state.date, employeeId = activeEmployeeId()) {
  return own(state.data.orders, employeeId).filter(row => same(row.work_date, date)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
}

function nextStart(date = state.date, employeeId = activeEmployeeId()) {
  const times = [...entriesFor(date, employeeId), ...ordersFor(date, employeeId)].map(row => String(row.end_time || '').slice(0, 5)).filter(value => minutes(value) !== null).sort()
  return times.at(-1) || '07:30'
}

function calculateTimes(values, defaultStart = nextStart()) {
  const start = quarterTime(values.start || defaultStart, 'Der Arbeitsbeginn')
  const pause = quarterNumber(values.pause || 0, 'Die Pause')
  const endProvided = String(values.end || '').trim() !== ''
  const hoursProvided = String(values.hours || '').trim() !== ''
  if (!endProvided && !hoursProvided) throw new Error('Bitte Endzeit oder Arbeitsstunden auswählen.')
  const useHours = (values.source === 'hours' && hoursProvided) || !endProvided
  if (useHours) {
    const executed = quarterNumber(values.hours, 'Die Arbeitsstunden')
    return { start_time: start, end_time: addMinutes(start, Math.round((executed + pause) * 60)), pause_hours: pause, executed_hours: executed, calculation_mode: 'hours' }
  }
  if (endProvided) {
    const end = quarterTime(values.end, 'Die Endzeit')
    const startMinutes = minutes(start), endMinutes = minutes(end)
    const totalMinutes = (endMinutes < startMinutes ? endMinutes + 1440 : endMinutes) - startMinutes
    const executed = quarterNumber(totalMinutes / 60 - pause, 'Die berechneten Arbeitsstunden')
    if (executed < 0) throw new Error('Die Endzeit liegt vor dem Arbeitsbeginn.')
    return { start_time: start, end_time: end, pause_hours: pause, executed_hours: executed, calculation_mode: 'end_time' }
  }
  throw new Error('Bitte Endzeit oder Arbeitsstunden auswählen.')
}

function field(form, name) { return form?.querySelector(`[name="${name}"]`) }

function roundFormTimes(form) {
  ;['start', 'end'].forEach(name => {
    const input = field(form, name)
    if (input?.value) input.value = quarterTime(input.value, name === 'start' ? 'Der Arbeitsbeginn' : 'Die Endzeit')
  })
}

function syncHoursFromTimes(form) {
  roundFormTimes(form)
  const start = field(form, 'start')?.value
  const end = field(form, 'end')?.value
  if (!start || !end) return
  const pause = quarterNumber(field(form, 'pause')?.value || 0, 'Die Pause')
  const startMinutes = minutes(start), endMinutes = minutes(end)
  const totalMinutes = (endMinutes < startMinutes ? endMinutes + 1440 : endMinutes) - startMinutes
  const executed = Math.max(0, Math.round((totalMinutes / 60 - pause) * 4) / 4)
  const duration = field(form, 'hours')
  if (duration) duration.value = String(executed)
  const source = field(form, 'source')
  if (source) source.value = 'time'
}

function syncEndFromHours(form) {
  roundFormTimes(form)
  const start = field(form, 'start')?.value
  const duration = field(form, 'hours')?.value
  if (!start || duration === '') return
  const pause = quarterNumber(field(form, 'pause')?.value || 0, 'Die Pause')
  const executed = quarterNumber(duration, 'Die Arbeitsstunden')
  const end = field(form, 'end')
  if (end) end.value = addMinutes(start, Math.round((executed + pause) * 60))
  const source = field(form, 'source')
  if (source) source.value = 'hours'
}

function synchroniseTimeForm(form, mode) {
  try {
    if (mode === 'time') syncHoursFromTimes(form)
    else if (mode === 'hours') syncEndFromHours(form)
    else if (field(form, 'source')?.value === 'time') syncHoursFromTimes(form)
    else syncEndFromHours(form)
  } catch (error) {
    notify(error?.message || 'Die Zeit konnte nicht berechnet werden.', true)
  }
}

function isAllowed(view) {
  if (isChief()) return true
  if (['inbox', 'settings'].includes(view)) return true
  const permissions = state.profile?.menu_permissions || {}
  if (view === 'time') return permissions.time !== false && permissions.planner !== false
  return permissions[view] !== false
}

function statusMetrics(employeeId = activeEmployeeId()) {
  const entries = own(state.data.entries, employeeId)
  const executed = entries.reduce((sum, row) => sum + number(row.executed_hours), 0)
  const overtime = entries.reduce((sum, row) => sum + number(row.executed_hours) - targetHours(row.work_date), 0)
  const sick = own(state.data.workDays, employeeId).filter(row => number(row.sick) > 0).length
  const allowance = number(person(employeeId)?.vacation_allowance)
  const used = own(state.data.vacations, employeeId).filter(row => row.status === 'approved').reduce((sum, row) => sum + number(row.requested_days), 0)
  return { executed, overtime, sick, remaining: Math.max(0, allowance - used) }
}

function weekStrip() {
  const offset = (weekday(state.date) + 6) % 7
  const monday = shiftDate(state.date, -offset)
  return `<div class="week-strip">${Array.from({ length: 7 }, (_, index) => {
    const date = shiftDate(monday, index), info = dayState(date)
    const classes = ['week-day', same(date, state.date) ? 'selected' : '', info.sickness ? 'sick' : '', info.approvedVacation ? 'vacation' : '', info.vacation?.status === 'requested' ? 'requested' : '', info.holiday ? 'holiday' : ''].filter(Boolean).join(' ')
    return `<button type="button" class="${classes}" data-action="date" data-date="${date}"><span>${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][index]}</span><strong>${dateObject(date).getDate()}</strong></button>`
  }).join('')}</div>`
}

function employeePicker() {
  if (!isChief()) return ''
  const available = isBusiness() ? [state.profile, ...managedEmployees()] : managedEmployees()
  if (!available.length) return '<p class="muted">Für das ausgewählte Geschäftskonto sind noch keine Mitarbeiter angelegt.</p>'
  const current = activeEmployeeId()
  const placeholder = isAdmin() ? `<option value="" disabled ${!current ? 'selected' : ''}>Mitarbeiter auswählen</option>` : ''
  return `<label class="select-label">Mitarbeiter<select data-action="employee-picker">${placeholder}${available.map(row => `<option value="${row.id}" ${same(row.id, current) ? 'selected' : ''}>${escapeHtml(row.username)} · ${escapeHtml(roleLabel(row.role))}</option>`).join('')}</select></label>`
}

function businessPicker() {
  if (!isAdmin()) return ''
  return `<label class="select-label">Geschäftskonto<select data-action="business-picker">${businesses().map(row => `<option value="${row.id}" ${same(row.id, activeBusinessId()) ? 'selected' : ''}>${escapeHtml(row.company_name || row.username)}</option>`).join('')}</select></label>`
}

function metrics(employeeId = activeEmployeeId()) {
  const value = statusMetrics(employeeId)
  const overtimeClass = value.overtime > 0 ? 'positive' : value.overtime < 0 ? 'negative' : ''
  return `<section class="metrics"><article><span>Stunden</span><strong>${hours(value.executed)}</strong></article><article><span>Überstunden</span><strong class="${overtimeClass}">${value.overtime === 0 ? '–' : hours(value.overtime)}</strong></article><article><span>Krankheit</span><strong>${value.sick} Tage</strong></article><article><span>Resturlaub</span><strong>${value.remaining} Tage</strong></article></section>`
}

function lockNotice(info = dayState()) {
  if (!info.locked) return ''
  const text = info.sickness ? 'Krankheitstag: Zeiterfassung und Arbeitsscheine sind gesperrt.' : info.approvedVacation ? 'Genehmigter Urlaub: Zeiterfassung und Arbeitsscheine sind gesperrt.' : `${info.holiday}: Feiertag`
  return `<p class="notice lock">${escapeHtml(text)}</p>`
}

function customerDatalist() {
  return `<datalist id="customers">${state.data.customers.map(row => `<option value="${escapeHtml(row.name)}"></option>`).join('')}</datalist>`
}

function page(title, eyebrow, content, actions = '') {
  return `<main class="page"><section class="hero"><div><p class="eyebrow">${eyebrow}</p><h1>${escapeHtml(title)}</h1></div>${actions}</section>${content}</main>`
}

function companyLogo(className = 'company-logo') {
  const url = companyLogoUrl()
  return url ? `<span class="${className} image"><img src="${escapeHtml(url)}" alt="${escapeHtml(companyName())} Logo"></span>` : `<span class="${className}">${escapeHtml(companyInitials())}</span>`
}

function selectedDayTiles(employeeId = activeEmployeeId(), date = state.date) {
  const info = dayState(date, employeeId)
  const executed = entriesFor(date, employeeId).reduce((sum, row) => sum + number(row.executed_hours), 0)
  const target = info.locked ? 0 : targetHours(date)
  const overtime = executed - target
  const remaining = statusMetrics(employeeId).remaining
  return `<section class="metrics selected-day-metrics"><article><span>Überstunden</span><strong class="${overtime > 0 ? 'positive' : overtime < 0 ? 'negative' : ''}">${overtime === 0 ? '–' : hours(overtime)}</strong></article><article><span>Resturlaub</span><strong>${remaining} Tage</strong></article><article><span>Krankheitstage</span><strong>${statusMetrics(employeeId).sick} Tage</strong></article></section>`
}

function timeForm(entry = null) {
  const value = entry || { customer_name: '', start_time: nextStart(), end_time: '', pause_hours: 0, executed_hours: '', calculation_mode: 'hours', custom_fields: {} }
  const locked = dayState().locked
  const columns = own(state.data.columns)
  const custom = value.custom_fields || {}
  const formName = entry ? 'time-update' : 'time-create'
  return `<form class="card form-grid" data-form="${formName}"><input type="hidden" name="id" value="${entry?.id || ''}"><input type="hidden" name="source" value="${entry?.calculation_mode === 'end_time' ? 'time' : 'hours'}"><label>Kunde<input name="customer" list="customers" value="${escapeHtml(value.customer_name)}" required></label><label>Arbeitsbeginn<input name="start" type="time" step="900" value="${String(value.start_time || nextStart()).slice(0, 5)}" required></label><label>Arbeitsende<input name="end" type="time" step="900" value="${String(value.end_time || '').slice(0, 5)}"></label><label>Pause${pauseOptions(value.pause_hours)}</label><label>Arbeitsstunden${durationOptions(value.executed_hours)}</label>${columns.map(column => `<label>${escapeHtml(column.name)}<input name="custom-${column.id}" value="${escapeHtml(custom[column.id] || '')}"></label>`).join('')}<div class="form-actions"><button class="primary" ${locked ? 'disabled' : ''}>${entry ? 'Zeiteintrag speichern' : 'Zeiteintrag hinzufügen'}</button>${entry ? `<button type="button" class="danger ghost" data-action="time-delete" data-id="${entry.id}">Löschen</button>` : ''}</div></form>`
}

function timeView() {
  const info = dayState(), entries = entriesFor(), executed = entries.reduce((sum, row) => sum + number(row.executed_hours), 0)
  const target = info.locked ? 0 : targetHours(state.date)
  const overtime = executed - target
  return page(dateText(state.date), `ZEITERFASSUNG · WILLKOMMEN, ${employeeName(activeEmployeeId()).toUpperCase()}`, `${employeePicker()}${weekStrip()}${selectedDayTiles()}${lockNotice(info)}<section class="day-summary"><span>Ausgeführt<strong>${hours(executed)}</strong></span><span>Zu leisten<strong>${hours(target)}</strong></span><span>Überstunden<strong class="${overtime > 0 ? 'positive' : overtime < 0 ? 'negative' : ''}">${overtime === 0 ? '–' : hours(overtime)}</strong></span></section><section class="split"><div><h2>Zeiteinträge</h2>${entries.length ? entries.map(timeForm).join('') : '<p class="empty">Noch keine Zeiteinträge.</p>'}</div><div><h2>Neuer Eintrag</h2>${timeForm()}</div></section><section class="card slim"><h2>Krankheit</h2><p>${info.sickness ? 'Dieser Tag ist als Krankheitstag markiert.' : 'Krankheitstage können auch während Urlaub oder Feiertagen gemeldet werden.'}</p><button type="button" class="${info.sickness ? 'danger' : 'warning'}" data-action="sick">${info.sickness ? (isChief() ? 'Krankheitstag entfernen' : 'Krankheitstag gemeldet') : 'Als krank markieren'}</button></section>${customerDatalist()}`)
}

function customerFields(data = {}) {
  const labels = [['contact_last_name', 'Nachname'], ['contact_first_name', 'Vorname'], ['street', 'Straße'], ['house_number', 'Hausnummer'], ['city', 'Ort'], ['postal_code', 'Postleitzahl'], ['phone_private', 'Telefon privat'], ['phone_mobile', 'Telefon mobil'], ['email', 'E-Mail-Adresse']]
  return labels.map(([key, label]) => `<label>${label}<input name="${key}" value="${escapeHtml(data[key] || (key === 'street' ? data.address : ''))}"></label>`).join('')
}

function customerExtraField(field = {}, index = 0) {
  return `<div class="customer-extra" data-customer-extra><label>Feldbezeichnung<input name="extra-label-${index}" value="${escapeHtml(field.label || '')}" placeholder="z. B. Ansprechpartner"></label><label>Wert<input name="extra-value-${index}" value="${escapeHtml(field.value || '')}"></label><button type="button" class="icon danger" data-action="customer-extra-remove" aria-label="Zusatzfeld entfernen">×</button></div>`
}

function customerForm(customer = null) {
  const fields = customer?.custom_fields || {}
  const extras = Array.isArray(fields.additional) ? fields.additional : []
  const yearlyHours = customer ? state.data.entries.filter(row => same(row.customer_id, customer.id) && String(row.work_date || '').startsWith(String(state.year))).reduce((sum, row) => sum + number(row.executed_hours), 0) : 0
  return `<form class="card form-grid" data-form="${customer ? 'customer-update' : 'customer-create'}"><input type="hidden" name="id" value="${customer?.id || ''}"><label class="wide">Kundenname / Firma<input name="name" required value="${escapeHtml(customer?.name || '')}"></label>${customer ? `<p class="notice wide">Ausgeführte Stunden ${state.year}: <strong>${hours(yearlyHours)}</strong></p>` : ''}${customerFields(fields)}<section class="wide customer-extras"><h3>Weitere Angaben</h3><div data-customer-extras>${extras.map(customerExtraField).join('')}</div><button type="button" class="secondary" data-action="customer-extra-add">Weiteres Eingabefeld hinzufügen</button></section><div class="form-actions"><button class="primary">${customer ? 'Kunde bestätigen' : 'Kunde hinzufügen'}</button>${customer ? `<button type="button" class="danger ghost" data-action="customer-delete" data-id="${customer.id}">Kunde löschen</button><button type="button" class="secondary" data-action="customer-orders" data-id="${customer.id}">Arbeitsscheine ansehen</button>` : ''}</div></form>`
}

function customersView() {
  const customers = state.data.customers
  return page('Kunden', 'GEMEINSAME KUNDENDATEN', `<section class="split"><div><h2>Vorhandene Kunden</h2>${customers.length ? customers.map(customerForm).join('') : '<p class="empty">Noch keine Kunden vorhanden.</p>'}</div><div><h2>Neuer Kunde</h2>${customerForm()}</div></section>`)
}

function orderEditForm(order) {
  return `<details class="subsection"><summary>Arbeitsschein bearbeiten</summary><form class="form-grid" data-form="order-update"><input type="hidden" name="id" value="${order.id}"><input type="hidden" name="source" value="${order.calculation_mode === 'end_time' ? 'time' : 'hours'}"><label>Kunde<input name="customer" list="customers" value="${escapeHtml(order.customer_name)}" required></label><label>Bezeichnung<input name="title" value="${escapeHtml(order.title)}"></label><label>Arbeitsbeginn<input name="start" type="time" step="900" value="${String(order.start_time || '').slice(0, 5)}" required></label><label>Arbeitsende<input name="end" type="time" step="900" value="${String(order.end_time || '').slice(0, 5)}"></label><label>Pause${pauseOptions(order.pause_hours)}</label><label>Arbeitsstunden${durationOptions(order.executed_hours)}</label><label class="wide">Beschreibung<textarea name="notes" rows="3">${escapeHtml(order.notes)}</textarea></label><label class="wide">Dokumentation<textarea name="documentation" rows="4">${escapeHtml(order.documentation)}</textarea></label><div class="form-actions"><button class="primary">Änderungen bestätigen</button></div></form></details>`
}

function orderCard(order, compact = false) {
  const items = state.data.items.filter(row => same(row.work_order_id, order.id))
  const docs = state.data.documents.filter(row => same(row.work_order_id, order.id))
  const canEdit = isChief() || same(order.employee_id, activeEmployeeId())
  return `<article class="card order-card"><div class="card-head"><div><p class="eyebrow">${escapeHtml(order.customer_name || 'Ohne Kunde')}</p><h3>${escapeHtml(order.title || 'Arbeitsschein')}</h3><p>${shortDate(order.work_date)} · ${timeText(order.start_time)} – ${timeText(order.end_time)} · ${hours(order.executed_hours)}</p></div>${isChief() ? `<label class="check"><input type="checkbox" data-action="order-invoiced" data-id="${order.id}" ${order.invoiced ? 'checked' : ''}> Abgerechnet</label>` : ''}</div>${order.notes ? `<p>${escapeHtml(order.notes)}</p>` : ''}${order.documentation ? `<details><summary>Dokumentation</summary><p>${escapeHtml(order.documentation)}</p></details>` : ''}<section class="subsection"><h4>Material</h4>${items.length ? `<ul class="positions">${items.map(item => `<li>${escapeHtml(item.position_name)} · ${number(item.quantity)} × ${money(item.unit_price)}${canEdit && !compact ? `<button type="button" class="icon danger" data-action="item-delete" data-id="${item.id}" aria-label="Material entfernen">×</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Keine Materialpositionen.</p>'}${canEdit && !compact ? `<form class="inline-form" data-form="item-create"><input type="hidden" name="orderId" value="${order.id}"><label>Artikel<input name="material" required placeholder="Artikel eingeben"></label><label>Menge<input name="quantity" inputmode="decimal" value="1"></label><button class="secondary">Hinzufügen</button></form>` : ''}</section><section class="subsection"><h4>Dokumente</h4>${docs.length ? docs.map(doc => `<p class="file"><button type="button" class="link" data-action="document-open" data-id="${doc.id}">${escapeHtml(doc.file_name)}</button>${canEdit && !compact ? `<button type="button" class="icon danger" data-action="document-delete" data-id="${doc.id}" aria-label="Dokument löschen">×</button>` : ''}</p>`).join('') : '<p class="muted">Keine Dokumente.</p>'}${canEdit && !compact ? `<form class="inline-form" data-form="document-create"><input type="hidden" name="orderId" value="${order.id}"><label>Datei<input name="documents" type="file" multiple></label><button class="secondary">Dateien hochladen</button></form>` : ''}</section>${canEdit && !compact ? `${orderEditForm(order)}<div class="card-actions"><button type="button" class="danger ghost" data-action="order-delete" data-id="${order.id}">Arbeitsschein löschen</button></div>` : ''}</article>`
}

function orderForm() {
  const locked = dayState().locked
  return `<form class="card form-grid" data-form="order-create"><input type="hidden" name="source" value="hours"><label>Kunde<input name="customer" list="customers" required></label><label>Bezeichnung<input name="title" placeholder="z. B. Reparatur"></label><label>Arbeitsbeginn<input name="start" type="time" step="900" value="${nextStart()}" required></label><label>Arbeitsende<input name="end" type="time" step="900"></label><label>Pause${pauseOptions(0)}</label><label>Arbeitsstunden${durationOptions('', 16, 'oder Ende eintragen')}</label><label class="wide">Beschreibung<textarea name="notes" rows="3" placeholder="Ausgeführte Arbeiten beschreiben"></textarea></label><label class="wide">Dokumentation<textarea name="documentation" rows="4" placeholder="Arbeitsfortschritt, Besonderheiten …"></textarea></label><div class="form-actions"><button class="primary" ${locked ? 'disabled' : ''}>Arbeitsschein bestätigen</button></div></form>`
}

function ordersView() {
  const orders = ordersFor(), info = dayState()
  return page(`Arbeitsscheine von ${employeeName(activeEmployeeId())} · ${dateText(state.date)}`, 'ARBEITSSCHEINE', `${employeePicker()}${weekStrip()}${lockNotice(info)}<section class="split"><div><h2>Arbeitsscheine des Tages</h2>${orders.length ? orders.map(order => orderCard(order)).join('') : '<p class="empty">Noch keine Arbeitsscheine für diesen Tag.</p>'}</div><div><h2>Neuer Arbeitsschein</h2>${orderForm()}</div></section>${customerDatalist()}`)
}

function calendarDays(year, month) {
  const first = new Date(year, month, 1)
  const firstOffset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - firstOffset)
  return Array.from({ length: 42 }, (_, index) => isoDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)))
}

function calendarView() {
  const monthLabel = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date(state.year, state.month, 1))
  const employee = activeEmployeeId()
  const appointmentCount = date => own(state.data.appointments, employee).filter(row => same(row.event_date, date)).length
  const entryCount = date => entriesFor(date, employee).length + ordersFor(date, employee).length
  return page(monthLabel, 'PERSÖNLICHER KALENDER', `${employeePicker()}<section class="calendar-toolbar"><button type="button" class="calendar-arrow" data-action="month-prev" aria-label="Vorheriger Monat">←</button><button type="button" class="calendar-today" data-action="month-today">Heute</button><button type="button" class="calendar-arrow" data-action="month-next" aria-label="Nächster Monat">→</button><div class="calendar-legend"><span class="legend-item vacation">Urlaub</span><span class="legend-item requested">Angefragt</span><span class="legend-item sick">Krank</span><span class="legend-item holiday">Feiertag</span></div></section><section class="calendar"><div class="calendar-head">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => `<span>${day}</span>`).join('')}</div><div class="calendar-grid">${calendarDays(state.year, state.month).map(date => {
    const info = dayState(date, employee), inMonth = dateObject(date).getMonth() === state.month
    const classes = ['calendar-day', !inMonth ? 'outside' : '', same(date, state.date) ? 'selected' : '', info.sickness ? 'sick' : '', info.approvedVacation ? 'vacation' : '', info.vacation?.status === 'requested' ? 'requested' : '', info.holiday ? 'holiday' : ''].filter(Boolean).join(' ')
    const note = info.sickness ? 'Krank' : info.approvedVacation ? 'Urlaub' : info.vacation?.status === 'requested' ? 'Urlaub beantragt' : info.holiday || (appointmentCount(date) ? `${appointmentCount(date)} Termin${appointmentCount(date) > 1 ? 'e' : ''}` : '')
    const dots = [entryCount(date) ? `<i class="calendar-dot work" title="${entryCount(date)} Arbeitseintrag${entryCount(date) === 1 ? '' : 'e'}"></i>` : '', appointmentCount(date) ? `<i class="calendar-dot appointment" title="${appointmentCount(date)} Termin${appointmentCount(date) === 1 ? '' : 'e'}"></i>` : ''].join('')
    return `<button type="button" class="${classes}" data-action="calendar-date" data-date="${date}"><strong>${dateObject(date).getDate()}</strong>${note ? `<em>${escapeHtml(note)}</em>` : ''}${dots ? `<span class="calendar-dots">${dots}</span>` : ''}</button>`
  }).join('')}</div></section><section class="calendar-day-details"><article class="card slim"><p class="eyebrow">AUSGEWÄHLTER TAG</p><h2>${dateText(state.date)}</h2>${dayActivities(employee)}</article><div class="calendar-actions"><details><summary>Urlaub beantragen</summary><form data-form="vacation-request" class="form-grid"><label>Von<input name="startDate" type="date" value="${state.date}" required></label><label>Bis<input name="endDate" type="date" value="${state.date}" required></label><div class="form-actions"><button class="primary">Antrag senden</button></div></form></details><details><summary>Kundentermin vormerken</summary><form data-form="appointment-create" class="form-grid"><label>Datum<input name="date" type="date" value="${state.date}" required></label><label>Kunde<input name="customer" list="customers"></label><label class="wide">Termin<input name="title" required placeholder="z. B. Besichtigung"></label><label class="wide">Notiz<textarea name="notes" rows="2"></textarea></label><div class="form-actions"><button class="secondary">Termin speichern</button></div></form></details></div></section>${customerDatalist()}`)
}

function dayActivities(employeeId) {
  const info = dayState(state.date, employeeId)
  const entries = entriesFor(state.date, employeeId).filter(row => !row.work_order_id)
  const orders = ordersFor(state.date, employeeId)
  const appointments = own(state.data.appointments, employeeId).filter(row => same(row.event_date, state.date))
  const vacationCard = info.vacation ? `<article class="status-card vacation"><h3>${info.vacation.status === 'approved' ? 'Urlaub genehmigt' : 'Urlaub beantragt'}</h3><p>${dateText(info.vacation.start_date)} bis ${dateText(info.vacation.end_date)} · ${number(info.vacation.requested_days)} Arbeitstage</p></article>` : ''
  const sicknessCard = info.sickness ? '<article class="status-card sick"><h3>Krank</h3><p>Für diesen Tag sind Zeiterfassung und Arbeitsscheine gesperrt.</p></article>' : ''
  const locked = info.sickness || info.approvedVacation || Boolean(info.holiday)
  const workCards = locked ? '' : `${orders.length ? `<section class="subsection"><h3>Arbeitsscheine</h3>${orders.map(order => `<p><strong>${escapeHtml(order.title || order.customer_name || 'Arbeitsschein')}</strong><br><span class="muted">${escapeHtml(order.customer_name)} · ${hours(order.executed_hours)}</span></p>`).join('')}</section>` : ''}${entries.length ? `<section class="subsection"><h3>Zeiterfassung</h3>${entries.map(row => `<p>${escapeHtml(row.customer_name)} · ${hours(row.executed_hours)}</p>`).join('')}</section>` : ''}${appointments.length ? `<section class="subsection"><h3>Termine</h3>${appointments.map(row => `<p>${escapeHtml(row.title)}${row.customer_name ? ` · ${escapeHtml(row.customer_name)}` : ''}</p>`).join('')}</section>` : ''}`
  const noContent = !vacationCard && !sicknessCard && !workCards ? '<p class="empty">Keine Aktivitäten an diesem Tag.</p>' : ''
  return `${selectedDayTiles(employeeId)}${sicknessCard}${vacationCard}${info.holiday ? `<p class="notice">${escapeHtml(info.holiday)}</p>` : ''}${workCards}${noContent}`
}

function inboxView() {
  const all = state.data.messages.filter(row => same(row.recipient_id, state.profile.id))
  const visible = all.filter(row => state.folder === 'trash' ? row.deleted_at : !row.deleted_at).filter(row => state.folder === 'unread' ? !row.read_at : state.folder === 'read' ? Boolean(row.read_at) : true)
  return page('Postfach', 'BENACHRICHTIGUNGEN', `<div class="folders"><button type="button" class="${state.folder === 'all' ? 'selected' : ''}" data-action="folder" data-folder="all">Alle</button><button type="button" class="${state.folder === 'read' ? 'selected' : ''}" data-action="folder" data-folder="read">Gelesen</button><button type="button" class="${state.folder === 'unread' ? 'selected' : ''}" data-action="folder" data-folder="unread">Ungelesen</button><button type="button" class="${state.folder === 'trash' ? 'selected' : ''}" data-action="folder" data-folder="trash">Papierkorb</button></div><section class="cards">${visible.length ? visible.map(messageCard).join('') : '<p class="empty">Keine Nachrichten in diesem Ordner.</p>'}</section>`)
}

function messageCard(message) {
  const open = same(message.id, state.openMessageId)
  const body = message.body || {}
  const details = Object.entries(body).filter(([key]) => key !== 'payslip_id' && key !== 'file_name').map(([key, value]) => `${key.replace(/_/g, ' ')}: ${Array.isArray(value) ? value.length : value}`).join('\n')
  return `<article class="card message ${message.read_at ? '' : 'unread'}"><div class="card-head"><div><h3>${escapeHtml(message.title)}</h3><p>${new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(message.created_at))}</p></div>${message.read_at ? '' : '<span class="unread-dot">Neu</span>'}</div><button type="button" class="link" data-action="message-open" data-id="${message.id}">${open ? 'Nachricht schließen' : 'Nachricht öffnen'}</button>${open ? `<div class="subsection">${details ? `<p>${escapeHtml(details)}</p>` : ''}${body.payslip_id ? `<div class="card-actions"><button type="button" class="primary" data-action="payslip-open" data-id="${body.payslip_id}">${escapeHtml(body.file_name || 'Lohnabrechnung')} herunterladen</button></div>` : ''}${message.message_type === 'vacation_request' && isChief() ? `<div class="card-actions"><button type="button" class="primary" data-action="vacation-approve" data-id="${body.request_id}">Genehmigen</button><button type="button" class="danger ghost" data-action="vacation-reject" data-id="${body.request_id}">Ablehnen</button></div>` : ''}</div>` : ''}<div class="card-actions">${message.deleted_at ? `<button type="button" class="secondary" data-action="message-restore" data-id="${message.id}">Wiederherstellen</button>` : `<button type="button" class="danger ghost" data-action="message-delete" data-id="${message.id}">Löschen</button>`}</div></article>`
}

function assignmentsView() {
  const employee = activeEmployeeId(), orders = ordersFor(state.date, employee)
  return page(`Aufträge · ${dateText(state.date)}`, 'AUFTRÄGE MITARBEITER', `${employeePicker()}${weekStrip()}<section class="card slim"><h2>${escapeHtml(employeeName(employee))}</h2>${orders.length ? orders.map(order => orderCard(order, true)).join('') : '<p class="empty">Keine Arbeitsscheine an diesem Tag.</p>'}</section>`)
}

function billingCustomersView() {
  const open = state.data.orders.filter(order => !order.invoiced)
  const groups = new Map()
  open.forEach(order => { const key = order.customer_id || `name:${order.customer_name}`; groups.set(key, [...(groups.get(key) || []), order]) })
  return page('Abrechnungen Kunden', 'OFFENE ARBEITSSCHEINE', `${groups.size ? [...groups.values()].map(group => `<section class="card"><h2>${escapeHtml(group[0].customer_name || 'Ohne Kunde')}</h2><p>${group.length} offene Arbeitsschein${group.length === 1 ? '' : 'e'} · ${hours(group.reduce((sum, row) => sum + number(row.executed_hours), 0))}</p>${group.map(order => `<label class="check"><input type="checkbox" data-action="order-invoiced" data-id="${order.id}"> ${shortDate(order.work_date)} · ${escapeHtml(order.title || 'Arbeitsschein')} · ${hours(order.executed_hours)}</label>`).join('')}</section>`).join('') : '<p class="empty">Keine offenen Arbeitsscheine.</p>'}`)
}

function billingEmployeesView() {
  const people = managedEmployees()
  const payslips = state.data.payslips.filter(row => same(row.business_id, activeBusinessId()))
  return page('Lohnabrechnungen', 'VERTRAULICHE DATEIEN FÜR MITARBEITER', `${businessPicker()}<section class="split"><div><h2>Neue Lohnabrechnung</h2>${people.length ? `<form class="card form-grid" data-form="payslip-create"><label>Mitarbeiter<select name="employeeId" required>${people.map(row => `<option value="${row.id}">${escapeHtml(row.username)}</option>`).join('')}</select></label><label class="wide">Datei<input name="file" type="file" required></label><div class="form-actions"><button class="primary">Datei bereitstellen</button></div><p class="muted">Nur der ausgewählte Mitarbeiter erhält eine Nachricht und kann die Datei öffnen.</p></form>` : '<p class="empty">Für dieses Geschäftskonto sind noch keine Mitarbeiter vorhanden.</p>'}</div><div><h2>Bereitgestellte Dateien</h2>${payslips.length ? payslips.map(row => `<article class="card employee-card"><h3>${escapeHtml(row.file_name)}</h3><p>Für ${escapeHtml(employeeName(row.employee_id))} · ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(row.created_at))}</p><div class="card-actions"><button type="button" class="secondary" data-action="payslip-open" data-id="${row.id}">Datei öffnen</button></div></article>`).join('') : '<p class="empty">Noch keine Lohnabrechnungen bereitgestellt.</p>'}</div></section>`)
}

function invoicesView() {
  const billed = state.data.orders.filter(order => order.invoiced)
  const groups = new Map()
  billed.forEach(order => { const key = order.customer_id || `name:${order.customer_name}`; groups.set(key, [...(groups.get(key) || []), order]) })
  return page('Rechnungen', 'ABGERECHNETE ARBEITSSCHEINE', `${groups.size ? [...groups.values()].map(group => `<section class="card"><h2>${escapeHtml(group[0].customer_name || 'Ohne Kunde')}</h2><p>${group.length} abgerechnete Arbeitsschein${group.length === 1 ? '' : 'e'} · ${hours(group.reduce((sum, row) => sum + number(row.executed_hours), 0))}</p><ul class="positions">${group.map(order => `<li>${shortDate(order.work_date)} · ${escapeHtml(order.title || 'Arbeitsschein')} · ${hours(order.executed_hours)}</li>`).join('')}</ul></section>`).join('') : '<p class="empty">Noch keine abgerechneten Arbeitsscheine.</p>'}`)
}

function materialManager() {
  if (!isChief()) return ''
  return `<section class="card"><h2>Materialliste</h2><form class="inline-form" data-form="material-create"><label>Artikel<input name="name" required></label><label>Preis (€)<input name="price" inputmode="decimal" placeholder="optional"></label><button class="secondary">Artikel hinzufügen</button></form><div class="material-list">${state.data.materials.length ? state.data.materials.map(row => `<p><strong>${escapeHtml(row.name)}</strong><span>${money(row.unit_price)}</span><button type="button" class="link" data-action="material-price" data-id="${row.id}">Preis ändern</button><button type="button" class="link danger" data-action="material-delete" data-id="${row.id}">Löschen</button></p>`).join('') : '<p class="empty">Noch keine Artikel.</p>'}</div></section>`
}

function employeeManager() {
  if (!isChief()) return ''
  const people = managedEmployees()
  return `<section class="split"><div><h2>Mitarbeiterkonten</h2>${people.length ? people.map(row => { const value = statusMetrics(row.id); return `<article class="card employee-card"><h3>${escapeHtml(row.username)} · Mitarbeiter</h3><p>${hours(value.executed)} · ${value.sick} Krankheitstage · ${value.remaining} Resturlaub</p><div class="card-actions"><button type="button" class="secondary" data-action="settings-employee" data-id="${row.id}">Statistik & Einstellungen</button><button type="button" class="danger ghost" data-action="employee-delete" data-id="${row.id}">Mitarbeiter löschen</button></div></article>` }).join('') : '<p class="empty">Für dieses Geschäftskonto sind noch keine Mitarbeiter vorhanden.</p>'}</div><div><h2>Mitarbeiter hinzufügen</h2><form class="card form-grid" data-form="employee-create">${isAdmin() ? `<label>Geschäftskonto<select name="businessId" required>${businesses().map(row => `<option value="${row.id}" ${same(row.id, activeBusinessId()) ? 'selected' : ''}>${escapeHtml(row.company_name || row.username)}</option>`).join('')}</select></label>` : ''}<label>Benutzername<input name="username" required></label><label>Passwort<input name="password" type="password" required></label>${permissionControls()}<div class="form-actions"><button class="primary">Mitarbeiter anlegen</button></div></form></div></section>`
}

function permissionControls(value = {}) {
  return `<fieldset class="permissions"><legend>Sichtbare Menüs</legend>${[['time', 'Zeiterfassung'], ['customers', 'Kunden'], ['orders', 'Arbeitsscheine'], ['calendar', 'Kalender']].map(([key, label]) => `<label class="check"><input type="checkbox" name="permission-${key}" ${value[key] !== false ? 'checked' : ''}> ${label}</label>`).join('')}</fieldset>`
}

function businessManager() {
  if (!isAdmin()) return ''
  return `<section class="split"><div><h2>Geschäftskonten</h2>${businesses().map(row => `<article class="card employee-card"><h3>${escapeHtml(row.company_name || row.username)}</h3><p>Geschäftskonto · ${peopleForBusiness(row.id).filter(person => person.role === 'employee').length} Mitarbeiter</p><div class="card-actions"><button type="button" class="secondary" data-action="settings-business" data-id="${row.id}">Konto verwalten</button></div></article>`).join('') || '<p class="empty">Noch keine Geschäftskonten.</p>'}</div><div><h2>Geschäftskonto hinzufügen</h2><form class="card form-grid" data-form="business-create"><label class="wide">Firma<input name="companyName" required></label><label>Benutzername der Firma<input name="username" required></label><label>Passwort<input name="password" type="password" required></label><div class="form-actions"><button class="primary">Geschäftskonto anlegen</button></div></form></div></section>`
}

function accountSettings() {
  const selected = settingsAccount()
  const columns = own(state.data.columns, selected?.id)
  const data = statusMetrics(selected?.id)
  const editableEmployee = selected?.role === 'employee' && isChief()
  const editableBusiness = selected?.role === 'business' && isAdmin()
  const editableSelf = same(selected?.id, state.profile?.id) && isChief()
  const businessField = selected?.role === 'business' ? `<label class="wide">Firmenname<input name="companyName" value="${escapeHtml(selected.company_name || '')}" placeholder="Name der Firma"></label>` : ''
  const form = editableEmployee ? `<form class="card form-grid" data-form="employee-update"><input type="hidden" name="employeeId" value="${selected.id}"><label>Benutzername<input name="username" value="${escapeHtml(selected.username)}" required></label><label>Neues Passwort<input name="password" type="password" placeholder="nur bei Änderung ausfüllen"></label><label>Vorhandene Urlaubstage<input name="vacationAllowance" inputmode="decimal" value="${number(selected.vacation_allowance)}"></label>${permissionControls(selected.menu_permissions || {})}<div class="form-actions"><button class="primary">Speichern</button><button type="button" class="secondary" data-action="pdf" data-id="${selected.id}">Daten als PDF herunterladen</button></div></form>` : editableBusiness ? `<form class="card form-grid" data-form="business-update"><input type="hidden" name="businessId" value="${selected.id}">${businessField}<label>Benutzername<input name="username" value="${escapeHtml(selected.username)}" required></label><label>Neues Passwort<input name="password" type="password" placeholder="nur bei Änderung ausfüllen"></label><label>Vorhandene Urlaubstage<input name="vacationAllowance" inputmode="decimal" value="${number(selected.vacation_allowance)}"></label><div class="form-actions"><button class="primary">Speichern</button><button type="button" class="secondary" data-action="pdf" data-id="${selected.id}">Daten als PDF herunterladen</button></div></form>` : editableSelf ? `<form class="card form-grid" data-form="self-update">${businessField}<label>Benutzername<input name="username" value="${escapeHtml(selected?.username || '')}" required></label><label>Neues Passwort<input name="password" type="password" placeholder="nur bei Änderung ausfüllen"></label><label>Vorhandene Urlaubstage<input name="vacationAllowance" inputmode="decimal" value="${number(selected?.vacation_allowance)}"></label><div class="form-actions"><button class="primary">Speichern</button><button type="button" class="secondary" data-action="pdf" data-id="${selected?.id}">Daten als PDF herunterladen</button></div></form>` : `<article class="card"><h3>Benutzerkonto</h3><p>Mitarbeiter können ihre Zugangsdaten nicht selbst ändern.</p><div class="card-actions"><button type="button" class="secondary" data-action="pdf" data-id="${selected?.id}">Daten als PDF herunterladen</button></div></article>`
  return `<section class="split"><div><h2>${same(selected?.id, state.profile?.id) ? 'Mein Benutzerkonto' : 'Benutzerkonto'}</h2>${form}</div><div><h2>Statistik</h2>${metrics(selected?.id)}<p class="notice">${escapeHtml(selected?.username || '')}: ${hours(data.executed)} ausgeführt, ${data.sick} Krankheitstage und ${data.remaining} Resturlaubstage.</p><h2>Zusätzliche Eingabefelder Zeiterfassung</h2>${isChief() ? `<form class="inline-form" data-form="column-create"><input type="hidden" name="employeeId" value="${selected?.id || ''}"><label>Überschrift<input name="name" required></label><button class="secondary">Hinzufügen</button></form>` : ''}${columns.length ? `<div class="material-list">${columns.map(row => `<p>${escapeHtml(row.name)}${isChief() ? `<button type="button" class="link danger" data-action="column-delete" data-id="${row.id}">Löschen</button>` : ''}</p>`).join('')}</div>` : '<p class="empty">Keine zusätzlichen Felder.</p>'}</div></section>`
}

function companyBrandingSettings() {
  const business = activeBusiness()
  if (!business) return isAdmin() ? '<section class="card"><h2>Firmenlogo</h2><p class="empty">Lege zuerst ein Geschäftskonto an.</p></section>' : ''
  const allowed = isAdmin() || (isBusiness() && same(business.id, state.profile.id))
  if (!allowed) return ''
  return `<section class="card branding"><h2>Firma & Logo</h2><div class="brand-preview">${companyLogo('branding-logo')}<div><strong>${escapeHtml(business.company_name || business.username)}</strong><p>Dieses Logo wird in der Kopfzeile der App angezeigt.</p></div></div><form class="inline-form" data-form="company-logo-update"><input type="hidden" name="businessId" value="${business.id}"><label>Neues Firmenlogo<input name="companyLogo" type="file" accept="image/*" required></label><button class="secondary">Logo speichern</button></form></section>`
}

function settingsView() {
  return page('Einstellungen', 'VERWALTUNG', `${isAdmin() ? `<section class="card"><h2>Geschäftskonto auswählen</h2>${businessPicker()}<div class="card-actions"><button type="button" class="secondary" data-action="settings-self">Mein Administratorkonto</button></div></section>` : ''}${isChief() ? `<section class="card"><h2>Mitarbeiter auswählen</h2>${employeePicker()}</section>` : ''}${accountSettings()}${companyBrandingSettings()}${materialManager()}${employeeManager()}${businessManager()}`)
}

function administratorHomeView() {
  const business = activeBusiness()
  const employeeCount = managedEmployees().length
  return page('Administrator', 'SYSTEMVERWALTUNG', `<section class="card"><h2>Willkommen, ${escapeHtml(state.profile?.username || 'Administrator')}</h2><p>Du bist als Administrator angemeldet. Dein Konto ist von allen Geschäftskonten und Mitarbeiterkonten getrennt.</p>${businessPicker()}${business ? `<p class="notice">Aktiv ausgewählt: <strong>${escapeHtml(business.company_name || business.username)}</strong> · ${employeeCount} Mitarbeiter</p><p class="muted">Wähle oben ein Geschäftskonto und danach einen Mitarbeiter, wenn du dessen Arbeitsdaten ansehen oder bearbeiten möchtest.</p>` : '<p class="empty">Lege in den Einstellungen zuerst ein Geschäftskonto an.</p>'}<div class="card-actions"><button type="button" class="primary" data-action="nav" data-view="settings">Geschäftskonten verwalten</button></div></section>`)
}

function customerOrdersView() {
  const customer = state.data.customers.find(row => same(row.id, state.selectedCustomerId))
  const orders = state.data.orders.filter(row => same(row.customer_id, customer?.id)).sort((a, b) => String(b.work_date).localeCompare(String(a.work_date)))
  const open = orders.filter(row => !row.invoiced)
  return page(customer?.name || 'Kunde', 'ARBEITSSCHEINE KUNDE', `<button type="button" class="back" data-action="customers-back">← Zurück zu Kunden</button>${open.length ? `<section class="bundle"><h2>Nicht abgerechnet</h2>${open.map(order => orderCard(order, true)).join('')}</section>` : ''}<section class="bundle"><h2>Alle Arbeitsscheine</h2>${orders.length ? orders.map(order => orderCard(order, true)).join('') : '<p class="empty">Keine Arbeitsscheine vorhanden.</p>'}</section>`)
}

function navigation() {
  const items = [['time', 'Zeiterfassung'], ['customers', 'Kunden'], ['orders', 'Arbeitsscheine'], ['calendar', 'Kalender'], ['inbox', 'Postfach']]
  if (isChief()) items.push(['assignments', 'Aufträge Mitarbeiter'], ['billing-customers', 'Abrechnungen Kunden'], ['billing-employees', 'Lohnabrechnungen'], ['invoices', 'Rechnungen'])
  items.push(['settings', 'Einstellungen'])
  return items.filter(([view]) => isAllowed(view)).map(([view, label]) => `<button type="button" data-action="nav" data-view="${view}" class="${state.view === view ? 'selected' : ''}">${label}</button>`).join('')
}

function loginView() {
  return `<main class="login"><form class="login-card" data-form="login"><div class="logo">AZ</div><p class="eyebrow">ZEITERFASSUNG</p><h1>Willkommen</h1><p>Bitte mit Firmen-, Benutzer- und Passwort anmelden.</p><label>Firma<input name="company" autocomplete="organization" placeholder="z. B. Musterfirma"></label><label>Benutzername<input name="username" autocomplete="username" required></label><label>Passwort<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">Anmelden</button><button type="button" class="link" data-action="password-help">Passwort vergessen?</button><button type="button" class="link" data-action="administrator-bootstrap">Administrator einrichten</button></form></main>`
}

function appView() {
  if (!state.session || !state.profile) return loginView()
  const workViews = ['time', 'orders', 'calendar', 'assignments']
  const view = isAdmin() && workViews.includes(state.view) && !activeEmployeeId()
    ? administratorHomeView
    : ({ time: timeView, customers: customersView, customerOrders: customerOrdersView, orders: ordersView, calendar: calendarView, inbox: inboxView, assignments: assignmentsView, 'billing-customers': billingCustomersView, 'billing-employees': billingEmployeesView, invoices: invoicesView, settings: settingsView }[state.view] || timeView)
  const welcome = isAdmin() ? `Administrator: ${state.profile.username}` : `Willkommen, ${state.profile?.username || ''}`
  return `<div class="app-shell"><header class="app-header"><div class="brand">${companyLogo('header-logo')}<div><strong>${escapeHtml(companyName())}</strong><small>${escapeHtml(welcome)}</small></div></div><div class="header-actions"><button type="button" class="menu-toggle" data-action="menu-toggle" aria-expanded="${state.menuOpen}">Menü <span aria-hidden="true">▾</span></button><button type="button" class="logout" data-action="logout">Abmelden</button></div></header><button type="button" class="menu-backdrop ${state.menuOpen ? 'open' : ''}" data-action="menu-close" aria-label="Menü schließen"></button><aside class="menu-popover ${state.menuOpen ? 'open' : ''}" aria-label="Hauptmenü"><nav>${navigation()}</nav></aside>${view()}${state.toast ? `<div class="toast ${state.toast.error ? 'error' : ''}">${escapeHtml(state.toast.message)}</div>` : ''}${state.busy ? '<div class="busy">Wird gespeichert …</div>' : ''}</div>`
}

function render() { root.innerHTML = appView() }

async function ensureCustomer(name) {
  const clean = String(name || '').trim()
  if (!clean) throw new Error('Bitte einen Kundennamen eingeben.')
  const exact = state.data.customers.find(row => normalize(row.name) === normalize(clean))
  if (exact) return exact
  const similar = state.data.customers.find(row => normalize(row.name).includes(normalize(clean)) || normalize(clean).includes(normalize(row.name)))
  if (similar && window.confirm(`Meinten Sie „${similar.name}“? OK übernimmt den vorhandenen Kunden, Abbrechen legt einen neuen Kunden an.`)) return similar
  return await api(db.from('customers').insert({ employee_id: state.profile.id, name: clean, custom_fields: {} }).select().single())
}

async function ensureMaterial(name, requestedPrice = 0) {
  const clean = String(name || '').trim()
  if (!clean) throw new Error('Bitte einen Artikel eingeben.')
  const businessId = activeBusinessId()
  if (!businessId) throw new Error('Bitte zuerst ein Geschäftskonto auswählen.')
  const exact = state.data.materials.find(row => normalize(row.name) === normalize(clean))
  if (exact) return exact
  const similar = state.data.materials.find(row => normalize(row.name).includes(normalize(clean)) || normalize(clean).includes(normalize(row.name)))
  if (similar && window.confirm(`Meinten Sie „${similar.name}“? OK übernimmt den vorhandenen Artikel, Abbrechen legt einen neuen Artikel ohne Preis an.`)) return similar
  const { data: restored, error: restoreError } = await db.rpc('reactivate_material_for_team', { p_name: clean })
  if (!restoreError && restored) return restored
  if (restoreError && !/permission|not found|P0002/i.test(restoreError.message || '')) throw restoreError
  return await api(db.from('materials').insert({ business_id: businessId, name: clean, unit_price: Math.max(0, number(requestedPrice)), active: true }).select().single())
}

function customFieldsFrom(form) {
  const fields = {}
  own(state.data.columns).forEach(column => { fields[column.id] = form.get(`custom-${column.id}`) || '' })
  return fields
}

function workEmployeeId() {
  const employeeId = activeEmployeeId()
  if (!employeeId) throw new Error('Bitte zuerst einen Mitarbeiter auswählen.')
  return employeeId
}

async function saveTime(form, update = false) {
  const values = Object.fromEntries(form.entries())
  const employeeId = workEmployeeId()
  if (dayState().locked) throw new Error('An diesem Tag sind keine Zeiteinträge möglich.')
  const customer = await ensureCustomer(values.customer)
  const times = calculateTimes(values)
  const payload = { employee_id: employeeId, work_date: state.date, customer_id: customer.id, customer_name: customer.name, custom_fields: customFieldsFrom(form), ...times }
  if (update) await api(db.from('time_entries').update(payload).eq('id', values.id))
  else await api(db.from('time_entries').insert(payload))
}

async function saveOrder(form, update = false) {
  const values = Object.fromEntries(form.entries())
  const employeeId = workEmployeeId()
  if (dayState().locked) throw new Error('An diesem Tag sind keine Arbeitsscheine möglich.')
  const customer = await ensureCustomer(values.customer)
  const times = calculateTimes(values)
  const payload = { employee_id: employeeId, work_date: state.date, customer_id: customer.id, customer_name: customer.name, title: String(values.title || '').trim(), notes: String(values.notes || '').trim(), documentation: String(values.documentation || '').trim(), ...times }
  if (update) {
    await api(db.from('work_orders').update(payload).eq('id', values.id))
    await api(db.from('time_entries').update({ customer_id: customer.id, customer_name: customer.name, work_date: state.date, ...times }).eq('work_order_id', values.id))
  } else {
    const order = await api(db.from('work_orders').insert(payload).select().single())
    await api(db.from('time_entries').insert({ employee_id: payload.employee_id, work_date: payload.work_date, customer_id: payload.customer_id, customer_name: payload.customer_name, ...times, work_order_id: order.id, custom_fields: {} }))
  }
}

async function saveCustomer(form, update = false) {
  const id = String(form.get('id') || '')
  const name = String(form.get('name') || '').trim()
  if (!name) throw new Error('Bitte einen Kundennamen eingeben.')
  const extraIndexes = [...new Set([...form.keys()].filter(key => String(key).startsWith('extra-label-')).map(key => String(key).slice('extra-label-'.length)))]
  const extras = extraIndexes.map(index => ({ label: String(form.get(`extra-label-${index}`) || '').trim(), value: String(form.get(`extra-value-${index}`) || '').trim() })).filter(row => row.label || row.value)
  const custom_fields = Object.fromEntries(['contact_last_name', 'contact_first_name', 'street', 'house_number', 'city', 'postal_code', 'email', 'phone_private', 'phone_mobile'].map(key => [key, String(form.get(key) || '').trim()]))
  custom_fields.additional = extras
  if (update) await api(db.from('customers').update({ name, custom_fields }).eq('id', id))
  else await ensureCustomer(name).then(async customer => api(db.from('customers').update({ custom_fields }).eq('id', customer.id)))
}

async function saveCompanyLogo(form) {
  const business = state.people.find(row => same(row.id, form.get('businessId')) && row.role === 'business')
  const file = form.get('companyLogo')
  if (!business) throw new Error('Geschäftskonto nicht gefunden.')
  if (!file || !file.size) throw new Error('Bitte eine Bilddatei auswählen.')
  if (!String(file.type || '').startsWith('image/')) throw new Error('Bitte eine Bilddatei auswählen.')
  if (file.size > 5 * 1024 * 1024) throw new Error('Das Logo darf höchstens 5 MB groß sein.')
  const safeName = String(file.name || 'logo').replace(/[^A-Za-z0-9._-]/g, '_')
  const path = `${business.id}/${crypto.randomUUID()}-${safeName}`
  const { error: uploadError } = await db.storage.from('company-logos').upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) throw uploadError
  try {
    const payload = isBusiness() && same(business.id, state.profile.id)
      ? { action: 'self-update', companyLogoPath: path, companyName: business.company_name || business.username }
      : { action: 'business-update', businessId: business.id, companyLogoPath: path, companyName: business.company_name || business.username }
    await manageAccount(payload)
    if (business.company_logo_path) await db.storage.from('company-logos').remove([business.company_logo_path])
  } catch (error) {
    await db.storage.from('company-logos').remove([path])
    throw error
  }
}

async function saveItem(form) {
  const material = await ensureMaterial(form.get('material'))
  const quantity = number(form.get('quantity'))
  if (!(quantity > 0)) throw new Error('Bitte eine Menge größer als 0 eingeben.')
  await api(db.from('work_order_items').insert({ work_order_id: form.get('orderId'), material_id: material.id, position_name: material.name, quantity, unit_price: material.unit_price }))
}

async function uploadDocuments(form) {
  const files = [...(form.getAll('documents') || [])].filter(file => file && file.size)
  if (!files.length) throw new Error('Bitte mindestens eine Datei auswählen.')
  const employeeId = workEmployeeId()
  const orderId = String(form.get('orderId'))
  for (const file of files) {
    const path = `${employeeId}/${orderId}/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g, '_')}`
    const { error: uploadError } = await db.storage.from('work-order-documents').upload(path, file)
    if (uploadError) throw uploadError
    await api(db.from('work_order_documents').insert({ work_order_id: orderId, employee_id: employeeId, file_path: path, file_name: file.name, mime_type: file.type || null }))
  }
}

async function uploadPayslip(form) {
  if (!isChief()) throw new Error('Nur Administratoren oder Geschäftskonten können Lohnabrechnungen bereitstellen.')
  const employee = person(String(form.get('employeeId') || ''))
  const file = form.get('file')
  if (!employee || employee.role !== 'employee') throw new Error('Bitte einen Mitarbeiter auswählen.')
  if (!file || !file.size) throw new Error('Bitte eine Datei auswählen.')
  const businessId = businessIdOf(employee)
  if (!same(businessId, activeBusinessId())) throw new Error('Der Mitarbeiter gehört nicht zum ausgewählten Geschäftskonto.')
  const safeName = String(file.name || 'Lohnabrechnung').replace(/[^A-Za-z0-9._-]/g, '_')
  const filePath = `${businessId}/${employee.id}/${crypto.randomUUID()}-${safeName}`
  const { error: uploadError } = await db.storage.from('employee-payslips').upload(filePath, file, { contentType: file.type || undefined, upsert: false })
  if (uploadError) throw uploadError
  const payslip = await api(db.from('employee_payslips').insert({ business_id: businessId, employee_id: employee.id, uploaded_by: state.profile.id, file_path: filePath, file_name: String(file.name || safeName), mime_type: file.type || null }).select().single())
  try {
    await api(db.from('mailbox_messages').insert({ recipient_id: employee.id, sender_id: state.profile.id, message_type: 'payslip', title: 'Neue Lohnabrechnung', body: { payslip_id: payslip.id, file_name: payslip.file_name } }))
  } catch (error) {
    const { error: removeError } = await db.storage.from('employee-payslips').remove([filePath])
    if (!removeError) await api(db.from('employee_payslips').delete().eq('id', payslip.id))
    throw error
  }
}

function vacation(action, payload = {}) {
  return db.functions.invoke('vacation-workflow', { body: { action, ...payload } }).then(response => { if (response.error || response.data?.error) throw new Error(response.error?.message || response.data?.error); return response.data })
}

async function toggleSick() {
  const employeeId = workEmployeeId()
  const info = dayState()
  if (info.sickness) {
    if (!isChief()) throw new Error('Nur der Chef kann Krankheitstage entfernen.')
    await api(db.from('work_days').delete().eq('employee_id', employeeId).eq('work_date', state.date))
  } else {
    await api(db.from('work_days').upsert({ employee_id: employeeId, work_date: state.date, sick: 1 }, { onConflict: 'employee_id,work_date' }))
  }
}

async function deleteOrder(id) {
  const docs = state.data.documents.filter(row => same(row.work_order_id, id))
  await api(db.from('time_entries').delete().eq('work_order_id', id))
  await api(db.from('work_orders').delete().eq('id', id))
  if (docs.length) await db.storage.from('work-order-documents').remove(docs.map(row => row.file_path))
}

function downloadDocument(id) {
  const doc = state.data.documents.find(row => same(row.id, id))
  if (!doc) throw new Error('Dokument nicht gefunden.')
  return db.storage.from('work-order-documents').createSignedUrl(doc.file_path, 60).then(({ data, error }) => { if (error) throw error; window.open(data.signedUrl, '_blank', 'noopener') })
}

function downloadPayslip(id) {
  const payslip = state.data.payslips.find(row => same(row.id, id))
  if (!payslip) throw new Error('Die Lohnabrechnung wurde nicht gefunden oder ist nicht mehr verfügbar.')
  return db.storage.from('employee-payslips').createSignedUrl(payslip.file_path, 60).then(({ data, error }) => { if (error) throw error; window.open(data.signedUrl, '_blank', 'noopener') })
}

function downloadPdf(employeeId) {
  const value = statusMetrics(employeeId), profile = person(employeeId), entries = own(state.data.entries, employeeId).sort((a, b) => String(a.work_date).localeCompare(String(b.work_date)))
  if (!window.jspdf?.jsPDF) throw new Error('Die PDF-Erstellung wird noch geladen. Bitte kurz erneut versuchen.')
  const pdf = new window.jspdf.jsPDF()
  let y = 18
  const line = text => { if (y > 280) { pdf.addPage(); y = 18 } pdf.text(String(text), 14, y); y += 7 }
  pdf.setFontSize(16); line(`Arbeitszeitbericht – ${profile?.username || ''}`); pdf.setFontSize(10)
  line(`Ausgeführte Stunden gesamt: ${hours(value.executed)}`); line(`Überstunden gesamt: ${hours(value.overtime)}`); line(`Krankheitstage: ${value.sick}`); line(`Resturlaub: ${value.remaining} Tage`); y += 4
  entries.forEach(entry => line(`${dateText(entry.work_date)} | ${entry.customer_name} | ${hours(entry.executed_hours)} | Überstunden: ${hours(number(entry.executed_hours) - targetHours(entry.work_date))}`))
  const days = own(state.data.workDays, employeeId).filter(row => number(row.sick) > 0)
  days.forEach(row => line(`${dateText(row.work_date)} | Krankheitstag`))
  own(state.data.vacations, employeeId).filter(row => row.status === 'approved').forEach(row => line(`${dateText(row.start_date)} bis ${dateText(row.end_date)} | Urlaub (${row.requested_days} Tage)`))
  pdf.save(`Arbeitszeit-${profile?.username || 'Bericht'}.pdf`)
}

function formPermissions(data) {
  return Object.fromEntries(['time', 'customers', 'orders', 'calendar'].map(key => [key, data.get(`permission-${key}`) === 'on']))
}

async function manageAccount(payload) {
  const response = await db.functions.invoke('account-management', { body: payload })
  if (response.error || response.data?.error) throw new Error(response.error?.message || response.data?.error)
  return response.data
}

root.addEventListener('submit', event => {
  const form = event.target.closest('form')
  if (!form?.dataset.form) return
  event.preventDefault()
  const type = form.dataset.form
  const data = new FormData(form)
  if (type === 'login') return perform('', async () => {
    const username = String(data.get('username') || '').trim()
    const password = String(data.get('password') || '')
    if (!username || !password) throw new Error('Bitte Benutzername und Passwort eingeben.')
    const { error } = await db.auth.signInWithPassword({ email: `${username.toLowerCase()}@arbeitszeit.local`, password })
    if (error) throw error
  })
  if (type === 'time-create') return perform('Zeiteintrag gespeichert.', () => saveTime(data))
  if (type === 'time-update') return perform('Zeiteintrag gespeichert.', () => saveTime(data, true))
  if (type === 'order-create') return perform('Arbeitsschein und Zeiterfassung gespeichert.', () => saveOrder(data))
  if (type === 'order-update') return perform('Arbeitsschein gespeichert.', () => saveOrder(data, true))
  if (type === 'customer-create') return perform('Kunde gespeichert.', () => saveCustomer(data))
  if (type === 'customer-update') return perform('Kundendaten gespeichert.', () => saveCustomer(data, true))
  if (type === 'company-logo-update') return perform('Firmenlogo gespeichert.', () => saveCompanyLogo(data))
  if (type === 'item-create') return perform('Material hinzugefügt.', () => saveItem(data))
  if (type === 'document-create') return perform('Dokumente hochgeladen.', () => uploadDocuments(data))
  if (type === 'vacation-request') return perform('Urlaubsantrag gespeichert.', () => vacation('request', { startDate: data.get('startDate'), endDate: data.get('endDate') }))
  if (type === 'appointment-create') return perform('Kundentermin vorgemerkt.', async () => { const customer = data.get('customer') ? await ensureCustomer(data.get('customer')) : null; await api(db.from('appointments').insert({ employee_id: activeEmployeeId(), event_date: data.get('date'), customer_id: customer?.id || null, customer_name: customer?.name || '', title: String(data.get('title') || '').trim(), notes: String(data.get('notes') || '').trim() })) })
  if (type === 'material-create') return perform('Artikel gespeichert.', () => ensureMaterial(data.get('name'), data.get('price') || 0))
  if (type === 'column-create') return perform('Eingabefeld hinzugefügt.', () => api(db.from('custom_columns').insert({ employee_id: data.get('employeeId'), name: String(data.get('name') || '').trim(), position: own(state.data.columns, data.get('employeeId')).length })))
  if (type === 'payslip-create') return perform('Lohnabrechnung bereitgestellt und Mitarbeiter benachrichtigt.', () => uploadPayslip(data))
  if (type === 'business-create') return perform('Geschäftskonto angelegt.', () => manageAccount({ action: 'business-create', companyName: data.get('companyName'), username: data.get('username'), password: data.get('password') }))
  if (type === 'business-update') return perform('Geschäftskonto gespeichert.', () => manageAccount({ action: 'business-update', businessId: data.get('businessId'), companyName: data.get('companyName'), username: data.get('username'), password: data.get('password'), vacationAllowance: data.get('vacationAllowance') }))
  if (type === 'employee-create') return perform('Mitarbeiter angelegt.', () => manageAccount({ action: 'employee-create', businessId: data.get('businessId') || activeBusinessId(), username: data.get('username'), password: data.get('password'), menuPermissions: formPermissions(data) }))
  if (type === 'employee-update') return perform('Mitarbeiterkonto gespeichert.', () => manageAccount({ action: 'employee-update', employeeId: data.get('employeeId'), username: data.get('username'), password: data.get('password'), vacationAllowance: data.get('vacationAllowance'), menuPermissions: formPermissions(data) }))
  if (type === 'self-update') return perform('Mein Benutzerkonto gespeichert.', () => manageAccount({ action: 'self-update', companyName: data.get('companyName'), username: data.get('username'), password: data.get('password'), vacationAllowance: data.get('vacationAllowance') }))
})

root.addEventListener('change', event => {
  const target = event.target
  if (target.matches('[data-action="employee-picker"]')) { state.selectedEmployeeId = target.value; if (state.view === 'settings') state.selectedSettingsAccountId = target.value; render(); return }
  if (target.matches('[data-action="business-picker"]')) { state.selectedBusinessId = target.value; state.selectedEmployeeId = null; if (state.view === 'settings') state.selectedSettingsAccountId = target.value; loadData().catch(error => notify(error?.message || 'Geschäftskonto konnte nicht geladen werden.', true)); return }
  if (target.matches('[data-action="order-invoiced"]')) { const id = target.dataset.id; perform(target.checked ? 'Arbeitsschein als abgerechnet markiert.' : 'Arbeitsschein wieder geöffnet.', () => api(db.from('work_orders').update({ invoiced: target.checked }).eq('id', id))); return }
  if (target.matches('input[name="start"], input[name="end"]')) { synchroniseTimeForm(target.closest('form'), 'time'); return }
  if (target.matches('select[name="hours"]')) { synchroniseTimeForm(target.closest('form'), 'hours'); return }
  if (target.matches('select[name="pause"]')) { synchroniseTimeForm(target.closest('form')); return }
})

root.addEventListener('click', event => {
  const button = event.target.closest('button')
  if (!button?.dataset.action) return
  const action = button.dataset.action
  if (action === 'menu-toggle') { state.menuOpen = !state.menuOpen; render(); return }
  if (action === 'menu-close') { state.menuOpen = false; render(); return }
  if (action === 'nav') { state.view = button.dataset.view; state.selectedCustomerId = null; state.menuOpen = false; render(); return }
  if (action === 'logout') return perform('', () => db.auth.signOut())
  if (action === 'date' || action === 'calendar-date') { state.date = button.dataset.date; const date = dateObject(state.date); state.month = date.getMonth(); state.year = date.getFullYear(); render(); return }
  if (action === 'month-prev') { const date = new Date(state.year, state.month - 1, 1); state.year = date.getFullYear(); state.month = date.getMonth(); render(); return }
  if (action === 'month-next') { const date = new Date(state.year, state.month + 1, 1); state.year = date.getFullYear(); state.month = date.getMonth(); render(); return }
  if (action === 'month-today') { const date = new Date(); state.date = today(); state.year = date.getFullYear(); state.month = date.getMonth(); render(); return }
  if (action === 'sick') return perform(dayState().sickness ? 'Krankheitstag entfernt.' : 'Krankheitstag gespeichert.', toggleSick)
  if (action === 'time-delete') { if (window.confirm('Zeiteintrag wirklich löschen?')) perform('Zeiteintrag gelöscht.', () => api(db.from('time_entries').delete().eq('id', button.dataset.id))); return }
  if (action === 'order-delete') { if (window.confirm('Arbeitsschein, Material und zugehörige Zeiterfassung wirklich löschen?')) perform('Arbeitsschein gelöscht.', () => deleteOrder(button.dataset.id)); return }
  if (action === 'item-delete') { if (window.confirm('Materialposition löschen?')) perform('Materialposition gelöscht.', () => api(db.from('work_order_items').delete().eq('id', button.dataset.id))); return }
  if (action === 'document-open') return perform('', () => downloadDocument(button.dataset.id))
  if (action === 'payslip-open') return perform('', () => downloadPayslip(button.dataset.id))
  if (action === 'document-delete') { if (window.confirm('Dokument löschen?')) perform('Dokument gelöscht.', async () => { const doc = state.data.documents.find(row => same(row.id, button.dataset.id)); await api(db.from('work_order_documents').delete().eq('id', button.dataset.id)); if (doc) await db.storage.from('work-order-documents').remove([doc.file_path]) }); return }
  if (action === 'customer-delete') { if (window.confirm('Kunde wirklich löschen?')) perform('Kunde gelöscht.', () => api(db.from('customers').delete().eq('id', button.dataset.id))); return }
  if (action === 'customer-orders') { state.selectedCustomerId = button.dataset.id; state.view = 'customerOrders'; render(); return }
  if (action === 'customers-back') { state.selectedCustomerId = null; state.view = 'customers'; render(); return }
  if (action === 'folder') { state.folder = button.dataset.folder; state.openMessageId = null; render(); return }
  if (action === 'message-open') return perform('', async () => { state.openMessageId = same(state.openMessageId, button.dataset.id) ? null : button.dataset.id; const message = state.data.messages.find(row => same(row.id, button.dataset.id)); if (message && !message.read_at) await api(db.from('mailbox_messages').update({ read_at: new Date().toISOString() }).eq('id', message.id)) })
  if (action === 'message-delete') return perform('Nachricht in den Papierkorb verschoben.', () => api(db.from('mailbox_messages').update({ deleted_at: new Date().toISOString() }).eq('id', button.dataset.id)))
  if (action === 'message-restore') return perform('Nachricht wiederhergestellt.', () => api(db.from('mailbox_messages').update({ deleted_at: null }).eq('id', button.dataset.id)))
  if (action === 'customer-extra-add') { const container = button.closest('form')?.querySelector('[data-customer-extras]'); if (container) container.insertAdjacentHTML('beforeend', customerExtraField({}, Date.now())); return }
  if (action === 'customer-extra-remove') { button.closest('[data-customer-extra]')?.remove(); return }
  if (action === 'vacation-approve' || action === 'vacation-reject') return perform(action === 'vacation-approve' ? 'Urlaub genehmigt.' : 'Urlaub abgelehnt.', () => vacation('decide', { requestId: button.dataset.id, status: action === 'vacation-approve' ? 'approved' : 'rejected' }))
  if (action === 'settings-employee') { state.selectedEmployeeId = button.dataset.id; state.selectedSettingsAccountId = button.dataset.id; state.view = 'settings'; render(); return }
  if (action === 'settings-business') { state.selectedBusinessId = button.dataset.id; state.selectedEmployeeId = null; state.selectedSettingsAccountId = button.dataset.id; state.view = 'settings'; render(); return }
  if (action === 'settings-self') { state.selectedSettingsAccountId = state.profile.id; state.view = 'settings'; render(); return }
  if (action === 'employee-delete') { if (window.confirm('Mitarbeiterkonto wirklich löschen?')) perform('Mitarbeiter gelöscht.', () => manageAccount({ action: 'employee-delete', employeeId: button.dataset.id })); return }
  if (action === 'column-delete') { if (window.confirm('Eingabefeld löschen?')) perform('Eingabefeld gelöscht.', () => api(db.from('custom_columns').delete().eq('id', button.dataset.id))); return }
  if (action === 'material-delete') { if (window.confirm('Artikel aus der Materialliste entfernen?')) perform('Artikel entfernt.', () => api(db.from('materials').update({ active: false }).eq('id', button.dataset.id))); return }
  if (action === 'material-price') { const material = state.data.materials.find(row => same(row.id, button.dataset.id)); const value = window.prompt(`Preis für ${material?.name || 'Artikel'} (€):`, String(material?.unit_price ?? 0)); if (value !== null) perform('Preis aktualisiert.', async () => { const price = number(value); if (price < 0) throw new Error('Der Preis darf nicht negativ sein.'); const { error } = await db.rpc('update_material_price_for_open_orders', { p_material_id: material.id, p_unit_price: price }); if (error) throw error }); return }
  if (action === 'pdf') return perform('', () => downloadPdf(button.dataset.id))
  if (action === 'password-help') { const username = window.prompt('Bitte Benutzernamen eingeben:'); if (username !== null) perform('Wenn ein Konto gefunden wurde, wurden Administrator und zuständiges Geschäftskonto informiert.', async () => { const response = await db.functions.invoke('request-password-help', { body: { username } }); if (response.error || response.data?.error) throw new Error(response.error?.message || response.data?.error) }); return }
  if (action === 'administrator-bootstrap') { const username = window.prompt('Benutzername für das erste Administratorkonto:'); if (username === null) return; const password = window.prompt('Passwort für das erste Administratorkonto (mindestens 8 Zeichen):'); if (password === null) return; return perform('Administratorkonto eingerichtet. Du kannst dich jetzt anmelden.', async () => { const response = await db.functions.invoke('account-bootstrap', { body: { action: 'bootstrap', username, password } }); if (response.error || response.data?.error) throw new Error(response.error?.message || response.data?.error) }) }
})

db.auth.onAuthStateChange(() => loadData().catch(error => notify(error?.message || 'Die Anmeldung konnte nicht aktualisiert werden.', true)))
window.addEventListener('visibilitychange', () => { if (!document.hidden && state.session && !state.busy) loadData().catch(() => {}) })
setInterval(() => { if (state.session && !state.busy) loadData().catch(() => {}) }, 30000)
loadData().catch(error => notify(error?.message || 'Die App konnte nicht geladen werden.', true))

