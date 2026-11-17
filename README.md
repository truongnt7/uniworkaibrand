# AI Product Studio

Nền tảng AI + Blender (bản cài Electron) giúp doanh nghiệp nhỏ tạo ảnh và video 3D sản phẩm quảng cáo từ ảnh chụp thường, không cần biết 3D hay thuê designer.

## Trạng thái

**Phase 0 (PoC lõi)**: chứng minh Electron điều khiển được **Blender 4.5 LTS headless** để render ảnh / video turntable từ model `.glb` có nhãn sản phẩm. Xem mục "Đã kiểm chứng / chưa kiểm chứng" bên dưới.

## Cấu trúc

```
apps/desktop/        Electron (electron-vite): main / preload / renderer (React) + orchestrator (utilityProcess)
  src/orchestrator/  hàng đợi job (SQLite node:sqlite), runtime manager (tải/sha256/giải nén/smoke), runner Blender + ffmpeg
packages/shared/     schema zod dùng chung (job, giao thức worker, IPC có kiểu, runtime)
packages/i18n/       vi.json (mặc định) + en.json, hàm định dạng
packages/render-core/ biên dịch job -> job.json cho worker, parser JSON-lines, tham số ffmpeg, tính tiến trình
blender-worker/      script bpy chạy TRONG Blender (GPL-3.0, tách riêng; chỉ nói chuyện qua job.json / JSON-lines / exit code)
tools/               ký manifest dev, sinh model/nhãn mẫu
assets/samples/      serum-bottle.glb, label.png, logo.png (sinh bằng tools/fixtures/make_sample_assets.py, CC0)
docs/                kế hoạch, bối cảnh, thiết kế
```

## Chạy PoC

Yêu cầu: Node >= 22.12 (dùng `node:sqlite`; Electron đã kèm sẵn), pnpm 10, `ffmpeg` trong PATH. Linux x64 là nền đã kiểm chứng.

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test      # test logic: schema, downloader (checksum/Range/retry), queue, runner, worker job

# 1) Cài Blender 4.5 LTS (tải ~377 MB, kiểm sha256, giải nén, smoke test, kích hoạt nguyên tử)
pnpm poc:render install
#    hoặc offline: dùng nút "Nhập runtime từ file..." trong app, hoặc đặt APS_BLENDER_BIN=/đường/dẫn/blender

# 2) Render bằng CLI (dùng đúng orchestrator của app)
pnpm poc:render render --kind image --engine eevee --width 1280 --height 720 \
  --glb assets/samples/serum-bottle.glb --label assets/samples/label.png \
  --label-width 94 --label-height 60 --label-bottom 20 --size-height 146 --out out/anh.png

pnpm poc:render render --kind video --motion orbit --engine cycles --samples 24 \
  --width 960 --height 540 --fps 24 --duration 4 \
  --glb assets/samples/serum-bottle.glb --label assets/samples/label.png \
  --label-width 94 --label-height 60 --label-bottom 20 --size-height 146 \
  --logo assets/samples/logo.png --out out/turntable.mp4

# 3) Chạy app (PoC Console, tiếng Việt / English)
pnpm dev

# 4) E2E bằng Electron thật dưới Xvfb: tạo job ảnh qua UI, chờ xong, chụp màn hình (/tmp/aps-e2e-shots)
pnpm --filter @aps/desktop build
xvfb-run -a -s "-screen 0 1440x900x24" pnpm --filter @aps/desktop e2e
```

Dữ liệu PoC (DB, runtime, khung/video) nằm ở `.poc-data/` (đã gitignore). Biến môi trường: `APS_DATA_DIR`, `APS_BLENDER_BIN`, `APS_FFMPEG`, `APS_VERBOSE=1`.

Chạy worker thủ công, không qua app: xem `blender-worker/README.md`.

## Kiến trúc PoC

`Renderer (React, sandbox, không có Node)` -> `preload (contextBridge, IPC có kiểu zod)` -> `main` -> `utilityProcess orchestrator` -> `Blender headless` (`job.json` vào, **JSON-lines** ra: `progress`, `device`, `frame_done`, `error`, `done`) -> khung PNG -> `ffmpeg` (H.264 `yuv420p` + `faststart`, logo cuối video) -> mp4.

- Job: `queued -> preparing -> rendering -> encoding -> done | failed | canceled`; 1 job render/lần; hủy diệt cả cây tiến trình; mở lại app thì job dở được khôi phục và **bỏ qua khung đã render** (resume).
- Runtime manager: Range resume, sha256, backoff + mirror, kiểm dung lượng đĩa, giải nén tạm, smoke test, kích hoạt nguyên tử, giữ bản cũ nếu lỗi; manifest ký Ed25519 (khóa dev `dev-1`, **khóa thật chưa có**).
- Bảo mật Electron: `contextIsolation`, `sandbox`, CSP, kiểm tra sender của IPC, chặn điều hướng/cửa sổ lạ, giao thức `asset://` chỉ phục vụ file trong thư mục job.

## Đã kiểm chứng / chưa kiểm chứng

Xem bảng chi tiết trong mô tả PR #1. Tóm tắt: đã chạy thật trên VM Linux x64 (Blender 4.5.16 tải thật từ download.blender.org, EEVEE + Cycles trên CPU/llvmpipe, ffmpeg thật, Electron thật dưới Xvfb). **Chưa kiểm chứng**: macOS, Windows, GPU thật (OptiX/CUDA/HIP/Metal), installer ký số / notarize, benchmark đa máy, QC nhãn SSIM/OCR, `better-sqlite3` (đang dùng `node:sqlite`).

## Tài liệu

- [Kế hoạch triển khai](docs/ke-hoach-ai-blender-electron.md): sản phẩm, kiến trúc, lộ trình, backlog Phase 0.
- [Bối cảnh và quyết định đã chốt](docs/project-context.md): Blender 4.5 LTS, NestJS + PostgreSQL, thị trường Việt Nam trước, v.v.
- [Ảnh thiết kế giao diện](docs/design/): Studio video 3D, Studio ảnh sản phẩm, Sản phẩm, Kho mẫu, Thư viện, Kênh & Xuất bản.
