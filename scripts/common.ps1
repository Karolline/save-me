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

function Test-Docker {
    docker info --format "{{.ServerVersion}}" *> $null
    return ($LASTEXITCODE -eq 0)
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
    Push-Location $Repo
    try {
        docker compose up -d db *> $null
        if ($LASTEXITCODE -ne 0) { throw "docker compose up -d db failed" }
        $deadline = (Get-Date).AddMinutes(1)
        while ($true) {
            docker compose exec -T db pg_isready -U saveme -d saveme *> $null
            if ($LASTEXITCODE -eq 0) { break }
            if ((Get-Date) -gt $deadline) { throw "PostgreSQL did not become ready" }
            Start-Sleep -Seconds 2
        }
    } finally { Pop-Location }
}

# Runs `docker compose exec -T db <args>` from the repo and throws on failure.
function Invoke-Db {
    Push-Location $Repo
    try {
        docker compose exec -T db @args
        if ($LASTEXITCODE -ne 0) { throw "failed: docker compose exec -T db $args" }
    } finally { Pop-Location }
}

# Row counts of every table in the public schema, as "table rows" lines.
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
