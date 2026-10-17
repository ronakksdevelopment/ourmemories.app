/* ===========================================================
   Our Memories — service worker (v1.0)
   Caches only the app shell (HTML/CSS/JS/icons) so the interface
   loads offline. Never caches Google Drive media or API calls —
   those always need a live, authenticated connection.
   =========================================================== */

const CACHE_NAME = "our-memories-shell-v1";

// Paths are relative so this works at any GitHub Pages subpath.
const SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon.png",
  "./assets/favicon-32.png",
  "./assets/favicon-16.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests for our own origin's shell files.
  // Everything else (Google APIs, Drive media, fonts, Font Awesome, JSZip,
  // Picker/GIS scripts) goes straight to the network and is never cached,
  // so private media and live data are always fetched fresh.
  if (req.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).catch(() => cached);
    })
  );
});
