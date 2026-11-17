# SPDX-License-Identifier: CC0-1.0
"""Bộ 10 sản phẩm tổng hợp (CC0) để hiệu chỉnh/kiểm QC nhãn: chai, lọ, ống, hộp với nhãn khác nhau.

    blender -b --factory-startup --python tools/fixtures/make_qc_suite.py -- /tmp/qc-suite

KHÔNG phải "10 sản phẩm thực" của P0-09: chỉ chứng minh pipeline QC chạy và phân biệt đúng/sai; cần ảnh sản phẩm thật của đối tác để nghiệm thu.
"""
import json
import math
import os
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_sample_assets as base  # noqa: E402

OUT = base.OUT
os.makedirs(OUT, exist_ok=True)

PAL = [
    ((0.96, 0.92, 0.84), (0.12, 0.30, 0.25)),
    ((0.98, 0.98, 0.98), (0.10, 0.20, 0.55)),
    ((0.15, 0.15, 0.17), (0.95, 0.80, 0.40)),
    ((0.99, 0.90, 0.92), (0.65, 0.12, 0.30)),
    ((0.92, 0.96, 0.88), (0.20, 0.45, 0.15)),
]

# name, kind, radius_mm, height_mm, label(width_mm,height_mm,bottom_mm,center_deg), texts, material
PRODUCTS = [
    ("serum30", "bottle", 15, 96, (50, 32, 18, 0), ("AURA", "VITAMIN C SERUM", "30 ml"), ("glass", (0.34, 0.12, 0.02))),
    ("toner120", "bottle", 24, 150, (90, 70, 30, 0), ("LUMI", "HYDRA TONER", "120 ml"), ("plastic", (0.95, 0.95, 0.97))),
    ("cream50", "jar", 32, 55, (110, 30, 12, 0), ("VELA", "NIGHT CREAM", "50 g"), ("plastic", (0.85, 0.80, 0.72))),
    ("lotion250", "bottle", 28, 190, (95, 90, 45, 0), ("NOVA", "BODY LOTION", "250 ml"), ("plastic", (0.20, 0.45, 0.60))),
    ("tube100", "tube", 20, 140, (60, 80, 20, 0), ("SOLE", "SUN CREAM SPF50", "100 ml"), ("plastic", (0.97, 0.80, 0.30))),
    ("can330", "can", 33, 122, (100, 70, 25, 0), ("ZEST", "SPARKLING TEA", "330 ml"), ("metal", (0.78, 0.78, 0.80))),
    ("bottle500", "bottle", 33, 205, (105, 85, 50, 20), ("PURA", "MINERAL WATER", "500 ml"), ("plastic", (0.80, 0.90, 0.96))),
    ("jar200", "jar", 40, 85, (125, 45, 15, -15), ("MIEL", "HONEY NATURAL", "200 g"), ("glass", (0.60, 0.40, 0.08))),
    ("box_soap", "box", 0, 0, None, ("SAPO", "HERBAL SOAP", "100 g"), ("plastic", (0.90, 0.88, 0.80))),
    ("box_tea", "box", 0, 0, None, ("CHA", "GREEN TEA", "20 bags"), ("plastic", (0.85, 0.92, 0.82))),
]


def lathe_profile(kind, r, h):
    r, h = r / 1000.0, h / 1000.0
    f = min(r * 0.2, 0.006)
    if kind == "bottle":
        body = [(0.0, 0.0)] + base.arc(r - f, f, f, -90, 0, 6) + [(r, h * 0.66)]
        body += base.arc(r * 0.45 + r * 0.55 * 0.0, h * 0.66, r * 0.55, 0, 80, 8)[1:]
        body += [(r * 0.30, h * 0.94), (r * 0.30, h)]
        return body
    if kind == "jar":
        return [(0.0, 0.0)] + base.arc(r - f, f, f, -90, 0, 6) + [(r, h - f)] + base.arc(r - f, h - f, f, 0, 90, 6)[1:] + [(0.0, h)]
    if kind == "can":
        return [(0.0, 0.0), (r - 0.002, 0.0), (r, 0.003), (r, h - 0.006), (r - 0.004, h - 0.002), (r - 0.004, h), (0.0, h)]
    return [(0.0, 0.0), (r, 0.0), (r, h * 0.9), (r * 0.5, h * 0.96), (r * 0.5, h)]  # tube


def make_label(name, palette, texts, w_mm, h_mm):
    base.reset()
    ratio = w_mm / h_mm
    W, H = 1.0, 1.0 / ratio
    bg, fg = palette
    base.rect(W, H, (0, 0, 0), bg)
    base.rect(W, H * 0.14, (0, -H / 2 + H * 0.07, 0.01), fg)
    base.rect(W * 0.05, H, (-W / 2 + W * 0.025, 0, 0.01), (0.80, 0.55, 0.15))
    base.text_obj(texts[0], H * 0.30, (W * 0.02, H * 0.22, 0.02), fg, base.FONT_BOLD)
    base.text_obj(texts[1], H * 0.105, (W * 0.02, H * 0.00, 0.02), fg, base.FONT_BOLD)
    base.text_obj(texts[2], H * 0.085, (W * 0.02, -H * 0.31 + H * 0.0, 0.02), bg, base.FONT_BOLD)
    path = os.path.join(OUT, name + "-label.png")
    base.render_flat(path, 1200, int(1200 / ratio), W, H)
    return path


def export(name):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + ".glb"), export_format="GLB", export_apply=True)


def make_box(name, mat):
    base.reset()
    w, d, h = 0.070, 0.045, 0.110
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, h / 2))
    obj = bpy.context.object
    obj.scale = (w, d, h)
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(base.material("box", mat[1], 0.5))
    export(name)
    return {"widthMm": 55, "heightMm": 70, "bottomMm": 20}


suite = []
for i, (name, kind, r, h, lab, texts, mat) in enumerate(PRODUCTS):
    palette = PAL[i % len(PAL)]
    if kind == "box":
        spec = make_box(name, mat)
        label_png = make_label(name, palette, texts, spec["widthMm"], spec["heightMm"])
        suite.append({"name": name, "glb": name + ".glb", "label": os.path.basename(label_png), "mode": "flat", "centerDeg": 0, "expected": " ".join(texts[:2]), **spec, "heightProductMm": 110})
        continue
    base.reset()
    obj = base.lathe(name, lathe_profile(kind, r, h))
    kindmat, color = mat
    obj.data.materials.append(
        base.material(name, color, {"glass": 0.12, "plastic": 0.35, "metal": 0.30}[kindmat], metallic=1.0 if kindmat == "metal" else 0.0, transmission=0.0, coat=1.0 if kindmat == "glass" else 0.0)
    )
    export(name)
    w, hh, bottom, center = lab
    label_png = make_label(name, palette, texts, w, hh)
    suite.append({"name": name, "glb": name + ".glb", "label": os.path.basename(label_png), "mode": "cylinder", "centerDeg": center, "expected": " ".join(texts[:2]), "widthMm": w, "heightMm": hh, "bottomMm": bottom, "heightProductMm": h})

with open(os.path.join(OUT, "suite.json"), "w", encoding="utf-8") as fh:
    json.dump(suite, fh, indent=1)
print("OK", len(suite))
