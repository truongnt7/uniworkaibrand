# SPDX-License-Identifier: GPL-3.0-or-later
"""Đọc và kiểm tra job.json (khớp schema WorkerJob trong packages/shared).
Không phụ thuộc bpy để có thể unit test bằng python3 thường."""
import json
import os

from protocol import WorkerError

ENGINES = ("eevee", "cycles")
DEVICES = ("auto", "cpu", "optix", "cuda", "hip", "oneapi", "metal")
MOTIONS = ("orbit", "spin360")
MODES = ("render", "smoke")

DEFAULT_LIMITS = {"maxGlbBytes": 200 * 1024 * 1024, "maxTriangles": 2_000_000}


def _require(cond, message):
    if not cond:
        raise WorkerError("INVALID_JOB", message)


def _is_number(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def parse_hex_color(value):
    _require(isinstance(value, str) and len(value) == 7 and value[0] == "#", "màu nền phải dạng #rrggbb")
    try:
        return tuple(int(value[i : i + 2], 16) / 255.0 for i in (1, 3, 5))
    except ValueError:
        raise WorkerError("INVALID_JOB", "màu nền phải dạng #rrggbb")


def validate(raw):
    _require(isinstance(raw, dict), "job.json phải là object")
    _require(raw.get("version") == 1, "version phải là 1")
    mode = raw.get("mode")
    _require(mode in MODES, "mode không hợp lệ")

    scene = raw.get("scene")
    _require(isinstance(scene, dict), "thiếu scene")
    _require(scene.get("template") == "studio-soft", "template cảnh không được hỗ trợ")
    parse_hex_color(scene.get("backgroundColor"))
    _require(_is_number(scene.get("shadow")) and 0 <= scene["shadow"] <= 1, "shadow ngoài [0,1]")

    _require(raw.get("motion") in MOTIONS, "motion không hợp lệ")

    r = raw.get("render")
    _require(isinstance(r, dict), "thiếu render")
    _require(r.get("engine") in ENGINES, "engine không hợp lệ")
    _require(r.get("device") in DEVICES, "device không hợp lệ")
    for k in ("samples", "width", "height"):
        _require(isinstance(r.get(k), int) and r[k] >= 1, f"render.{k} phải là số nguyên dương")

    f = raw.get("frames")
    _require(isinstance(f, dict), "thiếu frames")
    _require(isinstance(f.get("total"), int) and f["total"] >= 1, "frames.total phải >= 1")
    _require(_is_number(f.get("angleStartDeg")) and _is_number(f.get("angleSpanDeg")), "góc khung không hợp lệ")

    p = raw.get("paths")
    _require(isinstance(p, dict) and isinstance(p.get("framesDir"), str) and p["framesDir"], "thiếu paths.framesDir")
    pattern = p.get("pattern", "frame_%06d.png")
    _require(isinstance(pattern, str) and "%" in pattern, "paths.pattern phải có %d")

    if mode == "render":
        prod = raw.get("product")
        _require(isinstance(prod, dict) and isinstance(prod.get("glbPath"), str) and prod["glbPath"], "thiếu product.glbPath")
        label = prod.get("label")
        if label is not None:
            _require(isinstance(label, dict) and isinstance(label.get("imagePath"), str), "label.imagePath không hợp lệ")
            _require(label.get("mode", "cylinder") in ("cylinder", "flat"), "label.mode không hợp lệ")

    limits = dict(DEFAULT_LIMITS)
    limits.update(raw.get("limits") or {})
    out = dict(raw)
    out["limits"] = limits
    out["paths"] = dict(p, pattern=pattern)
    return out


def load(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
    except FileNotFoundError:
        raise WorkerError("INVALID_JOB", f"không thấy job.json: {path}")
    except json.JSONDecodeError as exc:
        raise WorkerError("INVALID_JOB", f"job.json không phải JSON hợp lệ: {exc}")
    return validate(raw)


def frame_path(job, frame_1based):
    return os.path.join(job["paths"]["framesDir"], job["paths"]["pattern"] % frame_1based)


def frame_angle(job, frame_1based):
    total = job["frames"]["total"]
    start = job["frames"]["angleStartDeg"]
    span = job["frames"]["angleSpanDeg"]
    return start + span * (frame_1based - 1) / total
