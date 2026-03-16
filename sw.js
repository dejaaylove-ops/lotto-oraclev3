const CACHE_NAME = 'lottery-oracle-v3';
const STATIC_CACHE = 'oracle-static-v3';
const DATA_CACHE = 'oracle-data-v3';

const STATIC_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;700;800&display=swap'
];

// Install: pre-cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { mode: 'no-cors' })));
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== STATIC_CACHE && k !== DATA_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - EuroMillions API → Network first, fallback to cache
// - Google Fonts / CDN → Cache first
// - App shell → Cache first, fallback to network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // EuroMillions API: network first
  if (url.hostname.includes('pedromealha') || url.pathname.includes('/draws')) {
    event.respondWith(networkFirstStrategy(event.request, DATA_CACHE, 60 * 60 * 1000));
    return;
  }

  // CDN resources: cache first
  if (url.hostname.includes('jsdelivr') || url.hostname.includes('fonts.g')) {
    event.respondWith(cacheFirstStrategy(event.request, STATIC_CACHE));
    return;
  }

  // App shell: cache first
  event.respondWith(cacheFirstStrategy(event.request, STATIC_CACHE));
});

async function networkFirstStrategy(request, cacheName, maxAge) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      const headers = new Headers(copy.headers);
      headers.append('sw-fetched-on', Date.now());
      const body = await copy.blob();
      cache.put(request, new Response(body, { status: copy.status, headers }));
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline', draws: [] }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function cacheFirstStrategy(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
  }
}

// Push notifications
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Lottery Oracle', {
      body: data.body || 'Your lucky numbers are ready!',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'oracle-notification',
      renotify: true,
      data: data.url || '/'
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data));
});
