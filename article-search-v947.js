/* Search and facet helpers shared by material browsing and purchasing. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WorktimeArticleSearch=api;})(globalThis,()=>{
 'use strict';
 const normalizeRaw=v=>String(v??'').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\bhigh definition(?: multimedia interface)?\b/g,'hdmi');
 const normalized=new Map();
 function normalize(value){const raw=String(value??'');if(raw.length>1024)return normalizeRaw(raw);if(normalized.has(raw))return normalized.get(raw);const result=normalizeRaw(raw);if(normalized.size>=5000)normalized.delete(normalized.keys().next().value);normalized.set(raw,result);return result;}
 const compact=v=>normalize(v).replace(/ /g,'');
 const identifiers=m=>[m.catalog_article_number,m.catalog_manufacturer_number,m.catalog_gtin].filter(Boolean).map(String);
 const fields=m=>[m.name,m.catalog_product_name,m.catalog_manufacturer,m.catalog_category,m.catalog_supplier,...identifiers(m)];
 // Cache lexical projections by object and actual current text, never by material ID or account.
 const projections=new WeakMap();
 function project(m){const display=globalThis.WorktimeProductDisplay?.displayName(m)||m.catalog_product_name||m.name,raw=fields(m).map(v=>String(v??'')),signature=JSON.stringify([display,...raw]);let entry=projections.get(m);if(entry?.signature===signature)return entry;const text=[...new Set([display,...raw].filter(Boolean).map(String))],folded=text.map(normalizeRaw);entry={signature,name:normalizeRaw(m.catalog_product_name||m.name),brand:normalizeRaw(m.catalog_manufacturer||''),ids:identifiers(m).map(v=>normalizeRaw(v).replace(/ /g,'')),text:text.concat(folded).map(v=>v.toLowerCase()).join('\u001f')};projections.set(m,entry);return entry;}
 // Identify the requested product, rather than promoting a cover or adapter that mentions it.
 const genericTypes=[['steckdose',/\bsteckdose(?:n)?\b/],['schalter',/\bschalter\b/],['taster',/\btaster\b/],['dimmer',/\bdimmer\b/],['rahmen',/\brahmen\b/],['kabel',/\bkabel\b/],['leitung',/\bleitung(?:en)?\b/],['bohrer',/\bbohrer\b/],['schraube',/\bschraube(?:n)?\b/],['sicherung',/\bsicherung(?:en)?\b/],['leuchte',/\bleuchte(?:n)?\b/]];
 function intent(m,query,prepared){const q=normalize(query),name=prepared?.name??normalize(m.catalog_product_name||m.name),types=genericTypes.filter(([,rx])=>rx.test(q));const brand=prepared?.brand??normalize(m.catalog_manufacturer||''),ignored=/^(?:weiss|polarweiss|reinweiss|schwarz|rot|gruen|blau|gelb|grau|anthrazit|matt|glaenzend|berker|hager|gira|jung|siemens|abb|wago|dehn|bosch|theben|mit|ohne|fuer|und|oder|von|in|auf|ein|eine|der|die|das|stk|stueck|mm|cm|meter)$/;const nouns=q.split(' ').filter(w=>w.length>=3&&!/[0-9]/.test(w)&&!ignored.test(w)&&!brand.split(' ').includes(w));if(!types.length&&!nouns.length)return {accept:true,bonus:0};
  const wantsAccessory=/\babdeckung|\babdeckplatte|\bzentralplatte|\bhalter|\badapter|\bersatz|\bzubehoer|\beinsatz fuer|\brahmen|\bwippe|\bdeckel|\bbeschrift|\bsteckdosenleiste|\bverlaenger/.test(q);
  const accessory=/\b(?:steckdosen|geraete)?abdeckung|\babdeckplatte|\bzentralplatte|\bhalter|\badapter|\bersatz|\bzubehoer|\brahmen|\bwippe|\bdeckel|\bbeschrift|\bblind|\bfrontplatte/.exec(name);
  if(!wantsAccessory&&accessory&&!/\b(?:mit|ohne|inklusive|inkl)\b/.test(name.slice(0,accessory.index)))return {accept:false,bonus:0};
  const relational=/\b(?:fuer|zu|passend zu|geeignet fuer)\b/.exec(name),position=types.length?Math.min(...types.map(([,rx])=>{const match=rx.exec(name);return match?match.index:Infinity;})):Math.min(...nouns.map(w=>{const i=name.indexOf(w);return i<0?Infinity:i;}));
  if(!wantsAccessory&&relational&&position>relational.index)return {accept:false,bonus:0};
  if(types.some(([k])=>k==='steckdose')){
   const special=/\bcee\b|\bdrehstrom|\bhdmi\b|\bvga\b|\brj\s?45\b|\bnetzwerk|\bdatendose|\btae\b|\btelefon|\bantennen|\bsat\b|\bkoax|\baudio|\blautsprecher|\bcinch|\bklinke|\bsteckdosenleiste|\bverlaenger/;
   if(!special.test(q)&&special.test(name))return {accept:false,bonus:0};
   // A mains socket with an additional USB charger remains a mains socket.
   if(!/\busb\b/.test(q)&&/\busb\b/.test(name)&&!/schuko|schutzkontakt|230\s?v|250\s?v/.test(name))return {accept:false,bonus:0};
   return {accept:true,bonus:/schuko|schutzkontakt/.test(name)?12000:8000};
  }
  return {accept:true,bonus:Number.isFinite(position)?7000:0};
 }

 // Function intent outranks unrequested special variants; this is not a sales-popularity claim.
 function functionBonus(m,query,prepared){
  const q=normalize(query),name=prepared?.name??normalize(m.catalog_product_name||m.name);
  const kinds=[['wechselschalter',/wechsel\s*schalter/],['kreuzschalter',/kreuz\s*schalter/],['serienschalter',/serien\s*schalter/],['taster',/taster/],['steckdose',/steckdose/],['leitungsschutzschalter',/leitungsschutzschalter/],['fehlerstromschutzschalter',/fehlerstromschutzschalter|fi schalter/]];
  const wanted=kinds.find(([,rx])=>rx.test(q));if(!wanted)return 0;
  if(!wanted[1].test(name))return -15000;
  const variants=[['kontroll',/kontroll|rueckmeld/],['beleuchtet',/beleuchtet|beleuchtung|glimm|led/],['orientierung',/orientierung/],['jalousie',/jalousie|rollladen/],['elektronik',/elektroni|smart|funk|knx|busankoppler/],['zweipolig',/zweipol|2 pol|2pol/],['aufputz',/aufputz|\bap\b/],['feuchtraum',/feuchtraum|wassergeschuetzt/]];
  let penalty=0;for(const [,rx] of variants)if(rx.test(name)&&!rx.test(q))penalty+=18000;
  const accessory=/wippe|abdeckung|zentralplatte|rahmen|ersatz|zubehoer|adapter/;
  if(accessory.test(name)&&!accessory.test(q))penalty+=30000;
  return 14000-penalty+(/einsatz/.test(name)&&!accessory.test(name)?2000:0);
 }
 function score(m,query){const q=normalize(query),c=compact(query);if(!q)return 0;const p=project(m);if(p.scoreQuery===q)return p.scoreValue;const ids=p.ids;let value;if(ids.includes(c))value=100000;else if(ids.some(v=>v.startsWith(c)))value=60000;else{const name=p.name,i=intent(m,query,p),extras=/\bsteckdose(?:n)?\b/.test(q)?['led','usb','orientier','kontroll','zeitschalt','abschliess','beleucht'].filter(t=>name.includes(t)&&!q.includes(t)).length*2500:0;value=functionBonus(m,query,p)+(i.accept?i.bonus:-20000)-extras+(name===q?4000:name.startsWith(q)?2000:name.includes(q)?1000:0)+q.split(' ').reduce((sum,t)=>sum+(name.split(' ').includes(t)?30:name.includes(t)?10:0),0);}p.scoreQuery=q;p.scoreValue=value;return value;}

 function rank(rows,query,get=r=>r){return rows.map((row,index)=>({row,index,score:score(get(row),query)})).sort((a,b)=>b.score-a.score||a.index-b.index).map(x=>x.row);}
 function matches(m,query,featureAPI,extra=[]){const raw=String(query||'').trim();if(!raw)return true;const q=compact(query);if(raw.length===1)return identifiers(m).some(v=>compact(v)===q);const p=project(m);if(p.ids.includes(q))return true;
  const text=p.text+'\u001f'+extra.filter(Boolean).map(String).map(v=>v.toLowerCase()+'\u001f'+normalize(v)).join('\u001f');
  let found;
  if(featureAPI?.compileQuery)found=featureAPI.compileQuery(String(query).replace(/\bhigh[-\s]+definition(?:[-\s]+multimedia[-\s]+interface)?\b/gi,'HDMI'))(m,[],text);
  else if(featureAPI?.queryMatches){const values=fields(m).concat(extra).filter(Boolean);found=featureAPI.queryMatches(m,String(query).replace(/\bhigh[-\s]+definition(?:[-\s]+multimedia[-\s]+interface)?\b/gi,'HDMI'),values.concat(values.map(normalize)));}
  else found=normalize(query).split(' ').every(token=>text.includes(token));
  return !!found&&intent(m,query,p).accept;
 }

 function facets(rows,getValue,selected=''){const counts=new Map();for(const m of rows){const raw=getValue(m),values=Array.isArray(raw)?raw:[raw];for(const value of new Set(values.filter(Boolean)))counts.set(String(value),(counts.get(String(value))||0)+1);}if(selected&&!counts.has(selected))counts.set(selected,0);return [...counts].sort((a,b)=>a[0].localeCompare(b[0],'de',{numeric:true})).map(([value,count])=>({value,count}));}
 function suggestions(rows,query,{describe=m=>({manufacturer:m.catalog_manufacturer,category:m.catalog_category}),features,limit=5,prioritize=rows=>rows,preFiltered=false,preRanked=false}={}){if(normalize(query).length<2)return {articles:[],groups:[]};const articles=prioritize(preRanked?rows:rank(preFiltered?rows:rows.filter(m=>matches(m,query,features)),query)).slice(0,limit),groups=[];for(const key of ['manufacturer','category']){const seen=new Set();for(const m of rows){const value=describe(m)[key];if(value&&!seen.has(value)&&normalize(value).includes(normalize(query))){seen.add(value);groups.push({key,value});if(seen.size>=3)break;}}}return{articles,groups};}
 async function cooperativeFilter(rows,predicate,valid=()=>true){const found=[];let slice=performance.now();for(let i=0;i<rows.length;i++){if(predicate(rows[i],i))found.push(rows[i]);if(performance.now()-slice>=8){await new Promise(resolve=>setTimeout(resolve,0));if(!valid())return null;slice=performance.now();}}return valid()?found:null;}
 async function rankAsync(rows,query,get=r=>r,valid=()=>true){const values=[];let slice=performance.now();for(let index=0;index<rows.length;index++){values.push({row:rows[index],index,score:score(get(rows[index]),query)});if(performance.now()-slice>=8){await new Promise(resolve=>setTimeout(resolve,0));if(!valid())return null;slice=performance.now();}}if(!valid())return null;values.sort((a,b)=>b.score-a.score||a.index-b.index);return values.map(x=>x.row);}
 const completeRanking=query=>/schalter|taster|steckdose|dimmer|bohrer|schraube|leitung|kabel|sicherung|leuchte/i.test(String(query||""));
 return Object.freeze({completeRanking,normalize,compact,identifiers,intent,score,rank,rankAsync,cooperativeFilter,warm:m=>{project(m);},matches,facets,suggestions});
});
