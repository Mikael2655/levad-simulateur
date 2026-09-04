/* Service worker — « réseau d'abord », repli hors-ligne sur le cache. */
const CACHE = "proposition-v12";
const CORE = [
  "./",
  "index.html",
  "css/style.css",
  "js/config.js",
  "js/auth.js",
  "js/store.js",
  "js/utils.js",
  "js/calc.js",
  "js/export-excel.js",
  "js/export-pptx.js",
  "js/app.js",
  "vendor/jszip.min.js",
  "vendor/exceljs.min.js",
  "assets/template.pptx",
  "assets/logo.png",
  "assets/catalog.json",
  "manifest.webmanifest",
  "icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((resp) => {
        if (resp && (resp.ok || resp.type === "opaque")) {
          const copy = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return resp;
        }
        return caches.match(event.request).then((cached) => cached || resp);
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === "navigate") return caches.match("index.html");
          return Response.error();
        })
      )
  );
});
