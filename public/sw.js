// ── Gerador de Provas PWA — Service Worker ──────────────────
const CACHE   = 'provas-ia-v3';   // bump para forçar atualização
const APP_URL = '/';

// Assets to pre-cache on install
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon.svg',
];

// External CDN libs to cache on first fetch
const CDN_CACHE = 'provas-ia-cdn-v3';
const CDN_HOSTS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// Hosts que NUNCA devem ser interceptados pelo SW
// (re-fetch cross-origin pelo SW causa ERR_FAILED em alguns browsers)
const PASSTHROUGH_HOSTS = [
  'supabase.co',
  'supabase.io',
  'openrouter.ai',
];

// ── Install: pre-cache app shell ─────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ──────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE && k !== CDN_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch strategy ────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Hosts externos críticos (Supabase, OpenRouter) → NÃO interceptar.
  //    Deixar o browser resolver diretamente evita ERR_FAILED em re-fetch cross-origin.
  if (PASSTHROUGH_HOSTS.some(h => url.hostname.includes(h))) {
    return; // sem event.respondWith → browser resolve nativamente
  }

  // 2. Chamadas à nossa API → sempre rede, nunca cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // 3. CDN assets → cache-first (serve fast, cache on first load)
  if (CDN_HOSTS.some(h => url.hostname.includes(h))) {
    event.respondWith(
      caches.open(CDN_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // 4. App shell → network-first, fallback to cache
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match('/')))
  );
});

// ── Push notification placeholder (future use) ───────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
