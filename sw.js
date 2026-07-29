const CACHE_NAME = 'gomoku-v1';
const FILES_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/board.js',
  './js/ai.js',
  './js/p2p.js',
  './js/ui.js',
  './js/main.js',
  './manifest.json',
  './assets/icon.svg'
];

// 安装：预缓存核心文件
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE).catch((err) => {
        console.warn('[SW] 部分文件缓存失败:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 请求：缓存优先，网络回退
self.addEventListener('fetch', (event) => {
  // 跳过 WebRTC / PeerJS 相关请求
  if (event.request.url.includes('peerjs') || event.request.url.includes('unpkg')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        // 缓存成功的 GET 请求
        if (response && response.status === 200 && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => {
        // 网络失败时忽略（已从缓存返回）
      });

      return cached || fetchPromise;
    })
  );
});
