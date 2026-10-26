"""
status_flow_validator.py
========================

Two-stage validation of a request's status history and payload.

RENAMED FROM: dual_gate_simulator.py
WHY: "dual gate" is the name of a different control, enforced in
004_no_override_dual_gate.sql, where the two conditions are
(1) execution gate OPEN with no active hold and (2) a matching Core CLEAR
risk decision, and where the permit is issued BEFORE execution.
This module validates something else: that a request walked the status
chain in order, and that its payload is clean. Two different controls must
not share one name — that is drift, and drift is what this codebase exists
to catch.

Terminology in this module, deliberately distinct from the SQL layer:
    stage        (not gate)
    request_id   (not permit_id)
    FLOW COMPLETE / FLOW INCOMPLETE   (not PERMIT GRANTED / REJECTED)

Stage 1 — status flow
    Required order: ATTEMPTED -> COMPLETED -> VERIFIED
    A history that skips a step, repeats one, or runs backwards fails.
    VERIFIED is reachable only from COMPLETED.

Stage 2 — payload scan
    Delegates to dlp_test_suite if importable; otherwise uses the built-in
    pattern set below. Both stages always run, so a single report shows
    process faults and payload faults separately.

Rejections are appended to a JSON Lines file (one JSON object per line,
append-only, never rewritten).

Usage:
    from status_flow_validator import StatusFlowValidator

    v = StatusFlowValidator(log_path="rejections.jsonl")
    result = v.validate(
        request_id="REQ-001",
        status_history=["ATTEMPTED", "COMPLETED", "VERIFIED"],
        payload={"user": "operator_2", "action": "submit"},
    )
    print(result["final_verdict"])

    python status_flow_validator.py --selftest
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Sequence

__version__ = "1.0.0"

REQUIRED_FLOW: tuple[str, ...] = ("ATTEMPTED", "COMPLETED", "VERIFIED")

VERDICT_COMPLETE = "FLOW COMPLETE"
VERDICT_INCOMPLETE = "FLOW INCOMPLETE"
VERDICT_PAYLOAD_BLOCKED = "PAYLOAD BLOCKED"

# Built-in fallback patterns, used only when dlp_test_suite is not importable.
_FALLBACK_PATTERNS: tuple[tuple[str, str], ...] = (
    ("api_key_openai", r"\bsk-[A-Za-z0-9]{16,}\b"),
    ("api_key_aws", r"\bAKIA[0-9A-Z]{16}\b"),
    ("bearer_token", r"\bBearer\s+[A-Za-z0-9._\-]{20,}\b"),
    ("private_key_block", r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    ("system_tag", r"<\|?(?:im_start|im_end|system|endoftext)\|?>"),
    ("instruction_override", r"(?i)\bignore (?:all )?(?:previous|prior|above) instructions\b"),
    ("role_override", r"(?i)\byou are now\b.{0,40}\b(?:admin|root|developer mode)\b"),
)


def _load_external_scanner():
    """Return dlp_test_suite's scanner if present, else None."""
    for module_name, attr in (
        ("dlp_test_suite", "scan_payload"),
        ("dlp_test_suite", "scan"),
        ("dlp_test_suite_v2", "scan_payload"),
    ):
        try:
            module = __import__(module_name, fromlist=[attr])
        except ImportError:
            continue
        fn = getattr(module, attr, None)
        if callable(fn):
            return fn
    return None


class StatusFlowValidator:
    def __init__(
        self,
        log_path: str | Path | None = "rejections.jsonl",
        required_flow: Sequence[str] = REQUIRED_FLOW,
        use_external_scanner: bool = True,
    ) -> None:
        self.log_path = Path(log_path) if log_path else None
        self.required_flow = tuple(required_flow)
        self._external_scanner = _load_external_scanner() if use_external_scanner else None

    # ---------- stage 1 ----------

    def check_status_flow(self, status_history: Sequence[str]) -> dict[str, Any]:
        history = [str(s).upper().strip() for s in status_history]

        if not history:
            return {
                "status": "FAIL",
                "detail": "Empty status history — no transition recorded.",
                "reached": None,
                "missing_transition": self.required_flow[0],
            }

        unknown = [s for s in history if s not in self.required_flow]
        if unknown:
            return {
                "status": "FAIL",
                "detail": f"Unknown status in history: {', '.join(sorted(set(unknown)))}.",
                "reached": history[-1],
                "missing_transition": None,
            }

        expected = list(self.required_flow[: len(history)])
        if history != expected:
            reached = history[-1]
            idx = self.required_flow.index(reached) if reached in self.required_flow else -1
            missing = self.required_flow[idx - 1] if idx > 0 else self.required_flow[0]
            return {
                "status": "FAIL",
                "detail": (
                    f"Out-of-order history {' -> '.join(history)}; "
                    f"expected prefix {' -> '.join(expected)}."
                ),
                "reached": reached,
                "missing_transition": missing,
            }

        if len(history) < len(self.required_flow):
            reached = history[-1]
            missing = self.required_flow[len(history)]
            return {
                "status": "FAIL",
                "detail": f"Stuck at '{reached}' — lacks '{missing}' transition.",
                "reached": reached,
                "missing_transition": missing,
            }

        return {
            "status": "PASS",
            "detail": "Flow completed in order: " + " -> ".join(history) + ".",
            "reached": history[-1],
            "missing_transition": None,
        }

    # ---------- stage 2 ----------

    def scan_payload(self, payload: Any) -> dict[str, Any]:
        text = json.dumps(payload, ensure_ascii=False, default=str)

        if self._external_scanner is not None:
            try:
                external = self._external_scanner(payload)
                findings = _normalise_findings(external)
            except Exception as exc:  # scanner must never silently pass a payload
                return {
                    "status": "FAIL",
                    "detail": f"External scanner raised {type(exc).__name__}; details withheld.",
                    "findings": [],
                    "scanner": "dlp_test_suite (errored)",
                }
            # External findings may quote the secret that triggered detection.
            findings = ["external scanner flagged payload"] if findings else []
            return {
                "status": "FAIL" if findings else "PASS",
                "detail": ", ".join(findings) if findings else "Payload clear.",
                "findings": findings,
                "scanner": "dlp_test_suite",
            }

        findings = [name for name, pattern in _FALLBACK_PATTERNS if re.search(pattern, text)]
        return {
            "status": "FAIL" if findings else "PASS",
            "detail": ", ".join(findings) if findings else "Payload clear.",
            "findings": findings,
            "scanner": "built-in fallback",
        }

    # ---------- combined ----------

    def validate(
        self,
        request_id: str,
        status_history: Sequence[str],
        payload: Any = None,
        write_log: bool = True,
    ) -> dict[str, Any]:
        stage1 = self.check_status_flow(status_history)
        stage2 = self.scan_payload(payload if payload is not None else {})

        if stage2["status"] == "FAIL":
            verdict = VERDICT_PAYLOAD_BLOCKED
        elif stage1["status"] == "FAIL":
            verdict = VERDICT_INCOMPLETE
        else:
            verdict = VERDICT_COMPLETE

        record: dict[str, Any] = {
            "timestamp": datetime.now().isoformat(),
            "validator_version": __version__,
            "request_id": request_id,
            "final_verdict": verdict,
            "current_status": stage1["reached"],
            "status_history": [str(s).upper().strip() for s in status_history],
            "stage_evaluations": {
                "stage_1_status_flow": f"{stage1['status']} ({stage1['detail']})",
                "stage_2_payload_scan": f"{stage2['status']} ({stage2['detail']})",
            },
        }

        if verdict != VERDICT_COMPLETE:
            record["rejection_analysis"] = _rejection_analysis(verdict, stage1, stage2)
            if write_log and self.log_path is not None:
                self._append_log(record)

        return record

    def _append_log(self, record: dict[str, Any]) -> None:
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        with self.log_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")


def _normalise_findings(external: Any) -> list[str]:
    if external is None or external is False:
        return []
    if external is True:
        return ["external scanner flagged payload"]
    if isinstance(external, dict):
        if "findings" in external:
            return [str(f) for f in external["findings"]]
        if external.get("status") in {"FAIL", "BLOCK", "BLOCKED"}:
            return [str(external.get("detail", "external scanner flagged payload"))]
        return []
    if isinstance(external, Iterable) and not isinstance(external, (str, bytes)):
        return [str(f) for f in external]
    return [str(external)]


def _rejection_analysis(verdict: str, stage1: dict[str, Any], stage2: dict[str, Any]) -> dict[str, Any]:
    if verdict == VERDICT_PAYLOAD_BLOCKED:
        return {
            "blocked_by": "stage_2_payload_scan",
            "findings": stage2["findings"],
            "scanner": stage2["scanner"],
            "recommended_action": (
                "Remove the flagged values from the payload and resubmit the request. "
                "A request blocked at this stage is not retried automatically."
            ),
        }
    return {
        "blocked_by": "stage_1_status_flow",
        "stuck_at": stage1["reached"],
        "missing_transition": stage1["missing_transition"],
        "recommended_action": (
            f"Complete the required process up to status '{stage1['missing_transition']}' "
            f"before moving to the next status."
        ),
    }


# ---------- self-test ----------

_SCENARIOS = (
    (
        "Complete, in-order flow",
        "REQ-FLOW-001",
        ["ATTEMPTED", "COMPLETED", "VERIFIED"],
        {"user": "operator_2", "action": "submit"},
    ),
    (
        "Stuck at 'ATTEMPTED' (COMPLETED missing)",
        "REQ-FLOW-002",
        ["ATTEMPTED"],
        {"user": "operator_2", "action": "direct_jump"},
    ),
    (
        "COMPLETED skipped (ATTEMPTED -> VERIFIED)",
        "REQ-FLOW-003",
        ["ATTEMPTED", "VERIFIED"],
        {"user": "operator_2", "action": "direct_jump"},
    ),
    (
        "Clean flow, contaminated payload",
        "REQ-FLOW-004",
        ["ATTEMPTED", "COMPLETED", "VERIFIED"],
        {"user": "operator_2", "note": "key sk-ABCDEFGHIJKLMNOP012345"},
    ),
)


def selftest(log_path: str | None = "rejections.jsonl") -> int:
    validator = StatusFlowValidator(log_path=log_path)
    line = "=" * 70
    print(line)
    print(" STATUS FLOW VALIDATOR - LOGIC VALIDATION SUITE")
    print(line)
    failures = 0
    expected = (VERDICT_COMPLETE, VERDICT_INCOMPLETE, VERDICT_INCOMPLETE, VERDICT_PAYLOAD_BLOCKED)

    for (name, rid, history, payload), want in zip(_SCENARIOS, expected):
        r = validator.validate(rid, history, payload)
        ok = r["final_verdict"] == want
        failures += 0 if ok else 1
        print(f"\n--- [ {name} ] ---")
        print("  [HISTORY]:", " -> ".join(r["status_history"]) or "(empty)")
        print("  [STAGE 1 status flow]:", r["stage_evaluations"]["stage_1_status_flow"])
        print("  [STAGE 2 payload scan]:", r["stage_evaluations"]["stage_2_payload_scan"])
        print(f"  [VERDICT]: >>> {r['final_verdict']} <<<   {'OK' if ok else 'UNEXPECTED, expected ' + want}")

    print("\n" + line)
    print(f" {len(_SCENARIOS) - failures} pass / {failures} fail")
    if log_path:
        print(f" Rejections appended to: {log_path}")
    print(line)
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Two-stage status flow and payload validator.")
    parser.add_argument("--selftest", action="store_true", help="Run the built-in scenarios.")
    parser.add_argument("--log", default="rejections.jsonl", help="Path to the append-only rejection log.")
    args = parser.parse_args()

    if args.selftest:
        return selftest(args.log)
    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
