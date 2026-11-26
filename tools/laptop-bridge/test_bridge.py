"""Pure checks for bridge.py (no network, no ClipForge):  python -m unittest test_bridge"""
import datetime as dt
import unittest
from pathlib import Path

import bridge


class PureHelpers(unittest.TestCase):
    def test_shot_times_end_at_the_next_start_and_the_total(self):
        tl = {"total": 10.0, "lines": [{"start": 0.0}, {"start": 3.5}, {"start": 7.0}]}
        self.assertEqual(bridge.shot_times(tl), [(0.0, 3.5), (3.5, 7.0), (7.0, 10.0)])
        self.assertEqual(bridge.shot_times({"lines": []}), [])

    def test_nightly_quiet_window(self):
        at = lambda h, m: dt.datetime(2026, 11, 26, h, m)
        self.assertTrue(bridge.in_nightly_quiet(at(1, 0), "01:00", "01:30"))
        self.assertTrue(bridge.in_nightly_quiet(at(1, 29), "01:00", "01:30"))
        self.assertFalse(bridge.in_nightly_quiet(at(1, 30), "01:00", "01:30"))
        self.assertFalse(bridge.in_nightly_quiet(at(23, 0), "01:00", "01:30"))

    def test_only_three_argument_shapes_ever_reach_blocky(self):
        story = Path("s.json")
        self.assertEqual(bridge.build_args({"kind": "render"}, {"args": {"story": {"title": "t"}}}, story),
                         ["--story-file", "s.json"])
        self.assertEqual(bridge.build_args({"kind": "render"}, {"args": {"premise": "  In this town, x. "}}, None),
                         ["--premise", "In this town, x."])
        self.assertEqual(bridge.build_args({"kind": "revise", "notes": "slower"}, {}, story),
                         ["--story-file", "s.json", "--revise-notes", "slower"])
        self.assertEqual(bridge.build_args({"kind": "revise", "notes": "n", "withStory": True}, {}, story),
                         ["--story-file", "s.json"])
        with self.assertRaises(bridge.BridgeError):
            bridge.build_args({"kind": "render"}, {"args": {"cmd": "del *"}}, None)

    def test_narration_lists_every_shot_with_its_start(self):
        story = {"title": "T", "shots": [{"text": "One."}, {"text": "Two."}]}
        text = bridge.narration_text(story, [(0.0, 2.0), (2.0, 4.0)])
        self.assertIn("01    0.00s  One.", text)
        self.assertIn("02    2.00s  Two.", text)

    def test_configured_outbox_must_exist(self):
        self.assertIsNone(bridge.find_outbox(r"Z:\no\such\folder"))


if __name__ == "__main__":
    unittest.main()
