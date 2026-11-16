import test from 'node:test';
import assert from 'node:assert/strict';
import { worksheetRevision } from '../../supabase/functions/juprowa-servicepad/portal.mjs';
import { encodeSignature, saveExistingWorksheet } from '../../supabase/functions/juprowa-servicepad/worksheet-write.mjs';

const original={
  ID:12,ID_MANDANT:'0',AK_AUFSTATUS:2,AK_ARBEITEN:'Vorher',AK_DURCHZUFUEHREN:'Auftrag',AK_NOTIZ:'',
  MEDIAFILES:[{ID:98,Name:'test.pdf',Size:10}],FORMDATA:{fixture:{Name:'Bericht'}},
  WORKTIMES:[{AZ_DATUM:'2026-11-15',AZ_WORKER:'1',AZ_WORK_BEG:'08:00',AZ_WORK_END:'09:00',AZ_WORK_PAUSE:0}],
  POSITIONS:[{AP_KT1:'Klemme',AP_ARTNR:'FIL-011',AP_MENGE:'4.00',AP_MENGEEH:'Stk',AP_VKPREIS:'2.45'}],
};
const edits={requested:'Auftrag',completed:'Nachher',notes:'Fiktive Notiz',
  times:[{start:'08:00',end:'10:00',breakMinutes:'15'}],materials:[{quantity:'5,25',unit:'Stk'}]};
function fixture({sheet=original,store=value=>value}={}) {
  let current=structuredClone(sheet), writes=0;
  const fetcher=async(url,options)=>{
    if(url.searchParams.get('type')==='WorksheetList')return Response.json([current]);
    assert.equal(url.searchParams.get('type'),'Worksheet');
    assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
    assert.equal(options.body.get('ITEMID'),'12');
    current=store(JSON.parse(options.body.get('DATA')));writes++;
    return Response.json({result:'unrecognized response envelope'});
  };
  const ctx={auth:{uid:'fixture',passport:'fixture'},mandantId:'0',technician:'11',beforeSend:async()=>{},
    workers:[{id:'1',name:'Erste Testperson'},{id:'2',name:'Zweite Testperson'}]};
  return {fetcher,ctx,state:()=>current,writes:()=>writes};
}

test('uses the jSignature Base30 format and rejects empty or invalid strokes',()=>{
  assert.equal(encodeSignature([[[35,0],[37,15],[2,18]]]),'image/jsignature;base30,1z2Z1z_0f3');
  assert.throws(()=>encodeSignature([[[10,10]]]),/unterschreiben/);
  assert.throws(()=>encodeSignature([[[10,10],[9999,10]]]),/ungültig/);
});

test('edits an existing open sheet and checks the stored changes, without replacing documents or prices',async()=>{
  const {fetcher,ctx,state,writes}=fixture();
  const input={action:'worksheet-save',confirmed:true,worksheetId:'12',sheetRevision:await worksheetRevision(original),edits};
  assert.deepEqual(await saveExistingWorksheet(fetcher,{...ctx,input}),{id:'12',closed:false});
  assert.equal(state().AK_AUFSTATUS,2);
  assert.equal(state().WORKTIMES[0].AZ_WORK_END,'10:00:00');
  assert.equal(state().POSITIONS[0].AP_MENGE,'5.25');
  assert.deepEqual(state().MEDIAFILES,original.MEDIAFILES);
  assert.deepEqual(state().FORMDATA,original.FORMDATA);
  assert.equal(state().POSITIONS[0].AP_VKPREIS,original.POSITIONS[0].AP_VKPREIS);
  await assert.rejects(saveExistingWorksheet(fetcher,{...ctx,input}),error=>error.code==='worksheet_changed');
  assert.equal(writes(),1);
});

test('requires explicit approval and a signature, then reads back the closed status for this same ID',async()=>{
  const {fetcher,ctx,state,writes}=fixture();
  const input={action:'worksheet-close',worksheetId:'12',sheetRevision:await worksheetRevision(original),edits};
  await assert.rejects(saveExistingWorksheet(fetcher,{...ctx,input}),/bestätige/);
  assert.equal(writes(),0);
  assert.deepEqual(await saveExistingWorksheet(fetcher,{...ctx,input:{...input,confirmed:true,
    signature:{name:'Test',strokes:[[[0,0],[1,2]]]}}}),{id:'12',closed:true});
  assert.equal(state().AK_AUFSTATUS,5);
  assert.equal(state().SIGNATURE_NAME,'Test');
  assert.equal(state().SEND_MAIL_TO_CUSTOMER,false);
  assert.equal(state().SEND_MAIL_TO_RECIPIENT,false);
  assert.equal(writes(),1);
});

const revisedEdits={...edits,rowFormat:2,
  addresses:{service:{street:'Testweg 5',postalCode:'00123'}},
  times:[{originalIndex:0,travelStart:'07:30',travelEnd:'08:00',travelKm:'12',breakStart:'08:45',breakMinutes:'15'},
    {originalIndex:null,day:'2026-11-16',workerId:'2',start:'09:30',end:'10:30'}],
  materials:[{originalIndex:null,article:'tx-42',supplier:'T',description:'Fiktives Material',quantity:'35,5',unit:'m'}],
};

test('updates the same sheet with address, travel, added time and replacement material using provider fields',async()=>{
  const {fetcher,ctx,state}=fixture();
  const input={action:'worksheet-save',confirmed:true,worksheetId:'12',sheetRevision:await worksheetRevision(original),edits:revisedEdits};
  await saveExistingWorksheet(fetcher,{...ctx,input});
  assert.equal(state().ID,12);
  assert.equal(state().AK_BAUADR_STR,'Testweg 5');
  assert.equal(state().AK_BAUADR_PLZ,'00123');
  assert.equal(state().WORKTIMES[0].AZ_TRAVEL_WIDTH,12);
  assert.equal(state().WORKTIMES[0].AZ_WORK_PAUSE_BEG,'08:45:00');
  assert.equal(state().WORKTIMES[1].AZ_WORKER,'2');
  assert.equal(state().WORKTIMES[1].AZ_WORKERNAME,'Zweite Testperson');
  assert.equal(state().WORKTIMES[1].AZ_WORK_PAUSE_BEG,'09:30:00');
  assert.equal(state().POSITIONS.length,1);
  assert.deepEqual(state().POSITIONS[0],{AP_POSTYPE:'0',AP_GERID:'',AP_VKPREIS:'',AP_POSPREIS:'',
    AP_ARTNR:'TX-42',AP_LIEF:'T',AP_TEXT:'Fiktives Material',AP_KT1:'Fiktives Material',AP_KT2:'',AP_MENGE:'35.5',AP_MENGEEH:'m'});
  assert.deepEqual(state().MEDIAFILES,original.MEDIAFILES);
  assert.deepEqual(state().FORMDATA,original.FORMDATA);
});

test('protects existing linked rows, rejects unrecognized workers and catches incomplete readback',async()=>{
  const base={action:'worksheet-save',confirmed:true,worksheetId:'12',sheetRevision:await worksheetRevision(original),edits:revisedEdits};
  const brokenReadback=fixture({store(value){value.WORKTIMES[0].AZ_TRAVEL_WIDTH=0;return value;}});
  await assert.rejects(saveExistingWorksheet(brokenReadback.fetcher,{...brokenReadback.ctx,input:base}),
    error=>error.code==='worksheet_unconfirmed');
  const unknown=fixture();
  const invalid=structuredClone(base);
  invalid.edits.times[1].workerId='invalid';
  await assert.rejects(saveExistingWorksheet(unknown.fetcher,{...unknown.ctx,input:invalid}),/Monteur auswählen/);
  assert.equal(unknown.writes(),0);
  const linked=structuredClone(original);
  linked.POSITIONS[0].AP_GERID='99';
  const protectedRecord=fixture({sheet:linked});
  await assert.rejects(saveExistingWorksheet(protectedRecord.fetcher,{...protectedRecord.ctx,
    input:{...base,sheetRevision:await worksheetRevision(linked)}}),/nicht entfernt/);
  assert.equal(protectedRecord.writes(),0);
});
