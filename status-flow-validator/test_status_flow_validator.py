"""
Audit privacy of the status flow validator: no payload, finding or secret may be
written to the record or the rejection log, whatever the external scanner does.
"""

import json

import pytest

from status_flow_validator import StatusFlowValidator, REQUIRED_FLOW

SECRET = "sk-ABCDEFGHIJKLMNOP012345"


@pytest.mark.parametrize("history", [REQUIRED_FLOW, ["ATTEMPTED"]])
def test_validator_never_records_payload(tmp_path, history):
    validator = StatusFlowValidator(tmp_path / "audit.jsonl", use_external_scanner=False)
    result = validator.validate("req", history, {"key": SECRET})
    assert result["final_verdict"] == "PAYLOAD BLOCKED"
    assert "payload_snapshot" not in result
    assert SECRET not in json.dumps(result) + validator.log_path.read_text(encoding="utf-8")


@pytest.mark.parametrize("response", ["raises", "finding", "malformed"])
def test_external_scanner_cannot_leak_payload(tmp_path, response):
    validator = StatusFlowValidator(tmp_path / "audit.jsonl", use_external_scanner=False)
    def scanner(payload):
        if response == "raises":
            raise ValueError(SECRET)
        if response == "malformed":
            return {"findings": None}
        return {"findings": [SECRET]}
    validator._external_scanner = scanner
    result = validator.validate("req", REQUIRED_FLOW, {"key": SECRET})
    assert result["final_verdict"] == "PAYLOAD BLOCKED"
    assert SECRET not in json.dumps(result) + validator.log_path.read_text(encoding="utf-8")


def test_status_only_rejection_omits_unrecognised_secret(tmp_path):
    validator = StatusFlowValidator(tmp_path / "audit.jsonl", use_external_scanner=False)
    result = validator.validate("req", ["ATTEMPTED"], {"password": "unrecognised-secret"})
    assert result["final_verdict"] == "FLOW INCOMPLETE"
    assert "unrecognised-secret" not in validator.log_path.read_text(encoding="utf-8")
