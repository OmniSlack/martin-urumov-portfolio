"""
Closure tests for sidecar_validator_v3.

Every test here targets ONE named counterexample from the two audit reports.
Each is also run against v2 at the bottom to prove the test can fail — a suite
where nothing can fail proves nothing.
"""
from datetime import datetime, timedelta, timezone
import math
import unittest

from sidecar_validator_v3 import (
    SidecarValidatorV3, ExecutionControl, HumanPermit, Decision,
    VALIDATION_PASS, EXECUTION_LOCK, VALIDATION_HOLD, RELEASE_TO_ADAPTER,
)

NOW = datetime(2026, 9, 15, 12, 0, tzinfo=timezone.utc)


def good_permit(target="doc-1", action="write", scope="project-a"):
    return HumanPermit(target=target, action=action, scope=scope,
                       granted_by="martin", expires_at=NOW + timedelta(hours=1))


class TestAuthorityLeakClosed(unittest.TestCase):
    """Audit finding: Decision.allowed / AUTO_EXECUTE let the validator issue authority."""

    def test_no_execute_shaped_value_exists_in_sidecar_vocabulary(self):
        v = SidecarValidatorV3()
        d = v.validate(m=0.0)
        self.assertEqual(d.decision, VALIDATION_PASS)
        self.assertNotIn("EXECUTE", d.decision)
        self.assertNotIn("AUTO", d.decision)

    def test_decision_has_no_allowed_attribute(self):
        d = SidecarValidatorV3().validate(m=0.0)
        self.assertFalse(hasattr(d, "allowed"))
        self.assertFalse(hasattr(d, "execute"))
        self.assertTrue(hasattr(d, "passed"))

    def test_clean_validation_alone_does_not_release(self):
        """Good mathematics + no permit MUST still lock."""
        ec = ExecutionControl(SidecarValidatorV3())
        r = ec.request(target="doc-1", action="write", scope="project-a",
                       m=0.0, payload={"op": "noop"}, permit=None, now=NOW)
        self.assertEqual(r.decision, EXECUTION_LOCK)
        self.assertIn("no_valid_human_permit", r.reasons)
        self.assertTrue(r.validation.passed)   # math was fine; authority was not


class TestFailOpenPathsClosed(unittest.TestCase):

    def test_disabled_sidecar_holds_it_does_not_pass(self):
        """v2 returned AUTO_EXECUTE when disabled. A disabled check is UNKNOWN."""
        d = SidecarValidatorV3(enabled=False).validate(m=99.0)
        self.assertEqual(d.decision, VALIDATION_HOLD)
        self.assertFalse(d.passed)

    def test_disabled_sidecar_cannot_release_even_with_valid_permit(self):
        ec = ExecutionControl(SidecarValidatorV3(enabled=False))
        r = ec.request(target="doc-1", action="write", scope="project-a",
                       permit=good_permit(), now=NOW)
        self.assertEqual(r.decision, EXECUTION_LOCK)

    def test_nan_magnitude_is_blocked(self):
        """abs(nan) >= t is False in IEEE-754, so v2 passed NaN as 'no violation'."""
        d = SidecarValidatorV3().validate(m=float("nan"))
        self.assertEqual(d.decision, EXECUTION_LOCK)
        self.assertTrue(any("not_finite" in r for r in d.reasons))

    def test_infinite_magnitude_is_blocked(self):
        for bad in (float("inf"), float("-inf")):
            with self.subTest(m=bad):
                d = SidecarValidatorV3().validate(m=bad)
                self.assertEqual(d.decision, EXECUTION_LOCK)

    def test_non_numeric_magnitude_is_blocked(self):
        for bad in ("0.1", None, [], {}, True):
            with self.subTest(m=bad):
                d = SidecarValidatorV3().validate(m=bad)
                self.assertEqual(d.decision, EXECUTION_LOCK)

    def test_truthy_string_cannot_stand_in_for_a_permit(self):
        """v2: authorized="false" and authorized=1 were both truthy -> allowed."""
        ec = ExecutionControl(SidecarValidatorV3())
        for fake in ("false", "true", 1, 0.0001, [1], object()):
            with self.subTest(permit=repr(fake)):
                r = ec.request(target="doc-1", action="write", scope="project-a",
                               permit=fake, now=NOW)
                self.assertEqual(r.decision, EXECUTION_LOCK)
                self.assertIn("no_valid_human_permit", r.reasons)


class TestKeywordMatchingBothDirections(unittest.TestCase):

    def test_dropdown_is_not_a_false_positive(self):
        d = SidecarValidatorV3().validate(m=0.0, payload={"ui": "dropdown menu"})
        self.assertEqual(d.decision, VALIDATION_PASS, d.reasons)

    def test_spaced_out_keyword_is_caught(self):
        for variant in ("d e l e t e", "d-e-l-e-t-e", "d.e.l.e.t.e", "D E L E T E"):
            with self.subTest(variant=variant):
                d = SidecarValidatorV3().validate(m=0.0, payload={"op": variant})
                self.assertEqual(d.decision, EXECUTION_LOCK,
                                 f"{variant!r} bypassed the keyword gate")

    def test_plain_keyword_still_caught_any_case(self):
        for variant in ("delete", "DELETE", "DeLeTe"):
            with self.subTest(variant=variant):
                d = SidecarValidatorV3().validate(m=0.0, payload={"op": variant})
                self.assertEqual(d.decision, EXECUTION_LOCK)


class TestRequiredFields(unittest.TestCase):

    def test_none_payload_does_not_skip_required_fields(self):
        """v2 only checked required_fields when payload was a dict."""
        v = SidecarValidatorV3(required_fields=("request_id",))
        d = v.validate(m=0.0, payload=None)
        self.assertEqual(d.decision, EXECUTION_LOCK)

    def test_string_payload_does_not_skip_required_fields(self):
        v = SidecarValidatorV3(required_fields=("request_id",))
        d = v.validate(m=0.0, payload="request_id")   # substring, not a field
        self.assertEqual(d.decision, EXECUTION_LOCK)

    def test_present_fields_pass(self):
        v = SidecarValidatorV3(required_fields=("request_id",))
        d = v.validate(m=0.0, payload={"request_id": "abc"})
        self.assertEqual(d.decision, VALIDATION_PASS, d.reasons)


class TestConfigValidation(unittest.TestCase):

    def test_bad_thresholds_are_refused_at_construction(self):
        for bad in (float("nan"), float("inf"), 0, -1, "0.35", None, True):
            with self.subTest(threshold=repr(bad)):
                with self.assertRaises(ValueError):
                    SidecarValidatorV3(hard_threshold=bad)

    def test_string_keyword_list_is_refused(self):
        with self.assertRaises(ValueError):
            SidecarValidatorV3(risky_keywords="delete")


class TestPermitIsBounded(unittest.TestCase):

    def test_expired_permit_locks(self):
        ec = ExecutionControl(SidecarValidatorV3())
        stale = HumanPermit("doc-1", "write", "project-a", "martin",
                            NOW - timedelta(seconds=1))
        r = ec.request(target="doc-1", action="write", scope="project-a",
                       permit=stale, now=NOW)
        self.assertEqual(r.decision, EXECUTION_LOCK)
        self.assertIn("permit_expired", r.reasons)

    def test_wrong_target_action_or_scope_locks(self):
        ec = ExecutionControl(SidecarValidatorV3())
        cases = [
            dict(target="doc-2", action="write", scope="project-a"),
            dict(target="doc-1", action="delete_all", scope="project-a"),
            dict(target="doc-1", action="write", scope="project-b"),
        ]
        for ask in cases:
            with self.subTest(**ask):
                r = ec.request(m=0.0, permit=good_permit(), now=NOW, **ask)
                self.assertEqual(r.decision, EXECUTION_LOCK)

    def test_exact_match_plus_clean_validation_releases(self):
        ec = ExecutionControl(SidecarValidatorV3())
        r = ec.request(target="doc-1", action="write", scope="project-a",
                       m=0.1, payload={"op": "append"},
                       permit=good_permit(), now=NOW)
        self.assertEqual(r.decision, RELEASE_TO_ADAPTER)
        self.assertTrue(r.released)

    def test_valid_permit_cannot_rescue_bad_mathematics(self):
        ec = ExecutionControl(SidecarValidatorV3())
        r = ec.request(target="doc-1", action="write", scope="project-a",
                       m=0.9, permit=good_permit(), now=NOW)
        self.assertEqual(r.decision, EXECUTION_LOCK)


class TestGridNoUnexpectedRelease(unittest.TestCase):

    def test_only_clean_math_plus_exact_permit_ever_releases(self):
        ec = ExecutionControl(SidecarValidatorV3())
        released = 0
        for i in range(-120, 121, 3):
            m = i / 100
            for permit in (None, good_permit(), good_permit(target="other")):
                r = ec.request(target="doc-1", action="write", scope="project-a",
                               m=m, permit=permit, now=NOW)
                if r.released:
                    released += 1
                    self.assertLess(abs(m), 0.35)
                    self.assertIsInstance(permit, HumanPermit)
                    self.assertEqual(permit.target, "doc-1")
        self.assertGreater(released, 0, "grid never exercised the release path")


if __name__ == "__main__":
    unittest.main(verbosity=2)
