<#
.SYNOPSIS
Registers a Windows scheduled task that runs scripts\backup.ps1 every day.

.DESCRIPTION
The task "SaveMe backup" runs daily at -At (default 21:00) as the current
user, only when logged on. If the PC was off at that time, it runs as soon as
possible afterwards. Run again to change the time or folder; it replaces the
task. Remove it with: Unregister-ScheduledTask -TaskName "SaveMe backup"

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1 -BackupDir "C:\Users\me\MYBOX\SaveMe-backups"
#>
param(
    [string]$BackupDir = "",
    [string]$At = "21:00"
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\common.ps1"

$BackupDir = Get-BackupDir $BackupDir
$script = Join-Path $PSScriptRoot "backup.ps1"
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -BackupDir `"$BackupDir`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory $Repo
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName "SaveMe backup" -Action $action -Trigger $trigger -Settings $settings -Description "pg_dump of the SaveMe database to $BackupDir" -Force | Out-Null
Write-Host "Registered 'SaveMe backup': daily at $At, dumps to $BackupDir"
