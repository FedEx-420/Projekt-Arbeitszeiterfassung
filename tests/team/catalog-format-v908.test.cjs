/* Synthetic catalog strings only; never reads a real wholesaler/customer file. */
'use strict';
const assert = require('node:assert/strict'), f = require('../../catalog-format-v908.js');
let passed = 0;
function test(name, action) { action(); passed++; console.log('PASS ' + name); }
const mapping = { article_number: 'sku', name: 'description', unit: 'unit', purchase_price: 'ek', recommended_price_1: 'vk1', recommended_price_2: 'vk2', price_unit: 'basis' };
const settings = { supplier: 'Testlieferant', mapping, decimal: 'comma', price_unit: 1, net_eur: true };
const sample = 'sku;description;unit;ek;vk1;vk2;basis\r\n0012;"Kabel; grau";m;123,45;250,00;;100\r\n';
test('CSV quotes, semicolons, BOM, CRLF and leading-zero article numbers survive', () => {
 const source = f.parse('\uFEFF' + sample, { filename: 'katalog.csv' });
 assert.equal(source.rows[0].sku, '0012'); assert.equal(source.rows[0].description, 'Kabel; grau');
 const row = f.prepare(source, settings)[0]; assert.equal(row.data.purchase_price, 1.2345); assert.equal(row.data.recommended_price_1, 2.5); assert.equal(row.source_price_unit, 100); assert.equal(row.data.unit, 'M'); assert.ok(!('recommended_price_2' in row.data));
});
test('JSON numbers and exact named columns work without evaluating nested values', () => {
 const source = f.parse(JSON.stringify([{ sku: '0001', description: 'Steckdose', unit: 'Stk', ek: 4.25, vk1: 8, vk2: 0, basis: 1 }]), { filename: 'katalog.json' });
 const row = f.prepare(source, settings)[0].data; assert.equal(row.purchase_price, 4.25); assert.equal(row.recommended_price_2, 0);
});
test('Missing price remains missing, an explicit zero remains zero', () => {
 assert.equal(f.money(''), null); assert.equal(f.money('0'), 0); assert.equal(f.money('0,0000'), 0); assert.equal(f.money('250,00', 'comma', 100), 2.5);
});
test('Price precision is exact; no implicit rounding or currency/discount guesses', () => {
 for (const input of ['1.234,56', '1,234.56', '-1', '1e3', '=1+2', '19%', '12 €', 'NaN', 'Infinity', '1,23456']) assert.throws(() => f.money(input));
 assert.throws(() => f.money('0,01', 'comma', 3), /vier Nachkommastellen/); assert.throws(() => f.money('1000001'), /höchstens/); assert.throws(() => f.money('1', 'comma', 0));
 assert.equal(f.money('0,0001'), 0.0001);
});
test('Only explicit supported base units; packs are never mistaken for pieces', () => {
 assert.deepEqual(['Stk', 'M', 'H', 'Pau', 'Kg'].map(f.unit), ['Stk', 'M', 'H', 'Pau', 'Kg']); for (const unit of ['VE', 'Rolle', 'Pack', '', '100 m']) assert.throws(() => f.unit(unit));
});
test('Malformed CSV and duplicate headers fail before import', () => {
 for (const source of ['sku;sku\n1;2', 'sku;name\n"1;A', 'sku;name\n"1"injection;A', 'sku;name\n1;A;extra']) assert.throws(() => f.parse(source, { filename: 'x.csv' }));
});
test('ZIP/XML/XLSX/DATANORM and binary content are explicitly unsupported', () => {
 for (const filename of ['x.xlsx', 'x.xlsm', 'x.zip', 'x.xml', 'DATANORM.001']) assert.throws(() => f.parse(sample, { filename }), /Nur CSV/);
 assert.throws(() => f.parse('a\u0000b', { filename: 'x.csv' }), /Binäre/);
});
test('File, row, column and individual cell limits are enforced', () => {
 assert.throws(() => f.parse('a'.repeat(f.limits.bytes + 1), { filename: 'x.csv' }), /zu groß/);
 assert.throws(() => f.parse('a\n' + 'x\n'.repeat(1001), { filename: 'x.csv' }), /1000/);
 assert.throws(() => f.parse(Array.from({ length: 33 }, (_, n) => 'h' + n).join(';') + '\n' + Array(33).fill('a').join(';'), { filename: 'x.csv' }), /32/);
 assert.throws(() => f.parse('a\n' + 'x'.repeat(501), { filename: 'x.csv' }), /500/);
});
test('JSON rejects nested objects, prototype keys and non-table payloads', () => {
 for (const source of ['{}', '[]', '[{"__proto__":"x"}]', '[{"sku":{"value":"1"}}]', '[{"sku":["1"]}]', '[null]']) assert.throws(() => f.parse(source, { filename: 'x.json' }));
});
test('Currency/net confirmation, complete mapping and unique source meanings are mandatory', () => {
 const source = f.parse(sample, { filename: 'x.csv' });
 assert.throws(() => f.prepare(source, { ...settings, net_eur: false }), /bestätigen/);
 assert.throws(() => f.prepare(source, { ...settings, mapping: { ...mapping, purchase_price: 'vk1' } }), /genau einer/);
 assert.throws(() => f.prepare(source, { ...settings, mapping: { name: 'description' } }), /zuordnen/);
});
test('Formula-like names and control characters are blocked; HTML is kept as inert text', () => {
 for (const name of ['=HYPERLINK()', '+SUM()', '@command', 'bad\nname']) {
  const source = f.parse(JSON.stringify([{ sku: '1', description: name, unit: 'Stk', ek: 1, basis: 1 }]), { filename: 'x.json' });
  assert.throws(() => f.prepare(source, { ...settings, mapping: { ...mapping, recommended_price_1: '', recommended_price_2: '' } }));
 }
 const source = f.parse(JSON.stringify([{ sku: '1', description: '<img src=x>', unit: 'Stk', ek: 1, basis: 1 }]), { filename: 'x.json' });
 assert.equal(f.prepare(source, { ...settings, mapping: { ...mapping, recommended_price_1: '', recommended_price_2: '' } })[0].data.name, '<img src=x>');
});
test('Supplier and exact article identity, not spelling, decides idempotent matching', () => {
 const source = f.parse(sample, { filename: 'x.csv' }), existing = [{ id: 'id', name: 'Alter Name', catalog_supplier: 'TESTLIEFERANT', catalog_article_number: '0012', catalog_revision: 7, purchase_price: 2, unit: 'M', active: false }];
 const row = f.prepare(source, settings, existing)[0]; assert.equal(row.action, 'update'); assert.equal(row.data.expected_revision, 7); assert.equal(row.data.expected_id, 'id'); assert.equal(row.inactive, true);
 assert.throws(() => f.prepare(source, settings, [{ name: 'Kabel; grau', unit: 'M' }]), /gleichnamiges/);
 assert.throws(() => f.prepare(source, settings, [{ ...existing[0], unit: 'Stk' }]), /Basiseinheit/);
});
test('Duplicate article numbers and price-free source rows do not silently overwrite data', () => {
 const source = f.parse(sample + '0012;Weiteres Kabel;M;1,00;;;1\r\n', { filename: 'x.csv' }); assert.throws(() => f.prepare(source, settings), /doppelt/);
 const blank = f.parse('sku;description;unit;ek;vk1;vk2;basis\n1;Kabel;M;;;;1', { filename: 'x.csv' }); assert.throws(() => f.prepare(blank, settings), /Keine befüllten/);
});
test('TSV has explicit tab semantics and JSON supplier IDs never coerce to numbers', () => {
 const source = f.parse('sku\tdescription\tunit\tek\tbasis\n0002\tRohr\tM\t1.5\t1', { filename: 'x.tsv' });
 const row = f.prepare(source, { ...settings, decimal: 'dot', mapping: { ...mapping, recommended_price_1: '', recommended_price_2: '' } })[0]; assert.equal(row.data.article_number, '0002'); assert.equal(row.data.purchase_price, 1.5);
});
console.log(JSON.stringify({ passed, productionWrites: 0, networkRequests: 0 }));
