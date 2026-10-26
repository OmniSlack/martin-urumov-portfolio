$ErrorActionPreference = "Stop"

Write-Host "Navigator Phase 2 Stage 1 R4 NO-OVERRIDE DUAL-GATE — local evidence run"
if (-not (Test-Path ".\node_modules\.bin\tsc.cmd")) {
    throw "Local dependencies are missing. STOP: do not install anything without separate permission."
}
docker exec navigator-pg-stage1 pg_isready -U postgres
npm.cmd run typecheck
npm.cmd run test:unit
npm.cmd run test:postgres
