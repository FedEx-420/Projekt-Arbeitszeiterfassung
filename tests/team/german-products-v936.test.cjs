const assert=require('node:assert/strict');
global.WorktimeCatalogProducts=require('../../catalog-products-v921.js');
require('../../german-products-v936.js');
const G=global.WorktimeGermanProducts;
const entry={market:'DE',document_scope:'electrical-safety',brand:'Berker',sku:'47229909',gtin:'04011334233008',full_name:'Berker SCHUKO Steckdose S.1',source_url:'https://hager.com/de/katalog/produkt/47229909-test',document_url:'https://assets.hager.com/step-content/test.pdf',document_sha256:'a'.repeat(64),evidence_type:'manufacturer-eu-declaration',type_reference:'47229909',checked_at:new Date().toISOString()};
const m={name:entry.full_name,catalog_gtin:'4011334233008'};
assert.equal(G.allowed(m),true,'search must work before optional evidence loads');assert.equal(G.evidence(m),null);
G.setIndex({entries:{one:entry}});
assert.equal(G.allowed(m),true);
assert.equal(G.allowed({...m,catalog_country:'FR',catalog_manufacturer:'Ausländischer Hersteller'}),true,'manufacturer nationality is not a filter');
for(const name of ['Steckdose britisch BS 1363','Schweizer Steckdose Typ J','Steckdose Ausführung Schweiz','Berker Steckdose französisch','Steckdose italienisch Typ L','Steckdose dänisch Typ K','Steckdose NEMA 5-15','nicht für Deutschland geeignet'])assert.equal(G.allowed({...m,name}),false,name);
assert.equal(G.evidence({...m,catalog_gtin:'4011334233009'}),null,'invalid GTIN never fabricates evidence');assert.equal(G.allowed({...m,catalog_gtin:'4011334233009'}),true,'missing evidence is not a country exclusion');
assert.equal(G.allowed({name:m.name,catalog_manufacturer:'Berker',catalog_manufacturer_number:entry.sku}),true);
assert.equal(G.evidence({name:m.name,catalog_manufacturer:'Berker',catalog_article_number:entry.sku}),null,'wholesaler SKU is not manufacturer model');assert.equal(G.allowed({name:m.name}),true);
assert.equal(G.evidence({name:'Hager CE VDE DIN SCHUKO zugelassen Deutschland 230V'}),null,'name, standards, brand and CE alone are not evidence');
assert.equal(G.allowed({name:'Monteurstunde'}),true,'labor positions are not products');
for(const change of [{document_scope:'rohs'},{market:'FR'},{type_reference:'wrong'},{checked_at:'2020-01-01'},{document_url:'https://evil.test/test.pdf'},{source_url:'https://hager.com/fr/katalog/produkt/47229909-test'}]){G.setIndex({entries:{one:{...entry,...change}}});assert.equal(G.evidence(m),null,JSON.stringify(change));assert.equal(G.allowed(m),true,'an unavailable optional document does not hide an article');}
G.setIndex({entries:{one:entry,two:{...entry,document_sha256:'b'.repeat(64)}}});assert.equal(G.evidence(m),null,'ambiguous GTIN cannot choose evidence');assert.equal(G.allowed(m),true);
G.setIndex({entries:{one:entry}});assert.equal(G.allowed(m),true,'existing saved materials are evaluated without reimport');
console.log('PASS automatic foreign-variant exclusion, overseas makers and missing-country availability; optional evidence remains exact and never implies approval');

// Actual short-text patterns found in the supplied DATANORM master, no country field.
for(const name of ['Berker MAN0205123 Steckdose m.Schutzkontaktstift u.erh.BS Q.1/Q.3','Berker MAN0205323 Steckd.m.Schutzko.-Stift','Jung A3521WWM Steckdose, 13 A 250 V Schr.klemmen BS 1363-1','Steckdose T13 10 A 250V','Steckdose Typ 23 16 A','Steckdose CEE 7/5'])assert.equal(G.allowed({name}),false,name);
for(const name of ['Berker S.1 SCHUKO Steckdose','Wago Klemme 221-413','Gehäuse NEMA 4X','Einsteck Adapter Typ 236 Wasser 32x32 mm','Einsteckadapter EL T136 40x40mm','SOLARLOK Staubschutzkappe Stiftstecker','Brennstuhl Steckdosenleiste BRST1390007004','Stecker CEE 7/7','Steckdose ohne Schutzkontaktstift SCHUKO'])assert.equal(G.allowed({name}),true,name);
assert.equal(G.identify({name:'Berker S.1 SCHUKO Steckdose'}).system,'SCHUKO');
assert.equal(G.identify({name:'Steckdose DIN VDE 0620-1'}).system,'VDE_0620');
assert.equal(G.identify({name:'ABB unbekannter Artikel 12345'}).status,'unknown');
console.log('PASS technical identification without country fields: contact pins, abbreviated DATANORM text, BS norms, Swiss types; no guesses from generic codes or NEMA enclosure ratings');

global.WorktimeProductDisplay={resolve:m=>m.id==='official'?{full_name:'Steckdose T13 10 A 250 V'}:null};
assert.equal(G.allowed({id:'official',name:'Hersteller Artikel 12345'}),false,'exactly associated manufacturer details identify an otherwise opaque article');
assert.equal(G.allowed({id:'unresolved',name:'Hersteller Artikel 12345'}),true,'unknown manufacturer models are not guessed');
delete global.WorktimeProductDisplay;
