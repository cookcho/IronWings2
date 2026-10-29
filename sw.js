/* IRON WINGS II — 서비스워커
   목표: (1) 인터넷이 없어도 반드시 실행된다  (2) 있으면 최신본을 가져온다 */
const CACHE = 'ironwings2-R101';
const FILES = ['./', './index.html', './manifest.webmanifest',
               './icon-192.png', './icon-512.png', './icon-mask-512.png'];
const NET_TIMEOUT = 2500;   // 신호가 약할 때 무한정 기다리지 않는다

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 하나라도 실패하면 전부 실패하는 addAll 대신 개별 저장 — 오프라인 보장을 우선한다
    await Promise.all(FILES.map(async f => {
      try { const r = await fetch(f, { cache: 'reload' }); if (r && r.ok) await c.put(f, r); }
      catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function fromCache(req) {
  return (await caches.match(req)) ||
         (await caches.match('./index.html')) ||
         (await caches.match('./'));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const isDoc = req.mode === 'navigate' || req.destination === 'document';

  if (isDoc) {
    // HTML: 네트워크 우선 + 시간 제한. 실패하면 즉시 캐시로 — 오프라인에서도 실행된다
    e.respondWith((async () => {
      try {
        const res = await Promise.race([
          fetch(req),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), NET_TIMEOUT))
        ]);
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          return res;
        }
        const hit = await fromCache(req);
        return hit || res;
      } catch (_) {
        const hit = await fromCache(req);
        if (hit) return hit;
        return new Response('<h1>오프라인</h1><p>한 번은 인터넷에 연결된 상태로 실행해야 합니다.</p>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // 그 외(아이콘·매니페스트): 캐시 우선, 없으면 네트워크
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (_) {
      return (await fromCache(req)) || Response.error();
    }
  })());
});
