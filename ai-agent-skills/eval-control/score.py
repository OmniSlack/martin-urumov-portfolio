"""Unblind the grades of the control probe and tally them.  Run: python3 score.py"""
import json, pathlib
H = pathlib.Path(__file__).parent
key = json.loads((H / "grading/KEY.json").read_text())
g = json.loads((H / "grading/T3.grades.json").read_text())
tot, items = {}, {}
for lab in sorted(g):
    k = key[lab]; met = sum(1 for v in g[lab].values() if v["met"])
    tot.setdefault(k["cond"], [0, 0]); tot[k["cond"]][0] += met; tot[k["cond"]][1] += len(g[lab])
    for i, v in g[lab].items():
        items.setdefault((k["cond"], i), 0); items[(k["cond"], i)] += v["met"]
    print(f"{lab} {k['id']} {k['cond']:8} {met}/5")
print()
print("item        " + "  ".join(f"{c:>8}" for c in ["without", "control", "with"]))
for i in "12345":
    print(f"{i:<11} " + "  ".join(f"{items[(c, i)]:>6}/5" for c in ["without", "control", "with"]))
print("total       " + "  ".join(f"{tot[c][0]:>5}/{tot[c][1]}" for c in ["without", "control", "with"]))
d1 = tot["with"][0] - tot["control"][0]; d2 = tot["control"][0] - tot["without"][0]
print(f"\nwith - control    = {d1:+d}   skill content shows an effect (>= 4, fixed in advance)? {'yes' if d1 >= 4 else 'no'}")
print(f"control - without = {d2:+d}   length alone shows an effect (>= 4, fixed in advance)? {'yes' if d2 >= 4 else 'no'}")
