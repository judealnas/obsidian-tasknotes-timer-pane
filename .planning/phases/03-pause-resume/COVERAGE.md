# API Coverage — TaskNotes Runtime API v1 (4.13.8), Phase 3

> Full coverage by default. Opt-outs are explicit, reasoned decisions. The rows are the complete capability array exposed by the pinned TaskNotes 4.13.8 runtime bundle, carried over from Phase 2's COVERAGE.md and re-decided for Phase 3 (pause and resume, Pomodoro hiding). Phase 3 uses only the public in-process API plus Obsidian's public vault and plugin-data APIs, and adds no other integration.

| capability | decision | reason |
|---|---|---|
| model.read | OPT-OUT | The pane consumes `TaskInfo` returned by task and time methods; it does not inspect the runtime model schema. |
| model.validate | OPT-OUT | The pane does not accept or construct arbitrary TaskNotes model payloads; its own `data.json` pause records are validated locally by `loadPauseRecords`. |
| catalog.read | INTEGRATE | Completed statuses for the picker order, Complete and the settings dropdown, and now for clearing a pause when a paused task is completed elsewhere (D-12). |
| extensions.read | OPT-OUT | The pane does not consume TaskNotes extension namespaces. |
| extensions.register | OPT-OUT | The pane is a companion consumer and exposes no TaskNotes extension namespace. |
| tasks.read | INTEGRATE | `tasks.list` for the Start task picker, and now `tasks.get` to read a paused task's title, status and entries, since paused tasks no longer appear in `time.active()`. |
| tasks.write | INTEGRATE | `tasks.complete` for Complete, including Complete on a paused card (D-09). |
| tasks.delete | OPT-OUT | Deleting tasks is outside the project scope; a deleted task's pause is cleared from Obsidian's vault delete event. |
| tasks.move | OPT-OUT | The pane never moves task notes. Rename and move are followed through Obsidian's public `vault.on("rename")`, which fires for every TaskNotes move path (03-RESEARCH Summary). |
| tasks.events | INTEGRATE | `task.updated` and `task.deleted` hints keep requesting authoritative refreshes, which drive reconcile (D-11, D-12, D-16). `task.moved` is deliberately not vendored: it misses explorer renames. |
| relationships.read | OPT-OUT | Task relationships are not displayed or edited by this pane. |
| events.list | OPT-OUT | The bridge subscribes to the pinned public event names it uses; it does not build an event browser. |
| time.read | INTEGRATE | `time.active()` for cards, pause and resume re-reads, bulk-target selection, and reconcile. |
| time.write | INTEGRATE | `time.stop` for Pause, Pause all and Stop (its returned `TaskInfo` gives the closed entry's end time), and `time.start` for Resume and Resume all (D-05). |
| time.summary | OPT-OUT | Session and Total are derived from task time entries and the pane's own session ledger; no reporting surface is added. |
| pomodoro.read | INTEGRATE | `pomodoro.status` identifies the exact Pomodoro-owned entry to hide (D-14), gates Pause all and Stop all (D-04, D-15), clears a pause taken over by a Pomodoro (D-16), and tags the picker row (D-17). |
| pomodoro.write | OPT-OUT | Pane control of Pomodoro (pause, resume, stop) is deferred to a later version by user decision on 2026-10-16 (03-CONTEXT Deferred Ideas). |
| pomodoro.events | INTEGRATE | Public started, completed and interrupted events invalidate ownership so a takeover or end is reflected without polling. |
| recurring.write | OPT-OUT | Phase 3 does not modify recurring-task state. |
| recurring.materialize | OPT-OUT | Phase 3 does not create recurring instances. |
| recurring.events | OPT-OUT | Recurrence changes reach the pane only as ordinary task update hints. |
| settings.snapshot | OPT-OUT | The pane's preferences and pause records are stored in its own `data.json`; reading TaskNotes settings stays outside the bridge contract. |
| bases.write | OPT-OUT | The pane does not create or modify Obsidian Bases. |
| nlp.parse | OPT-OUT | The picker searches existing task fields and accepts no natural-language task input. |
| ui.task-menu | INTEGRATE | The existing card-title right-click fallback remains the public TaskNotes menu path, on running and paused cards alike. |
| query.tasks | OPT-OUT | `tasks.list()` and `tasks.get()` supply what the pane needs; ranking and filtering stay local so query limits cannot omit candidates. |
| query.validate | OPT-OUT | The pane does not expose TaskNotes query syntax. |
| query.explain | OPT-OUT | The pane does not expose TaskNotes query syntax. |
| query.filter-options | OPT-OUT | The picker uses its locked field set rather than a generic query builder. |
| stats.tasks | OPT-OUT | Statistics and reporting are outside the project scope. |
| system.health | OPT-OUT | Existing probe, readiness and lifecycle handling are sufficient; no health dashboard is added. |
| lifecycle.events | INTEGRATE | Ready, unloading, cache and settings lifecycle handling remains the reconnection and invalidation boundary; reconcile waits for TaskNotes to be ready. |
| errors.typed | INTEGRATE | Pause and resume failures are normalized into safe plain-text Notices; the benign no-active-session and already-active races are classified, not shown. |

## Obsidian surfaces used in Phase 3 (not TaskNotes capabilities)

| surface | decision | reason |
|---|---|---|
| `Plugin.loadData` / `saveData` | INTEGRATE | Merged, serialized persistence of settings and pause records in one `data.json` (CTRL-04). |
| `Plugin.onExternalSettingsChange` | OPT-OUT | Cross-device reload of pause records is not required by CTRL-04; saves stay single-owner and serialized. |
| `vault.on("rename")` / `vault.on("delete")` | INTEGRATE | The only complete signals for rename, move and delete of task notes (D-12). |
| `vault.getFileByPath` | INTEGRATE | Detects task notes deleted while Obsidian was closed, after layout ready only. |
