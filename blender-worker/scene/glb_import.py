# SPDX-License-Identifier: GPL-3.0-or-later
"""Nhập .glb, kiểm giới hạn, chuẩn hóa tỉ lệ/pivot (đáy giữa = gốc tọa độ, đơn vị mét)."""
import os

import bpy
from mathutils import Matrix, Vector

import protocol
from protocol import WorkerError

MIN_REASONABLE_H = 0.01
MAX_REASONABLE_H = 1.0
FALLBACK_HEIGHT = 0.15


def clear_scene():
    bpy.ops.object.select_all(action="DESELECT")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.lights, bpy.data.cameras):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


def _triangle_count(obj):
    return sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)


def import_glb(job):
    path = job["product"]["glbPath"]
    limits = job["limits"]
    if not os.path.isfile(path):
        raise WorkerError("GLB_NOT_FOUND", "không thấy file .glb: %s" % path)
    size = os.path.getsize(path)
    if size > limits["maxGlbBytes"]:
        raise WorkerError("GLB_TOO_LARGE", "file .glb %d byte vượt giới hạn %d" % (size, limits["maxGlbBytes"]))
    ext = os.path.splitext(path)[1].lower()
    if ext not in (".glb", ".gltf"):
        raise WorkerError("GLB_IMPORT_FAILED", "chỉ nhận .glb/.gltf (không nhận .blend)")

    before = set(bpy.data.objects)
    try:
        bpy.ops.import_scene.gltf(filepath=path)
    except Exception as exc:  # noqa: BLE001 - importer ném nhiều loại lỗi
        raise WorkerError("GLB_IMPORT_FAILED", "không nhập được .glb", detail=str(exc))
    new_objects = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new_objects if o.type == "MESH"]
    if not meshes:
        raise WorkerError("GLB_EMPTY", "file .glb không có mesh")

    tris = sum(_triangle_count(o) for o in meshes)
    if tris > limits["maxTriangles"]:
        raise WorkerError("GLB_TOO_COMPLEX", "%d tam giác vượt giới hạn %d" % (tris, limits["maxTriangles"]))
    protocol.log("đã nhập %d mesh, %d tam giác" % (len(meshes), tris))
    return new_objects, meshes


def _bounds(meshes):
    lo = Vector((1e30, 1e30, 1e30))
    hi = Vector((-1e30, -1e30, -1e30))
    for obj in meshes:
        for v in obj.data.vertices:
            w = obj.matrix_world @ v.co
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
    return lo, hi


def normalize(new_objects, meshes, size_mm):
    """Bỏ phân cấp, bake transform vào mesh, đặt đáy giữa tại gốc, scale theo kích thước thật."""
    bpy.context.view_layer.update()
    for obj in meshes:
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
    for obj in new_objects:
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)

    for obj in meshes:
        if obj.data.users > 1:
            obj.data = obj.data.copy()
        obj.data.transform(obj.matrix_world)
        obj.matrix_world = Matrix.Identity(4)
    bpy.context.view_layer.update()

    lo, hi = _bounds(meshes)
    height = hi.z - lo.z
    if height <= 0:
        raise WorkerError("GLB_EMPTY", "model có chiều cao bằng 0")

    if size_mm:
        scale = (size_mm["height"] / 1000.0) / height
    elif MIN_REASONABLE_H <= height <= MAX_REASONABLE_H:
        scale = 1.0
    else:
        scale = FALLBACK_HEIGHT / height
        protocol.warning("AUTO_SCALE", "kích thước model %.4f m bất thường, tự scale về %.2f m" % (height, FALLBACK_HEIGHT))

    center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    xform = Matrix.Scale(scale, 4) @ Matrix.Translation(-center)
    for obj in meshes:
        obj.data.transform(xform)
        obj.data.update()
    bpy.context.view_layer.update()

    lo, hi = _bounds(meshes)
    dims = {"width": hi.x - lo.x, "depth": hi.y - lo.y, "height": hi.z - lo.z}
    protocol.log("kích thước sau chuẩn hóa (mm): %.1f x %.1f x %.1f" % tuple(v * 1000 for v in (dims["width"], dims["depth"], dims["height"])))
    if size_mm:
        for k in ("width", "depth"):
            want = size_mm[k] / 1000.0
            if want > 0 and abs(dims[k] - want) / want > 0.05:
                protocol.warning("SIZE_MISMATCH", "%s thực tế %.1f mm khác khai báo %.1f mm" % (k, dims[k] * 1000, size_mm[k]))
    return dims
