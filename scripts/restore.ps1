<#
.SYNOPSIS
Restores a SaveMe dump, by default as a restore drill.

.DESCRIPTION
Without -Database this is a drill: the dump (default: the newest one in the
backup folder) is restored into a scratch database, saveme_restore_check, its
row counts are compared with the real database (saveme), and the scratch
database is dropped (unless -KeepScratch). Nothing real is touched.

With -Database saveme_dev it replaces the experiments database.

With -Database saveme it replaces the REAL data. That needs -IntoRealData, and
the current real data is backed up first (reason before-restore). The app can
keep running: its open connections are closed and it reconnects.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts\restore.ps1
powershell -ExecutionPolicy Bypass -File scripts\restore.ps1 -File D:\x\saveme-20261015-210000-daily.dump -Database saveme -IntoRealData
#>
param(
    [string]$File = "",
    [string]$Database = "saveme_restore_check",
    [string]$BackupDir = "",
    [switch]$IntoRealData,
    [switch]$KeepScratch
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\common.ps1"

$scratch = "saveme_restore_check"
if ($Database -eq "saveme" -and -not $IntoRealData) {
    throw "Restoring into saveme replaces the real data. Add -IntoRealData if you mean it."
}
if (-not $File) {
    $dir = Get-BackupDir $BackupDir
    $newest = Get-ChildItem $dir -Filter "saveme-*.dump" -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $newest) { throw "No saveme-*.dump in $dir" }
    $File = $newest.FullName
}
if (-not (Test-Path $File)) { throw "Not found: $File" }

Start-Database
if ($Database -eq "saveme") {
    & "$PSScriptRoot\backup.ps1" -BackupDir $BackupDir -Reason before-restore
    if ($LASTEXITCODE -ne 0) { throw "The backup before restoring failed; nothing was restored." }
}

Write-Host "Restoring $File into $Database ..."
$inContainer = "/tmp/restore.dump"
Invoke-Docker compose cp $File "db:$inContainer" | Out-Null
Invoke-Db dropdb -U saveme --if-exists --force $Database | Out-Null
Invoke-Db createdb -U saveme -O saveme $Database | Out-Null
Invoke-Db pg_restore -U saveme -d $Database --no-owner --exit-on-error $inContainer | Out-Null
Invoke-Db rm -f $inContainer | Out-Null

$restored = Get-TableCounts $Database
Write-Host ""
Write-Host "Rows in $Database (restored):"
$restored | ForEach-Object { Write-Host "  $_" }

if ($Database -eq $scratch) {
    $real = Get-TableCounts "saveme"
    Write-Host "Rows in saveme (now):"
    $real | ForEach-Object { Write-Host "  $_" }
    $missing = $real | Where-Object { $restored -notcontains $_ }
    if ($missing) {
        Write-Host ""
        Write-Host "Counts differ for: $($missing -join ', '). That is expected if data changed after the dump was taken."
    } else {
        Write-Host ""
        Write-Host "Restore drill OK: the dump restores to the same row counts as the real database."
    }
    if (-not $KeepScratch) { Invoke-Db dropdb -U saveme --if-exists --force $scratch | Out-Null }
}
