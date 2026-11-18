# Mẫu theo ngành và chế độ "ảnh sang video"

Cập nhật 17/11/2026. Nhánh `mvp/industry-templates` (từ `mvp/timeline-render`). Liên quan: [project-context.md](project-context.md), [timeline-render.md](timeline-render.md), [ai-layer.md](ai-layer.md), mục 1 của [kế hoạch](ke-hoach-ai-blender-electron.md).

**Trạng thái dữ kiện.** Chưa có buổi phỏng vấn hay dữ liệu từ khách thật nào. Bối cảnh duy nhất đến từ yêu cầu của chủ dự án: khách là doanh nghiệp nhỏ ở tỉnh, ít chuyên môn, thuộc 5 ngành (bán hàng online, nhà hàng, nhôm kính, xây dựng, trung tâm ngoại ngữ). Mọi điều ở mục 1 về "khách làm gì, hay dùng gì" đều là **giả định**, đánh mã `G-…` để đối chiếu với danh sách câu hỏi ở mục 6. Không câu nào dưới đây nên được trích như số liệu thị trường.

Thông số nền tảng (mục 1.1) được tra cứu ngày 17/11/2026 từ tài liệu công khai; vẫn phải kiểm lại ngay trước khi tích hợp vì nền tảng đổi quy định thường xuyên.

## Tóm tắt kết luận

| Việc | Kết luận |
|---|---|
| Hệ thống 3D hiện tại | Chỉ hợp sản phẩm vật lý có nhãn. Cả 5 ngành đều cần phần lớn nội dung "ảnh thật + chữ + SĐT/địa chỉ", nên cần chế độ không dựng 3D. |
| Cách làm ảnh sang video | **Một pipeline thứ hai chỉ dùng ffmpeg LGPL** (không Blender), nhận một `SlideshowJob` (danh sách cảnh), đặt cạnh pipeline Blender chứ không nằm trong `Timeline` v1 hay job v2. Dùng chung hàng đợi job, ffmpeg đã ghim, caption. Mục 2. |
| Luồng người dùng | Một màn hình: chọn ngành, chọn mẫu, nhập thông tin, tải ảnh, bấm Tạo, xem trước, lưu video kèm caption 3 kênh. Mục 3. |
| Thư viện mẫu | 18 mẫu JSON tiếng Việt cho 5 ngành (3 đến 4 mẫu mỗi ngành), có schema zod, có test. Mọi mẫu đánh dấu `evidence: "assumption"`. Mục 4. |
| Hiện thực | Đã làm và có test chạy ffmpeg LGPL thật: schema job, trình dựng ffmpeg, biên dịch mẫu thành job, caption. **Đã nối** vào hàng đợi SQLite, IPC có kiểu và màn hình "Tạo video" của app desktop (nhánh `mvp/app-create-flow`, mục 2.6), có e2e Electron thật chụp từng bước. Mục 5. |

---

## 1. Nhu cầu nội dung theo ngành (giả định cần xác nhận)

### 1.1 Thông số nền tảng đã tra cứu

| Kênh | Thông số công khai | Nguồn |
|---|---|---|
| Facebook Reels | Khung 9:16, khuyến nghị 1080×1920, MP4; upload qua API: 3 đến 90 giây | [shortformkit](https://shortformkit.com/social-media-video-specs-2026/), [Vista Social](https://support.vistasocial.com/hc/en-us/articles/5231863512987-Video-specs-and-guidelines-per-social-network) |
| Zalo OA (bài viết) | Video MP4 hoặc AVI, **tối đa 50 MB** mỗi tệp | [Zalo Platform](https://docs.zaloplatforms.com/docs/OA/noi-dung/noi-dung-dang-bai-viet/tai-video-len-cho-noi-dung-bai-viet) |
| TikTok | 9:16, khuyến nghị 1080×1920; MP4/MOV/WebM; H.264, 23 đến 60 fps | [shortformkit](https://shortformkit.com/social-media-video-specs-2026/) |

Chưa tra được: giới hạn video khi đăng lên **Zalo cá nhân/nhật ký** (khác Zalo OA), giới hạn video bài đăng thường trên Facebook (feed 1:1/4:5). Hai điểm này ghi là chưa xác minh (câu hỏi Q9). Hệ quả thiết kế: bitrate được chặn để tệp dưới 45 MB (`SlideshowJob.output.maxBytes`), mặc định 9:16, và mẫu cho phép 4:5, 1:1.

### 1.2 Điểm chung giả định cho cả 5 ngành

- **G-C1.** Người dùng là chủ cơ sở hoặc một nhân viên kiêm nhiệm, không có người làm nội dung chuyên trách; tự chụp ảnh bằng điện thoại.
- **G-C2.** Ảnh đến từ điện thoại: dọc là chủ yếu, độ phân giải cao (từ vài MP đến hơn 12 MP), ánh sáng không đều. iPhone có thể lưu HEIC.
- **G-C3.** Kênh đăng chính là Facebook (trang hoặc cá nhân) và Zalo; TikTok là kênh phụ hoặc chưa dùng. Chưa biết họ dùng Zalo OA hay Zalo cá nhân.
- **G-C4.** Thông tin liên hệ (SĐT, địa chỉ) phải có trong gần như mọi nội dung vì mục tiêu là khách gọi hoặc nhắn tin; không dùng link web.
- **G-C5.** Video ngắn (8 đến 15 giây) là đủ; chưa có nhu cầu giọng đọc, phụ đề tự động, hiệu ứng phức tạp.
- **G-C6.** Giá trên video là nhạy cảm (nhiều ngành báo giá theo từng việc), nên trường giá luôn không bắt buộc.
- **G-C7.** Nhạc nền là "có thì tốt" nhưng gây rủi ro bản quyền; MVP chỉ cho người dùng chọn tệp nhạc của họ và mặc định không nhạc.

### 1.3 Từng ngành

Tần suất là **ước đoán** để định cỡ tính năng, không phải số đo.

| | Bán hàng online | Nhà hàng, quán ăn | Nhôm kính | Xây dựng, cải tạo | Trung tâm ngoại ngữ |
|---|---|---|---|---|---|
| **Loại nội dung (giả định)** | G-BH1: giới thiệu hàng mới; thông báo khuyến mãi; bộ sưu tập nhiều sản phẩm | G-NH1: món mới; thực đơn nổi bật; giới thiệu quán/không gian; ưu đãi, combo | G-NK1: công trình đã làm; trước và sau; mời báo giá | G-XD1: tiến độ công trình; trước và sau cải tạo; giới thiệu dự án; tuyển thợ | G-NN1: thông báo khai giảng; giới thiệu lớp; hoạt động ngoại khoá; mở đăng ký |
| **Tần suất (ước đoán)** | G-BH2: vài bài mỗi tuần, nhiều lúc mỗi ngày có hàng mới | G-NH2: vài bài mỗi tuần, tăng lúc có ưu đãi/lễ | G-NK2: vài bài mỗi tháng (theo công trình xong) | G-XD2: vài bài mỗi tháng, theo công trình | G-NN2: tập trung quanh đợt tuyển sinh, còn lại thưa |
| **Kênh chính (giả định)** | Facebook, Zalo, TikTok | Facebook, Zalo, TikTok | Facebook, Zalo | Facebook, Zalo | Facebook, Zalo |
| **Tỉ lệ khung** | 9:16 chính; 4:5 cho feed | 9:16 chính; 1:1, 4:5 | 9:16; 16:9 khi cần xem toàn cảnh công trình | 9:16; 16:9 cho dự án lớn | 9:16; 4:5 cho ảnh hoạt động |
| **Bắt buộc có** | Tên shop, SĐT, tên sản phẩm; giá khi có | Tên quán, SĐT, địa chỉ (G-NH3: khách tìm đến tận nơi); giờ mở cửa khi có | Tên cơ sở, SĐT, hạng mục; khu vực công trình khi chủ nhà đồng ý | Tên đơn vị, SĐT, tên công trình; địa điểm khi được đồng ý | Tên trung tâm, SĐT, địa chỉ, tên khoá, lịch học |
| **Ảnh sẵn có (giả định)** | G-BH3: ảnh sản phẩm chụp trên nền đời thường | G-NH4: ảnh món, ảnh không gian | G-NK3: ảnh công trình hoàn thiện, ảnh trước/sau cùng góc | G-XD3: ảnh theo giai đoạn thi công | G-NN3: ảnh lớp học; ảnh có trẻ em rất phổ biến |
| **Lưu ý riêng** | Không bịa giá, ưu đãi | Giá từng món do chủ nhập, không tự suy | Giá chỉ ghi nếu chủ muốn công khai | Ảnh công trình của chủ nhà cần được đồng ý | Ảnh trẻ em cần sự đồng ý của phụ huynh; không viết "cam kết đầu ra" |
| **Mẫu tương ứng** | `bhol-*` | `nh-*` | `nk-*` | `xd-*` | `nn-*` |

Hai nhận xét hệ quả cho thiết kế (đều dựa trên giả định G-C):

1. **Sản phẩm 3D xoay gần như không xuất hiện** trong danh sách nội dung của 5 ngành. Chỗ có thể dùng lại Blender: hàng online có sản phẩm nhỏ nhãn rõ (đúng điểm mạnh hiện tại), hoặc nhôm kính nếu có mô hình 3D mẫu cửa. Đó là ý tưởng v1.1 (mục 2.6), cần xác nhận ở Q14 trước khi đầu tư.
2. **"Trước và sau", "tiến độ" và "thực đơn nhiều món" cần chú thích riêng cho từng ảnh**, nên mẫu có trường `caption` theo ảnh (người dùng tự gõ "Tên món - giá"), không để AI suy luận nội dung ảnh.

---

## 2. Chế độ "ảnh sang video"

### 2.1 Cần gì

Ken Burns (phóng to/thu nhỏ và lia nhẹ), ghép 2 đến 4 ảnh trong một khung, chuyển cảnh, chữ có dấu tiếng Việt, logo, nhạc hoặc không nhạc, trước/sau. Không dựng 3D, chạy được trên máy văn phòng (mục tiêu của plan 2.5).

### 2.2 ffmpeg hay Blender nhẹ

| Tiêu chí | ffmpeg (đã chọn) | Blender nhẹ (VSE hoặc cảnh 2D) |
|---|---|---|
| Có sẵn trong app | Có, ffmpeg LGPL đã ghim và được kiểm giấy phép khi cài | Có nhưng cần runtime Blender ~380 MB đã tải |
| Khởi động | Tức thì | Vài giây mỗi lần chạy, EEVEE cần GPU hoặc llvmpipe |
| Một lần chạy | Một filtergraph, một lần mã hoá H.264 | Render PNG từng khung rồi ghép: nhiều đĩa, chậm |
| Ken Burns, xfade, drawtext, overlay | Tích hợp (`zoompan`, `xfade`, `drawtext`) | Làm được nhưng phải viết thêm mã worker |
| Chữ tiếng Việt | `drawtext` dùng harfbuzz/freetype có trong binary; cần 1 tệp font | Font Inter đi kèm Blender, chữ là vật thể 3D |
| Đo được | ~1 đến 2 giây xem trước, ~4 giây xuất 1080p cho video 14 giây (mục 5) | PoC: 4 phút 40 giây cho 4 giây 640×360 (xem [timeline-render.md](timeline-render.md)) |
| Rủi ro | Phụ thuộc bản ffmpeg ghim; font phải đi kèm app | Nặng, không cần cho ảnh phẳng |

Chọn **ffmpeg**. Blender chỉ nên quay lại khi có cảnh 3D thật (mục 2.6).

### 2.3 Đặt ở đâu trong kiến trúc

```
Hiện có   prompt ──direct()──▶ Timeline v1 ──compileTimelineJob──▶ job v2 ──▶ blender-worker ──▶ PNG ──▶ ffmpeg ──▶ mp4
Mới       mẫu + dữ liệu ──compileTemplate()──▶ SlideshowJob v1 ─────────────────────────────▶ ffmpeg (một lần) ──▶ mp4
                                                                                               ▲
                              dùng chung: JobQueue (trạng thái, tiến độ, huỷ), ffmpeg LGPL đã ghim + kiểm giấy phép, caption
```

Quyết định:

1. **Pipeline thứ hai, không phải một `version` của `WorkerJob`.** `WorkerJob` (v1, v2) là hợp đồng giữa orchestrator và blender-worker, kiểm chặt ở cả Python lẫn zod; nhồi cảnh ảnh vào đó làm hỏng ranh giới này.
2. **Không dùng `Timeline` v1 của Đạo diễn AI.** Timeline v1 có track `product` (xoay 360), `camera` (orbit/dolly), `lock_label`: toàn khái niệm 3D. Ảnh sang video cần danh sách cảnh có ảnh, chữ, chuyển cảnh. Cách biểu diễn khác nhau nên dùng schema riêng `SlideshowJob` (cảnh nối tiếp nhau, thời điểm bắt đầu suy ra từ thời lượng và phần chồng chuyển cảnh).
3. **Mẫu là dữ liệu, Đạo diễn AI chưa tham gia.** Luồng hoàn toàn tất định: cùng mẫu + cùng dữ liệu cho cùng job. Về sau Đạo diễn AI chỉ nên làm việc "chọn `template_id` từ prompt" (đúng nguyên tắc chuỗi tự do duy nhất là id mẫu), không sinh nội dung cảnh.
4. **Dùng lại hàng đợi.** Trạng thái hiện có `queued → preparing → rendering → encoding → done|failed|canceled` vẫn đúng: slideshow bỏ qua `rendering` (không có khung PNG), vào `preparing` (kiểm tệp, ghi tệp chữ) rồi `encoding`. Huỷ dùng `AbortSignal` (đã có test). Khác biệt cần nhớ: **không có resume theo khung**; thử lại là chạy lại từ đầu, chấp nhận được vì mất vài giây.
5. **Giữ chính sách giấy phép.** Chỉ encoder trong `ALLOWED_H264_ENCODERS` (từ chối `libx264`); âm thanh dùng encoder `aac` tích hợp (đã ghi ở `THIRD_PARTY_NOTICES.md`).

### 2.4 Hợp đồng `SlideshowJob` (phần mở rộng schema)

Mở rộng **cộng thêm**, không đổi schema nào hiện có:

| Thay đổi | Tệp |
|---|---|
| Mới: `SlideshowJob`, `PhotoScene`, `CollageScene`, `CardScene`, `SlideText`, `slideshowDurationS`, `slideshowSceneStarts`, `slideshowSize` | `packages/shared/src/slideshow.ts` (xuất qua `index.ts`) |
| Mới: `planSlideshow` (thuần), `renderSlideshow`, `preflightSlideshow`, `wrapText`, `fitText` | `packages/render-core/src/slideshow.ts` |
| Sửa nhỏ: xuất `encoderArgs` và nhận `bitrate` tuỳ chọn | `packages/render-core/src/ffmpeg.ts` |
| Mới: package `@aps/templates` (schema, dữ liệu, kiểm tra đầu vào, biên dịch, caption) | `packages/templates/` |
| Mới: bước CI chạy test render thật; ghi chú codec âm thanh | `.github/workflows/ci.yml`, `THIRD_PARTY_NOTICES.md` |

Không sửa `apps/api`, `packages/ai`, `blender-worker`.

Job gồm: `output {width, height, fps, maxBytes}`, `fontPath`, `scenes[1..16]` (`photo`, `collage` 2 đến 4 ảnh, `card` màu trơn), `logo?`, `audio?`. Mỗi cảnh có `durationS`, `transition` (`none|fade|wipeleft|slideleft|zoomin`), `texts[≤4]`; cảnh ảnh có `motion` (`zoom_in|zoom_out|pan_left|pan_right|none`), `zoom` (≤ 30%), `shade` (phủ tối cho chữ dễ đọc), `fit` (`cover` hoặc `contain_blur` cho ảnh lệch tỉ lệ). Mọi object strict (khoá lạ bị từ chối), tổng thời lượng ≤ 90 giây, kích thước chẵn, chuyển cảnh ≤ 45% cảnh ngắn hơn, hai chữ cùng vị trí không được trùng thời gian.

### 2.5 Các quyết định kỹ thuật đáng chú ý

- **An toàn đầu vào.** Chữ do người dùng gõ chỉ đi vào tệp văn bản (`drawtext=textfile=…:expansion=none`), không nằm trong dòng lệnh/filtergraph; "Giảm 20%" hay `%{pid}` không bị diễn giải. Đường dẫn ảnh đi qua `-i file:<đường dẫn>` (tắt `concat:`/`http:`). Chỉ đường dẫn font và tệp chữ nằm trong filtergraph, được escape và từ chối nếu có nháy đơn hoặc ký tự điều khiển. Có test cho từng điểm.
- **Màu đúng.** Ảnh JPEG là dải đầy đủ (yuvj420p); ép về dải TV + BT.709 để mp4 là `yuv420p` thật và màu không lệch.
- **Ảnh điện thoại chụp dọc (EXIF xoay)**: ffmpeg 8.1 tự áp dụng, có test (ảnh EXIF orientation 6).
- **Khung an toàn cho chữ**: với 9:16, chữ trên nằm từ 12% chiều cao và chữ dưới kết thúc ở 80%, tránh phần giao diện TikTok/Reels che.
- **Xuống dòng chữ** ước lượng theo số ký tự (hệ số 0,58 bề rộng chữ), tự co cỡ chữ xuống 60% rồi cắt bằng "…", tối đa 4 dòng. SĐT dùng khoảng trắng không ngắt dòng để không bị tách đôi.
- **Dung lượng**: bitrate = min(0,06 bit/điểm ảnh/khung, trần theo `maxBytes`, 12 Mb/s). Với 90 giây vẫn dưới 45 MB (có test).
- **Một lần mã hoá**: ghép xfade/concat trong một filtergraph, không tệp trung gian; Ken Burns tính trên ảnh phóng gấp đôi để bớt rung.

### 2.6 Tích hợp vào app (nhánh `mvp/app-create-flow`) và ý tưởng lai 3D

**Đã làm** (chỉ thêm, không đổi nghĩa schema cũ; không đụng `apps/api`):

1. **Hợp đồng chung (`packages/shared`)**: `JobRecord.pipeline` (`blender` mặc định | `slideshow`), `JobRecord.request` là hợp của `RenderRequest` và `SlideshowRequest`, `engine` thêm `ffmpeg`; `SlideshowCreateReq` (có `target: local|cloud`, `quality: preview|final`). `CreateFromPromptReq` thêm `target`. Kênh IPC mới (đều validate bằng zod ở main): `slideshow:validate`, `slideshow:create`, `slideshow:caption`, `profile:get`, `profile:set`, `video:save`, `video:reveal`, `clipboard:writeText`, `photo:thumbnail`; `dialog:pickFile` thêm loại `photo|logo|audio`. Renderer không có kênh nào nhận đường dẫn tuỳ ý để đọc: ảnh chỉ đọc qua `photo:thumbnail`, video chỉ phát qua `asset://job/<id>/output`, "mở thư mục" chỉ nhận kết quả của job hoặc tệp vừa lưu.
2. **Hàng đợi (`apps/desktop/src/orchestrator`)**: DB migration v3 (thêm cột `jobs.pipeline`, bảng `settings`; có sao lưu `.bak-v2` như các migration trước). `SlideshowRunner` gọi `renderSlideshow` sau `assertLgplFfmpeg`, ghi `output.part.mp4` rồi đổi tên; tiến độ theo khung hình, `preparing → encoding`; huỷ/lỗi dọn tệp tạm; `PipelineRunner` chọn runner theo `pipeline`. Job slideshow và Blender chạy chung một hàng đợi, ưu tiên `preview` trước `final`. `target=cloud` được nhận và lưu nhưng **không bao giờ chạy** trên máy này (giao diện chỉ hiện "Sắp có").
3. **Luồng Đạo diễn 3D** (`jobs:createFromPrompt`) nay có `target`; giao diện đặt ở mục gập "Video sản phẩm 3D (nâng cao)" và bị chặn có hướng dẫn nếu chưa cài thành phần dựng 3D.
4. **Ghi nhớ thông tin cơ sở**: tên, SĐT, địa chỉ, ngành, mẫu lưu trong bảng `settings`; logo được chép vào `<dữ liệu app>/profile/` (chỉ png/jpg/webp, tối đa 20 MB). Có nút "Xóa thông tin đã nhớ".
5. **Màn hình `#/create` ("Tạo video")** là màn hình mặc định khi mở app (`features/create`), tiếng Việt, theo mục 3. Có đủ trạng thái rỗng, đang chạy (tiến độ, nút Hủy), lỗi (câu dễ hiểu + "Chi tiết kỹ thuật" gập), đã hủy (dữ liệu còn nguyên + Thử lại), bản xem trước đã cũ, hàng đợi (Xem/Hủy/Thử lại/Xóa), banner cài thành phần khi thiếu ffmpeg. Nút Tạo video dựng bản **xem trước** (540×960, nhanh); nút Lưu dựng bản **đầy đủ** (1080×1920) rồi mở hộp thoại lưu. Chữ đăng kèm 3 kênh sửa được và sao chép bằng một nút.
6. **Phông**: Be Vietnam Pro (SIL OFL 1.1) đóng gói trong `apps/desktop/resources/fonts` (Regular/SemiBold cho giao diện qua `@font-face`, Bold cho chữ trong video qua `drawtext`); đã ghi trong `THIRD_PARTY_NOTICES.md`; `check-release --post` yêu cầu có phông và `OFL.txt` trong bản đóng gói; test kiểm bảng cmap có đủ chữ Việt có dấu.
7. Mã lỗi mới `TEMPLATE_*`, `SLIDESHOW_*`, `LOGO_FORMAT`, `OUTPUT_MISSING`, `FFMPEG_*`, `DISK_FULL` có bản dịch vi/en ở `packages/i18n`.

**Bổ sung ở nhánh `mvp/trial-installer`** (chỉ thêm; không đụng `apps/api`):

8. **Gói runtime tách đôi**: manifest vẫn `schemaVersion: 1`, thêm trường tùy chọn `packages` (được ký cùng manifest): gói `ffmpeg` (nhẹ, đủ cho ảnh sang video) và gói `blender` (chỉ video 3D, **yêu cầu** gói ffmpeg). `runtime:install` nhận `{ packages?: ('ffmpeg'|'blender')[] }` (bỏ trống = cả hai như cũ); tiến độ có `step/steps`. Màn hình Tạo video chỉ xin tải gói ffmpeg ("dưới 200 MB"), banner Blender chỉ hiện ở mục "Video 3D (nâng cao)". Gói `.apspack` mang theo `packages` và chỉ chứa thư mục của các gói đã chọn (gói cũ không có `packages` vẫn nhập được). Manifest cũ không có `packages` vẫn hợp lệ (dùng mặc định).
9. **Ảnh HEIC/HEIF tự đổi sang JPG** khi chọn ảnh (`photo:prepare`): chạy trong `worker_threads` của tiến trình nền nên giao diện không đứng; áp dụng cả ảnh kéo thả. JPG nằm ở `<dữ liệu app>/uploads/`, ảnh gốc giữ nguyên; ảnh hỏng hoặc quá lớn báo lỗi tiếng Việt ngay tại ô ảnh (`PHOTO_HEIC_FAILED`, `PHOTO_TOO_LARGE`). Quy tắc `photo_heic` trong `@aps/templates` vẫn giữ làm lưới an toàn nếu có đường dẫn HEIC lọt tới bước kiểm tra. Thư viện và giấy phép: `THIRD_PARTY_NOTICES.md`, mục "Chuyển ảnh HEIC/HEIF sang JPG".
10. **Lưu nháp từng bài**: bảng `drafts` (migration v4, có sao lưu `.bak-v3`), kênh IPC `drafts:list/get/save/remove`. Mỗi bài lưu tên, ngành, mẫu, khung hình, thông tin, chú thích, đường dẫn ảnh/logo/nhạc (không chép ảnh; ảnh HEIC đã là JPG trong `uploads/` nên bền). Tự lưu sau khi dừng gõ 0,8 giây; mở lại app mở đúng bài đang làm dở; có nút "Bài mới", danh sách bài khác, xóa bài (bấm hai lần). Ảnh đã bị xóa khỏi máy được báo "không còn trên máy, hãy chọn lại". Tối đa 100 bài, 64 KB mỗi bài. "Xóa thông tin đã nhớ" chỉ xóa hồ sơ cơ sở và mở bài trắng, **không** xóa các bài nháp đã lưu.

**Kiểm chứng**: `apps/desktop/tests/slideshow-queue.test.ts` (13 test chạy ffmpeg LGPL thật qua hàng đợi SQLite: tạo, mở lại DB, cloud không chạy, thiếu ảnh rồi thử lại, huỷ, thứ tự ưu tiên, caption, hồ sơ, migration v3), `tests/font.test.ts`, `src/renderer/tests/create.test.tsx` (10 test giao diện), và `pnpm --filter @aps/desktop e2e:create` (Electron thật dưới Xvfb, không giả lập dịch vụ nào; chụp 14 ảnh từng bước; kiểm ffprobe bản lưu là `h264 yuv420p 1080×1920`, kiểm clipboard thật, kiểm hồ sơ còn sau khi mở lại app).

**Chưa làm / ý tưởng tiếp:**

- **Cảnh `clip` (v1.1, chỉ nếu Q14 cho thấy cần):** nhận mp4 từ job Blender v2 (xoay sản phẩm 3D) làm một cảnh của slideshow, để hàng online có "ảnh + 3D xoay + thông tin liên hệ" trong cùng một video.
- Cloud thật (mục `target=cloud` mới là chỗ giữ trong hàng đợi).

---

## 3. Luồng onboarding một màn hình

Mục tiêu (giả định, cần thử với người dùng thật): người chưa từng dùng app tạo được video đầu tiên trong **dưới 5 phút**, không cần đọc hướng dẫn.

### 3.1 Bố cục

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  Tạo video giới thiệu                                          [Lưu nháp tự động]│
├───────────────────────────────────────────┬───────────────────────────────────┤
│ 1  Bạn kinh doanh gì?                     │   XEM TRƯỚC                       │
│  [Bán hàng online] [Nhà hàng, quán ăn]    │  ┌───────────────┐                │
│  [Nhôm kính] [Xây dựng] [Ngoại ngữ]       │  │               │                │
│                                           │  │   video 9:16  │  ▶  0:00/0:12  │
│ 2  Chọn kiểu video                        │  │   (hoặc gợi ý │                │
│  ( Giới thiệu sản phẩm )  12 giây         │  │   "bấm Tạo")  │                │
│  ( Thông báo khuyến mãi ) 10 giây         │  └───────────────┘                │
│  ( Bộ sưu tập )           11 giây         │  Khung hình: (9:16) (4:5) (1:1)   │
│                                           │                                   │
│ 3  Thông tin hiện trên video              │   CHỮ ĐĂNG KÈM                    │
│  Tên cơ sở *        [__________________]  │  [Facebook] [Zalo] [TikTok]       │
│  Số điện thoại *    [__________________]  │  ┌─────────────────────────────┐  │
│  Tên sản phẩm *     [__________________]  │  │ Áo thun cotton basic        │  │
│  Giá                [__________________]  │  │ Giá: 199.000đ ...           │  │
│  Địa chỉ            [__________________]  │  └─────────────────────────────┘  │
│                                           │  [Sao chép chữ]                   │
│ 4  Ảnh của bạn                            │                                   │
│  [+ Ảnh chính *] [+ Ảnh 2] [+ Ảnh 3]      │  [ Lưu video vào máy ]            │
│  Logo (không bắt buộc) [+ Chọn]           │  [ Mở thư mục chứa video ]        │
│  Nhạc (không bắt buộc) ( ) Không ( ) Chọn │                                   │
│                                           │                                   │
│ [        TẠO VIDEO        ]               │                                   │
└───────────────────────────────────────────┴───────────────────────────────────┘
```

Trái là việc phải làm (từ trên xuống), phải là kết quả. Cuộn dọc ở cột trái khi màn hình nhỏ; không có bước "Tiếp theo", không có cửa sổ phụ.

### 3.2 Hành vi từng phần

| Phần | Hành vi |
|---|---|
| 1. Ngành | 5 nút lớn. Chọn xong, cột 2 hiện 3 đến 4 mẫu của ngành. Nhớ ngành đã chọn lần trước. |
| 2. Mẫu | Thẻ có tên, thời lượng, ảnh minh hoạ tĩnh. Chọn mẫu làm trường ở mục 3 và chỗ ảnh ở mục 4 đổi theo mẫu. Nhãn và gợi ý do mẫu quy định (`fields[].label/hint`, `photos[].label/hint`). |
| 3. Thông tin | Chỉ hiện trường mẫu cần. Ô trống hiện **ví dụ mờ** (`example`), không tự điền thành giá trị thật. Dấu `*` = bắt buộc. SĐT tự định dạng `0901 234 567` khi rời ô. Giá thuần số tự thành `199.000đ`. Kiểm tra ngay khi rời ô, không đợi bấm Tạo. |
| 4. Ảnh | Mỗi chỗ nhận kéo thả hoặc bấm chọn; có hình thu nhỏ và nút "Đổi ảnh". Mẫu có chú thích theo ảnh (thực đơn, tiến độ) thì hiện ô nhập nhỏ dưới ảnh. Logo và nhạc không bắt buộc; không có nhạc là mặc định. |
| Bấm Tạo | Khoá nút, tạo **bản xem trước** (nửa độ phân giải, cùng nội dung, đo được 1 đến 2 giây trên 4 vCPU). Thanh tiến độ từ `onProgress`. |
| Xem trước | Phát ngay trong khung. Đổi tỉ lệ thì tạo lại. Sửa bất kỳ trường nào làm xem trước "cũ" (hiện nhãn "Bấm Tạo để cập nhật"), không tự tạo lại liên tục. |
| Lưu video | Dựng bản đầy đủ 1080p (~4 giây trên 4 vCPU với mẫu 14 giây), rồi hộp lưu hệ điều hành. Sau đó hiện "Mở thư mục" và nhắc "Chữ đăng kèm đã sẵn ở bên phải". |
| Chữ đăng kèm | 3 thẻ Facebook/Zalo/TikTok, mỗi thẻ một nút "Sao chép chữ". Dùng đúng dữ liệu người dùng nhập, không thêm con số. Có thể sửa tay trước khi sao chép. |

### 3.3 Trạng thái màn hình

| Trạng thái | Điều kiện | Giao diện |
|---|---|---|
| Trống | Chưa chọn ngành | Chỉ mục 1 sáng; còn lại mờ. Câu: "Chọn ngành của bạn để bắt đầu." |
| Đang nhập | Có thiếu trường/ảnh bắt buộc | Nút Tạo mờ; dưới nút liệt kê còn thiếu gì: "Còn thiếu: Số điện thoại, Ảnh chính." |
| Sẵn sàng | Đủ và hợp lệ | Nút Tạo sáng |
| Đang tạo xem trước | Đã bấm Tạo | "Đang tạo video, thường mất vài giây…" + thanh tiến độ + nút Huỷ |
| Có xem trước | Xong | Video phát được, nút Lưu sáng |
| Xem trước cũ | Sửa dữ liệu sau khi tạo | Video giữ nguyên, nhãn "Bấm Tạo để cập nhật" |
| Đang lưu | Dựng bản đầy đủ | "Đang tạo bản đẹp để đăng…" + tiến độ + Huỷ |
| Đã lưu | Xong | "Đã lưu: <tên tệp>." + Mở thư mục |
| Lỗi | Xem 3.4 | Khung đỏ nhạt, câu nói rõ chuyện gì và làm gì tiếp; dữ liệu đã nhập **không mất** |

Tự lưu nháp (đề xuất, chưa làm): dữ liệu theo mẫu lưu trong SQLite; mở lại app khôi phục. Đường dẫn ảnh lưu lại; nếu ảnh đã bị xoá thì báo đúng chỗ (lỗi `SLIDESHOW_PHOTO_MISSING`).

### 3.4 Lỗi bằng tiếng Việt dễ hiểu

Lỗi nhập liệu do `validateInput` sinh ra (đã làm, có test, từng chuỗi dưới đây là chuỗi thật):

| Mã | Khi nào | Thông báo |
|---|---|---|
| `required` | Thiếu trường bắt buộc | Bạn chưa nhập "Tên cơ sở / thương hiệu". Hãy nhập để video có đủ thông tin cho khách liên hệ. |
| `phone_invalid` | SĐT sai | Số điện thoại chưa đúng. Hãy nhập đủ 10 số, ví dụ 0901 234 567 (số bàn có mã vùng thì nhập đủ 11 số). |
| `price_ambiguous` | Giá là số trần < 1.000 | "Giá" chưa rõ đơn vị. Hãy ghi đủ, ví dụ 199.000đ hoặc 199k, để khách không hiểu nhầm. |
| `too_long` | Vượt giới hạn ký tự | "Tên sản phẩm" dài quá 60 ký tự (đang 72). Hãy viết ngắn lại để chữ trên video đọc được. |
| `photo_missing` | Thiếu ảnh bắt buộc | Hãy chọn ảnh cho "Ảnh chính của sản phẩm". |
| `photo_heic` | Ảnh HEIC | Ảnh "…" ở định dạng HEIC (thường từ iPhone) chưa dùng được. Hãy chọn ảnh JPG, hoặc vào Cài đặt máy ảnh chọn "Tương thích nhất" rồi chụp lại. |
| `photo_format` | Định dạng khác | Ảnh "…" không đúng định dạng. Hãy chọn ảnh JPG, PNG hoặc WEBP. |
| `aspect_unsupported` | Mẫu không hỗ trợ tỉ lệ | Mẫu này chưa hỗ trợ khung hình 16:9. Hãy chọn: 9:16, 4:5, 1:1. |
| Cảnh báo `emoji_removed_in_video` | Dữ liệu có emoji | "Ưu đãi (nếu có)" có biểu tượng cảm xúc (emoji): video không vẽ được emoji nên sẽ bỏ khỏi hình, nhưng vẫn giữ trong caption. |

Lỗi khi dựng (`renderSlideshow`, đã làm; mã `FFMPEG_*` đã có từ trước):

| Mã | Thông báo hiện tại / đề xuất | Việc người dùng làm |
|---|---|---|
| `SLIDESHOW_PHOTO_MISSING` | Không tìm thấy ảnh ở cảnh N. Có thể ảnh đã bị xoá hoặc di chuyển, hãy chọn lại ảnh. | Chọn lại ảnh |
| `SLIDESHOW_LOGO_MISSING` | Không tìm thấy tệp logo. Hãy chọn lại logo hoặc bỏ logo. | Chọn lại/bỏ |
| `SLIDESHOW_AUDIO_MISSING` | Không tìm thấy tệp nhạc. Hãy chọn lại nhạc hoặc chọn "không nhạc". | Chọn lại/bỏ |
| `SLIDESHOW_FONT_MISSING` | Không tìm thấy phông chữ của ứng dụng. Hãy cài lại ứng dụng. | Cài lại |
| `SLIDESHOW_FFMPEG_FAILED` | Dựng video không thành công. Hãy thử lại; nếu vẫn lỗi, hãy đổi ảnh khác (một số ảnh bị hỏng hoặc định dạng lạ). Chi tiết kỹ thuật nằm ở `details`, chỉ hiện ở nút "Chi tiết". | Thử lại, đổi ảnh |
| `SLIDESHOW_TOO_COMPLEX` | Video có quá nhiều cảnh/chữ để dựng một lần. Hãy bớt số cảnh hoặc rút gọn chữ. | Rút gọn |
| `SLIDESHOW_BAD_PATH` | Đường dẫn tệp có ký tự không hợp lệ (nháy đơn hoặc ký tự điều khiển). Hãy đổi tên tệp hoặc thư mục. | Đổi tên |
| `SLIDESHOW_CANCELED` | Đã huỷ dựng video. | Không |
| `FFMPEG_MISSING` / `FFMPEG_LICENSE_VIOLATION` | Đề xuất: "Thành phần dựng video chưa sẵn sàng. Hãy mở Cài đặt để cài hoặc cập nhật." | Cài lại runtime |
| Ổ đĩa đầy, không ghi được tệp | **Chưa có mã riêng**; đề xuất "Ổ đĩa không còn chỗ trống. Hãy xoá bớt tệp rồi thử lại." | Giải phóng đĩa |

Các chuỗi này hiện nằm trong mã (`@aps/templates`, `@aps/render-core`) để test được; khi làm UI phải chuyển sang `packages/i18n` (`errors.<code>`, bản `vi` trước) như quy ước hiện có, giữ nguyên nội dung.

### 3.5 Nguyên tắc cho người ít chuyên môn (đề xuất)

Không dùng từ kỹ thuật (render, bitrate, codec, timeline) trên giao diện. Mỗi lỗi nói cách sửa. Cỡ chữ tối thiểu 16 px, nút Tạo lớn, tương phản đạt. Không có thao tác nào không hoàn tác: sửa và bấm Tạo lại luôn được. Không yêu cầu tài khoản mạng xã hội ở MVP (đăng thủ công, đúng quyết định đã chốt).

---

## 4. Thư viện mẫu (`packages/templates`)

### 4.1 Cấu trúc

| Tệp | Nội dung |
|---|---|
| `src/schema.ts` | Zod: `Template`, `TemplateLibraryFile`, trường, ảnh, cảnh, chữ. Xuất JSON Schema |
| `schema/template-library.schema.json` | JSON Schema sinh bởi `pnpm --filter @aps/templates schema:export` (test kiểm khớp) |
| `src/data/<ngành>.json` | 5 tệp, mỗi tệp `{ industry, templates[3..12] }` |
| `src/inputs.ts` | `validateInput`, `normalizePhone`, `normalizePrice`: thông báo tiếng Việt |
| `src/compile.ts` | `compileTemplate(template, dữ liệu, tuỳ chọn) → SlideshowJob` |
| `src/caption.ts` | `buildCaptions` cho Facebook/Zalo/TikTok |
| `src/library.ts` | Nạp và validate toàn bộ; lỗi nêu rõ ngành và đường dẫn trường |

Một mẫu mô tả: ngành, mục đích, tỉ lệ cho phép, kênh, bảng màu (`primary`, `accent`), **trường cần hỏi** (nhãn, gợi ý, ví dụ, bắt buộc), **chỗ ảnh** (nhãn, gợi ý, bắt buộc, chú thích riêng), danh sách cảnh với chữ chứa `{{trường}}`, quy tắc logo (`end_card|all|none`) và nhạc (`optional|none`), caption. Chữ có trường trống bị bỏ; cảnh ảnh tuỳ chọn thiếu ảnh bị bỏ; ô ghép còn dưới 2 ảnh thì cả cảnh bị bỏ.

### 4.2 Quy tắc chống sai và chống bịa (đều có test)

- Khoá lạ ở mọi mức bị từ chối (không có chỗ nhét `script`).
- `{{trường}}` chỉ được dùng trường đã khai báo; SĐT và tên cơ sở luôn bắt buộc.
- Mọi ảnh khai báo phải được ít nhất một cảnh dùng; cảnh đầu không dùng ảnh tuỳ chọn; tổng thời lượng ≤ 45 giây.
- **Chữ tĩnh trong mẫu không có chữ số, link, emoji**, và không chứa tuyên bố không kiểm chứng ("số 1", "cam kết", "bảo hành", "miễn phí", "giảm", "uy tín"…). Mọi con số trên video và trong caption đến từ dữ liệu người dùng nhập (test duyệt từng mẫu, từng kênh). Dữ liệu ví dụ luôn là `0901 234 567` và "Cửa hàng Mẫu", không dùng dữ liệu khách thật.
- Mọi mẫu có `evidence: "assumption"`; chỉ đổi thành `confirmed` sau khi khách dùng thử và xác nhận.

### 4.3 Danh sách mẫu

| Mẫu | Tên | Ảnh | Thời lượng | Khung mặc định (hỗ trợ) | Trường bắt buộc | Logo/nhạc |
|---|---|---|---|---|---|---|
| `bhol-gioi-thieu-san-pham` | Giới thiệu sản phẩm | 1–3 | 12,0 s | 9:16 (9:16, 4:5, 1:1) | businessName, phone, itemName | end_card/optional |
| `bhol-khuyen-mai` | Thông báo khuyến mãi | 1–2 | 9,5 s | 9:16 (9:16, 4:5, 1:1) | businessName, phone, promo | end_card/optional |
| `bhol-bo-suu-tap` | Bộ sưu tập 2–4 ảnh | 2–4 | 10,5 s | 4:5 (4:5, 1:1, 9:16) | businessName, phone, itemName | end_card/optional |
| `nh-mon-moi` | Giới thiệu món ăn | 1–3 | 12,0 s | 9:16 (9:16, 4:5, 1:1) | businessName, phone, itemName, address | end_card/optional |
| `nh-thuc-don` | Thực đơn nổi bật | 2–4 | 14,0 s | 9:16 (9:16, 4:5, 1:1) | businessName, phone, address | end_card/optional |
| `nh-gioi-thieu-quan` | Giới thiệu quán | 1–3 | 13,0 s | 9:16 (9:16, 16:9, 1:1, 4:5) | businessName, phone, address, detail | end_card/optional |
| `nh-uu-dai` | Ưu đãi / combo | 1–2 | 9,5 s | 9:16 (9:16, 4:5, 1:1) | businessName, phone, promo, address | end_card/optional |
| `nk-cong-trinh` | Công trình đã hoàn thiện | 1–4 | 14,5 s | 9:16 (9:16, 1:1, 4:5, 16:9) | businessName, phone, itemName | end_card/optional |
| `nk-truoc-sau` | Trước và sau | 2 | 13,0 s | 9:16 (9:16, 1:1, 4:5, 16:9) | businessName, phone, itemName | end_card/optional |
| `nk-bao-gia` | Nhận báo giá | 1–3 | 12,0 s | 9:16 (9:16, 4:5, 1:1) | businessName, phone, itemName | none/optional |
| `xd-tien-do` | Tiến độ công trình | 2–3 | 13,0 s | 9:16 (9:16, 4:5, 1:1) | businessName, phone, itemName | end_card/optional |
| `xd-truoc-sau` | Cải tạo trước và sau | 2 | 13,0 s | 9:16 (9:16, 1:1, 4:5, 16:9) | businessName, phone, itemName | end_card/optional |
| `xd-gioi-thieu-du-an` | Giới thiệu dự án | 1–4 | 15,0 s | 9:16 (9:16, 16:9, 1:1, 4:5) | businessName, phone, itemName | end_card/optional |
| `xd-tuyen-tho` | Tuyển thợ / nhân sự | 0–1 | 10,0 s | 9:16 (9:16, 4:5, 1:1) | businessName, phone, itemName, detail | none/none |
| `nn-khai-giang` | Thông báo khai giảng | 0–1 | 10,0 s | 9:16 (9:16, 4:5, 1:1) | businessName, phone, itemName, detail, address | end_card/optional |
| `nn-gioi-thieu-lop` | Giới thiệu lớp học | 1–4 | 14,5 s | 9:16 (9:16, 1:1, 4:5, 16:9) | businessName, phone, itemName | end_card/optional |
| `nn-hoat-dong` | Hoạt động của trung tâm | 2–4 | 10,5 s | 4:5 (4:5, 1:1, 9:16) | businessName, phone, itemName | end_card/optional |
| `nn-mo-dang-ky` | Mở đăng ký (chỉ chữ) | 0 | 9,5 s | 9:16 (9:16, 4:5, 1:1) | businessName, phone, itemName, address | none/none |

Bảng trên trích từ dữ liệu thật (script đọc thư viện, không gõ tay). Thêm mẫu: thêm một phần tử vào `src/data/<ngành>.json`, chạy `pnpm --filter @aps/templates test`; schema và các quy tắc 4.2 tự kiểm.

---

## 5. Hiện thực tối thiểu và kiểm chứng

Đã làm: biên dịch mẫu thành `SlideshowJob`, dựng mp4 bằng ffmpeg LGPL đã ghim, caption 3 kênh; đã nối vào hàng đợi/IPC/UI và có e2e Electron thật (mục 2.6).

| Kiểm | Kết quả |
|---|---|
| `pnpm typecheck`, `pnpm lint`, `pnpm test` toàn repo | Đều qua (test mới: 25 ở render-core, 56 ở templates) |
| Dựng thật 18 mẫu ở xem trước (540×960) bằng ffmpeg LGPL `n8.1.3` (`libopenh264`) | Cả 18 ra mp4 `h264 yuv420p`, đúng kích thước, số khung đúng bằng `thời lượng × fps`, thời lượng khớp |
| Hành vi trên khung thật | Ken Burns làm khung đầu/cuối khác nhau (motion `none` thì giống); chữ chỉ hiện trong `t..tEnd` (so với video không chữ); logo chỉ hiện trong khoảng chỉ định và giữ đúng màu; thẻ cuối đúng màu thương hiệu; nhạc → luồng AAC, đúng thời lượng; ảnh EXIF xoay hiển thị đúng chiều |
| Đường dẫn khó | Ảnh tên có dấu cách, `%d`, tiếng Việt; thư mục có `:` và dấu cách: dựng được |
| Lỗi | Ảnh không tồn tại → `SLIDESHOW_PHOTO_MISSING` trước khi chạy ffmpeg; ảnh hỏng → `SLIDESHOW_FFMPEG_FAILED` tiếng Việt; huỷ bằng `AbortSignal` → `SLIDESHOW_CANCELED`; `libx264` bị từ chối |
| Thời gian (VM 4 vCPU, không GPU, ảnh nguồn 3000–4000 px) | Mẫu 14,5 s: xem trước 540×960 ≈ 1,3 s; **bản đầy đủ 1080×1920 ≈ 4,0 s, ~3,7 MB**; mẫu ghép 4:5 10,5 s ≈ 2,2 s |
| Mắt thường | Đã xem các khung đối chiếu: chữ Việt có dấu đúng, chữ không tràn khung, bố cục an toàn đúng. Ảnh test là ảnh **tổng hợp** (`testsrc2`, `gradients`…), chưa phải ảnh thật của khách |

Chạy lại:

```bash
pnpm install
node tools/ffmpeg/fetch-lgpl.mjs            # tải ffmpeg LGPL đã ghim vào .cache/ffmpeg (test tự tìm; hoặc đặt APS_TEST_FFMPEG_LGPL)
pnpm --filter @aps/render-core test         # cần thêm một font có tiếng Việt (DejaVu), hoặc đặt APS_TEST_FONT
pnpm --filter @aps/templates test           # test render bị bỏ qua nếu thiếu ffmpeg LGPL hoặc font
pnpm --filter @aps/templates schema:export  # sinh lại JSON Schema khi đổi schema.ts
```

CI: job `ffmpeg-license` chạy thêm hai lệnh test trên với binary LGPL ghim và font DejaVu.

---

## 6. Chưa làm, rủi ro, câu hỏi cho khách

### 6.1 Chưa làm

- Kéo thả ảnh đã cài đặt nhưng chưa có e2e riêng (e2e dùng hộp thoại chọn tệp giả lập qua biến môi trường). Bài nháp chưa đồng bộ giữa các máy và chưa có "nhân bản bài".
- Chuyển HEIC mới kiểm bằng ảnh HEIC tự tạo (pillow-heif) và smoke test; **chưa thử ảnh HEIC thật từ nhiều đời iPhone** (ảnh sâu màu 10-bit, Live Photo, ảnh có lớp độ sâu). Rủi ro bằng sáng chế HEVC: `THIRD_PARTY_NOTICES.md`.
- Thông báo kiểm tra dữ liệu (SĐT, giá, HEIC...) hiện chỉ có tiếng Việt vì nằm trong `@aps/templates`; bản tiếng Anh của giao diện vẫn hiện câu tiếng Việt cho các lỗi này.
- Chưa kiểm phông Be Vietnam Pro trên Windows/macOS thật và chưa đo độ tràn chữ với mọi mẫu bằng phông đóng gói (mới đo trên mẫu mặc định).
- Kiểm ảnh quá nhỏ/mờ; xử lý PNG có nền trong suốt (hiện thành nền đen).
- Thư viện nhạc có bản quyền (hiện chỉ nhận tệp người dùng chọn).
- Thử trên Windows/macOS: mới chạy Linux x64. Chưa có binary LGPL ghim cho macOS (phần ghi trong `THIRD_PARTY_NOTICES.md`); logic escape đường dẫn kiểu Windows (`C:\…`) mới có test đơn vị, chưa chạy trên Windows thật.
- Máy yếu: chưa đo trên CPU 2 đến 4 lõi thật; số ~4 giây ở trên là VM 4 vCPU.
- Xuất bản tự động (đã chốt là V1), chia sẻ thẳng lên Zalo/TikTok.
- Ảnh tĩnh (không phải video) theo mẫu, ví dụ ảnh bìa quảng cáo: chưa làm, dễ mở rộng bằng cách xuất một khung.

### 6.2 Rủi ro

| Rủi ro | Mức | Hướng xử lý |
|---|---|---|
| Toàn bộ nhu cầu ngành ở mục 1 là giả định; mẫu có thể không khớp cách khách làm thật | Cao | Thử với 2 đến 3 khách mỗi ngành trước khi mở rộng; mẫu giữ `evidence: assumption` đến lúc đó |
| Chữ xuống dòng theo ước lượng độ rộng ký tự, không đo font thật; font khác có thể tràn | Trung bình | Có co cỡ và cắt "…" làm lưới an toàn; app nay dùng Be Vietnam Pro đóng gói, nhưng nên đo từng mẫu với phông này trước khi phát hành |
| Chất lượng với ảnh thật (thiếu sáng, mờ, nền lộn xộn) chưa đánh giá; Ken Burns trên ảnh thấp phân giải bị mờ | Trung bình | Lấy 10 bộ ảnh thật từ khách (Q2) để chấm |
| Tệp dưới 50 MB cho Zalo OA đã đảm bảo bằng bitrate, nhưng chưa thử đăng thật | Thấp | Thử đăng một video lên OA thật |
| Quy định quảng cáo (ảnh trẻ em, cam kết, ưu đãi, thông tin công trình của chủ nhà) | Trung bình | Đây không phải tư vấn pháp lý; cần người có chuyên môn rà soát chữ mẫu và lời nhắc trong giao diện |
| Bằng sáng chế/AAC/H.264 (`libopenh264` build nguồn) | Chưa rà soát | Giữ nguyên ghi chú ở `THIRD_PARTY_NOTICES.md` |
| Một mẫu hỏng trong thư viện làm cả app lỗi khi nạp | Thấp | `library.ts` nêu rõ ngành/mẫu/trường; test CI bắt trước khi phát hành. Nên nạp từng ngành độc lập khi tích hợp UI |

### 6.3 Câu hỏi cần khách thật xác nhận

Gợi ý hỏi bằng cách xin xem 5 bài đăng gần nhất của họ thay vì hỏi chung chung.

1. **Q1.** Mỗi tuần/tháng bạn đăng bao nhiêu bài có ảnh hoặc video? Kênh nào (Facebook trang hay cá nhân, Zalo, TikTok)? Loại bài nào đăng nhiều nhất? (G-BH2, G-NH2, G-NK2, G-XD2, G-NN2)
2. **Q2.** Ảnh bạn dùng từ đâu: tự chụp bằng điện thoại gì (iPhone hay Android), có thuê chụp không? Cho xem 10 ảnh gần nhất. (G-C2)
3. **Q3.** Số điện thoại trên bài đăng có cùng số Zalo không? Có Zalo OA hay chỉ Zalo cá nhân? Bạn đăng video lên Zalo bằng cách nào? (G-C3, Q9)
4. **Q4.** Ai sẽ thao tác (chủ hay nhân viên)? Dùng máy tính hay điện thoại? Máy tính Windows hay macOS, đời máy nào, có card đồ hoạ không? (cấu hình tối thiểu, G-C1)
5. **Q5.** Bạn có file logo chưa? Có màu và phông chữ thương hiệu cố định không? Logo nên hiện suốt video hay chỉ cuối? (mẫu `logo: end_card|all`)
6. **Q6.** Bạn có cần nhạc nền không? Đã từng bị Facebook/TikTok gỡ hoặc tắt tiếng vì nhạc? (G-C7)
7. **Q7.** Bạn có muốn ghi giá trên video không, hay thường báo giá riêng? Nếu ghi, ghi theo dạng nào (199k, 199.000đ, "từ…")? (G-C6, định dạng giá)
8. **Q8.** Video dài bao nhiêu thì bạn chịu xem và đăng? 10 giây có đủ không? Bạn cần video ngang (16:9) cho kênh nào? (G-C5)
9. **Q9.** Zalo và Facebook nơi bạn đăng có giới hạn dung lượng/thời lượng gì bạn từng gặp? (mục 1.1 chưa xác minh)
10. **Q10.** Trong 5 ngành, **nội dung nào bạn thực sự cần nhất** mà các mẫu liệt kê chưa có? Mẫu nào trong danh sách bạn sẽ không bao giờ dùng?
11. **Q11.** Với ảnh có người (nhất là trẻ em ở trung tâm ngoại ngữ), bạn xin phép thế nào trước khi đăng? (G-NN3, quy định)
12. **Q12.** Trường nào trong form bạn thấy khó hiểu hoặc không muốn nhập? Điền thử một mẫu và cho chúng tôi xem bạn dừng ở đâu. (mục 3, mục tiêu 5 phút)
13. **Q13.** Chữ đăng kèm (caption) bạn thường viết giọng nào (thân mật, trang trọng), xưng hô ra sao, có dùng hashtag trên Zalo không? (CHANNEL_RULES Zalo = không hashtag là giả định)
14. **Q14.** Bạn có cần video **sản phẩm 3D xoay** không, hay ảnh thật là đủ? Nhôm kính: bạn có mô hình 3D mẫu cửa không? (quyết định cảnh `clip`, mục 2.6)
15. **Q15.** Bạn có chịu trả tiền cho tính năng này không và ở mức nào so với thuê người làm video? (ngoài phạm vi kỹ thuật nhưng quyết định thứ tự làm)
