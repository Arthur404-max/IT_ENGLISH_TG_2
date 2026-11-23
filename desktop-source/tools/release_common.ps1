Set-StrictMode -Version Latest

function Get-ReleaseSha256 {
    param([Parameter(Mandatory = $true)][string]$Path)

    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
}

function Get-ReleaseFileHashes {
    param([Parameter(Mandatory = $true)][string]$Directory)

    $sumsPath = Join-Path $Directory "SHA256SUMS.txt"
    if (-not (Test-Path -LiteralPath $sumsPath -PathType Leaf)) {
        throw "SHA256SUMS.txt is missing from $Directory"
    }

    $entries = [ordered]@{}
    foreach ($line in [System.IO.File]::ReadAllLines($sumsPath)) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }
        if ($trimmed -notmatch '^([0-9a-fA-F]{64})\s{2}([^\\/]+)$') {
            throw "Bad SHA256SUMS.txt line: $line"
        }

        $hash = $Matches[1].ToLowerInvariant()
        $name = $Matches[2].Trim()
        if ($entries.Contains($name)) {
            throw "Duplicate SHA256SUMS.txt entry: $name"
        }

        $filePath = Join-Path $Directory $name
        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
            throw "Release file is missing: $name"
        }

        $actual = Get-ReleaseSha256 -Path $filePath
        if ($actual -ne $hash) {
            throw "SHA256 mismatch for ${name}: expected $hash, got $actual"
        }
        $entries[$name] = $hash
    }

    if ($entries.Count -eq 0) {
        throw "SHA256SUMS.txt has no entries"
    }

    $directories = @(Get-ChildItem -LiteralPath $Directory -Recurse -Directory -Force)
    if ($directories.Count -gt 0) {
        throw "Unexpected directories in release: $($directories.Name -join ', ')"
    }

    $actualNames = @(
        Get-ChildItem -LiteralPath $Directory -File -Force |
            ForEach-Object { $_.Name } |
            Sort-Object
    )
    $unexpected = @($actualNames | Where-Object { $_ -ne "SHA256SUMS.txt" -and -not $entries.Contains($_) })
    if ($unexpected.Count -gt 0) {
        throw "Unexpected release files: $($unexpected -join ', ')"
    }

    foreach ($name in @("it-english-lab.exe", "it-english-lab-embedded.exe", "README.md", "RELEASE.txt")) {
        if (-not $entries.Contains($name)) {
            throw "Release is missing required file: $name"
        }
    }

    return ,$entries
}

function Test-ReleaseSignatures {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [switch]$AllowUnsigned
    )

    $exeNames = @("it-english-lab.exe", "it-english-lab-embedded.exe")
    $states = @()
    foreach ($name in $exeNames) {
        $path = Join-Path $Directory $name
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Release executable is missing: $name"
        }

        $signature = Get-AuthenticodeSignature -LiteralPath $path
        $states += [pscustomobject]@{
            Name = $name
            Status = [string]$signature.Status
            Signer = if ($signature.SignerCertificate) { [string]$signature.SignerCertificate.Subject } else { "" }
            Thumbprint = if ($signature.SignerCertificate) { [string]$signature.SignerCertificate.Thumbprint } else { "" }
        }
    }

    $invalid = @($states | Where-Object { $_.Status -notin @("Valid", "NotSigned") })
    if ($invalid.Count -gt 0) {
        $details = ($invalid | ForEach-Object { "$($_.Name): $($_.Status)" }) -join "; "
        throw "Authenticode verification failed: $details"
    }

    $valid = @($states | Where-Object { $_.Status -eq "Valid" })
    if ($valid.Count -gt 0 -and $valid.Count -ne $states.Count) {
        throw "Release mixes signed and unsigned executables"
    }

    if ($valid.Count -eq 0 -and -not $AllowUnsigned) {
        throw "Release is unsigned. Use -AllowUnsigned only for local development builds."
    }

    if ($valid.Count -gt 0) {
        $thumbprints = @($valid | ForEach-Object { $_.Thumbprint } | Sort-Object -Unique)
        if ($thumbprints.Count -ne 1) {
            throw "Release executables have different signing certificates"
        }
        return [pscustomobject]@{
            Signed = $true
            Signer = $valid[0].Signer
            Thumbprint = $valid[0].Thumbprint
            States = $states
        }
    }

    return [pscustomobject]@{
        Signed = $false
        Signer = ""
        Thumbprint = ""
        States = $states
    }
}

function Test-ReleaseDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [switch]$AllowUnsigned
    )

    $files = Get-ReleaseFileHashes -Directory $Directory
    $signature = Test-ReleaseSignatures -Directory $Directory -AllowUnsigned:$AllowUnsigned

    return [pscustomobject]@{
        Directory = $Directory
        Files = $files
        Signed = $signature.Signed
        Signer = $signature.Signer
        Thumbprint = $signature.Thumbprint
        States = $signature.States
    }
}

function Write-ReleaseChecksums {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [Parameter(Mandatory = $true)][string[]]$Names
    )

    $lines = @(
        $Names |
            Sort-Object -Unique |
            ForEach-Object {
                $path = Join-Path $Directory $_
                if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
                    throw "Cannot checksum missing file: $_"
                }
                "$(Get-ReleaseSha256 -Path $path)  $_"
            }
    )

    $utf8 = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllLines((Join-Path $Directory "SHA256SUMS.txt"), $lines, $utf8)
}

function Find-SignTool {
    $command = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $roots = @(
        "${env:ProgramFiles(x86)}\Windows Kits\10\bin",
        "$env:ProgramFiles\Windows Kits\10\bin"
    )
    foreach ($root in $roots) {
        if (-not (Test-Path -LiteralPath $root -PathType Container)) {
            continue
        }
        $candidate = Get-ChildItem -LiteralPath $root -Recurse -Filter signtool.exe -File -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($candidate) {
            return $candidate.FullName
        }
    }

    throw "signtool.exe was not found. Install the Windows SDK to sign release artifacts."
}

function Invoke-ReleaseSign {
    param(
        [Parameter(Mandatory = $true)][string]$SignTool,
        [Parameter(Mandatory = $true)][string[]]$Files,
        [Parameter(Mandatory = $true)][string]$PfxPath,
        [string]$PfxPassword = "",
        [string]$TimestampUrl = "http://timestamp.digicert.com"
    )

    if (-not (Test-Path -LiteralPath $PfxPath -PathType Leaf)) {
        throw "PFX certificate was not found: $PfxPath"
    }

    foreach ($file in $Files) {
        $arguments = @("sign", "/fd", "SHA256", "/f", $PfxPath)
        if ($PfxPassword) {
            $arguments += @("/p", $PfxPassword)
        }
        if ($TimestampUrl) {
            $arguments += @("/tr", $TimestampUrl, "/td", "SHA256")
        }
        $arguments += @("/d", "IT English Lab", $file)

        & $SignTool @arguments
        if ($LASTEXITCODE -ne 0) {
            throw "signtool failed for $file (exit $LASTEXITCODE)"
        }
    }
}
