/* Isolated browser tests. No production credentials or data are used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const directory = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(directory, 'app-v800.js'), 'utf8').replace(/\}\)\(\);\s*$/, `
  window.__appTest = { state, render, reload, planningMeta, planningNotes, planningPeople, planningRows, planningCustomers, planningDays, planningWeekStart, planConflicts, recordedPeriods, dayHours, overtime, allRows, refreshPlanningData, syncPlanningIfVisible, savePlanning, saveOrder, printPdf };
})();`);
const people = [
  { id: 'admin', role: 'administrator', username: 'Administrator' },
  { id: 'company-one', role: 'business', username: 'Cheffe', company_name: 'Firma Eins' },
  { id: 'company-two', role: 'business', username: 'Cheffe', company_name: 'Firma Zwei' },
  { id: 'anna', role: 'employee', business_id: 'company-one', username: 'Anna', vacation_allowance: 30, labor_type: 'monteur' },
  { id: 'max', role: 'employee', business_id: 'company-one', username: 'Max', vacation_allowance: 25, labor_type: 'meister' },
  { id: 'felix', role: 'employee', business_id: 'company-two', username: 'Felix', vacation_allowance: 28 }
];
const metadata = details => 'ZE-PLAN-1:' + JSON.stringify({ start: '08:00', end: '10:00', priority: 'normal', status: 'planned', details, workOrderId: '' });
const database = {
  profiles: people,
  customers: [
    { id: 'customer-one', employee_id: 'max', name: 'Klostermanns Hof', custom_fields: { first_name: 'Testkunde', street: 'Teststraße', house_no: '12', postal_code: '48143', city: 'Münster', phone_private: '0251 12345', phone_mobile: '0176 12345', email: 'kunde@example.invalid', extra_contact: 'Schlüssel im Büro' } },
    { id: 'customer-two', employee_id: 'felix', name: 'Klostermanns Hof', custom_fields: { street: 'Andere Firmenstraße', city: 'Andere Firma' } }
  ],
  appointments: [
    { id: 'legacy', employee_id: 'anna', event_date: '2026-10-05', customer_id: 'customer-one', customer_name: 'Klostermanns Hof', title: 'Alter Kundentermin', notes: 'Vorhandene Notiz' },
    { id: 'max-plan', employee_id: 'max', event_date: '2026-10-06', customer_id: 'customer-one', customer_name: 'Klostermanns Hof', title: 'Montage', notes: metadata('Werkzeug mitbringen') },
    { id: 'other-company', employee_id: 'felix', event_date: '2026-10-05', customer_id: 'customer-two', customer_name: 'Geheimer Kunde', title: 'Nicht sichtbar', notes: metadata('Andere Firma') }
  ],
  work_days: [{ employee_id: 'anna', work_date: '2026-10-07', sick: 1, vacation: 0 }],
  vacation_requests: [
    { id: 'vacation-max', employee_id: 'max', start_date: '2026-10-07', end_date: '2026-10-09', requested_days: 3, status: 'approved' },
    { id: 'vacation-anna', employee_id: 'anna', start_date: '2026-10-08', end_date: '2026-10-09', requested_days: 2, status: 'requested' }
  ],
  time_entries: [], work_orders: [], work_order_items: [],
  materials: [{ id: 'labor', business_id: 'company-one', name: 'Monteurstunde', unit_price: 55, active: true }],
  mailbox_messages: [], mailbox_attachments: [], employee_payslips: [], work_order_documents: [], planning_requests: [], offers: [],
  receipt_scans: [], company_notification_settings: [], customer_locations: [], order_arrivals: [], appointment_reminders: [], job_timers: []
};
const notifications = [], writes = [], pageErrors = [], tests = [];
let failPlanningGet = false;
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '') || 'index.html';
  if (name === 'config.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end('window.WORKTIME_CONFIG={supabaseUrl:"https://test.invalid",supabasePublishableKey:"test"};'); }
  if (name === 'app-v800.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(source); }
  if (name === 'service-worker.js') { res.statusCode = 404; return res.end(); }
  const filename = path.resolve(directory, name);
  if (!filename.startsWith(directory + path.sep) || !fs.existsSync(filename)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html' : 'application/octet-stream');
  res.end(fs.readFileSync(filename));
});
async function test(name, task) { await task(); tests.push(name); console.log('PASS ' + name); }
function predicate(url) {
  const filters = [...url.searchParams.entries()].filter(([key]) => !['select', 'order', 'limit', 'offset'].includes(key));
  return row => filters.every(([key, value]) => !value.startsWith('eq.') || String(row[key]) === value.slice(3));
}
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('dialog', dialog => dialog.type() === 'confirm' ? dialog.accept() : dialog.dismiss());
    await page.route('https://test.invalid/**', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      const send = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
      const body = request.postDataJSON();
      if (url.pathname === '/functions/v1/mailbox-send') {
        if (body.action === 'recipients') return send({ recipients: people });
        notifications.push(body); return send({ success: true });
      }
      if (url.pathname.includes('/rpc/')) return send([]);
      const table = url.pathname.split('/').at(-1);
      if (!database[table]) throw new Error('Unexpected endpoint ' + url.pathname);
      if (method === 'GET') {
        if (failPlanningGet && table === 'appointments') return send({ message: 'Simulated outage' }, 503);
        const result = database[table].filter(predicate(url));
        const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || result.length);
        return send(result.slice(offset, offset + limit));
      }
      writes.push({ table, method, body });
      if (method === 'POST') {
        const row = { id: body.id || randomUUID(), created_at: '2026-10-03T10:00:00Z', ...body };
        if (database[table].some(item => item.id === row.id)) return send({ message: 'duplicate key' }, 409);
        database[table].push(row);
        if (table === 'work_orders') database.time_entries.push({ ...row, id: randomUUID(), work_order_id: row.id });
        return send([row]);
      }
      if (method === 'PATCH') {
        const matches = database[table].filter(predicate(url)); matches.forEach(row => Object.assign(row, body));
        if (table === 'work_orders') matches.forEach(order => database.time_entries.filter(entry => entry.work_order_id === order.id).forEach(entry => Object.assign(entry, { ...order, id: entry.id, work_order_id: order.id })));
        return send(matches);
      }
      if (method === 'DELETE') { database[table] = database[table].filter(row => !predicate(url)(row)); return send(null); }
      throw new Error('Unexpected method ' + method);
    });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => !!window.__appTest);
    const setRole = async (id, view = 'planning') => {
      await page.evaluate(async ({ id, view, people }) => {
        const app = window.__appTest;
        Object.assign(app.state, { profile: people.find(person => person.id === id), session: { user: { id }, access_token: 'synthetic-test-token' }, businessId: 'company-one', employeeId: 'anna', date: '2026-10-05', month: '2026-10', view, menu: false, planId: '', planForm: false, planWeek: '2026-10-05', planPrefill: null, notice: null });
        await app.reload(); app.render();
      }, { id, view, people });
    };
    const submitPlan = async () => {
      await page.locator('form[data-form="planning"] button.primary').click();
      await page.waitForFunction(() => !window.__appTest.state.busy);
    };
    const startPlan = async (id) => {
      await page.locator('[data-action="plan-open"][data-id="' + id + '"]').click();
      await page.locator('[data-action="plan-start"][data-id="' + id + '"]').click();
      await page.waitForFunction(() => !window.__appTest.state.busy);
    };
    await test('Login page loads without runtime errors', async () => assert.equal(await page.locator('form[data-form="login"]').count(), 1));
    await setRole('company-one');
    await test('Weekly manager view is scoped to the selected company', async () => {
      assert.equal(await page.locator('.plan-person').count(), 2);
      assert.equal(await page.locator('[data-id="other-company"]').count(), 0);
      assert.match(await page.locator('.content').innerText(), /Krank gemeldet/);
      assert.match(await page.locator('.content').innerText(), /Urlaub beantragt/);
      assert.equal(await page.locator('.plan-day').count(), 14);
    });
    await test('Mobile menu and planning stay within the viewport', async () => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('[data-action="menu"]').click();
      const rect = await page.locator('.app-menu-sheet').boundingBox();
      assert.ok(rect.x >= 0 && rect.x + rect.width <= 391);
      await page.locator('[data-action="nav"][data-view="planning"]').click();
      await page.waitForFunction(() => !window.__appTest.state.busy);
    });
    await test('Legacy appointments remain readable', async () => {
      await page.locator('[data-action="plan-open"][data-id="legacy"]').click();
      assert.equal(await page.locator('textarea[name="details"]').inputValue(), 'Vorhandene Notiz');
      await page.locator('[data-action="plan-close"]').click();
    });
    await test('New planning has company-scoped customer suggestions and retains focus while typing', async () => {
      await page.locator('[data-action="plan-new"]').click();
      assert.equal(await page.locator('#planning-customers option').count(), 1);
      await page.locator('input[name="customer"]').pressSequentially('Klosterman');
      assert.equal(await page.locator('[data-action="plan-customer-select"]').count(), 1);
      assert.equal(await page.evaluate(() => document.activeElement.name), 'customer');
      await page.locator('[data-action="plan-customer-select"]').click();
      assert.equal(await page.locator('input[name="customer"]').inputValue(), 'Klostermanns Hof');
      await page.locator('input[name="customer"]').fill('');
      assert.equal(await page.locator('[data-planning-customer-field="street"]').count(), 0);
      await page.locator('input[name="customer"]').pressSequentially('Klostermanns Hof');
      assert.equal(await page.evaluate(() => document.activeElement.name), 'customer');
      assert.equal(await page.locator('[data-planning-customer-field="street"]').inputValue(), 'Teststraße');
      assert.equal(await page.locator('[data-planning-customer-field="postal_code"]').inputValue(), '48143');
      assert.equal(await page.locator('[data-planning-customer-field="city"]').inputValue(), 'Münster');
      assert.equal(await page.locator('[data-planning-customer-field="email"]').inputValue(), 'kunde@example.invalid');
      assert.equal(await page.locator('[data-planning-customer-field="extra_contact"]').inputValue(), 'Schlüssel im Büro');
      await page.locator('input[name="title"]').fill('Neue Steckdosen');
      await page.locator('input[name="event_date"]').fill('2026-10-06');
      await page.locator('input[name="start"]').fill('10:00');
      await page.locator('input[name="end"]').fill('13:00');
      await page.locator('textarea[name="details"]').fill('Bitte Schlüssel abholen.');
      await page.screenshot({ path: path.join(__dirname, 'planning-customer-mobile.png'), fullPage: true });
      await submitPlan();
      assert.match(await page.locator('.notice').innerText(), /gespeichert/);
    });
    const created = database.appointments.find(row => row.title === 'Neue Steckdosen');
    await test('Saving planning does not create work hours and notifies the assigned employee', async () => {
      assert.ok(created); assert.equal(created.customer_id, 'customer-one');
      assert.equal(database.time_entries.length, 0); assert.equal(database.work_orders.length, 0);
      assert.equal(notifications.at(-1).recipientId, 'anna');
      assert.equal(JSON.parse(created.notes.slice(10)).customerDetails.custom_fields.street, 'Teststraße');
      assert.equal(writes.some(request => request.table === 'customers'), false);
      assert.equal(await page.locator('[data-id="' + created.id + '"]').count(), 1);
    });
    await test('Planning changes are visible immediately', async () => {
      await page.locator('[data-action="plan-open"][data-id="' + created.id + '"]').click();
      await page.locator('input[name="start"]').fill('09:00');
      await page.locator('input[name="end"]').fill('12:00');
      await submitPlan();
      assert.match(await page.locator('[data-action="plan-open"][data-id="' + created.id + '"]').innerText(), /09:00 – 12:00/);
    });
    await test('Overlapping planning is blocked without writing a record', async () => {
      const count = database.appointments.length;
      await page.locator('[data-action="plan-new"]').click();
      await page.locator('input[name="customer"]').fill('Klostermanns Hof');
      await page.locator('input[name="title"]').fill('Konflikt');
      await page.locator('input[name="event_date"]').fill('2026-10-06');
      await page.locator('input[name="start"]').fill('11:00');
      await page.locator('input[name="end"]').fill('12:00');
      assert.match(await page.locator('[data-plan-warnings]').innerText(), /bereits einen geplanten Auftrag/);
      await submitPlan();
      assert.equal(database.appointments.length, count);
      assert.match(await page.locator('.notice.error').innerText(), /bereits einen geplanten Auftrag/);
    });
    await test('Sick days, approved vacation and NRW holidays block planning; requests only warn', async () => {
      const result = await page.evaluate(() => {
        const app = window.__appTest;
        const values = (employeeId, eventDate) => app.planConflicts({ employeeId, eventDate, start: '10:00', end: '11:00' });
        return { sick: values('anna', '2026-10-07'), approved: values('max', '2026-10-08'), holiday: values('anna', '2026-10-03'), requested: values('anna', '2026-10-08') };
      });
      assert.equal(result.sick[0].kind, 'blocked'); assert.equal(result.approved[0].kind, 'blocked');
      assert.equal(result.holiday[0].kind, 'blocked'); assert.equal(result.requested[0].kind, 'warning');
    });
    await test('All record pages are loaded beyond the server page size', async () => {
      const original = database.appointments;
      database.appointments = Array.from({ length: 1203 }, (_, index) => ({ id: 'page-test-' + index }));
      try {
        assert.equal(await page.evaluate(async () => (await window.__appTest.allRows('appointments', 'select=*&order=id.asc')).length), 1203);
      } finally { database.appointments = original; }
    });
    await test('Background synchronization keeps the active input and unsaved form values', async () => {
      await page.locator('input[name="title"]').fill('Noch nicht gespeicherter Entwurf');
      await page.evaluate(() => window.__appTest.syncPlanningIfVisible());
      assert.equal(await page.locator('input[name="title"]').inputValue(), 'Noch nicht gespeicherter Entwurf');
      assert.equal(await page.evaluate(() => document.activeElement.name), 'title');
    });
    await test('Customer refresh updates the address without changing notes or keyboard focus', async () => {
      await page.locator('input[name="customer"]').fill('Klostermanns Hof');
      await page.locator('textarea[name="details"]').fill('Meine eigene Auftragsnotiz');
      database.customers[0].custom_fields.street = 'Neue Teststraße';
      try {
        await page.evaluate(() => window.__appTest.syncPlanningIfVisible());
        assert.equal(await page.locator('[data-planning-customer-field="street"]').inputValue(), 'Neue Teststraße');
        assert.equal(await page.locator('textarea[name="details"]').inputValue(), 'Meine eigene Auftragsnotiz');
        assert.equal(await page.evaluate(() => document.activeElement.name), 'details');
      } finally { database.customers[0].custom_fields.street = 'Teststraße'; }
    });
    await setRole('anna');
    await test('Employees see their assignments and may propose, but cannot directly publish planning', async () => {
      assert.equal(await page.locator('.plan-person').count(), 1);
      assert.equal(await page.locator('[data-action="plan-new"]').count(), 1);
      assert.equal(await page.locator('[data-id="max-plan"]').count(), 0);
      const result = await page.evaluate(async () => { try { await window.__appTest.savePlanning({elements:{proposal:{value:''}}}); return ''; } catch (error) { return error.message; } });
      assert.match(result, /Planungsvorschläge/);
    });
    await test('Confirmation immediately opens a persistent prefilled work order draft without adding working time', async () => {
      await page.locator('[data-action="plan-open"][data-id="' + created.id + '"]').click();
      await page.locator('[data-action="plan-confirm"]').click();
      await page.waitForFunction(() => !window.__appTest.state.busy);
      assert.equal(JSON.parse(created.notes.slice(10)).status, 'confirmed');
      assert.equal(database.work_orders.length, 0);
      assert.equal(await page.locator('form[data-form="order"] input[name="planning_id"]').inputValue(), created.id);
      assert.equal(await page.locator('[data-planning-customer-field="street"]').inputValue(), 'Teststraße');
    });
    await test('Starting an assignment prefills the customer, date, notes and synchronized hours', async () => {
      assert.equal(await page.locator('form[data-form="order"] input[name="customer"]').inputValue(), 'Klostermanns Hof');
      assert.equal(await page.locator('input[name="start"]').inputValue(), '09:00');
      assert.equal(await page.locator('input[name="end"]').inputValue(), '12:00');
      assert.equal(await page.locator('input[name="hours"]').inputValue(), '3');
      assert.equal(await page.locator('textarea[name="documentation"]').inputValue(), 'Bitte Schlüssel abholen.');
      await page.locator('input[name="hours"]').fill('4');
      assert.equal(await page.locator('input[name="end"]').inputValue(), '13:00');
      await page.locator('input[name="end"]').fill('12:00');
      assert.equal(await page.locator('input[name="hours"]').inputValue(), '3.00');
      await page.locator('input[name="hours"]').fill('4');
    });
    await test('A signature remains required before saving a converted assignment', async () => {
      const ordersBefore=database.work_orders.length;
      await page.locator('[data-signature-submit]').click();
      assert.equal(await page.locator('.signature-pad').getAttribute('aria-invalid'),'true');
      assert.equal(await page.locator('[name="signed_by"]').getAttribute('aria-invalid'),'true');
      assert.equal(database.work_orders.length,ordersBefore);
      await page.locator('input[name="signed_by"]').fill('Kunde Test');
      const canvas = page.locator('canvas.signature-pad'), bounds = await canvas.boundingBox();
      await page.mouse.move(bounds.x + 20, bounds.y + 40); await page.mouse.down();
      await page.mouse.move(bounds.x + 90, bounds.y + 70, { steps: 8 }); await page.mouse.up();
      assert.equal(await page.locator('[data-signature-submit]').isDisabled(), false);
      await page.locator('[data-signature-submit]').click();
      await page.waitForFunction(() => !window.__appTest.state.busy);
      assert.match(await page.locator('.notice').innerText(), /gespeichert/);
    });
    await test('A converted plan creates exactly one work order, one working period and the priced labor item', async () => {
      assert.equal(database.work_orders.length, 1); assert.equal(database.work_orders[0].id, created.id);
      assert.equal(database.time_entries.length, 1); assert.equal(database.work_order_items[0].quantity, 4);
      assert.equal(database.work_order_items[0].unit_price, 55);
      assert.equal(JSON.parse(created.notes.slice(10)).status, 'completed');
      const hours = await page.evaluate(() => window.__appTest.dayHours('anna', '2026-10-06'));
      assert.equal(hours, 4);
    });
    await setRole('anna');
    await test('Reopening a completed plan opens its work order instead of creating a duplicate', async () => {
      await page.locator('[data-action="plan-open"][data-id="' + created.id + '"]').click();
      assert.match(await page.locator('#planning-detail').innerText(), /Erledigt/);
      assert.match(await page.locator('#planning-detail').innerText(), /13:00 Uhr/);
      assert.match(await page.locator('#planning-detail').innerText(), /\+1,00 h/);
      assert.equal(await page.locator('[data-action="plan-start"]').count(), 0);
      await page.locator('[data-action="open-order"]').click();
      assert.equal(await page.locator('form[data-form="order-edit"] input[name="id"]').inputValue(), created.id);
      assert.equal(database.work_orders.length, 1);
    });
    await test('Editing finished work updates actual duration and completion status in planning', async () => {
      await page.locator('form[data-form="order-edit"] input[name="hours"]').fill('2.5');
      await page.locator('[data-signature-submit]').click();
      await page.waitForFunction(() => !window.__appTest.state.busy);
      const card = page.locator('[data-action="plan-open"][data-id="' + created.id + '"]');
      assert.match(await card.innerText(), /09:00 – 11:30/);
      assert.match(await card.innerText(), /Erledigt/);
      assert.match(await card.innerText(), /2,50 h/);
    });
    await test('Saved customer details remain available if the customer record is temporarily unavailable', async () => {
      const original = database.customers;
      database.customers = original.filter(customer => customer.id !== 'customer-one');
      try {
        await setRole('anna');
        await page.locator('[data-action="plan-open"][data-id="' + created.id + '"]').click();
        assert.equal(await page.locator('[data-planning-customer-field="street"]').inputValue(), 'Teststraße');
        assert.equal(await page.locator('[data-planning-customer-field="email"]').inputValue(), 'kunde@example.invalid');
      } finally { database.customers = original; }
    });
    await test('Network failures retain the last successfully synchronized history', async () => {
      failPlanningGet = true;
      const count = await page.evaluate(() => window.__appTest.state.rows.appointments.length);
      const result = await page.evaluate(async () => { try { await window.__appTest.refreshPlanningData(); return ''; } catch (error) { return error.message; } });
      assert.match(result, /Simulated outage/);
      assert.equal(await page.evaluate(() => window.__appTest.state.rows.appointments.length), count);
      failPlanningGet = false;
    });
    await setRole('admin');
    await test('Administrator switching companies isolates plans and customers', async () => {
      await page.locator('[data-select="business"]').selectOption('company-two');
      assert.equal(await page.locator('.plan-person').innerText(), 'Felix');
      assert.equal(await page.locator('[data-id="' + created.id + '"]').count(), 0);
      assert.equal(await page.locator('[data-id="other-company"]').count(), 1);
      await page.locator('[data-action="plan-new"]').click();
      assert.equal(await page.evaluate(() => window.__appTest.planningCustomers('felix')[0].id), 'customer-two');
      await page.locator('input[name="customer"]').fill('Klostermanns Hof');
      assert.equal(await page.locator('[data-planning-customer-field="street"]').inputValue(), 'Andere Firmenstraße');
    });
    await setRole('company-one');
    await test('Manager confirmation also creates a draft visible in the assigned employee work orders', async () => {
      await page.locator('[data-action="plan-open"][data-id="max-plan"]').click();
      await page.locator('select[name="status"]').selectOption('confirmed');
      await submitPlan();
      await setRole('max', 'orders');
      await page.evaluate(() => { window.__appTest.state.date = '2026-10-06'; window.__appTest.render(); });
      assert.equal(await page.locator('[data-action="plan-start"][data-id="max-plan"]').count(), 1);
      assert.equal(await page.evaluate(() => window.__appTest.dayHours('max', '2026-10-06')), 0);
      await page.locator('[data-action="plan-start"][data-id="max-plan"]').click();
      await page.waitForFunction(() => !window.__appTest.state.busy);
      assert.equal(await page.locator('input[name="title"]').inputValue(), 'Montage');
      assert.equal(await page.locator('[data-planning-customer-field="city"]').inputValue(), 'Münster');
      await setRole('company-one');
    });
    await test('Converted plans cannot silently change the actual work order identity or time', async () => {
      await page.locator('[data-action="plan-open"][data-id="' + created.id + '"]').click();
      await page.locator('input[name="start"]').fill('08:00');
      await submitPlan();
      assert.match(await page.locator('.notice.error').innerText(), /direkt im Arbeitsschein bearbeiten/);
      assert.equal(database.work_orders[0].start_time, '09:00');
      await page.locator('[data-action="plan-close"]').click();
    });
    await test('Week controls support date selection and adjacent weeks', async () => {
      await page.locator('[data-plan-week]').fill('2026-10-13');
      assert.equal(await page.locator('[data-plan-week]').inputValue(), '2026-10-12');
      await page.locator('[data-action="plan-week"][data-days="-7"]').click();
      assert.equal(await page.locator('[data-plan-week]').inputValue(), '2026-10-05');
    });
    await test('Deleting planning removes it immediately but preserves existing work orders', async () => {
      await page.locator('[data-action="plan-open"][data-id="legacy"]').click();
      await page.locator('[data-action="plan-delete"]').click();
      await page.waitForFunction(() => !window.__appTest.state.busy);
      assert.equal(database.appointments.some(row => row.id === 'legacy'), false);
      assert.equal(await page.locator('[data-id="legacy"]').count(), 0);
      assert.equal(database.work_orders.length, 1);
    });
    await test('No empty days are deducted from overtime and duplicate records are counted once', async () => {
      const totals = await page.evaluate(() => {
        const app = window.__appTest;
        app.state.rows.entries.push({ employee_id: 'anna', work_date: '2026-10-06', customer_id: 'customer-one', start_time: '09:00', end_time: '11:30', pause_hours: 0, executed_hours: 2.5 });
        return { daily: app.dayHours('anna', '2026-10-06'), overtime: app.overtime('anna') };
      });
      assert.deepEqual(totals, { daily: 2.5, overtime: -5.5 });
    });
    await test('PDF export contains year and month headings and time ranges', async () => {
      const popupPromise = page.waitForEvent('popup');
      await page.evaluate(() => window.__appTest.printPdf());
      const popup = await popupPromise;
      await popup.waitForLoadState('domcontentloaded');
      const text = await popup.locator('body').innerText();
      assert.match(text, /Jahr 2026/); assert.match(text, /Oktober 2026/); assert.match(text, /09:00 Uhr/); assert.match(text, /11:30 Uhr/);
      await popup.close();
    });
    await test('Desktop weekly layout remains seven columns without overflowing the page', async () => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await setRole('company-one');
      const columns = await page.locator('.plan-week').first().evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
      assert.equal(columns, 7);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(__dirname, 'planning-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(__dirname, 'planning-mobile.png'), fullPage: true });
    });
    assert.deepEqual(pageErrors, []);
    console.log(JSON.stringify({ passed: tests.length, productionWrites: 0, runtimeErrors: pageErrors.length, requests: writes.length }));
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
