# Phase 3: Pause & Resume - Context

**Gathered:** 2026-10-16
**Status:** Ready for planning

<domain>
## Phase Boundary

The pane can pause and resume regular (non-Pomodoro) timers, one card at a time or all at once from the header. Paused state is owned by the pane and survives an Obsidian restart. The pane **ignores Pomodoro-owned timers entirely**: it doesn't show them, count them, or act on them.

This replaces the earlier plan to label Pomodoro timers and hide their Pause button (DISP-07, CTRL-08). Pane control of Pomodoro (`api.pomodoro.*` writes) is out of scope for this phase.

Requirement changes this discussion implies. Apply them to REQUIREMENTS.md and ROADMAP.md with this context:
- **DISP-07 and CTRL-08 are replaced** by one requirement: "The timer owned by an active Pomodoro is not shown in the pane. When Pomodoro state can't be read, all timers are shown with a note."
- **CTRL-02 and CTRL-03** now apply per card, plus header Pause all and Resume all.
- **CTRL-04 is rewritten.** Several tasks can be paused at once. Pauses survive a restart. Starting another timer does **not** clear them. A pause clears when its task is resumed, stopped from the pane, completed or deleted, or when a Pomodoro starts on that task.

</domain>

<decisions>
## Implementation Decisions

### Pause model with concurrent timers
- **D-01:** **Every running card has its own Pause button**, and any number of tasks can be paused at the same time. Each paused task keeps its own card.
- **D-02:** The header gains **two separate buttons, "Pause all" and "Resume all"**, next to Start task and Stop all. Each is disabled, not hidden, when it would do nothing: Pause all when no regular timer runs, Resume all when nothing is paused. Disabled buttons get an explanatory tooltip, the same pattern as Stop all (Phase 2 D-04).
- **D-03:** **Starting a timer never clears pauses.** Timers run concurrently, so starting task B leaves paused task A paused.
- **D-04:** **Pause all is disabled while Pomodoro ownership can't be read**, the same rule Stop all follows. A bulk action must not risk closing the Pomodoro's hidden entry. Per-card Pause stays available.
- **D-05:** Pause is "stop the entry, remember the pause". Resume is "start a new entry on the same task". Both use `api.time.stop` and `api.time.start` through the existing serial WriteQueue. Pause all and Resume all write one entry at a time, never in parallel (Phase 2 D-05). — **Reversibility:** costly — the persisted pause record format becomes stored user data in `data.json`. Changing it later needs a loader that accepts the old shape.

### Paused card look and actions
- **D-06:** **Paused cards keep their place in the list**, ordered by start time among the running cards, and only change style: muted, with a "Paused" label. Use the session's first start as the sort key, so a card doesn't jump when it's paused or resumed.
- **D-07:** A paused card shows the **frozen Session value and the task's Total**.
- **D-08:** **After Resume, Session continues from the paused value**, like a stopwatch: the sum of segments since the session first started, excluding paused time. So the pane has to persist the accumulated session time (or equivalent) with each pause. Total is still TaskNotes' tracked total.
- **D-09:** A paused card has **Resume (primary), Stop and Complete**.
  - **Stop** on a paused card ends the pause. The card disappears, and no TaskNotes write is needed because the entry is already closed.
  - **Complete** follows Phase 2 D-13/D-14: set the completed status from settings, then clear the pause. No stop is needed because nothing is running.
- **D-10:** **Stop all also clears every paused card**, so the pane ends up empty. Running timers stop exactly as in Phase 2, skipping the Pomodoro's.

### When a pause clears
- **D-11:** **If a paused task is started from elsewhere**, for example the status bar, a task card or a command, **treat it as Resume**. The card goes back to running, and Session continues from the paused value.
- **D-12:** **If a paused task is completed elsewhere or deleted, the pause clears.** If the task is renamed or moved, the pause **follows the new path**.
- **D-13:** **Pauses never expire on their own.** There's no midnight or N-hour cutoff. A pause lasts until resumed, stopped, completed, deleted, or taken over by a Pomodoro (D-16).

### Hiding Pomodoro timers
- **D-14:** **Hide the exact Pomodoro-owned entry** (matched by task path and entry start time, using the existing `getPomodoroOwnedEntryId`) from the cards, from every count, and from Pause all and Stop all. Other timers on the same task stay visible. — **Reversibility:** reversible
- **D-15:** **If Pomodoro ownership can't be read, show every timer**, and add a **muted line under the header**: "Can't check Pomodoro — showing all timers" (wording is up to Claude, in sentence case). Show it only while the state is unknown. Stop all and Pause all stay disabled during that time (D-04).
- **D-16:** **If a Pomodoro starts on a task that is paused in the pane, the pause clears.** The paused card disappears.
- **D-17:** **In the Start task picker, mark the Pomodoro's task** with a muted "Pomodoro" tag on its row. Picking it shows a notice like "{title} is being timed by Pomodoro." and writes nothing, extending Phase 2 D-11. Resuming a pause on that task while its Pomodoro runs gets the same notice. This normally can't happen because of D-16, but a race is possible.

### Claude's Discretion
- How the header fits four buttons in a narrow sidebar: icons, wrapping, or a compact layout, within the Phase 1 UI-SPEC style (Obsidian CSS variables, `tntp-` classes, no inline styles).
- Notice wording for partial failures of Pause all or Resume all, following the existing Stop all summary style.
- Persisted pause record shape: for example `{taskPath, sessionStartedAt, accumulatedMs, pausedAt}` stored next to settings in `data.json`, as long as it satisfies D-06 to D-08 and D-12.
- How the pane detects an external start of a paused task (D-11) and a Pomodoro start on a paused task (D-16), using existing refresh triggers.
- Whether the pane's Pause and Resume are tagged with mutation context so their own events can be told apart.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` §Phase 3 — goal and success criteria. Criterion 4 (the Pomodoro label) is superseded by D-14 to D-17.
- `.planning/REQUIREMENTS.md` — CTRL-02, CTRL-03 and CTRL-04, and DISP-07/CTRL-08, which are being replaced (see Phase Boundary).
- `.planning/PROJECT.md` — Key Decisions table. The Pomodoro rows are being superseded.

### Prior decisions
- `.planning/phases/02-start-switch-complete/02-CONTEXT.md` — D-03/D-04 (Stop all, its disabled state and the Pomodoro exclusion), D-05 (serial writes), D-11 (already-timed notice), D-13/D-14 (Complete).
- `.planning/phases/02-start-switch-complete/02-RESEARCH.md` §Exact Pomodoro ownership — the ownership predicate, why Pomodoro session start is not used, and the limit that `time.stop` has no conditional stop.
- `.planning/phases/01-live-timer-pane/01-UI-SPEC.md` — card and header visual contract.

### Pitfalls
- `.planning/research/PITFALLS.md` §Pitfall 12 — Pomodoro-owned timer collisions. Stop/new-entry pause semantics, as also used by TaskNotes' own Pomodoro pause.
- `.planning/research/PITFALLS.md` §Pitfall on interval ticks and sleep — derive frozen and continued Session values from stored timestamps, not counted ticks.

### TaskNotes contract
- `src/tasknotes/runtime-api.types.ts` — vendored Runtime API v1 subset. The available task events are `task.updated` and `task.deleted`. The ROADMAP note mentions `task.moved`, but it isn't in the vendored types. Research must confirm how rename/move is detected for D-12.
- `dev-vault/.obsidian/plugins/tasknotes/main.js` — installed TaskNotes 4.13.8 bundle (`pausePomodoro` and `stopOwnedTimeTracking` for reference semantics).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/model/pomodoroOwnership.ts`: `getPomodoroOwnedEntryId`, `sameEntry` and `selectRegularStopTargets` do the exact ownership matching. Reuse them to filter hidden entries and select Pause all targets.
- `src/state/TimerController.ts`: `stopAll`, `start`, `stop` and `complete` show the pattern for queued, context-tagged writes with outcome objects and notices. Add `pause`, `resume`, `pauseAll` and `resumeAll` in the same shape.
- `src/state/WriteQueue.ts`: the serial write queue. Every pause and resume write goes through it.
- `src/model/timeMath.ts`: `deriveSnapshot`, `sessionMs`, `formatHms`, `totalMs` and `snapshotSignature`. Extend the snapshot with paused entries and the accumulated session time.
- `src/ui/TaskPickerModal.ts` + `src/model/taskPicker.ts`: the picker rows where the "Pomodoro" tag goes (D-17).

### Established Patterns
- `TimerStore.refreshOnce` (`src/state/TimerStore.ts:120`) reads `active()` and `pomodoroOwnership()` in one pass and diffs by signature. Hiding Pomodoro entries and merging pause records belong here, and the ownership and pause data must be part of the signature.
- Settings are loaded with `loadData` and saved with `saveData` in `src/main.ts`. `saveData(settings)` currently writes only settings, so persisting pauses must merge them into the same `data.json` without overwriting either part.
- The header is always shown, and its buttons are disabled until TaskNotes is ready (Phase 2 D-02). New header buttons follow this.

### Integration Points
- `src/ui/TimerPaneView.ts`: header (around line 142), cards (around line 213, actions around line 241), and the stop-all tooltip logic (around line 469). The muted Pomodoro note goes between the header and the cards.
- `TaskNotesBridge` event wiring (around line 395) already refreshes on `task.updated`, `task.deleted` and Pomodoro events. These events drive pause clearing for D-11, D-12 and D-16.

</code_context>

<specifics>
## Specific Ideas

- Session after Resume should feel like a stopwatch continuing, not a restart.
- The pane should feel as if Pomodoro timers don't exist, except for the muted picker tag and the "can't check" note.

</specifics>

<deferred>
## Deferred Ideas

- **Pane control of Pomodoro**: pause, resume or stop a Pomodoro from its card through `api.pomodoro.pause/resume/stop` (`pomodoro.write`). Possible in TaskNotes 4.13.8. Deferred to a later version by user decision on 2026-10-16.

</deferred>

---

*Phase: 03-pause-resume*
*Context gathered: 2026-10-16*
