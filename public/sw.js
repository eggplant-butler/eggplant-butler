const CACHE_NAME = 'eggplant-butler-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/public/index.html'
];

// ===== Install: 缓存静态资源 =====
self.addEventListener('install', (event) => {
  console.log('[SW] 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] 缓存静态资源');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((err) => {
        console.warn('[SW] 缓存失败:', err);
      })
  );
  self.skipWaiting();
});

// ===== Activate: 清理旧缓存 =====
self.addEventListener('activate', (event) => {
  console.log('[SW] 激活中...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] 删除旧缓存:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ===== Fetch: 缓存优先策略 =====
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 只处理 GET 请求
  if (request.method !== 'GET') return;

  // 跳过 API 请求（不缓存动态数据）
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;

  // 跳过非同源请求
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        // 缓存命中，直接返回
        if (cachedResponse) {
          // 后台更新缓存
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, networkResponse.clone());
                });
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        // 缓存未命中，网络请求
        return fetch(request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }
            // 存入缓存
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
            return networkResponse;
          })
          .catch((err) => {
            console.warn('[SW] 网络请求失败:', request.url, err);
            // 如果是导航请求，返回离线页面
            if (request.mode === 'navigate') {
              return caches.match('/');
            }
            throw err;
          });
      })
  );
});

// ===== 消息处理 =====
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
