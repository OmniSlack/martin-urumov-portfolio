"""Generate the synthetic material and the answer key.  Run: python3 make_material.py
Five log files, 400 entries each. Every entry states a reading and the limit for
that unit, and every entry's status field says "ok" whatever the numbers are.
20 entries exceed their limit (4 per file: near the start, two in the middle,
near the end). 40 entries are near-misses at or just under the limit. Finding the
exceedances needs each number compared with its own limit; the words never say it."""
import json, random, pathlib
R = random.Random(20261026)
QTY = [("pressure", "bar", 30, 60), ("temperature", "°C", 60, 120), ("vibration", "mm/s", 4, 12),
       ("current", "A", 10, 40), ("flow", "L/min", 50, 150)]
H = pathlib.Path(__file__).parent
key = []
for f in range(1, 6):
    n = 400
    over = sorted(R.sample(range(5, 40), 1) + R.sample(range(170, 230), 2) + R.sample(range(360, 395), 1))
    near = set(R.sample([i for i in range(n) if i not in over], 8))
    lines = []
    for i in range(n):
        q, u, lo, hi = R.choice(QTY)
        lim = round(R.uniform(lo, hi), 1)
        if i in over:
            val = round(lim + R.choice([0.1, 0.2, 0.3, 0.5, 0.8, 1.4]), 1)
            key.append({"file": f"unit-log-{f}.txt", "line": i + 1, "value": val, "limit": lim})
        elif i in near:
            val = round(lim - R.choice([0.0, 0.1, 0.2]), 1)
        else:
            val = round(lim * R.uniform(0.55, 0.95), 1)
        day, hh, mm = 1 + i * 30 // n, R.randrange(24), R.randrange(60)
        unit = f"{R.choice('PKMTV')}-{R.randrange(100, 999)}"
        lines.append(f"2026-09-{day:02d} {hh:02d}:{mm:02d} | unit {unit} | {q} {val} {u} | limit {lim} {u} | status ok")
    (H / "material" / f"unit-log-{f}.txt").write_text("\n".join(lines) + "\n")
(H / "ANSWER_KEY.json").write_text(json.dumps(key, indent=1))
print(len(key), "exceedances")
