# Roadmap: TaskNotes Timer Pane

## Overview

The roadmap is three vertical slices. Each one leaves a working pane in Obsidian.

- **Phase 1 is the walking skeleton.** It builds the TaskNotes Runtime API bridge and the sidebar pane. The pane shows the timed task with its live session time and total time, stays in sync with changes from anywhere, and stops the timer in one click. This proves the read path and the write path (`api.time.stop`) end to end.
- **Phase 2 turns the pane into a launcher.** From the idle state or a fuzzy picker the user can start or switch tasks, and can complete the active task. Actions that need two writes get busy-state and failure handling.
- **Phase 3 adds pause and resume.** The pane owns pause state, because TaskNotes has no pause of its own. It also hides Pomodoro-owned timers, so the pane covers regular time tracking only.

When Phase 3 is done, every v1 requirement and the core value are delivered: the user can see the timed task and stop, pause, or switch in one to two clicks.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Live Timer Pane** - Sidebar pane that shows the timed task with live session and total time, stays in sync with changes anywhere, and stops the timer in one click
- [x] **Phase 2: Start, Switch & Complete** - Header with Start task (fuzzy picker) and Stop all, complete from each card, safe and reported actions (completed 2026-10-16)
- [ ] **Phase 3: Pause & Resume** - Per-card and header pause/resume owned by the pane that survives restarts, with Pomodoro-owned timers hidden

## Phase Details

### Phase 1: Live Timer Pane

**Goal**: As a TaskNotes user, I want to see and stop my running timer from a sidebar pane, so that I always know what I am timing and for how long.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: PANE-01, PANE-02, PANE-03, DISP-01, DISP-02, DISP-03, DISP-05, DISP-06, CTRL-01, SYNC-01, SYNC-02, SYNC-03, SYNC-04
**Success Criteria** (what must be TRUE):
  1. User opens the pane from the ribbon icon or the command palette. It opens in the right sidebar, or is revealed instead of duplicated if already open, and is still in the same place after restarting Obsidian.
  2. While a timer runs, the pane shows the task title (clicking it opens the task note), the session's elapsed time as H:MM:SS ticking every second, and the task's total tracked time including the running session. When several timers are running, it shows the most recently started one.
  3. User can stop the displayed timer with one click. The pane and TaskNotes' status bar both show it as stopped.
  4. Timers started or stopped elsewhere in TaskNotes (status bar, task cards, commands) appear in the pane within about a second. Changes from Obsidian Sync or hand-edited frontmatter also show up.
  5. When TaskNotes is missing, disabled, or older than 4.10, the pane shows a clear message. It reconnects by itself when TaskNotes is re-enabled or updated, without an Obsidian restart. After the computer sleeps and wakes, elapsed time is correct.

**Plans:** 5/5 plans executed

Plans:
**Wave 1**
- [x] 01-01-PLAN.md — Walking-skeleton scaffold: package-legitimacy gate, pinned toolchain, dev-vault deploy loop, plugin entry point, vendored TaskNotes contract (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-02-PLAN.md — Walking-skeleton read path: pane + bridge + store, live card for the most recently started timer (wave 2)
- [x] 01-04-PLAN.md — Seeded dev vault, README, and the Phase 1 UAT checklist (wave 2, parallel with 01-02; checklist section Stop requires 01-05)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 01-03-PLAN.md — Sync and resilience: retired-API-aware reconnect, debounced single-flight store, vault delete/rename, sleep/wake and visibility (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 01-05-PLAN.md — One-click Stop of the displayed timer through the serial write queue, with busy state, benign-race and failure handling (wave 4)

**UI hint**: yes
**Notes**: This is the walking skeleton, so the planner emits SKELETON.md. When nothing is timed, Phase 1 shows only a plain message. The "Start a task" button (DISP-04) comes with the picker in Phase 2. Research flag: check cold-start readiness timing by hand. `layout.ready` fires only once, and `isReady()` changes at a different point from `ready()`.

### Phase 2: Start, Switch & Complete

**Goal**: As a TaskNotes user, I want to start timers, stop every non-Pomodoro timer, and complete timed tasks from the pane, so that I can control regular time tracking without leaving the pane.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: DISP-04, CTRL-05, CTRL-06, CTRL-07, CTRL-09 (CTRL-10 dropped 2026-10-15)
**Success Criteria** (what must be TRUE):
  1. The pane has a header with "Start task" and "Stop all" buttons. When nothing is being timed, the header sits above the idle message. Start task opens a fuzzy task picker, and choosing a task starts its timer alongside any running ones.
  2. "Stop all" stops every running timer except one owned by an active Pomodoro, and the pane and TaskNotes' status bar reflect it.
  3. User can mark a timed task complete from its card. Its timer stops and TaskNotes shows the task with the completed status chosen in the plugin's settings (default: the same status TaskNotes' own toggle uses).
  4. While an action is in progress, the pane's controls are disabled. If an action fails, for example a task fails to start, a notice explains what happened.

**Plans**: 3/3 plans complete

Plans:
**Wave 1**
- [x] 02-01-PLAN.md — Start-task tracer, deterministic searchable picker, and shared busy controls

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02-02-PLAN.md — Pomodoro-safe sequential Stop all with live eligibility

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 02-03-PLAN.md — Status-first Complete action and live completion-status setting

**UI hint**: yes
**Notes**: Discussed 2026-10-15 (see `02-CONTEXT.md`). Switching was removed: the pane shows one card per timer, and a header holds "Start task" and "Stop all". Stop all leaves Pomodoro-owned timers running. The picker matches TaskNotes' Pomodoro selector: archive-flag tasks are left out, and completed tasks are listed last. All writes go through one serial queue.

### Phase 3: Pause & Resume

**Goal**: As a TaskNotes user, I want to pause and resume timers from the pane, one card or all at once, so that I can take a break without losing my place. Paused state survives restarts, and Pomodoro-owned timers are hidden from the pane.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: DISP-07, CTRL-02, CTRL-03, CTRL-04 (CTRL-08 dropped 2026-10-16)
**Success Criteria** (what must be TRUE):
  1. User can pause any running timer from its card, or all regular timers with "Pause all". Each entry closes and its card stays in place, shown as paused with its session time frozen.
  2. User can resume a paused task from its card, or all paused tasks with "Resume all". This opens a new time entry on the same task, and the session time continues from where it paused.
  3. Paused tasks still show as paused after restarting Obsidian, and starting another timer doesn't clear them. A pause clears when the task is resumed, stopped (including Stop all), completed, deleted, or taken over by a Pomodoro. Starting a paused task elsewhere counts as resuming it.
  4. The timer owned by an active Pomodoro doesn't appear in the pane, and the picker marks its task. If Pomodoro state can't be read, every timer is shown with a muted note, and Pause all and Stop all are disabled.

**Plans:** 4 plans

Plans:
**Wave 1**
- [ ] 03-01-PLAN.md — Per-card Pause/Resume tracer with stopwatch Session, then merged versioned data.json persistence

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 03-02-PLAN.md — Pauses follow TaskNotes and Obsidian: Pomodoro takeover, completed elsewhere, delete, rename/move, race-safe reconcile

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 03-03-PLAN.md — Paused-card Stop and Complete, Stop all clears pauses, header Pause all and Resume all

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 03-04-PLAN.md — Hide the Pomodoro-owned entry, "can't check Pomodoro" line, picker Pomodoro tag and start guard

**UI hint**: yes
**Notes**: Discussed 2026-10-16 (see `03-CONTEXT.md`). TaskNotes has no record of pause, so the pane persists its own pause records, including accumulated session time, in `data.json` next to settings. Detecting rename and move needs research (`task.moved` isn't in the vendored contract). Pane control of Pomodoro is deferred to a later version. Test with a live Pomodoro session.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Live Timer Pane | 5/5 | In Progress | - |
| 2. Start, Switch & Complete | 3/3 | Complete    | 2026-10-16 |
| 3. Pause & Resume | 0/TBD | Not started | - |
