/* Search and facet helpers shared by material browsing and purchasing. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WorktimeArticleSearch=api;})(globalThis,()=>{
 'use strict';
 const normalize=v=>String(v??'').toLocaleLowerCase('de').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
 const compact=v=>normalize(v).replace(/ /g,'');
 const identifiers=m=>[m.catalog_article_number,m.catalog_manufacturer_number,m.catalog_gtin].filter(Boolean).map(String);
 const fields=m=>[m.name,m.catalog_product_name,m.catalog_manufacturer,m.catalog_category,m.catalog_supplier,...identifiers(m)];
 function score(m,query){const q=normalize(query),c=compact(query);if(!q)return 0;const ids=identifiers(m).map(compact);if(ids.includes(c))return 10000;if(ids.some(v=>v.startsWith(c)))return 6000;const name=normalize(m.catalog_product_name||m.name);return(name===q?4000:name.startsWith(q)?2000:name.includes(q)?1000:0)+q.split(' ').reduce((sum,t)=>sum+(name.split(' ').includes(t)?30:name.includes(t)?10:0),0);}
 function rank(rows,query,get=r=>r){return rows.map((row,index)=>({row,index,score:score(get(row),query)})).sort((a,b)=>b.score-a.score||a.index-b.index).map(x=>x.row);}
 function matches(m,query,featureAPI,extra=[]){if(!String(query||'').trim())return true;const q=compact(query);if(identifiers(m).some(v=>compact(v)===q))return true;
  const text=fields(m).concat(extra).filter(Boolean),normalized=text.map(normalize).join(' '),tokens=normalize(query).split(' ');
  // Preserve the existing strict series recognition (S.1 must never become Integro).
  if(featureAPI?.queryMatches)return featureAPI.queryMatches(m,query,text.concat(text.map(normalize)));
  return tokens.every(t=>normalized.includes(t));
 }
 function facets(rows,getValue,selected=''){const counts=new Map();for(const m of rows){const raw=getValue(m),values=Array.isArray(raw)?raw:[raw];for(const value of new Set(values.filter(Boolean)))counts.set(String(value),(counts.get(String(value))||0)+1);}if(selected&&!counts.has(selected))counts.set(selected,0);return [...counts].sort((a,b)=>a[0].localeCompare(b[0],'de',{numeric:true})).map(([value,count])=>({value,count}));}
 function suggestions(rows,query,{describe=m=>({manufacturer:m.catalog_manufacturer,category:m.catalog_category}),features,limit=5}={}){if(normalize(query).length<2)return {articles:[],groups:[]};const articles=rank(rows.filter(m=>matches(m,query,features)),query).slice(0,limit),groups=[];for(const key of ['manufacturer','category']){const seen=new Set();for(const m of rows){const value=describe(m)[key];if(value&&!seen.has(value)&&normalize(value).includes(normalize(query))){seen.add(value);groups.push({key,value});if(seen.size>=3)break;}}}return{articles,groups};}
 return Object.freeze({normalize,compact,identifiers,score,rank,matches,facets,suggestions});
});
