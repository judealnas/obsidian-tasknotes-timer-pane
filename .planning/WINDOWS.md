---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-10-15T02:05:05.426Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | unrun-verify | manifest.json |  | 01-01 Task 2 human-check (plugin listed as TaskNotes Timer Pane 0.1.0 and enables without console error in dev-vault) deferred to end-of-phase UAT section 0 (plan 01-04) | open |  | 2026-10-15T02:05:05.426Z |  |

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
  }
]
````
