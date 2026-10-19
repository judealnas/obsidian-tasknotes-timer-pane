# TaskNotes Timer Pane

## What it is

An Obsidian plugin that adds a dockable pane for monitoring and controlling TaskNotes' regular (non-Pomodoro) task time tracking. TaskNotes already has a Pomodoro pane, but for normal task timing the only sign that a task is being timed is a small status-bar indicator in the bottom right of the window. This pane fills that gap: keep it open beside your notes to see what you are timing and how long you've spent on it, and start, pause, resume, stop or complete a task's timer in one or two clicks.

## Requirements

- Obsidian 1.12.2 or later. Verified on desktop only.
- TaskNotes 4.10.0 or later, installed and enabled. The pane is a companion to TaskNotes and does nothing on its own. If TaskNotes is missing, disabled or too old, the pane says so and connects by itself once TaskNotes is ready.

## Using the pane

- Open it with the ribbon icon "Open TaskNotes timer" or the command "Open timer pane". It opens in the right sidebar. If the pane is already open, it is revealed where it is instead of opening a second copy, and it stays in place across restarts.
- While a timer runs, the card shows the task title (click it to open the note; Ctrl/Cmd-click opens it in a new tab), the current session as H:MM:SS ticking every second, and the task's total tracked time including the running session.
- "Stop timer" stops only the timer the card displays.
- Several timers at once: the pane shows one card per timer, most recently started first.
- "Start task" opens a searchable picker and starts a timer alongside existing timers. Completed tasks remain selectable at the end of the list.
- "Stop all" stops regular timers sequentially and preserves the timer owned by an active Pomodoro. It is disabled when ownership cannot be verified or there is nothing eligible to stop.
- "Complete" beside Stop sets the task's completed status, then stops its same still-open timer. If the status write fails, the timer keeps running. If stopping later fails, the task stays completed and a Notice explains that its timer needs checking.
- Settings → TaskNotes Timer Pane → Completion status offers "Same as TaskNotes" (the first completed status) and TaskNotes' live completed statuses. A removed saved status falls back to the first completed status. No completed statuses means Complete is disabled.
- "Pause" on a card stops its TaskNotes time entry and keeps the card in place, marked "Paused", with the session time frozen. "Resume" starts a new TaskNotes entry on the same task and the session carries on from the paused value. Pause and Resume write only through TaskNotes, so its status bar, cards and totals stay in sync.
- "Pause all" and "Resume all" in the header pause every regular running timer, or resume every paused card, one at a time.
- Pauses are remembered across restarts. A pause follows its note when the note is renamed or moved, and is cleared when the note is deleted, the task gets a completed status, or a Pomodoro starts on that task. Starting the task's timer elsewhere in TaskNotes turns the paused card back into a running one.
- "Stop timer" on a paused card clears the pause without another TaskNotes write. "Complete" works on paused cards too. "Stop all" also clears every pause, leaving the pane empty.
- A timer owned by an active Pomodoro is hidden from the pane and left alone by Stop all and Pause all. The Start task picker marks the Pomodoro's task "Pomodoro" and won't start a second timer on it. If the pane can't check Pomodoro ownership it shows every timer with the note "Can't check Pomodoro. Showing all timers."
- The pane never stops a timer without a click. TaskNotes' own completion and archive settings still govern actions made elsewhere. All pane write controls are disabled while an action runs.

Differences from TaskNotes' own displays, all expected:

- Totals are summed to the second from the raw time entries. TaskNotes rounds each entry down to whole minutes, so the pane's total can be up to a minute per entry higher than TaskNotes' total.
- The pane always shows H:MM:SS. TaskNotes' status bar shows M:SS under an hour, so `0:42:17` in the pane is `42:17` in the status bar.
- TaskNotes' status bar hides timers on archived tasks. The pane does not.

## Install with BRAT

1. Install BRAT from Settings → Community plugins → Browse, and enable it.
2. Run the command "BRAT: Add a beta plugin for testing" (or use the button in BRAT's settings).
3. Enter `judealnas/obsidian-tasknotes-timer-pane` and add the plugin.
4. Enable "TaskNotes Timer Pane" in Settings → Community plugins.

BRAT installs the latest GitHub release and can check for updates.

## Manual install

1. Download `main.js`, `manifest.json` and `styles.css` from the latest release at https://github.com/judealnas/obsidian-tasknotes-timer-pane/releases.
2. Put them in `<vault>/.obsidian/plugins/tasknotes-timer-pane/`, then enable "TaskNotes Timer Pane" in Settings → Community plugins.

To build from source instead, run `npm install` and `npm run build`, then copy the same three files from the repo root.

## Development

Develop only in the repo's `dev-vault/` folder, never in your real vault. The build scripts only ever write into `dev-vault/.obsidian/plugins/tasknotes-timer-pane/` (and `main.js` at the repo root for `npm run build`). There is no setting or environment variable that points them at another vault, so a bug in the stop path can't damage real time entries.

1. `npm install`
2. `npm run seed` creates `dev-vault/` with four seed tasks in `TaskNotes/Tasks/`. Re-running it leaves existing notes alone. `npm run seed -- --reset` restores the seed notes to their tracked contents. Neither deletes anything or touches `dev-vault/.obsidian/`.
3. Open `dev-vault/` as a vault in Obsidian ("Open folder as vault"), and turn off Restricted mode when asked.
4. One-time manual installs into the dev vault:
   - TaskNotes, the latest 4.13.x, from Settings → Community plugins → Browse.
   - Hot Reload 0.3.1 from https://github.com/pjeby/hot-reload/releases. It isn't in the community directory: download its `main.js` and `manifest.json` into `dev-vault/.obsidian/plugins/hot-reload/`.
5. In Settings → Community plugins, enable TaskNotes, Hot Reload and TaskNotes Timer Pane.
6. `npm run dev` builds in watch mode into the dev vault. Hot Reload reloads the plugin about 0.75 s after `main.js` or `styles.css` changes. A `manifest.json` change needs a manual plugin toggle off and on.
7. `npm run deploy` does a one-shot build into the dev vault.
8. `npm run check` is the definition of done: the build, `tsc -noEmit`, ESLint with eslint-plugin-obsidianmd at zero warnings, and Vitest must all pass.
9. Never commit `dev-vault/`. It is git-ignored because it holds third-party plugins and TaskNotes' `data.json`. Seed notes are tracked in `dev-vault-seed/` instead.

### Releasing

1. `npm version patch` (or `minor` / `major`) bumps `package.json`, `manifest.json` and `versions.json`, commits, and tags the version without a `v` prefix.
2. `git push --follow-tags` pushes the commit and tag. The release workflow runs `npm run check`, confirms the tag matches `manifest.json`, and publishes a GitHub release with `main.js`, `manifest.json` and `styles.css`.
