const release = new URL(self.location.href).searchParams.get('release')
const CACHE_PREFIX = 'olfactoryops-static-'
const CACHE_NAME = `${CACHE_PREFIX}${release || 'invalid'}`

function isVersionedStaticAsset(request, url) {
  return request.method === 'GET'
    && url.origin === self.location.origin
    && /\.(?:css|js|mjs|svg|png|jpe?g|webp|woff2?)$/i.test(url.pathname)
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) || key === 'olfactoryops-shell-v2')
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return
  }
  if (request.mode === 'navigate') {
    // Authentication navigation is always network-first. It deliberately has
    // no cache fallback, so a previous release can never resurrect its shell.
    event.respondWith(fetch(request, { cache: 'no-store' }))
    return
  }
  if (!isVersionedStaticAsset(request, url)) return
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone()
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
      }
      return response
    })),
  )
})
