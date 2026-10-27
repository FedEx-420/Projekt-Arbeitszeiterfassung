'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.runInNewContext(fs.readFileSync('catalog-import-ui-v910.js','utf8'),context);const run=context.window.WorktimeCatalogImportUI.importBatches;
const rows=Array.from({length:71},(_,i)=>({article_number:String(i)}));
const result=batch=>({catalog_import_version:911,standard_price_source:'recommended_price_1',company_id:'A',created:batch.length,updated:0,unchanged:0});
const timeout=()=>Object.assign(Error('canceling statement due to statement timeout'),{code:'57014'});
(async()=>{
 let active=0,maxActive=0,calls=[],saved=[];const out=await run({company:'A',supplier:'S',rows,api:async(_,q)=>{active++;maxActive=Math.max(maxActive,active);const b=q.body.p_rows;calls.push(b.length);active--;if(b.length>6)throw timeout();saved.push(...b.map(r=>r.article_number));return result(b);}});
 assert.equal(out.confirmed,71);assert.equal(maxActive,1);assert.ok(calls[0]===25&&calls[1]===12&&calls[2]===6);assert.deepEqual(saved,rows.map(r=>r.article_number));assert.equal(new Set(saved).size,71);console.log('PASS known statement timeout reduces batch size; all rows confirmed exactly once in sequence');
 let count=0,confirmed=[];await assert.rejects(run({company:'A',supplier:'S',rows,api:async(_,q)=>{count++;if(count===2)throw Error('network unavailable');return result(q.body.p_rows);},onConfirmed:b=>confirmed.push(...b)}),e=>e.catalogProgress.confirmed===25);assert.equal(count,2);assert.equal(confirmed.length,25);console.log('PASS network errors stop without retry and retain exact confirmed progress');
 count=0;await assert.rejects(run({company:'A',supplier:'S',rows:rows.slice(0,2),api:async()=>{count++;throw timeout();}}),e=>e.catalogProgress.confirmed===0);assert.equal(count,2);console.log('PASS timeout at one article terminates instead of looping');
 count=0;await assert.rejects(run({company:'A',supplier:'S',rows,api:async()=>{count++;return {...result([]),company_id:'B'};}}),e=>e.catalogProgress.confirmed===0);assert.equal(count,1);console.log('PASS malformed or foreign confirmation never advances or retries');
 count=0;let scope=true;await assert.rejects(run({company:'A',supplier:'S',rows,isActive:()=>scope,api:async(_,q)=>{count++;scope=false;return result(q.body.p_rows);}}));assert.equal(count,1);console.log('PASS scope change stops before sending any further batch');
 count=0;await assert.rejects(run({company:'A',supplier:'S',rows,api:async()=>{count++;throw Object.assign(Error('canceling statement due to user request'),{code:'57014'});}}));assert.equal(count,1);console.log('PASS other cancellation reasons are not retried');
})().catch(e=>{console.error(e);process.exitCode=1;});
