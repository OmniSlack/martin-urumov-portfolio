"""
Gap tests for SidecarValidatorV2 — the cases the original 5/5 suite does not cover.

WIRING: point `decide` and `blocked_by_keyword` at the real implementation.
The reference block below mirrors the DESCRIBED v2 logic (m >= 0.35 OR psi < 0.85,
r_effective = max(|m|, |m - t_pred|)) so the tests can be demonstrated standalone.

Expected against that described logic: test_06 FAILS, test_07 FAILS, test_08 FAILS.
That is the point — a suite where nothing can fail proves nothing.

NOTE on test_06: it asserts only that values AT OR ABOVE the hard threshold must
block regardless of the baseline. It deliberately does NOT assert anything about
sub-threshold values — those are inside tolerance by design, and asserting
otherwise would smuggle in a different threshold.
"""
import math
import unittest

# ---------------------------------------------------------------- reference --
HARD_THRESHOLD = 0.35
PSI_THRESHOLD = 0.85
RISKY_KEYWORDS = ["DELETE", "DROP", "TRUNCATE"]

LOCK, EXEC = "EXECUTION_LOCK", "AUTO_EXECUTE"


def psi(r):
    return math.exp(-(r ** 2) / 2)


def r_effective(m, t_pred):
    return max(abs(m), abs(m - t_pred))


def decide(m, t_pred):
    """Described v2 logic. Replace with the real validator."""
    if m >= HARD_THRESHOLD:
        return LOCK
    if psi(r_effective(m, t_pred)) < PSI_THRESHOLD:
        return LOCK
    return EXEC


def decide_hard_only(m, t_pred):
    return LOCK if m >= HARD_THRESHOLD else EXEC


def decide_symmetric_hard_only(m, t_pred):
    return LOCK if abs(m) >= HARD_THRESHOLD else EXEC


def blocked_by_keyword(payload):
    return any(k in payload for k in RISKY_KEYWORDS)


# -------------------------------------------------------------------- tests --
class TestSidecarV2Gaps(unittest.TestCase):

    def test_06_hard_rule_is_baseline_independent_and_symmetric(self):
        """A violation at or above the hard threshold must block no matter what
        the baseline says — including a baseline that has caught up to it.

        test_02 used m=0.5 with only t_pred=0.5, so it could not distinguish
        the r_effective fix from the plain hard threshold. This sweeps the
        baseline, and covers negative m, which `m >= 0.35` misses entirely.
        """
        magnitudes = (0.35, 0.40, 0.50, 0.80, 2.00)
        for mag in magnitudes:
            for m in (mag, -mag):
                for t_pred in (0.0, m, m - 0.01, 100.0):
                    with self.subTest(m=m, t_pred=t_pred):
                        self.assertEqual(
                            decide(m=m, t_pred=t_pred), LOCK,
                            f"|m|={abs(m):.2f} is at/above the hard threshold "
                            f"{HARD_THRESHOLD} but executed "
                            f"(t_pred={t_pred}, psi={psi(r_effective(m, t_pred)):.4f})",
                        )

    def test_07_keyword_matching_is_case_insensitive(self):
        """Keywords are case-sensitive, so test_05's uppercase DELETE proves
        only that the exact uppercase form is caught."""
        for variant in ("delete", "Delete", "DeLeTe", "dElEtE"):
            with self.subTest(variant=variant):
                self.assertTrue(
                    blocked_by_keyword(f'{{"op": "{variant}"}}'),
                    f"payload containing {variant!r} bypassed the keyword gate",
                )

    def test_08_psi_is_not_decorative(self):
        """Ablation: does psi earn its place as a gate, or is it a
        reparameterised threshold on |m|?

        Splits psi's unique blocks into genuine catches (|m| at/above
        threshold) and false stops (|m| inside tolerance, baseline merely
        stale), then checks whether the one-line symmetric threshold already
        covers every genuine catch.
        """
        grid = [(m / 100, t / 100)
                for m in range(-100, 101, 2)
                for t in range(-100, 101, 2)]

        unique_catches, false_stops, sym_covers_all = 0, 0, True
        differs_from_symmetric = False

        for m, t in grid:
            if decide(m, t) != decide_symmetric_hard_only(m, t):
                differs_from_symmetric = True
            if decide(m, t) == LOCK and decide_hard_only(m, t) == EXEC:
                if abs(m) >= HARD_THRESHOLD:
                    unique_catches += 1
                    if decide_symmetric_hard_only(m, t) != LOCK:
                        sym_covers_all = False
                else:
                    false_stops += 1

        if not differs_from_symmetric:
            self.skipTest(
                f"decisions are identical to `abs(m) >= {HARD_THRESHOLD}` across "
                f"the whole grid — there is no extra gate left to ablate. "
                f"This is the intended end state, not a failure."
            )

        self.assertGreater(
            unique_catches, 0,
            "the extra gate never blocked a genuine violation the hard "
            "threshold missed",
        )
        self.assertFalse(
            sym_covers_all,
            f"every genuine violation psi caught ({unique_catches}) is also "
            f"caught by `abs(m) >= {HARD_THRESHOLD}` alone, while psi adds "
            f"{false_stops} false stops — psi is strictly dominated by the "
            f"one-line symmetric fix",
        )
        self.assertLessEqual(
            false_stops, unique_catches,
            f"psi produced {false_stops} false stops vs {unique_catches} "
            f"genuine catches — net-negative gate",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
