/* Actual PDF pages and precomputed files. No new window, HTML invoice reflow or server upload. */
(() => {
  'use strict';
  let active=null,readerPromise=null;
  const safeName=value=>String(value||'Dokument.pdf').replace(/[<>:"/\\|?*\u0000-\u001F]/g,'_');
  function canShareFile(file,nav=navigator){try{return !!file&&typeof nav.share==='function'&&typeof nav.canShare==='function'&&nav.canShare({files:[file]});}catch{return false;}}
  function shareFile(file,title,nav=navigator){
    if(!canShareFile(file,nav))throw new Error('Dateifreigabe ist in diesem Browser nicht verfügbar. Bitte PDF herunterladen oder öffnen.');
    // File is prepared before this handler runs: do not await rendering/fetching before share().
    return nav.share({files:[file],title});
  }
  function reader(){return readerPromise||=import('./vendor/pdfjs-6.4.299/pdf.mjs').then(api=>{api.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs-6.4.299/pdf.worker.mjs',document.baseURI).href;return api;}).catch(error=>{readerPromise=null;throw error;});}
  function open({title='Dokumentvorschau',filename='Dokument.pdf',createBytes,bytes,note=''}){
    active?.close();
    const priorFocus=document.activeElement,dialog=document.createElement('dialog');dialog.className='pdf-viewer-dialog';dialog.setAttribute('aria-label',title);
    dialog.innerHTML='<header class="pdf-viewer-toolbar"><div class="pdf-viewer-heading"><h2></h2><p data-pdf-note></p></div><div class="pdf-viewer-actions"><button type="button" data-pdf-close>Schließen</button><a data-pdf-download aria-disabled="true">PDF herunterladen</a><button type="button" data-pdf-share disabled>Teilen / Drucken</button><button type="button" data-pdf-desktop-print disabled hidden>Drucken</button></div><p role="status" data-pdf-status>PDF wird vorbereitet …</p></header><div class="pdf-viewer-pages" tabindex="0" aria-label="PDF-Seiten"></div>';
    const select=s=>dialog.querySelector(s),pages=select('.pdf-viewer-pages'),status=select('[data-pdf-status]'),download=select('[data-pdf-download]'),share=select('[data-pdf-share]'),print=select('[data-pdf-desktop-print]');
    select('h2').textContent=title;select('[data-pdf-note]').textContent=note;
    const job={actualPdf:true,dialog,url:null,file:null,closed:false,pdf:null,task:null,renderTask:null,ready:null,close(){if(job.closed)return;job.closed=true;job.renderTask?.cancel();job.task?.destroy();if(job.url)URL.revokeObjectURL(job.url);if(dialog.open)dialog.close();dialog.remove();if(active===job)active=null;priorFocus?.focus?.();},setNote(text){select('[data-pdf-note]').textContent=text;}};
    active=job;
    select('[data-pdf-close]').addEventListener('click',()=>job.close());dialog.addEventListener('cancel',event=>{event.preventDefault();job.close();});
    download.addEventListener('click',event=>{if(!job.file){event.preventDefault();return;}status.textContent='PDF wird an das Gerät übergeben. Auf dem iPhone kannst du sie auch über Teilen in Dateien speichern.';});
    share.addEventListener('click',()=>{
      if(!job.file)return;
      if(!canShareFile(job.file)){download.click();return;}
      try{const request=shareFile(job.file,title);request.then(()=>{if(!job.closed)status.textContent='PDF an die gewählte Aktion übergeben.';}).catch(error=>{if(!job.closed)status.textContent=error.name==='AbortError'?'Teilen wurde abgebrochen. Die PDF bleibt verfügbar.':'Teilen konnte nicht geöffnet werden. Bitte PDF herunterladen oder öffnen.';});}
      catch(error){status.textContent=error.message;}
    });
    print.addEventListener('click',()=>{try{window.print();}catch{status.textContent='Bitte die PDF herunterladen und im PDF-Programm drucken.';}});
    document.body.append(dialog);dialog.showModal();select('[data-pdf-close]').focus();
    job.ready=(async()=>{
      try{
        const result=bytes||await createBytes();if(job.closed)return;
        const raw=result instanceof Uint8Array?result:new Uint8Array(result);if(raw.length<5||String.fromCharCode(...raw.slice(0,5))!=='%PDF-')throw new Error('Es wurde keine gültige PDF-Datei erstellt.');
        job.file=new File([raw],safeName(filename),{type:'application/pdf'});job.url=URL.createObjectURL(job.file);
        download.href=job.url;download.download=job.file.name;download.target='_blank';download.rel='noopener';download.removeAttribute('aria-disabled');
        share.disabled=false;if(!canShareFile(job.file))share.textContent='PDF öffnen';
        status.textContent='PDF ist bereit. Die Vorschau wird geladen …';
        const api=await reader();if(job.closed)return;
        job.task=api.getDocument({data:raw.slice(),isEvalSupported:false,standardFontDataUrl:new URL('./vendor/pdfjs-6.4.299/standard_fonts/',document.baseURI).href,useSystemFonts:false});
        const pdf=await job.task.promise;job.pdf=pdf;if(job.closed)return;
        for(let index=1;index<=pdf.numPages;index++){
          if(job.closed)return;const page=await pdf.getPage(index),base=page.getViewport({scale:1}),figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');
          figure.className='pdf-viewer-page';canvas.setAttribute('aria-label','Seite '+index+' von '+pdf.numPages);caption.textContent='Seite '+index+' / '+pdf.numPages;figure.append(canvas,caption);pages.append(figure);
          const width=Math.min(800,Math.max(240,pages.clientWidth-32)),pixelRatio=Math.min(1.5,window.devicePixelRatio||1),viewport=page.getViewport({scale:width/base.width*pixelRatio});
          canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.style.aspectRatio=base.width+' / '+base.height;
          job.renderTask=page.render({canvas,canvasContext:canvas.getContext('2d'),viewport});await job.renderTask.promise;job.renderTask=null;page.cleanup();
        }
        if(job.closed)return;status.textContent=pdf.numPages+' PDF-Seite(n) · Download und Vorschau enthalten dieselbe Datei.';
        const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);print.hidden=ios;print.disabled=false;
      }catch(error){if(job.closed)return;status.textContent=job.file?'Die PDF ist fertig, aber die Bildschirmvorschau konnte nicht geladen werden. Du kannst sie herunterladen oder öffnen.':error.message||'PDF konnte nicht erstellt werden.';}
    })();
    return job;
  }
  window.WorktimePdfViewer={open,canShareFile,shareFile,close:()=>active?.close()};
})();
