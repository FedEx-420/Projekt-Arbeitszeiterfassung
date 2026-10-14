/* CSS contract/arithmetic checks only. No claim of a physical iOS/browser layout test. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../..'),css=fs.readFileSync(path.join(dir,'safe-area-v902.css'),'utf8'),index=fs.readFileSync(path.join(dir,'index.html'),'utf8'),worker=fs.readFileSync(path.join(dir,'service-worker.js'),'utf8');
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
test('Safe-area overrides load after every older navigation/presentation stylesheet',()=>{assert.match(index,/viewport-fit=cover/);assert.ok(index.indexOf('safe-area-v902.css')>index.indexOf('navigation-v901.css'));assert.equal([...index.matchAll(/rel="stylesheet" href="([^"]+)"/g)].at(-1)[1],'safe-area-v902.css');});
test('All three header padding rules add the device top inset instead of hardcoding an iPhone size',()=>{assert.match(css,/@supports \(padding-top: env\(safe-area-inset-top\)\)/);assert.deepEqual([...css.matchAll(/(?:^|\s)padding-top: calc\((\d+)px \+ env\(safe-area-inset-top, 0px\)\)/g)].map(m=>Number(m[1])),[18,16,14]);assert.ok(!css.includes('body {'));assert.ok(!css.includes('59px'));});
const rules=[...css.matchAll(/\.topbar \{([^}]+)\}/g)].map(m=>m[1]);
function modeledInsets(width,insets){
 const selected=[rules[0],...(width<=1000?[rules[1]]:[]),...(width<=650?[rules[2]]:[]),...(width<=380?[rules[3]]:[])];
 const result={};for(const rule of selected)for(const side of ['top','left','right']){const value=new RegExp('padding-'+side+': ([^;]+);').exec(rule)?.[1];if(!value)continue;const fixed=/calc\((\d+)px \+ env/.exec(value);const base=fixed?Number(fixed[1]):Math.max(24,(width-1170)/2+26);result[side]=base+(insets[side]||0);}return result;
}
test('Portrait Dynamic Island example leaves normal spacing below the safe zone',()=>{const p=modeledInsets(393,{top:59});assert.deepEqual(p,{top:73,left:16,right:16});assert.ok(p.top>59);});
test('Orientation changes respect both landscape sensor-side and opposite-side insets',()=>assert.deepEqual(modeledInsets(852,{top:0,left:59,right:59}),{top:16,left:81,right:81}));
test('Small phone layout retains its original horizontal spacing when insets are zero',()=>assert.deepEqual(modeledInsets(375,{top:44}),{top:58,left:12,right:12}));
test('Desktop and ordinary mobile spacing remain unchanged with zero insets',()=>{assert.deepEqual(modeledInsets(393,{}),{top:14,left:16,right:16});assert.deepEqual(modeledInsets(1440,{}),{top:18,left:161,right:161});});
test('Focus scroll and final menu controls also account for the iPhone safe zones',()=>{assert.match(css,/scroll-padding-top: calc\(90px \+ env\(safe-area-inset-top, 0px\)\)/);assert.match(css,/padding-bottom: max\(8px, env\(safe-area-inset-bottom, 0px\)\)/);});
test('Current release still loads safe-area and navigation assets in the offline cache',()=>{const version=/worktime-version" content="(\d+)"/.exec(index)?.[1],appAsset=/src="(app-v800\.js\?v=\d+)"/.exec(index)?.[1];assert.ok(Number(version)>=902);assert.ok(worker.includes('arbeitszeit-neu-v'+version));assert.ok(worker.includes('./safe-area-v902.css'));assert.ok(appAsset&&worker.includes(appAsset));assert.ok(index.includes('navigation-v901.js'));});
console.log(JSON.stringify({passed,browserLayoutVerified:false,productionRequests:0}));
