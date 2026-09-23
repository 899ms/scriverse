const CACHE_NAME = "scriverse-mobile-shell-v2";
const STATIC_REQUEST = /\.(?:css|js|mjs|svg|png|webp|woff2?|ttf)(?:\?.*)?$/iu;
const MOBILE_SHELL_URL = new URL("/?scriverseMobile=1", self.location.origin);

async function cacheMobileShell() {
  const response = await fetch(MOBILE_SHELL_URL, { cache: "reload" });
  if (!response.ok || response.type === "opaque") return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(new Request(MOBILE_SHELL_URL), response.clone());
  await cache.put(new Request(new URL("/index.html", self.location.origin)), response);
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await self.skipWaiting();
    await cacheMobileShell().catch(() => undefined);
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_ASSETS" || !Array.isArray(event.data.urls)) return;
  const urls = [...new Set(event.data.urls)].filter((value) => {
    if (typeof value !== "string") return false;
    try {
      const url = new URL(value, self.location.origin);
      return url.origin === self.location.origin
        && !url.pathname.startsWith("/api/")
        && STATIC_REQUEST.test(url.pathname + url.search);
    } catch {
      return false;
    }
  }).slice(0, 500);
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(urls.map(async (value) => {
      try {
        const request = new Request(new URL(value, self.location.origin), {
          cache: "force-cache",
          credentials: "same-origin"
        });
        const response = await fetch(request);
        if (response.ok && response.type !== "opaque") await cache.put(request, response);
      } catch {
        // 单个资源缓存失败时继续处理其余资源。
      }
    }));
  })());
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
