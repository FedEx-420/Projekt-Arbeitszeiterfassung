import { requestPortal, scopedWorksheets, ServicepadError, worksheetRevision, worksheetRows } from './portal.mjs';

const restage = () => new ServicepadError('worksheet_changed',409,
  'Der Arbeitsschein hat sich in ServicePad geändert. Öffne ihn erneut, bevor du speicherst.');
const invalid = message => new ServicepadError('worksheet_validation',422,message);
const pending = () => new ServicepadError('worksheet_unconfirmed',502,
  'ServicePad hat die Änderung noch nicht eindeutig bestätigt. Aktualisiere die Liste, bevor du erneut speicherst.');

const time = (value, required = false) => {
  if (value === '' && !required) return '';
  if (!/^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) throw invalid('Bitte die Arbeitszeiten prüfen.');
  const [h,m,s='00']=value.split(':');
  return h.padStart(2,'0')+':'+m+':'+s;
};
const localStamp = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',
  month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
const text = (value, length) => {
  if (typeof value!=='string'||value.length>length||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) {
    throw invalid('Eine Texteingabe ist ungültig oder zu lang.');
  }
  return value;
};

// Base30 wire format, interoperable with the MIT-licensed jSignature encoder.
// Original format by Willow Systems Corp, https://github.com/willowsystems/jSignature.
export function encodeSignature(strokes) {
  if (!Array.isArray(strokes)||!strokes.length||strokes.length>120) throw invalid('Bitte auf dem Unterschriftenfeld unterschreiben.');
  let points=0, hasLine=false;
  const digits='0123456789abcdefghijklmnopqrst';
  const continuation='uvwxyzABCDEFGHIJKLMNOPQRSTUVWX';
  function axis(data) {
    let previous=0,sign=1;
    return data.map(coordinate=>{
      const difference=coordinate-previous;
      previous=coordinate;
      const prefix=difference&&Math.sign(difference)!==sign?(difference<0?'Z':'Y'):'';
      if(prefix)sign=Math.sign(difference);
      const encoded=Math.abs(difference).toString(30);
      return prefix+encoded[0]+[...encoded.slice(1)].map(character=>continuation[digits.indexOf(character)]).join('');
    }).join('');
  }
  const body=strokes.map(stroke=>{
    if(!Array.isArray(stroke)||!stroke.length)throw invalid('Unterschrift ist unvollständig.');
    points+=stroke.length;
    if(points>12000||stroke.some(point=>!Array.isArray(point)||point.length!==2||
        point.some(coordinate=>!Number.isSafeInteger(coordinate)||coordinate<0||coordinate>1600))) {
      throw invalid('Unterschrift ist ungültig.');
    }
    hasLine||=stroke.some(([x,y])=>x!==stroke[0][0]||y!==stroke[0][1]);
    return axis(stroke.map(([x])=>x))+'_'+axis(stroke.map(([,y])=>y));
  }).join('_');
  if(!hasLine)throw invalid('Bitte auf dem Unterschriftenfeld unterschreiben.');
  return 'image/jsignature;base30,'+body;
}

function applyEdits(worksheet, edits) {
  if (!edits||typeof edits!=='object'||Array.isArray(edits)) throw invalid('Die Arbeitsscheindaten fehlen.');
  const row=structuredClone(worksheet);
  row.AK_DURCHZUFUEHREN=text(edits.requested,12000);
  row.AK_ARBEITEN=text(edits.completed,12000);
  row.AK_NOTIZ=text(edits.notes,12000);
  const times=worksheetRows(row.WORKTIMES),materials=worksheetRows(row.POSITIONS);
  if(!Array.isArray(edits.times)||times.length!==edits.times.length||!Array.isArray(edits.materials)||materials.length!==edits.materials.length) throw restage();
  for(const [index,period] of times.entries()) {
    const {start,end,breakMinutes}=edits.times[index]||{};
    if(!/^\d{0,3}$/.test(String(breakMinutes))||Number(breakMinutes)>720)throw invalid('Bitte die Pausenzeit in Minuten angeben.');
    period.AZ_WORK_BEG=time(start);
    period.AZ_WORK_END=time(end);
    period.AZ_WORK_PAUSE=Number(breakMinutes);
  }
  for(const [index,material] of materials.entries()){
    const {quantity,unit}=edits.materials[index]||{};
    if(String(material.AP_MENGE??'')===quantity&&String(material.AP_MENGEEH??'')===unit)continue;
    if(!/^\d{1,8}(?:[.,]\d{1,4})?$/.test(String(quantity)))throw invalid('Bitte die Materialmenge prüfen.');
    material.AP_MENGE=String(quantity).replace(',','.');
    material.AP_MENGEEH=text(unit,4);
  }
  return row;
}

export async function saveExistingWorksheet(fetcher,{auth,mandantId,technician,input,beforeSend}) {
  const id=input.worksheetId;
  if(input.confirmed!==true||typeof id!=='string'||!/^[1-9]\d{0,14}$/.test(id)
      ||typeof input.sheetRevision!=='string'||!/^[a-f0-9]{64}$/.test(input.sheetRevision)) {
    throw invalid('Öffne den Arbeitsschein und bestätige die Änderung.');
  }
  const close=input.action==='worksheet-close';
  const current=(await scopedWorksheets(fetcher,auth,mandantId,true)).get(id);
  if(!current||Number(current.AK_AUFSTATUS)>=5||await worksheetRevision(current)!==input.sheetRevision)throw restage();
  const updated=applyEdits(current,input.edits);
  updated.ID=Number(id);
  updated.AK_SAVE_TIME=localStamp();
  if(close){
    const signer=text(input.signature?.name,150).trim();
    if(!signer||!technician)throw invalid('Der Name des Unterzeichners und die Zuordnung zum ServicePad-Monteur sind erforderlich.');
    updated.SIGNATURE_DATA=encodeSignature(input.signature?.strokes);
    updated.SIGNATURE_NAME=signer;
    updated.AK_SIGN_TIME=localStamp();
    updated.AK_AUFSTATUS=5;
    updated.AK_MONTEUR=technician;
    updated.SEND_MAIL_TO_CUSTOMER=false;
    updated.SEND_MAIL_TO_RECIPIENT=false;
    updated.SEND_MEASURES=false;
    updated.sendFormToCustomer_={};
  }
  await beforeSend();
  const response=await requestPortal(fetcher,'Worksheet',auth,{}, {ITEMID:id,DATA:JSON.stringify(updated)});
  const confirmed=response?.ResponseParams?.data;
  if(String(confirmed?.ID)!==id||(close&&Number(confirmed.AK_AUFSTATUS)!==5))throw pending();
  const result=(await scopedWorksheets(fetcher,auth,mandantId,true)).get(id);
  if(!result||Number(result.AK_AUFSTATUS)!==Number(updated.AK_AUFSTATUS)||
      ['AK_ARBEITEN','AK_DURCHZUFUEHREN','AK_NOTIZ'].some(field=>String(result[field]??'')!==updated[field])||
      (close&&result.SIGNATURE_NAME!==updated.SIGNATURE_NAME))throw pending();
  const periods=worksheetRows(result.WORKTIMES), positions=worksheetRows(result.POSITIONS);
  const intendedPeriods=worksheetRows(updated.WORKTIMES),intendedPositions=worksheetRows(updated.POSITIONS);
  const quantity=value=>Number(String(value??'').replace(',','.'));
  if(periods.length!==intendedPeriods.length||positions.length!==intendedPositions.length||
      periods.some((row,index)=>['AZ_WORK_BEG','AZ_WORK_END'].some(field=>
        String(row[field]??'').slice(0,5)!==String(intendedPeriods[index][field]??'').slice(0,5))||
        Number(row.AZ_WORK_PAUSE??0)!==Number(intendedPeriods[index].AZ_WORK_PAUSE??0))||
      positions.some((row,index)=>quantity(row.AP_MENGE)!==quantity(intendedPositions[index].AP_MENGE)||
        String(row.AP_MENGEEH??'')!==String(intendedPositions[index].AP_MENGEEH??'')))throw pending();
  return {id,closed:close};
}
