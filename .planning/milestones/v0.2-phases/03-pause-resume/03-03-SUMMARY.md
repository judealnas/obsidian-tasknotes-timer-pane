---
phase: 03-pause-resume
plan: 03
subsystem: state
status: complete
tags: [pause, resume, pause-all, resume-all, stop-all, header, pomodoro, tasknotes-runtime-api, vitest]

requires:
  - phase: 03-pause-resume
    provides: "03-01 TimerController.pause/resume, PauseStore, pausedFromStop, OpenTimer.state; 03-02 reconcile rules 1-5"
  - phase: 02-start-switch-complete
    provides: "stopAll, selectRegularStopTargets, getStopAllState, complete's still-open check"
provides:
  - "TimerController.stopPaused(target): cleared | not-paused | busy, with no TaskNotes write"
  - "TimerController.pauseAll() / resumeAll(): one queued batch each, one write at a time, count-only Notices"
  - "stopAll outcome gains `cleared`; Stop all removes every paused record unless ownership was unreadable"
  - "complete() removes a paused record after the status write"
  - "TimerStore.getHeaderState(): { readable, eligibleCount, pausedCount }"
  - "Header: Start task, Pause all, Resume all, Stop all; paused cards show Resume, Stop and Complete"
affects: [03-04]

actuals:
  tokens: 11083
  tasks: 2
  commits: 4
plan_head_before: 3fb94a8864af6f910c3a8bb103e25f3cb0b46bfc
plan_head_after: 91febe33b78ccda781720ac562997acb2a958486

tech-stack:
  added: []
  patterns:
    - "Batch actions copy stopAll's structure: busy(1), one queue.run, fresh active and ownership reads before every write, refresh in finally"
    - "Per-card and batch flows share private in-queue bodies (pauseInQueue, resumeInQueue) that never call queue.run"

key-files:
  created: []
  modified:
    - src/state/TimerController.ts
    - src/state/TimerStore.ts
    - src/ui/TimerPaneView.ts
    - styles.css
    - tests/pauseResume.test.ts

key-decisions:
  - "pauseInQueue does only the stop, the record write and the pending bookkeeping; target checks stay with the caller (pause checks the entry and owner, pauseAll uses the fresh eligible list)"
  - "Pause all shows no Notice for skipped targets: the Pomodoro owner is never a target (same as Stop all), so only failures and an unreadable-ownership halt get a Notice"
  - "Resume all counts a record that stopped being paused before its turn as skipped"
  - "Stop all with only paused records still requires readable ownership (the button is disabled otherwise), matching the plan's disabled rule"

patterns-established:
  - "Header enablement reads only getHeaderState(); getStopAllState stays for its existing tests"

requirements-completed: [CTRL-02, CTRL-03, CTRL-04]

coverage:
  - id: D1
    description: "Stop on a paused card clears the pause with no TaskNotes write"
    requirement: CTRL-04
    verification:
      - kind: test
        ref: "tests/pauseResume.test.ts#Stop on a paused card clears the pause and the card with no TaskNotes write"
        status: pass
      - kind: test
        ref: "tests/pauseResume.test.ts#Stop on a paused card that was started elsewhere meanwhile is not-paused and keeps the record"
        status: pass
    human_judgment: false
  - id: D2
    description: "Complete on a paused card writes the status once, makes no stop call, then clears the pause; a failed write keeps it"
    requirement: CTRL-04
    verification:
      - kind: test
        ref: "tests/pauseResume.test.ts#Complete on a paused card writes the completed status once, stops nothing and clears the pause"
        status: pass
      - kind: test
        ref: "tests/pauseResume.test.ts#Complete on a paused card whose status write fails keeps the pause and shows the complete notice"
        status: pass
    human_judgment: false
  - id: D3
    description: "Stop all stops eligible timers then clears every paused record; keeps them when halted on unreadable ownership"
    requirement: CTRL-04
    verification:
      - kind: test
        ref: "tests/pauseResume.test.ts#Stop all clears pauses (D-10, CTRL-04)"
        status: pass
      - kind: test
        ref: "tests/controller.test.ts#Stop all"
        status: pass
    human_judgment: false
  - id: D4
    description: "Pause all: ordered, deduplicated, re-checked before every write, halts on unreadable ownership, count-only Notices"
    requirement: CTRL-02
    verification:
      - kind: test
        ref: "tests/pauseResume.test.ts#Pause all (CTRL-02, D-04, D-05)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Resume all: display order, skips Pomodoro-owned and already-open tasks, count-only Notices"
    requirement: CTRL-03
    verification:
      - kind: test
        ref: "tests/pauseResume.test.ts#Resume all (CTRL-03, D-05)"
        status: pass
      - kind: test
        ref: "tests/pauseResume.test.ts#Batches hold the write queue (D-05)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Header buttons, disabled tooltips and wrapping in a narrow sidebar; paused-card button layout"
    requirement: CTRL-02
    human_judgment: true
    rationale: "DOM rendering is not unit-tested; tooltips, layout and wrap need the end-of-phase human check in Obsidian"

duration: 8 min
completed: 2026-10-16
---

# Phase 3 Plan 03: Header Pause all / Resume all and Paused-Card Stop and Complete Summary

**Pause all and Resume all run as single queued, Pomodoro-safe batches that write one entry at a time. Stop and Complete now work on paused cards with no stray TaskNotes write, and Stop all leaves the pane empty by clearing every pause.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-16T07:29:56Z
- **Completed:** 2026-10-16T07:38:13Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `stopPaused` removes a paused record inside the write queue and never calls TaskNotes. It returns "not-paused" when an external start already turned the record into a running one.
- `complete` removes the pause right after the status write. The card's `startTime` is the closed entry, so the still-open check makes no stop call.
- `stopAll` keeps the Phase 2 loop unchanged, then clears every paused record with a single `applyReconcile` and reports the number as `cleared`. Paused records are kept when the batch halted on unreadable ownership. Running records are left for reconcile rule 3.
- `pauseAll` follows `stopAll` line for line (captured `selectRegularStopTargets`, fresh active and ownership reads before each target, halt on unreadable) and pauses each target through the shared `pauseInQueue`.
- `resumeAll` resumes paused records in display order through the shared `resumeInQueue` and counts resumed, skipped, pomodoro and failed.
- `getHeaderState` adds `pausedCount`. The header shows Start task, Pause all, Resume all and Stop all, each with a disabled tooltip. Paused cards now show Resume (primary), Stop and Complete.

## Task Commits

1. **Task 1: Stop and Complete on a paused card, and Stop all clears pauses**
   - RED `6436305` (test)
   - GREEN `928c872` (feat)
2. **Task 2: Pause all and Resume all in the header**
   - RED `527c167` (test)
   - GREEN `91febe3` (feat)

## Files Created/Modified

- `src/state/TimerController.ts`: adds `stopPaused`, `pauseAll`, `resumeAll` and the private `pauseInQueue`/`resumeInQueue`; `stopAll` gains `cleared`; `complete` clears a pause.
- `src/state/TimerStore.ts`: `getHeaderState()` and `pausedCount`, set and reset in the same places as `eligibleCount`.
- `src/ui/TimerPaneView.ts`: Pause all and Resume all buttons, header state from `getHeaderState()`, Stop on a paused card calls `stopPaused`.
- `styles.css`: drops the 03-01 rule that hid Stop and Complete on paused cards.
- `tests/pauseResume.test.ts`: 23 new named tests covering every behavior bullet, including call-order and edge predicates.

## TDD Gate Compliance

- Task 1 RED (`6436305`): 7 of 9 new tests failed. The two Complete-on-paused tests passed at RED because 03-02's reconcile rule 4 already removes a paused record once its status is completed. They still pin the required outcome (one complete call, no stop call, pause gone), and the explicit removal now does this inside the queue instead of waiting for the next refresh.
- Task 2 RED (`527c167`): all 14 new tests failed (`pauseAll`/`resumeAll` were missing).
- GREEN commits pass `npm run check` (build, lint with 0 warnings, 337 tests).

## Decisions Made

See `key-decisions` in the frontmatter. In short:
- The shared in-queue bodies carry only the write and its bookkeeping. Each caller checks its own target.
- Pause all shows a Notice only on failure or an unreadable-ownership halt. Resume all shows one on failure, or when it skipped a task for Pomodoro.

## Deviations from Plan

None. The plan was executed as written. One lint fix in the Task 2 test helper (a `!` assertion ESLint reported as unnecessary) was made before the GREEN commit.

## Issues Encountered

- A long Python heredoc failed in the Bash tool (an unmatched-quote parse error), so nothing was written. The edits were redone with the Edit tool. No file was corrupted: there are no NUL bytes, and `git diff --stat` shows no binary files.

## Known Stubs

None. The WINDOWS.md stub #10 (paused cards hid Stop and Complete) is marked fixed.

## User Setup Required

None.

## Next Phase Readiness

- Ready for 03-04. The human checks for this plan (paused-card Stop and Complete in the dev vault, Stop all emptying the pane, Pause all and Resume all over three tasks, tooltips and the four-button wrap) are deferred to end of phase and logged in WINDOWS.md as unrun-verify.

## Self-Check: PASSED

- Files: src/state/TimerController.ts, src/state/TimerStore.ts, src/ui/TimerPaneView.ts, styles.css and tests/pauseResume.test.ts are all FOUND.
- Commits: 6436305, 928c872, 527c167 and 91febe3 are all FOUND on HEAD.
- Acceptance: `grep -c getHeaderState src/ui/TimerPaneView.ts` = 1; `grep -c pauseInQueue src/state/TimerController.ts` = 3; the Phase 2 controller tests and the store `getStopAllState` tests pass unedited; `npm run check` exits 0.
