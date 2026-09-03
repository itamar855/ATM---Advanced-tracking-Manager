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

// ── 4. Recepção de Notificações Web Push (iOS 16.4+, Android e PC) ──
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'Nova Notificação — ATM PRO';
    const options = {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192x192.png',
      badge: data.badge || '/icons/favicon-32x32.png',
      data: data.data || { url: '/dashboard/orders' },
      vibrate: [200, 100, 200, 100, 300], // Vibração característica de venda
      tag: 'atm-order-' + (data.data?.orderId || Date.now()),
      renotify: true,
      requireInteraction: true,
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (err) {
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('ATM PRO', {
        body: text,
        icon: '/icons/icon-192x192.png',
      })
    );
  }
});

// ── 5. Clique na Notificação: Abre ou foca a tela de Pedidos no iPhone/PC ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/dashboard/orders';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Se já houver uma janela do ATM PRO aberta, foca nela e navega
      for (const client of windowClients) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Se não houver, abre uma nova janela
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
