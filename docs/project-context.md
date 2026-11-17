# AI for Brand: bối cảnh và quyết định

Mục tiêu: nền tảng AI + Blender (bản cài Electron) giúp doanh nghiệp nhỏ tạo ảnh và video 3D sản phẩm.

## Quyết định đã chốt (16/11/2026)

| Hạng mục | Quyết định |
|---|---|
| Phiên bản Blender | 4.5 LTS cho PoC, khóa phiên bản và kiểm thử trước khi nâng cấp |
| Phân phối Blender | Tải ở lần dùng đầu tiên, có checksum, tiến trình tải, thử lại; hỗ trợ bộ cài offline riêng |
| Xuất bản mạng xã hội | V1. MVP xuất video và caption để đăng thủ công; làm thủ tục API song song |
| Máy yếu | MVP: cấu hình xem trước nhẹ và render local; cloud render ở V1, thiết kế sẵn giao diện job |
| Backend và thanh toán | NestJS + PostgreSQL, file qua S3-compatible storage; thêm Redis/BullMQ khi triển khai worker cloud. Pilot dùng chuyển khoản, chưa tích hợp cổng thanh toán |
| Worker GPL | Chấp nhận công khai worker nếu giấy phép yêu cầu; tách worker khỏi app, rà soát giấy phép trước phát hành |
| Thị trường | Việt Nam trước, giao diện tiếng Việt; cấu trúc đa ngôn ngữ từ đầu |

Tài liệu chính: [ke-hoach-ai-blender-electron.md](ke-hoach-ai-blender-electron.md)

Mẫu theo ngành và chế độ ảnh sang video: [industry-templates.md](industry-templates.md)

Trạng thái luồng "ảnh sang video" trong app (màn hình Tạo video, hàng đợi, ghi nhớ thông tin, phông, e2e): [industry-templates.md](industry-templates.md) mục 2.6.
