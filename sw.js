/* IT English Lab — offline shell for the static GitHub Pages build.
 *
 * All paths are resolved against the service worker location, so the same
 * file works at a project subpath such as /IT_ENGLISH_EXAM/ and at a domain
 * root. The cache is private to this app's scope; other GitHub Pages projects
 * on the same origin are left alone.
 */
(() => {
  "use strict";

  const CACHE = "itenglishlab-pwa-v4";
  const BASE = new URL("./", self.location.href);
  const INDEX = new URL("./", BASE).href;
  const INDEX_FILE = new URL("index.html", BASE).href;

  const SHELL = [
    "",
    "index.html",
    "styles.css",
    "static.css",
    "app.js",
    "local-core.js",
    "static-api.js",
    "views-home.js",
    "views-unit.js",
    "practice.js",
    "chat.js",
    "settings.js",
    "study.js",
    "audio.js",
    "speaking.js",
    "events.js",
    "exam.js",
    "analytics.js",
    "pwa.js",
    "telegram.js",
    "telegram.css",
    "manifest.webmanifest",
    "icon.svg",
    "icon-192.png",
    "icon-512.png",
    "data/units.json",
    "data/exams.json",
    "data/audio.json",
    "data/exam_questions.json",
    "audio/unit03-multicore.wav",
    "audio/unit07-osi.wav",
    "audio/unit09-search.wav",
    "audio/unit12-virus.wav",
    "audio/unit14-neural.wav",
  ].map((path) => new URL(path, BASE).href);

  const isCacheable = (response) => response && response.status === 200 && response.type === "basic";

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
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key === "itelab-static-v1" ||
                  (key.startsWith("itenglishlab-pwa-v") && key !== CACHE)
              )
              .map((key) => caches.delete(key))
          )
        )
        .then(() => self.clients.claim())
    );
  });

  self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.includes("/api/")) return;

    // Hash routes never reach the network, but a direct reload or an installed
    // app launch may request the document URL. Serve the cached shell offline.
    if (request.mode === "navigate") {
      event.respondWith(
        (async () => {
          const cache = await caches.open(CACHE);
          try {
            const response = await fetch(request);
            if (isCacheable(response)) {
              await cache.put(INDEX, response.clone());
              await cache.put(INDEX_FILE, response.clone());
            }
            return response;
          } catch (_) {
            return (
              (await cache.match(INDEX)) ||
              (await cache.match(INDEX_FILE)) ||
              new Response(
                "<!doctype html><meta charset=\"utf-8\"><title>IT English Lab</title><p>Нет соединения. Откройте приложение один раз онлайн, чтобы сохранить материалы для офлайн-работы.</p>",
                { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
              )
            );
          }
        })()
      );
      return;
    }

    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (isCacheable(response)) await cache.put(request, response.clone());
          return response;
        } catch (_) {
          return new Response("", { status: 504, statusText: "Offline" });
        }
      })()
    );
  });
})();
