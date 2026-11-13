---
status: complete
phase: 04-staging-foundations
source: 04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-04-SUMMARY.md, 04-05-SUMMARY.md
started: 2026-11-13T00:00:00Z
updated: 2026-11-13T17:20:04.342Z
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
result: issue
reported: "Pausing a timer removes the card, making resuming impossible. It seems to have the same behavior as clicking stop or complete."
severity: major

## Summary

total: 6
passed: 5
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-04-6
  truth: "Pausing a timer keeps its card in the pane as paused so it can be resumed, same as v0.2"
  status: failed
  reason: "User reported: Pausing a timer removes the card, making resuming impossible. It seems to have the same behavior as clicking stop or complete."
  severity: major
  test: 6
  evidence: "dev-vault data.json pauseRecords stays [] after pausing (pauseRecordsVersion 1); cardOrder loses the paused task"
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
