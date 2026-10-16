---
status: complete
phase: 03-pause-resume
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md]
started: 2026-10-16T13:59:33Z
updated: 2026-10-16T17:43:32.103Z
---

## Current Test

[testing complete]

## Session Notes

Desktop run 2026-10-16 after `npm run deploy` (bundle with Phase 3 code confirmed in dev-vault): user reported tests 1-14 and 16 pass, test 15 skip. This supersedes the earlier automated-only session note below, which had skipped all 16 desktop checks.

User instruction this session: "test what you can without human intervention. Mark as skip those that need it." All 16 desktop checks (1-16) are skipped, not passed. Automated evidence: `npm run check` on 2026-10-16 passed (tsc, production build, eslint --max-warnings 0, vitest 361 tests in 13 files). Tests 25-29 were promoted from 03-03-SUMMARY.md's coverage block after running their named tests (all passing); the block was auto-classified only as human checks because it used the invalid verification kind `test`. These checks use fakes and do not establish native desktop behavior.

Use only the repository's `dev-vault` with TaskNotes 4.13.8. 03-03-SUMMARY.md's coverage block uses the invalid verification kind `test` (must be unit/integration/...), so its five test-backed entries could not be auto-passed and are presented as human checks (tests 9-13). SUMMARYs carry no `commits:` field; each plan's recorded head window is an ancestor of HEAD (warning only, not a mismatch).

## Tests

### 1. Cold start smoke test
expected: Deploy the current build to the dev vault and fully quit and reopen Obsidian. TaskNotes Timer Pane loads with no errors in the developer console, the pane opens and shows the current state of TaskNotes timers (running cards, or the idle state if nothing runs).
result: pass
source: user

### 2. Pause a running timer
expected: Start a task, click Pause on its card. The card stays in place, turns muted with a "Paused" label, Session stops ticking, and TaskNotes' status bar shows no running timer.
result: pass
source: user

### 3. Resume from the pane
expected: On the paused card, click Resume. The card returns to running and Session continues from the frozen value (it does not reset to 0).
result: pass
source: user

### 4. Starting a paused task elsewhere resumes it
expected: Pause a task again, then start the same task from TaskNotes' status bar or a task card. The pane card returns to running with Session continuing from the frozen value.
result: pass
source: user

### 5. Pauses survive a restart
expected: Pause two tasks, change the completion-status setting, quit and reopen Obsidian. Both cards come back paused with their frozen Session values and the setting is unchanged. The plugin's data.json contains completionStatus, pauseRecordsVersion 1 and both pauseRecords.
result: pass
source: user

### 6. Pomodoro takeover and completion clear a pause; archive does not
expected: Pause a task, then start a Pomodoro on that same task from TaskNotes' Pomodoro view: the paused card disappears. Pause another task and mark it done from a TaskNotes task card: its card disappears. Pause a third task and set only its archived flag: it stays paused.
result: pass
source: user

### 7. Pause follows rename and move; delete clears it
expected: Pause a task and rename its note in the file explorer: the paused card stays with the same frozen Session and its title link opens the renamed note. Moving the task's folder behaves the same. Resume it, rename it while running, pause it: Session still continues across both. Pause another task and delete its note: the card disappears. After quitting and reopening Obsidian, the renamed pause is still there.
result: pass
source: user

### 8. Stop on a paused card
expected: Pause a task and click Stop on its card. The card disappears and TaskNotes shows no new time entry for it.
result: pass
source: user

### 9. Complete on a paused card
expected: Pause a task and click Complete. TaskNotes shows the task with the completed status and no extra time entry; the card disappears.
result: pass
source: user

### 10. Stop all clears pauses
expected: Pause one task, keep another running, click Stop all. The pane ends empty (no running or paused cards) and TaskNotes' status bar shows nothing running.
result: pass
source: user

### 11. Pause all
expected: Start three tasks and click Pause all. All three cards are paused in place, a count-only Notice appears, and the status bar shows nothing running.
result: pass
source: user

### 12. Resume all
expected: With the three paused tasks, click Resume all. All three run again with Session continuing from their frozen values, and a count-only Notice appears.
result: pass
source: user

### 13. Header buttons, tooltips and narrow layout
expected: With nothing running, Pause all is disabled with an explanatory tooltip; with nothing paused, Resume all is disabled with its tooltip. Narrowing the sidebar makes the four header buttons wrap cleanly, and paused-card buttons lay out without overlap.
result: pass
source: user

### 14. Pomodoro entry hidden and protected
expected: Start a regular timer, then start a Pomodoro work session on another task. The Pomodoro's timer does not appear as a card; Pause all and Stop all leave it running and TaskNotes' Pomodoro view keeps counting. If TaskNotes allows a regular timer on the Pomodoro's own task, only the Pomodoro's own entry is hidden.
result: pass
source: user

### 15. Can't-check Pomodoro line
expected: If Pomodoro ownership can be made unreadable (e.g. disabling the Pomodoro feature) while TaskNotes is ready, a muted line appears under the header saying the Pomodoro can't be checked, and Pause all and Stop all are disabled. The line is absent in normal operation.
result: skipped
reason: "User reported: Skip (no reason given)"

### 16. Picker Pomodoro tag and start guard
expected: With a live Pomodoro work session on a task, open Start task: that task's row shows a muted "Pomodoro" tag. Choosing it shows the Notice "{title} is being timed by Pomodoro." and writes no new entry. After pausing the Pomodoro in TaskNotes, the tag is gone on the next opening.
result: pass
source: user

### 17. Stale refresh re-reads after a ledger change
expected: A refresh whose reads began before a ledger change re-reads instead of publishing stale conclusions; missing-file rule only after layout ready
result: pass
source: automated
coverage_id: 03-02/D4

### 18. Pomodoro-owned entry hidden by adjacency
expected: The Pomodoro-owned entry is hidden from cards and counts; same-path/other-start and other-path/same-start entries stay (adjacency)
result: pass
source: automated
coverage_id: 03-04/D1

### 19. Empty-predicate ownership cases
expected: Owner null hides nothing; only the owned entry gives an idle pane with eligibleCount 0; zero entries with unreadable ownership is idle and unreadable
result: pass
source: automated
coverage_id: 03-04/D2

### 20. Unreadable ownership shows every timer
expected: Unreadable or rejected ownership shows every timer and reports unreadable to the header
result: pass
source: automated
coverage_id: 03-04/D3

### 21. Order and change detection with hidden entry
expected: Remaining cards keep D-06 order and sessionKeys; an owner change notifies
result: pass
source: automated
coverage_id: 03-04/D4

### 22. Reconcile still sees the owned entry
expected: A Pomodoro taking over a paused task removes the paused card and hides the Pomodoro entry (D-16)
result: pass
source: automated
coverage_id: 03-04/D5

### 23. Picker ownership read lifecycle
expected: Picker tags the Pomodoro's task row; unreadable/rejected reads tag nothing and keep the picker open; one read per opening; late read discarded
result: pass
source: automated
coverage_id: 03-04/D7

### 24. Controller start guard cases
expected: start() on the Pomodoro's task writes nothing and shows the D-17 Notice; ended, paused, other-task and unreadable cases proceed per plan
result: pass
source: automated
coverage_id: 03-04/D8

### 25. Stop on a paused card (logic)
expected: Stop on a paused card clears the pause with no TaskNotes write
result: pass
source: automated
coverage_id: 03-03/D1

### 26. Complete on a paused card (logic)
expected: Complete on a paused card writes the status once, makes no stop call, then clears the pause; a failed write keeps it
result: pass
source: automated
coverage_id: 03-03/D2

### 27. Stop all clears pauses (logic)
expected: Stop all stops eligible timers then clears every paused record; keeps them when halted on unreadable ownership
result: pass
source: automated
coverage_id: 03-03/D3

### 28. Pause all (logic)
expected: Pause all: ordered, deduplicated, re-checked before every write, halts on unreadable ownership, count-only Notices
result: pass
source: automated
coverage_id: 03-03/D4

### 29. Resume all (logic)
expected: Resume all: display order, skips Pomodoro-owned and already-open tasks, count-only Notices
result: pass
source: automated
coverage_id: 03-03/D5

## Summary

total: 29
passed: 28
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

[none yet]
