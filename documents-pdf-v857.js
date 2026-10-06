/* Direct device downloads. Uses the existing pinned local pdf-lib 1.17.1. */
(() => {
  'use strict';
  const number=value=>Number(value||0);
  const hours=value=>number(value).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' h';
  const money=value=>number(value).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
  const count=value=>number(value).toLocaleString('de-DE',{maximumFractionDigits:2});
  const date=value=>value?new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'long',year:'numeric'}).format(new Date(value+'T12:00:00Z')):'-';
  const time=value=>value?String(value).slice(0,5)+' Uhr':'-';
  async function layout(data,title,subtitle,footer) {
    if (!window.PDFLib) throw new Error('Das PDF-Modul ist noch nicht geladen. Bitte die App erneut öffnen.');
    const {PDFDocument,StandardFonts,rgb}=window.PDFLib,pdf=await PDFDocument.create();
    const normal=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
    const colors={ink:rgb(.10,.20,.19),muted:rgb(.34,.43,.41),teal:rgb(.03,.36,.35),pale:rgb(.94,.97,.96),line:rgb(.82,.89,.87),white:rgb(1,1,1),holiday:rgb(.91,.94,.96),sick:rgb(.99,.91,.92),approved:rgb(.89,.95,.91),requested:rgb(1,.96,.83)};
    const safe=value=>Array.from(String(value??'').normalize('NFC')).map(char=>{if(char==='\r')return '';if(char==='\n')return ' ';try{normal.encodeText(char);return char;}catch{return '?';}}).join('');
    function wrap(value,width,size=9,font=normal) {
      const lines=[];
      for(const paragraph of String(value??'').split(/\r?\n/)){
        let line='';
        for(const word of safe(paragraph).split(/\s+/)){
          if(!word)continue;
          if(font.widthOfTextAtSize(line?line+' '+word:word,size)<=width){line=line?line+' '+word:word;continue;}
          if(line)lines.push(line);line='';
          for(const char of word){if(line&&font.widthOfTextAtSize(line+char,size)>width){lines.push(line);line='';}line+=char;}
        }
        lines.push(line);
      }
      return lines;
    }
    let logo=null;
    if(data.logoBytes){try{logo=await pdf.embedJpg(data.logoBytes);}catch{try{logo=await pdf.embedPng(data.logoBytes);}catch{/* Optional logo. */}}}
    const width=595.28,height=841.89,margin=40,content=width-2*margin;
    let page,y,context='';
    const draw=(value,x,baseline,size=9,font=normal,color=colors.ink)=>page.drawText(safe(value),{x,y:baseline,size,font,color});
    function newPage(){
      page=pdf.addPage([width,height]);
      page.drawRectangle({x:margin,y:height-margin-103,width:content,height:103,color:colors.teal});
      page.drawRectangle({x:margin+12,y:height-margin-86,width:151,height:70,color:colors.white});
      if(logo){const scale=Math.min(139/logo.width,58/logo.height),w=logo.width*scale,h=logo.height*scale;page.drawImage(logo,{x:margin+12+(151-w)/2,y:height-margin-86+(70-h)/2,width:w,height:h});}
      else draw('ZE',margin+64,height-margin-62,28,bold,colors.teal);
      const x=margin+180;
      wrap(title,content-195,21,bold).slice(0,2).forEach((line,index)=>draw(line,x,height-margin-29-index*24,21,bold,colors.white));
      wrap(data.company||'Zeiterfassung',content-195,10,bold).slice(0,2).forEach((line,index)=>draw(line,x,height-margin-75-index*12,10,bold,colors.white));
      y=height-margin-124;
      if(subtitle){draw(subtitle,margin,y,9,bold);y-=17;}
      if(context){draw(context+' (Fortsetzung)',margin,y,8,bold,colors.muted);y-=18;}
    }
    const room=heightValue=>{if(y-heightValue<60)newPage();};
    function lines(value,{size=9,font=normal,color=colors.ink,gap=13,indent=0}={}){
      for(const line of wrap(value,content-indent,size,font)){room(gap);draw(line,margin+indent,y,size,font,color);y-=gap;}
    }
    function heading(value,reserve=65){room(reserve);y-=6;lines(value,{size:14,font:bold,color:colors.teal,gap:21});}
    function cards(values){
      const gap=8,w=(content-gap*2)/3,rows=Math.ceil(values.length/3);room(rows*57+5);
      values.forEach(([label,value],index)=>{const row=Math.floor(index/3),x=margin+(index%3)*(w+gap),top=y-row*57;page.drawRectangle({x,y:top-49,width:w,height:49,color:colors.pale});draw(label,x+10,top-15,8,bold,colors.muted);draw(value,x+10,top-35,13,bold,colors.teal);});y-=rows*57+7;
    }
    function table(headers,rows,widths,{numericHeaders=[],lastRowReserve=0}={}){
      const positions=widths.map((_,index)=>margin+widths.slice(0,index).reduce((sum,value)=>sum+value,0));
      const head=()=>{room(30);page.drawRectangle({x:margin,y:y-25,width:content,height:25,color:colors.pale});headers.forEach((label,index)=>draw(label,numericHeaders.includes(index)?positions[index]+widths[index]-6-bold.widthOfTextAtSize(safe(label),8):positions[index]+6,y-16,8,bold,colors.teal));y-=25;};
      head();
      for(const [rowIndex,row] of rows.entries()){
        const cells=row.cells.map((value,index)=>wrap(value,widths[index]-12,8.5)),lineCount=Math.max(1,...cells.map(cell=>cell.length));let offset=0;
        const reserve=rowIndex===rows.length-1?lastRowReserve:0;
        if(y-Math.min(lineCount*12+14+reserve,height-240)<60){newPage();head();}
        while(offset<lineCount){
          const fit=Math.min(lineCount-offset,Math.floor((y-60-14-reserve)/12));
          if(fit<1){newPage();head();continue;}
          const rowHeight=fit*12+14;
          if(row.kind&&colors[row.kind])page.drawRectangle({x:margin,y:y-rowHeight,width:content,height:rowHeight,color:colors[row.kind]});
          cells.forEach((cell,index)=>cell.slice(offset,offset+fit).forEach((line,lineIndex)=>{
            const right=row.numeric?.includes(index),x=right?positions[index]+widths[index]-6-normal.widthOfTextAtSize(safe(line),8.5):positions[index]+6;
            draw(line,x,y-15-lineIndex*12,8.5);
          }));
          page.drawLine({start:{x:margin,y:y-rowHeight},end:{x:margin+content,y:y-rowHeight},thickness:.5,color:colors.line});y-=rowHeight;offset+=fit;
          if(offset<lineCount){newPage();head();}
        }
      }
      y-=10;
    }
    function offerTotals(offer){
      // Share the right edge with the table's "Gesamt" column. Keep the
      // complete summary together, including on multipage quotations.
      room(112);
      const boxWidth=322,x=margin+content-boxWidth,right=margin+content-6,top=y;
      page.drawRectangle({x,y:top-104,width:boxWidth,height:104,color:colors.pale});
      const rows=[
        {label:'Zwischensumme (netto)',value:offer.subtotal,offset:22,size:10,font:normal,color:colors.ink},
        {label:'Mehrwertsteuer ('+count(offer.vat_rate)+' %)',value:offer.tax_amount,offset:44,size:10,font:normal,color:colors.ink},
        {label:'Gesamtbetrag inkl. MwSt.',value:offer.total,offset:84,size:12.5,font:bold,color:colors.teal}
      ];
      page.drawLine({start:{x:x+12,y:top-59},end:{x:margin+content-6,y:top-59},thickness:1,color:colors.line});
      rows.forEach((row,index)=>{
        const labelSize=index===2?10.5:10,text=money(row.value);
        const available=right-(x+12)-row.font.widthOfTextAtSize(safe(row.label),labelSize)-14;
        const size=Math.min(row.size,available/row.font.widthOfTextAtSize(safe(text),1));
        draw(row.label,x+12,top-row.offset,labelSize,row.font,row.color);
        draw(text,right-row.font.widthOfTextAtSize(safe(text),size),top-row.offset,size,row.font,row.color);
      });
      y-=116;
    }
    function finish(){
      const pages=pdf.getPages();
      pages.forEach((sheet,index)=>{sheet.drawLine({start:{x:margin,y:43},end:{x:width-margin,y:43},thickness:.5,color:colors.line});sheet.drawText(safe(footer),{x:margin,y:29,size:8,font:normal,color:colors.muted});const text='Seite '+(index+1)+' / '+pages.length;sheet.drawText(text,{x:width-margin-normal.widthOfTextAtSize(text,8),y:29,size:8,font:normal,color:colors.muted});});
      pdf.setTitle(safe(title));pdf.setAuthor(safe(data.company||'Zeiterfassung'));pdf.setCreator('Zeiterfassung v858');return pdf.save();
    }
    newPage();
    return {pdf,colors,draw,wrap,lines,heading,cards,table,offerTotals,room,finish,get y(){return y;},set y(value){y=value;},set context(value){context=value;},margin,content};
  }
  async function createTimeAccount(data){
    const year=data.year,e=await layout(data,'Jahresübersicht '+year.year,'Arbeitsstunden, Urlaub, Krankheit und NRW-Feiertage','Arbeitszeiten und Abwesenheiten');
    e.lines('Mitarbeiter: '+data.person,{size:12,font:await e.pdf.embedFont(window.PDFLib.StandardFonts.HelveticaBold),gap:19});
    e.cards([['Arbeitszeit',hours(year.hours)],['Überstunden',hours(year.overtime)],['Krankheit',count(year.sickDays)+' Tage'],['Urlaub genehmigt',count(year.approvedDays)+' Tage'],['Urlaub beantragt',count(year.requestedDays)+' Tage'],['NRW-Feiertage',count(year.holidays)+' Tage']]);
    for(const month of year.months){
      const label=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(month.month+'-01T12:00:00Z'));
      const rows=month.days.flatMap(day=>(day.entries.length?day.entries:[null]).map((entry,index)=>({kind:day.labels.find(label=>label.kind==='sick')?.kind||day.labels[0]?.kind||'',numeric:[4,5],cells:[date(day.date),[entry?.customer_name||'',...(index===0?day.labels.map(label=>label.text):[])].filter(Boolean).join('\n'),entry?time(entry.start_time):'-',entry?time(entry.end_time):'-',entry?hours(entry.pause_hours):'-',entry?hours(entry.executed_hours):'-']})));
      const widths=[85,188,65,65,54,58],sectionHeight=95+rows.reduce((sum,row)=>sum+14+12*Math.max(...row.cells.map((cell,index)=>e.wrap(cell,widths[index]-12,8.5).length)),0);
      e.context='';e.heading(label,sectionHeight<460?sectionHeight:90);e.context=label;
      e.table(['Datum','Kunde / Status','Von','Bis','Pause','Stunden'],rows,widths);
      e.lines('Monatssumme: '+hours(month.hours)+' | Krankheit: '+count(month.sickDays)+' Tage | Urlaub genehmigt: '+count(month.approvedDays)+' Tage | Urlaub beantragt: '+count(month.requestedDays)+' Tage | Feiertage: '+month.holidays,{size:8,color:e.colors.muted,gap:12});e.y-=10;
    }
    e.context='';e.heading('Hinweise',85);
    e.lines('Urlaubssummen zählen Arbeitstage ohne NRW-Feiertage und Krankheit. Krankmeldungen haben bei gleichzeitigem Urlaub Vorrang. Beantragter Urlaub ist noch nicht genehmigt. Tage ohne Arbeitsbuchung erzeugen keine Minusstunden.',{size:8,color:e.colors.muted,gap:12});
    return e.finish();
  }
  async function createOffer(data){
    const offer=data.offer,e=await layout(data,offer.status==='draft'?'Angebot - Entwurf':'Angebot',offer.offer_number,'Angebot - keine Rechnung');
    e.lines('Angebot für',{size:9,color:e.colors.muted});e.lines(offer.customer_name,{size:13,gap:19});
    const fields=offer.customer_snapshot||{};
    e.lines([[fields.first_name].filter(Boolean).join(' '),[fields.street,fields.house_no].filter(Boolean).join(' '),[fields.postal_code,fields.city].filter(Boolean).join(' '),fields.email].filter(Boolean).join('\n'),{size:9,gap:13});e.y-=9;
    e.lines('Datum: '+date(offer.offer_date)+(offer.valid_until?' | Gültig bis: '+date(offer.valid_until):''),{size:9,gap:15});
    e.heading('Leistungsbeschreibung',80);e.lines(offer.title,{size:10,gap:15});e.y-=9;
    e.context=offer.offer_number;
    e.table(['Position','Material / Leistung','Menge','Einheit','Einzelpreis','Gesamt'],offer.items.map((item,index)=>({numeric:[0,2,4,5],cells:[String(index+1),item.name+(item.kind==='labor'?'\nArbeitsstunden':''),count(item.quantity),item.unit|| (item.kind==='labor'?'h':'Stk.'),money(item.unit_price),money(item.line_total)]})),[44,181,48,45,97,100.28],{numericHeaders:[0,2,4,5],lastRowReserve:126});
    e.offerTotals(offer);
    e.context='';
    if(offer.notes){e.heading('Hinweise',70);e.lines(offer.notes,{size:9,gap:14});}
    return e.finish();
  }
  function download(bytes,filename){
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),link=document.createElement('a');
    link.href=url;link.download=String(filename).replace(/[<>:"/\\|?*\u0000-\u001F]/g,'_');document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  window.DevicePdf={createTimeAccount,createOffer,download};
})();
