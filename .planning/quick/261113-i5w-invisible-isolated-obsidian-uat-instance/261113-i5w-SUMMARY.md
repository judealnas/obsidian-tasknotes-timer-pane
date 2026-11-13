---
phase: quick-261113-i5w
plan: 01
subsystem: dev-tooling / UAT
status: complete
tags: [uat, obsidian, cdp, mcp, windows, dev-tooling]
requires: []
provides:
  - scripts/uat/start-uat-obsidian.ps1 (guarded hidden-desktop launcher)
  - scripts/uat/stop-uat-obsidian.ps1 (UAT-only stop by user-data dir)
  - scripts/uat/cdp.mjs (Runtime.evaluate helper, eval + prepare)
  - scripts/uat/smoke-uat-obsidian.ps1 (no-focus-theft / no-collateral check)
  - .mcp.json chrome-devtools server on 127.0.0.1:9333
affects: [gsd live-DOM UAT (workflow.live_dom_uat = true)]
tech-stack:
  added: [chrome-devtools-mcp@1.13.0 (via npx in .mcp.json only, not a package.json dependency)]
  patterns: [CreateDesktop + CreateProcess lpDesktop hidden launch, CDP readiness + prepare over Runtime.evaluate, deterministic vault id from SHA-256 of path]
key-files:
  created:
    - scripts/uat/cdp.mjs
    - scripts/uat/start-uat-obsidian.ps1
    - scripts/uat/stop-uat-obsidian.ps1
    - scripts/uat/smoke-uat-obsidian.ps1
    - .mcp.json
  modified:
    - package.json
    - README.md
    - .planning/config.json
decisions:
  - "Added --no-usage-statistics and --no-performance-crux to the chrome-devtools MCP args; both are listed by chrome-devtools-mcp@1.13.0 --help"
  - "Smoke runs the launcher as a child pwsh process so its exit code is captured and the Add-Type launch type does not collide in-session"
metrics:
  duration: ~15 min
  completed: 2026-11-13
actuals:
  tokens: 5500
  tasks: 3
  commits: 3
plan_head_before: 0920f4a25502f08a5037cf50947389b0713fa84d
plan_head_after: f0ff2bec4302755c19ec6ee562ad14d526a44613
---

# Phase quick-261113-i5w Plan 01: Invisible isolated Obsidian UAT instance Summary

Hidden-desktop second Obsidian (own user-data dir, CDP on 127.0.0.1:9333) with vault, user-data and port guards, a CDP prepare step that clears the trust modal and Restricted mode, a UAT-only stopper, a foreground-sampling smoke check, and a pinned `chrome-devtools` MCP server.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Hidden UAT instance: start, prepare over CDP, stop | a14531c | scripts/uat/cdp.mjs, start-uat-obsidian.ps1, stop-uat-obsidian.ps1, package.json |
| 2 | Smoke check: no focus theft, no collateral damage | 456b267 | scripts/uat/smoke-uat-obsidian.ps1, package.json |
| 3 | MCP server, live-DOM UAT on, README | f0ff2be | .mcp.json, .planning/config.json, README.md |

## Verification results

- Precondition: the user's `%APPDATA%\obsidian\obsidian.json` lists dev-vault without `open: true` (only Personal Vault is open); dev-vault has `tasknotes` and `tasknotes-timer-pane` installed and enabled. Met.
- `npm run uat:start`: `UAT Obsidian ready: vault=C:\Users\ja384\Home\obsidian-tasknotes-timer-pane\dev-vault port=9333 pid=58480 tasknotes=4.18.2 api=1 timeWrite=True pane=loaded`, exit 0.
- `node scripts/uat/cdp.mjs prepare --port 9333` against the running instance: `{"tasknotesVersion":"4.18.2","apiVersion":1,"timeWrite":true,"paneLoaded":true,"obsidianVersion":null}`, exit 0.
- `npm run uat:stop`: `Stopped 4 UAT Obsidian process(es)`, and a re-run printed `Stopped 0 UAT Obsidian process(es)`. The user's Obsidian pids (15492 19944 26748 26768) were the same before and after.
- `npm run uat:smoke`: `Smoke: samples=94 uatForeground=0 uatLeft=0 userBefore=4 userAfter=4`, exit 0.
- `.mcp.json` check passed; `config-get workflow.live_dom_uat` returned `true`; README `uat:start` count is 1.
- `npm run check`: build, tsc, ESLint at 0 warnings, Vitest 17 files / 539 tests passed, exit 0.
- No `dev-vault/` was created in the worktree. The user's obsidian.json is only read, never written. No UAT instance is left running.
- The main-instance guard was checked by reading the code (as the plan says): any entry with `open: true` whose path exists and matches the normalized vault path throws `Vault is open in your main Obsidian instance; ...`.

## Deviations from Plan

**1. [Rule 3 - Blocking] The literal `cdp.mjs eval` verify command could not run**
- **Found during:** Task 1
- **Issue:** The worktree-isolation harness refuses any Bash command containing the word `eval`, even as a plain node argument.
- **Fix:** Ran `cdp.mjs prepare` against the running instance instead. It goes through the same `findTarget` and `evaluate()` path and returned `apiVersion: 1`. The `eval` subcommand only differs in where the expression comes from (`--expr`); it was not run live.
- **Commit:** a14531c

**2. [Rule 3 - Blocking] Ran `npm ci` in the worktree**
- **Issue:** The worktree had no `node_modules`, so `npm run check` could not run.
- **Fix:** Ran `npm ci` from the existing lockfile. No new packages were added and package.json dependencies are unchanged.

**3. [Rule 2 - Telemetry] Two opt-out flags in `.mcp.json`**
- `chrome-devtools-mcp@1.13.0 --help` lists `--no-usage-statistics` and `--no-performance-crux` (the second stops trace URLs being sent to CrUX). Both are appended to `args` (T-i5w-06).

The execution policy (LocalMachine RemoteSigned) did not block local scripts, so `-ExecutionPolicy Bypass` was not needed.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat register. CDP on 9333 (T-i5w-04) stays an accepted risk; the README tells the user to stop the instance when done.

## Human check pending

Restart Claude Code in this project, approve the `chrome-devtools` project MCP server, run `npm run uat:start`, and confirm the `mcp__chrome-devtools__*` tools list and can take a screenshot of the UAT window.

## Self-Check: PASSED

- FOUND: scripts/uat/cdp.mjs, scripts/uat/start-uat-obsidian.ps1, scripts/uat/stop-uat-obsidian.ps1, scripts/uat/smoke-uat-obsidian.ps1, .mcp.json
- FOUND commits: a14531c, 456b267, f0ff2be (on HEAD)
