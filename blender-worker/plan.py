# SPDX-License-Identifier: GPL-3.0-or-later
"""Đánh giá trạng thái cảnh theo thời gian từ job đã kiểm tra. Thuần Python (không bpy) nên test được ngoài Blender.

Job v2: nội suy keyframe của từng track. Job v1: suy ra cùng một cấu trúc trạng thái từ `motion` + `frames`.
Mọi giá trị đều tất định theo (job, khung) nên resume/bỏ qua khung đã render cho kết quả y hệt."""
import math

DEFAULT_ELEVATION_DEG = 11.0
TEXT_FADE_IN_S = 0.5
TEXT_FADE_OUT_S = 0.3
TEXT_SLIDE = 0.04  # độ trượt lên, theo tỉ lệ chiều cao khung hình


def ease(name, u):
    u = min(1.0, max(0.0, u))
    if name == "linear":
        return u
    if name == "ease_in":
        return u * u
    if name == "ease_out":
        return 1.0 - (1.0 - u) * (1.0 - u)
    return u * u * (3.0 - 2.0 * u)  # smooth


def eval_track(track, t):
    """Giá trị của track keyframe tại thời điểm t (giây). Ngoài khoảng thì giữ giá trị đầu/cuối.
    `ease` của keyframe i áp cho đoạn (i, i+1)."""
    if t <= track[0]["t"]:
        return track[0]["v"]
    if t >= track[-1]["t"]:
        return track[-1]["v"]
    for a, b in zip(track, track[1:]):
        if a["t"] <= t < b["t"]:
            u = (t - a["t"]) / (b["t"] - a["t"])
            return a["v"] + (b["v"] - a["v"]) * ease(a["ease"], u)
    return track[-1]["v"]


def frame_time(job, frame_1based):
    return (frame_1based - 1) / job["frames"]["fps"]


def duration_s(job):
    return job["frames"]["total"] / job["frames"]["fps"]


def state_at(job, frame_1based):
    """Trạng thái cảnh của một khung: góc xoay SP, camera (azimuth/elevation/hệ số khoảng cách), hệ số đèn."""
    if job["version"] == 1:
        from job import frame_angle  # tránh vòng import khi nạp module

        angle = frame_angle(job, frame_1based)
        orbit = job["motion"] == "orbit"
        return {
            "t": 0.0,
            "product_rot_deg": 0.0 if orbit else angle,
            "cam_azimuth_deg": angle if orbit else 0.0,
            "cam_elevation_deg": DEFAULT_ELEVATION_DEG,
            "cam_distance_scale": 1.0,
            "key_scale": 1.0,
            "fill_scale": 1.0,
            "rim_scale": 1.0,
            "key_azimuth_deg": 0.0,
        }
    t = frame_time(job, frame_1based)
    tr = job["tracks"]
    return {
        "t": t,
        "product_rot_deg": eval_track(tr["product"]["rotZDeg"], t),
        "cam_azimuth_deg": eval_track(tr["camera"]["azimuthDeg"], t),
        "cam_elevation_deg": eval_track(tr["camera"]["elevationDeg"], t),
        "cam_distance_scale": eval_track(tr["camera"]["distanceScale"], t),
        "key_scale": eval_track(tr["light"]["keyScale"], t),
        "fill_scale": eval_track(tr["light"]["fillScale"], t),
        "rim_scale": eval_track(tr["light"]["rimScale"], t),
        "key_azimuth_deg": eval_track(tr["light"]["keyAzimuthDeg"], t),
    }


def text_state(overlay, t):
    """(alpha, slide) của một chữ overlay tại t. alpha 0 = ẩn. slide = phần độ trượt còn lại (1 -> 0)."""
    if t < overlay["t"] or t > overlay["tEnd"]:
        return 0.0, 0.0
    if overlay["anim"] == "none":
        return 1.0, 0.0
    fade_in = min(1.0, (t - overlay["t"]) / TEXT_FADE_IN_S)
    fade_out = min(1.0, (overlay["tEnd"] - t) / TEXT_FADE_OUT_S)
    alpha = max(0.0, min(fade_in, fade_out))
    slide = (1.0 - fade_in) if overlay["anim"] == "slide_up" else 0.0
    return alpha, slide


def camera_offset(dist, elevation_deg, scale):
    """Vị trí camera trong hệ của rig (rig đặt ở nửa chiều cao sản phẩm, camera nhìn từ -Y)."""
    el = math.radians(elevation_deg)
    d = dist * scale
    return (0.0, -d * math.cos(el), d * math.sin(el))
