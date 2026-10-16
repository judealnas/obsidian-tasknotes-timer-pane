---
phase: 03-pause-resume
plan: 02
subsystem: state
tags: [pause, reconcile, pomodoro, vault-events, rename, tasknotes-runtime-api, vitest]

requires:
  - phase: 03-pause-resume
    provides: "03-01 pauseLedger (PauseRecord v1, reconcile D-11), PauseStore (revision, pending paths), TimerStore revision guard, gateway getTask/statuses"
provides:
  - "reconcile rule 1 (D-16 Pomodoro takeover, Pitfall 6), rename-tolerant rule 3, rule 4 (completed-type status), rule 5 (file missing)"
  - "TimerStoreDeps.fileCheck; completed statuses read from the catalog while something is paused"
  - "PauseStore.renamePath / removePath with exact and '/'-bounded prefix matching"
  - "vault rename/delete handlers that update pauses synchronously; fileCheck after onLayoutReady"
  - "exported newnessMs (shared collision rule for load and rename)"
affects: [03-03, 03-04]

actuals:
  tokens: 10250
  tasks: 2
  commits: 4
plan_head_before: c8992700f224dedf75f04d91966a18af420c2131
plan_head_after: 3fa62d72a97a87d528344067235c88c0b8fa4156

tech-stack:
  added: []
  patterns:
    - "Reconcile rules apply per record in a fixed order (1 takeover, 2 external start, 3 vanished running, 4 completed, 5 missing); rules 3-5 skip pending paths"
    - "Vault events change the ledger synchronously, then request a debounced refresh"
    - "Existence checks are injected as a nullable function; null means 'cannot tell yet' and skips the rule"

key-files:
  created:
    - tests/pauseStore.test.ts
  modified:
    - src/model/pauseLedger.ts
    - src/state/TimerStore.ts
    - src/state/PauseStore.ts
    - src/main.ts
    - tests/pauseLedger.test.ts
    - tests/store.test.ts
    - tests/main.test.ts
    - tests/fakes/fakeObsidian.ts

key-decisions:
  - "Rule 1 deletes a paused record whenever the readable Pomodoro owner is on its path, and a running record only when its entryStart is the owner's startTime"
  - "Rule 3 keeps a running record while its entryStart is still open under a path that holds no record (TaskNotes re-index lag after a rename)"
  - "A rename collision keeps the newer record by the same newnessMs rule as loadPauseRecords; on a tie the moved record wins"
  - "A rename made while Obsidian is closed cannot be told apart from a delete at load, so that pause clears through rule 5 (accepted degradation)"

patterns-established:
  - "PauseStore path operations normalize input with normalizeTimerPath and match path === target or path startsWith target + '/'"

requirements-completed: [CTRL-04]

coverage:
  - id: D1
    description: "A pause clears when a Pomodoro takes over its task (paused, or resumed while ownership was unreadable)"
    requirement: CTRL-04
    verification:
      - kind: unit
        ref: "tests/pauseLedger.test.ts#reconcile rule 1: Pomodoro takeover (D-16)"
        status: pass
      - kind: integration
        ref: "tests/store.test.ts#pause ledger in refresh > a readable Pomodoro owner on a paused task clears the pause on refresh"
        status: pass
    human_judgment: true
    rationale: "Starting a Pomodoro from TaskNotes' Pomodoro view on a paused task is the end-of-phase dev-vault human-check"
  - id: D2
    description: "A pause clears on a completed-type status and never on the archived flag, a null task or age"
    requirement: CTRL-04
    verification:
      - kind: unit
        ref: "tests/pauseLedger.test.ts#reconcile rule 4: completed elsewhere (D-12)"
        status: pass
      - kind: unit
        ref: "tests/pauseLedger.test.ts#reconcile pending paths and age"
        status: pass
      - kind: integration
        ref: "tests/store.test.ts#pause ledger in refresh"
        status: pass
    human_judgment: true
    rationale: "Marking done from a TaskNotes card and archive-only checks run in the dev vault at end of phase"
  - id: D3
    description: "A pause follows a renamed or moved note or folder and clears on delete, through Obsidian vault events"
    requirement: CTRL-04
    verification:
      - kind: unit
        ref: "tests/pauseStore.test.ts"
        status: pass
      - kind: integration
        ref: "tests/main.test.ts#the vault rename handler moves the pause before it requests a refresh"
        status: pass
      - kind: unit
        ref: "tests/pauseLedger.test.ts#reconcile rule 3: rename lag"
        status: pass
    human_judgment: true
    rationale: "Explorer rename/move/delete and survival across a real restart need the end-of-phase human-check (Assumptions A1, A2)"
  - id: D4
    description: "A refresh whose reads began before a ledger change re-reads instead of publishing stale conclusions; missing-file rule only after layout ready"
    requirement: CTRL-04
    verification:
      - kind: integration
        ref: "tests/store.test.ts#pause ledger in refresh > a pause-record change while a refresh awaits its reads causes a re-read and no stale publish"
        status: pass
      - kind: integration
        ref: "tests/main.test.ts#fileCheck is null before layout ready and backed by vault.getFileByPath after it"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-16
status: complete
---

# Phase 3 Plan 02: Pauses follow their tasks Summary

**Reconcile now clears a pause on Pomodoro takeover, a catalog completed-type status or a missing note, tolerates TaskNotes' rename re-index lag, and Obsidian vault rename/delete events move or remove pause records synchronously, including whole folders.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-16T07:18:00Z
- **Completed:** 2026-10-16T07:26:00Z
- **Tasks:** 2
- **Files modified:** 9 source and test files (plus TDD evidence)

## Accomplishments

- `reconcile` applies five rules per record in order. Rule 1 (D-16) deletes a paused record when the readable Pomodoro owner is on its path, and deletes a running record whose entry is the owner's (Pitfall 6). It runs before D-11, so a Pomodoro start never reads as an external resume. Rule 3 keeps a running record while its entry is still open under a path no record holds (rename lag). Rule 4 deletes a paused record whose status is in the completed set. Rule 5 deletes on `fileExists === false`. Rules 3 to 5 skip pending paths. No rule reads `archived`, and none deletes by age or on a null task.
- `TimerStore` reads `gateway.statuses()` once per refresh, and only while a paused record exists. A failed read gives `null`, which skips rule 4 and is not an error state. It also passes `fileCheck()` into reconcile. The revision guard from 03-01 is now covered by an interleaving test.
- `PauseStore.renamePath` / `removePath` normalize their inputs and match the exact path or a `/`-bounded prefix. `Projects/AB` and `Projects/A.md` are never touched by a `Projects/A` rename. A collision keeps the newer record. Each call bumps the revision and persists once, and only when something changed.
- `main.ts`: the vault `rename` handler calls `renamePath(oldPath, file.path)` and the `delete` handler calls `removePath(file.path)`, both before `requestRefresh()`. `fileCheck` returns null until `onLayoutReady` fires, then uses `vault.getFileByPath`. The plan does not subscribe to TaskNotes' move or delete events.

## Task Commits

1. **Task 1: takeover, completed-elsewhere and missing-file rules with a revision-guarded refresh**
   - RED `e64e07d` test(03-02): add failing tests for takeover, completed and missing-file pause rules
   - GREEN `011f3ab` feat(03-02): clear pauses on Pomodoro takeover, completion and missing notes
2. **Task 2: pauses follow rename and move, and clear on delete, through Obsidian vault events**
   - RED `c099092` test(03-02): add failing tests for pauses following vault renames and deletes
   - GREEN `3fa62d7` feat(03-02): pauses follow vault renames and moves and clear on delete

## TDD Gate Compliance

- **Task 1 RED:** `npx vitest run --dir tests pauseLedger store --reporter=junit`, exit 1, 12 of 78 failing. Classifier `RED_EVIDENCE_OK` for the target "reconcile rule 1: Pomodoro takeover (D-16) > a paused record whose path is the readable Pomodoro owner's path is deleted". Semantic assessment: the target ran and failed on its `toEqual` assertion because reconcile had no takeover rule. There was no load or fixture fault. The store revision-guard test passed at RED because 03-01 had already built that guard. The plan asked for the test, not the code. The `tap-flat` run is kept as console output, because its multi-line diffs are malformed TAP for the classifier. Evidence: `.planning/phases/03-pause-resume/tdd/red-03-02-t1.{json,junit.xml,tap,console.txt}`.
- **Task 2 RED:** `npx vitest run --dir tests pauseStore main --reporter=junit`, exit 1, 16 failing (4 in main, 12 in pauseStore). Classifier `RED_EVIDENCE_OK` for the target "the vault rename handler moves the pause before it requests a refresh". Semantic assessment: the old handler only requested a refresh, so the target failed on its assertion. The pauseStore failures are TypeErrors for the not-yet-existing planned methods, not load faults. The record's `runStartedAt` comes from the JUnit report's own suite timestamp minus 2 s, because the shell variable that held the start time was not kept. Evidence: `.planning/phases/03-pause-resume/tdd/red-03-02-t2.{json,junit.xml,console.txt}`.
- **GREEN:** `npm run check` exit 0 after each GREEN commit: 298 tests after Task 1 and 314 after Task 2 (271 at the start of the plan). No REFACTOR commit.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Shell heredoc collapsed backslashes in two test literals**
- **Found during:** Task 2 GREEN
- **Issue:** The RED commit's `tests/pauseStore.test.ts` had `"\Projects\A"` and `"\T\A.md"` instead of the double-backslash escapes. The backslash-normalization tests therefore exercised the wrong input.
- **Fix:** Restored them to `"\\Projects\\A"` and `"\\T\\A.md"` with the Edit tool. Also checked that no file contains a NUL byte.
- **Files modified:** tests/pauseStore.test.ts
- **Commit:** 3fa62d7

**2. [Rule 3 - Blocking] `newnessMs` exported from pauseLedger**
- **Issue:** The rename collision rule must match `loadPauseRecords`'s rule. The helper was module-private.
- **Fix:** Exported it. Its behavior is unchanged.
- **Commit:** 3fa62d7

**3. [Test technique] main.test captures TimerStore deps through a module mock**
- `main.ts` keeps `store` local, so the test wraps `TimerStore` in a subclass through `vi.mock(importOriginal)` to reach `fileCheck` and spy on `requestRefresh`. Production code is unchanged.

**Total deviations:** 2 auto-fixed (1 test-literal bug, 1 blocking export), plus 1 test-only technique. **Impact:** no scope change. Every planned contract name is delivered.

## Accepted Degradation

A rename made while Obsidian is closed, for example through Sync from another device, cannot be told apart from a delete at load. That pause clears through rule 5 (RESEARCH Open Question 3).

## Known Stubs

None added. The 03-01 stub in `src/state/TimerStore.ts` (reconcile ran with `completedStatuses` and `fileExists` null) is resolved and marked fixed in `.planning/WINDOWS.md` (id 11). The 03-03 paused-card Stop/Complete stub (id 10) remains.

## Issues Encountered

- The human-checks in this plan's `<verify>` blocks run at end of phase (`human_verify_mode: end-of-phase`) and are recorded in `.planning/WINDOWS.md` as unrun-verify (id 12).

## User Setup Required

None.

## Next Phase Readiness

Ready for 03-03: stopping or completing a paused card, plus Pause all.

## Self-Check: PASSED

- FOUND: tests/pauseStore.test.ts, src/model/pauseLedger.ts, src/state/TimerStore.ts, src/state/PauseStore.ts, src/main.ts
- FOUND commits on this branch: e64e07d, 011f3ab, c099092, 3fa62d7
- Acceptance: `grep -n archived src/model/pauseLedger.ts` empty; `grep -n task.moved src/main.ts src/state/PauseStore.ts` empty; `npx vitest run --dir tests pauseLedger store pauseResume` and `npx vitest run --dir tests pauseStore main` pass; `npm run check` exit 0 (314 tests)
