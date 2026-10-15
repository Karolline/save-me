# Shared helpers for the scripts in this folder. Dot-source it: . "$PSScriptRoot\common.ps1"
# Keep these scripts ASCII-only: Windows PowerShell 5.1 reads files without a
# BOM in the system code page.

$Repo = Split-Path -Parent $PSScriptRoot
$DockerDesktop = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\Docker Desktop.exe"

function Get-BackupDir([string]$Dir) {
    if ($Dir) { return $Dir }
    if ($env:SAVEME_BACKUP_DIR) { return $env:SAVEME_BACKUP_DIR }
    return (Join-Path $env:USERPROFILE "SaveMe-backups")
}

# Runs `docker <args>` from the repo and returns its standard output lines.
# Docker writes progress to stderr, which Windows PowerShell 5.1 would turn
# into errors, so stderr is only shown when the command fails (exit code).
function Invoke-Docker {
    $ErrorActionPreference = "Continue"
    Push-Location $Repo
    try { $lines = & docker @args 2>&1 } finally { Pop-Location }
    $code = $LASTEXITCODE
    $stdout = @($lines | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } | ForEach-Object { "$_" })
    if ($code -ne 0) {
        $stderr = ($lines | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] } | ForEach-Object { "$_" }) -join "`n"
        throw "docker $($args -join ' ') failed (exit $code): $stderr"
    }
    return $stdout
}

# `docker compose exec -T db <args>`
function Invoke-Db { Invoke-Docker compose exec -T db @args }

function Test-Docker {
    try { Invoke-Docker info --format "{{.ServerVersion}}" | Out-Null; return $true } catch { return $false }
}

# Starts Docker Desktop if needed, then the database container, and waits
# until PostgreSQL accepts connections.
function Start-Database {
    if (-not (Test-Docker)) {
        if (-not (Test-Path $DockerDesktop)) { throw "Docker is not running and Docker Desktop was not found at $DockerDesktop" }
        Start-Process $DockerDesktop
        $deadline = (Get-Date).AddMinutes(3)
        while (-not (Test-Docker)) {
            if ((Get-Date) -gt $deadline) { throw "Docker Desktop did not start within 3 minutes" }
            Start-Sleep -Seconds 3
        }
    }
    Invoke-Docker compose up -d db | Out-Null
    $deadline = (Get-Date).AddMinutes(1)
    while ($true) {
        try { Invoke-Db pg_isready -U saveme -d saveme | Out-Null; break } catch {
            if ((Get-Date) -gt $deadline) { throw "PostgreSQL did not become ready" }
            Start-Sleep -Seconds 2
        }
    }
}

# Exact row counts of every table in the public schema, as "table rows" lines.
function Get-TableCounts([string]$Database) {
    $tables = Invoke-Db psql -U saveme -d $Database -tA -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
    $lines = @()
    foreach ($t in $tables) {
        if (-not $t) { continue }
        $n = Invoke-Db psql -U saveme -d $Database -tA -c "SELECT COUNT(*) FROM `"$t`""
        $lines += "$t $n"
    }
    return $lines
}
