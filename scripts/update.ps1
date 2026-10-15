<#
.SYNOPSIS
Updates the local SaveMe app to the code in this folder, backing up first.

.DESCRIPTION
1. Backs up the real database (reason before-update). Stops if that fails.
2. Rebuilds and restarts the compose stack (docker compose up -d --build).
   The app container applies new migrations to saveme when it starts.
3. Waits until the app answers on http://localhost:8100.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts\update.ps1
#>
param([string]$BackupDir = "")
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\common.ps1"

& "$PSScriptRoot\backup.ps1" -BackupDir $BackupDir -Reason before-update
if ($LASTEXITCODE -ne 0) { throw "The backup failed, so the app was not updated." }

Push-Location $Repo
try {
    docker compose up -d --build
    if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }
} finally { Pop-Location }

$deadline = (Get-Date).AddMinutes(2)
while ($true) {
    try {
        Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8100/api/auth/config" -TimeoutSec 3 | Out-Null
        break
    } catch {
        if ((Get-Date) -gt $deadline) {
            Push-Location $Repo
            docker compose logs --tail 40 app
            Pop-Location
            throw "The app did not start. If a migration failed, the data is unchanged; the backup is in the backup folder."
        }
        Start-Sleep -Seconds 2
    }
}
Write-Host "SaveMe is up: http://localhost:8100"
