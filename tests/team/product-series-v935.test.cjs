const assert=require('node:assert/strict'),F=require('../../product-features-v928.js');
const item=(name,extra={})=>({name,catalog_article_number:'XXS1-123',catalog_category:'Schaltermaterial',...extra});
for(const q of ['Berker S1','Berker S.1','Berker S 1']){
 assert.equal(F.queryMatches(item('Berker S.1 SCHUKO Steckdose'),q),true);
 assert.equal(F.queryMatches(item('Berker Integro SCHUKO Steckdose'),q),false);
 assert.equal(F.queryMatches(item('Berker Steckdose ohne Serienangabe'),q),false);
 assert.equal(F.queryMatches(item('Berker S.1/B.3/B.7 Steckdose'),q),true);
}
assert.equal(F.infer('Berker Integro Steckdose').series.value,'Integro');
assert.equal(F.matches(F.infer('Berker Integro Steckdose'),{series:'S.1'},true),false);
assert.equal(F.matches({series:{value:'S1',source:'manual'}},{series:'S.1'}),true);
assert.equal(F.queryMatches(item('Berker Integro Steckdose',{catalog_features:{series:{value:'S.1',source:'catalog'}}}),'Berker S1'),false);
assert.equal(F.queryMatches(item('Berker Steckdose',{catalog_features:{series:{value:'S1',source:'manual'}}}),'Berker S.1'),true);
assert.equal(F.queryMatches(item('Berker Integro Steckdose'),'XXS1-123'),true);
assert.equal(F.queryMatches(item('Berker Integro Steckdose'),'Berker Integro'),true);
console.log('PASS series aliases, SKU false positives, compatibility, unknowns and conflicting catalog metadata');

assert.equal(F.matches(F.describe(item('Berker Integro Steckdose',{catalog_features:{series:{value:'S.1',source:'catalog'}}})),{series:'S.1'},true),false);
assert.equal(F.queryMatches(item('Berker S.1 Steckdose',{catalog_features:{series:{value:'S1',source:'catalog'}}}),'Berker S.1'),true);
