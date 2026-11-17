# SPDX-License-Identifier: GPL-3.0-or-later
"""Chuyển động xoay: `orbit` quay camera quanh sản phẩm, `spin360` xoay sản phẩm tại chỗ.
Đặt trực tiếp góc cho từng khung (không dùng keyframe) để dễ resume/bỏ qua khung đã render."""
import math


def apply_angle(rig_objects, motion, angle_deg):
    rad = math.radians(angle_deg)
    if motion == "orbit":
        rig_objects["rig"].rotation_euler = (0.0, 0.0, rad)
    else:
        rig_objects["pivot"].rotation_euler = (0.0, 0.0, rad)
