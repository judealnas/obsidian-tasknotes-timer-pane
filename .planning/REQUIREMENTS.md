# Requirements: TaskNotes Timer Pane

**Defined:** 2026-10-13
**Core Value:** With the pane open, I can always see what task is being timed and how long I've spent on it, and stop, pause, or switch tasks in one to two clicks, without leaving the pane.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Pane

- [x] **PANE-01**: User can open the timer pane from a ribbon icon. It opens in the right sidebar, and if it's already open, it is revealed instead of duplicated.
- [x] **PANE-02**: User can open the timer pane from the command palette.
- [x] **PANE-03**: The pane is still there in the same place after an Obsidian restart.

### Display

- [x] **DISP-01**: User sees the title of the task being timed, and clicking it opens the task note.
- [x] **DISP-02**: User sees the current session's elapsed time (H:MM:SS), updating every second and calculated from the entry's start time.
- [x] **DISP-03**: User sees the task's total tracked time, including the running session, to the second.
- [ ] **DISP-04**: When nothing is being timed, user sees an idle state with a "Start a task" button.
- [x] **DISP-05**: User sees a clear message when TaskNotes is missing, disabled, or older than 4.10.
- [x] **DISP-06**: When several timers are running, the pane shows the most recently started one.
- [ ] **DISP-07**: A timer controlled by an active Pomodoro is labelled as Pomodoro.

### Controls

- [x] **CTRL-01**: User can stop the active timer with one click.
- [ ] **CTRL-02**: User can pause the active timer with one click. This closes the current entry, and the pane shows the paused task.
- [ ] **CTRL-03**: User can resume a paused task with one click. This opens a new entry on the same task.
- [ ] **CTRL-04**: Paused state survives an Obsidian restart. It is cleared when another timer starts, or when the paused task is completed or deleted.
- [ ] **CTRL-05**: User can start timing any task from a fuzzy task picker, opened from the pane header. The task starts alongside any running timers.
- [ ] **CTRL-06**: User can stop every running timer, except one owned by an active Pomodoro, with one click from the pane header ("Stop all"). *(Rewritten 2026-10-15: switching was removed; see Phase 2 CONTEXT.)*
- [ ] **CTRL-07**: User can mark the active task complete from the pane, which also stops its timer.
- [ ] **CTRL-08**: Pause is hidden for timers controlled by a Pomodoro.
- [ ] **CTRL-09**: Controls are disabled while an action is in progress, and a failed action shows a notice explaining what happened.
- ~~**CTRL-10**: A setting controls whether switching stops all running timers (default) or only the displayed one.~~ *(Dropped 2026-10-15: switching was removed.)*

### Sync

- [x] **SYNC-01**: Timers started or stopped elsewhere in TaskNotes appear in the pane within about a second.
- [x] **SYNC-02**: Changes from Obsidian Sync or hand-edited frontmatter appear in the pane.
- [x] **SYNC-03**: The pane reconnects by itself after TaskNotes is disabled, re-enabled, or updated, without restarting Obsidian.
- [x] **SYNC-04**: Elapsed time is correct after the computer sleeps and wakes.

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### History

- **HIST-01**: User sees recent tasks and can resume one with a single click
- **HIST-02**: User sees today's log of time per task, split correctly at midnight

### Display

- **DISP-08**: User sees progress of total time against the task's time estimate
- **DISP-09**: User sees an "also running" list of other active timers, each with its own stop button

### Controls

- **CTRL-11**: Hotkey commands for pause/resume, stop, and switch task
- **CTRL-12**: User can add an optional description to a session

## Out of Scope

| Feature | Reason |
|---------|--------|
| Pomodoro controls | TaskNotes already has a Pomodoro pane; duplicating it confuses timer ownership |
| Writing timeEntries directly to frontmatter | Not under TaskNotes' lock and the field name can be remapped; only `api.time.start`/`stop` are safe |
| TaskNotes HTTP API | In-process Runtime API chosen; no server or token needed |
| Desktop overlay / always-on-top window | Project wants in-Obsidian integration; Obsidian pop-out windows cover this |
| Reports, charts, export | TaskNotes has Stats views; not part of the core need |
| zczs520/tasknotes fork | Unknown provenance; not an official TaskNotes release |
| Community plugin submission | Personal use; BRAT or manual install is enough |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PANE-01 | Phase 1 | Complete |
| PANE-02 | Phase 1 | Complete |
| PANE-03 | Phase 1 | Complete |
| DISP-01 | Phase 1 | Complete |
| DISP-02 | Phase 1 | Complete |
| DISP-03 | Phase 1 | Complete |
| DISP-04 | Phase 2 | Pending |
| DISP-05 | Phase 1 | Complete |
| DISP-06 | Phase 1 | Complete |
| DISP-07 | Phase 3 | Pending |
| CTRL-01 | Phase 1 | Complete |
| CTRL-02 | Phase 3 | Pending |
| CTRL-03 | Phase 3 | Pending |
| CTRL-04 | Phase 3 | Pending |
| CTRL-05 | Phase 2 | Pending |
| CTRL-06 | Phase 2 | Pending |
| CTRL-07 | Phase 2 | Pending |
| CTRL-08 | Phase 3 | Pending |
| CTRL-09 | Phase 2 | Pending |
| CTRL-10 | Phase 2 | Dropped |
| SYNC-01 | Phase 1 | Complete |
| SYNC-02 | Phase 1 | Complete |
| SYNC-03 | Phase 1 | Complete |
| SYNC-04 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-13*
*Last updated: 2026-10-15 after Phase 2 discussion (CTRL-06 rewritten, CTRL-10 dropped)*
