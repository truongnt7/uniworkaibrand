# SPDX-License-Identifier: GPL-3.0-or-later
"""Chọn engine/thiết bị render và phát hiện "âm thầm chạy CPU".

Chỉ nhánh CPU và EEVEE-trên-Mesa (llvmpipe) đã được kiểm chứng trên VM Linux không có GPU.
Các nhánh OPTIX/CUDA/HIP/ONEAPI/METAL chưa kiểm chứng (cần máy thật, xem P0-05/P0-13).
"""
import bpy

import protocol

GPU_ORDER = ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL")
SOFTWARE_RENDERERS = ("llvmpipe", "softpipe", "swiftshader", "software")


def _gpu_renderer_info():
    try:
        import gpu

        return gpu.platform.renderer_get(), gpu.platform.backend_type_get()
    except Exception:
        return None, None


def configure_eevee(scene, samples):
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    ee = scene.eevee
    ee.taa_render_samples = samples
    ee.use_shadows = True
    ee.light_threshold = 0.0001


def report_eevee_device():
    """Gọi sau khung đầu tiên: lúc đó ngữ cảnh GPU mới tồn tại nên mới đọc được tên bộ dựng."""
    renderer, backend = _gpu_renderer_info()
    software = bool(renderer) and any(s in renderer.lower() for s in SOFTWARE_RENDERERS)
    protocol.emit(
        "device",
        engine="eevee",
        device=renderer or "unknown",
        backend=str(backend or "unknown"),
        detail="EEVEE trên bộ dựng phần mềm (CPU)" if software else "EEVEE trên GPU",
        fallbackToCpu=software,
    )
    if software:
        protocol.warning("CPU_FALLBACK", "EEVEE đang chạy bằng bộ dựng phần mềm (%s)" % renderer)


def _cycles_prefs():
    return bpy.context.preferences.addons["cycles"].preferences


def _devices_for(prefs, device_type):
    try:
        return [d for d in prefs.get_devices_for_type(device_type) if d.type == device_type]
    except Exception:
        return []


def configure_cycles(scene, samples, requested):
    scene.render.engine = "CYCLES"
    cy = scene.cycles
    cy.samples = samples
    cy.use_denoising = True
    cy.device = "CPU"

    chosen = None
    if requested != "cpu":
        prefs = _cycles_prefs()
        try:
            prefs.refresh_devices()
        except Exception:
            pass
        order = GPU_ORDER if requested == "auto" else (requested.upper(),)
        for dev_type in order:
            devices = _devices_for(prefs, dev_type)
            if devices:
                prefs.compute_device_type = dev_type
                for d in prefs.devices:
                    d.use = d.type == dev_type
                cy.device = "GPU"
                chosen = (dev_type, [d.name for d in devices])
                break

    if chosen:
        protocol.emit(
            "device",
            engine="cycles",
            device=chosen[0],
            detail=", ".join(chosen[1]),
            fallbackToCpu=False,
        )
    else:
        protocol.emit(
            "device",
            engine="cycles",
            device="CPU",
            detail="Cycles trên CPU",
            fallbackToCpu=requested not in ("cpu",),
        )
        if requested not in ("cpu", "auto"):
            protocol.warning("CPU_FALLBACK", "Không tìm thấy thiết bị %s, render bằng CPU" % requested.upper())
        elif requested == "auto":
            protocol.warning("CPU_FALLBACK", "Không có GPU dùng được cho Cycles, render bằng CPU")


def configure_render(scene, render_cfg):
    scene.render.resolution_x = render_cfg["width"]
    scene.render.resolution_y = render_cfg["height"]
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 15
    scene.render.use_file_extension = False
    if render_cfg["engine"] == "eevee":
        configure_eevee(scene, render_cfg["samples"])
    else:
        configure_cycles(scene, render_cfg["samples"], render_cfg["device"])
