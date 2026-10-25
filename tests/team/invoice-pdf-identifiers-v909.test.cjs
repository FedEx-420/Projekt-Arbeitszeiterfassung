// Synthetic output from the actual invoice renderer and new party normalization.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),PDFLib=require('pdf-lib');
async function main(){
 const dir=path.resolve(__dirname,'../..');global.window={PDFLib};for(const file of ['invoice-ledger-ui-v908.js','invoice-tax-v905.js','documents-pdf-v857.js'])vm.runInThisContext(fs.readFileSync(path.join(dir,file),'utf8'));
 const parties={issuer:{name:'Wattwerk Elektrotechnik - Fiktiver Testbetrieb',address:['Synthetische Firmenstraße 7','53343 Teststadt'],taxNumber:'FIKTIVE-STNR-909',vatId:'DE123456789',email:'test@example.invalid'},customer:{name:'Anna Beispiel - Fiktive Kundin',address:['Kundenstraße 8','12345 Kundenstadt']}};
 const item={name:'Monteurstunde',date:'2026-10-12',quantity:1,unit:'H',price:55,execution:'Anna Muster: 08:00 - 09:00 Uhr',description:'Synthetische Prüfung, kein echter Geschäftsvorfall'};
 const base={company:'Wattwerk Elektrotechnik',number:'TEST-909',issued:'2026-10-25',from:'2026-10-12',to:'2026-10-12',orderCount:1,hours:1,finalized:false,days:[{date:'2026-10-12',periods:[{name:'Anna Muster',start:'08:00',end:'09:00',pause:0,hours:1}]}],items:[item]};base.tax=window.WorktimeInvoiceTax.calculate(base.items,{basis:'net',mode:'standard',confirmed:true});
 const output=path.resolve(dir,'../arbeitszeit-tools/pdf-v909-invoices');fs.mkdirSync(output,{recursive:true});
 for(const [name,input,small]of [['USt-ID',parties,false],['Steuernummer',{...parties,issuer:{...parties.issuer,vatId:''}},false],['Kleinbetrag',parties,true]]){
  const normalized=window.WorktimeInvoiceLedger.invoiceParties(input,small),doc={...base,issuer:normalized.issuer,customer:normalized.customer.name,address:normalized.customer.address};
  const bytes=await window.DevicePdf.createInvoice(doc);const pdf=await PDFLib.PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>0);fs.writeFileSync(path.join(output,name+'.pdf'),bytes);
 }
 assert.equal(parties.issuer.taxNumber,'FIKTIVE-STNR-909');console.log(JSON.stringify({syntheticPdfs:3,output,productionWrites:0}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
