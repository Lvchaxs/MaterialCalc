/* Service Worker：装好之后断网也能打开（全部逻辑在前端），联网时后台检查新版。
   更新流程：文件有变动 → 新版在后台装好 → 页面右下角出现提示 → 用户点一下才切换。 */
var CACHE = 'lvcalc-v6';

var SHELL = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/data.js',
    './manifest.webmanifest'
];

self.addEventListener('install', function (e) {
    e.waitUntil(caches.open(CACHE).then(function (c) {
        return c.addAll(SHELL);
    }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
    e.waitUntil(caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) {
            return k === CACHE ? null : caches.delete(k);
        }));
    }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) {
    if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (e) {
    var req = e.request;
    if (req.method !== 'GET') return;

    // 页面：优先取网络（拿到就是最新版），断网才退回缓存
    if (req.mode === 'navigate') {
        e.respondWith(fetch(req).then(function (res) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
            return res;
        }).catch(function () { return caches.match('./index.html'); }));
        return;
    }

    // 其余资源：先取缓存（离线可用），同时后台补更新；图标量大，按需缓存
    e.respondWith(caches.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) {
            if (res && res.status === 200) {
                var copy = res.clone();
                caches.open(CACHE).then(function (c) { c.put(req, copy); });
            }
            return res;
        }).catch(function () { return hit; });

        return hit || net;
    }));
});
