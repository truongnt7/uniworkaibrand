# SPDX-License-Identifier: GPL-3.0-or-later
"""Chữ overlay (track text) dựng bằng vật thể chữ của Blender gắn vào camera, shader phát sáng + độ trong suốt theo thời gian.
Chữ do người dùng nhập (không do LLM sinh); font mặc định là Inter đi kèm Blender (hỗ trợ tiếng Việt)."""
import os

import bpy

import job as jobmod
import plan

TEXT_DISTANCE_RATIO = 0.2  # khoảng cách tới camera, theo tỉ lệ khoảng cách camera-sản phẩm (luôn nằm trước sản phẩm kể cả khi dolly vào)
POSITION_Y = {"top_center": 0.36, "center": 0.0, "bottom_center": -0.36}
MAX_WIDTH_RATIO = 0.9
FONT_FILES = ("Inter.woff2", "DejaVuSansMono.woff2")


def _srgb_to_linear(c):
    return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def _font():
    base = bpy.utils.system_resource("DATAFILES", path="fonts")
    for name in FONT_FILES:
        path = os.path.join(base, name) if base else ""
        if path and os.path.isfile(path):
            try:
                return bpy.data.fonts.load(path)
            except Exception:  # noqa: BLE001 - font hỏng thì dùng font mặc định của Blender
                return None
    return None


def _material(color):
    mat = bpy.data.materials.new("overlay-text")
    mat.use_nodes = True
    tree = mat.node_tree
    for n in list(tree.nodes):
        tree.nodes.remove(n)
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    emit = tree.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (*_srgb_to_linear(color), 1.0)
    emit.inputs["Strength"].default_value = 1.0
    clear = tree.nodes.new("ShaderNodeBsdfTransparent")
    mix = tree.nodes.new("ShaderNodeMixShader")
    mix.inputs["Fac"].default_value = 0.0
    tree.links.new(clear.outputs["BSDF"], mix.inputs[1])
    tree.links.new(emit.outputs["Emission"], mix.inputs[2])
    tree.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED"
    else:
        mat.blend_method = "BLEND"
    mat.use_backface_culling = False
    return mat, mix


def build(scene, job, handles):
    """Tạo vật thể chữ cho từng overlay text của job v2; job v1 không có chữ."""
    overlays = (job.get("overlays") or {}).get("text", [])
    if not overlays:
        return []
    sensor_w, sensor_h, lens = handles["sensor"]
    dist = handles["distance"] * TEXT_DISTANCE_RATIO
    frame_w = dist * sensor_w / lens
    frame_h = dist * sensor_h / lens
    font = _font()
    items = []
    for i, ov in enumerate(overlays):
        curve = bpy.data.curves.new("text-%d" % i, "FONT")
        curve.body = ov["text"]
        curve.align_x = "CENTER"
        curve.align_y = "CENTER"
        curve.size = frame_h * ov["sizePct"] / 100.0
        if font is not None:
            curve.font = font
        obj = bpy.data.objects.new("Text%d" % i, curve)
        scene.collection.objects.link(obj)
        obj.parent = handles["camera"]
        obj.location = (0.0, POSITION_Y[ov["position"]] * frame_h, -dist)
        obj.visible_shadow = False
        obj.visible_glossy = False
        mat, mix = _material(jobmod.parse_hex_color(ov["color"]))
        curve.materials.append(mat)
        bpy.context.view_layer.update()
        width = obj.dimensions.x
        if width > frame_w * MAX_WIDTH_RATIO > 0:
            curve.size *= frame_w * MAX_WIDTH_RATIO / width
        items.append({"obj": obj, "mix": mix, "overlay": ov, "y0": obj.location.y, "frame_h": frame_h})
    return items


def update(items, t):
    for it in items:
        alpha, slide = plan.text_state(it["overlay"], t)
        it["obj"].hide_render = alpha <= 0.0
        it["mix"].inputs["Fac"].default_value = alpha
        loc = it["obj"].location
        it["obj"].location = (loc.x, it["y0"] - slide * plan.TEXT_SLIDE * it["frame_h"], loc.z)
