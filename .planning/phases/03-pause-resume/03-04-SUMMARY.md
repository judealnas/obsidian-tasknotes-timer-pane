---
phase: 03-pause-resume
plan: 04
subsystem: state
status: complete
tags: [pomodoro, ownership, picker, display-filter, tasknotes-runtime-api, vitest]

requires:
  - phase: 03-pause-resume
    provides: "03-01/03-02 reconcile and PauseStore in TimerStore.refreshOnce; 03-03 getHeaderState and header buttons"
  - phase: 02-start-switch-complete
    provides: "getPomodoroOwnedEntryId, sameEntry, normalizeTimerPath, selectRegularStopTargets, TimerController.start, TaskPickerModal"
provides:
  - "TimerStore derives cards from active() minus the exact readable Pomodoro-owned entry; reconcile still receives every entry"
  - "Muted 'Can't check Pomodoro. Showing all timers.' line (tntp-pomodoro-note) shown via root class tntp-pane--pomodoro-unknown while ready and unreadable"
  - "TaskPickerModal reads ownership once per opening and tags the owner's row with a muted 'Pomodoro' span (tntp-picker-pomodoro)"
  - "StartOutcome gains 'pomodoro'; start() re-reads ownership inside queue.run and shows '{title} is being timed by Pomodoro.'"
affects: [phase-03-verification]

actuals:
  tokens: 6800
  tasks: 2
  commits: 4
plan_head_before: fd8fd7425c5f22dd25dfc0d6c258f2e668827cec
plan_head_after: 023a5a52fb37aa31f96caaf73f2263641cc9700a

tech-stack:
  added: []
  patterns:
    - "Display filters live in the store after reconcile: reconcile sees raw TaskNotes data, deriveSnapshot sees the visible list"
    - "Informational reads in a modal ride the same Promise.all with their own catch so they can never close it"

key-files:
  created: []
  modified:
    - src/state/TimerStore.ts
    - src/ui/TimerPaneView.ts
    - styles.css
    - src/ui/TaskPickerModal.ts
    - src/state/TimerController.ts
    - tests/store.test.ts
    - tests/taskPickerModal.test.ts
    - tests/controller.test.ts

key-decisions:
  - "visibleEntries hides an entry only on sameEntry against a readable, non-null owner; malformed items (no string path or startTime) are kept"
  - "The picker resets pomodoroPath on close, so a discarded late read can never tag a row in a later opening"
  - "The start guard compares normalized paths and runs before the Phase 2 already-running check; unreadable ownership falls through to Phase 2 behavior"
  - "Paused Pomodoro (isRunning false) owns no entry, so its task is neither tagged nor blocked (Open Question 1 resolved as no-change)"

patterns-established:
  - "D-15 visibility uses a root modifier class plus a :not() CSS rule, like the existing pane-state classes"

requirements-completed: [DISP-07]

coverage:
  - id: D1
    description: "The Pomodoro-owned entry is hidden from cards and counts; same-path/other-start and other-path/same-start entries stay (adjacency)"
    requirement: DISP-07
    verification:
      - kind: unit
        ref: "tests/store.test.ts#a readable owner hides only its exact entry (adjacency): same path at another start and another path at the same start stay"
        status: pass
      - kind: unit
        ref: "tests/store.test.ts#a readable owner path written differently (backslashes, dot segments) still hides the entry"
        status: pass
    human_judgment: false
  - id: D2
    description: "Empty predicates: owner null hides nothing; only the owned entry gives an idle pane with eligibleCount 0; zero entries with unreadable ownership is idle and unreadable"
    requirement: DISP-07
    verification:
      - kind: unit
        ref: "tests/store.test.ts#no active Pomodoro (owner null, empty predicate): every active entry is a card"
        status: pass
      - kind: unit
        ref: "tests/store.test.ts#only the owned entry active (empty predicate): no cards, pane idle, eligibleCount 0"
        status: pass
      - kind: unit
        ref: "tests/store.test.ts#zero active entries with unreadable ownership (empty predicate): idle and unreadable"
        status: pass
    human_judgment: false
  - id: D3
    description: "Unreadable or rejected ownership shows every timer and reports unreadable to the header"
    requirement: DISP-07
    verification:
      - kind: unit
        ref: "tests/store.test.ts#unreadable ownership: every active entry is a card and the header reports unreadable"
        status: pass
      - kind: unit
        ref: "tests/store.test.ts#a rejected ownership read is unreadable and hides nothing"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ordering predicate and change detection: remaining cards keep D-06 order and sessionKeys; an owner change notifies"
    requirement: DISP-07
    verification:
      - kind: unit
        ref: "tests/store.test.ts#hiding the owned middle card keeps the others in D-06 order with unchanged sessionKeys (ordering predicate)"
        status: pass
      - kind: unit
        ref: "tests/store.test.ts#the owner changing with identical active entries still notifies"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-16: reconcile still sees the owned entry, so a Pomodoro taking over a paused task removes the paused card and hides the Pomodoro entry"
    requirement: DISP-07
    verification:
      - kind: unit
        ref: "tests/store.test.ts#reconcile still sees the owned entry: a paused record on the owner's task is cleared in the same refresh that hides it (D-16)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Muted can't-check Pomodoro line under the header, shown only while TaskNotes is ready and ownership is unreadable"
    requirement: DISP-07
    verification:
      - kind: other
        ref: "npm run check (tsc, esbuild, eslint --max-warnings 0, vitest)"
        status: pass
    human_judgment: true
    rationale: "No view-rendering tests exist; the line's visibility and styling in a live pane need a human check in the dev vault"
  - id: D7
    description: "Picker tags the Pomodoro's task row; unreadable/rejected reads tag nothing and keep the picker open; one read per opening; late read discarded"
    requirement: DISP-07
    verification:
      - kind: unit
        ref: "tests/taskPickerModal.test.ts#a readable owner on Task.md tags only that row with a muted Pomodoro span"
        status: pass
      - kind: unit
        ref: "tests/taskPickerModal.test.ts#%s ownership tags no row and the task list still loads"
        status: pass
      - kind: unit
        ref: "tests/taskPickerModal.test.ts#ownership is read once per opening, together with the task list"
        status: pass
      - kind: unit
        ref: "tests/taskPickerModal.test.ts#a close before the ownership read resolves discards it"
        status: pass
    human_judgment: false
  - id: D8
    description: "start() on the Pomodoro's task writes nothing and shows the D-17 Notice; ended, paused, other-task and unreadable cases proceed per plan"
    requirement: DISP-07
    verification:
      - kind: unit
        ref: "tests/controller.test.ts#start on the Pomodoro's task writes nothing and explains, before the already-running check"
        status: pass
      - kind: unit
        ref: "tests/controller.test.ts#the Pomodoro ending between picker open and choice lets the start proceed"
        status: pass
      - kind: unit
        ref: "tests/controller.test.ts#ownership unreadable inside the queue falls back to the Phase 2 already-running check"
        status: pass
      - kind: unit
        ref: "tests/controller.test.ts#a paused Pomodoro owns no entry, so its task can be started (Open Question 1)"
        status: pass
    human_judgment: false
  - id: D9
    description: "Live Pomodoro behavior in the dev vault (hidden entry, Pause all/Stop all leave it running, picker tag and Notice)"
    requirement: DISP-07
    verification: []
    human_judgment: true
    rationale: "Requires a real TaskNotes Pomodoro session; deferred to the end-of-phase human checks (WINDOWS.md unrun-verify entries)"

duration: 8min
completed: 2026-10-16
---

# Phase 3 Plan 04: Pomodoro-owned timer hiding and picker guard Summary

**Store-level filter hides only the exact entry a readable Pomodoro owns (reconcile still sees it), a muted "Can't check Pomodoro. Showing all timers." line covers the unreadable case, and the Start picker tags the Pomodoro's task while start() re-checks ownership inside the write queue and refuses with "{title} is being timed by Pomodoro."**

## Performance

- **Duration:** about 8 min
- **Started:** 2026-10-16T07:38:30Z
- **Completed:** 2026-10-16T07:46:03Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- `visibleEntries(active, ownership)` in `TimerStore` removes only the `sameEntry` match against a readable, non-null owner; `reconcile` and `selectRegularStopTargets` still get the unfiltered list, and ownership stays in the signature.
- `TimerPaneView` has a `tntp-label tntp-pomodoro-note` line between the header and the cards. The root class `tntp-pane--pomodoro-unknown` turns it on only while the bridge is ready and `getHeaderState().readable` is false. The CSS hides the line otherwise.
- `TaskPickerModal` reads `pomodoroOwnership()` in the same `Promise.all` as the task list and statuses, with its own catch. It stores the normalized owner path under the opening guard and adds a muted `Pomodoro` span to that row.
- `TimerController.start` gets a `"pomodoro"` outcome, checked inside `queue.run` before the already-running check, followed by the D-17 Notice.

## Task Commits

1. **Task 1: Hide the Pomodoro-owned entry and show the "can't check" line**: `b21a2cb` (test, RED), `e357320` (feat, GREEN)
2. **Task 2: Mark the Pomodoro's task in the picker and refuse to start it**: `4549de6` (test, RED), `023a5a5` (feat, GREEN)

## TDD Gate Compliance

- Task 1 RED `b21a2cb`: 5 of the new store tests failed before the change (adjacency, path normalization, owned-only, D-16, ordering). The other new cases already held, because they lock in existing behavior (owner null, unreadable, rejected, owner-change notify). GREEN `e357320`: all pass.
- Task 2 RED `4549de6`: 5 tests failed (picker tag, single read, discarded late read, controller pomodoro outcome, normalized owner path). GREEN `023a5a5`: all pass.
- No REFACTOR commits were needed.

## Files Created/Modified
- `src/state/TimerStore.ts`: `visibleEntries` filter before `deriveSnapshot`
- `src/ui/TimerPaneView.ts`: `pomodoroNote` element and the `tntp-pane--pomodoro-unknown` toggle
- `styles.css`: visibility rule for `.tntp-pomodoro-note`, plus the `.tntp-pomodoro-note` and `.tntp-picker-pomodoro` styles
- `src/ui/TaskPickerModal.ts`: ownership read at open, `pomodoroPath`, row tag, reset on close
- `src/state/TimerController.ts`: `StartOutcome` "pomodoro", the in-queue guard and the Notice
- `tests/store.test.ts`, `tests/taskPickerModal.test.ts`, `tests/controller.test.ts`: new cases (10 store, 7 picker, 7 controller)

## Decisions Made
- Malformed active items (no string path or startTime) are never hidden. Only an exact readable match hides anything (T-03-15).
- `pomodoroPath` is reset in `onClose`, so a late read from a closed opening can never tag a row in the next one.
- The start guard matches on normalized paths. The existing Phase 2 already-running check keeps its raw-path comparison (unchanged).
- Open Question 1 is resolved as no-change: a paused Pomodoro owns no entry, so its task can be started.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Shell heredoc collapsed backslashes in a store test**
- **Found during:** Task 1 (GREEN run)
- **Issue:** The path-normalization test's owner path `"TaskNotes\\Tasks\\./A.md"` was written as `"TaskNotes\Tasks\./A.md"`. In JS that is `TaskNotesTasks./A.md`, so the test could not pass. This is the hazard the orchestrator warned about.
- **Fix:** Corrected the literal with the Edit tool.
- **Files modified:** tests/store.test.ts
- **Verification:** The test passes; `git diff --stat` shows text, not binary.
- **Committed in:** e357320

**2. [Rule 3 - Blocking] ESLint no-unsafe-return on the `Array.isArray` guard**
- **Found during:** Task 1 (`npm run check`)
- **Issue:** `Array.isArray(active)` narrowed the readonly array to `any[]`.
- **Fix:** Ran the guard on a typed alias instead.
- **Files modified:** src/state/TimerStore.ts
- **Committed in:** e357320

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** No change to scope.

## Issues Encountered
None.

## Known Stubs
None.

## User Setup Required
None.

## Next Phase Readiness
- This was the last plan in Phase 3. The end-of-phase human checks are still open in WINDOWS.md, including a live Pomodoro session (the STATE.md Phase 3 concern). If TaskNotes lacks `pomodoro.read`, the can't-check line stays on permanently, and verification should call that out.

## Self-Check: PASSED
- All 8 modified files exist. Commits b21a2cb, e357320, 4549de6 and 023a5a5 are ancestors of HEAD.
- `npm run check` exits 0 (13 files, 361 tests). `npx vitest run --dir tests store pauseResume readPath` and `npx vitest run --dir tests taskPicker controller` pass.
- `grep -n "style=" src/ui/TimerPaneView.ts` prints nothing. The exact line text and the Notice text are present.

---
*Phase: 03-pause-resume*
*Completed: 2026-10-16*
