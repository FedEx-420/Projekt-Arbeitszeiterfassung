import test from 'node:test';
import assert from 'node:assert/strict';
import { transferSavedWorksheet } from '../../supabase/functions/juprowa-servicepad/worktime-transfer.mjs';

const id='62000000-0000-4000-8000-000000000001';
const worker='62000000-0000-4000-8000-000000000002';
const snapshot={
  order:{id,work_date:'2026-11-06',title:'Testauftrag',documentation:'Steckdose montiert',signed_by:'Testperson',signature_data:'data:image/png;base64,AQID',
    service_location:{label:'Objekt 2',street:'Objektweg',house_no:'7',postal_code:'53111',city:'Bonn',country:'Deutschland'},
    team_periods:[{employee_id:worker,employee_name:'Testmonteur',work_date:'2026-11-06',start_time:'08:00',end_time:'09:00',pause_hours:0}]},
  customer:{name:'Testkunde',remote_id:'22',fields:{street:'Hauptweg',house_no:'1',postal_code:'50354',city:'Hürth',country:'Deutschland'}},
  materials:[{name:'Federklemme',article:'00123',quantity:40,unit:'Stk',price:.1256}],
  documents:[{id:'62000000-0000-4000-8000-000000000003',name:'Foto.jpg',mime:'image/jpeg'}]
};

function fixture(){
  let published;
  const events=[],link={};
  const fetcher=async(url,request)=>{
    const type=url.searchParams.get('type');
    if(type==='WorksheetList')return Response.json(published?[published]:[]);
    const data=JSON.parse(request.body.get('DATA'));
    events.push({type,data,item:request.body.get('ITEMID')});
    if(type==='Worksheet'){
      published={...data,ID:123,AK_SCHEINNR:'TEST-123'};
      return Response.json({ResponseParams:{data:published}});
    }
    return Response.json({ok:true});
  };
  const options={auth:{uid:'fixture',passport:'fixture'},mandantId:'0',technician:'4',workers:[{name:'Testmonteur',id:'4'}],
    snapshot:structuredClone(snapshot),link,markAttempt:async()=>{if(link.attempted_at)return false;link.attempted_at='test';return true;},
    updateLink:async(worksheet_id,sheet_revision)=>Object.assign(link,{worksheet_id,sheet_revision}),
    loadFile:async()=> 'data:image/jpeg;base64,AQID',beforeSend:async()=>{}};
  return {fetcher,options,events,link};
}

test('creates once, sends current material price and original attachment data, then updates the same saved sheet',async()=>{
  const f=fixture();
  assert.deepEqual(await transferSavedWorksheet(f.fetcher,f.options),{id:'123',number:'TEST-123',attachments:2});
  const first=f.events.at(-1);
  assert.equal(first.type,'Worksheet');
  assert.ok(Number(first.item)<0);
  assert.equal(first.data.PROJECT_UUID,id);
  assert.equal(first.data.RE_ADR_STR,'Hauptweg 1');
  assert.equal(first.data.AK_BAUADR_STR,'Objektweg 7');
  assert.equal(first.data.SEND_MAIL_TO_CUSTOMER,false);
  assert.equal(first.data.WORKTIMES[0].AZ_WORKER,'4');
  assert.equal(first.data.POSITIONS[0].AP_ARTNR,'00123');
  assert.equal(first.data.POSITIONS[0].AP_VKPREIS,'0.1256');
  assert.equal(first.data.POSITIONS[0].AP_POSPREIS,'5.02');
  assert.equal(f.events.filter(event=>event.type==='WorksheetMedia').length,2);
  f.options.snapshot.order.documentation='Gemessen und geprüft';
  assert.equal((await transferSavedWorksheet(f.fetcher,f.options)).id,'123');
  assert.equal(f.events.at(-1).item,'123');
  assert.equal(f.events.filter(event=>event.type==='WorksheetMedia').length,2);
});
test('unmapped employees and uncertain creates leave the portal free of duplicate writes',async()=>{
  const f=fixture();
  f.options.snapshot.order.team_periods[0].employee_name='Anderer Name';
  assert.deepEqual((await transferSavedWorksheet(f.fetcher,f.options)).workerChoices,[{id:worker,name:'Anderer Name'}]);
  assert.equal(f.events.length,0);
  f.link.attempted_at='already sent';
  await assert.rejects(()=>transferSavedWorksheet(f.fetcher,f.options),/keinen zweiten Arbeitsschein/);
  assert.equal(f.events.length,0);
});
