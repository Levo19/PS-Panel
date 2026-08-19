// ============================================================
// PS Panel — Service Worker
// Bumpa VERSION en cada deploy para invalidar caché
// ============================================================
const VERSION = '2.20.0';
const CACHE   = 'ps-panel-v' + VERSION;
const ASSETS  = [
  './',
  './index.html',
  './ticket.html',
  './manifest.json',
  './version.json',
  './logo.png',
  'https://unpkg.com/vue@3.4.21/dist/vue.global.prod.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', e => {
  self.skipWaiting();   // el SW nuevo (correcto) desaloja al viejo bugueado de inmediato
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(url => new Request(url, { cache: 'no-store' }))))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // API de Supabase (REST/RPC/auth/storage): SIEMPRE red, NUNCA caché.
  // Antes caía en el cache-first de abajo → las lecturas (contactos, etc.) devolvían
  // lista vieja y un alta nueva "no aparecía" hasta el próximo deploy. Nunca más.
  // API dinámica de Supabase (REST/RPC/auth/functions) SIEMPRE a red, NUNCA caché. Pero las imágenes
  // públicas de Storage (assets inmutables) SÍ se cachean → offline + sin re-descarga.
  if (url.hostname.endsWith('.supabase.co') && !url.pathname.startsWith('/storage/v1/object/public/')) return;
  if (url.pathname.endsWith('version.json')) {
    // Siempre red sin caché; fallback a version.json sin query params
    e.respondWith(
      fetch(url.origin + url.pathname, { cache: 'no-store' })
        .catch(() => caches.match('./version.json'))
    );
    return;
  }
  // HTML / navegación / app.js-style entry: NETWORK-FIRST → la app nunca queda pegada en una versión vieja.
  // (cache-first en el HTML era la causa del loop de "Actualizar": servía el index.html viejo tras activar el SW nuevo.)
  const esDocumento = e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  if (esDocumento) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(res => {
        if (res && res.status === 200) { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); }
        return res;
      }).catch(() => caches.match(e.request).then(c => c || caches.match('./index.html')))
    );
    return;
  }
  // Resto de assets (JS/CSS/img/CDN): cache-first (rápido; se invalidan al bumpear VERSION que cambia el nombre del CACHE).
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200) return res;
        if (res.type !== 'basic' && res.type !== 'cors') return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => Response.error());
    })
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// ── WEB PUSH (guardián de comprobantes) ─────────────────────────────────────────────
// La Edge `cpe-guardian` manda un resumen cuando un CPE no fue aceptado por NubeFact/SUNAT.
// Se muestra la notificación con el ícono del panel; al tocarla se abre (o enfoca) el panel
// directo en la alerta del módulo de facturación.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'PS Panel', body: e.data ? e.data.text() : '' }; }
  const title = d.title || '🧾 Comprobantes por revisar';
  const opts = {
    body: d.body || '',
    icon: d.icon || './icon-192.png',
    badge: d.badge || './icon-192.png',
    tag: d.tag || 'cpe-guardian',       // reemplaza el aviso anterior (no se apilan 5 iguales)
    renotify: true,
    requireInteraction: !!(d.casos && d.casos.length),   // los rechazos se quedan hasta que los mires
    data: { url: d.url || './?fac=guardian' },
    vibrate: [90, 40, 90]
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.location.href).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { c.navigate ? c.navigate(target).catch(() => {}) : null; return c.focus(); } }
    return clients.openWindow(target);
  }));
});
