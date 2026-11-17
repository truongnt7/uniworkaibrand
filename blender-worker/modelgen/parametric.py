# SPDX-License-Identifier: GPL-3.0-or-later
"""Model tham số v0 (P0-10): chai/lọ/lon bằng lathe từ silhouette, hộp 6 mặt; xuất .glb đúng kích thước mm.

    blender -b --factory-startup --python blender-worker/modelgen/parametric.py -- spec.json out_dir

spec.json: danh sách {"name", "type": "lathe"|"box", ...}
  lathe: "profile": [[r_mm, z_mm], ...] (silhouette nửa mặt cắt, z tăng dần từ đáy), "segments" (mặc định 96)
  box:   "widthMm", "depthMm", "heightMm"
Kết quả: <name>.glb và report.json (kích thước đo lại từ mesh đã xuất, sai số % so với kích thước nhập).
Chạy hoàn toàn local, không mạng.
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector


def _reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _link(name, bm):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def build_lathe(name, profile_mm, segments=96):
    if len(profile_mm) < 2:
        raise ValueError("profile cần >= 2 điểm")
    last_z = -1.0
    for r, z in profile_mm:
        if r < 0 or z < last_z:
            raise ValueError("profile: r >= 0 và z không giảm")
        last_z = z
    bm = bmesh.new()
    pts = [(r / 1000.0, z / 1000.0) for r, z in profile_mm]
    if pts[0][0] > 1e-9:
        pts.insert(0, (0.0, pts[0][1]))
    if pts[-1][0] > 1e-9:
        pts.append((0.0, pts[-1][1]))
    verts = [bm.verts.new((r, 0.0, z)) for r, z in pts]
    for a, b in zip(verts, verts[1:]):
        bm.edges.new((a, b))
    bmesh.ops.spin(bm, geom=list(bm.verts) + list(bm.edges), cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=segments)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _link(name, bm)


def build_box(name, w_mm, d_mm, h_mm):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * w_mm / 1000.0, v.co.y * d_mm / 1000.0, (v.co.z + 0.5) * h_mm / 1000.0))
    return _link(name, bm)


def expected_dims_mm(spec):
    if spec["type"] == "box":
        return {"widthMm": spec["widthMm"], "depthMm": spec["depthMm"], "heightMm": spec["heightMm"]}
    dia = 2 * max(r for r, _ in spec["profile"])
    zs = [z for _, z in spec["profile"]]
    return {"widthMm": dia, "depthMm": dia, "heightMm": max(zs) - min(zs)}


def run(specs, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    report = []
    for spec in specs:
        _reset()
        if spec["type"] == "box":
            obj = build_box(spec["name"], spec["widthMm"], spec["depthMm"], spec["heightMm"])
        else:
            obj = build_lathe(spec["name"], spec["profile"], spec.get("segments", 96))
        path = os.path.join(out_dir, spec["name"] + ".glb")
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_apply=True)
        want = expected_dims_mm(spec)
        # Đọc lại chính file .glb đã xuất để đo (tránh đo mesh trong bộ nhớ khác với thứ ghi ra).
        _reset()
        bpy.ops.import_scene.gltf(filepath=path)
        meshes = [o for o in bpy.data.objects if o.type == "MESH"]
        bpy.context.view_layer.update()
        lo = [1e9] * 3
        hi = [-1e9] * 3
        for o in meshes:
            for v in o.data.vertices:
                w = o.matrix_world @ v.co
                for i in range(3):
                    lo[i] = min(lo[i], w[i])
                    hi[i] = max(hi[i], w[i])
        # glTF là Y-up: import_scene.gltf đã đổi về Z-up của Blender, nên trục khớp với lúc dựng.
        got = {"widthMm": (hi[0] - lo[0]) * 1000, "depthMm": (hi[1] - lo[1]) * 1000, "heightMm": (hi[2] - lo[2]) * 1000}
        errs = {k: abs(got[k] - want[k]) / want[k] * 100 for k in want}
        report.append({"name": spec["name"], "type": spec["type"], "expectedMm": want, "measuredMm": got, "errorPct": errs, "maxErrorPct": max(errs.values()), "glb": path, "bytes": os.path.getsize(path)})
    with open(os.path.join(out_dir, "report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=1)
    return report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(args) != 2:
        raise SystemExit("dùng: ... -- spec.json out_dir")
    with open(args[0], "r", encoding="utf-8") as fh:
        rep = run(json.load(fh), args[1])
    for r in rep:
        print("MODEL %-12s max sai số %.3f%%" % (r["name"], r["maxErrorPct"]))
