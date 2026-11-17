# SPDX-License-Identifier: GPL-3.0-or-later
"""Điểm vào của blender-worker.

    blender -b -noaudio --factory-startup --python-exit-code 1 --python worker.py -- job.json

Đọc job.json, dựng cảnh studio, render từng khung PNG và in sự kiện JSON-lines ra stdout.
Mã thoát: 0 = xong, 1 = lỗi (có sự kiện `error` có cấu trúc ngay trước đó).
"""
import os
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import protocol  # noqa: E402
import job as jobmod  # noqa: E402
from protocol import WorkerError  # noqa: E402


def _argv_after_dashes():
    argv = sys.argv
    return argv[argv.index("--") + 1 :] if "--" in argv else []


def _render_frames(bpy, scene, job, handles, qc=None):
    from motions import turntable

    total = job["frames"]["total"]
    os.makedirs(job["paths"]["framesDir"], exist_ok=True)
    t_all = time.time()
    done = 0
    for frame in range(1, total + 1):
        final = jobmod.frame_path(job, frame)
        protocol.emit("progress", phase="render", frame=frame - 1, total=total)
        if qc is not None:
            _write_qc_grid(bpy, scene, job, handles, qc, frame, final)
        if os.path.isfile(final) and os.path.getsize(final) > 0:
            protocol.emit("frame_done", frame=frame, path=final, ms=0, skipped=True)
            done += 1
            continue
        t0 = time.time()
        turntable.apply_angle(handles, job["motion"], jobmod.frame_angle(job, frame))
        part = final + ".part"
        scene.render.filepath = part
        try:
            bpy.ops.render.render(write_still=True)
        except Exception as exc:  # noqa: BLE001
            raise WorkerError("RENDER_FAILED", "render khung %d thất bại" % frame, detail=str(exc))
        if not os.path.isfile(part):
            raise WorkerError("RENDER_FAILED", "Blender không ghi file khung %d" % frame)
        os.replace(part, final)
        if done == 0 and job["render"]["engine"] == "eevee":
            import gpu_setup

            gpu_setup.report_eevee_device()
        done += 1
        protocol.emit("frame_done", frame=frame, path=final, ms=int((time.time() - t0) * 1000))
    protocol.emit("progress", phase="render", frame=total, total=total)
    return done, int((time.time() - t_all) * 1000)


def _write_qc_grid(bpy, scene, job, handles, qc, frame, final):
    from label_decal import qc_grid
    from motions import turntable

    turntable.apply_angle(handles, job["motion"], jobmod.frame_angle(job, frame))
    bpy.context.view_layer.update()
    grid = qc_grid.compute(scene, scene.camera, qc["obj"], qc["spec"])
    qc_grid.write(final + ".grid.json", grid)


def _smoke(bpy, job):
    import gpu_setup

    scene = bpy.context.scene
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    bpy.ops.object.light_add(type="SUN", location=(2, -2, 3))
    bpy.ops.object.camera_add(location=(0, -3, 0.5), rotation=(1.45, 0, 0))
    scene.camera = bpy.context.object
    gpu_setup.configure_render(scene, job["render"])
    os.makedirs(job["paths"]["framesDir"], exist_ok=True)
    out = jobmod.frame_path(job, 1)
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    if not os.path.isfile(out):
        raise WorkerError("RENDER_FAILED", "smoke test không tạo ra ảnh")
    protocol.emit("frame_done", frame=1, path=out, ms=0)
    protocol.emit("done", frames=1, ms=0)


def _render(bpy, job):
    import gpu_setup
    from label_decal import decal
    from scene import glb_import, studio

    t0 = time.time()
    scene = bpy.context.scene
    protocol.emit("progress", phase="import", frame=0, total=job["frames"]["total"])
    glb_import.clear_scene()
    new_objects, meshes = glb_import.import_glb(job)
    dims = glb_import.normalize(new_objects, meshes, job["product"].get("sizeMm"))

    protocol.emit("progress", phase="scene", frame=0, total=job["frames"]["total"])
    spec = decal.apply(job, meshes, dims)
    handles = studio.build(scene, job, dims, meshes)
    gpu_setup.configure_render(scene, job["render"])

    qc = None
    if job.get("qcGrid") and spec is not None:
        qc = {"spec": spec, "obj": max(meshes, key=lambda o: len(o.data.vertices))}
    frames, _ = _render_frames(bpy, scene, job, handles, qc)
    protocol.emit("done", frames=frames, ms=int((time.time() - t0) * 1000))


def main():
    args = _argv_after_dashes()
    if not args:
        raise WorkerError("INVALID_JOB", "thiếu đường dẫn job.json sau '--'")
    job = jobmod.load(args[0])
    import bpy

    protocol.log("blender %s, job %s (%s)" % (bpy.app.version_string, job["jobId"], job["mode"]))
    if job["mode"] == "smoke":
        _smoke(bpy, job)
    else:
        _render(bpy, job)


def run():
    try:
        main()
    except WorkerError as exc:
        protocol.error(exc.code, exc.message, exc.detail)
        sys.exit(1)
    except Exception as exc:  # noqa: BLE001
        protocol.error("SCRIPT_ERROR", str(exc), traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    run()
