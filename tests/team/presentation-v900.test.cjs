const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(dir,'platform-v900.js'),'utf8');
const scope={window:{}};vm.runInNewContext(source,scope);const parse=scope.window.WorktimePlatform.parsePrice;
for(const [text,cents]of [['39,90',3990],['0',0],['0,00',0],['100000.00',10000000],[' 19.95 ',1995]])assert.equal(parse(text),cents);
for(const text of ['-1','1.234','1,2,3','1e4','',null,'100001','Infinity'])assert.throws(()=>parse(text));
const app=fs.readFileSync(path.join(dir,'app-v800.js'),'utf8'),index=fs.readFileSync(path.join(dir,'index.html'),'utf8'),worker=fs.readFileSync(path.join(dir,'service-worker.js'),'utf8');
assert.match(app,/const storage = 'zeiterfassung-v800-session'/);assert.match(app,/platformFeature\.creator\(\)/);assert.match(app,/roleName = isAdmin\(\) \? 'Administrator'/);assert.match(app,/state\.profile\?\.username/);
for(const asset of ['presentation-v900.css','platform-v900.js','guidance-v900.js','help-topics-v900.js','legal-v900.js','legal-templates-v900.js']){assert.ok(fs.existsSync(path.join(dir,asset)));assert.ok(worker.includes(asset),asset+' must be in the static offline cache');}
assert.ok(index.indexOf('platform-v900.js')<index.indexOf('app-v800.js'));
assert.ok(!source.includes('service_role'));assert.ok(!source.includes('localStorage'));
assert.match(source,/const saved=Array\.isArray\(result\)\?result\[0\]:result/,'PostgREST composite responses can be an object or one-row array');
console.log('PASS price parsing, founder-only menu, real login identity, unchanged session key and offline assets');
