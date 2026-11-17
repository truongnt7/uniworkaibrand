# SPDX-License-Identifier: GPL-3.0-or-later
"""Áp trạng thái đã đánh giá (plan.state_at) lên cảnh Blender. Đặt trực tiếp giá trị cho từng khung
(không dùng keyframe của Blender) để dễ resume/bỏ qua khung đã render."""
import math

import plan


def apply(handles, state):
    rad = math.radians
    handles["pivot"].rotation_euler = (0.0, 0.0, rad(state["product_rot_deg"]))
    handles["rig"].rotation_euler = (0.0, 0.0, rad(state["cam_azimuth_deg"]))
    handles["camera"].location = plan.camera_offset(handles["distance"], state["cam_elevation_deg"], state["cam_distance_scale"])
    handles["key_pivot"].rotation_euler = (0.0, 0.0, rad(state["key_azimuth_deg"]))
    for name, key in (("key", "key_scale"), ("fill", "fill_scale"), ("rim", "rim_scale")):
        light = handles[name]
        light.data.energy = handles["base_energy"][name] * max(0.0, state[key])
