# Phase 1 UAT checklist: Live Timer Pane

**Phase:** 01-live-timer-pane
**Requirements:** PANE-01, PANE-02, PANE-03, DISP-01, DISP-02, DISP-03, DISP-05, DISP-06, CTRL-01, SYNC-01, SYNC-02, SYNC-03, SYNC-04
**Run order:** Run at the end of Phase 1, after plans 01-01 to 01-05 are all complete (D-13).
**Where:** only in the repo's `dev-vault/`, never in a real vault (D-01).

This is the written manual check for everything that only happens inside Obsidian (D-13). It is separate from the `01-UAT.md` that `/gsd-verify-work` writes. Run the sections in order: later sections assume the state that earlier ones leave behind. Quoted UI copy must match exactly, including the single-character ellipsis `…`.

Record each step as pass, fail or skip. Note anything surprising, even on a pass.

## Results

| Step | Result (pass/fail/skip) | Notes |
|------|-------------------------|-------|
| 0.1 Dev vault set up | | |
| 0.2 Seed reset and deploy | | |
| 0.3 Plugin listed and enabled | | |
| 0.4 Icon ids | | |
| 0.5 TaskNotes auto-stop setting noted | | |
| 0.6 Archived seed timer visible | | |
| 1.1 No duplicate leaf | | |
| 1.2 Reveal in the left sidebar | | |
| 1.3 Collapsed sidebar uncollapses | | |
| 1.4 Restart restore and cold start | | |
| 2.1 Overflow clock at 100:00:00+ | | |
| 2.2 Title opens the note | | |
| 2.3 Session ticks | | |
| 2.4 Total 1:07:35 plus session | | |
| 2.5 Two timers, "+1 more running" | | |
| 2.6 Long title wraps | | |
| 3.1 Status bar start/stop | | |
| 3.2 Task card start/stop | | |
| 3.3 Command palette start/stop | | |
| 3.4 Hand-edited YAML | | |
| 3.5 Rename the timed note | | |
| 3.6 Delete the timed note | | |
| 4.1 TaskNotes disabled | | |
| 4.2 TaskNotes re-enabled | | |
| 4.3 Quick off/on (update) | | |
| 4.4 Never stuck connecting | | |
| 4.5 getPlugin while disabled (A1) | | |
| 5.1 Sleep/wake ±1 s | | |
| 6.1 One-click stop | | |
| 6.2 Only the displayed timer stops | | |
| 6.3 Archived seed stop (from 2.1) | | |
| 6.4 "No active session" race | | |
| 6.5 Stop failure Notice | | |
| 7.1 Archive flag keeps the timer shown | | |
| 7.2 Completion left to TaskNotes | | |
| 7.3 Done by hand-edited YAML | | |
| 8.1 A1 | | |
| 8.2 A4 | | |
| 8.3 A6 | | |
| 8.4 A7 | | |

## 0. Setup (one-time)

0.1. Do steps 1 to 5 of the README "Development" section: `npm install`, `npm run seed`, open `dev-vault/` as a vault, install TaskNotes 4.13.x and Hot Reload 0.3.1 by hand, and enable TaskNotes, Hot Reload and TaskNotes Timer Pane.
- Expected: all three plugins are enabled in Settings → Community plugins.

0.2. Run `npm run seed -- --reset`, then `npm run deploy`.
- Expected: the seed command prints `Seeded 4 file(s), skipped 0 existing, into dev-vault/`. The deploy finishes without errors, and Hot Reload reloads the plugin (or toggle it off and on once).

0.3. In Settings → Community plugins, look at the installed list, then open the dev console (Ctrl+Shift+I, or Cmd+Option+I on macOS).
- Expected: the plugin is listed as "TaskNotes Timer Pane", version 0.1.0. It enables with no error in the console.

0.4. In the dev console, run `require("obsidian").getIconIds().filter(i => ["timer","square"].includes(i))`.
- Expected: it returns both `"timer"` and `"square"`.

0.5. Open TaskNotes' settings, find its "auto-stop time tracking" setting in the time-tracking settings, and note whether it is on. Section 7 uses it.
- Expected: the setting exists. Record its state in the Notes column.

0.6. Open the pane with the ribbon icon "Open TaskNotes timer".
- Expected: after the reset, the archived seed task "Clean up old project archive" has had a timer running since 2026-10-01. The pane shows it like any other timer: no label, and it is counted in "+N more running" whenever other timers run. The TaskNotes status bar hides it. That is expected (TaskNotes' status bar skips archived tasks), not a bug.

## 1. Pane (PANE-01..03)

1.1. Click the ribbon icon "Open TaskNotes timer" twice, then run the command "Open timer pane" twice.
- Expected: there is only one pane leaf. Each click or command reveals the same leaf, and the tab header reads "TaskNotes timer".

1.2. Drag the pane into the left sidebar, then click the ribbon icon.
- Expected: the pane is revealed in the left sidebar, where it is. No second leaf appears in the right sidebar.

1.3. Move the pane back to the right sidebar, collapse the right sidebar, then click the ribbon icon.
- Expected: the right sidebar uncollapses and shows the pane.

1.4. Start a timer on "Write quarterly report" from TaskNotes, then quit and restart Obsidian.
- Expected: the pane is restored in the same place. It shows "Connecting to TaskNotes…" at most briefly, then the running card within about 5 s, with no manual action. (This is the cold-start readiness check from STATE.md Blockers/Concerns: `layout.ready` fires only once.) Stop the "Write quarterly report" timer from the TaskNotes status bar afterwards.

## 2. Display (DISP-01/02/03/06)

2.1. Overflow first. Make sure the only running timer is the archived seed timer (stop any other from the status bar).
- Expected: it is the primary card, with no label. Its session clock is above 100:00:00 and stays on one line, with no clipping and no horizontal scrollbar, at the default sidebar width and with the sidebar dragged to its minimum width.
- Then click "Stop timer" on it so the counts below start from zero. Expected: idle state, "No task is being timed". Section 6 step 6.3 records that this Stop behaved like any other.

2.2. Start a timer on "Write quarterly report". Click the card's title. Then Ctrl/Cmd-click it. Then Tab to the title and press Enter, and then Space.
- Expected: hovering the title shows "Open task note". A plain click opens the note in the current tab. Ctrl/Cmd-click opens it in a new tab. Enter and Space each open it from the keyboard.

2.3. Watch the card for about 10 s.
- Expected: the status row reads "Tracking". The "Session" clock ticks once a second in H:MM:SS.

2.4. Look at "Total" on the "Write quarterly report" card.
- Expected: Total equals 1:07:35 plus the running session (for example, 1:08:35 when the session reads 0:01:00), and it ticks with the session.

2.5. Start a second timer on "Review pull requests" from TaskNotes.
- Expected: the card switches to "Review pull requests", the most recently started timer. The status row shows "+1 more running". Hovering it shows the tooltip "Also running: Write quarterly report".

2.6. Start a timer on "Draft the migration plan for the legacy billing system so this title wraps across several lines". Drag the sidebar narrow.
- Expected: it is now the primary card and "+2 more running" shows. The full title wraps onto as many lines as it needs, with no truncation, no ellipsis and no horizontal scrollbar.
- Stop all three timers from the TaskNotes status bar afterwards.

## 3. Sync (SYNC-01/02)

For each step, the pane must keep the previous card until the new state arrives: no intermediate flash of the idle state.

3.1. Start a timer on "Write quarterly report" from the TaskNotes status bar, then stop it from the status bar.
- Expected: each change shows in the pane within about 1 s.

3.2. Start and stop a timer from a TaskNotes task card (for example, in a TaskNotes task list view).
- Expected: each change shows in the pane within about 1 s.

3.3. Start and stop a timer from the command palette with TaskNotes' own time-tracking commands.
- Expected: each change shows in the pane within about 1 s.

3.4. Start a timer on "Write quarterly report". Open its note in source mode and add an `endTime: "…"` line (any ISO time after the startTime, quoted) under the open entry in `timeEntries` by hand. Save.
- Expected: the pane goes idle within about 1 s.

3.5. Start a timer on "Review pull requests", then rename the note in the file explorer to "Review pull requests renamed".
- Expected: the card follows the rename: the title becomes "Review pull requests renamed" and the timer keeps running. Rename it back afterwards.

3.6. With that timer still running, delete the note "Review pull requests" (to the system trash).
- Expected: the card disappears within about 1 s and the pane goes idle. Run `npm run seed` afterwards to restore the note (existing notes are left alone).

## 4. Reconnect (SYNC-03, DISP-05)

Start a timer on "Write quarterly report" first.

4.1. Disable TaskNotes in Settings → Community plugins.
- Expected: within about 5 s the pane shows "TaskNotes is not enabled", the body "This pane needs the TaskNotes plugin. Install or enable it in Settings → Community plugins, and the pane will connect on its own.", and the button "Check for TaskNotes".

4.2. Re-enable TaskNotes.
- Expected: the pane reconnects within about 5 s with no click and shows the running "Write quarterly report" card again.

4.3. Toggle TaskNotes off and on quickly, as a plugin update does.
- Expected: the pane reconnects within about 1 s of TaskNotes coming back.

4.4. Throughout 4.1 to 4.3, watch for a stuck loading state.
- Expected: at no point is the pane stuck on "Connecting to TaskNotes…".

4.5. Disable TaskNotes again. In the dev console, run `app.plugins.getPlugin("tasknotes")`. Then re-enable TaskNotes.
- Expected: record whether it returns `null` or an object (assumption A1). Either is acceptable; the pane handles both.

The "TaskNotes needs an update" state is not tested by hand: the dev vault uses only the latest TaskNotes (D-04), and unit tests cover the too-old and missing-capability states.

## 5. Sleep/wake (SYNC-04)

5.1. With the "Write quarterly report" timer running and the pane visible, put the computer to sleep for at least 2 minutes, then wake it.
- Expected: on the first tick after wake, the pane's session equals the TaskNotes status bar's elapsed time within ±1 s. The formats differ: the status bar shows M:SS under an hour, so `0:42:17` in the pane is `42:17` in the status bar (see the README).

## 6. Stop (CTRL-01) (requires plan 01-05)

6.1. With "Write quarterly report" running, click "Stop timer" once.
- Expected: the button immediately reads "Stopping…" and is disabled. Then the pane shows idle ("No task is being timed") or the next running timer. The TaskNotes status bar shows the timer stopped.

6.2. Start timers on "Write quarterly report" and then "Review pull requests". Click "Stop timer".
- Expected: only the displayed timer ("Review pull requests") stops. The card then shows "Write quarterly report", still running, and "+1 more running" disappears.

6.3. Recall the Stop of the archived seed task in step 2.1.
- Expected: it worked like any other Stop: one click, "Stopping…", then idle. A timer whose task has TaskNotes' archive flag gets no special handling.

6.4. Race. With "Write quarterly report" running, stop it from the TaskNotes status bar, then click the pane's "Stop timer" before the pane refreshes. (If the pane is too quick, use the dev console: run `app.plugins.getPlugin("tasknotes").api.time.stop("TaskNotes/Tasks/Write quarterly report.md")` and click Stop right after.)
- Expected: the pane shows no Notice and just refreshes to idle. TaskNotes' "no active session" error is treated as benign.

6.5. Failure. Start a timer on "Write quarterly report". In the dev console, run `app.plugins.getPlugin("tasknotes").api.time.stop = () => Promise.reject(new Error("Simulated failure"))`, then click "Stop timer".
- Expected: the Notice `Couldn't stop the timer for "Write quarterly report": Simulated failure. Try again, or stop it from the TaskNotes status bar.` shows once. The button is re-enabled and reads "Stop timer" again, and the timer keeps running.
- Afterwards, disable and re-enable TaskNotes to restore its api, then stop the timer from the status bar.

## 7. Archive flag and completion (D-05, DISP-06)

7.1. Archive flag. Start a timer on "Review pull requests", then use TaskNotes' Archive action on it. Then start a timer on "Write quarterly report".
- Expected: the archived task's timer keeps running. The pane shows it like any other timer: no label, the normal primary rule (the latest start wins), and it is counted in "+1 more running" while "Write quarterly report" is primary. The pane stops nothing and shows no Notice. The TaskNotes status bar hides the archived timer, which is expected.
- Afterwards, stop both timers from the pane and unarchive "Review pull requests" (or run `npm run seed -- --reset`).

7.2. Completion (D-05). With TaskNotes' "auto-stop time tracking" setting on (step 0.5; turn it on for this step if needed), start a timer on "Write quarterly report", then set the task to a completed-type status through TaskNotes' UI. For example, use an "archived" status configured as completed in TaskNotes' status settings, which is how the user archives.
- Expected: TaskNotes stops the timer itself. The pane follows within about 1 s and shows no Notice of its own.

7.3. Run `npm run seed -- --reset`. Start a timer on "Write quarterly report", then change its `status:` to `done` by hand-editing the YAML and save.
- Expected: the timer keeps running (TaskNotes' auto-stop doesn't fire for hand edits) and the pane shows it normally. The pane adds no auto-stop of its own (D-05). Stop it from the pane afterwards.

## 8. Assumptions to confirm

8.1. A1: what `app.plugins.getPlugin("tasknotes")` returns while TaskNotes is disabled. Copy the answer from step 4.5.

8.2. A4: clicking the title opens the exact file (`TaskNotes/Tasks/<title>.md`), not a different note with a similar name. Confirmed in step 2.2.

8.3. A6: `visibilitychange` and `focus` fire after wake. Before step 5.1, run in the dev console: `document.addEventListener("visibilitychange", () => console.log("vis", document.visibilityState)); window.addEventListener("focus", () => console.log("focus"))`. After wake, record which lines were logged.

8.4. A7: `npm run deploy` works on Windows paths. Confirmed in step 0.2 when run on Windows: the dev-vault plugin folder holds `main.js`, `manifest.json`, `styles.css` and `.hotreload`.
