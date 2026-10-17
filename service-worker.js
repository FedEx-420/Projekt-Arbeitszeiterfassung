const CACHE = 'arbeitszeit-neu-v907';
const FILES = ['./','./index.html','./styles-v700.css','./responsive-v701.css','./navigation-v710.css','./menu-v720.css','./calendar-v800.css?v=2','./home-v827.css?v=3','./signature-v828.css?v=2','./planned-orders-v855.css','./offers-v857.css?v=861','./material-units-v860.css','./vendor/pdf-lib-1.17.1.min.js','./planning-pdf.js?v=854','./documents-pdf-v857.js?v=861','./offers-v857.js?v=862.1','./app-v800.js?v=875','./receipt-pdf-v863-1.js','./arrival-timer-v865.js?v=875','./iphone-shortcuts-v870.js','./iphone-shortcuts-v870.css','./owntracks-v871.js?v=874','./owntracks-v871.css?v=874','./device-features-v863.js?v=873','./device-features-v863.css?v=873','./config.js?v=875','./manifest.webmanifest','./icon.svg'];
FILES.push('./presentation-v900.css','./platform-v900.js','./guidance-v900.js','./help-topics-v900.js','./app-v800.js?v=905','./navigation-v901.js','./navigation-v901.css');
FILES.push('./legal-templates-v900.js','./legal-v900.js');
FILES.push('./safe-area-v902.css');
FILES.push('./datev-format-v907.js','./datev-v907.js','./datev-v907.css','./navigation-v901.js?v=907','./guidance-v900.js?v=907','./help-topics-v900.js?v=907','./app-v800.js?v=907');
FILES.push('./app-v800.js?v=906','./billing-selection-v906.js','./billing-selection-v906.css','./business-readiness-v906.js','./business-readiness-v906.css','./legal-v900.js?v=906','./owntracks-v871.js?v=906','./owntracks-v871.css?v=906','./device-features-v863.js?v=906');
FILES.push('./invoice-tax-v905.js','./invoice-tax-v905.css','./documents-pdf-v857.js?v=905','./pdf-viewer-v904.js','./pdf-viewer-v904.css','./vendor/pdfjs-6.4.299/pdf.mjs','./vendor/pdfjs-6.4.299/pdf.worker.mjs');
FILES.push(...['LiberationSans-Regular.ttf','LiberationSans-Bold.ttf','LiberationSans-Italic.ttf','LiberationSans-BoldItalic.ttf'].map(name=>'./vendor/pdfjs-6.4.299/standard_fonts/'+name));
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
