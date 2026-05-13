param(
  [string]$TaskName = "Code Recall Firestore PostgreSQL Backup",
  [string]$At = "23:00"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$runnerPath = Join-Path $repoRoot "scripts\run-postgres-backup.ps1"
$envPath = Join-Path $repoRoot ".postgres-backup.env"

if (-not (Test-Path $envPath)) {
  Write-Error "Missing .postgres-backup.env. Create it from postgres-backup.env.example before registering the scheduled task."
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`"" `
  -WorkingDirectory $repoRoot

$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Backs up Code Recall Firestore collections to PostgreSQL." `
  -Force | Out-Null

Write-Host "Registered scheduled task: $TaskName"
Write-Host "Schedule: daily at $At"
Write-Host "Runner: $runnerPath"
