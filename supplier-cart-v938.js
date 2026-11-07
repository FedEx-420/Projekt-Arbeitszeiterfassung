/* IDS 2.5 messages: supplier SKU and real quantities, no customer selling prices. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WorktimeSupplierCart=api;})(globalThis,()=>{
 'use strict';
 const uploadEndpoint='https://www.gconlineplus.de/?page=PageOnlinePlusUpload';
 const endpoint='https://www.gconlineplus.de/ids.aspx',namespace='http://www.itek.de/Shop-Anbindung/Warenkorb/';
 // Fixed HTTPS destinations only. An EFG account must start its IDS session
 // on EFG, rather than losing cart context during a GC-to-EFG shop switch.
 const shops=Object.freeze({gc:Object.freeze({id:'gc',name:'GC ONLINE PLUS',endpoint,uploadEndpoint}),efg:Object.freeze({id:'efg',name:'EFG ONLINE PLUS',endpoint:'https://efgonlineplus.de/ids.aspx',uploadEndpoint:'https://efgonlineplus.de/?page=PageOnlinePlusUpload'})});
 function shopFor(supplier,choice=''){if(choice&&!Object.hasOwn(shops,choice))throw Error('Bitte GC ONLINE PLUS oder EFG ONLINE PLUS als Onlinezugang wählen.');return shops[choice||(/\befg\b/i.test(supplier||'')?'efg':'gc')];}
 const units={stk:'PCE',stück:'PCE',st:'PCE',pce:'PCE',m:'MTR',meter:'MTR',mtr:'MTR',kg:'KGM',kgm:'KGM',paar:'PR',pr:'PR',satz:'SET',set:'SET',l:'LTR',ltr:'LTR',m2:'MTK','m²':'MTK',mtk:'MTK',m3:'MTQ','m³':'MTQ',mtq:'MTQ',cm:'CMT',mm:'MMT',g:'GRM',km:'KTM'};
 const xml=v=>String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
 function clean(value,max,label,required=false){const s=String(value??'').trim();if((required&&!s)||[...s].length>max||/[\u0000-\u001f\u007f]/.test(s))throw Error(label+' fehlt, ist zu lang oder enthält ungültige Zeichen.');return s;}
 function quantity(value){const s=String(value??'').trim().replace(',','.');if(!/^\d{1,6}(?:\.\d{1,2})?$/.test(s)||Number(s)<=0||Number(s)>999999.99)throw Error('Bitte eine Menge größer 0 mit höchstens zwei Nachkommastellen eingeben.');return Number(s).toFixed(2);}
 function unit(value){const v=units[String(value||'').trim().toLowerCase()];if(!v)throw Error('Diese Einheit lässt sich nicht sicher bestellen. Stück, Meter, Kilogramm, Paar oder Satz verwenden; Packungsinhalte nicht raten.');return v;}
 function normalize(lines,supplier){if(!Array.isArray(lines)||!lines.length||lines.length>1000)throw Error('Bitte 1 bis 1000 Materialpositionen auswählen.');const refs=new Set();return lines.map((line,index)=>{if(String(line.supplier||'').trim()!==String(supplier||'').trim())throw Error('Alle Positionen müssen zum ausgewählten Großhändler gehören.');const ref=clean(line.ref||String(index+1),35,'Positionsreferenz',true);if(refs.has(ref))throw Error('Eine Positionsreferenz ist doppelt.');refs.add(ref);return {...line,ref,sku:clean(line.sku,15,'Großhandelsartikelnummer',true),quantity:quantity(line.quantity),qu:unit(line.unit),name:clean(line.name,4000,'Artikelbezeichnung')};});}
 function build({lines,supplier,customer='',order='',commission='',shipping='',date=new Date()}){const rows=normalize(lines,supplier);const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));const stamp=parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute+':'+parts.second;let header='';order=clean(order,15,'Bestellreferenz');commission=clean(commission,80,'Kommission');customer=clean(customer,40,'Kundennummer');if(!['Lieferung','Abholung'].includes(shipping))throw Error('Bitte Lieferung oder Abholung auswählen.');header='<OrderInfo>'+(order?'<PartNo>'+xml(order)+'</PartNo>':'')+'<ModeOfShipment>'+shipping+'</ModeOfShipment>'+(commission?'<Kommission>'+xml(commission)+'</Kommission>':'')+'</OrderInfo>';if(customer)header+='<CustomerInfo><IDNo>'+xml(customer)+'</IDNo></CustomerInfo>';
  return '<?xml version="1.0" encoding="UTF-8"?>\n<Warenkorb xmlns="'+namespace+'"><WarenkorbInfo><Date>'+stamp.slice(0,10)+'</Date><Time>'+stamp.slice(11,19)+'</Time><Version>2.5</Version></WarenkorbInfo><Order>'+header+rows.map(r=>'<OrderItem><RefItems><Customer>'+xml(r.ref)+'</Customer></RefItems><ArtNo>'+xml(r.sku)+'</ArtNo><Qty>'+r.quantity+'</Qty><QU>'+r.qu+'</QU>'+(r.name?'<Kurztext>'+xml([...r.name].slice(0,100).join(''))+'</Kurztext><Langtext>'+xml(r.name)+'</Langtext>':'')+'</OrderItem>').join('')+'</Order></Warenkorb>';
 }
 // GC's own upload screen documents CSV as Artikelnummer;Menge.
 // No header, prices, customer data or spreadsheet formulas are emitted.
 function shopCSV({lines,supplier}){return normalize(lines,supplier).map(r=>{if(/[;",\r\n]/.test(r.sku)||/^[=+@-]/.test(r.sku))throw Error('Artikelnummer '+r.sku+' kann nicht sicher als GC-Importdatei ausgegeben werden. Bitte die Großhandelsartikelnummer prüfen.');return r.sku+';'+r.quantity.replace('.',',');}).join('\r\n')+'\r\n';}
 const fifIdsEndpoint='https://www.onlinesystem.de/IDS';
 const fifUploadURL='https://www.onlinesystem.de/Warenkorb/Scan2FiF';
 const isFifSupplier=value=>/\bgautzsch\b/i.test(String(value||''));
 const isFifSku=sku=>typeof sku==='string'&&/^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/.test(sku);
 function fifArticleURL(supplier,sku){
  if(!isFifSupplier(supplier)||!isFifSku(sku))return '';
  const url=new URL('https://www.onlinesystem.de/Search');
  url.searchParams.set('SearchOwnPartNumbers','false');
  url.searchParams.set('q',sku);
  return url.href;
 }
 function fifTXT({lines,supplier}){
  if(!isFifSupplier(supplier)||!Array.isArray(lines)||!lines.length||lines.length>1000)throw Error('Bitte einen Gautzsch-Warenkorb mit 1 bis 1000 Positionen auswählen.');
  const skus=new Set();
  return lines.flatMap(row=>{
   if(row.supplier!==supplier||!isFifSku(row.sku))throw Error('Bitte die Gautzsch-Artikelnummer im Katalog prüfen.');
   if(skus.has(row.sku))throw Error('Die Gautzsch-Artikelnummer ist doppelt. Bitte die Positionen vor dem Export zusammenfassen.');
   skus.add(row.sku);
   unit(row.unit);
   return [row.sku,quantity(row.quantity).replace(/\.00$/,'')];
  }).join(';');
 }
 function fifCartURL(value){let url;try{url=new URL(value);}catch{throw Error('FiF hat keinen gültigen Warenkorb bestätigt.');}if(url.origin!=='https://www.onlinesystem.de'||url.username||url.password||url.port||url.search||url.hash||!/^\/Warenkorb\/[1-9]\d{0,14}$/.test(url.pathname))throw Error('Die FiF-Warenkorbadresse konnte nicht bestätigt werden.');return url;}
 function fifPortalTransfer({lines,supplier,shipping,callback}){
  if(!isFifSupplier(supplier))throw Error('Bitte einen Gautzsch-Warenkorb auswählen.');
  let url;try{url=new URL(callback);}catch{throw Error('Die FiF-Rückgabeadresse fehlt.');}
  if(url.protocol!=='https:'||!/^([a-z0-9]+\.)?supabase\.co$/.test(url.hostname)||url.username||url.password||url.port||url.hash||url.pathname!=='/functions/v1/ids-cart-return-v938'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(url.searchParams.get('job')||'')||!/^[0-9a-f]{64}$/.test(url.searchParams.get('token')||'')||[...url.searchParams].length!==2)throw Error('Die FiF-Rückgabeadresse konnte nicht bestätigt werden.');
  return {action:'WKS',version:'2.5',hookurl:url.href,warenkorb:build({lines,supplier,shipping})};
 }
 function fifTransfer({lines,supplier,username,password,shipping}){
  if(!isFifSupplier(supplier))throw Error('Bitte einen Gautzsch-Warenkorb auswählen.');
  const user=clean(username,50,'FiF-Benutzername',true);
  if(typeof password!=='string'||!password||password.length>50||/[\u0000-\u001f\u007f]/.test(password))throw Error('Bitte das FiF-Kennwort mit höchstens 50 Zeichen eingeben.');
  return {action:'WKS',name_kunde:user,pw_kunde:password,warenkorb:build({lines,supplier,shipping})};
 }
 function parseResponse(text,Parser=globalThis.DOMParser){if(typeof text!=='string'||text.length>1048576||/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('Ungültige oder zu große Warenkorbrückmeldung.');const doc=new Parser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length||doc.documentElement.localName!=='Warenkorb'||![namespace,''].includes(doc.documentElement.namespaceURI||''))throw Error('Die Rückmeldung ist kein lesbarer IDS-Warenkorb.');const child=(node,name)=>[...node.children].find(n=>n.localName===name),get=(node,name)=>child(node,name)?.textContent||'';const order=child(doc.documentElement,'Order');if(!order)throw Error('In der Rückmeldung fehlt der Warenkorb.');const rows=[...order.children].filter(n=>n.localName==='OrderItem');if(rows.length>1000)throw Error('Die Rückmeldung enthält zu viele Positionen.');return rows.map(n=>({ref:get(child(n,'RefItems')||n,'Customer'),sku:get(n,'ArtNo'),quantity:get(n,'Qty'),unit:get(n,'QU'),name:get(n,'Langtext')||get(n,'Kurztext'),error:get(n,'Fehlertext'),errorCode:get(n,'Fehlercode')}));}
 return Object.freeze({endpoint,namespace,xml,quantity,unit,normalize,build,parseResponse,shopCSV,uploadEndpoint,shopFor,fifTXT,fifUploadURL,isFifSupplier,fifArticleURL,fifTransfer,fifPortalTransfer,fifCartURL,fifIdsEndpoint});
});
