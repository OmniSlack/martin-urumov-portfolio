<#
Evidence Retriever Prototype v0.1
Status: prototype - read-only local search over Markdown files
Owner: Martin Urumov
Scope: Markdown files whose name contains CANDIDATE (default filter, see -Root and the -Filter below)
Boundary: retrieves explicit text and metadata; does not infer truth, confidence, intent, or status.
Formerly KOMPASS_EVIDENCE_RETRIEVER_PROTOTYPE_v0.1.ps1 (2026-08-03). Renamed by function; header and
one output title changed; search logic unchanged.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateNotNullOrEmpty()]
    [string]$Query,

    [Parameter()]
    [string]$Root = '',

    [Parameter()]
    [ValidateRange(1, 200)]
    [int]$MaxResults = 20,

    [Parameter()]
    [ValidateSet('Table', 'Json', 'Markdown')]
    [string]$Format = 'Table'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Root)) {
    $scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
    $projectDirectory = Split-Path -Parent $scriptDirectory
    $Root = Join-Path $projectDirectory 'outputs'
}

if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
    throw "Evidence root does not exist: $Root"
}

$resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
$terms = @($Query -split '\s+' | Where-Object { $_.Length -gt 0 })
$results = [System.Collections.Generic.List[object]]::new()

function Get-ExplicitConfidence {
    param([string]$Text)

    $found = [System.Collections.Generic.List[string]]::new()
    # Build Unicode markers from code points so the script remains parseable
    # under Windows PowerShell 5.1, which treats UTF-8 without BOM as ANSI.
    $markers = @(
        [pscustomobject]@{ Marker = [char]::ConvertFromUtf32(0x1F7E2); Label = 'established' }
        [pscustomobject]@{ Marker = [char]::ConvertFromUtf32(0x1F7E1); Label = 'moderate' }
        [pscustomobject]@{ Marker = [char]::ConvertFromUtf32(0x1F7E0); Label = 'low' }
        [pscustomobject]@{ Marker = [char]::ConvertFromUtf32(0x1F534); Label = 'hypothesis' }
        [pscustomobject]@{ Marker = [char]::ConvertFromUtf32(0x1F535); Label = 'synthesis/metaphor' }
        [pscustomobject]@{ Marker = [char]::ConvertFromUtf32(0x26AA); Label = 'unverified' }
    )

    foreach ($entry in $markers) {
        if ($Text.Contains($entry.Marker)) {
            $found.Add("$($entry.Marker) $($entry.Label)")
        }
    }

    if ($Text -match '(?<![A-Za-z])SC(?![A-Za-z])') {
        $found.Add('SC illuminated unknown')
    }

    if ($found.Count -eq 0) {
        return 'UNMARKED'
    }

    return ($found -join '; ')
}

function Get-ExplicitMode {
    param([string]$Text)

    $matches = [regex]::Matches(
        $Text,
        '(?i)(?<![A-Za-z])(source|search|inference|gap|observation|preference|request)(?![A-Za-z])'
    )
    $modes = @($matches | ForEach-Object { $_.Value.ToLowerInvariant() } | Select-Object -Unique)
    if ($modes.Count -eq 0) {
        return 'UNMARKED'
    }
    return ($modes -join '; ')
}

function Get-ExplicitSignals {
    param([string]$Text)

    $signals = [System.Collections.Generic.List[string]]::new()
    if ($Text -match '(?i)(?<![A-Za-z])gap(?![A-Za-z])|\u043B\u0438\u043F\u0441\u0432\u0430|\u043D\u0435\u043F\u0440\u043E\u0432\u0435\u0440') {
        $signals.Add('explicit-gap/unverified-language')
    }
    if ($Text -match '(?i)contradict|\u043F\u0440\u043E\u0442\u0438\u0432\u043E\u0440\u0435\u0447|\u043A\u043E\u043D\u0442\u0440\u0430\u043C\u043E\u0434\u0435\u043B|does not fit|\u043D\u0435\s+\u043F\u0430\u0441\u0432\u0430') {
        $signals.Add('explicit-contradiction/countermodel-language')
    }
    if ($Text -match '(?i)limit|\u0433\u0440\u0430\u043D\u0438\u0446\u0430|\u043E\u0433\u0440\u0430\u043D\u0438\u0447') {
        $signals.Add('explicit-limit-language')
    }
    if ($signals.Count -eq 0) {
        return 'none-on-matched-line'
    }
    return ($signals -join '; ')
}

function Get-Score {
    param(
        [string]$Line,
        [string]$Section,
        [string]$FileName,
        [string]$Phrase,
        [string[]]$Tokens
    )

    $score = 0
    if ($Line.IndexOf($Phrase, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        $score += 10
    }

    $allTermsInLine = $true
    foreach ($term in $Tokens) {
        if ($Line.IndexOf($term, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
            $allTermsInLine = $false
            break
        }
    }
    if ($allTermsInLine) { $score += 5 }

    if ($Section.IndexOf($Phrase, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        $score += 3
    }
    if ($FileName.IndexOf($Phrase, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        $score += 2
    }
    return $score
}

$files = @(Get-ChildItem -LiteralPath $resolvedRoot -File -Filter '*CANDIDATE*.md' | Sort-Object Name)

foreach ($file in $files) {
    $lines = @(Get-Content -LiteralPath $file.FullName -Encoding UTF8)
    $section = '(document header)'

    for ($index = 0; $index -lt $lines.Count; $index++) {
        $line = [string]$lines[$index]
        if ($line -match '^#{1,6}\s+') {
            $section = $line.Trim()
        }

        $phraseMatch = $line.IndexOf($Query, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
        $termMatch = $terms.Count -gt 1
        if ($termMatch) {
            foreach ($term in $terms) {
                if ($line.IndexOf($term, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
                    $termMatch = $false
                    break
                }
            }
        }

        if (-not ($phraseMatch -or $termMatch)) {
            continue
        }

        $urls = @(
            [regex]::Matches($line, 'https?://[^\s\)\]>]+') |
                ForEach-Object { $_.Value.TrimEnd('.', ',') } |
                Select-Object -Unique
        )

        $excerpt = $line.Trim()
        if ($excerpt.Length -gt 320) {
            $excerpt = $excerpt.Substring(0, 317) + '...'
        }

        $results.Add([pscustomobject]@{
            Score = Get-Score -Line $line -Section $section -FileName $file.Name -Phrase $Query -Tokens $terms
            File = $file.Name
            Line = $index + 1
            Section = $section
            Confidence = Get-ExplicitConfidence -Text $line
            Mode = Get-ExplicitMode -Text $line
            Signals = Get-ExplicitSignals -Text $line
            SourceUrls = if ($urls.Count -gt 0) { $urls -join ' ; ' } else { 'none-on-matched-line' }
            Excerpt = $excerpt
        })
    }
}

$selected = @(
    $results |
        Sort-Object @{ Expression = 'Score'; Descending = $true }, File, Line |
        Select-Object -First $MaxResults
)

switch ($Format) {
    'Json' {
        $selected | ConvertTo-Json -Depth 4
    }
    'Markdown' {
        "# Evidence Retrieval"
        ""
        "Query: ``$Query``  "
        "Root: ``$resolvedRoot``  "
        "Candidate files searched: $($files.Count)  "
        "Results returned: $($selected.Count)"
        ""

        if ($selected.Count -eq 0) {
            "No explicit match. This is a search result, not evidence that the concept is absent."
            break
        }

        foreach ($item in $selected) {
            "## $($item.File):$($item.Line)"
            ""
            "- Section: $($item.Section)"
            "- Explicit confidence: $($item.Confidence)"
            "- Explicit mode: $($item.Mode)"
            "- Explicit signals: $($item.Signals)"
            "- URLs on matched line: $($item.SourceUrls)"
            "- Text: $($item.Excerpt)"
            ""
        }
    }
    default {
        if ($selected.Count -eq 0) {
            [pscustomobject]@{
                Query = $Query
                Results = 0
                Boundary = 'No explicit match; absence is not established.'
            } | Format-List
            break
        }

        $selected |
            Select-Object Score, File, Line, Section, Confidence, Mode, Signals, SourceUrls, Excerpt |
            Format-List
    }
}
