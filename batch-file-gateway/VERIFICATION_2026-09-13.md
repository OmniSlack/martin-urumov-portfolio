# Local verification — 2026-09-13

## Implemented

- Exclusive output creation prevents concurrent overwrites; a collision is an ERROR.
- Read, boundary, DLP, and write exceptions produce structured ERROR decisions
  without exception messages or local variables. The batch continues after
  per-file failures, but aborts if the audit sink fails. CLI batch failures exit 2.
- Validator records omit payload snapshots. External scanner findings and gateway
  block reasons are reduced to generic labels to avoid copying detected secrets.
- Failed writes retain partial files marked `output_incomplete: true`; only
  PASSED audit decisions identify successful outputs. No automatic deletion occurs.
- Report directories are unique, including for multiple runs within one minute.
- Added regression tests, a container runner verification script, and .dockerignore.

## Confirmed results

| Check | Result |
|---|---|
| Local pytest, Python 3.14 / pytest 9.1.1 | 21 passed |
| Validator self-test | 4 passed |
| Docker Compose image build | Passed, including apt-get and no-requirements path |
| Container pytest, Python 3.12.14 / pytest 9.1.1 | 21 passed, exit 0 |
| Container report runner: passing fixture | Correct report, exit 0 |
| Container report runner: failing fixture | Correct report, exit 1 |
| Container report runner: no tests | Correct report, exit 5 |
| Runner and entrypoint shell syntax | Passed |

The container suite used Compose's read-only repository mount, writable reports
mount, and disabled network. Each temporary container was removed on completion.
JUnit confirms 21 tests, zero failures, zero errors, and zero skips.

Evidence:

- [Full test report](ci/reports/2026-09-13_034314_ib6xHR/report.md)
- [JUnit XML](ci/reports/2026-09-13_034314_ib6xHR/junit.xml)
- [Runner outcome checks](ci/reports/runner-checks-jee260uv/verification.json)

Commands to reproduce are in [README.md](README.md).

## Limits

The real MainLibraryCoordinator is not supplied; gateway tests use an injected
stub. The daily scheduler was not started or verified over time. The optional
requirements.txt-present build path was not exercised in this session.

Metadata fields (filenames, request IDs, status histories) remain caller-provided;
callers must not put secrets in them. An injected guard may have its own logging.
Output publication and audit append are not one transaction: an audit failure
can leave a completed output without a PASSED decision. Partial outputs are
retained and must be reviewed before retrying. These changes do not establish
crash-atomic publication or comprehensive DLP coverage.
