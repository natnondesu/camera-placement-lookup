// The console's service worker. generate.mjs fills in the version and file lists and writes it to public/sw.js.
// Everything the console needs is cached on install, so it works with no connection, 3D view included.
// A new build installs beside the old one and waits; the page offers a reload, and only then does it take over.

const VERSION = "0860e2f4fdb1";
const CACHE = "cpl-" + VERSION;
const LOCAL = ["/","/index.html","/manifest.webmanifest","/icons/icon.svg","/icons/icon-192.png","/icons/icon-512.png","/icons/maskable-512.png","/icons/apple-touch-icon.png","/camera-placement-lookup-open_door.csv","/camera-placement-lookup-corridor.csv","/people/Female_Adult_01/Female_Adult_01.fbx","/people/Female_Adult_01/f001_body_color.jpg","/people/Female_Adult_01/f001_head_color.jpg","/people/Female_Adult_01/f001_opacity_color.png","/people/Female_Adult_03/Female_Adult_03.fbx","/people/Female_Adult_03/f003_body_color.jpg","/people/Female_Adult_03/f003_head_color.jpg","/people/Female_Adult_03/f003_opacity_color.png","/people/Female_Adult_06/Female_Adult_06.fbx","/people/Female_Adult_06/f202_body_color.jpg","/people/Female_Adult_06/f202_head_color.jpg","/people/Female_Adult_06/f202_opacity_color.png","/people/Female_Adult_11/Female_Adult_11.fbx","/people/Female_Adult_11/f011_body_color.jpg","/people/Female_Adult_11/f011_head_color.jpg","/people/Female_Adult_11/f011_opacity_color.png","/people/LICENSE-Rocketbox.md","/people/Male_Adult_03/Male_Adult_03.fbx","/people/Male_Adult_03/m004_body_color.jpg","/people/Male_Adult_03/m004_head_color.jpg","/people/Male_Adult_03/m004_opacity_color.png","/people/Male_Adult_04/Male_Adult_04.fbx","/people/Male_Adult_04/m006_body_color.jpg","/people/Male_Adult_04/m006_head_color.jpg","/people/Male_Adult_04/m006_opacity_color.png","/people/Male_Adult_06/Male_Adult_06.fbx","/people/Male_Adult_06/m011_body_color.jpg","/people/Male_Adult_06/m011_head_color.jpg","/people/Male_Adult_06/m011_opacity_color.png","/people/Male_Adult_12/Male_Adult_12.fbx","/people/Male_Adult_12/m007_body_color.jpg","/people/Male_Adult_12/m007_head_color.jpg","/people/anims/f_idle_breathe_01.max.fbx","/people/anims/f_walk_neutral.max.fbx","/people/anims/m_idle_breathe_01.max.fbx","/people/anims/m_walk_neutral.max.fbx"];
const REMOTE = ["https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap","https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js","https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js","https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/FBXLoader.js","https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js","https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/fflate.module.js","https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/curves/NURBSCurve.js","https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/curves/NURBSUtils.js"];
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
