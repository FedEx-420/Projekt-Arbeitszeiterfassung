const CACHE = 'arbeitszeit-neu-v824';
const FILES = ['./','./index.html','./styles-v700.css','./responsive-v701.css','./navigation-v710.css','./menu-v720.css','./calendar-v800.css?v=2','./app-v800.js?v=824','./config.js?v=600','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))); self.clients.claim(); });
self.addEventListener('fetch', event => { if (event.request.method !== 'GET') return; event.respondWith(fetch(event.request).then(response => { if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone())); return response; }).catch(() => caches.match(event.request).then(hit => hit || caches.match('./index.html')))); });

