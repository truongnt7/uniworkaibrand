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

Yêu cầu: Node `>=22.13 <25` (để chạy script/test; `engines` trong `package.json`), pnpm 10. Linux x64 là nền đã kiểm chứng.

**Phiên bản khóa cho `node:sqlite`** (DB hàng đợi chạy trong utilityProcess của Electron, không dùng Node hệ thống): Electron **43.8.10 (ghim chính xác, không dùng `^`)** kèm Node 24.22.1 và SQLite 3.53.4. `node:sqlite` vẫn là API thử nghiệm của Node, vì vậy: (1) nâng Electron phải chạy lại test migration/khôi phục hàng đợi và `pnpm e2e:packaged`; (2) schema DB đi theo `PRAGMA user_version` với migration có sao lưu `.bak-vN` và rollback (xem `apps/desktop/src/orchestrator/db.ts`).

FFmpeg: app **chỉ chấp nhận bản LGPL** (không `--enable-gpl`/`--enable-nonfree`, không libx264/libx265), kiểm tự động khi cài runtime và trước mỗi lần encode. Binary được ghim URL + sha256 trong `tools/runtime/manifest.json`; giấy phép/codec cho phép: `THIRD_PARTY_NOTICES.md`. `pnpm ffmpeg:fetch` tải đúng bản ghim, `pnpm --filter @aps/desktop verify:ffmpeg <binary>` kiểm LGPL. ffmpeg trong PATH của hệ thống thường là bản GPL và sẽ bị từ chối.

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test      # test logic: schema, downloader (checksum/Range/retry), queue, runner, worker job

# 0) Khóa ký DEV (chỉ cho máy dev; KHÔNG dùng cho bản phát hành) -> .dev-keys/ (gitignore)
pnpm dev:keys

# 1) Cài runtime = Blender 4.5 LTS + FFmpeg LGPL (tải, kiểm sha256, giải nén, smoke test, kích hoạt nguyên tử)
pnpm poc:render install
#    hoặc offline: gói .apspack (xem dưới) + nút "Nhập runtime từ file..." trong app / `pnpm poc:render import <file>`,
#    hoặc đặt APS_BLENDER_BIN / APS_FFMPEG (ffmpeg vẫn phải qua kiểm LGPL)

# 2) Render bằng CLI (dùng đúng orchestrator của app)
pnpm poc:render render --kind image --engine eevee --width 1280 --height 720 \
  --glb assets/samples/serum-bottle.glb --label assets/samples/label.png \
  --label-width 94 --label-height 60 --label-bottom 20 --size-height 146 --out out/anh.png

pnpm poc:render render --kind video --motion orbit --engine cycles --samples 24 \
  --width 960 --height 540 --fps 24 --duration 4 \
  --glb assets/samples/serum-bottle.glb --label assets/samples/label.png \
  --label-width 94 --label-height 60 --label-bottom 20 --size-height 146 \
  --logo assets/samples/logo.png --out out/turntable.mp4

# 2b) Video từ mô tả tiếng Việt: Đạo diễn AI -> timeline -> job v2 -> Blender -> ffmpeg (offline rule-based nếu không có APS_AI_*)
pnpm poc:render prompt "Xoay chai chậm, camera tiến gần rồi quay quanh 90 độ, cuối video hiện logo" \
  --glb assets/samples/serum-bottle.glb --label assets/samples/label.png --logo assets/samples/logo.png \
  --width 640 --height 360 --fps 15 --samples 16 --out out/ai.mp4

# 3) Chạy app (PoC Console, tiếng Việt / English)
pnpm dev

# 4) E2E bằng Electron thật dưới Xvfb: tạo job ảnh qua UI, chờ xong, chụp màn hình (/tmp/aps-e2e-shots)
pnpm --filter @aps/desktop build
xvfb-run -a -s "-screen 0 1440x900x24" pnpm --filter @aps/desktop e2e

# 5) E2E luồng ảnh -> video (màn hình "Tạo video"): cần ffmpeg LGPL (node tools/ffmpeg/fetch-lgpl.mjs hoặc APS_FFMPEG); ảnh chụp từng bước ở /tmp/aps-e2e-create/shots
xvfb-run -a -s "-screen 0 1600x1800x24" pnpm --filter @aps/desktop e2e:create
```

### Phát hành: khóa ký, gói offline, đóng gói app

- **Mô hình tin cậy**: app/installer chỉ chứa **khóa công khai**. Bản đóng gói chỉ tin khóa trong `apps/desktop/resources/keys/production/`; khóa dev chỉ nạp được khi chạy dev (không đóng gói) và đặt `APS_DEV_TRUST_KEY_FILE`, và đoạn mã nạp khóa dev bị loại khỏi build release. **Chưa có khóa production nào trong repo**: người phát hành phải tự sinh offline và điền vào, xem [docs/ops/runtime-signing.md](docs/ops/runtime-signing.md).
- **Gói runtime offline** (`.apspack`, ~0.5 GB cho linux-x64): `pnpm runtime:pack` (cần manifest đã ký) -> app kiểm chữ ký + sha256 từng thành phần rồi cài, không cần mạng.
- **Đóng gói app** (`--dir`, chưa có installer ký/notarize): `pnpm --filter @aps/desktop package`; kiểm trước/sau bằng `scripts/check-release.mjs` (không có khóa riêng, không có khóa dev). `pnpm --filter @aps/desktop e2e:packaged` chạy app đã đóng gói dưới Xvfb: nhập gói offline qua UI, render, `kill -9` giữa chừng, mở lại và kiểm job tự khôi phục.

### QC nhãn (P0-09) và model tham số (P0-10)

```bash
# sinh bộ 10 sản phẩm tổng hợp CC0 rồi chạy QC SSIM/OCR (cần Blender + tesseract; ảnh trước/sau + báo cáo vào --out)
blender -b --factory-startup --python tools/fixtures/make_qc_suite.py -- /tmp/qc-suite
node tools/qc/run-suite.mjs --suite /tmp/qc-suite --blender <blender> --out /tmp/qc-out --angles 18 --width 960 --height 540
# model tham số (lathe + hộp) -> glb đúng kích thước mm, kèm báo cáo sai số
blender -b --factory-startup --python blender-worker/modelgen/parametric.py -- tools/fixtures/param-models.json /tmp/param-out
```

Dữ liệu PoC (DB, runtime, khung/video) nằm ở `.poc-data/` (đã gitignore). Biến môi trường: `APS_DATA_DIR`, `APS_BLENDER_BIN`, `APS_FFMPEG`, `APS_VERBOSE=1`.

Chạy worker thủ công, không qua app: xem `blender-worker/README.md`.

## Kiến trúc PoC

`Renderer (React, sandbox, không có Node)` -> `preload (contextBridge, IPC có kiểu zod)` -> `main` -> `utilityProcess orchestrator` -> `Blender headless` (`job.json` vào, **JSON-lines** ra: `progress`, `device`, `frame_done`, `error`, `done`) -> khung PNG -> `ffmpeg` (H.264 `yuv420p` + `faststart`, logo cuối video) -> mp4.

- Job: `queued -> preparing -> rendering -> encoding -> done | failed | canceled`, thêm `paused` (người dùng tạm dừng) và `needs_attention` (lỗi lặp lại quá ngưỡng retry = 3, hoặc lỗi không thể tự thử lại; không chặn hàng đợi, người dùng bấm "Thử lại" khi đã xử lý). 1 job render/lần; hủy diệt cả cây tiến trình. Mở lại app: job dở được khôi phục (crash khi khởi động tính là 1 lần lỗi), **chạy trước các job đang chờ khác nhưng giữ thứ tự cũ giữa chúng**, và **bỏ qua khung đã render** (resume). Tắt app đúng cách thì job về `queued` mà không tính lỗi.
- Runtime manager: Range resume, sha256, backoff + mirror, kiểm dung lượng đĩa, giải nén tạm, smoke test, kích hoạt nguyên tử, giữ bản cũ nếu lỗi; manifest ký Ed25519, tách hẳn khóa dev / production (xem trên; **khóa production do người dùng tạo**).
- Bảo mật Electron: `contextIsolation`, `sandbox`, CSP, kiểm tra sender của IPC, chặn điều hướng/cửa sổ lạ, giao thức `asset://` chỉ phục vụ file trong thư mục job.

## Đã kiểm chứng / chưa kiểm chứng

Xem bảng chi tiết trong mô tả PR #1. Tóm tắt: đã chạy thật trên VM Linux x64 (Blender 4.5.16 tải thật từ download.blender.org, EEVEE + Cycles trên CPU/llvmpipe, ffmpeg thật, Electron thật dưới Xvfb). **Chưa kiểm chứng**: macOS, Windows, GPU thật (OptiX/CUDA/HIP/Metal), installer ký số / notarize, benchmark đa máy, QC nhãn trên sản phẩm thực (mới chạy trên bộ tổng hợp), FFmpeg LGPL cho macOS/arm64 (chưa có nguồn đã ghim), rà soát pháp lý bản phân phối thực tế (openh264, GPL của Blender).

## Tài liệu

- Vận hành/số liệu Phase 0: [khóa ký](docs/ops/runtime-signing.md), [gói offline](docs/ops/offline-pack.md), [QC nhãn](docs/ops/label-qc.md), [rút gọn Blender](docs/ops/blender-slimming.md), [benchmark](docs/ops/benchmark.md).
- [Timeline → render Blender → mp4](docs/timeline-render.md): Đạo diễn AI nối vào worker (job v2), cách chạy, kết quả kiểm chứng, giới hạn.
- [Kế hoạch triển khai](docs/ke-hoach-ai-blender-electron.md): sản phẩm, kiến trúc, lộ trình, backlog Phase 0.
- [Bối cảnh và quyết định đã chốt](docs/project-context.md): Blender 4.5 LTS, NestJS + PostgreSQL, thị trường Việt Nam trước, v.v.
- [Ảnh thiết kế giao diện](docs/design/): Studio video 3D, Studio ảnh sản phẩm, Sản phẩm, Kho mẫu, Thư viện, Kênh & Xuất bản.
