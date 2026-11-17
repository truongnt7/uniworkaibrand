# Giấy phép thành phần bên thứ ba và nghĩa vụ phân phối

> **Đây là tài liệu kỹ thuật-tuân thủ nội bộ, không phải tư vấn pháp lý.** Tra cứu ngày **17/11/2026**. Chỗ ghi **"cần xác minh"** phải kiểm lại (hoặc chạy công cụ quét giấy phép) khi khóa phiên bản; **LS** = luật sư phải xác nhận trước phát hành pilot.
> Căn cứ: [kế hoạch mục 2.6, 3.1, 6](../ke-hoach-ai-blender-electron.md), [quyết định đã chốt](../project-context.md): Blender **4.5 LTS** tải lần đầu + bộ cài offline; **`blender-worker` GPL công khai, tách khỏi app**; **ffmpeg bản LGPL**; model AI kiểm giấy phép từng cái.
> Không tạo `THIRD_PARTY_NOTICES` ở gốc repo lúc này vì repo chưa có mã hay bản phát hành. Khi có bản dựng, tạo tệp đó **tự động** từ công cụ (mục 6) và đưa vào installer. Mẫu nội dung ở mục 5.

Vai trò: **CDA** chủ dự án, **LS** luật sư, **BE** desktop/orchestrator/backend, **TA** technical artist (Blender-Python), **ML** AI/ảnh, **OPS** hạ tầng/pháp lý/phát hành.

## 1. Mô hình phân phối (để biết ai là "bên phân phối")

| Gói | Chứa gì | Ai phân phối | Giấy phép chi phối |
|---|---|---|---|
| **Installer app** (NSIS/DMG) | Electron + mã app (đóng) + thư viện npm + (không có Blender) | Chúng tôi | Điều khoản của chúng tôi + giấy phép từng thư viện |
| **Runtime pack** (tải lần đầu) | Blender 4.5 LTS (rút gọn?) + `blender-worker` + ffmpeg (LGPL) + model ONNX + mẫu cảnh/tài sản | Chúng tôi (S3/CDN) hoặc chuyển hướng đến nguồn chính thức | GPL (Blender, worker), LGPL (ffmpeg), license từng model/tài sản |
| **Bộ cài offline** | Installer + runtime pack trong một tệp | Chúng tôi | Như trên; **đây là gói chắc chắn do chúng tôi phân phối Blender** |
| **Mã nguồn công khai** | `blender-worker` (GPL-3.0), mã nguồn ffmpeg đúng bản, bản/chỉ dẫn mã nguồn Blender | Chúng tôi (repo công khai + S3) | GPL/LGPL |

Điểm mấu chốt: **app (đóng) và Blender/worker giao tiếp chỉ qua `job.json` + stdout JSON-lines + exit code, chạy thành tiến trình riêng**; không liên kết thư viện GPL vào app; ffmpeg cũng chạy như tiến trình riêng hoặc dùng bản LGPL liên kết động.

## 2. Bảng giấy phép các thành phần

| Thành phần | Giấy phép | Cách dùng trong sản phẩm | Nghĩa vụ chính | Trạng thái / lưu ý |
|---|---|---|---|---|
| **Blender 4.5 LTS** | Mã nguồn chính **GPL-2.0+**; bản nhị phân phát hành theo **GPL-3.0+** (blender.org). Cycles: Apache-2.0. Kèm Python (PSF), Bullet (zlib), OSL (BSD), OpenImageDenoise (Apache-2.0) và nhiều thư viện khác | Chạy `blender -b` như tiến trình riêng, **không sửa mã** | (1) kèm văn bản GPL và thông báo bản quyền gốc, không sửa/gỡ; (2) kèm **mã nguồn hoặc chỉ dẫn lấy mã nguồn đúng bản**; (3) không thêm hạn chế vào quyền GPL của người nhận | FAQ Blender: với **bản chính thức không sửa**, chỉ cần cung cấp thông tin dẫn tới mã nguồn ở blender.org là đủ. **Rút gọn Blender (P0-08: bỏ add-on/tài liệu/studiolights) có thể bị coi là bản sửa đổi**: LS quyết; mặc định an toàn là **tự lưu trữ mã nguồn đúng bản + danh sách tệp đã bỏ + cách dựng lại** |
| **`blender-worker/`** (mã của ta) | **GPL-3.0-or-later** (đề xuất; LS xác nhận) | Chạy **bên trong** Blender qua `--python`, dùng `bpy` | Công khai toàn bộ mã nguồn từng bản phát hành, kèm header giấy phép, kèm trong runtime pack hoặc có link cố định tới đúng tag | Quyết định D6 đã chấp nhận công khai. Xem mục 3 về ranh giới |
| **ffmpeg (LGPL)** | **LGPL-2.1+** khi dựng **không** có `--enable-gpl` và `--enable-nonfree` | Chạy `ffmpeg` như tiến trình riêng (ghép khung, overlay logo, mã hóa) | Danh sách LGPL của ffmpeg.org (mục 4) | Chọn encoder H.264: xem mục 4 (không dùng libx264). Thương hiệu FFmpeg viết đúng "FFmpeg" |
| **Electron** (kèm Chromium, Node.js, V8…) | Electron **MIT**; Chromium và phụ thuộc: tập hợp BSD/MIT/Apache/LGPL… (tệp `LICENSES.chromium.html`) | Khung ứng dụng | Giữ nguyên `LICENSE` và `LICENSES.chromium.html` trong bản phân phối; hiển thị trong màn Giấy phép | Xác minh khi build: electron-builder mặc định giữ các tệp này; không xóa khi tối ưu dung lượng |
| **electron-builder, electron-updater** | MIT | Đóng gói, tự cập nhật | Thông báo giấy phép | Cần xác minh khi khóa phiên bản |
| **React, TypeScript, Vite/electron-vite, Tailwind, Radix, shadcn/ui, TanStack Query, Zustand, zod, i18next** | Chủ yếu **MIT** (TypeScript: Apache-2.0) | UI, logic | Giữ thông báo bản quyền trong bản phân phối | Cần xác minh tự động (mục 6); shadcn/ui là mã chép vào dự án (MIT) |
| **Three.js, react-three-fiber** | MIT | Xem trước 3D | Thông báo | Cần xác minh |
| **better-sqlite3** (kèm SQLite) | MIT; SQLite thuộc phạm vi công cộng | Lưu cục bộ | Thông báo | Cần xác minh |
| **ONNX Runtime** | MIT | Chạy model tách nền | Thông báo | Cần xác minh (và bản DirectML/CoreML đi kèm) |
| **NestJS, PostgreSQL, Redis/BullMQ (V1), AWS SDK/MinIO client** | MIT; PostgreSQL License; Redis (giấy phép phiên bản mới thay đổi: **cần xác minh** nếu dùng Redis ≥ 7.4); Apache-2.0 | **Chỉ chạy ở máy chủ**, không phân phối cho khách | Nghĩa vụ phân phối không phát sinh (không giao bản sao); vẫn lưu danh mục để rà soát | Cân nhắc giấy phép Redis khi V1; có thể dùng Valkey hoặc dịch vụ quản lý (**cần xác minh**) |
| **Model tách nền BiRefNet** | **MIT** (mã nguồn và trọng số, xác nhận bởi tác giả tại issue #316 ngày 29/07/2026) | Local (ONNX) | Giữ thông báo MIT trong gói model; ghi tên biến thể và checksum | **Đã xác minh 17/11/2026**; kiểm lại biến thể cụ thể (HR, dynamic, matting) trước khi khóa |
| **Model U²-Net** | Apache-2.0 (theo kế hoạch) | Dự phòng | Thông báo + NOTICE | **Cần xác minh** repo/trọng số cụ thể dùng |
| **BRIA RMBG-2.0** | **CC BY-NC 4.0** (phi thương mại); dùng thương mại cần hợp đồng | **KHÔNG dùng** | — | Đã xác minh 17/11/2026: cấm đưa vào sản phẩm thương mại nếu không có thỏa thuận |
| **Image→3D / sinh ảnh / LLM (đám mây)** | Điều khoản dịch vụ từng nhà (Tripo/Meshy/Hunyuan/Rodin, Flux, Gemini, GPT-image, Claude/GPT/Gemini…) | Gọi qua AI Gateway | Quyền sử dụng thương mại kết quả; lưu giữ dữ liệu; dùng dữ liệu huấn luyện; giới hạn vùng (Hunyuan loại trừ EU/UK/Hàn Quốc); hợp đồng xử lý dữ liệu | Chọn nhà ở P0-11: bảng so sánh phải có cột "điều khoản" (kế hoạch đã yêu cầu). Không nhúng model TRELLIS cục bộ (submodule phi thương mại, theo kế hoạch) |
| **Tài sản HDRI/texture/model từ Poly Haven, ambientCG** | **CC0 1.0** | Mẫu cảnh | Không bắt buộc ghi công (nên ghi); vẫn lưu nguồn, URL, ngày tải trong `license.json` | **Đã xác minh 17/11/2026** (polyhaven.com/license, docs.ambientcg.com/license). Điều khoản website ≠ tài sản: không cào dữ liệu hàng loạt site |
| **Mẫu cảnh `.blend`, bục, đạo cụ do artist dựng** | Quyền thuộc ta nếu có **hợp đồng chuyển nhượng/giao quyền** | Mẫu cài sẵn | Hợp đồng ghi rõ quyền sử dụng thương mại, quyền phân phối trong phần mềm, quyền sửa | Chưa có hợp đồng mẫu: CDA + LS soạn; lưu hợp đồng cùng `license.json` |
| **Tài sản marketplace ("Standard license")** | Tùy từng nhà bán | Không nên dùng | Thường **cấm phân phối lại tệp gốc** | Chỉ dùng nếu giấy phép cho phép **nhúng + phân phối lại**; mặc định loại |
| **Nhạc nền (V1)** | Hợp đồng kho nhạc | Gắn vào video của khách | Giấy phép **cho quảng cáo mạng xã hội**, không đòi khách nộp thêm phí, **phân phối trong ứng dụng/tải từ máy chủ**; xử lý Content ID/claim | Chưa chọn kho: tiêu chí ở mục 7. Phân biệt giữa "nhạc nhúng trong video khách xuất" và "tệp nhạc phân phối cho khách" (nhiều giấy phép chỉ cho phép loại đầu) |
| **Phông chữ** (UI và chữ trong video) | Ưu tiên **SIL OFL 1.1** hoặc Apache-2.0 (Google Fonts) | Giao diện, caption/logo text | OFL: được kèm theo, không bán riêng phông, giữ thông báo/tên phông dành riêng; ghi vào danh mục | Cần xác minh từng phông cụ thể; phông thương mại cần license nhúng + xuất ra video |
| **Logo/tên Blender, Meta, TikTok, Apple, Microsoft** | Nhãn hiệu của chủ sở hữu | Màn About, hướng dẫn | Xem mục 3.4 | Blender: chỉ dùng chữ hoặc logo như ghi công thứ cấp |
| **Công cụ ký số/notarize** (Apple Developer ID, Azure Trusted Signing/OV) | Điều khoản dịch vụ | Phát hành | Tuân thủ điều khoản chương trình | Thuộc P0-19 |

## 3. Blender, worker GPL và ranh giới "app đóng"

### 3.1 Nguyên tắc (theo FAQ Blender, tra cứu 17/11/2026)

- Bạn được **tự do cấp phép** phần mềm của mình **nếu và chỉ nếu**: chạy **bên ngoài** Blender; **không dùng mã Blender hay API Blender (kể cả Python)**; tạo dữ liệu cho Blender xử lý; gọi Blender để đọc/xử lý dữ liệu.
- Script Python **dùng API Blender mà được chia sẻ/phát hành** phải theo giấy phép GPL.
- Sản phẩm tạo ra bởi Blender (ảnh, video, `.blend`) là **thuộc người dùng**.
- Phân phối Blender: kèm GPL và mã nguồn; với bản chính thức không sửa, thông tin dẫn tới mã nguồn ở blender.org là đủ.

Áp dụng: app (Electron, orchestrator, AI, backend) nằm ngoài; **worker dùng `bpy` nên phải GPL** (đúng quyết định D6). Điều phải giữ để app **không bị coi là phái sinh**:

| ✔ | Ràng buộc kỹ thuật | Ai |
|---|---|---|
| ☐ | `blender-worker` ở **repo/thư mục riêng**, giấy phép GPL-3.0-or-later, không import mã đóng của app; **không** có thư viện dùng chung với app trừ lược đồ dữ liệu do ta là chủ sở hữu duy nhất (ví dụ JSON Schema của `job.json`; nếu sinh từ zod, đưa bản JSON Schema vào repo worker) | BE, TA |
| ☐ | App và worker chỉ giao tiếp qua: `job.json` (vào), JSON-lines stdout, exit code, tệp ảnh/khung (ra) | BE |
| ☐ | App **không** liên kết thư viện GPL; **không** nhúng `bpy` như module Python vào Node/Electron (kế hoạch đã loại) | BE |
| ☐ | Mã đóng **không** được chép vào repo worker; đóng góp bên ngoài vào worker cần chính sách (DCO hoặc CLA; LS quyết, vì ta muốn giữ quyền cấp phép lại phần của mình) | OPS, LS |
| ☐ | Bí mật (khóa API, client secret TikTok/Meta, URL nội bộ) **không bao giờ** nằm trong repo công khai | OPS |
| ☐ | Mẫu cảnh `.blend` có nhúng script Python hoặc add-on: nếu phân phối thì script phải tuân GPL; ưu tiên **không nhúng script** vào `.blend`, chỉ dữ liệu | TA |
| ☐ | Worker nhận **`.glb` và ảnh, không nhận `.blend` của người dùng** (đã có trong kế hoạch, cũng giảm rủi ro an ninh) | TA |

### 3.2 Nghĩa vụ theo loại phân phối

| Tình huống | Việc phải làm | Ai |
|---|---|---|
| Runtime pack tải **trực tiếp từ nguồn chính thức** (download.blender.org) với manifest ký + sha256 | Bên phân phối Blender là Blender Foundation; vẫn kèm chỉ dẫn/giấy phép trong app và link nguồn ở màn Giấy phép. Ưu điểm: ít nghĩa vụ hơn. Rủi ro: phụ thuộc mirror, mất tính "rút gọn" | OPS, LS |
| Runtime pack **tự lưu trữ** (S3/CDN của ta), bản Blender **không sửa** | Kèm GPL + tệp `SOURCE.txt` nêu đúng bản (4.5.x), link tarball mã nguồn chính thức; **khuyến nghị lưu bản sao mã nguồn trên cùng host** để chắc chắn còn truy cập được suốt thời gian phân phối (GPL-3.0 yêu cầu sẵn có tối thiểu trong thời gian ta còn hỗ trợ hoặc 3 năm theo lời đề nghị bằng văn bản, tùy phương án; **LS chọn phương án**) | OPS, LS |
| Blender **đã rút gọn** hoặc vá | Coi như bản sửa đổi: công bố mã nguồn tương ứng + tập lệnh/cách dựng lại + ghi rõ thay đổi; không gỡ thông báo bản quyền | TA, LS |
| **Bộ cài offline** chứa Blender | Như hàng 2/3, ghi trong trang tải và trong gói; kèm toàn bộ văn bản giấy phép trong thư mục `licenses/` | OPS |
| `blender-worker` | Push mã nguồn công khai **trước hoặc cùng lúc** phát hành runtime pack; gắn tag trùng phiên bản; liên kết tag trong manifest; nếu cung cấp dưới dạng gói nhị phân thì kèm source | BE, OPS |

### 3.3 Điểm cần luật sư (trước pilot)

1. Xác nhận ranh giới app-đóng / worker-GPL của kiến trúc (sơ đồ ở kế hoạch 2.1, giao thức mục 2.3) và phiên bản GPL (3.0-or-later) cho worker.
2. Phương án nghĩa vụ mã nguồn Blender khi tự lưu trữ và khi rút gọn (mục 3.2).
3. Bộ cài offline: thông báo trên trang tải, EULA không cấm quyền GPL (mục 9 điều khoản sử dụng).
4. Chính sách đóng góp vào repo công khai và quyền của ta với mã đã viết.
5. Trách nhiệm khi người dùng chạy script/`.blend` không do ta kiểm soát (ta chặn nhập `.blend`, vẫn cần nêu trong điều khoản).

### 3.4 Thương hiệu Blender (theo blender.org/about/logo, 17/11/2026)

- Tên và logo Blender là nhãn hiệu, **không thuộc GPL**; bên thứ ba chỉ dùng để ghi công hoặc dẫn tới blender.org.
- Logo phải **phụ**, không nổi hơn thương hiệu của ta, không dùng làm logo của ta, không sửa; **dùng thương mại chỉ trong trường hợp ngoại lệ và phải xin phép** → **mặc định chỉ dùng chữ "Dựng hình bằng Blender"**, không dùng logo; nếu muốn logo, xin phép Blender Foundation bằng văn bản.
- Không đặt tên sản phẩm có "Blender"; không khẳng định liên kết hay bảo trợ.
- Nếu đổi tên/tái đóng gói Blender: không đổi thông báo bản quyền, không nhận là tác giả (FAQ).

## 4. ffmpeg LGPL: cấu hình, encoder và checklist

Danh sách tuân thủ LGPL của ffmpeg.org (rút gọn, tra cứu 17/11/2026):

| ✔ | Mục | Ai |
|---|---|---|
| ☐ | Dựng **không** `--enable-gpl` và **không** `--enable-nonfree` (ghi lại lệnh `configure` đầy đủ) | OPS, BE |
| ☐ | Dùng liên kết **động** nếu liên kết thư viện; nếu chạy `ffmpeg` như tiến trình riêng thì phân phối nhị phân kèm nghĩa vụ LGPL | BE |
| ☐ | **Phân phối mã nguồn** FFmpeg khớp chính xác với nhị phân, kèm `changes.diff` (nếu có vá) và tệp mô tả cách dựng; dùng tarball/zip; **cùng máy chủ** với nhị phân | OPS |
| ☐ | Trên **mọi trang tải** có dòng: "This software uses code of FFmpeg licensed under the LGPLv2.1 and its source can be downloaded here" + link | OPS |
| ☐ | Trong **About**: "This software uses libraries from the FFmpeg project under the LGPLv2.1" | FE |
| ☐ | Trong **EULA/Điều khoản**: nêu dùng FFmpeg theo LGPLv2.1; **không đòi quyền sở hữu** FFmpeg; **bỏ cấm dịch ngược** đối với thành phần này (đã làm ở mục 9 điều khoản); áp dụng cho mọi bản dịch | LS |
| ☐ | Không đổi tên DLL kiểu che giấu (chỉ thêm tiền/hậu tố, ví dụ `avcodec-studio.dll`) | BE |
| ☐ | Với thư viện LGPL khác biên dịch vào ffmpeg (ví dụ LAME): lặp lại các mục trên | OPS |
| ☐ | **Không có thư viện GPL** (đặc biệt **libx264, libx265**) trong bản LGPL | OPS |

**Encoder H.264/AAC (quyết định tại P0-12):**

| Phương án | Giấy phép | Ưu | Nhược |
|---|---|---|---|
| Encoder phần cứng/OS: `h264_nvenc`, `h264_qsv`, `h264_amf`, `h264_videotoolbox`, `h264_mf` (Windows Media Foundation) | Nằm trong ffmpeg LGPL; phụ thuộc driver/OS | Không GPL; nhanh | Không có trên mọi máy (máy hạng C thiếu); chất lượng/bitrate khác nhau |
| **OpenH264** (Cisco, BSD) | BSD; nhị phân do Cisco phát hành kèm giấy phép sáng chế riêng | Dự phòng phần mềm | Giấy phép sáng chế chỉ áp dụng nếu dùng nhị phân do Cisco cung cấp: **cần xác minh** điều kiện tải/đóng gói |
| **libx264 trong bản ffmpeg GPL riêng** (tiến trình riêng, tải thêm) | GPL | Chất lượng/tốc độ tốt | Thêm nghĩa vụ GPL cho gói đó + vấn đề sáng chế H.264; ngược lại với quyết định "ffmpeg LGPL" |
| Xuất H.265/VP9/AV1 thay H.264 | Tùy | Tránh một số rủi ro | Nền tảng MXH ưu tiên H.264 (Meta/TikTok chấp nhận cả H.265) |

**Sáng chế codec (H.264/AAC/HEVC):** ffmpeg.org nêu rõ không đánh giá tình trạng sáng chế và cảnh báo sản phẩm thương mại có thể phải trả phí cấp phép cho các tổ chức quản lý sáng chế. Dùng encoder phần cứng/OS thường chuyển nghĩa vụ cho nhà cung cấp driver/OS nhưng **không loại trừ hoàn toàn** → **LS/CDA đánh giá rủi ro sáng chế theo thị trường và cách phân phối**; ghi quyết định vào hồ sơ.

## 5. Mẫu "Giấy phép bên thứ ba" (màn About/Licenses và `THIRD_PARTY_NOTICES`)

Nội dung tối thiểu (tạo tự động, kèm văn bản đầy đủ từng giấy phép):

```text
[TÊN SẢN PHẨM] sử dụng các thành phần mã nguồn mở và bên thứ ba sau.

Blender 4.5 LTS - GNU GPL v3 or later (Blender Foundation). Chạy như tiến trình riêng.
  Mã nguồn: https://download.blender.org/source/  (đúng phiên bản: blender-4.5.x.tar.xz)
  Dựng hình bằng Blender. Blender là nhãn hiệu của Blender Foundation; chúng tôi không liên kết với Blender Foundation.

blender-worker - GNU GPL v3 or later ([TÊN PHÁP NHÂN]).
  Mã nguồn: [URL repo công khai], tag [phiên bản]

FFmpeg - LGPL v2.1 or later. This software uses libraries from the FFmpeg project under the LGPLv2.1.
  Mã nguồn và cấu hình dựng: [URL cùng máy chủ với bản tải]
  FFmpeg là nhãn hiệu của Fabrice Bellard.

Electron, Chromium và phụ thuộc - xem LICENSES.chromium.html và LICENSE đi kèm.

[Thư viện npm/Python] - danh sách tự động: [tên, phiên bản, giấy phép, URL]

Mô hình AI chạy trên máy: BiRefNet - MIT.

Tài sản mẫu: Poly Haven (CC0), ambientCG (CC0), [khác] - chi tiết trong licenses/assets.json.
Nhạc: [nhà cung cấp, giấy phép]. Phông chữ: [tên, SIL OFL 1.1].
```

## 6. Quy trình quét và lưu hồ sơ

| ✔ | Việc | Ai |
|---|---|---|
| ☐ | Tạo **SBOM** + báo cáo giấy phép tự động trong CI (ví dụ CycloneDX/SPDX; `pnpm licenses list`, `pip-licenses`, hoặc công cụ tương đương; **cần xác minh** công cụ chọn) cho: app, worker, backend | BE |
| ☐ | **Cổng CI**: chặn gói có giấy phép GPL/AGPL/SSPL/phi thương mại trong app đóng và backend (danh sách cho phép: MIT, BSD, Apache-2.0, ISC, PostgreSQL, MPL-2.0 kèm điều kiện, …) | BE |
| ☐ | Lưu **bản sao văn bản giấy phép** và tải về nguồn từng tài sản/model (URL, ngày, hash) trong `licenses/` | OPS |
| ☐ | Bảng **Template** có trường `license`, `source`, `attribution`; mẫu thiếu thông tin không được vào bản phát hành | TA, BE |
| ☐ | Mỗi lần nâng Blender/ffmpeg/model: lặp lại mục 3.2, 4 và cập nhật `SOURCE.txt`, mã nguồn lưu trữ | OPS |

## 7. Tài sản, nhạc, phông: tiêu chí chọn

- **Tài sản 3D/HDRI/texture:** CC0 hoặc tự dựng (hợp đồng chuyển nhượng); từ chối CC-BY-NC, giấy phép cấm phân phối lại tệp gốc; mỗi tệp có `license.json` (nguồn, tác giả, giấy phép, URL, ngày, hash).
- **Nhạc:** giấy phép cho **quảng cáo trên Facebook/Instagram/TikTok**, không giới hạn thời gian cho video đã xuất, **được phân phối cho khách trong ứng dụng**, có cơ chế xử lý khiếu nại Content ID, không trả thêm phí theo lượt xem (hoặc rõ phí). Không sinh nhạc bằng AI ở MVP (kế hoạch).
- **Phông chữ:** OFL/Apache-2.0; nếu khách chọn phông riêng, khách chịu trách nhiệm giấy phép (nêu trong điều khoản).
- **Nội dung của khách** (ảnh sản phẩm, nhãn, logo): khách cam đoan quyền (điều khoản mục 5.3).

## 8. Checklist rà soát trước phát hành pilot

| # | Hạng mục | Tiêu chí đạt | Ai | Xong |
|---|---|---|---|---|
| 1 | Ý kiến pháp lý về ranh giới GPL (worker/app), bộ cài offline, rút gọn Blender | Có văn bản của LS + danh sách việc cần làm (P0-19) | LS, CDA | ☐ |
| 2 | Repo `blender-worker` công khai | License GPL-3.0-or-later, header từng tệp, README nêu cách chạy, tag trùng phiên bản runtime pack, không có bí mật | BE, TA | ☐ |
| 3 | Mã nguồn Blender | Link/bản sao đúng 4.5.x; `SOURCE.txt` trong gói; nếu rút gọn: diff/tập lệnh dựng lại | OPS | ☐ |
| 4 | ffmpeg LGPL | Chạy `ffmpeg -version`/`-buildconf` không có `--enable-gpl`/`nonfree`; mã nguồn + cấu hình dựng cùng máy chủ; dòng thông báo trên trang tải | OPS | ☐ |
| 5 | Quyết định encoder H.264 + đánh giá sáng chế | Ghi trong ADR; kiểm trên máy NVIDIA/AMD/Intel/Apple và máy không có encoder phần cứng | BE, LS | ☐ |
| 6 | SBOM + quét giấy phép | Báo cáo CI sạch; không còn GPL/AGPL/NC trong app đóng và backend | BE | ☐ |
| 7 | Màn About/Licenses + `THIRD_PARTY_NOTICES` | Khớp mục 5; có nút mở thư mục `licenses/`; có trong installer và bộ cài offline | FE | ☐ |
| 8 | Điều khoản/EULA | Mục 9 không cấm quyền GPL/LGPL; nêu FFmpeg LGPLv2.1; không nhận sở hữu thành phần bên thứ ba; mọi bản dịch | LS | ☐ |
| 9 | Model AI | BiRefNet (MIT) có thông báo trong gói; không có RMBG-2.0; U²-Net (nếu dùng) đã xác minh | ML | ☐ |
| 10 | Nhà cung cấp AI | Điều khoản đã đọc: quyền thương mại với kết quả, lưu giữ/huấn luyện, vùng địa lý; hợp đồng xử lý dữ liệu; cập nhật Phụ lục A chính sách riêng tư | ML, OPS, LS | ☐ |
| 11 | Mẫu cảnh và tài sản | 100% mẫu cài sẵn có `license.json`; hợp đồng artist đã ký; không có tài sản NC/không phân phối lại | TA, CDA | ☐ |
| 12 | Nhạc và phông | Chỉ khi có trong bản phát hành: hợp đồng/giấy phép đủ phạm vi mục 7 | CDA | ☐ |
| 13 | Thương hiệu | Không dùng logo Blender/Meta/TikTok sai quy định; tên sản phẩm không chứa "Blender"; chữ ghi công đúng | FE, CDA | ☐ |
| 14 | Ký số và cập nhật | Installer ký/notarize (P0-19); manifest runtime ký, sha256 khớp | OPS | ☐ |
| 15 | Chính sách riêng tư + Điều khoản | LS đã rà soát bản nháp, đã xuất bản URL HTTPS | LS, OPS | ☐ |
| 16 | Hồ sơ lưu | Thư mục `licenses/`, SBOM, hợp đồng, ý kiến LS được lưu cho từng bản phát hành | OPS | ☐ |

## 9. Điểm cần chốt và nguồn

**Cần CDA/LS quyết:**
1. Phiên bản GPL của worker; chính sách đóng góp (DCO/CLA).
2. Runtime pack: chuyển hướng tới blender.org hay tự lưu trữ; có rút gọn Blender hay không (rút gọn làm tăng nghĩa vụ).
3. Encoder H.264 và mức chấp nhận rủi ro sáng chế.
4. Hợp đồng artist, kho nhạc, danh mục phông.
5. Có xin phép dùng logo Blender hay chỉ dùng chữ.

**Nguồn tra cứu 17/11/2026:** [Blender License](https://www.blender.org/about/license/); [Blender License FAQ](https://www.blender.org/about/license/faq/); [Blender Logo/Trademark](https://www.blender.org/about/logo/); [FFmpeg Legal](https://ffmpeg.org/legal.html); [BiRefNet LICENSE](https://github.com/ZhengPeng7/BiRefNet/blob/main/LICENSE) và [issue #316](https://github.com/ZhengPeng7/BiRefNet/issues/316); [BRIA RMBG-2.0](https://huggingface.co/briaai/RMBG-2.0); [Poly Haven License](https://polyhaven.com/license); [ambientCG License](https://docs.ambientcg.com/license/); [Electron Application Packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution).

**Chưa tra cứu/cần xác minh:** giấy phép từng thư viện npm/Python theo phiên bản khóa; U²-Net; OpenH264 điều kiện sáng chế; giấy phép Redis; điều khoản từng nhà cung cấp AI; phông và kho nhạc cụ thể; thời hạn và hình thức "lời đề nghị bằng văn bản" của GPL-3.0 (điều 6) với bên phân phối.
