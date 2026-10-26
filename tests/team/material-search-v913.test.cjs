'use strict';
// User-provided article description and synthetic local fixtures only. No backend.
const assert=require('node:assert/strict'),C=require('../../catalog-import-v909.js');
const name='Berker 47598989 Doppelsteckdose SCHUKO Abdeckpl.erh.BS Berker S.1 polarweiss';
const row=Object.freeze({name,catalog_article_number:'0047598989',catalog_supplier:'Synthetischer Elektrohandel',unit_price:19.13});
const mapping=Object.freeze({name:'name',article_number:'catalog_article_number',supplier:'catalog_supplier'});
async function main(){let passed=0;const test=async(title,run)=>{await run();passed++;console.log('PASS '+title);};
 await test('the reported Berker Steckdose example matches in both field layouts',()=>{
  assert.equal(C.matchesArticle(row,'Berker Steckdose',mapping),true);
  assert.equal(C.matchesArticle({name,article_number:'47598989'},'Berker Steckdose'),true);
 });
 await test('separated words and reversed order do not require a contiguous phrase',()=>{
  for(const query of ['Steckdose Berker','Berker SCHUKO Steckdose','polarweiss Berker Steckdose'])assert.equal(C.matchesArticle(row,query,mapping),true,query);
 });
 await test('name typos retain the existing tolerance',()=>{
  for(const query of ['Beker Stekdose','Berker Stcekdose'])assert.equal(C.matchesArticle(row,query,mapping),true,query);
 });
 await test('explicit supplier tokens combine with name terms without guessing supplier names',()=>{
  assert.equal(C.matchesArticle(row,'Elektrohandel Steckdose',mapping),true);
  assert.equal(C.matchesArticle(row,'Elektrohandl Steckdose',mapping),false);
 });
 await test('default catalog search does not search supplier despite optional support',()=>{
  assert.equal(C.matchesArticle({name,article_number:'47598989',supplier:'Synthetischer Elektrohandel'},'Elektrohandel'),false);
 });
 await test('wrong numbers and rating codes do not become fuzzy matches',()=>{
  assert.equal(C.matchesArticle(row,'0047598989 Steckdose',mapping),true);
  assert.equal(C.matchesArticle(row,'0047598988 Steckdose',mapping),false);
  assert.equal(C.matchesArticle({name:'Berker Steckdose B16'},'Berker B10'),false);
 });
 await test('price and arbitrary metadata cannot match',()=>{
  assert.equal(C.matchesArticle(row,'19.13',mapping),false);
  assert.equal(C.matchesArticle({...row,comment:'UnbekannterSuchbegriff'},'UnbekannterSuchbegriff',mapping),false);
 });
 await test('query terms all have to match and source objects remain unchanged',()=>{
  const before=JSON.stringify(row);assert.equal(C.matchesArticle(row,'Berker Steckdose Transformator',mapping),false);
  assert.equal(JSON.stringify(row),before);assert.deepEqual(mapping,{name:'name',article_number:'catalog_article_number',supplier:'catalog_supplier'});
 });
 await test('CSV full-file read finds the separated compound example unchanged',async()=>{
  const file=new File(['SKU;Name;Einheit;EK;VK*\n47598989;'+name+';Stk;1,00;2,00\n999999;Andere Leuchte;Stk;3,00;4,00\n'],'synthetisch.csv');
  const r=await C.readCatalog(file,{articleFilter:'Berker Steckdose'});assert.equal(r.rows.length,1);assert.equal(r.rows[0].SKU,'47598989');assert.equal(r.rows[0].Name,name);assert.equal(r.rows[0]['VK*'],'2,00');
 });
 await test('DATANORM assembled A descriptions are searched across their two fields',async()=>{
  const header='V'.padEnd(123,' ')+'04EUR';
  const file=new File([header+'\r\nA;N;47598989;;Doppelsteckdose SCHUKO;Berker S.1 polarweiss;2;0;Stk;1250;RG;WG;LG\r\n'],'datanorm.001');
  const r=await C.readCatalog(file,{articleFilter:'Berker Steckdose'});assert.equal(r.rows.length,1);assert.equal(r.rows[0].article_number,'47598989');assert.equal(r.rows[0].name,'Doppelsteckdose SCHUKO Berker S.1 polarweiss');assert.equal(r.rows[0].source_net_price,'12.50');
 });
 console.log(JSON.stringify({passed,externalRequests:0,productionWrites:0}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
