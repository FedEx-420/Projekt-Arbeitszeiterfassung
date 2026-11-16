import { requestPortal, scopedWorksheets, ServicepadError, worksheetRevision, worksheetRows } from './portal.mjs';
import { applyEdits } from './worksheet-write.mjs';

const invalid=message=>new ServicepadError('worksheet_validation',422,message);
const stale=()=>new ServicepadError('worksheet_changed',409,'Der Juprowa-Arbeitsschein wurde anderweitig geändert. Prüfe den Stand vor der nächsten Übergabe.');
const unconfirmed=()=>new ServicepadError('worksheet_unconfirmed',502,'Juprowa hat die Übernahme noch nicht eindeutig bestätigt. Eine erneute Prüfung legt keinen zweiten Arbeitsschein an.');
const normalized=value=>String(value??'').normalize('NFC').toLocaleLowerCase('de-DE').trim().replace(/\s+/g,' ');
const idOf=row=>/^[1-9]\d{0,14}$/.test(String(row?.ID||''))?String(row.ID):'';
const numeric=value=>Number(String(value??'').replace(',','.'));
const dateTime=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'medium',hourCycle:'h23'}).format(new Date());
const safeFile=name=>String(name||'Dokument').normalize('NFKD').replace(/[^A-Za-z0-9._-]/g,'_').slice(-95);
const mediaName=(id,name)=>'Arbeitszeit-'+id.replaceAll('-','').slice(0,20)+'-'+safeFile(name);
const currentMedia=row=>worksheetRows(row?.MEDIAFILES);
const fileIn=(media,name)=>media.some(item=>item.Name===name||item.File===name);
const temporaryId=order=>-(4000000000000+(parseInt(order.id.replaceAll('-','').slice(0,12),16)%5000000000000));

function workEdits(snapshot,remote,workers,assignments) {
  const {order,customer,materials}=snapshot;
  const remoteTimes=worksheetRows(remote?.WORKTIMES);
  const periods=order.team_periods?.length?order.team_periods:[{work_date:order.work_date,employee_id:order.employee_id,
    employee_name:order.employee_name,start_time:order.start_time,end_time:order.end_time,pause_hours:order.pause_hours}];
  const timeUsed=new Set(), workerChoices=new Map();
  const times=periods.map(period=>{
    const roster=workers.filter(worker=>normalized(worker.name)===normalized(period.employee_name)&&normalized(worker.name));
    const oldIndex=remoteTimes.findIndex((prior,i)=>!timeUsed.has(i)&&normalized(prior.AZ_WORKERNAME)===normalized(period.employee_name)&&
      String(prior.AZ_DATUM||'').slice(0,10)===(period.work_date||order.work_date)&&String(prior.AZ_WORK_BEG||'').slice(0,5)===String(period.start_time||'').slice(0,5));
    const chosen=workers.find(worker=>worker.id===assignments?.[period.employee_id])||
      (roster.length===1?roster[0]:null)||(oldIndex>=0?workers.find(worker=>worker.id===String(remoteTimes[oldIndex].AZ_WORKER)):null);
    if(!chosen){workerChoices.set(period.employee_id,period.employee_name||'Mitarbeiter');return null;}
    const day=period.work_date||order.work_date;
    const index=oldIndex>=0?oldIndex:remoteTimes.findIndex((prior,i)=>!timeUsed.has(i)&&String(prior.AZ_WORKER)===chosen.id&&String(prior.AZ_DATUM||'').slice(0,10)===day);
    if(index>=0)timeUsed.add(index);
    return {originalIndex:index<0?null:index,workerId:chosen.id,day,start:period.start_time,end:period.end_time,
      breakMinutes:String(Math.round(numeric(period.pause_hours)*60))};
  });
  if(workerChoices.size)return {workerChoices:[...workerChoices].map(([id,name])=>({id,name})),workers};
  const remoteMaterials=worksheetRows(remote?.POSITIONS);
  const editable=position=>!position.AP_GERID&&Number(position.AP_POSTYPE||0)===0;
  const used=new Set();
  const positions=materials.map(item=>{
    const exact=remoteMaterials.map((position,index)=>({position,index})).filter(({position,index})=>editable(position)&&!used.has(index)&&
      (item.article&&String(position.AP_ARTNR||'')===item.article||
       normalized(position.AP_TEXT||[position.AP_KT1,position.AP_KT2].filter(Boolean).join(' '))===normalized(item.name)));
    const index=exact.length===1?exact[0].index:null;
    if(index!==null)used.add(index);
    const article=String(item.article||'');
    const name=String(item.name||'');
    return {originalIndex:index,description:article.length>26?name+' ('+article+')':name,
      ...(article&&article.length<=26?{article}:{}),quantity:String(item.quantity),
      unit:({STK:'Stk',STÜCK:'Stk',STUECK:'Stk',METER:'M',LITER:'L'})[String(item.unit).toUpperCase()]||String(item.unit||'Stk').slice(0,4),
      ...(numeric(item.price)>0?{price:String(item.price)}:{})};
  });
  remoteMaterials.forEach((position,index)=>{if(!editable(position))positions.push({originalIndex:index});});
  const billing=customer.fields||{}, site=order.service_location||billing;
  const address=(name,fields)=>Object.fromEntries(Object.entries({name,street:[fields.street,fields.house_no].filter(Boolean).join(' '),
    postalCode:fields.postal_code,city:fields.city,country:fields.country}).filter(([,value])=>String(value||'').trim()));
  return {edits:{rowFormat:2,requested:order.title||'',completed:order.documentation||'',notes:String(remote?.AK_NOTIZ||''),
    addresses:{service:address(site.label||customer.name,site),billing:address(customer.name,billing)},times,materials:positions}};
}

function readback(row, intended, names) {
  const clean=value=>String(value??'').replace(/\r\n/g,'\n').trim();
  const time=value=>clean(value).replace(/^(\d):/,'0$1:').slice(0,5)||'00:00';
  const hours=sheet=>worksheetRows(sheet.WORKTIMES).map(record=>JSON.stringify([clean(record.AZ_DATUM).slice(0,10),
    clean(record.AZ_WORKER),time(record.AZ_WORK_BEG),time(record.AZ_WORK_END),numeric(record.AZ_WORK_PAUSE)])).sort();
  const materials=sheet=>worksheetRows(sheet.POSITIONS).map(record=>JSON.stringify([clean(record.AP_ARTNR),clean(record.AP_MENGEEH),
    clean(record.AP_TEXT||record.AP_KT1),numeric(record.AP_MENGE),numeric(record.AP_VKPREIS)])).sort();
  const sameList=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
  return Number(row.AK_AUFSTATUS)===Number(intended.AK_AUFSTATUS)&&
    ['AK_DURCHZUFUEHREN','AK_ARBEITEN','AK_NOTIZ','AK_BAUADR_NAM1','AK_BAUADR_STR','AK_BAUADR_ORT','AK_BAUADR_PLZ','AK_BAUADR_LAND',
      'RE_ADR_NAM1','RE_ADR_STR','RE_ADR_ORT','RE_ADR_PLZ','RE_ADR_LAND'].every(key=>clean(row[key])===clean(intended[key]))&&
    sameList(hours(row),hours(intended))&&sameList(materials(row),materials(intended))&&names.every(name=>fileIn(currentMedia(row),name));
}

export async function transferSavedWorksheet(fetcher,options) {
  const {auth,mandantId,technician,workers,snapshot,link,assignments,markAttempt,updateLink,loadFile,beforeSend}=options;
  const {order,customer}=snapshot;
  const lookup=()=>scopedWorksheets(fetcher,auth,mandantId,true);
  const fromProject=rows=>{
    const matches=[...rows.values()].filter(row=>normalized(row.PROJECT_UUID)===normalized(order.id));
    if(matches.length>1)throw unconfirmed();
    return matches[0];
  };
  const rows=await lookup();
  let remote=link.worksheet_id?rows.get(link.worksheet_id):fromProject(rows);
  if(link.worksheet_id&&(!remote||Number(remote.AK_AUFSTATUS)>=5||
     link.sheet_revision&&await worksheetRevision(remote)!==link.sheet_revision))throw stale();
  if(!remote&&link.attempted_at)throw unconfirmed();
  if(!remote&&!customer.remote_id)throw invalid('Ordne den Kunden zuerst unter „Juprowa-Kundendaten ergänzen“ einem ServicePad-Kunden zu.');
  if(!remote&&!technician)throw invalid('Der angemeldete ServicePad-Zugang hat keinen zugeordneten Monteur.');
  const prepared=workEdits(snapshot,remote,workers,assignments);
  if(prepared.workerChoices)return prepared;
  const temp=temporaryId(order);
  const documentId=idOf(remote)||String(temp);
  const target=remote||{ID:temp,ID_KUNDE:customer.remote_id,ID_MANDANT:mandantId==='0'?null:mandantId,AK_MONTEUR:technician,
    PROJECT_UUID:order.id,AK_AUFSTATUS:0,AK_TERMIN:order.work_date,FORMDATA:{},DEVICES:[],WORKTIMES:[],POSITIONS:[]};
  const updated=applyEdits(target,prepared.edits,workers);
  updated.AK_SAVE_TIME=dateTime();
  updated.SEND_MAIL_TO_CUSTOMER=false;
  updated.SEND_MAIL_TO_RECIPIENT=false;
  updated.SEND_MEASURES=false;
  updated.sendFormToCustomer_={};
  const signature=String(order.signature_data||'');
  if(order.signed_by&&!signature.startsWith('data:image/png;base64,'))throw invalid('Die gespeicherte Unterschrift ist unvollständig.');
  const files=snapshot.documents.map(doc=>({...doc,remoteName:mediaName(doc.id,doc.name)}));
  if(signature.startsWith('data:image/png;base64,')) {
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature));
    const fingerprint=[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('').slice(0,24);
    files.push({id:fingerprint,remoteName:mediaName(fingerprint,'Unterschrift-'+order.signed_by+'.png'),raw:signature,mime:'image/png'});
  }
  if(files.length>18)throw invalid('Für diesen Arbeitsschein sind zu viele Anhänge für eine einzelne Übertragung hinterlegt.');
  if(order.signed_by&&signature)updated.SIGNATURE_NAME=String(order.signed_by).slice(0,150);
  const media=currentMedia(remote);
  for(const file of files){
    if(fileIn(media,file.remoteName))continue;
    await beforeSend();
    const data=file.raw||await loadFile(file);
    const payload={ID:file.remoteName,ItemID:Number(documentId),mandantID:mandantId,Type:file.mime||'application/octet-stream',
      Name:file.remoteName,File:file.remoteName,TimeStamp:dateTime(),Data:data};
    const raw=JSON.stringify(payload);
    const response=await requestPortal(fetcher,'WorksheetMedia',auth,{},{
      DATA_EXPECTED_LENGTH:String(new TextEncoder().encode(raw).length),DATA:raw});
    if(!response||response==='empty')throw unconfirmed();
    const {Data,...metadata}=payload;
    media.push({...metadata,HandlingMode:'add'});
  }
  updated.MEDIAFILES=media;
  await beforeSend();
  if(!remote&&!await markAttempt())throw unconfirmed();
  try {await requestPortal(fetcher,'Worksheet',auth,{}, {ITEMID:documentId,DATA:JSON.stringify(updated)});}
  catch(error){if(error.code==='portal_write_access')throw error;}
  const after=await lookup();
  const confirmed=remote?after.get(documentId):fromProject(after);
  if(!idOf(confirmed)||!readback(confirmed,updated,files.map(file=>file.remoteName)))throw unconfirmed();
  await updateLink(idOf(confirmed),await worksheetRevision(confirmed));
  return {id:idOf(confirmed),number:String(confirmed.AK_SCHEINNR||confirmed.ID),attachments:files.length};
}
