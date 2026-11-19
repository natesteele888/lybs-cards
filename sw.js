// The site moved to lybs-cards.web.app. This retires the old offline copy on phones.
// All the github.io apps share one cache store, so only delete Steele Cards' own caches
// (their names have "card" in them); every other app keeps its saved copy.
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>/card/i.test(k)).map(k=>caches.delete(k)))).then(()=>self.registration.unregister()).then(()=>self.clients.matchAll()).then(cs=>cs.forEach(c=>c.navigate(c.url)))));
