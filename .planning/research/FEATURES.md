# Feature Research

**Domain:** Obsidian sidebar pane that monitors and controls TaskNotes' regular (non-Pomodoro) task time tracking. It is a companion plugin, not a replacement.
**Researched:** 2026-10-13
**Confidence:** HIGH for what TaskNotes already provides (read from the TaskNotes source at v4.13.8, commit `4516792`, 2026-10-12, plus its docs and release notes). HIGH for jane-t/TaskNotesTimer (read from source, v2.0.1). MEDIUM for Toggl, Clockify and other Obsidian trackers (READMEs, vendor help pages and search results).

---

## Starting Point: What Already Exists and Where the Gap Is

These facts shape every category below, so they come first.

### TaskNotes (v4.13.8) time-tracking surfaces, verified in source

| Surface | What it does today | Limits that leave room for this pane |
|---|---|---|
| **Status bar item** (`src/ui/StatusBarService.ts`, setting `showTrackedTasksInStatusBar`) | Shows `Tracking: <title, cut at 30 chars> (m:ss)` with a live tick every second (added 4.8.0, #1655). Has a square **stop button** (added 4.13.7, #2326). With several trackers it shows `Tracking N tasks (total)`. Clicking the item opens the task note. | Small text in a corner. No pause, switch or start. No task total, no estimate, no recent tasks, no today view. |
| **Commands** | Start or stop for the open task note. "Stop active time tracking" (opens a selector if several trackers are running). "Start time tracking (select task)" uses a fuzzy selector of non-archived tasks that are not being tracked. "Edit time entries" (selector, then editor). "Create or open task with time tracking". | **No switch command.** Starting a new task does *not* stop the running one (open FR #1670; a commenter on #2326 asked for a switch command and button). No pause or resume. |
| **Task cards** (list, kanban, calendar, Bases) | Tracked cards get a blue outline (`task-card--actively-tracked`). Start or stop sits in the **context menu** and the Task Action Palette. Cards can show `timeEstimate` ("Xh estimated") and `totalTrackedTime` ("Xh tracked"). | No one-click play button on cards (open FR #2307). Reaching start or stop takes 2–3 clicks inside a menu. |
| **TimeEntryEditorModal** | Lists each entry with start, end and description. Add and delete entries; shows a running total. | Modal only, opened from the context menu or a command. |
| **Pomodoro view** (`src/views/PomodoroView.ts`) | The **UX precedent**: a progress ring with a large timer, "Choose task" and "Clear task" buttons, the chosen task rendered as a task card, Start / Pause / Stop / Skip-break, and a "pomodoros today" stat that opens the stats view. | Pomodoro only. When a Pomodoro has a task, it starts a regular tracker, and it stops only trackers it created. |
| **Runtime JS API** (since 4.10.0; `app.plugins.getPlugin("tasknotes").api`, `apiVersion === 1`, `hasCapability()`) | `api.time.start(path, {description})`, `stop(path)`, `active()` returning `[{taskPath, task, entry, index}]`, `task(path)` (summary plus normalized entries), `summary({period:"today"})`, `append`, `deleteEntry`. Events: `time.started`, `time.stopped`, `task.updated`, `task.completed`, and others. Lifecycle events: `ready`, `cache.changed`, `unloading`, `settings.changed`. Also `api.ui.taskMenu.show()`, `api.tasks.complete()`, `api.query.tasks()`. | This is a **public, versioned, capability-gated contract**. It largely replaces the "TaskNotes internals" risk named in PROJECT.md (stack and architecture research should confirm this). |
| **Concurrency model** | **Several trackers on *different* tasks may run at once**. Duplicate trackers on the same task are refused. | The pane cannot assume there is one active timer (see TS-11). |
| **Pause** | Does not exist for regular tracking. Entries are only `{startTime, endTime?, description?}`. | Pause has to be stop plus a new entry, and the pane must remember the "paused" state itself (see TS-12). |

### jane-t/TaskNotesTimer (v2.0.1, Tauri desktop overlay), verified in source

- A 227×200 always-on-top widget. It polls `GET /api/time/active` every 3 s by default and refreshes the task list every 30 s.
- The task dropdown is a `<select>` filtered to **status = in-progress only** (not archived, not completed), sorted by due date. There is no search.
- **START stops every active session, then starts the chosen task.** It enforces one timer at a time, which TaskNotes does not.
- STOP is the only other control. The big HH:MM:SS clock shows the *current session only*. A dot pulses while running, and a disconnect banner appears after 3 failed polls.
- **Missing:** pause/resume, task total, estimate, recent tasks, today log, entry description, opening the task, completing the task.

### Demand signals in the TaskNotes issue tracker

- **#2307 (open), "Quick Time Tracking Button".** A commenter asked for *"a panel like the pomodoro one [where] you could select the task and press play and pause and stop … and you could mark it as concluded as well."* That is almost exactly this project.
- **#2326 (closed in 4.13.7).** It got the stop button. A follow-up asked for *"a command and maybe button to switch the tracked task"*, which is not built yet.
- **#1670 (open).** Asks that starting one task stop all other trackers.
- **#2366 (open).** Asks for reminders for time tracking. A commenter wants *"a reminder … when tracked time approaches the timeEstimate value."*
- **#1079 (closed, deferred).** The maintainer says what is missing is *"a fuller management/status UI for all active timers."*

**The gap in one line:** TaskNotes has every primitive (start, stop, active, entries, events) but no persistent, glanceable control surface for regular tracking. Its only always-visible indicator is the status bar, and **switch** and **pause** do not exist anywhere.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Without these the pane is no better than the status bar, and the user goes back to it.

| ID | Feature | Why Expected | Complexity | Notes |
|---|---|---|---|---|
| TS-1 | **Dockable sidebar view, ribbon icon and "Open timer pane" command** | Same placement as the Pomodoro view, which is the precedent PROJECT.md names. | LOW | A standard `ItemView`. Re-open in the same sidebar position and reveal it if it already exists (no duplicate leaves). Obsidian restores it with the workspace layout. Users can drag it into a native Obsidian pop-out window, so a custom "always on top" window is not needed. |
| TS-2 | **Current task header** (title in full, wrapping; click opens the note) | Every timer shows *what* is being timed. The status bar cuts titles at 30 chars. | LOW | Opening the note matches the status bar's click behaviour. Optional secondary line: project or status. |
| TS-3 | **Live elapsed time for the current entry** (H:MM:SS, large) | The core promise. TaskNotesTimer, Toggl, Clockify and the Pomodoro view all centre on a big clock. | LOW | Compute `now - entry.startTime` on every tick. **Never** keep a counter (see Anti-Features). Tick once per second, and pause rendering while the leaf is hidden, as the Pomodoro view does with `pomodoro-view--rendering-paused`. |
| TS-4 | **Clear idle state** ("Not tracking" plus a prominent "Start a task" button) | The empty state must still offer the main action, so no clicks are wasted. | LOW | The idle state hosts the picker trigger and the recent list (TS-6, TS-13). |
| TS-5 | **Stop** (one click) | Done means stopping in one or two clicks. | LOW | `api.time.stop(path, ctx)`. Disable the button while the write is in flight, as TaskNotes' `stopTrackingPending` does. Clears any paused state. |
| TS-6 | **Start or switch via a searchable task picker** | Switching is the headline gap. TaskNotesTimer's in-progress-only `<select>` is too narrow, and TaskNotes' own selector does not stop the running timer. | MEDIUM | An Obsidian `SuggestModal` or `FuzzySuggestModal` over non-archived, non-completed tasks. Rank tasks touched recently or in-progress first. Show estimate and tracked time in each row. **Switch means stop the active tracker(s), then start the chosen one**, in that order, with a notice if either step fails. If the chosen task is already active, do nothing. Picking from the picker counts as click 2 of the 2-click budget. |
| TS-7 | **Stays in sync with timers started or stopped elsewhere** (status bar, cards, commands, Pomodoro, HTTP API, Workflows) | The pane is useless if it shows stale state. TaskNotesTimer's main job is this sync, done with a 3 s poll. | MEDIUM | Subscribe to runtime `time.started` / `time.stopped` / `task.updated` / `task.deleted` / `task.moved`, plus lifecycle `cache.changed` / `ready` / `unloading`. Re-read `api.time.active()` on each event. These events are derived from TaskService updates (`TaskNotesAPI.ts`, which compares active-entry counts). File edits that skip TaskService, such as Obsidian Sync from another device or hand edits, may only arrive through cache or metadata events, so keep a cheap fallback (a metadataCache `changed` listener or a slow reconcile every 10–30 s). |
| TS-8 | **Task total tracked time, including the live entry** | "How long have I spent on this task?" is part of the core value. Cards already show "X tracked". | LOW | **TaskNotes totals leave out the active entry** (`calculateTotalTimeSpent` skips entries with no end). Compute closed-entry seconds plus live elapsed in the pane. TaskNotes' summary helpers work in whole minutes, so the pane should work in seconds from the raw timestamps. |
| TS-9 | **Graceful degradation** (TaskNotes missing or disabled, API version or capability missing, TaskNotes still loading) | PROJECT.md constraint. Companion-plugin docs require checking `apiVersion` and `hasCapability`. | LOW–MEDIUM | Show an inline message such as "TaskNotes not found / needs ≥ 4.10" instead of crashing. Re-attach on `ready` and detach on `unloading`. Requires capabilities `time.read`, `time.write`, `tasks.read`, `tasks.events`, `lifecycle.events`. |
| TS-10 | **Correct after a restart or reload** | The timer must survive closing Obsidian. SSTT and Timekeep both advertise timestamp-based persistence. | LOW | Timestamp-based, so this comes free if TS-3 is done right. Paused state (TS-12) must be stored in plugin data. |
| TS-11 | **Handles several active timers** | TaskNotes allows them, and the status bar, Pomodoro view and HTTP API can all create them. | MEDIUM | Primary display: the most recently started active entry. If more than one is running, show a compact "Also tracking: A (12:03) [stop], B (0:41) [stop]" list. Switch stops **all** active trackers (single-focus model, matching TaskNotesTimer and FR #1670). Decide this explicitly in requirements. |
| TS-12 | **Pause / resume** | Named in PROJECT.md's core value. Users coming from the Pomodoro view expect a pause button. Toggl and Clockify do the same thing as "continue" (a new entry with the same details). | MEDIUM | Pause = `api.time.stop`, then persist `{pausedTaskPath, pausedAt}` in plugin data. The UI then shows "Paused: <task>, paused 4m ago, [Resume] [Stop]". Resume = `api.time.start(pausedTaskPath)` and clear the state. Stop while paused = clear the state only. **Clear the paused state if any timer starts elsewhere** or the task is completed, deleted or archived. Without the stored state, "paused" looks exactly like "stopped" in the data. |
| TS-13 | **Recent tasks, one-click resume** | The Toggl and Clockify play-on-a-past-entry pattern is the fastest way to switch back. Named in PROJECT.md. | MEDIUM | Work out the list from `timeEntries` across cached tasks: distinct tasks ordered by latest entry end (or start), top 5–8. Leave out completed and archived tasks and the currently active one. One click equals switch (TS-6 semantics). There is no separate store to drift, and it works across devices. |

### Differentiators (Competitive Advantage)

None of the existing surfaces do these. Each one ties back to the core value: see it, and act in one or two clicks.

| ID | Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|---|
| D-1 | **Estimate progress** (progress bar or "1h 20m / 2h", turning a warning colour when over) | Turns "time spent" into "am I on budget?". Commenters on #2366 asked for this. Nothing in TaskNotes shows tracked time against the estimate live. | LOW | `task.timeEstimate` is in minutes. Hide the bar when there is no estimate. Cheap and high value, so it is a strong P1 candidate. |
| D-2 | **Today's log** (per-task totals for today plus a list of entries, including the live one; today's grand total shown at the top) | Answers "what did I do today?" without opening stats. Toggl has this. TaskNotes only has the Pomodoro and general stats views. | MEDIUM | **Build it from raw entries, not from `api.time.summary({period:"today"})`.** Verified in `timeTrackingUtils.ts`: summary assigns each entry to the day it *started*, rounds each entry down to whole minutes (so pause/resume micro-entries undercount), and returns only the top 10 tasks. Clip entries that cross midnight. Each row opens the task, and row actions can resume it. Collapsible section; secondary per PROJECT.md. |
| D-3 | **Optional "what are you working on?" description** when starting or switching | Toggl and Clockify centre on the description. TaskNotes entries already support `description`, and the editor shows it. | LOW | `api.time.start(path, {description})`. Must be optional and off by default so it never costs an extra click. Optionally carry the description over on resume. |
| D-4 | **Complete task from the pane** (checkmark next to the current task) | #2307 asked for "mark it as concluded". Finishing a task usually means stopping its timer too. | LOW | `api.tasks.complete(path)`. TaskNotes' auto-stop setting (on by default) stops the tracker. If that setting is off, call `time.stop` first. Then offer the picker or recent list. |
| D-5 | **Pane commands for hotkeys**: "Pause/resume current timer", "Switch task…", "Stop current timer", "Open timer pane" | #2326 asked for a switch command. Keyboard users get the pane's semantics without the mouse. | LOW | Reuse the same controller the buttons use. "Switch task…" is the command TaskNotes does not have. |
| D-6 | **TaskNotes' own context menu on the current task** (right-click or "⋯") | Gives access to every task action (status, priority, dates, "Edit time entries") with no reimplementation. | LOW | `api.ui.taskMenu.show({taskPath, event})` is a public runtime API. |
| D-7 | **"Fix entries" shortcut** for "I forgot to stop" or "I started late" | Timekeep and SSTT both treat editing entries as essential. Forgotten timers are the most common data-quality problem. | LOW (via menu) / MEDIUM (direct) | Easiest route: D-6's menu includes "Edit time entries". Opening `TimeEntryEditorModal` directly needs a non-public plugin method (`plugin.openTimeEntryEditor`), so guard it with feature detection or skip it. |
| D-8 | **Long-running timer nudge** (the clock changes colour or shows a one-time notice after N hours, or once the estimate is passed) | A cheap substitute for idle detection. Catches the forgotten timer. Matches FR #2366. | LOW–MEDIUM | Purely visual first (CSS state), with an optional single `Notice`. No OS-level idle monitoring. |
| D-9 | **Rich current-task context** (project, due, priority, status chips; optional mini task card) | The Pomodoro view renders the chosen task as a task card. Context helps decide whether to switch. | LOW–MEDIUM | Prefer drawing a few chips yourself rather than embedding TaskNotes' card renderer (an internal API). |
| D-10 | **Create a new task and start tracking from the picker** | Ad-hoc work ("call with X") often has no task yet. TaskNotes' own selector allows creation. | MEDIUM | `api.tasks.create({title})`, then switch. Optional NLP through `api.nlp.parse`. Can be deferred. |
| D-11 | **Responsive and compact layout** (narrow sidebar, short heights, readable in light and dark themes) | Sidebars are 250–400 px wide. The Pomodoro view has layout-size classes for the same reason. | LOW–MEDIUM | Use Obsidian CSS variables only. Hide secondary sections when space is short. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| **Pane-owned timer state** (an in-memory counter, or the pane's own record of "running since") | Seems simpler than reading TaskNotes. | Drifts on sleep, reload or a delayed tick (TaskNotes fixed the same bug in Pomodoro, #136/#1500). Goes out of sync with the status bar and other devices. | Always derive from `timeEntries` timestamps through `api.time.active()`. The only pane-owned state is the paused marker (TS-12). |
| **Writing `timeEntries` frontmatter directly** | Avoids depending on TaskNotes APIs. | Skips TaskService, so no events, cache updates, webhooks or status bar refresh. Risks format drift (see the timezone bug #1602). Breaks PROJECT.md's data-format rule. | `api.time.start/stop/append`. Companion-plugin docs say this explicitly. |
| **A new "paused" field in task frontmatter** | Would make pause survive across devices. | Invents schema TaskNotes does not know. Other tools see a stopped timer anyway. | Store paused state in plugin `data.json`. Accept that it is per device. |
| **Pomodoro controls or countdown timers** (#1160) | "While you're in there…" | Duplicates the Pomodoro view and confuses ownership (Pomodoro stops only trackers it created). Out of scope per PROJECT.md. | At most a link to open the Pomodoro view. Show Pomodoro-created trackers like any others. |
| **Reports, charts, CSV/PDF export** (Timekeep-style; #978, #425) | Natural next step after a today log. | Big scope. TaskNotes already has the Stats and Pomodoro Stats views. Out of scope per PROJECT.md. | Today's log only, plus an "Open TaskNotes stats" link. |
| **OS-level idle detection** (the Toggl desktop style) | Accurate time without manual fixes. | Needs system activity hooks, is platform-specific, and Obsidian does not offer it cleanly. Easy to get wrong and annoying. | D-8 long-running nudge plus D-7 entry fixing. |
| **HTTP API polling** (the TaskNotesTimer architecture) | Proven by TaskNotesTimer. | Needs the API server and a token (TaskNotesTimer v2.0.1 had to add 401 handling), adds latency, out of scope. | In-process runtime API plus events. |
| **Several concurrent entries on the *same* task** (#1079) | Parallel work. | TaskNotes refuses it, and stop cannot target a specific entry. The maintainer deferred it. | Do not support it. Resume on an already-active task does nothing. |
| **A custom always-on-top or floating window** | TaskNotesTimer has it. | Out of scope. Obsidian already lets any leaf be moved to a pop-out window. | Document "drag the pane to a new window". |
| **Rebuilding the time-entry editor or the task card renderer** | Polished in-pane editing. | Duplicates TaskNotes UI and pulls in internal APIs that will break. | D-6 / D-7: reuse TaskNotes' context menu and modal. |
| **Auto-start or auto-stop rules** (start on status change, and so on) | Automation. | TaskNotes core already auto-stops on complete, and TaskNotes Workflows covers auto-start. | Leave it to TaskNotes and Workflows. Make sure the pane reacts correctly when those rules fire. |
| **Another status-bar item** | Visible even when the pane is closed. | TaskNotes already shows one with a stop button. Two indicators is noise. | None. The pane complements the status bar. |
| **Toggl-style projects, clients, billable flags, tags on entries** | Familiar from SaaS trackers. | Not part of the TaskNotes data model. Scope creep. | TaskNotes projects and tags already exist on the task, so show them read-only (D-9). |

---

## Feature Dependencies

```
TS-9 TaskNotes API detection / graceful degrade
  └─ (gates everything below)

TS-1 Sidebar view shell
  └─ TS-7 Sync layer (events + reconcile → "active entries" model)
       ├─ TS-3 Live elapsed (render tick from startTime)
       │    └─ TS-10 Correct after reload (free if TS-3 is timestamp-derived)
       ├─ TS-2 Current task header
       │    ├─ TS-8 Task total incl. live entry
       │    │    └─ D-1 Estimate progress ──enhances──> D-8 Long-running / over-estimate nudge
       │    ├─ D-4 Complete task
       │    ├─ D-6 TaskNotes context menu ──enables──> D-7 Fix entries
       │    └─ D-9 Rich task context
       ├─ TS-11 Multiple active timers display
       └─ TS-5 Stop
            └─ TS-12 Pause/resume (stop + persisted paused marker + start)

TS-6 Task picker + switch semantics (stop-all → start)
  ├─ requires TS-5 (stop) and TS-7 (know what is active)
  ├─ TS-13 Recent tasks (reuses switch semantics; derived from timeEntries)
  ├─ D-3 Optional description on start
  ├─ D-10 Create-and-start
  └─ D-5 Commands (Switch…, Pause/resume, Stop) reuse the same controller

TS-4 Idle state ──hosts──> TS-6 picker trigger + TS-13 recent list

D-2 Today's log
  └─ requires an entry-aggregation helper (seconds, midnight-clipped)
       └─ shared with TS-8 (total) and TS-13 (recency)

Conflicts:
  TS-11 "switch stops all" ──conflicts──> users who run parallel trackers on purpose
      (resolve with an explicit decision; a setting is a later option, not v1)
  TS-12 paused marker ──conflicts──> external starts (must clear marker on any time.started)
```

### Dependency Notes

- **Everything needs TS-7 and TS-9 first.** The pane is a view over TaskNotes state, so the "active entries" model and its event and reconcile loop is the foundation. Build it before any controls.
- **TS-12 (pause) needs TS-5 (stop) and plugin-data persistence**, and it has to watch TS-7 events to stay correct (clear the marker when a timer starts elsewhere or the task is completed or deleted).
- **TS-13 (recent), TS-8 (total) and D-2 (today) share one entry-aggregation helper.** Write it once, in seconds, from raw `timeEntries`, with midnight clipping. Do not use `api.time.summary` (it rounds down to minutes, assigns entries by start day, and returns only the top 10).
- **TS-6 switch semantics must be fixed before TS-13 and D-5.** All three call the same `switchTo(path)` routine.
- **D-7 can come almost free through D-6** (TaskNotes' menu already has "Edit time entries"). Only a direct button needs the non-public `openTimeEntryEditor`.

---

## MVP Definition

### Launch With (v1): the core value

- [ ] **TS-9** API detection and degraded states. Without it the pane crashes or misleads.
- [ ] **TS-1** Sidebar view, ribbon icon, command. The container.
- [ ] **TS-7** Sync layer (events plus reconcile fallback). Without it, every control is untrustworthy.
- [ ] **TS-2 / TS-3 / TS-4** Current task, live elapsed, idle state. "Always see what is timed and for how long."
- [ ] **TS-8** Task total including the live entry. Part of the core value statement.
- [ ] **TS-5** Stop. One click.
- [ ] **TS-6** Picker plus switch (stop-all, then start). The headline gap TaskNotes leaves.
- [ ] **TS-11** Multiple active timers shown correctly. TaskNotes creates them, so v1 must not lie about them.
- [ ] **TS-12** Pause/resume with a persisted marker. Named in the core value.
- [ ] **TS-13** Recent tasks, one-click resume. Named in PROJECT.md. Reuses switch.
- [ ] **D-1** Estimate progress. Very cheap once TS-8 exists, and high value.

### Add After Validation (v1.x)

- [ ] **D-2** Today's log. Secondary per PROJECT.md. Add once the aggregation helper has been proven by TS-8 and TS-13.
- [ ] **D-5** Commands (Switch…, Pause/resume, Stop). Add when hotkey use turns out to matter; cheap.
- [ ] **D-6 / D-7** TaskNotes context menu, which also gives "fix entries". Add once forgotten-timer corrections come up.
- [ ] **D-4** Complete-from-pane. Add if finishing tasks from the pane feels natural in use.
- [ ] **D-3** Optional entry description. Add if the user starts writing entry notes.
- [ ] **D-11** Compact layout polish. Do after real sidebar use.

### Future Consideration (v2+)

- [ ] **D-8** Long-running or over-estimate nudge. Needs tuning to avoid nagging.
- [ ] **D-9** Rich task context chips or card. Nice, not core.
- [ ] **D-10** Create-and-start from the picker. Adds task-creation edge cases.
- [ ] Setting: "switch stops only the primary timer" instead of all of them. Only if parallel tracking turns out to be real for the user.
- [ ] Mobile layout check. TaskNotes runs on mobile, but PROJECT.md targets desktop.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| TS-9 API detection / degrade | HIGH | LOW | P1 |
| TS-1 Sidebar view + ribbon + command | HIGH | LOW | P1 |
| TS-7 Sync with external starts/stops | HIGH | MEDIUM | P1 |
| TS-2 Current task header | HIGH | LOW | P1 |
| TS-3 Live elapsed | HIGH | LOW | P1 |
| TS-4 Idle state | MEDIUM | LOW | P1 |
| TS-5 Stop | HIGH | LOW | P1 |
| TS-6 Picker + switch | HIGH | MEDIUM | P1 |
| TS-8 Task total incl. live | HIGH | LOW | P1 |
| TS-11 Multiple active timers | MEDIUM | MEDIUM | P1 |
| TS-12 Pause/resume | HIGH | MEDIUM | P1 |
| TS-13 Recent tasks | HIGH | MEDIUM | P1 |
| TS-10 Correct after reload | HIGH | LOW (falls out of TS-3) | P1 |
| D-1 Estimate progress | MEDIUM | LOW | P1 |
| D-2 Today's log | MEDIUM | MEDIUM | P2 |
| D-5 Pane commands (switch/pause) | MEDIUM | LOW | P2 |
| D-6 TaskNotes context menu | MEDIUM | LOW | P2 |
| D-7 Fix entries shortcut | MEDIUM | LOW via D-6 | P2 |
| D-4 Complete task | MEDIUM | LOW | P2 |
| D-3 Entry description | LOW | LOW | P2 |
| D-11 Compact layout | MEDIUM | LOW–MEDIUM | P2 |
| D-8 Long-running nudge | MEDIUM | LOW–MEDIUM | P3 |
| D-9 Rich task context | LOW | LOW–MEDIUM | P3 |
| D-10 Create-and-start | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | TaskNotes status bar / commands | TaskNotes Pomodoro view | jane-t/TaskNotesTimer | Toggl / Clockify | Obsidian trackers (SSTT, Timekeep, Day Planner) | **Our approach** |
|---|---|---|---|---|---|---|
| Always-visible current task | Status bar, title cut at 30 chars | Yes (Pomodoro only) | Yes (overlay) | Running-timer bar | Timekeep: status bar; Day Planner: "active clocks" in sidebar | Full title in the pane, click to open the note |
| Live session time | m:ss, ticks every 1 s | Countdown ring | Big HH:MM:SS (session only) | Big running clock | Code-block render | Big H:MM:SS from `startTime` |
| Task total vs estimate | Cards show "X tracked" / "X estimated" (static) | — | — | Project totals | Per-block totals | Total including live entry, plus estimate progress bar |
| Stop | Status-bar button (4.13.7), command | Stop | STOP | Stop | Stop/End | One-click stop |
| Pause/resume | **None** | Pause/Resume (Pomodoro only) | **None** | "Continue" = new entry | Day Planner: resume a completed clock | Pause = stop plus marker; Resume = new entry (Toggl "continue" model) |
| Switch task | **None** (start does not stop others) | Choose/clear task | Dropdown (in-progress only); START stops all | Start new = stop current | — | Fuzzy picker; switch = stop all, then start |
| Recent tasks | — | — | — | Recent entries with play buttons | — | Derived from `timeEntries`, one-click resume |
| Today's log | — | "Pomodoros today" stat → stats view | — | Day list with totals | Timekeep exports; SSTT stats companion | Collapsible today section (v1.x), built from raw entries |
| Sync with other surfaces | Native | Native | 3 s HTTP poll | Cloud sync | N/A (own data) | Runtime events plus reconcile fallback |
| Entry editing | TimeEntryEditorModal | — | — | Full editor | Timekeep/SSTT inline edit | Reuse TaskNotes' menu or modal |
| Multiple timers | Count plus total | — | Forces single | Single | Timekeep: several in status bar | Primary plus "also tracking" list |
| Setup cost | None | None | HTTP API, token, separate install | Account | None | None (in-process) |

---

## Feature-Level Gotchas Found During Research

These are flagged for PITFALLS and for requirements wording. Each was verified in the TaskNotes source.

1. **Totals leave out the running entry.** `calculateTotalTimeSpent` skips entries with no `endTime`, so the pane must add live elapsed itself (TS-8).
2. **`api.time.summary` is unsuitable for today's log.** It assigns each entry to the day it started, rounds each entry down to whole minutes (pause/resume creates many short entries, each losing up to 59 s), and returns only the top 10 tasks (D-2).
3. **Starting does not stop other trackers.** Switch has to be built as two writes (stop, then start). Decide what happens if the stop fails. Recommendation: abort the start and show a notice (TS-6).
4. **Runtime time events are inferred from TaskService update diffs.** Changes that skip TaskService (Sync from another device, hand-edited YAML) may only show up through cache events, so a reconcile fallback is required (TS-7).
5. **Version floor.** The runtime API needs TaskNotes ≥ 4.10.0. The status-bar stop button is ≥ 4.13.7, which matters only for comparison. Feature-detect with `hasCapability`, not version strings (TS-9).
6. **Starting a task that is already tracked is refused** with a notice. Make resume and switch to the active task do nothing in the pane, rather than surfacing that notice.

---

## Sources

- TaskNotes source, v4.13.8, commit `4516792` (2026-10-12), cloned from https://github.com/callumalpass/tasknotes. Files read: `src/ui/StatusBarService.ts`, `src/ui/TaskActionCoordinator.ts`, `src/commands/taskNotesCommands.ts`, `src/views/PomodoroView.ts`, `src/modals/TimeEntryEditorModal.ts`, `src/modals/TaskSelectorWithCreateModal.ts`, `src/ui/taskCardProperties.ts`, `src/ui/taskCardState.ts`, `src/api/runtime-api.ts`, `src/api/TaskNotesAPI.ts`, `src/utils/helpers.ts`, `src/utils/timeTrackingUtils.ts`, `src/types.ts`. Confidence: HIGH (primary source).
- TaskNotes docs: `docs/features/time-management.md`, `docs/javascript-api.md`, `docs/companion-plugins.md`. Release notes `docs/releases/4.8.0.md`, `4.10.0.md`, `4.13.7.md`. Confidence: HIGH.
- TaskNotes issues: #2307, #2326, #1670, #2366, #1079, #1655, #296 (GitHub REST API). Confidence: HIGH as evidence of user demand.
- jane-t/TaskNotesTimer v2.0.1 source (`README.md`, `VERSION_HISTORY.md`, `src/main.js`, `src/index.html`): https://github.com/jane-t/TaskNotesTimer. Confidence: HIGH.
- Super Simple Time Tracker README: https://github.com/Ellpeck/ObsidianSimpleTimeTracker. Confidence: MEDIUM.
- Timekeep README: https://github.com/jacobtread/obsidian-timekeep. Confidence: MEDIUM.
- Day Planner README (time-tracking / active clocks section): https://github.com/ivan-lednev/obsidian-day-planner. Confidence: MEDIUM.
- Clockify extension help (continue from entry list, play icon copies details): https://clockify.me/help/apps/chrome-extension and https://clockify.me/chrome-time-tracking. Confidence: MEDIUM.
- Toggl Track idle detection and reminders: https://support.toggl.com/focus/toggl-focus-desktop-app and https://dev.classmethod.jp/articles/toggl-track-desktop-app-solving-timer-problems/. Confidence: LOW–MEDIUM (secondhand for "continue").
- Not reviewed, by user preference: the zczs520/tasknotes 5.2.3 fork.

---
*Feature research for: TaskNotes companion timer pane (Obsidian)*
*Researched: 2026-10-13*
