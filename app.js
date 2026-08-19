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
const s = { session: null, profile: null, employees: [], employeeId: null, view: "planner", selected: workday(new Date()), customers: [], days: new Map(), entries: [], columns: [], orders: [], items: [], materials: [], messages: [], mailboxFolder: "all", appointments: [], vacationRequests: [], calendarMonth: new Date().getMonth(), calendarYear: new Date().getFullYear(), calendarForm: "", customerChannel: null, customerSyncTimer: null, teamChannel: null, teamSyncTimer: null, dayStatusOverrides: new Map(), note: null, loading: true }

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
function orderStartFor(workDate) {
  const earlier = s.orders.concat(s.entries).filter((row) => row.work_date === workDate && calc(row).end_time).sort((left, right) => String(left.created_at || left.id).localeCompare(String(right.created_at || right.id)))
  return earlier.length ? calc(earlier.at(-1)).end_time || "07:30" : "07:30"
}
function sameDay(left, right) { return String(left) === String(right) }
function inRange(value, start, end) { return String(value) >= String(start) && String(value) <= String(end) }
function employeeName(id) { return s.employees.find((row) => row.id === id)?.username || "Unbekannter Mitarbeiter" }
function vacationDays(start, end) {
  let count = 0, cursor = date(start), last = date(end)
  while (cursor <= last) { const value = iso(cursor); if (weekday(value) && !HOLIDAYS[value]) count += 1; cursor.setDate(cursor.getDate() + 1) }
  return count
}
function approvedVacationDays(employeeId) { return s.vacationRequests.filter((row) => row.employee_id === employeeId && row.status === "approved").reduce((sum, row) => sum + n(row.requested_days), 0) }
function remainingVacationDays(employeeId) { const person = s.employees.find((row) => row.id === employeeId); return Math.max(0, n(person?.vacation_allowance) - approvedVacationDays(employeeId)) }
function monthLabel(year, month) { return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(new Date(year, month, 1)) }
function currentDay() { return s.days.get(s.selected) || { employee_id: s.employeeId, work_date: s.selected, vacation: 0, sick: 0 } }
function plannedHoursForDay(workDate) {
  const day = s.days.get(workDate) || {}
  const vacation = s.vacationRequests.some((row) => row.employee_id === s.employeeId && row.status === "approved" && inRange(workDate, row.start_date, row.end_date))
  return n(day.sick) > 0 || n(day.vacation) > 0 || vacation || HOLIDAYS[workDate] ? 0 : target(workDate)
}
function employeeStatistics() {
  const totals = new Map()
  s.entries.forEach((row) => totals.set(row.work_date, (totals.get(row.work_date) || 0) + calc(row).executed_hours))
  const executed = [...totals.values()].reduce((sum, value) => sum + value, 0)
  const overtime = [...totals.entries()].reduce((sum, entry) => sum + entry[1] - plannedHoursForDay(entry[0]), 0)
  const sick = [...s.days.values()].filter((row) => n(row.sick) > 0).length
  return { executed, overtime, sick, vacation: approvedVacationDays(s.employeeId), vacationRemaining: remainingVacationDays(s.employeeId) }
}
function reportRowsForPdf() {
  const dates = new Set()
  s.entries.forEach((row) => dates.add(row.work_date))
  s.days.forEach((row) => dates.add(row.work_date))
  s.vacationRequests.filter((row) => row.employee_id === s.employeeId && row.status !== "rejected").forEach((row) => {
    const cursor = date(row.start_date), end = date(row.end_date)
    while (cursor <= end) { if (weekday(iso(cursor))) dates.add(iso(cursor)); cursor.setDate(cursor.getDate() + 1) }
  })
  return [...dates].sort().map((workDate) => {
    const entries = s.entries.filter((row) => row.work_date === workDate)
    const day = s.days.get(workDate) || {}
    const vacation = s.vacationRequests.find((row) => row.employee_id === s.employeeId && row.status !== "rejected" && inRange(workDate, row.start_date, row.end_date))
    const executed = entries.reduce((sum, row) => sum + calc(row).executed_hours, 0)
    const sick = n(day.sick) > 0
    const vacationText = vacation ? (vacation.status === "approved" ? "Urlaub genehmigt" : "Urlaub beantragt") : n(day.vacation) > 0 ? "Urlaub" : ""
    const illnessText = sick ? "Krank" : ""
    const overtime = executed - plannedHoursForDay(workDate)
    return { workDate, customers: [...new Set(entries.map((row) => row.customer_name).filter(Boolean))].join(", ") || "–", executed, overtime, sick: illnessText || "–", vacation: vacationText || "–" }
  })
}
function signedHours(value) { return Math.abs(value) < 0.005 ? "0,00h" : (value > 0 ? "+" : "") + hours(value) }
function loadPdfScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script"), timeout = window.setTimeout(() => finish(new Error("Zeitüberschreitung beim Laden der PDF-Erstellung.")), 8000)
    const finish = (error) => { window.clearTimeout(timeout); script.remove(); error ? reject(error) : resolve(window.jspdf.jsPDF) }
    script.src = source; script.async = true; script.onload = () => window.jspdf?.jsPDF ? finish() : finish(new Error("Die PDF-Bibliothek konnte nicht gestartet werden.")); script.onerror = () => finish(new Error("Die PDF-Bibliothek konnte nicht geladen werden.")); document.head.append(script)
  })
}
async function pdfConstructor() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF
  for (const source of ["https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js", "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"]) {
    try { return await loadPdfScript(source) } catch (_) {}
  }
  throw new Error("Die PDF-Erstellung ist gerade nicht erreichbar. Bitte Internetverbindung prüfen und erneut versuchen.")
}
async function downloadPdf() {
  const Pdf = await pdfConstructor()
  const person = me(), rows = reportRowsForPdf(), stats = employeeStatistics(), doc = new Pdf({ orientation: "landscape", unit: "mm", format: "a4" })
  const left = 11, right = 286, columns = [left, 40, 111, 138, 165, 189], widths = [27, 71, 27, 27, 24, 97]
  let y = 31, page = 1
  const header = () => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("Arbeitszeitnachweis", left, 14)
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text("Mitarbeiter: " + String(person?.username || "Unbekannt"), left, 20)
    doc.text("Erstellt am: " + new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date()), 188, 20)
    doc.setFillColor(8, 112, 93); doc.rect(left, 24, right - left, 6, "F")
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5)
    ;["Datum", "Kunden", "Arbeitsstunden", "Überstunden", "Krank", "Urlaub"].forEach((text, index) => doc.text(text, columns[index] + 1.5, 28))
    doc.setTextColor(30, 55, 65); doc.setFont("helvetica", "normal"); y = 35
  }
  const ensureRoom = (height) => { if (y + height <= 183) return; doc.setFontSize(7); doc.setTextColor(100, 120, 128); doc.text("Seite " + page, right - 12, 199); doc.addPage(); page += 1; header() }
  header()
  rows.forEach((row, index) => {
    const text = [dayText(row.workDate), row.customers, hours(row.executed), signedHours(row.overtime), row.sick, row.vacation]
    const lines = text.map((value, column) => doc.splitTextToSize(String(value), widths[column] - 3))
    const height = Math.max(6, ...lines.map((value) => value.length * 3.7 + 2.5))
    ensureRoom(height)
    doc.setFillColor(index % 2 ? 247 : 255, index % 2 ? 251 : 255, index % 2 ? 250 : 255); doc.rect(left, y - 3.5, right - left, height, "F")
    lines.forEach((value, column) => doc.text(value, columns[column] + 1.5, y, { lineHeightFactor: 1.1 }))
    y += height
  })
  ensureRoom(25)
  doc.setFillColor(230, 246, 237); doc.roundedRect(left, y + 2, right - left, 18, 2, 2, "F")
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("Gesamtsummen", left + 3, y + 8)
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  doc.text("Ausgeführte Stunden: " + hours(stats.executed), left + 3, y + 14)
  doc.text("Überstunden: " + signedHours(stats.overtime), 88, y + 14)
  doc.text("Krankheitstage: " + stats.sick, 155, y + 14)
  doc.text("Urlaubstage: " + stats.vacation + " · Resturlaub: " + stats.vacationRemaining + " Tage", 211, y + 14)
  doc.setFontSize(7); doc.setTextColor(100, 120, 128); doc.text("Seite " + page, right - 12, 199)
  const filename = "arbeitszeit-" + String(person?.username || "nachweis").replace(/[^A-Za-z0-9_-]/g, "-") + ".pdf"
  doc.save(filename)
}
function currentStatus() {
  const row = currentDay(), name = HOLIDAYS[s.selected] || ""
  const approvedVacation = s.vacationRequests.some((request) => request.employee_id === s.employeeId && request.status === "approved" && inRange(s.selected, request.start_date, request.end_date))
  const vacation = approvedVacation || n(row.vacation) > 0
  const sick = n(row.sick) > 0
  return { name, vacation, sick, locked: Boolean(name) || vacation || sick }
}
function me() { return s.employees.find((row) => row.id === s.employeeId) || s.profile }
const MANAGED_MENU_VIEWS = new Set(["planner", "customers", "orders", "calendar"])
function canUse(view) { return s.profile?.role === "chief" || !MANAGED_MENU_VIEWS.has(view) || s.profile?.menu_permissions?.[view] !== false }
function firstAllowedView() { return ["planner", "customers", "orders", "calendar", "mailbox", "settings"].find(canUse) || "settings" }
function tell(text, error = false) { s.note = { text, error }; render(); setTimeout(() => { if (s.note?.text === text) { s.note = null; render() } }, 4500) }
async function data(request) { const { data: result, error } = await request; if (error) throw error; return result }
async function deleteSavedRecord(table, id) {
  const removed = await data(db.from(table).delete().eq("id", id).select("id"))
  if (!removed?.length) throw new Error("Der Eintrag konnte nicht gelöscht werden. Bitte die Seite einmal neu laden und erneut versuchen.")
  return removed[0]
}

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
    data(db.from("materials").select("*").eq("active", true).order("name")),
    data(db.from("mailbox_messages").select("*").eq("recipient_id", s.profile.id).order("created_at", { ascending: false })),
    data(db.from("appointments").select("*").order("event_date")),
    data(db.from("vacation_requests").select("*").order("start_date")),
  ])
  const loadedDays = new Map(all[1].map((row) => [row.work_date, row]))
  // Eine gerade erfolgreich gespeicherte Krankmeldung bleibt sichtbar, auch wenn
  // ein parallel gestarteter Datenabgleich noch einen älteren Stand zurückgibt.
  for (const [key, saved] of s.dayStatusOverrides) {
    if (saved.employee_id !== employee) continue
    const loaded = loadedDays.get(saved.work_date)
    if (loaded && n(loaded.sick) === n(saved.sick)) s.dayStatusOverrides.delete(key)
    else loadedDays.set(saved.work_date, saved)
  }
  s.customers = all[0]; s.days = loadedDays; s.entries = all[2]; s.columns = all[3]; s.orders = all[4]; s.materials = all[5]; s.messages = all[6]; s.appointments = all[7]; s.vacationRequests = all[8]
  const ids = s.orders.map((row) => row.id)
  s.items = ids.length ? await data(db.from("work_order_items").select("*").in("work_order_id", ids).order("created_at")) : []
}
function syncCustomersAcrossDevices() {
  if (s.customerChannel) db.removeChannel(s.customerChannel)
  if (!s.session) return
  s.customerChannel = db.channel("customer-sync-" + s.session.user.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => {
      if (s.view !== "customers" || !s.session) return
      window.clearTimeout(s.customerSyncTimer)
      s.customerSyncTimer = window.setTimeout(async () => { try { await loadData(); render() } catch (_) {} }, 250)
    })
    .subscribe()
}
function syncTeamDataAcrossDevices() {
  if (s.teamChannel) db.removeChannel(s.teamChannel)
  if (!s.session) return
  const refresh = () => {
    window.clearTimeout(s.teamSyncTimer)
    s.teamSyncTimer = window.setTimeout(async () => { try { await loadData(); render() } catch (_) {} }, 250)
  }
  s.teamChannel = db.channel("team-sync-" + s.session.user.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "vacation_requests" }, refresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "mailbox_messages" }, refresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "work_days" }, refresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "time_entries" }, refresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, refresh)
    .subscribe()
}
async function boot() {
  s.loading = true; render()
  const result = await db.auth.getSession(); s.session = result.data.session
  if (!s.session) { if (s.customerChannel) { db.removeChannel(s.customerChannel); s.customerChannel = null } if (s.teamChannel) { db.removeChannel(s.teamChannel); s.teamChannel = null } s.loading = false; render(); return }
  try { await loadProfile(); await loadEmployees(); await loadData(); syncCustomersAcrossDevices(); syncTeamDataAcrossDevices() }
  catch (error) { await db.auth.signOut(); s.session = null; s.profile = null; s.note = { text: "Anmeldung konnte nicht geladen werden: " + error.message, error: true } }
  s.loading = false; render()
}

function note() { return s.note ? "<div class='toast " + (s.note.error ? "error" : "") + "'>" + h(s.note.text) + "</div>" : "" }
function login() {
  root.innerHTML = "<main class='login-page'><section class='login-card'><div class='brand-mark'>AZ</div><p class='eyebrow'>GEMEINSAME ZEITERFASSUNG</p><h1>Willkommen zurück</h1><p class='muted'>Melde dich mit deinem Benutzernamen und Passwort an.</p><form data-form='login' class='stack-form'><label>Benutzername<input name='username' autocomplete='username' required autofocus placeholder='z. B. Max.Muster'></label><label>Passwort<input name='password' type='password' autocomplete='current-password' required placeholder='Passwort'></label><button class='primary wide' type='submit'>Anmelden</button></form><button class='text-button login-help' data-action='forgot-password' type='button'>Passwort vergessen?</button><p class='login-note'>Die Anfrage wird vertraulich an das interne Postfach des Chefs gesendet. Mitarbeiterkonten werden vom Chef eingerichtet.</p>" + note() + "</section></main>"
}
function header() {
  const picker = s.profile.role === "chief"
    ? "<label class='employee-picker'>Daten von<select id='employee-picker'>" + s.employees.map((row) => "<option value='" + h(row.id) + "'" + (row.id === s.employeeId ? " selected" : "") + ">" + h(row.username) + (row.role === "chief" ? " (Chef)" : "") + "</option>").join("") + "</select></label>"
    : "<span class='user-name'>" + h(me()?.username) + "</span>"
  return "<header class='topbar'><div class='brand'><span class='brand-mark small'>AZ</span><div><strong>Arbeitszeit</strong><small>" + YEAR + " · " + (s.profile.role === "chief" ? "Chefansicht" : "Mitarbeiterkonto") + "</small></div></div><div class='topbar-actions'>" + picker + "<button class='quiet' data-action='logout'>Abmelden</button></div></header>"
}
function nav() {
  const unread = s.messages.filter((row) => !row.read_at).length
  return "<nav class='main-nav'>" + [["planner", "Zeiterfassung"], ["customers", "Kunden"], ["orders", "Arbeitsscheine"], ["calendar", "Kalender"], ["mailbox", "Postfach" + (unread ? " (" + unread + ")" : "")], ["settings", "Einstellungen"]].filter((item) => canUse(item[0])).map((item) => "<button data-view='" + item[0] + "' class='" + (s.view === item[0] ? "active" : "") + "'>" + item[1] + "</button>").join("") + "</nav>"
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
  const absence = status.name ? "<div class='absence holiday'><strong>" + h(status.name) + (status.sick ? " · Krankheit gemeldet" : "") + "</strong><span>" + (status.sick ? "Die Krankmeldung ist für diesen Feiertag gespeichert." : "Feiertag in NRW – für diesen Tag können keine Kunden erfasst werden.") + "</span></div>" : (status.vacation || status.sick ? "<div class='absence " + (status.sick ? "sick" : "vacation") + "'><strong>" + (status.sick ? "Krankheit" : "Urlaub") + "</strong><span>Für diesen Tag ist keine Arbeitszeiterfassung vorgesehen.</span></div>" : "")
  const list = rows.length ? rows.map((row, index) => job(row, index, status.locked)).join("") : "<div class='empty-state'>" + (status.locked || !weekday(s.selected) ? "An diesem Tag ist keine Arbeitszeiterfassung möglich." : "Noch kein Kunde erfasst. Mit „+ Kunde“ beginnen.") + "</div>"
  const overtime = Math.abs(balance) < 0.005 ? "–" : (balance > 0 ? "+" : "") + hours(balance)
  const person = employeeName(s.employeeId), chief = s.profile.role === "chief"
  const vacationRequest = s.vacationRequests.find((request) => request.employee_id === s.employeeId && request.status !== "rejected" && inRange(s.selected, request.start_date, request.end_date))
  const employeeMayReportSick = weekday(s.selected) || status.vacation || Boolean(status.name)
  const sicknessAction = chief
    ? (status.sick ? "<button class='danger-outline' data-action='remove-sick'>Krankheitstag entfernen</button>" : "<button class='primary' data-action='mark-sick'>Krankheitstag hinzufügen</button>")
    : (status.sick ? "<span class='status-label sick-label'>Als krank gemeldet</span>" : employeeMayReportSick ? "<button class='primary' data-action='mark-sick'>Als krank markieren</button>" : "<span class='status-label sick-label'>An diesem Tag nicht möglich</span>")
  const sicknessBox = "<section class='sickness-control'><div><p class='eyebrow'>KRANKHEIT</p><h2>" + (chief ? "Krankheitsstatus von " + h(person) : "Mein Krankheitsstatus") + "</h2><p class='muted'>" + (chief ? "Du kannst Krankheitstage für diese Person hinzufügen oder entfernen – auch wenn Urlaub eingetragen ist." : "Du kannst dich auch an Urlaubs- und Feiertagen als krank melden. Entfernen kann nur der Chef.") + "</p></div><div class='sickness-actions'><span class='sickness-state " + (status.sick ? "marked" : "") + "'>" + (status.sick ? "Krank gemeldet" : "Nicht krank gemeldet") + "</span>" + sicknessAction + "</div></section>"
  const vacationAction = chief && vacationRequest ? "<button class='danger-outline' data-action='remove-vacation'>Urlaubszeitraum entfernen</button>" : ""
  return "<main class='page'><datalist id='customer-list'>" + s.customers.map((row) => "<option value='" + h(row.name) + "'></option>").join("") + "</datalist>" + datePicker() + "<section class='summary-grid'><div class='summary-card'><span>Sollzeit</span><strong>" + hours(goal) + "</strong></div><div class='summary-card'><span>Ausgeführt</span><strong>" + hours(total) + "</strong></div><div class='summary-card'><span>Überstunden</span><strong class='" + (balance > 0.004 ? "positive" : balance < -0.004 ? "negative" : "") + "'>" + overtime + "</strong></div></section>" + sicknessBox + "<section class='status-card'><div><strong>Abwesenheit</strong><p>Urlaub wird nur vom Chef verwaltet. Eine Krankmeldung gilt immer für den ganzen Tag.</p></div><div class='absence-overview'><span>Urlaub: <strong>" + (status.vacation ? "markiert" : "nicht markiert") + "</strong></span><span>Krankheit: <strong>" + (status.sick ? "markiert" : "nicht markiert") + "</strong></span>" + vacationAction + "</div></section>" + absence + "<section class='jobs-section'><div class='section-title'><div><h2>Kunden & Zeiten</h2><p>Stunden eingeben oder Beginn und Ende eintragen – die andere Angabe wird berechnet.</p></div><button class='primary' data-action='add-entry'" + (status.locked || !weekday(s.selected) ? " disabled" : "") + ">+ Kunde</button></div>" + list + "</section></main>"
}
function customers() {
  const total = (customer) => s.entries.filter((row) => row.customer_id === customer.id || String(row.customer_name).toLowerCase() === String(customer.name).toLowerCase()).reduce((sum, row) => sum + calc(row).executed_hours, 0)
  const card = (row) => {
    const fields = Object.entries(row.custom_fields || {})
    const saved = fields.length ? "<div class='customer-field-values'>" + fields.map((field) => "<div><span>" + h(field[0]) + "</span><strong>" + h(field[1]) + "</strong><button class='text-button' data-action='delete-customer-field' data-id='" + h(row.id) + "' data-key='" + h(field[0]) + "'>Entfernen</button></div>").join("") + "</div>" : "<p class='muted customer-fields-empty'>Noch keine zusätzlichen Kundendaten.</p>"
    return "<article class='customer-row customer-card'><div class='customer-head'><div><h2>" + h(row.name) + "</h2><p>" + hours(total(row)) + " im Jahr " + YEAR + "</p></div><button class='danger-outline' data-action='delete-customer' data-id='" + h(row.id) + "'>Kunde löschen</button></div><div class='customer-extra'><h3>Zusätzliche Kundendaten</h3>" + saved + "<form data-form='customer-field' data-id='" + h(row.id) + "' class='customer-field-add'><label>Feldbezeichnung<input name='fieldName' required placeholder='z. B. Telefonnummer'></label><label>Wert<input name='fieldValue' required placeholder='Wert eintragen'></label><button class='quiet' type='submit'>Feld speichern</button></form></div></article>"
  }
  const list = s.customers.length ? s.customers.map(card).join("") : "<div class='empty-state'>Noch keine Kunden vorhanden.</div>"
  return "<main class='page'><section class='hero-small'><p class='eyebrow'>KUNDENLISTE</p><h1>Kunden verwalten</h1><p class='muted'>Die Stunden summieren sich aus allen Einträgen des ausgewählten Mitarbeiters.</p></section><form data-form='customer' class='inline-form labelled-inline'><label>Kundenname<input name='name' required placeholder='Neuen Kunden eingeben'></label><button class='primary' type='submit'>Kunde anlegen</button></form><section class='customer-list'>" + list + "</section></main>"
}
function orderCard(order) {
  const lines = s.items.filter((row) => row.work_order_id === order.id), total = lines.reduce((sum, row) => sum + n(row.quantity) * n(row.unit_price), 0)
  const lineHtml = lines.length ? lines.map((row) => "<div class='material-row'><label>Material<input value='" + h(row.position_name) + "' disabled></label><label>Menge<input data-item-field='quantity' data-id='" + h(row.id) + "' inputmode='decimal' value='" + h(row.quantity) + "'></label><div class='price-display'><span>Preis/Stück</span><strong>" + euros(row.unit_price) + "</strong></div><div class='line-total'><span>Summe</span><strong>" + euros(n(row.quantity) * n(row.unit_price)) + "</strong></div><button class='danger-icon' data-action='delete-item' data-id='" + h(row.id) + "' aria-label='Position löschen'>×</button></div>").join("") : "<p class='muted'>Noch keine Materialien erfasst.</p>"
  const materialOptions = s.materials.map((row) => "<option value='" + h(row.id) + "'>" + h(row.name) + " – " + euros(row.unit_price) + "</option>").join("")
  const addMaterial = s.materials.length ? "<form data-form='material' data-order-id='" + h(order.id) + "' class='material-add'><label>Material<select name='materialId' required><option value=''>Bitte auswählen</option>" + materialOptions + "</select></label><label>Menge<input name='quantity' inputmode='decimal' value='1' required></label><button class='quiet' type='submit'>+ Position</button></form>" : "<p class='muted'>Materialien werden vom Chef im Menü Einstellungen angelegt.</p>"
  const timing = "<p class='order-time'><span>Beginn: <strong>" + h(order.start_time || "–") + (order.start_time ? " Uhr" : "") + "</strong></span><span>Ende: <strong>" + h(order.end_time || "–") + (order.end_time ? " Uhr" : "") + "</strong></span><span>Ausgeführt: <strong>" + hours(order.executed_hours) + "</strong></span></p>"
  return "<article class='order-card'><div class='order-head'><div><span>" + dayText(order.work_date) + "</span><h2>" + h(order.customer_name || "Ohne Kunden") + "</h2><p>" + h(order.title || "Arbeitsschein") + "</p></div><button class='danger-icon' data-action='delete-order' data-id='" + h(order.id) + "' aria-label='Arbeitsschein löschen'>×</button></div>" + timing + (order.notes ? "<p class='order-notes'>" + h(order.notes) + "</p>" : "") + "<div class='materials'>" + lineHtml + "</div>" + addMaterial + "<div class='order-total'>Gesamt <strong>" + euros(total) + "</strong></div></article>"
}
function orders() {
  const options = s.customers.map((row) => "<option value='" + h(row.name) + "'></option>").join("")
  return "<main class='page'><section class='hero-small'><p class='eyebrow'>ARBEITSSCHEINE</p><h1>Material und Kosten</h1><p class='muted'>Endzeit eintragen oder Stunden eingeben – die jeweils andere Zeit wird automatisch berechnet und in die Zeiterfassung übernommen.</p></section><form data-form='order' class='order-create'><div class='form-grid order-grid'><label>Datum<input id='order-work-date' name='workDate' type='date' value='" + s.selected + "' required></label><label>Kunde<input name='customerName' list='customer-list' required placeholder='Kunde auswählen'></label><label>Titel<input name='title' placeholder='z. B. Reparatur'></label><label>Arbeitsbeginn<input id='order-start-time' name='startTime' type='time' value='" + orderStartFor(s.selected) + "' required></label><label>Arbeitsende (oder Stunden)<input name='endTime' type='time'></label><label>Pause (Stunden)<input name='pauseHours' inputmode='decimal' value='0'></label><label>Ausgeführte Stunden (oder Ende)<input name='executedHours' inputmode='decimal' placeholder='z. B. 2,5'></label></div><label>Notiz<textarea name='notes' placeholder='Zusätzliche Hinweise'></textarea></label><button class='primary' type='submit'>Arbeitsschein anlegen</button></form><datalist id='customer-list'>" + options + "</datalist><section class='order-list'>" + (s.orders.length ? s.orders.map(orderCard).join("") : "<div class='empty-state'>Noch keine Arbeitsscheine vorhanden.</div>") + "</section></main>"
}
function settings() {
  const employee = me(), chief = s.profile.role === "chief"
  const stats = employeeStatistics()
  const columns = s.columns.length ? s.columns.map((row) => "<div><span>" + h(row.name) + "</span>" + (chief ? "<button class='danger-outline' data-action='delete-column' data-id='" + h(row.id) + "'>Entfernen</button>" : "") + "</div>").join("") : "<p class='muted'>Keine zusätzlichen Eingabefelder.</p>"
  const columnControl = chief ? "<form data-form='column' class='inline-form labelled-inline'><label>Neue Feldbezeichnung<input name='name' required placeholder='z. B. Fahrzeug'></label><button class='primary' type='submit'>Feld hinzufügen</button></form>" : "<p class='muted'>Zusätzliche Felder können nur vom Chef angelegt oder entfernt werden.</p>"
  const ownVacation = chief ? "<label>Mein Urlaubsanspruch (Tage)<input name='vacationAllowance' inputmode='decimal' value='" + h(s.profile.vacation_allowance) + "' required></label>" : ""
  const account = "<section class='settings-section'><h2>Mein Benutzerkonto</h2><p>Hier kann jeder sein eigenes Passwort und seinen eigenen Benutzernamen ändern." + (chief ? " Als Chef kannst du außerdem deinen eigenen Urlaubsanspruch pflegen." : "") + "</p><form data-form='self-account' class='form-grid account-form'><label>Benutzername<input name='username' value='" + h(s.profile.username) + "' required></label><label>Neues Passwort<input name='password' type='password' autocomplete='new-password' placeholder='Leer lassen = unverändert'></label>" + ownVacation + "<button class='primary' type='submit'>Konto speichern</button></form></section>"
  const statsPanel = "<section class='settings-section'><h2>Statistik von " + h(employee?.username) + "</h2><div class='summary-grid person-stats'><div class='summary-card'><span>Ausgeführt gesamt</span><strong>" + hours(stats.executed) + "</strong></div><div class='summary-card'><span>Überstunden</span><strong class='" + (stats.overtime > 0.004 ? "positive" : stats.overtime < -0.004 ? "negative" : "") + "'>" + (Math.abs(stats.overtime) < .005 ? "–" : (stats.overtime > 0 ? "+" : "") + hours(stats.overtime)) + "</strong></div><div class='summary-card'><span>Krankheitstage</span><strong>" + stats.sick + "</strong></div><div class='summary-card'><span>Urlaubstage</span><strong>" + stats.vacation + "</strong></div><div class='summary-card'><span>Resturlaub</span><strong>" + stats.vacationRemaining + " Tage</strong></div></div><div class='report-download'><div><h3>Daten als PDF</h3><p>Erstellt einen Nachweis für " + h(employee?.username) + " mit Tageswerten und Gesamtsummen.</p></div><button class='primary' data-action='download-pdf'>Daten als PDF herunterladen</button></div></section>"
  const materialCatalogue = !chief ? "" : "<section class='settings-section'><div class='section-title'><div><p class='eyebrow'>CHEFBEREICH</p><h2>Materialkatalog</h2><p>Preise werden ausschließlich hier gepflegt. Im Arbeitsschein sind sie nur sichtbar.</p></div></div><form data-form='new-material' class='inline-form labelled-inline'><label>Material<input name='name' required placeholder='z. B. Kabel'></label><label>Preis pro Stück (€)<input name='unitPrice' inputmode='decimal' value='0' required></label><button class='primary' type='submit'>Material anlegen</button></form><div class='material-catalogue'>" + (s.materials.length ? s.materials.map((row) => "<form data-form='material-update' data-id='" + h(row.id) + "' class='catalogue-row'><label>Material<input name='name' value='" + h(row.name) + "' required></label><label>Preis pro Stück (€)<input name='unitPrice' inputmode='decimal' value='" + h(row.unit_price) + "' required></label><button class='quiet' type='submit'>Speichern</button><button class='danger-outline' type='button' data-action='delete-material' data-id='" + h(row.id) + "' data-name='" + h(row.name) + "'>Entfernen</button></form>").join("") : "<p class='muted'>Noch kein Material angelegt.</p>") + "</div></section>"
  const overview = !chief ? "" : "<section class='settings-section'><p class='eyebrow'>CHEFBEREICH</p><h2>Person auswählen</h2><p>Öffne die Daten und Statistik einer Person.</p><div class='person-list'>" + s.employees.map((row) => "<button class='person-card' data-action='open-person-statistics' data-id='" + h(row.id) + "'><span>" + h(row.role === "chief" ? "Chef" : "Mitarbeiter") + "</span><strong>" + h(row.username) + "</strong><small>Statistik öffnen ›</small></button>").join("") + "</div></section>"
  const employeeAccessCard = (row) => {
    const permissions = row.menu_permissions || {}, menus = [["planner", "Zeiterfassung", "Arbeitszeiten und Krankheit"], ["customers", "Kunden", "Kunden und Zusatzdaten"], ["orders", "Arbeitsscheine", "Material, Zeiten und Kosten"], ["calendar", "Kalender", "Termine, Urlaub und Übersicht"]]
    const granted = menus.filter((item) => permissions[item[0]] !== false).length
    const access = menus.map((item) => "<label class='menu-permission-card'><input type='checkbox' name='" + item[0] + "'" + (permissions[item[0]] !== false ? " checked" : "") + "><span class='permission-indicator'></span><span><strong>" + item[1] + "</strong><small>" + item[2] + "</small></span></label>").join("")
    return "<form data-form='employee-update' data-id='" + h(row.id) + "' class='employee-access-card'><header><div><p class='eyebrow'>MITARBEITERKONTO</p><h3>" + h(row.username) + "</h3><p class='muted'>" + granted + " von " + menus.length + " Arbeitsbereichen sind freigegeben.</p></div><span class='access-count'>" + granted + "/" + menus.length + " Menüs</span></header><div class='employee-account-fields'><label>Benutzername<input name='username' value='" + h(row.username) + "' required></label><label>Neues Passwort<input name='password' type='password' placeholder='Leer lassen = unverändert'></label><label>Urlaubsanspruch (Tage)<input name='vacationAllowance' inputmode='decimal' value='" + h(row.vacation_allowance) + "' required></label></div><fieldset class='menu-permission-section'><legend>Sichtbare Menüs in der Mitarbeiter-App</legend><p>Aktivierte Bereiche erscheinen sofort nach dem Speichern auf allen Geräten dieses Mitarbeiters. Postfach und Einstellungen bleiben immer erreichbar.</p><div class='menu-permission-grid'>" + access + "</div></fieldset><footer><button class='primary' type='submit'>Freigaben und Konto speichern</button><button class='danger-outline' type='button' data-action='delete-employee' data-id='" + h(row.id) + "' data-name='" + h(row.username) + "'>Mitarbeiter löschen</button></footer></form>"
  }
  const staff = !chief ? "" : "<section class='settings-section'><div class='section-title'><div><p class='eyebrow'>CHEFBEREICH</p><h2>Mitarbeiter verwalten</h2><p>Konten, Passwörter, Urlaubsanspruch und sichtbare Menüs werden hier klar getrennt verwaltet.</p></div></div><form data-form='new-employee' class='inline-form labelled-inline employee-add'><label>Benutzername<input name='username' required placeholder='z. B. Max.Muster'></label><label>Startpasswort<input name='password' type='password' required></label><button class='primary' type='submit'>Mitarbeiter hinzufügen</button></form><div class='employee-list'>" + (s.employees.filter((row) => row.role === "employee").length ? s.employees.filter((row) => row.role === "employee").map(employeeAccessCard).join("") : "<p class='muted'>Noch keine Mitarbeiterkonten angelegt.</p>") + "</div></section>"
  return "<main class='page'><section class='hero-small'><p class='eyebrow'>EINSTELLUNGEN</p><h1>" + (chief ? "Daten von " + h(employee?.username) : "Persönliche Einstellungen") + "</h1><p class='muted'>Zusatzfelder ergänzen die Erfassung, ohne feste Berechnungen zu verändern.</p></section>" + overview + account + statsPanel + "<section class='settings-section'><h2>Urlaubsanspruch</h2><p>Gesamt: <strong>" + n(employee?.vacation_allowance).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " Tage</strong> · bereits genehmigt: <strong>" + approvedVacationDays(employee?.id).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " Tage</strong> · verbleibend: <strong>" + remainingVacationDays(employee?.id).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " Tage</strong>.</p></section><section class='settings-section'><h2>Zusätzliche Eingabefelder Zeiterfassung</h2><p>Diese Felder erscheinen bei jeder Kundenzeile des ausgewählten Mitarbeiters.</p>" + columnControl + "<div class='column-list'>" + columns + "</div></section>" + materialCatalogue + staff + "</main>"
}
function calendarActivity(day) {
  const entries = s.entries.filter((row) => sameDay(row.work_date, day))
  const appointments = s.appointments.filter((row) => row.employee_id === s.employeeId && sameDay(row.event_date, day))
  const vacation = s.vacationRequests.find((row) => row.employee_id === s.employeeId && row.status !== "rejected" && inRange(day, row.start_date, row.end_date))
  const sick = n(s.days.get(day)?.sick) > 0
  return { entries, appointments, vacation, sick }
}
function calendarForm() {
  if (!s.calendarForm) return ""
  if (s.calendarForm === "vacation") {
    if (s.employeeId !== s.profile.id) return "<section class='calendar-form-card'><p class='muted'>Urlaub beantragt jeder Mitarbeiter in seinem eigenen Konto. Als Chef kannst du eingegangene Anträge im Postfach entscheiden.</p></section>"
    return "<section class='calendar-form-card'><h2>Urlaub beantragen</h2><form data-form='vacation-request' class='form-grid'><label>Von<input name='startDate' type='date' value='" + s.selected + "' required></label><label>Bis<input name='endDate' type='date' value='" + s.selected + "' required></label><label>Hinweis (optional)<input name='note' placeholder='z. B. Familienurlaub'></label><button class='primary' type='submit'>Antrag senden</button><button class='quiet' type='button' data-action='close-calendar-form'>Abbrechen</button></form></section>"
  }
  const options = s.customers.map((row) => "<option value='" + h(row.name) + "'></option>").join("")
  return "<section class='calendar-form-card'><h2>Kundentermin vormerken</h2><form data-form='appointment' class='form-grid'><label>Datum<input name='eventDate' type='date' value='" + s.selected + "' required></label><label>Kunde<input name='customerName' list='calendar-customer-list' placeholder='Kunde auswählen oder eingeben'></label><label>Titel<input name='title' required placeholder='z. B. Baustellentermin'></label><label>Notiz<input name='notes' placeholder='Optionaler Hinweis'></label><button class='primary' type='submit'>Termin vormerken</button><button class='quiet' type='button' data-action='close-calendar-form'>Abbrechen</button></form><datalist id='calendar-customer-list'>" + options + "</datalist></section>"
}
function calendar() {
  const first = new Date(s.calendarYear, s.calendarMonth, 1), offset = (first.getDay() + 6) % 7, cells = []
  for (let index = 0; index < 42; index += 1) {
    const current = new Date(s.calendarYear, s.calendarMonth, 1 - offset + index), value = iso(current), activity = calendarActivity(value)
    const classes = [current.getMonth() === s.calendarMonth ? "" : "outside", value === s.selected ? "selected" : "", activity.entries.length ? "has-work" : "", activity.appointments.length ? "has-appointment" : "", activity.vacation?.status === "requested" ? "pending-vacation" : "", activity.vacation?.status === "approved" ? "approved-vacation" : "", activity.sick ? "sick-day" : ""].filter(Boolean).join(" ")
    const markers = (activity.entries.length ? "<i class='work-marker' title='Arbeitszeit'></i>" : "") + (activity.appointments.length ? "<i class='appointment-marker' title='Kundentermin'></i>" : "") + (activity.vacation ? "<i class='vacation-marker " + (activity.vacation.status === "requested" ? "requested" : "approved") + "' title='" + (activity.vacation.status === "requested" ? "Urlaub beantragt" : "Urlaub genehmigt") + "'></i>" : "") + (activity.sick ? "<i class='sick-marker' title='Krank gemeldet'></i>" : "")
    cells.push("<button class='calendar-day " + classes + "' data-action='calendar-day' data-date='" + value + "'><strong>" + current.getDate() + "</strong><span>" + markers + "</span></button>")
  }
  const details = calendarActivity(s.selected)
  const workRows = details.entries.map((row) => "<li><strong>" + h(row.customer_name || "Ohne Kunden") + "</strong> · " + h(row.start_time || "–") + "–" + h(calc(row).end_time || "–") + " Uhr · " + hours(calc(row).executed_hours) + "</li>").join("")
  const appointmentRows = details.appointments.map((row) => "<li><strong>Termin: " + h(row.title) + "</strong>" + (row.customer_name ? " · " + h(row.customer_name) : "") + (row.notes ? " · " + h(row.notes) : "") + " <button class='text-button' data-action='delete-appointment' data-id='" + h(row.id) + "'>Entfernen</button></li>").join("")
  const vacation = details.vacation ? "<li class='calendar-vacation-text " + (details.vacation.status === "requested" ? "pending-text" : "approved-text") + "'><strong>" + (details.vacation.status === "requested" ? "Urlaub beantragt" : "Urlaub genehmigt") + "</strong> · " + n(details.vacation.requested_days).toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " Tage</li>" : ""
  const sickness = details.sick
    ? "<li class='calendar-sick-text'><strong>Krank gemeldet</strong> · ganzer Arbeitstag</li>"
    : "<li class='calendar-sick-clear'><strong>Nicht krank gemeldet</strong> · kein Krankheitstag gespeichert</li>"
  const detailList = workRows + appointmentRows + vacation + sickness || "<li class='muted'>Keine Aktivitäten an diesem Tag.</li>"
  const chief = s.profile.role === "chief", employeeMayReportSick = weekday(s.selected) || Boolean(details.vacation) || Boolean(HOLIDAYS[s.selected])
  const sicknessCalendarAction = chief
    ? (details.sick ? "<button class='danger-outline' data-action='remove-sick'>Krankheitstag entfernen</button>" : "<button class='quiet' data-action='mark-sick'>Krankheitstag hinzufügen</button>")
    : (!details.sick && employeeMayReportSick ? "<button class='quiet' data-action='mark-sick'>Als krank markieren</button>" : "")
  const vacationCalendarAction = chief && details.vacation ? "<button class='danger-outline' data-action='remove-vacation'>Urlaubszeitraum entfernen</button>" : ""
  return "<main class='page'><section class='hero-small calendar-hero'><div><p class='eyebrow'>PERSÖNLICHER KALENDER</p><h1>" + (chief ? "Kalender von " + h(employeeName(s.employeeId)) : "Mein Kalender") + "</h1><p class='muted'>Auf einen Tag tippen, um Arbeitszeiten, Kundentermine, Urlaub und Krankheit zu sehen.</p></div><div class='calendar-actions'><button class='primary' data-action='open-vacation-form'>Urlaub beantragen</button><button class='quiet' data-action='open-appointment-form'>Kundentermin vormerken</button>" + sicknessCalendarAction + vacationCalendarAction + "</div></section>" + calendarForm() + "<section class='calendar-card'><div class='calendar-toolbar'><button class='icon-button' data-action='previous-month' aria-label='Vorheriger Monat'>‹</button><h2>" + monthLabel(s.calendarYear, s.calendarMonth) + "</h2><button class='icon-button' data-action='next-month' aria-label='Nächster Monat'>›</button></div><div class='calendar-weekdays'><span>Mo</span><span>Di</span><span>Mi</span><span>Do</span><span>Fr</span><span>Sa</span><span>So</span></div><div class='calendar-grid'>" + cells.join("") + "</div><p class='calendar-key'><span><i class='work-marker'></i> Arbeitszeit</span><span><i class='appointment-marker'></i> Kundentermin</span><span><i class='vacation-marker requested'></i> Urlaub beantragt</span><span><i class='vacation-marker approved'></i> Urlaub genehmigt</span><span><i class='sick-marker'></i> Krank gemeldet</span></p></section><section class='day-details'><h2>Aktivitäten am " + dayText(s.selected) + "</h2><ul>" + detailList + "</ul></section></main>"
}
function overlaps(leftStart, leftEnd, rightStart, rightEnd) { return String(leftStart) <= String(rightEnd) && String(leftEnd) >= String(rightStart) }
function vacationMessage(message) {
  const body = message.body || {}, request = s.vacationRequests.find((row) => row.id === body.request_id)
  if (!request) return "<p class='muted'>Die zugehörigen Daten sind nicht mehr verfügbar.</p>"
  const otherVacation = s.vacationRequests.filter((row) => row.id !== request.id && row.employee_id !== request.employee_id && row.status !== "rejected" && overlaps(request.start_date, request.end_date, row.start_date, row.end_date))
  const appointments = s.appointments.filter((row) => inRange(row.event_date, request.start_date, request.end_date))
  const others = otherVacation.length ? otherVacation.map((row) => h(employeeName(row.employee_id)) + " (" + dayText(row.start_date) + "–" + dayText(row.end_date) + ")").join(", ") : "keine"
  const dates = appointments.length ? appointments.map((row) => h(employeeName(row.employee_id)) + ": " + h(row.title) + " am " + dayText(row.event_date)).join("; ") : "keine"
  const controls = s.profile.role === "chief" && request.status === "requested" ? "<div class='message-controls'><button class='primary' data-action='decide-vacation' data-id='" + h(request.id) + "' data-decision='approved'>Genehmigen</button><button class='danger-outline' data-action='decide-vacation' data-id='" + h(request.id) + "' data-decision='rejected'>Ablehnen</button></div>" : "<p><strong>Status:</strong> " + (request.status === "approved" ? "genehmigt" : request.status === "rejected" ? "abgelehnt" : "offen") + "</p>"
  return "<div class='message-facts'><p><strong>Mitarbeiter:</strong> " + h(employeeName(request.employee_id)) + "</p><p><strong>Zeitraum:</strong> " + dayText(request.start_date) + " bis " + dayText(request.end_date) + " (" + n(request.requested_days).toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " Arbeitstage)</p><p><strong>Resturlaub:</strong> " + remainingVacationDays(request.employee_id).toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " Tage</p><p><strong>Überschneidende Urlaube:</strong> " + others + "</p><p><strong>Vorgemerkte Termine im Zeitraum:</strong> " + dates + "</p></div>" + controls
}
function mailbox() {
  const messages = s.messages.filter((row) => s.mailboxFolder === "all" || (s.mailboxFolder === "read" ? Boolean(row.read_at) : !row.read_at))
  const folderName = s.mailboxFolder === "all" ? "Alle" : s.mailboxFolder === "read" ? "Gelesen" : "Ungelesen"
  const folders = [["all", "Alle", s.messages.length], ["unread", "Ungelesen", s.messages.filter((row) => !row.read_at).length], ["read", "Gelesen", s.messages.filter((row) => row.read_at).length]]
  const list = messages.length ? messages.map((row) => {
    const body = row.body || {}
    const content = row.message_type === "vacation_request" ? vacationMessage(row) : row.message_type === "password_help" ? "<p>" + h(body.username || employeeName(row.sender_id)) + " hat Hilfe beim Passwort angefordert. Bitte das Passwort im Chefbetrieb zurücksetzen und dem Mitarbeiter sicher mitteilen.</p>" : row.message_type === "vacation_decision" ? "<p>Dein Urlaubsantrag für " + dayText(body.start_date) + " bis " + dayText(body.end_date) + " wurde " + (body.status === "approved" ? "genehmigt" : "abgelehnt") + ".</p>" : "<p class='muted'>Keine weiteren Angaben.</p>"
    const unread = !row.read_at
    return "<article class='message-card " + (unread ? "unread" : "") + "'><div class='message-head'><div><p class='eyebrow'>" + h(row.message_type === "password_help" ? "PASSWORT-HILFE" : row.message_type === "vacation_request" ? "URLAUBSANTRAG" : row.message_type === "vacation_decision" ? "URLAUBSENTSCHEIDUNG" : "NACHRICHT") + "</p><h2>" + h(row.title) + "</h2><small>" + new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.created_at)) + "</small></div>" + (unread ? "<button class='quiet' data-action='open-message' data-id='" + h(row.id) + "'>Nachricht öffnen</button>" : "") + "</div>" + (unread ? "<p class='muted'>Öffne die Nachricht, um die Details zu sehen. Sie wird dabei automatisch als gelesen abgelegt.</p>" : content) + "</article>"
  }).join("") : "<div class='empty-state'>Keine Nachrichten im Ordner „" + folderName + "“.</div>"
  return "<main class='page'><section class='hero-small'><p class='eyebrow'>INTERNES POSTFACH</p><h1>Nachrichten</h1><p class='muted'>Dieses Postfach ist nur innerhalb der App sichtbar und nur für das angemeldete Konto zugänglich.</p></section><nav class='mailbox-folders' aria-label='Postfachordner'>" + folders.map((folder) => "<button class='" + (s.mailboxFolder === folder[0] ? "active" : "") + "' data-action='choose-mailbox-folder' data-folder='" + folder[0] + "'>" + folder[1] + " (" + folder[2] + ")</button>").join("") + "</nav><section class='message-list'>" + list + "</section></main>"
}
function render() {
  if (s.loading) { root.innerHTML = "<div class='loading-card'><div class='loading-mark'>AZ</div><p>Arbeitszeit wird vorbereitet …</p></div>"; return }
  if (!s.session) { login(); return }
  if (!canUse(s.view)) s.view = firstAllowedView()
  const page = s.view === "planner" ? planner() : s.view === "customers" ? customers() : s.view === "orders" ? orders() : s.view === "calendar" ? calendar() : s.view === "mailbox" ? mailbox() : settings()
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
async function setSick(value) {
  const status = currentStatus(), existing = s.days.get(s.selected)
  if (!value && s.profile.role !== "chief") throw new Error("Krankheitstage können nur vom Chef entfernt werden.")
  if (!weekday(s.selected) && !status.vacation && !status.name) throw new Error("Krankheitstage können an Arbeits-, Urlaubs- und Feiertagen erfasst werden.")
  if (value && status.sick) { tell("Der Tag ist bereits als krank markiert."); return }
  if (!value && !existing) { tell("Für diesen Tag ist keine Krankmeldung vorhanden."); return }
  const saved = await data(db.from("work_days").upsert({ employee_id: s.employeeId, work_date: s.selected, sick: value }, { onConflict: "employee_id,work_date" }).select().single())
  s.dayStatusOverrides.set(saved.employee_id + ":" + saved.work_date, saved)
  s.days.set(saved.work_date, saved)
  const message = value
    ? (s.profile.role === "chief" ? "Der Krankheitstag wurde gespeichert und sofort angezeigt." : "Deine Krankmeldung wurde gespeichert und sofort angezeigt.")
    : "Die Krankmeldung wurde entfernt und der Tag wird wieder als nicht krank angezeigt."
  tell(message)
  // Die sichtbare Rückmeldung darf nicht von einem späteren Gesamtabgleich abhängen.
  // Der Abgleich hält parallel geänderte Daten anderer Geräte anschließend aktuell.
  try { await loadData(); render() } catch (_) {}
}
async function markSick() { await setSick(1) }
async function removeSick() { await setSick(0) }
async function removeVacation() {
  if (s.profile.role !== "chief") throw new Error("Urlaubszeiträume können nur vom Chef entfernt werden.")
  const request = s.vacationRequests.find((row) => row.employee_id === s.employeeId && row.status !== "rejected" && inRange(s.selected, row.start_date, row.end_date))
  if (!request) { tell("Für diesen Tag ist kein Urlaubszeitraum vorhanden."); return }
  await data(db.from("vacation_requests").update({ status: "rejected", decided_by: s.profile.id, decided_at: new Date().toISOString(), decision_note: "Vom Chef entfernt" }).eq("id", request.id).select().single())
  await loadData()
  render()
  tell("Der Urlaubszeitraum wurde entfernt.")
}
async function deleteWorkOrder(orderId) {
  await data(db.from("time_entries").delete().eq("work_order_id", orderId))
  await deleteSavedRecord("work_orders", orderId)
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
    else if (form.dataset.form === "order") {
      const found = await customer(form.customerName.value), hasEndTime = Boolean(form.endTime.value), hasHours = String(form.executedHours.value || "").trim() !== ""
      if (!hasEndTime && !hasHours) throw new Error("Bitte entweder das Arbeitsende oder die ausgeführten Stunden eintragen.")
      const calculationMode = hasEndTime ? "end_time" : "hours"
      const timing = calc({ start_time: form.startTime.value || "07:30", end_time: form.endTime.value || "", pause_hours: Math.max(0, n(form.pauseHours.value)), executed_hours: hasHours ? Math.max(0, n(form.executedHours.value)) : 0, calculation_mode: calculationMode })
      await data(db.from("work_orders").insert({ id: guid(), employee_id: s.employeeId, work_date: form.workDate.value, customer_id: found.id, customer_name: found.name, title: form.title.value.trim(), notes: form.notes.value.trim(), start_time: timing.start_time, end_time: timing.end_time, pause_hours: timing.pause_hours, executed_hours: timing.executed_hours, calculation_mode: timing.calculation_mode }).select().single())
      await loadData(); tell("Arbeitsschein angelegt und in die Zeiterfassung übernommen.")
    }
    else if (form.dataset.form === "material") { if (!form.materialId.value) throw new Error("Bitte ein Material auswählen."); s.items.push(await data(db.from("work_order_items").insert({ id: guid(), work_order_id: form.dataset.orderId, material_id: form.materialId.value, position_name: "Material", quantity: Math.max(0, n(form.quantity.value)), unit_price: 0 }).select().single())); render() }
    else if (form.dataset.form === "new-employee") { await manage({ action: "create", username: form.username.value, password: form.password.value }); tell("Mitarbeiterkonto angelegt.") }
    else if (form.dataset.form === "employee-update") { await manage({ action: "update", employeeId: form.dataset.id, username: form.username.value, password: form.password.value, vacationAllowance: form.vacationAllowance.value, menuPermissions: { planner: form.planner.checked, customers: form.customers.checked, orders: form.orders.checked, calendar: form.calendar.checked } }); tell("Mitarbeiter gespeichert.") }
    else if (form.dataset.form === "self-account") { await manage({ action: "self-update", username: form.username.value, password: form.password.value, vacationAllowance: form.vacationAllowance?.value }); await loadProfile(); await loadEmployees(); tell("Dein Benutzerkonto wurde gespeichert.") }
    else if (form.dataset.form === "customer-field") {
      const row = s.customers.find((item) => item.id === form.dataset.id), fieldName = form.fieldName.value.trim(), fieldValue = form.fieldValue.value.trim()
      if (!row) throw new Error("Der Kunde wurde nicht gefunden.")
      if (!fieldName || !fieldValue) throw new Error("Bitte Feldbezeichnung und Wert eintragen.")
      if (fieldName.length > 80 || fieldValue.length > 300) throw new Error("Die Feldbezeichnung darf maximal 80, der Wert maximal 300 Zeichen enthalten.")
      Object.assign(row, await data(db.from("customers").update({ custom_fields: { ...(row.custom_fields || {}), [fieldName]: fieldValue } }).eq("id", row.id).select().single()))
      tell("Kundendaten gespeichert.")
    }
    else if (form.dataset.form === "new-material") { const name = form.name.value.trim(); if (!name) throw new Error("Bitte eine Materialbezeichnung eingeben."); await data(db.from("materials").insert({ name, unit_price: Math.max(0, n(form.unitPrice.value)) })); await loadData(); tell("Material angelegt.") }
    else if (form.dataset.form === "material-update") { const name = form.name.value.trim(); if (!name) throw new Error("Bitte eine Materialbezeichnung eingeben."); await data(db.from("materials").update({ name, unit_price: Math.max(0, n(form.unitPrice.value)) }).eq("id", form.dataset.id)); await loadData(); tell("Material gespeichert.") }
    else if (form.dataset.form === "vacation-request") {
      if (form.endDate.value < form.startDate.value) throw new Error("Das Enddatum muss am oder nach dem Startdatum liegen.")
      const requestedDays = vacationDays(form.startDate.value, form.endDate.value)
      if (!requestedDays) throw new Error("Der Antrag muss mindestens einen Arbeitstag enthalten.")
      if (requestedDays > remainingVacationDays(s.profile.id)) throw new Error("Dafür stehen nicht genügend Resturlaubstage zur Verfügung.")
      await data(db.from("vacation_requests").insert({ employee_id: s.profile.id, start_date: form.startDate.value, end_date: form.endDate.value, requested_days: requestedDays, status: "requested", decision_note: form.note.value.trim() }))
      s.calendarForm = ""; await loadData(); tell(s.profile.role === "chief" ? "Dein Urlaub wurde automatisch genehmigt. Die Bestätigung liegt in deinem Postfach." : "Urlaubsantrag gesendet. Die Tage sind vorläufig im Kalender markiert.")
    }
    else if (form.dataset.form === "appointment") {
      const name = form.customerName.value.trim(); let found = null
      if (name) found = await customer(name)
      await data(db.from("appointments").insert({ employee_id: s.employeeId, event_date: form.eventDate.value, customer_id: found?.id || null, customer_name: found?.name || "", title: form.title.value.trim(), notes: form.notes.value.trim() }))
      s.calendarForm = ""; await loadData(); tell("Kundentermin vorgemerkt.")
    }
  } catch (error) { tell(error.message || "Aktion fehlgeschlagen.", true) }
})
root.addEventListener("change", async (event) => {
  const el = event.target
  try {
    if (el.id === "employee-picker") await pickEmployee(el.value)
    else if (el.id === "date-picker") { s.selected = el.value; render() }
    else if (el.id === "order-work-date") { const start = root.querySelector("#order-start-time"); if (start) start.value = orderStartFor(el.value) }
    else if (el.dataset.entryField) await editEntry(el.dataset.id, el.dataset.entryField, el.value)
    else if (el.dataset.entryCustom) await editEntry(el.dataset.id, "custom", [el.dataset.entryCustom, el.value])
    else if (el.dataset.itemField) { const row = s.items.find((item) => item.id === el.dataset.id); row[el.dataset.itemField] = el.dataset.itemField === "position_name" ? el.value.trim() : Math.max(0, n(el.value)); Object.assign(row, await data(db.from("work_order_items").update({ [el.dataset.itemField]: row[el.dataset.itemField] }).eq("id", row.id).select().single())); render() }
  } catch (error) { tell(error.message || "Änderung konnte nicht gespeichert werden.", true) }
})
root.addEventListener("click", async (event) => {
  const button = event.target.closest("button"); if (!button) return
  try {
    if (button.dataset.view) { if (!canUse(button.dataset.view)) throw new Error("Dieses Menü wurde vom Chef nicht freigegeben."); s.view = button.dataset.view; await loadData(); render(); return }
    if (button.dataset.action === "forgot-password") {
      const username = window.prompt("Bitte deinen Benutzernamen eingeben. Der Chef erhält dann eine vertrauliche Nachricht.")
      if (username === null) return
      const result = await db.functions.invoke("request-password-help", { body: { username } })
      if (result.error) throw result.error
      tell(result.data?.message || "Wenn ein Konto gefunden wurde, ist der Chef informiert worden.")
      return
    }
    if (button.dataset.action === "logout") { if (s.customerChannel) { await db.removeChannel(s.customerChannel); s.customerChannel = null } if (s.teamChannel) { await db.removeChannel(s.teamChannel); s.teamChannel = null } await db.auth.signOut(); s.session = null; s.profile = null; s.employeeId = null; render(); return }
    if (button.dataset.action === "choose-date") { s.selected = button.dataset.date; render(); return }
    if (button.dataset.action === "previous-date") { s.selected = nextWorkday(-1); render(); return }
    if (button.dataset.action === "next-date") { s.selected = nextWorkday(1); render(); return }
    if (button.dataset.action === "calendar-day") { s.selected = button.dataset.date; const current = date(s.selected); s.calendarMonth = current.getMonth(); s.calendarYear = current.getFullYear(); render(); return }
    if (button.dataset.action === "previous-month") { const current = new Date(s.calendarYear, s.calendarMonth - 1, 1); s.calendarMonth = current.getMonth(); s.calendarYear = current.getFullYear(); render(); return }
    if (button.dataset.action === "next-month") { const current = new Date(s.calendarYear, s.calendarMonth + 1, 1); s.calendarMonth = current.getMonth(); s.calendarYear = current.getFullYear(); render(); return }
    if (button.dataset.action === "open-vacation-form") { s.calendarForm = "vacation"; render(); return }
    if (button.dataset.action === "open-appointment-form") { s.calendarForm = "appointment"; render(); return }
    if (button.dataset.action === "close-calendar-form") { s.calendarForm = ""; render(); return }
    if (button.dataset.action === "open-person-statistics") { await pickEmployee(button.dataset.id); s.view = "settings"; render(); return }
    if (button.dataset.action === "add-entry") await addEntry()
    if (button.dataset.action === "mark-sick") await markSick()
    if (button.dataset.action === "remove-sick") await removeSick()
    if (button.dataset.action === "remove-vacation" && window.confirm("Diesen gesamten Urlaubszeitraum wirklich entfernen?")) await removeVacation()
    if (button.dataset.action === "download-pdf") { downloadPdf(); return }
    if (button.dataset.action === "delete-entry" && window.confirm("Diese Kundenzeile wirklich löschen?")) { await deleteSavedRecord("time_entries", button.dataset.id); await loadData(); tell("Zeiterfassungszeile gelöscht.") }
    if (button.dataset.action === "open-order") { if (!canUse("orders")) throw new Error("Das Menü Arbeitsscheine wurde vom Chef nicht freigegeben."); s.view = "orders"; render(); const field = root.querySelector("[data-form='order'] [name='customerName']"); if (field) { field.value = button.dataset.customer || ""; field.focus() } }
    if (button.dataset.action === "delete-customer") { const row = s.customers.find((item) => item.id === button.dataset.id); if (row && window.confirm("Kunde „" + row.name + "“ wirklich löschen? Bereits erfasste Zeiten bleiben erhalten.")) { await deleteSavedRecord("customers", row.id); await loadData(); tell("Kunde gelöscht.") } }
    if (button.dataset.action === "delete-customer-field") { const row = s.customers.find((item) => item.id === button.dataset.id); if (row && window.confirm("Das zusätzliche Kundendatenfeld „" + button.dataset.key + "“ wirklich entfernen?")) { const fields = { ...(row.custom_fields || {}) }; delete fields[button.dataset.key]; Object.assign(row, await data(db.from("customers").update({ custom_fields: fields }).eq("id", row.id).select().single())); tell("Kundendatenfeld entfernt.") } }
    if (button.dataset.action === "delete-item") { await data(db.from("work_order_items").delete().eq("id", button.dataset.id)); s.items = s.items.filter((row) => row.id !== button.dataset.id); render() }
    if (button.dataset.action === "delete-order" && window.confirm("Diesen Arbeitsschein mit allen Positionen und dem zugehörigen Zeiterfassungseintrag löschen?")) { await deleteWorkOrder(button.dataset.id); await loadData(); tell("Arbeitsschein gelöscht.") }
    if (button.dataset.action === "delete-column" && window.confirm("Zusatzspalte entfernen? Die bisherigen Werte bleiben in den Einträgen gespeichert.")) { await data(db.from("custom_columns").delete().eq("id", button.dataset.id)); s.columns = s.columns.filter((row) => row.id !== button.dataset.id); render() }
    if (button.dataset.action === "delete-material" && window.confirm("Material „" + button.dataset.name + "“ aus dem Katalog entfernen? Bereits verwendete Preise bleiben in vorhandenen Arbeitsscheinen erhalten.")) { await data(db.from("materials").update({ active: false }).eq("id", button.dataset.id)); await loadData(); tell("Material aus dem Katalog entfernt.") }
    if (button.dataset.action === "delete-appointment" && window.confirm("Diesen Kundentermin wirklich entfernen?")) { await data(db.from("appointments").delete().eq("id", button.dataset.id)); await loadData(); tell("Kundentermin entfernt.") }
    if (button.dataset.action === "choose-mailbox-folder") { s.mailboxFolder = button.dataset.folder; render(); return }
    if (button.dataset.action === "open-message") { const saved = await data(db.from("mailbox_messages").update({ read_at: new Date().toISOString() }).eq("id", button.dataset.id).select().single()); const index = s.messages.findIndex((row) => row.id === saved.id); if (index >= 0) s.messages[index] = saved; s.mailboxFolder = "read"; render(); return }
    if (button.dataset.action === "decide-vacation") {
      const requested = s.vacationRequests.find((row) => row.id === button.dataset.id); if (!requested) throw new Error("Der Urlaubsantrag wurde nicht gefunden.")
      const approved = button.dataset.decision === "approved", noteText = window.prompt(approved ? "Optionaler Hinweis zur Genehmigung:" : "Optionaler Grund für die Ablehnung:", "")
      if (noteText === null) return
      await data(db.from("vacation_requests").update({ status: button.dataset.decision, decision_note: noteText.trim(), decided_by: s.profile.id, decided_at: new Date().toISOString() }).eq("id", requested.id))
      await loadData(); tell(approved ? "Urlaubsantrag genehmigt und Mitarbeiter informiert." : "Urlaubsantrag abgelehnt und Mitarbeiter informiert.")
      return
    }
    if (button.dataset.action === "delete-employee" && window.confirm("Mitarbeiter „" + button.dataset.name + "“ samt seinen Daten wirklich löschen?")) { await manage({ action: "delete", employeeId: button.dataset.id }); if (s.employeeId === button.dataset.id) { s.employeeId = s.profile.id; await loadData() } tell("Mitarbeiter gelöscht.") }
  } catch (error) { tell(error.message || "Aktion fehlgeschlagen.", true) }
})
db.auth.onAuthStateChange((_event, session) => { if (session?.access_token !== s.session?.access_token) { s.session = session; s.profile = null; s.employeeId = null; boot() } })
boot()

