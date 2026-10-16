---
schema_version: 1
open_count: 4
waived_count: 3
fixed_count: 2
total_count: 9
last_updated: 2026-10-16T02:57:20.503Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | unrun-verify | manifest.json |  | 01-01 Task 2 human-check (plugin listed as TaskNotes Timer Pane 0.1.0 and enables without console error in dev-vault) deferred to end-of-phase UAT section 0 (plan 01-04) | open |  | 2026-10-15T02:05:05.426Z |  |
| 2 | 01 | unrun-verify | src/ui/TimerPaneView.ts |  | 01-02 Task 2 human-check (ribbon/command reveal, restart restore, title link and Ctrl/Cmd-click, +N more running tooltip, 100:00:00 clock at minimum sidebar width) deferred to end-of-phase UAT (plan 01-04, D-13) | open |  | 2026-10-15T02:18:29.745Z |  |
| 3 | 01 | unrun-verify | src/state/TimerController.ts |  | 01-05 Task 1 human-check (Stop while a second timer runs, race and simulated-failure Notice, archive-flag timer stop, TaskNotes completion auto-stop vs YAML-edited done task) deferred to end-of-phase UAT sections 6-7 (D-13) | open |  | 2026-10-15T02:46:01.709Z |  |
| 4 | 01 | unrun-verify | src/ui/TimerPaneView.ts |  | Quick 261014-whq human-check (TaskNotes chip in card titles, chip click/right-click ownership, chip refresh after status/priority change, plain-link fallback with overlay off, no console errors on card removal or pane close) must be run by the user in Obsidian desktop | open |  | 2026-10-15T03:49:39.773Z |  |
| 5 | 02 | unrun-verify | src/ui/TaskPickerModal.ts |  | 02-01 live picker UAT pending: chip/status/due clicks, arrows/Enter/Escape, slow render close/reopen, search fields and completed ordering. | waived | User explicitly requested skipping tests requiring human intervention. Native Phase 2 checks were not performed; retain skipped evidence in 02-UAT.md. | 2026-10-15T17:50:06.915Z | 2026-10-16T02:57:17.827Z |
| 6 | 02 | lint-warning | eslint.config.mts |  | npm run check blocked by pre-existing nested .claude/worktrees/effort-repo-local project-service errors; project lint excluding that checkout passes with zero warnings. | fixed |  | 2026-10-15T17:50:07.970Z | 2026-10-16T01:31:57.127Z |
| 7 | 02 | stub | src/ui/TimerPaneView.ts |  | Stop all is intentionally present but disabled in 02-01; plan 02-02 implements the action. | fixed |  | 2026-10-15T17:50:08.907Z | 2026-10-16T01:42:53.911Z |
| 8 | 02 | unrun-verify | src/ui/TimerPaneView.ts |  | 02-02 live UAT pending: Stop all with regular plus Pomodoro timers, disabled tooltips and external replacement during public path-only stop race. | waived | User explicitly requested skipping tests requiring human intervention. Native Phase 2 checks were not performed; retain skipped evidence in 02-UAT.md. | 2026-10-16T01:41:40.778Z | 2026-10-16T02:57:19.357Z |
| 9 | 02 | unrun-verify | src/ui/TimerPaneView.ts |  | 02-03 live UAT pending: Complete beside Stop, native chip click/right-click and keyboard use, TaskNotes auto-stop on/off, live catalog refresh, preference reload and stale fallback. | waived | User explicitly requested skipping tests requiring human intervention. Native Phase 2 checks were not performed; retain skipped evidence in 02-UAT.md. | 2026-10-16T01:57:07.224Z | 2026-10-16T02:57:20.503Z |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "manifest.json",
    "line": null,
    "description": "01-01 Task 2 human-check (plugin listed as TaskNotes Timer Pane 0.1.0 and enables without console error in dev-vault) deferred to end-of-phase UAT section 0 (plan 01-04)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-15T02:05:05.426Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "src/ui/TimerPaneView.ts",
    "line": null,
    "description": "01-02 Task 2 human-check (ribbon/command reveal, restart restore, title link and Ctrl/Cmd-click, +N more running tooltip, 100:00:00 clock at minimum sidebar width) deferred to end-of-phase UAT (plan 01-04, D-13)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-15T02:18:29.745Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 3,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "src/state/TimerController.ts",
    "line": null,
    "description": "01-05 Task 1 human-check (Stop while a second timer runs, race and simulated-failure Notice, archive-flag timer stop, TaskNotes completion auto-stop vs YAML-edited done task) deferred to end-of-phase UAT sections 6-7 (D-13)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-15T02:46:01.709Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 4,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "src/ui/TimerPaneView.ts",
    "line": null,
    "description": "Quick 261014-whq human-check (TaskNotes chip in card titles, chip click/right-click ownership, chip refresh after status/priority change, plain-link fallback with overlay off, no console errors on card removal or pane close) must be run by the user in Obsidian desktop",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-15T03:49:39.773Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 5,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "src/ui/TaskPickerModal.ts",
    "line": null,
    "description": "02-01 live picker UAT pending: chip/status/due clicks, arrows/Enter/Escape, slow render close/reopen, search fields and completed ordering.",
    "status": "waived",
    "reason": "User explicitly requested skipping tests requiring human intervention. Native Phase 2 checks were not performed; retain skipped evidence in 02-UAT.md.",
    "recorded_at": "2026-10-15T17:50:06.915Z",
    "resolved_at": "2026-10-16T02:57:17.827Z",
    "milestone": null
  },
  {
    "id": 6,
    "kind": "lint-warning",
    "phase": "02",
    "file": "eslint.config.mts",
    "line": null,
    "description": "npm run check blocked by pre-existing nested .claude/worktrees/effort-repo-local project-service errors; project lint excluding that checkout passes with zero warnings.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-10-15T17:50:07.970Z",
    "resolved_at": "2026-10-16T01:31:57.127Z",
    "milestone": null
  },
  {
    "id": 7,
    "kind": "stub",
    "phase": "02",
    "file": "src/ui/TimerPaneView.ts",
    "line": null,
    "description": "Stop all is intentionally present but disabled in 02-01; plan 02-02 implements the action.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-10-15T17:50:08.907Z",
    "resolved_at": "2026-10-16T01:42:53.911Z",
    "milestone": null
  },
  {
    "id": 8,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "src/ui/TimerPaneView.ts",
    "line": null,
    "description": "02-02 live UAT pending: Stop all with regular plus Pomodoro timers, disabled tooltips and external replacement during public path-only stop race.",
    "status": "waived",
    "reason": "User explicitly requested skipping tests requiring human intervention. Native Phase 2 checks were not performed; retain skipped evidence in 02-UAT.md.",
    "recorded_at": "2026-10-16T01:41:40.778Z",
    "resolved_at": "2026-10-16T02:57:19.357Z",
    "milestone": null
  },
  {
    "id": 9,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "src/ui/TimerPaneView.ts",
    "line": null,
    "description": "02-03 live UAT pending: Complete beside Stop, native chip click/right-click and keyboard use, TaskNotes auto-stop on/off, live catalog refresh, preference reload and stale fallback.",
    "status": "waived",
    "reason": "User explicitly requested skipping tests requiring human intervention. Native Phase 2 checks were not performed; retain skipped evidence in 02-UAT.md.",
    "recorded_at": "2026-10-16T01:57:07.224Z",
    "resolved_at": "2026-10-16T02:57:20.503Z",
    "milestone": null
  }
]
````
