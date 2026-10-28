import unittest
from kompas_core import FaultIsolator, IsolationResult, Issue, IssueState, IllegalTransition


def ok(_ctx):
    return True, None


def fail(reason):
    def _check(_ctx):
        return False, reason
    return _check


class TestFaultIsolator(unittest.TestCase):

    def test_all_pass_returns_no_stage(self):
        iso = FaultIsolator({s: ok for s in ("source", "input", "connection", "component", "core")})
        result = iso.isolate({})
        self.assertIsNone(result.stage)
        self.assertEqual(result.checked, ("source", "input", "connection", "component", "core"))

    def test_stops_at_first_failure_does_not_run_later_stages(self):
        calls = []
        def tracking_ok(stage):
            def _check(_ctx):
                calls.append(stage)
                return True, None
            return _check
        checks = {
            "source": tracking_ok("source"),
            "input": lambda ctx: (calls.append("input") or (False, "input malformed")),
            "connection": tracking_ok("connection"),
            "component": tracking_ok("component"),
            "core": tracking_ok("core"),
        }
        iso = FaultIsolator(checks)
        result = iso.isolate({})
        self.assertEqual(result.stage, "input")
        self.assertEqual(result.reason, "input malformed")
        # connection/component/core must NOT have been checked — that's the
        # whole point: no cascade of symptom-as-cause after the first failure.
        self.assertNotIn("connection", calls)
        self.assertNotIn("component", calls)
        self.assertNotIn("core", calls)

    def test_missing_check_for_declared_stage_raises(self):
        with self.assertRaises(ValueError):
            FaultIsolator({"source": ok})  # missing input/connection/component/core

    def test_custom_order_is_honoured_not_the_default(self):
        seen = []
        def track(name):
            def _check(_ctx):
                seen.append(name)
                return True, None
            return _check
        checks = {s: track(s) for s in ("core", "source")}
        iso = FaultIsolator(checks, order=("core", "source"))
        iso.isolate({})
        self.assertEqual(seen, ["core", "source"])


class TestIssueLifecycle(unittest.TestCase):

    def test_cannot_skip_straight_to_closure_from_open(self):
        issue = Issue("bug-1")
        with self.assertRaises(IllegalTransition):
            issue.transition(IssueState.CLOSURE_VERIFIED, evidence="looks fixed", verified_by="alice")
        self.assertEqual(issue.state, IssueState.OPEN)

    def test_closure_requires_verified_by(self):
        issue = Issue("bug-2")
        issue.transition(IssueState.MITIGATED, evidence="workaround applied")
        issue.transition(IssueState.FIX_APPLIED, evidence="root cause patched, PR #4")
        with self.assertRaises(IllegalTransition):
            issue.transition(IssueState.CLOSURE_VERIFIED, evidence="tests pass")  # no verified_by
        self.assertEqual(issue.state, IssueState.FIX_APPLIED)

    def test_full_legitimate_path_closes(self):
        issue = Issue("bug-3")
        issue.transition(IssueState.MITIGATED, evidence="rate limit raised as stopgap")
        issue.transition(IssueState.FIX_APPLIED, evidence="root cause patched, PR #7")
        issue.transition(IssueState.CLOSURE_VERIFIED, evidence="regression suite green", verified_by="bob")
        self.assertTrue(issue.is_closed)
        self.assertEqual([h["to"] for h in issue.history],
                          ["MITIGATED", "FIX_APPLIED", "CLOSURE_VERIFIED"])

    def test_transition_requires_evidence(self):
        issue = Issue("bug-4")
        with self.assertRaises(IllegalTransition):
            issue.transition(IssueState.MITIGATED, evidence="")

    def test_closed_issue_can_only_reopen(self):
        issue = Issue("bug-5")
        issue.transition(IssueState.FIX_APPLIED, evidence="direct fix")
        issue.transition(IssueState.CLOSURE_VERIFIED, evidence="verified", verified_by="carol")
        with self.assertRaises(IllegalTransition):
            issue.transition(IssueState.MITIGATED, evidence="trying to reopen wrong")
        issue.transition(IssueState.REOPENED, evidence="regression found in prod")
        self.assertEqual(issue.state, IssueState.REOPENED)


if __name__ == "__main__":
    unittest.main(verbosity=2)
