import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"

const root = document.querySelector("#app")
const cfg = window.WORKTIME_CONFIG
const YEAR = new Date().getFullYear()
const HOLIDAYS = {
  "2026-01-01": "Neujahr", "2026-04-03": "Karfreitag", "2026-04-06": "Ostermontag",
  "2026-05-01": "Tag der Arbeit", "2026-05-14": "Christi Himmelfahrt", "2026-05-25": "Pfingstmontag",
  "2026-06-04": "Fronleichnam", "2026-10-03": "Tag der Deutschen Einheit",
  "2026-11-01": "Allerheiligen", "2026-12-25": "1. Weihnachtstag", "2026-12-26": "2. Weihnachtstag",
}
if (!cfg?.supabaseUrl || !cfg?.supabasePublishableKey) throw new Error("App-Konfiguration fehlt.")
const db = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey)
const s = { session: null, profile: null, employees: [], employeeId: null, view: "planner", selected: workday(new Date()), customers: [], days: new Map(), entries: [], columns: [], orders: [], items: [], note: null, loading: true }

function iso(value) {
  const d = value instanceof Date ? value : new Date(String(value) + "T12:00:00")
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")
}
function date(value) { return new Date(String(value) + "T12:00:00") }
function workday(value) { const d = new Date(value.getFullYear(), value.getMonth(), value.getDate()); while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() - 1); return iso(d) }
function weekday(value) { const n = date(value).getDay(); return n > 0 && n < 6 }
function target(value) { const n = date(value).getDay(); return n > 0 && n < 5 ? 8 : n === 5 ? 5 : 0 }
function n(value) { const output = Number(String(value ?? "").replace(",", ".")); return Number.isFinite(output) ? output : 0 }
function hours(value) { return n(value).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "h" }
function euros(value) { return n(value).toLocaleString("de-DE", { style: "currency", currency: "EUR" }) }
function dayText(value) { return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric" }).format(date(value)) }
function h(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]) }
function guid() { return crypto.randomUUID() }
function timeToMinutes(value) { if (!/^\d\d:\d\d/.test(value || "")) return null; const p = value.slice(0, 5).split(":").map(Number); return p[0] * 60 + p[1] }
function addTime(value, amount) { const start = timeToMinutes(value); if (start === null) return ""; const total = ((start + Math.round(amount)) % 1440 + 1440) % 1440; return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0") }
function calc(row) {
  const pause = n(row.pause_hours)
  if (row.calculation_mode === "end_time") {
    let start = timeToMinutes(row.start_time), end = timeToMinutes(row.end_time)
    const done = start === null || end === null ? 0 : Math.max(0, ((end < start ? end + 1440 : end) - start) / 60 - pause)
    return { ...row, pause_hours: pause, executed_hours: done }
  }
  const done = n(row.executed_hours)
  return { ...row, pause_hours: pause, executed_hours: done, end_time: row.start_time ? addTime(row.start_time, (done + pause) * 60) : "" }
}
function jobs() { return s.entries.filter((row) => row.work_date === s.selected).sort((a, b) => String(a.created_at || a.id).localeCompare(String(b.created_at || b.id))) }
function currentDay() { return s.days.get(s.selected) || { employee_id: s.employeeId, work_date: s.selected, vacation: 0, sick: 0 } }
function currentStatus() { const row = currentDay(), name = HOLIDAYS[s.selected] || ""; return { name, vacation: n(row.vacation), sick: n(row.sick), locked: Boolean(name) || n(row.vacation) > 0 || n(row.sick) > 0 } }
function me() { return s.employees.find((row) => row.id === s.employeeId) || s.profile }
function tell(text, error = false) { s.note = { text, error }; render(); setTimeout(() => { if (s.note?.text === text) { s.note = null; render() } }, 4500) }
async function data(request) { const { data: result, error } = await request; if (error) throw error; return result }

async function loadProfile() {
  s.profile = await data(db.from("profiles").select("*").eq("id", s.session.user.id).single())
  if (!s.employeeId) s.employeeId = s.profile.id
}
async function loadEmployees() {
  if (s.profile.role !== "chief") { s.employees = [s.profile]; return }
  const result = await db.functions.invoke("manage-employees", { body: { action: "list" } })
  if (result.error) throw result.error
  if (result.data?.error) throw new Error(result.data.error)
  s.employees = result.data.employees || []
}
async function loadData() {
  const employee = s.employeeId
  const all = await Promise.all([
    data(db.from("customers").select("*").eq("employee_id", employee).order("name")),
    data(db.from("work_days").select("*").eq("employee_id", employee)),
    data(db.from("time_entries").select("*").eq("employee_id", employee).order("created_at")),
    data(db.from("custom_columns").select("*").eq("employee_id", employee).order("position")),
    data(db.from("work_orders").select("*").eq("employee_id", employee).order("work_date", { ascending: false })),
  ])
  s.customers = all[0]; s.days = new Map(all[1].map((row) => [row.work_date, row])); s.entries = all[2]; s.columns = all[3]; s.orders = all[4]
  const ids = s.orders.map((row) => row.id)
  s.items = ids.length ? await data(db.from("work_order_items").select("*").in("work_order_id", ids).order("created_at")) : []
}
async function boot() {
  s.loading = true; render()
  const result = await db.auth.getSession(); s.session = result.data.session
  if (!s.session) { s.loading = false; render(); return }
  try { await loadProfile(); await loadEmployees(); await loadData() }
  catch (error) { await db.auth.signOut(); s.session = null; s.profile = null; s.note = { text: "Anmeldung konnte nicht geladen werden: " + error.message, error: true } }
  s.loading = false; render()
}

function note() { return s.note ? "<div class='toast " + (s.note.error ? "error" : "") + "'>" + h(s.note.text) + "</div>" : "" }
function login() {
  root.innerHTML = "<main class='login-page'><section class='login-card'><div class='brand-mark'>AZ</div><p class='eyebrow'>GEMEINSAME ZEITERFASSUNG</p><h1>Willkommen zurück</h1><p class='muted'>Melde dich mit deinem Benutzernamen und Passwort an.</p><form data-form='login' class='stack-form'><label>Benutzername<input name='username' autocomplete='username' required autofocus placeholder='z. B. Max.Muster'></label><label>Passwort<input name='password' type='password' autocomplete='current-password' required placeholder='Passwort'></label><button class='primary wide' type='submit'>Anmelden</button></form><p class='login-note'>Mitarbeiterkonten werden vom Chef eingerichtet.</p>" + note() + "</section></main>"
}
function header() {
  const picker = s.profile.role === "chief"
    ? "<label class='employee-picker'>Daten von<select id='employee-picker'>" + s.employees.map((row) => "<option value='" + h(row.id) + "'" + (row.id === s.employeeId ? " selected" : "") + ">" + h(row.username) + (row.role === "chief" ? " (Chef)" : "") + "</option>").join("") + "</select></label>"
    : "<span class='user-name'>" + h(me()?.username) + "</span>"
  return "<header class='topbar'><div class='brand'><span class='brand-mark small'>AZ</span><div><strong>Arbeitszeit</strong><small>" + YEAR + " · " + (s.profile.role === "chief" ? "Chefansicht" : "Mitarbeiterkonto") + "</small></div></div><div class='topbar-actions'>" + picker + "<button class='quiet' data-action='logout'>Abmelden</button></div></header>"
}
function nav() {
  return "<nav class='main-nav'>" + [["planner", "Zeiterfassung"], ["customers", "Kunden"], ["orders", "Arbeitsscheine"], ["settings", "Einstellungen"]].map((item) => "<button data-view='" + item[0] + "' class='" + (s.view === item[0] ? "active" : "") + "'>" + item[1] + "</button>").join("") + "</nav>"
}
function datePicker() {
  const list = [], start = date(s.selected); start.setDate(start.getDate() - 4)
  for (let i = 0; i < 9; i += 1) { const d = new Date(start); d.setDate(start.getDate() + i); if (weekday(iso(d))) list.push(iso(d)) }
  const buttons = list.map((value) => "<button data-action='choose-date' data-date='" + value + "' class='day-chip " + (value === s.selected ? "selected" : "") + "'><span>" + date(value).toLocaleDateString("de-DE", { weekday: "short" }) + "</span><strong>" + value.slice(8) + "</strong></button>").join("")
  return "<section class='date-panel'><div><p class='eyebrow'>ZEITERFASSUNG</p><h1>" + dayText(s.selected) + "</h1><p class='muted'>" + (HOLIDAYS[s.selected] || (weekday(s.selected) ? "Arbeitszeit und Kunden für diesen Tag" : "Wochenende")) + "</p></div><div class='date-controls'><button class='icon-button' data-action='previous-date'>‹</button><input id='date-picker' type='date' value='" + s.selected + "'><button class='icon-button' data-action='next-date'>›</button></div><div class='day-strip'>" + buttons + "</div></section>"
}
function job(row, index, locked) {
  const value = calc(row)
  const extra = s.columns.map((column) => "<label class='custom-cell'><span>" + h(column.name) + "</span><input data-entry-custom='" + h(column.id) + "' data-id='" + h(row.id) + "' value='" + h(row.custom_fields?.[column.id] || "") + "'" + (locked ? " disabled" : "") + "></label>").join("")
  const field = (label, name, content, sub) => "<label>" + label + content + (sub ? "<small>" + sub + "</small>" : "") + "</label>"
  const time = (name, shown) => "<input type='time' data-entry-field='" + name + "' data-id='" + h(row.id) + "' value='" + h(shown) + "'" + (locked ? " disabled" : "") + ">"
  const text = (name, shown) => "<input inputmode='decimal' data-entry-field='" + name + "' data-id='" + h(row.id) + "' value='" + h(shown) + "'" + (locked ? " disabled" : "") + ">"
  return "<article class='job-card'><div class='job-head'><span class='job-index'>" + (index + 1) + "</span><label class='customer-cell'>Kunde<input list='customer-list' data-entry-field='customer_name' data-id='" + h(row.id) + "' value='" + h(row.customer_name) + "' placeholder='Kunde auswählen oder eingeben'" + (locked ? " disabled" : "") + "></label><button class='text-button' data-action='open-order' data-customer='" + h(row.customer_name) + "'" + (locked ? " disabled" : "") + ">Arbeitsschein</button><button class='danger-icon' data-action='delete-entry' data-id='" + h(row.id) + "'" + (locked ? " disabled" : "") + ">×</button></div><div class='job-grid'>" + field("Beginn", "start_time", time("start_time", value.start_time), String(value.start_time || "") + " Uhr") + field("Ende", "end_time", time("end_time", value.end_time), String(value.end_time || "") + " Uhr") + field("Pause (Std.)", "pause_hours", text("pause_hours", value.pause_hours)) + field("Ausgeführt", "executed_hours", text("executed_hours", value.executed_hours), hours(value.executed_hours)) + "</div>" + (extra ? "<div class='custom-grid'>" + extra + "</div>" : "") + "</article>"
}
function planner() {
  const status = currentStatus(), rows = jobs(), goal = status.locked ? 0 : target(s.selected)
  const total = rows.reduce((sum, row) => sum + calc(row).executed_hours, 0), balance = total - goal
  const absence = status.name ? "<div class='absence holiday'><strong>" + h(status.name) + "</strong><span>Feiertag in NRW – für diesen Tag können keine Kunden erfasst werden.</span></div>" : (status.vacation || status.sick ? "<div class='absence " + (status.sick ? "sick" : "vacation") + "'><strong>" + (status.sick ? "Krankheit" : "Urlaub") + "</strong><span>Für diesen Tag ist keine Arbeitszeiterfassung vorgesehen.</span></div>" : "")
  const list = rows.length ? rows.map((row, index) => job(row, index, status.locked)).join("") : "<div class='empty-state'>" + (status.locked || !weekday(s.selected) ? "An diesem Tag ist keine Arbeitszeiterfassung möglich." : "Noch kein Kunde erfasst. Mit „+ Kunde“ beginnen.") + "</div>"
  const overtime = Math.abs(balance) < 0.005 ? "–" : (balance > 0 ? "+" : "") + hours(balance)
  return "<main class='page'><datalist id='customer-list'>" + s.customers.map((row) => "<option value='" + h(row.name) + "'></option>").join("") + "</datalist>" + datePicker() + "<section class='summary-grid'><div class='summary-card'><span>Sollzeit</span><strong>" + hours(goal) + "</strong></div><div class='summary-card'><span>Ausgeführt</span><strong>" + hours(total) + "</strong></div><div class='summary-card'><span>Überstunden</span><strong class='" + (balance > 0.004 ? "positive" : balance < -0.004 ? "negative" : "") + "'>" + overtime + "</strong></div></section><section class='status-card'><div><strong>Abwesenheit</strong><p>Urlaub und Krankheit werden nur hier erfasst – alle Zeiten bleiben unverändert.</p></div><div class='absence-inputs'><label>Urlaub<input id='vacation-input' inputmode='decimal' value='" + h(currentDay().vacation) + "'" + (status.name ? " disabled" : "") + "></label><label>Krankheit<input id='sick-input' inputmode='decimal' value='" + h(currentDay().sick) + "'" + (status.name ? " disabled" : "") + "></label></div></section>" + absence + "<section class='jobs-section'><div class='section-title'><div><h2>Kunden & Zeiten</h2><p>Stunden eingeben oder Beginn und Ende eintragen – die andere Angabe wird berechnet.</p></div><button class='primary' data-action='add-entry'" + (status.locked || !weekday(s.selected) ? " disabled" : "") + ">+ Kunde</button></div>" + list + "</section></main>"
}
function customers() {
  const total = (customer) => s.entries.filter((row) => row.customer_id === customer.id || String(row.customer_name).toLowerCase() === String(customer.name).toLowerCase()).reduce((sum, row) => sum + calc(row).executed_hours, 0)
  const list = s.customers.length ? s.customers.map((row) => "<article class='customer-row'><div><h2>" + h(row.name) + "</h2><p>" + hours(total(row)) + " im Jahr " + YEAR + "</p></div><button class='danger-outline' data-action='delete-customer' data-id='" + h(row.id) + "'>Kunde löschen</button></article>").join("") : "<div class='empty-state'>Noch keine Kunden vorhanden.</div>"
  return "<main class='page'><section class='hero-small'><p class='eyebrow'>KUNDENLISTE</p><h1>Kunden verwalten</h1><p class='muted'>Die Stunden summieren sich aus allen Einträgen des ausgewählten Mitarbeiters.</p></section><form data-form='customer' class='inline-form'><input name='name' required placeholder='Neuen Kunden eingeben'><button class='primary' type='submit'>Kunde anlegen</button></form><section class='customer-list'>" + list + "</section></main>"
}
function orderCard(order) {
  const lines = s.items.filter((row) => row.work_order_id === order.id), total = lines.reduce((sum, row) => sum + n(row.quantity) * n(row.unit_price), 0)
  const lineHtml = lines.length ? lines.map((row) => "<div class='material-row'><input data-item-field='position_name' data-id='" + h(row.id) + "' value='" + h(row.position_name) + "'><input data-item-field='quantity' data-id='" + h(row.id) + "' inputmode='decimal' value='" + h(row.quantity) + "'><input data-item-field='unit_price' data-id='" + h(row.id) + "' inputmode='decimal' value='" + h(row.unit_price) + "'><strong>" + euros(n(row.quantity) * n(row.unit_price)) + "</strong><button class='danger-icon' data-action='delete-item' data-id='" + h(row.id) + "'>×</button></div>").join("") : "<p class='muted'>Noch keine Materialien erfasst.</p>"
  return "<article class='order-card'><div class='order-head'><div><span>" + dayText(order.work_date) + "</span><h2>" + h(order.customer_name || "Ohne Kunden") + "</h2><p>" + h(order.title || "Arbeitsschein") + "</p></div><button class='danger-icon' data-action='delete-order' data-id='" + h(order.id) + "'>×</button></div>" + (order.notes ? "<p class='order-notes'>" + h(order.notes) + "</p>" : "") + "<div class='materials'>" + lineHtml + "</div><form data-form='material' data-order-id='" + h(order.id) + "' class='material-add'><input name='positionName' required placeholder='Material / Position'><input name='quantity' inputmode='decimal' value='1'><input name='unitPrice' inputmode='decimal' value='0'><button class='quiet' type='submit'>+ Position</button></form><div class='order-total'>Gesamt <strong>" + euros(total) + "</strong></div></article>"
}
function orders() {
  const options = s.customers.map((row) => "<option value='" + h(row.name) + "'></option>").join("")
  return "<main class='page'><section class='hero-small'><p class='eyebrow'>ARBEITSSCHEINE</p><h1>Material und Kosten</h1><p class='muted'>Zu jedem Kunden können Materialpositionen mit Menge und Preis festgehalten werden.</p></section><form data-form='order' class='order-create'><div class='form-grid'><label>Datum<input name='workDate' type='date' value='" + s.selected + "' required></label><label>Kunde<input name='customerName' list='customer-list' required placeholder='Kunde auswählen'></label><label>Titel<input name='title' placeholder='z. B. Reparatur'></label></div><label>Notiz<textarea name='notes' placeholder='Zusätzliche Hinweise'></textarea></label><button class='primary' type='submit'>Arbeitsschein anlegen</button></form><datalist id='customer-list'>" + options + "</datalist><section class='order-list'>" + (s.orders.length ? s.orders.map(orderCard).join("") : "<div class='empty-state'>Noch keine Arbeitsscheine vorhanden.</div>") + "</section></main>"
}
function settings() {
  const employee = me(), columns = s.columns.length ? s.columns.map((row) => "<div><span>" + h(row.name) + "</span><button class='danger-outline' data-action='delete-column' data-id='" + h(row.id) + "'>Entfernen</button></div>").join("") : "<p class='muted'>Keine zusätzlichen Spalten.</p>"
  const staff = s.profile.role !== "chief" ? "" : "<section class='settings-section'><div class='section-title'><div><p class='eyebrow'>CHEFBEREICH</p><h2>Mitarbeiter verwalten</h2><p>Konten, Passwörter und Urlaubsanspruch werden hier sicher verwaltet.</p></div></div><form data-form='new-employee' class='inline-form employee-add'><input name='username' required placeholder='Benutzername'><input name='password' type='password' required placeholder='Startpasswort'><button class='primary' type='submit'>Mitarbeiter hinzufügen</button></form><div class='employee-list'>" + s.employees.filter((row) => row.role === "employee").map((row) => "<form data-form='employee-update' data-id='" + h(row.id) + "' class='employee-row'><strong>" + h(row.username) + "</strong><input name='username' value='" + h(row.username) + "'><input name='password' type='password' placeholder='Neues Passwort (optional)'><input name='vacationAllowance' inputmode='decimal' value='" + h(row.vacation_allowance) + "'><span>Urlaubstage</span><button class='quiet' type='submit'>Speichern</button><button class='danger-outline' type='button' data-action='delete-employee' data-id='" + h(row.id) + "' data-name='" + h(row.username) + "'>Löschen</button></form>").join("") + "</div></section>"
  return "<main class='page'><section class='hero-small'><p class='eyebrow'>EINSTELLUNGEN</p><h1>" + (s.profile.role === "chief" ? "Daten von " + h(employee?.username) : "Persönliche Einstellungen") + "</h1><p class='muted'>Zusatzspalten ergänzen die Erfassung, ohne feste Berechnungen zu verändern.</p></section><section class='settings-section'><h2>Urlaubsanspruch</h2><p>Verfügbar: <strong>" + n(employee?.vacation_allowance).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " Tage</strong>. Der Anspruch wird vom Chef gepflegt.</p></section><section class='settings-section'><h2>Zusatzspalten</h2><p>Diese Felder erscheinen bei jeder Kundenzeile des ausgewählten Mitarbeiters.</p><form data-form='column' class='inline-form'><input name='name' required placeholder='Bezeichnung der Zusatzspalte'><button class='primary' type='submit'>Spalte hinzufügen</button></form><div class='column-list'>" + columns + "</div></section>" + staff + "</main>"
}
function render() {
  if (s.loading) { root.innerHTML = "<div class='loading-card'><div class='loading-mark'>AZ</div><p>Arbeitszeit wird vorbereitet …</p></div>"; return }
  if (!s.session) { login(); return }
  const page = s.view === "planner" ? planner() : s.view === "customers" ? customers() : s.view === "orders" ? orders() : settings()
  root.innerHTML = "<div class='app-shell'>" + header() + nav() + page + note() + "</div>"
}

async function pickEmployee(employeeId) { if (employeeId === s.employeeId) return; s.employeeId = employeeId; s.loading = true; render(); try { await loadData() } catch (error) { tell(error.message, true) } s.loading = false; render() }
function nextWorkday(direction) { const d = date(s.selected); do { d.setDate(d.getDate() + direction) } while (!weekday(iso(d))); return iso(d) }
async function customer(value) {
  const name = String(value || "").trim(); if (!name) throw new Error("Bitte einen Kundennamen eingeben.")
  const found = s.customers.find((row) => row.name.localeCompare(name, "de", { sensitivity: "accent" }) === 0); if (found) return found
  const similar = s.customers.find((row) => row.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(row.name.toLowerCase()))
  if (similar && window.confirm("Meintest du „" + similar.name + "“?\nOK: vorhandenen Kunden verwenden\nAbbrechen: neuen Kunden anlegen")) return similar
  const saved = await data(db.from("customers").insert({ id: guid(), employee_id: s.employeeId, name }).select().single()); s.customers.push(saved); s.customers.sort((a, b) => a.name.localeCompare(b.name, "de")); return saved
}
async function saveDay(field, value) {
  const row = { ...currentDay(), employee_id: s.employeeId, work_date: s.selected, [field]: Math.max(0, n(value)) }
  if (field === "vacation" && row.vacation > 0) row.sick = 0
  if (field === "sick" && row.sick > 0) row.vacation = 0
  const saved = await data(db.from("work_days").upsert(row).select().single()); s.days.set(saved.work_date, saved); render()
}
async function addEntry() {
  const prior = jobs().at(-1), start = prior ? calc(prior).end_time : "07:30"
  const row = { id: guid(), employee_id: s.employeeId, work_date: s.selected, customer_id: null, customer_name: "", start_time: start || "07:30", end_time: start || "07:30", pause_hours: 0, executed_hours: 0, calculation_mode: "hours", custom_fields: {} }
  s.entries.push(await data(db.from("time_entries").insert(row).select().single())); render()
}
async function editEntry(entryId, field, value) {
  const row = s.entries.find((item) => item.id === entryId); if (!row) return
  if (field === "customer_name") { if (!String(value).trim()) { row.customer_name = ""; row.customer_id = null } else { const found = await customer(value); row.customer_name = found.name; row.customer_id = found.id } }
  else if (field === "custom") row.custom_fields = { ...(row.custom_fields || {}), [value[0]]: value[1] }
  else if (field === "executed_hours") { row.executed_hours = Math.max(0, n(value)); row.calculation_mode = "hours" }
  else if (field === "end_time") { row.end_time = value; row.calculation_mode = "end_time" }
  else if (field === "pause_hours") row.pause_hours = Math.max(0, n(value))
  else if (field === "start_time") row.start_time = value
  Object.assign(row, await data(db.from("time_entries").upsert(calc(row)).select().single())); render()
}
async function manage(payload) { const result = await db.functions.invoke("manage-employees", { body: payload }); if (result.error) throw result.error; if (result.data?.error) throw new Error(result.data.error); await loadEmployees() }

root.addEventListener("submit", async (event) => {
  const form = event.target.closest("form"); if (!form) return; event.preventDefault()
  try {
    if (form.dataset.form === "login") { const result = await db.auth.signInWithPassword({ email: form.username.value.trim().toLowerCase() + "@arbeitszeit.local", password: form.password.value }); if (result.error) throw new Error("Benutzername oder Passwort ist nicht korrekt.") }
    else if (form.dataset.form === "customer") { await customer(form.name.value); tell("Kunde angelegt.") }
    else if (form.dataset.form === "column") { const name = form.name.value.trim(); if (!name) throw new Error("Bitte eine Bezeichnung eingeben."); s.columns.push(await data(db.from("custom_columns").insert({ id: guid(), employee_id: s.employeeId, name, position: s.columns.length }).select().single())); render() }
    else if (form.dataset.form === "order") { const found = await customer(form.customerName.value); s.orders.unshift(await data(db.from("work_orders").insert({ id: guid(), employee_id: s.employeeId, work_date: form.workDate.value, customer_id: found.id, customer_name: found.name, title: form.title.value.trim(), notes: form.notes.value.trim() }).select().single())); tell("Arbeitsschein angelegt.") }
    else if (form.dataset.form === "material") { const name = form.positionName.value.trim(); if (!name) throw new Error("Bitte Material oder Position eingeben."); s.items.push(await data(db.from("work_order_items").insert({ id: guid(), work_order_id: form.dataset.orderId, position_name: name, quantity: Math.max(0, n(form.quantity.value)), unit_price: Math.max(0, n(form.unitPrice.value)) }).select().single())); render() }
    else if (form.dataset.form === "new-employee") { await manage({ action: "create", username: form.username.value, password: form.password.value }); tell("Mitarbeiterkonto angelegt.") }
    else if (form.dataset.form === "employee-update") { await manage({ action: "update", employeeId: form.dataset.id, username: form.username.value, password: form.password.value, vacationAllowance: form.vacationAllowance.value }); tell("Mitarbeiter gespeichert.") }
  } catch (error) { tell(error.message || "Aktion fehlgeschlagen.", true) }
})
root.addEventListener("change", async (event) => {
  const el = event.target
  try {
    if (el.id === "employee-picker") await pickEmployee(el.value)
    else if (el.id === "date-picker") { s.selected = el.value; render() }
    else if (el.id === "vacation-input") await saveDay("vacation", el.value)
    else if (el.id === "sick-input") await saveDay("sick", el.value)
    else if (el.dataset.entryField) await editEntry(el.dataset.id, el.dataset.entryField, el.value)
    else if (el.dataset.entryCustom) await editEntry(el.dataset.id, "custom", [el.dataset.entryCustom, el.value])
    else if (el.dataset.itemField) { const row = s.items.find((item) => item.id === el.dataset.id); row[el.dataset.itemField] = el.dataset.itemField === "position_name" ? el.value.trim() : Math.max(0, n(el.value)); Object.assign(row, await data(db.from("work_order_items").update({ [el.dataset.itemField]: row[el.dataset.itemField] }).eq("id", row.id).select().single())); render() }
  } catch (error) { tell(error.message || "Änderung konnte nicht gespeichert werden.", true) }
})
root.addEventListener("click", async (event) => {
  const button = event.target.closest("button"); if (!button) return
  try {
    if (button.dataset.view) { s.view = button.dataset.view; render(); return }
    if (button.dataset.action === "logout") { await db.auth.signOut(); s.session = null; s.profile = null; s.employeeId = null; render(); return }
    if (button.dataset.action === "choose-date") { s.selected = button.dataset.date; render(); return }
    if (button.dataset.action === "previous-date") { s.selected = nextWorkday(-1); render(); return }
    if (button.dataset.action === "next-date") { s.selected = nextWorkday(1); render(); return }
    if (button.dataset.action === "add-entry") await addEntry()
    if (button.dataset.action === "delete-entry" && window.confirm("Diese Kundenzeile wirklich löschen?")) { await data(db.from("time_entries").delete().eq("id", button.dataset.id)); s.entries = s.entries.filter((row) => row.id !== button.dataset.id); render() }
    if (button.dataset.action === "open-order") { s.view = "orders"; render(); const field = root.querySelector("[data-form='order'] [name='customerName']"); if (field) { field.value = button.dataset.customer || ""; field.focus() } }
    if (button.dataset.action === "delete-customer") { const row = s.customers.find((item) => item.id === button.dataset.id); if (row && window.confirm("Kunde „" + row.name + "“ wirklich löschen? Bereits erfasste Zeiten bleiben erhalten.")) { await data(db.from("customers").delete().eq("id", row.id)); s.customers = s.customers.filter((item) => item.id !== row.id); tell("Kunde gelöscht.") } }
    if (button.dataset.action === "delete-item") { await data(db.from("work_order_items").delete().eq("id", button.dataset.id)); s.items = s.items.filter((row) => row.id !== button.dataset.id); render() }
    if (button.dataset.action === "delete-order" && window.confirm("Diesen Arbeitsschein mit allen Positionen löschen?")) { await data(db.from("work_orders").delete().eq("id", button.dataset.id)); s.orders = s.orders.filter((row) => row.id !== button.dataset.id); s.items = s.items.filter((row) => row.work_order_id !== button.dataset.id); render() }
    if (button.dataset.action === "delete-column" && window.confirm("Zusatzspalte entfernen? Die bisherigen Werte bleiben in den Einträgen gespeichert.")) { await data(db.from("custom_columns").delete().eq("id", button.dataset.id)); s.columns = s.columns.filter((row) => row.id !== button.dataset.id); render() }
    if (button.dataset.action === "delete-employee" && window.confirm("Mitarbeiter „" + button.dataset.name + "“ samt seinen Daten wirklich löschen?")) { await manage({ action: "delete", employeeId: button.dataset.id }); if (s.employeeId === button.dataset.id) { s.employeeId = s.profile.id; await loadData() } tell("Mitarbeiter gelöscht.") }
  } catch (error) { tell(error.message || "Aktion fehlgeschlagen.", true) }
})
db.auth.onAuthStateChange((_event, session) => { if (session?.access_token !== s.session?.access_token) { s.session = session; s.profile = null; s.employeeId = null; boot() } })
boot()

