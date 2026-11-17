# Gói runtime offline (P0-07): số liệu và cách kiểm

- Tạo gói: `node tools/runtime/pack-runtime.mjs --signed-manifest <manifest đã ký> --platform linux-x64 --out dist/x.apspack` (tar không nén: `pack.json` chứa manifest đã ký + `blender/` + `ffmpeg/`).
- Nhập: nút "Nhập runtime từ file…" trong app hoặc `pnpm poc:render import <file>`. App kiểm **chữ ký manifest bằng khóa tin cậy của bản build**, rồi kích thước + sha256 từng thành phần, giải nén tạm, smoke test Blender, kiểm LGPL ffmpeg, kích hoạt nguyên tử.
- Từ chối: gói sai chữ ký/khóa lạ/sai sha256/thiếu thành phần (test: `tests/pack.test.ts`, `tests/trust.test.ts`).

Số liệu linux-x64 (Blender 4.5.16 + FFmpeg n8.1.3 LGPL): gói **512,6 MB**; sau cài **1550 MB** (Blender 1128 MB, FFmpeg 422 MB).

## Đã kiểm trên Linux
`pnpm --filter @aps/desktop e2e:packaged` (app đóng gói bằng electron-builder `--dir`, chạy dưới Xvfb) đã chạy **trong network namespace không có mạng** (`unshare -rn`, chỉ bật loopback): nhập gói offline qua UI, render job video, `kill -9` app ở khung 10, mở lại, job tự khôi phục (failures = 1, khung 1 không bị render lại), mp4 H.264 `yuv420p` đủ 72 khung. Log: `e2e-packaged-offline-netns.log` trong artifacts của PR.

Bản đóng gói trong lần kiểm dùng cặp khóa **throwaway** `prod-test` (không commit, sinh tạm); mô hình tin cậy production xem `docs/ops/runtime-signing.md`.

## Chưa kiểm
Máy cách ly mạng thật (mới là network namespace), Windows/macOS (cấu trúc gói/ký khác), installer ký số/notarize (mới có thư mục `--dir`), gói đa nền tảng (macOS/arm64 chưa có nguồn FFmpeg LGPL đã ghim).
