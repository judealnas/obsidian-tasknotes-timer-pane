# Roadmap: TaskNotes Timer Pane

## Overview

The roadmap is three vertical slices. Each one leaves a working pane in Obsidian.

- **Phase 1 is the walking skeleton.** It builds the TaskNotes Runtime API bridge and the sidebar pane. The pane shows the timed task with its live session time and total time, stays in sync with changes from anywhere, and stops the timer in one click. This proves the read path and the write path (`api.time.stop`) end to end.
- **Phase 2 turns the pane into a launcher.** From the idle state or a fuzzy picker the user can start or switch tasks, and can complete the active task. Actions that need two writes get busy-state and failure handling.
- **Phase 3 adds pause and resume.** The pane owns pause state, because TaskNotes has no pause of its own. It also adds Pomodoro-aware labelling.

When Phase 3 is done, every v1 requirement and the core value are delivered: the user can see the timed task and stop, pause, or switch in one to two clicks.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Live Timer Pane** - Sidebar pane that shows the timed task with live session and total time, stays in sync with changes anywhere, and stops the timer in one click
- [ ] **Phase 2: Start, Switch & Complete** - Idle state and fuzzy task picker to start or switch tasks, complete the task from the pane, safe and reported actions
- [ ] **Phase 3: Pause & Resume** - Pause and resume owned by the pane that survives restarts, with Pomodoro-controlled timers labelled and protected

## Phase Details

### Phase 1: Live Timer Pane
**Goal**: With the pane open, the user always sees which task is being timed and for how long, and can stop the timer with one click. The display stays accurate wherever and however the timer changes.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: PANE-01, PANE-02, PANE-03, DISP-01, DISP-02, DISP-03, DISP-05, DISP-06, CTRL-01, SYNC-01, SYNC-02, SYNC-03, SYNC-04
**Success Criteria** (what must be TRUE):
  1. User opens the pane from the ribbon icon or the command palette. It opens in the right sidebar, or is revealed instead of duplicated if already open, and is still in the same place after restarting Obsidian.
  2. While a timer runs, the pane shows the task title (clicking it opens the task note), the session's elapsed time as H:MM:SS ticking every second, and the task's total tracked time including the running session. When several timers are running, it shows the most recently started one.
  3. User can stop the displayed timer with one click. The pane and TaskNotes' status bar both show it as stopped.
  4. Timers started or stopped elsewhere in TaskNotes (status bar, task cards, commands) appear in the pane within about a second. Changes from Obsidian Sync or hand-edited frontmatter also show up.
  5. When TaskNotes is missing, disabled, or older than 4.10, the pane shows a clear message. It reconnects by itself when TaskNotes is re-enabled or updated, without an Obsidian restart. After the computer sleeps and wakes, elapsed time is correct.
**Plans**: TBD
**UI hint**: yes
**Notes**: This is the walking skeleton, so the planner emits SKELETON.md. When nothing is timed, Phase 1 shows only a plain message. The "Start a task" button (DISP-04) comes with the picker in Phase 2. Research flag: check cold-start readiness timing by hand. `layout.ready` fires only once, and `isReady()` changes at a different point from `ready()`.

### Phase 2: Start, Switch & Complete
**Goal**: User can start, switch, and complete tasks from the pane in one or two clicks, without going to the status bar, task cards, or commands.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: DISP-04, CTRL-05, CTRL-06, CTRL-07, CTRL-09, CTRL-10
**Success Criteria** (what must be TRUE):
  1. When nothing is being timed, the pane shows an idle state with a "Start a task" button. The button opens a fuzzy task picker, and choosing a task starts its timer.
  2. While a task is timed, the user can pick a different task from the pane's picker. All running timers stop, then the chosen task starts, and the pane and TaskNotes' status bar show the new task.
  3. A plugin setting controls whether switching stops all running timers (the default) or only the displayed one, and switching follows it.
  4. User can mark the active task complete from the pane. Its timer stops and TaskNotes shows the task as done.
  5. While an action is in progress, the pane's controls are disabled. If an action fails, for example the new task fails to start after a switch, a notice explains what happened.
**Plans**: TBD
**UI hint**: yes
**Notes**: Run `/gsd-discuss-phase 2` first to settle two open decisions from research. First, whether "stop all" on switch also stops Pomodoro-owned timers. Second, how archived tasks are treated: research suggests showing them in the pane with a label but leaving them out of the picker. Switch is not atomic (stop, then start). Order the writes stop then start, through one serial queue.

### Phase 3: Pause & Resume
**Goal**: User can pause and resume the current task from the pane. Paused state survives restarts, and timers controlled by Pomodoro are labelled and left alone.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: DISP-07, CTRL-02, CTRL-03, CTRL-04, CTRL-08
**Success Criteria** (what must be TRUE):
  1. User can pause the active timer with one click. The current time entry closes and the pane shows the task as paused.
  2. User can resume the paused task with one click. This opens a new time entry on the same task, and the pane shows it running again.
  3. A paused task still shows as paused after restarting Obsidian. Paused state clears when another timer starts, or when the paused task is completed or deleted.
  4. A timer controlled by an active Pomodoro is labelled as Pomodoro in the pane and has no pause button.
**Plans**: TBD
**UI hint**: yes
**Notes**: TaskNotes has no record of pause, so the pane saves `{pausedTaskPath, pausedAt}` itself and follows `task.moved`. How Pomodoro-owned timers behave with the pane's controls is unverified. Test with a live Pomodoro session.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Live Timer Pane | 0/TBD | Not started | - |
| 2. Start, Switch & Complete | 0/TBD | Not started | - |
| 3. Pause & Resume | 0/TBD | Not started | - |
