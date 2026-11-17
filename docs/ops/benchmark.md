# Benchmark và phân hạng máy (P0-13)

`node tools/bench/benchmark.mjs --blender <blender> --out kết_quả.json` chạy cảnh chuẩn (serum-bottle + label, 960x540, 16 mẫu) và đo: thời gian khởi động tới sự kiện đầu của worker, giây/khung của EEVEE và Cycles (thiết bị thực tế do worker báo), RAM đỉnh (`VmHWM`, Linux), phân hạng, và **độ chính xác ước lượng thời gian** (đo 3 khung đầu của job 12 khung rồi ngoại suy, so với thời gian thật).

Hạng: A = EEVEE <= 1.5 s/khung; B <= 6 s; C = chậm hơn hoặc EEVEE không chạy. Ngưỡng là đề xuất ban đầu, cần chỉnh sau khi có số liệu 5-8 máy thật.

Kết quả duy nhất hiện có (VM Linux x64 không GPU, EEVEE chạy bằng llvmpipe): `docs/ops/results/bench-linux-x64-llvmpipe.json`

| | EEVEE (llvmpipe) | Cycles (CPU) |
|---|---|---|
| s/khung (trung vị) | 6,0 | 4,7 |
| RAM đỉnh | 1820 MB | 794 MB |
| Khởi động | 0,4 s | 0,2 s |

Hạng máy này: C (EEVEE phần mềm chậm hơn Cycles CPU ở cảnh đơn giản; worker cảnh báo `CPU_FALLBACK`). Sai số ước lượng thời gian: 6,2% (mục tiêu <= 30%, mới 1 lần thử trên 1 máy, chưa đủ để kết luận "80% lần thử").

**Chưa kiểm chứng**: Windows Intel iGPU/NVIDIA/AMD, Mac M-series, Mac Intel, EEVEE `-b` trên iGPU/máy không có OpenGL 4.3. Cần người chạy script trên các máy này và gửi lại JSON.
