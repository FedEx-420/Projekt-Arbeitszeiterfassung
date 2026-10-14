const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const scope={window:{}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../legal-templates-v900.js'),'utf8'),scope);
const templates=scope.window.WorktimeLegalTemplates;
assert.equal(templates.kinds.length,6);
assert.ok(templates.provider.startsWith('['),'Public provider text must remain a placeholder');
assert.ok(!templates.provider.includes('@'),'Private operator email must not be embedded');
const info={name:'Firma mit Leerzeichen & Umlauten',street:'Musterstraße',house_no:'12',postcode:'44135',city:'Dortmund',country:'Deutschland',email:'test@example.invalid'};
for(const [kind]of templates.kinds){const text=templates.template(kind,info);assert.ok(text.length<30000);assert.ok(text.includes(info.name));assert.ok(text.includes(info.email));assert.ok(text.includes('ENTWURF'));assert.ok(text.includes('Supabase'));assert.ok(text.includes('GitHub Pages'));assert.ok(!text.includes('D1-Datenbank'));assert.ok(!text.includes('R2.'));assert.ok(!text.includes('ChatGPT-/Sites-Zugang'));assert.ok(templates.sources[kind][1].startsWith('https://'));}
assert.throws(()=>templates.template('unknown'));
console.log('PASS 6 production-specific drafts: existing backend, no demo identities, no invented signatures, bounded text');
