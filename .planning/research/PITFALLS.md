# Pitfalls Research

**Domain:** Obsidian companion plugin: a sidebar pane that monitors and controls TaskNotes (callumalpass/tasknotes) regular time tracking, running in the same process
**Researched:** 2026-10-13
**Confidence:** HIGH for TaskNotes behaviour (read directly from TaskNotes source at commit `451679289`, v4.13.8, and from the `5.0.0-beta.5` tag). MEDIUM for Obsidian platform behaviour (official docs plus established plugin practice). Web-only corroboration is marked where used.

> **Correction to PROJECT.md:** PROJECT.md assumes TaskNotes "internals ... aren't a stable public API". That was true before 4.10.0 but is now out of date. Since **TaskNotes 4.10.0** there has been a **versioned in-process JavaScript Runtime API** (`app.plugins.getPlugin("tasknotes").api`, `apiVersion === 1`, capability flags) built for companion plugins. It includes `api.time.start/stop/active/task/summary`, `api.events.on(...)` (with `time.started`/`time.stopped`), `api.lifecycle`, `api.query`, and typed errors. The TaskNotes docs (`docs/companion-plugins.md`) say companion plugins *should* use it "instead of rewriting TaskNotes frontmatter directly". Most of the pitfalls below are either avoided by using this API or are traps that remain even when you use it.

**Suggested phase labels used below** (for the roadmapper to rename):
- **P1 Bridge:** TaskNotes connection layer: discovery, version/capability gating, lifecycle, events, and a typed facade
- **P2 Pane + Live Timer:** ItemView, ribbon/command, current task, live elapsed, total
- **P3 Controls:** stop, pause/resume, switch
- **P4 Picker + Recents**
- **P5 Today's Log**
- **P6 Hardening:** reload/disable cycles, popout/mobile, perf, sleep/wake

---

## Critical Pitfalls

### Pitfall 1: Reaching into TaskNotes private internals instead of the Runtime API

**What goes wrong:**
The plugin calls `plugin.taskService.startTimeTracking(task)`, `plugin.cacheManager.getAllCachedTasks()`, `plugin.emitter.on("task-updated")`, `plugin.getActiveTimeSession()`, or `plugin.taskActionCoordinator.*`. These are internal and change between point releases. TaskNotes ships very often (4.10.0 through 4.13.8 plus six v5 betas in a few months). One refactor, such as the `TaskActionCoordinator` extraction or `emitter` becoming an alias of `cacheManager` (`pluginBootstrap.ts:133`), silently breaks the pane.

**Why it happens:**
Older forum and Discord snippets and the `jane-t/TaskNotesTimer` inspiration predate the Runtime API. The internals are reachable from `app.plugins.plugins.tasknotes` and look convenient.

**How to avoid:**
- Use only `tasknotes.api` (the `TaskNotesRuntimeApiV1` contract in `src/api/runtime-api.ts`).
- At connect time, gate on `api.apiVersion === 1` and on `api.hasCapability(...)` for each of `time.read`, `time.write`, `tasks.read`, `tasks.events`, `lifecycle.events`, and `query.tasks`. If any is missing, show a clear "TaskNotes ≥ 4.10 required" state in the pane.
- Put every TaskNotes call behind one `TaskNotesBridge` module, which is the only file that touches `app.plugins`. When TaskNotes changes, only that file changes.
- **Do not** follow the docs' suggestion to `import type ... from "tasknotes/src/api/runtime-api"`. That file imports `@tasknotes/model`, `../types`, `../types/settings`, and `../services/NaturalLanguageParser`, which pulls TaskNotes' source tree and dependencies into your type-check. Vendor a small hand-written `tasknotes-api.d.ts` that covers only the members you use (time, events, lifecycle, query, and the `TaskInfo`/`TimeEntry` fields you read). Use `import type` only, and never value-import anything from TaskNotes, because esbuild would bundle a second copy.

**Warning signs:**
- Any `as any` access to `plugin.taskService`, `plugin.cacheManager`, or `plugin.emitter` outside the bridge.
- TypeScript compile pulling in files from a `tasknotes` dev dependency.
- The pane breaks after a TaskNotes auto-update while the rest of TaskNotes still works.

**Phase to address:** P1 Bridge. This is foundational and must exist before any UI.

---

### Pitfall 2: Writing `timeEntries` yourself and racing TaskNotes (lost updates / resurrected timers)

**What goes wrong:**
The pane edits frontmatter with `app.fileManager.processFrontMatter`, or it uses `api.tasks.update(path, { timeEntries })` or `api.time.append(...)` to implement pause or switch. Either path can overwrite a concurrent TaskNotes write. Two examples:
- The user hits the status-bar stop at the same moment as the pane's pause. One write wins and a closed entry reopens, or an entry is duplicated.
- Pomodoro writes an entry while the pane writes a stale snapshot.

**Why it happens:**
- TaskNotes serializes start/stop only through a **per-path promise lock** inside `TaskService.withTimeTrackingLock` (`TaskService.ts:1555`). It re-reads persisted frontmatter inside `processVaultFrontMatter` before deciding.
- `tasks.update` and `time.append` are **not** under that lock. They do read-modify-write on the **whole array** from the cached `TaskInfo`: `appendTimeEntry` builds `[...task.timeEntries, entry]` (`TaskNotesAPI.ts:2242`), and `taskUpdatePlanning.ts:87` replaces `timeEntries` wholesale.
- The cache updates through a **300 ms debounced** metadata listener (`TaskManager.ts:58`), so a snapshot taken right after a stop can still show the entry as open.
- The `timeEntries` frontmatter key is **user-remappable** (`fieldMapper.toUserField("timeEntries")`), so a raw `frontmatter.timeEntries` write can also go to the wrong key.

**How to avoid:**
- Make only two kinds of write: `api.time.start(path, opts?, ctx)` and `api.time.stop(path, ctx)`. Both route through the locked, re-reading TaskService path.
- Implement pause as `time.stop`, and resume as `time.start` on the same task. Never edit entries to pause.
- Never call `tasks.update({timeEntries})`, `time.append`, or `processFrontMatter` on task files in v1.
- Always pass a mutation context `{ source: "tasknotes-timer-pane", correlationId, reason }`. TaskNotes events then carry it, which helps debugging and lets you ignore your own echo.
- Read time data only from API `TaskInfo` objects. Never read raw `metadataCache` frontmatter keys.

**Warning signs:**
- Code that builds or mutates a `TimeEntry[]`.
- An entry with an `endTime` reappears without one, or adjacent entries with identical `startTime` appear after rapid clicks.
- Time data lands under `timeEntries` when the user mapped it to another key.

**Phase to address:** P1 Bridge (the facade exposes only start/stop) and P3 Controls.

---

### Pitfall 3: Assuming exactly one active timer

**What goes wrong:**
The pane shows "the current task" and assumes it is the only one. TaskNotes **explicitly allows several concurrent trackers on different tasks** and prevents duplicates only on the same task. The docs say: "Active sessions on different tasks can exist at the same time." Issue #1670, asking to auto-stop other timers, is still an open feature request, and the 4.13.7 "Stop active time tracking" command opens a chooser "with several" trackers. If the pane assumes one timer:
- "Stop" stops the wrong one.
- "Switch" leaves the old timer running, so two timers accrue.
- Totals double-count wall time.

**Why it happens:**
Single-timer apps like the TaskNotesTimer overlay and Toggl train that mental model. TaskNotes' `api.time.start` does **not** stop other tasks' timers (`TaskNotesAPI.ts:2197`).

**How to avoid:**
- Model the state as `ActiveEntry[]` (from `api.time.active()`, which returns `{taskPath, task, entry, index}` for every open entry). The UI shows one "primary" entry, the most recent `startTime`, plus a visible "+N other timers running" indicator with per-entry stop.
- "Switch to task B" must explicitly `time.stop` **every** other active entry the user intends to end. Decide this in requirements: stop all, or stop only the primary. Recommended: stop the primary and warn if others remain.
- Handle malformed data: one task can contain more than one open entry after sync conflicts or hand edits. TaskNotes' `getActiveTimeEntry` returns the first one, and its start will refuse with "Time tracking is already active for this task".

**Warning signs:**
- Types like `activeTask: TaskInfo | null` instead of an array.
- After switching, TaskNotes' status bar shows two trackers.

**Phase to address:** P2 (data model) and P3 (switch semantics). Requirements must state the policy explicitly.

---

### Pitfall 4: Non-atomic switch and pause/resume (double-clicks, partial failure)

**What goes wrong:**
"Switch" is two awaited writes, `stop(A)` then `start(B)`. Each write waits for the metadata cache, because `waitForFreshTaskData` polls up to 10 times with 50 ms × i backoff, so a write can take hundreds of milliseconds. During that window:
- A double-click fires a second switch.
- The user clicks a different recent task, so two starts race. TaskNotes' lock is **per path**, so starts on *different* tasks are not serialized, and you can end up with two timers.
- `start(B)` fails (task file renamed or deleted, "already active", TaskNotes threw), leaving **nothing** running with no feedback.

**Why it happens:**
TaskNotes has no transactional "switch" API, and the per-path lock gives a false sense of safety.

**How to avoid:**
- Run every control action through **one pane-level serial operation queue** (a single in-flight promise). Disable the buttons and show a busy state while it is pending.
- Order the switch as `stop(A)` → `start(B)`. If `start(B)` fails, surface a Notice with a "Resume A" action rather than silently leaving nothing running.
- Treat `TaskNotesApiError.code` (`task_not_found`, `task_file_not_found`, `operation_failed`) and the "already active" / "No active time tracking session" messages as expected outcomes. Re-read state after any failure.
- Accept a small gap of up to about 1 s between A's `endTime` and B's `startTime`. The public API has no `stopTime` parameter; only the internal `taskService.stopTimeTracking(task, stopTime, expectedStartTime)` has one. Do not reach into internals to close the gap.

**Warning signs:**
- Buttons that stay enabled while a write is in flight.
- Rapid clicking in manual testing produces two active entries or a missing entry.

**Phase to address:** P3 Controls.

---

### Pitfall 5: Pause state that exists only in memory or in the pane

**What goes wrong:**
After pause (which is a stop), TaskNotes has **no record** that the task is paused rather than stopped. After an Obsidian restart, a plugin reload, or switching devices, the pane forgets the paused task, or shows "Paused" for a task the user has since started elsewhere, completed, or deleted.

**Why it happens:**
TaskNotes has no native pause for regular tracking. Its own Pomodoro pause uses the same stop-then-new-entry semantics (`PomodoroService.pausePomodoro` → `stopOwnedTimeTracking`; resume → `startOwnedTimeTracking`), which confirms the approach, but the "paused" flag is companion-owned state.

**How to avoid:**
- Persist `{ pausedTaskPath, pausedAt }` in the plugin's `saveData`.
- Re-validate it on load and on every relevant event:
  - Clear it if any timer starts on any task (the user moved on).
  - Clear it if the task is deleted, completed, or archived.
  - Follow renames via `task.moved`.
- Define pause in requirements as "stopped, with one-click resume to the same task". It is not a frozen session. Each pause/resume cycle creates one more `timeEntries` item, which is expected but is TaskNotes-visible fragmentation (see Pitfall 9 for rounding).
- Optionally write a time-entry `description` on resume. This is not recommended for v1, because `api.time.start` with a description does a second, non-locked `tasks.update` write (`TaskNotesAPI.ts:2207-2222`).

**Warning signs:**
- Pause state held in a View field, so it is lost when the pane closes.
- "Resume" shown for a completed task.

**Phase to address:** P3 Controls.

---

### Pitfall 6: Missing timers started or stopped outside the pane (sync and external edits)

**What goes wrong:**
The pane subscribes only to `time.started` / `time.stopped` and misses changes that come from file edits, such as:
- Obsidian Sync or iCloud bringing in a timer started on mobile.
- The user editing YAML by hand.
- A git pull.

Confirmed in source: for file-originated changes, `TaskManager.handleFileChanged` triggers `task-updated` **without `originalTask`** (`TaskManager.ts:194`). The API's normalizer then has no `before`, so it emits `task.created` + `task.updated` and **never** `time.started`/`time.stopped` (`TaskNotesAPI.ts:2726-2840`). The same file change also produces a spurious `task.created`.

**Why it happens:**
The docs list `time.started`/`time.stopped` as the time events, and it is natural to trust them as complete.

**How to avoid:**
- Treat events as "something may have changed" hints, not as state deltas.
- Subscribe to `task.updated`, `task.deleted`, `task.moved`, `time.started`, `time.stopped`, and lifecycle `cache.changed` / `cache.rebuilt`. On any of them, **debounce about 250 ms** and re-derive active state from `api.time.active()`.
- Make re-derivation idempotent. TaskNotes typically fires `task-updated` **twice** per mutation: once immediately from `TaskService`, and again about 300 ms later from the debounced metadata listener.
- Compare state by `(taskPath, entry.startTime)` keys, not by object identity. The API returns fresh deep copies every call (`copyTaskInfo`), so identity checks always say "changed" and cause re-render churn.
- Add a low-frequency safety resync, for example every 30-60 s and when the pane becomes visible.

**Warning signs:**
- Starting a timer on phone, then syncing to desktop, leaves the pane idle while the status bar shows tracking.
- The pane flickers twice per action.

**Phase to address:** P1 Bridge (the event-to-resync pipeline) and P2. Verify in P6 with a manual YAML edit test.

---

### Pitfall 7: Load order and TaskNotes disable/enable/update lifecycle

**What goes wrong:**
- **Load order:** In our `onload`, `app.plugins.getPlugin("tasknotes")?.api` is `undefined` because plugin load order is not guaranteed. TaskNotes also creates `plugin.api` only after `await loadSettings()` inside its own `onload` (`main.ts:281`, `pluginBootstrap.ts:113`). The pane then permanently shows "TaskNotes not installed".
- **Stale handle:** The pane caches the `api` object. When the user disables, updates, or re-enables TaskNotes, a **new plugin instance with a new `api` and a new emitter** is created. Our cached reference now points at a torn-down instance: calls may throw, or worse, half-work against unloaded services. Event subscriptions are bound to the dead emitter and stop firing silently.
- **Warm-up:** TaskNotes fires its runtime `ready` at the end of `onload`, but heavy initialization runs in `onLayoutReady` (`main.ts:323`). Very early `getAllTasks()` calls can fall back to disk reads per file while the metadata cache is incomplete (see `TaskManager.getAllCachedTasks` comment, lines 710-715).

**Why it happens:**
Obsidian has no public "plugin enabled/disabled" event, and `app.plugins` is undocumented (not in `obsidian.d.ts`).

**How to avoid:**
- Do no TaskNotes discovery in `onload`. Connect in `app.workspace.onLayoutReady(...)`, then `await api.lifecycle.ready()`. Note that `ready()` resolves at the end of TaskNotes' `onload`, *before* its layout-ready warm-up (`initializeAfterLayoutReady`: index warm-up, then the `layout.ready` lifecycle event, `pluginBootstrap.ts:358-384`). For the first full task scan, check `api.lifecycle.isReady()`. If it returns false, wait for lifecycle `layout.ready`. Subscribe *before* checking, so the event can't fire between the check and the subscription.
- Subscribe to lifecycle `unloading` and, on it, immediately drop the `api` reference, `offref` all subscriptions, and put the pane into a "TaskNotes unavailable" state.
- While disconnected, re-probe on a `registerInterval` (for example every 5 s; TaskNotes v5 itself uses a 5 s reconnect interval for its interop publisher) and on `active-leaf-change` or the pane's `onOpen`. Re-bind when a new `api` appears.
- Never store `api` long-term outside the bridge. Expose `bridge.api` as a getter that validates the connection.
- Render a "Connecting to TaskNotes..." placeholder. The pane can be restored from `workspace.json` before TaskNotes is ready.

**Warning signs:**
- The pane works after a fresh install but not after disabling and re-enabling TaskNotes in Settings.
- Console errors from TaskNotes services after its unload.
- The pane is blank right after Obsidian launch.

**Phase to address:** P1 Bridge. Verify with an explicit disable → enable → update test in P6.

---

### Pitfall 8: Counting live elapsed time with tick counters (drift, sleep, background throttling)

**What goes wrong:**
The timer increments `seconds++` every `setInterval(1000)`. Chromium (Electron) throttles timers in hidden or minimized windows: heavily after about 5 minutes hidden, and timers are fully suspended on laptop sleep and on mobile when backgrounded. The display then drifts minutes behind the truth, while TaskNotes records correct wall-clock entries. TaskNotes hit exactly this with Pomodoro (#136, #1500) and fixed it in 4.8.0 by "deriv[ing] remaining time from the session clock instead of from counted interval ticks".

**Why it happens:**
Naive timer UIs treat the interval as a clock.

**How to avoid:**
- Compute each frame from wall clock: `elapsed = Date.now() - Date.parse(entry.startTime)`. The interval only triggers repaint.
- Clamp negative values to 0. A `startTime` written by another synced device with a fast clock can be in the future.
- Re-render immediately on `visibilitychange`/focus and when the pane is revealed.
- Only tick while there is an active entry and the pane is open, as TaskNotes' `StatusBarService` does: it starts its 1 s ticker only when trackers exist and stops it when none remain.
- To avoid visibly skipped seconds, align the first tick to the next second boundary with `setTimeout`, then use a 1 s interval. Alternatively tick at 500 ms and render the floored seconds.

**Warning signs:**
- The pane shows a different elapsed time than TaskNotes' status bar after the window was minimized or the laptop slept.
- Mobile shows stale elapsed time after unlocking.

**Phase to address:** P2 Pane + Live Timer.

---

### Pitfall 9: Totals that disagree with TaskNotes (rounding and inconsistent calculators)

**What goes wrong:**
The pane's "total tracked" and "today" numbers differ from TaskNotes' own views. TaskNotes has **at least two different duration calculators**:
- `utils/helpers.calculateDuration` uses **`Math.round`** per entry and `calculateTotalTimeSpent` there **excludes** the active entry.
- `utils/timeTrackingUtils.calculateTotalTimeSpent`, used by `api.time.task()` and `api.time.summary()`, uses **`Math.floor`** per entry in minutes and **includes** the active entry.

Per-entry flooring means every pause/resume fragment loses up to 59 s in TaskNotes' API summaries. Ten 50-second fragments count as 0 minutes.

**Why it happens:**
Pause-as-stop multiplies the number of entries, and developers reuse `api.time.task().summary.totalMinutes` for display.

**How to avoid:**
- Compute display totals in the pane at **millisecond precision**: sum `(end ?? now) - start` across entries, then format.
- Document that this is "true" time and may differ by a few minutes from TaskNotes' minute-floored stats.
- Do not try to "fix" TaskNotes' numbers by merging entries, because that would require editing `timeEntries` (see Pitfall 2).
- Show time estimate progress (`timeEstimate`, in minutes) against the pane's ms-precision total.

**Warning signs:**
- A user reports "pane says 1h 12m, TaskNotes stats say 1h 07m" after many pauses.

**Phase to address:** P2 (totals) and P5 (today's log). Note the discrepancy in the README.

---

### Pitfall 10: "Today's log" wrong for entries crossing midnight, DST, and legacy timestamps

**What goes wrong:**
- TaskNotes' own `api.time.summary({ period: "today" })` attributes an entry by **start time only**. In `computeTimeSummary` the check is `entryStart >= startOfToday`, and the full duration is credited. A session started at 23:30 yesterday and still running at 09:00 shows **0** in today's summary, and a session from 23:30 to 00:30 is credited entirely to yesterday.
- Mixed timestamp formats: since 4.4.0 (#1602) TaskNotes writes canonical UTC `toISOString()` (`...Z`). Older entries may carry local offsets (`+11:00`) or a legacy `duration` field. Hand-edited entries may have **no offset**, which JS `Date` parses as **local** time, while date-only strings parse as **UTC**.
- The pane stays open across midnight and keeps showing yesterday as "today".
- On DST days a local day is 23 or 25 hours, so `startOfToday + 24h` arithmetic is wrong.

**Why it happens:**
"Today" is a local-calendar concept, but entries are UTC instants. Library summaries trade correctness for simplicity.

**How to avoid:**
- Build today's log yourself. Clip each entry to `[localMidnightToday, min(now, localMidnightTomorrow))` and sum the overlap.
- Compute local midnights with `new Date(y, m, d)` constructors (or Obsidian's bundled `moment`), never with `+ 86_400_000`.
- Parse with `Date.parse`. Treat `NaN` as an invalid entry: skip and count it, don't crash. Ignore any stored `duration` and always derive from start/end, as TaskNotes does since 4.4.0.
- Track the "current local date" in the ticker. When it changes, recompute the log. Do not rely on TaskNotes' internal `date-changed` event, which is not part of the runtime API.
- Unit-test cross-midnight, DST-transition, offset/Z/no-offset, and "end before start" entries. TaskNotes logs and returns 0 for those.

**Warning signs:**
- Late-night sessions missing from the morning's log.
- Totals changing when the system time zone changes.

**Phase to address:** P5 Today's Log. It needs explicit test cases, so flag it for deeper planning.

---

### Pitfall 11: Scanning the whole vault every tick or every event

**What goes wrong:**
The pane calls `api.time.active()`, `api.tasks.list()`, or `api.time.summary()` every second or on every event. Each of these runs `cacheManager.getAllTasks()`, which iterates **every Markdown file in the vault** (`app.vault.getMarkdownFiles()`) and calls `getTaskInfo` per file, with possible disk fallback during warm-up. Each call then deep-copies results. On a vault with thousands of notes this causes UI jank and battery drain. TaskNotes has had its own versions of this: Pomodoro stalls from refreshing stats on every tick (#1813, 4.5.2), and a slow time-entry modal with many entries (#2206).

**Why it happens:**
The API returns data that looks cheap, but the iteration cost is hidden.

**How to avoid:**
- **The tick never calls TaskNotes.** It only re-renders from cached `ActiveEntry[]` and the clock.
- Re-query only on debounced events (250-500 ms) and coalesce bursts, for example a `cache.rebuilt` or a sync touching 200 files.
- For the picker, use `api.query.tasks({ where: <not completed / not archived>, limit, sort })` when the modal opens, not on every keystroke. Let `FuzzySuggestModal` filter in memory.
- For recents and today's log, compute only on open and on relevant events. Reuse results between the two features.
- Measure against a large test vault (5k+ notes) in P6.

**Warning signs:**
- The DevTools Performance panel shows `getMarkdownFiles` and `getTaskInfo` every second.
- Typing lag in the editor while the pane is open.

**Phase to address:** P1 (event debouncing in the bridge), P2 (tick design), P4 and P5 (query strategy), and P6 (measure).

---

### Pitfall 12: Colliding with TaskNotes Pomodoro-owned timers (and auto-start/auto-stop automations)

**What goes wrong:**
While a Pomodoro session is linked to a task, `PomodoroService` **owns** a time entry and remembers its `timeTrackingStartTime`. It stops only that exact entry later (`stopOwnedTimeTracking` passes `expectedStartTime`; the docs say "Pomodoro only stops trackers it created"). If the pane pauses (stops) that task and then resumes (starts a new entry), the following happens:
- Pomodoro's later stop fails with "Active time tracking session has changed" or "No active time tracking session".
- The pane-created entry **keeps running after the Pomodoro ends**.
- Pomodoro resume hitting "already active" leaves `timeTrackingStartTime` undefined, so Pomodoro loses ownership.

In addition:
- TaskNotes' **auto-stop on complete** setting can close the entry underneath a "paused" or "running" pane state.
- The **TaskNotes Workflows** companion's auto-start-on-active-status rule can start timers the pane didn't ask for.

**Why it happens:**
Several actors write the same `timeEntries` array with different ownership rules.

**How to avoid:**
- Before stop/pause/resume, check `api.pomodoro.status()` (capability `pomodoro.read`). If a running Pomodoro is linked to the same task, either disable the pane's pause/resume for that task with a "controlled by Pomodoro" hint, or route the action to `api.pomodoro.pause/resume` (out of scope per PROJECT.md, so prefer the hint).
- Subscribe to `pomodoro.started`, `pomodoro.completed`, and `pomodoro.interrupted` as resync triggers.
- After any external stop, treat "pane thought it was running, now it isn't" as normal. Re-derive state and never "repair" it by restarting.

**Warning signs:**
- Timers still running hours after a Pomodoro finished.
- "Active time tracking session has changed" in the console.

**Phase to address:** P3 Controls (guard). Requirements should explicitly state Pomodoro interaction rules.

---

### Pitfall 13: View lifecycle leaks (intervals, events, DOM) and deferred views

**What goes wrong:**
- Intervals or event subscriptions are registered with **`plugin.registerInterval` / `plugin.registerEvent` inside the View's `onOpen`**. Those are released only on plugin unload, so every close and reopen of the pane leaks another 1 s ticker and another handler that holds detached DOM. Raw `window.setInterval` without any `register*` leaks even past plugin unload.
- Obsidian **1.7.2+ deferred views**: every restored view starts as a `DeferredView`. Code like `getLeavesOfType(VIEW).first().view as TimerView` returns a placeholder, and calling methods on it throws or does nothing.
- Keeping a `this.view` reference on the plugin goes stale when the leaf is closed or deferred.
- Detaching leaves in `onunload` breaks Obsidian's layout restore. Obsidian guidelines say not to.

**Why it happens:**
`ItemView` is a `Component`, but tutorials register everything on the plugin. Deferred loading changed long-standing assumptions.

**How to avoid:**
- Inside the view, use **`this.registerInterval`, `this.registerEvent`, and `this.register(() => ...)`**. These are released automatically in `onClose`/unload of the view component. The plugin keeps only plugin-wide things (the bridge connection, ribbon, commands).
- Build DOM in `onOpen` with `contentEl.empty()` first. Tear down in `onClose`.
- Activate the pane with `getLeavesOfType` → create via `workspace.getRightLeaf(false)` if absent → `await workspace.revealLeaf(leaf)` (async since 1.7.2). Only then check `leaf.view instanceof TimerView`. Avoid `loadIfDeferred()` except where unavoidable, gated by `requireApiVersion("1.7.2")`.
- Have the bridge broadcast state through an event emitter that views subscribe to (via `this.registerEvent`), rather than the plugin pushing into a stored view reference.
- If the pane is collapsed or deferred, skip ticking. Only visible, loaded views should render each second.

**Warning signs:**
- The DevTools memory snapshot grows with each pane open/close.
- After 5 reopenings, the elapsed counter updates 5× per second (visible stutter).
- "Cannot read property ... of undefined" on startup with the pane restored.

**Phase to address:** P2 (view scaffolding). Run a leak test in P6.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Call `plugin.taskService.*` / `cacheManager.*` directly | Access to `stopTime`, sync cache reads | Breaks on TaskNotes refactors; bypasses event context | **Never.** The Runtime API covers start/stop/active/events |
| `import type` from TaskNotes repo source | Full typings for free | Drags TaskNotes source + `@tasknotes/model` into the build; version skew | Never. Vendor a minimal `.d.ts` |
| Single `activeTask` instead of `ActiveEntry[]` | Simpler UI code | Wrong stop/switch whenever >1 timer exists (allowed by TaskNotes) | Never in the data model; UI can show one primary |
| Pause state in View memory | Fast to build | Lost on restart and reload; wrong "Resume" for completed tasks | Only in a throwaway spike |
| Poll `api.time.active()` every second | No event wiring | Vault-wide scan each second; jank on big vaults | Only as a temporary debug fallback |
| Use `api.time.summary({period:"today"})` for today's log | One call | Start-date attribution and minute flooring give wrong numbers across midnight and with pause fragments | Acceptable only for a prototype; replace in P5 |
| Store recents as raw paths without rename handling | Trivial MRU list | Dead entries after rename/move; history of TaskNotes #1019 | MVP, if entries are pruned lazily when unresolved |
| Hard-code status strings ("done", "in-progress") for picker filtering | Quick filter | Breaks with custom statuses | Never. Use `api.catalog.statuses()` (`isCompleted`) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| TaskNotes discovery | `this.app.plugins.plugins.tasknotes.api` in `onload` | In `onLayoutReady`: `getPlugin("tasknotes")?.api`, check `apiVersion === 1` + capabilities, `await api.lifecycle.ready()` |
| TaskNotes events | `this.registerEvent(api.events.on(...))` on the **plugin** from inside a view | Bridge owns the subscriptions and re-binds after TaskNotes reloads; views subscribe to the bridge with `view.registerEvent` |
| TaskNotes events | Trust `time.started/stopped` as complete | They are not emitted for file-originated changes (sync, manual edits). Resync on `task.updated` + lifecycle `cache.*` |
| Own-write echo | Re-render twice and re-trigger logic on own writes | Pass `{source:"tasknotes-timer-pane"}` context; ignore or soft-handle events where `event.source` matches. Still resync idempotently |
| Task identity | Key tasks by `task.id` assuming it equals path | v4: id is often the path. **v5 beta** introduces real task IDs (`tasks.getById`, `taskId` on events) and deprecates `tasks.get` for `getByPath`. Key by path now, isolate in the bridge, plan for an ID switch |
| Field mapping | Read `frontmatter.timeEntries` / `timeEstimate` | Use `TaskInfo.timeEntries` / `timeEstimate` from the API; keys are user-remappable |
| Status semantics | Treat `status === "done"` as completed | `api.catalog.statuses()` and the configured completed flags |
| Errors | `catch (e) { console.log(e) }` | Branch on `TaskNotesApiError.code`; show a Notice; resync state |
| TaskNotes v5 beta | Assume the v4 surface forever | Runtime API diff v4.13.8 → 5.0.0-beta.5 is small and additive (`tasks.lookup-id`, `getByPath/getById`, `duplicate_task_id`). Capability-gate and test against the beta before the user upgrades. v5 requires Obsidian ≥ 1.13.1 |
| zczs520 "5.2.3" fork | Use it as a reference | No such official version exists (official v5 line is `5.0.0-beta.0..5`). Keep it out of scope as decided |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Calling `time.active()` / `tasks.list()` per tick | Constant CPU, editor lag | Tick renders from cached state only | Noticeable around 1-2k notes; bad at 5k+ |
| Re-querying on every raw event | Bursts of full scans during sync or `cache.rebuilt` | Debounce and coalesce at 250-500 ms; one in-flight query at a time | Any bulk sync (dozens of files) |
| Full DOM rebuild each second | Flicker, lost hover/focus on buttons | Update only the elapsed text node's `textContent`; rebuild lists only on state change | Immediately visible with lists of 20+ |
| Recents/today computed by scanning all entries of all tasks on every change | Slow pane updates with long-tracked tasks (TaskNotes #2206 had many-entry slowness) | Compute on open plus debounced events; cap recents (e.g. 10); skip tasks without `timeEntries` early | Tasks with hundreds of entries |
| Ticking while pane collapsed or deferred | Battery drain on laptops/mobile | Tick only if the view is loaded and visible and an entry is active | Always on mobile |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Rendering task titles or descriptions with `innerHTML` | HTML/script injection from note content (Obsidian review guidelines forbid it) | `createEl`/`setText` only; render titles as text, and link via `openLinkText` |
| Exposing control actions through the TaskNotes extension registry without need | Other plugins and scripts can start or stop timers unexpectedly | Do not register an extension namespace in v1 |
| Enabling TaskNotes HTTP API "because the pane needs it" | Opens a local listener (now token-protected since 4.13.0) for no reason | The pane is in-process only; never require the HTTP API |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent failure on start/stop | User believes time is tracked when it isn't | Notice on failure, plus the pane re-derives and shows the real state. Note that TaskNotes' coordinator shows its own Notices but `api.time.*` does **not**, so the pane must |
| Double Notices | Noisy duplicate toasts | Use `api.time.*` (no Notices) and show your own, once |
| "Paused" indistinguishable from "stopped" | Confusion after restart | Distinct paused styling plus a persisted paused task with "Resume" CTA; clear it when obsolete |
| Forgotten overnight timer shows "14:32:10" with no warning | Corrupted reports | Highlight sessions longer than N hours and offer a stop. Editing the end time is out of v1 scope; link to TaskNotes' time entry editor |
| Hidden "other timers running" | Double-counted time | Always show a count badge with per-entry stop when more than one is active |
| Picker lists completed or archived tasks first | Slow switching, which defeats the 1-2 click goal | Default filter: non-completed, non-archived; recents pinned at the top; fuzzy search |
| Pane disappears or errors when TaskNotes is off | Looks broken | Explicit empty state: "TaskNotes not enabled / requires ≥ 4.10", with a retry |
| Mobile: no status bar exists in Obsidian mobile, so the pane is the only indicator | Users depend on a pane that may be unstyled or untested on mobile | Decide `isDesktopOnly` explicitly. If false, test touch target sizes and the sidebar drawer, and re-render on app resume |

## "Looks Done But Isn't" Checklist

- [ ] **Live timer:** often missing wall-clock derivation. Verify by minimizing Obsidian for 10 minutes (or sleeping the laptop) and checking the pane against TaskNotes' status bar.
- [ ] **Sync with external changes:** often missing file-originated resync. Verify by hand-editing a task's YAML to add an open entry, and by starting a timer via the status bar and via the TaskNotes command. The pane must update within about 1 s.
- [ ] **Stop:** often missing multi-timer handling. Verify with two timers started from task cards.
- [ ] **Switch:** often missing serialization and partial-failure handling. Verify by triple-clicking a recent task, and by switching to a task whose file was just deleted.
- [ ] **Pause/resume:** often missing persistence and invalidation. Verify by pausing, restarting Obsidian, completing the task elsewhere, and confirming that Resume disappears.
- [ ] **TaskNotes lifecycle:** often missing re-binding. Verify by disabling TaskNotes, re-enabling it, then starting a timer from TaskNotes. The pane must reflect it without an Obsidian restart.
- [ ] **Startup:** often missing deferred/not-ready handling. Verify by launching Obsidian with the pane already open in the sidebar, and with TaskNotes listed after this plugin in load order.
- [ ] **Today's log:** often missing midnight clipping and rollover. Verify with a fixture entry from 23:30 to 00:30 and by leaving the pane open across midnight (or faking the clock).
- [ ] **Totals:** often missing active-entry inclusion and ms precision. Verify that the total increases live while running and matches the sum of entries.
- [ ] **Leaks:** verify by opening and closing the pane 10× and checking that one interval exists (log tick counts) and the listener count is stable.
- [ ] **Field mapping:** verify with TaskNotes' `timeEntries` remapped to a custom property name.
- [ ] **Pomodoro interplay:** verify by running a Pomodoro on task X, pausing X from the pane, and confirming that no orphan running entry remains after the Pomodoro completes.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Orphaned running entry (from a Pomodoro collision or a failed switch) | LOW | Stop it from the pane's "other timers" list, or with TaskNotes' "Stop active time tracking". Edit the end time in TaskNotes' time entry editor |
| Overwritten or duplicated `timeEntries` from a direct write | MEDIUM/HIGH | Restore the note from Obsidian File Recovery or git. Remove the offending write path. Add a regression test that greps for `processFrontMatter` and `tasks.update({timeEntries`) |
| Pane broken after a TaskNotes update | LOW (if the bridge is isolated) | Capability check shows the degraded state. Fix only `TaskNotesBridge` and the vendored `.d.ts` |
| Leaked intervals or handlers | LOW | Move registrations to view-scoped `register*`. A reload clears the current session |
| Wrong today's log numbers | LOW | Display-only, because the underlying `timeEntries` are untouched. Fix the clipping logic |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Private internals instead of Runtime API | P1 Bridge | `grep` shows no `taskService`/`cacheManager`/`emitter` outside the bridge; capability-gated degraded state renders when `api` is missing |
| 2. Direct `timeEntries` writes / races | P1 + P3 | Facade exposes only `time.start/stop`; rapid-click and concurrent status-bar-stop test leaves consistent entries |
| 3. Multiple active timers | P2 + P3 | Two-timer manual test; UI shows count; switch policy documented in requirements |
| 4. Non-atomic switch | P3 | Triple-click and deleted-target tests; serial queue unit test |
| 5. Pause persistence | P3 | Restart test; invalidation on complete, delete, and external start |
| 6. Missed external changes | P1 + P2 (verify in P6) | YAML hand-edit test; sync simulation; double-event idempotency |
| 7. Load order / TaskNotes reload | P1 (verify in P6) | Disable → enable → update cycle without restarting Obsidian |
| 8. Tick-counter drift | P2 | Minimize/sleep test vs status bar |
| 9. Rounding mismatches | P2 + P5 | Unit test: ms-precision totals; README note on minute flooring |
| 10. Midnight/DST/timestamp parsing | P5 (needs deeper research and test design) | Fixture-based unit tests: cross-midnight, DST, Z/offset/no-offset, invalid |
| 11. Vault-wide scans | P1/P2/P4/P5 (measure in P6) | DevTools profile on a 5k-note vault: no per-second scans |
| 12. Pomodoro/automation collisions | P3 | Pomodoro + pane pause test; no orphan entries |
| 13. View lifecycle leaks / deferred views | P2 (verify in P6) | Open/close 10× leak test; restored-pane startup test on Obsidian ≥ 1.7.2 |

## Sources

Primary sources were read directly from a TaskNotes clone at commit `451679289` (v4.13.8, 2026-10-12) and tag `5.0.0-beta.5` (2026-10-03).
- `docs/javascript-api.md`, `docs/companion-plugins.md`: Runtime API contract and companion-plugin guidance (HIGH)
- `docs/features/time-management.md`: multiple concurrent trackers, auto-stop, Pomodoro ownership (HIGH)
- `src/api/runtime-api.ts`, `src/api/TaskNotesAPI.ts` (`startTime`/`stopTime`/`appendTimeEntry`/`getActiveTimeEntries`/`normalizeUpdatedEvent`/`on`): event derivation, no cross-task stop, read-modify-write append (HIGH)
- `src/services/TaskService.ts:1551-1735`: per-path lock, persisted re-read, "already active" / "No active session" errors, `expectedStartTime` (HIGH)
- `src/utils/TaskManager.ts`: 300 ms debounce, file-change `task-updated` without `originalTask`, `getAllTasks` vault iteration, `waitForFreshTaskData` (HIGH)
- `src/utils/timeTrackingUtils.ts`, `src/utils/helpers.ts`: start-date-only "today" attribution, floor vs round per entry (HIGH)
- `src/services/PomodoroService.ts`: owned time tracking, pause = stop/new entry (HIGH)
- `src/main.ts`, `src/bootstrap/pluginBootstrap.ts`: `api` creation timing, `ready` vs layout-ready, `unloading` lifecycle (HIGH)
- `docs/releases/4.4.0.md` (#1602 UTC canonicalization), `4.5.2.md` (#1813 tick stalls), `4.8.0.md` (#136/#1500 wall-clock timers; #1655 status bar live elapsed), `4.10.0.md` (Runtime API introduced), `4.12.0.md` (v5 beta), `4.12.4.md` (#2206), `4.13.0.md` (HTTP API auth), `4.13.7.md` (#2326 stop button / multi-tracker chooser) (HIGH)
- GitHub issues: [#1670 auto-stop other timers (open)](https://github.com/callumalpass/tasknotes/issues/1670), [#1602 timezone mismatch](https://github.com/callumalpass/tasknotes/issues/1602), [issue search "time tracking"](https://github.com/callumalpass/tasknotes/issues?q=is%3Aissue+time+tracking) (#1019 rename, #1079 multiple timers, #1493/#1638 Pomodoro switching). Web-fetched; classify-confidence seam rates these LOW, so they are used only as corroboration of source-code findings
- [Obsidian: Defer views guide](https://docs.obsidian.md/plugins/guides/defer-views): `instanceof` checks, `await revealLeaf`, `loadIfDeferred` with `requireApiVersion("1.7.2")` (MEDIUM; official docs via web fetch)
- Obsidian plugin guidelines (established practice): view-scoped `registerInterval`/`registerEvent`, no `innerHTML`, don't detach leaves in `onunload`, don't hold view references, defer startup work to `onLayoutReady` (MEDIUM)
- Chromium background-timer throttling: general platform knowledge, corroborated by TaskNotes' own Pomodoro fix in 4.8.0 (MEDIUM)

---
*Pitfalls research for: Obsidian companion plugin controlling TaskNotes time tracking*
*Researched: 2026-10-13*
