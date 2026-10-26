"""Score every pass and the pre-registered combinations against the key.  Run: python3 score.py"""
import json, re, pathlib
H = pathlib.Path(__file__).parent
key = {f"{k['file']}:{k['line']}" for k in json.loads((H / "ANSWER_KEY.json").read_text())}
def found(rid):
    return set(re.findall(r"unit-log-\d\.txt:\d+", (H / f"runs/{rid}.answer.md").read_text()))
P = {r: found(r) for r in json.loads((H / "RUNS.json").read_text())}
print("pass   hits/20  false+")
for r, s in P.items():
    print(f"{r:<6} {len(s & key):>4}     {len(s - key):>3}")
def total(pairs): return sum(len((a | b) & key) for a, b in pairs)
A = sum(len(P[f"F{i}"] & key) for i in range(1, 6))
B = total([(P[f"F{i}"], P[f"F{i % 5 + 1}"]) for i in range(1, 6)])
C = total([(P[f"F{i}"], P[f"R{i}"]) for i in range(1, 6)])
D = total([(P[f"FC{i}"], P[f"RC{i}"]) for i in range(1, 6)])
print(f"\nA one forward pass          {A}/100")
print(f"B two passes, same order    {B}/100")
print(f"C forward + reverse         {C}/100")
print(f"D both with checkpoints     {D}/100")
print(f"\nC - B = {C - B:+d} (>= 5 fixed in advance)   D - C = {D - C:+d} (>= 5)")
print("A >= 95: the material was too easy; no difference can be shown." if A >= 95 else "")
