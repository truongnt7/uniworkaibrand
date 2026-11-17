# Chính sách quyền riêng tư (bản nháp)

> **BẢN NHÁP, CHƯA CÓ GIÁ TRỊ PHÁP LÝ. Cần luật sư rà soát trước khi công bố.**
> Soạn ngày 17/11/2026 cho ứng dụng desktop **[TÊN SẢN PHẨM]** (tạm gọi AI Product Studio) và dịch vụ backend. Tài liệu chỉ nêu ở mức khái quát, chưa thay thế tư vấn pháp lý.
>
> **Ghi chú soạn thảo (xóa trước khi công bố):**
> 1. Yêu cầu ban đầu nhắc **Nghị định 13/2023/NĐ-CP**. Qua tra cứu ngày 17/11/2026: Nghị định này **hết hiệu lực từ 01/01/2026**, thay bằng **Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15** (hiệu lực 01/01/2026) và **Nghị định 356/2025/NĐ-CP** (hướng dẫn thi hành). Bản nháp bám theo hai văn bản mới; LS xác nhận thêm các văn bản liên quan (an ninh mạng, thương mại điện tử, người tiêu dùng) và nghĩa vụ cụ thể theo quy mô pháp nhân (Nghị định 356 có cơ chế miễn trừ cho hộ kinh doanh, doanh nghiệp siêu nhỏ, nhỏ và khởi nghiệp, kèm ngoại lệ).
> 2. Chỗ có dấu `[ ]` là thông tin phải điền. Chỗ ghi **(LS)** là điểm cần luật sư quyết.
> 3. Chính sách phải **khớp thực tế** hệ thống (kế hoạch mục 4, 6) và khớp câu trả lời Data Handling Questionnaire của Meta ([checklist](meta-tiktok-api-checklist.md)). Mỗi lần thêm nhà cung cấp AI/telemetry/thanh toán phải cập nhật.

Phiên bản: 0.1 (nháp) · Có hiệu lực từ: `[ngày công bố]` · Cập nhật gần nhất: `[ngày]`

## 1. Ai chịu trách nhiệm xử lý dữ liệu của bạn

| Mục | Nội dung |
|---|---|
| Bên kiểm soát dữ liệu | **[TÊN PHÁP NHÂN]**, mã số doanh nghiệp `[MST]`, địa chỉ `[địa chỉ đăng ký]`, đại diện `[họ tên, chức danh]` |
| Bộ phận/nhân sự bảo vệ dữ liệu cá nhân | `[họ tên hoặc bộ phận]` · Email `[privacy@tên-miền]` · Điện thoại `[số]` |
| Website/Dịch vụ | `[https://tên-miền]` (website, API, trang quản trị), ứng dụng desktop cho Windows và macOS |

Với dữ liệu cá nhân của người khác mà bạn đưa vào nội dung của mình (ví dụ khách hàng xuất hiện trong ảnh), bạn là bên kiểm soát và chúng tôi xử lý theo yêu cầu của bạn trong phạm vi cung cấp dịch vụ **(LS: xác định vai trò bên xử lý và có cần điều khoản xử lý dữ liệu riêng)**.

## 2. Dữ liệu chúng tôi thu thập

| Nhóm dữ liệu | Ví dụ | Nguồn | Có rời máy bạn không? |
|---|---|---|---|
| **Tài khoản & workspace** | Email, tên hiển thị, mật khẩu (băm) hoặc định danh đăng nhập Google, vai trò trong workspace, thành viên được mời | Bạn cung cấp | Có (lưu trên máy chủ) |
| **Thanh toán & gói dịch vụ** (pilot chuyển khoản) | Tên tổ chức/cá nhân xuất hóa đơn, mã số thuế, địa chỉ, nội dung chuyển khoản, lịch sử cấp credit. **Không** lưu số thẻ | Bạn cung cấp, xác nhận thủ công | Có |
| **Tài sản sản phẩm** | Ảnh sản phẩm, nhãn bao bì, logo, màu thương hiệu, kích thước, file `.glb`, mô tả | Bạn tải lên | **Mặc định ở trên máy bạn.** Chỉ gửi đi khi bạn dùng tính năng AI trên đám mây, đồng bộ hoặc đăng bài (mục 5) |
| **Nội dung tạo ra** | Ảnh, video, caption, hashtag, timeline dự án, bản xuất, cấu hình mẫu | Ứng dụng tạo | Ở máy bạn; lên máy chủ khi đồng bộ/lên lịch đăng |
| **Yêu cầu gửi AI** | Lời nhắc (prompt) cho Đạo diễn AI/caption/sinh nền, ảnh đầu vào cho tạo model 3D hoặc sinh nền | Bạn nhập | Có (qua AI Gateway của chúng tôi tới nhà cung cấp AI) |
| **Kết nối mạng xã hội** (V1) | Tên Page/tài khoản, mã định danh, **token truy cập** (lưu mã hóa, chỉ ở máy chủ), trạng thái lịch đăng, kết quả đăng | Bạn cấp quyền qua OAuth | Có |
| **Nhật ký kỹ thuật** | Phiên bản ứng dụng/Blender, hệ điều hành, cấu hình phần cứng (CPU/GPU/RAM), kết quả benchmark, log render (đã lược bỏ đường dẫn cá nhân), mã lỗi | Ứng dụng tự ghi | Chỉ khi bạn bật gửi (mục 4) |
| **Báo cáo sự cố (crash report)** | Dấu vết lỗi, bộ nhớ khi crash (minidump) qua `[dịch vụ crash report]` | Ứng dụng tạo | Chỉ khi bạn đồng ý |
| **Dữ liệu vận hành máy chủ** | Địa chỉ IP, thời điểm đăng nhập, log API, mã thiết bị (device id) | Tự động | Có |
| **Liên hệ hỗ trợ** | Nội dung thư, tệp đính kèm | Bạn gửi | Có |

Chúng tôi **không chủ động thu thập dữ liệu cá nhân nhạy cảm** và không yêu cầu bạn tải lên ảnh có khuôn mặt hay thông tin cá nhân của người khác. **(LS: xem xét khả năng dữ liệu nhạy cảm/sinh trắc xuất hiện trong ảnh người dùng và nghĩa vụ kèm theo.)**

## 3. Mục đích và cơ sở xử lý

| Mục đích | Dữ liệu | Cơ sở |
|---|---|---|
| Tạo và quản lý tài khoản, workspace, phân quyền | Tài khoản | Thực hiện hợp đồng/điều khoản sử dụng |
| Cung cấp tính năng tạo ảnh/video, gọi AI | Tài sản, nội dung, yêu cầu AI | Thực hiện hợp đồng; **sự đồng ý** khi gửi dữ liệu tới nhà cung cấp AI ở nước ngoài |
| Cấp gói/credit, xuất hóa đơn, đối soát chuyển khoản | Thanh toán | Hợp đồng; nghĩa vụ kế toán, thuế |
| Đăng/lên lịch bài lên Facebook, Instagram, TikTok (V1) | Kết nối mạng xã hội, nội dung | Hợp đồng; **sự đồng ý** qua màn hình cấp quyền của nền tảng |
| Bảo mật, chống lạm dụng, điều tra sự cố | Dữ liệu vận hành máy chủ | Lợi ích chính đáng/bảo vệ hệ thống **(LS: xác nhận cơ sở)** |
| Cải thiện sản phẩm, chẩn đoán lỗi, crash report | Nhật ký kỹ thuật | **Sự đồng ý** (tùy chọn, tắt mặc định) |
| Hỗ trợ khách hàng, thông báo dịch vụ | Liên hệ, tài khoản | Hợp đồng |
| Tuân thủ yêu cầu của cơ quan nhà nước có thẩm quyền | Tùy trường hợp | Quy định pháp luật |

Chúng tôi **không bán** dữ liệu cá nhân. Chúng tôi **không dùng** tài sản và nội dung của bạn để huấn luyện mô hình AI của riêng mình; việc nhà cung cấp AI có dùng dữ liệu để huấn luyện hay không do hợp đồng với họ quy định, chúng tôi chỉ chọn nhà cung cấp không dùng dữ liệu API để huấn luyện **(cam kết này chỉ đưa vào khi hợp đồng thực tế đã xác nhận — LS/OPS)**.

## 4. Sự đồng ý, telemetry và crash report

- Lần đầu mở ứng dụng, bạn thấy màn hình đồng ý riêng, **không tích sẵn**, cho: (a) gửi nhật ký kỹ thuật ẩn danh, (b) gửi báo cáo sự cố. Bạn có thể từ chối mà vẫn dùng đầy đủ tính năng.
- Bạn đổi lựa chọn bất kỳ lúc nào trong Cài đặt > Quyền riêng tư. Rút lại đồng ý không ảnh hưởng đến xử lý đã thực hiện trước đó.
- Trước khi gửi AI trên đám mây lần đầu, ứng dụng nêu rõ ảnh/lời nhắc sẽ gửi đi đâu; chúng tôi lưu bản ghi thời điểm và nội dung đồng ý để chứng minh khi cần.
- Ứng dụng chạy được ngoại tuyến cho các tác vụ cục bộ (xem trước, render, tách nền trên máy). Cần mạng cho đăng nhập, xác thực giấy phép/credit, AI đám mây, đồng bộ và đăng bài.

## 5. Chia sẻ dữ liệu và chuyển dữ liệu ra nước ngoài

Chúng tôi chỉ chia sẻ dữ liệu cần thiết cho từng mục đích với các nhóm sau (danh sách cụ thể ở Phụ lục A, phải cập nhật khi đổi nhà cung cấp):

| Nhóm bên nhận | Mục đích | Dữ liệu | Vị trí máy chủ |
|---|---|---|---|
| Nhà cung cấp AI: image→3D, sinh/chỉnh sửa ảnh, mô hình ngôn ngữ | Thực hiện tác vụ AI bạn yêu cầu | Ảnh sản phẩm, lời nhắc | `[quốc gia]` |
| Hạ tầng lưu trữ và cơ sở dữ liệu (S3-compatible, PostgreSQL, CDN) | Lưu tài khoản, đồng bộ, bản xuất, gói cài đặt | Tài khoản, tệp bạn đồng bộ | `[quốc gia/khu vực]` |
| Meta (Facebook, Instagram), TikTok | Đăng bài theo yêu cầu của bạn | Nội dung đăng, token | Theo nền tảng |
| Dịch vụ crash report/telemetry | Chẩn đoán lỗi (nếu bạn đồng ý) | Nhật ký kỹ thuật | `[quốc gia]` |
| Dịch vụ email giao dịch | Gửi thông báo tài khoản, lỗi đăng bài | Email, nội dung thông báo | `[quốc gia]` |
| Ngân hàng (nhận chuyển khoản) | Đối soát thanh toán | Thông tin chuyển khoản | Việt Nam |
| Cố vấn pháp lý, kế toán, kiểm toán | Tuân thủ | Tối thiểu cần thiết | Việt Nam |
| Cơ quan nhà nước có thẩm quyền | Theo yêu cầu hợp pháp | Theo yêu cầu | Việt Nam |

**Chuyển dữ liệu ra nước ngoài.** Khi dữ liệu cá nhân được chuyển hoặc xử lý ngoài lãnh thổ Việt Nam (ví dụ nhà cung cấp AI hoặc hạ tầng ở nước ngoài), chúng tôi thực hiện các biện pháp theo pháp luật Việt Nam, gồm hợp đồng/thỏa thuận với bên nhận và **hồ sơ đánh giá tác động chuyển dữ liệu xuyên biên giới** gửi cơ quan chuyên trách khi thuộc diện phải làm (hồ sơ này theo Luật 91/2025/QH15 và Nghị định 356/2025/NĐ-CP; thời hạn nộp, trường hợp miễn trừ: **LS xác nhận**). Tài khoản mạng xã hội bạn kết nối thuộc nền tảng tương ứng; việc nền tảng xử lý dữ liệu tuân theo chính sách của họ.

## 6. Lưu trữ và xóa

| Dữ liệu | Thời hạn lưu (đề xuất, **LS/CDA chốt**) |
|---|---|
| Tài khoản, workspace | Suốt thời gian dùng dịch vụ; xóa/ẩn danh trong `[30]` ngày sau khi bạn yêu cầu xóa tài khoản |
| Tài sản và nội dung bạn đã đồng ý lưu trên máy chủ | Đến khi bạn xóa hoặc đóng tài khoản (+ `[30]` ngày để hoàn tất xóa khỏi sao lưu, tối đa `[90]` ngày) |
| Dữ liệu gửi nhà cung cấp AI | Chúng tôi không giữ lâu hơn cần thiết; nhà cung cấp lưu theo hợp đồng `[ghi rõ thời hạn từng nhà cung cấp]` |
| Token mạng xã hội | Đến khi bạn ngắt kết nối hoặc token hết hạn/bị thu hồi; xóa ngay khi ngắt kết nối |
| Chứng từ thanh toán, hóa đơn | Theo thời hạn lưu trữ kế toán, thuế `[LS xác nhận số năm]` |
| Log vận hành máy chủ | `[90]` ngày |
| Nhật ký kỹ thuật, crash report | `[180]` ngày |

Dữ liệu cục bộ trên máy bạn do bạn kiểm soát; gỡ ứng dụng không tự xóa thư mục dữ liệu (ứng dụng cung cấp nút "Xóa dữ liệu cục bộ"). Nếu bạn kết nối Facebook/Instagram, bạn cũng có thể yêu cầu xóa dữ liệu từ trang cài đặt Facebook; chúng tôi trả về liên kết và mã xác nhận để theo dõi (yêu cầu của Meta).

## 7. Quyền của bạn

Theo Luật Bảo vệ dữ liệu cá nhân 2025, bạn có các quyền (tên gọi cụ thể và phạm vi: **LS đối chiếu với điều luật**): được biết về việc xử lý; đồng ý hoặc không đồng ý/rút lại đồng ý; truy cập, xem, chỉnh sửa hoặc yêu cầu chỉnh sửa; yêu cầu cung cấp bản sao; yêu cầu xóa; yêu cầu hạn chế xử lý; phản đối xử lý; khiếu nại, tố cáo, yêu cầu bồi thường theo quy định.

**Cách thực hiện:** gửi email tới `[privacy@tên-miền]` hoặc dùng mục Cài đặt > Quyền riêng tư > Yêu cầu dữ liệu. Chúng tôi xác minh danh tính bạn và phản hồi trong `[thời hạn theo quy định, LS xác nhận]`. Chúng tôi có thể từ chối khi pháp luật cho phép hoặc yêu cầu (ví dụ nghĩa vụ lưu chứng từ), và sẽ nêu lý do bằng văn bản. Rút lại đồng ý/xóa tài khoản có thể làm một số tính năng ngừng hoạt động.

## 8. Bảo mật

Biện pháp kỹ thuật và quản lý (mô tả khái quát, khớp thiết kế): mã hóa khi truyền (HTTPS/TLS) và khi lưu trữ; token mạng xã hội chỉ ở máy chủ, mã hóa; khóa API của nhà cung cấp AI **không** nằm trong ứng dụng; ứng dụng desktop cách ly giao diện với hệ thống (sandbox, `contextIsolation`), token phiên lưu bằng kho khóa của hệ điều hành; phân quyền theo vai trò (Chủ, Quản trị, Biên tập, Xem); nhật ký kiểm toán cho thay đổi credit/gói; sao lưu có kiểm soát; chỉ nhân sự được phân quyền truy cập dữ liệu.

**Sự cố dữ liệu.** Khi phát hiện vi phạm quy định bảo vệ dữ liệu cá nhân, chúng tôi lập hồ sơ, **thông báo cho Bộ Công an (cơ quan chuyên trách) trong 72 giờ** kể từ khi phát hiện theo quy định hiện hành và thông báo cho bạn khi pháp luật yêu cầu hoặc khi rủi ro cao. Nghị định 356/2025 còn quy định thông báo chủ thể trong 72 giờ với dữ liệu vị trí/sinh trắc học (hiện sản phẩm không thu thập); **LS xác nhận** thời hạn, nội dung, lưu hồ sơ tối thiểu.

## 9. Trẻ em

Dịch vụ dành cho doanh nghiệp và người từ **đủ 18 tuổi** hoặc người có năng lực hành vi dân sự đầy đủ. Chúng tôi không chủ định thu thập dữ liệu của trẻ em; nếu phát hiện, chúng tôi sẽ xóa. **(LS: Luật có quy định riêng về dữ liệu trẻ em; xác nhận câu chữ.)**

## 10. Website, cookie

Website `[tên-miền]` dùng cookie cần thiết cho đăng nhập và `[cookie phân tích nếu có]`. Cookie không thiết yếu chỉ đặt sau khi bạn đồng ý. `[Liệt kê cookie sau khi có website]`

## 11. Thay đổi chính sách

Khi có thay đổi quan trọng (thêm nhà cung cấp, mục đích mới, chuyển dữ liệu ra nước ngoài mới), chúng tôi thông báo trong ứng dụng và qua email trước `[15]` ngày và xin lại đồng ý nếu pháp luật yêu cầu. Lịch sử phiên bản lưu tại `[URL]`.

## 12. Liên hệ và khiếu nại

**[TÊN PHÁP NHÂN]** · `[địa chỉ]` · `[privacy@tên-miền]` · `[điện thoại]`. Nếu không hài lòng, bạn có quyền khiếu nại tới cơ quan nhà nước có thẩm quyền về bảo vệ dữ liệu cá nhân.

## Phụ lục A. Danh sách bên xử lý (điền khi chọn nhà cung cấp)

| Nhà cung cấp | Vai trò | Dữ liệu | Quốc gia | Có huấn luyện bằng dữ liệu không? | Hợp đồng xử lý dữ liệu đã ký |
|---|---|---|---|---|---|
| `[image→3D: Tripo/Meshy/Hunyuan/Rodin, chọn ở P0-11]` | Tạo model 3D | Ảnh sản phẩm | `[ ]` | `[ ]` | ☐ |
| `[sinh ảnh/nền]` | Sinh bối cảnh | Ảnh, prompt | `[ ]` | `[ ]` | ☐ |
| `[LLM]` | Đạo diễn AI, caption | Prompt, ngữ cảnh sản phẩm | `[ ]` | `[ ]` | ☐ |
| `[S3/R2/MinIO + PostgreSQL hosting]` | Lưu trữ | Tài khoản, tệp | `[ ]` | — | ☐ |
| `[crash report]` | Chẩn đoán | Nhật ký lỗi | `[ ]` | — | ☐ |
| `[email giao dịch]` | Thông báo | Email | `[ ]` | — | ☐ |

## Phụ lục B. Việc cần làm cho chính sách này

| ✔ | Việc | Ai |
|---|---|---|
| ☐ | Điền thông tin pháp nhân, người phụ trách dữ liệu cá nhân, domain | CDA |
| ☐ | Chọn nhà cung cấp, điền Phụ lục A, ký hợp đồng xử lý dữ liệu | OPS, LS |
| ☐ | LS rà soát nội dung theo Luật 91/2025/QH15, Nghị định 356/2025/NĐ-CP, xác định nghĩa vụ theo quy mô pháp nhân (hồ sơ đánh giá tác động xử lý dữ liệu, đánh giá tác động chuyển dữ liệu ra nước ngoài, chỉ định nhân sự bảo vệ dữ liệu) | LS |
| ☐ | Xây màn hình đồng ý (không tích sẵn), lưu bản ghi đồng ý, nút xóa dữ liệu/tài khoản, Yêu cầu dữ liệu | FE, BE |
| ☐ | Crash report của Electron: khởi tạo với `uploadToServer: false` và chỉ bật bằng `setUploadToServer(true)` sau khi người dùng đồng ý (Electron không cho tắt crash reporter sau khi đã `start`, nhưng cho đặt cờ tải lên; nguồn: tài liệu Electron `crashReporter`, tra cứu 17/11/2026) | BE |
| ☐ | Quy trình xử lý sự cố 72 giờ + mẫu thông báo | OPS |
| ☐ | Đưa bản cuối lên HTTPS cố định, dùng cho Meta/TikTok và màn About của ứng dụng | OPS |
