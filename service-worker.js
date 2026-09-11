const CACHE='registo-cais-pc-v8-web-20260911';
const ASSETS=[
  './','./index.html','./styles-core.css','./styles-extra.css','./styles-redesign.css','./app-core.js','./app-records.js','./app-ui.js','./desktop_bridge.js',
  './logo_strong_charon.svg','./logo_glovo.svg','./logo_uber_eats.svg','./logo_bolt_food.svg','./manifest.webmanifest'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match('./index.html'))));
});
