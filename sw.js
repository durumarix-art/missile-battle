const CACHE_NAME = 'missile-battle-v1';
const ASSETS_TO_CACHE = [
  './fortress_mobile.html',
  './manifest.json',
  './icon.png'
];

// 서비스 워커 설치 시 파일들을 기기 메모리에 저장 (오프라인 준비!)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('똑순이: 게임 파일을 기기에 저장 중...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 활성화 시 오래된 캐시 정리 (안전 대책)
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
});

// 네트워크 요청 시 저장된 파일이 있으면 즉시 보여주기 (로딩 속도 UP!)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
