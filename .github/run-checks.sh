#!/usr/bin/env bash
# Runs every check this repository can run without a database or R.
# The same script runs on GitHub Actions and on a laptop:
#   bash .github/run-checks.sh            # all groups
#   bash .github/run-checks.sh node       # one group: integrity | node | python | pwsh | execution-control
# Exits non-zero if any check fails. Each folder's README gives the same commands.
set -u
cd "$(dirname "$0")/.."
fail=0
run() {  # run <folder> <command...>
  local dir="$1"; shift
  echo "::group::$dir — $*"
  if (cd "$dir" && "$@"); then echo "PASS  $dir"; else echo "FAIL  $dir"; fail=1; fi
  echo "::endgroup::"
}
GROUP="${1:-all}"

if [ "$GROUP" = "all" ] || [ "$GROUP" = "integrity" ]; then
  run . sha256sum -c SHA256SUMS --quiet
fi

if [ "$GROUP" = "all" ] || [ "$GROUP" = "node" ]; then
  for d in ai-proposal-evaluator agent-action-verifier claim-audit-tools defect-register \
           ai-agent-skills keynes-beauty-contest-sim p-vs-np-gap-measurement; do
    run "$d" node --test
  done
fi

if [ "$GROUP" = "all" ] || [ "$GROUP" = "python" ]; then
  for d in batch-file-gateway document-claim-checker observer-gated-control-sim status-flow-validator; do
    run "$d" python3 -m pytest -q -p no:cacheprovider
  done
  run payload-policy-validator python3 -B -m unittest test_payload_policy_validator test_flag_hold_validator
  # The dual-pass probe: material regenerates byte-identical to the hashes locked before the runs,
  # and the recorded runs score as reported.
  run dual-pass-reading-probe bash -c 'python3 -B make_material.py >/dev/null && sha256sum -c LOCK.txt --quiet 2>/dev/null && python3 -B score.py | tail -1'
fi

if [ "$GROUP" = "all" ] || [ "$GROUP" = "pwsh" ]; then
  run evidence-retriever pwsh -NoProfile -File run_checks.ps1
fi

if [ "$GROUP" = "all" ] || [ "$GROUP" = "execution-control" ]; then
  # Typecheck + unit tests. The PostgreSQL suite needs a database and is not run here
  # (last run against PostgreSQL 16 is recorded in agent-execution-control/evidence/).
  run agent-execution-control bash -c 'npm ci --no-audit --no-fund >/dev/null && npm test'
fi

exit $fail
