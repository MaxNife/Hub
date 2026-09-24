# Build Hub on Windows: frontend then Go binary.
$ErrorActionPreference = "Stop"
Push-Location "$PSScriptRoot\web"
npm.cmd run build
Pop-Location
$GoBin = "go"
if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
  foreach ($cand in @("$PSScriptRoot\.tools\go\bin\go.exe", "C:\Program Files\Go\bin\go.exe")) {
    if (Test-Path $cand) { $GoBin = $cand; break }
  }
}
& $GoBin build -o hub.exe ./cmd/hub
Write-Host "Built hub.exe"
