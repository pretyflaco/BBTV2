/* eslint-env serviceworker */
// Service Worker for Blink POS
const CACHE_NAME = "blink-tracker-v19-fix-sw-freeze" // Update this version when deploying changes
const STATIC_ASSETS = [
  "/manifest.json",
  "/icons/icon-192x192.svg",
  "/icons/icon-512x512.svg",
  "/favicon.svg",
  "/connect.mp3",
  "/success.mp3",
  "/botw_connect.mp3",
  "/botw_shrine.mp3",
  "/free_connect.mp3",
  "/free_success.mp3",
  "/retro_connect.mp3",
  "/retro_success.mp3",
  "/click.mp3",
]

// Install event - cache key resources
self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing...")
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("Service Worker: Caching static assets")
        return cache.addAll(STATIC_ASSETS)
      })
      .then(() => {
        console.log("Service Worker: Installation complete")
        return self.skipWaiting()
      }),
  )
})

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activating...")
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log("Service Worker: Deleting old cache", cacheName)
              return caches.delete(cacheName)
            }
          }),
        )
      })
      .then(() => {
        console.log("Service Worker: Activated")
        return self.clients.claim()
      }),
  )
})

// Helper: check if a URL points to a static asset we should cache
function isStaticAsset(url) {
  return (
    url.includes("/_next/static/") ||
    url.includes("/icons/") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/favicon.svg" ||
    url.pathname.endsWith(".mp3")
  )
}

// Fetch event - network-first for pages/scripts, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)

  // Skip non-GET requests
  if (event.request.method !== "GET") {
    return
  }

  // CRITICAL: Skip non-http(s) schemes (blob:, chrome-extension:, data:, etc.)
  // Service workers cannot fetch these and attempting to do so will hang the browser.
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return
  }

  // Skip API routes - these should always go to the network
  if (url.pathname.startsWith("/api/")) {
    return
  }

  // Skip requests to external services
  if (
    url.hostname !== self.location.hostname ||
    url.hostname.includes("api.blink.sv") ||
    url.hostname.includes("ws.blink.sv")
  ) {
    return
  }

  // Skip WebSocket upgrade requests
  if (event.request.headers.get("Upgrade") === "websocket") {
    return
  }

  // Static assets (icons, sounds, Next.js chunks): cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          return cached
        }
        return fetch(event.request).then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
      }),
    )
    return
  }

  // Everything else (HTML pages, JS bundles): network-first
  // This ensures code updates are picked up immediately when online.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        return response
      })
      .catch(() => {
        // Offline fallback: try cache, then return cached home page for navigation
        return caches.match(event.request).then((cached) => {
          if (cached) {
            return cached
          }
          if (event.request.mode === "navigate") {
            return caches.match("/")
          }
        })
      }),
  )
})

// Background Sync for future enhancement
self.addEventListener("sync", (event) => {
  if (event.tag === "background-sync") {
    console.log("Service Worker: Background sync triggered")
    event.waitUntil(doBackgroundSync())
  }
})

function doBackgroundSync() {
  // Placeholder for future background sync functionality
  // Could be used to sync transaction data when connection is restored
  return Promise.resolve()
}

// Push notifications for future enhancement
self.addEventListener("push", (event) => {
  console.log("Service Worker: Push message received")

  const options = {
    body: event.data ? event.data.text() : "New transaction received!",
    icon: "/icons/icon-192x192.svg",
    badge: "/icons/icon-96x96.svg",
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
    },
    actions: [
      {
        action: "explore",
        title: "View Transactions",
        icon: "/icons/icon-96x96.svg",
      },
      {
        action: "close",
        title: "Close",
        icon: "/icons/icon-96x96.svg",
      },
    ],
  }

  event.waitUntil(self.registration.showNotification("Blink Tracker", options))
})

// Notification click handler
self.addEventListener("notificationclick", (event) => {
  console.log("Service Worker: Notification click received")

  event.notification.close()

  if (event.action === "explore") {
    event.waitUntil(clients.openWindow("/"))
  }
})
