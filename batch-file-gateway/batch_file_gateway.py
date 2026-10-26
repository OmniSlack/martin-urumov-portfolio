"""
batch_file_gateway.py — batch file gateway.

Formerly file_gateway_automator.py (gateway pack, 2026-09-13). Renamed by
function; class FileGatewayAutomator -> BatchFileGateway. Logic unchanged.

Every file passes through, in this order:
    1. boundary isolation   (sanitize_input_boundary)
    2. egress DLP check     (evaluate_output)  <- runs on the ISOLATED text
    3. write, or refuse

FIXED IN THIS VERSION (each was a real defect, not a style change):
  1. The isolated boundary was computed and then thrown away; evaluate_output
     received the raw content. The isolation step decided nothing. Now the
     DLP check runs on the isolated text, and a test locks that in.
  2. errors="ignore" silently dropped undecodable bytes BEFORE the security
     check. Now: errors="replace", and the substitution count is recorded, so
     a mangled file is visible instead of quietly scanned.
  3. The audit manifest was written once at the end of the batch — a crash on
     file 400 of 500 left no trail. Now every file appends one JSON line as it
     is decided; the summary at the end is an extra, not the record.
  4. Output files use exclusive creation. A concurrent collision is an
     ERROR, not a silent replacement.
  5. The run always exited 0. Now: 0 clean, 1 something was blocked,
     2 something errored — a run that cannot fail cannot be monitored.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    from main_library_index import MainLibraryCoordinator
except ImportError:  # local runs without the library present
    MainLibraryCoordinator = None


class BatchFileGateway:
    def __init__(
        self,
        input_dir: str = "./input_files",
        output_dir: str = "./processed_files",
        coordinator: Any = None,
    ) -> None:
        self.input_dir = Path(input_dir)
        self.output_dir = Path(output_dir)

        if coordinator is not None:
            self.coordinator = coordinator
        elif MainLibraryCoordinator is not None:
            self.coordinator = MainLibraryCoordinator()
        else:
            raise RuntimeError(
                "main_library_index.MainLibraryCoordinator is not importable and no "
                "coordinator was injected. The gateway refuses to run without a guard."
            )

        self.guard = self.coordinator.security_guard
        self.input_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.audit_log = self.output_dir / "gateway_audit.jsonl"

    # ---------- audit ----------

    def _audit(self, record: dict[str, Any]) -> dict[str, Any]:
        """Append one decision, immediately. Never rewrite, never buffer."""
        record["timestamp"] = datetime.now().isoformat()
        with self.audit_log.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
            fh.flush()
            os.fsync(fh.fileno())
        return record

    # ---------- one file ----------

    def process_single_file(self, file_path: str | Path) -> dict[str, Any]:
        path = Path(file_path)
        filename = path.name
        record = {"filename": filename}
        stage = "read"
        output_created = False
        try:
            raw = path.read_bytes()
            content = raw.decode("utf-8", errors="replace")
            record.update(
                sha256=hashlib.sha256(raw).hexdigest(),
                decoding_replacements=content.count("\ufffd"),
                bytes_processed=len(raw),
            )

            stage = "boundary"
            isolated = self.guard.sanitize_input_boundary(content)
            if not isinstance(isolated, str):
                raise TypeError("Boundary must return text")

            stage = "dlp"
            sanitized_content, is_blocked, _reason = self.guard.evaluate_output(isolated)
            if not isinstance(is_blocked, bool):
                raise TypeError("DLP decision must be boolean")
            record.update(boundary_applied=True, dlp_checked_on="isolated_boundary")
            if is_blocked:
                # Guard reasons can contain the detected secret. Never persist them.
                record.update(status="BLOCKED", reason="dlp_policy_block")
            else:
                if not isinstance(sanitized_content, str):
                    raise TypeError("DLP output must be text")
                stage = "write"
                out_path = self.output_dir / f"sanitized_{filename}"
                # Exclusive creation combines the existence check and creation.
                # On failed writes retain the file and mark it incomplete: deleting
                # by pathname could delete another writer's replacement.
                with out_path.open("x", encoding="utf-8") as fh:
                    output_created = True
                    fh.write(sanitized_content)
                    fh.flush()
                    os.fsync(fh.fileno())
                record.update(status="PASSED", output_path=str(out_path))
        except Exception as exc:
            # No exception text, traceback locals, payload, or guard reason.
            record.update(status="ERROR", stage=stage,
                          error_type=type(exc).__name__, error="processing_failed")
            if output_created:
                record.update(output_path=str(out_path), output_incomplete=True)

        # Audit failure must stop the batch; it must never be swallowed or retried
        # as another decision on the same broken audit sink.
        return self._audit(record)

    # ---------- batch ----------

    def process_batch(self) -> dict[str, Any]:
        files = sorted(p for p in self.input_dir.iterdir() if p.is_file())
        results = [self.process_single_file(p) for p in files]

        counts = {"PASSED": 0, "BLOCKED": 0, "ERROR": 0}
        for r in results:
            counts[r["status"]] = counts.get(r["status"], 0) + 1

        summary = {
            "timestamp": datetime.now().isoformat(),
            "total_files": len(files),
            "counts": counts,
            "audit_log": str(self.audit_log),
            "results": results,
        }
        (self.output_dir / "gateway_summary.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return summary

    @staticmethod
    def exit_code(summary: dict[str, Any]) -> int:
        if summary["counts"].get("ERROR"):
            return 2
        if summary["counts"].get("BLOCKED"):
            return 1
        return 0


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Batch file gateway.")
    ap.add_argument("--input", default="./input_files")
    ap.add_argument("--output", default="./processed_files")
    args = ap.parse_args()

    try:
        gateway = BatchFileGateway(input_dir=args.input, output_dir=args.output)
        summary = gateway.process_batch()
    except Exception as exc:
        print(json.dumps({"status": "ERROR", "stage": "batch",
                          "error_type": type(exc).__name__,
                          "error": "batch_aborted"}), file=sys.stderr)
        return 2

    print("=" * 57)
    print(" BATCH FILE GATEWAY RESULT")
    print("=" * 57)
    print(json.dumps(summary["counts"], ensure_ascii=False, indent=2))
    print("audit:", summary["audit_log"])
    return BatchFileGateway.exit_code(summary)


if __name__ == "__main__":
    sys.exit(main())
