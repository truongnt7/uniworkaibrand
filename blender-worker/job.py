# SPDX-License-Identifier: GPL-3.0-or-later
"""Đọc và kiểm tra job.json (khớp WorkerJobV1/WorkerJobV2 trong packages/shared/src/worker-protocol.ts).
`version` bắt buộc: 1 = một chuyển động toàn đoạn, 2 = timeline nhiều track đã biên dịch thành keyframe số.
Không phụ thuộc bpy để có thể unit test bằng python3 thường. Test chéo với schema zod: tests/fixtures/job-v2.golden.json."""
import json
import os

from protocol import WorkerError

ENGINES = ("eevee", "cycles")
DEVICES = ("auto", "cpu", "optix", "cuda", "hip", "oneapi", "metal")
MOTIONS = ("orbit", "spin360")
MODES = ("render", "smoke")
SUPPORTED_VERSIONS = (1, 2)
TEMPLATES = ("studio-soft", "nature-soft", "minimal-white", "luxury-dark")
EASES = ("linear", "smooth", "ease_in", "ease_out")
HIDE_ITEMS = ("platform",)
LOGO_POSITIONS = ("center", "bottom_center", "bottom_right", "bottom_left", "top_right", "top_left")
TEXT_POSITIONS = ("top_center", "center", "bottom_center")
OVERLAY_ANIMS = ("fade_in", "slide_up", "none")
MAX_KEYFRAMES = 128
TRACKS = {
    "product": ("rotZDeg",),
    "camera": ("azimuthDeg", "elevationDeg", "distanceScale"),
    "light": ("keyScale", "fillScale", "rimScale", "keyAzimuthDeg"),
}

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


def _require_keys(obj, allowed, where, required=()):
    extra = sorted(set(obj) - set(allowed))
    _require(not extra, "%s: khoá lạ %s" % (where, ", ".join(extra)))
    missing = [k for k in required if k not in obj]
    _require(not missing, "%s: thiếu %s" % (where, ", ".join(missing)))


def _validate_common(raw, mode):
    r = raw.get("render")
    _require(isinstance(r, dict), "thiếu render")
    _require(r.get("engine") in ENGINES, "engine không hợp lệ")
    _require(r.get("device") in DEVICES, "device không hợp lệ")
    for k in ("samples", "width", "height"):
        _require(isinstance(r.get(k), int) and not isinstance(r.get(k), bool) and r[k] >= 1, f"render.{k} phải là số nguyên dương")

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


def _validate_v1(raw):
    mode = raw.get("mode")
    _require(mode in MODES, "mode không hợp lệ")

    scene = raw.get("scene")
    _require(isinstance(scene, dict), "thiếu scene")
    _require(scene.get("template") == "studio-soft", "template cảnh không được hỗ trợ")
    parse_hex_color(scene.get("backgroundColor"))
    _require(_is_number(scene.get("shadow")) and 0 <= scene["shadow"] <= 1, "shadow ngoài [0,1]")

    _require(raw.get("motion") in MOTIONS, "motion không hợp lệ")

    f = raw.get("frames")
    _require(isinstance(f, dict), "thiếu frames")
    _require(isinstance(f.get("total"), int) and f["total"] >= 1, "frames.total phải >= 1")
    _require(_is_number(f.get("angleStartDeg")) and _is_number(f.get("angleSpanDeg")), "góc khung không hợp lệ")
    return _validate_common(raw, mode)


def _validate_track(track, where):
    _require(isinstance(track, list) and 1 <= len(track) <= MAX_KEYFRAMES, "%s: cần 1..%d keyframe" % (where, MAX_KEYFRAMES))
    prev = None
    out = []
    for i, kf in enumerate(track):
        w = "%s[%d]" % (where, i)
        _require(isinstance(kf, dict), "%s phải là object" % w)
        _require_keys(kf, ("t", "v", "ease"), w, ("t", "v"))
        _require(_is_number(kf["t"]) and 0 <= kf["t"] <= 3600, "%s.t ngoài [0,3600]" % w)
        _require(_is_number(kf["v"]) and abs(kf["v"]) <= 1e6, "%s.v không hợp lệ" % w)
        ease = kf.get("ease", "smooth")
        _require(ease in EASES, "%s.ease không hợp lệ" % w)
        _require(prev is None or kf["t"] > prev, "%s.t phải lớn hơn keyframe trước" % w)
        prev = kf["t"]
        out.append({"t": float(kf["t"]), "v": float(kf["v"]), "ease": ease})
    return out


def _validate_overlays(overlays):
    _require(isinstance(overlays, dict), "overlays phải là object")
    _require_keys(overlays, ("logo", "text"), "overlays")
    logo = overlays.get("logo", [])
    text = overlays.get("text", [])
    _require(isinstance(logo, list) and len(logo) <= 2, "overlays.logo tối đa 2")
    _require(isinstance(text, list) and len(text) <= 4, "overlays.text tối đa 4")
    out_text = []
    for i, o in enumerate(logo):
        w = "overlays.logo[%d]" % i
        _require(isinstance(o, dict), "%s phải là object" % w)
        _require_keys(o, ("t", "tEnd", "imagePath", "position", "anim"), w, ("t", "tEnd", "imagePath"))
        _require(_is_number(o["t"]) and _is_number(o["tEnd"]) and 0 <= o["t"] < o["tEnd"] <= 3600, "%s: thời gian không hợp lệ" % w)
        _require(isinstance(o["imagePath"], str) and o["imagePath"], "%s.imagePath không hợp lệ" % w)
        _require(o.get("position", "center") in LOGO_POSITIONS, "%s.position không hợp lệ" % w)
        _require(o.get("anim", "fade_in") in OVERLAY_ANIMS, "%s.anim không hợp lệ" % w)
    for i, o in enumerate(text):
        w = "overlays.text[%d]" % i
        _require(isinstance(o, dict), "%s phải là object" % w)
        _require_keys(o, ("t", "tEnd", "text", "position", "anim", "color", "sizePct"), w, ("t", "tEnd", "text"))
        _require(_is_number(o["t"]) and _is_number(o["tEnd"]) and 0 <= o["t"] < o["tEnd"] <= 3600, "%s: thời gian không hợp lệ" % w)
        _require(isinstance(o["text"], str) and 1 <= len(o["text"].strip()) <= 80, "%s.text phải dài 1..80 ký tự" % w)
        _require(o.get("position", "bottom_center") in TEXT_POSITIONS, "%s.position không hợp lệ" % w)
        _require(o.get("anim", "fade_in") in OVERLAY_ANIMS, "%s.anim không hợp lệ" % w)
        color = o.get("color", "#ffffff")
        parse_hex_color(color)
        size = o.get("sizePct", 6)
        _require(_is_number(size) and 2 <= size <= 20, "%s.sizePct ngoài [2,20]" % w)
        out_text.append(dict(o, text=o["text"].strip(), position=o.get("position", "bottom_center"), anim=o.get("anim", "fade_in"), color=color, sizePct=size))
    return {"logo": list(logo), "text": out_text}


def _validate_v2(raw):
    _require_keys(
        raw,
        ("version", "mode", "jobId", "qcGrid", "product", "scene", "render", "frames", "tracks", "overlays", "paths", "limits"),
        "job",
        ("version", "mode", "jobId", "product", "scene", "render", "frames", "tracks", "paths"),
    )
    _require(raw.get("mode") == "render", "job v2 chỉ có mode=render")

    prod = raw["product"]
    _require(isinstance(prod, dict), "product phải là object")
    _require_keys(prod, ("glbPath", "sizeMm", "label", "lockLabel"), "product", ("glbPath",))
    _require(isinstance(prod.get("lockLabel", True), bool), "product.lockLabel phải là boolean")

    scene = raw["scene"]
    _require(isinstance(scene, dict), "scene phải là object")
    _require_keys(scene, ("template", "backgroundColor", "shadow", "hide"), "scene", ("template", "backgroundColor", "shadow"))
    _require(scene["template"] in TEMPLATES, "template cảnh không được hỗ trợ")
    parse_hex_color(scene["backgroundColor"])
    _require(_is_number(scene["shadow"]) and 0 <= scene["shadow"] <= 1, "shadow ngoài [0,1]")
    hide = scene.get("hide", [])
    _require(isinstance(hide, list) and all(h in HIDE_ITEMS for h in hide), "scene.hide không hợp lệ")

    r = raw["render"]
    _require(isinstance(r, dict), "thiếu render")
    _require_keys(r, ("engine", "samples", "width", "height", "device"), "render", ("engine", "samples", "width", "height", "device"))

    f = raw["frames"]
    _require(isinstance(f, dict), "frames phải là object")
    _require_keys(f, ("total", "fps"), "frames", ("total", "fps"))
    _require(isinstance(f["total"], int) and not isinstance(f["total"], bool) and f["total"] >= 1, "frames.total phải >= 1")
    _require(isinstance(f["fps"], int) and not isinstance(f["fps"], bool) and 1 <= f["fps"] <= 60, "frames.fps ngoài [1,60]")

    tracks = raw["tracks"]
    _require(isinstance(tracks, dict), "tracks phải là object")
    _require_keys(tracks, tuple(TRACKS), "tracks", tuple(TRACKS))
    clean_tracks = {}
    for group, names in TRACKS.items():
        g = tracks[group]
        _require(isinstance(g, dict), "tracks.%s phải là object" % group)
        _require_keys(g, names, "tracks." + group, names)
        clean_tracks[group] = {n: _validate_track(g[n], "tracks.%s.%s" % (group, n)) for n in names}

    overlays = _validate_overlays(raw.get("overlays", {}))
    duration = f["total"] / f["fps"]
    for kind in ("logo", "text"):
        for o in overlays[kind]:
            _require(o["t"] < duration, "overlay bắt đầu sau khi video kết thúc")

    out = _validate_common(raw, "render")
    out["scene"] = dict(scene, hide=list(hide))
    out["product"] = dict(prod, lockLabel=prod.get("lockLabel", True))
    out["tracks"] = clean_tracks
    out["overlays"] = overlays
    return out


def validate(raw):
    _require(isinstance(raw, dict), "job.json phải là object")
    version = raw.get("version")
    _require(
        isinstance(version, int) and not isinstance(version, bool) and version in SUPPORTED_VERSIONS,
        "version không được hỗ trợ (cần %s)" % " hoặc ".join(str(v) for v in SUPPORTED_VERSIONS),
    )
    return _validate_v1(raw) if version == 1 else _validate_v2(raw)


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
    """Chỉ job v1: góc của khung (khung cuối chưa chạm đủ vòng nên video lặp liền mạch)."""
    total = job["frames"]["total"]
    start = job["frames"]["angleStartDeg"]
    span = job["frames"]["angleSpanDeg"]
    return start + span * (frame_1based - 1) / total
