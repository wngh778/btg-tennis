// Service Worker 비활성화 - 기존 등록 해제용
// 이 파일이 업데이트되면 브라우저가 새 SW를 설치하고 기존 캐시를 삭제함
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
  self.clients.claim();
});
