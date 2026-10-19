/* Pure VM lifecycle/DOM-adapter checks, not browser automation or production calls. */
'use strict';
const assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
const format = require('../../catalog-format-v908.js');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../catalog-ui-v908.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(() => setImmediate(resolve)));
function fixture() {
 const listeners = {}, controls = {}, calls = [], state = { profile: { id: 'chief', role: 'business' }, rows: { materials: [{ id: 'm1', business_id: 'firm', name: '<Kabel>', unit: 'M', unit_price: 9.5, purchase_price: 1.25, recommended_price_1: 2.5, recommended_price_2: null, catalog_revision: 1 }] } };
 let company = 'firm', renders = 0, reloads = 0, impl = async (path, options) => {
  if (path.includes('save_material')) { const b = options.body, row = state.rows.materials.find(m => m.id === b.p_id); assert.equal(row.catalog_revision, b.p_revision); Object.assign(row, b.p_prices, { catalog_supplier: b.p_supplier, catalog_article_number: b.p_article_number }); row.catalog_revision++; return row; }
  const count = options.body.p_rows.length; return { company_id: company, created: count, updated: 0, unchanged: 0 };
 };
 const root = { addEventListener: (name, fn) => listeners[name] = fn, querySelectorAll: () => [], querySelector: selector => controls[selector] };
 const escape = input => String(input ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
 class FormData { constructor(form) { this.values = Object.entries(form.data || {}); } [Symbol.iterator]() { return this.values[Symbol.iterator](); } }
 const context = { window: { WorktimeCatalogFormat: format }, FormData, TextDecoder, Promise, console };
 vm.runInNewContext(source, context);
 const feature = context.window.WorktimeCatalog.create({ root, state, api: async (path, options) => { calls.push({ path, options }); return impl(path, options); }, reload: async () => { reloads++; }, render: () => { renders++; feature.view(); }, businessId: () => company, isManager: () => ['business', 'administrator'].includes(state.profile?.role), escape });
 const change = (name, value, closest = null) => listeners.change({ target: { name, value, closest: () => closest } });
 const submit = async (kind, data, elements = {}) => { listeners.submit({ target: { dataset: { form: kind }, data, elements }, preventDefault() {}, stopImmediatePropagation() {} }); await flush(); };
 const click = async task => { listeners.click({ target: { closest: () => ({ dataset: { catalogAction: task } }) }, preventDefault() {}, stopImmediatePropagation() {} }); await flush(); };
 feature.view();
 return { feature, state, controls, calls, change, submit, click, setCompany: v => company = v, setApi: value => impl = value, renders: () => renders, reloads: () => reloads };
}
async function main() {
 let passed = 0; const test = async (name, fn) => { await fn(); passed++; console.log('PASS ' + name); };
 await test('Material UI escapes source names and preserves German decimal values', async () => { const f = fixture(); f.change('catalog_material', 'm1'); const html = f.feature.view(); assert.ok(html.includes('&lt;Kabel&gt;')); assert.ok(html.includes('value="1,25"')); assert.ok(html.includes('value="2,5"')); });
 await test('Manager saves nullable/zero prices through scoped RPC, not legacy standard-price mutations', async () => { const f = fixture(); f.change('catalog_material', 'm1'); await f.submit('catalog-prices-v908', { catalog_purchase_price: '', catalog_recommended_price_1: '0', catalog_recommended_price_2: '4,95', catalog_supplier: 'Lieferant', catalog_article_number: '0001' }); assert.equal(f.calls.length, 1); const b = f.calls[0].options.body; assert.equal(b.p_company, 'firm'); assert.equal(b.p_prices.purchase_price, null); assert.equal(b.p_prices.recommended_price_1, 0); assert.equal(b.p_prices.recommended_price_2, 4.95); assert.equal(f.state.rows.materials[0].unit_price, 9.5); assert.equal(f.reloads(), 1); });
 await test('A successful save advances captured revision, so a second edit does not use the old version', async () => { const f = fixture(); f.change('catalog_material', 'm1'); const data = { catalog_purchase_price: '1', catalog_recommended_price_1: '2', catalog_recommended_price_2: '', catalog_supplier: '', catalog_article_number: '' }; await f.submit('catalog-prices-v908', data); await f.submit('catalog-prices-v908', { ...data, catalog_purchase_price: '3' }); assert.deepEqual(f.calls.map(c => c.options.body.p_revision), [1, 2]); });
 await test('Validation and API failures retain entered values instead of clearing the editor', async () => { const f = fixture(); f.change('catalog_material', 'm1'); const data = { catalog_purchase_price: 'nicht gültig', catalog_recommended_price_1: '2', catalog_recommended_price_2: '', catalog_supplier: '', catalog_article_number: '' }; await f.submit('catalog-prices-v908', data); assert.equal(f.calls.length, 0); assert.ok(f.feature.view().includes('value="nicht gültig"')); f.setApi(async () => { throw Error('Versionskonflikt'); }); await f.submit('catalog-prices-v908', { ...data, catalog_purchase_price: '2,75' }); assert.ok(f.feature.view().includes('value="2,75"')); assert.ok(f.feature.view().includes('Versionskonflikt')); });
 await test('Employees receive no catalog controls and cannot trigger save requests', async () => { const f = fixture(); f.state.profile = { id: 'worker', role: 'employee' }; assert.equal(f.feature.view(), ''); await f.submit('catalog-prices-v908', {}); assert.equal(f.calls.length, 0); });
 await test('Company change clears selected material, locally parsed data and status', async () => { const f = fixture(); f.change('catalog_material', 'm1'); f.setCompany('other'); const html = f.feature.view(); assert.ok(!html.includes('catalog-prices-v908')); assert.ok(!html.includes('&lt;Kabel&gt;')); });
 await test('Unsupported and oversized files never get read or uploaded', async () => { const f = fixture(); let reads = 0; f.controls['[name="catalog_file"]'] = { files: [{ name: 'x.xlsm', size: 5, arrayBuffer: async () => { reads++; } }] }; await f.click('read'); assert.equal(reads, 0); assert.ok(f.feature.view().includes('nicht unterstützt')); f.controls['[name="catalog_file"]'].files[0] = { name: 'x.csv', size: format.limits.bytes + 1, arrayBuffer: async () => { reads++; } }; await f.click('read'); assert.equal(reads, 0); assert.equal(f.calls.length, 0); });
 await test('Local CSV preview does not save; explicit final confirmation sends only reviewed data', async () => {
  const f = fixture(), csv = 'article_number;name;unit;purchase_price;recommended_price_1;recommended_price_2;price_unit\n0002;Neue Dose;Stk;100,00;200,00;;100';
  f.controls['[name="catalog_file"]'] = { files: [{ name: 'katalog.csv', size: csv.length, arrayBuffer: async () => new TextEncoder().encode(csv).buffer }] }; f.controls['[name="catalog_encoding"]'] = { value: 'utf-8' }; f.controls['[name="catalog_delimiter"]'] = { value: ';' };
  await f.click('read'); assert.equal(f.calls.length, 0); assert.ok(f.feature.view().includes('katalog.csv'));
  const data = { catalog_supplier: 'Testlieferant', catalog_decimal: 'comma', catalog_price_unit: '1', ...Object.fromEntries(format.fields.map(k => ['catalog_map_' + k, k])) };
  await f.submit('catalog-preview-v908', data, { catalog_net: { checked: true } }); assert.equal(f.calls.length, 0); assert.ok(f.feature.view().includes('Quell-Preiseinheit'));
  await f.submit('catalog-import-v908', {}, { catalog_confirm: { checked: false } }); assert.equal(f.calls.length, 0);
  await f.submit('catalog-import-v908', {}, { catalog_confirm: { checked: true } }); assert.equal(f.calls.length, 1); const b = f.calls[0].options.body; assert.equal(b.p_rows[0].purchase_price, 1); assert.equal(b.p_rows[0].recommended_price_1, 2); assert.equal(b.p_rows[0].article_number, '0002'); assert.ok(!('file' in b));
 });
 console.log(JSON.stringify({ passed, productionWrites: 0, browserAutomation: false }));
}
main().catch(error => { console.error(error.stack); process.exit(1); });
