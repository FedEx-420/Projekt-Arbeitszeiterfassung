/* Local, bounded catalog preview. Never uploads files, evaluates formulas or writes materials.
 * DATANORM 4 A/B layout: https://hilfe.comtech.at/ce/2019/HTML/datanorm_datei.htm
 * Price-kind meaning is supplier-specific; list/net are NOT the VAT distinction.
 * ZIP: single-disk, unencrypted ZIP32, Store/Deflate only; no filesystem extraction.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WorktimeCatalogImport = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const classifier=typeof module==='object'&&module.exports?require('./catalog-classify-v925.js'):globalThis.WorktimeCatalogClassify;
  const technical=typeof module==='object'&&module.exports?require('./product-features-v928.js'):globalThis.WorktimeProductFeatures;
  const MiB = 1024 * 1024;
  const limits = Object.freeze({ inputBytes: 2048 * MiB, expandedBytes: 2048 * MiB, entries: 2048, directoryBytes: 4 * MiB, ratio: 200, rows: 1000, columns: 64, cell: 4096, line: 65536, xmlBytes: 32 * MiB, sharedXmlBytes: 16 * MiB, jsonBytes: 8 * MiB, xmlNodes: 300000, depth: 64 });
  const priceFields = ['purchase_price', 'recommended_price_1', 'recommended_price_2'];
  const canonical = ['article_number', 'name', 'unit', ...priceFields, 'price_unit', 'supplier', 'manufacturer', 'category'];
  const cp437 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
  const crcTable = Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  const safeKey = value => !['__proto__', 'constructor', 'prototype'].includes(value);
  const error = message => { throw new Error(message); };
  const abort = signal => { if (signal?.aborted) { const e = new Error('Katalogprüfung abgebrochen. Es wurden keine Materialien gespeichert.'); e.name = 'AbortError'; throw e; } };
  const clean = value => String(value ?? '').replace(/^\uFEFF/, '').trim();
  const unitAliases = { stk: 'Stk', st: 'Stk', stck: 'Stk', stück: 'Stk', stueck: 'Stk', c62: 'Stk', pce: 'Stk', m: 'M', mtr: 'M', meter: 'M', lfm: 'M', h: 'H', hur: 'H', std: 'H', stunde: 'H', pau: 'Pau', pa: 'Pau', pauschal: 'Pau', kg: 'Kg', kgm: 'Kg', kilogramm: 'Kg' };
  const normalizeUnit = value => Object.hasOwn(unitAliases, clean(value).toLowerCase()) ? unitAliases[clean(value).toLowerCase()] : clean(value);
  function priceText(value,decimal='comma') {
    if(typeof value==='number')return decimal==='comma'?String(value).replace('.',','):String(value);
    const raw=clean(value);if(!raw)return '';
    const match=/^(?:(?:EUR|€)\s*)?([0-9][0-9., \u00a0\u202f]*?)(?:\s*(?:EUR|€))?$/iu.exec(raw);if(!match)return raw;
    let number=match[1].trim();
    if(decimal==='comma'){
      if(/^\d{1,3}(?:\.\d{3})+(?:,\d{1,4})?$/.test(number))number=number.replaceAll('.','');
      else if(/^\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:,\d{1,4})?$/.test(number))number=number.replace(/[ \u00a0\u202f]/g,'');
      return /^\d+(?:,\d{1,4})?$/.test(number)?number:raw;
    }
    if(decimal==='dot'){
      if(/^\d{1,3}(?:,\d{3})+(?:\.\d{1,4})?$/.test(number))number=number.replaceAll(',','');
      else if(/^\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:\.\d{1,4})?$/.test(number))number=number.replace(/[ \u00a0\u202f]/g,'');
      return /^\d+(?:\.\d{1,4})?$/.test(number)?number:raw;
    }
    return raw;
  }
  function warning(ctx, message) { if (!ctx.warnings.includes(message) && ctx.warnings.length < 50) ctx.warnings.push(message); }
  function checkText(value) { if (String(value).length > limits.cell || /[\u0000]/.test(String(value))) error('Ein Katalogfeld ist zu lang oder enthält Binärdaten. Bitte CSV-Export prüfen.'); return String(value); }
  function aliasMap(headers) {
    const aliases = {
      article_number: ['articlenumber', 'article_number', 'artikelnummer', 'artikelnr', 'artnr', 'lieferantenartikelnummer', 'supplieraid', 'supplierpid', 'bestellnummer', 'sku'],
      name: ['name', 'artikelname', 'bezeichnung', 'artikelbezeichnung', 'kurztext', 'beschreibung', 'description', 'descriptionshort'],
      unit: ['unit', 'einheit', 'mengeneinheit', 'basiseinheit', 'orderunit', 'me'],
      purchase_price: ['purchaseprice', 'purchase_price', 'einkaufspreis', 'ek', 'eknetto', 'einkaufspreisnetto', 'ekpreis', 'ekpreisnetto', 'preiseK', 'einstandspreis', 'einstandspreisnetto'],
      recommended_price_1: ['recommendedprice1', 'recommended_price_1', 'vk*', 'vk1', 'vk*netto', 'vk1netto', 'verkaufspreis1', 'empfohlenervk*'],
      recommended_price_2: ['recommendedprice2', 'recommended_price_2', 'vk**', 'vk2', 'vk**netto', 'vk2netto', 'verkaufspreis2', 'empfohlenervk**'],
      price_unit: ['priceunit', 'price_unit', 'preiseinheit', 'preisje', 'pricequantity'],
      gtin: ['gtin','ean','ean13','ean14','source_gtin','internationaleartikelnummer'],
      manufacturer: ['manufacturer','hersteller','herstellername','marke','brand','manufacturername'],
      category: ['category','kategorie','warengruppe','produktgruppe','artikelgruppe','productgroup','groupid','source_category'],
      supplier: ['supplier', 'lieferant', 'vertrieb', 'grosshaendler', 'großhändler', 'distributor']
    };
    const key = s => clean(s).toLowerCase().replace(/\beur\b|€/g,'').replace(/[\s.()\-\/]/g, '');
    const mapping = {};
    for (const [field, names] of Object.entries(aliases)) {
      const candidates = headers.filter(h => names.map(key).includes(key(h)));
      if (candidates.length === 1) mapping[field] = candidates[0];
    }
    if(!mapping.recommended_price_1){const explicit=headers.filter(h=>aliases.recommended_price_1.map(key).includes(key(h)));const generic=headers.filter(h=>['vk','vknetto','verkaufspreis','verkaufspreisnetto','sellingprice','sellingpricenet','netverkaufspreis'].includes(key(h)));if(!explicit.length&&generic.length===1)mapping.recommended_price_1=generic[0];}
    return mapping;
  }
  function automaticMapping(headers,rows,{listAsSellingPrice=false}={}){
    const mapping=aliasMap(headers),has=h=>headers.includes(h)&&rows.some(r=>r[h]!=null&&String(r[h]).trim()!==''),filled=field=>mapping[field]&&has(mapping[field]);
    if(!filled('purchase_price')){const candidates=['source_net_price','source_net_customer'].filter(has);if(candidates.length===1)mapping.purchase_price=candidates[0];}
    if(listAsSellingPrice&&!filled('recommended_price_1')){const candidates=['source_list_price','source_net_list'].filter(has);if(candidates.length===1)mapping.recommended_price_1=candidates[0];}
    return mapping;
  }
  const foldSearch=v=>clean(v).normalize('NFC').toLocaleLowerCase('de').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
  let lastSearchQuery, lastSearchTokens=[];
  function searchTokens(query){
    const text=String(query??'');if(text===lastSearchQuery)return lastSearchTokens;
    lastSearchQuery=text;lastSearchTokens=foldSearch(text).split(/\s+/).filter(Boolean).map(value=>{
      // Never guess article numbers, electrical ratings, dimensions or short codes.
      const edits=/^[a-z]{4,64}$/.test(value)?value.length>=8?2:1:0;
      return {value,edits,pairs:edits?[...new Set(Array.from({length:value.length-1},(_,i)=>value.slice(i,i+2)))]:[]};
    });return lastSearchTokens;
  }
  function similarNameWord(word,token){
    const {value,edits,pairs}=token,n=value.length;if(word.length<n-edits)return false;
    // An edit can destroy at most three distinct bigrams (adjacent swap).
    // This cheap necessary condition avoids edit matrices for unrelated catalog rows.
    const required=pairs.length-3*edits;
    if(required>0){let shared=0;for(const pair of pairs)if(word.includes(pair)&&++shared>=required)break;if(shared<required)return false;}
    // Optimal-string-alignment distance to a substring, including adjacent swaps.
    // Free text prefix/suffix keeps partial compound names searchable as before.
    let older=new Uint16Array(n+1),previous=Uint16Array.from({length:n+1},(_,i)=>i),current=new Uint16Array(n+1);
    for(let j=1;j<=word.length;j++){
      current[0]=0;
      for(let i=1;i<=n;i++){
        let cost=Math.min(previous[i]+1,current[i-1]+1,previous[i-1]+(value[i-1]===word[j-1]?0:1));
        if(i>1&&j>1&&value[i-1]===word[j-2]&&value[i-2]===word[j-1])cost=Math.min(cost,older[i-2]+1);
        current[i]=Math.min(cost,edits+1);
      }
      if(current[n]<=edits)return true;
      const spare=older;older=previous;previous=current;current=spare;
    }
    return false;
  }
  function matchesArticle(row,query,mapping={article_number:'article_number',name:'name'}){
    const tokens=searchTokens(query);if(!tokens.length)return true;
    const name=foldSearch(row[mapping.name]),article=foldSearch(row[mapping.article_number]),supplier=mapping.supplier?foldSearch(row[mapping.supplier]):'';let words;
    return tokens.every(token=>{
      if(name.includes(token.value)||article.includes(token.value)||supplier.includes(token.value))return true;
      if(!token.edits)return false;
      words??=name.match(/[a-z]+/g)||[];
      return words.some(word=>similarNameWord(word,token));
    });
  }
  function context(file, options) {
    if (!file || typeof file.slice !== 'function' || !Number.isSafeInteger(file.size) || file.size < 1) error('Bitte eine lesbare Katalogdatei auswählen.');
    if (file.size > limits.inputBytes) error('Datei über 2 GiB. Bitte einen kleineren Lieferanten-Ausschnitt verwenden.');
    const maxRows = Number(options.maxRows ?? limits.rows), offset = Number(options.offset ?? 0);
    if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > limits.rows || !Number.isSafeInteger(offset) || offset < 0) error('Ungültiger Katalog-Ausschnitt. Höchstens 1000 Artikel pro Vorschau.');
    return { file, options, maxRows, offset, rows: [], headers: [], warnings: [], format: '', bytesRead: 0, recordsRead: 0, matchedRows: 0, skippedMatches: 0, supplier: '', decimal: 'comma', priceUnit: '1', truncated: false, stoppedEarly:false, phase:'Artikeldatei wird geprüft',priceRows:0, expanded: 0, lastProgress: 0 };
  }
  function progress(ctx, force = false) {
    const now = Date.now();
    if (force || now - ctx.lastProgress > 150) { ctx.lastProgress = now; ctx.options.onProgress?.({ bytesRead: ctx.bytesRead, totalBytes: ctx.file.size, recordsRead: ctx.recordsRead, matchedRows: ctx.matchedRows,phase:ctx.phase,articles:ctx.analysis?.articles||0,priceRows:ctx.priceRows }); }
  }
  function articleGroups(row,headers=Object.keys(row)){
    const map=aliasMap(headers),data={name:clean(row[map.name]),manufacturer:clean(row[map.manufacturer]),category:clean(row[map.category])};return classifier?classifier.describe(data):data;
  }
  function matchesGroups(row,options={},headers=Object.keys(row)){
    const groups=articleGroups(row,headers);return ['manufacturer','category'].every(key=>!options[key==='category'?'categories':'manufacturers']?.length||options[key==='category'?'categories':'manufacturers'].includes(groups[key]));
  }
  function keep(ctx, row) {
    const groupMap=ctx.groupMap||(ctx.groupMap=aliasMap(ctx.headers));const data={name:clean(row[groupMap.name]),manufacturer:clean(row[groupMap.manufacturer]),category:clean(row[groupMap.category])};const groups=classifier?classifier.describe(data):data;
    ctx.analysis??={articles:0,withPurchasePrice:0,withListPrice:0,manufacturers:new Set(),categories:new Set(),limited:false};
    const a=ctx.analysis;a.articles++;
    for(const [key,set]of [['manufacturer',a.manufacturers],['category',a.categories]])if(groups[key]){if(set.size<1000)set.add(groups[key]);else if(!set.has(groups[key]))a.limited=true;}
    const purchaseColumn=groupMap.purchase_price;
    if((purchaseColumn&&clean(row[purchaseColumn]))||['source_net_price','source_net_customer'].some(k=>clean(row[k])))a.withPurchasePrice++;
    if(['source_list_price','source_net_list'].some(k=>clean(row[k])))a.withListPrice++;
    if(ctx.options.inspectOnly)return false;
    if(!['manufacturer','category'].every(key=>!ctx.options[key==='category'?'categories':'manufacturers']?.length||ctx.options[key==='category'?'categories':'manufacturers'].includes(groups[key])))return false;
    const filter = clean(ctx.options.articleFilter);
    if(filter){const mapping=ctx.searchMapping||(ctx.searchMapping=(()=>{const detected=aliasMap(ctx.headers);return {article_number:detected.article_number,name:detected.name};})());if(!mapping.article_number&&!mapping.name)warning(ctx,'Artikelspalten nicht eindeutig erkannt. Ohne Suche lesen, dann Artikelnummer und Bezeichnung zuordnen.');if(!matchesArticle(row,filter,mapping))return false;}
    const searchMap=ctx.fieldSearchMap||(ctx.fieldSearchMap=aliasMap(ctx.headers));
    if(clean(ctx.options.articleNameFilter)&&!matchesArticle(row,ctx.options.articleNameFilter,{name:searchMap.name}))return false;
    if(clean(ctx.options.articleNumberFilter)&&!foldSearch(row[searchMap.article_number]).includes(foldSearch(ctx.options.articleNumberFilter)))return false;
    ctx.matchedRows++;
    if (ctx.skippedMatches < ctx.offset) { ctx.skippedMatches++; return false; }
    if (ctx.rows.length >= ctx.maxRows) {ctx.truncated=true;if(ctx.options.scanAll)return false;ctx.stoppedEarly=true;return true;}
    const characters=Object.entries(row).filter(([key])=>!key.startsWith('_')).reduce((n,[,v])=>n+String(v??'').length,0);
    ctx.previewCharacters=(ctx.previewCharacters||0)+characters;
    if(ctx.previewCharacters>16*MiB)error('Dieser Vorschauausschnitt enthält zu viel Text. Bitte die Artikelsuche eingrenzen oder einen kleineren Lieferantenausschnitt verwenden.');
    ctx.rows.push(row);
    return false;
  }
  async function* bytes(stream, ctx, expanded = false) {
    const reader = stream.getReader();
    try {
      for (;;) {
        abort(ctx.options.signal);
        const next = await reader.read();
        if (next.done) break;
        if (expanded) { ctx.expanded += next.value.byteLength; if (ctx.expanded > limits.expandedBytes) error('Entpackte Daten überschreiten 2 GiB. Katalog bitte aufteilen.'); }
        else ctx.bytesRead += next.value.byteLength;
        progress(ctx); yield next.value;
      }
    } finally { try { await reader.cancel(); } catch {} reader.releaseLock(); }
  }
  function decoder(encoding) {
    if (encoding === 'cp437') return { decode: chunk => chunk ? Array.from(chunk, b => b < 128 ? String.fromCharCode(b) : cp437[b - 128]).join('') : '' };
    if (!['utf-8', 'windows-1252', 'utf-16le', 'utf-16be'].includes(encoding)) error('Zeichensatz nicht unterstützt. Bitte UTF-8, Windows-1252 oder DOS/CP437 auswählen.');
    return new TextDecoder(encoding, { fatal: true });
  }
  async function* textChunks(stream, ctx, encoding, expanded = false) {
    const dec = decoder(encoding);
    try { for await (const chunk of bytes(stream, ctx, expanded)) yield dec.decode(chunk, { stream: true }); const end = dec.decode(); if (end) yield end; }
    catch (e) { if (e instanceof TypeError) error('Zeichensatz passt nicht zur Datei. Bitte in der Katalogprüfung UTF-8, Windows-1252 oder DOS/CP437 auswählen.'); throw e; }
  }
  async function collect(stream, ctx, max, encoding = 'utf-8', expanded = false) {
    let text = '', count = 0;
    for await (const part of textChunks(stream, ctx, encoding, expanded)) { count += new TextEncoder().encode(part).length; if (count > max) error('Diese strukturierte Datei überschreitet das sichere Leselimit. Bitte CSV/TSV oder DATANORM verwenden.'); text += part; }
    return text;
  }
  async function* lines(stream, ctx, encoding, expanded) {
    let pending = '';
    for await (const part of textChunks(stream, ctx, encoding, expanded)) {
      pending += part; let index;
      while ((index = pending.indexOf('\n')) !== -1) { const line = pending.slice(0, index).replace(/\r$/, ''); pending = pending.slice(index + 1); if (line.length > limits.line) error('Eine Katalogzeile überschreitet 64 KiB.'); yield line; }
      if (pending.length > limits.line) error('Eine Katalogzeile überschreitet 64 KiB.');
    }
    if (pending) yield pending.replace(/\r$/, '');
  }
  function detectDelimiter(line) {
    let quoted = false; const counts = { ';': 0, ',': 0, '\t': 0 };
    for (let i = 0; i < line.length; i++) { if (line[i] === '"') { if (quoted && line[i+1] === '"') i++; else quoted = !quoted; } else if (!quoted && Object.hasOwn(counts, line[i])) counts[line[i]]++; }
    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
    if (!sorted[0][1] || sorted[0][1] === sorted[1][1]) error('CSV-Trennzeichen ist nicht eindeutig. Bitte Semikolon, Komma oder Tabulator auswählen.');
    return sorted[0][0];
  }
  async function readDelimited(stream, ctx, name, encoding, expanded) {
    const parts = textChunks(stream, ctx, encoding, expanded); let delimiter = ctx.options.delimiter || 'auto', first = '', quoted = false, afterQuote = false, cell = '', row = [], header = null, skipLF = false;
    const putCell = () => { row.push(checkText(cell)); cell = ''; afterQuote = false; if (row.length > limits.columns) error('Mehr als 64 Katalogspalten. Bitte Lieferanten-Export eingrenzen.'); };
    const putRow = () => {
      putCell(); const values = row; row = [];
      if (!values.some(v => clean(v))) return false;
      if(!header&&values.length===2&&clean(values[0]).toLowerCase()==='sep='&&values[1]===''){warning(ctx,'Excel-Trennzeichenhinweis sep= erkannt; er ist keine Artikelzeile.');return false;}
      if (!header) { header = values.map(clean); if (header.some(v => !v || !safeKey(v) || v.startsWith('_')) || new Set(header).size !== header.length) error('Spaltenüberschriften müssen befüllt und eindeutig sein und dürfen nicht mit Unterstrich beginnen.'); ctx.headers = header; return false; }
      ctx.recordsRead++;
      if (values.length !== header.length) error('Zeile ' + (ctx.recordsRead+1) + ': Spaltenzahl stimmt nicht mit der Kopfzeile überein.');
      const item = Object.fromEntries(header.map((h,i) => [h, values[i]])); item._review = [];
      return keep(ctx, item);
    };
    function consume(part) {
      for (let i = 0; i < part.length; i++) {
        const c = part[i];
        if (skipLF) { skipLF = false; if (c === '\n') continue; }
        if (quoted) { if (c === '"') { quoted = false; afterQuote = true; } else cell += c; }
        else if (afterQuote && c === '"') { cell += '"'; quoted = true; afterQuote = false; }
        else if (c === delimiter) putCell();
        else if (c === '\n' || c === '\r') { if (putRow()) return true; if (c === '\r') skipLF = true; }
        else if (c === '"' && !cell && !afterQuote) quoted = true;
        else if (afterQuote && /[ \t]/.test(c)) { /* allow padding after closing quote */ }
        else { if (afterQuote) error('Ungültiger Text nach CSV-Anführungszeichen.'); cell += c; }
        if (cell.length > limits.cell) error('Eine CSV-Zelle überschreitet 4096 Zeichen.');
      }
      return false;
    }
    for await (let part of parts) {
      if (delimiter === 'auto') {
        first += part;first=first.replace(/^\uFEFF/,'').replace(/^(?:[ \t]*[\r\n])+/,''); if (first.length > limits.line && !/[\r\n]/.test(first)) error('Kopfzeile überschreitet 64 KiB.');
        const end = first.search(/[\r\n]/); if (end < 0) continue;
        delimiter = /\.tsv$/i.test(name) ? '\t' : detectDelimiter(first.slice(0,end)); part = first; first = '';
      }
      if (![';', ',', '\t'].includes(delimiter)) error('CSV-Trennzeichen nicht unterstützt.');
      if (consume(part)) break;
    }
    if (delimiter === 'auto' && first) { delimiter = detectDelimiter(first); consume(first); }
    if (!ctx.stoppedEarly) { if (quoted) error('Nicht geschlossene CSV-Anführungszeichen.'); if (cell || row.length || afterQuote) putRow(); }
    if (!header) error('Katalog enthält keine Spaltenüberschriften.');
    ctx.format = /\.tsv$/i.test(name) ? 'TSV' : 'CSV/Text';
  }
  const datanormDate=value=>/^\d{8}$/.test(value)&&Number.isFinite(Date.parse(value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8)))&&new Date(value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8)).toISOString().slice(0,10).replaceAll('-','')===value;
  function datanormVersion(line) {
    if (!line.startsWith('V')) error('DATANORM benötigt einen Vorlaufsatz V.');
    if (line.length >= 128 && !line.startsWith('V;')) return { version: line.slice(123,125), currency: clean(line.slice(125,128)),date:/^\d{6}$/.test(line.slice(2,8))?'20'+line.slice(6,8)+line.slice(4,6)+line.slice(2,4):'' };
    if (line.startsWith('V;')) {const f=line.split(';');if(f.length<9||f[1]!=='050'||!datanormDate(clean(f[3])))error('DATANORM-5-Vorlaufsatz ist unvollständig oder hat eine unbekannte Version.');return {version:'05',currency:clean(f[4]),content:clean(f[2]),date:clean(f[3]),creator:clean(f[7]),supplier:[f[8],f[9]].map(clean).filter(Boolean).join(' ')};}
    error('DATANORM-Vorlaufsatz ist unvollständig.');
  }
  function datanormPrice(raw) {
    if (!/^\d{1,12}$/.test(raw)) return '';
    const cents = BigInt(raw); return (cents/100n).toString() + '.' + String(cents%100n).padStart(2,'0');
  }
  async function readDatanorm(stream, ctx, name, encoding, expanded) {
    let metadata = null, pending = null, lineCount=0,sawEnd=false; const byArticle = new Map(), ambiguous = new Set(); let sawArticle = false;
    ctx.decimal = 'dot'; ctx.format = 'DATANORM 4';
    ctx.headers = [...canonical, 'source_list_price', 'source_net_price', 'source_price_kind', 'source_discount_group', 'source_action','source_manufacturer_number','source_manufacturer_type','source_gtin','source_price_date'];
    warning(ctx, 'DATANORM-Listen-/Nettopreis ist keine Umsatzsteuer-Unterscheidung. EK/VK-Zuordnung beim Lieferanten prüfen und in der Vorschau selbst auswählen. Rabatte, Kupfer-/Tageszuschläge werden nicht automatisch verrechnet.');
    const flush = () => {
      if (!pending) return false;
      const item = pending; pending = null;item._source_catalog_entry=name;
      const previous = byArticle.get(item.article_number);
      if (previous) {
        for (const key of ['source_list_price','source_net_price']) if (item[key] !== '') { const token = item.article_number + '\u001f' + key; if (ambiguous.has(token)) continue; if (previous[key] && (previous[key] !== item[key] || previous.price_unit !== item.price_unit || previous.unit !== item.unit)) { previous[key] = ''; ambiguous.add(token); previous._review.push('Mehrere unterschiedliche Preise/Einheiten für dieselbe Artikelnummer: Preis manuell klären.'); } else previous[key] = item[key]; }
        previous._review.push(...item._review.filter(message => !previous._review.includes(message)));
        return false;
      }
      const before = ctx.rows.length, stop = keep(ctx,item); if (ctx.rows.length > before) byArticle.set(item.article_number,item); return stop;
    };
    for await (let line of lines(stream,ctx,encoding,expanded)) {
      line = line.replace(/^\uFEFF/,''); if (!clean(line)) continue;lineCount++;
      if (!metadata) { metadata = datanormVersion(line); if (!['04','05'].includes(metadata.version)) error('DATANORM Version '+(metadata.version||'unbekannt')+' wird nicht unterstützt. Bitte DATANORM 4 oder 5 verwenden.');if(metadata.version==='05'&&metadata.content!=='A')error('DATANORM-5-Artikelstamm benötigt Dateiinhalt A. Preisdatei bitte zusammen mit dem Artikelstamm als ZIP auswählen.'); if (metadata.currency !== 'EUR') error('DATANORM-Währung ist nicht eindeutig EUR. Bitte einen EUR-Katalog verwenden.');ctx.datanormSources??=new Map();ctx.datanormSources.set(name,metadata);ctx.format='DATANORM '+(metadata.version==='05'?'5':'4');ctx.supplier=ctx.supplier||metadata.supplier||'';continue; }
      ctx.recordsRead++;if(ctx.recordsRead%5000===0)await new Promise(resolve=>setTimeout(resolve,0));
      const f = line.split(';').map(clean), type = f[0];if(sawEnd)error('DATANORM enthält weitere Sätze nach dem Endesatz.');if(metadata.version==='05'&&type==='E'){if(!/^\d+$/.test(f[1]||'')||Number(f[1])!==lineCount)error('DATANORM-5-Endesatz: Satzanzahl stimmt nicht mit der gelesenen Datei überein.');sawEnd=true;continue;}
      if (type === 'A') {
        if (flush()) break;
        if(metadata.version==='05'){
         if(f.length<29||f.length>30)error('DATANORM-5-Artikelsatz hat einen unbekannten Aufbau.');if(!['N','A'].includes(f[1])){warning(ctx,'Löschungen und Umnummerierungen werden nicht automatisch ausgeführt.');continue;}sawArticle=true;const basis=/^\d{1,6}$/.test(f[7])&&Number(f[7])>0?String(Number(f[7])):'';const amount=datanormPrice(f[8]);
         pending={article_number:f[2],name:[f[3],f[4]].filter(Boolean).join(' '),unit:normalizeUnit(f[5]),purchase_price:'',recommended_price_1:'',recommended_price_2:'',price_unit:basis,supplier:ctx.supplier,source_list_price:'',source_net_price:'',source_price_kind:f[6],source_discount_group:f[9],category:f[11]||f[10]||'',manufacturer:'',source_action:f[1],source_manufacturer_number:f[16]||'',source_manufacturer_type:f[17]||'',source_gtin:f[18]||'',_review:[]};
         if(!basis)pending._review.push('Anzahl der Einheiten zum Preis fehlt oder ist ungültig. Bitte ergänzen.');if(amount&&BigInt(f[8]||0)>0n){if(f[6]==='1')pending.source_list_price=amount;else if(f[6]==='2')pending.source_net_price=amount;else pending._review.push('Andere Preisart oder Preis auf Anfrage: Preis manuell prüfen.');}else pending._review.push('Preis fehlt im Artikelstamm. Eine passende DATPREIS-Datei im ZIP wird zusätzlich geprüft.');Object.values(pending).filter(v=>typeof v==='string').forEach(checkText);continue;
        }
        if (f.length < 13) error('DATANORM A-Satz ' + (ctx.recordsRead+1) + ' ist unvollständig.');
        if (!['N','A'].includes(f[1])) { warning(ctx,'Löschungen und Artikelnummern-Änderungen aus DATANORM werden nur übersprungen, niemals automatisch ausgeführt.'); continue; }
        sawArticle = true;
        const basis = /^[0-3]$/.test(f[7]) ? String(10 ** Number(f[7])) : '';
        const rawPrice = datanormPrice(f[9]);
        pending = { article_number: f[2], name: [f[4],f[5]].filter(Boolean).join(' '), unit: normalizeUnit(f[8]), purchase_price: '', recommended_price_1: '', recommended_price_2: '', price_unit: basis, supplier: ctx.supplier, source_list_price: '', source_net_price: '', source_price_kind: f[6], source_discount_group: f[10], category:f[11]||'', manufacturer:'', source_action: f[1], _review: [] };
        if (!basis) pending._review.push('Preiseinheit nicht erkannt: vor Übernahme manuell festlegen.');
        if (!rawPrice || BigInt(f[9] || 0) === 0n) pending._review.push('Kein eindeutiger Artikelpreis. 0 kann in DATANORM ein Platzhalter für eine separate Preisdatei sein. Bitte manuell prüfen.');
        else if (f[6] === '1') pending.source_list_price = rawPrice;
        else if (f[6] === '2') pending.source_net_price = rawPrice;
        else pending._review.push('Preiskennzeichen nicht unterstützt: Preis manuell klären.');
        Object.values(pending).filter(v => typeof v === 'string').forEach(checkText);
      } else if(metadata.version==='05'&&type==='B'){warning(ctx,'DATANORM-5-Löschungen und Umnummerierungen werden nicht automatisch ausgeführt.');
      } else if(metadata.version==='05'&&type==='Z'){warning(ctx,'Rohstoff-/Kupferzuschläge sind vorhanden und werden nicht in EK/VK eingerechnet. Endgültige Preise vor Übernahme beim Lieferanten prüfen.');if(pending&&f[2]===pending.article_number)pending._review.push('Dieser Artikel hat einen Rohstoff-/Kupferzuschlag. Gelieferte Preise können weitere Zuschläge erfordern.');
      } else if (type === 'B' && pending && f[2] === pending.article_number) {
        pending._source_gtin = f[7] || '';pending.source_gtin=f[7]||'';if(f[9])pending.category=f[9]; pending._source_alternative_article = f[4] || '';
        if (f[6] && Number(f[6]) !== 0) pending._review.push('Kupferwert/Zuschlag vorhanden: endgültigen Preis beim Lieferanten prüfen.');
      } else if (type === 'P') warning(ctx, 'DATPREIS-/P-Preisänderungen werden nicht ohne passende Artikel-, Rabatt- und Preiseinheitsprüfung übernommen. Bitte Artikelstamm oder CSV mit endgültigen Nettopreisen verwenden.');
      else if (['Z','D','C','J'].includes(type)) warning(ctx,'Zusatz-, Leistungs-, Set- und Staffelpreise werden nicht automatisch als Einzelmaterialpreise interpretiert.');

    }
    if (!ctx.stoppedEarly) {flush();if(metadata?.version==='05'&&!sawEnd)error('DATANORM-5-Datei ist unvollständig: Endesatz fehlt.');}
    if (!sawArticle && !ctx.rows.length) error('Kein DATANORM-Artikelsatz A gefunden. Preis-, Rabatt- oder Langtextdateien allein enthalten keinen vollständigen Artikelstamm.');
    if (ctx.rows.some(r => r._review?.length)) warning(ctx,'Einzelne Artikel enthalten ungeklärte Angaben. Fehlende Werte vor dem Speichern ergänzen oder den Artikel auslassen.');
  }
  async function readDatanormPrices(stream,ctx,name,encoding,expanded,source){
    ctx.phase='Separate Preisdatei wird zugeordnet';progress(ctx,true);
    let metadata=null,lineCount=0,sawEnd=false;const selected=new Map(ctx.rows.filter(r=>r._source_catalog_entry===source).map(r=>[r.article_number,r])),slots=new Map(),ambiguous=new Set();
    const note=(row,text)=>{if(!row._review.includes(text))row._review.push(text);};
    const original=ctx.datanormSources?.get(source);let validEK=0,validList=0;
    for await(let line of lines(stream,ctx,encoding==='auto'?'cp437':encoding,expanded)){
      if(!clean(line))continue;lineCount++;if(lineCount%5000===0)await new Promise(resolve=>setTimeout(resolve,0));if(!metadata){metadata=datanormVersion(line);if(!['04','05'].includes(metadata.version)||metadata.currency!=='EUR'||metadata.version!==original?.version)error('Artikel- und Preisdatei haben unterschiedliche Version oder Währung.');if(metadata.version==='05'&&(metadata.content!=='P'||metadata.creator!==original.creator))error('DATANORM-5-Preisdatei passt nicht zum Datenersteller des Artikelstamms.');continue;}
      const f=line.split(';').map(clean);if(sawEnd)error('Preisdatei enthält Daten nach dem Endesatz.');if(metadata.version==='05'&&f[0]==='E'){if(!/^[0-9]+$/.test(f[1]||'')||Number(f[1])!==lineCount)error('DATANORM-5-Preisdatei: Satzanzahl stimmt nicht.');sawEnd=true;continue;}
      ctx.recordsRead++;ctx.priceRows++;if(f[0]!=='P'){warning(ctx,'Unbekannte Zusatzsätze in der Preisdatei werden nicht als Preise übernommen.');continue;}
      const v5=metadata.version==='05',sku=v5?f[1]:f[2],kind=v5?f[2]:f[3],basis=v5?f[3]:null,amount=v5?f[4]:f[4],date=v5?f[12]||metadata.date:'',row=selected.get(sku);
      const simple=v5?f.length===14&&!f.slice(5,12).some(Boolean)&&/^[0-9]{1,6}$/.test(basis||'')&&Number(basis)>0&&(!date||datanormDate(date))&&(!date||!metadata.date||date<=metadata.date):f.length>=7&&f.length<=8&&f[1]==='A'&&!f.slice(5).some(Boolean);
      const field=kind==='1'?'source_list_price':kind==='2'?'source_net_price':null;
      if(!simple||!field||!datanormPrice(amount)||BigInt(amount||0)===0n){warning(ctx,'Einige Preiszeilen sind zeitabhängig, rabattiert, unklar oder nicht unterstützt. Diese Preise werden nicht automatisch übernommen.');if(row&&field){ambiguous.add(sku+'\u001f'+field);row[field]='';note(row,'Preisdatei enthält ungeklärte Angaben für diese Preisart. Bitte manuell prüfen.');}continue;}
      if(kind==='2')validEK++;else validList++;if(!row)continue;
      if(v5&&Number(basis)!==Number(row.price_unit)){ambiguous.add(sku+'\u001f'+field);row[field]='';note(row,'Preisdatei verwendet eine andere Anzahl zum Preis. Bitte manuell umrechnen.');continue;}
      const key=sku+'\u001f'+field,previous=slots.get(key),price=datanormPrice(amount);
      if(previous&&previous.price!==price){ambiguous.add(key);row[field]='';note(row,'Mehrere unterschiedliche Preise für dieselbe Preisart. Bitte manuell klären.');continue;}
      if(!ambiguous.has(key)){slots.set(key,{price,date});row[field]=price;row['_'+field+'_date']=date;row.source_price_date=['source_net_price','source_list_price'].filter(k=>row['_'+k+'_date']).map(k=>(k==='source_net_price'?'EK':'Listenpreis')+': '+row['_'+k+'_date']).join(' · ');}

    }
    if(metadata?.version==='05'&&!sawEnd)error('DATANORM-5-Preisdatei ist unvollständig: Endesatz fehlt.');
    if(ctx.analysis){ctx.analysis.separatePurchasePrices=(ctx.analysis.separatePurchasePrices||0)+validEK;ctx.analysis.separateListPrices=(ctx.analysis.separateListPrices||0)+validList;}
    warning(ctx,'Passende separate Preisdatei gelesen: '+validEK+' klare EK-Preiszeilen und '+validList+' Listenpreiszeilen. Rohstoffzuschläge werden nicht hinzugerechnet.');
  }
  function xmlDecode(value) {
    return value.replace(/&([^;\s]{1,30});/g, (_, entity) => {
      const named = { amp: '&',lt: '<',gt: '>',quot: '"',apos: "'" }; if (Object.hasOwn(named,entity)) return named[entity];
      let n; if (/^#x[0-9a-f]+$/i.test(entity)) n = parseInt(entity.slice(2),16); else if (/^#\d+$/.test(entity)) n = Number(entity.slice(1));
      if (!Number.isInteger(n) || n < 1 || n > 0x10ffff || n >= 0xd800 && n <= 0xdfff) error('Unzulässige oder externe XML-Entität.'); return String.fromCodePoint(n);
    });
  }
  function xmlTree(source) {
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) error('XML mit DTD oder externen Entitäten wird aus Sicherheitsgründen nicht eingelesen.');
    const root = {name:'#root', attrs:{}, children:[], text:''}, stack=[root]; let index=0,nodes=0,textBudget=0;
    const addText = text => { textBudget += text.length; if (textBudget > limits.xmlBytes * 4) error('XML-Textstruktur ist zu groß oder zu tief. Bitte CSV verwenden.'); stack.at(-1).text += text; };
    const append = text => { if (stack.length === 1 && text.trim()) error('Text außerhalb des XML-Wurzelelements.'); if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(text)) error('Nicht auflösbare XML-Entität.'); addText(xmlDecode(text)); };
    while(index < source.length) {
      const lt = source.indexOf('<',index); if(lt<0){append(source.slice(index));break;} append(source.slice(index,lt));
      if(source.startsWith('<!--',lt)){const end=source.indexOf('-->',lt+4);if(end<0)error('Unvollständiger XML-Kommentar.');index=end+3;continue;}
      if(source.startsWith('<![CDATA[',lt)){const end=source.indexOf(']]>',lt+9);if(end<0)error('Unvollständige XML-CDATA.');if(stack.length===1)error('CDATA außerhalb des XML-Wurzelelements.');addText(source.slice(lt+9,end));index=end+3;continue;}
      if(source.startsWith('<?',lt)){const end=source.indexOf('?>',lt+2);if(end<0)error('Unvollständige XML-Anweisung.');index=end+2;continue;}
      let end=lt+1,quote='';for(;end<source.length;end++){const ch=source[end];if(quote){if(ch===quote)quote='';}else if(ch==='"'||ch==="'")quote=ch;else if(ch==='>')break;}if(end===source.length)error('Unvollständiges XML-Tag.');
      let tag=source.slice(lt+1,end);index=end+1;
      if(tag.startsWith('/')){const name=tag.slice(1).trim();if(stack.length<2||stack.at(-1).fullName!==name)error('XML-Tags sind nicht korrekt verschachtelt.');const closed=stack.pop();addText(closed.text);continue;}
      const self=/\/\s*$/.test(tag);if(self)tag=tag.replace(/\/\s*$/,'');const match=/^([A-Za-z_][\w.:-]*)([\s\S]*)$/.exec(tag);if(!match)error('Ungültiges XML-Tag.');
      const attrs={},rest=match[2];let cursor=0;const attr=/\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gy;while(cursor<rest.length){if(!rest.slice(cursor).trim())break;attr.lastIndex=cursor;const m=attr.exec(rest);if(!m)error('Ungültiges XML-Attribut.');if(!safeKey(m[1])||Object.hasOwn(attrs,m[1]))error('Doppeltes oder unzulässiges XML-Attribut.');attrs[m[1]]=xmlDecode(m[2]??m[3]);cursor=attr.lastIndex;}
      if(++nodes>limits.xmlNodes||stack.length>limits.depth)error('XML-Struktur zu groß oder zu tief. Bitte CSV verwenden.');
      const node={fullName:match[1],name:match[1].split(':').pop(),attrs,children:[],text:''};stack.at(-1).children.push(node);if(!self)stack.push(node);
    }
    if(stack.length!==1||root.children.length!==1)error('XML-Dokument ist unvollständig oder enthält mehrere Wurzeln.');
    return root.children[0];
  }
  function descendants(node,name) {const result=[];const visit=n=>{if(n.name===name)result.push(n);n.children.forEach(visit);};visit(node);return result;}
  const firstText=(node,name)=>clean(descendants(node,name)[0]?.text);
  async function readBMEcat(stream,ctx,encoding,expanded) {
    const source=await collect(stream,ctx,limits.xmlBytes,encoding,expanded),tree=xmlTree(source);if(tree.name!=='BMECAT')error('XML-Format nicht erkannt. Unterstützt wird BMEcat 1.2/2005; andere XML-Dateien bitte als CSV exportieren.');
    ctx.format='BMEcat XML';ctx.decimal='dot';ctx.supplier=firstText(tree,'SUPPLIER_NAME');
    ctx.headers=[...canonical,'source_net_list','source_net_customer','source_recommended_gross','source_currency','source_price_factor','source_image_url'];
    warning(ctx,'BMEcat-Preisarten bitte ausdrücklich EK/VK zuordnen. „nrp“ ist ein empfohlener Preis inklusive Umsatzsteuer und wird nicht automatisch als Nettopreis übernommen. Staffel-, Zeitraum- und Formelpreise müssen manuell geprüft werden.');
    const products=descendants(tree,'ARTICLE').concat(descendants(tree,'PRODUCT')),catalogCurrency=firstText(tree,'CURRENCY'),mimeRoot=firstText(tree,'MIME_ROOT');
    if(!products.length)error('Keine BMEcat-Artikel gefunden.');
    for(const product of products){abort(ctx.options.signal);ctx.recordsRead++;const basis=firstText(product,'PRICE_QUANTITY')||'1';
      const row={article_number:firstText(product,'SUPPLIER_AID')||firstText(product,'SUPPLIER_PID'),name:firstText(product,'DESCRIPTION_SHORT'),unit:normalizeUnit(firstText(product,'ORDER_UNIT')),purchase_price:'',recommended_price_1:'',recommended_price_2:'',price_unit:basis,supplier:ctx.supplier,manufacturer:firstText(product,'MANUFACTURER_NAME'),category:firstText(product,'REFERENCE_FEATURE_GROUP_NAME')||firstText(product,'REFERENCE_FEATURE_GROUP_ID'),source_net_list:'',source_net_customer:'',source_recommended_gross:'',source_currency:'',source_price_factor:'',_review:[]};
      const image=descendants(product,'MIME').find(node=>/^image\//i.test(firstText(node,'MIME_TYPE'))||/\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(firstText(node,'MIME_SOURCE')));if(image){const source=firstText(image,'MIME_SOURCE'),base=mimeRoot;try{row.source_image_url=technical?.safeImageURL(base?new URL(source,base).href:source)||'';}catch{row.source_image_url='';}}
      const namedFeatures={};for(const feature of descendants(product,'FEATURE')){const name=firstText(feature,'FNAME'),value=firstText(feature,'FVALUE');if(name&&value)namedFeatures[name]=value;}if(technical)row._technical_features=Object.fromEntries(Object.entries(technical.fromRow(namedFeatures).features).filter(([,entry])=>entry.source==='catalog'));
      if(product.attrs.mode&&product.attrs.mode!=='new'&&product.attrs.mode!=='update'){warning(ctx,'BMEcat-Löschanweisungen werden nicht ausgeführt.');continue;}
      const priceNodes=descendants(product,'ARTICLE_PRICE').concat(descendants(product,'PRODUCT_PRICE')),counts={};
      for(const p of priceNodes){const kind=p.attrs.price_type,kindKeys={net_list:'source_net_list',net_customer:'source_net_customer',nrp:'source_recommended_gross'},key=Object.hasOwn(kindKeys,kind)?kindKeys[kind]:null;if(!key){row._review.push('Weitere Preisart '+String(kind||'unbekannt')+': manuell prüfen.');continue;}counts[key]=(counts[key]||0)+1;const currency=firstText(p,'PRICE_CURRENCY')||catalogCurrency,factor=firstText(p,'PRICE_FACTOR')||'1',bound=firstText(p,'LOWER_BOUND')||'1',amount=firstText(p,'PRICE_AMOUNT');row.source_currency=currency;row.source_price_factor=factor;
        if(counts[key]>1||currency!=='EUR'||Number(factor)!==1||Number(bound)!==1||!/^\d+(?:\.\d{1,4})?$/.test(amount)){row[key]='';row._review.push('Preisart '+kind+' hat Staffel/Faktor/Währungs- oder Mehrdeutigkeitsangaben: manuell prüfen.');}else row[key]=amount;
      }
      if(descendants(product,'VALID_START_DATE').length||descendants(product,'VALID_END_DATE').length||descendants(product,'DATETIME').length||descendants(product,'PRICE_FORMULA').length){row.source_net_list='';row.source_net_customer='';row.source_recommended_gross='';row._review.push('Zeitabhängiger/Formelpreis: aktuellen endgültigen Preis manuell bestimmen.');}
      if(keep(ctx,row))break;
    }
  }
  async function zipDirectory(file) {
    const tail=new Uint8Array(await file.slice(Math.max(0,file.size-65557)).arrayBuffer()),view=new DataView(tail.buffer);let eocd=-1;
    for(let i=tail.length-22;i>=0;i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===tail.length){eocd=i;break;}
    if(eocd<0)error('ZIP-Zentralverzeichnis nicht gefunden. Datei ist unvollständig oder kein ZIP.');
    const disk=view.getUint16(eocd+4,true),centralDisk=view.getUint16(eocd+6,true),count=view.getUint16(eocd+10,true),size=view.getUint32(eocd+12,true),offset=view.getUint32(eocd+16,true);
    if(disk||centralDisk||view.getUint16(eocd+8,true)!==count)error('Mehrteilige ZIP-Archive werden nicht unterstützt.');
    if(count===65535||size===0xffffffff||offset===0xffffffff)error('ZIP64 wird nicht unterstützt. Bitte DATANORM-Datei entpackt oder als ZIP unter 2 GiB auswählen.');
    if(count>limits.entries||size>limits.directoryBytes||offset+size>file.size-tail.length+eocd)error('ZIP-Verzeichnis ist zu groß oder beschädigt.');
    const data=new Uint8Array(await file.slice(offset,offset+size).arrayBuffer()),v=new DataView(data.buffer),entries=[];let i=0,total=0;
    for(let n=0;n<count;n++){if(i+46>data.length||v.getUint32(i,true)!==0x02014b50)error('Beschädigtes ZIP-Verzeichnis.');const flags=v.getUint16(i+8,true),method=v.getUint16(i+10,true),compressed=v.getUint32(i+20,true),expanded=v.getUint32(i+24,true),nameLen=v.getUint16(i+28,true),extra=v.getUint16(i+30,true),comment=v.getUint16(i+32,true),start=v.getUint32(i+42,true);if(i+46+nameLen+extra+comment>data.length)error('Beschädigter ZIP-Dateiname.');
      const name=new TextDecoder(flags&0x800?'utf-8':'windows-1252',{fatal:true}).decode(data.subarray(i+46,i+46+nameLen));
      if(name.includes('\0')||name.startsWith('/')||name.includes('\\')||name.split('/').some(p=>p==='..')||/^[a-z]:/i.test(name))error('Unsicherer ZIP-Dateipfad.');
      if(flags&1)error('Passwortgeschützte ZIP-Dateien bitte zuerst auf dem Gerät entpacken.');if(![0,8].includes(method))error('ZIP-Komprimierung nicht unterstützt. Bitte ZIP mit Deflate oder entpackte Datei verwenden.');
      if(expanded===0xffffffff||compressed===0xffffffff||start===0xffffffff)error('ZIP64-Datei wird nicht unterstützt.');
      total+=expanded;if(expanded>limits.expandedBytes||total>limits.expandedBytes||expanded/Math.max(1,compressed)>limits.ratio)error('ZIP-Sicherheitslimit überschritten (2 GiB oder ungewöhnliches Entpackverhältnis).');
      if(method===0&&expanded!==compressed)error('Ungültige ZIP-Längen für unkomprimierte Datei.');
      entries.push({name,flags,method,compressed,expanded,start,crc:v.getUint32(i+16,true)});i+=46+nameLen+extra+comment;
    }
    if(i!==data.length)error('ZIP-Verzeichnis enthält unerwartete Zusatzdaten.');if(new Set(entries.map(e=>e.name)).size!==entries.length)error('ZIP enthält doppelte Dateinamen. Bitte eindeutig entpackte Dateien verwenden.');return entries;
  }
  async function zipStream(file,entry,ctx) {
    const raw=new Uint8Array(await file.slice(entry.start,entry.start+30).arrayBuffer());if(raw.length!==30)error('Unvollständiger ZIP-Dateikopf.');const v=new DataView(raw.buffer);if(v.getUint32(0,true)!==0x04034b50||v.getUint16(8,true)!==entry.method||(v.getUint16(6,true)&1))error('ZIP-Dateikopf stimmt nicht mit dem Verzeichnis überein.');
    const nameLength=v.getUint16(26,true),start=entry.start+30+nameLength+v.getUint16(28,true);if(start+entry.compressed>file.size)error('ZIP-Datei ist abgeschnitten.');
    const localName=new Uint8Array(await file.slice(entry.start+30,entry.start+30+nameLength).arrayBuffer()),name=new TextDecoder(entry.flags&0x800?'utf-8':'windows-1252',{fatal:true}).decode(localName);if(name!==entry.name)error('ZIP-Dateiname stimmt nicht mit dem Verzeichnis überein.');
    const original=file.slice(start,start+entry.compressed).stream(),reader=original.getReader();
    const counted=new ReadableStream({async pull(controller){try{abort(ctx.options.signal);const next=await reader.read();if(next.done)controller.close();else{ctx.bytesRead+=next.value.byteLength;progress(ctx);controller.enqueue(next.value);}}catch(e){controller.error(e);}},async cancel(){try{await reader.cancel();}catch{}}});
    let output=counted;
    if(entry.method===8){try{output=counted.pipeThrough(new DecompressionStream('deflate-raw'));}catch{try{await reader.cancel();}catch{}error('Dieser Browser kann ZIP-Deflate nicht lokal öffnen. Bitte DATANORM.001 auf dem Gerät entpacken und die entpackte Datei auswählen (keine Daten werden hochgeladen).');}}
    let length=0,crc=0xffffffff;
    return output.pipeThrough(new TransformStream({transform(chunk,controller){length+=chunk.length;if(length>entry.expanded)error('ZIP-Inhalt ist größer als im Verzeichnis angegeben.');for(const b of chunk)crc=crcTable[(crc^b)&255]^(crc>>>8);controller.enqueue(chunk);},flush(){if(length!==entry.expanded||((crc^0xffffffff)>>>0)!==entry.crc)error('ZIP-Prüfsumme oder Dateilänge stimmt nicht. Bitte Katalog erneut beim Lieferanten herunterladen.');}}));
  }
  async function readXlsx(file,entries,ctx) {
    const find=name=>entries.find(e=>e.name===name);
    const load=async(name,max=limits.xmlBytes)=>{const e=find(name);if(!e)return null;if(e.expanded>max)error('Excel-XML-Datei ist zu groß. Bitte als CSV exportieren.');return xmlTree(await collect(await zipStream(file,e,ctx),ctx,max,'utf-8',true));};
    if(entries.some(e=>/vbaProject\.bin$/i.test(e.name)))error('Excel mit Makros wird nicht eingelesen. Bitte XLSX ohne Makros oder CSV exportieren.');
    const workbook=await load('xl/workbook.xml'),rels=await load('xl/_rels/workbook.xml.rels');if(!workbook||!rels)error('Ungültige XLSX-Arbeitsmappe.');
    const sheets=descendants(workbook,'sheet');if(!sheets.length)error('XLSX enthält kein Tabellenblatt.');if(sheets.length>1)warning(ctx,'Excel enthält mehrere Tabellenblätter. Gelesen wird nur das erste Blatt: '+clean(sheets[0].attrs.name)+'. Weitere Blätter bitte separat importieren.');
    const relation=descendants(rels,'Relationship').find(n=>n.attrs.Id===sheets[0].attrs['r:id']);if(!relation||relation.attrs.TargetMode==='External')error('Externes/fehlendes Excel-Tabellenblatt wird nicht eingelesen.');
    let sheetPath=relation.attrs.Target.replace(/^\//,'');if(!sheetPath.startsWith('xl/'))sheetPath='xl/'+sheetPath;if(sheetPath.split('/').some(p=>p==='..'))error('Unsicherer Excel-Tabellenpfad.');
    const shared=await load('xl/sharedStrings.xml',limits.sharedXmlBytes),strings=shared?descendants(shared,'si').map(n=>checkText(n.text)):[],styles=await load('xl/styles.xml'),formats=new Map();
    if(styles)descendants(styles,'numFmt').forEach(n=>formats.set(n.attrs.numFmtId,n.attrs.formatCode));const cellXfs=styles?descendants(styles,'cellXfs')[0]?.children||[]:[];
    const sheet=await load(sheetPath);if(!sheet)error('Excel-Tabellenblatt fehlt.');let header=null;ctx.decimal='dot';
    for(const row of descendants(sheet,'row')){abort(ctx.options.signal);const cells=[];for(const c of row.children.filter(n=>n.name==='c')){const m=/^([A-Z]{1,3})\d+$/.exec(c.attrs.r||'');if(!m)error('Excel-Zelladresse fehlt oder ist ungültig.');let column=0;for(const ch of m[1])column=column*26+ch.charCodeAt(0)-64;column--;if(column>=limits.columns)error('Mehr als 64 Excel-Spalten. Bitte Katalog eingrenzen.');let value=firstText(c,'v');if(descendants(c,'f').length){value='';warning(ctx,'Excel-Formelzellen werden nicht berechnet oder aus Cachewerten übernommen. Fehlende Werte vor dem Speichern manuell ergänzen.');}else if(c.attrs.t==='s'){if(!/^\d+$/.test(value)||Number(value)>=strings.length)error('Ungültige Excel-Zeichenkettenreferenz.');value=strings[Number(value)];}else if(c.attrs.t==='inlineStr')value=firstText(c,'is');else if(c.attrs.t==='e'){value='';warning(ctx,'Excel enthält Fehlerzellen. Diese Werte bleiben leer.');}else if(!c.attrs.t||c.attrs.t==='n'){const code=formats.get(cellXfs[Number(c.attrs.s||0)]?.attrs.numFmtId);if(code&&/^0{2,20}$/.test(code)&&/^\d+$/.test(value))value=value.padStart(code.length,'0');}cells[column]=checkText(value);}
      if(!cells.some(v=>clean(v)))continue;if(!header){header=Array.from({length:cells.length},(_,i)=>clean(cells[i]||''));if(header.some(h=>!h||!safeKey(h)||h.startsWith('_'))||new Set(header).size!==header.length)error('Excel-Kopfzeile benötigt eindeutige, befüllte Spaltennamen ohne führenden Unterstrich.');ctx.headers=header;continue;}if(cells.length>header.length)error('Excel-Daten besitzen mehr Spalten als die Kopfzeile.');ctx.recordsRead++;if(keep(ctx,{...Object.fromEntries(header.map((h,i)=>[h,cells[i]??''])),_review:[]}))break;
    }
    if(!header)error('Excel-Tabelle ist leer.');ctx.format='XLSX';
  }
  async function readJson(stream,ctx,encoding,expanded) {
    let rows;try{rows=JSON.parse(await collect(stream,ctx,limits.jsonBytes,encoding,expanded));}catch(e){if(e instanceof SyntaxError)error('Ungültige JSON-Datei. Erwartet wird eine Liste einfacher Artikelobjekte.');throw e;}
    if(!Array.isArray(rows))error('JSON-Katalog muss eine Liste einfacher Artikelobjekte enthalten.');const headers=new Set();
    for(const row of rows){abort(ctx.options.signal);if(!row||typeof row!=='object'||Array.isArray(row))error('JSON-Artikeldaten müssen einfache Objekte sein.');const keys=Object.keys(row);if(keys.length>limits.columns)error('Mehr als 64 JSON-Felder.');for(const key of keys){if(!safeKey(key)||!clean(key)||key.startsWith('_'))error('Unzulässiger JSON-Feldname.');headers.add(key);const value=row[key];if(value!==null&&!['string','number'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))error('JSON enthält verschachtelte/ungültige Werte.');checkText(value??'');}if(headers.size>limits.columns)error('Mehr als 64 unterschiedliche JSON-Felder.');ctx.recordsRead++;if(keep(ctx,{...row,_review:[]}))break;}
    ctx.headers=[...headers];ctx.format='JSON';
  }
  async function readSource(stream,ctx,name,encoding,expanded) {
    if(/(?:^|\/)(?:datanorm|datpreis|datasets)\.[0-9]{3}$/i.test(name)||/\.(?:dat|[0-9]{3})$/i.test(name))return readDatanorm(stream,ctx,name,encoding==='auto'?'cp437':encoding,expanded);
    if(/\.json$/i.test(name))return readJson(stream,ctx,encoding==='auto'?'utf-8':encoding,expanded);
    if(/\.(?:xml|bmecat)$/i.test(name))return readBMEcat(stream,ctx,encoding==='auto'?'utf-8':encoding,expanded);
    if(/\.(?:csv|tsv|txt)$/i.test(name))return readDelimited(stream,ctx,name,encoding==='auto'?'utf-8':encoding,expanded);
    error('Nicht unterstütztes Katalogformat. Gelesen werden CSV, TSV, TXT, JSON, XLSX, BMEcat-XML, DATANORM 4/5 (.001/.dat) und ZIP mit diesen Dateien. Alte XLS/ODS/PDF/Bilder bitte als CSV/XLSX exportieren; Belege separat scannen.');
  }
  async function readCatalog(file,options={}) {
    const ctx=context(file,options);abort(options.signal);const name=file.name||options.filename||'',encoding=options.encoding||'auto',signature=new Uint8Array(await file.slice(0,4).arrayBuffer());
    if(signature[0]===0x50&&signature[1]===0x4b){
      const entries=await zipDirectory(file);abort(options.signal);
      if(entries.some(e=>e.name==='[Content_Types].xml')&&entries.some(e=>e.name==='xl/workbook.xml'))await readXlsx(file,entries,ctx);
      else{const candidates=entries.filter(e=>!e.name.endsWith('/')&&!/(?:^|[/])(?:readme|liesmich|bitte_lesen)(?:[._-]|$)/i.test(e.name)&&/\.(?:csv|tsv|txt|json|xml|bmecat|dat|\d{3})$/i.test(e.name)&&!/(?:^|\/)(?:datpreis|datasets)\./i.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));if(!candidates.length)error('ZIP enthält keinen unterstützten Artikelkatalog. Rabatt-/Preisdateien allein reichen nicht aus.');const selected=options.entryName?candidates.filter(e=>e.name===options.entryName):candidates;if(!selected.length)error('Ausgewählte Katalogdatei ist im ZIP nicht vorhanden.');if(selected.length>1&&!selected.every(e=>/(?:^|\/)datanorm\.\d{3}$/i.test(e.name)))error('ZIP enthält mehrere unterschiedliche Kataloge. Bitte eine Datei einzeln entpackt auswählen.');warning(ctx,'ZIP wird nur lokal und ausschnittsweise gelesen. Es findet keine vollständige Katalogübernahme im Hintergrund statt.');for(const entry of selected){await readSource(await zipStream(file,entry,ctx),ctx,entry.name,encoding,true);if(ctx.stoppedEarly)break;}for(const [source]of ctx.datanormSources||[]){const match=/^(.*\/)?datanorm\.(\d{3})$/i.exec(source);if(!match)continue;const priceName=(match[1]||'')+'DATPREIS.'+match[2],priceEntries=entries.filter(e=>e.name.toLowerCase()===priceName.toLowerCase());if(priceEntries.length>1)error('Mehrere Preisdateien mit gleicher Zuordnung.');if(priceEntries[0])await readDatanormPrices(await zipStream(file,priceEntries[0],ctx),ctx,priceEntries[0].name,encoding,true,source);}ctx.format='ZIP / '+ctx.format;}
    }else{if(signature[0]===0xd0&&signature[1]===0xcf)error('Altes Excel-XLS-Format erkannt. Bitte in Excel als XLSX oder CSV speichern.');let chosen=encoding;if(chosen==='auto'&&signature[0]===0xff&&signature[1]===0xfe)chosen='utf-16le';else if(chosen==='auto'&&signature[0]===0xfe&&signature[1]===0xff)chosen='utf-16be';await readSource(file.stream(),ctx,name,chosen,false);}
    abort(options.signal);ctx.phase='Prüfung abgeschlossen';progress(ctx,true);if(!ctx.rows.length&&!options.inspectOnly)warning(ctx,'Keine Artikel im gewählten Such-/Zeilenausschnitt gefunden.');
    if(ctx.truncated&&!options.scanAll)warning(ctx,'Nur dieser Ausschnitt mit höchstens '+ctx.maxRows+' Artikeln wurde gelesen. Weitere Artikel sind vorhanden; Suche eingrenzen oder den nächsten Ausschnitt wählen. Bei ZIP-Ausschnitten ist die vollständige Archiv-Prüfsumme noch nicht geprüft. Es wurde nichts automatisch gespeichert.');
    const suggestedMapping=automaticMapping(ctx.headers,ctx.rows,{listAsSellingPrice:options.listAsSellingPrice===true});const a=ctx.analysis;const analysis=a?{...a,manufacturers:[...a.manufacturers].sort(),categories:[...a.categories].sort(),complete:(options.inspectOnly===true||options.scanAll===true)&&!ctx.stoppedEarly}:null;return {analysis,headers:ctx.headers,rows:ctx.rows,warnings:ctx.warnings,format:ctx.format,totalMatches:ctx.matchedRows,scanComplete:!ctx.stoppedEarly,totalRead:ctx.recordsRead,truncated:ctx.truncated,hasMore:ctx.truncated,suggestedMapping,supplier:ctx.supplier,decimal:ctx.decimal,priceUnit:ctx.priceUnit};
  }
  return Object.freeze({articleDetails:(row,headers)=>technical?.fromRow(row,headers)||{features:{},image_url:''},limits,readCatalog,articleGroups,matchesGroups,aliasMap,automaticMapping,matchesArticle,normalizeUnit,priceText,xmlTree,zipDirectory,datanormVersion,datanormPrice});
});
