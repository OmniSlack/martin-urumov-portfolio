# -*- coding: utf-8 -*-
"""
Observer-gated control versus direct feedback under a sensor fault — proof of concept.

Two controllers run on the SAME first-order thermal process, with the SAME PID
gains and the SAME noise realisation, so the only difference is what the PID
acts on:

  (A) DIRECT    — PID on the raw measurement.
  (B) OBSERVER  — PID on a trusted state estimate:
        1. residual        r = measurement − model prediction
        2. trust weight    w = exp(−r² / 2(gate·σ_r)²), with σ_r learned only from
                           residuals inside the gate; the measurement is accepted
                           in proportion to w (estimate = prediction + w·r)
        3. rate limit      the actuator step per sample is bounded by a limit that
                           shrinks as w falls
        4. control         PID on the estimate, not on the sensor

Engineering terms for the same thing: a state observer (Luenberger / Kalman
family), residual-based fault detection, uncertainty-gated measurement update,
and actuator rate limiting. No new control law is claimed.

Boundaries: toy simulation (one state, additive noise, one fault type). A real
deployment needs system identification, a safety instrumented system, and
certification. The clean-regime cost of the gate and the rate limit is reported,
not hidden (see README).

Usage:
    python3 observer_gated_control.py [chart.png] [--seed N] [--i-clamp X] [--no-chart]
"""

import argparse
import sys

import numpy as np

RNG = np.random.default_rng(7)   # seed for reproducibility; overridable with --seed

# ---- Process (first order, thermal): dT/dt = -a(T - Tamb) + b*u ----
DT, N = 1.0, 600
T_AMB, SP = 25.0, 180.0
A, B = 0.02, 5.5                 # steady state at u=1: 25 + (B/A) = 300 °C
PROC_NOISE = 0.30

# ---- Sensor ----
SENS_SIGMA = 1.5
SPIKE_P, SPIKE_MAG = 0.015, (15.0, 40.0)
FAULT = (300, 360)               # window of the sensor bias fault
FAULT_BIAS = 35.0                # the sensor reads +35 °C too high (drives cooling)

# ---- PID (identical for both controllers) ----
KP, KI, KD = 0.020, 0.0015, 0.050
I_CLAMP = 400.0                  # anti-windup clamp on the integral term (see note)
# Note: the 2026-07-13 original used I_CLAMP = 40.0. With KI = 0.0015 that caps the
# integral contribution at 0.06, so neither controller could reach the 180 °C
# setpoint (both held ≈158 °C). 400 removes the offset; 4000 winds up (≈186 °C).
# Run with --i-clamp 40 to reproduce the original's numbers exactly.

# ---- Observer parameters ----
GATE = 3.0                       # residual gate, in units of σ_r
DU_MIN, DU_MAX = 0.010, 0.080    # actuator step limit per sample at trust 0 and trust 1


def make_sensor(T, k):
    m = T + RNG.normal(0, SENS_SIGMA)
    if RNG.random() < SPIKE_P:
        m += RNG.choice([-1, 1]) * RNG.uniform(*SPIKE_MAG)
    if FAULT[0] <= k < FAULT[1]:
        m += FAULT_BIAS
    return m


def pid_step(state, error):
    state["i"] = float(np.clip(state["i"] + error * DT, -I_CLAMP, I_CLAMP))
    d = (error - state["e_prev"]) / DT
    state["e_prev"] = error
    return KP * error + KI * state["i"] + KD * d


def run(seed=7, i_clamp=None):
    global RNG, I_CLAMP
    if i_clamp is not None:
        I_CLAMP = float(i_clamp)
    RNG = np.random.default_rng(seed)
    # one process-noise realisation, shared by both controllers
    proc_seed = RNG.normal(0, PROC_NOISE, N)

    # --- (A) DIRECT ---
    Td = np.zeros(N); ud = np.zeros(N); md = np.zeros(N)
    T = T_AMB; u = 0.0; pid = {"i": 0.0, "e_prev": 0.0}
    for k in range(N):
        m = make_sensor(T, k); md[k] = m
        u = float(np.clip(pid_step(pid, SP - m), 0.0, 1.0))   # acts on the raw reading
        ud[k] = u; Td[k] = T
        T = T + DT * (-A * (T - T_AMB) + B * u) + proc_seed[k]

    # rewind the generator so the sensor noise sequence is the same for (B)
    RNG = np.random.default_rng(seed); _ = RNG.normal(0, PROC_NOISE, N)

    # --- (B) OBSERVER ---
    To = np.zeros(N); uo = np.zeros(N); mo = np.zeros(N)
    est = np.zeros(N); trust = np.zeros(N)
    T = T_AMB; u = 0.0; pid = {"i": 0.0, "e_prev": 0.0}
    That = T_AMB                      # internal state estimate
    sig_r = SENS_SIGMA                # expected residual scale, learned online
    for k in range(N):
        m = make_sensor(T, k); mo[k] = m

        # 1. residual against the model prediction
        Tpred = That + DT * (-A * (That - T_AMB) + B * u)
        r = m - Tpred

        # 2. trust weight from the surprise; learn σ_r only from in-gate residuals
        w = float(np.exp(-(r * r) / (2.0 * (GATE * sig_r) ** 2)))
        if abs(r) < GATE * sig_r:
            sig_r = 0.98 * sig_r + 0.02 * abs(r) * 1.253  # EMA of |r| scaled to a std
        # accept the measurement only as far as it is trusted
        That = Tpred + w * r
        est[k] = That; trust[k] = w

        # 4. PID on the trusted estimate
        u_target = float(np.clip(pid_step(pid, SP - That), 0.0, 1.0))

        # 3. rate limit: the lower the trust, the smaller the permitted step
        du = DU_MIN + (DU_MAX - DU_MIN) * w
        u = float(np.clip(u + np.clip(u_target - u, -du, du), 0.0, 1.0))

        uo[k] = u; To[k] = T
        T = T + DT * (-A * (T - T_AMB) + B * u) + proc_seed[k]

    return dict(Td=Td, ud=ud, md=md, To=To, uo=uo, mo=mo, est=est, trust=trust)


def metrics(x):
    t = np.arange(N)
    fault = (t >= FAULT[0]) & (t < FAULT[1])
    clean = ~fault
    def iae(T): return float(np.sum(np.abs(SP - T)))
    def tv(u):  return float(np.sum(np.abs(np.diff(u))))  # total variation: chattering / wear
    def maxdev_fault(T): return float(np.max(np.abs(SP - T[fault])))
    def mintemp_fault(T): return float(np.min(T[fault]))
    return {
        "IAE (total)":              (iae(x["Td"]),            iae(x["To"])),
        "IAE (clean regime)":       (float(np.sum(np.abs(SP - x['Td'])[clean])),
                                     float(np.sum(np.abs(SP - x['To'])[clean]))),
        "Max deviation / fault":    (maxdev_fault(x["Td"]),   maxdev_fault(x["To"])),
        "Min temperature / fault":  (mintemp_fault(x["Td"]),  mintemp_fault(x["To"])),
        "Actuator TV (chattering)": (tv(x["ud"]),             tv(x["uo"])),
    }


def report(m, out=sys.stdout):
    print(f"{'Metric':<26}{'DIRECT':>12}{'OBSERVER':>12}{'better':>12}", file=out)
    print("-" * 62, file=out)
    for k, (r, o) in m.items():
        better = "OBSERVER" if o < r else ("DIRECT" if r < o else "=")
        # for the minimum temperature, higher is safer (closer to the setpoint)
        if k.startswith("Min"):
            better = "OBSERVER" if o > r else ("DIRECT" if r > o else "=")
        print(f"{k:<26}{r:>12.2f}{o:>12.2f}{better:>12}", file=out)


def plot(x, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    t = np.arange(N)
    fig, ax = plt.subplots(3, 1, figsize=(11, 11), sharex=True)
    for a in ax:
        a.axvspan(*FAULT, color="#e8b0b0", alpha=0.35, lw=0)
    # 1) true temperature
    ax[0].plot(t, x["md"], color="#c9c9c9", lw=0.7, label="sensor (noise + spikes + fault)")
    ax[0].axhline(SP, color="#999", ls="--", lw=1, label="setpoint 180 °C")
    ax[0].plot(t, x["Td"], color="#c0392b", lw=1.8, label="DIRECT — true temperature")
    ax[0].plot(t, x["To"], color="#1f6f3f", lw=1.8, label="OBSERVER — true temperature")
    ax[0].set_ylabel("°C"); ax[0].legend(loc="lower right", fontsize=8)
    ax[0].set_title("Observer-gated control vs direct feedback — sensor bias fault (300–360 s)")
    # 2) sensor vs the observer's internal estimate
    ax[1].plot(t, x["mo"], color="#c9c9c9", lw=0.8, label="sensor")
    ax[1].plot(t, x["est"], color="#1f6f3f", lw=1.6, label="OBSERVER — internal estimate")
    ax[1].axhline(SP, color="#999", ls="--", lw=1)
    ax[1].set_ylabel("°C"); ax[1].legend(loc="lower right", fontsize=8)
    ax[1].text(330, x["mo"][310], "fault is\nrejected", fontsize=8, ha="center", color="#1f6f3f")
    # 3) heater command
    ax[2].plot(t, x["ud"], color="#c0392b", lw=1.2, label="DIRECT — power")
    ax[2].plot(t, x["uo"], color="#1f6f3f", lw=1.4, label="OBSERVER — power")
    ax[2].set_ylabel("u ∈ [0,1]"); ax[2].set_xlabel("time (s)")
    ax[2].legend(loc="upper right", fontsize=8)
    plt.tight_layout(); plt.savefig(path, dpi=110); print("chart ->", path)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("chart", nargs="?", default="observer_gated_control.png",
                   help="output path of the chart (default: ./observer_gated_control.png)")
    p.add_argument("--seed", type=int, default=7, help="random seed (default 7)")
    p.add_argument("--i-clamp", type=float, default=None,
                   help="anti-windup clamp (default 400; 40 reproduces the 2026-07-13 original)")
    p.add_argument("--no-chart", action="store_true", help="print the metrics only")
    a = p.parse_args(argv)
    x = run(a.seed, a.i_clamp)
    report(metrics(x))
    if not a.no_chart:
        plot(x, a.chart)


if __name__ == "__main__":
    main()
