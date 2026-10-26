#!/usr/bin/env python3
"""Run observer_gated_control over seeds 0..49 and count, per metric, how often the
OBSERVER controller beats the DIRECT one; report the clean-regime cost.

Usage (from the folder root):  python3 tools/seed_sweep.py [--i-clamp X] [--seeds N]
"""
import argparse
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import observer_gated_control as oc  # noqa: E402


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--i-clamp", type=float, default=None)
    p.add_argument("--seeds", type=int, default=50)
    a = p.parse_args()
    wins = None
    cost = []
    reach = 0
    t = np.arange(oc.N)
    settled = (t >= 100) & (t < oc.FAULT[0])
    for s in range(a.seeds):
        x = oc.run(s, a.i_clamp)
        m = oc.metrics(x)
        reach += (abs(x["Td"][settled].mean() - oc.SP) < 2 and abs(x["To"][settled].mean() - oc.SP) < 2)
        if wins is None:
            wins = {k: 0 for k in m}
        for k, (d, o) in m.items():
            wins[k] += (o > d) if k.startswith("Min") else (o < d)
        d, o = m["IAE (clean regime)"]
        cost.append(o / d - 1)
    print(f"I_CLAMP = {oc.I_CLAMP:g}, seeds 0..{a.seeds - 1}")
    print(f"both controllers within ±2 °C of the setpoint over 100–300 s: {reach} of {a.seeds}")
    print("OBSERVER better than DIRECT (seeds):")
    for k, v in wins.items():
        print(f"  {k:<26} {v:>3} / {a.seeds}")
    print("clean-regime IAE, OBSERVER relative to DIRECT: mean %+.1f %%  (min %+.1f %%, max %+.1f %%)"
          % (100 * np.mean(cost), 100 * min(cost), 100 * max(cost)))


if __name__ == "__main__":
    main()
