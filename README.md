# TaskNotes Timer Pane

## What it is

An Obsidian plugin that adds a dockable pane for monitoring and controlling TaskNotes' regular (non-Pomodoro) task time tracking. TaskNotes already has a Pomodoro pane, but for normal task timing the only sign that a task is being timed is a small status-bar indicator in the bottom right of the window. This pane fills that gap: keep it open beside your notes to see what you are timing and how long you've spent on it, and stop the timer in one click.

## Requirements

- Obsidian 1.12.2 or later. Verified on desktop only.
- TaskNotes 4.10.0 or later, installed and enabled. The pane is a companion to TaskNotes and does nothing on its own. If TaskNotes is missing, disabled or too old, the pane says so and connects by itself once TaskNotes is ready.

## Using the pane

- Open it with the ribbon icon "Open TaskNotes timer" or the command "Open timer pane". It opens in the right sidebar. If the pane is already open, it is revealed where it is instead of opening a second copy, and it stays in place across restarts.
- While a timer runs, the card shows the task title (click it to open the note; Ctrl/Cmd-click opens it in a new tab), the current session as H:MM:SS ticking every second, and the task's total tracked time including the running session.
- "Stop timer" stops only the timer the card displays.
- Several timers at once: the pane shows the most recently started timer, plus "+N more running". Hover it to see the other titles.
- The pane never stops a timer on its own. Stopping a timer when its task is completed is left to TaskNotes' own "auto-stop time tracking" setting. If you archive tasks by moving them to a status that TaskNotes treats as completed, that setting covers archiving too. A task archived with TaskNotes' Archive action keeps its timer running, and the pane shows that timer like any other.

Differences from TaskNotes' own displays, all expected:

- Totals are summed to the second from the raw time entries. TaskNotes rounds each entry down to whole minutes, so the pane's total can be up to a minute per entry higher than TaskNotes' total.
- The pane always shows H:MM:SS. TaskNotes' status bar shows M:SS under an hour, so `0:42:17` in the pane is `42:17` in the status bar.
- TaskNotes' status bar hides timers on archived tasks. The pane does not.

## Manual install

1. `npm install`
2. `npm run build`
3. Copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/tasknotes-timer-pane/`, then enable "TaskNotes Timer Pane" in Settings → Community plugins.

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
