/* IT English Lab — installable offline shell */
(() => {
  "use strict";
  const CACHE = "itelab-v4-shell-4";
  const SHELL = [
    "/",
    "/styles.css",
    "/app.js",
    "/views-home.js",
    "/views-unit.js",
    "/practice.js",
    "/chat.js",
    "/settings.js",
    "/study.js",
    "/audio.js",
    "/speaking.js",
    "/events.js",
    "/exam.js",
    "/analytics.js",
    "/pwa.js",
    "/manifest.webmanifest",
    "/icon.svg",
    "/icon-192.png",
    "/icon-512.png",
    "/audio/unit03-multicore.wav",
    "/audio/unit07-osi.wav",
    "/audio/unit09-search.wav",
    "/audio/unit12-virus.wav",
    "/audio/unit14-neural.wav",
  ];

  self.addEventListener("install", (event) => {
    event.waitUntil(
      caches
        .open(CACHE)
        .then((cache) => cache.addAll(SHELL))
        .then(() => self.skipWaiting())
    );
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
        .then(() => self.clients.claim())
    );
  });

  self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== location.origin) return;
    if (url.pathname.startsWith("/api/")) return;

    if (request.mode === "navigate") {
      event.respondWith(
        fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("/", copy));
            return response;
          })
          .catch(() => caches.match("/").then((hit) => hit || caches.match(request)))
      );
      return;
    }

    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit) {
          fetch(request)
            .then((response) => {
              if (response && response.ok) caches.open(CACHE).then((cache) => cache.put(request, response));
            })
            .catch(() => {});
          return hit;
        }
        return fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => caches.match("/"));
      })
    );
  });
})();
