const assert=require('node:assert/strict'),fs=require('node:fs');
global.WorktimeCatalogProducts=require('../../catalog-products-v921.js');global.WorktimeProductFeatures=require('../../product-features-v928.js');require('../../product-display-v930.js');const D=global.WorktimeProductDisplay;
const entry={brand:'Gira',sku:'010600',gtin:'04010337106005',image_url:'https://media.gira.de/katalog/zoom4/010600.jpg',source_url:'https://katalog.gira.de/de-DE/datenblatt/010600',full_name:''};
D.setIndex({entries:{fixture:entry}});assert.equal(D.image({catalog_gtin:'4010337106005'}),entry.image_url);assert.equal(D.image({catalog_manufacturer:'GIRA',catalog_manufacturer_number:'0106 00'}),entry.image_url);assert.equal(D.image({catalog_manufacturer:'Gira',catalog_article_number:'010600'}),'');assert.equal(D.image({catalog_manufacturer:'Gira',catalog_manufacturer_number:'10600'}),'');const m={name:'Gira Wechselschalter Einsatz',catalog_gtin:'4010337106005'};assert.equal(D.displayName(m),m.name);
for(const patch of [{image_url:entry.image_url.replace('010600','010700')},{source_url:entry.source_url.replace('010600','010700')},{image_url:entry.image_url+'?token=private'},{image_url:entry.image_url+'#fragment'},{image_url:entry.image_url.replace('media.gira.de','other.example')},{source_url:entry.source_url.replace('de-DE','de-AT')},{gtin:'invalid'}]){D.setIndex({entries:{fixture:{...entry,...patch}}});assert.equal(D.image(m),'');}
D.setIndex(JSON.parse(fs.readFileSync(require.resolve('../../catalog-image-index.json'),'utf8')));assert.ok(D.image({catalog_manufacturer:'Gira',catalog_manufacturer_number:'0106 00'}));assert.ok(D.image({catalog_gtin:'4010337106005'}));const berker=D.resolve({catalog_manufacturer:'Berker',catalog_manufacturer_number:'3036'});assert.equal(berker?.gtin,'04011334023388');assert.ok(D.image({catalog_gtin:'4011334023388'}));console.log('PASS Gira image source/variant/query/GTIN guards, printed manufacturer SKU spacing, no merchant SKU guessing, unchanged names and collected Gira/Berker base inserts');

const dehn = D.resolve({catalog_manufacturer:'DEHN',catalog_manufacturer_number:'952400'});
assert.equal(dehn?.gtin,'04013364108455');
assert.equal(D.image({catalog_gtin:'4013364108455'}),dehn.image_url);
assert.equal(D.image({catalog_manufacturer:'DEHN',catalog_article_number:'952400'}),'');
for(const patch of [
 {source_url:dehn.source_url.replace('#952400','#952401')},
 {image_url:dehn.image_url.replace('/868612809735/','/999999/')},
 {image_url:dehn.image_url+'?token=private'}
]){
 D.setIndex({entries:{fixture:{...dehn,...patch}}});
 assert.equal(D.image({catalog_gtin:'4013364108455'}),'');
}

const index=JSON.parse(fs.readFileSync(require.resolve('../../catalog-image-index.json'),'utf8'));
D.setIndex(index);
const hager=Object.values(index.entries).find(e=>e.brand==='Hager'&&/Rahmen/.test(e.full_name)&&/\bA\.1\b/.test(e.full_name));
assert.ok(hager,'exact Hager A.1 frame from manufacturer catalog');
const article={name:hager.full_name,catalog_manufacturer:'Hager',catalog_manufacturer_number:hager.sku,catalog_image_url:'https://fixture.invalid/incorrect-series.jpg'};
assert.equal(D.image(article),hager.image_url);
assert.equal(D.image({...article,name:article.name.replace(/\bA\.1\b/g,'C.1')}),'');
assert.equal(WorktimeProductFeatures.describe(article).series.value,'A.1');
