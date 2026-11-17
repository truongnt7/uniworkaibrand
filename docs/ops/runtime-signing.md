# Khóa ký manifest runtime (production) và cách phát hành

Manifest runtime (`tools/runtime/manifest.json`) liệt kê Blender 4.5 LTS và FFmpeg LGPL (URL, kích thước, sha256). App chỉ cài runtime khi
manifest được **ký Ed25519** bằng một khóa mà app tin. Nguyên tắc đã chốt:

| | Khóa DEV | Khóa PRODUCTION |
|---|---|---|
| keyId | bắt đầu bằng `dev-` | bất kỳ, **không** bắt đầu bằng `dev` |
| Khóa riêng | `.dev-keys/` (gitignore), sinh bằng `pnpm dev:keys` | **chỉ người dùng giữ**, sinh OFFLINE, không bao giờ vào repo/CI/installer |
| Khóa công khai trong app | **không có**; chỉ nạp khi chạy dev và đặt `APS_DEV_TRUST_KEY_FILE` | `apps/desktop/resources/keys/production/<keyId>.pub.pem` (đóng gói vào `resources/keys/production/`) |
| Bản đóng gói (`app.isPackaged`) | **không bao giờ** tin (mã nạp khóa dev bị bundler loại khỏi build release) | tin duy nhất |

Repo hiện **chưa có khóa production nào**: bản đóng gói sẽ từ chối cài runtime (`MANIFEST_NO_TRUSTED_KEY`) và `pnpm package` dừng ở bước kiểm tra cho tới khi bạn điền khóa.

## Bước làm của người phát hành (làm một lần, offline)

1. **Sinh cặp khóa production** trên máy bạn tin cậy, ghi ra nơi NGOÀI repo (USB/ổ mã hóa/trình quản lý bí mật). Script từ chối ghi vào trong repo:
   ```bash
   node tools/runtime/keys.mjs gen-prod --out /noi/an/toan --key-id prod-2026
   # tạo /noi/an/toan/prod-2026.key.pem (RIÊNG, chmod 600) và /noi/an/toan/prod-2026.pub.pem (CÔNG KHAI)
   ```
   Sao lưu khóa riêng ở ít nhất 2 nơi. Mất khóa = không thể ra manifest mới cho các bản đã phát hành (phải phát hành app mới chứa khóa mới); lộ khóa = phải thu hồi bằng cách phát hành app mới bỏ khóa cũ.
2. **Điền khóa công khai** vào repo (đây là chỗ cấu hình, hiện đang trống):
   ```bash
   cp /noi/an/toan/prod-2026.pub.pem apps/desktop/resources/keys/production/prod-2026.pub.pem
   ```
3. **Ký manifest** (có thể sửa URL/mirror/sha256 trong `tools/runtime/manifest.json` trước; nên lưu binary trên máy chủ của bạn thay vì URL GitHub tạm):
   ```bash
   node tools/runtime/sign-manifest.mjs --key /noi/an/toan/prod-2026.key.pem --key-id prod-2026
   # ghi apps/desktop/resources/runtime-manifest.signed.json (công khai, commit được)
   ```
4. **Đóng gói gói offline** (không cần khóa riêng; chữ ký đã nằm trong manifest):
   ```bash
   node tools/runtime/pack-runtime.mjs --signed-manifest apps/desktop/resources/runtime-manifest.signed.json \
        --platform linux-x64 --out dist/aps-runtime-linux-x64.apspack
   ```
5. **Đóng gói app**: `pnpm --filter @aps/desktop package` (kiểm tra trước: khóa công khai hợp lệ, manifest ký khớp, không lẫn khóa riêng/khóa dev; kiểm tra sau trên thư mục đã đóng gói).

## Quay vòng khóa
Thêm `<keyId-mới>.pub.pem` cạnh khóa cũ, phát hành bản app mới tin cả hai, ký manifest bằng khóa mới; sau khi người dùng đã nâng cấp thì gỡ khóa cũ ở bản kế tiếp.

## Dev
`pnpm dev:keys` tạo `.dev-keys/` (khóa dev + manifest ký dev). `pnpm dev` và `pnpm poc:render` tự đặt `APS_DEV_TRUST_KEY_FILE=.dev-keys/dev-1.pub.pem` khi thư mục tồn tại; không có đường nào để bật khóa dev trong bản đóng gói.
