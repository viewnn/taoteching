// 道德经阅读器 Service Worker — 离线缓存
const CACHE_NAME = 'ddj-reader-v3';
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

// 请求拦截：book.xlsx 走网络优先（带时间戳），静态资源走 Cache First
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;

    const url = new URL(e.request.url);
    const pathname = url.pathname.toLowerCase();

    // book.xlsx 动态数据：网络优先 + 缓存更新
    // app.js 每次加载带时间戳参数（book.xlsx?_=xxx），确保获取最新内容
    // SW 将带时间戳的 URL 归一化，避免缓存膨胀
    if (pathname.endsWith('book.xlsx') || pathname.endsWith('book.xlsx/')) {
        // 构造归一化请求（去掉查询参数），用于缓存读写
        const normalizedUrl = url.origin + pathname;
        const normalizedRequest = new Request(normalizedUrl, { method: 'GET' });

        e.respondWith(
            // 先用归一化 URL 查缓存
            caches.match(normalizedRequest).then(cached => {
                // 后台静默更新：用原始请求（带时间戳）从网络获取最新版
                fetch(e.request).then(response => {
                    if (response && response.status === 200 && response.type === 'basic') {
                        const clone = response.clone();
                        // 用归一化 URL 存入缓存，保持单条缓存记录
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(normalizedRequest, clone);
                        });
                        // 通知客户端缓存已更新
                        self.clients.matchAll({ type: 'window' }).then(clients => {
                            clients.forEach(client => {
                                client.postMessage({ type: 'cache-updated' });
                            });
                        });
                    }
                }).catch(() => {});
                // 返回缓存（离线时使用），否则返回网络
                return cached || fetch(e.request).catch(() => cached);
            })
        );
        return;
    }

    // 静态资源（HTML/CSS/JS/图标）：Cache First，加载速度优先
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(response => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                }
                return response;
            }).catch(() => cached);
        })
    );
});
