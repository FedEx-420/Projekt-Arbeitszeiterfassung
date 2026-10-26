'use strict';
// Synthetic local catalog content only. No real catalogs, network or database access.
const assert = require('node:assert/strict');
const C = require('../../catalog-import-v909.js');
const file = (source, name = 'synthetic-catalog.csv') => new File([source], name);
const row = (name = 'Schuko Steckdose weiß', article_number = '000123') => ({
  name, article_number, supplier: 'Sonderlieferant', purchase_price: '9876,50',
  recommended_price_1: '9999,50', recommended_price_2: '9998,50', unit: 'Kg'
});
const datHeader = 'V'.padEnd(123, ' ') + '04EUR';
const datArticle = (id, name) => `A;N;${id};;${name};;2;0;Stk;1250;RG;WG;LG`;

async function main() {
  let passed = 0, failed = 0;
  const test = async (name, fn) => {
    try { await fn(); passed++; console.log('PASS ' + name); }
    catch (e) { failed++; console.error('FAIL ' + name + '\n' + e.stack); }
  };
  await test('empty query still matches every article', () => {
    for (const query of ['', '  \t\n  ']) assert.equal(C.matchesArticle(row(), query), true);
  });
  await test('exact case-insensitive name and partial name searches remain supported', () => {
    for (const query of ['steckdose', 'STECKDOSE', 'Schuko', 'steck', 'dose'])
      assert.equal(C.matchesArticle(row(), query), true, query);
  });
  await test('a missing letter in an alphabetic name is tolerated', () => {
    assert.equal(C.matchesArticle(row(), 'Stekdose'), true);
    assert.equal(C.matchesArticle(row('Kabel'), 'Kabl'), true);
  });
  await test('an extra letter in an alphabetic name is tolerated', () => {
    assert.equal(C.matchesArticle(row(), 'Steckxdose'), true);
    assert.equal(C.matchesArticle(row('Kabel'), 'Kabell'), true);
  });
  await test('a substituted letter in an alphabetic name is tolerated', () => {
    assert.equal(C.matchesArticle(row(), 'Steckdise'), true);
    assert.equal(C.matchesArticle(row('Kabel'), 'Kabxl'), true);
  });
  await test('an adjacent letter transposition counts as one name typo', () => {
    assert.equal(C.matchesArticle(row(), 'Stcekdose'), true);
    assert.equal(C.matchesArticle(row('Kabel'), 'Kbael'), true);
  });
  await test('long alphabetic search tokens tolerate two edits', () => {
    assert.equal(C.matchesArticle(row(), 'Stekkdoxe'), true);
    assert.equal(C.matchesArticle(row(), 'Stekdoxe'), true);
  });
  await test('shorter alphabetic search tokens do not tolerate two edits', () => {
    assert.equal(C.matchesArticle(row('Kabel'), 'Kebxl'), false);
  });
  await test('very short tokens stay exact substrings rather than fuzzy words', () => {
    assert.equal(C.matchesArticle(row('Rot Kabel'), 'rot'), true);
    assert.equal(C.matchesArticle(row('Rot Kabel'), 'rat'), false);
    assert.equal(C.matchesArticle(row('LED Leuchte'), 'LDE'), false);
  });
  await test('an incomplete misspelled compound name can still be found', () => {
    assert.equal(C.matchesArticle(row('Schukosteckdose'), 'Stekdose'), true);
  });
  await test('every query token must match even when a name token is fuzzy', () => {
    assert.equal(C.matchesArticle(row(), 'Schuko Stekdose 000123'), true);
    assert.equal(C.matchesArticle(row(), '000123 Stekdose Schuko'), true);
    assert.equal(C.matchesArticle(row(), 'Stekdose rot'), false);
    assert.equal(C.matchesArticle(row(), '000124 Stekdose'), false);
  });
  await test('German umlauts and digraphs retain exact and fuzzy behavior', () => {
    const source = row('Ölführung weiß Käfig Überwurf');
    assert.equal(C.matchesArticle(source, 'oelfuehrung weiss kaefig ueberwurf'), true);
    assert.equal(C.matchesArticle(source, 'Kaefigg'), true);
    assert.equal(C.matchesArticle(source, 'Oelfuerhung'), true);
  });
  await test('composed and decomposed German characters are equivalent', () => {
    assert.equal(C.matchesArticle(row('Ka\u0308fig O\u0308l'), 'Käfig Öl'), true);
    assert.equal(C.matchesArticle(row('Käfig Öl'), 'Ka\u0308fig O\u0308l'), true);
  });
  await test('article-number substrings preserve leading-zero exact matching', () => {
    const source = row();
    for (const query of ['000123', '0012', '123']) assert.equal(C.matchesArticle(source, query), true, query);
    for (const query of ['000124', '0013', '000132']) assert.equal(C.matchesArticle(source, query), false, query);
    assert.equal(source.article_number, '000123');
  });
  await test('mixed technical model numbers are never fuzzy matched', () => {
    const source = row('Hager Leitungsschutzschalter B16');
    assert.equal(C.matchesArticle(source, 'B16'), true);
    for (const query of ['B10', 'B15', 'B61', 'C16']) assert.equal(C.matchesArticle(source, query), false, query);
  });
  await test('technical cross sections remain exact substrings', () => {
    const source = row('NYM-J Leitung 3x1,5');
    assert.equal(C.matchesArticle(source, '3x1,5'), true);
    for (const query of ['3x2,5', '5x1,5', '3x1.5']) assert.equal(C.matchesArticle(source, query), false, query);
  });
  await test('fuzzy matching is restricted to names and cannot change a SKU', () => {
    const source = row('Leitung blau', 'HAGER');
    assert.equal(C.matchesArticle(source, 'hager'), true);
    assert.equal(C.matchesArticle(source, 'hagr'), false);
    assert.equal(C.matchesArticle(source, 'hafer'), false);
  });
  await test('supplier, unit and price fields cannot become search matches', () => {
    const source = row();
    for (const query of ['Sonderlieferant', 'Sonderliefernt', '9876', '9999', 'Kg'])
      assert.equal(C.matchesArticle(source, query), false, query);
  });
  await test('mapped fields work with typos and ignore unmapped fallback names', () => {
    const source = { SKU: '000077', Bezeichnung: 'Steckdose blau', name: 'Schalter', supplier: 'Schaltdose' };
    const mapping = { article_number: 'SKU', name: 'Bezeichnung' };
    assert.equal(C.matchesArticle(source, '000077 Stekdose blau', mapping), true);
    assert.equal(C.matchesArticle(source, 'Schalter', mapping), false);
    assert.equal(C.matchesArticle(source, 'Schaltdose', mapping), false);
  });
  await test('unrelated article names stay excluded', () => {
    const source = row('Schuko Steckdose weiß');
    for (const query of ['Transformator', 'Leitungsschutzschalter', 'Montagekleber', 'Hammer'])
      assert.equal(C.matchesArticle(source, query), false, query);
  });
  await test('matching does not mutate a source row or mapping', () => {
    const source = Object.freeze(row()), mapping = Object.freeze({ article_number: 'article_number', name: 'name' });
    const before = JSON.stringify(source);
    assert.equal(C.matchesArticle(source, 'Stekdose 000123', mapping), true);
    assert.equal(JSON.stringify(source), before);
    assert.deepEqual(mapping, { article_number: 'article_number', name: 'name' });
  });
  await test('CSV reader uses the same fuzzy matching before pagination', async () => {
    const source = file('Artikelnummer;Bezeichnung;Einheit;EK;VK*;VK**\n0001;Steckdose blau;Stk;1,00;2,00;3,00\n0002;Schukosteckdose weiß;Stk;4,00;5,00;6,00\n0003;Montagekleber rot;Stk;7,00;8,00;9,00\n');
    const first = await C.readCatalog(source, { articleFilter: 'Stekdose', maxRows: 1 });
    const second = await C.readCatalog(source, { articleFilter: 'Stekdose', maxRows: 1, offset: 1 });
    assert.equal(first.rows.length, 1); assert.equal(first.rows[0].Artikelnummer, '0001'); assert.equal(first.hasMore, true);
    assert.equal(second.rows.length, 1); assert.equal(second.rows[0].Artikelnummer, '0002'); assert.equal(second.hasMore, false);
    assert.equal(second.rows[0]['VK**'], '6,00');
    assert.equal(second.suggestedMapping.purchase_price, 'EK');
    assert.equal(second.suggestedMapping.recommended_price_1, 'VK*');
    assert.equal(second.suggestedMapping.recommended_price_2, 'VK**');
  });
  await test('CSV reader cannot fuzzy match numeric SKU or supplier text', async () => {
    const source = file('SKU;Name;Lieferant;EK\n000123;Steckdose;Transformator;9,00\n000124;Lampe;Leitungsschutzschalter;5,00\n');
    assert.equal((await C.readCatalog(source, { articleFilter: 'Stekdose 000124' })).rows.length, 0);
    assert.equal((await C.readCatalog(source, { articleFilter: 'Transformtor' })).rows.length, 0);
    assert.equal((await C.readCatalog(source, { articleFilter: '900' })).rows.length, 0);
    const found = await C.readCatalog(source, { articleFilter: 'Stekdose 000123' });
    assert.equal(found.rows.length, 1); assert.equal(found.rows[0].SKU, '000123');
  });
  await test('DATANORM reader uses fuzzy names without changing source IDs or prices', async () => {
    const source = file(datHeader + '\r\n' + [datArticle('000001', 'Steckdose blau'), datArticle('000002', 'Lampe rot')].join('\r\n'), 'datanorm.001');
    const found = await C.readCatalog(source, { articleFilter: 'Stekdose 000001' });
    assert.equal(found.rows.length, 1); assert.equal(found.rows[0].article_number, '000001');
    assert.equal(found.rows[0].name, 'Steckdose blau'); assert.equal(found.rows[0].source_net_price, '12.50');
    assert.equal((await C.readCatalog(source, { articleFilter: 'Stekdose 000002' })).rows.length, 0);
  });
  await test('a search does not modify the local file or subsequent unfiltered reads', async () => {
    const source = file('SKU;Name;EK\n0001;Steckdose;2,00\n0002;Lampe;4,00\n');
    const before = await source.text();
    const filtered = await C.readCatalog(source, { articleFilter: 'Stekdose' });
    const all = await C.readCatalog(source);
    assert.equal(filtered.rows.length, 1); assert.equal(all.rows.length, 2);
    assert.equal(await source.text(), before); assert.equal(all.rows[0].EK, '2,00'); assert.equal(all.rows[1].SKU, '0002');
  });
  console.log(JSON.stringify({ passed, failed, externalRequests: 0, productionWrites: 0 }));
  if (failed) process.exitCode = 1;
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
