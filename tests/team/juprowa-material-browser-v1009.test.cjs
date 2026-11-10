'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

const dir = path.resolve(__dirname, '../..');
const app = fs.readFileSync(path.join(dir, 'app-v800.js'), 'utf8')
  .replace('if (state.session?.access_token) loadApp(); else render();', '/* Isolated fixture */')
  .replace(/\}\)\(\);\s*$/, 'window.__workOrderQA = { state, render };})();');
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://local').pathname.slice(1) || 'index.html';
  if (name === 'config.js') {
    res.setHeader('Content-Type', 'application/javascript');
    return res.end('window.WORKTIME_CONFIG={supabaseUrl:"https://test.invalid",supabasePublishableKey:"synthetic"}');
  }
  const file = path.resolve(dir, name);
  if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.statusCode = 404;
    return res.end();
  }
  res.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(name === 'app-v800.js' ? app : fs.readFileSync(file));
});

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    ...(process.env.WORKTIME_TEST_CHROMIUM ? { executablePath: process.env.WORKTIME_TEST_CHROMIUM } : {}),
    headless: true
  });
  try {
    const page = await browser.newPage({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const request = route.request();
      if (request.method() !== 'GET') writes.push(request.url());
      if (new URL(request.url()).hostname === '127.0.0.1') return route.continue();
      return route.fulfill({ json: [] });
    });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => !!window.__workOrderQA);
    await page.evaluate(() => {
      const { state, render } = window.__workOrderQA;
      const firm = { id: 'firm', role: 'business', company_name: 'Synthetischer Betrieb' };
      const worker = { id: 'worker', role: 'employee', business_id: 'firm', username: 'Test' };
      Object.assign(state, {
        session: { user: { id: 'firm' }, access_token: 'synthetic' },
        profile: firm, employeeId: 'firm', view: 'orders',
        date: '2026-11-09', month: '2026-11'
      });
      state.people = state.rows.people = [firm, worker, { id: 'other', role: 'business' }];
      state.rows.orders = [{
        id: 'test-order', employee_id: 'firm', work_kind: 'customer',
        title: 'Pruefung', customer_name: 'NICHT IN UGL', work_date: '2026-11-09'
      }];
      state.rows.items = [
        { work_order_id: 'test-order', material_id: 'material', position_name: 'TESTMATERIAL - KEINE BESTELLUNG', quantity: 2.5, unit: 'M', unit_price: 12.34 },
        { work_order_id: 'test-order', position_name: 'Monteurstunde', quantity: 1, unit: 'H', unit_price: 60 }
      ];
      state.rows.materials = [{
        id: 'material', business_id: 'firm', catalog_supplier: 'Fixture',
        catalog_article_number: '000TEST-001', unit: 'M', unit_price: 19.99
      }];
      render();
    });
    await page.locator('[data-action="open-order"][data-id="test-order"]').first().click();
    const button = page.getByRole('button', { name: 'Juprowa-Materialdatei', exact: true });
    const downloadPromise = page.waitForEvent('download');
    await button.click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'Juprowa-Material-2026-11-09.ugl');
    const bytes = fs.readFileSync(await download.path());
    assert.equal(bytes.length, 606);
    const [header, position, end] = bytes.toString('ascii').trimEnd().split('\r\n');
    assert.equal(header.slice(23, 25), 'PA');
    assert.equal(header.slice(116, 121), '04.00');
    assert.equal(position.slice(23, 38).trim(), '000TEST-001');
    assert.equal(position.slice(38, 49), '00000002500');
    assert.equal(position.slice(129, 140), '00000001234');
    assert.equal(position.slice(141, 152), '00000003085');
    assert.equal(position.slice(183, 186).trim(), 'M');
    assert.match(position, /TESTMATERIAL - KEINE BESTELLUNG/);
    assert.equal(end, 'END');
    assert.doesNotMatch(bytes.toString('ascii'), /NICHT IN UGL|Monteurstunde/);
    assert.match(await page.locator('.notice').innerText(), /UGL-Datei einlesen/);

    for (const [field, invalid, message] of [
      ['catalog_article_number', '0000000000000001', /Artikelnummer bis 15 Zeichen/],
      ['business_id', 'other', /eindeutigen Katalogartikel/],
      ['unit_price', 12.35, /centgenau/]
    ]) {
      await page.evaluate(({ field, invalid }) => {
        const { state } = window.__workOrderQA;
        const row = field === 'unit_price' ? state.rows.items[0] : state.rows.materials[0];
        window.__resetUgl = () => { row[field] = old; };
        const old = row[field];
        row[field] = invalid;
      }, { field, invalid });
      await button.click();
      assert.match(await page.locator('.notice.error').innerText(), message);
      await page.evaluate(() => window.__resetUgl());
    }
    await page.evaluate(() => {
      const { state, render } = window.__workOrderQA;
      state.profile = state.rows.people[1];
      render();
    });
    assert.equal(await button.count(), 0);
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    console.log('PASS Juprowa download from saved work order; exact item, quantity, unit and net price; invalid and cross-company data blocked; no writes');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
