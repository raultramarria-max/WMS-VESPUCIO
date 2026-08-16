/* ═══════════════════════════════════════════════════════════════════
   Bodega Móvil — service worker
   Guarda la app entera en el teléfono para que abra sin señal dentro
   de la cámara de frío. Los datos del inventario NO viven aquí: esos
   están en localStorage y no se tocan al actualizar.
   ═══════════════════════════════════════════════════════════════════ */
const VERSION = 'bodega-v1';
const SHELL = [
  './bodega_movil.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png'
];
// Se guardan también estas dos, que vienen de fuera: sin ellas el iPhone
// se queda sin lector de códigos y la app sin tipografías.
const EXTERNAS = [
  'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // Lo propio tiene que entrar sí o sí
    await c.addAll(SHELL);
    // Lo de fuera es "mejor si entra": si el WiFi falla al instalar, no
    // se cae la instalación entera — se guardará en el primer uso.
    await Promise.all(EXTERNAS.map(u =>
      fetch(u, { mode: 'no-cors' }).then(r => c.put(u, r)).catch(() => {})
    ));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Firestore nunca se cachea: tiene su propia caché offline y cachearlo
  // devolvería inventario viejo como si fuera el actual.
  if (/firestore\.googleapis|firebaseio|identitytoolkit/.test(req.url)) return;

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit){
      // Se refresca por detrás para que la próxima apertura traiga lo nuevo
      fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()); }).catch(() => {});
      return hit;
    }
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    } catch(err){
      // Sin señal y sin copia: si es una navegación, se entrega la app igual
      if (req.mode === 'navigate') return (await cache.match('./bodega_movil.html')) || Response.error();
      throw err;
    }
  })());
});
