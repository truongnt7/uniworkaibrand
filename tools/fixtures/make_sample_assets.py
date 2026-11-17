# SPDX-License-Identifier: CC0-1.0
"""Sinh tài sản mẫu tự tạo (CC0) cho PoC: chai serum .glb + label.png + logo.png.

    blender -b --factory-startup --python tools/fixtures/make_sample_assets.py -- assets/samples

Không dùng model/ảnh của bên thứ ba nên không vướng giấy phép. Font DejaVu (giấy phép tự do) chỉ dùng để vẽ chữ lên ảnh.
"""
import math
import os
import sys

import bmesh
import bpy

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "assets/samples"
os.makedirs(OUT, exist_ok=True)
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def lathe(name, profile, steps=96):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0.0, z)) for r, z in profile]
    for a, b in zip(verts, verts[1:]):
        bm.edges.new((a, b))
    bmesh.ops.spin(bm, geom=list(bm.verts) + list(bm.edges), cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=steps)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for p in mesh.polygons:
        p.use_smooth = True
    return obj


def material(name, color, roughness, metallic=0.0, transmission=0.0, ior=1.45, coat=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = roughness
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Transmission Weight"].default_value = transmission
    b.inputs["IOR"].default_value = ior
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = 0.02
    return mat


def arc(cx, cz, r, a0, a1, n):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cz + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def make_bottle():
    reset()
    R = 0.030
    fillet = 0.006
    body = [(0.0, 0.0)] + arc(R - fillet, fillet, fillet, -90, 0, 6)[0:] + [(R, 0.090)]
    body += arc(R - 0.012, 0.090, 0.012, 0, 90, 8)[1:]  # vai chai
    body += [(0.0125, 0.102), (0.0125, 0.112)]
    glass = lathe("Body", body)
    glass.data.materials.append(material("Glass amber", (0.34, 0.12, 0.02), 0.16, ior=1.5, coat=1.0))

    collar = lathe("Collar", [(0.0145, 0.110), (0.0145, 0.1235), (0.0120, 0.1235), (0.0120, 0.110)])
    collar.data.materials.append(material("Gold collar", (0.83, 0.62, 0.25), 0.22, metallic=1.0))

    bulb_profile = [(0.0105, 0.1235), (0.0105, 0.133)] + arc(0.0, 0.133, 0.0105, 0, 90, 10)[1:]
    bulb = lathe("Bulb", bulb_profile)
    bulb.data.materials.append(material("Rubber black", (0.02, 0.02, 0.02), 0.55))

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "serum-bottle.glb"), export_format="GLB", export_apply=True)


def lin(c):
    return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def text_obj(text, size, location, color, font_path, align="CENTER"):
    curve = bpy.data.curves.new("t", "FONT")
    curve.body = text
    curve.size = size
    curve.align_x = align
    curve.align_y = "CENTER"
    curve.font = bpy.data.fonts.load(font_path)
    obj = bpy.data.objects.new("t", curve)
    obj.location = location
    obj.color = (*lin(color), 1)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def rect(w, h, location, color):
    bpy.ops.mesh.primitive_plane_add(size=1, location=location)
    obj = bpy.context.object
    obj.scale = (w, h, 1)
    obj.color = (*lin(color), 1)
    return obj


def render_flat(path, w_px, h_px, w_u, h_u):
    sc = bpy.context.scene
    cam_data = bpy.data.cameras.new("c")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = max(w_u, h_u)
    cam = bpy.data.objects.new("c", cam_data)
    cam.location = (0, 0, 5)
    sc.collection.objects.link(cam)
    sc.camera = cam
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "FLAT"
    sc.display.shading.color_type = "OBJECT"
    sc.display.render_aa = "32"
    sc.render.film_transparent = True
    sc.render.dither_intensity = 0.0
    sc.render.resolution_x, sc.render.resolution_y = w_px, h_px
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "Standard"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def make_label():
    reset()
    W, H = 0.94, 0.60
    rect(W, H, (0, 0, 0), (0.96, 0.92, 0.84))
    rect(W, 0.10, (0, -H / 2 + 0.05, 0.01), (0.12, 0.30, 0.25))
    rect(0.06, H, (-W / 2 + 0.03, 0, 0.01), (0.80, 0.55, 0.15))
    text_obj("AURA", 0.19, (0.02, 0.17, 0.02), (0.12, 0.30, 0.25), FONT_BOLD)
    text_obj("VITAMIN C SERUM", 0.062, (0.02, 0.02, 0.02), (0.30, 0.22, 0.12), FONT_BOLD)
    text_obj("Làm sáng da · Phục hồi", 0.050, (0.02, -0.08, 0.02), (0.30, 0.22, 0.12), FONT_REG)
    text_obj("30 ml · 1.0 fl.oz", 0.045, (0.02, -0.22, 0.02), (0.96, 0.92, 0.84), FONT_BOLD)
    render_flat(os.path.join(OUT, "label.png"), 1410, 900, W, H)


def make_logo():
    reset()
    text_obj("AURA", 0.5, (0, 0, 0), (1.0, 1.0, 1.0), FONT_BOLD)
    text_obj("Skincare", 0.16, (0, -0.4, 0), (0.95, 0.80, 0.45), FONT_REG)
    render_flat(os.path.join(OUT, "logo.png"), 800, 360, 2.2, 1.0)


if __name__ == "__main__":
    make_bottle()
    make_label()
    make_logo()
    print("OK", os.listdir(OUT))
