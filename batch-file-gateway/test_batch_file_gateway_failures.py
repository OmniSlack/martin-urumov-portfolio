"""
Failure handling and audit privacy of the batch file gateway: concurrency,
guard/read/write errors, audit-sink failure, CLI exit codes. No secret may
reach any log or report.
"""

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

import pytest

from batch_file_gateway import BatchFileGateway, main
from test_batch_file_gateway import _gateway

SECRET = "sk-ABCDEFGHIJKLMNOP012345"


def test_concurrent_writers_preserve_winner(tmp_path, monkeypatch):
    gw, _ = _gateway(tmp_path)
    source = gw.input_dir / "same.txt"
    source.write_text("complete content", encoding="utf-8")
    target = gw.output_dir / "sanitized_same.txt"
    barrier = Barrier(2)
    original = Path.open

    def simultaneous_open(path, mode="r", *args, **kwargs):
        if path == target and mode in {"x", "w"}:
            barrier.wait(timeout=10)
        return original(path, mode, *args, **kwargs)

    monkeypatch.setattr(Path, "open", simultaneous_open)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(gw.process_single_file, [source, source]))
    assert sorted(r["status"] for r in results) == ["ERROR", "PASSED"]
    assert target.read_text(encoding="utf-8") == "complete content"
    assert next(r for r in results if r["status"] == "ERROR")["error_type"] == "FileExistsError"
    assert len([json.loads(line) for line in gw.audit_log.read_text(encoding="utf-8").splitlines()]) == 2


@pytest.mark.parametrize("stage,method", [("boundary", "sanitize_input_boundary"), ("dlp", "evaluate_output")])
def test_guard_exception_is_audited_and_batch_continues(tmp_path, monkeypatch, caplog, stage, method):
    gw, coord = _gateway(tmp_path)
    original = getattr(coord.security_guard, method)

    def guard(text):
        if text == SECRET:
            raise ValueError(SECRET)
        return original(text)

    monkeypatch.setattr(coord.security_guard, method, guard)
    (gw.input_dir / "a.txt").write_text(SECRET, encoding="utf-8")
    (gw.input_dir / "b.txt").write_text("clean", encoding="utf-8")
    summary = gw.process_batch()
    assert summary["counts"] == {"PASSED": 1, "BLOCKED": 0, "ERROR": 1}
    assert summary["results"][0]["stage"] == stage
    assert gw.exit_code(summary) == 2
    assert not (gw.output_dir / "sanitized_a.txt").exists()
    assert SECRET not in gw.audit_log.read_text(encoding="utf-8")
    assert SECRET not in (gw.output_dir / "gateway_summary.json").read_text(encoding="utf-8")
    assert SECRET not in caplog.text


def test_block_reason_is_not_logged(tmp_path, monkeypatch, caplog):
    gw, coord = _gateway(tmp_path)
    monkeypatch.setattr(coord.security_guard, "evaluate_output", lambda text: ("", True, SECRET))
    source = gw.input_dir / "blocked.txt"
    source.write_text(SECRET, encoding="utf-8")
    result = gw.process_single_file(source)
    assert result["status"] == "BLOCKED"
    assert SECRET not in json.dumps(result) + gw.audit_log.read_text(encoding="utf-8") + caplog.text


def test_read_error_is_audited(tmp_path, monkeypatch):
    gw, _ = _gateway(tmp_path)
    def fail(*args):
        raise OSError(SECRET)
    monkeypatch.setattr(Path, "read_bytes", fail)
    result = gw.process_single_file(gw.input_dir / "missing.txt")
    assert result["status"] == "ERROR"
    assert result["stage"] == "read"
    assert SECRET not in gw.audit_log.read_text(encoding="utf-8")


def test_write_error_is_audited_and_batch_continues(tmp_path, monkeypatch):
    gw, _ = _gateway(tmp_path)
    for name in ("a.txt", "b.txt"):
        (gw.input_dir / name).write_text("clean", encoding="utf-8")
    original = Path.open
    def fail(path, mode="r", *args, **kwargs):
        if path.name == "sanitized_a.txt":
            raise PermissionError(SECRET)
        return original(path, mode, *args, **kwargs)
    monkeypatch.setattr(Path, "open", fail)
    summary = gw.process_batch()
    assert summary["counts"] == {"PASSED": 1, "BLOCKED": 0, "ERROR": 1}
    assert summary["results"][0]["stage"] == "write"
    assert SECRET not in gw.audit_log.read_text(encoding="utf-8")


def test_failed_write_retains_and_marks_incomplete_file(tmp_path, monkeypatch):
    gw, _ = _gateway(tmp_path)
    source = gw.input_dir / "partial.txt"
    source.write_text("clean", encoding="utf-8")
    original = Path.open
    class BrokenWriter:
        def __enter__(self):
            self.fh = original(gw.output_dir / "sanitized_partial.txt", "x", encoding="utf-8")
            return self
        def write(self, text):
            self.fh.write(text[:2])
            raise OSError(SECRET)
        def __exit__(self, *args):
            self.fh.close()
    def fail(path, mode="r", *args, **kwargs):
        if path.name == "sanitized_partial.txt" and mode == "x":
            return BrokenWriter()
        return original(path, mode, *args, **kwargs)
    monkeypatch.setattr(Path, "open", fail)
    result = gw.process_single_file(source)
    assert result["status"] == "ERROR"
    assert result["output_incomplete"] is True
    assert Path(result["output_path"]).read_text(encoding="utf-8") == "cl"
    assert SECRET not in gw.audit_log.read_text(encoding="utf-8")


def test_audit_failure_stops_batch(tmp_path, monkeypatch):
    gw, _ = _gateway(tmp_path)
    for name in ("a.txt", "b.txt"):
        (gw.input_dir / name).write_text("clean", encoding="utf-8")
    original = Path.open
    def fail(path, *args, **kwargs):
        if path == gw.audit_log:
            raise OSError(SECRET)
        return original(path, *args, **kwargs)
    monkeypatch.setattr(Path, "open", fail)
    with pytest.raises(OSError):
        gw.process_batch()
    assert not (gw.output_dir / "sanitized_b.txt").exists()


def test_cli_batch_error_exits_two_without_secret(monkeypatch, capsys):
    def fail(*args, **kwargs):
        raise OSError(SECRET)
    monkeypatch.setattr(BatchFileGateway, "__init__", fail)
    monkeypatch.setattr("sys.argv", ["gateway"])
    assert main() == 2
    captured = capsys.readouterr()
    assert SECRET not in captured.out + captured.err
    assert json.loads(captured.err)["error_type"] == "OSError"
