# Lớp AI (`packages/ai`)

Cập nhật 17/11/2026. Phạm vi: mục 3 của [kế hoạch](ke-hoach-ai-blender-electron.md). Package độc lập `@aps/ai`, chỉ phụ thuộc `@aps/shared` (đọc kiểu `OutputSpec`), không sửa orchestrator, `apps/api`, renderer hay `blender-worker`.

Cách chạy: `pnpm --filter @aps/ai test` (test), `pnpm --filter @aps/ai typecheck`, `pnpm --filter @aps/ai bg:download` (tải model tách nền), `pnpm --filter @aps/ai bg:bench` (đo thời gian), `pnpm --filter @aps/ai schema:export` (xuất JSON Schema).

## 1. Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `src/provider/` | Giao diện `LlmProvider` + `GatewayProvider` (HTTP, OpenAI-compatible `POST {base}/chat/completions`) + `MockProvider` + đọc cấu hình từ biến môi trường |
| `src/timeline/` | Schema zod của timeline (`schema.ts`), chuẩn hoá đầu ra LLM (`normalize.ts`), cầu nối sang `OutputSpec` (`toRender.ts`). JSON Schema xuất ra `schema/timeline.schema.json` |
| `src/director/` | Đạo diễn AI: `rules.ts` (AI-lite offline), `llm.ts` (adapter LLM), `index.ts` (`direct()`) |
| `src/caption/` | Caption/hashtag Facebook/Instagram: mẫu offline (`template.ts`), LLM + kiểm tra (`llm.ts`), `writeCaption()` |
| `src/background/` | Tách nền local: giao diện `BackgroundRemover`, triển khai ONNX/CPU. Entry riêng `@aps/ai/background` vì cần thư viện native |
| `tests/golden/` | Golden file: 24 prompt tiếng Việt, 4 ca caption |

## 2. Đạo diễn AI

`direct(prompt, { context, provider })` trả `{ timeline, source: 'rules' | 'llm', warnings, fixes, fallbackReason? }`. Không bao giờ ném lỗi vì LLM.

- **Không sinh mã.** Đầu ra luôn là JSON theo schema `Timeline` (strict: khoá lạ bị từ chối). Mọi chuỗi tự do duy nhất là `template_id` (regex `^[a-z0-9-]{1,40}$`). Văn bản LLM chứa dấu hiệu mã (`bpy`, `import x`, `exec(`, `__x__`…) bị từ chối trước khi parse.
- **Mặc định MVP = rule-based "AI-lite"** (`directFromRules`): hàm thuần, offline, xác định. Chuẩn hoá tiếng Việt (hạ chữ, bỏ dấu), tách mệnh đề (`,` `;` "rồi", "sau đó", "và"…), nhận diện: xoay sản phẩm (`spin360`, `still`, số vòng), camera (`dolly_in`, `dolly_out`, `orbit` + số độ + ngược chiều, `static`, góc cao/thấp), tốc độ (chậm/nhanh → `speed`, `turns`, thời lượng mặc định 12 s/10 s/8 s), thời lượng ("15 giây", "7,5 giây", "nửa phút"; kẹp trong 2–60 s), tỷ lệ (dọc/Reels/TikTok = 9:16, vuông = 1:1, 4:5, ngang = 16:9), logo (đầu/cuối, góc, `fade_in`/`slide_up`), cảnh (`nature-soft`, `minimal-white`, `luxury-dark`, chỉ chọn trong `availableTemplates`), ẩn lá/bục/đạo cụ. Nhiều chuyển động camera chia đều thời lượng. Tính năng ngoài MVP (nâng sản phẩm, nhạc nền) chỉ sinh `warnings`, không bịa trường.
- **Adapter LLM** (`directWithLlm`): prompt hệ thống nêu quy tắc + JSON Schema + danh sách mẫu cảnh khả dụng; prompt người dùng đặt trong khối dữ liệu. Đầu ra → bỏ rào ```json → `normalizeTimeline` (kẹp giá trị vào giới hạn, sắp xếp, cắt chồng lấn, ép `lock_label=true`; **không sửa enum**) → zod → ràng buộc ngữ cảnh (mẫu không khả dụng đổi về `studio-soft`, bỏ logo nếu SP không có logo). Sai → thử lại 1 lần kèm lý do (đúng mục 3.2 kế hoạch) → vẫn sai hoặc provider lỗi/timeout → **fallback rule-based** và ghi `fallbackReason`.
- **Cầu nối `timelineToRenderMapping`**: chuyển timeline sang `OutputSpec` (kích thước theo tỷ lệ, fps, thời lượng, motion). `blender-worker` v0 chỉ có một chuyển động toàn đoạn nên hàm trả `warnings` (`worker_v0_single_motion`, `worker_v0_no_dolly`, …). Biên dịch đa track đầy đủ là việc của `render-core`, chưa làm ở đây.

Giới hạn đã biết của rule-based: hiểu theo từ khoá, không hiểu ngữ nghĩa phức tạp (phủ định lồng nhau, tham chiếu "như lần trước"); "xoay" + "camera" trong cùng mệnh đề được xem là camera orbit; hạn chế đã biết ở golden `orbit-reverse` (camera quay, sản phẩm mặc định xoay kèm cảnh báo). Chưa đo độ chính xác trên prompt người dùng thật, chỉ trên 24 prompt viết tay.

## 3. Caption / hashtag

`writeCaption({ channel: 'facebook' | 'instagram', brand, product, contentNote }, { provider })`.

- `brand`: tên, giọng (`friendly | luxury | youthful | expert`), xưng hô (`ban | quy_khach | anh_chi`), mức emoji, tagline, từ cấm, hashtag cố định, CTA riêng. `product`: tên, ngành, điểm nổi bật, giá, khuyến mãi (chỉ dùng dữ liệu người dùng nhập).
- **Offline (mặc định)**: mẫu theo giọng, chọn biến thể bằng hash xác định (cùng đầu vào cho cùng đầu ra), giới hạn Facebook ≤ 1200 ký tự / 2–5 hashtag, Instagram ≤ 2200 / 5–15 hashtag (hashtag giữ dấu tiếng Việt, CamelCase, loại trùng).
- **LLM** qua cùng `LlmProvider`: đầu ra phải qua kiểm tra: schema, độ dài theo kênh, từ cấm (kể cả trong hashtag), không đường link, **không có con số ngoài dữ liệu vào** (chống bịa giá/phần trăm; `360` được phép). Vi phạm → thử lại 1 lần → về mẫu offline.
- Chưa có: ngôn ngữ ngoài tiếng Việt (tham số `locale` chưa có), TikTok, ảnh bìa, đánh giá chất lượng văn phong bằng người.

## 4. Tách nền local

Giao diện: `BackgroundRemover { id, modelLicense, removeBackground(buffer|path) → { png (RGBA), mask, width, height, timings }, dispose() }`. Triển khai `OnnxBackgroundRemover` dùng `onnxruntime-node` (MIT, CPU) + `sharp` (Apache-2.0, kèm libvips LGPL-3.0-or-later dạng thư viện động) và model `.onnx` tải riêng (không commit; `bg:download` kiểm sha256).

**Chính sách pixel**: kênh RGB của PNG đầu ra giữ nguyên byte so với ảnh gốc, model chỉ tạo alpha (có test so sánh từng byte). Đây là cách giữ nhãn ở khâu 2D (xem mục 6).

Đo trên VM này (Intel Xeon, 4 vCPU, 15,6 GiB RAM, Node 22, onnxruntime-node 1.31.1, CPU, 4 luồng; trung vị 5 lần sau 1 lần chạy nóng; ảnh **tổng hợp** chai nền phẳng, 1024² và 2048²):

| Model | Giấy phép | File | Tải model | Tổng/ảnh (1024² / 2048²) | Riêng suy luận | RSS tiến trình | IoU trên ảnh tổng hợp |
|---|---|---|---|---|---|---|---|
| **u²-netp** (mặc định) | Apache-2.0 (U²-Net) | 4,4 MB | ~65 ms | **122 ms / 202 ms** | ~80 ms | ~0,7 GB | 0,965 / 0,980 |
| BiRefNet_lite | MIT | 214 MB | ~2,8 s | 5,3 s / 5,0 s | ~5 s | **~12 GB** | 0,976 / 0,984 |

Kết luận: chọn **u²-netp** làm mặc định cho CPU (nhanh, nhỏ, giấy phép dễ chịu). BiRefNet_lite chính xác hơn về nguyên tắc nhưng ở dạng ONNX này tốn ~12 GB RAM và ~5 s, không phù hợp máy văn phòng 8 GB; chỉ nên xem là tuỳ chọn "chất lượng cao" cho máy mạnh sau khi đo thêm (CoreML/DirectML, bản fp16/quantized chưa thử).

**Chưa đo / chưa làm**: chất lượng trên ảnh sản phẩm thật (chai thuỷ tinh trong suốt, kim loại phản chiếu, nền lộn xộn); IoU ở bảng chỉ chứng minh pipeline cơ học đúng, không phải chất lượng thực tế. Chưa thử Windows/macOS, DirectML/CoreML, máy 2–4 lõi. Chưa đóng gói: `onnxruntime-node` kèm sẵn binary cả 3 hệ điều hành (~294 MB trong `node_modules`), cần loại bớt theo nền tảng khi `electron-builder`; chưa chạy trong `utilityProcess`. Chưa xử lý mép (feather, khử viền nền). BRIA RMBG bị loại vì giấy phép phi thương mại (khớp mục 3.1 kế hoạch).

## 5. Cấu hình (biến môi trường)

Mẫu ở `packages/ai/.env.example` (không có giá trị thật; `.env` đã nằm trong `.gitignore`).

| Biến | Ý nghĩa |
|---|---|
| `APS_AI_BASE_URL`, `APS_AI_API_KEY`, `APS_AI_MODEL` | Endpoint OpenAI-compatible (AI Gateway của ta), khoá/token và model. Thiếu một trong ba → chạy offline |
| `APS_AI_MODEL_DIRECTOR`, `APS_AI_MODEL_CAPTION` | Model riêng theo tác vụ (tuỳ chọn) |
| `APS_AI_TIMEOUT_MS` | Mặc định 20 000 |
| `APS_AI_MODE` | `auto` (mặc định) hoặc `rules` (ép offline kể cả khi có khoá) |
| `APS_BG_MODEL_PATH`, `APS_BG_THREADS` | Đường dẫn model tách nền; số luồng CPU |
| `TRIPO_API_KEY`, `MESHY_API_KEY`, `HUNYUAN3D_SECRET_ID/KEY`, `RODIN_API_KEY` | Image→3D, **chỉ ở máy chủ AI Gateway**, chưa có code dùng (xem [so sánh image→3D](image-to-3d-comparison.md)) |

Nguyên tắc: khoá nhà cung cấp không nằm trong app desktop (mục 2.2 kế hoạch); app chỉ giữ token workspace do Gateway cấp. Lỗi HTTP không đưa thân phản hồi vào thông điệp lỗi để tránh lộ khoá/nội dung. Chưa có: lưu token bằng `safeStorage`, đo credit, cache theo hash (thuộc AI Gateway ở backend).

**Kiểm chứng**: adapter HTTP được test với server giả cục bộ (định dạng request, Bearer, timeout, lỗi 500, phản hồi hỏng, fallback). **Chưa gọi LLM thật** vì chưa có khoá; chất lượng/độ trễ/chi phí LLM thật chưa đo (số trong mục 3.4 kế hoạch vẫn là ước lượng).

## 6. Chính sách giữ nhãn (AI không sinh lại pixel sản phẩm)

Áp dụng cho mọi tính năng trong lớp AI và các tích hợp sau này:

1. **AI chỉ quyết định tham số, không chạm vào pixel sản phẩm.** Đạo diễn AI xuất timeline; LLM không viết `bpy`. Pixel nhãn/logo đến từ `label.png`/`logo.png` gốc của người dùng (decal trong Blender, logo overlay bằng ffmpeg).
2. **`lock_label` luôn `true`.** Schema mặc định `true`; chuẩn hoá đầu ra LLM ép về `true` và ghi vào `fixes`; rule-based bỏ qua yêu cầu "bỏ/đổi nhãn" và trả cảnh báo `label_locked`. Tắt giữ nhãn chỉ có thể do người dùng thao tác trong UI, không do AI.
3. **Tách nền không sinh lại ảnh**: chỉ tạo alpha, RGB giữ nguyên (có test). AI sinh nền/bối cảnh chỉ được ghép **phía sau** sản phẩm đã tách; chỉnh sửa ảnh sinh tạo cả khung (image edit) bị tắt khi "Giữ nguyên nhãn" bật (mục 3.3 kế hoạch).
4. **Image→3D chỉ cung cấp hình học.** Texture do AI sinh sẽ làm méo/mờ chữ nhãn, nên dùng chế độ chỉ hình học (không texture) và gán nhãn bằng decal; vật liệu thuỷ tinh/nhựa lấy từ thư viện (mục 7.1 kế hoạch).
5. **Caption không bịa**: chỉ dùng dữ liệu sản phẩm do người dùng nhập; con số/đường link/từ cấm ngoài dữ liệu bị chặn.
6. **QC sau render** (SSIM + OCR nhãn, mục 3.3 kế hoạch, P0-09) vẫn là lớp bảo đảm cuối; chưa thuộc phạm vi phần này.

## 7. Việc chưa làm / cần quyết định

- Khoá LLM thật để đo chất lượng/độ trễ Đạo diễn AI và caption (mục 5), chọn nhà cung cấp LLM cho Gateway.
- Danh sách `template_id` thật từ Kho mẫu (hiện giả định `studio-soft`, `nature-soft`, `minimal-white`, `luxury-dark`; `@aps/shared` hiện mới có `studio-soft`).
- Biên dịch timeline đa track → job (`render-core`) và hỗ trợ dolly/nhiều đoạn trong worker.
- Ảnh sản phẩm thật (10 SP, nhiều góc) để đánh giá tách nền và image→3D.
- Xác nhận pháp lý trước khi bán lại dịch vụ image→3D qua Gateway (xem tài liệu so sánh).
