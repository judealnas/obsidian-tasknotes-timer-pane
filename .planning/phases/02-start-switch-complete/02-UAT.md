---
status: testing
phase: 02-start-switch-complete
source: [02-VERIFICATION.md]
started: 2026-10-16T02:10:00Z
updated: 2026-10-16T02:10:00Z
---

## Current Test

number: 1
name: Picker pointer, keyboard and lifecycle
expected: |
  Each chip/status/due region and Enter selects and starts exactly once, without opening or editing the task. Archived tasks are absent, completed tasks sort last, and closing/reopening discards stale renders.
awaiting: user response

## Session Notes

All three Phase 2 plans are implemented and committed. The final standard check passed 216 tests across 10 files, TypeScript/production build and zero-warning lint. Four verifier-owned focused behavior checks also passed. These checks used fakes and do not establish native desktop behavior. Security source review found no blocking open threats.

Use only the repository's `dev-vault`. The one-shot deploy updates the plugin bundle, manifest and stylesheet; it does not reset task notes. If the vault is already open and Hot Reload is unavailable, disable/re-enable TaskNotes Timer Pane or reload Obsidian after saving work.

The three plan prohibitions require explicit review in tests 1–3. The public timer stop API accepts a path only, so external replacement between its final read and stop remains a documented race; it is not an atomic conditional-stop guarantee.

## Tests

### 1. Picker pointer, keyboard and lifecycle
expected: Open Start task. Select using chip body/status area, due-date whitespace, arrows/Enter, and Escape/close/reopen. Each selection starts once alongside existing timers; nested chip controls never edit, complete or navigate. Archived tasks are excluded; completed tasks remain last. Search title, due, non-normal priority, context, project and tag. A late renderer cannot appear after close or a newer query. Explicitly resolve the picker prohibition based on observed behavior (WINDOWS 5).
result: [pending]

### 2. Stop all and live Pomodoro ownership
expected: Run regular timers and a Pomodoro work timer. Stop all closes regular entries while the exact live Pomodoro entry stays open; pane and TaskNotes status bar agree. Only-Pomodoro/empty states disable Stop all with an explanation. Unreadable ownership permits no further write. Review external same-path timer replacement and record the path-only API limitation; do not assume atomicity. Explicitly resolve the Pomodoro protection prohibition (WINDOWS 8).
result: [pending]

### 3. Complete, auto-stop and error recovery
expected: Complete a running task with TaskNotes auto-stop enabled, then disabled. The selected completed status applies first, then only the original still-open entry stops. If the status write fails, no stop occurs. If a later stop fails, the completed status remains and a partial-result notice appears. Complete sits beside Stop, controls recover, and task-chip click/right-click behavior remains usable. Explicitly resolve the no-stop-after-status-failure/no-rollback prohibition (WINDOWS 9).
result: [pending]

### 4. Completion settings, persistence and catalog changes
expected: Open plugin settings and confirm Same as TaskNotes plus current completed statuses in catalog order. Save a choice, reload Obsidian and confirm Complete uses it. Remove that status in TaskNotes and confirm visible/runtime fallback to the first completed status. With no completed status available, Complete is disabled. Reopening settings refreshes options (WINDOWS 9).
result: [pending]

### 5. Header, idle state, disabled controls and notices
expected: Header stays visible above idle/loading/missing/incompatible messages and running cards. Feature readiness disables unavailable controls with explanations. During each action and its final refresh, all pane write controls disable across pane instances. Failures show a clear notice and controls recover. Check keyboard focus and narrow sidebar presentation.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

No implementation blocker found by source verification. Native host checks above remain pending; Phase 2 is not accepted or advanced.
