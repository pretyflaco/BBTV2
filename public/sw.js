// Service Worker for Blink POS
const CACHE_NAME = 'blink-tracker-v9-2026-01-30-amber-sw-intercept'; // Update this version when deploying changes

// IndexedDB for storing Amber/signer return params
const DB_NAME = 'blink-pos-signer';
const DB_VERSION = 1;
const STORE_NAME = 'signer-returns';

// Open IndexedDB (Service Workers can use IndexedDB)
function openSignerDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

// Store signer return data in IndexedDB
async function storeSignerReturn(data) {
  try {
    const db = await openSignerDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    // Use a fixed key so we always overwrite with latest
    await store.put({ id: 'latest', ...data, timestamp: Date.now() });
    console.log('[SW] Stored signer return data:', data.nostrReturn?.substring(0, 30));
    db.close();
    return true;
  } catch (e) {
    console.error('[SW] Failed to store signer return:', e);
    return false;
  }
}

// Notify all clients about new signer return data
async function notifyClients(data) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  console.log('[SW] Notifying', clients.length, 'client(s) about signer return');
  clients.forEach(client => {
    client.postMessage({
      type: 'SIGNER_RETURN',
      nostrReturn: data.nostrReturn,
      fullUrl: data.fullUrl,
      timestamp: Date.now()
    });
  });
}

const urlsToCache = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.svg',
  '/icons/icon-512x512.svg',
  '/favicon.svg',
  '/connect.mp3',
  '/success.mp3',
  '/botw_connect.mp3',
  '/botw_shrine.mp3',
  '/free_connect.mp3',
  '/free_success.mp3',
  '/retro_connect.mp3',
  '/retro_success.mp3',
  '/click.mp3'
];

// Install event - cache key resources
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: Installation complete');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Activated');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache when offline, intercept signer returns
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip requests to external APIs (like Blink API)
  if (event.request.url.includes('api.blink.sv') || 
      event.request.url.includes('ws.blink.sv')) {
    return;
  }

  // CRITICAL: Intercept signer return URLs (Amber/NIP-55)
  // This captures the URL params BEFORE the page loads, solving the Android intent issue
  const url = new URL(event.request.url);
  const nostrReturn = url.searchParams.get('nostr_return');
  
  if (nostrReturn && (nostrReturn.startsWith('challenge') || nostrReturn.startsWith('signed'))) {
    console.log('[SW] *** INTERCEPTED SIGNER RETURN ***');
    console.log('[SW] URL:', event.request.url.substring(0, 100));
    console.log('[SW] nostr_return:', nostrReturn.substring(0, 50));
    
    // Store the params and notify clients (don't await - fire and forget)
    const signerData = {
      nostrReturn: nostrReturn,
      fullUrl: event.request.url,
      path: url.pathname
    };
    
    // Store in IndexedDB and notify clients
    event.waitUntil(
      storeSignerReturn(signerData).then(() => notifyClients(signerData))
    );
    
    // Continue with normal fetch - the page will load and check IndexedDB
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version if available
        if (response) {
          console.log('Service Worker: Serving from cache', event.request.url);
          return response;
        }

        // Otherwise fetch from network
        console.log('Service Worker: Fetching from network', event.request.url);
        return fetch(event.request).then((response) => {
          // Don't cache if not a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          // Cache static assets
          if (event.request.url.includes('/_next/static/') || 
              event.request.url.includes('/icons/') ||
              event.request.url.includes('/manifest.json')) {
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
          }

          return response;
        });
      })
      .catch(() => {
        // Return offline page for navigation requests when offline
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
      })
  );
});

// Background Sync for future enhancement
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('Service Worker: Background sync triggered');
    event.waitUntil(doBackgroundSync());
  }
});

function doBackgroundSync() {
  // Placeholder for future background sync functionality
  // Could be used to sync transaction data when connection is restored
  return Promise.resolve();
}

// Push notifications for future enhancement
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push message received');
  
  const options = {
    body: event.data ? event.data.text() : 'New transaction received!',
    icon: '/icons/icon-192x192.svg',
    badge: '/icons/icon-96x96.svg',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'View Transactions',
        icon: '/icons/icon-96x96.svg'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icons/icon-96x96.svg'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Blink Tracker', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification click received');
  
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Message handler - allows clients to query/clear signer return data
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data?.type);
  
  if (event.data?.type === 'GET_SIGNER_RETURN') {
    // Client is asking for stored signer return data
    event.waitUntil(
      (async () => {
        try {
          const db = await openSignerDB();
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const request = store.get('latest');
          
          return new Promise((resolve) => {
            request.onsuccess = () => {
              const data = request.result;
              db.close();
              
              // Only return if data is fresh (within 2 minutes)
              if (data && Date.now() - data.timestamp < 2 * 60 * 1000) {
                console.log('[SW] Returning stored signer data:', data.nostrReturn?.substring(0, 30));
                event.source.postMessage({
                  type: 'SIGNER_RETURN_RESPONSE',
                  data: data
                });
              } else {
                console.log('[SW] No fresh signer data found');
                event.source.postMessage({
                  type: 'SIGNER_RETURN_RESPONSE',
                  data: null
                });
              }
              resolve();
            };
            request.onerror = () => {
              db.close();
              event.source.postMessage({
                type: 'SIGNER_RETURN_RESPONSE',
                data: null
              });
              resolve();
            };
          });
        } catch (e) {
          console.error('[SW] Error getting signer data:', e);
          event.source.postMessage({
            type: 'SIGNER_RETURN_RESPONSE',
            data: null
          });
        }
      })()
    );
  }
  
  if (event.data?.type === 'CLEAR_SIGNER_RETURN') {
    // Client is clearing the stored data after successful use
    event.waitUntil(
      (async () => {
        try {
          const db = await openSignerDB();
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          await store.delete('latest');
          console.log('[SW] Cleared signer return data');
          db.close();
        } catch (e) {
          console.error('[SW] Error clearing signer data:', e);
        }
      })()
    );
  }
});
