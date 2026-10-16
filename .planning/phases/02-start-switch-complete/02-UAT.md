---
status: complete
phase: 02-start-switch-complete
source: [02-VERIFICATION.md]
started: 2026-10-16T02:10:00Z
updated: 2026-10-16T04:54:35.635Z
---

## Current Test

[testing complete]

## Session Notes

Final user clarification 2026-10-16T04:54:35.635Z: with one Pomodoro and one regular timer, Stop all stopped only the regular timer. This confirms the intended protection and resolves test 2. All six desktop groups are now accepted by user report; seven automated groups retain their test evidence. Earlier skip and ambiguity notes below are session history, superseded by these results.

User follow-up 2026-10-16T04:53:07.670Z: desktop tests 1, 3, 4, 5 and 6 reported passed. For test 2, user reported: "If I start a pomo and stop it through the pane, time tracking stops and the pomo keeps going." The specific button was not stated. Card Stop intentionally calls only time.stop; Pomodoro protection belongs to Stop all. Test 2 remains unverified rather than inferred passed or failed from that observation.

User instruction for this session: "I don't want to be involved in this. Skip tests that require human intervention." Existing desktop tests and the startup smoke test are skipped, not passed. Seven automated entries below come from the summaries' deterministic coverage classification and the fresh successful standard check. No user response is awaited.

All three Phase 2 plans are implemented and committed. The final standard check passed 216 tests across 10 files, TypeScript/production build and zero-warning lint. Four verifier-owned focused behavior checks also passed. These checks used fakes and do not establish native desktop behavior. Security source review found no blocking open threats.

Use only the repository's `dev-vault`. The one-shot deploy updates the plugin bundle, manifest and stylesheet; it does not reset task notes. If the vault is already open and Hot Reload is unavailable, disable/re-enable TaskNotes Timer Pane or reload Obsidian after saving work.

The three plan prohibitions require explicit review in tests 1–3. The public timer stop API accepts a path only, so external replacement between its final read and stop remains a documented race; it is not an atomic conditional-stop guarantee.

## Tests

### 1. Picker pointer, keyboard and lifecycle
expected: Open Start task. Select using chip body/status area, due-date whitespace, arrows/Enter, and Escape/close/reopen. Each selection starts once alongside existing timers; nested chip controls never edit, complete or navigate. Archived tasks are excluded; completed tasks remain last. Search title, due, non-normal priority, context, project and tag. A late renderer cannot appear after close or a newer query. Explicitly resolve the picker prohibition based on observed behavior (WINDOWS 5).
result: pass
source: user
reported: "pass"
verified_at: 2026-10-16T04:53:07.670Z

### 2. Stop all and live Pomodoro ownership
expected: Run regular timers and a Pomodoro work timer. Stop all closes regular entries while the exact live Pomodoro entry stays open; pane and TaskNotes status bar agree. Only-Pomodoro/empty states disable Stop all with an explanation. Unreadable ownership permits no further write. Review external same-path timer replacement and record the path-only API limitation; do not assume atomicity. Explicitly resolve the Pomodoro protection prohibition (WINDOWS 8).
result: pass
source: user
reported: "If I have one pomo and one normal timer and use Stop all, only the normal timer stops; the pomo keeps going."
verified_at: 2026-10-16T04:54:35.635Z
observation_scope: Normal-plus-Pomodoro Stop all protection observed; no claim that external race or unreadable-ownership fault injection was exercised live.

### 3. Complete, auto-stop and error recovery
expected: Complete a running task with TaskNotes auto-stop enabled, then disabled. The selected completed status applies first, then only the original still-open entry stops. If the status write fails, no stop occurs. If a later stop fails, the completed status remains and a partial-result notice appears. Complete sits beside Stop, controls recover, and task-chip click/right-click behavior remains usable. Explicitly resolve the no-stop-after-status-failure/no-rollback prohibition (WINDOWS 9).
result: pass
source: user
reported: "Pass"
verified_at: 2026-10-16T04:53:07.670Z

### 4. Completion settings, persistence and catalog changes
expected: Open plugin settings and confirm Same as TaskNotes plus current completed statuses in catalog order. Save a choice, reload Obsidian and confirm Complete uses it. Remove that status in TaskNotes and confirm visible/runtime fallback to the first completed status. With no completed status available, Complete is disabled. Reopening settings refreshes options (WINDOWS 9).
result: pass
source: user
reported: "Pass"
verified_at: 2026-10-16T04:53:07.670Z

### 5. Header, idle state, disabled controls and notices
expected: Header stays visible above idle/loading/missing/incompatible messages and running cards. Feature readiness disables unavailable controls with explanations. During each action and its final refresh, all pane write controls disable across pane instances. Failures show a clear notice and controls recover. Check keyboard focus and narrow sidebar presentation.
result: pass
source: user
reported: "Pass"
verified_at: 2026-10-16T04:53:07.670Z

### 6. Cold Start Smoke Test
expected: Restart the Obsidian development vault with saved settings and verify the plugin starts and restores its pane without errors or unintended default completion status.
result: pass
source: user
reported: "Pass"
verified_at: 2026-10-16T04:53:07.670Z

### 7. Start alongside existing timers
expected: CTRL-05: Start preserves existing timers, checks duplicates and shares busy state.
result: pass
source: automated
verification: tests/controller.test.ts
coverage: 02-01-SUMMARY.md#start
evidence: npm run check passed, 216 tests in 10 files, production build/typecheck and zero-warning lint; 2026-10-16T02:55:19.265Z

### 8. Picker candidate and ranking policy
expected: Archived tasks excluded, completed last, required fields searched with deterministic ranking.
result: pass
source: automated
verification: tests/taskPicker.test.ts
coverage: 02-01-SUMMARY.md#picker-policy
evidence: npm run check passed, 216 tests in 10 files, production build/typecheck and zero-warning lint; 2026-10-16T02:55:19.265Z

### 9. Sequential Pomodoro-safe Stop all
expected: Exact live work owner is protected; finite batch stops sequentially and handles replacement/read failures.
result: pass
source: automated
verification: tests/controller.test.ts
coverage: 02-02-SUMMARY.md#stop-all-batch
evidence: npm run check passed, 216 tests in 10 files, production build/typecheck and zero-warning lint; 2026-10-16T02:55:19.265Z

### 10. Live Stop all eligibility and event refresh
expected: Ownership/time events update availability and unreadable ownership disables the action.
result: pass
source: automated
verification: tests/store.test.ts; tests/bridge.test.ts
coverage: 02-02-SUMMARY.md#eligibility
evidence: npm run check passed, 216 tests in 10 files, production build/typecheck and zero-warning lint; 2026-10-16T02:55:19.265Z

### 11. Status-first Complete and exact-entry stop
expected: Live completed status applies first; failed status never stops; later failure is partial with no rollback.
result: pass
source: automated
verification: tests/controller.test.ts; tests/bridge.test.ts
coverage: 02-03-SUMMARY.md#status-first-complete
evidence: npm run check passed, 216 tests in 10 files, production build/typecheck and zero-warning lint; 2026-10-16T02:55:19.265Z

### 12. Settings validation, persistence callbacks and stale fallback
expected: Saved settings are validated; live completed catalog and stale/default fallback resolve deterministically.
result: pass
source: automated
verification: tests/settings.test.ts; tests/main.test.ts
coverage: 02-03-SUMMARY.md#persisted-live-settings
evidence: npm run check passed, 216 tests in 10 files, production build/typecheck and zero-warning lint; 2026-10-16T02:55:19.265Z

### 13. Complete busy interval through final refresh
expected: All overlapping pane mutations are prevented throughout Complete and final refresh.
result: pass
source: automated
verification: tests/controller.test.ts
coverage: 02-03-SUMMARY.md#complete-busy-interval
evidence: npm run check passed, 216 tests in 10 files, production build/typecheck and zero-warning lint; 2026-10-16T02:55:19.265Z

## Summary

total: 13
passed: 13
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

No implementation blocker found by source verification or the automated checks. All six desktop groups passed by user report, including the clarified Stop all/Pomodoro scenario. Seven automated groups passed. No unresolved reported issue remains. The documented path-only external replacement race is an API limitation, not a claim of observed atomicity.
