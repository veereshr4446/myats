/* MyATS service worker: lets the site open offline.
   HTML is network-first so new deployments show up right away;
   everything else (icons, pdf.js, mammoth, fonts) is cached after first use. */
const V = "myats-v5";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icons/favicon-32.png", "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.protocol !== "http:" && u.protocol !== "https:") return;
  // Never cache the analytics counter
  if (u.hostname.endsWith("goatcounter.com") || u.hostname === "gc.zgo.at") return;

  const isPage = u.origin === location.origin && (r.mode === "navigate" || u.pathname.endsWith("/") || u.pathname.endsWith("index.html"));
  if (isPage) {
    e.respondWith(
      fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; })
        .catch(() => caches.match(r).then(m => m || caches.match("./index.html")))
    );
    return;
  }
  e.respondWith(
    caches.match(r).then(m => {
      const net = fetch(r).then(res => {
        if (res && (res.ok || res.type === "opaque")) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); }
        return res;
      }).catch(() => m);
      return m || net;
    })
  );
});
