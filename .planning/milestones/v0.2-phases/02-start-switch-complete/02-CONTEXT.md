# Phase 2: Start, Switch & Complete - Context

**Gathered:** 2026-10-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 turns the pane into a launcher. It delivers:

- a **pane header** with two buttons, **[Start task]** and **[Stop all]**
- a **task selector modal** opened by Start task, modelled on the selector in TaskNotes' Pomodoro pane. Picking a task starts its timer **alongside** any timers already running.
- **Stop all**, which stops every running timer except one owned by an active Pomodoro
- **Complete** on each card. It sets a completed status and always stops that task's timer.
- an **idle state**: the header above the existing "No task is being timed" message
- busy-state and failure handling for these actions

**Scope change from discussion (user decision, 2026-10-15): switching is removed.** The pane already shows one card per running timer (quick task 261014-w2j, which supersedes the Phase 1 "primary card + '+N more'" display, DISP-06). The user no longer wants a "switch" action:
- **CTRL-06** is rewritten. It was "switch from the picker: stop all, then start". It becomes "**Stop all** in the header stops every non-Pomodoro timer".
- **CTRL-10** (the switch-stops-all vs. stop-displayed setting) is **dropped** as no longer needed.
- The roadmap's "switch is not atomic (stop, then start)" note no longer applies. The picker only starts a task.

REQUIREMENTS.md and the ROADMAP.md Phase 2 success criteria are updated to match.

Requirements: DISP-04, CTRL-05, CTRL-06 (rewritten), CTRL-07, CTRL-09. CTRL-10 dropped.

Not in this phase: pause and resume, the Pomodoro label, and hiding pause for Pomodoro timers (Phase 3).

</domain>

<decisions>
## Implementation Decisions

### Header and Stop all
- **D-01:** A **header row above the column of cards** holds two buttons, **Start task** and **Stop all**. There is no per-card switch and no switch action at all.
- **D-02:** The header is **always shown**, in every pane state (running, idle, loading, missing, incompatible). Both buttons are **disabled until TaskNotes is ready**. In the missing, loading and incompatible states the existing message stays below the header.
- **D-03:** **Stop all is one click with no confirmation**, the same as the per-card Stop. It stops every running timer **except one owned by an active Pomodoro session**, which keeps running. The Pomodoro entry belongs to Pomodoro, and the pane must not orphan it (PROJECT.md).
- **D-04:** Stop all is **disabled, not hidden**, when it would do nothing: no timers, or only a Pomodoro-owned one. Add a tooltip explaining why. The header layout stays fixed.
- **D-05:** Stop all writes **through the existing serial WriteQueue**, one `api.time.stop(path, context)` per timer, in sequence. It never runs stops in parallel (TaskNotes locks per path, not across paths).

### Start task picker
- **D-06:** Start task opens a **task selector modal modelled on TaskNotes' Pomodoro selector**. The Runtime API exposes no selector (`ui` has only `taskMenu`), so build it with Obsidian's public `SuggestModal`/`FuzzySuggestModal`. Never call TaskNotes internals.
- **D-07:** **Which tasks:** the same set as TaskNotes. All tasks **except archive-flag ones** (`TaskInfo.archived`), and **completed tasks included but sorted last**. Tasks already being timed are **not** filtered out.
- **D-08:** **Order and search copy TaskNotes' Pomodoro selector rules** (4.13.8 bundle, `getFilteredTasks`):
  - **Completed last:** completed tasks always sort after open ones.
  - **With a query:** best match first. TaskNotes ranks by match quality: exact, then prefix, then word-prefix, then substring. Ties are broken by title.
  - **Without a query:** due date ascending (tasks with a due date before those without), then priority high, normal, low, then title.
  - **Fields searched:** title, due, priority (only when not "normal"), contexts, projects, and tags.

  Use Runtime API task fields (`api.tasks.list` / `api.query.tasks`, `api.catalog.statuses()` to know which statuses are completed), never a hard-coded "done".
- **D-09:** **Each picker row shows the TaskNotes chip**, using the same `[[path]]` + `MarkdownRenderer` approach as the card titles (quick task 261014-whq), with the due date as muted text. This is the closest match to TaskNotes' task-card rows that the public API allows. If no chip renders, show a plain title.
- **D-10:** Picking a task **starts it alongside running timers** through `api.time.start(path, {}, context)` on the WriteQueue. No other timer is stopped.
- **D-11:** Picking a task that is **already being timed** shows a Notice, roughly "{title} is already being timed.", and makes **no write**.

### Complete from the pane
- **D-12:** Complete is available **in two places**: a **[Complete] button next to Stop** in each card's action row (`[Stop] [Complete]`), and the **chip's existing right-click TaskNotes menu**. The menu needs no new work.
- **D-13:** A **plugin setting** chooses which status Complete sets. It's a dropdown of TaskNotes' **completed-type statuses, read live from `api.catalog.statuses()`**, plus a default entry **"Same as TaskNotes"**. That entry means the first completed status, which is what TaskNotes' own toggle uses. If the saved status no longer exists, for example because it was renamed in TaskNotes, fall back to "Same as TaskNotes". This is the plugin's first setting, so it adds a settings tab.
- **D-14:** **The pane always stops the timer on Complete.** It sets the status, then stops the timer if it's still open. A "no active session" error is benign: TaskNotes' auto-stop may have stopped it already. This is a **deliberate exception** to "leave completion auto-stop to TaskNotes" (Phase 1 D-05). CTRL-07 must hold even when TaskNotes' `autoStopTimeTrackingOnComplete` setting is off. The status write and the stop go through the WriteQueue as one serialized action.

### Idle state
- **D-15:** Idle is the **header + the existing message** ("No task is being timed" plus body text). There's no separate big button: the header's Start task covers DISP-04's "Start a task" button. The body text should point at the Start task button instead of "start time tracking in TaskNotes".

### Claude's Discretion
- **Busy-state scope (CTRL-09):** follow the existing Stop pattern (per-target busy label and disabled button). Claude decides whether Stop all and Start disable just their own button or the whole header and cards while the action runs.
- **Failure Notices:** wording and whether a partial Stop-all failure reports each task or a summary. Follow the existing `stopFailedNotice` style (sentence case).
- **Order of writes in Complete:** status then stop, or stop then status. Pick whichever avoids racing TaskNotes' own auto-stop and keeps tracked time correct.
- **Detecting a Pomodoro-owned timer** for D-03 and D-04: research which Runtime API signal identifies it (`pomodoro.read` capability and state). If it can't be detected reliably, say so in the plan rather than guess.
- Header button icons, labels and placement details, within the Phase 1 UI-SPEC style (Obsidian CSS variables, `tntp-` classes, no inline styles).
- Picker placeholder text, empty-state text, and the modal title.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and contracts
- `.planning/ROADMAP.md` (Phase 2 section): goal and success criteria, updated for this discussion's scope change
- `.planning/REQUIREMENTS.md`: DISP-04, CTRL-05, CTRL-06 (rewritten), CTRL-07, CTRL-09; CTRL-10 dropped
- `.planning/PROJECT.md`: constraints (Runtime API v1 only; writes only through the Runtime API; graceful degradation; don't orphan Pomodoro timers)
- `.planning/phases/01-live-timer-pane/01-CONTEXT.md`: Phase 1 decisions, especially D-05 (completion auto-stop left to TaskNotes, deliberately overridden for the pane's Complete by D-14 here) and the archive decision
- `.planning/phases/01-live-timer-pane/01-UI-SPEC.md`: the approved visual contract that new header, button and picker UI must follow

### Quick tasks that changed the Phase 1 UI (read before touching the view)
- `.planning/quick/261014-whq-render-card-titles-as-wikilinks-so-taskn/261014-whq-PLAN.md` and `261014-whq-SUMMARY.md`: chip titles via `MarkdownRenderer` with a per-card `Component`, the click-ownership rule, `displayKey`, and the `ui.taskMenu` fallback. D-09 reuses this approach for picker rows.
- Commits `e9d87d6` (one card per timer), `afa6a41` (hide the chip tracking outline), `72972cc` (no "Tracking" row, larger chip), `3a2b05d` (clock font matches the Pomodoro timer)

### Research
- `.planning/research/SUMMARY.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`: bridge, store and controller architecture; concurrent timers; events as hints

### TaskNotes (upstream callumalpass/tasknotes v4.13.8; bundle at `dev-vault/.obsidian/plugins/tasknotes/main.js`)
- `src/api/runtime-api.ts`: `time.start/stop/active`, `tasks.list`/`query.tasks`, `tasks` write methods for setting the status, `catalog.statuses()`, `pomodoro.*` (capabilities `pomodoro.read`, `pomodoro.events`), `ui.taskMenu`
- The Pomodoro view's `openTaskSelector` (its list includes every task with `!archived`) and the task selector modal's `getFilteredTasks` / `taskMatchesSelectorQuery`: the reference for D-07 and D-08
- `TaskService.toggleStatus`: TaskNotes' "complete" picks `statusManager.getCompletedStatuses()[0]`. The reference for D-13's "Same as TaskNotes".
- `src/services/SettingsLifecycleService.ts` `handleAutoStopTimeTracking`: TaskNotes' completion auto-stop, which D-14 must not double-stop against (treat "no active session" as benign)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/state/WriteQueue.ts`: the serial write queue. Use it for Stop all (sequential stops), Start and Complete.
- `src/state/TimerController.ts`: `stop(target)` already classifies errors, treats "no active session" as benign, shows the Stop-failed Notice and refreshes the store. Extend it with `start`, `stopAll` and `complete` in the same never-rejecting style.
- `src/model/errors.ts`: `isNoActiveSessionError` and `stopFailedNotice`. Add sibling Notice builders.
- `src/tasknotes/TaskNotesBridge.ts`, the `TaskNotesGateway` seam: add `start`, `listTasks`/`queryTasks`, `statuses`, `setStatus` (or the Runtime API's equivalent) and Pomodoro state, each capability-gated and never throwing into the view. The fakes in `tests/fakes/` must grow to match.
- `src/ui/TimerPaneView.ts`:
  - per-card reconcile by `(taskPath, startTime)` key
  - per-card busy state (`stopping` set)
  - chip title rendering with a per-card `Component`
- `src/model/taskLink.ts`: builds the `[[path]]` wikilink, reusable for picker rows

### Established Patterns
- Vanilla DOM built once and updated in place, `tntp-` BEM classes, visibility driven by the root `tntp-pane--{state}` class, Obsidian CSS variables only
- Every TaskNotes call goes through the gateway, gated on capability. Writes carry `context = { source: "tasknotes-timer-pane", reason, correlationId }`.
- Store re-derives from `api.time.active()`; events are hints. Controllers await `store.refreshNow()` after writes.
- Definition of done: `npm run check` (tsc, esbuild, eslint with obsidianmd, vitest)

### Integration Points
- The header is new DOM in `onOpen`, above `.tntp-cards`. CSS must keep it visible in all states (currently `.tntp-cards` is hidden unless running).
- The settings tab is new: `PluginSettingTab` registered in `src/main.ts`, with settings persisted through `loadData`/`saveData`.
- The picker modal is a new file under `src/ui/`

</code_context>

<specifics>
## Specific Ideas

- The user wants the selector to feel **"just like the task selector in TaskNotes' Pomodoro timer pane"**, so copy its contents, order and search rules (D-07, D-08) and its look, as far as the public API allows (D-09).
- The user's mental model is now **a column of independent timers**: start any number, stop each on its card, or clear them all with Stop all. A "time only this" switch is not wanted.

</specifics>

<deferred>
## Deferred Ideas

- **Switch ("time only this")**: removed from v1 by user decision. Stop all followed by Start task covers it in two clicks. Revisit only if the user asks.
- **"Create new task" from the picker**: TaskNotes has a selector-with-create variant, but its Pomodoro selector doesn't use it. Not discussed. That would be a new capability.

</deferred>

---

*Phase: 02-start-switch-complete*
*Context gathered: 2026-10-15*
