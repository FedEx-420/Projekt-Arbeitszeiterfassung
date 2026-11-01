/* Search and facet helpers shared by material browsing and purchasing. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WorktimeArticleSearch=api;})(globalThis,()=>{
 'use strict';
 const normalize=v=>String(v??'').toLocaleLowerCase('de').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\bhigh definition(?: multimedia interface)?\b/g,'hdmi');
 const compact=v=>normalize(v).replace(/ /g,'');
 const identifiers=m=>[m.catalog_article_number,m.catalog_manufacturer_number,m.catalog_gtin].filter(Boolean).map(String);
 const fields=m=>[m.name,m.catalog_product_name,m.catalog_manufacturer,m.catalog_category,m.catalog_supplier,...identifiers(m)];
 // Identify the requested product, rather than promoting a cover or adapter that mentions it.
 const genericTypes=[['steckdose',/\bsteckdose(?:n)?\b/],['schalter',/\bschalter\b/],['taster',/\btaster\b/],['dimmer',/\bdimmer\b/],['rahmen',/\brahmen\b/],['kabel',/\bkabel\b/],['leitung',/\bleitung(?:en)?\b/],['bohrer',/\bbohrer\b/],['schraube',/\bschraube(?:n)?\b/],['sicherung',/\bsicherung(?:en)?\b/],['leuchte',/\bleuchte(?:n)?\b/]];
 function intent(m,query){const q=normalize(query),name=normalize(m.catalog_product_name||m.name),types=genericTypes.filter(([,rx])=>rx.test(q));const brand=normalize(m.catalog_manufacturer||''),ignored=/^(?:weiss|polarweiss|reinweiss|schwarz|rot|gruen|blau|gelb|grau|anthrazit|matt|glaenzend|berker|hager|gira|jung|siemens|abb|wago|dehn|bosch|theben|mit|ohne|fuer|und|oder|von|in|auf|ein|eine|der|die|das|stk|stueck|mm|cm|meter)$/;const nouns=q.split(' ').filter(w=>w.length>=3&&!/[0-9]/.test(w)&&!ignored.test(w)&&!brand.split(' ').includes(w));if(!types.length&&!nouns.length)return {accept:true,bonus:0};
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
 function score(m,query){const q=normalize(query),c=compact(query);if(!q)return 0;const ids=identifiers(m).map(compact);if(ids.includes(c))return 100000;if(ids.some(v=>v.startsWith(c)))return 60000;const name=normalize(m.catalog_product_name||m.name),i=intent(m,query),extras=/\bsteckdose(?:n)?\b/.test(q)?['led','usb','orientier','kontroll','zeitschalt','abschliess','beleucht'].filter(t=>name.includes(t)&&!q.includes(t)).length*2500:0;return (i.accept?i.bonus:-20000)-extras+(name===q?4000:name.startsWith(q)?2000:name.includes(q)?1000:0)+q.split(' ').reduce((sum,t)=>sum+(name.split(' ').includes(t)?30:name.includes(t)?10:0),0);}
 function rank(rows,query,get=r=>r){return rows.map((row,index)=>({row,index,score:score(get(row),query)})).sort((a,b)=>b.score-a.score||a.index-b.index).map(x=>x.row);}
 function matches(m,query,featureAPI,extra=[]){if(!String(query||'').trim())return true;const q=compact(query);if(identifiers(m).some(v=>compact(v)===q))return true;
  if(!intent(m,query).accept)return false;
  const text=fields(m).concat(extra).filter(Boolean),normalized=text.map(normalize).join(' '),tokens=normalize(query).split(' ');
  // Preserve the existing strict series recognition (S.1 must never become Integro).
  if(featureAPI?.queryMatches)return featureAPI.queryMatches(m,String(query).replace(/\bhigh[-\s]+definition(?:[-\s]+multimedia[-\s]+interface)?\b/gi,'HDMI'),text.concat(text.map(normalize)));
  return tokens.every(t=>normalized.includes(t));
 }
 function facets(rows,getValue,selected=''){const counts=new Map();for(const m of rows){const raw=getValue(m),values=Array.isArray(raw)?raw:[raw];for(const value of new Set(values.filter(Boolean)))counts.set(String(value),(counts.get(String(value))||0)+1);}if(selected&&!counts.has(selected))counts.set(selected,0);return [...counts].sort((a,b)=>a[0].localeCompare(b[0],'de',{numeric:true})).map(([value,count])=>({value,count}));}
 function suggestions(rows,query,{describe=m=>({manufacturer:m.catalog_manufacturer,category:m.catalog_category}),features,limit=5}={}){if(normalize(query).length<2)return {articles:[],groups:[]};const articles=rank(rows.filter(m=>matches(m,query,features)),query).slice(0,limit),groups=[];for(const key of ['manufacturer','category']){const seen=new Set();for(const m of rows){const value=describe(m)[key];if(value&&!seen.has(value)&&normalize(value).includes(normalize(query))){seen.add(value);groups.push({key,value});if(seen.size>=3)break;}}}return{articles,groups};}
 return Object.freeze({normalize,compact,identifiers,intent,score,rank,matches,facets,suggestions});
});
