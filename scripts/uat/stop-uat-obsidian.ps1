# Stops the UAT Obsidian instance started by start-uat-obsidian.ps1.
#
#   npm run uat:stop
#   pwsh -NoProfile -File scripts/uat/stop-uat-obsidian.ps1 [-UserData <dir>]
#
# Safety rules (threat T-i5w-02):
#   - Only Obsidian.exe processes whose command line contains the full resolved UAT user-data
#     path are stopped. The user's own Obsidian never has that path on its command line.
#   - An empty or short -UserData is refused, so the match can never be broad.
param(
  [string]$UserData = "$env:LOCALAPPDATA\tasknotes-timer-pane-uat\userdata"
)
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($UserData)) { throw "Refusing to stop: -UserData is empty" }
$match = [System.IO.Path]::GetFullPath($UserData).TrimEnd('\', '/')
if ($match.Length -lt 12) { throw "Refusing to stop: -UserData '$match' is too short to match safely" }

function Get-UatProcesses {
  @(Get-CimInstance Win32_Process -Filter "Name='Obsidian.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($match, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
}

$found = Get-UatProcesses
foreach ($proc in $found) {
  Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
}

$deadline = (Get-Date).AddSeconds(10)
$left = Get-UatProcesses
while ($left.Count -gt 0 -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 250
  $left = Get-UatProcesses
}

"Stopped $($found.Count) UAT Obsidian process(es)"
if ($left.Count -gt 0) {
  [Console]::Error.WriteLine("$($left.Count) UAT Obsidian process(es) still running: $(($left | ForEach-Object ProcessId) -join ', ')")
  exit 1
}
exit 0
