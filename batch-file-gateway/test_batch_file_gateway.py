"""
Locks in the fix: the DLP check must run on the ISOLATED text, not the raw file.

The scenario is the one the old code failed: a key smuggled with zero-width
characters. Raw, the pattern does not match. After boundary isolation strips
the invisible characters, it does. Code that scans the raw content passes the
file through; code that scans the isolated text blocks it.
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from batch_file_gateway import BatchFileGateway  # noqa: E402

ZERO_WIDTH = "​‌‍﻿"
KEY_PATTERN = re.compile(r"\bsk-proj-[A-Za-z0-9]{16,}\b")


class StubGuard:
    """Minimal stand-in for the real security_guard."""

    def __init__(self):
        self.evaluated_text = None  # what evaluate_output actually received

    def sanitize_input_boundary(self, content):
        return content.translate({ord(c): None for c in ZERO_WIDTH})

    def evaluate_output(self, text):
        self.evaluated_text = text
        match = KEY_PATTERN.search(text)
        if match:
            return "", True, f"api key detected: {match.group()[:10]}…"
        return text, False, None


class StubCoordinator:
    def __init__(self):
        self.security_guard = StubGuard()


def _gateway(tmp_path):
    coordinator = StubCoordinator()
    return BatchFileGateway(
        input_dir=tmp_path / "in", output_dir=tmp_path / "out", coordinator=coordinator
    ), coordinator


def test_dlp_runs_on_isolated_text_not_raw(tmp_path):
    gw, coord = _gateway(tmp_path)
    smuggled = "Бележки. key s​k-proj-1234567890abcdef‌ end"
    f = gw.input_dir / "doc_01.txt"
    f.write_text(smuggled, encoding="utf-8")

    result = gw.process_single_file(f)

    assert result["status"] == "BLOCKED", "the hidden key passed through the gateway"
    assert "​" not in coord.security_guard.evaluated_text, \
        "evaluate_output received the raw text, not the isolated one"


def test_clean_file_passes_and_is_written(tmp_path):
    gw, _ = _gateway(tmp_path)
    f = gw.input_dir / "clean.txt"
    f.write_text("Бележки по проекта, без тайни.", encoding="utf-8")

    result = gw.process_single_file(f)

    assert result["status"] == "PASSED"
    assert result["dlp_checked_on"] == "isolated_boundary"
    assert (gw.output_dir / "sanitized_clean.txt").exists()


def test_existing_output_is_not_overwritten(tmp_path):
    gw, _ = _gateway(tmp_path)
    f = gw.input_dir / "a.txt"
    f.write_text("first", encoding="utf-8")
    (gw.output_dir / "sanitized_a.txt").write_text("PREVIOUS", encoding="utf-8")

    result = gw.process_single_file(f)

    assert result["status"] == "ERROR"
    assert (gw.output_dir / "sanitized_a.txt").read_text(encoding="utf-8") == "PREVIOUS"


def test_audit_line_written_per_file_immediately(tmp_path):
    gw, _ = _gateway(tmp_path)
    for i in range(3):
        (gw.input_dir / f"f{i}.txt").write_text("ok", encoding="utf-8")

    gw.process_batch()
    lines = gw.audit_log.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 3, "the audit does not write one line per file"


def test_exit_code_reflects_outcome(tmp_path):
    gw, _ = _gateway(tmp_path)
    (gw.input_dir / "bad.txt").write_text("sk-proj-1234567890abcdef", encoding="utf-8")
    summary = gw.process_batch()
    assert BatchFileGateway.exit_code(summary) == 1


def test_undecodable_bytes_are_counted_not_dropped(tmp_path):
    gw, _ = _gateway(tmp_path)
    f = gw.input_dir / "binary.txt"
    f.write_bytes("добре ".encode("utf-8") + b"\xff\xfe" + " край".encode("utf-8"))

    result = gw.process_single_file(f)

    assert result["decoding_replacements"] >= 1, "the lost bytes stay invisible"
