# Timeline → render Blender → mp4

Cập nhật 17/11/2026. Nối **Đạo diễn AI** ([ai-layer.md](ai-layer.md)) với **blender-worker** của PoC. Nhánh `mvp/timeline-render` (từ `mvp/ai-layer`, đã merge `phase0/poc-core`).

## 1. Luồng

```
prompt tiếng Việt
  └─ IPC jobs:createFromPrompt (renderer → main → orchestrator/utilityProcess)
       ├─ direct()                       @aps/ai: LLM (nếu có APS_AI_*) hoặc rule-based; luôn ra Timeline đã validate
       ├─ compileTimelineJob()           @aps/render-core: Timeline → job.json v2 (keyframe số, tất định)
       ├─ blender-worker (job v2)        dựng cảnh từ keyframe, decal nhãn, render PNG từng khung (EEVEE/Cycles)
       └─ ffmpeg LGPL                    PNG → H.264 yuv420p + faststart, overlay logo theo timeline
```

**Không có bpy từ LLM.** LLM chỉ được trả JSON theo schema `Timeline` (strict, từ chối khoá lạ và văn bản có dấu hiệu mã). Compiler chỉ sinh số (keyframe) và enum; worker là mã cố định trong repo, nhận job qua schema chặt ở **cả hai phía** (zod ở `@aps/shared`, Python ở `blender-worker/job.py`). Đã test: job có khoá lạ (`script`, `exec`) bị cả hai phía từ chối.

Khoá LLM chỉ được đọc trong orchestrator (`createProviderFromEnv`). Phản hồi IPC chỉ có `source`, `warnings`, `fixes`, `fallbackReason`; test `timeline-render.test.ts` kiểm khoá không xuất hiện trong phản hồi, `job.json`, nhật ký, danh sách job kể cả khi gọi LLM lỗi.

## 2. job.json có version

| `version` | Nội dung | Dùng cho |
|---|---|---|
| 1 | Một chuyển động toàn đoạn (`motion`: `orbit`/`spin360`, `frames.angle*`) | Ảnh, turntable PoC (`compileWorkerJob`), smoke test |
| 2 | `tracks` keyframe + `overlays` + `scene.hide` + `product.lockLabel` | Video từ timeline (`compileTimelineJob`) |

`WorkerJob` (zod) là `discriminatedUnion('version')`; version thiếu/lạ → từ chối (`INVALID_JOB`). Đổi schema phải đổi version. Test chéo: `packages/render-core/tests/timeline.test.ts` ghi `blender-worker/tests/fixtures/job-v2.golden.json` từ compiler thật (đặt `UPDATE_GOLDEN=1` để ghi lại), `blender-worker/tests/test_plan.py` đọc đúng file đó qua `job.validate` và đánh giá giá trị theo thời gian.

Job v2 (đầy đủ ở `packages/shared/src/worker-protocol.ts`):

- `tracks.product.rotZDeg`; `tracks.camera.{azimuthDeg, elevationDeg, distanceScale}`; `tracks.light.{keyScale, fillScale, rimScale, keyAzimuthDeg}`: mỗi track là danh sách `{t (giây), v, ease}`; `ease` áp cho đoạn từ keyframe đó tới keyframe kế; ngoài khoảng thì giữ giá trị.
- `scene`: `template`, `backgroundColor`, `shadow`, `hide` (`platform`).
- `overlays.logo[]` (ffmpeg) và `overlays.text[]` (Blender).
- `frames: { total, fps }`, khung `n` ứng với `t = (n-1)/fps`.

## 3. Timeline → track

| Track của timeline | Biên dịch thành |
|---|---|
| `product` `spin360` | `rotZDeg` cộng `360 × turns` trong đoạn; `still` giữ góc. `speed` đã được Đạo diễn quy đổi thành `turns`/thời lượng nên không áp lần hai |
| `camera` `orbit` | `azimuthDeg` cộng dồn `degrees` (âm = ngược chiều) |
| `camera` `dolly_in/out` | `distanceScale` nhân `(1 − amount)` / `(1 + amount)`, kẹp [0,35; 2,5] |
| `camera.from` | `elevationDeg`: `eye_level` 11°, `high` 35°, `low` 2°. Đoạn liền nhau đổi góc = cắt cảnh; có khoảng trống = chuyển mượt |
| `scene.template_id` + `palette` | `backgroundColor`, `shadow`, hệ số đèn (bảng `TEMPLATE_STYLES`). `luxury-dark` quét đèn chính ±15° suốt video. Mẫu lạ → `studio-soft` + cảnh báo `scene_template_unsupported` |
| `scene.hide` | `platform` → ẩn bục; `leaves`/`props` chưa có trong worker → cảnh báo `scene_hide_unsupported` |
| `logo` | `overlays.logo` (cần `logoPath`, thiếu → cảnh báo `logo_missing`) |
| `lock_label` | `product.lockLabel`; nhãn luôn là decal từ ảnh gốc (không có đường nào bỏ nhãn) |

Hai track mà **Đạo diễn AI chưa sinh** nhưng job/compiler đã hỗ trợ, đi qua `RenderRequest.extras` (do UI/người dùng, không do LLM): `text` (chữ, font Inter đi kèm Blender, hỗ trợ tiếng Việt) và `lights` (đoạn đổi hệ số đèn / góc đèn chính).

## 4. Giữ nhãn

Nhãn là decal chiếu từ `label.png` gốc (`label_decal/decal.py`), chạy cho cả job v1 và v2; compiler không đụng tới `product.label`. Logo overlay do ffmpeg ghép ngoài shading 3D. Worker ghi log `decal nhãn (...)` và `job v2: ... giữ nhãn (decal)`; E2E kiểm các dòng này. QC SSIM/OCR sau render (P0-09) vẫn là lớp bảo đảm cuối và chưa chạy trên video timeline.

## 5. Chạy

```bash
pnpm install
node tools/ffmpeg/fetch-lgpl.mjs                      # in đường dẫn ffmpeg LGPL (đặt APS_FFMPEG / APS_TEST_FFMPEG_LGPL)
pnpm poc:render prompt "Xoay chai chậm, camera tiến gần rồi quay quanh 90 độ, cuối video hiện logo" \
  --glb assets/samples/serum-bottle.glb --label assets/samples/label.png --logo assets/samples/logo.png \
  --width 640 --height 360 --fps 15 --samples 16 --out out/ai.mp4      # cần APS_BLENDER_BIN, APS_FFMPEG

pnpm test                                             # unit + Blender giả
python3 -m unittest discover -s blender-worker/tests -v
# E2E Blender thật (EEVEE), cần Xvfb khi không có màn hình/GPU:
APS_TEST_BLENDER=<blender> APS_TEST_FFMPEG_LGPL=<ffmpeg> xvfb-run -a pnpm --filter @aps/desktop exec vitest run tests/timeline-render.test.ts
# E2E Electron thật (build trước):
pnpm --filter @aps/desktop build
xvfb-run -a env APS_BLENDER_BIN=<blender> APS_FFMPEG=<ffmpeg> pnpm --filter @aps/desktop e2e:timeline
```

Không có khoá LLM thì Đạo diễn chạy rule-based offline (`APS_AI_MODE=rules` ép offline).

## 6. Đã kiểm chứng (VM Linux x64, 4 vCPU, không GPU, Blender 4.5.16, EEVEE trên llvmpipe)

| Kiểm | Kết quả |
|---|---|
| Unit compiler timeline (`render-core`) | 20 test: spin/still, orbit ngược chiều, dolly kẹp, cắt cảnh góc nâng, đèn, palette/mẫu lạ, logo/chữ, nhãn, 24 prompt golden của Đạo diễn đều biên dịch được, đầu vào xấu → `INVALID_TIMELINE` |
| Python (`blender-worker/tests`) | 22 test (không cần bpy): job v1/v2, version, khoá lạ, keyframe, nội suy, trạng thái chữ |
| Orchestrator + Blender **giả** + ffmpeg LGPL thật | prompt → job v2 → mp4 H.264 yuv420p đúng số khung; logo chỉ hiện đúng khoảng thời gian (so điểm ảnh); LLM trả mã bpy → bị từ chối, fallback; timeline LLM hợp lệ được dùng; khoá không lọt; timeline sai bị từ chối ngay |
| **Blender thật** qua orchestrator (vitest) | video 2 s, 256×144, 30 khung, ~54 s; decal nhãn được áp; chữ đỏ chỉ có ở khung trong khoảng thời gian; sản phẩm/camera đổi giữa các khung |
| **Electron thật** (`e2e:timeline`) | IPC `jobs:createFromPrompt` → mp4 `h264,256,144,yuv420p,30` ~43 s |
| CLI `poc:render prompt` | 4 s, 640×360, 60 khung, 16 mẫu: ~4 phút 40 giây trên CPU; nhìn trực tiếp montage khung: nền tối, dolly + orbit, nhãn đọc được, logo cuối |

## 7. Giới hạn / chưa làm

- UI cho prompt: có mục gập "Video sản phẩm 3D (nâng cao)" trong màn hình "Tạo video" (nhánh `mvp/app-create-flow`) gọi `jobs:createFromPrompt` (có trường `target`; cloud chỉ lưu chỗ, chưa chạy). Chưa có UI sửa timeline/chữ/ánh sáng. Job Blender và job ảnh sang video (`pipeline: slideshow`) dùng chung hàng đợi SQLite; xem [industry-templates.md](industry-templates.md) mục 2.6.
- Chưa gọi LLM thật (chưa có khoá): đường LLM được test bằng `MockProvider` và server giả.
- Mẫu cảnh `nature-soft`, `minimal-white`, `luxury-dark` hiện chỉ khác **màu nền, độ bóng đổ, hệ số đèn**; chưa có lá/đạo cụ/HDRI thật (chờ Kho mẫu). `leaves`/`props` bị bỏ qua có cảnh báo.
- Chữ overlay dựng bằng vật thể chữ Blender (phụ thuộc font Inter đi kèm Blender; font thiếu thì dùng font mặc định, mất dấu tiếng Việt). Chưa kiểm ở độ phân giải thật (chỉ 256×144 và 640×360) và chưa có tuỳ chọn font.
- Dolly + orbit dùng quỹ đạo quanh trục sản phẩm, đèn chính/phụ gắn theo azimuth camera nên phản xạ không đổi theo orbit (giống PoC); đèn không theo góc nâng.
- Cắt cảnh giữa hai đoạn camera liền nhau là nhảy tức thì (chưa có chuyển cảnh mềm).
- Timeline chỉ cho video; ảnh tĩnh vẫn dùng job v1. `timelineToRenderMapping` trong `@aps/ai` còn cảnh báo kiểu "worker v0" (đã lỗi thời, không còn dùng ở đường này; chưa sửa để không đụng `packages/ai`).
- Resume sau crash dùng lại khung đã có (như PoC); nếu đổi timeline giữa các lần chạy lại thì khung cũ không được render lại (job lưu `timeline` trong request nên thử lại dùng cùng timeline).
- Chưa chạy trên Windows/macOS/GPU thật; CI mặc định không chạy E2E Blender thật (cần tải ~380 MB).
