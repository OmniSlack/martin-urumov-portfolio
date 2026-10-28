"""
Тестове за claim_check.

Всеки тест доказва едно конкретно поведение. Най-важните са трите, които
доказват, че инструментът НЕ лъже в наша полза:
  - грешен хеш дава FAILED, не UNCHECKABLE
  - липсващ файл дава UNCHECKABLE, не VERIFIED
  - брой тестове НИКОГА не дава VERIFIED
"""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import claim_check as cc


class Base(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def write(self, name, content=""):
        """newline="" — иначе Windows превежда \\n в \\r\\n и байтовете (а значи
        и хешът) вече не са това, което тестът смята. Точно този клас грешка
        инструментът улови при първото пускане."""
        p = self.root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("w", encoding="utf-8", newline="") as f:
            f.write(content)
        return p

    def doc(self, content):
        return self.write("DOC.md", content)


class TestSha256(Base):

    def test_correct_hash_verifies(self):
        target = self.write("core.js", "console.log(1)\n")
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        d = self.doc(f"{digest}  core.js\n")
        claims = cc.scan(d, self.root)
        self.assertEqual([c.status for c in claims], [cc.VERIFIED])

    def test_wrong_hash_fails_it_does_not_go_uncheckable(self):
        self.write("core.js", "console.log(1)\n")
        wrong = "0" * 64
        d = self.doc(f"{wrong}  core.js\n")
        claims = cc.scan(d, self.root)
        self.assertEqual(claims[0].status, cc.FAILED)
        self.assertIn("реален", claims[0].detail)

    def test_missing_file_is_uncheckable_not_verified(self):
        digest = hashlib.sha256(b"x").hexdigest()
        d = self.doc(f"{digest}  nowhere.bin\n")
        claims = cc.scan(d, self.root)
        self.assertEqual(claims[0].status, cc.UNCHECKABLE)

    def test_hash_with_no_filename_on_line_is_uncheckable(self):
        digest = hashlib.sha256(b"x").hexdigest()
        d = self.doc(f"Отпечатък: `{digest}`\n")
        claims = cc.scan(d, self.root)
        self.assertEqual(claims[0].status, cc.UNCHECKABLE)

    def test_ambiguous_basename_is_not_guessed(self):
        self.write("a/notes.md", "one")
        self.write("b/notes.md", "two")
        digest = hashlib.sha256(b"one").hexdigest()
        d = self.doc(f"{digest}  notes.md\n")
        claims = cc.scan(d, self.root)
        self.assertEqual(claims[0].status, cc.UNCHECKABLE)


class TestFileLineRefs(Base):

    def test_line_within_file_verifies(self):
        self.write("q.sql", "\n".join(f"line {i}" for i in range(1, 51)) + "\n")
        d = self.doc("виж `q.sql:36-41` за проверката\n")
        claims = cc.scan(d, self.root)
        self.assertEqual(claims[0].status, cc.VERIFIED)

    def test_line_past_end_of_file_fails(self):
        self.write("q.sql", "one\ntwo\n")
        d = self.doc("виж `q.sql:900` за проверката\n")
        claims = cc.scan(d, self.root)
        self.assertEqual(claims[0].status, cc.FAILED)
        self.assertIn("900", claims[0].detail)

    def test_reference_to_missing_file_is_uncheckable(self):
        d = self.doc("виж `ghost.sql:10-12`\n")
        claims = cc.scan(d, self.root)
        self.assertEqual(claims[0].status, cc.UNCHECKABLE)

    def test_prose_colon_number_is_not_treated_as_a_reference(self):
        d = self.doc("В 18:30 бях на работа. Виж стр. 12.\n")
        kinds = [c.kind for c in cc.scan(d, self.root)]
        self.assertNotIn("file_line", kinds)


class TestTestCounts(Base):

    def test_test_counts_are_never_verified(self):
        d = self.doc("77 tests pass, 24 of them against PostgreSQL\n"
                     "EVIDENCE_UNIT.txt 53 pass\n"
                     "22/22 passing\n")
        claims = [c for c in cc.scan(d, self.root) if c.kind == "test_count"]
        self.assertTrue(claims)
        for c in claims:
            self.assertEqual(c.status, cc.UNCHECKABLE)


class TestExitCodesAndReport(Base):

    def test_exit_zero_when_nothing_failed(self):
        d = self.doc("нищо проверимо тук\n")
        rc = cc.main([str(d), "--root", str(self.root)])
        self.assertEqual(rc, 0)

    def test_exit_one_when_a_claim_failed(self):
        self.write("core.js", "x\n")
        d = self.doc(f"{'0'*64}  core.js\n")
        rc = cc.main([str(d), "--root", str(self.root)])
        self.assertEqual(rc, 1)

    def test_uncheckable_alone_does_not_fail_the_run(self):
        d = self.doc("100 tests pass\n")
        rc = cc.main([str(d), "--root", str(self.root)])
        self.assertEqual(rc, 0)

    def test_json_report_shape(self):
        self.write("core.js", "x\n")
        digest = hashlib.sha256(b"x\n").hexdigest()
        d = self.doc(f"{digest}  core.js\n5 tests pass\n")
        out = self.root / "r.json"
        cc.main([str(d), "--root", str(self.root), "--json", str(out)])
        data = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual(data["counts"][cc.VERIFIED], 1)
        self.assertEqual(data["counts"][cc.UNCHECKABLE], 1)
        self.assertEqual(len(data["claims"]), 2)
        self.assertIn("UNCHECKABLE не е PASS", data["note"])




class TestHashDoesNotProveContent(Base):
    """Хешът потвърждава цялост, не съдържание.

    Файл от чисти нули има валиден SHA-256. Манифест, който твърди точно този
    отпечатък, минава със зелено — и е прав. Затова втората ос е отделна:
    статусът остава VERIFIED, а HOLLOW се съобщава редом до него.
    """

    def test_manifest_of_zeroed_files_still_verifies_but_is_flagged(self):
        p = self.write("chunk.bin")
        p.write_bytes(b"\x00" * 4096)
        digest = hashlib.sha256(b"\x00" * 4096).hexdigest()
        d = self.doc(f"{digest}  chunk.bin\n")
        c = cc.scan(d, self.root)[0]
        self.assertEqual(c.status, cc.VERIFIED)      # хешът наистина съвпада
        self.assertEqual(c.flag, cc.HOLLOW)          # но вътре няма нищо
        self.assertIn("празен от информация", c.detail)

    def test_three_zero_files_share_one_digest(self):
        """Случаят от Recovery-2026-08-24: три имена, един отпечатък."""
        blob = b"\x00" * 1024
        digests = set()
        for n in ("a.bin", "b.bin", "c.bin"):
            self.write(f"d/{n}").write_bytes(blob)
            digests.add(hashlib.sha256(blob).hexdigest())
        self.assertEqual(len(digests), 1)

    def test_real_content_is_not_flagged(self):
        target = self.write("core.js", "console.log(1)\n")
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        c = cc.scan(self.doc(f"{digest}  core.js\n"), self.root)[0]
        self.assertEqual(c.status, cc.VERIFIED)
        self.assertIsNone(c.flag)

    def test_extension_contradicted_by_signature_is_mislabeled(self):
        """Случаят browser-service.mjs: име .wasm, съдържание PNG."""
        p = self.write("reader.wasm")
        p.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x01" * 200)
        digest = hashlib.sha256(p.read_bytes()).hexdigest()
        c = cc.scan(self.doc(f"{digest}  reader.wasm\n"), self.root)[0]
        self.assertEqual(c.status, cc.VERIFIED)
        self.assertEqual(c.flag, cc.MISLABELED)
        self.assertIn("png", c.content)

    def test_formats_without_a_stable_magic_are_not_flagged(self):
        """.md/.json/.js нямат сигнатура — липсата ѝ не е дефект."""
        for name, body in [("a.md", "# заглавие\n"), ("b.json", '{"x":1}\n')]:
            p = self.write(name, body)
            digest = hashlib.sha256(p.read_bytes()).hexdigest()
            c = cc.scan(self.doc(f"{digest}  {name}\n"), self.root)[0]
            self.assertIsNone(c.flag, f"{name} не бива да е флагнат")

    def test_strict_content_flag_controls_the_exit_code(self):
        p = self.write("chunk.bin")
        p.write_bytes(b"\x00" * 512)
        digest = hashlib.sha256(b"\x00" * 512).hexdigest()
        d = self.doc(f"{digest}  chunk.bin\n")
        self.assertEqual(cc.main([str(d), "--root", str(self.root)]), 0)
        self.assertEqual(
            cc.main([str(d), "--root", str(self.root), "--strict-content"]), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
