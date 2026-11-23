param(
    [switch]$Embedded,
    [string]$MingwRoot = "",
    [string]$LlvmRoot = "",
    [string]$TargetDir = "",
    [switch]$Run
)

$ErrorActionPreference = "Stop"

function Find-MingwRoot {
    param([string]$Explicit)
    if ($Explicit) {
        if (Test-Path (Join-Path $Explicit "bin\gcc.exe")) { return (Resolve-Path $Explicit).Path }
        if (Test-Path (Join-Path $Explicit "mingw64\bin\gcc.exe")) { return (Resolve-Path (Join-Path $Explicit "mingw64")).Path }
        throw "Не найден gcc.exe в $Explicit"
    }
    if ($env:MINGW_ROOT -and (Test-Path (Join-Path $env:MINGW_ROOT "bin\gcc.exe"))) {
        return (Resolve-Path $env:MINGW_ROOT).Path
    }
    $packages = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
    if (Test-Path $packages) {
        $candidate = Get-ChildItem $packages -Directory -Filter "BrechtSanders.WinLibs*" -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            ForEach-Object { Join-Path $_.FullName "mingw64" } |
            Where-Object { Test-Path (Join-Path $_ "bin\gcc.exe") } |
            Select-Object -First 1
        if ($candidate) { return (Resolve-Path $candidate).Path }
    }
    foreach ($p in @("C:\msys64\mingw64", "C:\mingw64", "C:\Program Files\mingw64")) {
        if (Test-Path (Join-Path $p "bin\gcc.exe")) { return (Resolve-Path $p).Path }
    }
    # Fall back to whatever is already on PATH.
    $gcc = Get-Command gcc.exe -ErrorAction SilentlyContinue
    if ($gcc) { return (Split-Path (Split-Path $gcc.Source -Parent) -Parent) }
    throw "Не найден MinGW-w64. Укажите -MingwRoot <путь>\mingw64."
}

function Find-LlvmRoot {
    param([string]$Explicit)
    $paths = @()
    if ($Explicit) { $paths += $Explicit }
    if ($env:LIBCLANG_PATH) { $paths += (Split-Path $env:LIBCLANG_PATH -Parent) }
    $paths += @("C:\Program Files\LLVM", "C:\Program Files (x86)\LLVM")
    foreach ($p in $paths) {
        if ($p -and (Test-Path (Join-Path $p "bin\libclang.dll"))) { return (Resolve-Path $p).Path }
    }
    throw "Не найден LLVM/libclang. Установите LLVM или укажите -LlvmRoot `"C:\Program Files\LLVM`"."
}

$mingw = Find-MingwRoot $MingwRoot
$env:Path = "$mingw\bin;$env:USERPROFILE\.cargo\bin;$env:Path"

# Keep the C++ runtime and the C runtime statically linked. build.rs also adds
# the ggml archives and the matching MinGW CRT libraries in the right order.
$env:CXXSTDLIB_STATIC = "1"
if (-not $env:CFLAGS) { $env:CFLAGS = "-D_WIN32_WINNT=0x0A00 -DWINVER=0x0A00" }
if (-not $env:CXXFLAGS) { $env:CXXFLAGS = $env:CFLAGS }

if ($Embedded) {
    $llvm = Find-LlvmRoot $LlvmRoot
    $env:LIBCLANG_PATH = Join-Path $llvm "bin"
    $clangInclude = Get-ChildItem (Join-Path $llvm "lib\clang") -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        Select-Object -First 1
    if (-not $clangInclude) {
        throw "Не найден каталог C:\...\LLVM\lib\clang\<версия>\include."
    }
    $inc1 = (Join-Path $clangInclude.FullName "include") -replace "\\", "/"
    $inc2 = (Join-Path $mingw "x86_64-w64-mingw32\include") -replace "\\", "/"
    $env:BINDGEN_EXTRA_CLANG_ARGS = "--target=x86_64-w64-windows-gnu -isystem `"$inc1`" -isystem `"$inc2`""
    $env:CC = Join-Path $mingw "bin\gcc.exe"
    $env:CXX = Join-Path $mingw "bin\g++.exe"
    $env:AR = Join-Path $mingw "bin\ar.exe"
    Write-Host "MinGW: $mingw"
    Write-Host "LLVM:  $llvm"
}

# The project path contains non-ASCII characters. The GNU linker handles this
# badly, so keep all build artifacts in an ASCII-only directory. Use separate
# target directories for the two feature sets to avoid unnecessary rebuilds.
if (-not $TargetDir) {
    $TargetDir = if ($Embedded) { "$env:TEMP\itelab-target" } else { "$env:TEMP\itelab-target-plain" }
}
$env:CARGO_TARGET_DIR = $TargetDir
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

$cargoArgs = @("build", "--release")
if ($Embedded) { $cargoArgs += @("--features", "embedded") }

Write-Host "Сборка: cargo $($cargoArgs -join ' ')"
$buildLog = Join-Path $TargetDir "cargo-build.log"
$buildErr = Join-Path $TargetDir "cargo-build.err.log"
$proc = Start-Process -FilePath "cargo" -ArgumentList $cargoArgs -NoNewWindow -Wait -PassThru `
    -RedirectStandardOutput $buildLog -RedirectStandardError $buildErr
if (Test-Path $buildLog) { Get-Content $buildLog }
if (Test-Path $buildErr) { Get-Content $buildErr }
if ($proc.ExitCode -ne 0) { exit $proc.ExitCode }

$exe = Join-Path $TargetDir "release\it-english-lab.exe"
if (-not (Test-Path $exe)) { throw "Сборка завершилась, но exe не найден: $exe" }

$dist = Join-Path $PSScriptRoot "dist"
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$suffix = if ($Embedded) { "it-english-lab-embedded.exe" } else { "it-english-lab.exe" }
$dest = Join-Path $dist $suffix
Copy-Item $exe $dest -Force
$sizeMb = [math]::Round((Get-Item $dest).Length / 1MB, 1)
Write-Host "Готово: $dest ($sizeMb МБ)"

if ($Run) {
    & $dest
}
