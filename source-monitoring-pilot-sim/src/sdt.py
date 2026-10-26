"""Descriptive Signal Detection Theory helpers (equal-variance).

CANDIDATE. These are DESCRIPTIVE verification outputs only. They are NOT the
confirmatory analysis. The confirmatory model is a probit GLMM specified in
model_spec.py and to be fitted in an approved environment (R lme4::glmer,
probit link) subject to methodological approval — it is NOT fitted here.
"""

from statistics import NormalDist

_N = NormalDist(0.0, 1.0)


def phi(x: float) -> float:
    """Standard normal CDF."""
    return _N.cdf(x)


def z(p: float) -> float:
    """Standard normal inverse CDF (probit)."""
    return _N.inv_cdf(p)


def loglinear_rate(count: int, n: int) -> float:
    """Log-linear corrected rate: (count + 0.5) / (n + 1).

    Applied ONLY to descriptive participant-level SDT summaries, never inside a
    trial-level GLM (a trial-level model works on 0/1 data and needs no
    extreme-rate correction).
    """
    return (count + 0.5) / (n + 1)


def dprime_c(hits: int, n_signal: int, false_alarms: int, n_noise: int):
    """Return (dprime, criterion_c) from trial counts using log-linear rates.

    'signal' == truth external (perceived); 'noise' == truth internal (imagined).
    hit  = respond external | truth external
    fa   = respond external | truth internal
    d' = z(H) - z(FA)
    c  = -0.5 * (z(H) + z(FA))   (positive c => conservative about "external")
    """
    h = loglinear_rate(hits, n_signal)
    f = loglinear_rate(false_alarms, n_noise)
    zh, zf = z(h), z(f)
    return (zh - zf, -0.5 * (zh + zf))


def latent_hit_fa(dprime: float, c: float):
    """Generating probabilities for one participant given latent (d', c)."""
    return (phi(dprime / 2.0 - c), phi(-dprime / 2.0 - c))
