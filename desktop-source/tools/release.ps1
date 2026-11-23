[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [string]$DistDir = "",
    [string]$OutDir = "",

    [string]$PfxPath = "",
    [string]$PfxPassword = "",
    [string]$TimestampUrl = "http://timestamp.digicert.com",

    [switch]$RequireSignature
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "release_common.ps1")

$root = Split-Path $PSScriptRoot -Parent
if (-not $DistDir) {
    $DistDir = Join-Path $root "dist"
}
if (-not $OutDir) {
    $OutDir = Join-Path $DistDir "release"
}

if ($Version -notmatch '^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') {
    throw "Version must look like v4.0.0 or v4.0.0-rc.1: $Version"
}
if (-not $Version.StartsWith("v")) {
    $Version = "v$Version"
}

$DistDir = (Resolve-Path -LiteralPath $DistDir).Path
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$OutDir = (Resolve-Path -LiteralPath $OutDir).Path

$zipName = "IT-English-Lab-$Version.zip"
$zipPath = Join-Path $OutDir $zipName
$checksumPath = "$zipPath.sha256"
$releaseSumsPath = Join-Path $OutDir "SHA256SUMS-release.txt"

$required = @(
    (Join-Path $DistDir "it-english-lab.exe"),
    (Join-Path $DistDir "it-english-lab-embedded.exe"),
    (Join-Path $root "README.md")
)
foreach ($path in $required) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required release input is missing: $path"
    }
}

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("itelab-release-stage-" + [guid]::NewGuid().ToString("N"))
$verifyDir = Join-Path ([System.IO.Path]::GetTempPath()) ("itelab-release-verify-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stage | Out-Null

try {
    Copy-Item -LiteralPath (Join-Path $DistDir "it-english-lab.exe") -Destination $stage -Force
    Copy-Item -LiteralPath (Join-Path $DistDir "it-english-lab-embedded.exe") -Destination $stage -Force
    Copy-Item -LiteralPath (Join-Path $root "README.md") -Destination $stage -Force

    if ($PfxPath) {
        $signTool = Find-SignTool
        Invoke-ReleaseSign -SignTool $signTool `
            -Files @((Join-Path $stage "it-english-lab.exe"), (Join-Path $stage "it-english-lab-embedded.exe")) `
            -PfxPath $PfxPath -PfxPassword $PfxPassword -TimestampUrl $TimestampUrl
    }

    $allowUnsigned = (-not $RequireSignature) -and (-not $PfxPath)
    $signature = Test-ReleaseSignatures -Directory $stage -AllowUnsigned:$allowUnsigned

    $commit = "unknown"
    $git = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($git) {
        $commitOutput = & $git.Source -C $root rev-parse --short HEAD 2>$null
        if ($LASTEXITCODE -eq 0 -and $commitOutput) {
            $commit = ($commitOutput | Select-Object -First 1).Trim()
        }
    }
    if ($env:GITHUB_SHA) {
        $commit = $env:GITHUB_SHA
    }

    $signatureText = if ($signature.Signed) {
        "valid Authenticode signature ($($signature.Signer))"
    } else {
        "unsigned development build"
    }
    $releaseInfo = @(
        "IT English Lab $Version"
        "Build commit: $commit"
        "Built (UTC): $([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'))"
        "Signature: $signatureText"
        "Contents: it-english-lab.exe, it-english-lab-embedded.exe, README.md, SHA256SUMS.txt"
    ) -join "`r`n"

    $utf8 = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText((Join-Path $stage "RELEASE.txt"), $releaseInfo + "`r`n", $utf8)

    Write-ReleaseChecksums -Directory $stage -Names @(
        "it-english-lab.exe",
        "it-english-lab-embedded.exe",
        "README.md",
        "RELEASE.txt"
    )

    $stagedCheck = Test-ReleaseDirectory -Directory $stage -AllowUnsigned:$allowUnsigned

    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }
    if (Test-Path -LiteralPath $checksumPath) {
        Remove-Item -LiteralPath $checksumPath -Force
    }

    Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipPath -CompressionLevel Optimal
    $zipHash = Get-ReleaseSha256 -Path $zipPath

    [System.IO.File]::WriteAllText($checksumPath, "$zipHash  $zipName`r`n", $utf8)

    Expand-Archive -LiteralPath $zipPath -DestinationPath $verifyDir -Force
    $archiveCheck = Test-ReleaseDirectory -Directory $verifyDir -AllowUnsigned:$allowUnsigned

    $innerSums = [System.IO.File]::ReadAllLines((Join-Path $verifyDir "SHA256SUMS.txt"))
    $releaseSums = @("$zipHash  $zipName") + $innerSums
    [System.IO.File]::WriteAllLines($releaseSumsPath, $releaseSums, $utf8)

    Write-Output ([pscustomobject]@{
            Version = $Version
            Zip = $zipPath
            ZipSha256 = $zipHash
            Signed = [bool]$archiveCheck.Signed
            Signer = [string]$archiveCheck.Signer
            StagedFiles = $stagedCheck.Files.Count
        } | ConvertTo-Json -Compress)
} finally {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $verifyDir -Recurse -Force -ErrorAction SilentlyContinue
}
