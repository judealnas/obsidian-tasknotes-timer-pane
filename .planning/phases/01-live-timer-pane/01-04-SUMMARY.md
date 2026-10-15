---
phase: 01-live-timer-pane
plan: 04
subsystem: infra
tags: [dev-vault, seed, uat, docs, readme]

requires:
  - phase: 01-01
    provides: "package.json scripts (dev, deploy, build, lint, test, check), esbuild DEV_DIR dev-vault/.obsidian/plugins/tasknotes-timer-pane with .hotreload, .gitignore for dev-vault/, ESLint globalIgnores for scripts and dev-vault-seed"
provides:
  - "dev-vault-seed/TaskNotes/Tasks/: four tracked TaskNotes seed notes (1:07:35 closed total; two empty open tasks incl. a long title; archive-flag task with an open entry since 2026-10-01)"
  - "scripts/seed-dev-vault.mjs and the `npm run seed` / `npm run seed -- --reset` script: copy-only, root from import.meta.url, refuses .obsidian and paths outside dev-vault/"
  - "README.md: usage, behavior notes, manual install, dev-vault loop, definition of done"
  - ".planning/phases/01-live-timer-pane/01-UAT-CHECKLIST.md: the D-13 end-of-phase manual script (sections 0-8, results table)"
affects: [01-03, 01-05, verify-work]

actuals:
  tokens: 5684      # chars/4 over the added lines of the 8 changed files (22736 chars)
  tasks: 2
  commits: 2
plan_head_before: 38a766a125c44f20474c637f08ec746eaaa79b9e
plan_head_after: 7524ecfef3dac5c9c5597d97ec83041d2f0ba403

tech-stack:
  added: []
  patterns:
    - "Tracked seed template (dev-vault-seed/) copied into the git-ignored dev-vault/ by a copy-only script"
    - "COPYFILE_EXCL for the non-reset copy, so an existing note is never overwritten even under a race"

key-files:
  created:
    - dev-vault-seed/TaskNotes/Tasks/Write quarterly report.md
    - dev-vault-seed/TaskNotes/Tasks/Review pull requests.md
    - dev-vault-seed/TaskNotes/Tasks/Draft the migration plan for the legacy billing system so this title wraps across several lines.md
    - dev-vault-seed/TaskNotes/Tasks/Clean up old project archive.md
    - scripts/seed-dev-vault.mjs
    - README.md
    - .planning/phases/01-live-timer-pane/01-UAT-CHECKLIST.md
  modified:
    - package.json

key-decisions:
  - "Seed tracking uses a template folder (dev-vault-seed/) plus a copy script rather than un-ignoring paths under dev-vault/ (CONTEXT Claude's discretion)"
  - "The seed script continues past a refused path and exits 1 at the end, so one bad seed path is reported without hiding the rest; an I/O error exits 1 immediately"
  - "The .obsidian refusal compares the first path segment case-insensitively, since Windows and macOS filesystems are case-insensitive"
  - "The UAT checklist folds in WINDOWS.md entries 1 and 2 (01-01 plugin-listed check as step 0.3; 01-02 reveal, restore, title link, tooltip and overflow checks as sections 1-2); the entries stay open until the checklist is run"

patterns-established:
  - "Seed notes follow TaskNotes defaults: tag task, title from the file name, quoted ISO timestamps"

requirements-completed: [PANE-03, SYNC-02, SYNC-03, SYNC-04]

coverage:
  - id: D1
    description: "npm run seed creates the four seed notes in dev-vault/TaskNotes/Tasks/; a plain re-seed keeps an edited note; --reset restores it; a marker under dev-vault/.obsidian/ survives both"
    verification:
      - kind: other
        ref: "Task 1 verify commands 1 and 2 (seed, edit, re-seed, --reset, .obsidian guard file)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A seed path under .obsidian is refused with exit 1 and nothing is written to dev-vault/.obsidian/"
    verification:
      - kind: other
        ref: "temporary dev-vault-seed/.obsidian/probe.txt -> npm run seed exits 1, dev-vault/.obsidian/probe.txt absent; probe removed"
        status: pass
    human_judgment: false
  - id: D3
    description: "npm run deploy fills the dev-vault plugin folder and nothing under dev-vault/ is tracked"
    verification:
      - kind: other
        ref: "npm run deploy && test -f dev-vault/.obsidian/plugins/tasknotes-timer-pane/{main.js,.hotreload} && test -z \"$(git ls-files dev-vault)\""
        status: pass
    human_judgment: false
  - id: D4
    description: "README covers usage, behavior notes, one-time TaskNotes 4.13.x and Hot Reload 0.3.1 installs, the seed/deploy/dev loop and npm run check; no release instructions"
    verification:
      - kind: other
        ref: "Task 2 verify 1 and acceptance greps (never in your real vault, 4.13, 0.3.1, release terms = 0)"
        status: pass
    human_judgment: false
  - id: D5
    description: "01-UAT-CHECKLIST.md has every D-13 section with expected results, the run-order header, and '(requires plan 01-05)' only on Stop; no superseded archive auto-stop step"
    verification:
      - kind: other
        ref: "Task 2 verify 2 and acceptance greps (completed-type status, superseded copy = 0, no Notice, ±1 s, 1:07:35, requires plan 01-05 = 1)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The seeded dev vault opens in Obsidian with TaskNotes reading the seed notes (1:07:35 total, archived timer above 100:00:00) and the checklist steps are runnable as written"
    requirement: "SYNC-02"
    verification: []
    human_judgment: true
    rationale: "Only the running Obsidian app with TaskNotes installed can confirm TaskNotes parses the seed YAML (A5) and that each checklist step behaves as described; this is the end-of-phase UAT run itself (D-13)"

duration: 3min
completed: 2026-10-15
status: complete
---

# Phase 01 Plan 04: Seeded Dev Vault, README and UAT Checklist Summary

**`npm run seed` builds a git-ignored dev vault from four tracked TaskNotes seed notes, using a copy-only script that never overwrites edits without `--reset`, never writes under `.obsidian/` and never leaves `dev-vault/`. A README and a 199-line D-13 UAT checklist (sections 0-8, results table, run after 01-01 to 01-05) go with it.**

## Performance

- **Duration:** about 3 min
- **Started:** 2026-10-15T02:21:36Z
- **Completed:** 2026-10-15T02:24:48Z
- **Tasks:** 2
- **Files:** 7 created, 1 modified

## Accomplishments

- Four seed notes in TaskNotes' default format (tag `task`, title from the file name, quoted timestamps):
  - "Write quarterly report" has two closed entries totalling 1:07:35.
  - "Review pull requests" and the long-titled migration-plan task have no entries.
  - "Clean up old project archive" has tags `task` and `archived`, one closed entry, and one entry open since 2026-10-01, so its session clock is above 100:00:00.
- `scripts/seed-dev-vault.mjs`:
  - Resolves the root from `import.meta.url` and walks `dev-vault-seed/` recursively.
  - Refuses `.obsidian` first segments, destinations outside `dev-vault/` and non-regular files.
  - Copies with `COPYFILE_EXCL` unless `--reset` is given, and has no delete path.
  - Prints `Seeded N file(s), skipped M existing, into dev-vault/`.
- `package.json` gains only `"seed": "node scripts/seed-dev-vault.mjs"`. The lockfile is unchanged.
- `README.md` covers what the plugin is, its requirements, using the pane (including the D-05 completion note and the three expected differences from TaskNotes' displays), manual install, and the nine-step development loop.
- `01-UAT-CHECKLIST.md` covers every D-13 item with exact UI-SPEC copy, plus a results row per step. The archive-flag section checks display-like-any-other and leaves completion to TaskNotes (D-05).

## Task Commits

1. **Task 1 (tracer): Seeded dev vault end to end:** `d6d8e39` (feat)
2. **Task 2: README and the Phase 1 UAT checklist:** `7524ecf` (docs)

**Tracer gate:** This is not auto mode, and `human_verify_mode` is end-of-phase. Task 1's `<verify>` is automated-only, so all three commands were re-run (green) and execution moved on to Task 2 with no checkpoint. Tracer verified end to end, then expanded.

## Files Created/Modified

- `dev-vault-seed/TaskNotes/Tasks/*.md` (4 files): UAT seed notes
- `scripts/seed-dev-vault.mjs`: non-destructive seed copy
- `package.json`: `seed` script
- `README.md`: usage and development docs
- `.planning/phases/01-live-timer-pane/01-UAT-CHECKLIST.md`: the end-of-phase manual UAT script

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Race-safe no-overwrite copy and a non-regular-file refusal in the seed script**
- **Found during:** Task 1
- **Issue:** A check-then-copy ("copy if missing") can still overwrite a note created between the check and the copy. A symlink in the seed folder could also point the copy at a file outside the seed.
- **Fix:** The non-reset copy uses `fs.constants.COPYFILE_EXCL`, so `EEXIST` counts as "skipped". Entries that are not regular files or folders are refused, which also makes the script exit 1.
- **Files modified:** `scripts/seed-dev-vault.mjs`
- **Verification:** All Task 1 verify commands pass. A temporary `dev-vault-seed/.obsidian/probe.txt` was refused with exit 1 and wrote nothing, and the probe was then removed.
- **Committed in:** `d6d8e39`

**2. [Checklist content] Extra steps beyond the plan's list**
- The plan's checklist items are all present, in its section order. A few steps were added to make them runnable:
  - 0.3 folds in the 01-01 WINDOWS entry: the plugin is listed as "TaskNotes Timer Pane" 0.1.0 and enables with no console error.
  - 1.1 checks the tab header "TaskNotes timer".
  - 3.6 restores the deleted note with `npm run seed`.
  - 6.4 gives a dev-console fallback for the race.
  - 7.3 resets the seed before the hand-edited `done` step.
  - Section 4 notes that the "TaskNotes needs an update" state is covered by unit tests, not by hand (D-04).
- No step expects the superseded archive auto-stop.

---

**Total deviations:** 2 (1 missing-critical, 1 checklist content)
**Impact on plan:** Both strengthen the plan's own guarantees. No scope creep.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None. The seed script is the only new filesystem surface, and threat T-01-08 already covers it: the root comes from `import.meta.url`, every destination must sit inside `dev-vault/`, `.obsidian` is refused, and the script only copies. T-01-09 holds (`git ls-files dev-vault` is empty), and T-01-SC holds (`package-lock.json` is unchanged).

## User Setup Required

None now. Running the checklist needs the one-time manual installs in README steps 3 to 5 (TaskNotes 4.13.x and Hot Reload 0.3.1 in `dev-vault/`). That is checklist section 0, at the end of the phase.

## Next Phase Readiness

- Plans 01-03 (sync) and 01-05 (Stop) can rely on `npm run seed -- --reset` and the seed tasks for any in-Obsidian check they defer.
- At the end of the phase, the user runs `01-UAT-CHECKLIST.md` after 01-01 to 01-05 are complete. WINDOWS.md entries 1 and 2 can be marked fixed once steps 0.3 and sections 1-2 pass.

---
*Phase: 01-live-timer-pane*
*Completed: 2026-10-15*
