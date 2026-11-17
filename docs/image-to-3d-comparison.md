# So sánh nhà cung cấp image→3D (P0-11)

Cập nhật 17/11/2026. Liên quan: [kế hoạch](ke-hoach-ai-blender-electron.md) mục 3.1 và P0-11, [lớp AI](ai-layer.md).

**Trạng thái: chưa đo.** Chưa có API key của nhà nào và chưa có ảnh sản phẩm thật, nên **chưa gọi API thật**: không có số liệu chất lượng, độ trễ hay tỉ lệ thử lại do chúng tôi đo. Mọi số dưới đây là giá/điều khoản **lấy từ tài liệu công khai của nhà cung cấp ngày 17/11/2026** (có link), cần kiểm lại trước khi ký hợp đồng. Ô ghi "chưa đo" là chưa có dữ liệu.

## 1. Tiêu chí

| Nhóm | Tiêu chí | Cách chấm (khi có key) |
|---|---|---|
| Chất lượng hình học | Sai số tỉ lệ so với kích thước mm đã nhập (mục tiêu ≤ 3% như P0-10), cổ chai/quai/nắp không dính, mặt kín, số tam giác | Đo trên glb; điểm 0–5 theo thang cố định |
| Vùng gán nhãn | Mặt trụ/phẳng đủ sạch để chiếu decal `label.png` (nhãn sẽ không dùng texture AI, xem [chính sách giữ nhãn](ai-layer.md#6-chính-sách-giữ-nhãn-ai-không-sinh-lại-pixel-sản-phẩm)) | Render thử decal, so SSIM vùng nhãn |
| Vật liệu trong suốt | Thuỷ tinh/nhựa trong có bị "đặc hoá" không | Quan sát; vật liệu vẫn gán từ thư viện |
| Đầu vào | Số góc ảnh (1 / nhiều góc), chế độ **chỉ hình học** không texture | Theo tài liệu API |
| Độ trễ | p50/p95 từ gửi đến glb tải được | Đo 10 SP × 2–3 lần |
| Độ ổn định | Tỉ lệ cần thử lại, lỗi/kiểm duyệt nhầm | Đếm |
| Chi phí | Giá/lần và **giá cho mỗi model đạt** = giá × (1 + tỉ lệ thử lại) | Tính sau khi đo |
| Giấy phép/dữ liệu | Quyền sở hữu/thương mại đầu ra, huấn luyện trên dữ liệu khách, thời gian lưu, **quyền cho phép ta cấp lại dịch vụ cho người dùng cuối qua AI Gateway** | Đọc điều khoản |
| Vận hành | Webhook/poll, giới hạn song song, định dạng (glb), kiểm duyệt nội dung | Theo tài liệu |

## 2. Bảng so sánh (giá và điều khoản từ tài liệu, chất lượng/độ trễ chưa đo)

| | Tripo | Meshy | Hunyuan3D (Tencent HY 3D Global, API quốc tế) | Rodin (Hyper3D) |
|---|---|---|---|---|
| Giá image→3D | 1 credit = $0,01. Image→3D 20–30 credit (**$0,20–0,30**), multiview→3D 20–30; texture/retopo tính thêm ([trang giá](https://www.tripo3d.ai/api)) | meshy-6/7.1: **20 credit chỉ lưới**, 30 có texture 2K–4K, 35 texture 8K; meshy-6-lite: 5 / 15. Multi-image cùng giá. Giá USD/credit **chưa xác minh** (phụ thuộc gói) ([bảng credit](https://docs.meshy.ai/en/api/pricing)) | Express **15 credit** (~$0,30 trả sau, $0,02/credit); Pro "Normal" 25 credit ($0,50); Pro "Geometry" (không texture) 15 credit ($0,30); PBR/nhiều góc/số mặt +10 credit mỗi mục; gói trả trước $0,0135–0,015/credit; job lỗi không tính phí ([Tencent Cloud](https://www.tencentcloud.com/document/product/1281/74121)) | Gen-2: **0,5 credit/lần**, 1–5 ảnh ([tài liệu](https://docs.hyper3d.ai/en/api-specification/rodin-gen2)). Giá USD/credit **chưa xác minh**; API cần gói Business/Enterprise ([trang API](https://hyper3d.ai/features/api)) |
| Nhiều góc ảnh | Có (multiview) | Có (multi-image) | Có (`MultiViewImages`, +10 credit) | Có (tối đa 5) |
| Chỉ hình học | Có tuỳ chọn không texture (theo tài liệu API, chưa thử) | Có ("Mesh only", 20 credit) | Có (Pro Geometry) | Có (Raw mesh, theo trang API) |
| Quyền đầu ra (tài khoản trả phí) | Người dùng có đủ quyền thương mại; gói miễn phí thì Tripo giữ quyền ([ToS 5.2](https://developers.tripo3d.ai/en/terms)) | Gói trả phí: sở hữu riêng, dùng thương mại; gói free: CC BY 4.0 ([Meshy](https://docs.meshy.ai/en/webapp/pricing)) | Chưa đọc điều khoản dịch vụ API quốc tế. Giấy phép bản **mã nguồn mở** Hunyuan3D 2.1 loại trừ EU/UK/Hàn Quốc (theo kế hoạch mục 3.1), có thể không áp dụng cho API; cần xác minh | Rodin: "không giới hạn việc dùng đầu ra" theo ToS, dùng thương mại tuỳ gói ([ToS](https://hyper3d.ai/legal/terms)) |
| Dữ liệu khách | Không dùng đầu vào/đầu ra của gói trả phí để huấn luyện | Trang API nói API **không** dùng để huấn luyện, nhưng ToS 2.9 nói có thể dùng dữ liệu không-Enterprise trừ khi từ chối: **mâu thuẫn, cần hỏi lại**. Đầu ra API xoá sau 3 ngày (gói không-Enterprise) | Kiểm duyệt nội dung mặc định bật; cần xác thực tên thật tài khoản quốc tế | Lưu 7 ngày (Business) |
| Bán lại cho người dùng cuối | **Cấm** cung cấp dịch vụ cho bên thứ ba/người dùng cuối khi chưa có văn bản cho phép (ToS 3.2) | **Cấm** bán lại/phân phối lại truy cập dịch vụ (ToS) | Chưa đọc | Chưa đọc |
| Vận hành | Webhook, định dạng GLB/FBX/OBJ/USDZ | Chưa đọc kỹ | 3 job song song mặc định; **1 000 credit miễn phí** cho tài khoản mới (khoảng 40 lần Pro) | 5 job song song (Business) |
| Độ trễ | Kế hoạch ước 1–3 phút; **chưa đo** | **chưa đo** | Bên thứ ba ghi Express ~2–3 phút, Pro ~3–6 phút ([Modelglass](https://modelglass.com.au/models/tencent--hunyuan3d)); **chưa đo** | **chưa đo** |
| Chất lượng trên chai/hộp/túi | **chưa đo** | **chưa đo** | **chưa đo** | **chưa đo** |

## 3. Nhận định theo loại bao bì (giả thuyết, chưa kiểm chứng)

- **Hộp, chai/lọ/lon**: hình học đơn giản, nên dùng **model tham số** (box, lathe) ở P0-10, 0 chi phí, đúng kích thước và nhãn. Image→3D dễ làm méo cổ chai, thuỷ tinh trong suốt và nhãn chữ.
- **Túi/gói mềm, hộp có hình dáng phức tạp, quà tặng**: đây mới là chỗ cần image→3D; nếp gấp và đáy túi là rủi ro chất lượng chính.
- Nhãn luôn dán lại bằng decal, nên chỉ cần hình học (chế độ không texture): rẻ hơn và tránh chữ nhãn bị AI làm hỏng.

## 4. Khuyến nghị (tạm thời, chờ đo)

1. **Chạy bake-off hai nhà trước**: **Tripo** (điều khoản trả phí rõ ràng, multiview, webhook, $0,20–0,30/lần) và **Hunyuan3D Pro Geometry/Express** (rẻ, có 1 000 credit dùng thử đủ để thử khoảng 40 lần). Giữ **Meshy** làm phương án dự phòng (mesh-only 20 credit). **Rodin** để sau vì cần gói Business và giá USD chưa xác minh.
2. **Vấn đề pháp lý cần giải quyết trước khi chọn**: ToS của Tripo và Meshy cấm cung cấp/bán lại truy cập cho người dùng cuối. AI Gateway của ta gọi hộ người dùng nên **cần văn bản cho phép hoặc hợp đồng Enterprise**, hoặc người dùng tự mang khoá. Chưa có kết luận cho Hunyuan và Rodin.
3. **Mô hình chi phí tạm**: giá/lần × (1 + tỉ lệ thử lại). Kế hoạch giả định 1–2 lần thử lại (mục 3.4); chưa có số đo.
4. Chọn 1–2 nhà qua AI Gateway theo kết quả bake-off, cache theo hash ảnh, và ghi "chưa đo" cho đến khi có số.

## 5. Quy trình đo khi có key và ảnh

1. 10 sản phẩm thật (4 chai/lọ, 3 hộp, 3 túi), mỗi sản phẩm 4 góc + kích thước mm.
2. Mỗi nhà × mỗi sản phẩm × 2–3 lần: lưu glb, thời gian gửi→tải được, mã lỗi, credit tiêu thụ.
3. Chấm theo bảng tiêu chí ở mục 1; ghi kết quả vào bảng mục 2 thay cho "chưa đo", kèm ngày và phiên bản model.
4. Biến môi trường cần có (chỉ đặt ở máy chủ AI Gateway, xem `packages/ai/.env.example`): `TRIPO_API_KEY`, `MESHY_API_KEY`, `HUNYUAN3D_SECRET_ID`/`HUNYUAN3D_SECRET_KEY`, `RODIN_API_KEY`.
