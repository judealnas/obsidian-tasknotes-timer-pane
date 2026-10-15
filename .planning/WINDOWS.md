---
schema_version: 1
open_count: 4
waived_count: 0
fixed_count: 0
total_count: 4
last_updated: 2026-10-15T03:49:39.773Z
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
  }
]
````
