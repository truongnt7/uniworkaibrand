# SPDX-License-Identifier: GPL-3.0-or-later
import copy
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import job  # noqa: E402
from protocol import WorkerError  # noqa: E402

VALID = {
    "version": 1,
    "mode": "render",
    "jobId": "j1",
    "product": {"glbPath": "/tmp/a.glb", "label": {"imagePath": "/tmp/l.png", "mode": "cylinder"}},
    "scene": {"template": "studio-soft", "backgroundColor": "#e9e4dc", "shadow": 0.7},
    "motion": "orbit",
    "render": {"engine": "eevee", "samples": 8, "width": 320, "height": 180, "device": "auto"},
    "frames": {"total": 4, "angleStartDeg": 0, "angleSpanDeg": 360},
    "paths": {"framesDir": "/tmp/frames", "pattern": "frame_%06d.png"},
}


class JobValidation(unittest.TestCase):
    def test_valid_job_gets_default_limits(self):
        out = job.validate(copy.deepcopy(VALID))
        self.assertEqual(out["limits"]["maxTriangles"], 2_000_000)

    def test_rejects_bad_engine(self):
        bad = copy.deepcopy(VALID)
        bad["render"]["engine"] = "luxcore"
        with self.assertRaises(WorkerError) as ctx:
            job.validate(bad)
        self.assertEqual(ctx.exception.code, "INVALID_JOB")

    def test_rejects_missing_glb_in_render_mode(self):
        bad = copy.deepcopy(VALID)
        del bad["product"]
        with self.assertRaises(WorkerError):
            job.validate(bad)

    def test_smoke_mode_needs_no_product(self):
        smoke = copy.deepcopy(VALID)
        smoke["mode"] = "smoke"
        del smoke["product"]
        job.validate(smoke)

    def test_color_parsing(self):
        self.assertEqual(job.parse_hex_color("#ff0000"), (1.0, 0.0, 0.0))
        with self.assertRaises(WorkerError):
            job.parse_hex_color("red")

    def test_frame_angle_loops_seamlessly(self):
        j = job.validate(copy.deepcopy(VALID))
        angles = [job.frame_angle(j, i) for i in range(1, 5)]
        self.assertEqual(angles, [0, 90, 180, 270])  # khung cuối chưa chạm 360 -> lặp liền mạch

    def test_frame_path(self):
        j = job.validate(copy.deepcopy(VALID))
        self.assertTrue(job.frame_path(j, 7).endswith("frame_000007.png"))


if __name__ == "__main__":
    unittest.main()
