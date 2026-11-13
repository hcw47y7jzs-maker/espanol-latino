// Service worker : l'app fonctionne hors connexion et se met à jour proprement.
// À chaque nouvelle version, lancer « python3 tools/release.py » (change la version et la liste des fichiers).
importScripts("version.js", "precache.js");

const CACHE = "aprender-" + self.APP_VERSION;
const AUDIO_CACHE = "aprender-audio"; // gardé d'une version à l'autre

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(self.PRECACHE)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("aprender-") && k !== CACHE && k !== AUDIO_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  // L'index des audios change quand GitHub ajoute des enregistrements : réseau d'abord.
  if (new URL(req.url).pathname.endsWith("/audio/index.json")) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        try {
          const res = await fetch(req, { cache: "no-cache" });
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return (await cache.match(req, { ignoreSearch: true })) || new Response("{}", { headers: { "Content-Type": "application/json" } });
        }
      })
    );
    return;
  }
  const isAudio = new URL(req.url).pathname.endsWith(".mp3");
  e.respondWith(
    caches.open(isAudio ? AUDIO_CACHE : CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        if (req.mode === "navigate") return cache.match("./index.html");
        throw err;
      }
    })
  );
});
