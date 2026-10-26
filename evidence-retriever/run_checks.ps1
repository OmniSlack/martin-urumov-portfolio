<#
run_checks.ps1 - reproduces the five-point test matrix of the evidence retriever
on the synthetic sample corpus in ./sample, and checks that the v0.1 defect D2 stays fixed.

Usage:  pwsh -NoProfile -File run_checks.ps1
Exit:   0 when every check passes; 1 otherwise.
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

# D2 was an open defect in v0.1 (reproduced 2026-10-26); fixed in v0.2. The check fails if it returns.
$jn = (& $script 'xq7zv-nonexistent-token-991' -Root $root -Format Json) -join ''
Check 'D2 fixed: Json/no match prints []' ($jn.Trim() -eq '[]')
# Table/no match: the boundary object is emitted; captured through Out-String because a formatter's output
# is not visible to a non-terminal stdout in some hosts (that was mistaken for a defect on 2026-10-26).
$t = (& $script 'xq7zv-nonexistent-token-991' -Root $root -Format Table | Out-String)
Check '6 no match -> Table carries the boundary object' ($t -match 'absence is not established')

"PowerShell $($PSVersionTable.PSVersion) · failures: $fail"
exit $fail
