[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ZipPath,

    [string]$ExpectedSha256 = "",
    [string]$ExtractTo = "",
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

$actualHash = Get-ReleaseSha256 -Path $ZipPath
if ($ExpectedSha256 -and $actualHash -ne $ExpectedSha256.ToLowerInvariant()) {
    throw "Archive SHA256 mismatch: expected $ExpectedSha256, got $actualHash"
}

$ownedExtract = $false
if (-not $ExtractTo) {
    $ExtractTo = Join-Path ([System.IO.Path]::GetTempPath()) ("itelab-release-check-" + [guid]::NewGuid().ToString("N"))
    $ownedExtract = $true
}
if (Test-Path -LiteralPath $ExtractTo) {
    throw "ExtractTo must not exist: $ExtractTo"
}
New-Item -ItemType Directory -Path $ExtractTo | Out-Null

try {
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $ExtractTo -Force

    $checkArgs = @{ Directory = $ExtractTo }
    if ($AllowUnsigned) {
        $checkArgs.AllowUnsigned = $true
    }
    $check = Test-ReleaseDirectory @checkArgs

    $signatureText = if ($check.Signed) {
        "valid Authenticode signature: $($check.Signer)"
    } else {
        "unsigned development build"
    }

    Write-Host "Archive SHA256: $actualHash"
    Write-Host "Files: $($check.Files.Count)"
    Write-Host "Signature: $signatureText"
    Write-Host "Extracted to: $ExtractTo"

    Write-Output ([pscustomobject]@{
            Zip = $ZipPath
            Sha256 = $actualHash
            ExtractDir = $ExtractTo
            Signed = [bool]$check.Signed
            Signer = [string]$check.Signer
            Files = $check.Files.Count
        } | ConvertTo-Json -Compress)
} catch {
    if ($ownedExtract) {
        Remove-Item -LiteralPath $ExtractTo -Recurse -Force -ErrorAction SilentlyContinue
    }
    throw
}
