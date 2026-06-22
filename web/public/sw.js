// Finder POS — offline shell service worker.
// Strategy:
//   • _next/static/** — cache-first (immutable hashed filenames)
//   • Navigation requests — network-first, fallback to cached shell
//   • /api/** — network-only (never cache API responses)

const CACHE = "finder-pos-shell-v1";

// Pages to pre-cache on install so the app shell loads offline.
const SHELL = ["/", "/login", "/terminal"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Never cache API traffic — always go to network.
  if (url.pathname.startsWith("/api/")) return;

  // Static Next.js assets — cache-first (filenames are content-hashed).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then((c) => c.put(request, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  // Navigation requests — network-first, fallback to cached page or shell root.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match("/")))
    );
  }
});
