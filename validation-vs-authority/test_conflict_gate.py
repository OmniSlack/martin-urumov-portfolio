"""
Тестове за conflict_gate.

Най-важните два доказват, че инструментът НЕ разрешава спор тихо:
  - хеши, различаващи се едва след 16-ия символ, дават CONFLICT, не AGREED
  - твърдения без цел не се събират в обща група и не дават фалшив CONFLICT
"""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import claim_check as cc
import conflict_gate as cg


class Base(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def write(self, name, content=""):
        p = self.root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("w", encoding="utf-8", newline="") as f:
            f.write(content)
        return p

    def verdicts(self, *docs):
        claims = []
        for d in docs:
            claims.extend(cc.scan(d, self.root))
        groups = cg.group_sha_claims(claims)
        return {t: cg.adjudicate(t, cs, self.root) for t, cs in groups.items()}


class TestTruncationDoesNotHideConflict(Base):

    def test_digests_differing_after_16_chars_are_a_conflict(self):
        """Регресия: сравнението вървеше по отрязания до 16 символа `raw`,
        така че два различни хеша изглеждаха еднакви и даваха AGREED."""
        self.write("core.js", "x\n")
        prefix = "a" * 16
        a = prefix + "1" * 48
        b = prefix + "2" * 48
        da = self.write("A.md", f"{a}  core.js\n")
        db = self.write("B.md", f"{b}  core.js\n")

        v = self.verdicts(da, db)["core.js"]
        self.assertEqual(v["verdict"], cg.CONFLICT)
        self.assertEqual(len(v["digests"]), 2)

    def test_report_carries_full_digests_not_truncated(self):
        self.write("core.js", "x\n")
        d = self.write("A.md", f"{'a' * 64}  core.js\n")
        v = self.verdicts(d)["core.js"]
        self.assertEqual(v["digests"], ["a" * 64])

    def test_identical_digests_agree(self):
        self.write("core.js", "x\n")
        digest = hashlib.sha256(b"x\n").hexdigest()
        da = self.write("A.md", f"{digest}  core.js\n")
        db = self.write("B.md", f"{digest}  core.js\n")
        self.assertEqual(self.verdicts(da, db)["core.js"]["verdict"], cg.AGREED)


class TestGroupingByTarget(Base):

    def test_hashes_without_a_filename_do_not_form_a_group(self):
        """Регресия: резервният ключ беше detail.split(':')[-1]. За detail без
        двоеточие това е цялото изречение, което сля несвързани твърдения."""
        a, b = "a" * 64, "b" * 64
        da = self.write("A.md", f"Отпечатък: `{a}`\n")
        db = self.write("B.md", f"Отпечатък: `{b}`\n")
        self.assertEqual(self.verdicts(da, db), {})

    def test_missing_files_group_by_their_own_name(self):
        a, b = "a" * 64, "b" * 64
        da = self.write("A.md", f"{a}  ghost_one.bin\n")
        db = self.write("B.md", f"{b}  ghost_two.bin\n")
        v = self.verdicts(da, db)
        self.assertEqual(set(v), {"ghost_one.bin", "ghost_two.bin"})
        for r in v.values():
            self.assertEqual(r["verdict"], cg.SINGLE)

    def test_two_documents_disagreeing_about_a_missing_file_stay_open(self):
        da = self.write("A.md", f"{'a' * 64}  ghost.bin\n")
        db = self.write("B.md", f"{'b' * 64}  ghost.bin\n")
        v = self.verdicts(da, db)["ghost.bin"]
        self.assertEqual(v["verdict"], cg.CONFLICT)
        self.assertIsNone(v["resolution"])


class TestResolutionByMeasurement(Base):

    def test_conflict_is_replaced_by_measurement_when_file_exists(self):
        target = self.write("core.js", "console.log(1)\n")
        actual = hashlib.sha256(target.read_bytes()).hexdigest()
        da = self.write("A.md", f"{actual}  core.js\n")
        db = self.write("B.md", f"{'0' * 64}  core.js\n")
        v = self.verdicts(da, db)["core.js"]
        self.assertEqual(v["verdict"], cg.CONFLICT)
        self.assertEqual(v["resolution"]["measured_sha256"], actual)

    def test_neither_document_wins_by_order_or_recency(self):
        """Обръщането на реда на документите не сменя присъдата."""
        self.write("core.js", "console.log(1)\n")
        da = self.write("A.md", f"{'1' * 64}  core.js\n")
        db = self.write("B.md", f"{'2' * 64}  core.js\n")
        first = self.verdicts(da, db)["core.js"]
        second = self.verdicts(db, da)["core.js"]
        self.assertEqual(first, second)
        self.assertEqual(first["verdict"], cg.CONFLICT)


class TestExitCodes(Base):

    def test_exit_three_on_conflict(self):
        self.write("core.js", "x\n")
        da = self.write("A.md", f"{'1' * 64}  core.js\n")
        db = self.write("B.md", f"{'2' * 64}  core.js\n")
        rc = cg.main([str(da), str(db), "--root", str(self.root)])
        self.assertEqual(rc, cg.EXIT_CONFLICT)

    def test_exit_one_on_failed_without_conflict(self):
        self.write("core.js", "x\n")
        d = self.write("A.md", f"{'0' * 64}  core.js\n")
        rc = cg.main([str(d), "--root", str(self.root)])
        self.assertEqual(rc, cg.EXIT_FAILED)

    def test_exit_zero_when_everything_agrees(self):
        target = self.write("core.js", "x\n")
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        da = self.write("A.md", f"{digest}  core.js\n")
        db = self.write("B.md", f"{digest}  core.js\n")
        rc = cg.main([str(da), str(db), "--root", str(self.root)])
        self.assertEqual(rc, cg.EXIT_OK)

    def test_json_report_shape(self):
        self.write("core.js", "x\n")
        da = self.write("A.md", f"{'1' * 64}  core.js\n")
        db = self.write("B.md", f"{'2' * 64}  core.js\n")
        out = self.root / "r.json"
        cg.main([str(da), str(db), "--root", str(self.root), "--json", str(out)])
        data = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual(len(data["verdicts"]), 1)
        self.assertEqual(data["verdicts"][0]["verdict"], cg.CONFLICT)
        self.assertIn("мнозинство", data["note"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
