/* 材料计算器 —— 全部逻辑在本地，数据存浏览器，联网时只做一件额外的事：检查更新。 */
(function () {
    'use strict';

    var DATA = window.MATERIAL_DATA;
    var STORE_KEY = 'lvcalc.v1';
    var THEME_KEY = 'lvcalc.theme';

    if (!DATA) { document.body.innerHTML = '<p style="padding:20px">数据未加载：请先运行 tools/build_data.py</p>'; return; }

    var families = DATA.families;
    var idToGroup = {};
    families.forEach(function (f) { if (f.dm) idToGroup[f.dm] = f.g; });

    /* ================= 状态 ================= */
    var state = load();

    function load() {
        // ★ 与 LvchaxsBS 的 MonsterMaterialSettings 同名同义：
        //   sort 0=默认（背包顺序）1=进度；desc=倒序；hide=隐藏 100%（IsFull）
        var s = { qty: {}, opts: { sort: 0, desc: false, hide: false } };
        try {
            var raw = localStorage.getItem(STORE_KEY);
            if (raw) {
                var saved = JSON.parse(raw);
                if (saved && saved.qty) s.qty = saved.qty;
                if (saved && saved.opts) {
                    // 旧版存的是 kind / sort:'id'|'progress'，顺手迁移成新结构
                    var o = saved.opts;
                    s.opts.sort = (o.sort === 1 || o.sort === 'progress') ? 1 : 0;
                    s.opts.desc = !!o.desc;
                    s.opts.hide = !!o.hide;
                }
            }
        } catch (e) { }
        return s;
    }

    var saveTimer = 0;
    function save() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { }
        }, 200);
    }

    function qtyOf(g) {
        if (!state.qty[g]) state.qty[g] = [0, 0, 0];
        return state.qty[g];
    }


    /* ================= 渲染 ================= */
    var listEl = document.getElementById('list');

    /* 三档各满 9999 时的「最高品质等价数」（与 C# 的 MonsterMaterialService.FullEquivalent 同值） */
    var FULL_EQUIV = 9999 + 9999 / 3 + 9999 / 9;   // = 14443

    /* 进度（0~1）：★ 与 LvchaxsBS 的 Services.MonsterMaterialService.CalcProgressPercent 完全一致
       —— 三档按合成关系（3 最低 = 1 中等、3 中等 = 1 最高）折算成「最高品质等价数」，
          再除以三档各满 9999 的全满值（= 14443），要满 9999 才算 100%。 */
    function progressOf(g) {
        var q = qtyOf(g);
        var equiv = q[0] + q[1] / 3 + q[2] / 9;
        return Math.max(0, Math.min(1, equiv / FULL_EQUIV));
    }

    /* 进度文字：与 C# 的 ProgressText 一致，保留 2 位小数（例：0.06%） */
    function pctOf(g) { return (progressOf(g) * 100).toFixed(2); }

    /* 是否已满：照抄 LvchaxsBS 的 IsFull —— 进度 ≥ 99.995%
       （阈值取 99.995 是因为进度文字保留 2 位小数，到这个值显示出来就是「100.00%」） */
    function isDone(g) { return progressOf(g) * 100 >= 99.995; }

    /* 照抄 C# 的 BuildVisibleRows + ApplySortTo：
       先按「族号升序」排好当基准 ⇒ 进度模式再按百分比排 ⇒ 默认模式的倒序直接整串 Reverse。
       ★ 隐藏 100% 用的是 IsFull（≥ 99.995%），与主程序同一个阈值。 */
    function visibleFamilies() {
        var out = families.slice();
        if (state.opts.hide) {
            out = out.filter(function (f) { return !isDone(f.g); });
        }

        out.sort(function (a, b) { return a.g - b.g; });

        if (state.opts.sort === 1) {
            out.sort(function (a, b) {
                return state.opts.desc
                    ? progressOf(b.g) - progressOf(a.g)
                    : progressOf(a.g) - progressOf(b.g);
            });
        } else if (state.opts.desc) {
            out.reverse();
        }
        return out;
    }

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    function render() {
        var items = visibleFamilies();
        if (!items.length) { listEl.innerHTML = '<p style="padding:16px 14px;color:var(--text-2)">没有匹配的材料</p>'; return; }

        var html = '';
        items.forEach(function (f) {
            var p = pctOf(f.g);
            html += '<div class="fam" data-g="' + f.g + '">';

            // 三档并列：图标 + 数量（和 LvchaxsBS 材料统计页一行一族的排版一致）
            for (var i = 0; i < 3; i++) {
                var v = qtyOf(f.g)[i];
                html += '<span class="tier">';
                html += '<img src="' + f.tiers[i].img + '" alt="" title="' + esc(f.tiers[i].n) + '" loading="lazy">';
                // 数量为 0 时输入框里没有真实内容，只靠 placeholder 显示一个淡 0（不是值）：
                // 一敲数字它就自动让位，不用先删 0。有值时不输出 value 之外的任何东西。
                html += '<input type="number" min="0" max="9999" maxlength="4" class="qty" placeholder="0"' +
                    ' data-g="' + f.g + '" data-i="' + i + '"' +
                    (v === 0 ? '' : ' value="' + v + '"') + '>';
                html += '</span>';
            }

            html += '<span class="bar"><i style="width:' + p + '%"></i></span>';
            html += '<span class="pct">' + p + '%</span>';
            html += '</div>';
        });
        listEl.innerHTML = html;
    }

    /* ================= 交互 ================= */

    /* 排序按钮：照抄 C# 的 SortOption_Click —— 两组各自互斥，隐藏 100% 是独立开关 */
    var sortBar = document.getElementById('sort-bar');

    sortBar.addEventListener('click', function (e) {
        var btn = e.target.closest('.sort-opt');
        if (!btn) return;

        var k = btn.getAttribute('data-k'), v = +btn.getAttribute('data-v');
        if (k === 'mode') state.opts.sort = v;
        else if (k === 'dir') state.opts.desc = (v === 1);
        else if (k === 'hide') state.opts.hide = !state.opts.hide;
        else return;

        save();
        syncSortButtons();
        render();
    });

    function syncSortButtons() {
        var o = state.opts;
        var btns = sortBar.querySelectorAll('.sort-opt');
        for (var i = 0; i < btns.length; i++) {
            var k = btns[i].getAttribute('data-k'), v = +btns[i].getAttribute('data-v');
            var on = (k === 'mode' && o.sort === v)
                || (k === 'dir' && (o.desc ? 1 : 0) === v)
                || (k === 'hide' && (o.hide ? 1 : 0) === v);
            btns[i].classList.toggle('on', on);
        }
    }

    // 改数量：只刷新这一行的进度条，不整页重排（否则输入焦点会丢）
    listEl.addEventListener('input', function (e) {
        var el = e.target;
        if (!el.classList.contains('qty')) return;

        // ★ 上限 9999 ⇒ 只留数字、最多 4 位
        //   （type=number 的 maxlength 浏览器不认，HTML5 规范里它只对 text 类生效，只能自己截）
        var v = el.value.replace(/\D/g, '').slice(0, 4);
        if (v !== el.value) el.value = v;

        var g = el.getAttribute('data-g'), i = +el.getAttribute('data-i');
        var n = v ? parseInt(v, 10) : 0;
        qtyOf(g)[i] = Math.min(9999, n);
        save();
        refreshRow(g);
    });

    function refreshRow(g) {
        var fam = listEl.querySelector('.fam[data-g="' + g + '"]');
        if (!fam) return;
        var p = pctOf(g);
        fam.querySelector('.bar > i').style.width = p + '%';
        fam.querySelector('.pct').textContent = p + '%';
    }

    /* ================= 主题 ================= */
    var root = document.documentElement;
    var savedTheme = null;
    try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) { }

    function applyTheme(t) {
        root.setAttribute('data-theme', t);
        try { localStorage.setItem(THEME_KEY, t); } catch (e) { }
    }

    applyTheme(savedTheme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    document.getElementById('btn-theme').addEventListener('click', function () {
        applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });

    /* ================= 导入 / 导出（Darkmoon 格式） ================= */
    var fileEl = document.getElementById('file');
    document.getElementById('btn-import').addEventListener('click', function () { fileEl.click(); });
    document.getElementById('btn-export').addEventListener('click', doExport);

    fileEl.addEventListener('change', function () {
        var f = this.files && this.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
            try { doImport(JSON.parse(reader.result)); }
            catch (e) { toast('导入失败：文件不是合法 JSON'); }
        };
        reader.readAsText(f, 'UTF-8');
        this.value = '';
    });

    function doImport(data) {
        if (!data || typeof data !== 'object') { toast('导入失败：文件内容不对'); return; }

        var n = 0;

        // ① Darkmoon 计算器格式（materialsNumbers + 连续 id 1~52）
        if (Array.isArray(data.materialsNumbers)) {
            data.materialsNumbers.forEach(function (m) {
                var g = idToGroup[m.id];
                if (!g || !Array.isArray(m.numbers) || m.numbers.length < 3) return;
                // Darkmoon 是 [最低, 中等, 最高]，本项目是 [最高, 中等, 最低]
                qtyOf(g)[0] = clamp(m.numbers[2]);
                qtyOf(g)[1] = clamp(m.numbers[1]);
                qtyOf(g)[2] = clamp(m.numbers[0]);
                n++;
            });
        }
        // ② 本项目自己导出的备份格式（只含数量）
        else if (Array.isArray(data.families)) {
            data.families.forEach(function (f) {
                if (f.q && f.q.length === 3) {
                    qtyOf(f.g)[0] = clamp(f.q[0]);
                    qtyOf(f.g)[1] = clamp(f.q[1]);
                    qtyOf(f.g)[2] = clamp(f.q[2]);
                }
                n++;
            });
        }
        else { toast('导入失败：不是计算器导出的文件'); return; }

        if (!n) { toast('导入失败：没有能对上的材料'); return; }
        save();
        render();
        toast('已导入 ' + n + ' 族材料');
    }

    function doExport() {
        // 与 Darkmoon 计算器完全同构，它的「导入」按钮可直接选这份文件
        var numbers = [];
        families.forEach(function (f) {
            if (!f.dm) return;
            var q = qtyOf(f.g);
            numbers.push({ id: f.dm, numbers: [q[2], q[1], q[0]], lock: null });
        });
        numbers.sort(function (a, b) { return a.id - b.id; });

        var doc = {
            format: 'DARKMOON',
            currentID: 1,
            materialsNumbers: numbers,
            enemiesConfig: [],
            listOptions: { sortID: true, sortProgress: false, orderAscending: true, orderDescending: false, hideCompleted: false },
            craftOptions: { sucroseBonus: false, doriBonus: false, noneBonus: true },
            colorTheme: 'cyan',
            isWorldLevel9: true
        };

        download('LvchaxsBS-' + stamp() + '.json', JSON.stringify(doc));
        toast('已导出 ' + numbers.length + ' 族（Darkmoon 格式）');
    }

    function clamp(v) { return Math.max(0, Math.min(9999, parseInt(v, 10) || 0)); }

    function stamp() {
        var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
            '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    }

    function download(name, text) {
        var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        var a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    /* ================= 提示条 ================= */
    var toastEl = document.getElementById('toast');
    var toastTimer = 0;
    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
    }

    /* ================= Service Worker：离线 + 后台更新 ================= */
    var chip = document.getElementById('update-chip');
    var newWorker = null;

    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
        navigator.serviceWorker.register('js/sw.js').then(function (reg) {
            if (!reg) return;
            reg.addEventListener('updatefound', function () {
                newWorker = reg.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', function () {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        chip.hidden = false;
                    }
                });
            });
        }).catch(function () { });
    }

    chip.addEventListener('click', function () {
        if (!newWorker) { location.reload(); return; }
        newWorker.postMessage('SKIP_WAITING');
        newWorker.addEventListener('statechange', function () {
            if (newWorker.state === 'activated') location.reload();
        });
    });

    /* ================= 启动 ================= */
    syncSortButtons();
    render();
})();
