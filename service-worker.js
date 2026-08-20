const CACHE_NAME = "arbeitszeit-neu-v108";
const APP_FILES = ["./", "./index.html", "./styles-new.css?v=103", "./styles-week.css?v=103", "./styles-104.css?v=104", "./app-new.js?v=108", "./config.js?v=1", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES))); self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))); self.clients.claim(); });
self.addEventListener("fetch", event => { if (event.request.method !== "GET") return; event.respondWith(fetch(event.request).then(response => { const copy=response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request,copy)); return response; }).catch(() => caches.match(event.request))); });
