# API Coverage — TaskNotes Runtime API v1

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Surface as enumerated in `01-RESEARCH.md` and `.planning/research/ARCHITECTURE.md` (source: `callumalpass/tasknotes@451679289d94`, v4.13.8, `src/api/runtime-api.ts`). Phase 1 is read-mostly. The only write is `time.stop`, per the PROJECT.md data-format constraint.

| capability | decision | reason |
|---|---|---|
| apiVersion / capabilities / hasCapability | INTEGRATE | |
| time.active | INTEGRATE | |
| time.stop | INTEGRATE | |
| time.start | OPT-OUT | not needed yet: start and switch come with the Phase 2 picker (CTRL-05, CTRL-06) |
| time.task | OPT-OUT | floors each entry to whole minutes, which violates DISP-03; totals are summed from `time.active()` entries instead |
| time.summary | OPT-OUT | minute-granular and top-10 only; today's log is v2 (HIST-02) |
| time.append | OPT-OUT | explicitly out of scope: writing entries directly bypasses the data-format constraint |
| time.deleteEntry | OPT-OUT | explicitly out of scope: the pane never deletes tracked time |
| tasks.get | OPT-OUT | not needed: `time.active()` already returns a deep copy of each active task |
| tasks.list | OPT-OUT | not needed yet: the Phase 2 picker needs the task list |
| tasks.update | OPT-OUT | explicitly out of scope for Phase 1: no task mutation besides stop; complete-from-pane is Phase 2 (CTRL-07) |
| query.tasks | OPT-OUT | not needed yet: the Phase 2 fuzzy picker |
| events: task.updated | INTEGRATE | |
| events: task.deleted | INTEGRATE | |
| events: task.created | OPT-OUT | metadata-path creates also arrive as task.updated, which already triggers a re-derive from `time.active()` |
| events: task.archived | OPT-OUT | not needed: the pane shows archive-flag timers like any other, and archive changes also arrive as task.updated, which re-derives from `time.active()` |
| events: task.moved | OPT-OUT | not needed yet: the store keys by the snapshot path; Phase 3 pause state follows moves |
| events: time.started / time.stopped | OPT-OUT | same raw event as task.updated; not emitted for hand edits or Sync; each extra subscription re-runs TaskNotes' deep-copy normalizer |
| lifecycle.isReady | INTEGRATE | |
| lifecycle.ready (promise) | OPT-OUT | resolves before TaskNotes' layout-ready initialization, so it is unsafe as a read gate (RESEARCH Pitfall 2) |
| lifecycle.on: layout.ready | INTEGRATE | |
| lifecycle.on: cache.changed | INTEGRATE | |
| lifecycle.on: cache.rebuilt | INTEGRATE | |
| lifecycle.on: settings.changed | INTEGRATE | |
| lifecycle.on: unloading | INTEGRATE | |
| lifecycle.on: ready | OPT-OUT | not needed: replayed readiness is covered by `isReady()` plus the 5 s probe |
| lifecycle.on: extension.registered / extension.unregistered | OPT-OUT | not needed: the pane registers no TaskNotes extensions |
| settings.snapshot | OPT-OUT | not needed: the pane reads no TaskNotes settings; completion auto-stop is TaskNotes' own (D-05), and the archive auto-stop that needed it (D-06..D-11) was superseded on 2026-10-13 |
| model.config | OPT-OUT | not needed: same reason as settings.snapshot; the pane reads no TaskNotes time-tracking config |
| errors.normalize | INTEGRATE | |
| errors.isApiError / errors.toResult | OPT-OUT | not needed: `normalize` covers Notice text; stop errors are plain Errors matched by message |
| catalog.statuses | OPT-OUT | not needed yet: the Phase 2 picker and complete; Phase 1 never interprets status (D-05) |
| ui.taskMenu.show | INTEGRATE | |
| ui.taskMenu.showAtElement / ui.taskMenu.populate | OPT-OUT | not needed: right-click passes the mouse event, so show() places the menu at the pointer |
| pomodoro.status | OPT-OUT | not needed yet: the Pomodoro label and pause rules are Phase 3 (DISP-07, CTRL-08) |
| HTTP API (/api/time/active etc.) | OPT-OUT | explicitly out of scope (PROJECT.md): an in-process Runtime API is used instead |
