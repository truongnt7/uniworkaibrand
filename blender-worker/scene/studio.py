# SPDX-License-Identifier: GPL-3.0-or-later
"""Dựng cảnh studio mềm: sàn vô cực, bục, đèn 3 điểm, camera rig.
Đơn vị: mét. Gốc tọa độ = tâm đáy sản phẩm; camera nhìn từ -Y."""
import math

import bpy
from mathutils import Vector

import job as jobmod
import plan

PEDESTAL_H = 0.03
CAMERA_ELEVATION_DEG = plan.DEFAULT_ELEVATION_DEG
FILL_RATIO_V = 0.66
FILL_RATIO_H = 0.62
FLOOR_EMISSION = 0.55
LIGHT_GAIN = 1.0


def _principled(color, roughness, metallic=0.0):
    mat = bpy.data.materials.new("studio-mat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def _floor_material(color, shadow):
    """Sàn vừa tự phát sáng vừa nhận bóng: hòa vào màu nền ở xa nhưng vẫn có bóng đổ quanh sản phẩm."""
    mat = bpy.data.materials.new("studio-floor")
    mat.use_nodes = True
    tree = mat.node_tree
    for n in list(tree.nodes):
        tree.nodes.remove(n)
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    diffuse = tree.nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (*color, 1.0)
    emit = tree.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (*color, 1.0)
    emit.inputs["Strength"].default_value = FLOOR_EMISSION
    mix = tree.nodes.new("ShaderNodeMixShader")
    mix.inputs["Fac"].default_value = 0.30 + 0.4 * (1.0 - shadow)
    tree.links.new(diffuse.outputs["BSDF"], mix.inputs[1])
    tree.links.new(emit.outputs["Emission"], mix.inputs[2])
    tree.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return mat


def _srgb_to_linear(c):
    return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def _light(name, kind, location, energy, size, color=(1, 1, 1), target=None):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = color
    if kind == "AREA":
        data.shape = "RECTANGLE"
        data.size = size[0]
        data.size_y = size[1]
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    if target is not None:
        con = obj.constraints.new("TRACK_TO")
        con.target = target
        con.track_axis = "TRACK_NEGATIVE_Z"
        con.up_axis = "UP_Y"
    return obj


def _empty(name, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    return obj


def build(scene, job, dims, meshes):
    """Trả về dict {pivot, rig, camera} để motion điều khiển."""
    bg = _srgb_to_linear(jobmod.parse_hex_color(job["scene"]["backgroundColor"]))
    shadow = job["scene"]["shadow"]
    width, height = job["render"]["width"], job["render"]["height"]
    prod_h = dims["height"]
    radius = max(dims["width"], dims["depth"]) / 2.0

    world = bpy.data.worlds.new("studio-world") if scene.world is None else scene.world
    scene.world = world
    world.use_nodes = True
    bg_node = world.node_tree.nodes["Background"]
    bg_node.inputs["Color"].default_value = (*bg, 1.0)
    bg_node.inputs["Strength"].default_value = 1.0 - 0.55 * shadow

    floor_z = -PEDESTAL_H
    bpy.ops.mesh.primitive_circle_add(vertices=96, radius=30.0, fill_type="NGON", location=(0, 0, floor_z))
    floor = bpy.context.object
    floor.name = "Floor"
    floor.data.materials.append(_floor_material(bg, shadow))

    ped_r = max(radius * 1.9, 0.07)
    ped_color = tuple(min(1.0, c * 1.02) for c in bg)
    bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=ped_r, depth=PEDESTAL_H, location=(0, 0, -PEDESTAL_H / 2))
    pedestal = bpy.context.object
    pedestal.name = "Pedestal"
    bpy.ops.object.shade_smooth()
    pedestal.data.materials.append(_principled(ped_color, 0.28))
    if "platform" in job["scene"].get("hide", []):
        pedestal.hide_render = True
        pedestal.hide_viewport = True

    pivot = _empty("ProductPivot")
    for obj in meshes:
        obj.parent = pivot

    rig = _empty("CameraRig", (0, 0, prod_h * 0.5))

    cam_data = bpy.data.cameras.new("StudioCamera")
    cam_data.lens = 85.0
    cam_data.sensor_width = 36.0
    cam_data.clip_start = 0.01
    cam_data.clip_end = 100.0
    cam = bpy.data.objects.new("StudioCamera", cam_data)
    scene.collection.objects.link(cam)
    cam.parent = rig
    scene.camera = cam

    aspect = width / height
    sensor_h = cam_data.sensor_width / aspect if aspect >= 1 else cam_data.sensor_width
    sensor_w = cam_data.sensor_width if aspect >= 1 else cam_data.sensor_width * aspect
    if aspect < 1:
        sensor_h = cam_data.sensor_width
        sensor_w = cam_data.sensor_width * aspect
    fov_v = 2 * math.atan(sensor_h / 2 / cam_data.lens)
    fov_h = 2 * math.atan(sensor_w / 2 / cam_data.lens)
    d_v = (prod_h / FILL_RATIO_V) / (2 * math.tan(fov_v / 2))
    d_h = ((radius * 2) / FILL_RATIO_H) / (2 * math.tan(fov_h / 2))
    dist = max(d_v, d_h, 0.12) + radius
    el = math.radians(CAMERA_ELEVATION_DEG)
    cam.location = (0, -dist * math.cos(el), dist * math.sin(el))
    track = cam.constraints.new("TRACK_TO")
    track.target = rig
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"

    bpy.context.view_layer.update()
    # Đèn 3 điểm gắn vào rig để ánh sáng đi theo camera khi orbit (phản xạ ổn định giữa các khung).
    key = _light("Key", "AREA", (-0.9 * dist, -0.8 * dist, prod_h * 1.4 + 0.2), LIGHT_GAIN * 11, (0.6 * dist, 0.6 * dist), target=rig)
    fill = _light("Fill", "AREA", (1.0 * dist, -0.7 * dist, prod_h * 0.6), LIGHT_GAIN * 5, (0.8 * dist, 0.8 * dist), target=rig)
    rim = _light("Rim", "AREA", (0.25 * dist, 1.3 * dist, prod_h * 1.1), LIGHT_GAIN * 40, (1.2 * dist, 0.3 * dist), color=(1.0, 0.96, 0.92), target=rig)
    # Đèn chính gắn vào một pivot con của rig để track `keyAzimuthDeg` quét đèn quanh sản phẩm.
    key_pivot = _empty("KeyPivot", rig.location)
    key_pivot.parent = rig
    key_pivot.matrix_parent_inverse = rig.matrix_world.inverted()
    bpy.context.view_layer.update()
    base_energy = {"key": key.data.energy, "fill": fill.data.energy, "rim": rim.data.energy}
    for light in (key, fill, rim):
        light.parent = key_pivot if light is key else rig
        light.matrix_parent_inverse = (key_pivot if light is key else rig).matrix_world.inverted()
        light.data.use_shadow = True
        light.data.use_custom_distance = True
        light.data.cutoff_distance = 60.0
    # Đèn viền chỉ chiếu sản phẩm + bục (light linking), nếu không sẽ để lại mép sáng trên sàn.
    rim_targets = bpy.data.collections.new("RimReceivers")
    scene.collection.children.link(rim_targets)
    for obj in list(meshes) + [pedestal]:
        rim_targets.objects.link(obj)
    rim.light_linking.receiver_collection = rim_targets
    key.data.shadow_soft_size = 0.08 + 0.12 * (1 - shadow)

    return {
        "pivot": pivot,
        "rig": rig,
        "camera": cam,
        "distance": dist,
        "key": key,
        "fill": fill,
        "rim": rim,
        "key_pivot": key_pivot,
        "base_energy": base_energy,
        "product_height": prod_h,
        "sensor": (sensor_w, sensor_h, cam_data.lens),
    }
