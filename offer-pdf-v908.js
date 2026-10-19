/* Separate offer renderer: fixed-price PDFs never receive internal positions. */
(() => {
  'use strict';
  const money=value=>Number(value).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
  const priceMoney=value=>Number(value).toLocaleString('de-DE',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:4});
  const count=value=>Number(value).toLocaleString('de-DE',{maximumFractionDigits:2});
  const date=value=>new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'long',year:'numeric'}).format(new Date(value+'T12:00:00Z'));
  async function createOffer(data){
    const {offer}=data,model=window.WorktimeOfferModel;
    if(!model||!window.WorktimeInvoiceTax||!window.PDFLib)throw Error('Das Angebots-PDF-Modul ist noch nicht vollständig geladen.');
    const publicData=model.publicModel(offer,window.WorktimeInvoiceTax.calculate);
    const snapshot=offer.offer_config?.tax;
    if(snapshot&&(['net','vat','gross'].some(key=>Number(snapshot[key])!==publicData.tax[key])||snapshot.lines?.length!==publicData.tax.lines.length||snapshot.lines.some((line,index)=>['code','net','vat','gross'].some(key=>line[key]!==publicData.tax.lines[index][key]))))throw Error('Die gespeicherten Steuerangaben stimmen nicht mit den Angebotspositionen überein. Bitte das Angebot erneut prüfen.');
    const {PDFDocument,StandardFonts,rgb}=window.PDFLib,pdf=await PDFDocument.create(),normal=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
    const W=595.28,H=841.89,M=40,C=W-2*M,colors={ink:rgb(.1,.2,.19),muted:rgb(.34,.43,.41),teal:rgb(.03,.36,.35),pale:rgb(.94,.97,.96),line:rgb(.82,.89,.87),white:rgb(1,1,1)};
    const safe=value=>Array.from(String(value??'').normalize('NFC')).map(char=>{try{normal.encodeText(char);return char;}catch{return char==='\n'||char==='\r'?' ':'?';}}).join('');
    const wrap=(value,width,size=9,font=normal)=>{
      const result=[];
      for(const paragraph of String(value??'').split(/\r?\n/)){
        let line='';for(const word of safe(paragraph).split(/\s+/)){
          if(!word)continue;
          if(font.widthOfTextAtSize(line?line+' '+word:word,size)<=width){line=line?line+' '+word:word;continue;}
          if(line)result.push(line);line='';
          for(const char of word){if(line&&font.widthOfTextAtSize(line+char,size)>width){result.push(line);line='';}line+=char;}
        }result.push(line);
      }return result;
    };
    let logo=null;if(data.logoBytes){try{logo=await pdf.embedJpg(data.logoBytes);}catch{try{logo=await pdf.embedPng(data.logoBytes);}catch{/* Optional image; no broken or stretched logo. */}}}
    let page,y;
    const draw=(value,x,at,size=9,font=normal,color=colors.ink)=>page.drawText(safe(value),{x,y:at,size,font,color});
    const right=(value,x,at,size=9,font=normal,color=colors.ink,maxWidth=100)=>{const text=safe(value),fit=Math.min(size,maxWidth/Math.max(1,font.widthOfTextAtSize(text,1)));draw(text,x-font.widthOfTextAtSize(text,fit),at,fit,font,color);};
    function newPage(){
      page=pdf.addPage([W,H]);page.drawRectangle({x:M,y:H-M-100,width:C,height:100,color:colors.teal});
      page.drawRectangle({x:M+12,y:H-M-84,width:155,height:68,color:colors.white});
      if(logo){const factor=Math.min(143/logo.width,56/logo.height),w=logo.width*factor,h=logo.height*factor;page.drawImage(logo,{x:M+12+(155-w)/2,y:H-M-84+(68-h)/2,width:w,height:h});}
      else draw('ZEITERFASSUNG',M+24,H-M-55,12,bold,colors.teal);
      const title=publicData.kind==='fixed'?'Pauschalangebot':'Angebot';
      draw(title+(offer.status==='draft'?' - Entwurf':''),M+182,H-M-32,19,bold,colors.white);
      wrap(data.company||'Geschäftskonto',C-196,10,bold).slice(0,2).forEach((text,index)=>draw(text,M+182,H-M-59-index*13,10,bold,colors.white));
      draw(offer.offer_number||'Angebot',M+182,H-M-87,8,normal,colors.white);y=H-M-122;
    }
    const room=height=>{if(y-height<64)newPage();};
    const text=(value,{size=9,font=normal,gap=13,color=colors.ink}={})=>{for(const line of wrap(value,C,size,font)){room(gap);draw(line,M,y,size,font,color);y-=gap;}};
    const heading=(value,reserve=50)=>{room(reserve);y-=7;draw(value,M,y,11,bold,colors.teal);y-=18;};
    newPage();
    text('Angebot für',{size:8,color:colors.muted});text(offer.customer_name,{size:13,font:bold,gap:19});
    const address=offer.customer_snapshot||{};
    text([[address.first_name].filter(Boolean).join(' '),[address.street,address.house_no].filter(Boolean).join(' '),[address.postal_code,address.city].filter(Boolean).join(' '),address.email].filter(Boolean).join('\n'));
    y-=8;text('Datum: '+date(offer.offer_date)+(offer.valid_until?' | Gültig bis: '+date(offer.valid_until):''),{size:8,gap:14});
    heading('Leistungsbeschreibung',70);text(offer.title,{size:10,gap:15});y-=10;
    text('Alle Positionspreise '+(publicData.tax.basis==='net'?'netto':'brutto')+'. Steuerbehandlung und Gesamtsumme siehe unten.',{size:8,color:colors.muted,gap:12});y-=8;
    const widths=[29,206,48,38,94,100.28],labels=['Pos.','Leistung / Material','Menge','Einheit','Einzelpreis','Gesamt'];
    const positions=widths.map((_,index)=>M+widths.slice(0,index).reduce((sum,value)=>sum+value,0));
    function tableHeader(){room(40);page.drawRectangle({x:M,y:y-25,width:C,height:25,color:colors.teal});labels.forEach((label,index)=>{if([0,2,4,5].includes(index))right(label,positions[index]+widths[index]-6,y-16,8,bold,colors.white,widths[index]-12);else draw(label,positions[index]+6,y-16,8,bold,colors.white);});y-=25;}
    tableHeader();
    publicData.rows.forEach((row,index)=>{
      const rule=window.WorktimeInvoiceTax.rules[row.tax.code];
      const cells=[String(index+1),row.name+'\n'+(rule?.label||row.tax.rate+' %'),count(row.quantity),row.unit,priceMoney(row.price),money((publicData.tax.basis==='net'?row.tax.net:row.tax.gross)/100)];
      const lines=cells.map((value,column)=>wrap(value,widths[column]-12,8.5)),lineCount=Math.max(...lines.map(value=>value.length));
      let offset=0;
      while(offset<lineCount){
        if(y-40<64){newPage();tableHeader();}
        const remaining=lineCount-offset,fit=Math.min(remaining,Math.max(1,Math.floor((y-64-14)/12))),rowHeight=14+12*fit;
        if(index%2===0)page.drawRectangle({x:M,y:y-rowHeight,width:C,height:rowHeight,color:colors.pale});
        lines.forEach((column,columnIndex)=>column.slice(offset,offset+fit).forEach((value,lineIndex)=>{const at=y-15-lineIndex*12;if([0,2,4,5].includes(columnIndex))right(value,positions[columnIndex]+widths[columnIndex]-6,at,8.5,normal,colors.ink,widths[columnIndex]-12);else draw(value,positions[columnIndex]+6,at,8.5);}));
        page.drawLine({start:{x:M,y:y-rowHeight},end:{x:M+C,y:y-rowHeight},thickness:.5,color:colors.line});y-=rowHeight;offset+=fit;
        if(offset<lineCount){newPage();tableHeader();}
      }
    });y-=14;
    const tax=publicData.tax,summary=[{label:'Nettobetrag',value:tax.net},...tax.groups.flatMap(group=>[...(tax.groups.length>1?[{label:'Nettobasis '+(group.code==='reverse'?'§ 13b':group.code==='small'||group.code==='exempt'?'steuerfrei':count(group.rate)+' %'),value:group.net}]:[]),{label:group.code==='reverse'?'Steuer schuldet Empfänger':group.code==='small'||group.code==='exempt'?'Steuerbefreit':'Umsatzsteuer '+count(group.rate)+' %',value:group.vat}]),{label:'Angebotssumme',value:tax.gross,final:true}];
    const boxHeight=summary.length*29+20;room(boxHeight+14);const x=M+C-340,rightEdge=M+C-12,top=y;
    page.drawRectangle({x,y:top-boxHeight,width:340,height:boxHeight,color:colors.pale});
    summary.forEach((row,index)=>{const at=top-23-index*29,font=row.final?bold:normal,labelSize=9.5;if(row.final)page.drawLine({start:{x:x+12,y:at+17},end:{x:rightEdge,y:at+17},thickness:1,color:colors.line});draw(row.label,x+12,at,labelSize,font,row.final?colors.teal:colors.ink);right(money(row.value/100),rightEdge,at,row.final?13:10.5,font,row.final?colors.teal:colors.ink,Math.max(70,340-38-font.widthOfTextAtSize(row.label,labelSize)));});
    y-=boxHeight+14;
    for(const note of tax.notes){heading('Steuerhinweis',65);text(note.text+'\nRechtsgrundlage: '+note.law+'\nAngabe des Ausstellers: '+note.detail,{size:9,gap:14});}
    if(offer.notes){heading('Hinweise',65);text(offer.notes,{size:9,gap:14});}
    text('Angebot - keine Rechnung. Die steuerliche Einordnung wurde vom Aussteller angegeben.',{size:8,color:colors.muted,gap:12});
    const pages=pdf.getPages();pages.forEach((sheet,index)=>{sheet.drawLine({start:{x:M,y:43},end:{x:W-M,y:43},thickness:.5,color:colors.line});sheet.drawText('Angebot - keine Rechnung',{x:M,y:29,size:8,font:normal,color:colors.muted});const pageLabel='Seite '+(index+1)+' / '+pages.length;sheet.drawText(pageLabel,{x:W-M-normal.widthOfTextAtSize(pageLabel,8),y:29,size:8,font:normal,color:colors.muted});});
    pdf.setTitle((publicData.kind==='fixed'?'Pauschalangebot ':'Angebot ')+safe(offer.offer_number));pdf.setAuthor(safe(data.company||'Geschäftskonto'));pdf.setCreator('Zeiterfassung Angebote v908');return pdf.save();
  }
  window.WorktimeOfferPdf={createOffer};
})();
