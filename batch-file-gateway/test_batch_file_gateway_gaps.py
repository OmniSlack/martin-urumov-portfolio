"""
Three gaps found by an outside AI review of the 2026-09-12 version of this
gateway (test_07/08/09 in its test_gateway_gaps.py). Carried here, translated,
against this (2026-09-13) version.

Measured on 2026-10-27 against this folder's code BEFORE the fix:
  test_two_writers_never_both_pass   passed  (this version already used
                                               exclusive creation; the race
                                               existed only in 2026-09-12)
  test_symlink_does_not_cross        FAILED  (a link was exported: PASSED)
  test_valid_fffd_is_not_a_repl...   FAILED  (decoding_replacements == 1)
After the fix all three pass. Assertions were not loosened.
"""
import tempfile
import threading
from pathlib import Path

from batch_file_gateway import BatchFileGateway
from test_batch_file_gateway import StubCoordinator, _gateway


def test_two_writers_never_both_pass():
    """Black box: two gateways write the same output name at the same moment.
    Two PASSED for one path would mean one silently replaced the other.
    The 2026-09-12 version (exists() then write_text()) did this in ~28% of
    rounds, so 60 rounds miss it with probability about 0.72**60 = 3e-9."""
    rounds, both_passed = 60, 0
    for _ in range(rounds):
        with tempfile.TemporaryDirectory() as td:
            shared_out = Path(td) / "out"
            gateways, status = [], {}
            for i in (0, 1):
                in_dir = Path(td) / f"in{i}"
                in_dir.mkdir(parents=True)
                (in_dir / "same.txt").write_text(f"WRITER_{i}", encoding="utf-8")
                gateways.append(BatchFileGateway(
                    input_dir=in_dir, output_dir=shared_out, coordinator=StubCoordinator()))
            start_together = threading.Barrier(2)

            def write(i):
                start_together.wait()
                status[i] = gateways[i].process_single_file(
                    gateways[i].input_dir / "same.txt")["status"]

            threads = [threading.Thread(target=write, args=(i,)) for i in (0, 1)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
            if list(status.values()).count("PASSED") > 1:
                both_passed += 1
    assert both_passed == 0, (
        f"{both_passed}/{rounds} rounds: both writers reported PASSED for one output path"
    )


def test_symlink_does_not_cross_the_boundary(tmp_path):
    """is_file() follows links, so a file in input_dir could point anywhere
    and its content would be exported to output_dir."""
    gw, _ = _gateway(tmp_path)
    outside = tmp_path / "outside.txt"
    outside.write_text("CONTENT OUTSIDE input_dir", encoding="utf-8")
    link = gw.input_dir / "innocent.txt"
    link.symlink_to(outside)

    result = gw.process_single_file(link)

    assert result["status"] == "ERROR", f"a link pointing outside was processed as {result['status']}"
    assert not (gw.output_dir / "sanitized_innocent.txt").exists(), \
        "content from beyond the boundary was exported to output_dir"
    assert gw.process_batch()["total_files"] == 0, "the link entered the batch"


def test_valid_fffd_is_not_a_replacement(tmp_path):
    """U+FFFD is a valid character. A file that contains it legitimately is not
    damaged; only bytes that were actually replaced may be counted."""
    gw, _ = _gateway(tmp_path)
    f = gw.input_dir / "legit.txt"
    f.write_text("valid text with the character � inside", encoding="utf-8")
    f.read_bytes().decode("utf-8")  # proves the file is valid UTF-8

    assert gw.process_single_file(f)["decoding_replacements"] == 0, \
        "a valid file reported replaced bytes"

    g = gw.input_dir / "broken.txt"
    g.write_bytes(b"good " + b"\xff\xfe" + b" end")
    assert gw.process_single_file(g)["decoding_replacements"] >= 1, \
        "genuinely invalid bytes became invisible"
