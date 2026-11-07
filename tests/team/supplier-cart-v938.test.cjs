const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),C=require('../../supplier-cart-v938.js');
const line={material_id:'00000000-0000-4000-8000-000000000001',ref:'position-1',sku:'00123',supplier:'Neugart',name:'Fiktive Steckdose ä & <Text> '+ 'lang '.repeat(35),unit:'Stk',quantity:'2,50',purchase_price:1,recommended_price_1:999};
const xml=C.build({lines:[line,{...line,ref:'position-2',sku:'00007',unit:'M',quantity:'12.75'}],supplier:'Neugart',customer:'000011',order:'B-123',commission:'Projekt & Muster',shipping:'Abholung',date:new Date('2026-10-29T12:34:56Z')});
assert.match(xml,/<Date>2026-10-29<\/Date><Time>13:34:56<\/Time>/);assert.match(xml,/<ArtNo>00123<\/ArtNo>/);assert.match(xml,/<Qty>2.50<\/Qty><QU>PCE<\/QU>/);assert.match(xml,/<QU>MTR<\/QU>/);assert.match(xml,/ä &amp; &lt;Text&gt;/);assert.ok(!/OfferPrice|NetPrice|recommended_price|purchase_price|999/.test(xml));
for(const quantity of ['0','-1','1.001','1e2','Infinity','1000000'])assert.throws(()=>C.build({lines:[{...line,quantity}],supplier:'Neugart'}),/Menge/);
for(const unit of ['H','Pau','Packung','sa'])assert.throws(()=>C.unit(unit),/Einheit/);
assert.throws(()=>C.build({lines:[{...line,supplier:'Anderer Händler'}],supplier:'Neugart'}),/Großhändler/);
assert.throws(()=>C.build({lines:[{...line,sku:'1234567890123456'}],supplier:'Neugart'}),/artikelnummer/i);
assert.throws(()=>C.build({lines:[line,line],supplier:'Neugart'}),/doppelt/);
assert.throws(()=>C.build({lines:[{...line,name:'Text\u0000'}],supplier:'Neugart'}),/ungültige/);
const output=path.join(os.tmpdir(),'worktime-ids-v938.xml');fs.writeFileSync(output,xml,'utf8');console.log('PASS exact supplier SKU, decimal quantities, supported units, XML escaping, stable references, no selling prices; validation XML: '+output);

const fif={...line,supplier:'H. Gautzsch'};
assert.equal(C.fifTXT({lines:[fif,{...fif,sku:'00007',quantity:1}],supplier:fif.supplier}),'00123;2.50;00007;1');
assert.throws(()=>C.fifTXT({lines:[fif,fif],supplier:fif.supplier}),/doppelt/);
assert.throws(()=>C.fifTXT({lines:[{...fif,sku:'1;999'}],supplier:fif.supplier}),/Artikelnummer/);
assert.throws(()=>C.fifTXT({lines:[line],supplier:fif.supplier}),/Artikelnummer/);
assert.throws(()=>C.fifTXT({lines:[fif],supplier:'Neugart'}),/Gautzsch/);

assert.equal(C.fifArticleURL('H. Gautzsch','00123'), 'https://www.onlinesystem.de/Search?SearchOwnPartNumbers=false&q=00123');
assert.equal(C.fifArticleURL('Neugart','00123'), '');
assert.equal(C.fifArticleURL('H. Gautzsch','00123&x=1'), '');

const fifPost=C.fifTransfer({lines:[fif],supplier:fif.supplier,username:'TEST_USER',password:'SYNTHETIC_PASSWORD',shipping:'Lieferung'});
assert.equal(fifPost.action,'WKS');
assert.equal(fifPost.name_kunde,'TEST_USER');
assert.equal(fifPost.pw_kunde,'SYNTHETIC_PASSWORD');
assert.match(fifPost.warenkorb,/<ArtNo>00123<\/ArtNo><Qty>2.50<\/Qty>/);
assert.ok(!fifPost.warenkorb.includes('SYNTHETIC_PASSWORD'));
assert.throws(()=>C.fifTransfer({lines:[fif],supplier:fif.supplier,username:'',password:'x',shipping:'Lieferung'}),/Benutzername/);

const callback='https://fixture.supabase.co/functions/v1/ids-cart-return-v938?job=00000000-0000-4000-8000-000000000001&token='+'a'.repeat(64);
const portal=C.fifPortalTransfer({lines:[fif],supplier:fif.supplier,shipping:'Lieferung',callback});
assert.equal(portal.version,'2.5');assert.equal(portal.hookurl,callback);assert.equal(portal.action,'WKS');assert.equal(portal.pw_kunde,undefined);assert.equal(portal.name_kunde,undefined);
assert.match(portal.warenkorb,/<ArtNo>00123<\/ArtNo>/);
for(const invalid of [callback.replace('https:','http:'),callback.replace('fixture.supabase.co','foreign.invalid'),callback.replace('ids-cart-return-v938','other'),callback+'&extra=1',callback.replace('token=','wrong=')])assert.throws(()=>C.fifPortalTransfer({lines:[fif],supplier:fif.supplier,shipping:'Lieferung',callback:invalid}),/Rückgabeadresse/);

assert.equal(C.fifCartURL('https://www.onlinesystem.de/Warenkorb/91').pathname,'/Warenkorb/91');
for(const value of ['http://www.onlinesystem.de/Warenkorb/91','https://other.invalid/Warenkorb/91','https://www.onlinesystem.de/IDS','https://www.onlinesystem.de/Warenkorb/91?next=other','https://name:secret@www.onlinesystem.de/Warenkorb/91'])assert.throws(()=>C.fifCartURL(value));
