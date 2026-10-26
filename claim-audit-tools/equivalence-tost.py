#!/usr/bin/env python3
"""EQUIVALENCE check — the two one-sided tests (TOST).

WHY IT EXISTS

In the pilot pipeline the rule is written correctly:

    "ordinary non-significance is NOT evidence of equivalence"

and the code under it does `abs(diff) < margin`. That is exactly what the rule
forbids: a difference that is small is not shown to be small. The sample may
simply be small, or the noise large.

The rule was in text. Here it becomes a mechanism.

THE FORMULA

Two one-sided tests against a MARGIN, not against zero:

    H0(lower):  difference <= -Δ          H0(upper):  difference >= +Δ

    SE = sqrt(s1²/n1 + s2²/n2)                     (Welch, unequal variances)

    t1 = (d + Δ) / SE      t2 = (d - Δ) / SE
    p  = max( P(T > t1),  P(T < t2) )

Equivalence is declared ONLY if p < alpha. That is, both one-sided hypotheses
fall — the difference is shown to lie inside the margin, not merely to be
indistinguishable from zero.

⚠️ THE LIMIT OF THE MARGIN ITSELF

Δ does not come from the data. It is a decision: how much difference does not
matter. The pilot's file declares it a PLACEHOLDER, and that is honest. The
number here is supplied, not invented, and is printed beside every result —
because a result without its Δ beside it cannot be read.

⚠️ The distribution is a normal approximation. At n≈60 per group and df>100
the difference from t is under 0.003 in p. For SMALL samples this does not
hold, and the tool says so instead of staying silent.

    python3 equivalence-tost.py <csv> [--margin 0.5] [--alpha 0.05]
    python3 equivalence-tost.py --selftest
"""

import argparse
import csv
import math
import statistics as st
import sys

ALPHA = 0.05


def norm_cdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def welch(a, b):
    """Difference, standard error and Welch degrees of freedom."""
    n1, n2 = len(a), len(b)
    m1, m2 = st.mean(a), st.mean(b)
    v1, v2 = st.variance(a), st.variance(b)
    se = math.sqrt(v1 / n1 + v2 / n2)
    df = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1))
    sp = math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2))
    return m1 - m2, se, df, (m1 - m2) / sp if sp else float("nan")


def tost(a, b, margin, alpha=ALPHA):
    """Returns the decision AND everything it was made from."""
    if margin <= 0:
        raise ValueError("The margin must be positive. Δ=0 is not a margin.")
    if len(a) < 3 or len(b) < 3:
        raise ValueError("Below three observations a variance is not computed.")

    diff, se, df, cohen_d = welch(a, b)
    t_low = (diff + margin) / se
    t_high = (diff - margin) / se
    p = max(1 - norm_cdf(t_low), norm_cdf(t_high))

    return {
        "diff": diff,
        "se": se,
        "df": df,
        "cohen_d": cohen_d,
        "p_tost": p,
        "margin": margin,
        "alpha": alpha,
        "equivalent": p < alpha,
        # Exactly what the pilot's code checks — so that it can be SEEN that the
        # two are different things, not taken on trust.
        "within_margin_only": abs(diff) < margin,
        "normal_approx_ok": df > 100,
    }


def analyse_csv(path, margin, alpha=ALPHA, cond_col="condition"):
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    if not rows:
        raise ValueError(f"{path} is empty.")
    conds = sorted({r[cond_col] for r in rows})
    if len(conds) != 2:
        raise ValueError(f"Exactly two conditions expected, found: {conds}")

    skip = {cond_col, "scenario", "participant_id"}
    dims = [k for k in rows[0] if k not in skip]

    out = []
    for d in dims:
        g = {c: [] for c in conds}
        for r in rows:
            try:
                g[r[cond_col]].append(float(r[d]))
            except (ValueError, TypeError):
                g = None
                break
        if g is None:
            continue
        out.append((d, tost(g[conds[1]], g[conds[0]], margin, alpha)))
    return conds, out


def report(path, margin, alpha=ALPHA):
    conds, res = analyse_csv(path, margin, alpha)
    print(f"TOST · {path}")
    print(f"  {conds[1]} minus {conds[0]} · Δ={margin} · alpha={alpha}\n")
    head = f"{'dimension':<32}{'diff':>9}{'Cohen d':>9}{'p_TOST':>9}{'|d|<Δ':>7}{'EQUIV':>7}"
    print(head)
    print("-" * len(head))

    disagree = 0
    for name, r in res:
        if r["within_margin_only"] != r["equivalent"]:
            disagree += 1
        print(f"{name:<32}{r['diff']:>+9.4f}{r['cohen_d']:>+9.3f}"
              f"{r['p_tost']:>9.4f}{('yes' if r['within_margin_only'] else 'no'):>7}"
              f"{('YES' if r['equivalent'] else 'NO'):>7}")

    print()
    if disagree:
        print(f"⚠️ {disagree} dimension(s) where \"inside the margin\" and \"equivalent\"")
        print("   do NOT agree. This is exactly what this check exists for.")
    else:
        print("🟢 Here the two columns agree. That is a COINCIDENCE for this sample,")
        print("   not a rule: with less data or more noise they diverge.")

    if any(not r["normal_approx_ok"] for _, r in res):
        print("\n⚠️ For some dimension df<100. The normal approximation becomes rough;")
        print("   use the t distribution before quoting these p values.")
    return 0


# ------------------------------------------------------------------ self-test

def selftest():
    """The tests must BITE, otherwise they check nothing."""
    import random
    random.seed(20260920)
    ok = 0
    fails = []

    def check(name, cond):
        nonlocal ok
        if cond:
            ok += 1
            print(f"  ok   {name}")
        else:
            fails.append(name)
            print(f"  FAIL {name}")

    # 1. Truly equal groups, much data → equivalence IS shown.
    a = [random.gauss(5, 1) for _ in range(300)]
    b = [random.gauss(5, 1) for _ in range(300)]
    r = tost(a, b, 0.5)
    check("equal groups, n=300 → equivalent", r["equivalent"])

    # 2. The SAME small difference, but little data → NOT shown, while the
    #    naive check would still say "inside the margin".
    #
    #    The first version DREW these two samples at random and claimed the
    #    difference would fall inside the margin. At n=6 that is not
    #    guaranteed — and it did not. The test measured luck.
    #
    #    Now the case is CONSTRUCTED: a difference of exactly 0.1 with a wide spread.
    a2 = [4.0, 5.0, 6.0, 4.0, 5.0, 6.0]
    b2 = [4.1, 5.1, 6.1, 4.1, 5.1, 6.1]
    r2 = tost(a2, b2, 0.5)
    check("small sample → equivalence NOT declared", not r2["equivalent"])
    check("and exactly there the naive rule disagrees",
          r2["within_margin_only"] and not r2["equivalent"])

    # 3. A real large difference → not equivalent.
    c = [random.gauss(7, 1) for _ in range(300)]
    r3 = tost(c, b, 0.5)
    check("a difference of 2 units → NOT equivalent", not r3["equivalent"])

    # 4. The margin is a decision, not data: Δ=0 is not accepted silently.
    try:
        tost(a, b, 0)
        check("Δ=0 refuses", False)
    except ValueError:
        check("Δ=0 refuses", True)

    print(f"\n{ok} pass / {len(fails)} fail")
    return 1 if fails else 0


def main():
    p = argparse.ArgumentParser(description="TOST — equivalence check.")
    p.add_argument("csv", nargs="?", help="CSV with a condition column and numeric dimensions.")
    p.add_argument("--margin", type=float, default=0.5, help="Δ — a decision, not data.")
    p.add_argument("--alpha", type=float, default=ALPHA)
    p.add_argument("--selftest", action="store_true")
    a = p.parse_args()

    if a.selftest:
        return selftest()
    if not a.csv:
        p.print_help()
        return 2
    return report(a.csv, a.margin, a.alpha)


if __name__ == "__main__":
    sys.exit(main())
