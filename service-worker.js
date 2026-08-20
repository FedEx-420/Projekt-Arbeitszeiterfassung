const CACHE = 'arbeitszeit-rebuild-v201'
const FILES = ['./', './index.html', './styles-rebuild.css?v=201', './app-rebuild.js?v=201', './config.js?v=1', './manifest.webmanifest', './icon.svg']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const dynamic = event.request.mode === 'navigate' || ['script', 'style', 'document'].includes(event.request.destination)
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()))
    return response
  }).catch(() => dynamic ? caches.match('./index.html') : caches.match(event.request)))
})
