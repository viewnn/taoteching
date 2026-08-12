// 道德经阅读器 Service Worker — 离线缓存
const CACHE_NAME = 'ddj-reader-v1';
const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './xlsx.full.min.js',
    './book.xlsx',
    './icon.svg',
    './icon-192.png',
    './icon-512.png',
    './manifest.json'
];

// 安装：预缓存应用核心文件
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.allSettled(
                APP_SHELL.map(url => cache.add(url))
            ))
            .then(() => self.skipWaiting())
    );
});

// 激活：清理旧缓存
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// 请求拦截：缓存优先，未命中则网络请求并缓存
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(response => {
                // 仅缓存成功的同源响应
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                }
                return response;
            }).catch(() => cached);
        })
    );
});
