// ── PedagIA PWA — Service Worker (Next.js) ─────────────────
const CACHE = 'pedagia-v18';
const CDN_CACHE = 'pedagia-cdn-v4';

const PRECACHE = [
  '/',
  '/pedagia-cloud.js',
  '/manifest.json',
  '/icons/icon.svg',
];

const CDN_HOSTS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

const PASSTHROUGH_HOSTS = [
  'supabase.co',
  'supabase.io',
  'openrouter.ai',
];

function isCacheableRequest(request) {
  return request.method === 'GET';
}

function shouldSkipFetch(request) {
  const url = new URL(request.url);
  if (PASSTHROUGH_HOSTS.some(h => url.hostname.includes(h))) return true;
  if (url.pathname.startsWith('/api/')) return true;
  if (url.pathname.startsWith('/_next/')) return true;
  if (url.search.includes('_rsc=')) return true;
  return false;
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE && k !== CDN_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (!isCacheableRequest(request)) return;

  const url = new URL(request.url);
  if (shouldSkipFetch(request)) return;

  if (CDN_HOSTS.some(h => url.hostname.includes(h))) {
    event.respondWith(
      caches.open(CDN_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok && isCacheableRequest(request)) {
              cache.put(request, response.clone());
            }
            return response;
          });
        })
      )
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/') || caches.match(request))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && isCacheableRequest(request)) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
