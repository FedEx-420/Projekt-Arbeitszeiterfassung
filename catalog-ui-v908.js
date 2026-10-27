/* Attach to the existing materials view; never replaces its save/delete logic. */
(() => {
  'use strict';
  function create({ root, state, api, reload, render, businessId, isManager, escape: esc }) {
    const format = window.WorktimeCatalogFormat;
    if (!format) return null;
    const advanced=window.WorktimeCatalogImportUI?.create({root,state,api,reload,render,businessId,isManager,escape:esc});
    const management=window.WorktimeCatalogManagement?.create({root,state,api,reload,render,businessId,isManager,escape:esc});
    let scope = '', selected = '', materialSearch='', revision = 0, draft = null, parsed = null, preview = null, filename = '', supplier = '', mapping = {}, decimal = 'comma', priceUnit = '1', net = false, page = 0, busy = false, message = '', error = false, readSerial = 0;
    const current = () => isManager() && state.profile && businessId() ? state.profile.id + ':' + businessId() : '';
    const materials = () => (state.rows.materials || []).filter(m => String(m.business_id) === String(businessId()));
    const euro = value => value == null ? 'Nicht hinterlegt' : Number(value).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' €';
    const labels = { article_number: 'Artikelnummer', name: 'Artikelname', unit: 'Basiseinheit', purchase_price: 'Einkaufspreis (EK)', recommended_price_1: 'Empfohlener VK *', recommended_price_2: 'Empfohlener VK **', price_unit: 'Preiseinheit (z. B. 100)' };
    function ensure() {
      if (scope !== current()) {
        scope = current(); selected = ''; materialSearch='';revision = 0; draft = null; parsed = null; preview = null; filename = ''; supplier = ''; mapping = {}; net = false; page = 0; busy = false; message = ''; error = false; readSerial++;
      }
      return !!scope;
    }
    const field = (name, label, value, attrs = '') => `<label>${esc(label)}<input name="catalog_${name}" value="${esc(format.prices.includes(name) && value != null ? String(value).replace('.', ',') : value ?? '')}" ${attrs}></label>`;
    function editor() {
      const material = materials().find(m => m.id === selected), value = draft || material || {};
      return `<section class="panel catalog-v908"><h3>EK und empfohlene Verkaufspreise</h3><p>EUR netto pro Basiseinheit. Leer bedeutet „nicht hinterlegt“, 0 bedeutet ausdrücklich kostenlos. Der bisherige Standard-Verkaufspreis und abgerechnete Positionen bleiben unverändert.</p><label>Material auswählen<select name="catalog_material"><option value="">Bitte auswählen</option>${materials().slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'de')).map(m => `<option value="${esc(m.id)}" ${m.id === selected ? 'selected' : ''}>${esc(m.name)}${m.active === false ? ' · inaktiv' : ''}</option>`).join('')}</select></label>${material ? `<form data-form="catalog-prices-v908" class="entry-form"><p class="wide"><b>${esc(material.name)}</b> · ${esc(material.unit || 'Stk')} · Standard-VK: ${euro(material.unit_price)}</p>${format.prices.map(key => field(key, labels[key] + ' je ' + (material.unit || 'Stk'), value[key], 'inputmode="decimal" placeholder="Nicht hinterlegt"')).join('')}${field('supplier', 'Lieferant für Katalog-Zuordnung', value.catalog_supplier, 'maxlength="120"')}${field('article_number', 'Artikelnummer des Lieferanten', value.catalog_article_number, 'maxlength="120"')}<p class="wide device-help">Lieferant und Artikelnummer nur gemeinsam eintragen. Diese eindeutige Zuordnung ermöglicht spätere Aktualisierungen; gleichnamige Materialien werden nicht automatisch zusammengeführt. Artikelnummern bleiben einschließlich führender Nullen erhalten.</p><button class="primary wide" ${busy ? 'disabled' : ''}>Katalogpreise speichern</button></form>` : ''}</section>`;
    }
    function mappingView() {
      if (!parsed) return '';
      return `<form data-form="catalog-preview-v908" class="entry-form">${field('supplier', 'Lieferant', supplier, 'required maxlength="120"')}<label>Dezimalzeichen in Preistexten<select name="catalog_decimal"><option value="comma" ${decimal === 'comma' ? 'selected' : ''}>Komma · 12,34 (ohne Tausenderpunkte)</option><option value="dot" ${decimal === 'dot' ? 'selected' : ''}>Punkt · 12.34 (ohne Tausenderkommas)</option></select></label>${format.fields.map(key => `<label>${esc(labels[key])}<select name="catalog_map_${key}" ${['article_number', 'name', 'unit'].includes(key) ? 'required' : ''}><option value="">${key === 'price_unit' ? 'Festen Wert unten verwenden' : 'Nicht übernehmen'}</option>${parsed.headers.map(h => `<option value="${esc(h)}" ${mapping[key] === h ? 'selected' : ''}>${esc(h)} · Beispiel: ${esc(String(parsed.rows[0]?.[h] ?? '').slice(0, 70))}</option>`).join('')}</select></label>`).join('')}${field('price_unit', 'Feste Preiseinheit bei nicht zugeordneter Spalte', priceUnit, 'required inputmode="numeric"')}<p class="wide device-help">Beispiel: 250,00 € pro 100 M werden zu 2,50 € je M. Einheit und Verpackungsgröße sind nicht dasselbe. Keine automatische Rabatt-, Brutto-/Netto- oder Verpackungsumrechnung. Leere Preiszellen lassen vorhandene Preise unverändert.</p><label class="wide catalog-check"><input type="checkbox" name="catalog_net" ${net ? 'checked' : ''} required> Die zugeordneten Preise sind EUR netto und endgültige Preise. EK, VK * und VK **, Einheiten, Preisfaktoren und gegebenenfalls bereits verrechnete Rabatte habe ich geprüft.</label><button class="primary wide" ${busy ? 'disabled' : ''}>Vorschau berechnen · noch nichts speichern</button></form>`;
    }
    function previewView() {
      if (!preview) return '';
      const start = page * 25, subset = preview.slice(start, start + 25), pages = Math.ceil(preview.length / 25);
      return `<section class="catalog-preview"><h4>Vorschau · ${preview.length} Artikel · ${esc(supplier)}</h4><p>Neu: ${preview.filter(r => r.action === 'create').length} · Aktualisierung: ${preview.filter(r => r.action === 'update').length}. Alle Preise unten sind je Basiseinheit normalisiert. Neue Materialien starten mit Standard-VK 0; empfohlene Preise werden nicht ungefragt zum Rechnungspreis.</p><div class="catalog-table-wrap" tabindex="0" aria-label="Prüfbare Importvorschau"><table><thead><tr><th>Artikel</th><th>Aktion</th><th>Einheit</th><th>Quell-Preiseinheit</th><th>EK netto</th><th>VK * netto</th><th>VK ** netto</th></tr></thead><tbody>${subset.map(row => `<tr><td><b>${esc(row.data.article_number)}</b><br>${esc(row.data.name)}</td><td>${row.action === 'create' ? 'Neu' : 'Aktualisieren'}${row.inactive ? '<br>Bleibt inaktiv' : ''}</td><td>${esc(row.data.unit)}</td><td>je ${row.source_price_unit}</td>${format.prices.map(key => `<td>${Object.prototype.hasOwnProperty.call(row.data, key) ? euro(row.data[key]) : 'Unverändert / leer'}${row.previous ? `<small>Bisher: ${euro(row.previous[key])}</small>` : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="actions"><button type="button" class="secondary" data-catalog-action="page-prev" ${page ? '' : 'disabled'}>Vorherige Artikel</button><span>Seite ${page + 1} / ${pages}</span><button type="button" class="secondary" data-catalog-action="page-next" ${page + 1 < pages ? '' : 'disabled'}>Weitere Artikel</button></div><form data-form="catalog-import-v908"><label class="catalog-check"><input type="checkbox" name="catalog_confirm" required> Ich übernehme ausdrücklich alle ${preview.length} geprüften Artikel dieser Vorschau. Nur die zugeordneten Katalogpreise werden aktualisiert. Vorhandene Standard-VK, Belege und historische Rechnungen bleiben unverändert.</label><button class="primary" ${busy ? 'disabled' : ''}>${preview.length} Artikel verbindlich übernehmen</button><button type="button" class="secondary" data-catalog-action="discard-preview">Vorschau verwerfen</button></form></section>`;
    }
    function view() {
      if (!ensure()) return '';
      if(advanced)return `<div data-catalog-v908><p role="${error?'alert':'status'}" class="catalog-status ${error?'catalog-error':''}">${esc(message)}</p>${advanced.view()}${management?.view()||''}<details class="supplier-settings" ${selected?'open':''}><summary>Preise eines vorhandenen Artikels bearbeiten</summary>${editor()}</details></div>`;
      return `<div data-catalog-v908><p role="${error ? 'alert' : 'status'}" class="catalog-status ${error ? 'catalog-error' : ''}">${esc(message)}</p>${editor()}<section class="panel catalog-v908"><h3>Großhändler-Katalog importieren</h3><p>Unterstützt: CSV, TSV und JSON mit einer Tabelle einfacher Artikel. Höchstens 2 MB und 1000 Artikel je Import. Vorschau und Zuordnung erfolgen auf diesem Gerät; erst „verbindlich übernehmen“ speichert die ausgewählten Daten.</p><p>Excel/XLSX, DATANORM, ZIP/XML, Makros und verschachtelte JSON-Kataloge sind hier noch nicht unterstützt. Bitte beim Großhändler einen CSV-Export mit Artikelnummer, Basiseinheit und eindeutig bezeichneten Nettopreisen anfordern. Für weitere Formate wird eine anonymisierte Musterdatei mit Preis-/Rabattbeschreibung benötigt.</p><div class="entry-form"><label>Datei<input type="file" name="catalog_file" accept=".csv,.tsv,.json,text/csv,application/json,text/tab-separated-values" ${busy ? 'disabled' : ''}></label><label>Textcodierung<select name="catalog_encoding"><option value="utf-8">UTF-8</option><option value="windows-1252">Windows-1252 / ANSI</option></select></label><label>CSV-Trennzeichen<select name="catalog_delimiter"><option value=";">Semikolon (;)</option><option value=",">Komma (,)</option><option value="tab">Tabulator</option></select></label><button type="button" class="secondary" data-catalog-action="read" ${busy ? 'disabled' : ''}>Datei lokal einlesen</button></div>${parsed ? `<p>${esc(filename)} · ${parsed.rows.length} Artikel erkannt</p>` : ''}${mappingView()}${previewView()}</section></div>`;
    }
    async function action(task, success) {
      ensure(); if (!scope || busy) return;
      const stamp = scope; busy = true;
      root.querySelectorAll('[data-catalog-v908] button').forEach(b => b.disabled = true);
      try { await task(); if (stamp !== current()) return; await reload(); if (stamp !== current()) return; if (selected && !draft) revision = Number(materials().find(m => m.id === selected)?.catalog_revision || 1); message = success; error = false; }
      catch (failure) { if (stamp !== current()) return; message = failure.message || 'Speichern nicht bestätigt. Bitte Daten prüfen und erneut versuchen.'; error = true; }
      finally { if (stamp === current()) { busy = false; render(); } }
    }
    async function submit(form) {
      if (!ensure()) return;
      if (form.dataset.form === 'catalog-prices-v908') {
        const m = materials().find(row => row.id === selected); if (!m) throw Error('Bitte vorhandenes Material auswählen.');
        const data = Object.fromEntries(new FormData(form)), values = {}, stamp = scope;
        draft = { ...m, ...Object.fromEntries(format.prices.map(key => [key, data['catalog_' + key]])), catalog_supplier: data.catalog_supplier, catalog_article_number: data.catalog_article_number };
        for (const key of format.prices) values[key] = format.money(data['catalog_' + key], 'comma', 1);
        if (Boolean(String(data.catalog_supplier || '').trim()) !== Boolean(String(data.catalog_article_number || '').trim())) throw Error('Lieferant und Artikelnummer bitte gemeinsam eintragen oder beide leer lassen.');
        return action(async () => { await api('/rest/v1/rpc/save_material_prices_v908', { method: 'POST', body: { p_id: m.id, p_company: businessId(), p_revision: revision, p_prices: values, p_supplier: data.catalog_supplier || null, p_article_number: data.catalog_article_number || null } }); if (stamp === current()) draft = null; }, 'Katalogpreise gespeichert. Historische Abrechnungen und Standard-VK unverändert.');
      }
      if (form.dataset.form === 'catalog-preview-v908') {
        const data = Object.fromEntries(new FormData(form)); supplier = data.catalog_supplier; decimal = data.catalog_decimal; priceUnit = data.catalog_price_unit; net = form.elements.catalog_net.checked;
        mapping = Object.fromEntries(format.fields.map(key => [key, data['catalog_map_' + key]]));
        preview = format.prepare(parsed, { supplier, mapping, decimal, price_unit: priceUnit, net_eur: net }, materials()); page = 0; message = 'Nur Vorschau erstellt. Es wurde noch nichts gespeichert.'; error = false; render(); return;
      }
      if (form.dataset.form === 'catalog-import-v908') {
        if (!preview?.length || !form.elements.catalog_confirm.checked) throw Error('Bitte zuerst die Vorschau erstellen und ausdrücklich bestätigen.');
        const rows = preview.map(r => r.data), company = businessId(), importSupplier = supplier, stamp = scope;
        return action(async () => { const result = await api('/rest/v1/rpc/import_material_catalog_v908', { method: 'POST', body: { p_company: company, p_supplier: importSupplier, p_rows: rows, p_confirm_net_eur: true } }); if (!result || String(result.company_id) !== String(company) || Number(result.created) + Number(result.updated) + Number(result.unchanged) !== rows.length) throw Error('Übernahme noch nicht bestätigt. Vorschau behalten und nach Neuladen prüfen.'); if (stamp === current()) { parsed = null; preview = null; filename = ''; } }, 'Katalog übernommen. Bestehende Standard-VK und Rechnungspositionen bleiben unverändert.');
      }
    }
    function showError(failure) { message = failure.message || 'Bitte Eingaben prüfen.'; error = true; render(); }
    root.addEventListener('submit', event => {
      const form = event.target; if (!form.dataset?.form?.startsWith('catalog-')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      Promise.resolve(submit(form)).catch(showError);
    }, true);
    root.addEventListener('change', event => {
      if (!ensure()) return;
      if (event.target.name === 'catalog_material') {
        selected = event.target.value; draft = null; revision = Number(materials().find(m => m.id === selected)?.catalog_revision || 1); render();
      }
      if (event.target.closest('form[data-form="catalog-preview-v908"]')) { preview = null; }
    });
    root.addEventListener('click', event => {
      const button = event.target.closest('[data-catalog-action]'); if (!button || !ensure() || busy) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const task = button.dataset.catalogAction;
      if(task==='edit-metadata'){selected=button.dataset.id;draft=null;revision=Number(materials().find(m=>m.id===selected)?.catalog_revision||1);render();root.querySelector('[name="catalog_material"]')?.scrollIntoView?.({block:'center',behavior:'smooth'});}
      if (task === 'page-prev' || task === 'page-next') { page = Math.max(0, Math.min(Math.ceil(preview.length / 25) - 1, page + (task === 'page-next' ? 1 : -1))); render(); }
      if (task === 'discard-preview') { preview = null; render(); }
      if (task === 'read') {
        const file = root.querySelector('[name="catalog_file"]')?.files?.[0];
        if (!file) return showError(Error('Bitte eine CSV-, TSV- oder JSON-Datei auswählen.'));
        if (file.size > format.limits.bytes) return showError(Error('Datei ist größer als 2 MB. Bitte den Katalog aufteilen.'));
        if (!/\.(csv|tsv|json)$/i.test(file.name)) return showError(Error('Dieses Dateiformat wird nicht unterstützt. Bitte CSV, TSV oder JSON verwenden.'));
        const encoding = root.querySelector('[name="catalog_encoding"]').value, rawDelimiter = root.querySelector('[name="catalog_delimiter"]').value, delimiter = rawDelimiter === 'tab' ? '\t' : rawDelimiter;
        const stamp = scope, request = ++readSerial; parsed = null; preview = null; busy = true;
        file.arrayBuffer().then(buffer => {
          if (stamp !== current() || request !== readSerial) return;
          let source; try { source = new TextDecoder(encoding, { fatal: true }).decode(buffer); } catch { throw Error('Textcodierung passt nicht. UTF-8 oder Windows-1252 gezielt auswählen und erneut lesen.'); }
          parsed = format.parse(source, { filename: file.name, delimiter }); filename = file.name; mapping = Object.fromEntries(format.fields.map(key => [key, parsed.headers.includes(key) ? key : ''])); message = 'Datei nur lokal gelesen. Jetzt Spalten und Preiseinheit zuordnen.'; error = false;
        }).catch(failure => { if (stamp === current() && request === readSerial) { parsed = null; preview = null; message = failure.message; error = true; } }).finally(() => { if (stamp === current() && request === readSerial) { busy = false; render(); } });
      }
    }, true);
    function grossNote(input){const value=Number(input.value),label=input.closest?.('label');if(!label)return;label.firstChild.textContent='Netto-Verkaufspreis in € (ohne Umsatzsteuer) ';let note=label.querySelector('[data-material-gross]');if(!note){note=document.createElement('small');note.dataset.materialGross='';label.append(note);}note.textContent=input.value!==''&&Number.isFinite(value)?'Brutto bei 19 %: '+euro(value*1.19)+' · Vergleichswert; die tatsächliche Umsatzsteuer wird in der Rechnung gewählt.':'Bitte Nettopreis ohne Umsatzsteuer eintragen.';}
    function searchMaterials(){
      const byId=new Map(materials().map(m=>[m.id,m])),query=materialSearch.trim(),matcher=window.WorktimeCatalogImport?.matchesArticle;
      const mapping={name:'name',article_number:'catalog_article_number',supplier:'catalog_supplier'};
      const fallbackTokens=query.toLocaleLowerCase('de').split(/\s+/).filter(Boolean);let total=0,visible=0;
      for(const button of root.querySelectorAll('[data-action="edit-material"]')){
        const card=button.closest('.row-card'),m=byId.get(button.dataset.id);if(!card||!m)continue;total++;card.dataset.materialCatalogCard='';
        // Same word-by-word name matching as catalog search; preserve explicit supplier search.
        const match=!query||(matcher?matcher({...m,name:[m.catalog_product_name||m.name,...Object.values(window.WorktimeCatalogClassify?.describe(m)||{})].join(' ')},query,mapping):fallbackTokens.every(token=>[m.name,m.catalog_article_number,m.catalog_supplier].some(v=>String(v||'').toLocaleLowerCase('de').includes(token))));
        card.hidden=!match;if(match)visible++;
      }
      const output=root.querySelector('[data-material-search-count]');if(output)output.textContent=visible+' von '+total+' gespeicherten Materialien';window.WorktimeCatalogProducts?.syncVisibility(root);
    }
    function afterRender(){
      if(!ensure())return;const catalog=root.querySelector('[data-catalog-v908]'),firstMaterial=root.querySelector('[data-action="edit-material"]')?.closest('.row-card');if(catalog&&firstMaterial&&!(catalog.compareDocumentPosition(firstMaterial)&Node.DOCUMENT_POSITION_FOLLOWING))firstMaterial.before(catalog);advanced?.afterRender();
      const firstCard=root.querySelector('[data-action="edit-material"]')?.closest('.row-card');if(firstCard&&!root.querySelector('[data-material-search]')){const label=document.createElement('label');label.className='catalog-material-search';label.innerHTML='Gespeicherte Materialliste durchsuchen<input type="search" data-material-search placeholder="Name, Artikelnummer oder Vertrieb"><small data-material-search-count></small>';label.querySelector('input').value=materialSearch;firstCard.before(label);}searchMaterials();
      for(const form of root.querySelectorAll('form[data-form="material"],form[data-form="material-edit"],form[data-form="hourly-price"]')){const input=form.querySelector('[name="price"]');if(input)grossNote(input);}
      const byId=new Map(materials().map(m=>[m.id,m]));for(const button of root.querySelectorAll('[data-action="edit-material"],form[data-form="hourly-price"] [name="id"]')){
        const id=button.dataset?.id||button.value,m=byId.get(id),card=button.closest?.('.row-card')||button.closest?.('section.panel');if(!m||!card||card.querySelector('[data-material-catalog-summary]'))continue;
        const box=document.createElement('div');box.dataset.materialCatalogSummary='';box.className='catalog-material-meta';
        const classification=window.WorktimeCatalogClassify?.describe(m);
        box.innerHTML=`${classification?`<span>Hersteller: ${esc(classification.manufacturer||'Nicht erkannt')}${classification.manufacturer_source==='inferred'?' · aus Bezeichnung erkannt':''}</span><span>Kategorie: ${esc(classification.category)}</span>`:''}<span>Artikelnummer: <b>${esc(m.catalog_article_number||'Nicht hinterlegt')}</b></span><span>Vertrieb / Lieferant: ${esc(m.catalog_supplier||'Nicht hinterlegt')}</span><span>EK netto: ${euro(m.purchase_price)}</span><span>VK * netto: ${euro(m.recommended_price_1)}</span><span>VK ** netto: ${euro(m.recommended_price_2)}</span><span>Standard-VK netto: ${euro(m.unit_price)} · Brutto bei 19 %: ${euro(Number(m.unit_price||0)*1.19)}</span>${Number(m.unit_price)===0&&(m.recommended_price_1!=null||m.recommended_price_2!=null)?'<strong>Standard-Verkaufspreis ist 0 €. Vor Verwendung als Rechnungspreis bitte bewusst prüfen.</strong>':''}<button type="button" class="secondary small" data-catalog-action="edit-metadata" data-id="${esc(m.id)}">Artikelnummer, Vertrieb, EK und VK bearbeiten</button>`;
        card.append(box);
      }
      window.WorktimeCatalogProducts?.decorate({root,materials:materials(),api,businessId,reload,render,isManager});
    }
    root.addEventListener('input',event=>{if(event.target.matches?.('[data-material-search]')&&ensure()){materialSearch=event.target.value;searchMaterials();}if(event.target.name==='price'&&event.target.closest?.('form[data-form="material"],form[data-form="material-edit"],form[data-form="hourly-price"]'))grossNote(event.target);const form=event.target.closest?.('form[data-form="catalog-prices-v908"]');if(form&&ensure()){const m=materials().find(row=>row.id===selected);if(m){const data=Object.fromEntries(new FormData(form));draft={...m,...Object.fromEntries(format.prices.map(key=>[key,data['catalog_'+key]])),catalog_supplier:data.catalog_supplier,catalog_article_number:data.catalog_article_number};}}});
    return { view, reset: () => { scope = ''; ensure();advanced?.reset();management?.reset(); }, afterRender };
  }
  window.WorktimeCatalog = { create };
})();
