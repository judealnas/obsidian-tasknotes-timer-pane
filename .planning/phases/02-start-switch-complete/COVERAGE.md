# API Coverage — TaskNotes Runtime API v1 (4.13.8)

> Full coverage by default. Opt-outs are explicit, reasoned decisions. The rows are the complete capability array exposed by the pinned TaskNotes 4.13.8 runtime bundle. Phase 2 uses only the public in-process API and does not add another integration.

| capability | decision | reason |
|---|---|---|
| model.read | OPT-OUT | The pane consumes `TaskInfo` returned by task and time methods; it does not inspect the runtime model schema. |
| model.validate | OPT-OUT | The pane does not accept or construct arbitrary TaskNotes model payloads. |
| catalog.read | INTEGRATE | Required to identify completed statuses for picker ordering, Complete, and the settings dropdown. |
| extensions.read | OPT-OUT | The pane does not consume TaskNotes extension namespaces. |
| extensions.register | OPT-OUT | The pane is a companion consumer and exposes no TaskNotes extension namespace. |
| tasks.read | INTEGRATE | Required to list every task for the Start task picker. |
| tasks.write | INTEGRATE | Required for explicit `tasks.complete` with the resolved completed status. |
| tasks.delete | OPT-OUT | Deleting tasks is outside the phase and project scope. |
| tasks.move | OPT-OUT | Moving task notes is outside the phase scope. |
| tasks.events | INTEGRATE | Existing task event hints continue to request authoritative refreshes. |
| relationships.read | OPT-OUT | Task relationships are not displayed or edited by this pane. |
| events.list | OPT-OUT | The bridge subscribes to the pinned public event names it uses; it does not build an event browser. |
| time.read | INTEGRATE | Required for active timer display, duplicate-start checks, sequential Stop all rechecks, and Complete's still-open check. |
| time.write | INTEGRATE | Required for Start task and all Stop operations. |
| time.summary | OPT-OUT | Existing timer snapshots derive displayed totals from task time entries; Phase 2 adds no reporting surface. |
| pomodoro.read | INTEGRATE | Required to identify the exact timer entry owned by the active Pomodoro. |
| pomodoro.write | OPT-OUT | Pomodoro controls are explicitly outside scope; the pane must not control the Pomodoro service. |
| pomodoro.events | INTEGRATE | Public started/completed/interrupted events invalidate ownership availability without polling on ticks. |
| recurring.write | OPT-OUT | Phase 2 does not modify recurring-task state. |
| recurring.materialize | OPT-OUT | Phase 2 does not create recurring instances. |
| recurring.events | OPT-OUT | Recurrence changes do not affect the Phase 2 controls beyond ordinary task update hints. |
| settings.snapshot | OPT-OUT | The companion preference is stored by this plugin; reading TaskNotes settings remains outside the bridge contract. |
| bases.write | OPT-OUT | The pane does not create or modify Obsidian Bases. |
| nlp.parse | OPT-OUT | The picker searches existing task fields and accepts no natural-language task input. |
| ui.task-menu | INTEGRATE | The existing card-title right-click fallback remains the public TaskNotes menu path. |
| query.tasks | OPT-OUT | `tasks.list()` supplies the complete set; filtering and deterministic D-08 ranking are local so query limits cannot omit candidates. |
| query.validate | OPT-OUT | The pane does not expose TaskNotes query syntax. |
| query.explain | OPT-OUT | The pane does not expose TaskNotes query syntax. |
| query.filter-options | OPT-OUT | The picker uses the locked field set from D-08 rather than a generic query builder. |
| stats.tasks | OPT-OUT | Statistics and reporting are outside the project scope. |
| system.health | OPT-OUT | Existing probe, readiness, and lifecycle handling are sufficient; no health dashboard is added. |
| lifecycle.events | INTEGRATE | Existing ready/reload/cache/settings lifecycle handling remains the reconnection and invalidation boundary. |
| errors.typed | INTEGRATE | Write failures are normalized into safe Notices without showing raw objects or stacks. |

