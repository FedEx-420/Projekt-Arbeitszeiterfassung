const CACHE = 'worktime-v1013';
const FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./help-topics-v900.js?v=907",
  "./styles-v700.css",
  "./responsive-v701.css",
  "./navigation-v710.css",
  "./menu-v720.css",
  "./calendar-v800.css?v=2",
  "./home-v827.css?v=3",
  "./signature-v828.css?v=2",
  "./planned-orders-v855.css",
  "./material-units-v860.css",
  "./presentation-v900.css",
  "./navigation-v901.css",
  "./safe-area-v902.css",
  "./pdf-viewer-v904.css",
  "./klarwerk-theme-v1000.css?v=1000",
  "./neutral-theme-v1002.css?v=1002",
  "./config.js?v=875",
  "./vendor/pdf-lib-1.17.1.min.js",
  "./planning-pdf.js?v=854",
  "./documents-pdf-v857.js?v=984",
  "./pdf-viewer-v904.js",
  "./navigation-v901.js?v=1011",
  "./business-rules-v908.js",
  "./catalog-classify-v925.js",
  "./app-flow-v928.js?v=947",
  "./article-search-v947.js?v=999",
  "./product-identity-v954.js?v=955",
  "./catalog-products-v921.js?v=954",
  "./german-products-v936.js?v=984",
  "./klarwerk-theme-v1000.js?v=1000",
  "./klarwerk-connection-v1007.js?v=1013",
  "./app-v800.js?v=1013",
  "./guidance-v900.js?v=907",
  "./vendor/pdfjs-6.4.299/pdf.mjs",
  "./vendor/pdfjs-6.4.299/pdf.worker.mjs"
];

self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => (key.startsWith('arbeitszeit-neu-') || key.startsWith('worktime-v')) && key !== CACHE).map(key => caches.delete(key))))); self.clients.claim(); });
// Never persist authenticated API responses, uploaded receipts or other firms'
// private data in a shared browser cache. Only same-origin public assets.
self.addEventListener('fetch', event => {
  const requestUrl=new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin || !['http:','https:'].includes(requestUrl.protocol)) return;
  event.respondWith(fetch(event.request).then(response => { if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone())); return response; }).catch(() => caches.match(event.request).then(hit => hit || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
