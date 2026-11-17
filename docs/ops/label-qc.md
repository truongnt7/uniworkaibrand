# QC nhãn (P0-09): SSIM + OCR + cảnh báo nghiêng

Mục tiêu: sau khi chiếu `label.png` lên chai/hộp, tự kiểm nhãn trong ảnh render có **đúng và còn đọc được** khi sản phẩm xoay 360°.

## Cách hoạt động
1. Worker (`blender-worker/label_decal/qc_grid.py`, bật bằng `qcGrid: true` trong job.json) ghi cạnh mỗi khung một file `*.grid.json`: lưới 33x17 điểm (u,v) trên nhãn -> pixel trong khung, kèm `facing` = cos(góc giữa pháp tuyến bề mặt và hướng tới camera). Cùng công thức với decal nên lưới phản ánh đúng chỗ nhãn được chiếu (kể cả phối cảnh, chai cong, mặt trước hộp).
2. App (`packages/render-core/src/qc/`, TypeScript thuần, không phụ thuộc native): giải mã PNG, "nắn phẳng" vùng nhãn trong khung theo lưới, chuẩn hóa sáng/tương phản rồi so với `label.png` bằng **SSIM** (cửa sổ 7x7, chỉ tính điểm nhìn thấy: `facing >= cos 75°`).
3. Phán quyết từng khung: `hidden` (nhãn nhìn thấy < 45%: mặt sau chai), `tilted` (nhãn nghiêng > 55° so với camera: **cảnh báo khó đọc**, không tính là lỗi dựng), `pass` / `fail` (SSIM >= 0.55, vùng so sánh >= 25%).
4. **OCR** (`tesseract` CLI, tùy chọn): chạy trên tối đa 4 khung quay thẳng về camera nhất; so chữ OCR từ khung nắn phẳng với chữ OCR từ chính `label.png` đã che cùng vùng khuất (nên chữ bị cong/cắt không bị tính oan). OCR nhãn cong ở 960x540 rất yếu nên chỉ đòi **khớp ít nhất ~1 từ trong 4** ở khung tốt nhất cả vòng xoay. Không có tesseract: bỏ qua OCR và báo `ocr: unavailable` (không giả vờ đã kiểm).
5. Sản phẩm **đạt** nếu >= 90% khung xét được (không khuất/nghiêng) đạt SSIM, có đủ khung xét được, và OCR tốt nhất đạt ngưỡng.

## Chạy
```bash
# bộ 10 sản phẩm tổng hợp (CC0) + đối chứng âm (khung của sản phẩm A so với nhãn của B phải bị từ chối)
blender -b --factory-startup --python tools/fixtures/make_qc_suite.py -- /tmp/qc-suite
node tools/qc/run-suite.mjs --suite /tmp/qc-suite --blender <blender> --out /tmp/qc-out --angles 18 --width 960 --height 540
# một sản phẩm
pnpm --filter @aps/desktop qc:label --blender <blender> --glb a.glb --label a.png --out out/qc-a --label-mode cylinder --label-width 90 --label-height 60 --label-bottom 20
```
Đầu ra: `report.json`, `contact-sheet.png` và `pair_XX_<verdict>.png` (hàng trên: nhãn gốc, hàng dưới: nhãn nắn phẳng từ khung render, vùng xám = khuất).

## Giới hạn đã biết (cần người kiểm)
- Nghiệm thu P0-09 yêu cầu **10 sản phẩm thực**; repo chỉ có bộ tổng hợp (`tools/fixtures/make_qc_suite.py`). Ngưỡng (`QC_DEFAULTS`) chỉ được hiệu chỉnh trên bộ này; cần chạy lại với ảnh/mô hình thật của đối tác và chỉnh ngưỡng.
- SSIM nhạy với bố cục nhưng kém với khác biệt chữ nhỏ cùng bố cục; vì vậy cần OCR. Với nhãn nhỏ trên chai nhỏ, nên render QC >= 1280x720 để OCR có ý nghĩa.
- Chưa mô phỏng nhãn bị che bởi vật liệu thủy tinh trong suốt/phản chiếu mạnh; kính khúc xạ có thể làm SSIM giảm và cần ngưỡng riêng.
