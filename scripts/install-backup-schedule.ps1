<#
.SYNOPSIS
  Registers the twice-daily customer-data backup with Windows Task Scheduler.

.DESCRIPTION
  Creates a scheduled task that runs `npm run backup` every 12 hours.

  The schedule is owned by the operating system rather than by the application
  because the app runs as several Node instances behind a proxy: an in-process
  timer would fire once per instance — several identical archives and several
  identical emails every run — and would reset on every deploy. Task Scheduler
  runs it exactly once, keeps running when the site is stopped, and records a
  non-zero "Last Run Result" when the job reports failure.

  On Linux use the systemd timer in docs/BACKUPS.md instead.

.PARAMETER ProjectPath
  Project root. Defaults to the parent of this script's directory.

.PARAMETER At
  First run time, "HH:mm". Runs every 12 hours from there. Default 03:00,
  which pairs with 15:00 — both outside a restaurant's busiest hours.

.PARAMETER TaskName
  Scheduled task name. Default "Menuland Backup".

.PARAMETER Remove
  Unregister the task instead of creating it.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\install-backup-schedule.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\install-backup-schedule.ps1 -Remove
#>
[CmdletBinding()]
param(
  [string]$ProjectPath = (Split-Path -Parent $PSScriptRoot),
  [string]$At = "03:00",
  [string]$TaskName = "Menuland Backup",
  [switch]$Remove
)

$ErrorActionPreference = "Stop"

if ($Remove) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Output "Removed scheduled task '$TaskName'."
  } else {
    Write-Output "No scheduled task named '$TaskName'."
  }
  return
}

$ProjectPath = (Resolve-Path $ProjectPath).Path

if (-not (Test-Path (Join-Path $ProjectPath "package.json"))) {
  throw "No package.json in '$ProjectPath'. Pass -ProjectPath explicitly."
}

$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue)
if (-not $npm) { $npm = (Get-Command npm -ErrorAction SilentlyContinue) }
if (-not $npm) { throw "npm was not found on PATH." }

if ($At -notmatch '^([01]\d|2[0-3]):([0-5]\d)$') {
  throw "-At must be HH:mm in 24-hour form (got '$At')."
}

# cmd.exe wrapper so stdout and stderr land in the log file. Task Scheduler
# captures neither on its own, and a backup job whose only failure signal is an
# exit code is hard to diagnose after the fact.
# Logs belong with the customer data, not in the application tree — the whole
# point of the split is that $ProjectPath can be deleted and replaced. Honours
# DATA_DIR when the operator has set one, and otherwise falls back to the
# sibling `data/` folder the default layout uses.
$dataDir = if ($env:DATA_DIR) { $env:DATA_DIR } else { Join-Path (Split-Path -Parent $ProjectPath) "data" }
if (-not [System.IO.Path]::IsPathRooted($dataDir)) {
  $dataDir = Join-Path $ProjectPath $dataDir
}
$logDir = Join-Path $dataDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "backup.log"

$command = '"' + $npm.Source + '" run backup >> "' + $logFile + '" 2>&1'
$action = New-ScheduledTaskAction -Execute "cmd.exe" `
  -Argument ('/c ' + $command) `
  -WorkingDirectory $ProjectPath

# Repeat forever at 12-hour intervals from the first run of the day.
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At $At `
    -RepetitionInterval (New-TimeSpan -Hours 12) `
    -RepetitionDuration (New-TimeSpan -Days 3650)).Repetition

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask -TaskName $TaskName `
  -Action $action -Trigger $trigger -Settings $settings `
  -Description "Backs up Menuland customer data every 12 hours and emails it to the address set in the admin console." | Out-Null

Write-Output "Registered '$TaskName'."
Write-Output "  Project: $ProjectPath"
Write-Output "  Runs:    $At, then every 12 hours"
Write-Output "  Log:     $logFile"
Write-Output ""
Write-Output "Run it once now to verify:"
Write-Output "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Output "Then check the result:"
Write-Output "  Get-ScheduledTaskInfo -TaskName '$TaskName' | Select LastRunTime, LastTaskResult"
