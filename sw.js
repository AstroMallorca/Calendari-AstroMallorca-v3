const CACHE_NAME = "calendari-astromallorca-v3";

const CORE_ASSETS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.webmanifest",
  "assets/icon-192.png",
  "assets/icon-512.png",

  // Fitxers locals de dades (si existeixen)
  "data/efemerides_2026.json",
  "data/cataleg_icones.json",
  "data/eclipses.json"
];

// Instal·lació: cachejam el core
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  // 1) HTML: network-first
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 2) DADES REMOTES: stale-while-revalidate
  // (CSV del Google Sheet, ICS del calendari, JSON dinàmic, etc.)
  if (isDynamicData(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // 3) La resta (imatges, css, js): cache-first
  event.respondWith(cacheFirst(req));
});

// Detecta dades que vols que s’actualitzin sovint
function isDynamicData(pathname) {
  // Sheets publicats (normalment acaben en .csv) o endpoints de dades
  if (pathname.endsWith(".csv")) return true;
  if (pathname.endsWith(".ics")) return true;

  // També pots incloure el teu JSON si el regeneres sovint al repo
  // (si no, deixa-ho com cache-first)
  if (pathname.includes("/data/") && pathname.endsWith(".json")) return true;

  return false;
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;

  const fresh = await fetch(req);
  if (fresh && fresh.status === 200) cache.put(req, fresh.clone());
  return fresh;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.status === 200) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response("Sense connexió.", { status: 503 });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);

  const networkPromise = fetch(req)
    .then((fresh) => {
      if (fresh && fresh.status === 200) cache.put(req, fresh.clone());
      return fresh;
    })
    .catch(() => null);

  // Retorna el cache immediatament si existeix; si no, espera xarxa
  return cached || (await networkPromise) || new Response("Sense dades.", { status: 503 });
}
