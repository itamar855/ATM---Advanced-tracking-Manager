// ATM PRO - Service Worker v1.0.0
// Caching inteligente para PWA com proteção estrita de APIs em tempo real

const CACHE_NAME = 'atm-pro-cache-v1';
const PRECACHE_ASSETS = [
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32x32.png',
];

// Instalação do Service Worker e pré-cache de assets essenciais
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Pré-cache parcial:', err);
      });
    })
  );
});

// Ativação e limpeza de caches legados
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              return caches.delete(name);
            }
          })
        );
      }),
    ])
  );
});

// Interceptação de requisições com política de segurança de dados
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. REGRAS CRÍTICAS DE REDE DIRETA (Nunca usar cache):
  // - Todas as chamadas de API (/api/*)
  // - Chamadas para Supabase, Meta Graph API, Webhooks
  // - Métodos não-GET (POST, PUT, DELETE)
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('facebook.com') ||
    url.hostname.includes('graph.facebook')
  ) {
    return; // Passa direto para a rede sem intervenção do SW
  }

  // 2. Assets estáticos (imagens, ícones, fontes): Cache-First com fallback de rede
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.ico')
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 3. Páginas HTML / Navegação: Network-First com fallback de cache para máxima frescura
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || new Response('Você está offline no momento.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        });
      })
  );
});
