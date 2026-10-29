/* Automatic country-variant exclusion; optional evidence is information, never a search prerequisite. */
(function(root){
 'use strict';
 let entries=[],byGTIN=new Map(),bySKU=new Map(),ready=false,failed=false;
 const key=(brand,sku)=>String(brand||'').trim().toLowerCase()+'\u001f'+String(sku||'').trim();
 const gtin=value=>root.WorktimeCatalogProducts?.gtin(value);
 // An explicit foreign installation system overrides a matching public record.
 const foreign=/(?:\b(?:BS\s*1363|BS\s*546|NEMA\s*(?:[156]|L\d{1,2})[- ]\d|SEV\s*1011|SN\s*441011)\b|\b(?:Steckdose|Steckdosen|Stecksystem|Ausf(?:ü|ue)hrung)\b[^.;\n]{0,45}\b(?:Schweiz|schweizer(?:isch)?|britisch|franz(?:ö|oe)sisch|belgisch|italienisch|d(?:ä|ae)nisch|USA|UK|Typ\s*(?:G|J|L|K))\b|\b(?:Schweiz|schweizer|britische|franz(?:ö|oe)sische|italienische|d(?:ä|ae)nische)\s+(?:Steckdose|Steckdosen|Ausf(?:ü|ue)hrung)\b|\bnicht\s+(?:f(?:ü|ue)r|in)\s+Deutschland\b|\bnur\s+f(?:ü|ue)r\s+(?:Export|Schweiz|USA|UK)\b)/i;
 function valid(e){
  if(!e||e.market!=='DE'||e.document_scope!=='electrical-safety'||!e.brand||!e.sku||!gtin(e.gtin)||gtin(e.gtin)!==e.gtin)return false;
  try{const product=new URL(e.source_url),document=new URL(e.document_url);return !product.username&&!product.password&&!document.username&&!document.password&&product.origin==='https://hager.com'&&product.pathname.startsWith('/de/katalog/produkt/'+String(e.sku).toLowerCase()+'-')&&document.origin==='https://assets.hager.com'&&/^\/step-content\/.*\.pdf$/i.test(document.pathname)&&e.evidence_type==='manufacturer-eu-declaration'&&e.type_reference===e.sku&&/^[a-f0-9]{64}$/.test(e.document_sha256)&&Number.isFinite(Date.parse(e.checked_at))&&Date.now()-Date.parse(e.checked_at)<90*86400000&&Date.parse(e.checked_at)<=Date.now()+86400000;}catch{return false;}
 }
 function setIndex(data){entries=Object.values(data?.entries||{}).filter(valid);byGTIN=new Map();bySKU=new Map();for(const e of entries){byGTIN.set(e.gtin,byGTIN.has(e.gtin)?null:e);const k=key(e.brand,e.sku);bySKU.set(k,bySKU.has(k)?null:e);}ready=true;failed=false;root.dispatchEvent?.(new Event('worktime-german-products'));}
 function evidence(m){
  const text=[m.name,m.catalog_product_name,root.WorktimeProductDisplay?.resolve(m)?.full_name].filter(Boolean).join(' ');if(foreign.test(text))return null;
  // Never interpret a wholesaler's article number as a manufacturer's model number.
  const raw=String(m.catalog_gtin||'').trim(),code=gtin(raw);const e=raw?(code?byGTIN.get(code):null):bySKU.get(key(m.catalog_manufacturer,m.catalog_manufacturer_number));
  return e&&valid(e)&&!foreign.test(e.full_name||'')?e:null;
 }
 const labor=m=>['monteurstunde','meisterstunde','aushilfsstunde','auszubildendenstunde'].includes(String(m.name||'').trim().toLowerCase());
 function identify(m){
  if(!m||labor(m))return {status:'unknown',system:'',reason:''};
  const resolved=root.WorktimeProductDisplay?.resolve(m),parts=[m.name,m.catalog_product_name,resolved?.full_name];
  for(const k of ['socket_system','plug_system','socket_use','standard']){const entry=m.catalog_features?.[k];if(entry&&!entry.conflict)parts.push(entry.value);}
  let text=parts.filter(Boolean).join(' ').normalize('NFKC');
  // A negative statement about the contact pin is not a Type-E socket.
  text=text.replace(/\b(?:ohne|kein(?:en)?)\s+(?:Schutzkontaktstift|Schutzko\.?[- ]?Stift|Schutzk\.?[- ]?st\.?|SK[- .]*Stift|Erdungsstift)\b/gi,' ');
  const socket=/\b(?:steckdose\w*|steckd\.?|stecker\w*|kupplung\w*|socket|outlet)\b/i.test(text);
  const result=(status,system,reason)=>({status,system,reason,source:resolved?'Artikeltext und zugeordnete Herstellerdaten':'Artikeltext'});
  if(/\b(?:steckdose\w*|steckd\.?|socket|outlet)\b/i.test(text)&&/\b(?:Schutzkontaktstift|Schutzko\.?[- ]?Stift|Schutzk\.?[- ]?st\.?|SK[- .]*Stift|Erdungsstift)\b|\bCEE\s*7\s*\/\s*5\b/i.test(text))return result('excluded','TYPE_E','Steckdose mit Schutzkontaktstift / Stecksystem Typ E');
  if(socket&&/\b(?:Typ\s*(?:12|13|15|21|23|25)|T\s*(?:12|13|15|21|23|25)|SN\s*441011|(?:SN\s*)?SEV\s*1011)\b/i.test(text))return result('excluded','CH','Schweizer Stecksystem anhand Typ-/Normbezeichnung');
  if(/\bBS[ .-]*1363\b|\bBS[ .-]*546\b/i.test(text))return result('excluded','UK','Britisches Stecksystem anhand BS-Norm');
  if(socket&&/\bNEMA\s*(?:[156]|L\d{1,2})[- ]\d{1,2}[RP]?\b/i.test(text))return result('excluded','NEMA','NEMA-Stecksystem');
  if(socket&&/\b(?:CEI\s*23[- ]50|Typ\s*[GJKL])\b/i.test(text))return result('excluded','OTHER','Abweichender nationaler Steckertyp');
  if(foreign.test(text))return result('excluded','OTHER','Ausdrücklich angegebene fremde Länderausführung');
  if(/\bSCHUKO\b|Schutzkontakt(?:steckdose|[- ]Steckdose)|\bCEE\s*7\s*\/\s*(?:3|4|7)\b/i.test(text))return result('matching','SCHUKO','SCHUKO / kompatibles Schutzkontakt-Stecksystem erkannt');
  if(socket&&/\b(?:DIN\s*)?VDE\s*0620(?:-1)?\b/i.test(text))return result('matching','VDE_0620','Steckdosennorm DIN VDE 0620 genannt');
  if(/\bCEE\b/.test(text)&&/\b(?:60309|Drehstrom)\b/i.test(text))return result('matching','IEC_60309','CEE-Industriestecksystem erkannt');
  return result('unknown','','Ausführung aus den vorliegenden Angaben nicht eindeutig bestimmbar');
 }
 const excluded=m=>identify(m).status==='excluded';
 const allowed=m=>!!m&&!excluded(m);
 function status(){return 'Automatische Ausführungserkennung anhand Stecksystem, Kontaktart, Typ- und Normnummern sowie zugeordneter Herstellerdaten. Fehlende Länderfelder blockieren keine Artikel. Eine erkannte Bauart ist keine Zulassungsbestätigung.';}

 function install({root:app,state,render,businessId}){
  let queued=false;
  function syncSuggestions(){
   queued=false;const companyRows=(state.rows.materials||[]).filter(m=>String(m.business_id)===String(businessId()));const byId=new Map(companyRows.map(m=>[String(m.id),m]));for(const button of app.querySelectorAll('[data-action="edit-material"]')){const card=button.closest('.row-card'),m=byId.get(button.dataset.id),proof=m&&evidence(m);if(card&&m&&!card.querySelector('[data-country-identification]')){const identified=identify(m),label=document.createElement('p');label.dataset.countryIdentification='';label.className='device-help';label.textContent=identified.reason+(identified.status==='matching'?' · technisch erkannt, keine Zulassungsbestätigung':'');card.append(label);}if(!card||!proof||card.querySelector('[data-german-evidence]'))continue;const note=document.createElement('p');note.dataset.germanEvidence='';note.className='device-help';const link=document.createElement('a');link.href=proof.document_url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Deutschland-Filter: Herstellerunterlagen zum Artikel';note.append(link);card.append(note);}const lists=[...app.querySelectorAll('datalist#materials,datalist#offer-materials')];if(!lists.length)return;
   const rows=(state.rows.materials||[]).filter(m=>String(m.business_id)===String(businessId())&&m.active!==false&&allowed(m));
   for(const list of lists){const names=list.id==='materials'?rows.map(m=>m.name):(root.WorktimeCatalogProducts?.groups(rows.filter(m=>!labor(m)))||[]).map(g=>g.name);const unique=[...new Set(names)];if(JSON.stringify([...list.options].map(o=>o.value))===JSON.stringify(unique))continue;list.replaceChildren(...unique.map(name=>{const option=document.createElement('option');option.value=name;return option;}));}
  }
  function schedule(){if(!queued){queued=true;queueMicrotask(syncSuggestions);}}
  const observer=new MutationObserver(schedule);observer.observe(app,{childList:true,subtree:true});
  const refresh=()=>{if(state.view==='materials'&&!state.busy&&!app.querySelector('form[data-form="material-edit"]'))render();schedule();};root.addEventListener('worktime-german-products',refresh);root.addEventListener('worktime-product-index',refresh);schedule();return {afterRender:schedule};
 }
 let resolveReady;const loaded=new Promise(resolve=>{resolveReady=resolve;});
 root.WorktimeGermanProducts={allowed,excluded,identify,evidence,foreign:m=>foreign.test(String(m||'')),setIndex,status,install,loaded,get ready(){return ready;},get count(){return entries.length;}};
 if(root.document){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);fetch('https://raw.githubusercontent.com/FedEx-420/Projekt-Arbeitszeiterfassung/main/catalog-de-evidence.json',{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'}).then(r=>{if(!r.ok)throw Error();return r.json();}).catch(()=>fetch('catalog-de-evidence.json',{credentials:'omit',signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw Error();return r.json();})).then(setIndex).catch(()=>{ready=true;failed=true;root.dispatchEvent(new Event('worktime-german-products'));}).finally(()=>{clearTimeout(timer);resolveReady();});}else resolveReady();
})(globalThis);
