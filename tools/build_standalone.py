# -*- coding: utf-8 -*-
"""
把整个计算器打成**一个 HTML 文件**（无任何外部依赖）。

用法：python tools/build_standalone.py
产物：dist/MaterialCalc.html

为什么需要它：页面本身没有服务器也能跑，但分成一个 .html + css/ + js/ + 156 张图标，
            直接发给别人会散架。这里把 CSS / JS / 数据 / 全部图标（转 base64 内嵌）
            塞进同一个 .html ⇒ 双击即用、断网可用、不受任何网络环境影响。

★ 必须有 https 才能用的东西（PWA 安装、Service Worker 自动更新提示）在 file:// 下
  自动不生效（app.js 里本来就有协议判断），页面功能不受影响，只是没有「自动更新」。
"""
import base64
import io
import os
import re
import json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 图标内嵌尺寸：界面上最大显示 28px（弹窗 26px），64 足够 2 倍屏清晰
ICON_SIZE = 64
ICON_QUALITY = 90
OUT_FILE = os.path.join(ROOT, "dist", "MaterialCalc.html")


def read_text(rel):
    with io.open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def load_data_json():
    """把 js/data.js 还原成 dict（它只有一行注释 + 一行赋值）。"""
    raw = read_text(os.path.join("js", "data.js"))
    body = raw.split("=", 1)[1].strip()
    if body.endswith(";"):
        body = body[:-1]
    return json.loads(body)


def make_data_uri(data, size, quality):
    """材料图标 → 缩到 size×size 的 WebP → base64 data URI。"""
    try:
        from PIL import Image
    except ImportError:
        # 没装 Pillow：不缩放，原样内嵌（体积大但能用）
        b64 = base64.b64encode(data).decode("ascii")
        return "data:image/webp;base64," + b64

    im = Image.open(io.BytesIO(data)).convert("RGBA")
    im = im.resize((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return "data:image/webp;base64," + b64


def inline_icons(data):
    """把 data 里所有 img 路径换成 data URI（图标文件在 icons/ 下）。"""
    n = 0
    total_src = 0
    total_out = 0
    missing = []
    for fam in data["families"]:
        for tier in fam["tiers"]:
            rel = tier["img"]
            path = os.path.join(ROOT, rel)
            if not os.path.exists(path):
                missing.append(rel)
                continue
            with open(path, "rb") as f:
                raw = f.read()
            total_src += len(raw)
            uri = make_data_uri(raw, ICON_SIZE, ICON_QUALITY)
            total_out += len(uri)
            tier["img"] = uri
            n += 1
    return n, total_src, total_out, missing


def build_html(data):
    html = read_text("index.html")
    css = read_text(os.path.join("css", "style.css"))
    app = read_text(os.path.join("js", "app.js"))

    # PWA 清单在 file:// 下必定 404，去掉（省得控制台一堆红字）
    html = html.replace('    <link rel="manifest" href="manifest.webmanifest">\n', "")

    html = html.replace(
        '<link rel="stylesheet" href="css/style.css">',
        "<style>\n%s</style>" % css.rstrip()
    )

    # 两个 script 合成一个：data.js 必须在 app.js 之前
    html = re.sub(
        r'<script src="js/data\.js"></script>\s*<script src="js/app\.js"></script>',
        lambda m: "<script>\n%s\nwindow.MATERIAL_DATA = %s;\n%s</script>"
        % (
            "/* 数据：由 tools/build_data.py 生成（图标已内嵌为 data URI） */",
            json.dumps(data, ensure_ascii=False, separators=(",", ":")),
            app.rstrip(),
        ),
        html,
    )

    return html


def main():
    data = load_data_json()
    n, src, out, missing = inline_icons(data)

    html = build_html(data)
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with io.open(OUT_FILE, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)

    size = os.path.getsize(OUT_FILE)
    print("图标内嵌：%d 张 → 原 %d KB，内嵌后 %d KB（含 base64 膨胀）"
          % (n, src // 1024, out // 1024))
    if missing:
        print("⚠ 缺失图标 %d 张：%s" % (len(missing), ", ".join(missing[:5])))
    print("产物：%s（%.0f KB）" % (OUT_FILE, size / 1024.0))


if __name__ == "__main__":
    main()
