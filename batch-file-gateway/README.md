# batch-file-gateway

**Kind:** tool (Python, standard library only; tests need `pytest`) · **Status:** candidate — tested with an injected stub guard, not with the real guard · **Date:** 2026-09-13

## Purpose

A gateway that takes every file in an input folder, passes it through a security guard, and either writes a sanitized copy or refuses it — with one audit line per file, written the moment the decision is made. It exists so that a data-loss-prevention (DLP) check cannot be bypassed by hiding a secret with invisible characters, and so that a failed or blocked run is visible to whoever monitors it.

## How it works

For each file, in this order:

1. **read** — bytes are read; undecodable bytes are replaced (not dropped) and the number of replacements is recorded, so a mangled file is visible.
2. **boundary** — `guard.sanitize_input_boundary(text)` strips smuggling characters (zero-width and similar).
3. **dlp** — `guard.evaluate_output(isolated_text)` runs on the **isolated** text. If it blocks, the record says `BLOCKED` with a generic reason; the guard's own reason text, which may quote the secret, is never persisted.
4. **write** — the output file is created with exclusive creation (`open("x")`): a collision with an existing file is an `ERROR`, never a silent overwrite. A write that fails midway leaves the partial file in place, marked `output_incomplete: true`, so that nothing is deleted by name.
5. **audit** — one JSON line is appended and fsync'd per file. If the audit sink itself fails, the batch stops.

Exit codes: `0` all passed · `1` something was blocked · `2` something errored. The gateway refuses to start without a guard (real `MainLibraryCoordinator` or an injected one).

## How to run

```bash
python3 -m pytest -q            # 15 tests
python3 batch_file_gateway.py --input ./input_files --output ./processed_files
```

The CLI needs `main_library_index.MainLibraryCoordinator` (not included here) or an injected coordinator; the tests inject a stub.

## Evidence

| Claim | Command | Observed 2026-10-26 (Python 3.13, pytest 9, Linux) |
|---|---|---|
| 15 tests pass (6 behaviour + 9 failure-handling/privacy) | `python3 -m pytest -q` | `15 passed` |
| DLP runs on the isolated text, not the raw file | `test_dlp_runs_on_isolated_text_not_raw` | a key split by zero-width characters is `BLOCKED` |
| Concurrent writers: exactly one wins, the other is an `ERROR`, file content intact | `test_concurrent_writers_preserve_winner` | `["ERROR", "PASSED"]`, `FileExistsError` |
| No secret reaches audit log, summary, stderr or captured logs in any failure path | the six `*_not_logged` / `*_is_audited*` tests | `SECRET not in …` holds in every path |
| Audit-sink failure stops the batch | `test_audit_failure_stops_batch` | second file never written |
| Renaming did not change behaviour | 300 random batches, old vs new audit records compared (timestamp and paths excluded) | 0 differences |

The original pack also recorded a container run: 21 tests in Docker, Python 3.12, read-only mount, no network, exit 0, plus a report runner verified on passing / failing / no-tests fixtures (exit 0 / 1 / 5). That record is kept byte-identical in [`VERIFICATION_2026-09-13.md`](VERIFICATION_2026-09-13.md). **Reported**, not reproduced here: the `ci/` runner and its `ci/reports/` evidence files were not part of the material received for this repository, so the links inside that file do not resolve.

## The five defects this version fixed

Each is named in the module docstring and pinned by a test:

1. The isolated text was computed and then thrown away; the DLP check received the raw content. The isolation step decided nothing.
2. `errors="ignore"` silently dropped undecodable bytes before the security check.
3. The audit manifest was written once at the end of the batch — a crash on file 400 of 500 left no trail.
4. Output files could be overwritten by a concurrent writer.
5. The run always exited 0 — a run that cannot fail cannot be monitored.

## Limitations

- The real `MainLibraryCoordinator` / security guard is not supplied; every result here is against a stub. The gateway's safety is only as good as the injected guard.
- Output publication and audit append are not one transaction: an audit failure can leave a completed output without a `PASSED` decision. Consumers must use the audit, not file existence, as the record of success.
- Partial outputs are retained on purpose and must be reviewed before a retry; the gateway will not overwrite them.
- Metadata fields (filenames, request IDs) are caller-provided; a caller who puts a secret there defeats the privacy rule.
- This is not crash-atomic publication and not comprehensive DLP coverage. The container runner and daily scheduler were not exercised in this repository.
- Three test fixtures deliberately contain non-ASCII (Cyrillic) text, to exercise UTF-8 handling; this is intentional, not untranslated prose.

## Provenance

See [`PROVENANCE.md`](PROVENANCE.md). Renamed by function from `file_gateway_automator.py` (class `FileGatewayAutomator` → `BatchFileGateway`); two CLI strings and four test messages translated; the shared regression file of the original pack was split so that this folder holds only the gateway tests (the three validator tests moved to [`../status-flow-validator/`](../status-flow-validator/)). Total test count across both folders is unchanged: 21.

## Contribution

- Martin Urumov: requirements and acceptance criteria (the DLP check must run on the isolated text; one audit line per file, written immediately; no secret may ever appear in a log or report; a run that cannot fail cannot be monitored); review of the results; the decision to retain partial files rather than delete by name.
- AI coding assistants: implementation, the test suite, the five-defect analysis as documented in the module docstring, the container runner, and the renaming/translation/split in this repository.
