const CACHE = 'arbeitszeit-neu-v863-1';
const FILES = ['./','./index.html','./styles-v700.css','./responsive-v701.css','./navigation-v710.css','./menu-v720.css','./calendar-v800.css?v=2','./home-v827.css?v=3','./signature-v828.css?v=2','./planned-orders-v855.css','./offers-v857.css?v=861','./material-units-v860.css','./vendor/pdf-lib-1.17.1.min.js','./planning-pdf.js?v=854','./documents-pdf-v857.js?v=861','./offers-v857.js?v=862.1','./app-v800.js?v=863','./receipt-pdf-v863-1.js','./device-features-v863.js?v=863.1','./device-features-v863.css?v=863.1','./config.js?v=600','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('arbeitszeit-neu-') && key !== CACHE).map(key => caches.delete(key))))); self.clients.claim(); });
// Never persist authenticated API responses, uploaded receipts or other firms'
// private data in a shared browser cache. Only same-origin public assets.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => { if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone())); return response; }).catch(() => caches.match(event.request).then(hit => hit || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
self.addEventListener('push',event=>{
  let payload={};try{payload=event.data?.json()||{};}catch{}
  event.waitUntil(self.registration.showNotification('Zeiterfassung',{body:payload.body||'Eine Terminerinnerung ist verfügbar. Bitte die App öffnen.',tag:payload.tag||'worktime-reminder',icon:new URL('./icon.svg',self.location.href).href,data:{view:'planning'}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=new URL('./?open=planning',self.location.href).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
    const client=clients.find(item=>item.url.startsWith(new URL('./',self.location.href).href));
    if(client){client.postMessage({type:'WORKTIME_OPEN_PLANNING'});return client.focus();}
    return self.clients.openWindow(url);
  }));
});
