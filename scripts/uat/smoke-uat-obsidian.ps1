# Re-runnable check that the UAT Obsidian instance never takes focus and never touches the user's Obsidian.
#
#   npm run uat:smoke [-- -Vault <path> -Port <n> -Seconds <n>]
#
# 1. Records the user's own Obsidian.exe processes (command line without the UAT user-data dir).
# 2. Samples the foreground window (owning pid + title) every 200 ms on a background thread.
# 3. Runs start-uat-obsidian.ps1 (which now includes its build + install of this checkout), then keeps
#    sampling for -Seconds more, and checks the installed main.js matches this checkout's main.js.
# 4. Counts samples owned by a UAT process, or titled "Obsidian" but not owned by a recorded user process.
# 5. Runs stop-uat-obsidian.ps1 and re-checks both process sets.
# Exits 1 unless uatForeground = 0, uatLeft = 0, samples > 0, the user's process set is unchanged
# and the installed main.js matches the checkout's (installedMatch).
param(
  [string]$Vault,
  [string]$UserData = "$env:LOCALAPPDATA\tasknotes-timer-pane-uat\userdata",
  [int]$Port = 9333,
  [int]$Seconds = 10
)
$ErrorActionPreference = "Stop"

$match = [System.IO.Path]::GetFullPath($UserData).TrimEnd('\', '/')

function Get-ObsidianProcesses([bool]$uat) {
  @(Get-CimInstance Win32_Process -Filter "Name='Obsidian.exe'" | Where-Object {
      $isUat = $_.CommandLine -and $_.CommandLine.IndexOf($match, [StringComparison]::OrdinalIgnoreCase) -ge 0
      $isUat -eq $uat
    })
}

if (-not ('UatForeground' -as [type])) {
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class UatForeground {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
  public static string Sample() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return "0|";
    uint pid; GetWindowThreadProcessId(h, out pid);
    var sb = new StringBuilder(512); GetWindowText(h, sb, sb.Capacity);
    return pid + "|" + sb.ToString(); }
}
"@
}

$userBefore = @(Get-ObsidianProcesses $false | ForEach-Object ProcessId | Sort-Object)
$samples = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()
$control = [hashtable]::Synchronized(@{ stop = $false })
$sampler = $null
$uatPids = @()
$launchExit = $null
$installedMatch = $false
$installedMain = "(unknown)"
$checkoutMain = Join-Path ([System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))) "main.js"

try {
  $sampler = Start-ThreadJob -ArgumentList $samples, $control -ScriptBlock {
    param($queue, $flag)
    while (-not $flag.stop) {
      $queue.Enqueue([UatForeground]::Sample())
      Start-Sleep -Milliseconds 200
    }
  }

  $launchArgs = @("-NoProfile", "-File", "$PSScriptRoot\start-uat-obsidian.ps1", "-UserData", $UserData, "-Port", $Port)
  if (-not [string]::IsNullOrWhiteSpace($Vault)) { $launchArgs += @("-Vault", $Vault) }
  $launchOut = @(& pwsh @launchArgs)
  $launchExit = $LASTEXITCODE
  $launchOut | ForEach-Object { "$_" }

  if ($launchExit -eq 0) {
    $readyLine = $launchOut | Where-Object { "$_" -like "UAT Obsidian ready:*" } | Select-Object -Last 1
    if ($readyLine -and ("$readyLine" -match 'vault=(.+?) port=')) {
      $installedMain = Join-Path $Matches[1] ".obsidian\plugins\tasknotes-timer-pane\main.js"
      if ((Test-Path -LiteralPath $installedMain -PathType Leaf) -and (Test-Path -LiteralPath $checkoutMain -PathType Leaf)) {
        $installedMatch = (Get-FileHash -LiteralPath $installedMain -Algorithm SHA256).Hash -eq
                          (Get-FileHash -LiteralPath $checkoutMain -Algorithm SHA256).Hash
      }
    }
  }

  if ($launchExit -eq 0) { Start-Sleep -Seconds $Seconds }
  $uatPids = @(Get-ObsidianProcesses $true | ForEach-Object ProcessId)
} finally {
  $control.stop = $true
  if ($sampler) { $sampler | Wait-Job -Timeout 5 | Out-Null; $sampler | Remove-Job -Force }
  & "$PSScriptRoot\stop-uat-obsidian.ps1" -UserData $UserData
}

$uatForeground = 0
$total = 0
foreach ($s in $samples.ToArray()) {
  $total++
  $sep = $s.IndexOf("|")
  $fgPid = [int]$s.Substring(0, $sep)
  $title = $s.Substring($sep + 1)
  if ($uatPids -contains $fgPid -or ($title -like "*Obsidian*" -and $userBefore -notcontains $fgPid)) {
    $uatForeground++
    [Console]::Error.WriteLine("UAT foreground sample: pid=$fgPid title=$title")
  }
}

$uatLeft = @(Get-ObsidianProcesses $true).Count
$userAfter = @(Get-ObsidianProcesses $false | ForEach-Object ProcessId | Sort-Object)
$userSame = (($userBefore -join ",") -eq ($userAfter -join ","))

"Smoke: samples=$total uatForeground=$uatForeground uatLeft=$uatLeft userBefore=$($userBefore.Count) userAfter=$($userAfter.Count) installedMatch=$installedMatch"
if ($launchExit -ne 0) { [Console]::Error.WriteLine("start-uat-obsidian.ps1 exited $launchExit"); exit 1 }
if (-not $installedMatch) {
  [Console]::Error.WriteLine("Installed main.js does not match the checkout's build: installed=$installedMain checkout=$checkoutMain")
  exit 1
}
if (-not $userSame) {
  [Console]::Error.WriteLine("User Obsidian processes changed: before=$($userBefore -join ',') after=$($userAfter -join ',')")
  exit 1
}
if ($uatForeground -ne 0 -or $uatLeft -ne 0 -or $total -eq 0) { exit 1 }
exit 0
