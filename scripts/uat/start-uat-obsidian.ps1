# Launches an isolated Obsidian instance for automated UAT (Windows dev only).
#
#   npm run uat:start [-- -Vault <path> -Port <n> -SkipBuild]
#
# Builds the checkout that contains this script (main checkout or a worktree) with npm run build,
# installs its main.js, manifest.json and styles.css into <Vault>\.obsidian\plugins\tasknotes-timer-pane\
# (never data.json), then launches. -SkipBuild launches whatever build is already installed.
# Reload after a rebuild = run npm run uat:start again (it stops the previous instance first).
#
# - separate --user-data-dir  => runs alongside the user's own Obsidian
# - hidden Win32 desktop      => never appears on screen, can never take focus
# - CDP on $Port              => driven by the chrome-devtools MCP server and scripts/uat/cdp.mjs
#
# Safety rules:
#   - Refuses if the user's own Obsidian (%APPDATA%\obsidian\obsidian.json) has the vault open
#     (two writers on one vault = conflicting changes). That file is only read, never written (T-i5w-01).
#   - Refuses a -UserData equal to %APPDATA%\obsidian or inside the repo (T-i5w-05).
#   - Stops only a previous UAT instance, matched by its user-data dir (stop-uat-obsidian.ps1, T-i5w-02).
#   - Refuses if something else already answers on the CDP port (T-i5w-03).
#   - Installs only into a vault whose folder is named dev-vault, checked before any build, stop, copy
#     or launch (T-iua-01). Copies only main.js, manifest.json, styles.css (T-iua-02).
#   - A failed build exits 1 before the previous instance is stopped; nothing is installed or launched (T-iua-04).
param(
  [string]$Vault,
  [string]$UserData = "$env:LOCALAPPDATA\tasknotes-timer-pane-uat\userdata",
  [int]$Port = 9333,
  [string]$DesktopName = "obsidian-uat",
  [switch]$SkipBuild
)
$ErrorActionPreference = "Stop"

function Get-NormalPath([string]$p) {
  [System.IO.Path]::GetFullPath($p).TrimEnd('\', '/')
}

# Repo roots: this checkout, plus the main checkout when running from a git worktree.
$repoRoots = @(Get-NormalPath (Join-Path $PSScriptRoot "..\.."))
$commonDir = $null
try {
  $commonDir = (& git -C $PSScriptRoot rev-parse --path-format=absolute --git-common-dir 2>$null)
  if ($LASTEXITCODE -ne 0) { $commonDir = $null }
} catch { $commonDir = $null }
if ($commonDir) { $repoRoots += Get-NormalPath (Split-Path -Parent $commonDir.Trim()) }
# The checkout under test: the repo root containing this script (may be a worktree). Never the vault's checkout.
$checkoutRoot = $repoRoots[0]

# Default vault: the MAIN checkout's dev-vault (worktrees have none).
if ([string]::IsNullOrWhiteSpace($Vault)) {
  if ($commonDir) {
    $Vault = Join-Path (Split-Path -Parent $commonDir.Trim()) "dev-vault"
  } else {
    $Vault = Join-Path $PSScriptRoot "..\..\dev-vault"
  }
}
$Vault = Get-NormalPath $Vault
if (-not (Test-Path -LiteralPath $Vault -PathType Container) -or
    -not (Test-Path -LiteralPath (Join-Path $Vault ".obsidian") -PathType Container)) {
  throw "Vault not found or not set up: $Vault. Create it first (npm run seed, then the steps in README Development)."
}

# Dev-vault-only install guard (T-iua-01): runs before anything with a side effect.
if (-not $SkipBuild -and -not ((Split-Path -Leaf $Vault) -ieq "dev-vault")) {
  throw "Refusing to install the plugin into '$Vault': the vault folder must be named dev-vault (use -SkipBuild to launch an existing install without copying)"
}

$exe = "$env:LOCALAPPDATA\Programs\Obsidian\Obsidian.exe"
if (-not (Test-Path -LiteralPath $exe)) { throw "Obsidian.exe not found: $exe" }
$asars = @(Get-ChildItem -Path "$env:APPDATA\obsidian" -Filter "obsidian-*.asar" -ErrorAction SilentlyContinue)
if ($asars.Count -eq 0) {
  throw "No $env:APPDATA\obsidian\obsidian-*.asar found; without it the UAT instance would run the installer's old app build."
}

# -UserData must be a dedicated directory: never the user's own Obsidian config, never inside the repo.
if ([string]::IsNullOrWhiteSpace($UserData)) { throw "-UserData is empty" }
$UserData = Get-NormalPath $UserData
$mainConfigDir = Get-NormalPath "$env:APPDATA\obsidian"
if ($UserData -ieq $mainConfigDir) { throw "Refusing -UserData equal to your own Obsidian config dir: $UserData" }
foreach ($root in $repoRoots) {
  if ($UserData -ieq $root -or $UserData.StartsWith("$root\", [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing -UserData inside the repo ($root): $UserData"
  }
}

# Refuse if the user's main instance has this vault open (two writers = conflicts). Read-only.
$mainJson = Join-Path $mainConfigDir "obsidian.json"
if (Test-Path -LiteralPath $mainJson) {
  $main = Get-Content -LiteralPath $mainJson -Raw | ConvertFrom-Json
  if ($main.vaults) {
    foreach ($p in $main.vaults.PSObject.Properties) {
      $vp = $p.Value.path
      if (-not $p.Value.open -or [string]::IsNullOrWhiteSpace($vp)) { continue }
      if (-not (Test-Path -LiteralPath $vp)) { continue }
      $resolved = Get-NormalPath (Resolve-Path -LiteralPath $vp).Path
      if ($resolved -ieq $Vault) {
        throw "Vault is open in your main Obsidian instance; switch vault or close that window there first: $Vault"
      }
    }
  }
}

# Build the checkout under test before stopping anything, so a failed build changes nothing (T-iua-04).
# Build output goes to stderr; stdout is reserved for the ready line.
if (-not $SkipBuild) {
  Push-Location -LiteralPath $checkoutRoot
  try {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      & npm run build 2>&1 | ForEach-Object { [Console]::Error.WriteLine("$_") }
      $buildExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $prevEap }
  } finally { Pop-Location }
  if ($buildExit -ne 0) {
    [Console]::Error.WriteLine("npm run build failed in $checkoutRoot; nothing was installed or launched")
    exit 1
  }
  if (-not (Test-Path -LiteralPath (Join-Path $checkoutRoot "main.js") -PathType Leaf)) {
    throw "npm run build succeeded but $checkoutRoot\main.js is missing"
  }
}

# Stop any previous UAT instance (matched by its user-data dir only).
& "$PSScriptRoot\stop-uat-obsidian.ps1" -UserData $UserData
if ($LASTEXITCODE -ne 0) { throw "Could not stop the previous UAT instance" }

# Install the build: exactly main.js, manifest.json, styles.css; never data.json (T-iua-02).
$pluginFiles = @("main.js", "manifest.json", "styles.css")
$pluginDir = Join-Path $Vault ".obsidian\plugins\tasknotes-timer-pane"
if (-not $SkipBuild) {
  foreach ($name in $pluginFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $checkoutRoot $name) -PathType Leaf)) {
      throw "Build file missing in ${checkoutRoot}: $name"
    }
  }
  New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null
  foreach ($name in $pluginFiles) {
    Copy-Item -LiteralPath (Join-Path $checkoutRoot $name) -Destination (Join-Path $pluginDir $name) -Force
  }
  $srcHash = (Get-FileHash -LiteralPath (Join-Path $checkoutRoot "main.js") -Algorithm SHA256).Hash
  $dstHash = (Get-FileHash -LiteralPath (Join-Path $pluginDir "main.js") -Algorithm SHA256).Hash
  if ($srcHash -ne $dstHash) { throw "Installed main.js does not match $checkoutRoot\main.js after copy" }
}

# Build provenance for the ready line (T-iua-03).
if ($SkipBuild) {
  $buildInfo = "skipped"
} else {
  $head = (& git -C $checkoutRoot rev-parse --short HEAD 2>$null)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($head)) { $head = "unknown" } else { $head = "$head".Trim() }
  $dirty = (& git -C $checkoutRoot status --porcelain --untracked-files=no 2>$null)
  $buildInfo = "$checkoutRoot@$head"
  if ($dirty) { $buildInfo += "+dirty" }
}
$installedMain = Join-Path $pluginDir "main.js"
$mainHash = if (Test-Path -LiteralPath $installedMain -PathType Leaf) {
  (Get-FileHash -LiteralPath $installedMain -Algorithm SHA256).Hash.ToLowerInvariant().Substring(0, 12)
} else { "none" }

# Port guard: readiness must never bind to some other Chromium/Obsidian.
$portBusy = $false
try {
  Invoke-RestMethod "http://127.0.0.1:$Port/json/version" -TimeoutSec 2 | Out-Null
  $portBusy = $true
} catch { $portBusy = $false }
if ($portBusy) { throw "Port $Port is already in use by another process" }

# Seed the user-data dir: current app bundle + a vault registry with only $Vault.
# The vault id is deterministic per vault path, so the trust decision persists across runs.
New-Item -ItemType Directory -Force $UserData | Out-Null
Copy-Item "$env:APPDATA\obsidian\obsidian-*.asar" $UserData -Force
$sha = [System.Security.Cryptography.SHA256]::Create()
try {
  $hash = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Vault.ToLowerInvariant()))
} finally { $sha.Dispose() }
$vaultId = (-join ($hash | ForEach-Object { $_.ToString("x2") })).Substring(0, 16)
@{ vaults = @{ $vaultId = @{ path = $Vault; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); open = $true } } } |
  ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$UserData\obsidian.json" -Encoding utf8NoBOM

if (-not ('UatLaunch' -as [type])) {
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class UatLaunch {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct SI {
    public int cb; public string reserved, desktop, title; public int x, y, w, h, cx, cy, fill, flags;
    public short show, r2; public IntPtr r3, stdin, stdout, stderr; }
  [StructLayout(LayoutKind.Sequential)] struct PI { public IntPtr hp, ht; public int pid, tid; }
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern IntPtr CreateDesktop(string name, IntPtr dev, IntPtr mode, int flags, uint access, IntPtr sa);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool inh, uint fl, IntPtr env, string cwd, ref SI si, out PI pi);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  // Opens (or creates) the named desktop and starts the process on it. The desktop
  // persists while any of the process's threads are attached to it.
  public static int Start(string desktopName, string exe, string cmdLine) {
    IntPtr d = CreateDesktop(desktopName, IntPtr.Zero, IntPtr.Zero, 0, 0x10000000 /*GENERIC_ALL*/, IntPtr.Zero);
    if (d == IntPtr.Zero) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    var si = new SI(); si.cb = Marshal.SizeOf(typeof(SI)); si.desktop = desktopName; PI pi;
    if (!CreateProcess(exe, cmdLine, IntPtr.Zero, IntPtr.Zero, false, 0, IntPtr.Zero, null, ref si, out pi))
      throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    CloseHandle(pi.hp); CloseHandle(pi.ht);
    return pi.pid; }
}
"@
}

$argList = @("--user-data-dir=`"$UserData`"", "--remote-debugging-port=$Port",
             "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding")
$procId = [UatLaunch]::Start($DesktopName, $exe, "`"$exe`" " + ($argList -join " "))

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $pages = Invoke-RestMethod "http://127.0.0.1:$Port/json/list" -TimeoutSec 2 |
      Where-Object { $_.type -eq "page" -and $_.title -like "*Obsidian*" }
    if ($pages) { $ready = $true; break }
  } catch {}
  Start-Sleep -Milliseconds 500
}
if (-not $ready) {
  [Console]::Error.WriteLine("UAT Obsidian (pid $procId) did not become ready on CDP port $Port; run npm run uat:stop")
  exit 1
}

# Dismiss the trust modal, leave Restricted mode, wait for TaskNotes (logic lives in cdp.mjs).
$raw = & node "$PSScriptRoot\cdp.mjs" prepare --port $Port
if ($LASTEXITCODE -ne 0) {
  [Console]::Error.WriteLine("cdp.mjs prepare failed; the UAT instance (pid $procId) is left running for inspection. Run npm run uat:stop")
  exit 1
}
$status = ($raw -join "`n") | ConvertFrom-Json
$pane = if ($status.paneLoaded) { "loaded" } else { "missing" }
"UAT Obsidian ready: vault=$Vault port=$Port pid=$procId tasknotes=$($status.tasknotesVersion) api=$($status.apiVersion) timeWrite=$($status.timeWrite) pane=$pane build=$buildInfo mainjs=$mainHash"
if ($status.apiVersion -ne 1 -or -not $status.paneLoaded) {
  [Console]::Error.WriteLine("UAT instance is not usable (need api=1 and pane=loaded); left running for inspection. Run npm run uat:stop")
  exit 1
}
exit 0
