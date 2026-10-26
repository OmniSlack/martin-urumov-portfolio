"""Unblind the grades and tally them.  Run: python3 score.py"""
import json, pathlib
H = pathlib.Path(__file__).parent
key = json.loads((H / "grading/KEY.json").read_text())
rows, out = {}, []
for t in ["T1", "T2", "T3", "T4", "T5"]:
    g = json.loads((H / f"grading/{t}.grades.json").read_text())
    for lab, items in g.items():
        k = key[f"{t}-{lab}"]
        met = sum(1 for v in items.values() if v["met"])
        rows.setdefault((t, k["cond"]), [0, 0])
        rows[(t, k["cond"])][0] += met
        rows[(t, k["cond"])][1] += len(items)
        out.append(f"{t} {lab} {k['id']} {k['cond']:8} {met}/{len(items)}")
print("\n".join(out)); print()
print("task  without   with   difference  effect shown (>= 3)?")
for t in ["T1", "T2", "T3", "T4", "T5"]:
    wo, w = rows[(t, "without")], rows[(t, "with")]
    d = w[0] - wo[0]
    print(f"{t}    {wo[0]:>2}/{wo[1]:<3}  {w[0]:>2}/{w[1]:<3}  {d:+d}          {'yes' if d >= 3 else 'no'}")
