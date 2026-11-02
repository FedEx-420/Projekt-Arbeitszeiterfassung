const assert=require('node:assert/strict'),now=require('../../article-search-v947.js'),F=require('../../product-features-v928.js');
const rows=Array.from({length:1200},(_,i)=>({id:'fixture'+i,name:['Berker S.1 SCHUKO Steckdose polarweiß matt','Berker Integro HDMI Steckdose schwarz','Wago Verbindungsklemme 221-412','Abdeckung für Steckdose','Leitung NYM-J 3x1,5 mm²','Werkzeug Schraubendreher PZ2'][i%6]+' '+i,catalog_article_number:'X'+i,catalog_manufacturer_number:'MPN'+i,catalog_manufacturer:i%6<2?'Berker':i%6===2?'Wago':'Fixture',catalog_category:i%6<2?'Schaltermaterial':'Fixture',catalog_supplier:'Fachhandel'}));

const expected=query=>rows.filter((m,i)=>query==='Steckdose'||query==='Berker S1 Steckdose'?i%6===0:query==='HDMI'?i%6===1:query==='Berker'?i%6<2:query==='Wago 221'?i%6===2:query==='Schraubendreher'?i%6===5:query==='NYM J'?i%6===4:query==='X17'?m.catalog_article_number.startsWith('X17'):query==='MPN6'?m.catalog_manufacturer_number.startsWith('MPN6'):false);
for(const query of ['Steckdose','Berker S1 Steckdose','HDMI','Berker','Wago 221','Schraubendreher','NYM J','X17','MPN6','nichts vorhanden']){
 const matches=rows.filter(m=>now.matches(m,query,F));
 assert.deepEqual(matches.map(m=>m.id),expected(query).map(m=>m.id),'exact expected product group: '+query);
 const ranked=now.rank(matches,query),suggested=now.suggestions(matches,query,{features:F,preFiltered:true}).articles;
 assert.deepEqual(suggested.map(m=>m.id),ranked.slice(0,5).map(m=>m.id),'prefiltered suggestions preserve ranked results: '+query);
 assert.deepEqual(now.suggestions(rows,query,{features:F}).articles.map(m=>m.id),suggested.map(m=>m.id),'default suggestions still filter untrusted caller input');
 if(query==='X17')assert.equal(ranked[0].id,'fixture17');if(query==='MPN6')assert.equal(ranked[0].id,'fixture6');
}
let calls=0;const probe={queryMatches:()=>{calls++;return true;}};now.suggestions(rows,'Fixture',{features:probe,preFiltered:true});assert.equal(calls,0,'already filtered results do not repeat per-product technical matching');now.suggestions(rows,'Fixture',{features:probe});assert.ok(calls>0,'default public API still filters caller input');
for(let i=0;i<6000;i++)assert.equal(now.normalize('ÄÖÜß '+i),'aeoeuess '+i);assert.equal(now.normalize('ÄÖÜß 0'),'aeoeuess 0','eviction preserves normalization');const m={name:'Berker Steckdose',catalog_article_number:'CHANGED'};assert.equal(now.matches(m,'Steckdose',F),true);m.name='Berker HDMI Steckdose';assert.equal(now.matches(m,'Steckdose',F),false,'mutable article content never reuses a stale match');
console.log('PASS search optimization: exact product-group matches and suggestions, strict S1/HDMI, identifiers, Unicode and cache eviction; no repeated technical filtering of prefiltered suggestions');
