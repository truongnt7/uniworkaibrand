# SPDX-License-Identifier: GPL-3.0-or-later
"""Decal nhãn: chiếu `label.png` lên sản phẩm bằng node shader (không phụ thuộc UV/texture của model).

- cylinder: chiếu trụ quanh trục Z, bán kính ước từ chính đỉnh model ở vùng nhãn.
- flat: chiếu phẳng theo trục Y lên mặt hướng camera (-Y).
Nhãn là lớp trộn lên shader gốc nên giữ nguyên vật liệu thủy tinh/nhựa bên dưới.
"""
import math
import os

import bpy

from protocol import WorkerError
import protocol


def _estimate_radius(meshes, z_lo, z_hi):
    total, n = 0.0, 0
    for obj in meshes:
        for v in obj.data.vertices:
            if z_lo <= v.co.z <= z_hi:
                total += math.hypot(v.co.x, v.co.y)
                n += 1
    return (total / n) if n else 0.0


def _front_y(meshes, z_lo, z_hi, half_w):
    """Mặt trước (y nhỏ nhất, camera nhìn từ -Y) của model tại tâm vùng nhãn phẳng, bằng raycast; dùng cho lưới QC."""
    from mathutils import Vector

    best = None
    zc = (z_lo + z_hi) / 2.0
    for obj in meshes:
        ok, loc, _normal, _idx = obj.ray_cast(Vector((0.0, -10.0, zc)), Vector((0.0, 1.0, 0.0)))
        if ok:
            best = loc.y if best is None else min(best, loc.y)
    return best if best is not None else 0.0


def _mat_output(tree):
    for node in tree.nodes:
        if node.type == "OUTPUT_MATERIAL" and node.is_active_output:
            return node
    for node in tree.nodes:
        if node.type == "OUTPUT_MATERIAL":
            return node
    return None


def _math(tree, op, a=None, b=None, c=None):
    node = tree.nodes.new("ShaderNodeMath")
    node.operation = op
    for i, v in enumerate((a, b, c)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            node.inputs[i].default_value = v
        else:
            tree.links.new(v, node.inputs[i])
    return node.outputs[0]


def _build_nodes(mat, spec, image):
    tree = mat.node_tree
    out = _mat_output(tree)
    if out is None:
        return False
    surface = out.inputs["Surface"]
    base_link = surface.links[0] if surface.links else None
    base_socket = base_link.from_socket if base_link else None

    texcoord = tree.nodes.new("ShaderNodeTexCoord")
    sep = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])
    x, y, z = sep.outputs["X"], sep.outputs["Y"], sep.outputs["Z"]

    v = _math(tree, "DIVIDE", _math(tree, "SUBTRACT", z, spec["bottom"]), spec["height"])
    if spec["mode"] == "cylinder":
        neg_y = _math(tree, "MULTIPLY", y, -1.0)
        angle = _math(tree, "ARCTAN2", x, neg_y)
        delta = _math(tree, "WRAP", _math(tree, "SUBTRACT", angle, spec["center_rad"]), -math.pi, math.pi)
        u = _math(tree, "ADD", _math(tree, "MULTIPLY", delta, spec["radius"] / spec["width"]), 0.5)
    else:
        u = _math(tree, "ADD", _math(tree, "DIVIDE", x, spec["width"]), 0.5)

    combine = tree.nodes.new("ShaderNodeCombineXYZ")
    tree.links.new(u, combine.inputs["X"])
    tree.links.new(v, combine.inputs["Y"])

    tex = tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.extension = "CLIP"
    tex.interpolation = "Cubic"
    tree.links.new(combine.outputs["Vector"], tex.inputs["Vector"])

    alpha = tex.outputs["Alpha"]
    if spec["mode"] == "flat":
        geom = tree.nodes.new("ShaderNodeNewGeometry")
        vmath = tree.nodes.new("ShaderNodeVectorMath")
        vmath.operation = "DOT_PRODUCT"
        vmath.inputs[1].default_value = (0.0, -1.0, 0.0)
        tree.links.new(geom.outputs["Normal"], vmath.inputs[0])
        front = _math(tree, "GREATER_THAN", vmath.outputs["Value"], 0.5)
        alpha = _math(tree, "MULTIPLY", alpha, front)

    label_bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
    label_bsdf.inputs["Roughness"].default_value = 0.45
    tree.links.new(tex.outputs["Color"], label_bsdf.inputs["Base Color"])

    mix = tree.nodes.new("ShaderNodeMixShader")
    tree.links.new(alpha, mix.inputs["Fac"])
    if base_socket is not None:
        tree.links.new(base_socket, mix.inputs[1])
    tree.links.new(label_bsdf.outputs["BSDF"], mix.inputs[2])
    tree.links.new(mix.outputs["Shader"], surface)
    return True


def apply(job, meshes, dims):
    label = job["product"].get("label")
    if not label:
        return None
    path = label["imagePath"]
    if not os.path.isfile(path):
        raise WorkerError("LABEL_NOT_FOUND", "không thấy ảnh nhãn: %s" % path)
    image = bpy.data.images.load(path, check_existing=False)
    image.colorspace_settings.name = "sRGB"
    image.alpha_mode = "STRAIGHT"
    img_w, img_h = image.size

    height = dims["height"]
    mode = label.get("mode", "cylinder")
    bottom = (label["bottomMm"] / 1000.0) if label.get("bottomMm") is not None else height * 0.2
    label_h = (label["heightMm"] / 1000.0) if label.get("heightMm") else None
    label_w = (label["widthMm"] / 1000.0) if label.get("widthMm") else None
    if label_w and not label_h:
        label_h = label_w * img_h / img_w
    elif label_h and not label_w:
        label_w = label_h * img_w / img_h

    radius = _estimate_radius(meshes, bottom, bottom + (label_h or height * 0.4))
    if radius <= 0:
        radius = max(dims["width"], dims["depth"]) / 2.0
    if not label_w:
        label_w = math.pi * radius if mode == "cylinder" else dims["width"] * 0.6
        label_h = label_w * img_h / img_w

    if mode == "cylinder" and label_w > 2 * math.pi * radius:
        protocol.warning("LABEL_WRAP", "nhãn rộng hơn chu vi, sẽ bị cắt")

    spec = {
        "mode": mode,
        "bottom": bottom,
        "height": label_h,
        "width": label_w,
        "radius": radius,
        "center_rad": math.radians(label.get("centerDeg", 0.0)),
    }
    if mode == "flat":
        spec["front_y"] = _front_y(meshes, bottom, bottom + label_h, label_w / 2.0)
    patched = 0
    done = {}
    for obj in meshes:
        if not obj.data.materials:
            obj.data.materials.append(bpy.data.materials.new("product-default"))
            obj.data.materials[0].use_nodes = True
        for i, orig in enumerate(list(obj.data.materials)):
            if orig is None:
                continue
            if orig not in done:
                mat = orig.copy()
                mat.use_nodes = True
                if _build_nodes(mat, spec, image):
                    patched += 1
                done[orig] = mat
            obj.data.materials[i] = done[orig]
    protocol.log(
        "decal nhãn (%s): %.0fx%.0f mm, cách đáy %.0f mm, bán kính %.1f mm, %d vật liệu"
        % (mode, label_w * 1000, label_h * 1000, bottom * 1000, radius * 1000, patched)
    )
    return spec
