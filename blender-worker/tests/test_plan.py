# SPDX-License-Identifier: GPL-3.0-or-later
"""Job v2 và đánh giá timeline (không cần bpy). Fixture `job-v2.golden.json` do test TypeScript của
packages/render-core ghi ra từ compiler thật, nên test này kiểm tra chéo schema zod <-> validate Python."""
import copy
import json
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import job  # noqa: E402
import plan  # noqa: E402
from protocol import WorkerError  # noqa: E402

GOLDEN = os.path.join(os.path.dirname(__file__), "fixtures", "job-v2.golden.json")


def golden():
    with open(GOLDEN, "r", encoding="utf-8") as fh:
        return json.load(fh)


class JobV2Validation(unittest.TestCase):
    def test_golden_from_typescript_compiler_is_valid(self):
        out = job.validate(golden())
        self.assertEqual(out["version"], 2)
        self.assertTrue(out["product"]["lockLabel"])
        self.assertEqual(out["limits"]["maxTriangles"], 2_000_000)
        self.assertEqual(out["overlays"]["text"][0]["text"], "Dịu nhẹ cho làn da")

    def test_unknown_version_rejected(self):
        for v in (0, 3, "2", None, True):
            bad = golden()
            bad["version"] = v
            with self.assertRaises(WorkerError) as ctx:
                job.validate(bad)
            self.assertEqual(ctx.exception.code, "INVALID_JOB")

    def test_missing_version_rejected(self):
        bad = golden()
        del bad["version"]
        with self.assertRaises(WorkerError):
            job.validate(bad)

    def test_unknown_keys_rejected_so_code_cannot_ride_along(self):
        bad = golden()
        bad["script"] = "import bpy"
        with self.assertRaises(WorkerError):
            job.validate(bad)
        bad = golden()
        bad["tracks"]["camera"]["exec"] = []
        with self.assertRaises(WorkerError):
            job.validate(bad)

    def test_keyframes_must_increase_and_use_known_ease(self):
        bad = golden()
        bad["tracks"]["product"]["rotZDeg"] = [{"t": 1, "v": 0}, {"t": 1, "v": 5}]
        with self.assertRaises(WorkerError):
            job.validate(bad)
        bad = golden()
        bad["tracks"]["product"]["rotZDeg"][0]["ease"] = "bounce"
        with self.assertRaises(WorkerError):
            job.validate(bad)
        bad = golden()
        bad["tracks"]["product"]["rotZDeg"] = []
        with self.assertRaises(WorkerError):
            job.validate(bad)

    def test_bad_template_hide_and_overlay(self):
        for mutate in (
            lambda j: j["scene"].__setitem__("template", "tet-holiday"),
            lambda j: j["scene"].__setitem__("hide", ["leaves"]),
            lambda j: j["overlays"]["text"][0].__setitem__("tEnd", 0.1),
            lambda j: j["overlays"]["text"][0].__setitem__("text", "  "),
            lambda j: j["overlays"]["logo"].append({"t": 0, "tEnd": 1, "imagePath": "x", "position": "left"}),
            lambda j: j.__setitem__("mode", "smoke"),
            lambda j: j["frames"].__setitem__("fps", 0),
        ):
            bad = golden()
            mutate(bad)
            with self.assertRaises(WorkerError):
                job.validate(bad)

    def test_v1_still_accepted(self):
        v1 = {
            "version": 1,
            "mode": "render",
            "jobId": "j1",
            "product": {"glbPath": "/tmp/a.glb"},
            "scene": {"template": "studio-soft", "backgroundColor": "#e9e4dc", "shadow": 0.7},
            "motion": "spin360",
            "render": {"engine": "eevee", "samples": 8, "width": 320, "height": 180, "device": "auto"},
            "frames": {"total": 4, "angleStartDeg": 0, "angleSpanDeg": 360},
            "paths": {"framesDir": "/tmp/frames"},
        }
        self.assertEqual(job.validate(copy.deepcopy(v1))["version"], 1)


class PlanEvaluation(unittest.TestCase):
    def setUp(self):
        self.job = job.validate(golden())

    def test_ease_endpoints_and_monotonic(self):
        for name in job.EASES:
            self.assertAlmostEqual(plan.ease(name, 0), 0)
            self.assertAlmostEqual(plan.ease(name, 1), 1)
            vals = [plan.ease(name, i / 20) for i in range(21)]
            self.assertEqual(vals, sorted(vals))

    def test_eval_track_holds_outside_and_interpolates(self):
        track = [{"t": 1.0, "v": 10.0, "ease": "linear"}, {"t": 3.0, "v": 30.0, "ease": "linear"}]
        self.assertEqual(plan.eval_track(track, 0), 10)
        self.assertEqual(plan.eval_track(track, 2), 20)
        self.assertEqual(plan.eval_track(track, 9), 30)

    def test_golden_product_spin_is_one_turn_over_duration(self):
        total = self.job["frames"]["total"]
        self.assertEqual(total, 60)
        self.assertAlmostEqual(plan.state_at(self.job, 1)["product_rot_deg"], 0)
        self.assertAlmostEqual(plan.state_at(self.job, 31)["product_rot_deg"], 180, places=3)
        self.assertAlmostEqual(plan.duration_s(self.job), 4.0)

    def test_golden_camera_dolly_then_orbit_with_cut_to_high_angle(self):
        s_mid = plan.state_at(self.job, 16)  # t = 1,0 s: giữa đoạn dolly_in 0..2 s (linear, amount 0,2)
        self.assertAlmostEqual(s_mid["cam_distance_scale"], 0.9, places=3)
        self.assertAlmostEqual(s_mid["cam_elevation_deg"], 11)
        s_end = plan.state_at(self.job, 60)  # t = 3,93 s: gần cuối orbit 90 độ
        self.assertGreater(s_end["cam_azimuth_deg"], 80)
        self.assertAlmostEqual(s_end["cam_distance_scale"], 0.8, places=3)
        self.assertAlmostEqual(s_end["cam_elevation_deg"], 35)

    def test_golden_lights_sweep_and_rim_pulse(self):
        first, last = plan.state_at(self.job, 1), plan.state_at(self.job, 60)
        self.assertAlmostEqual(first["key_azimuth_deg"], -15, places=3)
        self.assertGreater(last["key_azimuth_deg"], 13)
        s = plan.state_at(self.job, 23)  # t = 1,467 s trong xung viền 1..2 s
        self.assertGreater(s["rim_scale"], 1.6)

    def test_text_state_fade_and_slide(self):
        ov = {"t": 1.0, "tEnd": 3.0, "anim": "slide_up"}
        self.assertEqual(plan.text_state(ov, 0.5), (0.0, 0.0))
        self.assertEqual(plan.text_state(ov, 3.5), (0.0, 0.0))
        a, slide = plan.text_state(ov, 1.25)
        self.assertAlmostEqual(a, 0.5)
        self.assertAlmostEqual(slide, 0.5)
        a, slide = plan.text_state(ov, 2.0)
        self.assertEqual((a, slide), (1.0, 0.0))
        self.assertEqual(plan.text_state({"t": 0, "tEnd": 1, "anim": "none"}, 0.0), (1.0, 0.0))
        a, _ = plan.text_state(ov, 2.95)
        self.assertLess(a, 0.5)

    def test_v1_state_matches_turntable(self):
        v1 = job.validate(
            {
                "version": 1,
                "mode": "render",
                "jobId": "j",
                "product": {"glbPath": "/tmp/a.glb"},
                "scene": {"template": "studio-soft", "backgroundColor": "#e9e4dc", "shadow": 0.7},
                "motion": "orbit",
                "render": {"engine": "eevee", "samples": 8, "width": 320, "height": 180, "device": "auto"},
                "frames": {"total": 4, "angleStartDeg": 0, "angleSpanDeg": 360},
                "paths": {"framesDir": "/tmp/frames"},
            }
        )
        self.assertEqual([plan.state_at(v1, i)["cam_azimuth_deg"] for i in range(1, 5)], [0, 90, 180, 270])
        self.assertEqual(plan.state_at(v1, 3)["product_rot_deg"], 0)
        v1["motion"] = "spin360"
        self.assertEqual(plan.state_at(v1, 3)["product_rot_deg"], 180)
        self.assertEqual(plan.state_at(v1, 3)["cam_elevation_deg"], plan.DEFAULT_ELEVATION_DEG)

    def test_camera_offset_matches_studio_default(self):
        x, y, z = plan.camera_offset(1.0, 11.0, 1.0)
        self.assertAlmostEqual(math.hypot(y, z), 1.0)
        self.assertEqual(x, 0.0)
        self.assertLess(y, 0)
        self.assertAlmostEqual(plan.camera_offset(2.0, 0.0, 0.5)[1], -1.0)


if __name__ == "__main__":
    unittest.main()
