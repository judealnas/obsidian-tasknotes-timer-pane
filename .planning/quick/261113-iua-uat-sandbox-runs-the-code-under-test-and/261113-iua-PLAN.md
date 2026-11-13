---
phase: quick-261113-iua
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/uat/start-uat-obsidian.ps1
  - scripts/uat/smoke-uat-obsidian.ps1
  - README.md
  - .claude/CLAUDE.md
autonomous: true
requirements: [QUICK-261113-iua]

estimate:
  tokens: 35000
  raw_tokens: 35000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "`npm run uat:start`, run from any checkout (main or a worktree under .claude/worktrees/), runs `npm run build` in THAT checkout, copies its main.js, manifest.json and styles.css into the target vault's .obsidian/plugins/tasknotes-timer-pane/, then launches the hidden UAT instance, so the sandbox runs the code under test."
    - "If the build fails, the launcher exits non-zero, installs nothing and launches nothing."
    - "The install never writes into a vault whose leaf folder name is not `dev-vault`; the name check runs before any build, stop, copy or launch, so a refusal has no side effects."
    - "The ready line names the installed build: checkout path, `git rev-parse --short HEAD` of that checkout (plus a dirty marker when tracked files are modified), and a short SHA-256 of the installed main.js."
    - "`-SkipBuild` launches whatever build is already installed, with no build and no copy."
    - "`npm run uat:smoke` still passes (0 UAT foreground samples across build + launch, user's Obsidian processes unchanged, 0 UAT processes left) and also fails if the installed main.js differs from the checkout's main.js."
    - ".claude/CLAUDE.md tells GSD runs to start the sandbox with `npm run uat:start` from the checkout under test before live-DOM UAT, re-run it after each rebuild, stop it after, never launch Obsidian another way, and self-verify state-checkable items."
    - "esbuild.config.mjs and its hard-coded DEV_DIR (D-01) are unchanged; `npm run check` stays green."
  artifacts:
    - { path: "scripts/uat/start-uat-obsidian.ps1", provides: "build-and-install step, dev-vault-only guard, -SkipBuild, build provenance in the ready line" }
    - { path: "scripts/uat/smoke-uat-obsidian.ps1", provides: "smoke check including installed-vs-checkout main.js hash match" }
    - { path: "README.md", provides: "Automated UAT section documenting build-and-install, -SkipBuild, the guard, and reload-by-rerun" }
    - { path: ".claude/CLAUDE.md", provides: "## Automated UAT sandbox project instruction for GSD runs" }
  key_links:
    - "start-uat-obsidian.ps1 builds in the repo root of $PSScriptRoot (the checkout containing the script), not in the vault's checkout."
    - "The copy target is <Vault>\\.obsidian\\plugins\\tasknotes-timer-pane\\, where <Vault> defaults to the MAIN checkout's dev-vault (parent of git-common-dir); only the three named files are written there, never data.json."
    - "smoke-uat-obsidian.ps1 reads `vault=` from the launcher's ready line and hashes <vault>\\.obsidian\\plugins\\tasknotes-timer-pane\\main.js against <repo root>\\main.js itself."
    - ".claude/CLAUDE.md section sits between the `<!-- GSD:workflow-end -->` and `<!-- GSD:profile-start -->` markers; the tool-managed Developer Profile block is untouched."
---

<objective>
Make the UAT sandbox from quick task 261113-i5w run the code under test, and make GSD runs start it.

Two gaps today: (1) nothing starts the sandbox, and gsd-dom-verifier (no Bash) just reports "could not look" when port 9333 is dead; (2) the sandbox loads whatever plugin build sits in the MAIN checkout's dev-vault, while GSD executors build in worktrees whose `npm run deploy` writes into a worktree-local dev-vault (D-01 hard-codes DEV_DIR repo-relative), and Hot Reload is not installed in dev-vault, so a running instance never picks up a new main.js anyway.

Fix: the launcher builds the checkout that contains it and installs that build into the target dev-vault before launching (reload = re-run `npm run uat:start`, which already stops the previous instance), refuses to install into anything not named `dev-vault`, and reports which build it installed. A short `.claude/CLAUDE.md` section tells GSD orchestrators to start and stop it.

Output: updated start/smoke scripts, README Automated UAT section, new `## Automated UAT sandbox` section in .claude/CLAUDE.md. esbuild.config.mjs is NOT modified (D-01 stays).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.claude/CLAUDE.md
@.planning/quick/261113-i5w-invisible-isolated-obsidian-uat-instance/261113-i5w-SUMMARY.md
@scripts/uat/start-uat-obsidian.ps1
@scripts/uat/smoke-uat-obsidian.ps1
@scripts/uat/stop-uat-obsidian.ps1
@esbuild.config.mjs
@package.json
@README.md

Repo facts the executor needs (verified at planning time):
- start-uat-obsidian.ps1 already computes `$repoRoots[0]` = this checkout's root (`$PSScriptRoot\..\..`, normalized) and `$commonDir`; the default `$Vault` is the parent of git-common-dir + `dev-vault`. Its order today: resolve/validate vault, check exe + asar, validate -UserData, main-instance open-vault guard, call stop-uat-obsidian.ps1, port guard, seed user-data, launch, CDP readiness, `cdp.mjs prepare`, print one `UAT Obsidian ready: vault=... port=... pid=... tasknotes=... api=... timeWrite=... pane=...` line.
- `npm run build` = `tsc -noEmit && node esbuild.config.mjs production`; it writes a minified `main.js` at the checkout root (gitignored) and nothing else. It needs that checkout's `node_modules` (`npm ci` if missing — this worktree already has it from 261113-i5w).
- The main checkout's `dev-vault/.obsidian/plugins/tasknotes-timer-pane/` currently holds `data.json` (the plugin's settings — must never be overwritten), `main.js`, `manifest.json`, `styles.css`. Hot Reload is not installed in dev-vault.
- This worktree has no `dev-vault/`. Do NOT run `npm run deploy`, `npm run dev` or `npm run seed` here (they would create a stray worktree dev-vault).
- The harness blocks any shell command containing the word "eval"; use `node scripts/uat/cdp.mjs prepare --port 9333` for live checks.
- package.json needs no change: `npm run uat:start -- -SkipBuild` passes the switch through.
- Plugin id / plugin folder name: `tasknotes-timer-pane`.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: End-to-end "sandbox runs this checkout's build" — build, guard, install, launch, report</name>
  <files>scripts/uat/start-uat-obsidian.ps1</files>
  <precondition>The user's own Obsidian does not have the main checkout's dev-vault open (the launcher refuses otherwise; if it refuses, stop and report — never edit %APPDATA%\obsidian\obsidian.json), and this checkout has node_modules (run `npm ci` from the lockfile if not).</precondition>
  <action>
Extend scripts/uat/start-uat-obsidian.ps1 (keep every existing guard, the UatLaunch Add-Type block, the launch arguments and the readiness/prepare logic exactly as they are):

1. Add `[switch]$SkipBuild` to the param block. Update the header comment: usage line shows `[-- -Vault <path> -Port <n> -SkipBuild]`; describe that it builds and installs the checkout containing the script; add safety rule "Installs only into a vault whose folder is named dev-vault, checked before any build, stop, copy or launch (T-iua-01)"; add "Reload after a rebuild = run npm run uat:start again (it stops the previous instance first)."

2. Name the checkout root explicitly (e.g. `$checkoutRoot = $repoRoots[0]`). This is the repo root of `$PSScriptRoot`, which may be a worktree. Never build in the vault's checkout.

3. Dev-vault-only guard (keeps D-01's spirit that tooling can never write into a real vault): immediately after the existing vault existence/.obsidian check and BEFORE the exe/asar checks, the main-instance guard, the stop call, or anything else with a side effect, if `-SkipBuild` is not set and `Split-Path -Leaf $Vault` is not `dev-vault` (case-insensitive), throw "Refusing to install the plugin into '<Vault>': the vault folder must be named dev-vault (use -SkipBuild to launch an existing install without copying)". This ordering is what makes the guard testable against a scratch folder with zero side effects.

4. Build step (only when `-SkipBuild` is not set), placed after the main-instance guard and BEFORE the call to stop-uat-obsidian.ps1 (so a failed build leaves any running instance and the installed build untouched): Push-Location to `$checkoutRoot` in a try/finally, run `npm run build`, and send its output to stderr so stdout stays reserved for the ready line (scope `$ErrorActionPreference = "Continue"` around the native call so npm/tsc stderr cannot trip the script's Stop preference; read `$LASTEXITCODE` right after). On non-zero exit: write "npm run build failed in <checkoutRoot>; nothing was installed or launched" to stderr and `exit 1`. Then confirm `<checkoutRoot>\main.js` exists.

5. Install step (only when `-SkipBuild` is not set), placed AFTER the stop-uat-obsidian.ps1 call and before the port guard: target `$pluginDir = Join-Path $Vault ".obsidian\plugins\tasknotes-timer-pane"`; `New-Item -ItemType Directory -Force` if missing; copy exactly `main.js`, `manifest.json`, `styles.css` from `$checkoutRoot` with `Copy-Item -LiteralPath ... -Force` (throw if a source file is missing). Never touch `data.json` or any other file in that folder. Afterwards compare SHA-256 (`Get-FileHash`) of the installed and source main.js and throw on mismatch.

6. Build provenance for the ready line: when installing, `$buildInfo = "<checkoutRoot>@<git -C $checkoutRoot rev-parse --short HEAD>"`, appending `+dirty` when `git -C $checkoutRoot status --porcelain --untracked-files=no` prints anything (Claude's discretion: executors often verify before committing, so the hash alone could mislead). With `-SkipBuild`, `$buildInfo = "skipped"`. In all cases compute `$mainHash` = first 12 lower-case hex chars of SHA-256 of `<pluginDir>\main.js` (or `none` if it does not exist). Append ` build=$buildInfo mainjs=$mainHash` to the existing `UAT Obsidian ready:` line (keep all existing fields and their order; keep it the only line the script writes to stdout).

Do NOT modify esbuild.config.mjs, package.json, stop-uat-obsidian.ps1 or cdp.mjs.
  </action>
  <verify>
    <automated>npm run uat:start && node scripts/uat/cdp.mjs prepare --port 9333 && pwsh -NoProfile -Command '$a=(Get-FileHash main.js).Hash; $r=Split-Path -Parent (git rev-parse --path-format=absolute --git-common-dir); $b=(Get-FileHash (Join-Path $r "dev-vault/.obsidian/plugins/tasknotes-timer-pane/main.js")).Hash; "checkout=$a installed=$b"; if ($a -ne $b) { exit 1 }'; rc=$?; npm run uat:stop; test $rc -eq 0</automated>
    <automated>pwsh -NoProfile -Command '$s=Join-Path $env:TEMP "iua-guard-scratch"; New-Item -ItemType Directory -Force (Join-Path $s ".obsidian") | Out-Null; $o = pwsh -NoProfile -File scripts/uat/start-uat-obsidian.ps1 -Vault $s 2>&1 | Out-String; $code=$LASTEXITCODE; $planted=Test-Path (Join-Path $s ".obsidian/plugins"); Remove-Item -Recurse -Force $s; "exit=$code planted=$planted"; if ($code -eq 0 -or $planted -or $o -notmatch "dev-vault" -or $o -match "UAT Obsidian ready") { exit 1 }'</automated>
  </verify>
  <done>From this worktree, uat:start prints one `UAT Obsidian ready:` line with `api=1`, `pane=loaded`, `build=<this worktree's path>@<short hash>` and a `mainjs=` hash; `cdp.mjs prepare` returns apiVersion 1; the installed main.js hash equals this worktree's main.js hash; uat:stop stops it. Against a scratch folder in %TEMP% not named dev-vault, the launcher exits non-zero with the dev-vault message, creates no `.obsidian/plugins` folder, and launches nothing.</done>
</task>

<task type="auto">
  <name>Task 2: Smoke check covers the build and asserts the installed build matches the checkout</name>
  <files>scripts/uat/smoke-uat-obsidian.ps1</files>
  <action>
Update scripts/uat/smoke-uat-obsidian.ps1 (keep the sampler, process bookkeeping, finally-block cleanup and exit rules as they are):

1. The foreground sampler already starts before the launcher and runs until after `-Seconds`, so the build now inside start-uat-obsidian.ps1 is covered by sampling; keep that ordering (do not start the sampler later). Update the header comment to say step 3 now includes the launcher's build + install.
2. Capture the launcher's stdout instead of letting it pass through: assign the output of the `& pwsh @launchArgs` call to a variable, keep `$LASTEXITCODE`, and echo the captured lines so the ready line is still visible (the build output already goes to stderr and streams to the console).
3. When the launcher exited 0, parse `vault=` from the `UAT Obsidian ready:` line (regex up to ` port=`), hash `<vault>\.obsidian\plugins\tasknotes-timer-pane\main.js` and `<repo root of $PSScriptRoot>\main.js` with Get-FileHash, and set `$installedMatch` to whether they are equal (false if the ready line or either file is missing). Do this inside the try block, before the finally stops the instance.
4. Add `installedMatch=<bool>` to the `Smoke:` summary line, and exit 1 (with a stderr message naming both paths) when the launcher succeeded but `$installedMatch` is false. All existing failure conditions stay.
  </action>
  <verify>
    <automated>npm run uat:smoke</automated>
  </verify>
  <done>`npm run uat:smoke` exits 0 and prints `Smoke: samples=<n > 0> uatForeground=0 uatLeft=0 userBefore=N userAfter=N installedMatch=True`; the user's own Obsidian processes are the same before and after.</done>
</task>

<task type="auto">
  <name>Task 3: Document it — README Automated UAT section and a CLAUDE.md rule so GSD runs start the sandbox</name>
  <files>README.md, .claude/CLAUDE.md</files>
  <action>
README.md, section "### Automated UAT (Windows dev only)" only (change nothing else):
- In "Before you start", replace the "run npm run deploy so it has a current build" part: the dev-vault still needs TaskNotes and the plugin enabled once (per the Development steps), but `uat:start` now builds the checkout you run it from and installs that build itself. Add that a checkout needs its own `npm ci` first.
- In "Commands", update the `uat:start` bullet: runs `npm run build` in the checkout containing the script (main checkout or a worktree), copies `main.js`, `manifest.json`, `styles.css` into `dev-vault/.obsidian/plugins/tasknotes-timer-pane/` of the main checkout's dev-vault, leaves `data.json` alone, then launches; a failed build installs and launches nothing; the ready line adds `build=<checkout>@<commit>` (with `+dirty` for uncommitted changes) and `mainjs=<hash>`. Add a bullet for `npm run uat:start -- -SkipBuild` (launch whatever is installed, no build or copy).
- Add: it only installs into a vault folder named `dev-vault` and refuses any other `-Vault` unless `-SkipBuild` is given, checked before anything is built or copied.
- Add: to load a new build, run `npm run uat:start` again (it stops the previous instance first; Hot Reload is not needed). Note that this replaces the dev vault's plugin build with the checkout's minified production build; run `npm run deploy` in the main checkout afterwards to go back to your own dev build.
- Mention `uat:smoke` now also checks that the installed `main.js` matches the checkout's build.
Follow the README's existing voice (plain sentences, backticked commands, no marketing).

.claude/CLAUDE.md: insert a new `## Automated UAT sandbox` section on new lines directly after the `<!-- GSD:workflow-end -->` marker line and before the `<!-- GSD:profile-start -->` marker line. Do not add GSD markers to it, and do not change any existing line (the Developer Profile block between the profile markers is tool-managed). Keep it to roughly 6-8 concise bullets covering:
- Before `/gsd-verify-work` on a phase with UI checkpoints, and before executing a UI phase whose waves gsd-dom-verifier will check, run `npm run uat:start` from the checkout that contains the code under test (worktree or main; that checkout needs `npm ci` first). gsd-dom-verifier has no Bash and cannot start it.
- Re-run `npm run uat:start` after every rebuild or merge you want verified (it rebuilds, reinstalls and restarts); check the ready line's `build=` and `mainjs=` to confirm what code is loaded.
- Run `npm run uat:stop` when done so dev-vault is free for the user.
- Precondition: the user's own Obsidian must not have dev-vault open. If the launcher refuses, ask the user to close it; do not work around the guard.
- Never launch Obsidian any other way for UAT (focus theft). Interact only through the `mcp__chrome-devtools__*` tools or `node scripts/uat/cdp.mjs` (port 9333).
- Verify disk- and state-checkable items yourself through the sandbox before asking the user; ask the user only about subjective look-and-feel.
  </action>
  <verify>
    <automated>awk '/GSD:workflow-end/{w=NR} /^## Automated UAT sandbox/{u=NR} /GSD:profile-start/{p=NR} END{exit !(w && u>w && p>u)}' .claude/CLAUDE.md && d=$(git diff -U0 HEAD -- .claude/CLAUDE.md) && test "$(printf '%s\n' "$d" | grep -c '^-[^-]')" -eq 0 && grep -q "SkipBuild" README.md && grep -q "uat:stop" .claude/CLAUDE.md && git diff --quiet HEAD -- esbuild.config.mjs package.json && npm run check</automated>
  </verify>
  <done>.claude/CLAUDE.md has the new section between the workflow-end and profile-start markers with no existing line removed or changed; README's Automated UAT section documents build-and-install, `-SkipBuild`, the dev-vault-only guard and reload-by-rerun; esbuild.config.mjs and package.json are unchanged; `npm run check` passes (539 tests).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| launcher -> vault filesystem | The install step writes plugin files into a vault folder chosen by `-Vault` or the default path |
| checkout -> UAT instance | Whatever the checkout builds is loaded and run inside the UAT Obsidian against dev-vault data |
| CLAUDE.md -> GSD agents | Project instructions steer how agents start and drive the sandbox |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-iua-01 | Tampering | start-uat-obsidian.ps1 install step | high | mitigate | Refuse any vault whose leaf folder is not `dev-vault` unless `-SkipBuild`; the check runs before build, stop, copy or launch; verified against a %TEMP% scratch folder (never the user's real vault) |
| T-iua-02 | Tampering | plugin folder contents | medium | mitigate | Copy only `main.js`, `manifest.json`, `styles.css`; never write `data.json` or other files; esbuild.config.mjs / DEV_DIR (D-01) untouched, checked with `git diff --quiet` |
| T-iua-03 | Repudiation | UAT verdicts against the wrong build | medium | mitigate | Ready line reports `build=<checkout>@<hash>[+dirty]` and `mainjs=<sha256 prefix>`; launcher compares installed vs source hash; smoke independently asserts installedMatch |
| T-iua-04 | Denial of service | failed build mid-run | low | mitigate | Build runs before the previous instance is stopped and before any copy; a non-zero build exits 1 with nothing installed or launched |
| T-iua-05 | Elevation of privilege | agents bypassing guards / stealing focus | medium | mitigate | CLAUDE.md forbids other Obsidian launch paths and workarounds of the open-vault guard; agents must ask the user to close dev-vault |
| T-iua-06 | Tampering | `npm run build` executes checkout code | low | accept | It is the user's own repo and the same build `npm run check` already runs |
| T-iua-SC | Tampering | npm/pip/cargo installs | high | accept | No packages are added; `npm ci` only installs from the existing lockfile |
</threat_model>

<verification>
- Task 1 verify: uat:start from this worktree installs this worktree's build, ready line shows api=1, pane=loaded, build= and mainjs=; prepare ok; installed hash == checkout hash; uat:stop. Scratch-folder guard refuses with no side effects.
- Task 2 verify: `npm run uat:smoke` passes with installedMatch=True.
- Task 3 verify: CLAUDE.md placement and no-removal check, README mentions -SkipBuild, esbuild.config.mjs and package.json unchanged, `npm run check` green.
- No `dev-vault/` exists in the worktree afterwards; no UAT Obsidian process is left running (`npm run uat:stop` reports 0).
</verification>

<success_criteria>
- Running `npm run uat:start` in any checkout loads that checkout's code into the sandbox and says so in the ready line.
- The install can never write into a vault not named dev-vault.
- GSD runs have a project rule telling them to start, re-run and stop the sandbox around live-DOM UAT.
- Smoke, check and D-01 all intact.
</success_criteria>

<output>
Create `.planning/quick/261113-iua-uat-sandbox-runs-the-code-under-test-and/261113-iua-SUMMARY.md` when done
</output>
