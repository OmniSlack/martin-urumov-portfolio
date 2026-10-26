"""
Regression tests for PayloadPolicyValidator.

Each test pins one specific defect found in V2. The names carry the defect's
address so that it cannot return silently in a later edit.

Run:  python3 -m unittest test_payload_policy_validator -v
"""

import math
import random
import unittest

from payload_policy_validator import (
    PayloadPolicyValidator, ConfigError, K_PSI, PSI_EXEC_MIN, M_DENOM,
)

SCHEMA_KW = {
    "required_fields": ["user"],
    "risk_keywords": ["rm", "drop", "delete"],
}


class F1_SeparatedScales(unittest.TestCase):
    """V2: one sigma served both the absolute and the relative quantity."""

    def test_absolute_threshold_is_in_m_units_not_sigma_multiples(self):
        v = PayloadPolicyValidator(sigma=0.05, gate=3.0, m_lock=0.35)
        # m just below the absolute threshold, baseline caught up -> no surprise
        r = v.evaluate_loop(m=0.349, t_pred=0.349)
        self.assertEqual(r["decision"], "AUTO_EXECUTE")
        # m exactly on the threshold -> locks on the ABSOLUTE scale
        r = v.evaluate_loop(m=0.350, t_pred=0.350)
        self.assertEqual(r["decision"], "EXECUTION_LOCK")
        self.assertIn("ABS_POLICY_DISTANCE", r["lock_reason"])

    def test_relative_threshold_independent_of_m_lock(self):
        v = PayloadPolicyValidator(sigma=0.05, gate=3.0, m_lock=0.35)
        thr = v.rel_threshold()
        self.assertAlmostEqual(thr, 3.0 * 0.05 * K_PSI, places=9)
        # small m but a large surprise -> locks on the RELATIVE scale
        r = v.evaluate_loop(m=0.20, t_pred=0.0)
        self.assertEqual(r["decision"], "EXECUTION_LOCK")
        self.assertIn("REL_SURPRISE", r["lock_reason"])


class F2_DeadGuard(unittest.TestCase):
    """V2: the hard guard never changed a decision — it only relabelled."""

    def test_absolute_guard_actually_changes_a_decision(self):
        """The case where ONLY the absolute threshold catches: baseline fully adapted."""
        v = PayloadPolicyValidator(sigma=0.05, gate=3.0, m_lock=0.35)
        # r_rel = 0 -> the relative component is silent by construction
        r = v.evaluate_loop(m=0.90, t_pred=0.90)
        self.assertEqual(r["psi_rel"], 1.0)          # no surprise
        self.assertEqual(r["decision"], "EXECUTION_LOCK")   # and still locks
        self.assertIn("ABS_POLICY_DISTANCE", r["lock_reason"])
        self.assertNotIn("REL_SURPRISE", r["lock_reason"])

    def test_degenerate_relative_config_is_refused_at_construction(self):
        with self.assertRaises(ConfigError):
            PayloadPolicyValidator(sigma=1.0, gate=3.0)   # rel_threshold > 1 -> dead
        with self.assertRaises(ConfigError):
            PayloadPolicyValidator(sigma=0.0)
        with self.assertRaises(ConfigError):
            PayloadPolicyValidator(gate=0.0)
        with self.assertRaises(ConfigError):
            PayloadPolicyValidator(m_lock=0.0)


class F3_SchemaVerbosity(unittest.TestCase):
    """V2: m = discrepancies / (len(required_fields)+2) -> a schema with 10+ fields
       let a missing required field through the gate."""

    def test_same_violation_same_m_regardless_of_schema_size(self):
        v = PayloadPolicyValidator()
        seen = set()
        for n in (2, 3, 5, 10, 20, 50):
            schema = {"required_fields": [f"f{i}" for i in range(n)]}
            payload = {f"f{i}": 1 for i in range(n - 1)}      # one is missing
            m, _ = v.compute_policy_discrepancy(payload, schema)
            seen.add(round(m, 6))
        self.assertEqual(len(seen), 1, f"m changes with the schema: {seen}")
        self.assertAlmostEqual(seen.pop(), 1.0 / M_DENOM, places=9)

    def test_missing_field_locks_even_in_verbose_schema(self):
        """The exact V2 regression: 10 and 20 fields passed as AUTO_EXECUTE."""
        v = PayloadPolicyValidator()
        for n in (10, 20, 50):
            schema = {"required_fields": [f"f{i}" for i in range(n)]}
            payload = {f"f{i}": 1 for i in range(n - 1)}
            m, _ = v.compute_policy_discrepancy(payload, schema)
            self.assertEqual(
                v.evaluate_loop(m=m, t_pred=0.0)["decision"], "EXECUTION_LOCK",
                f"missing field passed with a {n}-field schema (m={m})",
            )

    def test_severity_is_monotone_in_number_of_violations(self):
        v = PayloadPolicyValidator()
        schema = {"required_fields": ["a", "b", "c", "d"]}
        prev = -1.0
        for k in range(5):                      # 0..4 missing
            payload = {f: 1 for f in list("abcd")[k:]}
            m, _ = v.compute_policy_discrepancy(payload, schema)
            self.assertGreaterEqual(m, prev)
            prev = m


class F4_KeywordMatching(unittest.TestCase):
    """V2: substring in json.dumps -> 'confirm', 'alarm', 'format' fired 'rm'."""

    def test_substring_false_positives_are_gone(self):
        v = PayloadPolicyValidator()
        for benign in ("confirm", "alarm", "format", "warm", "farm", "Bergman"):
            m, br = v.compute_policy_discrepancy({"user": benign}, SCHEMA_KW)
            self.assertEqual(br["risk_keywords_in_values"], [],
                             f"{benign!r} still fires a keyword")
            self.assertEqual(m, 0.0, f"{benign!r} gives m={m}")

    def test_real_keyword_still_fires(self):
        v = PayloadPolicyValidator()
        for hostile in ("rm", "rm -rf /", "please drop table", "DELETE"):
            m, br = v.compute_policy_discrepancy({"user": hostile}, SCHEMA_KW)
            self.assertTrue(br["risk_keywords_in_values"],
                            f"{hostile!r} was not caught")
            self.assertGreater(m, 0.0)

    def test_keys_and_values_are_reported_separately(self):
        v = PayloadPolicyValidator()
        _, br = v.compute_policy_discrepancy({"user": "ok", "drop": 1}, SCHEMA_KW)
        self.assertIn("drop", br["risk_keywords_in_keys"])
        self.assertEqual(br["risk_keywords_in_values"], [])

    def test_nested_payload_is_inspected(self):
        v = PayloadPolicyValidator()
        payload = {"user": "ok", "body": {"steps": [{"cmd": "drop"}]}}
        _, br = v.compute_policy_discrepancy(payload, SCHEMA_KW)
        self.assertIn("drop", br["risk_keywords_in_values"])


class DeltaT_Reachable(unittest.TestCase):
    """V2: du_max=1.8 was unreachable — delta_t in the executable zone topped out at 0.3125."""

    def test_declared_max_is_actually_reached(self):
        v = PayloadPolicyValidator(du_min=0.05, du_max=1.8)
        seen_max = max(
            v.evaluate_loop(m=x / 1000.0, t_pred=0.0)["delta_t_sec"]
            for x in range(0, 1001)
        )
        self.assertAlmostEqual(seen_max, 1.8, places=4)

    def test_clean_payload_gets_minimum_latency(self):
        v = PayloadPolicyValidator()
        r = v.evaluate_loop(m=0.0, t_pred=0.0)
        self.assertEqual(r["decision"], "AUTO_EXECUTE")
        self.assertAlmostEqual(r["delta_t_sec"], 0.05, places=4)


class V2_AnchorPreserved(unittest.TestCase):
    """V2's own correct fix must not be lost in the refactor."""

    def test_sustained_high_m_cannot_be_normalised_away(self):
        v = PayloadPolicyValidator(alpha=0.1, sigma=0.05, gate=3.0, m_lock=0.35)
        decisions = []
        for _ in range(200):                 # baseline adapts to high risk
            v.update_baseline(0.9)
            decisions.append(v.evaluate_loop(m=0.9)["decision"])
        self.assertTrue(all(d == "EXECUTION_LOCK" for d in decisions))
        self.assertGreater(v.t_pred_ema, 0.85)   # the baseline really has caught up
        self.assertEqual(v.evaluate_loop(m=0.9)["psi_rel"], 1.0)  # no surprise


class Calibration(unittest.TestCase):
    """The anchor changed the question: we look for the distribution of m, not sigma around a baseline."""

    def test_refuses_insufficient_n_for_requested_quantile(self):
        random.seed(0)
        small = [random.uniform(0, 0.1) for _ in range(250)]
        with self.assertRaises(ConfigError):
            PayloadPolicyValidator.calibrate(small, target_false_lock_rate=0.01)

    def test_accepts_sufficient_n_and_returns_measured_values(self):
        random.seed(0)
        big = [random.uniform(0, 0.1) for _ in range(1200)]
        out = PayloadPolicyValidator.calibrate(big, target_false_lock_rate=0.01)
        self.assertEqual(out["n"], 1200)
        self.assertGreater(out["m_lock_from_quantile"], 0.0)
        self.assertLess(out["sigma_relative_SE_pct"], 3.0)


class FailClosed(unittest.TestCase):
    def test_degenerate_runtime_params_fail_closed(self):
        v = PayloadPolicyValidator()
        for bad in ({"gate": 0.0}, {"sigma": 0.0}, {"gate": -1.0}):
            r = v.evaluate_loop(m=0.0, t_pred=0.0, **bad)
            self.assertEqual(r["decision"], "EXECUTION_LOCK")
            self.assertEqual(r["lock_reason"], "CONFIG_DEGENERATE")


if __name__ == "__main__":
    unittest.main(verbosity=2)
