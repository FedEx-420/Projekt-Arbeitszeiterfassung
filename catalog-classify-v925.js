/* Local, explainable suggestions. A supplier code is never decoded by guessing. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WorktimeCatalogClassify=api;})(globalThis,function(){
 'use strict';
 const brands=['Hager','Berker','Siemens','ABB','Busch-Jaeger','Gira','Jung','Merten','Schneider Electric','Eaton','Doepke','Döpke','Legrand','Theben','MDT','Wago','Phoenix Contact','Weidmüller','OBO Bettermann','Dehn','Rittal','Hensel','Spelsberg','Kaiser','Knipex','Wiha','Wera','Gedore','Bosch','Makita','Milwaukee','Hilti','Festool','Stabila','Benning','Fluke','Testo','Steinel','Ledvance','Osram','Philips','Signify','RZB','Trilux','Brumberg','SLV','Paulmann','Zumtobel','Bega','Dimplex','Stiebel Eltron','Vaillant','Viega','Grohe','Hansgrohe','Geberit','Grundfos','Wilo','Rehau','Siedle','Ritto','TCS','Doorbird','Ubiquiti','MikroTik','Digitus','Telegärtner','Eltako','Shelly','Homematic IP','Esylux'];
 const normalize=s=>String(s??'').trim().toLocaleLowerCase('de').replace(/[\s-]+/g,'');
 const canonical=new Map(brands.map(b=>[normalize(b),b]));canonical.set('doepke','Döpke');canonical.set('buschjaeger','Busch-Jaeger');
 const pattern=brands.slice().sort((a,b)=>b.length-a.length).map(b=>b.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/[ -]+/g,'[\\s-]*')).join('|');
 const brandPattern=new RegExp('(^|[^a-zäöüß0-9])('+pattern+')(?=$|[^a-zäöüß0-9])','giu');
 const rules=[
 ['Mess- und Prüfgeräte',/multimeter|spannungsprüfer|durchgangsprüfer|installationstester|stromzange|prüfgerät|messgerät|duspol/i],
 ['Werkzeug',/schraubendreher|schraubenzieher|zange\b|kabelmesser|abisolier|crimp|bohrer|bohrhammer|bohrmaschine|bitsatz|bit-set|werkzeug|schraubenschlüssel|akkuschrauber|sägeb(latt|lätter)|stichsäge|winkelschleifer/i],
 ['Arbeitsschutz',/schutzbrille|schutzhandschuh|arbeitshandschuh|gehörschutz|atemschutz|sicherheitsschuh|schutzhelm/i],
 ['Türkommunikation',/türsprech|türstation|innenstation|klingeltaster|klingeltrafo|gegensprech|doorbell/i],
 ['Netzwerk und Datentechnik',/patchkabel|patchpanel|rj\s?45|netzwerk|daten(dose|kabel)|glasfaser|lwl|switch\b|router|access\s?point|cat\.?\s?[5678]/i],
 ['Gebäudeautomation',/\bknx\b|dali|smart.?home|busankoppler|schaltaktor|dimmaktor|jalousieaktor|funkaktor|shelly|homematic/i],
 ['Verteilung und Schutzgeräte',/leitungsschutz|fehlerstrom|fi[-\s]?schalter|fi\/ls|ls[-\s]?schalter|sicherungsautomat|überspannungs|sicherungseinsatz|kleinverteiler|unterverteil|zählerschrank|schaltschrank|hauptschalter|schütz\b/i],
 ['Schaltermaterial',/steckdose|schuko|wippe|abdeckrahmen|zentralplatte|schalter(einsatz|programm)|taster|wechselschalter|kreuzschalter|serienschalter|\bschalter\b|dimmer|\bberker\s+s[.\s]?1\b/i],
 ['Anschluss- und Verbindungstechnik',/klemme|kabelschuh|aderendhülse|verbinder|steckverbinder|verbindungsmuffe/i],
 ['Kabelverlegesysteme',/kabelkanal|brüstungskanal|kabelrinne|kabelpritsche|kabelschutzrohr|installationsrohr|leerrohr/i],
 ['Kabel und Leitungen',/\bnym\b|\bnyy\b|\bh0[357]\b|kabel\b|leitung\b|aderleitung|mantelleitung|gummileitung/i],
 ['Befestigungs- und Installationsmaterial',/dübel|schraube|kabelbinder|nagelschelle|rohrschelle|befestigung|montageband|unterputzdose|hohlwanddose|abzweigdose/i],
 ['Beleuchtung',/leuchte|leuchtmittel|led[-\s]?(lampe|panel|band|streifen|röhre)|glühlampe|strahler|downlight|lichtleiste|\bgu10\b|\be27\b/i],
 ['Heizung und Klima',/thermostat|heiz|wärmepumpe|klimaanlage|lüfter|ventilator|durchlauferhitzer|warmwasserspeicher/i],
 ['Sanitär',/waschtisch|armatur|brause|dusch|spülkasten|siphon|absperrventil|wasserhahn/i],
 ['Batterien und Akkus',/batterie|akku\b|ladegerät|knopfzelle/i]
 ];
 const code=s=>/^\s*(?:(?:wg|warengruppe|gruppe)\s*)?\d[\d\s./-]*$/i.test(String(s??''));
 const cache=new Map();
 function infer(name){const text=String(name??'');if(cache.has(text))return cache.get(text);const found=new Set();for(const match of text.matchAll(brandPattern)){const prefix=text.slice(Math.max(0,match.index-45),match.index+match[1].length);if(/(?:passend|kompatibel|geeignet|ersatz).*\b(?:für|zu)\s*$|\bfür\s*$/i.test(prefix))continue;found.add(canonical.get(normalize(match[2])));}
  const result={manufacturer:found.size===1?[...found][0]:'',category:rules.find(([,rx])=>rx.test(text))?.[0]||'Sonstiges / noch nicht zugeordnet'};if(cache.size>=5000)cache.clear();cache.set(text,result);return result;}
 function describe(row){const name=row.catalog_product_name||row.name||'',guess=infer(name),manufacturer=String(row.catalog_manufacturer??row.manufacturer??'').trim(),category=String(row.catalog_category??row.category??'').trim();const explicitManufacturer=manufacturer&&!code(manufacturer)&&!/^(-+|unbekannt|nicht bekannt|n\/?a|k\.?\s?a\.?|kein hersteller)$/i.test(manufacturer),explicitCategory=category&&!code(category);
  return {manufacturer:explicitManufacturer?manufacturer:guess.manufacturer,category:explicitCategory?category:guess.category,manufacturer_source:explicitManufacturer?(row.catalog_manufacturer_source||row.manufacturer_source||'catalog'):(guess.manufacturer?'inferred':'unknown'),category_source:explicitCategory?(row.catalog_category_source||row.category_source||'catalog'):'inferred',source_category:row.source_category||category};
 }
 return Object.freeze({describe,infer,isCode:code});
});
