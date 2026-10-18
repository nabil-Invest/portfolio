/* Service worker بسيط: يفتح التطبيق دون اتصال. الشبكة أولاً للملفات الثابتة،
 * ولا يخزّن أي طلب إلى Google/Apps Script (بيانات مالية) إطلاقاً. */
const CACHE = 'ipd-shell-v1';
const SHELL = ['./', 'index.html', 'config.js', 'css/style.css', 'js/calc.js', 'js/ui.js', 'js/charts.js', 'js/store.js', 'js/prices.js', 'js/io.js', 'js/forms.js', 'js/views.js', 'js/app.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
