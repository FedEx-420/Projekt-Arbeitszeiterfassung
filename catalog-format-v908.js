/* Bounded supplier-catalog reader. No formulas, ZIP/XML, macros or network requests. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WorktimeCatalogFormat = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const limits = Object.freeze({ bytes: 2 * 1024 * 1024, rows: 1000, columns: 32, cell: 500 });
  const fields = Object.freeze(['article_number', 'name', 'unit', 'purchase_price', 'recommended_price_1', 'recommended_price_2', 'price_unit']);
  const prices = fields.slice(3, 6);
  function fail(message, row) { throw new Error((row ? 'Zeile ' + row + ': ' : '') + message); }
  function text(value, label, max = limits.cell) {
    const result = String(value ?? '').trim();
    if (!result || result.length > max || /[\u0000-\u001f\u007f-\u009f]/.test(result) || /^[=+@]/.test(result)) fail(label + ' fehlt oder enthält unzulässige Steuerzeichen/Formel-Inhalte.');
    return result;
  }
  function money(value, decimal = 'comma', basis = 1) {
    if (!['comma', 'dot'].includes(decimal)) fail('Dezimalzeichen ausdrücklich auswählen.');
    if (!Number.isSafeInteger(basis) || basis < 1 || basis > 100000) fail('Preiseinheit muss eine ganze Zahl von 1 bis 100000 sein.');
    const raw = typeof value === 'number' ? String(value) : String(value ?? '').trim();
    if (!raw) return null;
    const pattern = typeof value === 'number' || decimal === 'dot' ? /^(\d{1,12})(?:\.(\d{1,4}))?$/ : /^(\d{1,12})(?:,(\d{1,4}))?$/;
    const match = pattern.exec(raw);
    if (!match) fail('Preis muss positiv oder 0 sein, ohne Tausendertrennzeichen, Währung oder Formel und mit höchstens vier Nachkommastellen.');
    const ticks = BigInt(match[1]) * 10000n + BigInt((match[2] || '').padEnd(4, '0'));
    if (ticks % BigInt(basis) !== 0n) fail('Preis je Einheit hat mehr als vier Nachkommastellen. Bitte beim Lieferanten einen eindeutigen Stückpreis erfragen.');
    const normalized = ticks / BigInt(basis);
    if (normalized > 10000000000n) fail('Preis je Einheit darf höchstens 1000000 Euro betragen.');
    return Number(normalized) / 10000;
  }
  function unit(value) {
    const raw = String(value ?? '').trim().toLowerCase();
    const aliases = { stk: 'Stk', st: 'Stk', stück: 'Stk', stueck: 'Stk', m: 'M', meter: 'M', h: 'H', std: 'H', stunde: 'H', pau: 'Pau', pauschal: 'Pau', kg: 'Kg', kilogramm: 'Kg' };
    if (!Object.prototype.hasOwnProperty.call(aliases, raw)) fail('Einheit nicht unterstützt: ' + raw + '. Erlaubt sind Stk, M, H, Pau und Kg. Verpackungen nicht als Stückzahl raten.');
    return aliases[raw];
  }
  function csv(source, delimiter) {
    if (![';', ',', '\t'].includes(delimiter)) fail('CSV-Trennzeichen ausdrücklich auswählen.');
    const rows = [], row = []; let cell = '', quoted = false, afterQuote = false;
    const pushCell = () => { if (cell.length > limits.cell) fail('Zelle überschreitet 500 Zeichen.'); row.push(cell); cell = ''; afterQuote = false; if (row.length > limits.columns) fail('Höchstens 32 Spalten je Datei.'); };
    const pushRow = () => { pushCell(); if (row.some(v => v.trim() !== '')) rows.push(row.splice(0)); else row.length = 0; if (rows.length > limits.rows + 1) fail('Höchstens 1000 Artikel je Import. Bitte Katalog aufteilen.'); };
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (quoted) { if (ch === '"') { if (source[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; afterQuote = true; } } else cell += ch; }
      else if (ch === delimiter) pushCell();
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && source[i + 1] === '\n') i++; pushRow(); }
      else if (ch === '"' && cell === '' && !afterQuote) quoted = true;
      else { if (afterQuote) fail('Unerwarteter Text nach schließenden CSV-Anführungszeichen.'); cell += ch; }
      if (cell.length > limits.cell) fail('Zelle überschreitet 500 Zeichen.');
    }
    if (quoted) fail('Nicht geschlossene CSV-Anführungszeichen.');
    if (cell || row.length || afterQuote) pushRow();
    if (rows.length < 2) fail('Die Datei benötigt Überschriften und mindestens einen Artikel.');
    const headers = rows.shift().map(h => text(h, 'Spaltenüberschrift', 80));
    if (new Set(headers).size !== headers.length) fail('Spaltenüberschriften dürfen nicht doppelt vorkommen.');
    return { headers, rows: rows.map((r, i) => { if (r.length !== headers.length) fail('Spaltenzahl stimmt nicht mit der Überschrift überein.', i + 2); return Object.fromEntries(headers.map((h, j) => [h, r[j]])); }) };
  }
  function json(source) {
    let rows; try { rows = JSON.parse(source); } catch { fail('JSON ist nicht lesbar. Erwartet wird eine Liste einfacher Artikel-Objekte.'); }
    if (!Array.isArray(rows) || !rows.length || rows.length > limits.rows) fail('JSON muss eine Liste mit 1 bis 1000 Artikeln enthalten.');
    const headers = [];
    rows.forEach((r, i) => {
      if (!r || typeof r !== 'object' || Array.isArray(r)) fail('Jeder Artikel muss ein einfaches JSON-Objekt sein.', i + 1);
      const keys = Object.keys(r);
      if (keys.length > limits.columns) fail('Höchstens 32 Felder je Artikel.', i + 1);
      keys.forEach(k => {
        text(k, 'Feldname', 80); if (['__proto__', 'constructor', 'prototype'].includes(k)) fail('Unzulässiger Feldname.', i + 1);
        const value = r[k]; if (value !== null && !['string', 'number'].includes(typeof value)) fail('Verschachtelte Daten, Formeln oder Links werden nicht ausgeführt.', i + 1);
        if (String(value ?? '').length > limits.cell || typeof value === 'number' && !Number.isFinite(value)) fail('Zellwert zu lang oder ungültig.', i + 1);
        if (!headers.includes(k)) headers.push(k);
      });
    });
    if (headers.length > limits.columns) fail('Höchstens 32 verschiedene Felder je Datei.');
    return { headers, rows };
  }
  function parse(source, { filename, delimiter = ';' } = {}) {
    if (typeof source !== 'string' || new TextEncoder().encode(source).length > limits.bytes) fail('Datei ist zu groß (höchstens 2 MB).');
    source = source.replace(/^\uFEFF/, '');
    if (source.includes('\u0000')) fail('Binäre Dateien sind hier nicht zulässig.');
    const ext = String(filename || '').split('.').pop().toLowerCase();
    if (ext === 'csv' || ext === 'tsv') return csv(source, ext === 'tsv' ? '\t' : delimiter);
    if (ext === 'json') return json(source);
    fail('Nur CSV, TSV und JSON werden unterstützt. XLSX/ZIP/XML, Excel-Makros und DATANORM werden nicht geraten. Bitte einen CSV-Export des Großhändlers verwenden.');
  }
  function supplierKey(supplier, article) { return String(supplier).trim().toLowerCase() + '\u001f' + String(article).trim(); }
  function prepare(parsed, options, existing = []) {
    const supplier = text(options.supplier, 'Lieferant', 120), mapping = options.mapping || {}, decimal = options.decimal;
    if (options.net_eur !== true) fail('Bitte bestätigen, dass alle zugeordneten Preise EUR netto sind und bereits endgültige Einkaufspreise enthalten (keine noch abzuziehenden Rabatte).');
    for (const field of ['article_number', 'name', 'unit']) if (!mapping[field] || !parsed.headers.includes(mapping[field])) fail('Bitte ' + field + ' einer Spalte zuordnen.');
    const mapped = fields.filter(f => mapping[f]);
    if (mapped.some(f => !parsed.headers.includes(mapping[f])) || new Set(mapped.map(f => mapping[f])).size !== mapped.length) fail('Jede Quelle darf nur genau einer Bedeutung zugeordnet sein. EK und Verkaufspreise nicht vertauschen.');
    if (!prices.some(f => mapping[f])) fail('Mindestens EK oder einen empfohlenen Verkaufspreis zuordnen.');
    const keys = new Set(),names=new Set();
    return parsed.rows.map((row, index) => {
      try {
        if(typeof row[mapping.article_number]==='number'&&(!Number.isSafeInteger(row[mapping.article_number])||row[mapping.article_number]<0))fail('Artikelnummer ist als unsichere Zahl gespeichert. Die vollständige Artikelnummer als Text manuell angeben.');
        const article_number = text(row[mapping.article_number], 'Artikelnummer', 120), name = text(row[mapping.name], 'Artikelname', 200), normalizedUnit = unit(row[mapping.unit]);
        const key = supplierKey(supplier, article_number); if (keys.has(key)) fail('Artikelnummer ist innerhalb dieses Lieferanten doppelt.'); keys.add(key);
        const nameKey=name.toLowerCase();if(names.has(nameKey))fail('Artikelbezeichnung ist in dieser Auswahl doppelt. Bitte die Bezeichnung mit der Artikelnummer unterscheiden oder einen Artikel auslassen.');names.add(nameKey);
        const basisRaw = mapping.price_unit ? row[mapping.price_unit] : options.price_unit;
        if (!/^\d{1,6}$/.test(String(basisRaw ?? '').trim())) fail('Preiseinheit fehlt oder ist keine ganze Zahl.');
        const basis = Number(basisRaw), match = existing.filter(m => supplierKey(m.catalog_supplier || '', m.catalog_article_number || '') === key);
        if (match.length > 1) fail('Der gespeicherte Katalog enthält eine mehrdeutige Artikelnummer.');
        const current = match[0];
        if (existing.some(m => (!current||m.id!==current.id)&&String(m.name).trim().toLowerCase() === name.toLowerCase())) fail('Ein gleichnamiges Material existiert unter einer anderen Zuordnung. Bitte zuerst Lieferant/Artikelnummer prüfen oder die Bezeichnung unterscheiden. Es wird nicht automatisch zusammengeführt.');
        if (current && String(current.unit || 'Stk') !== normalizedUnit) fail('Basiseinheit des vorhandenen Materials unterscheidet sich. Verpackungs-/Einheitenumrechnung vorher klären.');
        const values = {};
        prices.forEach(f => { if (mapping[f]) { const price = money(row[mapping[f]], decimal, basis); if (price !== null) values[f] = price; } });
        if (!Object.keys(values).length) fail('Keine befüllten zugeordneten Preise. Leere Preiszellen überschreiben keine bestehenden Preise.');
        const data = { article_number, name, unit: normalizedUnit, ...values, expected_id: current?.id || null, expected_revision: current ? Number(current.catalog_revision || 1) : null };
        return { data, source_row: index + 2, source_price_unit: basis, action: current ? 'update' : 'create', inactive: current?.active === false, previous: current || null };
      } catch (error) { fail(error.message, index + 2); }
    });
  }
  return Object.freeze({ limits, fields, prices, money, unit, parse, prepare, supplierKey });
});
