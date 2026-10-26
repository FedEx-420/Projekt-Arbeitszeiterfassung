'use strict';
/* Synthetic loopback-only UI regression. Never opens the real app, accounts or Supabase. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const dir = path.resolve(__dirname, '../..');
const styles = [...fs.readFileSync(path.join(dir, 'index.html'), 'utf8').matchAll(/<link rel="stylesheet" href="([^"?]+)(?:\?[^\"]*)?"/g)].map(match => match[1]);
const scripts = ['catalog-format-v908.js', 'catalog-import-v909.js', 'catalog-import-ui-v910.js', 'catalog-ui-v908.js'];
const allowed = new Set([...styles, ...scripts]);
const html = '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + styles.map(name => `<link rel="stylesheet" href="/${name}">`).join('') + '<body><main class="app-shell" id="root"></main>' + scripts.map(name => `<script src="/${name}"></script>`).join('') + '</body></html>';
const fixture = Array.from({ length: 24 }, (_, index) => ({
  sku: String(index + 1).padStart(6, '0'), name: 'Hager Leitungsschutzschalter B16 Bauteil ' + String(index + 1).padStart(2, '0')
})).concat([
  { sku: '000025', name: 'Hager Leitungsschutzschalter B20' },
  { sku: '000026', name: 'Eaton Leitungsschutzschalter B16' },
  { sku: '000027', name: 'Hager Trennschalter B16' },
  { sku: '000028', name: 'Hager Leitungsschutzschalter C16' }
]);
const csv = 'Artikelnummer;Artikelname;Einheit;EK netto;VK* netto;VK** netto\n' + fixture.map(row => [row.sku, row.name, 'Stk', '1,25', '2,50', '3,75'].join(';')).join('\n') + '\n';
const typo = 'Hagr Leitungszchutzschalter B16';
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://127.0.0.1').pathname.slice(1);
  if (!name) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
  if (!allowed.has(name)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8');
  res.end(fs.readFileSync(path.join(dir, name)));
});

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [], externalRequests = [];
  let passed = 0;
  const test = async (name, run) => { await run(); passed++; console.log('PASS ' + name); };
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    externalRequests.push(url.origin + url.pathname);
    return route.abort();
  });
  const search = () => page.locator('[name="supplier_filter"]');
  const names = () => page.locator('[data-supplier-field="name"]').evaluateAll(elements => elements.map(element => element.value));
  async function reset() {
    await page.goto(origin);
    await page.evaluate(() => {
      const root = document.querySelector('#root');
      const state = { profile: { id: 'synthetic-chief', role: 'business' }, company: 'synthetic-A', rows: { materials: [] } };
      const calls = [];
      const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      let feature;
      const render = () => { root.innerHTML = feature.view(); feature.afterRender(); };
      feature = window.WorktimeCatalog.create({ root, state, escape, render,
        businessId: () => state.company,
        isManager: () => state.profile?.role === 'business',
        reload: async () => {},
        api: async (url, request) => {
          if (url !== '/rest/v1/rpc/import_material_catalog_v911') throw Error('Unexpected synthetic endpoint.');
          const payload = request.body;
          if (payload.p_company !== 'synthetic-A' || payload.p_use_vk1 !== true || payload.p_confirm_net_eur !== true) throw Error('Unsafe synthetic import.');
          calls.push(structuredClone({ url, request }));
          state.rows.materials.push(...payload.p_rows.map(row => ({ ...row, business_id: payload.p_company })));
          return { company_id: payload.p_company, created: payload.p_rows.length, updated: 0, unchanged: 0,
            catalog_import_version: 911, standard_price_source: 'recommended_price_1',
            standard_prices_updated: payload.p_rows.length, unit_price_changed: true };
        }
      });
      window.__fuzzy912 = { feature, state, calls, render };
      render();
    });
    await page.locator('[name="supplier_file"]').setInputFiles({ name: 'synthetischer-katalog.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  }
  async function read(query = '') {
    await search().fill(query);
    await search().press('Enter');
    await page.waitForFunction(() => !document.querySelector('[name="supplier_filter"]').disabled && document.querySelector('.supplier-review'));
  }
  try {
    await reset();
    await test('search hint explains spelling tolerance, targeted article numbers and no automatic substitution', async () => {
      assert.equal(await search().getAttribute('aria-describedby'), 'supplier-search-help');
      const hint = await page.locator('#supplier-search-help').innerText();
      assert.match(hint, /ähnlicher Schreibweise.*Tippfehlern/);
      assert.match(hint, /Artikelnummern.*B16.*gezielt/);
      assert.match(hint, /nicht automatisch ersetzt/);
    });
    await read(typo);
    await test('whole-file search finds names despite missing and mistyped letters without changing source names', async () => {
      assert.equal(await page.locator('.supplier-row').count(), 20);
      assert.match(await page.locator('[data-supplier-count]').innerText(), /24 Treffer in 24 geladenen Artikeln/);
      assert.deepEqual(await names(), fixture.slice(0, 20).map(row => row.name));
      assert.equal(await page.evaluate(() => window.__fuzzy912.calls.length), 0);
    });

    await reset();
    await read();
    await test('all source rows are retained before live typo filtering', async () => {
      assert.match(await page.locator('[data-supplier-count]').innerText(), /28 Treffer in 28 geladenen Artikeln/);
    });
    for (const [width, height] of [[320, 780], [390, 844], [844, 390], [1366, 768]]) {
      await test(`live typo search preserves its input, focus and layout at ${width} x ${height}`, async () => {
        await page.setViewportSize({ width, height });
        await search().fill('');
        await search().focus();
        await page.evaluate(() => { window.__searchNode912 = document.querySelector('[name="supplier_filter"]'); });
        for (const letter of typo) {
          await search().pressSequentially(letter);
          assert.equal(await search().evaluate(element => element === window.__searchNode912 && document.activeElement === element), true);
        }
        assert.equal(await search().inputValue(), typo);
        assert.match(await page.locator('[data-supplier-count]').innerText(), /24 Treffer in 28 geladenen Artikeln/);
        assert.deepEqual(await names(), fixture.slice(0, 20).map(row => row.name));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(await page.locator('.supplier-catalog input,.supplier-catalog select,.supplier-catalog button').evaluateAll(elements => elements.filter(element => {
          const rect = element.getBoundingClientRect(); return rect.width && (rect.left < -.5 || rect.right > innerWidth + .5);
        }).map(element => element.name || element.textContent)), []);
      });
    }
    await test('numeric article lookup remains targeted and a changed type is not guessed', async () => {
      await search().fill('000012');
      assert.equal(await page.locator('.supplier-row').count(), 1);
      assert.equal(await page.locator('[data-supplier-field="article_number"]').inputValue(), '000012');
      await search().fill('Hagr B61');
      assert.equal(await page.locator('.supplier-row').count(), 0);
      await search().fill('00001X');
      assert.equal(await page.locator('.supplier-row').count(), 0);
      assert.equal(await page.evaluate(() => window.__fuzzy912.calls.length), 0);
    });
    await search().fill(typo);
    await page.locator('[data-supplier-action="next-page"]').click();
    await test('the next fuzzy result page contains only matching originals', async () => {
      assert.equal(await page.locator('.supplier-row').count(), 4);
      assert.deepEqual(await names(), fixture.slice(20, 24).map(row => row.name));
    });
    await page.locator('[data-supplier-action="prev-page"]').click();
    await page.locator('[data-supplier-row="0"][data-supplier-field="included"]').uncheck();
    await page.locator('[name="supplier_name"]').fill('Synthetischer Vertrieb');
    await page.locator('[name="supplier_net"]').check();
    await page.locator('form[data-form="supplier-prepare"] button').click();
    await page.locator('[data-supplier-prepared]').waitFor();
    await test('fuzzy matches remain review-only until explicit final confirmation', async () => {
      assert.equal(await page.evaluate(() => window.__fuzzy912.calls.length), 0);
      assert.match(await page.locator('[data-supplier-prepared]').innerText(), /23 Artikel/);
    });
    await page.locator('[name="supplier_confirm"]').check();
    await page.locator('form[data-form="supplier-import"] button').click();
    await page.waitForFunction(() => window.__fuzzy912.calls.length === 1 && !document.querySelector('[name="supplier_filter"]').disabled);
    await test('only selected fuzzy matches are imported; hidden types, other brands and unchecked rows are absent', async () => {
      const call = await page.evaluate(() => window.__fuzzy912.calls[0]);
      assert.equal(call.url, '/rest/v1/rpc/import_material_catalog_v911');
      assert.equal(call.request.body.p_use_vk1, true);
      assert.equal(call.request.body.p_rows.length, 23);
      assert.deepEqual(call.request.body.p_rows.map(row => row.article_number), fixture.slice(1, 24).map(row => row.sku));
      assert.deepEqual(call.request.body.p_rows.map(row => row.name), fixture.slice(1, 24).map(row => row.name));
      for (const row of call.request.body.p_rows) {
        assert.equal(row.purchase_price, 1.25);
        assert.equal(row.recommended_price_1, 2.5);
        assert.equal(row.recommended_price_2, 3.75);
      }
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
    console.log(JSON.stringify({ passed, allRowsSynthetic: true, realBackendRequests: 0, externalRequests: 0 }));
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error.stack); server.close(); process.exitCode = 1; });
