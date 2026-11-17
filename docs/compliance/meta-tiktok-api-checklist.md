# Meta và TikTok API: lộ trình xin quyền đăng bài

> **Ngày tra cứu: 17/11/2026** (nguồn ở mục 6). Tài liệu nền tảng đổi thường xuyên, nên mọi mục ghi **"cần xác minh"** phải kiểm lại trên trang gốc trước khi nộp hồ sơ.
> Bối cảnh: MVP chỉ xuất video + caption để đăng thủ công; đăng qua API là **V1** (xem [kế hoạch mục 5](../ke-hoach-ai-blender-electron.md), backlog P0-18). Thủ tục chạy song song từ Phase 0 vì thời gian duyệt không kiểm soát được.

Vai trò: **CDA** = chủ dự án (người có quyền pháp nhân/ký), **OPS** = vận hành/pháp lý, **BE** = backend, **FE** = desktop/UI, **LS** = luật sư.

## 1. Điểm cần chốt sớm (ảnh hưởng thiết kế)

| # | Phát hiện khi tra cứu | Hành động | Ai |
|---|---|---|---|
| 1 | Kế hoạch mục 5 liệt kê `publish_video` cho Facebook. Tài liệu Meta mô tả quyền này **chỉ dành cho phát trực tiếp (live video)**. Đăng Reels lên Page cần `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`. | **Bỏ `publish_video`** khỏi danh sách xin (chỉ xin quyền cần thiết, Meta từ chối nếu xin thừa). Sửa lại kế hoạch mục 5 khi duyệt PR này. | BE, CDA |
| 2 | Instagram có 3 đường: *Facebook Login* (`instagram_basic`, `instagram_content_publish`, cần Page liên kết), *Instagram Login* (`instagram_business_basic`, `instagram_business_content_publish`, không cần Page), *Unified Login*. Câu "cần xác minh" ở kế hoạch đã có đáp án: Instagram Login **tồn tại và có đăng bài**. | Chọn **một** đường cho V1. Đề xuất: Facebook Login for Business cho cả FB + IG (một lần đăng nhập, một app); Instagram Login là phương án dự phòng cho khách IG không có Page. | BE, CDA |
| 3 | Reels Facebook: **3–90 giây**, giới hạn **30 bài API/24 giờ/Page**. Reels Instagram: 3 giây–15 phút, 100 bài API/24 giờ/tài khoản. Kế hoạch mới ghi giới hạn của IG. | Cập nhật bảng kiểm tra video theo kênh (mục 4.1) và bộ giới hạn tần suất trong Publisher. | BE |
| 4 | TikTok cấm ứng dụng gắn **logo/watermark/văn bản quảng bá** vào nội dung đăng lên TikTok. Thiết kế có "logo cuối video" (ffmpeg overlay). | Logo do **người dùng tự chọn** là nội dung của họ, nhưng phải **tắt mặc định** khi đăng TikTok, không chèn tên/logo của ta, người dùng xem trước và sửa được. **Cần xác minh** với TikTok (hỏi qua kênh hỗ trợ developer) trước khi nộp audit. | FE, CDA |
| 5 | TikTok yêu cầu API client "dành cho đông đảo người dùng, không chỉ nhóm nội bộ" và không phải công cụ đăng bài cho tài khoản do chính bạn quản lý. | Mô tả app như SaaS cho nhiều SMB (đúng bản chất). Không nộp audit khi mới có pilot nội bộ. | CDA |
| 6 | Cả hai nền tảng bắt buộc: **URL chính sách riêng tư, điều khoản, hướng dẫn xóa dữ liệu** công khai trên HTTPS, domain thuộc quyền sở hữu. | Dùng bản nháp ở [chinh-sach-rieng-tu.md](chinh-sach-rieng-tu.md) và [dieu-khoan-su-dung.md](dieu-khoan-su-dung.md); LS rà soát rồi xuất bản (mục 2). | OPS, LS |

## 2. Việc chung cần xong trước khi nộp (làm ngay Phase 0)

| ✔ | Việc | Chi tiết / đầu ra | Ai |
|---|---|---|---|
| ☐ | **Pháp nhân** | Quyết định pháp nhân đứng tên app (tên đăng ký chính xác, địa chỉ, mã số thuế). Tên phải **khớp từng ký tự** giữa Meta Business, giấy tờ nộp và website. | CDA |
| ☐ | **Domain + website công khai** | Trang giới thiệu sản phẩm, hiển thị rõ tên pháp nhân, email liên hệ. TikTok yêu cầu link Privacy/ToS **thấy ngay trên trang, không nằm trong menu** và đang hoạt động. | OPS, FE |
| ☐ | **3 URL pháp lý (HTTPS)** | Chính sách riêng tư, Điều khoản sử dụng, hướng dẫn xóa dữ liệu (Meta: cần ghi trong chính sách cách người dùng yêu cầu xóa; nên có thêm *Data Deletion Request Callback* trả JSON `{url, confirmation_code}`). | OPS, BE |
| ☐ | **Email liên hệ chính** | Hộp thư nhóm (không dùng email cá nhân): Meta gửi thông báo duyệt vào "Primary Contact". | OPS |
| ☐ | **Biểu tượng app 1024×1024** | Không chứa logo/nhãn hiệu của Meta hay TikTok. | FE |
| ☐ | **Môi trường staging** | Bản chạy được trên HTTPS với luồng kết nối kênh + đăng bài thật; tài khoản demo (Page, IG Business, TikTok) để quay video và để reviewer thử. | BE |
| ☐ | **Redirect URI** | OAuth qua trình duyệt hệ thống → HTTPS của ta → deeplink `app://` (khớp kế hoạch mục 5). Đăng ký chính xác URI trong cả hai app. | BE |
| ☐ | **Kịch bản + máy quay** | Quay màn hình ≥ 1080p, giao diện tiếng Anh hoặc có phụ đề/tooltip tiếng Anh (Meta khuyến nghị; TikTok cũng dùng người duyệt quốc tế, **cần xác minh**). | FE, OPS |

## 3. Meta (Facebook Page + Instagram Business)

### 3.1 Lộ trình

| Bước | Việc | Điều kiện / lưu ý | Ai | Đầu ra |
|---|---|---|---|---|
| M1 | Tạo tài khoản developer + **Meta app** (loại Business) | Admin app dùng tài khoản Facebook thật của người chịu trách nhiệm | OPS | App ID ở chế độ Development |
| M2 | Tạo/dùng **Business portfolio** (Business Manager) và gắn app vào | Chỉ **Admin của Business** mới hoàn tất xác minh được | CDA | App liên kết Business |
| M3 | **Business Verification** | Cần để xin Advanced Access và để người dùng thuộc doanh nghiệp khác cấp quyền cho app. Giấy tờ: mục 3.2 | CDA, OPS | Trạng thái "Verified". Thời gian **cần xác minh** (không công bố cố định) |
| M4 | Cấu hình app: icon, Privacy Policy URL, App Purpose = **Clients**, category, Primary Contact, Data Deletion URL | App Purpose = "Yourself or your own business" chỉ dùng khi chỉ người có role dùng app. Ta phục vụ khách nên chọn Clients | OPS | App Settings đầy đủ |
| M5 | Dev/staging: gọi API thật với **từng quyền** | Meta bắt buộc **ít nhất 1 lệnh gọi thành công cho mỗi quyền, trong 30 ngày trước khi nộp**; log cập nhật sau tối đa 2 ngày. Nút "Request advanced access" bị khóa nếu thiếu | BE | Log gọi API đủ quyền |
| M6 | Chuẩn bị **screencast** từng quyền + mô tả sử dụng (mục 3.3) | Mỗi quyền một mô tả riêng, không sao chép. Quyền thiếu video sẽ không được duyệt | FE, OPS | Video + văn bản |
| M7 | Trả lời **Data Handling Questions** (Data Handling Questionnaire) | Đánh giá tức thì sau khi Business đã verified; trả lời phải khớp chính sách riêng tư | OPS, LS | Bản trả lời lưu lại |
| M8 | Nộp **App Review** (Advanced Access) | Hướng dẫn nêu thời gian quyết định thường trong khoảng một tuần; thực tế có thể lâu hơn và bị trả về nhiều vòng (**cần xác minh**). Không đổi cài đặt app sau khi nộp (có thể phải duyệt lại) | OPS | Quyết định từng quyền |
| M9 | Chuyển app sang **Live** | Chỉ sau khi duyệt xong; bài test tạo ở chế độ Development sẽ hiện công khai khi chuyển Live | OPS | App Live |
| M10 | Vận hành: **Data Use Checkup hằng năm**, theo dõi thay đổi API/phiên bản Graph API | App có Advanced Access phải hoàn thành DUC hằng năm để giữ quyền | OPS | Lịch nhắc hằng năm |

Dùng thử khi chưa duyệt: người có role trên app (admin/developer/tester) cấp quyền được mà không cần App Review; dùng được cho nội bộ và vài khách pilot được thêm role. Giới hạn số role và tính hợp lệ khi vận hành pilot thương mại: **cần xác minh**.

### 3.2 Tài liệu Business Verification (Meta Business Help Center)

Cần chứng minh **tên pháp nhân** và **địa chỉ hoặc số điện thoại chính thức**. Loại được chấp nhận (theo trang trợ giúp Meta và bài tổng hợp ngày tra cứu):

- Giấy chứng nhận đăng ký doanh nghiệp / giấy phép kinh doanh (với Việt Nam: bản scan Giấy chứng nhận đăng ký doanh nghiệp; **cần xác minh** Meta có yêu cầu bản dịch hay không).
- Giấy tờ thuế do cơ quan nhà nước cấp (tờ khai tự lập không được chấp nhận).
- Sao kê ngân hàng **của doanh nghiệp** (đúng tên, đúng địa chỉ).
- Hóa đơn điện/nước/viễn thông: chỉ chứng minh địa chỉ/điện thoại, không đủ để chứng minh tên.

Yêu cầu chung: còn hiệu lực, rõ nét, không cắt xén, **khớp chính xác** với thông tin trong Business Manager, che thông tin cá nhân không cần thiết. Nếu cần chữ ký/ủy quyền (ví dụ nhân viên nộp thay), chuẩn bị giấy ủy quyền: **cần xác minh**.

### 3.3 Quyền cần xin và screencast

Phương án đề xuất: **Facebook Login for Business** (một app cho FB Page + IG). Chỉ xin quyền thực sự dùng ở V1.

| Quyền | Dùng để làm gì trong app | Phụ thuộc | Screencast phải thấy |
|---|---|---|---|
| `pages_show_list` | Liệt kê Page người dùng quản lý để chọn kênh | — | Đăng nhập Facebook, màn cấp quyền, danh sách Page trong app, chọn Page |
| `pages_read_engagement` | Đọc thông tin Page cần cho đăng bài (và là phụ thuộc của quyền khác) | `pages_show_list` | Cùng luồng đăng nhập; hiển thị tên/ảnh Page đã kết nối |
| `pages_manage_posts` | Đăng Reels/video/ảnh lên Page, sửa/xóa bài do app tạo | `pages_read_engagement`, `pages_show_list` | Đăng nhập, cấp quyền; tạo bài (video/Reels) từ Thư viện; chỉnh sửa và xóa bài; hiển thị bài mới trên Page thật |
| `instagram_basic` | Lấy ID/tên tài khoản IG Business liên kết Page | `pages_show_list` (và `pages_read_user_content`, **cần xác minh** theo bảng phụ thuộc) | Chọn tài khoản IG đã liên kết, hiển thị username |
| `instagram_content_publish` | Đăng Reels/ảnh lên IG Business | `instagram_basic`, `pages_read_engagement`, `pages_show_list` | Đăng nhập, cấp quyền; tạo bài từ Thư viện; chờ trạng thái container; hiển thị bài trên IG (Meta mô tả mẫu là bài ảnh feed; với Reels **cần xác minh** có phải quay thêm video Reels riêng) |
| `ads_management`/`ads_read` | **Chỉ khi** người dùng có role trên Page qua Business Manager (không phải admin trực tiếp) | — | **Cần xác minh** có thực sự áp dụng cho khách SMB; tránh xin nếu không cần |
| `instagram_business_basic` + `instagram_business_content_publish` | **Chỉ** nếu chọn đường Instagram Login | — | Luồng "Business Login for Instagram" thay cho Facebook Login |

Không xin: `publish_video` (live), `pages_messaging`, `ads_*` để chạy quảng cáo, quyền bình luận/insights ở V1.

Quy cách quay (theo hướng dẫn Meta): độ phân giải **≥ 1080p**, thu hẹp màn hình ≤ 1440 px rộng, **không ghi âm** (reviewer không nghe), con trỏ chuột to, dùng chuột thay bàn phím, chỉ quay phần cần thiết, giao diện tiếng Anh hoặc có chú thích. Mỗi video phải thể hiện **người dùng cấp quyền → app dùng quyền → kết quả hiển thị trên Facebook/Instagram**. Cách làm: một kịch bản chung "Đăng nhập → Chọn Page/IG → Chọn video trong Thư viện → Caption + cờ nội dung AI → Đăng → Mở Page/IG thấy bài → Sửa/Xóa (FB)", cắt thành đoạn theo từng quyền.

Thông tin trong form nộp, mỗi quyền (trả lời đủ 4 câu Meta gợi ý): (1) quyền giúp người dùng thế nào, (2) vì sao app cần, (3) dữ liệu được dùng ra sao, (4) thiếu quyền thì app kém hữu ích ở đâu. Kèm hướng dẫn truy cập app cho reviewer; **không** gửi tài khoản Meta cá nhân (Meta dùng tài khoản test riêng).

### 3.4 Điểm kỹ thuật và chính sách khi đăng (đưa vào backlog V1)

| Chủ đề | Quy định tra cứu được | Hành động |
|---|---|---|
| IG Reels | MP4/MOV, H.264 hoặc HEVC, AAC ≤ 48 kHz, 23–60 fps, 3 giây–15 phút, khuyến nghị 9:16, "closed GOP", moov atom đầu file | Preset ffmpeg khớp (kế hoạch P0-12) |
| FB Reels | 9:16, 1080×1920 khuyến nghị (tối thiểu 540×960), 24–60 fps, **3–90 giây**, 4:2:0, closed GOP 2–5 giây; có `video_state=SCHEDULED` (từ >10 phút đến 29 ngày) | Từ chối render không hợp lệ trước khi đăng |
| Giới hạn tần suất | IG: 100 bài API/24 giờ (gọi `content_publishing_limit` để biết thực tế; tài liệu còn ghi chỗ 50, **cần xác minh**); 400 container/24 giờ. FB Reels: 30 bài API/24 giờ | Scheduler tự áp trần thấp hơn |
| IG cần URL công khai | Meta tải video từ `video_url` công khai; hoặc dùng upload resumable (`rupload.facebook.com`) | Signed URL ngắn hạn hoặc resumable |
| Container IG | Hết hạn sau 24 giờ; nên hỏi trạng thái mỗi phút, tối đa 5 phút | Tạo container sát giờ đăng |
| **Page Publishing Authorization (PPA)** | IG liên kết với Page cần PPA thì chưa đăng được cho đến khi hoàn tất PPA | Thêm vào hướng dẫn kết nối, thông báo lỗi rõ ràng |
| **Nhãn nội dung AI** | `is_ai_generated` (IG), `is_ai_generated` (FB Reels) | Bật mặc định cho nội dung do AI tạo; UI cho phép người dùng xem lại |
| Nhãn quảng cáo hợp tác | `is_paid_partnership`, `branded_content_sponsor_ids` (IG, chỉ Facebook Login) | Ngoài phạm vi V1; ghi nhận nếu khách yêu cầu |
| Token | Page access token từ user token dài hạn; thời hạn ~60 ngày (kế hoạch) | **Cần xác minh** hạn token theo loại đăng nhập; trạng thái "Cần kết nối lại" |

## 4. TikTok (Content Posting API)

### 4.1 Hai đường tích hợp

| | Hộp thư nháp (`video.upload`) | Đăng trực tiếp (`video.publish`) |
|---|---|---|
| Endpoint | `/v2/post/publish/inbox/video/init/` | `/v2/post/publish/video/init/` (ảnh: `/v2/post/publish/content/init/`) |
| Hành vi | Video vào hộp thư nháp, người dùng mở TikTok để chỉnh và đăng | Đăng thẳng lên hồ sơ |
| Cần audit | Không (kế hoạch V1) nhưng vẫn phải **qua app review** để dùng scope — **cần xác minh** ranh giới giữa "app review" và "audit" | **Có**: chưa audit thì mọi bài bị ép `SELF_ONLY` |
| Giới hạn | Tối đa **5 bài chờ duyệt/24 giờ/người dùng** (`spam_risk_too_many_pending_share`); 6 request/phút/token | 6 request/phút/token; trần bài/ngày/creator (thường khoảng 15, dùng chung mọi client); trần số creator hoạt động 24 giờ theo ước tính khai trong audit |
| Kế hoạch | **V1** | **V1.5** sau audit |

Người dùng phải bấm thông báo trong hộp thư để hoàn tất; UI của ta phải nói rõ điều này.

### 4.2 Lộ trình

| Bước | Việc | Ai | Đầu ra |
|---|---|---|---|
| T1 | Tạo tài khoản **TikTok for Developers**, tạo/gia nhập tổ chức (khuyến nghị) | OPS | Tài khoản dev |
| T2 | Đăng ký app: tên, icon, mô tả, category; thêm **Login Kit** + **Content Posting API**; bật cấu hình **Direct Post** nếu dùng `video.publish` | OPS, BE | App ở Sandbox |
| T3 | **Xác minh quyền sở hữu URL** (app tạo sau 09/09/2024: Terms URL, Privacy URL, Web/Desktop URL; ngoài ra mọi URL tải lên của Content Posting). Xác minh theo Domain (DNS) hoặc URL prefix (file chữ ký) **ở chế độ Production** | OPS | Domain đã xác minh |
| T4 | Chạy sandbox end-to-end; quay video demo (mục 4.4) | BE, FE | Video ≤ 5 file, mỗi file ≤ 50 MB |
| T5 | Nộp **App review**: giải thích từng product/scope hoạt động thế nào + demo. Chỉ giữ product/scope thực sự dùng (thừa sẽ làm chậm). Lần đầu **bắt buộc quay trên sandbox** | OPS | Kết quả duyệt (thời gian **cần xác minh**) |
| T6 | Khi cần đăng công khai: nộp **audit** cho Direct Post (form audit có phần ước tính số creator hoạt động/ngày). Điều kiện chi tiết, thời gian xử lý, mẫu form: **cần xác minh** (trang audit hiện cần đăng nhập portal) | OPS, CDA | Client đã audit |
| T7 | Vận hành: theo dõi quota, `reached_active_user_cap`, thay đổi chính sách | OPS | — |

Giới hạn khi **chưa audit** (nguồn Content Sharing Guidelines): tối đa **5 người dùng đăng trong 24 giờ**, tài khoản đăng phải ở chế độ riêng tư, bài chỉ `SELF_ONLY`; muốn công khai thì chủ tài khoản tự đổi chế độ tài khoản sang công khai và đổi từng bài thành "Everyone".

### 4.3 Bắt buộc về UX khi đăng trực tiếp (hạng mục thiết kế cho designer/FE)

- Mỗi lần mở màn đăng phải gọi `creator_info/query` và **hiển thị nickname** tài khoản đích; hết lượt thì dừng và báo thử lại sau; kiểm tra độ dài video theo `max_video_post_duration_sec`.
- Tiêu đề (caption ≤ 2200 ký tự UTF-16), người dùng sửa được mọi nội dung điền sẵn (kể cả hashtag).
- **Quyền riêng tư**: menu thả xuống theo `privacy_level_options`, **không có giá trị mặc định**, người dùng chọn tay.
- Bình luận/Duet/Stitch: **không tick sẵn**, xám đi nếu tài khoản tắt; ảnh chỉ có "cho phép bình luận".
- **Công bố nội dung thương mại**: công tắc **tắt mặc định**; bật thì chọn "Thương hiệu của bạn" (nhãn "Promotional content") và/hoặc "Nội dung có thương hiệu" (nhãn "Paid partnership"); phải chọn ít nhất một mới đăng được; nội dung thương hiệu bên thứ ba không được để riêng tư. Chữ khai báo đồng ý phía trên nút Đăng theo mẫu TikTok quy định (Music Usage Confirmation; thêm Branded Content Policy khi cần) — dùng nguyên văn tiếng Anh từ trang guidelines.
- **Xem trước** nội dung; chỉ gửi nội dung sang TikTok **sau khi người dùng đồng ý rõ ràng**; thông báo "có thể mất vài phút mới hiện trên hồ sơ"; theo dõi `publish/status/fetch` hoặc webhook.
- Gắn `is_aigc=true` cho nội dung AI (nhãn "Creator labeled as AI-generated").
- **Không** chèn logo/watermark/văn bản quảng bá của ứng dụng (xem mục 1 hàng 4).
- `client_secret` giữ ở server, **không** nhúng vào app desktop hay mã nguồn mở (liên quan đến `blender-worker` công khai: đừng đưa bí mật vào repo đó).
- Dùng `PULL_FROM_URL` khi video đã nằm trên storage của ta (URL thuộc domain đã xác minh, HTTPS, không redirect, truy cập được suốt 1 giờ); `FILE_UPLOAD` chỉ khi video còn trên máy người dùng (chunk 5–64 MB, tối đa 1000 chunk, tuần tự).

Giới hạn video: MP4 (khuyến nghị)/WebM/MOV, H.264 (khuyến nghị)/H.265/VP8/VP9, 23–60 fps, cạnh 360–4096 px, tối đa 4 GB, dài tối đa 10 phút qua API (người dùng có thể phải cắt theo hạn mức tài khoản).

### 4.4 Thông tin cần chuẩn bị và kịch bản demo

Chuẩn bị: mô tả sản phẩm nhắm tới đông đảo SMB (không phải công cụ nội bộ); URL Terms/Privacy/Web đã xác minh; mô tả từng scope (`user.info.basic` cho Login Kit, `video.upload` và/hoặc `video.publish`); giải thích lưu trữ token và dữ liệu TikTok (liên kết chính sách riêng tư); ước tính số creator hoạt động/ngày (cho audit); tài khoản test.

Video demo (hiển thị giao diện thật, domain khớp URL khai báo, mở app từ đầu nếu là ứng dụng desktop/mobile): đăng nhập + cấp quyền → chọn video từ Thư viện → màn đăng với creator info, quyền riêng tư, tương tác, công bố thương mại, xem trước, đồng ý → tiến trình/trạng thái → kết quả trong TikTok (bài hoặc nháp) → thể hiện cả trạng thái lỗi/hết lượt. Với ứng dụng desktop, ghi rõ vì sao URL "Web/Desktop URL" là trang tải về: **cần xác minh** cách khai báo cho app Electron.

## 5. Tiến độ và checklist tổng

| ✔ | Mốc | Ai | Phụ thuộc |
|---|---|---|---|
| ☐ | Chốt pháp nhân, domain, email chung | CDA | — |
| ☐ | Xuất bản 3 URL pháp lý sau khi LS rà soát | OPS, LS | Mục 2 |
| ☐ | Tạo Meta app + Business, nộp Business Verification | CDA, OPS | Pháp nhân |
| ☐ | Tạo TikTok app, xác minh domain, bật Sandbox | OPS, BE | Domain |
| ☐ | Staging chạy luồng kết nối + đăng (FB/IG/TikTok nháp) | BE, FE | P0-16 |
| ☐ | Gọi API thật cho từng quyền Meta (≤ 30 ngày trước khi nộp) | BE | Staging |
| ☐ | Quay screencast Meta (từng quyền) và demo TikTok | FE, OPS | Staging |
| ☐ | Điền Data Handling Questionnaire khớp chính sách riêng tư | OPS, LS | Chính sách |
| ☐ | Nộp App Review Meta; nộp App review TikTok | OPS | Các mục trên |
| ☐ | Theo dõi hằng tuần; ghi nhận lý do từ chối để sửa | OPS | — |
| ☐ | Đặt lịch Data Use Checkup hằng năm (Meta) | OPS | Sau Live |
| ☐ | Audit TikTok Direct Post (V1.5) | OPS, CDA | Hộp nháp chạy ổn |

Rủi ro đã biết: reviewer đòi lại video vì thiếu một bước hiển thị; Business Verification bị từ chối do lệch tên pháp nhân; thay đổi cài đặt app sau khi nộp gây duyệt lại; TikTok từ chối vì logo/watermark; TikTok coi app là "công cụ nội bộ" nếu mô tả sai.

## 6. Nguồn tra cứu (17/11/2026) và các điểm cần xác minh

Nguồn:
- Meta: [Instagram Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing); [IG User Media (thông số Reels)](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media); [Facebook Reels Publishing](https://developers.facebook.com/docs/video-api/guides/reels-publishing); [Permissions Reference](https://developers.facebook.com/docs/permissions/); [App Review](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review) và [submission guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide); [Business Verification](https://developers.facebook.com/docs/development/release/business-verification); [Access Levels](https://developers.facebook.com/docs/graph-api/overview/access-levels/); [Data Use Checkup](https://developers.facebook.com/docs/resp-plat-initiatives/data-use-checkup); [Data Deletion Callback](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback); [Meta Business Help: giấy tờ xác minh](https://www.facebook.com/business/help/159334372093366); [thông báo bỏ Access Verification cho Tech Provider (09/10/2026)](https://developers.facebook.com/blog/post/2026/10/09/retiring-access-verification-for-tech-provider-apps/).
- TikTok: [Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines) (cập nhật 04/08/2026); [Get Started - Direct Post](https://developers.tiktok.com/doc/content-posting-api-get-started); [Direct Post reference](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post) (cập nhật 27/10/2026); [Upload Video (hộp nháp)](https://developers.tiktok.com/doc/content-posting-api-reference-upload-video); [Media Transfer Guide](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide); [Scopes](https://developers.tiktok.com/doc/tiktok-api-scopes); [App Review Guidelines](https://developers.tiktok.com/docs/en/app-review-guidelines); [Register Your App](https://developers.tiktok.com/docs/en/getting-started-create-an-app).

**Cần xác minh** (không tìm được nguồn chính thức xác định hoặc cần đăng nhập portal):
1. Thời gian xử lý Business Verification và App Review Meta trên thực tế; số vòng bị trả về.
2. Meta có yêu cầu bản dịch/ủy quyền cho giấy tờ doanh nghiệp Việt Nam không.
3. Screencast `instagram_content_publish` cho Reels (mẫu Meta nêu bài ảnh feed).
4. Giới hạn IG 50 hay 100 bài/24 giờ (tài liệu ghi hai con số khác nhau).
5. Quyền `ads_management`/`ads_read` có cần cho khách có role qua Business Manager; phụ thuộc `pages_read_user_content` của `instagram_basic`.
6. Thời hạn token theo từng loại đăng nhập; số người có role được dùng ở chế độ Development khi chạy pilot.
7. TikTok: ranh giới app review và audit cho `video.upload`; mẫu form audit, thời gian, tiêu chí; cách khai báo URL cho ứng dụng desktop; chính sách với logo của người dùng; ngôn ngữ reviewer chấp nhận.
8. Tính khả dụng của TikTok for Developers/Content Posting API cho tổ chức Việt Nam.
