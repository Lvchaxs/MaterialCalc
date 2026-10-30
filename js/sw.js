/* Service Worker：装好之后断网也能打开（全部逻辑在前端），联网时后台检查新版。
   更新流程：文件有变动 → 新版在后台装好 → 页面右下角出现提示 → 用户点一下才切换。 */
var CACHE = 'lvcalc-v14';

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

    var path = new URL(req.url).pathname;

    // 页面 + CSS/JS：优先取网络 ⇒ 刷新即最新版，断网才退回缓存。
    //   ★ 这几个必须先走网络：它们是 cache-first 时，刷新页面拿到的仍是旧 css/js
    //     （Ctrl+F5 也绕不过 SW 缓存），表现就是"改了线上却一直没生效"。
    //     只有图标（几百 KB）才留 cache-first，那是下面另一段的事。
    if (req.mode === 'navigate' || /\.(css|js)$/.test(path)) {
        if (path.indexOf('/sw.js') >= 0) return;          // 别拦截自己
        e.respondWith(fetch(req).then(function (res) {
            if (res && res.ok) {
                var copy = res.clone();
                caches.open(CACHE).then(function (c) { c.put(req, copy); });
                return res;
            }
            throw new Error('bad status');
        }).catch(function () {
            return caches.match(req.mode === 'navigate' ? './index.html' : req);
        }));
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
