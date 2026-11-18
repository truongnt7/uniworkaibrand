# Bản cài thử Windows x64 (NSIS), CI và lộ trình ký số

Bản cài thử là installer NSIS một-chạm, cài theo từng người dùng (không cần quyền quản trị), gửi cho khách dùng thử. Hướng dẫn cho khách: [../trial-guide.md](../trial-guide.md).

## Tình trạng: CHƯA KÝ SỐ

- Installer và `AI Product Studio.exe` **không có chữ ký Authenticode**. Windows SmartScreen hiện "Windows protected your PC / Windows đã bảo vệ PC của bạn"; khách phải bấm **More info (Thông tin thêm) > Run anyway (Vẫn chạy)**. Trình duyệt cũng có thể cảnh báo khi tải. Việc này được ghi rõ trong `docs/trial-guide.md` mục 2.
- Không có chứng chỉ/khóa ký số nào trong repo, workflow hay installer. Cấu hình `win` trong `apps/desktop/electron-builder.yml` cố ý **không** có `certificateFile`/`publisherName`/`azureSignOptions`, và đặt `signAndEditExecutable: false` (không tải công cụ ký, exe giữ biểu tượng/metadata Electron mặc định).
- Hệ quả khác: Windows Defender có thể phân tích chậm tệp lạ lần đầu; vài phần mềm diệt virus có thể gắn nhãn nhầm tệp chưa ký (false positive). Khi gặp, báo nhà cung cấp phần mềm diệt virus gửi lại mẫu để xác minh sau khi ký.

## Pipeline

Workflow [`.github/workflows/trial-installer.yml`](../../.github/workflows/trial-installer.yml) (chạy trên `windows-latest`; kích hoạt thủ công `workflow_dispatch` và khi PR đụng tới `apps/desktop`, `packages`, `tools/trial|runtime`, `THIRD_PARTY_NOTICES.md`):

1. `pnpm install --frozen-lockfile`; bảo đảm có `electron.exe`.
2. **Khóa**: `node tools/trial/prepare-trial-keys.mjs` (xem [runtime-signing.md](runtime-signing.md), mục "Bản thử nghiệm"). Có khóa + manifest production hợp lệ thì dùng; chưa có thì dùng khóa trial riêng. Khóa riêng không vào repo/installer.
3. **Đóng gói**: `pnpm --filter @aps/desktop package:installer` = `check-release --pre` (khóa công khai hợp lệ, manifest ký đúng, không khóa riêng/khóa dev) → `electron-vite build --mode production` (loại mã nạp khóa dev) → `electron-builder --win nsis --x64` → `check-release --post` trên `win-unpacked` (không khóa riêng/khóa dev, có phông OFL, `THIRD_PARTY_NOTICES.md`, giấy phép LGPL libheif-js) → đúng 1 tệp `.exe`.
4. **Cài thật**: chạy installer `/S` (silent), tìm `AI Product Studio.exe` trong `%LOCALAPPDATA%\Programs`.
5. `check-release --post` lần nữa trên **thư mục đã cài** (`resources/`).
6. **Smoke test** [`apps/desktop/scripts/e2e-trial.mjs`](../../apps/desktop/scripts/e2e-trial.mjs) trên app đã cài (Playwright điều khiển Electron thật, không `APS_FFMPEG`, không khóa dev):
   - mở app, giao diện tiếng Việt, banner xin tải gói ffmpeg;
   - **tải gói ffmpeg thật** (win32-x64 LGPL, khoảng 168 MB từ GitHub, kiểm sha256 + chữ ký manifest bằng khóa trial trong installer, giải nén bằng `System32\tar.exe`), đồng thời xác nhận gói này **không** kéo Blender;
   - chọn ảnh, trong đó 1 ảnh **HEIC** (đổi sang JPG bằng worker, đúng 1 tệp JPG trong `uploads/`);
   - tạo video ảnh sang video, lưu, **`ffprobe`** (bản đi kèm gói ffmpeg): H.264 `yuv420p`, 1080x1920, dài hơn 5 giây;
   - đóng app, mở lại: bài nháp (tên, mẫu, 3 ảnh, thông tin) còn nguyên, không báo thiếu ảnh, không hiện lại banner tải.
7. Gỡ cài đặt (silent, không chặn pipeline nếu lỗi), xóa khóa trial cố định tạm (nếu có).
8. **Artifact**: `AI-Product-Studio-Trial-Setup-x64` (installer `.exe` + `.sha256`, giữ 30 ngày) và `trial-smoke-report` (`smoke-report.json`, ảnh chụp từng bước, video đã lưu, giữ 14 ngày). Summary của job ghi SHA-256, kích thước, chế độ khóa (`trial`/`production`) và cảnh báo SmartScreen.

Chạy smoke trên Linux (cùng kịch bản, thư mục `linux-unpacked`): `pnpm --filter @aps/desktop package` (đặt `APS_PACKAGE_KEYS_DIR`/`APS_PACKAGE_MANIFEST` theo đầu ra của `prepare-trial-keys`) rồi `xvfb-run -a node apps/desktop/scripts/e2e-trial.mjs release-build/linux-unpacked`.

## Mô hình khóa của bản thử

| | Giá trị |
|---|---|
| keyId | `trial-<yyyymmdd>-<6 hex>` (khóa tạm) hoặc `trial-<8 hex>` (khóa trial cố định từ Secret), **không** bắt đầu bằng `dev` |
| Khóa riêng | Tạm: sinh trong thư mục tạm ngoài repo, xóa ngay sau khi ký. Cố định: Secret `APS_TRIAL_SIGNING_KEY` (tùy chọn), chỉ ghi ra `RUNNER_TEMP` trong lúc build |
| Khóa công khai | `resources/keys/production/<keyId>.pub.pem` trong installer |
| Manifest | `runtime-manifest.signed.json` ký bằng khóa đó, đóng trong installer; đổi URL/sha256 = ra installer mới |
| Tách khỏi khóa dev | Giữ nguyên: bản đóng gói không bao giờ nạp khóa dev; `check-release` chặn `dev-*` |
| Tách khỏi khóa production | Khóa trial không dùng được để ký bản production và ngược lại (mỗi installer chỉ tin khóa được đóng cùng nó) |

Có test: `apps/desktop/tests/trial-keys.test.ts` (khóa trial vs dev vs production, manifest bị sửa, ký nhầm khóa, khóa riêng trong repo bị từ chối), `tests/check-release.test.ts`.

## Lộ trình ký số (chưa làm, cần người phát hành)

1. **Chọn chứng chỉ Authenticode** (mua cho pháp nhân, cần xác minh tổ chức):
   - **EV code signing**: SmartScreen tin ngay, giá cao, khóa nằm trên token phần cứng/HSM.
   - **OV code signing** hoặc **dịch vụ ký đám mây** (ví dụ Azure Trusted Signing, SignPath, DigiCert KeyLocker): rẻ hơn; danh tiếng SmartScreen tích lũy dần theo số lượt cài. Từ 2023 khóa ký phải ở HSM/dịch vụ đám mây, không còn tệp `.pfx` thường.
2. **Không bao giờ** để chứng chỉ/khóa ký trong repo hay installer. Dùng OIDC của GitHub tới nhà cung cấp ký, hoặc Secret của môi trường có phê duyệt (`environment: release`); hạn chế quyền tới nhánh/tag phát hành.
3. Cập nhật `electron-builder.yml`: bỏ `signAndEditExecutable: false`, thêm cấu hình ký (ví dụ `win.azureSignOptions` hoặc `signtoolOptions`), `publisherName`; ký cả `AI Product Studio.exe`, installer và uninstaller, có dấu thời gian (timestamp) để chữ ký còn hiệu lực sau khi chứng chỉ hết hạn.
4. Thêm vào `check-release --post`/workflow bước `Get-AuthenticodeSignature` bắt buộc `Status = Valid` và đúng chủ thể cho bản phát hành chính thức; bản thử vẫn cho qua nhưng ghi "unsigned" trong summary.
5. Điền khóa production theo [runtime-signing.md](runtime-signing.md): workflow tự chuyển `trial` → `production`.
6. Thay các đoạn "Chưa ký số" trong `docs/trial-guide.md` mục 2 và 9, thêm bước nộp tệp lên Microsoft để xác minh danh tiếng/false positive nếu cần.

## Rủi ro và việc chưa kiểm

- **Lần chạy Windows đầu tiên** của luồng này là CI của nhánh `mvp/trial-installer`; kết quả nằm trong mô tả PR. Trước đó mới kiểm trên Linux (cùng kịch bản smoke trên `linux-unpacked`).
- NSIS `language: "1066"` (tiếng Việt) và cài one-click chưa được thử với người dùng thật; installer chỉ hiện tiến trình ngắn.
- Giải nén zip trên Windows dựa vào `System32\tar.exe` (bsdtar); Windows 10 1803 trở lên có sẵn. Máy tắt hoặc xóa tệp này sẽ lỗi `EXTRACT_FAILED`.
- Tải ffmpeg phụ thuộc URL GitHub BtbN `autobuild-*` (thẻ bị xóa định kỳ, đã ghi ở `THIRD_PARTY_NOTICES.md`). Khuyến nghị chép binary lên máy chủ riêng và thêm vào `mirrors` rồi ký lại manifest trước khi phát rộng.
- Thư mục dữ liệu là `%APPDATA%\@aps\desktop` (tên gói npm). Nên đặt `app.setName`/`productName` trước khi phát hành chính thức (kèm bước di chuyển dữ liệu), nếu không khách sẽ thấy tên lạ.
- Bản thử không tự cập nhật; không có telemetry hay báo lỗi tự động (phản hồi thủ công, `docs/trial-guide.md` mục 5).
- Bản quyền/bằng sáng chế: `libopenh264` (H.264), HEVC (HEIC), AAC, đã ghi ở `THIRD_PARTY_NOTICES.md` và **chưa có ý kiến pháp lý**; nên rà soát trước khi gửi cho khách ngoài nhóm thân quen.
- Hook e2e `APS_E2E=1` + `APS_E2E_FILES` hoạt động cả trên app đóng gói (cần cho smoke test). Nó chỉ thay hộp thoại chọn tệp bằng đường dẫn cho sẵn trong biến môi trường của chính người dùng, không mở thêm quyền nào; vẫn nên cân nhắc tắt ở bản phát hành chính thức.
