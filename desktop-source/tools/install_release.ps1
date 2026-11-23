[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
    [Parameter(Mandatory = $true)]
    [string]$ZipPath,

    [Parameter(Mandatory = $true)]
    [string]$InstallDir,

    [ValidateSet("plain", "embedded")]
    [string]$Mode = "plain",

    [string]$ExpectedSha256 = "",
    [switch]$AllowUnsigned
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "release_common.ps1")

if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) {
    throw "Release archive was not found: $ZipPath"
}
$ZipPath = (Resolve-Path -LiteralPath $ZipPath).Path

if (-not $ExpectedSha256) {
    $adjacentChecksum = "$ZipPath.sha256"
    if (Test-Path -LiteralPath $adjacentChecksum -PathType Leaf) {
        $ExpectedSha256 = $adjacentChecksum
    }
}
if ($ExpectedSha256 -and (Test-Path -LiteralPath $ExpectedSha256 -PathType Leaf)) {
    $ExpectedSha256 = ([System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $ExpectedSha256).Path)).Trim().Split()[0]
}
if ($ExpectedSha256 -and $ExpectedSha256 -notmatch '^[0-9a-fA-F]{64}$') {
    throw "ExpectedSha256 must be a 64-character SHA-256 hash"
}
$expectedHash = if ($ExpectedSha256) { $ExpectedSha256.ToLowerInvariant() } else { "" }
$actualZipHash = Get-ReleaseSha256 -Path $ZipPath
if ($expectedHash -and $actualZipHash -ne $expectedHash) {
    throw "Archive SHA256 mismatch: expected $expectedHash, got $actualZipHash"
}

if (Test-Path -LiteralPath $InstallDir -PathType Leaf) {
    throw "InstallDir is a file, not a directory: $InstallDir"
}
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$InstallDir = (Resolve-Path -LiteralPath $InstallDir).Path

$targetName = if ($Mode -eq "embedded") { "it-english-lab-embedded.exe" } else { "it-english-lab.exe" }
$target = Join-Path $InstallDir $targetName
$targetFull = [System.IO.Path]::GetFullPath($target)
$running = @(
    Get-Process -ErrorAction SilentlyContinue | Where-Object {
        try {
            $_.Path -and [string]::Equals(
                [System.IO.Path]::GetFullPath($_.Path),
                $targetFull,
                [System.StringComparison]::OrdinalIgnoreCase
            )
        } catch {
            $false
        }
    }
)
if ($running.Count -gt 0) {
    $pids = ($running | ForEach-Object { $_.Id }) -join ", "
    throw "Application is running ($pids). Stop it before updating $target."
}

$extractDir = Join-Path ([System.IO.Path]::GetTempPath()) ("itelab-install-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $extractDir | Out-Null

try {
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $extractDir -Force

    $checkArgs = @{ Directory = $extractDir }
    if ($AllowUnsigned) {
        $checkArgs.AllowUnsigned = $true
    }
    $check = Test-ReleaseDirectory @checkArgs

    $source = Join-Path $extractDir $targetName
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Release does not contain $targetName"
    }

    if (-not $PSCmdlet.ShouldProcess($target, "Install $targetName from verified release")) {
        return
    }

    $backup = $null
    if (Test-Path -LiteralPath $target -PathType Leaf) {
        $stamp = Get-Date -Format "yyyyMMdd-HHmmssfff"
        $backup = "$target.bak-$stamp"
        Copy-Item -LiteralPath $target -Destination $backup -Force
    }

    $newTarget = "$target.new"
    Copy-Item -LiteralPath $source -Destination $newTarget -Force
    try {
        Move-Item -LiteralPath $newTarget -Destination $target -Force
    } catch {
        Remove-Item -LiteralPath $newTarget -Force -ErrorAction SilentlyContinue
        throw
    }

    $installedHash = Get-ReleaseSha256 -Path $target
    $sourceHash = Get-ReleaseSha256 -Path $source
    if ($installedHash -ne $sourceHash) {
        throw "Installed executable hash does not match the verified release"
    }

    $signature = Get-AuthenticodeSignature -LiteralPath $target
    $signatureText = if ($signature.Status -eq "Valid") {
        "valid Authenticode signature: $($signature.SignerCertificate.Subject)"
    } else {
        "unsigned development build"
    }

    Write-Host "Installed: $target"
    Write-Host "Signature: $signatureText"
    if ($backup) {
        Write-Host "Previous version backed up to: $backup"
    }
    Write-Host "Progress in %APPDATA%\ITEnglishLab was not touched."

    Write-Output ([pscustomobject]@{
            InstallDir = $InstallDir
            Target = $target
            Backup = $backup
            ZipSha256 = $actualZipHash
            Sha256 = $installedHash
            Signed = [bool]$check.Signed
            Signer = [string]$check.Signer
        } | ConvertTo-Json -Compress)
} finally {
    Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
}
