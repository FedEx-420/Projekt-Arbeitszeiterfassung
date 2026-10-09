/* Local receipt PDF reading. No viewer navigation, scripting or remote OCR. */
(() => {
  'use strict';
  const VERSION='6.4.299',MAX_PAGES=20,MAX_BYTES=20*1024*1024,MAX_TEXT=30000;
  let library;
  const isPdf=file=>file?.type==='application/pdf'||/\.pdf$/i.test(file?.name||'');
  function validateFile(file){
    if(!file)throw Error('Bitte zuerst ein Foto oder eine PDF-Datei auswählen.');
    if(isPdf(file)){if(file.size>MAX_BYTES)throw Error('Die PDF darf höchstens 20 MB groß sein.');}
    else{if(!file.type?.startsWith('image/'))throw Error('Bitte ein Foto oder eine PDF-Datei auswählen.');if(file.size>12*1024*1024)throw Error('Das Foto darf höchstens 12 MB groß sein.');}
  }
  async function getLibrary(){
    if(!library)library=import('./vendor/pdfjs-6.4.299/pdf.mjs').then(module=>{
      module.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs-6.4.299/pdf.worker.mjs',location.href).href;return module;
    }).catch(()=>{library=null;throw Error('Die PDF-Verarbeitung konnte nicht geladen werden. Bitte die Verbindung prüfen.');});
    return library;
  }
  function linesFromContent(content){
    const lines=[];
    for(const item of content.items){
      if(!item.str?.trim())continue;
      const y=item.transform[5],x=item.transform[4],tolerance=Math.max(2,Math.min(5,(item.height||10)*.25));
      let line=lines.find(row=>Math.abs(row.y-y)<=tolerance);
      if(!line){line={y,items:[]};lines.push(line);}
      line.items.push({x,text:item.str});
    }
    return lines.sort((a,b)=>b.y-a.y).map(line=>line.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join(' ')).join('\n');
  }
  async function raster(page,maxSide=2400,maxPixels=3500000){
    const original=page.getViewport({scale:1});
    const scale=Math.min(3,maxSide/Math.max(original.width,original.height),Math.sqrt(maxPixels/(original.width*original.height)));
    const viewport=page.getViewport({scale}),canvas=document.createElement('canvas');
    canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport,annotationMode:0,background:'rgb(255,255,255)'}).promise;
    return canvas;
  }
  async function read(file,{recognizeImage,onProgress=()=>{},onPreview=()=>{},forceOcr=false}={}){
    validateFile(file);
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(!new TextDecoder('latin1').decode(bytes.subarray(0,1024)).includes('%PDF-'))throw Error('Diese Datei ist keine lesbare PDF. Bitte eine andere PDF auswählen.');
    const pdfjs=await getLibrary(),assets=new URL('./vendor/pdfjs-6.4.299/',location.href);
    const task=pdfjs.getDocument({data:bytes,cMapUrl:new URL('cmaps/',assets).href,cMapPacked:true,standardFontDataUrl:new URL('standard_fonts/',assets).href,wasmUrl:new URL('wasm/',assets).href,isEvalSupported:false,disableAutoFetch:true,disableStream:true});
    try{
      const document=await task.promise;
      if(document.numPages>MAX_PAGES)throw Error('Diese PDF hat '+document.numPages+' Seiten. Bitte in Belege mit höchstens 20 Seiten aufteilen.');
      const texts=[];let ocrPages=0,totalLength=0;
      for(let number=1;number<=document.numPages;number++){
        onProgress('PDF: Seite '+number+' von '+document.numPages+' wird geprüft …');
        const page=await document.getPage(number);let canvas;
        try{
          const text=linesFromContent(await page.getTextContent());
          const readable=!forceOcr&&text.trim().length>=25&&/\d[,.]\d{2}\b/.test(text)&&/[a-zäöüß]/i.test(text);
          if(number===1||!readable)canvas=await raster(page);
          if(number===1)onPreview(canvas,document.numPages);
          let recognized=text;
          if(!readable){
            if(!recognizeImage)throw Error('Die PDF enthält gescannte Seiten. Die Texterkennung ist noch nicht verfügbar.');
            onProgress('PDF: Seite '+number+' von '+document.numPages+' per Texterkennung lesen …');
            recognized=await recognizeImage(canvas,number,document.numPages);ocrPages++;
          }
          totalLength+=recognized.length+1;
          if(totalLength>MAX_TEXT)throw Error('Diese PDF enthält zu viel Text für einen Beleg. Bitte in kleinere PDF-Dateien aufteilen.');
          texts.push(recognized);
        }finally{if(canvas){canvas.width=0;canvas.height=0;}page.cleanup();}
      }
      return {text:texts.join('\n'),pages:document.numPages,ocrPages};
    }catch(error){
      if(error.name==='PasswordException')throw Error('Die PDF ist passwortgeschützt. Bitte zuerst eine entsperrte Kopie auf deinem Gerät erstellen.');
      if(error.name==='InvalidPDFException'||error.name==='MissingPDFException')throw Error('Diese PDF konnte nicht gelesen werden. Bitte eine andere Datei auswählen.');
      throw error;
    }finally{await task.destroy();}
  }
  window.WorktimeReceiptPdf={read,isPdf,validateFile,linesFromContent,version:VERSION};
})();
