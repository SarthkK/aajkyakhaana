/*
 * Service worker. Three jobs:
 *   1. installability ("Add to home screen")
 *   2. caching the static bundle — never API responses or pages, so the plan you
 *      see is always the real one and never a stale copy from yesterday
 *   3. receiving push notifications when a flatmate changes the plan
 */
const CACHE = "kyakhaana-static-v2";
const PRECACHE = ["/icon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Anything that can change — pages, API calls — always goes to the network.
  const isStatic = url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname);
  if (!isStatic) return;

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        }),
    ),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Kya Khaana", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Kya Khaana";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // A tag means a newer message about the same meal replaces the old one
      // rather than stacking up three notifications about one lunch.
      tag: payload.tag || "kyakhaana",
      renotify: Boolean(payload.tag),
      data: { url: payload.url || "/today" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/today";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Reuse a tab that is already open rather than piling up new ones.
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
