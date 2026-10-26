# Provenance — batch-file-gateway

Rule: originals are never modified. Every file here is a new copy; this table links each new file to the original it was made from.

Original: "Gateway pack" of 2026-09-13, received as seven loose files (no archive). The pack's `ci/` folder (Dockerfile, docker-compose.yml, run_tests.sh, entrypoint.sh, verify_runner.py) and `ci/reports/` were not received.

| Original file | Original SHA-256 | New file (this folder) | New SHA-256 | Change |
|---|---|---|---|---|
| file_gateway_automator.py | 63d9607b540018a16f65297a3d83ccaadb96f17d55b8de6aec858c18a89b501d | batch_file_gateway.py | 7bf5940e5d41a5084482f91c5b2aab380f3bcc99b67a7139074baaf047d563e2 | renamed by function; class FileGatewayAutomator → BatchFileGateway; 2 CLI strings translated; logic unchanged (300-batch equivalence check: 0 differences) |
| test_file_gateway.py | 82b967b3f736257541e9c5d6959ab38eb877c1b54f8d44d0f31960836e2e52d8 | test_batch_file_gateway.py | b83182798aa0a88aa7197f6d2d4a3ff334f24457e2b0aaaafd7affec91b97190 | import/class name updated; 4 assertion messages translated; 6 tests unchanged |
| test_gateway_regressions.py (gateway part: 8 functions, 9 tests) | 59dceafcedbd79c2b28026638eb0389360a60148746dbd2cc40f16b62891f9fb | test_batch_file_gateway_failures.py | 3b901f39c086caa893ce970c2c8bc266774b046672a506e102a50c53b32a784a | split: gateway tests only; class name updated; test bodies unchanged |
| LOCAL_VERIFICATION.md | f872bba367f23ac5c61c7a24df7e84fdc045464f460777737596e758850e18e4 | VERIFICATION_2026-09-13.md | f872bba367f23ac5c61c7a24df7e84fdc045464f460777737596e758850e18e4 | byte-identical copy; its links to ci/reports do not resolve here |
| README.md (pack) | 0fbef0e4d958c5583ee9db59659544b28402a44f32502a09ed492aeb5e6ad927 | README.md | 4f793d86d6e1dc8b01e91d4790176a5a4a55c6c28ff0473e11e1077f4aa307aa | rewritten in the portfolio README format; facts carried over |
| .dockerignore | 9a86c16eadb34f6bc6ecd8f94994db7a4a48f026286231445fb7d54df3592045 | — | — | not carried: belongs to the container runner, which was not received |
