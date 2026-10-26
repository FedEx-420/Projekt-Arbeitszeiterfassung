'use strict';
/* Saved-material-list regression with synthetic rows, fresh browser context and
 * loopback assets only. This never opens the app or accesses real account data. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const dir = path.resolve(__dirname, '../..');
const styles = [...fs.readFileSync(path.join(dir, 'index.html'), 'utf8').matchAll(/<link rel="stylesheet" href="([^"?]+)(?:\?[^"]*)?"/g)].map(match => match[1]);
const scripts = ['catalog-format-v908.js', 'catalog-import-v909.js', 'catalog-ui-v908.js'];
const allowed = new Set([...styles, ...scripts]);
const html = '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + styles.map(name => `<link rel="stylesheet" href="/${name}">`).join('') + '<body><main class="app-shell" id="root"></main>' + scripts.map(name => `<script src="/${name}"></script>`).join('') + '</body></html>';
const server = http.createServer((request, response) => {
  const name = new URL(request.url, 'http://127.0.0.1').pathname.slice(1);
  if (!name) { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return; }
  if (!allowed.has(name)) { response.statusCode = 404; response.end(); return; }
  response.setHeader('Content-Type', name.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8');
  response.end(fs.readFileSync(path.join(dir, name)));
});

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [], externalRequests = [], unexpectedRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { externalRequests.push(url.origin + url.pathname); return route.abort(); }
    if (request.method() !== 'GET' || (url.pathname !== '/' && !allowed.has(url.pathname.slice(1)))) {
      unexpectedRequests.push(request.method() + ' ' + url.pathname); return route.abort();
    }
    return route.continue();
  });
  let passed = 0;
  const test = async (name, action) => { await action(); passed++; console.log('PASS ' + name); };
  const search = () => page.locator('[data-material-search]');
  const visibleIds = () => page.locator('[data-material-catalog-card]:visible [data-action="edit-material"]').evaluateAll(elements => elements.map(element => element.dataset.id));
  const queryIds = async query => { await search().fill(query); return visibleIds(); };
  try {
    await page.goto(origin);
    await page.evaluate(() => {
      const root = document.querySelector('#root');
      const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
      const state = {
        profile: { id: 'synthetic-chief', role: 'business' }, company: 'synthetic-A',
        rows: { materials: [
          { id: 'socket', business_id: 'synthetic-A', name: 'Berker 47598989 Doppelsteckdose SCHUKO Abdeckpl.erh.BS Berker S.1 polarweiss', catalog_article_number: '0047598989', catalog_supplier: 'Synthetischer Nordvertrieb', unit: 'Stk', unit_price: 8.75, purchase_price: 4.5, recommended_price_1: 8.75, recommended_price_2: 9.5 },
          { id: 'switch', business_id: 'synthetic-A', name: 'Berker Wippschalter polarweiss', catalog_article_number: '0047598990', catalog_supplier: 'Synthetischer Südvertrieb', unit: 'Stk', unit_price: 7.5 },
          { id: 'other-socket', business_id: 'synthetic-A', name: 'Jung Doppelsteckdose SCHUKO weiss', catalog_article_number: '00001458', catalog_supplier: 'Synthetischer Nordvertrieb', unit: 'Stk', unit_price: 6.25 },
          { id: 'b16', business_id: 'synthetic-A', name: 'Hager Leitungsschutz B16', catalog_article_number: '0000B16', catalog_supplier: 'Synthetischer Elektrovertrieb', unit: 'Stk', unit_price: 2.5 },
          { id: 'b10', business_id: 'synthetic-A', name: 'Hager Leitungsschutz B10', catalog_article_number: '0000B10', catalog_supplier: 'Synthetischer Elektrovertrieb', unit: 'Stk', unit_price: 2.5 },
          { id: 'foreign', business_id: 'synthetic-B', name: 'Berker Doppelsteckdose fremder Betrieb', catalog_article_number: '999991', catalog_supplier: 'Fremder Vertrieb', unit: 'Stk', unit_price: 13.5 }
        ] }
      };
      const calls = [];
      let feature;
      const isManager = () => ['business', 'administrator'].includes(state.profile?.role);
      const render = () => {
        root.innerHTML = '<section class="panel"><h2>Materialliste</h2>' + (isManager() ? state.rows.materials.filter(row => row.business_id === state.company).map(row => '<article class="row-card"><div><b>' + esc(row.name) + '</b><span>' + esc(row.unit_price) + ' / ' + esc(row.unit) + '</span></div><div class="actions"><button type="button" class="secondary small" data-action="edit-material" data-id="' + esc(row.id) + '">Bearbeiten</button></div></article>').join('') : '') + '</section>' + feature.view();
        feature.afterRender();
      };
      feature = window.WorktimeCatalog.create({ root, state, escape: esc, render, businessId: () => state.company, isManager,
        api: async (...args) => { calls.push(structuredClone(args)); throw Error('Unexpected synthetic write'); },
        reload: async () => { throw Error('Search must not reload account data'); }
      });
      window.__material913 = { state, calls, feature, render, original: JSON.stringify(state.rows.materials) };
      render();
    });
    await test('saved list initially contains only the current business and five searchable materials', async () => {
      assert.equal(await search().count(), 1);
      assert.deepEqual(await visibleIds(), ['socket', 'switch', 'other-socket', 'b16', 'b10']);
      assert.match(await page.locator('[data-material-search-count]').innerText(), /^5 von 5/);
      assert.ok(!(await page.locator('#root').innerText()).includes('fremder Betrieb'));
    });
    await test('Berker Steckdose finds the separated brand and compound product from the reported example', async () => {
      assert.deepEqual(await queryIds('Berker Steckdose'), ['socket']);
      assert.match(await page.locator('[data-material-search-count]').innerText(), /^1 von 5/);
    });
    await test('query words need not follow the article description order', async () => {
      assert.deepEqual(await queryIds('Steckdose Berker'), ['socket']);
    });
    await test('minor brand typo and compound product name remain searchable together', async () => {
      assert.deepEqual(await queryIds('Berkr Steckdose'), ['socket']);
    });
    await test('all query words are required so another brand is not returned for the Berker request', async () => {
      assert.deepEqual(await queryIds('Jung Steckdose'), ['other-socket']);
      assert.deepEqual(await queryIds('Berker unbekanntesprodukt'), []);
    });
    await test('article number remains searchable with leading zeros and mixed name-plus-SKU query', async () => {
      assert.deepEqual(await queryIds('0047598989'), ['socket']);
      assert.deepEqual(await queryIds('Berker 0047598989'), ['socket']);
      assert.deepEqual(await queryIds('0047598988'), []);
    });
    await test('electrical rating B16 is never fuzzily confused with B10 or B17', async () => {
      assert.deepEqual(await queryIds('Hagr B16'), ['b16']);
      assert.deepEqual(await queryIds('Hager B10'), ['b10']);
      assert.deepEqual(await queryIds('Hager B17'), []);
    });
    await test('existing supplier search is retained and can combine with words in the product name', async () => {
      assert.deepEqual(await queryIds('Nordvertrieb'), ['socket', 'other-socket']);
      assert.deepEqual(await queryIds('Berker Nordvertrieb Steckdose'), ['socket']);
      assert.deepEqual(await queryIds('Berker Südvertrieb'), ['switch']);
    });
    for (const [width, height] of [[320, 780], [390, 844], [844, 390], [1366, 768]]) {
      await test(`live per-character filtering preserves input node, focus and width at ${width} x ${height}`, async () => {
        await page.setViewportSize({ width, height });
        await search().fill('');
        await search().focus();
        await page.evaluate(() => { window.__materialInput913 = document.querySelector('[data-material-search]'); });
        for (const letter of 'Berker Steckdose') {
          await search().pressSequentially(letter);
          assert.equal(await search().evaluate(element => element === window.__materialInput913 && document.activeElement === element), true);
        }
        assert.deepEqual(await visibleIds(), ['socket']);
        assert.equal(await search().inputValue(), 'Berker Steckdose');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const rect = await search().boundingBox();
        assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= width + 1);
      });
    }
    await test('filtering is read-only and never changes materials, prices, metadata or requests', async () => {
      const result = await page.evaluate(() => ({ unchanged: JSON.stringify(window.__material913.state.rows.materials) === window.__material913.original, calls: window.__material913.calls }));
      assert.equal(result.unchanged, true);
      assert.deepEqual(result.calls, []);
    });
    await test('switching companies clears the search and displays only the new scoped material', async () => {
      await page.evaluate(() => { const h = window.__material913; h.state.company = 'synthetic-B'; h.render(); });
      assert.equal(await search().inputValue(), '');
      assert.deepEqual(await visibleIds(), ['foreign']);
      assert.match(await page.locator('[data-material-search-count]').innerText(), /^1 von 1/);
      assert.ok(!(await page.locator('#root').innerText()).includes('0047598989'));
      assert.deepEqual(await queryIds('Berker Steckdose'), ['foreign']);
    });
    await test('administrator scope reuses the matcher while employee scope exposes no catalog controls', async () => {
      await page.evaluate(() => { const h = window.__material913; h.state.company = 'synthetic-A'; h.state.profile = { id: 'synthetic-admin', role: 'administrator' }; h.render(); });
      assert.equal(await search().inputValue(), '');
      assert.deepEqual(await queryIds('Steckdose Berker'), ['socket']);
      await page.evaluate(() => { const h = window.__material913; h.state.profile = { id: 'synthetic-worker', role: 'employee' }; h.render(); });
      assert.equal(await search().count(), 0);
      assert.equal(await page.locator('[data-catalog-v908]').count(), 0);
      assert.equal(await page.evaluate(() => window.__material913.calls.length), 0);
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(unexpectedRequests, []);
    console.log(JSON.stringify({ passed, realBackendRequests: 0, externalRequests: 0, writes: 0, allRowsSynthetic: true }));
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error.stack); server.close(); process.exitCode = 1; });
