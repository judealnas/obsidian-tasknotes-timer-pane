---
status: complete
phase: 04-staging-foundations
source: 04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-04-SUMMARY.md, 04-05-SUMMARY.md
started: 2026-11-13T00:00:00Z
updated: 2026-11-13T17:27:37.475Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Run `npm run build` so the dev vault has the current main.js, then fully quit and reopen Obsidian on the dev vault. The plugin loads with no errors in the developer console, the timer pane opens, and it connects to TaskNotes (shows tasks/timers, not the "TaskNotes not connected" empty state).
result: pass
note: "first pass was against a stale Oct 27 dev-vault build; worktree build does not deploy to the main dev vault. Redeployed 2026-11-13, retesting."

### 2. Rollover hour dropdown in settings
expected: Settings → TaskNotes Timer Pane shows a "Rollover hour" setting, with the description "The staging day starts at this hour. Earlier times count toward the previous day: with the default, 1:30 at night still counts as yesterday." The dropdown reads "4 AM" and lists 24 entries from 12 AM through 11 PM. The completion-status setting is still there alongside it.
result: pass

### 3. Rollover hour and completion status survive restart
expected: With at least one paused card in the pane, choose "6 AM" for Rollover hour, then change the completion status to a different value. Restart Obsidian. Settings show 6 AM and the new completion status (neither save erased the other), and the paused card is still paused. Optional: data.json now contains `"rolloverHour": 6`; setting it back to 4 AM removes the key.
result: pass
note: "data.json shows rolloverHour: 6 persisted. completionStatus still null and pauseRecords empty, so the completion-change and paused-card parts are not evidenced on disk; either-order save covered by settings.test.ts."

### 4. Null unstage leaves an empty `staged:` line
expected: Open `TaskNotes/Tasks/Staging spike scratch.md` in source mode. The frontmatter has a `staged:` line with no value after it (the key kept, value null).
result: pass

### 5. Spike cleanup: throwaway user field removed
expected: In TaskNotes settings → user fields, remove the throwaway `spikedefault` field. Afterwards only `staged` (type Date) remains from the spike, and TaskNotes keeps working.
result: pass

### 6. Timers behave as before (regression)
expected: In the pane, start a timer on a task, pause it, resume it, then stop it. Each action works in one click, the elapsed time ticks, and the TaskNotes status bar stays in sync — same as v0.2, no new errors or notices.
result: pass
note: "First run failed (pause removed the card) because the task was already status: done; root cause is pre-existing Phase 3 reconcile rule 4, not Phase 4 (see Deferred Follow-Ups, .planning/debug/pause-removes-card.md). Task reset to open; retest passed 2026-11-13."

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none — G-04-6 reclassified as pre-existing and deferred per user decision 2026-11-13]

## Deferred Follow-Ups

- test: 6
  idea: "Pausing a task that is already completed drops its card: pauseLedger reconcile rule 4 (Phase 3 D-12 'completed elsewhere') deletes paused records for any completed-type status, even if completed before the pause. Make rule 4 drop only records completed after pausedAt (or block pause / hide completed tasks in the picker), plus a regression test. Pre-existing since v0.2. Debug: .planning/debug/pause-removes-card.md"
  deferred_at: 2026-11-13
