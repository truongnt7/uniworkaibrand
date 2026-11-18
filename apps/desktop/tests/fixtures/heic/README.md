Ảnh HEIC mẫu cho `tests/heic.test.ts` (tự tạo, không có người/địa điểm thật, không có EXIF):

- `plain-320x240.heic`: nền xanh dương, góc trên-trái đỏ, góc dưới-phải xanh lá. Tạo bằng pillow-heif (libheif + x265).
- `irot90-320x240.heic`: như trên nhưng có thêm hộp `irot` (xoay 90° ngược chiều kim đồng hồ) như ảnh iPhone chụp dọc; tạo bằng `make-irot.py plain irot90 1`. Giải mã đúng phải ra 240x320, đỏ ở góc dưới-trái.
- `wide-4200x600.heic`: dải màu 4200x600 để kiểm tra thu nhỏ khi cạnh dài vượt 3840 và để đo việc giải mã không chặn vòng lặp sự kiện.
