/* Planning PDF v854. Uses the locally bundled, pinned pdf-lib 1.17.1. */
(() => {
  'use strict';
  async function create(data) {
    if (!window.PDFLib) throw new Error('PDF-Modul nicht geladen. Bitte die App neu laden.');
    const {PDFDocument,StandardFonts,rgb} = window.PDFLib;
    const pdf = await PDFDocument.create();
    const normal = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const teal = rgb(.03,.36,.35), ink = rgb(.10,.20,.19), muted = rgb(.34,.43,.41), pale = rgb(.94,.97,.96);
    const safe = value => Array.from(String(value ?? '').normalize('NFC')).map(char => {
      if (char === '\n' || char === '\r') return ' ';
      try { normal.encodeText(char); return char; } catch { return '?'; }
    }).join('');
    const wrap = (value,width,size=10,font=normal) => {
      const lines=[], paragraphs=String(value ?? '').split(/\r?\n/);
      for (const paragraph of paragraphs) {
        let line='';
        for (const word of safe(paragraph).split(/\s+/)) {
          if (!word) continue;
          const candidate=line ? line+' '+word : word;
          if (font.widthOfTextAtSize(candidate,size)<=width) { line=candidate; continue; }
          if (line) lines.push(line);
          line='';
          for (const char of word) {
            if (font.widthOfTextAtSize(line+char,size)>width && line) { lines.push(line); line=''; }
            line+=char;
          }
        }
        lines.push(line);
      }
      return lines;
    };
    let logo=null;
    if (data.logoBytes) { try { logo=await pdf.embedJpg(data.logoBytes); } catch { /* Optional logo must not prevent a download. */ } }
    const width=595.28,height=841.89,margin=40,contentWidth=width-2*margin;
    let page,y,currentDay='';
    function text(value,x,baseline,size=10,font=normal,color=ink) { page.drawText(safe(value),{x,y:baseline,size,font,color}); }
    function newPage() {
      page=pdf.addPage([width,height]);
      page.drawRectangle({x:margin,y:height-143,width:contentWidth,height:103,color:teal});
      if (logo) {
        page.drawRectangle({x:margin+14,y:height-125,width:147,height:67,color:rgb(1,1,1)});
        const scale=Math.min(137/logo.width,57/logo.height),w=logo.width*scale,h=logo.height*scale;
        page.drawImage(logo,{x:margin+14+(147-w)/2,y:height-125+(67-h)/2,width:w,height:h});
      } else text('PLAN',margin+16,height-94,24,bold,rgb(1,1,1));
      const titleX=margin+177;
      text('Planungsübersicht',titleX,height-75,20,bold,rgb(1,1,1));
      const companyLines=wrap(data.company,contentWidth-192,11,bold).slice(0,2);
      companyLines.forEach((line,index)=>text(line,titleX,height-95-index*14,11,bold,rgb(1,1,1)));
      text(data.rangeLabel,margin,height-164,10,bold);
      text('Nur veröffentlichte Planungen · Stand '+data.generatedLabel,margin,height-180,8,normal,muted);
      y=height-203;
      if (currentDay) {text(currentDay+' (Fortsetzung)',margin,y,9,bold,muted);y-=22;}
    }
    function room(size) { if (y-size<60) newPage(); }
    function lines(value,{size=10,font=normal,color=ink,indent=0,gap=14}={}) {
      for (const line of wrap(value,contentWidth-indent,size,font)) { room(gap);text(line,margin+indent,y,size,font,color);y-=gap; }
    }
    newPage();
    lines(data.summary,{size:11,font:bold,color:teal,gap:17});
    lines(data.peopleLabel,{size:9,color:muted,gap:13});y-=8;
    let currentMonth='';
    for (const day of data.days) {
      currentDay='';
      const orderSize=order=>8+wrap(order.time+'  |  '+order.customer,contentWidth-9,11,bold).length*15+wrap(order.title,contentWidth-9,10,bold).length*14+wrap('Team: '+order.people,contentWidth-9,9).length*13+wrap(order.status+' · Priorität: '+order.priority,contentWidth-9,8).length*12+(order.address?wrap('Einsatzort: '+order.address,contentWidth-9,9).length*13:0)+(order.details?wrap('Hinweise: '+order.details,contentWidth-9,9).length*13:0)+(order.actual?wrap('Tatsächliche Ausführung: '+order.actual,contentWidth-9,9).length*13:0);
      const daySize=34+(day.holiday?13:0)+day.absences.length*13+(day.orders.length?day.orders.reduce((sum,order)=>sum+orderSize(order),0):13);
      const reserve=Math.min(daySize,height-270);
      if (day.monthLabel!==currentMonth) {
        currentMonth=day.monthLabel;room(Math.min(reserve+34,height-270));y-=6;
        lines(currentMonth,{size:15,font:bold,color:teal,gap:22});
      }
      room(reserve);currentDay=day.label;
      page.drawRectangle({x:margin,y:y-5,width:contentWidth,height:23,color:pale});
      text(day.label,margin+9,y+2,10,bold);y-=24;
      if (day.holiday) lines('Feiertag NRW: '+day.holiday,{size:9,color:muted,indent:9,gap:13});
      for (const absence of day.absences) lines(absence,{size:9,color:muted,indent:9,gap:13});
      if (!day.orders.length) lines('Keine Aufträge geplant.',{size:9,color:muted,indent:9,gap:13});
      for (const order of day.orders) {
        room(Math.min(orderSize(order),height-280));y-=4;
        lines(order.time+'  |  '+order.customer,{size:11,font:bold,color:teal,indent:9,gap:15});
        lines(order.title,{size:10,font:bold,indent:9,gap:14});
        lines('Team: '+order.people,{size:9,indent:9,gap:13});
        lines(order.status+' · Priorität: '+order.priority,{size:8,color:muted,indent:9,gap:12});
        if (order.address) lines('Einsatzort: '+order.address,{size:9,indent:9,gap:13});
        if (order.details) lines('Hinweise: '+order.details,{size:9,indent:9,gap:13});
        if (order.actual) lines('Tatsächliche Ausführung: '+order.actual,{size:9,indent:9,gap:13});
        y-=8;
      }
      y-=10;
    }
    const pages=pdf.getPages();
    pages.forEach((sheet,index)=>{
      sheet.drawLine({start:{x:margin,y:43},end:{x:width-margin,y:43},thickness:.6,color:rgb(.80,.87,.85)});
      sheet.drawText(safe('Planung - keine Stundenbuchung / Rechnung'),{x:margin,y:29,size:8,font:normal,color:muted});
      const label=`Seite ${index+1} / ${pages.length}`;
      sheet.drawText(label,{x:width-margin-normal.widthOfTextAtSize(label,8),y:29,size:8,font:normal,color:muted});
    });
    pdf.setTitle('Planungsübersicht '+data.rangeLabel);pdf.setAuthor(safe(data.company));pdf.setCreator('Zeiterfassung v854');
    return pdf.save();
  }
  window.PlanningPdf={create};
})();
