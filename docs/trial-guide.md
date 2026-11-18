# Hướng dẫn dùng thử AI Product Studio (bản thử nghiệm, Windows)

Tài liệu này dành cho khách dùng thử. Bạn **không cần biết kỹ thuật**: cài app, chọn ảnh, bấm "Tạo video", lưu video để đăng Facebook, Zalo, TikTok.

> Đây là **bản thử nghiệm**. Có thể còn lỗi và sẽ thay đổi. Cảm ơn bạn đã giúp chúng tôi sửa chúng. Mục 5 chỉ cách gửi phản hồi.

## 1. Máy của bạn có dùng được không

| | Tối thiểu | Nên có | Ghi chú |
|---|---|---|---|
| Hệ điều hành | Windows 10 64-bit | Windows 11 64-bit | Không chạy trên Windows 7/8, máy 32-bit, macOS, Linux (bản này chỉ có cho Windows) |
| CPU | 2 nhân | 4 nhân trở lên | Chúng tôi mới đo trên máy 4 nhân: video 1080p dựng khoảng 4 giây, xem trước 1 đến 2 giây. **Máy 2 nhân chưa được đo**, có thể chậm hơn nhiều |
| RAM | 4 GB | 8 GB trở lên | Chưa đo trên máy yếu thật; 4 GB là mức dự kiến |
| Ổ đĩa trống | 1 GB | 3 GB | Cài app khoảng 0,3 GB, thành phần dựng video khoảng 0,7 GB (tải 170 MB, giải nén khoảng 450 MB). Video "3D nâng cao" cần thêm khoảng 2 GB, **bạn không cần nếu chỉ làm video từ ảnh** |
| Mạng | Cần **một lần** khi mở lần đầu | Bình thường | Tải thành phần dựng video khoảng 170 MB. Sau đó làm video từ ảnh không cần mạng |
| Màn hình | 1366 x 768 | Full HD | |
| Card đồ họa (GPU) | Không cần | Không cần | Video từ ảnh không dùng GPU |
| Quyền quản trị | Không cần | | App cài cho riêng tài khoản Windows của bạn |

## 2. Cài đặt

1. Tải tệp cài đặt `AI-Product-Studio-Trial-Setup-...-x64.exe` mà chúng tôi gửi. Nếu có kèm mã kiểm tra (SHA-256), bạn có thể đối chiếu bằng PowerShell: `Get-FileHash .\tên-tệp.exe`.
2. Trình duyệt (Edge, Chrome) có thể báo "tệp không thường được tải xuống" hoặc "có thể gây hại". Chọn **Giữ** (Keep) rồi **Giữ tệp** (Keep anyway).
3. Bấm đúp tệp vừa tải. **Windows sẽ hiện cảnh báo xanh "Windows đã bảo vệ PC của bạn" (SmartScreen).** Đây là chuyện bình thường với bản thử nghiệm, **vì chúng tôi chưa mua chứng chỉ ký số** (tiền mua chứng chỉ tính theo năm). Hãy làm như sau:
   - Bấm **Thông tin thêm** (More info).
   - Bấm nút **Vẫn chạy** (Run anyway).
4. Chờ vài chục giây. App tự cài và tự mở. Trên màn hình nền sẽ có biểu tượng "AI Product Studio".

Nếu bạn không yên tâm: chỉ cài tệp do chính chúng tôi gửi, và đối chiếu mã SHA-256 ở bước 1. Nếu Windows Defender hoặc phần mềm diệt virus của bạn chặn hẳn tệp, hãy báo cho chúng tôi, đừng tắt phần mềm diệt virus.

## 3. Lần mở đầu tiên: tải thành phần dựng video

Ở đầu màn hình Tạo video, nếu thấy dải màu vàng nhạt *"Cần cài thành phần dựng video một lần (cần có mạng, dưới 200 MB)"*:

1. Bấm **Cài ngay**. Thanh tiến độ hiện bằng tiếng Việt: đang tải, kiểm tra, giải nén.
2. Đừng tắt app. Mạng chậm có thể mất vài phút. Nếu rớt mạng, app tự thử lại; nếu báo lỗi, bấm **Tải tiếp**: app tiếp tục từ chỗ đã tải, không tải lại từ đầu.
3. Xong, dải này biến mất. Từ nay bạn làm video từ ảnh mà không cần mạng.

Bạn **không cần** cài thành phần Blender (3D) nếu chỉ làm video từ ảnh. Nó chỉ hiện ở mục "Video sản phẩm 3D (nâng cao)", bạn có thể bỏ qua.

## 4. Tạo video đầu tiên (khoảng 3 phút)

1. **Tên bài** (ô trên cùng): đặt tên cho bài này, ví dụ "Khai trương tháng 12". App tự lưu nháp khi bạn gõ, đóng app mở lại vẫn còn.
2. **Bạn kinh doanh gì?** Chọn ngành (ví dụ Bán hàng online). App tự chọn kiểu video phù hợp; bạn có thể đổi ở bước 2 (ví dụ "Thông báo khuyến mãi").
3. **Thông tin hiện trên video**: tên cửa hàng, số điện thoại, tên sản phẩm, giá, ưu đãi, địa chỉ. Ô có dấu * là bắt buộc. Nếu sai, app báo bằng chữ đỏ và nói rõ cách sửa (ví dụ số điện thoại phải đủ 10 số). Tên cửa hàng, số điện thoại, địa chỉ được nhớ cho lần sau.
4. **Ảnh của bạn**: bấm vào ô ảnh (hoặc kéo ảnh thả vào). Ảnh chính là bắt buộc. Ảnh chụp thẳng, đủ sáng, sản phẩm nằm giữa cho kết quả đẹp nhất.
   - Ảnh **iPhone (HEIC)** dùng được: app tự đổi sang JPG và báo "Đã chuyển ảnh HEIC (iPhone) sang JPG". Ảnh gốc của bạn không bị sửa.
   - Có thể thêm **logo** và **nhạc nền** (chỉ nhạc bạn có quyền sử dụng; app không kèm nhạc).
5. Chọn **khung hình**: Dọc 9:16 (TikTok, Reels, Zalo), 4:5 hoặc Vuông 1:1 (Facebook).
6. Bấm **Tạo video**. Bản xem trước hiện ở cột bên phải sau vài giây.
7. Hài lòng thì bấm **Lưu video vào máy**, chọn nơi lưu. Video là tệp MP4, đăng thẳng lên Facebook, Zalo, TikTok được.
8. **Chữ đăng kèm**: ở cột phải có sẵn nội dung cho Facebook, Zalo, TikTok. Bấm **Sao chép chữ**, rồi dán khi đăng. Bạn sửa được trước khi chép.

Làm nhiều bài: bấm **Bài mới** (ô tên bài). Các bài cũ nằm ở mục "Các bài khác", bấm vào để mở lại hoặc xóa.

## 5. Gửi phản hồi cho chúng tôi

Bản thử chưa có nút gửi phản hồi trong app, nên bạn gửi thủ công. Hãy gửi tới: **`[điền kênh nhận phản hồi: Zalo/email của đội dự án]`**.

Càng đủ thông tin chúng tôi càng sửa nhanh. Nhờ bạn gửi:

1. **Chuyện gì xảy ra**: bạn bấm gì, mong đợi gì, thấy gì. Một câu là đủ.
2. **Ảnh chụp màn hình** (phím `Windows + Shift + S`, hoặc `PrtSc`). Nếu app báo lỗi, bấm "Chi tiết kỹ thuật" ở thông báo lỗi để mở ra rồi chụp lại cả phần đó.
3. **Máy của bạn**: Windows 10 hay 11, số RAM, loại CPU (Cài đặt > Hệ thống > Giới thiệu).
4. Nếu video xấu hoặc sai chữ: gửi kèm **video** và **ảnh gốc** (nếu bạn đồng ý). Chúng tôi chỉ dùng để sửa lỗi.
5. Ngoài lỗi, chúng tôi rất muốn nghe: bước nào làm bạn lúng túng, mất bao lâu để ra video đầu tiên, video có đủ đẹp để đăng không.

## 6. Lỗi thường gặp

| Bạn thấy | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Windows hiện "Windows đã bảo vệ PC của bạn" | Bản thử chưa ký số | Bấm **Thông tin thêm**, rồi **Vẫn chạy** (mục 2) |
| "Cần cài thành phần dựng video một lần" | Lần đầu mở app | Bấm **Cài ngay** (mục 3) |
| "Lỗi mạng khi tải. Hãy kiểm tra kết nối rồi thử lại." | Mạng yếu hoặc bị chặn (công ty, VPN, tường lửa) | Thử mạng khác (ví dụ phát 4G từ điện thoại), bấm **Tải tiếp**. Mạng công ty cần cho phép tải từ `github.com` |
| "Tệp tải về bị hỏng (sai checksum)" | Tải bị lỗi giữa chừng | App tự xóa tệp hỏng; bấm **Tải tiếp** để tải lại |
| "Không đủ dung lượng đĩa" | Ổ C gần đầy | Giải phóng ít nhất 1 GB rồi thử lại |
| "Thành phần dựng video chưa sẵn sàng" | Thành phần chưa cài xong hoặc bị phần mềm diệt virus xóa | Bấm **Cài ngay** lại; báo cho chúng tôi nếu lặp lại |
| Ô ảnh báo "Không chuyển được ảnh HEIC này sang JPG" | Tệp ảnh bị hỏng, hoặc là ảnh HEIC đặc biệt | Chọn ảnh khác; hoặc trên iPhone vào Cài đặt > Camera > Định dạng > **Tương thích nhất** rồi chụp lại, hoặc gửi ảnh qua Zalo (Zalo đổi sang JPG) |
| "Ảnh quá lớn (trên 120 MB)" | Ảnh gốc quá nặng | Chọn ảnh nhỏ hơn |
| "Không tìm thấy một trong các ảnh" / "N ảnh không còn trên máy" | Bạn đã xóa hoặc di chuyển ảnh gốc sau khi chọn | Chọn lại ảnh ở ô báo lỗi. (Ảnh iPhone đã được app lưu bản JPG riêng nên không bị mất) |
| Ô đỏ "Bạn chưa nhập..." | Thiếu thông tin bắt buộc | Nhập ô được báo; nút **Tạo video** sẽ bật lại khi đủ |
| "Số điện thoại chưa đúng" | Thiếu hoặc thừa số | Nhập đủ 10 số, ví dụ 0901 234 567 |
| Dòng "Chưa lưu được nháp..." | Ổ đĩa đầy hoặc bị khóa | Giải phóng ổ đĩa; đừng đóng app vội, bấm **Lưu video** để giữ kết quả |
| Video "Chờ" mãi hoặc lỗi lặp lại | Máy yếu, hoặc ảnh có định dạng lạ | Hủy rồi bấm **Thử lại**; thử ảnh JPG khác; báo cho chúng tôi |
| App không mở | Bị phần mềm diệt virus chặn hoặc cài dở | Mở lại từ Start; hoặc gỡ cài đặt rồi cài lại (mục 7) |

## 7. Gỡ cài đặt và dữ liệu của bạn

- **Gỡ app**: Cài đặt Windows > Ứng dụng > AI Product Studio > Gỡ cài đặt.
- Dữ liệu của bạn (bài nháp, video đã tạo trong app, thành phần dựng video đã tải, thông tin cơ sở) nằm trong thư mục `%APPDATA%\@aps\desktop` (gõ đường dẫn này vào thanh địa chỉ của File Explorer). **Gỡ app không xóa thư mục này**, để cài lại là còn nguyên. Muốn xóa sạch thì xóa thư mục đó (tên thư mục nhìn hơi kỹ thuật vì đây là bản thử, bản chính thức sẽ đổi).
- Video bạn bấm **Lưu video vào máy** nằm ở nơi bạn chọn, không bị gỡ app làm mất.

## 8. Về dữ liệu và quyền riêng tư

- Làm video từ ảnh chạy **hoàn toàn trên máy bạn**: ảnh, logo, nhạc và video không được gửi lên mạng.
- App chỉ kết nối mạng để **tải thành phần dựng video** (ở mục 3) từ địa chỉ cố định đã ghi trong danh mục thành phần. Danh mục này được ký điện tử và app kiểm lại mã kiểm tra (SHA-256) của tệp tải về trước khi dùng; tệp sai là bị từ chối.
- Các nút "Cloud" trong app hiện ghi "sắp có" và chưa hoạt động.
- Chúng tôi chỉ nhận ảnh, video, thông tin máy khi **bạn chủ động gửi** ở mục 5.

## 9. Về tính pháp lý và giới hạn của bản thử

- Chỉ dùng ảnh, logo, nhạc bạn có quyền sử dụng.
- Bản thử chưa ký số, nên cảnh báo Windows ở mục 2 là chờ đợi được. Khi ra bản chính thức, chúng tôi sẽ ký số để cảnh báo này giảm đi dần khi nhiều người cài.
- Bản thử không tự cập nhật. Khi có bản mới, chúng tôi sẽ gửi tệp cài đặt mới; cài đè lên bản cũ, dữ liệu vẫn còn.
