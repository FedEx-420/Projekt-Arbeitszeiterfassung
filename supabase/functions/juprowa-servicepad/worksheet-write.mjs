import { requestPortal, scopedWorksheets, ServicepadError, worksheetAddressFields, worksheetAddressPrefixes, worksheetRevision, worksheetRows } from './portal.mjs';

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
const owns = (row, key) => Object.hasOwn(row, key);
const timeFields = { start:'AZ_WORK_BEG', end:'AZ_WORK_END', travelStart:'AZ_TRAVEL_BEG', travelEnd:'AZ_TRAVEL_END', breakStart:'AZ_WORK_PAUSE_BEG' };
const quantities = value => Number(String(value ?? '').replace(',', '.'));
const emptyTime = '00:00:00';

function integer(value, max, message) {
  if (!/^\d{0,9}$/.test(String(value)) || Number(value) > max) throw invalid(message);
  return Number(value);
}

function editTime(original, values, workers) {
  const row = { ...original };
  if (!original || owns(values, 'day')) {
    const day = values.day;
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < '1900-01-01' ||
        day > '2999-12-31' || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day) {
      throw invalid('Bitte das Datum des Zeitabschnitts prüfen.');
    }
    row.AZ_DATUM = day;
  }
  if (!original || owns(values, 'workerId')) {
    const worker = workers.find(person => person.id === values.workerId);
    if (!worker) throw invalid('Bitte für jede neue oder geänderte Zuordnung einen verfügbaren Juprowa-Monteur auswählen.');
    row.AZ_WORKER = worker.id;
    row.AZ_WORKERNAME = worker.name;
  }
  for (const [key, field] of Object.entries(timeFields)) {
    if (!original || owns(values, key)) {
      row[field] = time(values[key] ?? '', !original && (key === 'start' || key === 'end')) ||
        (key === 'breakStart' ? row.AZ_WORK_BEG || emptyTime : emptyTime);
    }
  }
  if (!original || owns(values, 'breakMinutes')) row.AZ_WORK_PAUSE = integer(values.breakMinutes ?? '', 720, 'Bitte die Pausenzeit in Minuten angeben.');
  if (!original || owns(values, 'travelKm')) row.AZ_TRAVEL_WIDTH = integer(values.travelKm ?? '', 99999, 'Bitte die Anfahrtskilometer als ganze Zahl eingeben.');
  return row;
}

const canEditMaterialIdentity = row => !row.AP_GERID && Number(row.AP_POSTYPE || 0) === 0;

function editMaterial(original, values) {
  const row = original ? { ...original } : { AP_POSTYPE:'0', AP_GERID:'', AP_VKPREIS:'', AP_POSPREIS:'' };
  if (!original || canEditMaterialIdentity(original)) {
    if (!original || owns(values, 'article')) row.AP_ARTNR = text(values.article ?? '',26).trim().toUpperCase();
    if (!original || owns(values, 'supplier')) row.AP_LIEF = text(values.supplier ?? '',5).trim();
    if (!original || owns(values, 'description')) {
      const description = text(values.description ?? '',4000).replace(/\r\n/g,'\n');
      if (!description.trim() && !row.AP_ARTNR) throw invalid('Bitte eine Materialbezeichnung oder Artikelnummer angeben.');
      const [first = '', second = ''] = description.split('\n');
      Object.assign(row,{AP_TEXT:description,AP_KT1:first.slice(0,40),AP_KT2:second.slice(0,40)});
    }
  } else if (['article','supplier','description'].some(key => owns(values,key))) {
    throw invalid('Eine mit Geräten oder Formularen verknüpfte Position kann hier nur in Menge und Einheit geändert werden.');
  }
  if (!original || owns(values, 'quantity')) {
    if (!/^\d{1,8}(?:[.,]\d{1,4})?$/.test(String(values.quantity))) throw invalid('Bitte die Materialmenge prüfen.');
    row.AP_MENGE = String(values.quantity).replace(',','.');
    if (String(row.AP_VKPREIS ?? '').trim() && Number.isFinite(quantities(row.AP_VKPREIS))) {
      row.AP_POSPREIS = (quantities(row.AP_MENGE) * quantities(row.AP_VKPREIS)).toFixed(2);
    }
  }
  if (!original || owns(values, 'unit')) row.AP_MENGEEH = text(values.unit ?? '',4);
  return row;
}

function editRows(originals, changes, edit, removeAllowed = () => true) {
  if (!Array.isArray(changes) || changes.length > Math.max(200,originals.length)) throw invalid('Zu viele oder ungültige Positionen im Arbeitsschein.');
  const used = new Set(), rows = [];
  for (const values of changes) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw invalid('Eine Position im Arbeitsschein ist ungültig.');
    const { originalIndex } = values;
    if (originalIndex === null) {
      rows.push(edit(null, values));
      continue;
    }
    if (!Number.isSafeInteger(originalIndex) || !originals[originalIndex] || used.has(originalIndex)) throw restage();
    used.add(originalIndex);
    rows.push(edit(originals[originalIndex], values));
  }
  if (originals.some((row,index)=>!used.has(index) && !removeAllowed(row))) {
    throw invalid('Eine mit Geräten oder Formularen verknüpfte Position kann hier nicht entfernt werden.');
  }
  return rows;
}

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

function applyEdits(worksheet, edits, workers) {
  if (!edits||typeof edits!=='object'||Array.isArray(edits)) throw invalid('Die Arbeitsscheindaten fehlen.');
  const row=structuredClone(worksheet);
  row.AK_DURCHZUFUEHREN=text(edits.requested,12000);
  row.AK_ARBEITEN=text(edits.completed,12000);
  row.AK_NOTIZ=text(edits.notes,12000);
  const times=worksheetRows(row.WORKTIMES),materials=worksheetRows(row.POSITIONS);
  if (edits.rowFormat === 2) {
    for (const [key,prefix] of Object.entries(worksheetAddressPrefixes)) {
      for (const [name,suffix] of Object.entries(worksheetAddressFields)) {
        if (owns(edits.addresses?.[key] ?? {},name)) {
          row[`${prefix}_${suffix}`] = text(edits.addresses[key][name],name==='postalCode'?16:100).trim();
        }
      }
    }
    row.WORKTIMES = editRows(times,edits.times,(original,values)=>editTime(original,values,workers));
    row.POSITIONS = editRows(materials,edits.materials,editMaterial,canEditMaterialIdentity);
    return row;
  }
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

export async function saveExistingWorksheet(fetcher,{auth,mandantId,technician,workers=[],input,beforeSend}) {
  const id=input.worksheetId;
  if(input.confirmed!==true||typeof id!=='string'||!/^[1-9]\d{0,14}$/.test(id)
      ||typeof input.sheetRevision!=='string'||!/^[a-f0-9]{64}$/.test(input.sheetRevision)) {
    throw invalid('Öffne den Arbeitsschein und bestätige die Änderung.');
  }
  const close=input.action==='worksheet-close';
  const current=(await scopedWorksheets(fetcher,auth,mandantId,true)).get(id);
  if(!current||Number(current.AK_AUFSTATUS)>=5||await worksheetRevision(current)!==input.sheetRevision)throw restage();
  const updated=applyEdits(current,input.edits,workers);
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
  try {
    await requestPortal(fetcher,'Worksheet',auth,{}, {ITEMID:id,DATA:JSON.stringify(updated)});
  } catch(error) {
    if(error.code==='portal_write_access')throw error;
    // Cloud versions return different response envelopes. A request with an
    // ambiguous transport result may already have reached the portal.
  }
  const result=(await scopedWorksheets(fetcher,auth,mandantId,true)).get(id);
  const lines=value=>String(value??'').replace(/\r\n/g,'\n');
  if(!result||Number(result.AK_AUFSTATUS)!==Number(updated.AK_AUFSTATUS)||
      ['AK_ARBEITEN','AK_DURCHZUFUEHREN','AK_NOTIZ'].some(field=>lines(result[field])!==lines(updated[field]))||
      (close&&result.SIGNATURE_NAME!==updated.SIGNATURE_NAME))throw pending();
  const periods=worksheetRows(result.WORKTIMES), positions=worksheetRows(result.POSITIONS);
  const intendedPeriods=worksheetRows(updated.WORKTIMES),intendedPositions=worksheetRows(updated.POSITIONS);
  const addressKeys = Object.values(worksheetAddressPrefixes).flatMap(prefix =>
    Object.values(worksheetAddressFields).map(suffix => `${prefix}_${suffix}`));
  const normalizedTime=value=>String(value??'').replace(/^(\d):/,'0$1:').slice(0,5) || '00:00';
  const timeKey=row=>JSON.stringify([String(row.AZ_DATUM??'').slice(0,10),String(row.AZ_WORKER??''),
    ...Object.values(timeFields).map(field=>normalizedTime(row[field] ?? (field==='AZ_WORK_PAUSE_BEG' ? row.AZ_WORK_BEG : ''))),
    Number(row.AZ_WORK_PAUSE??0),Number(row.AZ_TRAVEL_WIDTH??0)]);
  const timeKeys=rows=>JSON.stringify(rows.map(timeKey).sort());
  const materialKey=row=>JSON.stringify(['AP_ARTNR','AP_LIEF','AP_KT1','AP_KT2','AP_TEXT','AP_MENGEEH']
    .map(field=>lines(row[field]).trim()).concat(quantities(row.AP_MENGE)));
  if (input.edits.rowFormat===2) {
    if (addressKeys.some(field=>lines(result[field]).trim()!==lines(updated[field]).trim()) ||
        timeKeys(periods)!==timeKeys(intendedPeriods) ||
        JSON.stringify(positions.map(materialKey))!==JSON.stringify(intendedPositions.map(materialKey))) throw pending();
    return {id,closed:close};
  }
  if(periods.length!==intendedPeriods.length||positions.length!==intendedPositions.length||
      periods.some((row,index)=>['AZ_WORK_BEG','AZ_WORK_END'].some(field=>
        String(row[field]??'').slice(0,5)!==String(intendedPeriods[index][field]??'').slice(0,5))||
        Number(row.AZ_WORK_PAUSE??0)!==Number(intendedPeriods[index].AZ_WORK_PAUSE??0))||
      positions.some((row,index)=>quantities(row.AP_MENGE)!==quantities(intendedPositions[index].AP_MENGE)||
        String(row.AP_MENGEEH??'')!==String(intendedPositions[index].AP_MENGEEH??'')))throw pending();
  return {id,closed:close};
}
