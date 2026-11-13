---
phase: quick-261113-iua
plan: 01
subsystem: dev-tooling / UAT
tags: [uat, obsidian, powershell, gsd]
status: complete
requires: [261113-i5w hidden UAT launcher]
provides: [build-and-install UAT launcher, installedMatch smoke assertion, GSD sandbox rule]
affects: [scripts/uat, README.md, .claude/CLAUDE.md]
tech-stack:
  added: []
  patterns: [build-before-stop, leaf-name vault guard before side effects, build provenance in ready line]
key-files:
  created: []
  modified:
    - scripts/uat/start-uat-obsidian.ps1
    - scripts/uat/smoke-uat-obsidian.ps1
    - README.md
    - .claude/CLAUDE.md
decisions:
  - "uat:start builds the checkout containing the script and installs main.js/manifest.json/styles.css into the main checkout's dev-vault; reload = re-run uat:start"
  - "Install refuses any vault whose folder is not named dev-vault unless -SkipBuild, checked before any side effect"
  - "Ready line appends build=<checkout>@<short sha>[+dirty] mainjs=<sha256 prefix 12>"
metrics:
  duration: ~4 min
  completed: 2026-11-13
actuals:
  tokens: 9000
  tasks: 3
  commits: 3
plan_head_before: f9346f9c6756a17b01df567e5c1a3c6affe86be3
plan_head_after: 0f4a0763d228a65ddaa9072848f4d96f29a26425
---

# Phase quick-261113-iua Plan 01: UAT sandbox runs the code under test Summary

`npm run uat:start` now runs `npm run build` in whichever checkout contains the script (main or worktree), installs exactly main.js, manifest.json and styles.css into the main checkout's dev-vault plugin folder (hash-checked, data.json untouched), refuses non-`dev-vault` targets before any side effect, and reports `build=` / `mainjs=` provenance; smoke asserts installed == checkout main.js; CLAUDE.md tells GSD runs to start/re-run/stop it.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Build, guard, install, launch, report (tracer) | 33a060c |
| 2 | Smoke asserts installedMatch | 60bbc75 |
| 3 | README + CLAUDE.md docs | 0f4a076 |

## Verification

- Guard: scratch `%TEMP%\iua-guard-scratch` -> exit=1, "Refusing to install the plugin into '...iua-guard-scratch': the vault folder must be named dev-vault ...", planted=False, no ready line.
- `npm run uat:start` (worktree): `UAT Obsidian ready: vault=C:\Users\ja384\Home\obsidian-tasknotes-timer-pane\dev-vault port=9333 pid=78012 tasknotes=4.18.2 api=1 timeWrite=True pane=loaded build=C:\Users\ja384\Home\obsidian-tasknotes-timer-pane\.claude\worktrees\uat-launcher@f9346f9+dirty mainjs=a7aa3be019b6`; `cdp.mjs prepare` -> apiVersion 1, paneLoaded true; checkout and installed main.js SHA-256 both a7aa3be0...6388; uat:stop stopped 4.
- `npm run uat:smoke`: `Smoke: samples=118 uatForeground=0 uatLeft=0 userBefore=4 userAfter=4 installedMatch=True`, exit 0.
- `npm run check`: build, lint, 17 files / 539 tests passed.
- esbuild.config.mjs and package.json unchanged; CLAUDE.md diff is additions only, between workflow-end and profile-start markers; no worktree dev-vault; 0 UAT processes left.

## Deviations from Plan

None - plan executed exactly as written. Note: the launcher's stdout still includes the pre-existing "Stopped N UAT Obsidian process(es)" line printed by stop-uat-obsidian.ps1 (not modified per plan); the ready line is the only line the launcher itself writes, and smoke parses it by prefix. The build-failure path (exit 1, nothing installed) was implemented but not exercised live.

## Self-Check: PASSED

- All four modified files exist; commits 33a060c, 60bbc75, 0f4a076 are ancestors of HEAD.
