# Khóa công khai PRODUCTION (đang TRỐNG, cần người phát hành điền)

Đặt vào đây file `<keyId>.pub.pem` (Ed25519, định dạng SPKI PEM), ví dụ `prod-2026.pub.pem`.
**Không bao giờ** đặt khóa riêng, và không dùng tên bắt đầu bằng `dev`. Cách sinh khóa offline và ký manifest: `docs/ops/runtime-signing.md`.
Cho tới khi có ít nhất một khóa ở đây, bản đóng gói từ chối cài runtime và `pnpm package` không chạy.
