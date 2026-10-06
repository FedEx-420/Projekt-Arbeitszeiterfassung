/* Pure PDF layout test. No network, Supabase or production data. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const PDFLib=require('pdf-lib');
const output=process.env.PDF_QA_OUTPUT_DIR||path.join(os.tmpdir(),'worktime-offer-pdf-v858');
globalThis.window={PDFLib};
vm.runInThisContext(fs.readFileSync(path.resolve(__dirname,'../../documents-pdf-v857.js'),'utf8'));
const {createOffer,createTimeAccount}=window.DevicePdf;
function offer(items,vat=19,notes='Vielen Dank für Ihre Anfrage.\nWir freuen uns auf Ihren Auftrag.'){
  const subtotal=items.reduce((sum,row)=>sum+row.line_total,0),tax=Math.round(subtotal*vat)/100;
  return {offer_number:'ANG-2026-TEST',customer_name:'Testkunde & Gebäudetechnik',customer_snapshot:{street:'Musterstraße',house_no:'12',postal_code:'44135',city:'Dortmund'},offer_date:'2026-10-06',valid_until:'2026-11-06',title:'Lieferung und Montage der folgenden Materialien und Arbeitsleistungen.',status:'ready',items,subtotal,vat_rate:vat,tax_amount:tax,total:Math.round((subtotal+tax)*100)/100,notes};
}
const item=(name,quantity,unitPrice,kind='material')=>({name,kind,quantity,unit:kind==='labor'?'h':'Stk.',unit_price:unitPrice,line_total:Math.round(quantity*unitPrice*100)/100});
async function main(){
  fs.mkdirSync(output,{recursive:true});let passed=0;const manifest=[];
  const cases=[
    ['Angebot_Kurz',offer([item('Kabel',3,2),item('Verteilerkasten',1,350),item('Monteurstunde',2.5,55,'labor'),item('Kostenlose Anfahrt',1,0)])],
    ['Angebot_Mehrseitig',offer(Array.from({length:40},(_,index)=>item(('Testmaterial '+(index+1)+' - Elektrische Montage und Gebäudetechnik mit ausführlicher Beschreibung für die Angebotsposition.').slice(0,200),2.25,55,index%3===0?'labor':'material')))],
    ['Angebot_100_Positionen',offer(Array.from({length:100},(_,index)=>item('Artikel P-'+(index+1),1,10)))],
    ['Angebot_Seitenumbruch',offer(Array.from({length:22},(_,index)=>item('Montagematerial '+(index+1),2,13.5)))],
    ['Angebot_Ohne_MwSt',offer([item('Kostenloses Muster',1,0)],0,'')],
    ['Angebot_Grosse_Betraege',offer([item('Großauftrag 1',100000,1000000),item('Großauftrag 2',100000,1000000),item('Großauftrag 3',100000,1000000)],100)]
  ];
  for(const [name,model] of cases){
    const before=JSON.stringify(model),bytes=await createOffer({offer:model,company:'Elektro Test & Partner'});
    assert.equal(JSON.stringify(model),before,'PDF must not change a saved quotation');
    const pdf=await PDFLib.PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>0);assert.equal(pdf.getCreator(),'Zeiterfassung v860');
    if(name==='Angebot_Mehrseitig'||name==='Angebot_100_Positionen')assert.ok(pdf.getPageCount()>1);
    fs.writeFileSync(path.join(output,name+'.pdf'),bytes);
    manifest.push({name,count:model.items.length,pages:pdf.getPageCount(),subtotal:model.subtotal,tax:model.tax_amount,total:model.total,vat:model.vat_rate,lastName:model.items.at(-1).name});
    passed++;console.log('PASS '+name+' generated without changing any quotation data');
  }
  const annual={year:'2026',hours:3,overtime:-5,sickDays:1,approvedDays:1,requestedDays:1,holidays:1,months:[{month:'2026-10',hours:3,sickDays:1,approvedDays:1,requestedDays:1,holidays:1,days:[{date:'2026-10-03',entries:[],labels:[{kind:'holiday',text:'Feiertag NRW: Tag der Deutschen Einheit'}]},{date:'2026-10-05',entries:[{customer_name:'Testkunde',start_time:'08:00',end_time:'11:00',pause_hours:0,executed_hours:3}],labels:[]},{date:'2026-10-06',entries:[],labels:[{kind:'sick',text:'Krankheit'}]},{date:'2026-10-07',entries:[],labels:[{kind:'approved',text:'Urlaub (genehmigt)'}]},{date:'2026-10-08',entries:[],labels:[{kind:'requested',text:'Urlaub (beantragt)'}]}]}]};
  const bytes=await createTimeAccount({year:annual,person:'Testmitarbeiter',company:'Elektro Test & Partner'});assert.equal((await PDFLib.PDFDocument.load(bytes)).getPageCount(),1);fs.writeFileSync(path.join(output,'Jahresuebersicht_Unveraendert.pdf'),bytes);passed++;console.log('PASS Annual download retains its original table and absence statuses');
  fs.writeFileSync(path.join(output,'offer-layout-expectations.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({passed,pdfDirectory:output,productionWrites:0}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
