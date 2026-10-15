---
status: partial
phase: 01-live-timer-pane
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md]
started: 2026-10-15T16:53:50.595Z
updated: 2026-10-15T17:26:54.049Z
---

## Current Test

[testing paused — 4 live tests blocked; 1 skipped test remains unverified]

## Session Notes

Manual checks run only in the repository dev-vault. Current multi-card and task-chip UI supersedes old single-card, +N-more, and Tracking-row expectations in the Phase 1 summaries/checklist. Automated passes below are inherited from recorded SUMMARY coverage, not a fresh test run. No native Obsidian UI was auto-verified. All five bounded plan commit counts reconcile with Git history. Canonical VERIFICATION.md is still missing; UAT alone will not mark the phase complete.


### Agent-run checks (2026-10-15T17:26:54.049Z)

- Build/typecheck passed as the first stage of npm run check.
- Direct Vitest run: 137 tests passed across 6 files, exit 0. Existing controller coverage includes stop failure Notices, benign already-stopped race, serialized queue survival, archived timers and done-status timers; these use fake TaskNotes and no native DOM.
- Scoped lint of src, tests and manifest.json passed at zero warnings, exit 0.
- Full npm run check exited 1 during lint: three project-service parsing errors in pre-existing .claude/worktrees/effort-repo-local files. The chained test stage did not run; tests were run directly afterward. No lint configuration was changed.
- Tests 19–22 remain blocked for live observation. Test 18 remains skipped per user; its automated race check passes, but live timing was not exercised.
- Test 7 remains an accepted minor discrepancy; user explicitly requested no fix. No diagnosis/fix plan generated for it.
- The installed executable CLI probe returned no command output; ports 9222/9223 did not provide debugging endpoints. dev-vault community plugins are tasknotes-timer-pane and tasknotes; Hot Reload is absent. No application injection, settings change, or further seed mutation was performed.

## Tests

### 1. Cold start in the development vault
expected: Save your work, fully quit Obsidian, then reopen C:/Users/ja384/Home/obsidian-tasknotes-timer-pane/dev-vault (not your personal vault). In Settings → Community plugins, TaskNotes and TaskNotes Timer Pane 0.1.0 are enabled. Open the pane using the ribbon icon “Open TaskNotes timer”. It connects within about 5 seconds and shows running timer cards or “No task is being timed”, without a plugin error or getting stuck on “Connecting to TaskNotes…”.
result: pass

### 2. Seed tasks load in TaskNotes
expected: In the development vault, TaskNotes recognizes the four seed notes under TaskNotes/Tasks/. The untouched Write quarterly report seed has closed entries totaling 1:07:35; the untouched Clean up old project archive seed includes an open entry since October 1. If notes were edited, use a disposable copy or restore the seed intentionally before checking baseline totals.
result: pass

### 3. Ribbon and command reveal a single pane
expected: Click Open TaskNotes timer twice and run Open timer pane twice. Only one TaskNotes timer pane exists. Each action reveals that same pane.
result: pass

### 4. Pane follows sidebar placement
expected: Move the pane to the left sidebar and invoke the ribbon action: it reveals the pane there without a duplicate. Move it back right, collapse the right sidebar, then invoke the action: the sidebar opens and reveals it.
result: pass

### 5. Pane and timer survive restart
expected: With a regular task timer running and the pane docked, save and restart Obsidian. The pane returns in the same location and shows the continuing timer within about 5 seconds, without manual reconnection.
result: pass

### 6. Task title chip and note access
expected: A timer card renders the TaskNotes task chip when overlays are enabled. Chip clicks and its menu perform their TaskNotes actions once without also opening the note unexpectedly. For plain-link fallback, click opens the correct task note and Ctrl-click opens a new tab; focus the title container and use Enter or Space to open the correct note. Right-click provides the native task menu when supported.
result: pass

### 7. Session and total time
expected: Watch a running card for about 10 seconds. Session ticks once per second as H:MM:SS. On an untouched Write quarterly report baseline, Total equals 1:07:35 plus the current session and advances with it; compare against the note entries if prior test runs added time. No Tracking row is expected in the current UI.
result: issue
reported: "Very minor problem not worth fixing, but sometimes when starting task tracking, an extra second is added to the total before a second elapses on the \"big\" timer of the pane."
severity: minor
disposition: accepted — user explicitly considers this not worth fixing; do not plan a fix

### 8. Multiple independent timer cards
expected: Start two regular timers from TaskNotes. Each timer has its own card, newest first, with its own clock and Stop timer button. Starting another timer adds a card without losing existing ones. The old +N more running display is no longer expected.
result: pass

### 9. Narrow pane and long clocks
expected: With the archived seed timer or another entry older than 100 hours, narrow the sidebar. Its H:MM:SS clock stays on one line without clipping or a horizontal scrollbar. A long task title remains readable without horizontal overflow.
result: pass
notes: "User confirmed: timer display shrinks and task titles wrap."

### 10. Status-bar synchronization
expected: Start and stop a regular task timer from the TaskNotes status bar. Each change appears in the pane within about 1 second, without an intermediate idle flash when other timers remain.
result: pass

### 11. Task-card synchronization
expected: Start and stop a timer from a TaskNotes task card. Each change appears in the pane within about 1 second.
result: pass

### 12. Command synchronization
expected: Use TaskNotes time-tracking commands to start and stop a task timer. The pane reflects each change within about 1 second.
result: pass

### 13. Hand-edited time entry synchronization
expected: In a disposable seed task with a timer running, add a valid quoted endTime after its startTime to the open timeEntries entry and save. Its card disappears within about 1 second; other running cards remain.
result: pass

### 14. Renaming and deleting timed notes
expected: Rename a timed disposable seed note. Its card follows the new title and keeps timing. Delete that disposable note: its card disappears within about 1 second. Restore the note afterward; do not delete a real task.
result: pass
notes: "User confirmed pass; restored all four seed tasks afterward and verified byte-for-byte against dev-vault-seed."

### 15. TaskNotes disable and reconnect
expected: With a timer running, disable TaskNotes. Within about 5 seconds the pane shows TaskNotes is not enabled with Check for TaskNotes. Re-enable it: the pane reconnects by itself within about 5 seconds. A quick off/on also reconnects without becoming stuck on Connecting to TaskNotes….
result: pass

### 16. Sleep, wake, and pane visibility
expected: With a regular timer running, sleep the computer for at least 2 minutes and wake it. On the first tick the session agrees with the TaskNotes status bar within ±1 second (formatting may differ). Hide the pane behind another sidebar tab and reveal it: its clock is current within one tick.
result: pass

### 17. One-click stop and independent cards
expected: With two regular timers running, click Stop timer on one card. It briefly shows Stopping… and is disabled while pending; only that card timer stops. The other card keeps timing and the TaskNotes status bar agrees. Stop the last timer: the pane shows No task is being timed.
result: pass

### 18. Already-stopped race
expected: Stop a regular timer elsewhere in TaskNotes and immediately click its pane Stop timer before the card updates, if possible. The pane refreshes with no failure Notice. If you cannot reproduce the timing window, say skip rather than treating it as passed.
result: skipped
reason: "User requested skip; live race not verified."

### 19. Stop failure and recovery
expected: Only in dev-vault: save the original public api.time.stop in the dev console, temporarily replace it with a function returning Promise.reject(new Error("Simulated failure")), then click Stop timer. A Notice explains that the timer could not be stopped, includes Simulated failure, and appears once; the button returns to Stop timer and is usable, while timing continues. Restore the original method immediately, or disable/re-enable TaskNotes, then verify normal Stop works.
result: blocked
blocked_by: third-party
reason: "Native Obsidian button/Notice/recovery cannot be observed: no usable CLI or debugging endpoint, no Hot Reload plugin, and native UI automation unavailable. Automated controller tests verify one failure Notice and queue survival; rendered busy-button recovery remains unverified."

### 20. Archived timers are ordinary cards
expected: Start a disposable task timer, archive it using TaskNotes, then start another task timer. Both remain as normal cards without a special archive label; the pane stops nothing by itself. TaskNotes status bar may hide the archived task. Its pane Stop button still stops it with one click. Unarchive or restore the seed afterward.
result: blocked
blocked_by: third-party
reason: "Live TaskNotes Archive action and rendered cards cannot be controlled/observed with available tools. Automated integration tests verify archived and done timers remain running without a click and an archived timer stops on request."

### 21. Completion follows TaskNotes auto-stop
expected: Note TaskNotes auto-stop time tracking setting, enable it for this check, start a timer, then complete the task through TaskNotes UI. TaskNotes stops the timer and the pane follows within about 1 second with no extra Notice. Restore the setting afterward.
result: blocked
blocked_by: third-party
reason: "TaskNotes completion UI and auto-stop setting cannot be exercised in the running application with available tools. Unit tests using fake TaskNotes do not prove third-party auto-stop behavior."

### 22. Hand-edited completion does not stop timing
expected: On a disposable task with a running timer, change its status to done in YAML and save. The timer keeps running and the pane shows its card normally; the pane adds no automatic stop. Stop it from the pane and restore the task afterward.
result: blocked
blocked_by: third-party
reason: "The file can be edited, but live TaskNotes state and pane response cannot be observed with available tools, so no unobservable mutation was made. Automated integration tests verify done-status timers remain running without a stop click."

### 23. Pinned toolchain installed from the user-approved pins; build and lint pass at zero warnings
expected: Pinned toolchain installed from the user-approved pins; build and lint pass at zero warnings
result: pass
source: automated
coverage_id: 01-01/D1

### 24. npm run deploy writes main.js, manifest.json, styles.css and .hotreload into dev-vault/.obsidian/plugins/tasknotes-timer-pane/ only; DEV_DIR is hard-coded with no process.env read
expected: npm run deploy writes main.js, manifest.json, styles.css and .hotreload into dev-vault/.obsidian/plugins/tasknotes-timer-pane/ only; DEV_DIR is hard-coded with no process.env read
result: pass
source: automated
coverage_id: 01-01/D2

### 25. Vendored type-only TaskNotes Runtime API v1 contract pinned by ten type-level test groups; full D-14 gate green
expected: Vendored type-only TaskNotes Runtime API v1 contract pinned by ten type-level test groups; full D-14 gate green
result: pass
source: automated
coverage_id: 01-01/D3

### 26. Bridge availability gate: missing, incompatible (with version), loading (no api yet or isReady() false), ready; throwing api falls back to missing; subscriptions released on dispose
expected: Bridge availability gate: missing, incompatible (with version), loading (no api yet or isReady() false), ready; throwing api falls back to missing; subscriptions released on dispose
result: pass
source: automated
coverage_id: 01-02/D1

### 27. Read path end to end: probe -> refreshNow -> primary is the latest start -> running; task.updated with an empty fixture -> idle; layout.ready connects from loading without a reload
expected: Read path end to end: probe -> refreshNow -> primary is the latest start -> running; task.updated with an empty fixture -> idle; layout.ready connects from loading without a reload
result: pass
source: automated
coverage_id: 01-02/D2

### 28. Time math and primary selection: formatHms floors and clamps, totalMs to the second, path tie-break, dropped entries, archived ranked like any other, identity invariant (1 primary + N-1 others, unique keys)
expected: Time math and primary selection: formatHms floors and clamps, totalMs to the second, path tie-break, dropped entries, archived ranked like any other, identity invariant (1 primary + N-1 others, unique keys)
result: pass
source: automated
coverage_id: 01-02/D3

### 29. Display copy: displayTitle basename fallback, '+N more running', 'Also running: …, and {k} more'
expected: Display copy: displayTitle basename fallback, '+N more running', 'Also running: …, and {k} more'
result: pass
source: automated
coverage_id: 01-02/D4

### 30. D-14 gate green and the pane deploys into the dev vault
expected: D-14 gate green and the pane deploys into the dev vault
result: pass
source: automated
coverage_id: 01-02/D5

### 31. Bridge availability states (null plugin, no api at 4.9.3/4.10.0/4.13.8/4.10.0-beta.1/weird, apiVersion 2, missing capability, not ready, ready, throwing hasCapability) and the isVersionOlder truth table
expected: Bridge availability states (null plugin, no api at 4.9.3/4.10.0/4.13.8/4.10.0-beta.1/weird, apiVersion 2, missing capability, not ready, ready, throwing hasCapability) and the isVersionOlder truth table
result: pass
source: automated
coverage_id: 01-03/D1

### 32. Reconnect: unloading retires the api and sets missing, exactly one 1 s early probe, a new api object reaches ready with one handler per subscribed name (also after 5 more probes), dispose releases all handlers and cancels the early probe, watchdog logs once, end-to-end reconnect through the real store
expected: Reconnect: unloading retires the api and sets missing, exactly one 1 s early probe, a new api object reaches ready with one handler per subscribed name (also after 5 more probes), dispose releases all handlers and cancels the early probe, watchdog logs once, end-to-end reconnect through the real store
result: pass
source: automated
coverage_id: 01-03/D2

### 33. Store sync: 200 ms trailing debounce, burst coalescing, single-flight with one dirty rerun, signature-diffed notify, error retention with no retry, resync gated on ready, leaving ready resets and cancels, data-hint-only entries appear
expected: Store sync: 200 ms trailing debounce, burst coalescing, single-flight with one dirty rerun, signature-diffed notify, error retention with no retry, resync gated on ready, leaving ready resets and cancels, data-hint-only entries appear
result: pass
source: automated
coverage_id: 01-03/D3

### 34. Sleep/wake math: detectWakeGap truth table and an entry started at T reading 1:00:00 at T + 1 h with no counter state
expected: Sleep/wake math: detectWakeGap truth table and an entry started at T reading 1:00:00 at T + 1 h with no counter state
result: pass
source: automated
coverage_id: 01-03/D4

### 35. D-14 gate green and no dependency drift
expected: D-14 gate green and no dependency drift
result: pass
source: automated
coverage_id: 01-03/D7

### 36. npm run seed creates the four seed notes in dev-vault/TaskNotes/Tasks/; a plain re-seed keeps an edited note; --reset restores it; a marker under dev-vault/.obsidian/ survives both
expected: npm run seed creates the four seed notes in dev-vault/TaskNotes/Tasks/; a plain re-seed keeps an edited note; --reset restores it; a marker under dev-vault/.obsidian/ survives both
result: pass
source: automated
coverage_id: 01-04/D1

### 37. A seed path under .obsidian is refused with exit 1 and nothing is written to dev-vault/.obsidian/
expected: A seed path under .obsidian is refused with exit 1 and nothing is written to dev-vault/.obsidian/
result: pass
source: automated
coverage_id: 01-04/D2

### 38. npm run deploy fills the dev-vault plugin folder and nothing under dev-vault/ is tracked
expected: npm run deploy fills the dev-vault plugin folder and nothing under dev-vault/ is tracked
result: pass
source: automated
coverage_id: 01-04/D3

### 39. README covers usage, behavior notes, one-time TaskNotes 4.13.x and Hot Reload 0.3.1 installs, the seed/deploy/dev loop and npm run check; no release instructions
expected: README covers usage, behavior notes, one-time TaskNotes 4.13.x and Hot Reload 0.3.1 installs, the seed/deploy/dev loop and npm run check; no release instructions
result: pass
source: automated
coverage_id: 01-04/D4

### 40. 01-UAT-CHECKLIST.md has every D-13 section with expected results, the run-order header, and '(requires plan 01-05)' only on Stop; no superseded archive auto-stop step
expected: 01-UAT-CHECKLIST.md has every D-13 section with expected results, the run-order header, and '(requires plan 01-05)' only on Stop; no superseded archive auto-stop step
result: pass
source: automated
coverage_id: 01-04/D5

### 41. Stop of the displayed timer end to end through the real bridge, store, queue and controller: exactly one api.time.stop with source 'tasknotes-timer-pane', reason 'user stop' and a correlationId; pane goes idle, or the other running timer becomes primary and is not stopped
expected: Stop of the displayed timer end to end through the real bridge, store, queue and controller: exactly one api.time.stop with source 'tasknotes-timer-pane', reason 'user stop' and a correlationId; pane goes idle, or the other running timer becomes primary and is not stopped
result: pass
source: automated
coverage_id: 01-05/D1

### 42. Failure handling: the 'no active session' race returns already-stopped with no Notice and a refresh; any other error (including task not found and an empty message) shows the exact Stop-failed Notice once, then refreshes
expected: Failure handling: the 'no active session' race returns already-stopped with no Notice and a refresh; any other error (including task not found and an empty message) shows the exact Stop-failed Notice once, then refreshes
result: pass
source: automated
coverage_id: 01-05/D2

### 43. WriteQueue runs tasks strictly in order and a rejection does not break the chain
expected: WriteQueue runs tasks strictly in order and a rejection does not break the chain
result: pass
source: automated
coverage_id: 01-05/D3

### 44. D-05: done-status and archive-flag timers are shown normally across refreshes and data hints with zero stop calls; an archive-flag primary stops with one click like any other timer
expected: D-05: done-status and archive-flag timers are shown normally across refreshes and data hints with zero stop calls; an archive-flag primary stops with one click like any other timer
result: pass
source: automated
coverage_id: 01-05/D4

### 45. Bridge write facade: stop forwards the context and rejects when not ready; normalizeError uses api.errors.normalize with 'errors.typed' and falls back otherwise
expected: Bridge write facade: stop forwards the context and rejects when not ready; normalizeError uses api.errors.normalize with 'errors.typed' and falls back otherwise
result: pass
source: automated
coverage_id: 01-05/D5

### 46. D-14 gate green and no dependency drift
expected: D-14 gate green and no dependency drift
result: pass
source: automated
coverage_id: 01-05/D7

## Summary

total: 46
passed: 40
issues: 1
pending: 0
skipped: 1
blocked: 4

## Gaps

- gap_id: UAT-01-07
  truth: "Session and total time advance consistently when tracking starts."
  status: failed
  reason: "User reported: Very minor problem not worth fixing, but sometimes when starting task tracking, an extra second is added to the total before a second elapses on the \"big\" timer of the pane."
  severity: minor
  test: 7
  disposition: "Accepted minor discrepancy; user says not worth fixing. No diagnosis or fix planning requested."
  root_cause: "Not investigated; preserve user preference to leave unchanged."
  artifacts: []
  missing: []
  debug_session: ""

