"""Tests for document_claim_checker.py.

Run:  python3 -m unittest test_document_claim_checker -v
"""
import hashlib
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

import document_claim_checker as dc


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


ZERO = "0" * 64


class Workspace(unittest.TestCase):
    def setUp(self):
        dc._INDEX_CACHE.clear()
        self.tmp = Path(tempfile.mkdtemp())
        self.root = self.tmp / "root"
        files = {
            "alpha.txt": "alpha\n",
            "beta.txt": "beta\n",
            "Dockerfile": "FROM x\n",
            "three.txt": "l1\nl2\nl3\n",
            "docs/report.txt": "real report\n",
            "a/x.txt": "dup A\n",
            "b/x.txt": "dup B\n",
            "other/outside.txt": "a different file with the same name\n",
        }
        for rel, body in files.items():
            p = self.root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(body)
        (self.tmp / "outside.txt").write_text("outside the root\n")

    def run_doc(self, text, *extra):
        doc = self.tmp / "doc.md"
        doc.write_text(text)
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = dc.main(["--root", str(self.root), *extra, str(doc)])
        return code, dc.scan(doc, self.root)

    def status(self, line):
        return self.run_doc(line + "\n")[1][0].status


class FixesInTheHandoff(Workspace):
    """The six fixes the 2026-09-16 handoff describes, each checked on the copy.
    The original tool is not available, so these show the fixed behaviour only."""

    def test_1_digest_pairs_with_the_right_file_on_a_two_name_line(self):
        self.assertEqual(self.status(f"| alpha.txt beta.txt | {sha('beta' + chr(10))} |"),
                         dc.VERIFIED)

    def test_2_does_not_read_outside_root(self):
        # outside.txt is outside root; its true digest must never verify
        self.assertNotEqual(self.status(f"| ../outside.txt | {sha('outside the root' + chr(10))} |"),
                            dc.VERIFIED)

    def test_3_an_existing_line_is_not_verified_content(self):
        self.assertEqual(self.status("see `three.txt:2`"), dc.REF_IN_RANGE)
        self.assertEqual(self.status("see `three.txt:9`"), dc.FAILED)

    def test_4_missing_and_ambiguous_have_different_messages(self):
        _, c1 = self.run_doc(f"| nope.txt | {ZERO} |\n")
        _, c2 = self.run_doc(f"| x.txt | {ZERO} |\n")
        self.assertEqual(c1[0].status, dc.MALFORMED)
        self.assertEqual(c2[0].status, dc.MALFORMED)
        self.assertIn("not found", c1[0].detail)
        self.assertIn("ambiguous", c2[0].detail)

    def test_5_index_is_built_once_per_root(self):
        calls = []
        real = Path.rglob
        def counting(self_, pattern):
            calls.append(pattern)
            return real(self_, pattern)
        Path.rglob = counting
        try:
            # bare names that are not at the top of root force the index lookup
            self.run_doc(f"| report.txt | {ZERO} |\n| outside.txt | {ZERO} |\n| x.txt | {ZERO} |\n")
        finally:
            Path.rglob = real
        self.assertEqual(len(calls), 1)

    def test_6_extensionless_names_are_seen(self):
        self.assertEqual(self.status(f"| Dockerfile | {sha('FROM x' + chr(10))} |"), dc.VERIFIED)


class PathsAreStatementsAboutLocation(Workspace):
    """Defect found 2026-10-26 and fixed in this copy."""

    def test_missing_path_with_a_directory_is_not_verified_by_another_file(self):
        # archive/report.txt does not exist; docs/report.txt has the same name and digest
        self.assertEqual(self.status(f"| archive/report.txt | {sha('real report' + chr(10))} |"),
                         dc.MALFORMED)

    def test_path_outside_root_is_not_failed_against_a_namesake_inside(self):
        _, claims = self.run_doc(f"| ../outside.txt | {sha('outside the root' + chr(10))} |\n")
        self.assertEqual(claims[0].status, dc.MALFORMED)
        self.assertIn("no file at this path", claims[0].detail)

    def test_the_named_path_itself_still_verifies_and_fails(self):
        self.assertEqual(self.status(f"| docs/report.txt | {sha('real report' + chr(10))} |"),
                         dc.VERIFIED)
        self.assertEqual(self.status(f"| docs/report.txt | {ZERO} |"), dc.FAILED)

    def test_a_bare_name_is_still_found_anywhere_under_root(self):
        self.assertEqual(self.status(f"| report.txt | {sha('real report' + chr(10))} |"),
                         dc.VERIFIED)

    def test_no_failed_when_another_name_on_the_line_is_missing(self):
        # the digest might belong to the missing file — not guessing
        self.assertEqual(self.status(f"| alpha.txt missing.txt | {ZERO} |"), dc.MALFORMED)


class TestCountsAndExitCodes(Workspace):
    def test_test_count_is_uncheckable(self):
        self.assertEqual(self.status("the suite: 77 tests pass"), dc.UNCHECKABLE)

    def test_exit_codes(self):
        self.assertEqual(self.run_doc(f"| alpha.txt | {sha('alpha' + chr(10))} |\n")[0], 0)
        self.assertEqual(self.run_doc(f"| alpha.txt | {ZERO} |\n")[0], 1)
        self.assertEqual(self.run_doc(f"| nope.txt | {ZERO} |\n")[0], 0)
        self.assertEqual(self.run_doc(f"| nope.txt | {ZERO} |\n", "--strict")[0], 1)
        with redirect_stderr(io.StringIO()):
            self.assertEqual(dc.main(["--root", str(self.root), str(self.tmp / "none.md")]), 2)

    def test_json_report(self):
        out = self.tmp / "r.json"
        self.run_doc(f"| alpha.txt | {ZERO} |\n77 tests\n", "--json", str(out))
        r = json.loads(out.read_text())
        self.assertEqual(r["counts"][dc.FAILED], 1)
        self.assertEqual(r["counts"][dc.UNCHECKABLE], 1)
        self.assertIn("A document does not prove itself", r["note"])


class Readonly(Workspace):
    def test_does_not_modify_the_document_or_the_files(self):
        before = {p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        self.run_doc(f"| alpha.txt | {ZERO} |\n")
        after = {p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
