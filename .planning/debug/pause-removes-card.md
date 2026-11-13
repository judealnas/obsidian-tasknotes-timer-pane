---
status: diagnosed
trigger: "Phase 4 UAT test 6: Pausing a timer removes the card, making resuming impossible. It seems to have the same behavior as clicking stop or complete."
created: 2026-11-13
updated: 2026-11-13
goal: find_root_cause_only
---

## Current Focus

bug_class: Bohrbug (deterministic, data-triggered)
hypothesis: CONFIRMED. The paused task ("Write quarterly report") already had status "done" (a completed-type status, completedDate 2026-10-16). Reconcile rule 4 (D-12 "completed elsewhere") deletes any paused record whose task has a completed-type status, so the record is dropped on the refresh right after the pause and the card disappears. The rule cannot tell "completed while paused" from "was already completed when paused". This behavior is from v0.2 (Phase 3), not a Phase 4 regression.
test: done (differential unit repro: same pause on status open vs done)
expecting: n/a
next_action: return ROOT CAUSE FOUND to the orchestrator; a gap-closure plan decides the fix

reasoning_checkpoint:
  hypothesis: "Pausing removes the card because reconcile rule 4 deletes a paused record whose task status is completed-type, and the UAT task was already status done before the pause"
  confirming_evidence:
    - "Dev vault 'Write quarterly report.md' has status: done, completedDate: 2026-10-16; TaskNotes catalog marks done isCompleted: true"
    - "Its timeEntries show the pause and two retries (closed at 17:18:47, 17:19:00, 17:19:11 UTC), matching data.json saved 12:19 with pauseRecords []"
    - "Differential repro through real bridge/store/controller/PauseStore over the fake TaskNotes: status open -> paused, 1 record, card paused; status done -> paused, 0 records, no card"
    - "git diff v0.2 HEAD over src/state, src/model/pauseLedger.ts, src/model/timeMath.ts, src/ui/TimerPaneView.ts, TaskPickerModal.ts, taskPicker.ts is empty"
  falsification_test: "Pausing a timer on a task with a non-completed status (e.g. 'Clean up old project archive', status open) in the dev vault would also lose its card"
  fix_rationale: "Not applying (diagnose only). Root cause is the rule's trigger condition, not persistence."
  blind_spots: "Did not re-run the pause live in the dev vault via Obsidian CLI on an open-status task; relying on unit differential plus file evidence. Did not run the repro against a v0.2 checkout, but the pause-path source is byte-identical."
  candidate_causes:
    - "code: Phase 4 persistAll/savePatch dropping pauseRecords (eliminated)"
    - "data: task already has completed-type status (confirmed)"
    - "environment: Pomodoro ownership rule 1 / file-missing rule 5 / TaskNotes 4.18.2 echo (eliminated or not needed)"
  and_gate: "yes, two conditions: (1) rule 4 has no 'completed after pause' guard (code, v0.2), AND (2) the picker lets a timer run/start on a completed task and the dev-vault seed task was left 'done' by v0.2 UAT (data)"

## Symptoms

expected: Start, pause, resume, stop timer in pane; paused card stays visible as paused and can be resumed (same as v0.2)
actual: Pausing a timer removes the card, making resuming impossible; looks like stop/complete
errors: none reported
reproduction: Test 6 in .planning/phases/04-staging-foundations/04-UAT.md
started: discovered during Phase 4 UAT on 2026-11-13 (dev vault previously ran stale Oct 27 build)

## Eliminated

- hypothesis: Phase 4 persistence change (OWNED_KEYS rolloverHour, persistAll, savePatch) drops or overwrites pauseRecords
  evidence: persistAll always writes this.pauses.serialize(); savePatch only changes settings. data.json pauseRecords [] reflects the in-memory PauseStore being empty (applyReconcile), not a lost write. Repro without any settings change reproduces the loss for a done task.
  timestamp: 2026-11-13

- hypothesis: Phase 4 changed the pause path (controller, store, ledger, view)
  evidence: git diff v0.2 HEAD over src/state, src/model/pauseLedger.ts, src/model/timeMath.ts, src/ui/TimerPaneView.ts is empty. Bridge diff is additive only (userFields, staging/recurring methods).
  timestamp: 2026-11-13

- hypothesis: Pomodoro ownership rule 1 deletes the record
  evidence: TaskNotes data.json pomodoroState.isRunning false, no currentSession
  timestamp: 2026-11-13

- hypothesis: Pause never completed (already-stopped / failed) so no record was set
  evidence: task timeEntries show the entry was closed by the pause (endTime 17:18:47Z), and repro shows outcome "paused" then record removed on refresh
  timestamp: 2026-11-13

## Evidence

- timestamp: 2026-11-13
  checked: dev-vault data.json after pause (from orchestrator)
  found: '{"completionStatus": null, "rolloverHour": 6, "pauseRecordsVersion": 1, "pauseRecords": [], "cardOrder": [2 entries]}'
  implication: no pause record persisted; paused card absent

- timestamp: 2026-11-13
  checked: git diff v0.2 HEAD -- src (stat and content)
  found: only main.ts (rolloverHour key), settings.ts, TimerPaneSettingTab.ts, TaskNotesBridge.ts (additive), runtime-api.types.ts, new stagedField/stagingDay changed; pause path files unchanged
  implication: pause behavior is the same code as v0.2

- timestamp: 2026-11-13
  checked: dev-vault TaskNotes/Tasks/Write quarterly report.md
  found: status done, completedDate 2026-10-16; entry 2026-10-27T20:52:03.390Z closed 2026-11-13T17:18:47Z, then 17:18:57-17:19:00 and 17:19:07-17:19:11 (user retried pause twice). Seed copy (dev-vault-seed) has status open, so v0.2 UAT left it done. The Oct 27 timer was running on an already-completed task.
  implication: the task the user paused was already completed-type

- timestamp: 2026-11-13
  checked: dev-vault TaskNotes data.json customStatuses
  found: done has isCompleted true
  implication: TimerStore.refreshOnce puts "done" in completedStatuses, so reconcile rule 4 fires

- timestamp: 2026-11-13
  checked: src/model/pauseLedger.ts reconcile rule 4; src/state/TimerStore.ts refreshOnce; v0.2 03-CONTEXT D-12
  found: "a paused record whose task has a completed-type status is deleted" with no check of when the task became completed; refreshOnce runs right after the pause (controller.pause finally -> store.refreshNow) and calls applyReconcile([]), which persists pauseRecords []
  implication: mechanism of the card loss

- timestamp: 2026-11-13
  checked: src/model/taskPicker.ts filterAndSortTasks
  found: completed tasks are only sorted last, not filtered out; so a timer can be started on a done task from the picker (also how the user's retries started)
  implication: users can routinely hit this path

- timestamp: 2026-11-13
  checked: temporary differential test (deleted after) through real TaskNotesBridge/TimerStore/TimerController/PauseStore over the fake TaskNotes
  found: "REPRO open paused records=1 cards=[\"paused\"]" vs "REPRO done paused records=0 cards=[]"
  implication: deterministic reproduction; status is the sole difference

- timestamp: 2026-11-13
  checked: full vitest suite
  found: 17 files, 539 tests pass. tests/pauseLedger.test.ts "reconcile rule 4" pins the deletion as intended; no test covers pausing a task that was already completed
  implication: existing tests encode the behavior; no gate for this case

- timestamp: 2026-11-13
  checked: dev-vault TaskNotes manifest
  found: TaskNotes 4.18.2 (updated 2026-11-13 12:10), not 4.13.8
  implication: not needed to explain the bug (repro uses the fake), but note for UAT environment accuracy

## Resolution

root_cause: Reconcile rule 4 (D-12, v0.2 Phase 3) in src/model/pauseLedger.ts deletes any paused record whose task has a completed-type status. The UAT task "Write quarterly report" was already status "done" (left by v0.2 UAT, completedDate 2026-10-16) while its timer kept running, and the picker allows starting timers on completed tasks. So the refresh right after Pause drops the record and the card vanishes, identical to Stop. Pre-existing v0.2 behavior, not a Phase 4 regression; the dev-vault data exposed it.
fix:
verification:
files_changed: []
