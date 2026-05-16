param(
  [string]$EnvFile = ".postgres-backup.env"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

if (-not (Test-Path $EnvFile)) {
  Write-Error "Missing $EnvFile. Copy postgres-backup.env.example to $EnvFile and fill in the private values first."
}

$logDir = Join-Path $repoRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logPath = Join-Path $logDir "postgres-backup-$timestamp.log"

Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) {
    return
  }

  $separatorIndex = $line.IndexOf("=")
  if ($separatorIndex -lt 1) {
    return
  }

  $name = $line.Substring(0, $separatorIndex).Trim()
  $value = $line.Substring($separatorIndex + 1).Trim()

  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  [Environment]::SetEnvironmentVariable($name, $value, "Process")
}

if (-not $env:POSTGRES_URL -and -not $env:DATABASE_URL) {
  Write-Error "Missing POSTGRES_URL or DATABASE_URL in $EnvFile."
}

Write-Host "Writing backup log to $logPath"
npm.cmd run firestore:backup:postgres *>&1 | Tee-Object -FilePath $logPath
exit $LASTEXITCODE
