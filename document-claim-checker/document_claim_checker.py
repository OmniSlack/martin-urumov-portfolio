#!/usr/bin/env python3
"""
document_claim_checker — checks the claims made IN documents against the files.

WHAT IT IS
    A script. No memory, no opinion, no authority. It reads text and files,
    computes hashes and counts lines. That is all.

HOW IT WORKS
    From a Markdown document it extracts only claims that CAN be checked
    mechanically:
      - a SHA-256 digest next to a file name
      - a reference `path:line` or `path:line-line`
    and a third kind it recognises but cannot check:
      - a test count ("77 tests pass")
    Then it goes to the disk and checks each one separately.

FIVE STATUSES, NEVER MERGED
    VERIFIED      — checked, and it is true
    FAILED        — checked, and it is NOT true, with an unambiguous pairing
    REF_IN_RANGE  — the line exists; what the document says ABOUT its content
                    has not been checked
    MALFORMED     — the document is written so that it cannot be checked:
                    ambiguous pairing, missing or ambiguous file, a path that
                    does not exist. THIS CAN BE FIXED — in the document.
    UNCHECKABLE   — this kind of claim is never statically checkable.
    A test count ("77 pass") is always UNCHECKABLE. A document saying tests pass
    is not evidence that they pass; only running them again is.

    FAILED requires an UNAMBIGUOUS pairing: exactly one digest and exactly one
    findable file on the line. When the pairing is ambiguous the result is
    MALFORMED. It does not guess — a wrong FAILED costs more than an honest
    "cannot tell", because it teaches you to ignore the tool.

HOW IT BEHAVES IN USE
    Exit 0 — no FAILED.
    Exit 1 — at least one FAILED; with --strict also on MALFORMED.
    Exit 2 — a document given on the command line does not exist.
    UNCHECKABLE and REF_IN_RANGE never raise the exit code, but are always
    counted and shown.
    Reads only files UNDER --root. Does not modify documents. Writes nowhere
    except the JSON report, if asked for one. No network.

Standard library only.

    python3 document_claim_checker.py --root . --json report.json SOURCE.md
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path, PurePath

VERIFIED = "VERIFIED"
FAILED = "FAILED"
REF_IN_RANGE = "REF_IN_RANGE"
MALFORMED = "MALFORMED"
UNCHECKABLE = "UNCHECKABLE"

STATUSES = (VERIFIED, FAILED, REF_IN_RANGE, MALFORMED, UNCHECKABLE)

_SHA_LINE = re.compile(r"\b([0-9a-fA-F]{64})\b")
_FILENAME_ON_LINE = re.compile(r"[\w./\\-]+\.[A-Za-z0-9]{1,8}")

# Files without an extension are invisible to the pattern above — it needs a
# dot. Found in real use: a manifest listing `Dockerfile` returned MALFORMED
# "no file name on the line". The list is deliberately closed: accepting any
# word as a file name would turn prose into candidates.
_EXTENSIONLESS = (
    "Dockerfile", "Containerfile", "Makefile", "Rakefile", "Gemfile",
    "Procfile", "Vagrantfile", "Jenkinsfile", "Justfile", "Brewfile",
    "LICENCE", "LICENSE", "NOTICE", "COPYING", "AUTHORS", "CODEOWNERS",
    "CHANGELOG", "README", "VERSION",
)
_EXTENSIONLESS_RE = re.compile(
    r"(?<![\w./\\-])(" + "|".join(_EXTENSIONLESS) + r")(?![\w./\\-])"
)


def _names_on_line(line: str) -> list[str]:
    """File names on the line, in order of appearance."""
    found = [(m.start(), m.group(0)) for m in _FILENAME_ON_LINE.finditer(line)
             if not re.fullmatch(r"[0-9a-fA-F.]+", m.group(0))]
    found += [(m.start(), m.group(1)) for m in _EXTENSIONLESS_RE.finditer(line)]
    return [n for _, n in sorted(found)]


_FILE_LINE_REF = re.compile(
    r"`([\w./\\-]+\.[A-Za-z0-9]{1,8}):(\d+)(?:\s*[-–]\s*(\d+))?`"
)

_TEST_COUNT = re.compile(
    r"\b(\d+)\s*(?:/\s*\d+\s*)?(?:pass(?:ing|ed)?|tests?)\b", re.IGNORECASE
)


@dataclass
class Claim:
    kind: str
    raw: str
    document: str
    line_no: int
    status: str
    detail: str
    target: str | None = None


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# --------------------------------------------------------------- lookup ------
# The index is built once per root. Before, every claim ran a full rglob,
# which made the cost claims x files.
_INDEX_CACHE: dict[Path, dict[str, list[Path]]] = {}


def _index(root: Path) -> dict[str, list[Path]]:
    root = root.resolve()
    if root not in _INDEX_CACHE:
        idx: dict[str, list[Path]] = {}
        for p in root.rglob("*"):
            if p.is_file():
                idx.setdefault(p.name, []).append(p)
        _INDEX_CACHE[root] = idx
    return _INDEX_CACHE[root]


def _has_directory(name: str) -> bool:
    return len(PurePath(name.replace("\\", "/")).parts) > 1


def find_file(root: Path, name: str) -> tuple[Path | None, str]:
    """(path, reason). The reason tells 'missing' from 'ambiguous'.

    A bare name ("report.txt") may be found anywhere under root by its name.
    A name with a directory ("docs/report.txt", "../x.txt") is a statement
    about THAT location: it is either there, or the result is "path_not_found".
    It is never matched by its base name elsewhere (defect found 2026-10-26:
    `archive/report.txt`, which did not exist, was VERIFIED against
    `docs/report.txt`)."""
    root_r = root.resolve()
    try:
        direct = (root / name).resolve()
        # is_relative_to, NOT str.startswith: '/x/ab_evil' starts with '/x/ab'
        # but is not inside it.
        if direct.is_file() and direct.is_relative_to(root_r):
            return direct, "direct"
    except OSError:
        pass

    if _has_directory(name):
        return None, "path_not_found"

    hits = _index(root_r).get(name, [])
    if len(hits) == 1:
        return hits[0], "basename"
    if len(hits) == 0:
        return None, "not_found"
    return None, f"ambiguous:{len(hits)}"


def _lookup_detail(name: str, reason: str) -> str:
    if reason.startswith("ambiguous:"):
        n = reason.split(":", 1)[1]
        return f"ambiguous name: {n} files named {Path(name).name} under root"
    if reason == "path_not_found":
        return f"no file at this path under root: {name}"
    return f"file not found under root: {name}"


# ----------------------------------------------------------------- checks ----
def check_sha(root: Path, digest: str, line: str, doc: str, ln: int,
              n_digests_on_line: int) -> Claim:
    digest = digest.lower()
    short = digest[:16] + "…"
    candidates = _names_on_line(line)
    if not candidates:
        return Claim("sha256", short, doc, ln, MALFORMED,
                     "no file name on the line next to the digest")

    resolved: list[tuple[str, Path]] = []
    reasons: list[str] = []
    for name in candidates:
        path, why = find_file(root, name)
        if path is not None:
            resolved.append((name, path))
        else:
            reasons.append(_lookup_detail(name, why))

    if not resolved:
        return Claim("sha256", short, doc, ln, MALFORMED,
                     "; ".join(reasons[:2]) or "no findable file on the line")

    # A match with ANY file on the line is unambiguous evidence.
    for name, path in resolved:
        if sha256_of(path) == digest:
            return Claim("sha256", short, doc, ln, VERIFIED,
                         "digest matches", str(path))

    # Nothing matches. FAILED only with an unambiguous 1 digest : 1 file pairing.
    if len(resolved) == 1 and n_digests_on_line == 1 and not reasons:
        name, path = resolved[0]
        return Claim("sha256", short, doc, ln, FAILED,
                     f"expected {short} , actual {sha256_of(path)[:16]}…", str(path))

    return Claim("sha256", short, doc, ln, MALFORMED,
                 f"ambiguous pairing: {n_digests_on_line} digest(s) against "
                 f"{len(resolved)} found and {len(reasons)} missing file(s) on the line — "
                 f"not guessing which goes with which")


def check_file_line(root: Path, name: str, start: int, end: int | None,
                    doc: str, ln: int) -> Claim:
    ref = f"{name}:{start}" + (f"-{end}" if end else "")
    path, why = find_file(root, name)
    if path is None:
        return Claim("file_line", ref, doc, ln, MALFORMED,
                     _lookup_detail(name, why))
    try:
        total = sum(1 for _ in path.open("rb"))
    except OSError as e:
        return Claim("file_line", ref, doc, ln, MALFORMED, f"unreadable: {e}", str(path))

    need = end or start
    if need > total:
        return Claim("file_line", ref, doc, ln, FAILED,
                     f"points to line {need}, the file has {total}", str(path))

    # The line exists. What the document SAYS about it has not been checked.
    return Claim("file_line", ref, doc, ln, REF_IN_RANGE,
                 f"the line exists ({total} lines in total); the claim about its "
                 f"content is not machine-checked", str(path))


def scan(doc_path: Path, root: Path) -> list[Claim]:
    claims: list[Claim] = []
    doc = doc_path.name
    text = doc_path.read_text(encoding="utf-8", errors="replace")
    for ln, line in enumerate(text.splitlines(), 1):
        digests = _SHA_LINE.findall(line)
        for digest in digests:
            claims.append(check_sha(root, digest, line, doc, ln, len(digests)))
        for name, start, end in _FILE_LINE_REF.findall(line):
            claims.append(check_file_line(root, name, int(start),
                                          int(end) if end else None, doc, ln))
        for count in _TEST_COUNT.findall(line):
            claims.append(Claim("test_count", f"{count} tests", doc, ln, UNCHECKABLE,
                                "a test count needs the suite to be run again"))
    return claims


def main(argv=None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass

    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("docs", nargs="+", help="Markdown documents to check")
    ap.add_argument("--root", default=".", help="directory the files are looked up under")
    ap.add_argument("--json", dest="json_out", help="write a JSON report here")
    ap.add_argument("--strict", action="store_true",
                    help="MALFORMED also raises exit 1 (for CI)")
    args = ap.parse_args(argv)

    root = Path(args.root).resolve()
    all_claims: list[Claim] = []
    for d in args.docs:
        p = Path(d)
        if not p.is_file():
            print(f"[!] no such document: {d}", file=sys.stderr)
            return 2
        all_claims.extend(scan(p, root))

    counts = {s: 0 for s in STATUSES}
    for c in all_claims:
        counts[c.status] += 1

    marks = {VERIFIED: "OK  ", FAILED: "FAIL", REF_IN_RANGE: "REF ",
             MALFORMED: "DOC!", UNCHECKABLE: "??  "}
    for c in all_claims:
        print(f"{marks[c.status]} {c.document}:{c.line_no}  {c.kind:<10} "
              f"{c.raw:<28} {c.detail}")

    print("-" * 78)
    print(f"VERIFIED {counts[VERIFIED]} · FAILED {counts[FAILED]} · "
          f"REF_IN_RANGE {counts[REF_IN_RANGE]} · MALFORMED {counts[MALFORMED]} · "
          f"UNCHECKABLE {counts[UNCHECKABLE]} · total {len(all_claims)}")

    if args.json_out:
        report = {
            "root": str(root),
            "documents": args.docs,
            "counts": counts,
            "claims": [asdict(c) for c in all_claims],
            "note": "UNCHECKABLE is not PASS. REF_IN_RANGE is not PASS. "
                    "A document does not prove itself.",
        }
        Path(args.json_out).write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"JSON report: {args.json_out}")

    bad = counts[FAILED] + (counts[MALFORMED] if args.strict else 0)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
