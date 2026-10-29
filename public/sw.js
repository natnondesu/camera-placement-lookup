// The console's service worker. generate.mjs fills in the version and file lists and writes it to public/sw.js.
// Everything the console needs is cached on install, so it works with no connection, 3D view included.
// A new build installs beside the old one and waits; the page offers a reload, and only then does it take over.

const VERSION = "7ccf4ea6871d";
const CACHE = "cpl-" + VERSION;
const LOCAL = ["/","/index.html","/manifest.webmanifest","/icons/icon.svg","/icons/icon-192.png","/icons/icon-512.png","/icons/maskable-512.png","/icons/apple-touch-icon.png","/camera-placement-lookup-open_door.csv","/camera-placement-lookup-corridor.csv"];
const REMOTE = ["https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap","https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js","https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

// Google serves a stylesheet tailored to this browser; the font files it lists are cached with it.
async function cacheFonts(cache, stylesheetUrl) {
  const response = await fetch(stylesheetUrl, { mode: "cors" });
  if (!response.ok) return;
  await cache.put(stylesheetUrl, response.clone());
  const css = await response.text();
  const files = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((match) => match[1]);
  await Promise.all(files.map((url) => fetch(url, { mode: "cors" }).then((font) => font.ok && cache.put(url, font)).catch(() => {})));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(LOCAL);
    // A library that cannot be reached right now must not block the install; it is cached on first use instead.
    await Promise.all(REMOTE.map((url) => {
      if (new URL(url).hostname === "fonts.googleapis.com") return cacheFonts(cache, url).catch(() => {});
      return fetch(url, { mode: "cors" }).then((response) => response.ok && cache.put(url, response)).catch(() => {});
    }));
    // The first install has no older version to wait for.
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("cpl-") && name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

async function fromCacheThenNetwork(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") cache.put(request, response.clone());
  return response;
}

// Fonts: answer from the cache at once and refresh it in the background.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const refresh = fetch(request).then((response) => {
    if (response.ok || response.type === "opaque") cache.put(request, response.clone());
    return response;
  }).catch(() => hit);
  return hit || refresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // The console is one page; share links only change the part after #. Other files (the CSV downloads) are themselves.
  if (request.mode === "navigate" && url.origin === self.location.origin && (url.pathname === "/" || url.pathname === "/index.html")) {
    event.respondWith(caches.open(CACHE).then((cache) => cache.match("/index.html")).then((hit) => hit || fetch(request)));
    return;
  }
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (url.origin === self.location.origin || url.hostname === "cdn.jsdelivr.net") {
    event.respondWith(fromCacheThenNetwork(request));
  }
});
