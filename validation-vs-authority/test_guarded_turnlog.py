"""
Тестове за guarded_turnlog.

Модулът нямаше нито един тест. Затова оцеля дефект, при който CLI-то
разкриваше един ред, а подаваше за запис друг — и всеки запис падаше.

Двата най-важни теста:
  - това, което е разкрито, е точно това, което се записва
  - без изрично „да" не се записва нищо
"""
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import execution_ticket as et
import guarded_turnlog as gt


class Base(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.log = Path(self._tmp.name) / "turn_log.jsonl"
        self._real_log = gt.LOG
        gt.LOG = self.log
        # `disclose` печата рамка с ┌│└. Под unittest stdout не е минал през
        # reconfigure(utf-8) — това става само в __main__ — и на Windows
        # конзола с cp1251 печатът гърми с UnicodeEncodeError. Хващаме изхода
        # в буфер, за да тестваме поведението, а не кодовата страница.
        self._cap = contextlib.redirect_stdout(io.StringIO())
        self._cap.__enter__()

    def tearDown(self):
        self._cap.__exit__(None, None, None)
        gt.LOG = self._real_log
        self._tmp.cleanup()

    def rows(self):
        if not self.log.exists():
            return []
        return [json.loads(l) for l in
                self.log.read_text(encoding="utf-8").splitlines() if l.strip()]


class TestDisclosureMatchesWrite(Base):

    def test_written_line_is_byte_for_byte_the_disclosed_line(self):
        """Регресия: `append` получаваше наново пресметнат payload с нов `ts`,
        затова digest-ът не съвпадаше и записът винаги падаше."""
        ticket, line, payload = gt.issue_ticket("START", "проба", human_says_yes=True)
        gt.append(ticket, line, payload)
        self.assertEqual(self.log.read_text(encoding="utf-8"), line)
        self.assertEqual(self.rows()[0], payload)

    def test_a_recomputed_payload_is_refused(self):
        """Билетът важи само за своя payload. Нов payload = нов digest = отказ."""
        ticket, line, _ = gt.issue_ticket("START", "проба", human_says_yes=True)
        with self.assertRaises(et.TicketError):
            gt.append(ticket, line, gt._payload("START", "проба"))
        self.assertEqual(self.rows(), [])


class TestNoTicketNoWrite(Base):

    def test_without_yes_no_ticket_and_no_write(self):
        ticket, line, payload = gt.issue_ticket("END", "без разрешение",
                                                human_says_yes=False)
        self.assertIsNone(ticket)
        self.assertEqual(self.rows(), [])

    def test_append_without_a_ticket_raises(self):
        payload = gt._payload("END", "директно")
        line = json.dumps(payload, ensure_ascii=False) + "\n"
        with self.assertRaises(et.TicketError):
            gt.append(None, line, payload)
        self.assertEqual(self.rows(), [])

    def test_ticket_is_single_use(self):
        ticket, line, payload = gt.issue_ticket("START", "веднъж", human_says_yes=True)
        gt.append(ticket, line, payload)
        with self.assertRaises(et.TicketError):
            gt.append(ticket, line, payload)
        self.assertEqual(len(self.rows()), 1)


class TestAppendOnly(Base):

    def test_second_entry_appends_and_measures_delta(self):
        t1, l1, p1 = gt.issue_ticket("START", "едно", human_says_yes=True)
        gt.append(t1, l1, p1)
        t2, l2, p2 = gt.issue_ticket("END", "две", human_says_yes=True)
        gt.append(t2, l2, p2)
        rows = self.rows()
        self.assertEqual([r["kind"] for r in rows], ["START", "END"])
        self.assertIsNone(rows[0]["delta_prev_s"])
        self.assertIsNotNone(rows[1]["delta_prev_s"])
        self.assertGreaterEqual(rows[1]["delta_prev_s"], 0)

    def test_earlier_lines_are_never_rewritten(self):
        t1, l1, p1 = gt.issue_ticket("START", "първи", human_says_yes=True)
        gt.append(t1, l1, p1)
        first = self.log.read_text(encoding="utf-8")
        t2, l2, p2 = gt.issue_ticket("END", "втори", human_says_yes=True)
        gt.append(t2, l2, p2)
        self.assertTrue(self.log.read_text(encoding="utf-8").startswith(first))


class TestFlagParsing(Base):

    def test_yes_flag_does_not_leak_into_the_note(self):
        """Регресия: `note.replace('--yes','')` чистеше само единия от двата
        пътя, така че записаната бележка съдържаше флага."""
        argv = ["START", "четене", "на", "delta_t.py", "--yes"]
        yes = "--yes" in argv[1:]
        note = " ".join(a for a in argv[1:] if a != "--yes")
        self.assertTrue(yes)
        self.assertEqual(note, "четене на delta_t.py")
        self.assertNotIn("--yes", note)


if __name__ == "__main__":
    unittest.main(verbosity=2)
