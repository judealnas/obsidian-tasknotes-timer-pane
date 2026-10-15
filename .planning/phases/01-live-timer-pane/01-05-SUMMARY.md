---
phase: 01-live-timer-pane
plan: 05
subsystem: write-path
tags: [write-path, stop, write-queue, tasknotes, obsidian-plugin]

requires:
  - phase: 01-live-timer-pane (01-03)
    provides: "TaskNotesBridge with lifecycle and Schedule, TimerStore.refreshNow, shared fakes (createFakeTaskNotes with failStopWith/stopCalls, makeActiveEntry with status/archived, createFakeGateway, timerSchedule)"
provides:
  - "src/state/WriteQueue.ts: WriteQueue.run(task), one serial chain for every pane write (Phase 2 start/switch reuse it)"
  - "src/state/TimerController.ts: TimerController.stop(target) -> StopOutcome ('stopped' | 'already-stopped' | 'failed'), StopTarget, TimerControllerDeps { gateway, store, queue, notify, newCorrelationId, log }"
  - "src/model/errors.ts: isNoActiveSessionError, errorMessage, stopFailedNotice"
  - "src/tasknotes/TaskNotesBridge.ts: TaskNotesGateway.stop(taskPath, context) and normalizeError(error) -> { code, message }"
  - "src/ui/TimerPaneView.ts: TimerPaneServices.controller; Stop timer button (tntp-actions, tntp-stop, tntp-stop__icon, tntp-stop__label) with Stopping… busy state"
  - "src/main.ts: one WriteQueue, Notice-backed notify, crypto.randomUUID correlation ids, one TimerController"
  - "tests/fakes/fakeGateway.ts: stopCalls, failStopWith, normalizeError"
affects: [02-control]

actuals:
  tokens: 7847     # chars/4 over the realized diff (31387 chars, 10 files)
  tasks: 1
  commits: 1
plan_head_before: 0a3bb0fee8873428030deb90c77c6f75c4ed7715
plan_head_after: a8cc5c801b142f0c0afa6d6982c0c7cfeae98480

tech-stack:
  added: []
  patterns:
    - "Every pane write runs through the one plugin-scoped WriteQueue (tail = result.then(noop, noop)), so writes never overlap across tasks"
    - "Every write carries TaskNotesMutationContext { source: MUTATION_SOURCE, reason, correlationId }"
    - "Notices are created only in main.ts; state and model code receive an injected notify(message)"
    - "Errors are classified by message for the benign race (TaskNotes throws plain Errors), and by api.errors.normalize when 'errors.typed' is present"
    - "The view captures the stop target at click time and holds a stopping flag that render() respects"

key-files:
  created:
    - src/model/errors.ts
    - src/state/WriteQueue.ts
    - src/state/TimerController.ts
    - tests/controller.test.ts
  modified:
    - src/tasknotes/TaskNotesBridge.ts
    - src/ui/TimerPaneView.ts
    - src/main.ts
    - styles.css
    - tests/fakes/fakeGateway.ts
    - tests/bridge.test.ts

key-decisions:
  - "TimerController.stop never rejects: the queued write's error is classified, notify is guarded, and store.refreshNow() (which never rejects) always runs afterwards"
  - "The bridge's log helper was renamed describeError (never empty, for console logs); the user-facing errorMessage in errors.ts returns '' for non-Error, non-string values so the Notice falls back to 'TaskNotes reported an error'"
  - "normalizeError keeps TaskNotes' code and message from api.errors.normalize, and logs and falls back to errorMessage when normalize throws or the api is detached"
  - "The 01-05 human-check is harvested into the end-of-phase UAT (checklist sections 6 Stop and 7 Archive flag and completion), recorded as WINDOWS.md entry 3"

patterns-established:
  - "Write path: view click -> TimerController -> WriteQueue.run -> gateway.stop -> api.time.stop -> store.refreshNow(). Phase 2's start, pause and switch follow the same shape"
  - "D-05 gate: gateway.stop( appears only in TimerController, time.stop( only in TaskNotesBridge, and src/ reads no TaskNotes settings and no archive flag"

requirements-completed: [CTRL-01]

coverage:
  - id: D1
    description: "Stop of the displayed timer end to end through the real bridge, store, queue and controller: exactly one api.time.stop with source 'tasknotes-timer-pane', reason 'user stop' and a correlationId; pane goes idle, or the other running timer becomes primary and is not stopped"
    requirement: "CTRL-01"
    verification:
      - kind: integration
        ref: "tests/controller.test.ts#Stop (CTRL-01) > one open entry: exactly one api.time.stop with the mutation context, then idle"
        status: pass
      - kind: integration
        ref: "tests/controller.test.ts#Stop (CTRL-01) > two open entries: stopping the primary leaves the other as the new primary, unstopped"
        status: pass
    human_judgment: false
  - id: D2
    description: "Failure handling: the 'no active session' race returns already-stopped with no Notice and a refresh; any other error (including task not found and an empty message) shows the exact Stop-failed Notice once, then refreshes"
    requirement: "CTRL-01"
    verification:
      - kind: integration
        ref: "tests/controller.test.ts#Stop (CTRL-01) > a 'no active session' race is silent and still refreshes"
        status: pass
      - kind: integration
        ref: "tests/controller.test.ts#Stop (CTRL-01) > any other failure shows the Stop-failed Notice exactly once"
        status: pass
      - kind: integration
        ref: "tests/controller.test.ts#Stop (CTRL-01) > an empty failure message uses 'TaskNotes reported an error'"
        status: pass
      - kind: integration
        ref: "tests/controller.test.ts#Stop (CTRL-01) > 'Task not found' notifies, then refreshes"
        status: pass
      - kind: unit
        ref: "tests/controller.test.ts#stopFailedNotice copy"
        status: pass
    human_judgment: false
  - id: D3
    description: "WriteQueue runs tasks strictly in order and a rejection does not break the chain"
    verification:
      - kind: unit
        ref: "tests/controller.test.ts#WriteQueue > runs strictly in order; a rejection does not break the chain"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-05: done-status and archive-flag timers are shown normally across refreshes and data hints with zero stop calls; an archive-flag primary stops with one click like any other timer"
    verification:
      - kind: integration
        ref: "tests/controller.test.ts#no automatic stops (D-05)"
        status: pass
      - kind: other
        ref: "grep gates: autoStop|settings.snapshot|model.config|.archived empty in src; gateway.stop( only in TimerController.ts; time.stop( once in TaskNotesBridge.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Bridge write facade: stop forwards the context and rejects when not ready; normalizeError uses api.errors.normalize with 'errors.typed' and falls back otherwise"
    requirement: "CTRL-01"
    verification:
      - kind: unit
        ref: "tests/bridge.test.ts#write facade (CTRL-01)"
        status: pass
    human_judgment: false
  - id: D6
    description: "In Obsidian: Stop shows 'Stopping…', stops only the displayed timer while a second runs, and the status bar agrees; the race shows no Notice; a simulated failure shows the exact Notice and re-enables the button; the archive-flag timer stops with one click and looks like any other; TaskNotes' own completion auto-stop is followed within about 1 s, and a YAML-edited done task keeps running"
    requirement: "CTRL-01"
    verification: []
    human_judgment: true
    rationale: "Notices, the busy button, TaskNotes' status bar and its auto-stop-on-complete setting only exist inside the running app; harvested into 01-UAT-CHECKLIST.md sections 6 (Stop) and 7 (Archive flag and completion), D-13"
  - id: D7
    description: "D-14 gate green and no dependency drift"
    verification:
      - kind: other
        ref: "npm run check"
        status: pass
      - kind: other
        ref: "git diff --quiet package-lock.json"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-10-15
status: complete
---

# Phase 01 Plan 05: Stop Write Path Summary

**One click on "Stop timer" now stops exactly the displayed timer.** The click goes through `TimerController`, then the shared serial `WriteQueue`, then TaskNotes' own `api.time.stop`, carrying the mutation context `{ source: "tasknotes-timer-pane", reason: "user stop", correlationId }`. The button reads "Stopping…" while busy. A no-active-session race stays silent; any other failure shows the UI-SPEC Notice once. The pane then re-derives its state from TaskNotes. The pane never stops a timer on its own (D-05).

## Performance

- **Duration:** about 4 min (execution; context reading before that)
- **Started:** 2026-10-15T02:42:38Z
- **Completed:** 2026-10-15T02:46:18Z
- **Tasks:** 1 (tracer)
- **Files:** 4 created, 6 modified

## Accomplishments

- **`errors.ts`:**
  - `isNoActiveSessionError` matches `/no active time tracking session/i`.
  - `errorMessage` returns an Error's message, a string as-is, and "" for anything else.
  - `stopFailedNotice` builds the exact UI-SPEC copy. It trims the reason and drops trailing periods, and falls back to "TaskNotes reported an error" when nothing is left.
- **`WriteQueue`:** `run(task)` chains each task onto a private tail that never rejects. Each caller gets its own task's result or rejection.
- **Bridge:**
  - `stop(taskPath, context)` rejects with "TaskNotes is not connected" unless an api is attached and the state is ready. Otherwise it awaits `api.time.stop(taskPath, context)`.
  - `normalizeError` uses `api.errors.normalize` when the api has "errors.typed". It falls back to `{ code: null, message: errorMessage(e) }` when the capability is missing, when no api is attached, or when normalize throws (that case is logged).
- **`TimerController.stop(target)`:**
  - Queues `gateway.stop` for the target's path only.
  - Classifies a failure through `normalizeError`: "already-stopped" with no Notice for the race, or "failed" with a log line and one Notice. `task_not_found` counts as failed.
  - Always awaits `store.refreshNow()` afterwards. It never rejects.
- **View:**
  - `div.tntp-actions` is the last child of the card. It holds a native `button.mod-cta.tntp-stop`, which contains a `square` icon and the label "Stop timer".
  - On click it captures `{ taskPath, startTime, title }`, disables the button and shows "Stopping…".
  - A `finally` block restores the button, then calls `render()`. `render()` never overwrites the busy state.
  - There is no confirmation step.
- **`main.ts`:** It creates one `WriteQueue`, a `notify` that creates a `Notice` (the only `new Notice` in `src/`), and `crypto.randomUUID` ids. It constructs one `TimerController` and passes it to the view services.
- **`styles.css`:** `.tntp-actions` gets a `--size-4-4` top margin and `.tntp-stop` gets `width: 100%`. The `mod-cta` styling stays Obsidian's own.
- **Tests:** 102 in total, up from 88.
  - `tests/controller.test.ts`: 10 tests, 213 lines.
  - `tests/bridge.test.ts`: 4 new write-facade tests, 29 in total.

## Task Commits

1. **Task 1 (tracer): Stop path end to end:** `a8cc5c8` (feat)

**Tracer gate:**
- This is not auto mode, and `human_verify_mode` is end-of-phase.
- The tracer's `<human-check>` is explicitly assigned to the end-of-phase UAT (D-13), as in 01-01. Its sections are 6 "Stop" and 7 "Archive flag and completion" of `01-UAT-CHECKLIST.md`.
- The automated `<verify>` was re-run after the commit and passed: `npx vitest run --dir tests controller` (10/10) and `npm run check` (exit 0).
- The plan has no expansion tasks, so no checkpoint was synthesized. The unrun in-Obsidian check is recorded in `.planning/WINDOWS.md` as entry 3 (unrun-verify).

## Files Created/Modified

- `src/model/errors.ts`: error classification and the Stop-failed Notice copy
- `src/state/WriteQueue.ts`: the serial write queue
- `src/state/TimerController.ts`: manual Stop with benign-race and failure handling
- `src/tasknotes/TaskNotesBridge.ts`: `stop`, `normalizeError`, and the `describeError` log helper
- `src/ui/TimerPaneView.ts`: the Stop button and its busy state
- `src/main.ts`: queue, notify, correlation ids and controller wiring
- `styles.css`: `.tntp-actions`, `.tntp-stop`
- `tests/fakes/fakeGateway.ts`: `stop`, `stopCalls`, `failStopWith`, `normalizeError`
- `tests/controller.test.ts`: the tracer suite
- `tests/bridge.test.ts`: the write-facade tests

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] A Notice failure cannot reject the Stop**
- **Found during:** Task 1
- **Issue:** The view awaits `controller.stop()` inside `void this.stopPrimary()`. If `notify` threw, the controller would skip the refresh and the promise would reject unhandled.
- **Fix:** `notify` is wrapped in try/catch and the error is logged. The refresh always runs.
- **Files modified:** `src/state/TimerController.ts`
- **Commit:** `a8cc5c8`

**2. [Rule 1 - Naming] Two different `errorMessage` helpers**
- **Found during:** Task 1
- **Issue:** The bridge already had a private `errorMessage` that returns `String(error)` for console logs. The plan's `errorMessage` in `errors.ts` returns "" for non-Error, non-string values.
- **Fix:** The bridge's private helper was renamed `describeError`. The bridge imports the plan's `errorMessage` for `normalizeError`'s fallback. Log text is unchanged.
- **Files modified:** `src/tasknotes/TaskNotesBridge.ts`
- **Commit:** `a8cc5c8`

---

**Total deviations:** 2 auto-fixed (1 missing-critical, 1 naming)
**Impact on plan:** None on scope. Every interface name matches the plan's Interfaces block, and `package-lock.json` is unchanged.

## Issues Encountered

- `<fails_when>` for `npx vitest run --dir tests controller` requires the output to contain "controller.test.ts". Vitest 5's default reporter, when not on a TTY, prints only the totals ("Test Files 1 passed (1)", "Tests 10 passed (10)") and not the file name. With `--reporter=verbose`, every case is listed under `tests/controller.test.ts`, and all 10 passed. The tests are fine; the check's string match depends on which reporter runs.

## Known Stubs

None.

## Threat Flags

None. The only new trust-boundary surface is `api.time.stop`, which is T-01-10 in the plan's threat model. Its mitigations are in place:
- **T-01-10:** a negative grep confirms the pane has no direct write path.
- **T-01-13:** every write carries the mutation context.
- **T-01-14:** the stop target is captured at click time, and only `TimerController` calls `gateway.stop`.
- **T-01-SC:** no packages were installed.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- All five plans in Phase 1 have summaries. The phase is ready for verification, and its human checks are in `01-UAT-CHECKLIST.md`:
  - sections 0 to 5 (from 01-01 to 01-04)
  - sections 6 and 7 (this plan)
- Phase 2 can reuse the existing pieces:
  - the plugin's single `WriteQueue`
  - `TimerController` (add `start`, `pause` and `switchTo` beside `stop`)
  - `MUTATION_SOURCE`
  - `errors.ts`
  - the `failStopWith` and `stopCalls` controls on both fakes
- The open Phase 2 decision is unchanged: should "stop all" on switch include timers owned by Pomodoro?

## Self-Check: PASSED

- All 10 key files exist on disk.
- Commit `a8cc5c8` is an ancestor of HEAD.
- Every acceptance criterion was re-run and passed:
  - the `"user stop"`, `MUTATION_SOURCE` and `queue.run(` greps
  - the Notice copy and fallback-reason greps
  - the `Stopping…`, `Stop timer`, `mod-cta` and `"square"` greps
  - no `new Notice` outside `main.ts`
  - no runtime `obsidian` imports in `src/state` or `src/model`
  - no direct frontmatter or time-entry writes
  - the D-05 greps: nothing for `autoStop`, settings or `archived`; `gateway.stop(` only in `TimerController.ts`; `time.stop(` exactly once, in `TaskNotesBridge.ts`
  - no `ArchiveAutoStopper` file and no `autoStop` test file
- The plan-level verification passed:
  - `npm run check`
  - the `controller` suite (10/10) and the `bridge` suite (29/29)
  - `git diff --quiet package-lock.json`

---
*Phase: 01-live-timer-pane*
*Completed: 2026-10-15*
