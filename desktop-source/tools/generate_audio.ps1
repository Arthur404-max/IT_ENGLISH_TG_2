# IT English Lab — generate local listening files with Windows SAPI.
#
#   powershell -ExecutionPolicy Bypass -File tools/generate_audio.ps1
#
# The recordings are deliberately short (16 kHz, mono, 16-bit PCM) so they can
# be bundled into the executable and cached by the PWA without a large download.
# The en-US voice "Microsoft Zira Desktop" is used when available.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dataPath = Join-Path $root "data\audio.json"
$outDir = Join-Path $root "assets\audio"
if (-not (Test-Path $dataPath)) {
  throw "data/audio.json is missing. Run: node tools/build_audio_data.js"
}
[System.IO.Directory]::CreateDirectory($outDir) | Out-Null
Add-Type -AssemblyName System.Speech
$data = Get-Content -Raw -Encoding UTF8 $dataPath | ConvertFrom-Json
$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $voice = $synth.GetInstalledVoices() | Where-Object {
    $_.VoiceInfo.Culture.Name -eq "en-US" -or $_.VoiceInfo.Name -like "*Zira*"
  } | Select-Object -First 1
  if ($voice) {
    $synth.SelectVoice($voice.VoiceInfo.Name)
    Write-Host "Voice: $($voice.VoiceInfo.Name)"
  } else {
    Write-Warning "No en-US voice found; using the default system voice."
    $synth.SelectVoice($synth.GetInstalledVoices()[0].VoiceInfo.Name)
  }
  $synth.Rate = 0
  $synth.Volume = 100
  $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(
    16000,
    [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
    [System.Speech.AudioFormat.AudioChannel]::Mono
  )
  foreach ($item in $data.items) {
    $path = Join-Path $outDir $item.file
    $synth.SetOutputToWaveFile($path, $format)
    $synth.Speak($item.transcript)
    $synth.SetOutputToNull()
    $size = (Get-Item $path).Length
    Write-Host ("{0}  {1:N0} bytes" -f $item.file, $size)
  }
} finally {
  $synth.Dispose()
}
Write-Host "Audio files written to $outDir"
