const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
global.WorktimeCatalogProducts=require('../../catalog-products-v921.js');
global.WorktimeProductFeatures=require('../../product-features-v928.js');
require('../../product-display-v930.js');
const D=global.WorktimeProductDisplay;
const entry={sku:'LS 1520 WW',brand:'Jung',gtin:'04011377062917',image_url:'https://www.jung-group.com/downloads/catalogue/images/455x455_webp/JUNG_LS1520WW.webp',source_url:'https://www.jung-group.com/de-DE/p/SCHUKO-Steckdose-Duroplast-alpinweiss/LS-1520-WW',full_name:'SCHUKO-Steckdose Duroplast alpinweiß'};
D.setIndex({entries:{one:entry}});
assert.equal(D.image({catalog_gtin:'4011377062917'}),entry.image_url);
assert.equal(D.image({catalog_manufacturer:'Jung',catalog_manufacturer_number:'LS1520WW'}),entry.image_url);
assert.equal(D.image({catalog_manufacturer:'Jung',catalog_article_number:'LS1520WW'}),'','wholesaler SKU is never guessed to be a manufacturer identifier');
assert.equal(D.image({catalog_manufacturer:'Jung',catalog_manufacturer_number:'LS1520SW'}),'');
assert.equal(D.image({catalog_gtin:'4011377062918',catalog_manufacturer:'Jung',catalog_manufacturer_number:'LS1520WW'}),'');
for(const patch of [{brand:'Other'},{source_url:entry.source_url+'-OTHER'},{image_url:entry.image_url.replace('www.jung-group.com','untrusted.example')},{gtin:'invalid'}]){D.setIndex({entries:{one:{...entry,...patch}}});assert.equal(D.image({catalog_gtin:'4011377062917'}),'');}
D.setIndex({entries:{one:entry,two:{...entry,sku:'LS1520WW',source_url:entry.source_url.replace('LS-1520-WW','LS1520WW')}}});assert.equal(D.image({catalog_manufacturer:'Jung',catalog_manufacturer_number:'LS 1520 WW'}),'','ambiguous normalized manufacturer identifiers fail closed');
const source=fs.readFileSync(require.resolve('../../product-display-v930.js'),'utf8');
async function loading(){let localResolve,remoteResolve;const requests=[],context={URL,AbortController,Event,document:{},setTimeout,clearTimeout,dispatchEvent(){},WorktimeCatalogProducts:global.WorktimeCatalogProducts,WorktimeProductFeatures:global.WorktimeProductFeatures,fetch:url=>{requests.push(url);return new Promise(ok=>{if(url.startsWith('https:'))remoteResolve=ok;else localResolve=ok;});}};vm.createContext(context);vm.runInContext(source,context);const response=entry=>({ok:true,json:async()=>({entries:{one:entry}})});localResolve(response(entry));await new Promise(r=>setImmediate(r));assert.equal(context.WorktimeProductDisplay.image({catalog_gtin:'4011377062917'}),entry.image_url,'local images appear while remote request is still pending');const newer={...entry,image_url:entry.image_url.replace('JUNG_LS','JUNG_NEW_LS')};remoteResolve(response(newer));await new Promise(r=>setImmediate(r));assert.equal(context.WorktimeProductDisplay.image({catalog_gtin:'4011377062917'}),newer.image_url);assert.equal(requests.length,2);
// A delayed local snapshot must never overwrite newer remote data.
const late={...context,fetch:url=>new Promise(ok=>{if(url.startsWith('https:'))remoteResolve=ok;else localResolve=ok;})};vm.createContext(late);vm.runInContext(source,late);remoteResolve(response(newer));await new Promise(r=>setImmediate(r));localResolve(response(entry));await new Promise(r=>setImmediate(r));assert.equal(late.WorktimeProductDisplay.image({catalog_gtin:'4011377062917'}),newer.image_url);}
loading().then(()=>console.log('PASS exact JUNG images, source/GTIN/variant guards, no wholesaler-SKU guesses and immediate local loading without stale overwrite')).catch(e=>{console.error(e);process.exitCode=1});
