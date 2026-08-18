const STORAGE_KEY = "arbeitszeit-2026-local-v3";
const YEAR = 2026;
const app = document.querySelector("#app");
const restoreInput = document.querySelector("#restore-file");

const HOLIDAYS = new Map([
  ["2026-01-01", "Neujahr"],
  ["2026-04-03", "Karfreitag"],
  ["2026-04-06", "Ostermontag"],
  ["2026-05-01", "Tag der Arbeit"],
  ["2026-05-14", "Christi Himmelfahrt"],
  ["2026-05-25", "Pfingstmontag"],
  ["2026-06-04", "Fronleichnam"],
  ["2026-10-03", "Tag der Deutschen Einheit"],
  ["2026-11-01", "Allerheiligen"],
  ["2026-12-25", "1. Weihnachtstag"],
  ["2026-12-26", "2. Weihnachtstag"],
]);

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

let state;
let selectedMonth = 0;
let selectedDate = "2026-01-02";
let activeView = "planner";
let deferredInstallPrompt = null;
let activeModal = null;
let toastMessage = "";
let toastTimer;

function makeEmptyState() {
  return {
    version: 1,
    year: YEAR,
    customers: [],
    days: {},
    customColumns: [],
    settings: { vacationAllowance: 0 },
  };
}

function normalizeState(raw) {
  const base = makeEmptyState();
  const source = raw && typeof raw === "object" ? raw : {};
  base.customers = [...new Set((source.customers || []).map(cleanText).filter((name) => name && !isSystemLabel(name)))]
    .sort((a, b) => a.localeCompare(b, "de"));
  base.settings.vacationAllowance = numberOrZero(source.settings?.vacationAllowance);
  base.customColumns = [...new Set((source.customColumns || []).map(cleanText).filter(Boolean))];
  const days = source.days || {};
  Object.entries(days).forEach(([date, day]) => {
    if (!/^2026-\d{2}-\d{2}$/.test(date)) return;
    base.days[date] = {
      vacation: Math.abs(numberOrZero(day.vacation)),
      sick: Math.abs(numberOrZero(day.sick)),
      jobs: (day.jobs || []).map((job) => normalizeJob(job)).filter((job) => !isSystemLabel(job.customer)),
    };
  });
  return base;
}

function normalizeJob(job = {}) {
  const start = validTime(job.start) ? job.start : "07:30";
  const output = {
    id: job.id || crypto.randomUUID(),
    customer: cleanText(job.customer),
    start,
    end: validTime(job.end) ? job.end : start,
    pause: Math.max(0, numberOrZero(job.pause)),
    hours: Math.max(0, numberOrZero(job.hours)),
    mode: job.mode === "end" ? "end" : "hours",
    customFields: job.customFields && typeof job.customFields === "object" ? job.customFields : {},
  };
  recalculateJob(output, output.mode);
  return output;
}

function isSystemLabel(name) {
  const text = cleanText(name);
  return [...HOLIDAYS.values()].some((holiday) => holiday.localeCompare(text, "de", { sensitivity: "accent" }) === 0) ||
    /^urlaubstag\b/i.test(text) || /^krankheitstag\b/i.test(text);
}

async function loadApp() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      state = normalizeState(JSON.parse(saved));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  if (!state) {
    try {
      const response = await fetch("seed-data.json", { cache: "no-store" });
      state = normalizeState(await response.json());
    } catch {
      state = makeEmptyState();
    }
    saveState();
  }
  const firstWorkday = allWorkdays().find((date) => !HOLIDAYS.has(date));
  selectedDate = state.days[selectedDate] ? selectedDate : firstWorkday;
  selectedMonth = Number(selectedDate.slice(5, 7)) - 1;
  render();
  registerServiceWorker();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  const summary = yearlySummary();
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">AZ</div>
        <div>
          <h1>Arbeitszeit 2026</h1>
          <p>Offline, mobil und immer bei dir</p>
        </div>
      </div>
      <button class="icon-button" data-action="open-install" aria-label="App installieren oder Hilfe öffnen">⌄</button>
    </header>
    <section class="summary-grid" aria-label="Jahresübersicht">
      ${metric("Geleistet", formatHours(summary.actual), "")}
      ${metric("Sollstunden", formatHours(summary.target), "")}
      ${metric("Überstunden", formatHours(summary.overtime), summary.overtime)}
      ${metric("Urlaub übrig", `${formatNumber(summary.vacationRemaining)} Tage`, "")}
    </section>
    <nav class="navigation" aria-label="App-Bereiche">
      ${navButton("planner", "Erfassung")}
      ${navButton("customers", "Kunden")}
      ${navButton("settings", "Mehr")}
    </nav>
    ${renderView()}
    ${renderModal()}
    ${toastMessage ? `<div class="toast">${escapeHtml(toastMessage)}</div>` : ""}
    <datalist id="customer-options">${state.customers.map((name) => `<option value="${escapeAttribute(name)}"></option>`).join("")}</datalist>
  `;
}

function metric(label, value, number) {
  const modifier = number > 0 ? "positive" : number < 0 ? "negative" : "";
  return `<div class="metric"><span>${label}</span><strong class="${modifier}">${value}</strong></div>`;
}

function navButton(view, label) {
  return `<button class="nav-tab ${activeView === view ? "active" : ""}" data-action="set-view" data-view="${view}">${label}</button>`;
}

function renderView() {
  if (activeView === "customers") return renderCustomers();
  if (activeView === "settings") return renderSettings();
  return renderPlanner();
}

function renderPlanner() {
  const dates = workdaysInMonth(selectedMonth);
  const day = readDay(selectedDate);
  const holiday = HOLIDAYS.get(selectedDate);
  const summary = daySummary(selectedDate);
  const isAbsent = day.vacation > 0 || day.sick > 0;

  return `
    <section class="panel">
      <div class="planner-toolbar">
        <select class="month-select" data-field="month" aria-label="Monat wählen">
          ${MONTH_NAMES.map((name, index) => `<option value="${index}" ${index === selectedMonth ? "selected" : ""}>${name} 2026</option>`).join("")}
        </select>
        <button class="button secondary" data-action="add-job" ${holiday || isAbsent ? "disabled" : ""}>+ Zeile</button>
      </div>
      <div class="day-strip" aria-label="Arbeitstage des Monats">
        ${dates.map(renderDayButton).join("")}
      </div>
    </section>
    <section class="panel day-workspace">
      <div class="day-heading">
        <div>
          <h2 class="date-title">${formatDate(selectedDate)}</h2>
          <p>${holiday || (isAbsent ? absenceLabel(day) : "Arbeitszeit und Kunden erfassen")}</p>
        </div>
        <div class="day-total">
          <span>${summary.target === null ? "Heute" : "Überstunden"}</span>
          <strong class="${summary.overtime > 0 ? "positive" : summary.overtime < 0 ? "negative" : ""}">${summary.target === null ? formatHours(summary.actual) : formatHours(summary.overtime)}</strong>
        </div>
      </div>
      ${holiday ? renderHoliday(holiday) : renderDayEditor(day, isAbsent)}
    </section>
  `;
}

function renderDayButton(date) {
  const current = readDay(date);
  const hasWork = current.jobs.some((job) => job.customer || job.hours || job.pause);
  const selected = date === selectedDate;
  const holiday = HOLIDAYS.has(date);
  const dayNumber = Number(date.slice(-2));
  const weekday = dateObject(date).toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "");
  return `
    <button class="day-button ${selected ? "selected" : ""} ${holiday ? "holiday" : ""} ${hasWork ? "has-work" : ""}"
      data-action="select-day" data-date="${date}">
      <small>${weekday}</small><strong>${dayNumber}</strong>
    </button>
  `;
}

function renderHoliday(name) {
  return `<div class="holiday-note"><strong>${escapeHtml(name)}</strong><br>Feiertag in NRW – Kundeneinträge und Arbeitszeiten sind an diesem Datum gesperrt.</div>`;
}

function renderDayEditor(day, isAbsent) {
  return `
    <div class="day-controls">
      <label class="switch"><input type="checkbox" data-field="vacation" ${day.vacation > 0 ? "checked" : ""}> Urlaubstag</label>
      <label class="switch"><input type="checkbox" data-field="sick" ${day.sick > 0 ? "checked" : ""}> Krankheitstag</label>
    </div>
    ${isAbsent
      ? `<div class="absence-note">${absenceLabel(day)}. Die Arbeitszeilen sind nach der Regel der Excel-Vorlage gesperrt.</div>`
      : `
        <div class="jobs">
          ${day.jobs.length ? day.jobs.map((job, index) => renderJob(job, index)).join("") : `<div class="empty-state">Noch kein Kunde eingetragen. Mit „Zeile“ fügst du einen Kunden für diesen Arbeitstag hinzu.</div>`}
        </div>
        <div class="job-actions"><button class="button primary" data-action="add-job">+ Kundenzeile hinzufügen</button></div>
      `}
  `;
}

function renderJob(job, index) {
  const customFields = state.customColumns.length
    ? `<div class="custom-fields">${state.customColumns.map((column) => `
        <div class="custom-field">
          <label>${escapeHtml(column)}</label>
          <input data-field="custom" data-id="${job.id}" data-column="${escapeAttribute(column)}" value="${escapeAttribute(job.customFields[column] || "")}" placeholder="Zusatzwert">
        </div>
      `).join("")}</div>`
    : "";
  return `
    <article class="job-card">
      <div class="job-card-header">
        <strong>${index + 1}. Kundenzeile</strong>
        <button class="text-action" data-action="remove-job" data-id="${job.id}">Entfernen</button>
      </div>
      <div class="field-grid">
        <div class="field customer-field">
          <label>Kunde</label>
          <input list="customer-options" data-field="customer" data-id="${job.id}" value="${escapeAttribute(job.customer)}" placeholder="Kunde eingeben">
        </div>
        <div class="field">
          <label>Beginn</label>
          <input type="time" data-field="start" data-id="${job.id}" value="${job.start}">
        </div>
        <div class="field">
          <label>Pause (h)</label>
          <input type="number" inputmode="decimal" min="0" step="0.25" data-field="pause" data-id="${job.id}" value="${inputNumber(job.pause)}">
        </div>
        <div class="field">
          <label>Stunden</label>
          <input type="number" inputmode="decimal" min="0" step="0.25" data-field="hours" data-id="${job.id}" value="${inputNumber(job.hours)}">
        </div>
        <div class="field">
          <label>Ende</label>
          <input type="time" data-field="end" data-id="${job.id}" value="${job.end}">
        </div>
      </div>
      <div class="custom-fields">
        <div class="custom-field"><label>Ausgeführt</label><div class="field-value">${formatHours(job.hours)}</div></div>
        <div class="custom-field"><label>Arbeitszeit</label><div class="field-value">${formatTime(job.start)} – ${formatTime(job.end)}</div></div>
        <div class="custom-field"><label>Berechnung</label><div class="field-value">${job.mode === "end" ? "Endzeit eingegeben" : "Stunden eingegeben"}</div></div>
      </div>
      ${customFields}
    </article>
  `;
}

function renderCustomers() {
  const filter = state.customers.map((name) => ({ name, hours: customerHours(name) }));
  return `
    <section class="panel customer-layout">
      <div class="section-heading">
        <div><h2>Kundenliste</h2><p>Alphabetisch · Jahresstunden automatisch</p></div>
        <span class="pill">${state.customers.length} Kunden</span>
      </div>
      <div class="customer-add">
        <input id="new-customer" list="customer-options" placeholder="Kundenname hinzufügen">
        <button class="button primary" data-action="add-customer">Hinzufügen</button>
      </div>
      <div class="customer-list">
        ${filter.map((entry) => `
          <div class="customer-row">
            <div class="customer-name">${escapeHtml(entry.name)}</div>
            <div class="customer-hours">${formatHours(entry.hours)}</div>
            <button class="customer-open" data-action="open-customer" data-customer="${escapeAttribute(entry.name)}">Ansehen</button>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSettings() {
  return `
    <section class="panel settings-layout">
      <div class="section-heading">
        <div><h2>Mehr Möglichkeiten</h2><p>Die Kernlogik bleibt geschützt. Ergänzungen sind jederzeit möglich.</p></div>
      </div>
      <div class="settings-block">
        <h3>Urlaubsanspruch</h3>
        <p>Wird für die verbleibenden Urlaubstage verwendet.</p>
        <div class="settings-row">
          <input id="vacation-allowance" type="number" inputmode="decimal" min="0" step="0.5" value="${inputNumber(state.settings.vacationAllowance)}">
          <button class="button secondary" data-action="save-vacation">Speichern</button>
        </div>
      </div>
      <div class="settings-block">
        <h3>Zusatzspalten</h3>
        <p>Neue Felder erscheinen bei jeder Kundenzeile. Datum, Kunde, Beginn, Pause, Stunden und Ende bleiben fest geschützt.</p>
        <div class="settings-row"><button class="button secondary" data-action="add-column">+ Zusatzspalte</button></div>
        <div class="custom-column-pills">${state.customColumns.length ? state.customColumns.map((column) => `<span class="pill">${escapeHtml(column)}</span>`).join("") : `<span class="pill">Noch keine Zusatzspalte</span>`}</div>
      </div>
      <div class="settings-block">
        <h3>Sicherung</h3>
        <p>Alle App-Daten bleiben lokal auf diesem Gerät. Exportiere regelmäßig eine Sicherung, bevor du den Browser zurücksetzt oder das Gerät wechselst.</p>
        <div class="settings-row">
          <button class="button secondary" data-action="export-data">Sicherung exportieren</button>
          <button class="button subtle" data-action="restore-data">Sicherung importieren</button>
        </div>
      </div>
      <div class="install-note">
        <strong>App installieren:</strong> Android: im Browser „App installieren“. iPhone: in Safari auf Teilen und „Zum Home-Bildschirm“.
      </div>
    </section>
  `;
}

function renderModal() {
  if (!activeModal) return "";
  if (activeModal === "install") {
    const canInstall = Boolean(deferredInstallPrompt);
    return `
      <div class="modal-backdrop">
        <section class="modal" role="dialog" aria-modal="true" aria-label="App installieren">
          <h2>Arbeitszeit als App installieren</h2>
          <p>Android: ${canInstall ? "Mit dem Button wird die App direkt installiert." : "Öffne das Browser-Menü und wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“."}</p>
          <p>iPhone: In Safari unten auf <strong>Teilen</strong> tippen und <strong>„Zum Home-Bildschirm“</strong> wählen.</p>
          <div class="modal-actions">
            ${canInstall ? `<button class="button primary" data-action="install-now">Jetzt installieren</button>` : ""}
            <button class="button subtle" data-action="close-modal">Schließen</button>
          </div>
        </section>
      </div>
    `;
  }
  return "";
}

function readDay(date) {
  return state.days[date] || { jobs: [], vacation: 0, sick: 0 };
}

function ensureDay(date) {
  if (!state.days[date]) state.days[date] = { jobs: [], vacation: 0, sick: 0 };
  return state.days[date];
}

function compactDay(date) {
  const day = state.days[date];
  if (day && !day.jobs.length && !day.vacation && !day.sick) delete state.days[date];
}

function allWorkdays() {
  const dates = [];
  const date = new Date(YEAR, 0, 1);
  while (date.getFullYear() === YEAR) {
    if (date.getDay() !== 0 && date.getDay() !== 6) dates.push(keyFromDate(date));
    date.setDate(date.getDate() + 1);
  }
  return dates;
}

function workdaysInMonth(month) {
  return allWorkdays().filter((date) => Number(date.slice(5, 7)) === month + 1);
}

function daySummary(date) {
  const day = readDay(date);
  const actual = day.jobs.reduce((sum, job) => sum + numberOrZero(job.hours), 0);
  const absent = day.vacation > 0 || day.sick > 0;
  const holiday = HOLIDAYS.has(date);
  const weekday = dateObject(date).getDay();
  const target = holiday || absent ? null : weekday === 5 ? 5 : 8;
  return { actual, target, overtime: target === null ? null : actual - target };
}

function yearlySummary() {
  let actual = 0;
  let target = 0;
  let vacationUsed = 0;
  Object.entries(state.days).forEach(([date, day]) => {
    actual += day.jobs.reduce((sum, job) => sum + numberOrZero(job.hours), 0);
    vacationUsed += numberOrZero(day.vacation);
    const summary = daySummary(date);
    if (summary.target !== null) target += summary.target;
  });
  return {
    actual,
    target,
    overtime: actual - target,
    vacationRemaining: numberOrZero(state.settings.vacationAllowance) - vacationUsed,
  };
}

function customerHours(name) {
  return Object.values(state.days).reduce(
    (sum, day) => sum + day.jobs.filter((job) => job.customer === name).reduce((amount, job) => amount + numberOrZero(job.hours), 0),
    0,
  );
}

function addJob() {
  const day = ensureDay(selectedDate);
  if (HOLIDAYS.has(selectedDate) || day.vacation > 0 || day.sick > 0) return;
  const previous = day.jobs.at(-1);
  const start = previous?.end || "07:30";
  day.jobs.push(normalizeJob({ customer: "", start, end: start, pause: 0, hours: 0, mode: "hours" }));
  saveState();
  render();
}

function removeJob(id) {
  const day = ensureDay(selectedDate);
  day.jobs = day.jobs.filter((job) => job.id !== id);
  compactDay(selectedDate);
  saveState();
  render();
}

function getJob(id) {
  return ensureDay(selectedDate).jobs.find((job) => job.id === id);
}

function recalculateJob(job, source) {
  const startMinutes = timeToMinutes(job.start);
  if (source === "end") {
    const endMinutes = timeToMinutes(job.end);
    job.hours = Math.max(0, roundQuarter((endMinutes - startMinutes) / 60 - numberOrZero(job.pause)));
    job.mode = "end";
  } else {
    job.end = minutesToTime(startMinutes + Math.round((numberOrZero(job.hours) + numberOrZero(job.pause)) * 60));
    job.mode = "hours";
  }
}

function setCustomer(job, typedName) {
  const name = cleanText(typedName);
  if (!name) {
    job.customer = "";
    return;
  }
  const exact = state.customers.find((customer) => customer.localeCompare(name, "de", { sensitivity: "accent" }) === 0);
  if (exact) {
    job.customer = exact;
    return;
  }
  const matches = similarCustomers(name);
  if (matches.length) {
    const example = matches.slice(0, 4).join(", ");
    const useExisting = window.confirm(`Es gibt bereits einen ähnlichen Kunden: ${example}\n\nOK: vorhandenen Kunden auswählen\nAbbrechen: „${name}“ als neuen Kunden anlegen`);
    if (useExisting) {
      const pick = matches.length === 1 ? matches[0] : window.prompt(`Vorhandene Kunden:\n${matches.map((match, index) => `${index + 1}. ${match}`).join("\n")}\n\nNummer eingeben:`, "1");
      const index = Number(pick) - 1;
      if (Number.isInteger(index) && matches[index]) {
        job.customer = matches[index];
        return;
      }
    }
  }
  state.customers.push(name);
  state.customers.sort((a, b) => a.localeCompare(b, "de"));
  job.customer = name;
  showToast(`„${name}“ wurde zur Kundenliste hinzugefügt.`);
}

function similarCustomers(name) {
  const normal = simplify(name);
  return state.customers.filter((customer) => {
    const candidate = simplify(customer);
    if (!candidate || candidate === normal) return false;
    return candidate.startsWith(normal) || normal.startsWith(candidate) ||
      (normal.length >= 3 && (candidate.includes(normal) || normal.includes(candidate) || candidate.slice(0, 3) === normal.slice(0, 3)));
  });
}

function addCustomerFromInput() {
  const input = document.querySelector("#new-customer");
  const name = cleanText(input?.value);
  if (!name) return;
  const holder = normalizeJob({ customer: "" });
  setCustomer(holder, name);
  saveState();
  render();
}

function handleChange(event) {
  const target = event.target;
  const field = target.dataset.field;
  if (!field) return;

  if (field === "month") {
    selectedMonth = Number(target.value);
    selectedDate = workdaysInMonth(selectedMonth)[0];
    render();
    return;
  }

  const day = ensureDay(selectedDate);
  if (field === "vacation" || field === "sick") {
    if (target.checked) {
      day[field] = 1;
      day.jobs = [];
    } else {
      day[field] = 0;
    }
    compactDay(selectedDate);
    saveState();
    render();
    return;
  }

  const job = getJob(target.dataset.id);
  if (!job) return;
  if (field === "customer") {
    setCustomer(job, target.value);
  } else if (field === "start") {
    if (validTime(target.value)) {
      job.start = target.value;
      recalculateJob(job, job.mode);
    }
  } else if (field === "pause") {
    job.pause = Math.max(0, numberOrZero(target.value));
    recalculateJob(job, job.mode);
  } else if (field === "hours") {
    job.hours = Math.max(0, numberOrZero(target.value));
    recalculateJob(job, "hours");
  } else if (field === "end") {
    if (validTime(target.value)) {
      job.end = target.value;
      recalculateJob(job, "end");
    }
  } else if (field === "custom") {
    job.customFields[target.dataset.column] = target.value;
  }
  saveState();
  render();
}

function handleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;

  if (action === "set-view") {
    activeView = button.dataset.view;
    render();
  } else if (action === "select-day") {
    selectedDate = button.dataset.date;
    selectedMonth = Number(selectedDate.slice(5, 7)) - 1;
    render();
  } else if (action === "add-job") {
    addJob();
  } else if (action === "remove-job") {
    removeJob(button.dataset.id);
  } else if (action === "add-customer") {
    addCustomerFromInput();
  } else if (action === "open-customer") {
    openCustomer(button.dataset.customer);
  } else if (action === "save-vacation") {
    state.settings.vacationAllowance = Math.max(0, numberOrZero(document.querySelector("#vacation-allowance")?.value));
    saveState();
    showToast("Urlaubsanspruch gespeichert.");
    render();
  } else if (action === "add-column") {
    addCustomColumn();
  } else if (action === "export-data") {
    exportBackup();
  } else if (action === "restore-data") {
    restoreInput.click();
  } else if (action === "open-install") {
    activeModal = "install";
    render();
  } else if (action === "close-modal") {
    activeModal = null;
    render();
  } else if (action === "install-now") {
    installApp();
  }
}

function openCustomer(name) {
  const matchingDates = Object.keys(state.days).filter((date) => readDay(date).jobs.some((job) => job.customer === name));
  if (matchingDates.length) {
    selectedDate = matchingDates.at(-1);
    selectedMonth = Number(selectedDate.slice(5, 7)) - 1;
    activeView = "planner";
    showToast(`${name}: ${formatHours(customerHours(name))} im Jahr. Letzter Eintrag geöffnet.`);
  } else {
    showToast(`${name}: bisher ${formatHours(0)} erfasst.`);
  }
  render();
}

function addCustomColumn() {
  const name = cleanText(window.prompt("Name der neuen Zusatzspalte:"));
  if (!name) return;
  if (state.customColumns.some((column) => column.localeCompare(name, "de", { sensitivity: "accent" }) === 0)) {
    showToast("Diese Zusatzspalte gibt es bereits.");
    return;
  }
  state.customColumns.push(name);
  saveState();
  showToast(`Zusatzspalte „${name}“ hinzugefügt.`);
  render();
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `arbeitszeit-2026-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Sicherung wurde heruntergeladen.");
}

async function restoreBackup(file) {
  try {
    const restored = normalizeState(JSON.parse(await file.text()));
    if (restored.year !== YEAR) throw new Error("Falsches Jahr");
    state = restored;
    saveState();
    selectedDate = allWorkdays()[0];
    activeView = "planner";
    showToast("Sicherung wurde wiederhergestellt.");
    render();
  } catch {
    showToast("Die Sicherung konnte nicht gelesen werden.");
  }
}

async function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  activeModal = null;
  render();
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => undefined);
  }
}

function showToast(message) {
  toastMessage = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage = "";
    render();
  }, 3200);
}

function absenceLabel(day) {
  if (day.vacation > 0 && day.sick > 0) return "Urlaub und Krankheit";
  return day.vacation > 0 ? "Urlaubstag" : "Krankheitstag";
}

function formatDate(key) {
  const date = dateObject(key);
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}

function formatHours(value) {
  return `${numberOrZero(value).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h`;
}

function formatNumber(value) {
  return numberOrZero(value).toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

function formatTime(value) {
  return validTime(value) ? `${value} Uhr` : "—";
}

function inputNumber(value) {
  return numberOrZero(value) ? String(numberOrZero(value)).replace(".", ",") : "0";
}

function numberOrZero(value) {
  if (typeof value === "string") value = value.replace(",", ".");
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundQuarter(value) {
  return Math.round(value * 100) / 100;
}

function validTime(value) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) && timeToMinutes(value) <= 1439;
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value) {
  const minutes = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0") }`.replace(" ", "");
}

function dateObject(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function keyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0") }`.replace(" ", "");
}

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function simplify(value) {
  return cleanText(value).toLocaleLowerCase("de").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

document.addEventListener("change", handleChange);
document.addEventListener("focusout", (event) => {
  if (event.target?.dataset?.field && event.target.dataset.field !== "month") handleChange(event);
}, true);
document.addEventListener("click", handleClick);
restoreInput.addEventListener("change", () => {
  if (restoreInput.files?.[0]) restoreBackup(restoreInput.files[0]);
  restoreInput.value = "";
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

loadApp();
