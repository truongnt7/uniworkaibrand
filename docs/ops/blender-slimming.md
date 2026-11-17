# Rút gọn Blender (P0-08): số liệu

`node tools/runtime/slim-blender.mjs --src <blender> --dst <đích>` xóa theo danh sách tường minh (locale, studiolights, template, add-on không dùng như rigify/FBX/SVG/VR, Cython, static libpython, ...). Không đụng `cycles`, `io_scene_gltf2`, thư viện GPU, `license/`, `copyright.txt`.

Đo trên Blender 4.5.16 linux-x64:

| | Đầy đủ | Rút gọn | Giảm |
|---|---|---|---|
| Giải nén | 1112 MB | 963 MB | 149 MB (13,4%) |
| Nén `tar | xz -3` | 406,5 MB | 370,7 MB | 35,9 MB (8,8%) |

So ảnh `apps/desktop/scripts/compare-slim.mts` (EEVEE + Cycles, 3 góc, cảnh chuẩn): **6/6 ảnh giống hệt từng điểm ảnh** (sai khác 0, SSIM 1). Kết quả: `docs/ops/results/blender-slim-compare.json`.

Kết luận/đề xuất: lợi ích khi tải chỉ ~9% (36 MB), trong khi bản rút gọn là artifact do mình đóng lại (phải tự host + ký manifest riêng, vẫn phải kèm giấy phép GPL/nguồn). Phần lớn dung lượng còn lại là thư viện GPU (HIP/oneAPI/OIDN...), USD, mesa: đều phụ thuộc phần cứng người dùng nên **không** xóa khi chưa có benchmark từng máy. Khuyến nghị: chưa áp dụng rút gọn vào gói phát hành ở Phase 0; xem lại khi có số liệu đa máy (P0-13). Chưa nối script này vào `pack-runtime.mjs`.

Chưa kiểm chứng: Windows/macOS (cấu trúc thư mục khác, danh sách xóa chỉ áp cho Linux).
