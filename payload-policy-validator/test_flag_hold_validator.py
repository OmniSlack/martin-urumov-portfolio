"""Tests for flag_hold_validator.py.

Run:  python3 -m unittest test_flag_hold_validator -v
"""
import hashlib
import os
import unittest

from flag_hold_validator import (AUTO_EXECUTE, EXECUTION_LOCK, HOLD, FlagHoldValidator,
                                 FlagRefused)
from payload_policy_validator import PayloadPolicyValidator

HERE = os.path.dirname(os.path.abspath(__file__))


def fresh(baseline=0.0, **kw):
    return FlagHoldValidator(initial_baseline=baseline, **kw)


class Direction(unittest.TestCase):
    def test_v3_locks_a_clean_payload_below_the_baseline(self):
        # the defect this copy exists for, pinned on the unchanged V3
        self.assertEqual(PayloadPolicyValidator().evaluate_loop(0.0, t_pred=0.2)["decision"],
                         "EXECUTION_LOCK")

    def test_clean_payload_below_the_baseline_executes(self):
        for b in (0.1, 0.2, 0.3):
            d = fresh(b).evaluate(0.0)
            self.assertEqual(d["decision"], AUTO_EXECUTE, b)
            self.assertEqual(d["reason"], "DOWNWARD_ACCEPTED")

    def test_jump_up_below_the_hard_threshold_holds_not_locks(self):
        d = fresh(0.0).evaluate(0.2)
        self.assertEqual(d["decision"], HOLD)
        self.assertTrue(d["reason"].startswith("FLAG_OPENED"))


class HardThreshold(unittest.TestCase):
    def test_at_or_above_m_lock_always_locks_whatever_the_baseline(self):
        for m in (0.35, 0.4, 0.8, 1.0):
            for b in (0.0, m, m - 0.01, 0.9):
                with self.subTest(m=m, baseline=b):
                    self.assertEqual(fresh(b).evaluate(m)["decision"], EXECUTION_LOCK)


class FlagSurvivesOrVanishes(unittest.TestCase):
    def test_flag_survives_confirmation_and_locks(self):
        v = fresh(0.0)
        self.assertEqual(v.evaluate(0.2)["decision"], HOLD)       # opened
        self.assertEqual(v.evaluate(0.21)["decision"], HOLD)      # confirmation 1/2
        d = v.evaluate(0.19)                                       # confirmation 2/2
        self.assertEqual(d["decision"], EXECUTION_LOCK)
        self.assertTrue(d["reason"].startswith("FLAG_SURVIVED"))
        # stays locked, even for a perfectly clean payload, until a human reviews it
        self.assertEqual(v.evaluate(0.0)["decision"], EXECUTION_LOCK)

    def test_flag_vanishes_after_normal_observations(self):
        v = fresh(0.0)
        v.evaluate(0.2)                                            # opened
        self.assertEqual(v.evaluate(0.01)["decision"], HOLD)       # normal 1/3
        self.assertEqual(v.evaluate(0.0)["decision"], HOLD)        # normal 2/3
        d = v.evaluate(0.02)                                       # normal 3/3
        self.assertEqual(d["decision"], AUTO_EXECUTE)
        self.assertTrue(d["reason"].startswith("FLAG_VANISHED — missing context"))
        self.assertIsNone(v.flag)

    def test_hard_threshold_while_open_confirms_the_flag(self):
        v = fresh(0.0)
        v.evaluate(0.2)
        self.assertEqual(v.evaluate(0.5)["decision"], EXECUTION_LOCK)
        self.assertEqual(v.flag["state"], "CONFIRMED")


class NoClearingUnderPressure(unittest.TestCase):
    def test_open_flag_cannot_be_cleared_on_request(self):
        v = fresh(0.0)
        v.evaluate(0.2)
        with self.assertRaises(FlagRefused):
            v.request_clear(by="operator", evidence="trust me")
        self.assertEqual(v.flag["state"], "OPEN")

    def test_repeating_the_same_request_does_not_clear_it_it_confirms_it(self):
        v = fresh(0.0)
        decisions = [v.evaluate(0.2)["decision"] for _ in range(3)]
        self.assertEqual(decisions, [HOLD, HOLD, EXECUTION_LOCK])

    def test_confirmed_flag_needs_a_named_reviewer_and_evidence(self):
        v = fresh(0.0)
        for _ in range(3):
            v.evaluate(0.2)
        with self.assertRaises(FlagRefused):
            v.request_clear(by="operator", evidence="")
        with self.assertRaises(FlagRefused):
            v.request_clear(by="", evidence="log line 42")
        v.request_clear(by="reviewer-1", evidence="upstream schema change, ticket 17")
        self.assertIsNone(v.flag)
        self.assertEqual(v.log[-1]["event"], "FLAG_CLEARED_BY_HUMAN")
        self.assertEqual(v.evaluate(0.0)["decision"], AUTO_EXECUTE)


class BaselineFrozenWhileFlagged(unittest.TestCase):
    def test_sustained_jump_cannot_normalise_itself(self):
        v = fresh(0.0)
        v.evaluate(0.2)
        before = v.baseline
        for _ in range(10):
            v.evaluate(0.2)
        self.assertEqual(v.baseline, before)
        self.assertEqual(v.flag["state"], "CONFIRMED")


class CodexAblationGrid(unittest.TestCase):
    """The grid of test_sidecar_v2_gaps.py test_08, restricted to m >= 0 (m is a
    discrepancy in [0, 1] here), one observation per fresh validator at baseline t."""

    def grid(self):
        return [(m / 100, t / 100) for m in range(0, 101, 2) for t in range(0, 101, 2)]

    def test_every_lock_on_the_grid_is_a_hard_threshold_lock(self):
        for m, t in self.grid():
            d = fresh(t).evaluate(m)["decision"]
            if d == EXECUTION_LOCK:
                self.assertGreaterEqual(m, 0.35, (m, t))
            if m >= 0.35:
                self.assertEqual(d, EXECUTION_LOCK, (m, t))

    def test_counts_against_v3(self):
        v3_locks_below = flag_holds = 0
        for m, t in self.grid():
            if m >= 0.35:
                continue
            if PayloadPolicyValidator().evaluate_loop(m, t_pred=t)["decision"] == "EXECUTION_LOCK":
                v3_locks_below += 1
            if fresh(t).evaluate(m)["decision"] == HOLD:
                flag_holds += 1
        # V3 stops sub-threshold cells at once; this copy stops none of them and
        # holds only the upward jumps for confirmation
        self.assertGreater(v3_locks_below, flag_holds)
        self.assertGreater(flag_holds, 0)


class V3Untouched(unittest.TestCase):
    def test_v3_file_is_byte_identical_to_the_published_copy(self):
        h = hashlib.sha256(open(os.path.join(HERE, "payload_policy_validator.py"), "rb").read())
        published = [l.split()[0] for l in open(os.path.join(HERE, "..", "SHA256SUMS"))
                     if l.rstrip().endswith("payload-policy-validator/payload_policy_validator.py")]
        self.assertEqual([h.hexdigest()], published)


if __name__ == "__main__":
    unittest.main()
