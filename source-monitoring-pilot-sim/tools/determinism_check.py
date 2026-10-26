#!/usr/bin/env python3
"""Determinism check for source-monitoring-pilot-sim (portfolio evidence).

Reruns unit 30 of the r5 and r6 smoke runs twice each in a clean temporary
directory and compares (a) the two fresh runs with each other and (b) each
fresh run with the shipped reference files. Prints the first differing row.
Usage: python3 determinism_check.py <package_root>
"""
import csv, hashlib, os, subprocess, sys, tempfile

ROOT = os.path.abspath(sys.argv[1])
R5 = os.path.join(ROOT, "analysis_R", "power_full_run_r5.R")
R6 = os.path.join(ROOT, "analysis_R", "power_full_run_r6.R")
CFG = os.path.join(ROOT, "config", "power_simulation.json")
SMOKE5 = os.path.join(ROOT, "outputs", "r_validation", "power_r5_smoke")
SMOKE6 = os.path.join(ROOT, "outputs", "r_validation", "power_r6_smoke")


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def run(script, out):
    r = subprocess.run(["Rscript", script, "run", out, "4", "1", "30"],
                       capture_output=True, text=True, cwd=ROOT)
    if r.returncode != 0:
        print("Rscript failed:", r.stderr[-500:])
        sys.exit(1)
    return out


def first_diff(a, b):
    ra = list(csv.DictReader(open(a)))
    rb = list(csv.DictReader(open(b)))
    for i, (x, y) in enumerate(zip(ra, rb)):
        for k in x:
            if k != "elapsed_s" and x[k] != y.get(k):
                return f"row {i + 1} column {k}: {x[k]} (reference) vs {y.get(k)} (this run)"
    return "no differing cell"


for label, script, smoke in (("r5", R5, SMOKE5), ("r6", R6, SMOKE6)):
    print(f"== {label}: Rscript {os.path.relpath(script, ROOT)} run <tmp> 4 1 30  (unit 30, 4 sims)")
    runs = [run(script, tempfile.mkdtemp()) for _ in range(2)]
    res = [os.path.join(d, "units", "unit_030.csv") for d in runs]
    ref = os.path.join(smoke, "units", "unit_030.csv")
    print(f"  fresh run 1 == fresh run 2 (results):        {sha(res[0]) == sha(res[1])}")
    print(f"  fresh run == shipped reference (results):    {sha(res[0]) == sha(ref)}")
    print(f"    shipped  sha256 {sha(ref)[:16]}…  fresh {sha(res[0])[:16]}…")
    print(f"    first difference: {first_diff(ref, res[0])}")
    att_ref = os.path.join(smoke, "units", "unit_030_attempts.csv")
    att_new = os.path.join(runs[0], "units", "unit_030_attempts.csv")
    print(f"    attempts (modulo elapsed_s): {first_diff(att_ref, att_new)}")
    if label == "r6":
        j_ref = os.path.join(smoke, "units", "unit_030_attempts_full.jsonl")
        j_new = os.path.join(runs[0], "units", "unit_030_attempts_full.jsonl")
        print(f"  fresh run == shipped reference (JSONL):      {sha(j_ref) == sha(j_new)}")
print("== environment fingerprint recorded in the shipped unit_030_meta.json (r6):")
import json
m = json.load(open(os.path.join(SMOKE6, "units", "unit_030_meta.json")))
print("  shipped:", m.get("environment"))
r = subprocess.run(["Rscript", "-e",
                    'cat(R.version.string, "|", R.version$platform, "| lme4", as.character(packageVersion("lme4")), "| Matrix", as.character(packageVersion("Matrix")), "| jsonlite", as.character(packageVersion("jsonlite")), "| BLAS", sessionInfo()$BLAS, "| LAPACK", sessionInfo()$LAPACK, "| La", La_version(), "\\n")'],
                   capture_output=True, text=True)
print("  this run:", r.stdout.strip())
cpu = [l for l in open("/proc/cpuinfo") if l.startswith("model name")]
print("  CPU (not part of the fingerprint):", cpu[0].split(":", 1)[1].strip() if cpu else "unknown")
