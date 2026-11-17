# SPDX-License-Identifier: GPL-3.0-or-later
"""Lưới chiếu nhãn → pixel khung hình, dùng cho QC nhãn (SSIM/OCR) phía app.

Với mỗi điểm (u, v) trên nhãn (cùng công thức với decal.py) tính: vị trí pixel trong khung (gốc trên-trái),
và `facing` = cos(góc giữa pháp tuyến bề mặt và hướng tới camera). App dùng lưới này để "nắn phẳng" vùng nhãn rồi so với label.png.
"""
import json
import math

from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


def _surface_point(spec, u, v):
    z = spec["bottom"] + v * spec["height"]
    if spec["mode"] == "cylinder":
        delta = (u - 0.5) * spec["width"] / spec["radius"]
        ang = spec["center_rad"] + delta
        s, c = math.sin(ang), math.cos(ang)
        return Vector((spec["radius"] * s, -spec["radius"] * c, z)), Vector((s, -c, 0.0))
    return Vector(((u - 0.5) * spec["width"], 0.0, z)), Vector((0.0, -1.0, 0.0))


def compute(scene, camera, obj, spec, cols=33, rows=17):
    width = scene.render.resolution_x * scene.render.resolution_percentage / 100.0
    height = scene.render.resolution_y * scene.render.resolution_percentage / 100.0
    mw = obj.matrix_world
    nm = mw.to_3x3()
    cam_pos = camera.matrix_world.translation
    px, py, facing = [], [], []
    for j in range(rows):
        v = 1.0 - j / (rows - 1)
        for i in range(cols):
            u = i / (cols - 1)
            p_local, n_local = _surface_point(spec, u, v)
            p = mw @ p_local
            n = (nm @ n_local).normalized()
            view = (cam_pos - p).normalized()
            co = world_to_camera_view(scene, camera, p)
            px.append(round(co.x * width, 2))
            py.append(round((1.0 - co.y) * height, 2))
            facing.append(round(n.dot(view), 4))
    return {"cols": cols, "rows": rows, "px": px, "py": py, "facing": facing}


def write(path, grid):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(grid, fh)
