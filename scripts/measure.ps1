# Records elapsed time and memory of SaveMe task stages (ASCII only: Windows PowerShell 5.1).
# The log is private\metrics\<Name>.jsonl in the main repo (git ignored, shared by all worktrees).
#
#   Mark a stage boundary:
#     powershell -NoProfile -File scripts\measure.ps1 -Name <task> -Stage dev -Mark start
#     powershell -NoProfile -File scripts\measure.ps1 -Name <task> -Stage dev -Mark end
#     (-At "2026-10-22T10:00:00+09:00" to record an earlier time, e.g. when planning began)
#   Run a command and record its time and peak memory (exit code is passed through):
#     powershell -NoProfile -File scripts\measure.ps1 -Name <task> -Stage dev -Label "backend pytest" -Cmd "uv run pytest tests/unit/test_x.py"
#
# Memory: "tree" = sum of working sets of the command and its child processes (shared pages are
# counted more than once, so it is a rough upper bound). "pc" = how much the whole PC's used
# physical memory grew during the run (this includes Docker/WSL, so it shows the PostgreSQL container).
param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][ValidateSet('plan', 'dev', 'review', 'merge')][string]$Stage,
    [ValidateSet('start', 'end')][string]$Mark,
    [string]$At,
    [string]$Label,
    [string]$Cmd
)

$ErrorActionPreference = 'Stop'
$timeFormat = 'yyyy-MM-ddTHH:mm:sszzz'

$common = (git rev-parse --path-format=absolute --git-common-dir).Trim()
$dir = Join-Path (Split-Path -Parent $common) 'private\metrics'
$log = Join-Path $dir ($Name + '.jsonl')

function Write-Entry($entry) {
    New-Item -ItemType Directory -Force $dir | Out-Null
    $line = ($entry | ConvertTo-Json -Compress) + "`n"
    [System.IO.File]::AppendAllText($log, $line, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-UsedMb {
    $os = Get-CimInstance Win32_OperatingSystem
    return [int][math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1024)
}

if ($Mark) {
    $at = $At
    if (-not $at) { $at = (Get-Date).ToString($timeFormat) }
    Write-Entry ([ordered]@{ kind = 'mark'; stage = $Stage; event = $Mark; at = $at })
    Write-Host "measure: $Stage $Mark $at"
    exit 0
}

if (-not $Label -or -not $Cmd) {
    Write-Error 'Give either -Mark, or both -Label and -Cmd.'
    exit 2
}

$baseUsed = Get-UsedMb
$startedAt = Get-Date
$proc = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $Cmd) -NoNewWindow -PassThru
$null = $proc.Handle   # keeps the exit code readable after the process ends
$peakTree = 0
$peakUsed = $baseUsed

while (-not $proc.HasExited) {
    $all = @(Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, WorkingSetSize)
    $ids = @{ ([int]$proc.Id) = $true }
    do {
        $added = $false
        foreach ($p in $all) {
            if ($ids.ContainsKey([int]$p.ParentProcessId) -and -not $ids.ContainsKey([int]$p.ProcessId)) {
                $ids[[int]$p.ProcessId] = $true
                $added = $true
            }
        }
    } while ($added)
    $bytes = 0
    foreach ($p in $all) {
        if ($ids.ContainsKey([int]$p.ProcessId)) { $bytes += [int64]$p.WorkingSetSize }
    }
    $treeMb = [int][math]::Round($bytes / 1MB)
    if ($treeMb -gt $peakTree) { $peakTree = $treeMb }
    $used = Get-UsedMb
    if ($used -gt $peakUsed) { $peakUsed = $used }
    Start-Sleep -Milliseconds 300
}

$proc.WaitForExit()
$exitCode = $proc.ExitCode
$seconds = [int][math]::Round(((Get-Date) - $startedAt).TotalSeconds)
$pcGrowth = $peakUsed - $baseUsed

Write-Entry ([ordered]@{
        kind      = 'run'
        stage     = $Stage
        label     = $Label
        cmd       = $Cmd
        at        = $startedAt.ToString($timeFormat)
        seconds   = $seconds
        exit      = $exitCode
        tree_mb   = $peakTree
        pc_mb     = $pcGrowth
        pc_base   = $baseUsed
    })
Write-Host "measure: $Label | ${seconds}s | tree peak ${peakTree}MB | pc +${pcGrowth}MB (base ${baseUsed}MB) | exit $exitCode"
exit $exitCode
