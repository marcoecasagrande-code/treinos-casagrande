// Rede primeiro (sempre a versão mais nova); sem internet, usa a cópia guardada.
const CACHE = "treinos-v1";
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || (u.origin !== location.origin && !/gstatic\.com|googleapis\.com\/css|fonts\.gstatic/.test(u.host))) return;
  if (/firestore|identitytoolkit|securetoken/.test(u.host)) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("./"))));
});
