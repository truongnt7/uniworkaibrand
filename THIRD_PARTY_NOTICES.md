# Thông báo phần mềm bên thứ ba

Tài liệu này đi kèm mọi bản phân phối (được chép vào `resources/THIRD_PARTY_NOTICES.md` của app đóng gói). Danh sách dưới đây phản ánh
thiết kế hiện tại; **phải rà soát lại theo đúng bản phân phối thực tế** (binary, phiên bản, nền tảng) trước mỗi lần phát hành.

## FFmpeg (LGPL)

- **Giấy phép**: GNU Lesser General Public License, phiên bản 3 hoặc mới hơn (binary được build với `--enable-version3`).
  App **không** phân phối bản FFmpeg có `--enable-gpl` hay `--enable-nonfree`, và không dùng `libx264`/`libx265`.
- **Binary được ghim** (xem `tools/runtime/manifest.json`, mục `ffmpeg`, được ký cùng manifest):

  | Nền tảng | Nguồn | sha256 |
  |---|---|---|
  | linux-x64 | `https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-11-16-15-29/ffmpeg-n8.1.3-35-gf1acb0a266-linux64-lgpl-8.1.tar.xz` | `4499c131e70aeb31b377d1cd2d5f0f99cd4872bfa6e72478dd30495f52ff8553` |
  | win32-x64 | `https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-11-16-15-29/ffmpeg-n8.1.3-35-gf1acb0a266-win64-lgpl-8.1.zip` | `8816920f141720edb654232c999fbeb5eab51ee957dd3687c5287bfb6388ddf9` |
  | macOS (arm64/x64), linux-arm64, win32-arm64 | **chưa có binary LGPL được ghim** | — |

- **Mã nguồn tương ứng** (nghĩa vụ LGPL): FFmpeg `n8.1.3` commit `f1acb0a266` (https://git.ffmpeg.org/ffmpeg.git, https://github.com/FFmpeg/FFmpeg) và
  kịch bản build BtbN https://github.com/BtbN/FFmpeg-Builds commit `c9fe5114060e507409f7ee07edfd82efaf25d767` (toàn bộ cấu hình trong `ffmpeg -buildconf`).
  Nếu tự lưu binary trên máy chủ riêng (khuyến nghị, vì tag `autobuild-*` của BtbN bị xóa định kỳ), phải lưu kèm bản sao mã nguồn trên đó.
- **Cấu hình build** (rút gọn từ `ffmpeg -buildconf` của binary đã ghim): `--enable-version3 --enable-libopenh264 --enable-libaom --enable-libsvtav1 --enable-libvpx
  --enable-libdav1d --enable-libopus --enable-libvorbis --enable-libmp3lame ... --disable-libx264 --disable-libx265 --disable-libxvid --disable-libvidstab --disable-librubberband
  --disable-libzvbi --disable-libfdk-aac` và **không** có `--enable-gpl`, **không** có `--enable-nonfree`. Danh sách đầy đủ do `pnpm --filter @aps/desktop verify:ffmpeg <binary>` kiểm.
- **Codec video cho phép trong app** (`packages/render-core/src/ffmpeg-policy.ts`): H.264 qua `libopenh264`, `h264_videotoolbox`, `h264_nvenc`, `h264_amf`, `h264_qsv`.
  Video xuất ra là H.264 `yuv420p` trong MP4. Codec âm thanh: chỉ khi người dùng chọn tệp nhạc ở chế độ ảnh sang video, mã hoá bằng encoder `aac` tích hợp sẵn của FFmpeg (không dùng `libfdk-aac`); video 3D của PoC không có âm thanh. Nghĩa vụ bằng sáng chế AAC chưa được rà soát. Mọi encoder khác (đặc biệt `libx264`, `libx265`) bị từ chối.
- **Kiểm tự động**: app chạy `ffmpeg -version/-buildconf/-L/-encoders` khi cài runtime và trước mỗi lần ghép video; binary bật `--enable-gpl`/`--enable-nonfree`/thư viện GPL bị từ chối
  (`FFMPEG_LICENSE_VIOLATION`). CI chạy lại kiểm tra này trên binary đã ghim.
- **Lưu ý cần luật sư/người phát hành rà soát** (chưa được xác nhận):
  1. `libopenh264` build từ mã nguồn (như trong binary BtbN) **không** nằm trong giấy phép bằng sáng chế H.264 mà Cisco cấp cho binary do Cisco phân phối (https://www.openh264.org/BINARY_LICENSE.txt);
     nghĩa vụ bằng sáng chế H.264 (MPEG LA/Via LA) là vấn đề riêng, độc lập với LGPL. Phương án thay thế: encoder phần cứng của hệ điều hành (VideoToolbox/NVENC/AMF/QSV) hoặc dùng binary OpenH264 do Cisco tải về lúc chạy.
  2. Binary BtbN gộp nhiều thư viện (openssl, libvmaf, libaom, SVT-AV1, ...): cần đưa đủ thông báo bản quyền/giấy phép của từng thư viện vào bản phân phối.
  3. LGPL cho phép người dùng thay thế thư viện FFmpeg: app gọi ffmpeg như tiến trình riêng, binary nằm trong thư mục runtime có thể thay thế; nhưng việc kiểm chính sách LGPL của app sẽ từ chối bản GPL do người dùng tự thay.

## Phông chữ Be Vietnam Pro (SIL Open Font License 1.1)

- **Tệp đi kèm**: `BeVietnamPro-Regular.ttf`, `BeVietnamPro-SemiBold.ttf`, `BeVietnamPro-Bold.ttf` trong `apps/desktop/resources/fonts/` (đóng gói thành `resources/fonts/`), kèm nguyên văn giấy phép ở `OFL.txt` cùng thư mục.
- **Tác giả/giấy phép**: Copyright 2021 The Be Vietnam Pro Project Authors (https://github.com/bettergui/BeVietnamPro); **SIL Open Font License, Version 1.1** (https://openfontlicense.org).
- **Nguồn tải**: https://github.com/google/fonts/tree/main/ofl/bevietnampro (bản gốc, không sửa).
- **Dùng ở đâu**: (1) giao diện app (Regular, SemiBold; nạp bằng `@font-face` từ gói renderer, không tải từ mạng); (2) chữ trên video ảnh sang video (Bold, ffmpeg `drawtext`). Được chọn vì thiết kế riêng cho tiếng Việt (đủ dấu, dấu xếp chồng đúng), cho phép đóng gói và dùng thương mại.
- **Điều kiện OFL cần giữ**: không bán riêng phông; giữ thông báo bản quyền và văn bản giấy phép khi phân phối lại; bản sửa đổi không được dùng tên "Be Vietnam Pro" (app không sửa phông).
- **Chưa rà soát**: ngoài OFL, chưa có ý kiến pháp lý về việc video do người dùng tạo có nhúng hình chữ (OFL cho phép; ghi để người phát hành xác nhận).

## Blender (GPL-3.0-or-later)

Blender 4.5 LTS được **tải về lúc chạy** (hoặc nhập từ gói offline) và chạy như một tiến trình riêng; không được liên kết vào app. Thư mục `blender-worker/` (script `bpy`)
được phát hành theo GPL-3.0-or-later (xem `blender-worker/LICENSE`) và đi kèm bản phân phối ở dạng mã nguồn. Gói runtime offline có chứa Blender nên phải kèm văn bản GPL và nguồn tương ứng
(https://download.blender.org/source/ hoặc https://projects.blender.org/blender/blender). Chưa có ý kiến pháp lý bằng văn bản (P0-19).

## Chuyển ảnh HEIC/HEIF sang JPG (libheif-js: LGPL-3.0; heic-decode: ISC; jpeg-js: BSD-3-Clause)

Ảnh iPhone (HEIC/HEIF) được chuyển sang JPG ngay khi khách chọn ảnh, trong một luồng worker của tiến trình nền (không chặn giao diện). Bản JPG nằm trong thư mục dữ liệu của app (`uploads/`); ảnh gốc không bị sửa hay xóa.

| Thư viện | Phiên bản (ghim chính xác) | Giấy phép | Vai trò | Nguồn |
|---|---|---|---|---|
| `libheif-js` (libheif + libde265 biên dịch ra WebAssembly bằng Emscripten) | 1.23.5 | **LGPL-3.0** | giải mã HEIC/HEIF (HEVC) | https://github.com/catdad-experiments/libheif-js, mã gốc libheif https://github.com/strukturag/libheif, libde265 https://github.com/strukturag/libde265 |
| `heic-decode` | 2.1.0 | ISC | giao diện Node gọi libheif-js | https://github.com/catdad-experiments/heic-decode |
| `jpeg-js` | 0.4.4 | BSD-3-Clause | mã hóa JPG (JS thuần) | https://github.com/eugeneware/jpeg-js |

- **Vì sao chọn bộ này**: chạy được trên Windows/macOS/Linux với Electron mà không cần biên dịch addon native (không `sharp`/`libvips` đi kèm `libheif` có thể kéo theo `x265` GPL, không `ImageMagick`); mọi thứ là JS + WebAssembly nên ổn định theo từng phiên bản Electron. Chỉ **giải mã** (libde265); app không chứa bộ mã hóa HEVC (không x265).
- **Nghĩa vụ LGPL-3.0 (libheif, libde265)**: (1) giữ nguyên văn giấy phép: `resources/licenses/libheif-js-LICENSE` (trong bản đóng gói) kèm bản trong `app.asar/node_modules/libheif-js/`; (2) thư viện được dùng **nguyên bản, không sửa**, nằm thành mô-đun riêng trong `resources/app.asar/node_modules/libheif-js/` (không bị gộp/biên dịch lại vào mã của app: cấu hình `externalizeDepsPlugin` giữ `dependencies` ngoài bundle) nên người dùng có thể thay bằng phiên bản khác (giải `app.asar`, thay thư mục, đóng lại bằng `asar pack`); (3) mã nguồn tương ứng ở các liên kết trên (đúng phiên bản 1.23.5 của gói npm; tag/commit nằm trong gói npm và repo `catdad-experiments/libheif-js`). Nếu phát hành dưới dạng bản cài hạn chế quyền thay thế (store có DRM, ký chặn sửa), cần xem lại nghĩa vụ "thông tin cài đặt" của LGPL-3.0.
- **Lưu ý cần luật sư/người phát hành rà soát (chưa được xác nhận)**: HEIC dùng nén **HEVC/H.265**. LGPL chỉ nói về bản quyền mã nguồn; **bằng sáng chế HEVC** (Access Advance, Via LA, ...) là vấn đề riêng, độc lập với giấy phép mã. Trình giải mã libde265 phần mềm không có giấy phép bằng sáng chế đi kèm. Tương tự lưu ý `libopenh264` ở mục FFmpeg. Phương án giảm rủi ro nếu cần: tắt chuyển HEIC và hướng dẫn khách xuất JPG ("Cài đặt máy ảnh > Định dạng > Tương thích nhất").
- **Không thu thập dữ liệu**: giải mã chạy hoàn toàn trên máy khách; không có kết nối mạng.

## Electron, Chromium và thư viện JavaScript

Electron (MIT) và Chromium kèm theo giấy phép của chúng (`LICENSE`, `LICENSES.chromium.html` trong thư mục app). Thư viện renderer/bundle (React, i18next, zod, ...) dùng giấy phép MIT/BSD/Apache-2.0;
bản phát hành phải sinh danh sách đầy đủ bằng công cụ quét giấy phép (chưa tự động hóa trong PoC).
