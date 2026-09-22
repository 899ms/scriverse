const CACHE_NAME = "scriverse-mobile-shell-v1";
const STATIC_REQUEST = /\.(?:css|js|mjs|svg|png|webp|woff2?|ttf)(?:\?.*)?$/iu;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function cacheShellResponse(request, response) {
  if (!response || !response.ok || response.type === "opaque") return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await cacheShellResponse(request, await fetch(request));
      } catch {
        return await caches.match(request) ?? await caches.match("/index.html") ?? Response.error();
      }
    })());
    return;
  }
  if (!STATIC_REQUEST.test(url.pathname + url.search)) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then((response) => cacheShellResponse(request, response)).catch(() => null);
    return cached ?? await network ?? Response.error();
  })());
});
