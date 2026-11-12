<!-- Copied from obsidian-tasknotes-taskctrl/docs/DECISIONS.md on 2026-11-12 (Q28). -->

## v0.3 resolutions (from /gsd-new-milestone, 2026-11-12)

- **Q27 (settled):** The pane has two tabs. **Staged** shows the user's staged tasks; **Timers** shows all regular timed tasks (as in v0.2). Both use the existing card style. Each tab has its own independent, persisted order; reordering in one does not affect the other. **Supersedes Q23** (single list with a "Running (not staged)" section).
- **Q25 (rejected):** No Pomodoro display. v0.2 behavior is kept: Pomodoro-owned entries are hidden in both tabs; starting a task Pomodoro is timing is refused with a notice.
- **Q7 (dropped):** No 🍅 Pomodoro start button on rows in v0.3.
- **Q26, Q29 (confirmed):** Settings in the existing tab; staged order and Done-today record saved via `persistAll`; release 0.3.0.
- **Q28 (confirmed):** Log copied here; taskctrl directory deleted.
- **Q5 mobile up/down and Q21/Q22 rename:** in v0.3 scope.

## Original README (obsidian-tasknotes-taskctrl)

An Obsidian plugin providing a "dashboard" for controlling active tasks.

The main feature is task staging and ordering.
Pick a subset of your (many) tasks to tackle for the day.
Prioritize how you see fit.
Start time tracking (Pomodoro or standard).
# Decision log: task staging and the TaskNotes Timer Pane merge

This is a running log from the design grilling session that began on 2026-11-11.
Decisions are recorded as they are made.
Superseded decisions stay in the log and are marked as superseded.
Once Q28 is settled, this file moves to wherever the merged plugin's planning lives.

## Context

- The target vault is the Personal Vault, running TaskNotes 4.13.0.
  It has 38 tasks in `TaskNotes/Tasks`, which TaskNotes identifies by the `task` tag.
- The statuses are `none`, `open`, `postponed`, `in-progress` and `done`.
  The priorities run from `0-none` to `3-high`.
- The vault has no TaskNotes user fields (`userFields: []`).
- `scheduled` has never been used.
- One task in the vault is recurring.
- The workflow is to pick the subset of tasks that matter today, put them in order, and work down the list.
  Pomodoro or regular time tracking starts with one click from the list.

## Settled

| # | Decision | Notes |
|---|----------|-------|
| Q1 | ~~New standalone plugin~~ | **Superseded by Q22.** |
| Q2 | Staging uses its own frontmatter field, **not `scheduled`**. | This keeps `scheduled` free for its intended purpose. This was the user's own choice. |
| Q3 | The staged list's order is stored in the plugin's own data, as a list of task paths. | Tasks staged from outside the pane, such as from chat, join at the bottom. |
| Q4 | Completed tasks stay in a "Done today" section for the rest of the day, then clear. | |
| Q5 | The plugin works on desktop and mobile, with mobile as best effort. | On mobile, move up and move down buttons stand in for drag. |
| Q6 | Development uses its own seeded dev vault. | With the merge (Q22), this means the timer pane's existing dev vault. |
| Q7 | While a Pomodoro is active, 🍅 is disabled on every row, and the row that owns the Pomodoro is marked. | |
| Q8 | The minimum TaskNotes version is 4.13.0. | The bridge checks each feature it uses before using it. |
| Q9 | The field holds a date, `staged: YYYY-MM-DD`. The key defaults to `staged` and can be changed in settings. | The key must match a registered user field (see Q15). |
| Q10 | Unfinished tasks roll forward with no write. The list shows unfinished tasks with `staged <= today`, along with how many days each has been staged. | Staging a task again refreshes its date. |
| Q11 | Unstaging deletes the key from the frontmatter. | |
| Q12 | Completing a task clears `staged` immediately. "Done today" is built from the plugin's record of what it staged plus `completedDate == today`. | |
| Q13 | ~~Rows get start buttons plus stop. Pause stays in the timer pane.~~ | **Superseded by Q23.** |
| Q14 | The stage picker lists every task that is not done or archived, using the timer pane's ranked picker. It makes no suggestions. | |
| Q15 | The user registers `staged` once as a TaskNotes user field of type date. The plugin writes it through `api.tasks.update`, reads it from TaskInfo, and shows a setup notice if the field is missing. | The plugin does not register it automatically, because that would rely on TaskNotes internals. |
| Q16 | For a recurring task, ✓ completes today's instance with `api.recurring.toggleCompleteInstance`. "Done today" for a recurring task means `complete_instances` includes today. `staged` is cleared on completion, the same as for any other task. | `api.tasks.complete` would close the whole series. |
| Q17 | Each row has a ✓ complete button. | |
| Q18 | The view opens in the right sidebar, from a ribbon icon or a command, and can be dragged elsewhere. | |
| Q19 | The day rolls over at a configurable hour, 4 AM by default. | |
| Q20 | Each row offers these controls: click the title to open the note, ✕ to unstage, right-click for TaskNotes' task menu, and a drag handle with ArrowUp/Down for reordering. | |
| Q21 | ~~id `tasknotes-taskctrl`~~, display name **"TaskNotes Task Control"**. | The id is superseded by Q22. The display name stands. |
| Q22 | **Merge into the timer pane repo** as its next version. The id stays `tasknotes-timer-pane` and the display name becomes "TaskNotes Task Control". | This keeps the install, saved data, release history and `.planning`. |
| Q23 | **One list.** A running staged row expands in place into the full timer card, with elapsed time, pause, stop and complete. Running tasks that are not staged appear in a small "Running (not staged)" section at the top, ordered by the existing card order. | Each task appears once, and pause comes into the merged pane. |
| Q24 | Close the current milestone as v1, **without finishing Phase 1's verification**, and start a new milestone, "Staging & Task Control", seeded from this log. | The user chose to skip the pending Phase 1 verification. |
| Q25 | When a Pomodoro owns a staged row's timer, the card shows 🍅 and the time remaining, with no pause or stop. ✓ and ✕ still work. Pomodoro-owned timers on unstaged tasks stay hidden. | Assumed to be the recommended answer, because the user didn't address it. Confirm. |
| Q26 | The new settings (the `staged` key and the rollover hour) go in the existing settings tab. The staged order and the "Done today" record are saved through `persistAll`, alongside `cardOrder` and `pauseRecords`. | Assumed to be the recommended answer. Confirm. |
| Q28 | Move this log and the README content into the timer pane repo, then delete `obsidian-tasknotes-taskctrl`. | Assumed to be the recommended answer. **Nothing is deleted without explicit confirmation.** |
| Q29 | The first staging release is version 0.3.0. | Assumed to be the recommended answer. Confirm. |

## Open (round in progress)

- Q27, reframed: the original timer pane shows every task that is being timed, while staging shows a chosen subset whether or not it is timed.
  How should the two fit together? See Q30–Q32.

## Research findings

These came from reading the TaskNotes 4.13.0 bundle and the timer pane's source.

- The runtime API is at `app.plugins.getPlugin("tasknotes").api`.
  - Regular time tracking: `time.start(path)` and `time.stop(path)`.
  - Pomodoro: `pomodoro.start({taskPath})`. It shows a notice and does nothing if a Pomodoro is already active.
  - Recurring tasks: `recurring.toggleCompleteInstance(path, date?)`.
  - Reading: `tasks.list` and `tasks.get`.
  - Writing: `tasks.update`.
  - Events: `events.on`, with names such as `task.updated`, `time.started` and `recurring.instance.completed`.
  - Lifecycle: `lifecycle.on`.
- `tasks.update` writes only keys that are registered in `settings.userFields`, and silently drops any other key.
  `TaskInfo` exposes user fields both at the top level and in `customProperties`.
- No official API registers user fields.
  The user-field types are text, number, date, boolean and list.
- The timer pane's reusable modules are `TaskNotesBridge`, `cardOrder` with `CardOrderStore`, `taskPicker` with `TaskPickerModal`, `pomodoroOwnership`, `WriteQueue`, and the Vitest fakes.
  Its vendored API types need additions for `tasks.update`, `pomodoro.start`, `recurring.*` and `customProperties`.
- Timer pane facts: it is published on GitHub (`judealnas/obsidian-tasknotes-timer-pane`) with releases 0.1.0 and 0.2.0, and is installed in the Personal Vault.
  Its roadmap has Phases 2 and 3 complete, and Phase 1 needs only verification.
  It hides Pomodoro-owned timers on purpose, because pausing one from the pane would orphan the Pomodoro's time entry.
