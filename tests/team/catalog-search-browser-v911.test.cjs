'use strict';
/* Isolated loopback/browser regression. All catalog rows and RPCs are synthetic.
 * The actual deployed app, Supabase, user profiles and browser sessions are never opened. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const dir = path.resolve(__dirname, '../..');
const styles = [...fs.readFileSync(path.join(dir, 'index.html'), 'utf8').matchAll(/<link rel="stylesheet" href="([^"?]+)(?:\?[^"]*)?"/g)].map(m => m[1]);
const scripts = ['catalog-format-v908.js', 'catalog-import-v909.js', 'catalog-import-ui-v910.js', 'catalog-ui-v908.js'];
const allowed = new Set([...styles, ...scripts]);
const html = '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + styles.map(s => `<link rel="stylesheet" href="/${s}">`).join('') + '<body><main class="app-shell" id="root"></main>' + scripts.map(s => `<script src="/${s}"></script>`).join('') + '</body></html>';
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://127.0.0.1').pathname.slice(1);
  if (!name) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
  if (!allowed.has(name)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8');
  res.end(fs.readFileSync(path.join(dir, name)));
});
const header = 'Artikelnummer;Artikelname;Einheit;EK netto;VK* netto;VK** netto;Preiseinheit;Kommentar';
const csv = header + '\n' + Array.from({ length: 50 }, (_, i) => {
  const n = i + 1, sku = String(n).padStart(6, '0');
  const name = n === 1 ? 'Hager B16' : (n % 2 ? 'Hager Bauteil ' : 'Eaton Bauteil ') + String(n).padStart(2, '0');
  return [sku, name, 'Stk', '1,25', '2,50', '3,75', '1', 'NurKommentar777777'].join(';');
}).join('\n') + '\n';

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  const errors = [], requests = [];
  let passed = 0;
  const test = async (name, action) => { await action(); passed++; console.log('PASS ' + name); };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', dialog => dialog.accept());
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    requests.push(url.origin + url.pathname);
    return route.abort();
  });
  async function reset() {
    await page.goto(origin);
    await page.evaluate(() => {
      const root = document.querySelector('#root');
      const state = { profile: { id: 'synthetic-chief', role: 'business' }, company: 'synthetic-A', rows: { materials: [] } };
      const calls = [];
      const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      let feature;
      const render = () => { root.innerHTML = feature.view(); feature.afterRender(); };
      feature = window.WorktimeCatalog.create({ root, state, escape: esc, render,
        businessId: () => state.company,
        isManager: () => state.profile?.role === 'business',
        reload: async () => {},
        api: async (url, request) => {
          const p = request.body;
          calls.push({ url, request: structuredClone(request) });
          if (url !== '/rest/v1/rpc/import_material_catalog_v911') throw Error('Unexpected synthetic RPC: ' + url);
          if (p.p_use_vk1 !== true) throw Error('Explicit VK-star price adoption is required.');
          let changed = 0;
          for (const row of p.p_rows) {
            const found = state.rows.materials.find(m => m.business_id === p.p_company && m.catalog_supplier === p.p_supplier && m.catalog_article_number === row.article_number);
            if (!found && !Object.hasOwn(row, 'recommended_price_1')) throw Error('Synthetic new article requires VK *.');
            const material = found || { id: 'synthetic-new-' + row.article_number, business_id: p.p_company };
            Object.assign(material, row, { catalog_supplier: p.p_supplier, catalog_article_number: row.article_number, catalog_revision: Number(material.catalog_revision || 0) + 1 });
            if (Object.hasOwn(row, 'recommended_price_1')) { material.unit_price = row.recommended_price_1; changed++; }
            if (!found) state.rows.materials.push(material);
          }
          return { company_id: p.p_company, created: p.p_rows.length, updated: 0, unchanged: 0,
            catalog_import_version: 911, standard_price_source: 'recommended_price_1',
            standard_prices_updated: changed, unit_price_changed: changed > 0 };
        }
      });
      window.__catalog911 = { state, calls, feature, render };
      render();
    });
  }
  const search = () => page.locator('form[data-form="supplier-search"] [name="supplier_filter"]');
  const rowInput = (index, key) => page.locator(`[data-supplier-row="${index}"][data-supplier-field="${key}"]`);
  async function chooseFile(name = 'synthetischer-katalog.csv', content = csv) {
    await page.locator('[name="supplier_file"]').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(content) });
  }
  async function readBySearch(query = '') {
    await search().fill(query);
    await search().press('Enter');
    await page.waitForFunction(() => !document.querySelector('[name="supplier_filter"]').disabled && document.querySelector('.supplier-review'));
  }
  async function prepareAndImport() {
    await page.locator('[name="supplier_name"]').fill('Synthetischer Vertrieb');
    await page.locator('[name="supplier_net"]').check();
    await page.locator('form[data-form="supplier-prepare"] button').click();
    await page.locator('[data-supplier-prepared]').waitFor();
    assert.equal(await page.evaluate(() => window.__catalog911.calls.length), 0);
    await page.locator('[name="supplier_confirm"]').check();
    await page.locator('form[data-form="supplier-import"] button').click();
    await page.waitForFunction(() => window.__catalog911.calls.length === 1 && !document.querySelector('[name="supplier_filter"]').disabled);
    return page.evaluate(() => window.__catalog911.calls[0]);
  }
  try {
    await reset();
    await test('search is above the article review and is a real Enter-submit form', async () => {
      assert.equal(await page.locator('form[data-form="supplier-search"]').count(), 1);
      assert.equal(await search().getAttribute('type'), 'search');
      assert.match(await page.locator('form[data-form="supplier-search"] button').innerText(), /durchsuchen/);
      assert.equal(await page.locator('.supplier-row').count(), 0);
      assert.equal(await page.evaluate(() => window.__catalog911.calls.length), 0);
    });
    await chooseFile();
    await readBySearch('000042');
    await test('SKU typed before reading is applied on Enter and yields editable rows without a mapping click', async () => {
      assert.equal(await page.locator('.supplier-row').count(), 1);
      assert.equal(await rowInput(0, 'article_number').inputValue(), '000042');
      assert.equal(await rowInput(0, 'name').inputValue(), 'Eaton Bauteil 42');
      assert.equal(await page.locator('details[data-supplier-mapping]').getAttribute('open'), null);
      assert.equal(await page.evaluate(() => window.__catalog911.calls.length), 0);
    });
    await test('CSV EK, VK-star and VK-double-star are mapped separately and automatically', async () => {
      assert.equal(await rowInput(0, 'purchase_price').inputValue(), '1,25');
      assert.equal(await rowInput(0, 'recommended_price_1').inputValue(), '2,50');
      assert.equal(await rowInput(0, 'recommended_price_2').inputValue(), '3,75');
      assert.equal(await rowInput(0, 'price_unit').inputValue(), '1');
      assert.equal(await page.locator('[name="map_purchase_price"]').inputValue(), 'EK netto');
      assert.equal(await page.locator('[name="map_recommended_price_1"]').inputValue(), 'VK* netto');
      assert.equal(await page.locator('[name="map_recommended_price_2"]').inputValue(), 'VK** netto');
    });
    const single = await prepareAndImport();
    await test('explicit VK-star standard-price RPC receives only the one matching reviewed SKU', async () => {
      assert.equal(single.url, '/rest/v1/rpc/import_material_catalog_v911');
      assert.equal(single.request.body.p_use_vk1, true);
      assert.equal(single.request.body.p_confirm_net_eur, true);
      assert.equal(single.request.body.p_company, 'synthetic-A');
      assert.equal(single.request.body.p_rows.length, 1);
      const row = single.request.body.p_rows[0];
      assert.equal(row.article_number, '000042');
      assert.equal(row.purchase_price, 1.25);
      assert.equal(row.recommended_price_1, 2.5);
      assert.equal(row.recommended_price_2, 3.75);
      assert.ok(!Object.hasOwn(row, 'unit_price'));
      assert.ok(!JSON.stringify(single).includes('base64'));
      assert.equal(await page.evaluate(() => window.__catalog911.state.rows.materials[0].unit_price), 2.5);
      assert.equal(await page.evaluate(() => window.__catalog911.state.rows.materials.length), 1);
    });

    await reset();
    await chooseFile();
    await readBySearch('hAgEr b16');
    await test('name matching before reading is case-insensitive and requires all search words', async () => {
      assert.equal(await page.locator('.supplier-row').count(), 1);
      assert.equal(await rowInput(0, 'article_number').inputValue(), '000001');
    });
    await readBySearch('');
    await test('an unfiltered local excerpt displays twenty of fifty editable source rows', async () => {
      assert.equal(await page.locator('.supplier-row').count(), 20);
      assert.match(await page.locator('[data-supplier-count]').innerText(), /50 Treffer.*50 geladenen/);
      assert.match(await page.locator('[data-supplier-pager]').innerText(), /Seite 1 von 3/);
    });
    await test('per-character live search keeps the same input node and keyboard focus', async () => {
      await search().focus();
      await page.evaluate(() => { window.__filterNode911 = document.querySelector('[name="supplier_filter"]'); });
      for (const letter of 'Hager') {
        await search().pressSequentially(letter);
        assert.equal(await search().evaluate(el => el === window.__filterNode911 && document.activeElement === el), true);
      }
      assert.equal(await search().inputValue(), 'Hager');
      assert.equal(await page.locator('.supplier-row').count(), 20);
      assert.match(await page.locator('[data-supplier-count]').innerText(), /25 Treffer.*50 geladenen/);
      assert.equal(await page.evaluate(() => window.__catalog911.calls.length), 0);
    });
    await page.locator('[data-supplier-action="next-page"]').click();
    await test('filtered results span pages without accidentally showing unrelated rows', async () => {
      assert.equal(await page.locator('.supplier-row').count(), 5);
      assert.match(await page.locator('[data-supplier-pager]').innerText(), /Seite 2 von 2/);
      const names = await page.locator('[data-supplier-field="name"]').evaluateAll(elements => elements.map(el => el.value));
      assert.ok(names.every(name => name.startsWith('Hager')));
      assert.equal((await page.locator('[data-supplier-field="article_number"]').evaluateAll(elements => elements.map(el => el.value))).at(-1), '000049');
    });
    await test('changing live search resets the page, searches SKUs and never searches comment or price metadata', async () => {
      await search().fill('000042');
      assert.equal(await page.locator('.supplier-row').count(), 1);
      assert.equal(await rowInput(41, 'article_number').inputValue(), '000042');
      assert.match(await page.locator('[data-supplier-pager]').innerText(), /Seite 1 von 1/);
      await search().fill('777777');
      assert.equal(await page.locator('.supplier-row').count(), 0);
      assert.match(await page.locator('[data-supplier-count]').innerText(), /^0 Treffer/);
      assert.equal(await search().evaluate(el => document.activeElement === el), true);
      await search().fill('Hager');
    });
    for (const [width, height] of [[320, 780], [390, 844], [844, 390], [1366, 768]]) {
      await test(`search and editable review controls fit ${width} x ${height}`, async () => {
        await page.setViewportSize({ width, height });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const overflow = await page.evaluate(() => [...document.querySelectorAll('.supplier-catalog input,.supplier-catalog select,.supplier-catalog button')].filter(el => {
          const r = el.getBoundingClientRect(); return r.width && (r.left < -.5 || r.right > innerWidth + .5);
        }).map(el => el.name || el.textContent));
        assert.deepEqual(overflow, []);
        assert.ok(await search().isVisible());
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await test('manual correction and exclusion keep focus and affect only filtered selected rows', async () => {
      const field = rowInput(2, 'recommended_price_1');
      await field.fill('4,75');
      assert.equal(await field.evaluate(el => document.activeElement === el), true);
      await rowInput(0, 'included').uncheck();
      assert.equal(await page.evaluate(() => window.__catalog911.calls.length), 0);
    });
    const many = await prepareAndImport();
    await test('import includes matching second-page rows but excludes hidden unrelated and unchecked articles', async () => {
      const payload = many.request.body;
      assert.equal(payload.p_use_vk1, true);
      assert.equal(payload.p_rows.length, 24);
      assert.ok(payload.p_rows.every(row => row.name.startsWith('Hager')));
      assert.ok(!payload.p_rows.some(row => row.article_number === '000001' || row.article_number === '000042'));
      assert.ok(payload.p_rows.some(row => row.article_number === '000049'));
      assert.equal(payload.p_rows.find(row => row.article_number === '000003').recommended_price_1, 4.75);
      assert.equal(await page.evaluate(() => window.__catalog911.state.rows.materials.length), 24);
    });

    await reset();
    await page.locator('[name="supplier_price_policy"]').selectOption('list-vk');
    await chooseFile('datanorm.001', 'V'.padEnd(123, ' ') + '04EUR\nA;N;001234;;Synthetischer Hersteller;B16;1;2;ST;25000;RG;WG;LG\n');
    await readBySearch('001234');
    await test('explicit list-price policy maps DATANORM list value to VK-star without inventing EK', async () => {
      assert.equal(await rowInput(0, 'article_number').inputValue(), '001234');
      assert.equal(await rowInput(0, 'purchase_price').inputValue(), '');
      assert.equal(await rowInput(0, 'recommended_price_1').inputValue(), '250.00');
      assert.equal(await rowInput(0, 'recommended_price_2').inputValue(), '');
      assert.equal(await rowInput(0, 'price_unit').inputValue(), '100');
      assert.equal(await page.locator('[name="map_recommended_price_1"]').inputValue(), 'source_list_price');
      assert.equal(await page.locator('details[data-supplier-mapping]').getAttribute('open'), null);
    });
    const dat = await prepareAndImport();
    await test('DATANORM per100 VK-star is normalized once and adopted as the synthetic standard net price', async () => {
      assert.equal(dat.request.body.p_rows[0].recommended_price_1, 2.5);
      assert.ok(!Object.hasOwn(dat.request.body.p_rows[0], 'purchase_price'));
      assert.equal(dat.request.body.p_use_vk1, true);
      assert.equal(await page.evaluate(() => window.__catalog911.state.rows.materials[0].unit_price), 2.5);
    });
    await reset();
    await chooseFile('ek-ohne-vk.csv', 'Artikelnummer;Artikelname;Einheit;EK netto\n009999;Synthetischer Artikel ohne Verkaufspreis;Stk;4,50\n');
    await readBySearch('009999');
    await test('a missing new-article VK-star stays blank and blocks saving rather than silently becoming zero', async () => {
      assert.equal(await rowInput(0, 'recommended_price_1').inputValue(), '');
      await page.locator('[name="supplier_name"]').fill('Synthetischer Vertrieb');
      await page.locator('[name="supplier_net"]').check();
      await page.locator('form[data-form="supplier-prepare"] button').click();
      assert.equal(await page.locator('[data-supplier-prepared]').count(), 0);
      assert.match(await page.locator('.supplier-catalog .catalog-status').innerText(), /009999.*fehlt VK \*/);
      assert.equal(await rowInput(0, 'recommended_price_1').inputValue(), '');
      assert.equal(await page.evaluate(() => window.__catalog911.calls.length), 0);
    });
    await test('changing to another company or employee clears catalog search and pending source rows', async () => {
      const result = await page.evaluate(() => {
        const h = window.__catalog911; h.state.company = 'synthetic-B'; h.render();
        const foreign = document.querySelector('#root').textContent;
        const searchValue = document.querySelector('[name="supplier_filter"]').value;
        h.state.profile = { id: 'synthetic-worker', role: 'employee' }; h.render();
        return { foreign, searchValue, catalogCount: document.querySelectorAll('[data-catalog-v908]').length };
      });
      assert.ok(!result.foreign.includes('009999'));
      assert.ok(!result.foreign.includes('Synthetischer Vertrieb'));
      assert.equal(result.searchValue, '');
      assert.equal(result.catalogCount, 0);
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    console.log(JSON.stringify({ passed, realBackendRequests: 0, externalRequests: requests.length, allRowsSynthetic: true }));
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error.stack); server.close(); process.exitCode = 1; });
