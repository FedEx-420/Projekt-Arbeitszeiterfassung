'use strict';
// Synthetic local files only. No network, browser session, real catalog or database access.
const assert = require('node:assert/strict');
const C = require('../../catalog-import-v909.js');
const F = require('../../catalog-format-v908.js');
const file = (source, name) => new File([source], name);
const datHeader = 'V'.padEnd(123, ' ') + '04EUR';
const article = ({ id = '0000123', name = 'Kabel weiß', kind = '2', cents = '1250', basis = '0' } = {}) =>
  `A;N;${id};;${name};;${kind};${basis};M;${cents};RG;WG;LG`;
const dat = (...articles) => file(datHeader + '\r\n' + articles.join('\r\n'), 'datanorm.001');
const xml = (prices, options = {}) => file(`<BMECAT version="2005"><HEADER><CATALOG><CURRENCY>EUR</CURRENCY></CATALOG><SUPPLIER><SUPPLIER_NAME>Nur Lieferant 9876</SUPPLIER_NAME></SUPPLIER></HEADER><PRODUCT><SUPPLIER_PID>000077</SUPPLIER_PID><PRODUCT_DETAILS><DESCRIPTION_SHORT>Öl Leitung weiß</DESCRIPTION_SHORT></PRODUCT_DETAILS><PRODUCT_ORDER_DETAILS><ORDER_UNIT>MTR</ORDER_UNIT><PRICE_QUANTITY>100</PRICE_QUANTITY></PRODUCT_ORDER_DETAILS><PRODUCT_PRICE_DETAILS>${prices.map(({ type, amount, currency = 'EUR', extra = '' }) => `<PRODUCT_PRICE price_type="${type}"><PRICE_AMOUNT>${amount}</PRICE_AMOUNT><PRICE_CURRENCY>${currency}</PRICE_CURRENCY>${extra}</PRODUCT_PRICE>`).join('')}${options.extra || ''}</PRODUCT_PRICE_DETAILS></PRODUCT></BMECAT>`, 'catalog.xml');

async function main() {
  let passed = 0, failed = 0;
  const test = async (name, fn) => {
    try { await fn(); passed++; console.log('PASS ' + name); }
    catch (e) { failed++; console.error('FAIL ' + name + '\n' + e.stack); }
  };
  await test('exports automaticMapping, matchesArticle and local readCatalog', () => {
    for (const key of ['automaticMapping', 'matchesArticle', 'readCatalog']) assert.equal(typeof C[key], 'function');
  });
  await test('explicit German EK and VK-star headers map without exchanging the prices', () => {
    const headers = ['Artikelnummer', 'Bezeichnung', 'Einheit', 'EK netto (€)', 'VK* netto EUR', 'VK** netto EUR'];
    const rows = [{ 'Artikelnummer': '0001', 'Bezeichnung': 'Kabel', 'EK netto (€)': '1,00', 'VK* netto EUR': '2,00', 'VK** netto EUR': '3,00' }];
    const mapping = C.automaticMapping(headers, rows);
    assert.equal(mapping.article_number, 'Artikelnummer'); assert.equal(mapping.name, 'Bezeichnung');
    assert.equal(mapping.purchase_price, 'EK netto (€)'); assert.equal(mapping.recommended_price_1, 'VK* netto EUR'); assert.equal(mapping.recommended_price_2, 'VK** netto EUR');
  });
  await test('common purchase-price aliases are recognized separately', () => {
    for (const label of ['Einkaufspreis', 'EK', 'EK Preis netto', 'Einstandspreis netto', 'purchase_price']) {
      const mapping = C.automaticMapping(['SKU', 'Name', label], [{ SKU: '007', Name: 'Test', [label]: '2,50' }]);
      assert.equal(mapping.purchase_price, label, label);
    }
  });
  await test('explicit VK1 and VK2 aliases preserve their own price columns', () => {
    for (const [one, two] of [['VK*', 'VK**'], ['VK1 netto', 'VK2 netto'], ['recommended_price_1', 'recommended_price_2']]) {
      const mapping = C.automaticMapping([one, two], [{ [one]: '4,00', [two]: '6,00' }]);
      assert.equal(mapping.recommended_price_1, one); assert.equal(mapping.recommended_price_2, two);
    }
  });
  await test('generic clearly named netto VK fills only the first selling-price slot', () => {
    const mapping = C.automaticMapping(['VK netto', 'Name'], [{ 'VK netto': '5,00', Name: 'Kabel' }]);
    assert.equal(mapping.recommended_price_1, 'VK netto'); assert.equal(mapping.recommended_price_2, undefined);
  });
  await test('ambiguous duplicate EK headings never silently choose one', () => {
    const mapping = C.automaticMapping(['EK', 'Einkaufspreis'], [{ EK: '1,00', Einkaufspreis: '2,00' }]);
    assert.equal(mapping.purchase_price, undefined);
  });
  await test('ambiguous duplicate SKU headings never silently choose one', () => {
    const mapping = C.automaticMapping(['Artikelnummer', 'SKU'], [{ Artikelnummer: '0001', SKU: '0002' }]);
    assert.equal(mapping.article_number, undefined);
  });
  await test('gross, VAT, supplier and unit-cost text do not become a nettoselling price', () => {
    const headers = ['Bruttopreis', 'VK brutto', 'Umsatzsteuer', 'Lieferant', 'Preis auf Anfrage'];
    const mapping = C.automaticMapping(headers, [Object.fromEntries(headers.map(h => [h, '19,00']))], { listAsSellingPrice: true });
    assert.equal(mapping.purchase_price, undefined); assert.equal(mapping.recommended_price_1, undefined); assert.equal(mapping.recommended_price_2, undefined);
  });
  await test('DATANORM source_net_price is recognized as EK without filling an invented VK', async () => {
    const result = await C.readCatalog(dat(article()));
    assert.equal(result.rows[0].source_net_price, '12.50'); assert.equal(result.suggestedMapping.purchase_price, 'source_net_price');
    assert.notEqual(result.suggestedMapping.recommended_price_1, 'source_net_price'); assert.notEqual(result.suggestedMapping.recommended_price_2, 'source_net_price');
    assert.equal(result.rows[0].purchase_price, '');
  });
  await test('DATANORM list price stays raw by default instead of becoming EK or VK', async () => {
    const result = await C.readCatalog(dat(article({ kind: '1' })));
    assert.equal(result.rows[0].source_list_price, '12.50');
    assert.notEqual(result.suggestedMapping.purchase_price, 'source_list_price'); assert.notEqual(result.suggestedMapping.recommended_price_1, 'source_list_price');
  });
  await test('DATANORM list price can explicitly be selected as the first selling price', async () => {
    const result = await C.readCatalog(dat(article({ kind: '1' })), { listAsSellingPrice: true });
    assert.equal(result.suggestedMapping.recommended_price_1, 'source_list_price'); assert.notEqual(result.suggestedMapping.purchase_price, 'source_list_price');
  });
  await test('explicit existing selling-price column has priority over the raw list-price switch', () => {
    const mapping = C.automaticMapping(['VK*', 'source_list_price'], [{ 'VK*': '25,00', source_list_price: '30,00' }], { listAsSellingPrice: true });
    assert.equal(mapping.recommended_price_1, 'VK*');
  });
  await test('two different filled source-net fields are treated as ambiguous', () => {
    const mapping = C.automaticMapping(['source_net_price', 'source_net_customer'], [{ source_net_price: '12.00', source_net_customer: '15.00' }]);
    assert.equal(mapping.purchase_price, undefined);
  });
  await test('BMEcat net_customer is recognized as EK and net_list only on explicit selection', async () => {
    const source = xml([{ type: 'net_customer', amount: '250.00' }, { type: 'net_list', amount: '300.00' }]);
    const normal = await C.readCatalog(source), chosen = await C.readCatalog(source, { listAsSellingPrice: true });
    assert.equal(normal.suggestedMapping.purchase_price, 'source_net_customer'); assert.notEqual(normal.suggestedMapping.recommended_price_1, 'source_net_list');
    assert.equal(chosen.suggestedMapping.recommended_price_1, 'source_net_list'); assert.equal(chosen.rows[0].price_unit, '100');
  });
  await test('BMEcat nrp/gross can never automatically populate net EK or VK, even with list switch', async () => {
    const result = await C.readCatalog(xml([{ type: 'nrp', amount: '357.00' }]), { listAsSellingPrice: true });
    assert.equal(result.rows[0].source_recommended_gross, '357.00');
    for (const key of ['purchase_price', 'recommended_price_1', 'recommended_price_2']) assert.notEqual(result.suggestedMapping[key], 'source_recommended_gross');
  });
  await test('non-EUR/quantity-tier BMEcat prices are not mapped as known EK', async () => {
    for (const price of [{ type: 'net_customer', amount: '25.00', currency: 'USD' }, { type: 'net_customer', amount: '25.00', extra: '<LOWER_BOUND>10</LOWER_BOUND>' }]) {
      const result = await C.readCatalog(xml([price])); assert.equal(result.rows[0].source_net_customer, ''); assert.notEqual(result.suggestedMapping.purchase_price, 'source_net_customer');
    }
  });
  await test('an explicit zero is filled, whereas empty/null source prices are unresolved', () => {
    const headers = ['source_net_price', 'source_list_price'];
    assert.equal(C.automaticMapping(headers, [{ source_net_price: 0 }]).purchase_price, 'source_net_price');
    assert.equal(C.automaticMapping(headers, [{ source_net_price: '0.00', source_list_price: '0' }], { listAsSellingPrice: true }).recommended_price_1, 'source_list_price');
    for (const value of ['', '   ', null, undefined]) assert.equal(C.automaticMapping(headers, [{ source_net_price: value }]).purchase_price, undefined);
  });
  await test('DATANORM zero placeholders remain missing instead of falsely free EK', async () => {
    const result = await C.readCatalog(dat(article({ cents: '0' })));
    assert.equal(result.rows[0].source_net_price, ''); assert.notEqual(result.suggestedMapping.purchase_price, 'source_net_price'); assert.ok(result.rows[0]._review.length);
  });
  await test('CSV preserves textual zero and missing price as two different values', async () => {
    const result = await C.readCatalog(file('Artikelnummer;Bezeichnung;Einheit;EK\n0001;Kostenlos;Stk;0\n0002;Unbekannt;Stk;\n', 'k.csv'));
    assert.equal(result.rows[0].EK, '0'); assert.equal(result.rows[1].EK, '');
    assert.equal(F.money(result.rows[0].EK, 'comma', 1), 0); assert.equal(F.money(result.rows[1].EK, 'comma', 1), null);
  });
  await test('name or SKU substrings match but prices and supplier fields do not', () => {
    const row = { article_number: '000123', name: 'Leitung blau', supplier: 'Hager Sonderlieferant', source_net_price: '9876.50', unit: 'Kg' };
    assert.equal(C.matchesArticle(row, 'leitung'), true); assert.equal(C.matchesArticle(row, '0001'), true);
    for (const query of ['Hager', 'Sonderlieferant', '9876', 'Kg']) assert.equal(C.matchesArticle(row, query), false, query);
  });
  await test('multiword search requires every token across name and SKU', () => {
    const row = { article_number: '000123', name: 'Hager Leitung blau 3x1,5' };
    assert.equal(C.matchesArticle(row, 'hager 000123 blau'), true); assert.equal(C.matchesArticle(row, 'blau hager'), true);
    assert.equal(C.matchesArticle(row, 'hager rot'), false); assert.equal(C.matchesArticle(row, '000123 rot'), false);
    assert.equal(C.matchesArticle(row, '  \t '), true);
  });
  await test('search uses explicitly mapped article and description columns', () => {
    const row = { SKU: '000077', Bezeichnung: 'Kabel rot', Lieferant: 'Kabel blau', name: 'Ablenkung' };
    const mapping = { article_number: 'SKU', name: 'Bezeichnung' };
    assert.equal(C.matchesArticle(row, '000077 rot', mapping), true); assert.equal(C.matchesArticle(row, 'blau', mapping), false); assert.equal(C.matchesArticle(row, 'Ablenkung', mapping), false);
  });
  await test('German umlaut digraphs and sharp S match without losing leading zeros', () => {
    const row = { article_number: '000007', name: 'Ölführung weiß, Käfig mit Überwurf' };
    assert.equal(C.matchesArticle(row, '000007 oelfuehrung weiss kaefig ueberwurf'), true);
    assert.equal(C.matchesArticle(row, 'ÖLFÜHRUNG WEISS'), true); assert.equal(row.article_number, '000007');
  });
  await test('canonically equivalent decomposed and composed umlauts match both ways', () => {
    const composed = { article_number: '0001', name: 'Käfig Öl' }, decomposed = { article_number: '0001', name: 'Ka\u0308fig O\u0308l' };
    assert.equal(C.matchesArticle(composed, 'Ka\u0308fig O\u0308l'), true);
    assert.equal(C.matchesArticle(decomposed, 'Käfig Öl'), true);
  });
  await test('CSV reader filters by detected name/SKU and never by price or supplier', async () => {
    const source = file('SKU;Bezeichnung;Lieferant;EK\n0001;Leitung rot;Blau GmbH;9876,50\n0002;Leitung blau;Rot GmbH;5,00\n', 'k.csv');
    for (const query of ['9876', 'GmbH']) assert.equal((await C.readCatalog(source, { articleFilter: query })).rows.length, 0, query);
    const blue = await C.readCatalog(source, { articleFilter: 'leitung blau' }); assert.equal(blue.rows.length, 1); assert.equal(blue.rows[0].SKU, '0002');
  });
  await test('DATANORM reader keeps leading-zero IDs and searches name plus SKU only', async () => {
    const source = dat(article({ id: '000077', name: 'Leitung blau', cents: '987650' }), article({ id: '000078', name: 'Leitung rot', cents: '1250' }));
    assert.equal((await C.readCatalog(source, { articleFilter: '9876' })).rows.length, 0);
    const result = await C.readCatalog(source, { articleFilter: '000077 blau' }); assert.equal(result.rows.length, 1); assert.equal(result.rows[0].article_number, '000077'); assert.equal(result.rows[0].source_net_price, '9876.50');
  });
  await test('BMEcat reader searches product description/SKU but not supplier or prices', async () => {
    const source = xml([{ type: 'net_customer', amount: '6543.21' }]);
    for (const query of ['Lieferant', '9876', '6543']) assert.equal((await C.readCatalog(source, { articleFilter: query })).rows.length, 0, query);
    const result = await C.readCatalog(source, { articleFilter: '000077 oel weiss' }); assert.equal(result.rows.length, 1);
  });
  await test('search results keep the correct price/unit mapping per bounded page', async () => {
    const source = file('Artikelnummer;Name;Einheit;EK;VK*;VK**\n0001;Kabel blau;M;1,00;2,00;3,00\n0002;Kabel blau;M;4,00;5,00;6,00\n0003;Kabel rot;M;7,00;8,00;9,00\n', 'k.csv');
    const first = await C.readCatalog(source, { articleFilter: 'Kabel blau', maxRows: 1 });
    const second = await C.readCatalog(source, { articleFilter: 'Kabel blau', maxRows: 1, offset: 1 });
    assert.equal(first.hasMore, true); assert.equal(first.rows[0].Artikelnummer, '0001'); assert.equal(second.rows[0].Artikelnummer, '0002'); assert.equal(second.rows[0]['VK**'], '6,00');
    assert.equal(second.suggestedMapping.purchase_price, 'EK'); assert.equal(second.suggestedMapping.recommended_price_1, 'VK*'); assert.equal(second.suggestedMapping.recommended_price_2, 'VK**');
  });
  console.log(JSON.stringify({ passed, failed, externalRequests: 0, productionWrites: 0 }));
  if (failed) process.exitCode = 1;
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
