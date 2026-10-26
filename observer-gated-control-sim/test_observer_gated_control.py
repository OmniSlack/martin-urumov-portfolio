"""Tests for observer_gated_control.py.

Run:  python3 -m unittest test_observer_gated_control -v
"""
import io
import unittest

import numpy as np

import observer_gated_control as oc


class Determinism(unittest.TestCase):
    def test_same_seed_same_arrays(self):
        a, b = oc.run(7), oc.run(7)
        for k in a:
            self.assertTrue(np.array_equal(a[k], b[k]), k)

    def test_original_numbers_with_the_original_clamp(self):
        # the five numbers printed by the 2026-07-13 original (I_CLAMP = 40), pinned to
        # 2 decimals: proves this copy computes exactly what the original computed
        m = oc.metrics(oc.run(7, i_clamp=40.0))
        oc.run(7, i_clamp=400.0)   # restore the default for the other tests
        expected = {
            "IAE (total)":              (16947.26, 15930.34),
            "IAE (clean regime)":       (14176.03, 14627.46),
            "Max deviation / fault":    (52.16, 22.70),
            "Min temperature / fault":  (127.84, 157.30),
            "Actuator TV (chattering)": (149.25, 31.92),
        }
        for k, (d, o) in expected.items():
            self.assertAlmostEqual(m[k][0], d, places=2, msg=k)
            self.assertAlmostEqual(m[k][1], o, places=2, msg=k)


class SetpointReached(unittest.TestCase):
    def test_both_controllers_reach_the_setpoint_with_the_fixed_clamp(self):
        x = oc.run(7)
        t = np.arange(oc.N)
        settled = (t >= 100) & (t < oc.FAULT[0])
        self.assertAlmostEqual(x["Td"][settled].mean(), oc.SP, delta=2.0)
        self.assertAlmostEqual(x["To"][settled].mean(), oc.SP, delta=2.0)

    def test_original_clamp_leaves_a_steady_state_offset(self):
        # the defect found 2026-10-26: with I_CLAMP = 40 the integral term is capped at
        # KI * 40 = 0.06 and neither controller can reach 180 °C
        x = oc.run(7, i_clamp=40.0)
        oc.run(7, i_clamp=400.0)
        t = np.arange(oc.N)
        settled = (t >= 100) & (t < oc.FAULT[0])
        self.assertLess(x["Td"][settled].mean(), oc.SP - 15)
        self.assertLess(x["To"][settled].mean(), oc.SP - 15)


class FairComparison(unittest.TestCase):
    def test_both_controllers_see_the_same_sensor_noise(self):
        # measurement minus true temperature is the sensor noise; it must be the
        # same sequence for both controllers, otherwise the comparison is unfair
        x = oc.run(7)
        np.testing.assert_allclose(x["md"] - x["Td"], x["mo"] - x["To"], atol=1e-9)


class FaultWindow(unittest.TestCase):
    def setUp(self):
        self.m = oc.metrics(oc.run(7))

    def test_observer_deviates_less_during_the_fault(self):
        d, o = self.m["Max deviation / fault"]
        self.assertLess(o, d)

    def test_observer_keeps_temperature_higher_during_the_fault(self):
        d, o = self.m["Min temperature / fault"]
        self.assertGreater(o, d)

    def test_observer_moves_the_actuator_less(self):
        d, o = self.m["Actuator TV (chattering)"]
        self.assertLess(o, d)


class DocumentedCost(unittest.TestCase):
    def test_observer_is_slower_in_the_clean_regime(self):
        # the gate and the rate limit cost accuracy when the sensor is honest;
        # this test pins the trade-off so it cannot be reported away
        d, o = oc.metrics(oc.run(7))["IAE (clean regime)"]
        self.assertGreater(o, d)
        self.assertLess(o / d - 1, 0.25)   # +17.6 % on seed 7 with the fixed clamp


class Mechanism(unittest.TestCase):
    def test_trust_is_a_weight_and_drops_during_the_fault(self):
        x = oc.run(7)
        t = np.arange(oc.N)
        fault = (t >= oc.FAULT[0]) & (t < oc.FAULT[1])
        self.assertTrue(np.all(x["trust"] > 0) and np.all(x["trust"] <= 1))
        self.assertLess(x["trust"][fault].mean(), x["trust"][~fault].mean())

    def test_actuator_step_never_exceeds_the_limit(self):
        x = oc.run(7)
        self.assertLessEqual(np.max(np.abs(np.diff(x["uo"]))), oc.DU_MAX + 1e-12)

    def test_direct_controller_has_no_rate_limit(self):
        x = oc.run(7)
        self.assertGreater(np.max(np.abs(np.diff(x["ud"]))), oc.DU_MAX)


class Cli(unittest.TestCase):
    def test_metrics_only(self):
        out = io.StringIO()
        oc.report(oc.metrics(oc.run(7)), out=out)
        text = out.getvalue()
        self.assertIn("DIRECT", text)
        self.assertIn("OBSERVER", text)
        self.assertEqual(text.count("\n"), 7)   # header, rule, five metrics


if __name__ == "__main__":
    unittest.main()
