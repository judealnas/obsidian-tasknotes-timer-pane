---
phase: 03-pause-resume
plan: 01
subsystem: state
tags: [pause, resume, session-ledger, data-json, tasknotes-runtime-api, vitest]

requires:
  - phase: 02-start-switch-complete
    provides: WriteQueue-serialized controller writes, Pomodoro ownership (sameEntry, getPomodoroOwnedEntryId), start/stop/complete outcome shape
provides:
  - src/model/pauseLedger.ts (PAUSE_RECORDS_VERSION, PausedRecord, RunningRecord, PauseRecord, PauseObservations, pausedFromStop, sessionValueMs, reconcile with rules D-11 and vanished-running, loadPauseRecords)
  - src/state/PauseStore.ts (plugin-scoped records, revision, pending paths, isLoaded, injected persist)
  - TaskNotesGateway.getTask(path) and stop() resolving TaskInfo
  - TimerController.pause / resume with PauseOutcome / ResumeOutcome / ResumeTarget
  - OpenTimer state, sessionStartedAt, sessionKey, sortMs, accumulatedMs, segmentStartMs, totalKnown; timerSessionMs
  - Per-card Pause/Resume button, paused card styling, session-keyed cards
  - Merged, serialized data.json persistence (completionStatus + pauseRecordsVersion 1 + pauseRecords + unknown keys)
affects: [03-02, 03-03, 03-04]

actuals:
  tokens: 15600
  tasks: 2
  commits: 5
plan_head_before: d4764ec8a50e26e92d265c592b7d565cdd8c0eeb
plan_head_after: 537caa72199fab220acc6cc8d5b7387ea3709343

tech-stack:
  added: []
  patterns:
    - "Session ledger: pane-owned pause records reconciled idempotently from TaskNotes reads on every refresh"
    - "Revision counter on PauseStore: a refresh whose reads began before a ledger change re-loops (dirty)"
    - "One serialized data.json writer; the saved object is built when the save runs"

key-files:
  created:
    - src/model/pauseLedger.ts
    - src/state/PauseStore.ts
    - tests/pauseResume.test.ts
    - tests/pauseLedger.test.ts
  modified:
    - src/tasknotes/runtime-api.types.ts
    - src/tasknotes/TaskNotesBridge.ts
    - src/model/timeMath.ts
    - src/state/TimerStore.ts
    - src/state/TimerController.ts
    - src/ui/TimerPaneView.ts
    - styles.css
    - src/main.ts
    - tests/fakes/fakeGateway.ts
    - tests/fakes/fakeTaskNotes.ts
    - tests/contract.test.ts
    - tests/main.test.ts
    - tests/bridge.test.ts
    - tests/readPath.test.ts

key-decisions:
  - "Pause saves write the settings last successfully written to data.json (fileSettings), not this.paneSettings at call time, so a pause queued behind a pending settings save never reverts it"
  - "TimerStore awaits PauseStore.ready() only while the load is pending, so a loaded store still reads TaskNotes in the same turn (keeps the retired-generation guarantee)"
  - "deriveSnapshot drops an active entry equal to a paused record's lastEntryStart (stale read), so a pause never shows a duplicate running card"
  - "Pause and resume failure logs carry no task path or TaskNotes text; notices are plain strings with title and reason"

patterns-established:
  - "Card identity is sessionKey (normalized path + U+0000 + sessionStartedAt); write identity stays (taskPath, startTime)"
  - "Resume never touches the record; the refresh's D-11 rule converts it, the same path an external start takes"

requirements-completed: [CTRL-02, CTRL-03, CTRL-04]

coverage:
  - id: D1
    description: "One-click per-card Pause closes only that entry via api.time.stop and keeps a frozen paused card"
    requirement: CTRL-02
    verification:
      - kind: integration
        ref: "tests/pauseResume.test.ts#Pause (CTRL-02)"
        status: pass
    human_judgment: true
    rationale: "Card look (muted, Paused label, button placement) and TaskNotes status bar clearing need the dev-vault human-check at end of phase"
  - id: D2
    description: "One-click Resume starts the same task and Session continues from the frozen value; external start resumes too"
    requirement: CTRL-03
    verification:
      - kind: integration
        ref: "tests/pauseResume.test.ts#Resume (CTRL-03)"
        status: pass
      - kind: integration
        ref: "tests/pauseResume.test.ts#Pauses and other timers (D-03, D-11)"
        status: pass
    human_judgment: true
    rationale: "Live TaskNotes status-bar start of a paused task must be checked in the dev vault (end-of-phase human-check)"
  - id: D3
    description: "Pause records persist in data.json with settings and unknown keys, validated on load, saves serialized"
    requirement: CTRL-04
    verification:
      - kind: unit
        ref: "tests/pauseLedger.test.ts"
        status: pass
      - kind: unit
        ref: "tests/main.test.ts"
        status: pass
    human_judgment: true
    rationale: "Survival across a real Obsidian quit and reopen is the plan's Task 2 human-check"

duration: 16min
completed: 2026-10-16
status: complete
---

# Phase 3 Plan 01: Pause and resume one card, durably Summary

**Per-card Pause/Resume built on a pane-owned session ledger: Pause is api.time.stop plus a v1 pause record, Resume is api.time.start reconciled back to running, and records persist in data.json through one serialized merged writer.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-10-16T06:56:33Z
- **Completed:** 2026-10-16T07:12:30Z
- **Tasks:** 2
- **Files modified:** 18 source and test files (plus TDD evidence)

## Accomplishments

- `src/model/pauseLedger.ts`: the PauseRecord v1 union, `pausedFromStop` (counts each closed segment once), `sessionValueMs`, `reconcile` with the D-11 rule (paused + new non-owned open entry becomes running) and the vanished-running rule (honours pending paths), and `loadPauseRecords` (versioned, field-validated, path-normalized, newest-per-path, 1000-item cap, never throws).
- `src/state/PauseStore.ts`: plugin-scoped records keyed by normalized path, revision counter, ref-counted pending paths, path-free failure logging, and pre-load changes merged over stored records.
- Bridge `getTask` through `tasks.get` (capability `tasks.read`, post-await api re-check); `stop` now resolves the TaskInfo TaskNotes saved, so the paused value comes from the entry's real `endTime`.
- Snapshot carries paused cards; cards sort by session first start (D-06) and are keyed by session, so pause and resume never move or rebuild a card. A paused-only pane is not idle.
- Controller `pause` / `resume` inside the WriteQueue with the outcome shape, D-17 Pomodoro guard on resume, "user pause" / "user resume" mutation contexts.
- View: Pause button on running cards, Resume (`mod-cta`) on paused cards, Stop loses `mod-cta` there; muted paused styling and "Paused" label; Total shows an em dash while the task can't be read. Stop and Complete hidden on paused cards until 03-03.
- `main.ts`: one PauseStore shared by store and controller; one save chain writes completionStatus, pauseRecordsVersion 1, pauseRecords and preserved unknown keys; stored pauses load at startup.

## Task Commits

1. **Task 1 (tracer): pause one card and resume it, end to end**
   - RED `ac969c3` test(03-01): add failing pause/resume tracer tests
   - GREEN `f29cb70` feat(03-01): pause and resume one card end to end
2. **Task 2: pauses survive a restart through merged, validated data.json persistence**
   - RED `0754cee` test(03-01): add failing tests for stored pauses and merged data.json saves
   - GREEN `c2e3d03` feat(03-01): persist pauses in data.json through one serialized merged save
3. **Fix** `537caa7` fix(03-01): replace a literal NUL byte in the readPath test helper with its escape

## TDD Gate Compliance

- Task 1 RED: `npx vitest run --dir tests pauseResume --reporter=tap-flat`, exit 1, 17/17 failing; classifier `RED_EVIDENCE_OK` (target "Pause (CTRL-02) > pausing the only running card ..."). Semantic assessment: the file loaded; the target failed because `TimerController.pause` did not exist. Evidence: `.planning/phases/03-pause-resume/tdd/red-03-01-t1.{json,tap}`. The RED commit carried a behavior-free `PauseStore` placeholder so the suite could load (otherwise an import failure, INVALID_RED).
- Task 2 RED: `npx vitest run --dir tests pauseLedger --reporter=tap-flat`, exit 1; classifier `RED_EVIDENCE_OK` (target "a valid paused and a valid running record load as stored", `loadPauseRecords` absent). The main.test RED (5/5 failing on saved-object assertions, settings-only save) is kept as console output in `red-03-01-t2-main.txt`, because Vitest's TAP reporter prints multi-line object diffs unindented and the classifier rejects them as malformed TAP.
- GREEN: `npm run check` exit 0 after each GREEN commit (271 tests at the end, 216 at baseline). No REFACTOR commit needed.
- Tracer gate: the tracer's `<verify>` was re-run end to end after Task 1 (`npx vitest run --dir tests pauseResume contract`: 35 passed; `npm run check` green) before expanding. Its `<human-check>` is deferred to end of phase, as the plan's `<verification>` section and `human_verify_mode: end-of-phase` direct.

## Decisions Made

See `key-decisions` in the frontmatter. The main one: a pause-triggered save writes the settings last written to data.json, not the in-memory `paneSettings` at the moment of the pause.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pause saves could revert a settings change still being written**
- **Found during:** Task 2
- **Issue:** The plan's `persist: () => this.persistAll(this.paneSettings)` reads `paneSettings` when the pause happens. A settings save in flight only updates `paneSettings` after `saveData` resolves, so a pause queued behind it would write the older setting back to data.json.
- **Fix:** `persistAll(settings?)`. A pause save passes no settings, and the step uses `fileSettings`, which is updated inside the chain after each successful settings write.
- **Files modified:** src/main.ts, tests/main.test.ts (test "a pause change writes data.json with the settings last saved, never an older setting")
- **Commit:** c2e3d03

**2. [Rule 3 - Blocking] TimerStore await broke the retired-generation guarantee**
- **Found during:** Task 1
- **Issue:** Always awaiting `pauses.ready()` delayed `active()` by a microtask, which broke `store.test.ts` "a retired generation cannot publish after a ready reconnect".
- **Fix:** Added `PauseStore.isLoaded()`. The store awaits `ready()` only while the load is pending.
- **Files modified:** src/state/PauseStore.ts, src/state/TimerStore.ts
- **Commit:** f29cb70

**3. [Rule 1 - Bug] Stale active() read duplicated a paused card**
- **Found during:** Task 1 design
- **Issue:** A read that still showed the just-closed entry as open would produce a running card and a paused card with the same session key.
- **Fix:** `deriveSnapshot` skips an active entry equal to a paused record's `lastEntryStart`.
- **Files modified:** src/model/timeMath.ts
- **Commit:** f29cb70

**4. [Rule 3 - Blocking] Test fixture updates outside the plan's file list**
- `tests/readPath.test.ts` (the OpenTimer helper needed the new fields) and `tests/bridge.test.ts` (stop now resolves TaskInfo; getTask tests added). The fake TaskNotes `time.start` now keeps a restarted task's earlier closed entries and replaces its old active() item, as TaskNotes does. Without that, a second `stop` on a resumed task hit the stale item and threw "no active session".
- **Commits:** ac969c3, f29cb70

**5. [Rule 1 - Bug] Literal NUL byte in a test file**
- **Found during:** post-task self-check
- **Issue:** The shell collapsed `\\u0000` in a heredoc edit, which wrote a raw U+0000 into `tests/readPath.test.ts`. Git then treated the file as binary.
- **Fix:** Replaced it with the `\u0000` escape. The diff against the base is now a 5-line text change.
- **Commit:** 537caa7

**Total deviations:** 5 auto-fixed (2 bugs in the plan's design, 1 stale-read bug, 2 blocking). **Impact:** no scope change. Every planned contract name is delivered. `PauseStore.isLoaded()` and `timerSessionMs()` were added as small helpers.

## Known Stubs

| File | Stub | Resolved by |
|---|---|---|
| styles.css | `.tntp-card--paused .tntp-stop, .tntp-complete { display: none }`: paused cards hide Stop and Complete | Plan 03-03 (stopPaused, complete on a paused card) |
| src/state/TimerStore.ts | `reconcile(...)` gets `completedStatuses: null, fileExists: null`, and there is no Pomodoro-takeover rule yet | Plan 03-02 |

Both stubs are intentional per the plan text and are recorded in `.planning/WINDOWS.md`.

## Issues Encountered

- Vitest's `tap-flat` reporter output for object-diff failures is not valid TAP for the RED classifier (see TDD Gate Compliance).

## User Setup Required

None.

## Next Phase Readiness

Ready for 03-02. That plan adds the reconcile rules for completed-elsewhere, deleted, Pomodoro takeover and rename, plus Pomodoro hiding. The human-checks for this plan run at end of phase: pause, resume and external start in the dev vault, and restart persistence.

## Self-Check: PASSED

- FOUND: src/model/pauseLedger.ts, src/state/PauseStore.ts, tests/pauseResume.test.ts, tests/pauseLedger.test.ts
- FOUND commits on this branch: ac969c3, f29cb70, 0754cee, c2e3d03, 537caa7
- Acceptance: `npm run check` exit 0 (271 tests); `grep -rn processFrontMatter src` empty; `src/settings.ts` unchanged; `saveData(` appears once in non-comment `src/main.ts`; pauseLedger and PauseStore import nothing from obsidian
