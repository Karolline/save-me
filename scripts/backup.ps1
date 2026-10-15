<#
.SYNOPSIS
Backs up the real SaveMe database (saveme) with pg_dump.

.DESCRIPTION
Writes saveme-YYYYMMDD-HHMMSS-<reason>.dump (pg_dump custom format) to the
backup folder and keeps the newest -Keep dumps. Put the backup folder on the
Naver MYBOX drive (N:, from the MYBOX Explorer app), so every dump is uploaded.

The folder is, in order: -BackupDir, the SAVEME_BACKUP_DIR environment
variable, or %USERPROFILE%\SaveMe-backups. If the folder's drive is missing
(MYBOX not running), the dump goes to %USERPROFILE%\SaveMe-backups with a
warning. Each run appends a line to backup.log in the folder it used. Starts
Docker Desktop and the database container if they are not running.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1 -Reason before-migration
#>
param(
    [string]$BackupDir = "",
    [string]$Database = "saveme",
    [int]$Keep = 30,
    [string]$Reason = "daily"
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\common.ps1"

$BackupDir = Get-BackupDir $BackupDir
# The MYBOX drive (N:) only exists while the MYBOX app runs. Without it, keep
# the dump locally rather than losing it; it can be copied over later.
$fallback = $null
try {
    New-Item -ItemType Directory -Force $BackupDir | Out-Null
} catch {
    $fallback = $BackupDir
    $BackupDir = Join-Path $env:USERPROFILE "SaveMe-backups"
    New-Item -ItemType Directory -Force $BackupDir | Out-Null
}
$log = Join-Path $BackupDir "backup.log"
function Write-Log([string]$Message) {
    "$(Get-Date -Format s) $Message" | Out-File -Append -Encoding utf8 $log
    Write-Host $Message
}
if ($fallback) { Write-Log "WARNING $fallback is not available (is MYBOX running?); backing up to $BackupDir instead" }

$name = "$Database-$(Get-Date -Format yyyyMMdd-HHmmss)-$Reason.dump"
$target = Join-Path $BackupDir $name
$inContainer = "/tmp/$name"
try {
    Start-Database
    # Dump inside the container and copy the file out: piping binary output
    # through Windows PowerShell 5.1 would corrupt it.
    Invoke-Db pg_dump -U saveme -d $Database -Fc -f $inContainer | Out-Null
    Invoke-Docker compose cp "db:$inContainer" $target | Out-Null
    Invoke-Db rm -f $inContainer | Out-Null
    $file = Get-Item $target
    if ($file.Length -eq 0) { throw "the dump is empty" }
} catch {
    Write-Log "FAILED $name : $_"
    exit 1
}
Write-Log "OK $name ($([math]::Ceiling($file.Length / 1KB)) KB)"

Get-ChildItem $BackupDir -Filter "$Database-*.dump" |
    Sort-Object Name -Descending |
    Select-Object -Skip $Keep |
    ForEach-Object {
        Remove-Item $_.FullName
        Write-Log "removed old $($_.Name)"
    }
