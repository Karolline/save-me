<#
.SYNOPSIS
Runs a branch that is not merged yet as a separate preview stack, next to the real one.

.DESCRIPTION
Builds the app from the branch's worktree and runs it under the compose project
saveme-preview: app on http://localhost:8200, PostgreSQL on 127.0.0.1:5452,
volume saveme-preview-pgdata, image saveme-preview. The real stack (8100,
saveme-pgdata, image saveme) is not touched.

By default the preview database gets a fresh copy of the real data (pg_dump of
saveme, read only) before the app starts; the app then migrates that copy.
Whatever you change in the preview is thrown away on the next run.

The branch must be checked out in a worktree (the developer agent's worktree,
or `git worktree add`). -Branch main runs the main folder.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts\preview.ps1 -Branch step8-jobs
powershell -ExecutionPolicy Bypass -File scripts\preview.ps1 -Branch step8-jobs -KeepData
powershell -ExecutionPolicy Bypass -File scripts\preview.ps1 -Stop
#>
param(
    [string]$Branch = "",
    [switch]$KeepData,
    [switch]$Stop
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\common.ps1"

$Project = "saveme-preview"
$Volume = "saveme-preview-pgdata"
$AppPort = 8200
$Override = Join-Path $PSScriptRoot "preview.override.yaml"
# Invoke-Preview <worktree folder> <compose args>. No named parameter: compose's
# own flags (-d) would bind to it. The port and volume overrides (read by
# docker-compose.yaml) are set only for this one command: left in the
# environment they would move the real stack (Start-Database, Invoke-Db) onto
# the preview volume.
function Invoke-Preview {
    $dir, $rest = $args
    $env:APP_PORT = "$AppPort"
    $env:DB_PORT = "5452"
    $env:PGDATA_VOLUME = $Volume
    try {
        Invoke-Docker compose -p $Project --project-directory $dir -f (Join-Path $dir "docker-compose.yaml") -f $Override @rest
    } finally {
        Remove-Item Env:APP_PORT, Env:DB_PORT, Env:PGDATA_VOLUME
    }
}

if ($Stop) {
    # No `down -v`: the volume is removed by name, so a wrong setting can never
    # reach saveme-pgdata.
    Invoke-Preview $Repo down | Out-Null
    if ((Invoke-Docker volume ls -q) -contains $Volume) { Invoke-Docker volume rm $Volume | Out-Null }
    Write-Host "Preview stopped and its data removed."
    exit 0
}

if (-not $Branch) { throw "Give -Branch <name> (or -Stop)." }

# Find the folder where the branch is checked out.
$dir = $null
$path = $null
foreach ($line in (git -C $Repo worktree list --porcelain)) {
    if ($line -like "worktree *") { $path = $line.Substring(9) }
    if ($line -eq "branch refs/heads/$Branch") { $dir = $path }
}
if (-not $dir) { throw "Branch $Branch is not checked out in any worktree (git worktree list)." }
$dir = (Resolve-Path $dir).Path
$commit = git -C $dir log -1 --format="%h %s"
Write-Host "Preview of $Branch ($dir)"
Write-Host "  $commit"

foreach ($name in "APP_PORT", "DB_PORT", "PGDATA_VOLUME") {
    if (Test-Path "Env:$name") { throw "$name is set in this shell; clear it first, or the real stack would use it." }
}
Start-Database   # the real stack's db, to copy the data from
# Guard: the real database must still be on the real volume.
$realVolume = Invoke-Docker compose ps -q db | ForEach-Object { Invoke-Docker inspect $_ --format "{{range .Mounts}}{{.Name}} {{end}}" }
if ("$realVolume" -notmatch "\bsaveme-pgdata\b") { throw "The real db container is not on saveme-pgdata ($realVolume). Stopping." }

Invoke-Preview $dir up -d db | Out-Null
$deadline = (Get-Date).AddMinutes(1)
while ($true) {
    try { Invoke-Preview $dir exec -T db pg_isready -U saveme -d saveme | Out-Null; break } catch {
        if ((Get-Date) -gt $deadline) { throw "The preview PostgreSQL did not become ready" }
        Start-Sleep -Seconds 2
    }
}

if (-not $KeepData) {
    Write-Host "Copying the real data into the preview database ..."
    $name = "preview-copy.dump"
    $local = Join-Path $env:TEMP $name
    # Dump inside the container and copy the file: piping binary output through
    # Windows PowerShell 5.1 would corrupt it.
    Invoke-Db pg_dump -U saveme -d saveme -Fc -f "/tmp/$name" | Out-Null
    Invoke-Docker compose cp "db:/tmp/$name" $local | Out-Null
    Invoke-Db rm -f "/tmp/$name" | Out-Null
    try {
        Invoke-Preview $dir stop app | Out-Null
        Invoke-Preview $dir cp $local "db:/tmp/$name" | Out-Null
        Invoke-Preview $dir exec -T db psql -U saveme -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS saveme WITH (FORCE)" -c "CREATE DATABASE saveme OWNER saveme" | Out-Null
        Invoke-Preview $dir exec -T db pg_restore -U saveme -d saveme --no-owner "/tmp/$name" | Out-Null
        Invoke-Preview $dir exec -T db rm -f "/tmp/$name" | Out-Null
    } finally {
        Remove-Item -Force -ErrorAction SilentlyContinue $local
    }
}

Write-Host "Building and starting the preview app (a few minutes the first time) ..."
Invoke-Preview $dir up -d --build | Out-Null

$deadline = (Get-Date).AddMinutes(2)
while ($true) {
    try {
        Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$AppPort/api/auth/config" -TimeoutSec 3 | Out-Null
        break
    } catch {
        if ((Get-Date) -gt $deadline) {
            Invoke-Preview $dir logs --tail 40 app | Write-Host
            throw "The preview app did not start."
        }
        Start-Sleep -Seconds 2
    }
}
Write-Host "Preview is up: http://localhost:$AppPort  (stop: scripts\preview.ps1 -Stop)"
