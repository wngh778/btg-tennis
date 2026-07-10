// Tennis App Service Worker
// 배포 시 CACHE_VERSION을 올리면 → 구버전 캐시 자동 삭제 + 새 버전 로드
const CACHE_VERSION = 'v2';
const CACHE_NAME = `tennis-app-${CACHE_VERSION}`;

// ── Install ─────────────────────────────────────────────────────────────────
// skipWaiting: 새 SW가 설치되면 즉시 활성화 (탭 닫을 때까지 기다리지 않음)
self.addEventListener('install', () => self.skipWaiting());

// ── Activate ────────────────────────────────────────────────────────────────
// 이전 버전 캐시 전부 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
// 규칙:
//   1. 다른 출처(Supabase 등) → SW 관여 안 함, 그냥 네트워크
//   2. HTML 페이지 (navigate) → 네트워크 우선 (항상 최신 index.html)
//   3. 해시된 JS/CSS 파일   → 캐시 우선 (파일명에 해시가 있어 안전)
//   4. 나머지                → 네트워크 우선
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. 다른 출처 요청은 건드리지 않음 (Supabase API, 폰트 CDN 등)
  if (url.origin !== self.location.origin) return;

  // 2. HTML 내비게이션 → 네트워크 우선, 실패 시 캐시 폴백
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // 정상 응답이면 캐시에도 저장
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // 3. Vite 해시 에셋 (예: index-A1b2C3d4.js) → 캐시 우선 (불변 파일)
  if (/\/assets\/.*\.[0-9a-zA-Z]{8,}\.(js|css|png|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 4. 기타 동일 출처 요청 → 네트워크 우선, 실패 시 캐시
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
