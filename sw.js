const CACHE_NAME = 'missile-battle-v8'; // 120Hz 프레임 끊김 버그 완벽 수정
const ASSETS_TO_CACHE = [
  './index.html', // 파일명 수정
  './manifest.json',
  './icon.png'
];

// 서비스 워커 설치 시 파일들을 기기 메모리에 저장
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('똑순이: 최신 게임 파일을 기기에 저장 중...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting(); // 즉시 활성화
});

// 활성화 시 오래된 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // 즉시 제어권 확보
});

// 네트워크 요청 시 저장된 파일이 있으면 즉시 보여주기
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
