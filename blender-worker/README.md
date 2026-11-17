# blender-worker (GPL-3.0-or-later)

Script Python chạy **bên trong** Blender 4.5 LTS (`bpy`). Thư mục này được tách riêng khỏi app Electron
vì lý do giấy phép: script dùng API `bpy` nên được phát hành theo GPL-3.0 (quyết định D6 trong
`docs/project-context.md`; cần luật sư rà soát trước phát hành). App Electron chỉ giao tiếp với worker qua
`job.json` (vào) và **JSON-lines trên stdout** (ra) + mã thoát; không import mã của nhau.

```bash
blender -b -noaudio --factory-startup --python-exit-code 1 --python blender-worker/worker.py -- job.json
```

| File | Vai trò |
|---|---|
| `worker.py` | Điểm vào: đọc job, dựng cảnh, vòng lặp render từng khung (bỏ qua khung đã có để resume) |
| `job.py` | Kiểm tra `job.json` **v1 và v2** (bắt buộc `version`; v2 chặt: khoá lạ bị từ chối; không phụ thuộc `bpy`, có unit test) |
| `protocol.py` | Phát sự kiện JSON-lines (`log`, `device`, `progress`, `frame_done`, `warning`, `error`, `done`) |
| `gpu_setup.py` | Chọn EEVEE/Cycles + thiết bị, cảnh báo khi âm thầm chạy CPU/bộ dựng phần mềm |
| `scene/glb_import.py` | Nhập `.glb`, kiểm giới hạn, chuẩn hóa pivot/tỉ lệ (mm) |
| `scene/studio.py` | Sàn, bục, đèn 3 điểm, camera rig |
| `label_decal/decal.py` | Decal nhãn chiếu trụ/phẳng bằng node shader |
| `plan.py` | Nội suy keyframe và trạng thái cảnh theo thời gian (không bpy, có unit test); job v1 suy ra cùng cấu trúc từ `motion` |
| `motions/state.py` | Đặt xoay sản phẩm, camera (azimuth/góc nâng/khoảng cách), đèn cho từng khung |
| `scene/overlay_text.py` | Track chữ: vật thể chữ gắn camera, mờ/hiện theo thời gian |

Schema chính thức của job (`WorkerJobV1`, `WorkerJobV2`) và sự kiện nằm trong `packages/shared/src/worker-protocol.ts`. Job v2 là timeline nhiều track đã biên dịch thành keyframe số (không có mã), xem [docs/timeline-render.md](../docs/timeline-render.md).

Test phần logic không cần Blender: `python3 -m unittest discover -s blender-worker/tests -v`.
