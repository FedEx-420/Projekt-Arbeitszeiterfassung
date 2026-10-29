const CACHE = 'arbeitszeit-neu-v935';
const FILES = ['./','./index.html','./styles-v700.css','./responsive-v701.css','./navigation-v710.css','./menu-v720.css','./calendar-v800.css?v=2','./home-v827.css?v=3','./signature-v828.css?v=2','./planned-orders-v855.css','./offers-v857.css?v=908','./material-units-v860.css','./vendor/pdf-lib-1.17.1.min.js','./planning-pdf.js?v=854','./documents-pdf-v857.js?v=908','./offers-v857.js?v=908','./app-v800.js?v=908','./receipt-pdf-v863-1.js','./arrival-timer-v865.js?v=875','./iphone-shortcuts-v870.js','./iphone-shortcuts-v870.css','./owntracks-v871.js?v=908','./owntracks-v871.css?v=906','./device-features-v863.js?v=908','./device-features-v863.css?v=873','./config.js?v=875','./manifest.webmanifest','./icon.svg'];
FILES.push('./presentation-v900.css','./platform-v900.js','./guidance-v900.js?v=907','./help-topics-v900.js','./navigation-v901.js?v=908','./navigation-v901.css');
FILES.push('./legal-templates-v900.js','./legal-v900.js');
FILES.push('./safe-area-v902.css');
FILES.push('./datev-format-v907.js','./datev-v907.js','./datev-v907.css','./help-topics-v900.js?v=907');
FILES.push('./billing-selection-v906.js','./billing-selection-v906.css','./business-readiness-v906.js','./business-readiness-v906.css','./legal-v900.js?v=906');
FILES.push('./business-rules-v908.js','./business-v908.js','./business-v908.css','./mailbox-rules-v908.js','./mailbox-v908.js','./mailbox-v908.css','./catalog-format-v908.js','./catalog-ui-v908.js','./catalog-ui-v908.css','./invoice-ledger-ui-v908.js','./invoice-ledger-ui-v908.css','./offer-model-v908.js','./offer-pdf-v908.js');
FILES.push('./invoice-tax-v905.js','./invoice-tax-v905.css','./pdf-viewer-v904.js','./pdf-viewer-v904.css','./vendor/pdfjs-6.4.299/pdf.mjs','./vendor/pdfjs-6.4.299/pdf.worker.mjs');
FILES.push(...['LiberationSans-Regular.ttf','LiberationSans-Bold.ttf','LiberationSans-Italic.ttf','LiberationSans-BoldItalic.ttf'].map(name=>'./vendor/pdfjs-6.4.299/standard_fonts/'+name));
// Keep the previous shared assets, but cache the exact v909 invoice entry points.
for(let index=0;index<FILES.length;index++){
  const file=FILES[index];
  if(/^\.\/(app-v800|invoice-tax-v905|legal-v900|invoice-ledger-ui-v908)\.js(?:\?.*)?$/.test(file))FILES[index]=file.replace(/\?.*$/,'')+'?v=909';
}
FILES.push('./catalog-import-v909.js?v=920','./catalog-import-ui-v910.js?v=920');
for(let index=0;index<FILES.length;index++)if(/^\.\/(app-v800|offers-v857|offer-model-v908|catalog-ui-v908)\.(js|css)(?:\?.*)?$/.test(FILES[index]))FILES[index]=FILES[index].replace(/\?.*$/,'')+'?v=910';
for(let index=0;index<FILES.length;index++)if(/^\.\/catalog-ui-v908\.css(?:\?.*)?$/.test(FILES[index]))FILES[index]='./catalog-ui-v908.css?v=920';
for(let index=0;index<FILES.length;index++)if(/^\.\/catalog-ui-v908\.js(?:\?.*)?$/.test(FILES[index]))FILES[index]='./catalog-ui-v908.js?v=920';
for(let index=0;index<FILES.length;index++)if(FILES[index].includes('invoice-ledger-ui-v908.'))FILES[index]=FILES[index].replace(/\?.*$/,'')+'?v=920';
FILES.push('./catalog-products-v921.js');
for(let index=0;index<FILES.length;index++)if(/^\.\/(catalog-format-v908|catalog-import-v909|catalog-import-ui-v910|catalog-ui-v908)\.js(?:\?.*)?$/.test(FILES[index]))FILES[index]=FILES[index].replace(/\?.*$/,'')+'?v=921';
for(let index=0;index<FILES.length;index++)if(/^\.\/(offers-v857|invoice-ledger-ui-v908)\.js(?:\?.*)?$/.test(FILES[index]))FILES[index]=FILES[index].replace(/\?.*$/,'')+'?v=922';
for(let index=0;index<FILES.length;index++)if(/^\.\/catalog-ui-v908\.css(?:\?.*)?$/.test(FILES[index]))FILES[index]='./catalog-ui-v908.css?v=922';
for(let index=0;index<FILES.length;index++)if(/^\.\/(catalog-import-ui-v910|catalog-ui-v908)\.(js|css)(?:\?.*)?$/.test(FILES[index]))FILES[index]=FILES[index].replace(/\?.*$/,'')+'?v=923';
for(let index=0;index<FILES.length;index++)if(/^\.\/(catalog-format-v908|catalog-import-ui-v910)\.js(?:\?.*)?$/.test(FILES[index])||/^\.\/catalog-ui-v908\.css(?:\?.*)?$/.test(FILES[index]))FILES[index]=FILES[index].replace(/\?.*$/,'')+'?v=924';
FILES.push('./catalog-classify-v925.js','./catalog-management-v925.js');
for(let index=0;index<FILES.length;index++)if(/^\.\/(catalog-import-v909|catalog-import-ui-v910|catalog-ui-v908|catalog-products-v921)\.(js|css)(?:\?.*)?$/.test(FILES[index]))FILES[index]=FILES[index].replace(/\?.*$/,'')+'?v=925';
FILES.push('./material-browser-v926.js');
for(let index=0;index<FILES.length;index++)if(/^\.\/(app-v800|catalog-import-ui-v910|catalog-ui-v908)\.(js|css)(?:\?.*)?$/.test(FILES[index]))FILES[index]=FILES[index].replace(/\?.*$/,'')+'?v=926';
FILES.push('./product-features-v928.js','./app-flow-v928.js');
for(let index=0;index<FILES.length;index++)if(/^\.\/(app-v800|material-browser-v926|catalog-import-v909|catalog-import-ui-v910|catalog-ui-v908)\.(js|css)(?:\?.*)?$/.test(FILES[index]))FILES[index]=FILES[index].replace(/\?.*$/,'')+'?v=928';
for(let index=0;index<FILES.length;index++)if(/^\.\/(product-features-v928|material-browser-v926|catalog-import-ui-v910)\.js(?:\?.*)?$/.test(FILES[index]))FILES[index]=FILES[index].replace(/\?.*$/,'')+'?v=929';
FILES.push('./product-display-v930.js?v=933','./catalog-image-index.json');
for(let i=0;i<FILES.length;i++)if(/^\.\/(product-features-v928|material-browser-v926|catalog-products-v921|catalog-import-ui-v910)\.js(?:\?.*)?$/.test(FILES[i])||/^\.\/catalog-ui-v908\.css(?:\?.*)?$/.test(FILES[i]))FILES[i]=FILES[i].replace(/\?.*$/,'')+'?v=930';
for(let i=0;i<FILES.length;i++)if(/^\.\/(catalog-import-v909|catalog-import-ui-v910)\.js(?:\?.*)?$/.test(FILES[i]))FILES[i]=FILES[i].replace(/\?.*$/,'')+'?v=931';
for(let i=0;i<FILES.length;i++)if(/^\.\/catalog-import-ui-v910\.js(?:\?.*)?$/.test(FILES[i]))FILES[i]='./catalog-import-ui-v910.js?v=932';
FILES.push('./catalog-store-v933.js?v=933','./catalog-workflow-v933.js?v=933');
for(let i=0;i<FILES.length;i++)if(/^\.\/(app-v800|catalog-import-v909|catalog-ui-v908|navigation-v901)\.(js|css)(?:\?.*)?$/.test(FILES[i]))FILES[i]=FILES[i].startsWith('./app-v800.js')?'./app-v800.js?v=933':FILES[i].replace(/\?.*$/,'')+'?v=933';
// Keep the exact unversioned stylesheet URL used by the current HTML offline.
FILES.push('./navigation-v901.css');
FILES.push('./open-order-tools-v934.js?v=934');
for(let i=0;i<FILES.length;i++)if(/^\.\/app-v800\.js(?:\?.*)?$/.test(FILES[i]))FILES[i]='./app-v800.js?v=934';else if(/^\.\/billing-selection-v906\.js(?:\?.*)?$/.test(FILES[i]))FILES[i]='./billing-selection-v906.js?v=934';
for(let i=0;i<FILES.length;i++)if(/^\.\/invoice-ledger-ui-v908\.js(?:\?.*)?$/.test(FILES[i]))FILES[i]='./invoice-ledger-ui-v908.js?v=934';
for(let i=0;i<FILES.length;i++)if(/^\.\/product-features-v928\.js(?:\?.*)?$/.test(FILES[i]))FILES[i]='./product-features-v928.js?v=934';
for(let i=0;i<FILES.length;i++)if(/^\.\/(product-features-v928|material-browser-v926|catalog-products-v921)\.js(?:\?.*)?$/.test(FILES[i]))FILES[i]=FILES[i].replace(/\?.*$/,'')+'?v=935';
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('arbeitszeit-neu-') && key !== CACHE).map(key => caches.delete(key))))); self.clients.claim(); });
// Never persist authenticated API responses, uploaded receipts or other firms'
// private data in a shared browser cache. Only same-origin public assets.
self.addEventListener('fetch', event => {
  const requestUrl=new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin || !['http:','https:'].includes(requestUrl.protocol)) return;
  event.respondWith(fetch(event.request).then(response => { if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone())); return response; }).catch(() => caches.match(event.request).then(hit => hit || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
self.addEventListener('push',event=>{
  let payload={};try{payload=event.data?.json()||{};}catch{}
  event.waitUntil(self.registration.showNotification('Zeiterfassung',{body:payload.body||'Eine Terminerinnerung ist verfügbar. Bitte die App öffnen.',tag:payload.tag||'worktime-reminder',icon:new URL('./icon.svg',self.location.href).href,data:{view:payload.data?.view==='home'?'home':'planning'}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const view=event.notification.data?.view==='home'?'home':'planning';
  const url=new URL('./?open='+view,self.location.href).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
    const client=clients.find(item=>item.url.startsWith(new URL('./',self.location.href).href));
    if(client){client.postMessage({type:view==='home'?'WORKTIME_OPEN_VIEW':'WORKTIME_OPEN_PLANNING',view});return client.focus();}
    return self.clients.openWindow(url);
  }));
});
