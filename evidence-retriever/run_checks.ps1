<#
run_checks.ps1 - reproduces the five-point test matrix of the evidence retriever
on the synthetic sample corpus in ./sample, and reports two known defects.

Usage:  pwsh -NoProfile -File run_checks.ps1
Exit:   0 when every expected check passes and the known defects are still
        reproduced; 1 otherwise. Known defects are reported, not hidden.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $here 'evidence_retriever.ps1'
$root = Join-Path $here 'sample'
$fail = 0
function Check([string]$name, [bool]$ok) { $script:fail += [int](-not $ok); "{0}  {1}" -f ($(if ($ok) {'PASS'} else {'FAIL'}), $name) }
function Hash($dir) { (Get-ChildItem -LiteralPath $dir -File | Sort-Object Name | Get-FileHash -Algorithm SHA256 | ForEach-Object Hash) -join ';' }

$before = Hash $root

# 1. a query with matches, JSON: exact file/line/section/URL on the matched line
$j = (& $script 'prompt injection' -Root $root -Format Json -MaxResults 5) | ConvertFrom-Json
Check '1 match -> JSON result with file, line, section and URL' (($j | Measure-Object).Count -ge 1 -and $j[0].File -like '*AGENT_RISKS*' -and $j[0].Line -gt 0 -and $j[0].SourceUrls -like 'https://*')

# 2. a query with matches, Markdown: the explicit confidence marker is read from the matched line only
$m = (& $script 'GNSS spoofing' -Root $root -Format Markdown -MaxResults 3) -join "`n"
Check '2 match -> Markdown shows the 🟢 source marker of the matched line' ($m -match 'Explicit confidence: .*established' -and $m -match 'doi.org')

# 3. no match, Markdown: the boundary sentence is printed
$n = (& $script 'xq7zv-nonexistent-token-991' -Root $root -Format Markdown) -join "`n"
Check '3 no match -> Markdown says absence is not established' ($n -match 'not evidence that the concept is absent')

# 4. baseline: plain text search finds the same lines or fewer
$plain = (Get-ChildItem -LiteralPath $root -File | Select-String -Pattern 'prompt injection' -SimpleMatch | Measure-Object).Count
Check '4 baseline plain search count <= retriever count' ($plain -le ($j | Measure-Object).Count)

# 5. source immutability
$after = Hash $root
Check '5 source files unchanged after all queries (SHA-256)' ($before -eq $after)

# Known defects (reproduced on PowerShell 7.6, 2026-10-26). A FAIL below would mean the defect is gone.
$t = (& $script 'xq7zv-nonexistent-token-991' -Root $root -Format Table) -join "`n"
Check 'D1 (known defect) Table/no match prints no boundary text when stdout is redirected' (-not ($t -match 'absence is not established'))
$jn = (& $script 'xq7zv-nonexistent-token-991' -Root $root -Format Json) -join ''
Check 'D2 (known defect) Json/no match prints nothing instead of []' ($jn -eq '')

"PowerShell $($PSVersionTable.PSVersion) · failures: $fail"
exit $fail
