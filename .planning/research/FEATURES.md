# Feature Research

**Domain:** Daily task staging ("today list") inside an Obsidian sidebar pane, layered on TaskNotes time tracking (v0.3 Staging Tasks)
**Researched:** 2026-11-12
**Confidence:** HIGH for project-specific behavior (derived from STAGING-DECISIONS.md, PROJECT.md and the v0.2 source). MEDIUM for competitor behavior (vendor help docs and user guides via web search, not hands-on testing).

Scope: only the new v0.3 features. Existing v0.2 features (timer cards, Start picker, Stop all, Complete, Pause/Resume, Pomodoro hiding, title chips and task menu, drag/keyboard reorder) are treated as building blocks. Settled decisions (Q2–Q29 with the v0.3 resolutions) are respected. Where this file finds a genuine gap, it is marked **GAP** and collected under "Open questions" at the end.

## How the reference products do "today"

| Product | Add to today | Order | Unfinished at day end | Completed items | Notes relevant here |
|---|---|---|---|---|---|
| **Things 3** | Set "When: Today" (star). Today is a manual list, separate from deadlines. | Manual drag order within Today (plus a "This Evening" sub-list) | Stays in Today with **no overdue badge and no write**. Repeating to-dos move on to the next occurrence. | Checked items stay visible in Today until moved to the Logbook (immediately, daily, or manually, per a setting) | Closest model to this project: quiet roll-forward, manual order, completed items linger for the day. Cultured Code advises keeping Today to what you will actually work on. |
| **Todoist Today** | Due date = today | Manual sort, or sort by priority/time | Becomes an **Overdue** section at the top, plus a bulk "Reschedule" button | Disappear from the view (collapsed "completed" toggle) | Rollover is modeled as "overdue", which nags. The user's model (Q10) deliberately avoids this. |
| **Sunsama** | Daily planning ritual: drag from backlog/integrations into today | Manual order, time estimates, timeboxing on calendar | **Auto rolls over** to the next day and shows a **numbered circle with consecutive rollover days**. Auto-archives after N consecutive days (configurable, can be disabled). | Stay on the day, struck through | The days-staged badge (Q10) is Sunsama's rollover counter. Auto-archive is the part to *not* copy (it writes and surprises). |
| **Amie / Akiflow / Motion** | Drag todos onto a calendar day or time block | Time-based | Moved or rescheduled, sometimes automatically | Shown on the day | Time-blocking products. Out of this project's shape. |
| **Obsidian Day Planner** | Write tasks with times in the daily note | By time (timeline) | Stays in that day's note; you copy it forward | Checked in the note | Daily-note-centric. Carry-over is manual, which is the pain point staging avoids. |
| **Obsidian Tasks / Dataview "today" queries** | `scheduled`/`due` on or before today, or a tag | Query sort (no manual order) | Shown again if the query includes `before tomorrow`, with no write | Hidden by `not done`, or shown via `done today` | Shows the "derive the list from a date field, no rollover writes" pattern (same as Q10), but with no manual order, which is the gap this plugin fills. |
| **TaskNotes (own views)** | `scheduled` date, Agenda view, Bases views | Sort/group by field, no persisted manual order | Overdue styling on `scheduled`/`due` | Status-driven | Q2 keeps `scheduled` free. TaskNotes has no "my picked list, in my order" concept, which is why staging is a gap filler rather than a duplicate (fits the "defer to TaskNotes built-ins" preference). |

**The consensus pattern this project matches:** a manually picked, manually ordered list for the day (Things, Sunsama); unfinished items roll forward silently (Things, Tasks queries); a visible "stale" counter (Sunsama); completed items stay visible until the day ends (Things, Sunsama). Every settled decision lines up with this pattern. Nothing in the settled design contradicts the domain norm.

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these makes the Staged tab feel broken for the "pick, order, work down the list" workflow.

| Feature | Why Expected | Complexity | Notes / dependencies on v0.2 |
|---|---|---|---|
| **Two tabs: Staged / Timers**, last-active tab remembered | Q27. A tab that resets to the default on every reopen or reload feels broken in a persistent sidebar pane. | LOW–MEDIUM | Tab strip in `TimerPaneView` header. Persist `activeTab` in data.json via `persistAll`. Timers tab = the v0.2 view unchanged. |
| **Tab badges: count, and a "running" cue on Timers** | In a narrow sidebar you only see one tab. Without a cue, a timer started from the status bar or a task card is invisible while the Staged tab is showing. That breaks the Core Value ("always see what task is being timed"). | LOW | Staged: count of unfinished staged tasks. Timers: count of running regular timers, with an accent when it is above 0. Reads the existing `TimerStore`. **GAP-1** (not in the decisions). |
| **Stage via picker** (all not-done, not-archived tasks, no suggestions) | Q14. The only way in. | LOW | Reuse `TaskPickerModal` and `filterAndSortTasks`. Today the picker *includes* completed tasks (sorted last), so it needs a mode that excludes completed statuses (`api.catalog.statuses().isCompleted`) as well as archived ones. See GAP-2 for tasks that are already staged. |
| **Stage writes `staged: <logical today>`** via `api.tasks.update` | Q9, Q15 | MEDIUM | "Today" must be the **logical day** (rollover hour), not the calendar date. A task staged at 01:30 with a 4 AM rollover gets *yesterday's* date. Otherwise it shows "1 day staged" the next morning or drops off early. Goes through `WriteQueue`. |
| **Setup notice when the `staged` user field isn't registered** | Q15. `tasks.update` silently drops unregistered keys, so without a check the stage action fails silently. | LOW–MEDIUM | Check `settings.userFields` through the public API if it is exposed. Otherwise verify by reading back after the first write. Replace the Staged tab's empty state with the notice, and disable the Stage button. |
| **Unstage ✕ deletes the key** | Q11 | LOW–MEDIUM | Needs a "delete key" path through `tasks.update` (for example `{ staged: null }` or `undefined`). Confirm how TaskNotes serializes this (it might write `staged: ""` instead of removing the key). Phase research flag. |
| **Staged list derived, not stored**: unfinished tasks with `staged <= logicalToday` | Q10. Tasks staged elsewhere (chat, hand edits, Sync from another device) must appear. | MEDIUM | Derive from `api.tasks.list` (or `query.tasks`) on `task.updated` / `cache.changed`, the same refresh model as `TimerStore`. Exclude completed statuses and archived tasks. Ignore `staged` dates in the future (see Differentiators). |
| **Manual order, persisted, new arrivals at the bottom** | Q3. The workflow is "work down the list". | LOW | Reuse `moveKey` / `moveKeyBy` and a second `CardOrderStore` keyed by **task path**. Note that the v0.2 `orderTimers` puts *unsaved items at the top*. Staged needs unsaved items at the **bottom**, so add a parameter rather than copying the function. |
| **Drag + ArrowUp/Down reorder; up/down buttons on mobile** | Q5, Q20 | LOW–MEDIUM | v0.2 drag and keyboard code carries over. The mobile buttons are new. Gate them on `Platform.isMobile` so they don't clutter desktop cards. Decide whether the Timers tab gets them too (cheap, consistent). |
| **Idle staged card: title chip, start, ✓, ✕, drag handle** | Q20, PROJECT.md | LOW | Reuse the card renderer. Title click opens the note. Right-click opens `ui.taskMenu`. |
| **Running staged card: also elapsed, pause, stop** | PROJECT.md | MEDIUM | The same `TimerController` actions as the Timers tab. A running staged task appears in **both** tabs, so both must render from the same store and pause records (no divergent state). |
| **Paused staged card state** | The v0.2 pause is "stop + record". A paused staged task is neither idle nor running. | LOW–MEDIUM | **GAP-3**: the decisions define idle and running only. Recommendation: show resume (in place of start) plus ✓ and ✕, with the frozen session time, matching the v0.2 paused card. |
| **Start from a staged card** keeps other timers running | v0.2 semantics (Start adds a concurrent timer) | LOW | Reuse the existing start path, including the Pomodoro refusal notice. |
| **Complete ✓ from the staged list** (stops timer, writes completed status, clears `staged`, goes to Done today) | Q12, Q17 | MEDIUM | Reuse the v0.2 Complete flow (persisted completed-status preference, stop the same open entry). Then clear `staged`. Order: status, then stop, then clear `staged`. If clearing `staged` fails after the status write succeeded, the task is still excluded from the list because it is completed, so the failure is harmless. Record it in Done today. |
| **Recurring ✓ completes today's instance only** | Q16 | MEDIUM | `api.recurring.toggleCompleteInstance(path, date)`. Pass the **logical date** explicitly. Otherwise, at 01:30 TaskNotes may complete the calendar-today instance instead. It is a *toggle*, so guard against double-clicks (busy state, `WriteQueue`). Also stop a running timer first, because toggleCompleteInstance probably won't. |
| **"Done today" section** until rollover | Q4, Q12 | MEDIUM | A collapsible section at the bottom of the Staged tab. Source = the plugin's record (paths + logical date) intersected with `completedDate == logicalToday` (or `complete_instances` includes today for recurring tasks). Clear the record at rollover. Persist via `persistAll`. |
| **Rollover at a configurable hour (default 4 AM), no writes, days-staged badge** | Q10, Q19 | MEDIUM | A pure `logicalDay(now, hour)` helper in `model/`. Re-derive when the logical day changes: check it in the existing 1 s tick, plus on sleep/wake and focus (v0.2 already has a wake reconnect). Badge: nothing for 0 days, "1d", "2d", and so on, like Sunsama's numbered circle. Keep it quiet: no red, and no overdue language. |
| **Empty states** | Every list product has them, and the Staged tab starts empty every day the user doesn't carry tasks over. | LOW | (a) Nothing staged: "Nothing staged for today" plus a Stage tasks button. (b) All done: "All staged tasks done" above the Done today list. (c) Field missing: the setup notice. (d) TaskNotes unavailable: the existing v0.2 degraded state, shared by both tabs. |
| **Rename / move / delete while staged** | Paths are the order key. Without this, a renamed task jumps to the bottom and a deleted one leaves a ghost in the order or Done today. | LOW | The frontmatter moves with the file, so staged state survives a rename by itself. Only the plugin's path-keyed data needs fixing: on vault `rename`, rewrite the staged order and Done-today record (mirror `PauseStore.renamePath`, folder moves included). On `delete`, drop the entries. Stale keys are already ignored by the order helpers, so a missed event only costs a position. |
| **Rename: display name "TaskNotes Task Control"** | Q21/Q22 | LOW | Manifest `name`, view title, ribbon tooltip, command names. The id stays the same. |

### Differentiators (cheap wins that fit this user's workflow)

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **Days-staged badge** (already decided) | Sunsama's best idea without the auto-archive: it shows at a glance what keeps slipping. | LOW | Settled (Q10). Listed here because most "today" tools (Todoist, Things) don't have it. |
| **Total tracked time on idle staged cards** (muted, for example "1:42 total") | When choosing what to start next, you can see how much time you have already put in. Uses data the pane already computes. | LOW | Sum of closed `timeEntries` from TaskInfo (existing `timeMath`). Show it only if non-zero. Skip it if it crowds the narrow card. |
| **Future `staged` date = quietly deferred** | Falls out of `staged <= today` for free. Hand-editing `staged: 2026-11-20` hides a task until that day. | NONE | Don't build UI for it. Just make sure the derive logic treats future dates as "not yet" rather than errors. |
| **Staging a running task shows it running immediately** | A task you're already timing (started from the status bar) joins the Staged list in its live state. No restart, no duplicate entry. | LOW | Falls out of rendering staged cards from the shared timer store. The behavior is worth stating so nobody adds a "start on stage". |
| **Undo for an accidental ✓ in Done today** | Completing writes a status and closes the entry. A misclick on a narrow card is likely. Things allows unchecking while the item is still in Today. | MEDIUM | Reopen with the previous status (or toggle the recurring instance back) and re-stage with the original `staged` date. **GAP-6**. Candidate P2, not required. |
| **Staged-tab running indicator in the Timers tab** (for example a small "staged" dot on cards) | Shows which running timers belong to today's plan. | LOW | Nice-to-have. Skip if it adds noise. |

### Anti-Features (seem useful, conflict with this workflow or with the settled design)

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Auto-archive / auto-unstage after N days (Sunsama) | Keeps the list from growing stale | Writes to notes on a timer and makes tasks disappear without explanation. Contradicts "roll forward with no writes" (Q10). | The days-staged badge plus manual ✕ |
| "Overdue" section or red styling for rolled-over tasks (Todoist) | Urgency | Nags, and treats a choice as a failure. Staging isn't a due date. | A neutral "Nd" badge |
| Rewriting `staged` to today at every rollover | Simplifies "today" filtering | Writes to every staged note daily and causes Sync churn. Destroys the days-staged information. | Derive from `staged <= logicalToday` (settled) |
| Picker suggestions (due today, overdue, high priority, "add yesterday's") | Faster planning | Explicitly rejected (Q14). Duplicates TaskNotes' Agenda and Bases views. | Plain ranked search over all open tasks |
| Daily planning ritual / shutdown wizard (Sunsama) | Habit building | Modal friction in a sidebar companion. The user's workflow is a quick pick. | The Stage button in the empty state |
| Time estimates / planned-hours totals / timeboxing on a calendar | "Is my day realistic?" | Estimate progress is deferred to v2. Calendar blocking is Day Planner's and Amie's territory. | Defer; possibly a v2 "estimate progress" feature |
| Staging for future days / a weekly plan | Planning ahead | A second date UI and scope creep. `scheduled` already exists for this, and is reserved for its intended use. | A hand-edited future `staged` date works (see Differentiators) |
| Drag a card from Timers to Staged (cross-tab drag) | Feels natural | Tabs are mutually exclusive in a narrow pane, so cross-tab drag targets are awkward and fragile. | A "Stage" item in the card's context menu or the picker (P3) |
| A single shared order across tabs | "One order" | Explicitly superseded (Q27 vs Q23). The orders are independent. | Two `CardOrderStore` instances |
| Unstage auto-stops the timer | "Removing it from today means I'm done with it" | Destroys a running session through a list-membership action. It would be the only non-time button that touches time entries. | ✕ only deletes the key. The timer keeps running and stays visible in Timers (see GAP-4). |
| Pomodoro display or 🍅 start on staged cards | Original Q7/Q25 | Rejected for v0.3 (it would orphan the Pomodoro's time entry). | v0.2 behavior: hidden; start refused with a notice |
| Auto-registering the `staged` user field | Zero setup | No official API. Relies on TaskNotes internals. | A one-time setup notice (Q15) |
| Writing `staged` with `processFrontMatter` as a fallback | Works when the field isn't registered | Bypasses TaskNotes' cache, events and field mapping. Violates the data-format constraint. | `api.tasks.update` only, plus the notice |

## Expected behaviors for the specific scenarios asked about

| Scenario | Expected behavior | Status |
|---|---|---|
| Add to today | Picker → write `staged: logicalToday` → card appears at the bottom of the Staged order. Re-staging a task that is already staged refreshes its date, which resets its days-staged count (Q10). | Settled, except for picker visibility (GAP-2) |
| Reorder | Drag, ArrowUp/Down, mobile up/down. Saved per tab. Unknown paths go to the bottom. Missing paths are ignored. | Settled |
| Carry-over | Unfinished tasks with `staged < today` stay, with an "Nd" badge. No writes. The day boundary is the logical day at the rollover hour. | Settled. The logical-date write rule is an implementation must. |
| Done today | Completed via the pane, or completed elsewhere if the task is in the plugin's record and `completedDate == today`. Shown in a collapsible section, and cleared at rollover. | Settled. The external-completion detail is GAP-5. |
| Empty states | Four variants (nothing staged, all done, field missing, TaskNotes unavailable) | Not explicit in the decisions. Recommended above. |
| Staging a task that is already running | Appears immediately as a running card in Staged, and stays in Timers. Same session and pause state in both tabs. | Follows from the design. Make it explicit in requirements. |
| Unstaging a running task | **GAP-4.** Recommendation: ✕ deletes the key only. The timer keeps running, and the card leaves Staged but stays in Timers. No confirm dialog. Optionally show a notice "Still timing in Timers". | Open |
| Completing from the list | Status (or recurring instance) → stop the open entry → clear `staged` → Done today | Settled (Q12, Q16, Q17) |
| Task completed outside the pane | It drops out of the unfinished list automatically, because completed statuses are excluded. Its `staged` key stays on the note unless the pane clears it. | **GAP-5** |
| Task deleted while staged | The card vanishes on the next refresh. The vault `delete` event drops it from the order and the Done-today record. | Recommended (mirrors `PauseStore`) |
| Task renamed or moved while staged | The key moves with the file. The vault `rename` event rewrites the order and Done-today paths, so its position is kept. | Recommended (mirrors `PauseStore.renamePath`) |
| Task archived while staged | Excluded from Staged, the same as completed tasks (matches the picker's "not archived"). No pane write. | Recommended |
| Completed task reopened in TaskNotes | `staged` was already cleared at completion, so it doesn't return to Staged. It falls out of Done today because `completedDate` no longer matches. The user restages it if wanted. | Acceptable; note it in docs |
| Tab UX in a narrow sidebar | Two compact tabs at the top of the pane: text labels with counts ("Staged 4", "Timers 1"). Accent on Timers when anything is running. The header actions change per tab: Staged has a Stage button; Timers keeps Start, Pause all and Stop all. Last-active tab persisted. Keyboard: tabs reachable with Tab/Arrow keys and `aria-selected` set. | Recommended (GAP-1, GAP-7) |

## Feature Dependencies

```
logicalDay(now, rolloverHour)  [new pure helper]
    └──required by──> staged write date, staged-list derivation, days-staged badge,
                      Done-today record and clearing, recurring instance date

User-field setup check
    └──gates──> Stage, Unstage, Complete's "clear staged" step

StagedStore (derive from tasks.list + events)  [new; mirrors TimerStore refresh model]
    ├──requires──> TaskNotesBridge additions: tasks.update, recurring.toggleCompleteInstance,
    │              user-field read (top-level / customProperties)
    ├──requires──> existing TimerStore + PauseStore (running and paused state per path)
    └──required by──> Staged tab rendering, tab counts, empty states

Staged order store  [reuse CardOrderStore + cardOrder helpers, keyed by path]
    └──requires──> orderTimers variant with "unsaved → bottom"
    └──requires──> vault rename/delete handling (pattern exists in PauseStore / main.ts)

Stage picker  ──reuses──> TaskPickerModal + filterAndSortTasks (new exclude-completed mode)

Staged card actions ──reuse──> TimerController start / pause / resume / stop / complete, WriteQueue
    └── Complete (staged) ──extends──> v0.2 Complete + clear staged + Done-today record
    └── Recurring complete ──new──> toggleCompleteInstance(path, logicalDate)

Done-today section ──requires──> Complete (staged), logicalDay, persistAll record

Tabs ──requires──> view restructure (header actions per tab, persisted activeTab)
Mobile up/down buttons ──enhances──> both tabs' ordering (Platform.isMobile)
Rename to "TaskNotes Task Control" ──independent── (can ship in any phase)
```

### Dependency Notes

- **logicalDay comes first.** Every date-touching feature depends on it. If any write or comparison uses the raw calendar date, staged tasks at 00:00–04:00 get off-by-one dates that persist in frontmatter.
- **Bridge additions come before any staging UI.** `tasks.update` (including key deletion semantics) and the user-field check are the riskiest unknowns. Probe them against TaskNotes 4.13.x in the dev vault before building cards.
- **The Staged tab reuses the Timers tab's store, not a copy of it.** Running and paused state must come from the same `TimerStore`/`PauseStore` so the two tabs can't disagree.
- **The tabs conflict with the v0.2 single-header layout.** The header actions (Start, Pause all, Stop all) need a per-tab home. Decide this in the tabs phase, before adding the Stage button.

## MVP Definition

### Launch With (v0.3.0)

- [ ] logicalDay helper + rollover hour setting (default 4) — everything else uses it
- [ ] `staged` key setting + setup notice when the user field is missing — otherwise staging silently fails
- [ ] Bridge: `tasks.update` (set and delete key), `recurring.toggleCompleteInstance`, user-field read
- [ ] Tabs (Staged / Timers), persisted active tab, counts and running cue
- [ ] Stage picker (exclude completed and archived) + unstage ✕
- [ ] Staged list derivation (`staged <= today`, unfinished), days-staged badge, roll-forward with no writes
- [ ] Persisted staged order, bottom-insertion, drag/keyboard, mobile up/down
- [ ] Staged cards: idle, running and paused states, reusing TimerController
- [ ] Complete from Staged (regular + recurring instance) → clear `staged` → Done today section, cleared at rollover
- [ ] Rename/delete handling for staged order and Done-today record
- [ ] Empty states
- [ ] Display rename to "TaskNotes Task Control", release 0.3.0

### Add After Validation (v0.3.x)

- [ ] Undo complete from Done today — add if misclicks happen in practice
- [ ] Total tracked time on idle staged cards — add if choosing the next task needs it
- [ ] "Stage" entry from a Timers card (context menu) — add if staging running tasks via the picker feels roundabout

### Future Consideration (v2+)

- [ ] Estimate progress / planned-time totals for the day (already on the v2 list)
- [ ] Pomodoro display and start on staged cards (rejected for v0.3, revisit with `api.pomodoro.*`)
- [ ] Today's log / per-day time summary (already on the v2 list)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| logicalDay + rollover setting | HIGH | LOW | P1 |
| User-field setup check + notice | HIGH | LOW–MEDIUM | P1 |
| Stage picker + unstage | HIGH | LOW–MEDIUM | P1 |
| Staged list derivation + days badge | HIGH | MEDIUM | P1 |
| Tabs + persisted active tab + counts/running cue | HIGH | LOW–MEDIUM | P1 |
| Staged order (drag/keyboard) | HIGH | LOW | P1 |
| Staged card idle/running/paused states | HIGH | MEDIUM | P1 |
| Complete + Done today (incl. recurring) | HIGH | MEDIUM | P1 |
| Rename/delete path following | MEDIUM | LOW | P1 |
| Empty states | MEDIUM | LOW | P1 |
| Mobile up/down buttons | LOW (desktop-verified only) | LOW | P1 (settled scope), best effort |
| Display rename | LOW | LOW | P1 (settled) |
| Undo complete | MEDIUM | MEDIUM | P2 |
| Total time on idle cards | MEDIUM | LOW | P2 |
| Stage from a Timers card menu | LOW | LOW | P3 |

## Open questions (genuine gaps; none contradict settled decisions)

- **GAP-1 Tab cues.** Should the tab labels show counts, and should Timers get a running accent while Staged is showing? Recommended: yes. It protects the Core Value when the pane sits on Staged.
- **GAP-2 Already-staged tasks in the stage picker.** Exclude them (cleaner) or show them marked "staged Nd" so picking one refreshes the date (Q10)? Recommended: show them marked, sorted after unstaged tasks, because re-staging is the only built-in way to reset the days count.
- **GAP-3 Paused staged card.** Not defined by "idle vs running". Recommended: resume + ✓ + ✕ with the frozen session time, matching the v0.2 paused card.
- **GAP-4 Unstaging a running task.** Recommended: delete the key only. The timer continues and stays visible in Timers.
- **GAP-5 Completion outside the pane.** Should the pane clear the stale `staged` key on a task completed elsewhere? Recommended: no write on observation (it would echo writes on Sync from other devices). The leftover key is harmless because completed tasks are excluded. Clear it if the task is restaged or unstaged. Also confirm that Done today includes externally completed tasks that were in the plugin's record (Q12 implies yes).
- **GAP-6 Undo complete.** Not in the decisions. Recommended for P2, not v0.3.0.
- **GAP-7 Header actions per tab.** Recommended: Stage on the Staged tab. Start, Pause all and Stop all on the Timers tab. Whether Stop all should also appear on Staged needs a user call.
- **Research flag (phase level):** how `api.tasks.update` deletes a user-field key (null vs undefined vs empty string), whether TaskNotes exposes `userFields` through the public API for the setup check, and whether `toggleCompleteInstance` stops a running timer or emits `time.stopped`. Verify all three against TaskNotes 4.13.x in the dev vault before planning card actions.
- **Research flag:** date semantics. `completedDate` and `complete_instances` use TaskNotes' calendar date, while the pane uses the logical day. Between midnight and the rollover hour, "completed today" checks must compare against the date TaskNotes actually wrote, or Done today misses items completed at 01:00.

## Sources

- Project: `.planning/PROJECT.md`, `.planning/research/STAGING-DECISIONS.md`, v0.2 source (`src/model/cardOrder.ts`, `src/model/taskPicker.ts`, `src/state/PauseStore.ts`, `src/main.ts`) — HIGH
- [Sunsama: Task rollover basics](https://help.sunsama.com/docs/task-rollover-and-recurring-tasks-the-basics), [Sunsama archive](https://help.sunsama.com/docs/usage-guides/archive), [Sunsama changelog Nov 2022 (rollover count always shown)](https://roadmap.sunsama.com/changelog/weekly-update-november-4-2022) — MEDIUM
- [Todoist: Plan your day with the Today view](https://www.todoist.com/help/articles/plan-your-day-with-the-today-view-UVUXaiSs) — MEDIUM
- [Things: Cultured Code support](https://culturedcode.com/things/support/articles/4001304/), [Effective task management with Things (Sebastian De Deyne)](https://sebastiandedeyne.com/effective-task-management-with-things/), [Things 3 complete guide (vanja.io)](https://vanja.io/things-3-complete-guide/) — MEDIUM (Logbook move-timing setting from prior knowledge, not re-verified: LOW)
- Obsidian Day Planner, Obsidian Tasks / Dataview query patterns, TaskNotes views: prior knowledge of the plugins' documented behavior, not re-fetched this session — LOW–MEDIUM, used only for contrast, not for decisions

---
*Feature research for: daily task staging in TaskNotes Task Control (v0.3)*
*Researched: 2026-11-12*
