---
phase: 02-start-switch-complete
plan: 02
subsystem: timer-controls
tags: [stop-all, pomodoro, ownership, serialization]
requires:
  - phase: 02-01
    provides: Persistent header, shared write busy state and trimmed runtime contract
provides:
  - Sequential Stop all with exact live Pomodoro entry protection
  - Fail-closed ownership reads and live eligible timer count
  - Time and Pomodoro event refreshes with subscription cleanup
affects: [02-03, 03-pause-resume]
actuals:
  tokens: 12573
  tasks: 2
  commits: 4
plan_head_before: fc665bb67e59b6f854e11151f1ec247e4a624db8
plan_head_after: 4ee3f9d67f0f9aa00531208b1a845896decebea2
tech-stack:
  added: []
  patterns: [exact path and timestamp identity, finite sequential batch, ownership read fail closed]
key-files:
  created: [src/model/pomodoroOwnership.ts]
  modified: [src/tasknotes/TaskNotesBridge.ts, src/state/TimerController.ts, src/state/TimerStore.ts, src/ui/TimerPaneView.ts, tests/controller.test.ts, tests/store.test.ts, tests/bridge.test.ts, tests/fakes/fakeGateway.ts]
key-decisions:
  - Unreadable Pomodoro ownership disables Stop all and halts remaining batch writes.
  - Capture finite deduplicated entries and recheck exact identity and ownership before every sequential stop.
  - Keep displayed timers on transient errors while retiring write eligibility.
requirements-completed: [CTRL-06, CTRL-09]
coverage:
  - id: stop-all-batch
    description: Stop eligible captured entries sequentially while protecting exact live work ownership
    requirement: CTRL-06
    verification:
      - kind: integration
        ref: tests/controller.test.ts
        status: pass
    human_judgment: false
  - id: eligibility
    description: Refresh eligibility from ownership and time events, disable while unreadable or globally busy
    requirement: CTRL-09
    verification:
      - kind: integration
        ref: tests/store.test.ts and tests/bridge.test.ts
        status: pass
    human_judgment: false
  - id: live-stop-all
    description: Verify Stop all control and exact Pomodoro protection in Obsidian, including the external replacement race
    verification: []
    human_judgment: true
    rationale: Native button interaction and TaskNotes external actors require disposable-vault UAT.
duration: 12min
completed: 2026-10-15
status: complete
---

# Phase 02 Plan 02: Pomodoro-safe Stop all Summary

Stop all captures a finite set of regular entries and stops them sequentially, protecting the exact live Pomodoro work entry and halting when ownership cannot be verified.

## Accomplishments

- Added pure normalized path and exact start-time identity predicates. Break, completed, interrupted and inactive sessions do not own a work timer; malformed ownership never grants write permission.
- Added one queued Stop all action. It deduplicates in captured order, rereads active entries and ownership before every write, skips missing/replaced/newly owned targets, continues ordinary failures, and reports structured counts without exposing task titles, paths or exception text.
- Connected the persistent header control, live eligible count and meaningful disabled tooltips. Existing shared busy state covers Start, every card Stop, and Stop all; Complete will consume that signal in 02-03.
- Added time/Pomodoro event subscriptions with cleanup and store generation retirement, while preserving displayed timer data on transient read failures.

## Task Commits

1. Task 1 RED: `3aa658d` — captured expected regular batch behavior with an explicit no-op seam.
2. Task 1 GREEN: `dd13d36` — ownership policy, bridge read, queued batch, listener and controller regression coverage.
3. Task 2 RED: `8d696b3` — captured live eligibility behavior before store implementation.
4. Task 2 GREEN: `4ee3f9d` — eligibility, event cleanup, generation guards, header availability and serialization regressions.

## Verification

- Focused controller/store/bridge suites: 3 files, 89 tests passed.
- Final `npm run check`: TypeScript, production build, ESLint with zero warnings, 8 test files and 185 tests passed.
- `package-lock.json` unchanged; no packages installed.
- RED evidence is persisted in `02-02-task1-red.json/.xml` and `02-02-task2-red.json/.xml`. Both records passed `check tdd-red-evidence` with `RED_EVIDENCE_OK`. Semantic assessment: fixtures executed successfully and failed on the intended stopped-count / eligibility assertions. No cleanup refactor was necessary.

## Decisions Made

- Ownership failure is distinct from no owner. Both display availability and the write batch share the pure eligibility predicate.
- An active-read failure also retires write eligibility while retaining the last display, requiring one notification even when displayed timer data stays unchanged.
- No conditional public stop API exists: the final read narrows the external replacement race but cannot make the subsequent path-only write atomic.

## Deviations from Plan

- Used actual repository names `WriteQueue`, `ActiveTimeEntry` and `timeMath` rather than stale suggested `TimerWriteQueue`/`timerEntry` filenames.
- Vitest TAP diagnostics contained multiline non-TAP text rejected by the runtime evidence classifier. Reran actual failing tests with JUnit, used its fully qualified test names and validated both reports before GREEN.
- Updated the prior store error test to expect a notification when write eligibility becomes unreadable, while preserving the same displayed snapshot.
- Native disposable-vault UAT was not run in this executor. It is recorded as open WINDOWS entry 8; exact Pomodoro exclusion in the application, disabled tooltips, and the path-only external replacement race remain pending.

## Known Limitations

The public `time.stop(path)` cannot condition on an expected entry timestamp. Another actor may replace or assign an entry between the final read and the write. The pane serializes its own actions and rechecks each captured target, but does not claim to eliminate this external race.

## Self-Check: PASSED

Created policy and evidence files exist. All four task commits are ancestors of HEAD. No unexpected file deletions or new stub markers were found. The previous intentional Stop all stub is implemented; live UAT remains explicitly pending.

## Next Plan Readiness

02-03 can add Complete and its status setting using the same controller queue and busy subscriptions. No architecture or package changes were introduced.
