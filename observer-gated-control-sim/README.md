# observer-gated-control-sim

**Kind:** simulation (Python 3, `numpy`; `matplotlib` for the chart only) · **Status:** proof of concept on a toy process · **Date:** original 2026-07-13; English copy with one fix 2026-10-26

## Purpose

Shows, on one simulated thermal process, what a controller gains and what it loses when it acts on a **trusted estimate** of the state instead of on the **raw sensor reading**. The test case is a sensor that lies: for 60 seconds it reads 35 °C too high, so a controller that believes it cools a process that is already at setpoint. The same PID, the same process, the same noise — the only difference is the layer between the sensor and the controller.

## How it works

Two controllers on the process `dT/dt = −a(T − T_amb) + b·u`, with sensor noise, random spikes and a bias fault in 300–360 s:

- **DIRECT** — PID on the raw measurement.
- **OBSERVER** — four steps per sample:
  1. **residual** `r = measurement − model prediction`;
  2. **trust weight** `w = exp(−r² / 2(gate·σ_r)²)`, where `σ_r` is learned online from residuals inside the gate only; the measurement is accepted in proportion to `w` (`estimate = prediction + w·r`);
  3. **rate limit** — the actuator may move at most `du = du_min + (du_max − du_min)·w` per sample, so low trust means small steps;
  4. **PID on the estimate**, not on the sensor.

In control-engineering terms: a state observer (Luenberger / Kalman family), residual-based fault detection, an uncertainty-gated measurement update and actuator rate limiting. No new control law is claimed; the point of the file is the comparison, with the cost shown next to the gain.

The same trust weight and shrinking step limit are what [`payload-policy-validator`](../payload-policy-validator/) applies to an agent's action payloads instead of a temperature; this file is the control-engineering origin of that formula.

Fairness is tested, not assumed: both controllers receive the identical sensor-noise sequence (`test_both_controllers_see_the_same_sensor_noise`).

## How to run

```bash
python3 -m unittest test_observer_gated_control -v      # 13 tests
python3 observer_gated_control.py chart.png              # metrics table + chart (seed 7)
python3 observer_gated_control.py --no-chart --seed 3    # metrics only, another seed
python3 observer_gated_control.py --no-chart --i-clamp 40   # the 2026-07-13 original's numbers
python3 tools/seed_sweep.py                              # 50 seeds: who wins each metric, and the clean-regime cost
```

## Evidence

Seed 7, fixed clamp (`evidence/2026-10-26/METRICS_seed7_i_clamp400.txt`, chart `chart_seed7_i_clamp400.png`):

| Metric | DIRECT | OBSERVER | better |
|---|---:|---:|---|
| IAE, total | 5766.73 | 4440.23 | OBSERVER |
| IAE, clean regime (sensor honest) | 3730.87 | **4387.05** | **DIRECT** |
| Max deviation during the fault | 43.02 °C | 2.15 °C | OBSERVER |
| Min temperature during the fault | 136.98 °C | 177.85 °C | OBSERVER |
| Actuator total variation (chattering) | 145.63 | 31.49 | OBSERVER |

Across seeds 0–49 (`SEED_SWEEP.txt`): OBSERVER wins the fault-window metrics and the actuator wear in **50 of 50** seeds and loses the clean-regime IAE in **50 of 50** — by +16.7 % on average (+10.3 % to +23.2 %). That is the price of the gate and the rate limit when the sensor is honest; it is the headline, not a footnote.

| Claim | Where | Observed |
|---|---|---|
| 13/13 tests | `evidence/2026-10-26/TESTS.txt` | **Reproduced** |
| This copy computes exactly what the original computed | `test_original_numbers_with_the_original_clamp` pins the original's five numbers at `--i-clamp 40`; all eight output arrays byte-identical to the original on seeds 0–49 (checked 2026-10-26 against an unmodified copy of the original) | **Verified** |
| Same noise for both controllers | `test_both_controllers_see_the_same_sensor_noise` | **Reproduced** |
| Rate limit never exceeded; DIRECT has none | `test_actuator_step_never_exceeds_the_limit`, `test_direct_controller_has_no_rate_limit` | **Reproduced** |

## Defect history

| Date | What | Proof |
|---|---|---|
| found 2026-10-26 | **Neither controller reached the setpoint.** The integral term was clamped at ±40; with `KI = 0.0015` that caps its contribution at 0.06, and both controllers settled at ≈158 °C instead of 180 °C (0 of 50 seeds within ±2 °C). The chart's setpoint line was never touched and nobody had said so. The comparison between the two controllers was still fair (both carried the same offset), but the absolute IAE numbers were 30 % offset error in the settled window. Found by the AI assistant while reading the chart during the 2026-10-26 reproduction. | `--i-clamp 40`: `METRICS_seed7_i_clamp40.txt`, `chart_seed7_i_clamp40.png`; `test_original_clamp_leaves_a_steady_state_offset` |
| fixed 2026-10-26 | Clamp raised to ±400: both controllers hold 180 ± 2 °C in 50 of 50 seeds. Checked that ±4000 is too loose (integral wind-up, ≈186 °C). The approach is unchanged, so the fix is applied in this copy; the original's configuration stays reachable with `--i-clamp 40`. With the offset gone the observer's fault-window advantage is larger (2.15 °C vs 43.02 °C) and its clean-regime cost is also larger in relative terms (+16.7 % instead of +3.2 %). | `test_both_controllers_reach_the_setpoint_with_the_fixed_clamp`; `SEED_SWEEP.txt` |

## Limitations

- Toy model: one state, first-order dynamics, additive Gaussian noise, one fault type (constant bias), fixed gate and rate limits. No system identification, no actuator dynamics, no safety instrumented system.
- The observer's model is the true process model; with model mismatch the residual gate would also reject honest measurements. Not studied here.
- Metrics are summed over 600 samples of one realisation per seed; no confidence intervals.
- The trust weight is a Gaussian kernel of the residual, which is one of many possible gating functions; nothing here shows it is the best one.

## Provenance

See [`PROVENANCE.md`](PROVENANCE.md). Source: `observer_control.py` (2026-07-13, SHA-256 `f0c6ba72…c800`), a single file. Changes in this copy: renamed by function; header, comments, metric names, chart labels translated into English; `REFLEX` → `DIRECT`; chart path and seed taken from the command line instead of a hard-coded `/mnt/user-data/outputs/…` path; `matplotlib` imported only when a chart is drawn; the clamp fix above. All arithmetic is unchanged — proven by the byte-identical arrays at `--i-clamp 40`.

## Contribution

- Martin Urumov: the method (the original header names him as its author, 2026-07-13) — act on a trusted estimate, not on the sensor; derive trust from the residual; let low trust slow the action down — and the honesty frame of the original header: what is established engineering, what is only a re-description, what is a toy.
- AI assistants: the 2026-07-13 implementation (including the same-PID / same-noise comparison design), this English copy, the 13 tests, the seed sweep, the setpoint defect and its fix.
