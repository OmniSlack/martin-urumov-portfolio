#!/usr/bin/env python3
"""
The whole audit, in one file, for Colab.

Drop it in a cell, upload documents, and it reports where each one claims more
than it carries — the same rules as overclaim-scanner.js, ported so they run
without Node. (The original docstring also promised "the earliest-date search
from timeline.py"; that search was never in this file. For it, use
earliest-mention.py.)

English input only: the original also matched Bulgarian equivalents of each
pattern; those alternatives were removed with the translation.

    # Colab, three lines:
    from google.colab import files
    up = files.upload()            # .txt .md .html .docx .json .mbox
    exec(open('overclaim-audit-colab.py').read())

Standard library only. Nothing is uploaded anywhere. It runs on a fifteen-year-
old laptop in about a second.

⚠️ WHAT IT DOES AND DOES NOT

It finds the SHAPES in which unfounded confidence travels: a figure with no
source beside it, an appeal to authority naming no authority, an absolute with
nothing enforcing it, a priority claim, a word asking the reader to skip the
supporting step, and — over the whole document — uniform confidence with no
markers anywhere.

It cannot tell you what is true. A perfectly sourced sentence can be false and
a bare assertion can be right. This reports form, and form is not truth.
"""

import io
import json
import os
import re
import sys
import zipfile
from collections import defaultdict

# ── rules ────────────────────────────────────────────────────────────────────
# Each was narrowed after over-firing on its first run; the narrowing is the
# reason each pattern looks fussier than it needs to.

RULES = [
    dict(
        id="NUMBER_WITHOUT_SOURCE",
        # A figure with a unit or percent, on a line naming nothing that made it.
        test=lambda l: bool(re.search(r"(?:^|[\s(])\d[\d\s.,]*\s*(?:%|times|x|×|points|bpm|Hz|GB|TB|ms|K\b)", l, re.I))
        and not re.search(r"\[|\(20\d\d|\bet al\b|source|measured|according to", l, re.I)
        and not re.search(r"`[^`]*\b(node|python3?|git|npm|curl|grep)\b[^`]*`", l, re.I),
        says="A figure with the authority of measurement and nothing beside it that produced it.",
        fix="Name the command, the study or the record — or say 'roughly' and mean it.",
    ),
    dict(
        id="HEDGE_WITHOUT_A_NAME",
        test=lambda l: bool(re.search(
            r"\b(studies show|research shows|it is (well )?known|experts (say|agree)|"
            r"scientists (say|believe))\b", l, re.I)),
        says="An appeal to authority that names no authority — a citation's shape with none inside.",
        fix="Name one: author, year, and what was actually measured. Or say 'I think'.",
    ),
    dict(
        id="ABSOLUTE",
        # Legitimate when something enforces it; a line naming its mechanism is exempt.
        test=lambda l: bool(re.search(
            r"\b(always|never|every single|proven|guaranteed|impossible to)\w*\b", l, re.I))
        and not re.search(r"Gate \d|`[a-zA-Z_]+\(|test|fail-closed|enforced|invariant|\bcode\b", l, re.I),
        says="An absolute with nothing named that enforces it.",
        fix="State the condition: 'under X, this held in N of M cases'.",
    ),
    dict(
        id="NOVELTY_CLAIM",
        # Only the priority sense; "the first mismatch" is an ordinal and is not a claim.
        test=lambda l: bool(re.search(
            r"\b(first ever|first (ever )?to\b|first in the world|unprecedented|revolutionary|"
            r"nobody has ever|no one has ever)\w*", l, re.I)),
        says="A novelty claim. It is almost never checked.",
        fix="Priority needs a timestamp you cannot move. Give the date and where it is recorded.",
    ),
    dict(
        id="SELF_EVIDENCE",
        test=lambda l: bool(re.search(
            r"\b(obviously|clearly|of course|needless to say)\b", l, re.I)),
        says="A word asking the reader to skip the step where the claim is supported.",
        fix="Delete the word. If the claim stands without it, nothing was lost.",
    ),
    dict(
        id="METAPHOR_AS_FACT",
        # The failure the owner's confidence ladder forbids at level 0 (🔵):
        # never turn the metaphor into a scientific fact.
        test=lambda l: bool(re.search(
            r"\b(precise[,]? literal|literally the|is exactly the|"
            r"precisely the (model|mechanism))\b", l, re.I)),
        says="An image presented as a mechanism. The confidence ladder's level 0 raised to its top.",
        fix="Say 'as an image' or give the mechanism. One of the two, not both at once.",
    ),
]

MARKER = re.compile(r"🟢|🟡|🟠|🔴|🔵|⚪|\bSC\b|Established|Probable|Hypothesis|Metaphor|Unverified")

# ── readers ──────────────────────────────────────────────────────────────────

def read_any(path):
    """Plain text out of whatever was dropped in."""
    ext = os.path.splitext(path)[1].lower()
    if ext == ".docx":
        with zipfile.ZipFile(path) as z:
            xml = z.read("word/document.xml").decode("utf8", "replace")
        xml = re.sub(r"</w:p>", "\n", xml)
        return re.sub(r"<[^>]+>", "", xml)
    if ext in (".html", ".htm"):
        t = open(path, encoding="utf8", errors="replace").read()
        t = re.sub(r"(?s)<(script|style).*?</\1>", "", t)
        t = re.sub(r"<[^>]+>", " ", t)
        return re.sub(r"[ \t]{2,}", " ", t)
    return open(path, encoding="utf8", errors="replace").read()

# ── the audit ────────────────────────────────────────────────────────────────

def audit(path):
    text = read_any(path)
    lines = text.split("\n")

    # A fenced block whose own lines carry a command is a sourced block: the
    # command sits a line or two above, where a command belongs. Reading line
    # by line could not see that, and flagged sourced figures as unsourced.
    sourced = [False] * len(lines)
    open_at = -1
    for i, l in enumerate(lines):
        if not re.match(r"^\s*```", l):
            continue
        if open_at == -1:
            open_at = i
            continue
        body = lines[open_at:i + 1]
        if any(re.search(r"^\s*\$ |\b(node|python3?|git|npm|curl)\b", b) for b in body):
            for j in range(open_at, i + 1):
                sourced[j] = True
        open_at = -1

    findings = []
    for i, line in enumerate(lines):
        if len(line.strip()) < 12:
            continue
        for r in RULES:
            if r["id"] == "NUMBER_WITHOUT_SOURCE" and sourced[i]:
                continue
            if r["test"](line):
                findings.append((r, i + 1, line.strip()))

    substantive = sum(1 for l in lines if len(l.strip()) > 40)
    marked = sum(1 for l in lines if MARKER.search(l))
    uniform = substantive >= 15 and marked == 0

    # Repetition is not corroboration: the same sentence restated is one source.
    seen, restated = {}, []
    for i, line in enumerate(lines):
        key = re.sub(r"[^\w ]", "", line.strip().lower())[:70]
        if len(key) < 30:
            continue
        if key in seen:
            restated.append((i + 1, seen[key], line.strip()[:70]))
        else:
            seen[key] = i + 1

    return dict(lines=len(lines), substantive=substantive, marked=marked,
                uniform=uniform, findings=findings, restated=restated)


def report(path, quiet=False):
    r = audit(path)
    print(f"\n{'─' * 72}\nSCAN — {os.path.basename(path)}")
    print(f"{r['lines']} lines · {r['substantive']} substantive · "
          f"{r['marked']} carrying a confidence marker\n")

    if r["uniform"]:
        print("UNIFORM_CONFIDENCE")
        print("  A long text with no confidence marker anywhere. Uneven truth at one")
        print("  volume is the main way a falsehood passes for a fact.")
        if not quiet:
            print("  FIX: mark each claim at its own strength — established, probable,")
            print("       possible, hypothesis, metaphor, unverified.")
        print("")

    by_rule = defaultdict(list)
    for rule, ln, txt in r["findings"]:
        by_rule[rule["id"]].append((ln, txt, rule))
    for rid, items in by_rule.items():
        rule = items[0][2]
        print(f"{rid}  ×{len(items)}")
        print(f"  {rule['says']}")
        for ln, txt, _ in items[:4]:
            print(f"    line {ln}: {txt[:64]}")
        if len(items) > 4:
            print(f"    ... and {len(items) - 4} more")
        if not quiet:
            print(f"  FIX: {rule['fix']}")
        print("")

    for ln, first, txt in r["restated"]:
        print(f"RESTATED  line {ln} repeats line {first}")
        print(f"    {txt}")
        print("  Repetition is not independent corroboration.\n")

    total = len(r["findings"]) + len(r["restated"]) + (1 if r["uniform"] else 0)
    print("Nothing flagged." if total == 0 else f"{total} finding(s).")
    return total


# ── run over whatever is in the folder ───────────────────────────────────────

if __name__ == "__main__" or "get_ipython" in dir():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    targets = []
    if os.path.isfile(root):
        targets = [root]
    for dirpath, _, names in os.walk(root):
        for n in names:
            if os.path.splitext(n)[1].lower() in (".txt", ".md", ".html", ".htm", ".docx"):
                targets.append(os.path.join(dirpath, n))

    if not targets:
        print("No .txt, .md, .html or .docx found here.")
        print("In Colab: from google.colab import files; files.upload()")
    else:
        grand = sum(report(t) for t in sorted(targets))
        print(f"\n{'═' * 72}")
        print(f"{len(targets)} document(s), {grand} finding(s) in total.")
        print("\nThis finds the SHAPE of overclaiming. It cannot tell you what is true.")
