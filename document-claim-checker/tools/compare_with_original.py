#!/usr/bin/env python3
"""Compare this copy with the original claim_check_fixed.py (handoff of 2026-09-16).

Part 1: 400 generated claim lines that the 2026-10-26 fix does not touch
        (bare names, existing paths, test counts, line references) — the two
        tools must give identical statuses and the same exit code.
Part 2: the cases the fix is about — the two tools must differ, and the copy
        must not report VERIFIED or FAILED for a file the document did not name.

Usage: python3 tools/compare_with_original.py <path to claim_check_fixed.py>
"""
import hashlib, json, os, random, subprocess, sys, tempfile
from collections import Counter

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIG, NEW = sys.argv[1], os.path.join(HERE, "document_claim_checker.py")


def run(tool, root, doc):
    out = tempfile.mktemp(suffix=".json")
    p = subprocess.run([sys.executable, "-I", tool, "--root", root, "--json", out, doc],
                       capture_output=True, text=True)
    claims = json.load(open(out))["claims"]
    os.remove(out)
    return p.returncode, claims


random.seed(1)
tmp = tempfile.mkdtemp(); root = os.path.join(tmp, "root"); os.makedirs(root + "/d")
names = []
for i in range(30):
    n = f"f{i}.txt" if i % 3 else f"d/g{i}.md"
    open(os.path.join(root, n), "w").write(f"body {i}\n" * (i % 5 + 1)); names.append(n)
open(os.path.join(root, "Dockerfile"), "w").write("FROM x\n"); names.append("Dockerfile")
h = lambda n: hashlib.sha256(open(os.path.join(root, n), "rb").read()).hexdigest()
lines = []
for _ in range(400):
    n = random.choice(names); bare = os.path.basename(n); r = random.random()
    if r < 0.3: lines.append(f"| {bare} | {h(n)} |")
    elif r < 0.5: lines.append(f"| {bare} | {'%064x' % random.getrandbits(256)} |")
    elif r < 0.6:
        a, b = random.sample(names, 2); lines.append(f"| {os.path.basename(a)} {os.path.basename(b)} | {h(b)} |")
    elif r < 0.75: lines.append(f"see `{bare}:{random.randint(1, 8)}`")
    elif r < 0.85: lines.append(f"{random.randint(1, 300)} tests pass")
    else: lines.append(f"| {n} | {h(n)} |")
doc = os.path.join(tmp, "doc.md"); open(doc, "w").write("\n".join(lines) + "\n")
(ea, a), (eb, b) = run(ORIG, root, doc), run(NEW, root, doc)
sa, sb = [c["status"] for c in a], [c["status"] for c in b]
print(f"Part 1: {len(lines)} lines, {len(sa)} claims; exit {ea} vs {eb}; statuses identical: {sa == sb}")
print("  original:", dict(Counter(sa)))
print("  copy:    ", dict(Counter(sb)))

tmp = tempfile.mkdtemp(); root = os.path.join(tmp, "root")
os.makedirs(root + "/docs"); os.makedirs(root + "/other")
open(os.path.join(root, "docs/report.txt"), "w").write("real report\n")
open(os.path.join(tmp, "outside.txt"), "w").write("outside the root\n")
open(os.path.join(root, "other/outside.txt"), "w").write("a different file\n")
open(os.path.join(root, "alpha.txt"), "w").write("alpha\n")
d = lambda s: hashlib.sha256(s.encode()).hexdigest()
cases = [
    ("path that does not exist, namesake elsewhere", f"| archive/report.txt | {d('real report' + chr(10))} |"),
    ("path outside root, namesake inside", f"| ../outside.txt | {d('outside the root' + chr(10))} |"),
    ("second name on the line is missing", f"| alpha.txt missing.txt | {'0' * 64} |"),
]
print("Part 2: the cases the fix is about")
for label, line in cases:
    doc = os.path.join(tmp, "c.md"); open(doc, "w").write(line + "\n")
    (_, a), (_, b) = run(ORIG, root, doc), run(NEW, root, doc)
    print(f"  {label:<46} original: {a[0]['status']:<9} copy: {b[0]['status']}")
