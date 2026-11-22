// Rede primeiro (sempre a versão mais nova); sem internet, usa a cópia guardada.
const CACHE = "treinos-v2";
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || (u.origin !== location.origin && !/gstatic\.com|googleapis\.com\/css|fonts\.gstatic/.test(u.host))) return;
  if (/firestore|identitytoolkit|securetoken/.test(u.host)) return;
  const mesmo = u.origin === location.origin;   // arquivos do app: sempre confere com o servidor (o GitHub guarda cópia por 10 min)
  e.respondWith(fetch(e.request, mesmo ? { cache: "no-cache" } : undefined).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("./"))));
});
