# -*- coding: utf-8 -*-
"""
生成 js/data.js（材料数据表）+ 拷贝 156 张彩色图标 + 生成 PWA 图标。

用法：python tools/build_data.py
数据源：LvchaxsBS/Resources/Materials/materials-index.txt（156 行）
        LvchaxsBS 那边族号 → Darkmoon 计算器 id 的映射表（见下面的 DARKMOON_ID）
"""
import io
import os
import json
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 材料图标源：桌面「图像资源\去除背景」里的无背景版（156 张，文件名与索引表一致）
SRC_INDEX = r"D:/C#/LvchaxsBS/LvchaxsBS/Resources/Materials/materials-index.txt"
SRC_ICONS = r"C:/Users/Lvchaxs/Desktop/图像资源/去除背景"
OUT_ICONS = os.path.join(ROOT, "icons")

# 族号 → Darkmoon 计算器 materialsNumbers 的 id（1~52，与本项目 001~033 / 067~085 的对应关系）
DARKMOON_ID = {
    1: 5, 2: 6, 3: 7, 4: 8, 5: 9, 6: 13, 7: 15, 8: 16, 9: 18, 10: 19, 11: 21,
    12: 23, 13: 24, 14: 25, 15: 26, 16: 29, 17: 30, 18: 31, 19: 32, 20: 33,
    21: 36, 22: 37, 23: 38, 24: 39, 25: 40, 26: 43, 27: 44, 28: 45, 29: 46,
    30: 47, 31: 48, 32: 51, 33: 52,
    67: 1, 68: 2, 69: 3, 70: 4, 71: 10, 72: 11, 73: 12, 74: 14, 75: 17,
    76: 20, 77: 22, 78: 27, 79: 28, 80: 34, 81: 35, 82: 41, 83: 42, 84: 49,
    85: 50,
}

# 三档默认目标数量：[最高档, 中等, 最低档]
DEFAULT_TARGETS = [6, 30, 129]

DATA_VERSION = "1.0.0"


def load_families():
    """读索引表 → [{g, kind, monster, dm, tiers:[{n,img}]}]"""
    groups = {}
    with io.open(SRC_INDEX, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\r\n")
            if not line or line.startswith("#"):
                continue
            cols = line.split("\t")
            if len(cols) < 6 or not cols[0].isdigit():
                continue
            g = int(cols[0])
            inner = int(cols[1])
            kind = cols[2]
            name = cols[3]
            file_name = cols[4]
            monster = cols[5]

            fam = groups.setdefault(g, {"g": g, "kind": kind, "monster": monster,
                                        "dm": DARKMOON_ID.get(g, 0), "tiers": {}})
            fam["tiers"][inner] = {"n": name, "img": "icons/" + file_name[:-4] + ".webp"}

    result = []
    for g in sorted(groups):
        fam = groups[g]
        tiers = [fam["tiers"][i] for i in (1, 2, 3) if i in fam["tiers"]]
        if len(tiers) != 3:
            continue
        result.append({
            "g": g,
            "kind": fam["kind"],
            "monster": fam["monster"],
            "dm": fam["dm"],
            "tiers": tiers,
        })
    return result


def copy_icons():
    """把材料图标转成网页用的小图放进 icons/。

    源图是 200×200 的 PNG（156 张 ≈ 4.7MB，手机打开太重），
    这里统一缩到 100×100 另存为 WebP（≈ 1/10 体积），页面里用的是生成后的小图。
    """
    try:
        from PIL import Image
    except ImportError:
        return copy_icons_raw()

    os.makedirs(OUT_ICONS, exist_ok=True)
    n = 0
    for fn in sorted(os.listdir(SRC_ICONS)):
        if not fn.lower().endswith(".png"):
            continue
        dst = os.path.join(OUT_ICONS, fn[:-4] + ".webp")
        if os.path.exists(dst):
            continue
        with Image.open(os.path.join(SRC_ICONS, fn)) as im:
            im = im.convert("RGBA").resize((100, 100), Image.LANCZOS)
            im.save(dst, "WEBP", quality=88)
        n += 1
    return n


def copy_icons_raw():
    """没装 Pillow 时的退路：原样拷贝 PNG（体积大但能跑）。"""
    os.makedirs(OUT_ICONS, exist_ok=True)
    n = 0
    for fn in sorted(os.listdir(SRC_ICONS)):
        if not fn.lower().endswith(".png"):
            continue
        src = os.path.join(SRC_ICONS, fn)
        dst = os.path.join(OUT_ICONS, fn)
        if os.path.exists(dst) and os.path.getsize(dst) == os.path.getsize(src):
            continue
        shutil.copy2(src, dst)
        n += 1
    return n


def make_app_icons():
    """生成 PWA 用的 192 / 512 图标（雾霾青底 + 白字「材」）。"""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return 0

    made = 0
    for size in (192, 512):
        img = Image.new("RGB", (size, size), "#8FAEA6")
        d = ImageDraw.Draw(img)
        font = None
        for path in (r"C:/Windows/Fonts/msyh.ttc", r"C:/Windows/Fonts/simhei.ttf"):
            if os.path.exists(path):
                font = ImageFont.truetype(path, int(size * 0.56))
                break
        text = "材"
        if font:
            bbox = d.textbbox((0, 0), text, font=font)
            w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
            d.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]),
                   text, font=font, fill="#FFFFFF")
        else:
            d.ellipse([size * 0.25, size * 0.25, size * 0.75, size * 0.75],
                      outline="#FFFFFF", width=int(size * 0.06))
        out = os.path.join(ROOT, "icons", "app-%d.png" % size)
        img.save(out, "PNG")
        made += 1
    return made


def write_data(families):
    body = json.dumps({
        "version": DATA_VERSION,
        "defaultTargets": DEFAULT_TARGETS,
        "families": families,
    }, ensure_ascii=False, separators=(",", ":"))
    out = os.path.join(ROOT, "js", "data.js")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with io.open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write("/* 自动生成，勿手改：改数据请改 materials-index.txt 后跑 tools/build_data.py */\n")
        f.write("window.MATERIAL_DATA = %s;\n" % body)
    return out


def main():
    families = load_families()
    print("族数：%d" % len(families))
    with_dm = sum(1 for f in families if f["dm"])
    print("有 Darkmoon id 的：%d" % with_dm)
    print("图标新增：%d" % copy_icons())
    print("PWA 图标：%d" % make_app_icons())
    print("数据文件：%s" % write_data(families))


if __name__ == "__main__":
    main()
