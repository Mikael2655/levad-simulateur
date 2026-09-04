/* Service worker — « réseau d'abord » pour le code de l'appli (toujours à
   jour), « cache d'abord » pour les gros fichiers statiques qui ne changent
   qu'à une nouvelle version (vendor/*, template PowerPoint, logo) — sinon
   ces ~7 Mo sont retéléchargés à chaque rechargement de page. */
const CACHE = "proposition-v17";
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
  "js/export-pdf.js",
  "js/app.js",
  "vendor/jszip.min.js",
  "vendor/exceljs.min.js",
  "vendor/jspdf.umd.min.js",
  "assets/template.pptx",
  "assets/logo.png",
  "assets/catalog.json",
  "manifest.webmanifest",
  "icon.png",
];
/* Gros fichiers statiques : servis depuis le cache s'ils y sont déjà (rapide),
   sinon récupérés sur le réseau. Une nouvelle version de ces fichiers exige
   de changer CACHE ci-dessus pour forcer un nouveau précache. */
const CACHE_FIRST = [/^vendor\//, /^assets\/template\.pptx$/, /^assets\/logo\.png$/, /^icon\.png$/];

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
  const path = new URL(event.request.url).pathname.replace(/^\//, "");
  if (CACHE_FIRST.some((re) => re.test(path))) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached ||
        fetch(event.request).then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return resp;
        })
      )
    );
    return;
  }
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
