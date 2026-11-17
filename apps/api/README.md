# @aps/api — Backend MVP (NestJS + PostgreSQL + S3-compatible)

API cho AI Product Studio: đăng nhập, workspace/thành viên, metadata sản phẩm/asset/mẫu/thư viện nội dung,
manifest runtime đã ký (Blender 4.5 LTS + ffmpeg LGPL) và admin cấp gói/credit thủ công cho pilot chuyển khoản.
Tham chiếu: `docs/ke-hoach-ai-blender-electron.md` mục 4.1, 4.3, 8 (P0-16, P0-17).

> Vị trí: `apps/api` (khớp workspace `apps/*` hiện có). Kế hoạch mục 8.2 ghi `apps/cloud/api`; chuyển thư mục là việc đổi
> `pnpm-workspace.yaml` (thêm `apps/cloud/*`) khi có thêm service cloud — chưa làm để không đụng cấu hình dùng chung.

## Chạy local

Yêu cầu: Node ≥ 22.12, pnpm 10, Docker (compose v2).

```bash
pnpm install
cd apps/api
docker compose up -d --wait         # PostgreSQL 16 (5432) + MinIO (9000, console 9001)
cp .env.example .env
pnpm keys:dev                       # sinh khóa ký manifest DEV (keyId dev-*) và ghi vào .env
pnpm migrate                        # hoặc đặt DB_MIGRATIONS_RUN=true (mặc định trong .env.example)
pnpm dev                            # build + chạy http://localhost:3000
```

- Swagger UI: <http://localhost:3000/docs> · OpenAPI JSON: `/docs-json` (tắt mặc định khi `APS_ENV=production`).
- Tạo tài khoản admin nền tảng (để dùng `/admin/*`): `ADMIN_PASSWORD='…≥12 ký tự…' pnpm admin:create ops@example.com "Ops"`.
  Quyền admin **chỉ** cấp bằng CLI này (đăng ký không thể tự đặt cờ admin).
- MinIO console: <http://localhost:9001> (`minioadmin` / `minioadmin`, chỉ dùng dev). Bucket tự tạo khi `S3_AUTO_CREATE_BUCKET=true`.
- Image MinIO: image chính thức `minio/minio` đã bị gỡ khỏi Docker Hub/Quay (chỉ còn mã nguồn), nên `docker-compose.yml` mặc định
  dùng bản build từ mã nguồn MinIO của `ghcr.io/coollabsio/minio` (ghim phiên bản). Đổi bằng `MINIO_IMAGE=…`, hoặc trỏ `S3_*`
  tới S3/R2 thật và bỏ dịch vụ `minio`. **Cần quyết định hạ tầng storage cho staging/production** (xem cuối file).

## Kiểm thử

```bash
pnpm --filter @aps/api typecheck
pnpm --filter @aps/api test         # unit (không cần DB), chạy cả trong `pnpm test` ở root
pnpm --filter @aps/api test:e2e     # e2e thật: cần `docker compose up -d --wait`
```

E2E tạo lại CSDL `aps_test` (drop/create), chạy **toàn bộ migration từ đầu**, rồi gọi API qua HTTP với PostgreSQL + MinIO thật
(PUT/GET presigned URL thật, đồng thời/race trên sổ cái, refresh token…). Biến ghi đè: `TEST_DATABASE_ADMIN_URL`, `TEST_S3_ENDPOINT`,
`TEST_S3_ACCESS_KEY`, `TEST_S3_SECRET_KEY`. CI: `.github/workflows/api.yml` (docker compose + e2e).

## Chọn công nghệ

- **TypeORM (không dùng Prisma)**: tích hợp sẵn `@nestjs/typeorm`; migration là SQL tường minh nên mô tả được trigger bất biến,
  partial unique index, GIN index, CHECK mà ORM không biểu diễn hết; transaction + khóa hàng (`FOR UPDATE`) cho sổ cái/refresh token
  dùng trực tiếp; không cần bước generate client/engine nhị phân. Đổi lại kiểu dữ liệu yếu hơn Prisma — bù bằng test e2e.
  Migration đầu tiên sinh từ entity rồi bổ sung tay; test `platform.e2e` so schema thật với entity để phát hiện lệch.
- **Nest 11 / TypeORM 0.3**: ghim dòng đã biết rõ (npm đã có Nest 12 / TypeORM 1.x; chưa nâng).
- Hash mật khẩu **argon2id** (`@node-rs/argon2`); JWT access HS256 (15 phút) + refresh token **opaque, xoay vòng, phát hiện dùng lại**
  (dùng lại token cũ ⇒ thu hồi cả họ token).

## Bản đồ API (chi tiết ở Swagger)

| Nhóm | Endpoint chính |
|---|---|
| Auth | `POST /auth/register` `login` `refresh` `logout`, `GET /auth/me` |
| Workspace | `POST/GET /workspaces`, `PATCH /workspaces/:id`, `…/members` (admin/member; không hạ/xóa admin cuối cùng) |
| Product | `/workspaces/:w/products` — SKU (duy nhất/workspace), tên, danh mục, thương hiệu, `brandColors[]`, kích thước mm, `modelStatus`, ảnh bìa; lọc `q/category/brand/hasModel` |
| Asset | `…/products/:p/assets` — `photo/glb/label/logo/music/prop`; `POST` → presigned PUT; `…/complete`; `…/download-url`; `PATCH …/label` (kiểu chiếu, vị trí, rộng/cao) |
| Template | `/workspaces/:w/templates` (mẫu hệ thống + của workspace); mẫu hệ thống tạo ở `/admin/templates` |
| Thư viện | `/workspaces/:w/contents` (trạng thái, tiến độ, phiên bản V1/V2 qua `…/versions`, thẻ, yêu thích), `/folders`, `/tags` |
| Runtime | `GET /runtime/manifest` (phong bì đã ký), `GET /runtime/public-keys`; admin: `PUT /admin/runtime/releases` |
| Billing | `GET /workspaces/:w/billing`, `…/billing/ledger`; admin: `/admin/plans`, `/admin/invoices(+confirm/cancel)`, `/admin/workspaces/:id/credits`, `…/subscriptions`, `/admin/audit-logs` |
| Hệ thống | `GET /health` (DB + S3) |

Mọi bảng nghiệp vụ có `workspace_id`; truy cập qua `/workspaces/:workspaceId/…` luôn qua guard thành viên (người ngoài nhận **404**).
Phân trang `limit` (≤100) / `offset`. Lỗi: `{ statusCode, code, message, details? }`.

### Upload qua presigned URL

1. `POST …/assets` `{kind, filename, contentType, sizeBytes, sha256?}` → `{asset(status=pending), upload:{method:'PUT', url, headers, expiresAt}}`.
   Server kiểm loại/đuôi/dung lượng theo từng `kind` (không nhận `.blend`), ký **Content-Type và Content-Length** vào URL.
2. Client `PUT` thẳng lên S3 với `headers` trả về (Electron/Node, không qua API).
3. `POST …/complete` → server `HEAD` object, kiểm dung lượng (lệch ⇒ xóa object + lỗi), đặt `ready`; `glb` ⇒ `modelStatus=ready`,
   ảnh đầu tiên ⇒ ảnh bìa. `sha256` do client khai báo, **server chưa tự băm lại nội dung**.

### Manifest runtime & khóa ký

- Phong bì `{ manifest: "<chuỗi JSON>", signature: "<ed25519 base64>", keyId }` — chữ ký phủ đúng từng byte của chuỗi `manifest`;
  tương thích `SignedManifest`/`RuntimeManifest` của `@aps/shared` (có test). Phần mở rộng: `ffmpeg{version, license LGPL-*, artifacts}`,
  `environment`, `releaseId`.
- Schema khóa cứng **Blender `4.5.x` LTS**, ffmpeg chỉ **LGPL**, sha256 64 hex, nền tảng thuộc danh sách, production yêu cầu `https`.
- **Khóa chỉ lấy từ biến môi trường** `MANIFEST_SIGNING_KEY` (ed25519 PKCS8 PEM, hoặc base64 của PEM) + `MANIFEST_KEY_ID`; không đọc từ đĩa/repo.
  - `APS_ENV=production`: **bắt buộc** có khóa, keyId phải `prod-*` (khóa/keyId dev bị từ chối lúc khởi động).
  - dev/test: keyId phải `dev-*`; không có khóa ⇒ `/runtime/manifest` trả 503 (không tự sinh khóa).
  - `pnpm keys:dev` sinh khóa dev vào `.env` (đã gitignore) và in khóa công khai để nhúng vào desktop dev. **Không có private key nào trong repo.**
  - Production: tạo cặp khóa ngoài repo, đặt private key vào secret manager, nhúng **public key production** vào bản build desktop;
    `GET /runtime/public-keys` chỉ để đối chiếu.
- Bản manifest mặc định (seed lần chạy đầu) lấy Blender 4.5.16 từ `tools/runtime/manifest.json` (có test chống lệch). **`ffmpeg.artifacts` đang rỗng**
  vì chưa có bản ffmpeg LGPL nào được đóng gói/băm — cần phát hành qua `PUT /admin/runtime/releases` sau P0-07/P0-12.

### Billing thủ công (pilot chuyển khoản)

`plans` → `invoices` (nội dung chuyển khoản `reference` duy nhất) → admin `confirm` ⇒ trong **một transaction**: hóa đơn `paid`,
gói cũ `expired`, gói mới `active`, cộng credit của gói vào `credit_ledger`, ghi `audit_logs`. `credit_ledger` và `audit_logs` bất biến
(trigger DB chặn UPDATE/DELETE); số dư `workspaces.credit_balance` có CHECK ≥ 0 và chỉ đổi dưới khóa hàng cùng dòng sổ cái.
Cấu trúc đủ để gắn PayOS/VNPay/MoR sau mà không đổi mô hình. `BillingService.debit()` sẵn cho AI Gateway (chưa có endpoint).

## Biến môi trường

Xem `.env.example`. Thêm: `TRUST_PROXY=<số hop>` khi chạy sau reverse proxy (để rate limit theo IP thật), `CORS_ORIGINS=a,b`,
`RATE_LIMIT_ENABLED`, `SWAGGER_ENABLED`, `DEFAULT_LOCALE` (vi|en), `S3_PUBLIC_ENDPOINT` (host mà client dùng để PUT/GET presigned URL).

## i18n lỗi

`message` theo `Accept-Language` (vi mặc định, en; có q-value). `code` ổn định để client tự dịch theo khóa `errors.<code>`.
Thêm mã: sửa `src/i18n/messages.ts` (test bắt buộc vi/en đủ cặp).

## Phạm vi chưa làm / giới hạn đã biết

- Chưa có Redis/BullMQ (đúng quyết định MVP); rate limit lưu **trong bộ nhớ từng instance** — cần storage dùng chung khi chạy nhiều instance.
- Chưa có: Project/ProjectVersion/RenderJob/Channel/PostSchedule (V1), AI Gateway, đồng bộ metadata theo `updated_at+device_id`
  (trường `device_id`/`updated_at` đã có, chưa có endpoint "changes since"), đăng nhập Google, xác minh email/quên mật khẩu, invite qua email
  (hiện thêm member bằng email của tài khoản **đã đăng ký**), dọn asset `pending` bị bỏ dở, xóa object S3 khi xóa mềm sản phẩm.
- `Content` mới là metadata; upload blob bản xuất dùng lại cơ chế presigned sẽ bổ sung khi tích hợp desktop.
- Chưa có Dockerfile cho API (chạy bằng `node dist/main.js`).
