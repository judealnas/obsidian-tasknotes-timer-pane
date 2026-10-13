# Architecture Research

**Domain:** Obsidian companion plugin: a sidebar `ItemView` that monitors and controls TaskNotes' regular (non-Pomodoro) time tracking
**Researched:** 2026-10-13
**Confidence:** HIGH for TaskNotes integration surface (verified by reading TaskNotes source at `main` = 4.13.8 and tag `5.0.0-beta.5`). HIGH for the Obsidian view API (checked against official `obsidian.d.ts` and docs). MEDIUM for plugin load-order timing (not documented; the design does not depend on it).

> **Main finding (changes the integration approach in PROJECT.md):** TaskNotes ≥ 4.10.0 has a **versioned, documented in-process runtime API for companion plugins** at `app.plugins.getPlugin("tasknotes").api`. It is typed as `TaskNotesRuntimeApiV1`, `apiVersion === 1`, and capabilities are checked with `hasCapability(...)`. It provides `time.start / time.stop / time.active`, `tasks.get / tasks.list`, normalized `events.on("task.updated" | "time.started" | ...)`, `lifecycle.ready / isReady / on("layout.ready" | "unloading" | ...)`, and `ui.taskMenu`. It is the same in 4.13.8 (stable) and 5.0.0-beta.5; the v5 changes only add things. The author's own companion plugins (TaskNotes Workflows, Canvas Bases) use it. **Build against this API, not against `plugin.taskService` / `plugin.cacheManager` / `plugin.emitter`.** That covers PROJECT.md's "in-process, call TaskNotes' own methods" decision and also removes most of the "internals may change" risk.

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       Obsidian shell (this plugin)                        │
│  main.ts: registerView · addRibbonIcon · addCommand · activateView()      │
│           settings tab · loadData/saveData (tiny UI state)                │
├──────────────────────────────────────────────────────────────────────────┤
│                         Presentation layer                                │
│  ┌─────────────────────────────┐   ┌──────────────────┐ ┌──────────────┐  │
│  │ TimerPaneView (ItemView)    │   │ TaskPickerModal  │ │ Notices /    │  │
│  │  - mount once, update in    │   │ (FuzzySuggest-   │ │ task menu    │  │
│  │    place (vanilla DOM)      │   │  Modal<TaskInfo>)│ │ (api.ui)     │  │
│  │  - 1 s render tick          │   └────────┬─────────┘ └──────┬───────┘  │
│  └──────┬───────────────▲──────┘            │                  │          │
│         │ intents       │ "changed" event   │                  │          │
├─────────┼───────────────┼───────────────────┼──────────────────┼──────────┤
│         ▼               │        Application layer             │          │
│  ┌──────────────────┐  ┌┴──────────────────────────────────┐   │          │
│  │ TimerController  │  │ TimerStore (snapshot + selectors) │   │          │
│  │ stop/pause/      │─▶│  refresh() debounced, event-driven│   │          │
│  │ resume/switch    │  │  derive: active, totals, today,   │   │          │
│  │ (serialized)     │  │  recent  (pure fns in model/)     │   │          │
│  └────────┬─────────┘  └───────────────▲───────────────────┘   │          │
├───────────┼────────────────────────────┼───────────────────────┼──────────┤
│           ▼          Integration layer (anti-corruption)       ▼          │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │ TaskNotesBridge                                                    │   │
│  │  resolve app.plugins.getPlugin("tasknotes")?.api · version/caps     │   │
│  │  state: missing | incompatible | loading | ready                    │   │
│  │  subscribe: events "task.updated","task.deleted"; lifecycle         │   │
│  │  "layout.ready","cache.changed","cache.rebuilt","settings.changed", │   │
│  │  "unloading"; vault "rename","delete" (public Obsidian API)        │   │
│  │  re-probe on onLayoutReady + every 5 s + on view open               │   │
│  └─────────────────────────────┬──────────────────────────────────────┘   │
└────────────────────────────────┼──────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ TaskNotes plugin (external, owns all writes)                              │
│  api.time.start/stop → TaskService.startTimeTracking/stopTimeTracking     │
│  → processFrontMatter(timeEntries) → emitter "task-updated"               │
│  → status bar refresh, runtime events → back to our Bridge                │
│ Data: task .md frontmatter  timeEntries: [{startTime, endTime?, ...}]     │
└──────────────────────────────────────────────────────────────────────────┘
```

Data flows **one way**. The view sends intents to the Controller. The Controller calls TaskNotes through the Bridge. TaskNotes writes frontmatter and emits events. The Bridge turns any relevant event into a store refresh. The Store recomputes the snapshot and emits `changed`. The view re-renders. The view never mutates the store directly and never writes frontmatter.

### Component Responsibilities

| Component | Responsibility (owns) | Must NOT | Implementation |
|-----------|----------------------|----------|----------------|
| `main.ts` (Plugin) | Registering view, ribbon, commands, settings; creating Bridge/Store/Controller singletons; `activateView()` | Hold references to view instances; detach leaves on unload | `Plugin` subclass, sample-plugin conventions |
| `TaskNotesBridge` | The **only** module that touches TaskNotes. Finds the API, checks `apiVersion`/capabilities, tracks availability state, manages event subscriptions (re-attaches when the API object identity changes), wraps calls with the mutation `context` | Leak TaskNotes types or `any` beyond its boundary; cache task data | Class extending Obsidian `Events`; vendored type subset of `runtime-api.ts` |
| `TimerStore` | Current snapshot of task time data (`tasks[]` with time entries, precomputed closed totals); debounced `refresh()`; selectors for active/total/today/recent; emits `changed` | Run timers; call write APIs; touch the DOM | Class extending `Events`; selectors delegate to pure functions |
| `model/timeMath.ts` | Pure derivations: open entries, session elapsed, totals, day-clipped today log, recent tasks, formatting | Import `obsidian` | Plain TS, unit-tested with Jest/Vitest and no Obsidian mocks |
| `TimerController` | User intents: `stop`, `pause`, `resume`, `start(path)`, `switchTo(path)`. Serializes them (one in flight), tracks `busy`, persists pause state, shows Notices on failure | Compute display data; touch the DOM | Promise-queue class |
| `TimerPaneView` | DOM for one leaf: mount once, update in place, 1 s tick for clocks, visibility-aware, empty and unavailable states | Hold domain state beyond refs; poll TaskNotes | `ItemView` with vanilla `createDiv`/`createEl`/`setIcon` |
| `TaskPickerModal` | Choose a task to start or switch to | Query TaskNotes itself (reads from Store snapshot) | `FuzzySuggestModal<TaskInfo>` |
| `SettingsTab` | Options such as "stop other timers when starting", recent count, show today's log | — | `PluginSettingTab` |

## Recommended Project Structure

```
src/
├── main.ts                    # Plugin: onload wiring, registerView, ribbon, commands, activateView
├── constants.ts               # VIEW_TYPE_TIMER_PANE = "tasknotes-timer-pane", MUTATION_SOURCE id
├── settings.ts                # Settings interface, defaults, SettingsTab
├── tasknotes/                 # Integration (anti-corruption) layer: the only place that knows TaskNotes
│   ├── runtime-api.types.ts   # Vendored minimal subset of tasknotes/src/api/runtime-api.ts (MIT), pinned rev noted
│   └── TaskNotesBridge.ts     # resolve/probe/state machine/subscriptions/wrapped calls
├── model/                     # Pure, Obsidian-free domain logic (unit tested)
│   ├── timeMath.ts            # open entries, elapsed, totals, day clipping, recent
│   └── format.ts              # hh:mm:ss, "1h 23m", estimate %
├── state/
│   ├── TimerStore.ts          # snapshot + debounced refresh + selectors + "changed" event
│   └── TimerController.ts     # serialized actions, pause state, error notices
├── ui/
│   ├── TimerPaneView.ts       # ItemView: mount/update/tick
│   ├── sections/              # ActiveTaskSection, RecentSection, TodayLogSection (plain classes w/ update())
│   └── TaskPickerModal.ts     # FuzzySuggestModal<TaskInfo>
└── styles.css                 # BEM-ish classes, Obsidian CSS variables only
tests/
└── model/timeMath.test.ts
```

### Structure Rationale

- **`tasknotes/`** keeps all coupling to TaskNotes in one folder. If TaskNotes ships runtime API v2, or a capability goes away, only this folder changes. PROJECT.md asks for graceful degradation when TaskNotes internals change; this boundary is how that works.
- **`model/`** is pure, so the hardest logic to get right (midnight clipping, multiple open entries, malformed timestamps) can be tested without Obsidian.
- **`state/`** splits reads (Store) from writes (Controller), so event-driven refresh and user-driven mutation can't get tangled.
- **`ui/sections/`** follows TaskNotes' PomodoroView style: cached element refs, with an `update(viewModel)` method per section in place of a re-render.

## Exact TaskNotes Integration Surface

All names verified in TaskNotes source (4.13.8 `main`; same in `5.0.0-beta.5`). Paths are relative to the `callumalpass/tasknotes` repo.

### Use these: runtime API v1 (`src/api/runtime-api.ts`, implemented in `src/api/TaskNotesAPI.ts`)

| Need | Runtime API | Notes |
|------|-------------|-------|
| Find TaskNotes | `app.plugins.getPlugin("tasknotes")?.api` | `app.plugins` is not in `obsidian.d.ts`, so cast through a narrow interface. `api` is assigned in `initializeCoreServices()` during TaskNotes `onload`. It is `undefined` if TaskNotes is disabled or < 4.8. |
| Compatibility gate | `api.apiVersion === 1`, `api.hasCapability(c)` | Require `tasks.read`, `tasks.events`, `time.read`, `time.write`, `lifecycle.events`. Optional: `ui.task-menu`, `catalog.read`. These have existed since **4.10.0**. |
| Readiness | `api.lifecycle.isReady()`, `api.lifecycle.on("layout.ready", h)`, `api.lifecycle.ready()` | `ready()` resolves at the **end of TaskNotes onload**, before its layout-ready initialization. `isReady()` returns `plugin.initializationComplete`, which becomes true at the **start** of `initializeAfterLayoutReady`. The `layout.ready` event fires at the **end** of it, and fires only once, so a late subscriber misses it. Rule: if `isReady()`, treat as ready; otherwise wait for `layout.ready` (the 5 s re-probe also covers this). |
| Start timer | `api.time.start(path, options?, context?) → Promise<TaskInfo>` | Calls `TaskService.startTimeTracking(task)`, which appends `{startTime}` to `timeEntries` inside `processFrontMatter` with a per-path lock. **Throws "Time tracking is already active for this task"** if the task already has an open entry. **Does not stop other tasks' timers.** |
| Stop timer | `api.time.stop(path, context?) → Promise<TaskInfo>` | Calls `TaskService.stopTimeTracking(task)`, which sets `endTime` on the **first** open entry. **Throws "No active time tracking session for this task"** if none is open. |
| Active timers | `api.time.active() → Promise<ActiveTimeEntry[]>` with `{taskPath, task, entry, index}` | Scans all tasks. **Several tasks can have an open entry at the same time**, because TaskNotes doesn't enforce a single timer. Includes archived tasks (the status bar excludes them). |
| All tasks with entries | `api.tasks.list()` with no query → deep-copied `TaskInfo[]` | Backed by `TaskManager.getAllTasks()` (metadata cache, disk fallback only for unindexed files). One call per refresh gives everything needed: active, totals, today, recent. |
| One task | `api.tasks.get(path)` | Returns `null` if not a cached task. |
| Change events | `api.events.on("task.updated", h)`, `api.events.on("task.deleted", h)` → `EventRef` | Wraps raw emitter `"task-updated"` / `"task-deleted"`. Payload: `{event, taskPath, task, before, after, changes, source?, correlationId?}`. Register with `plugin.registerEvent(ref)`. |
| Time events | `"time.started"`, `"time.stopped"` | Only emitted when TaskNotes' own write path supplies `originalTask`. **Not emitted for manual frontmatter edits**; those arrive as `task.created` + `task.updated` with `before` undefined, because TaskManager's metadata listener triggers `task-updated` without `originalTask`. So listen to `task.updated`, not `time.*`. |
| Cache/settings changes | `api.lifecycle.on("cache.changed" \| "cache.rebuilt" \| "settings.changed" \| "unloading", h)` | `settings.changed` matters because field mapping can rename the `timeEntries` key. On `unloading`, drop to `missing` immediately. |
| Mutation provenance | `context = { source: "tasknotes-timer-pane", reason, correlationId }` | Echoed into event payloads, so the pane can recognize its own writes (useful for debugging; still refresh on them). |
| Errors | `api.errors.normalize(e) → {code, message}` | Use it for Notice text. Runtime API calls **do not show TaskNotes' Notices** (`TaskActionCoordinator` does that for its own UI only), so the pane must show its own feedback. |
| Task context menu | `api.ui.taskMenu.showAtElement({taskPath, element})` | Gives the full TaskNotes task menu on the active task card for free. Gate on `ui.task-menu` (4.11.0+). |
| Statuses | `api.catalog.statuses()` → `StatusConfig[]` with `isCompleted` | Used to exclude completed tasks from the picker and the recent list. |

Data types (`@tasknotes/model`, re-exported): `TimeEntry { startTime: string; endTime?: string; description?: string; duration?: number /* legacy, ignore */ }`. `TaskInfo` includes `path, title, status, priority, archived, timeEstimate?: number /* minutes */, timeEntries?: TimeEntry[], totalTrackedTime?: number /* minutes, derived */`.

### Do not use: internals (listed so the roadmap knows what to avoid)

| Internal | Where | Runtime-API replacement |
|----------|-------|------------------------|
| `plugin.taskService.startTimeTracking(task)` / `stopTimeTracking(task, stopTime?, expectedStartTime?)` | `src/services/TaskService.ts` | `api.time.start` / `api.time.stop` |
| `plugin.startTimeTracking(task)` / `plugin.stopTimeTracking(task)` / `plugin.getActiveTimeSession(task)` | `src/main.ts` (delegates to `TaskActionCoordinator`, adds Notices) | `api.time.*` + own Notices + `model/timeMath` |
| `plugin.emitter.on(EVENT_TASK_UPDATED /* "task-updated" */)`, `EVENT_DATA_CHANGED /* "data-changed" */`, `EVENT_DATE_CHANGED /* "date-changed" */` | `src/types.ts`, `TaskManager extends Events` | `api.events.on("task.updated")`, lifecycle `cache.changed`, own day-rollover check in ticker |
| `plugin.cacheManager.getAllCachedTasks()` / `getCachedTaskInfoSync(path)` / `getTaskInfo(path)` | `src/utils/TaskManager.ts` | `api.tasks.list()` / `api.tasks.get()` |
| `openTaskSelector(plugin, tasks, cb)` | `src/modals/TaskSelectorWithCreateModal.ts` | Own `FuzzySuggestModal` |
| `plugin.onReady()` | `src/main.ts` | `api.lifecycle.ready()` |

**Decision: require TaskNotes ≥ 4.10.0 and do not build a fallback onto internals.** Older versions get a clear "Update TaskNotes to 4.10+" empty state.

### Reference model: TaskNotes' own `PomodoroView` (`src/views/PomodoroView.ts`) and `StatusBarService` (`src/ui/StatusBarService.ts`)

Patterns worth copying:
- `class PomodoroView extends ItemView`. `getViewType()` returns `POMODORO_VIEW_TYPE = "tasknotes-pomodoro-view"`, `getIcon()` returns `"clock"`, and `getDisplayText()` uses i18n.
- `onOpen()` awaits readiness and then renders, guarded by an **`openGeneration` counter plus an `isClosed` flag**, so a close during the async gap doesn't render into a dead leaf.
- `render()` builds the DOM **once** with `contentEl.createDiv({cls: "tasknotes-plugin pomodoro-view"})` and BEM classes (`pomodoro-view__timer-section`). It stores element refs (`timerDisplay`, `startButton`, ...) and later updates text and classes in place. No virtual DOM, no innerHTML.
- It pauses rendering when hidden (`contentEl.isShown()`, `IntersectionObserver`, `document.visibilityState`) and refreshes on becoming visible.
- `onClose()` offrefs every listener, disconnects observers, nulls refs, and calls `contentEl.empty()`.
- **The status bar uses the split-cadence pattern this project needs:** an event-driven `requestUpdate()` (debounced through `RequestDeduplicator`, with a 100 ms delay after `task-updated`/`data-changed`) refreshes `currentTrackedTasks` from the cache. A separate `window.setInterval(..., 1000)` re-renders elapsed text from that in-memory snapshot. It never re-queries per tick.
- The Pomodoro tick comes from `PomodoroService` via a Web Worker (`PomodoroTicker`) to avoid background-throttle drift. That is **not needed here**: elapsed time is always recomputed as `Date.now() - startTime`, so a throttled tick only delays repainting and never corrupts the value.
- Placement: on desktop, `activatePomodoroView()` opens a **main-area tab** (`workspace.getLeaf("tab")`). Sidebar placement is only automatic on mobile (`getRightLeaf/getLeftLeaf`). Since PROJECT.md wants a sidebar pane, **this plugin should default to the right sidebar**, which differs from the Pomodoro precedent.

## Architectural Patterns

### Pattern 1: Bridge with an availability state machine (anti-corruption layer)

**What:** One class resolves the TaskNotes API and exposes `state` (`missing | incompatible | loading | ready`) plus a `stateChanged` event. Every probe compares **API object identity**. When TaskNotes is disabled and re-enabled, it builds a new plugin instance, `api`, and emitter, so old `EventRef`s are dead and must be re-attached.
**When:** Always. This is the standard companion pattern; `tasknotes-workflows` does the same in `TaskNotesBridge` plus `refreshTaskNotesRuntimeState()`, polled every 5 s with `registerInterval`.
**Trade-offs:** Polling every 5 s costs almost nothing (one property lookup). Obsidian has no public "plugin enabled" event, so polling plus lifecycle events is the reliable combination.

```typescript
// src/tasknotes/TaskNotesBridge.ts
import { App, Events, EventRef, Plugin } from "obsidian";
import type { TaskNotesApiV1 } from "./runtime-api.types";

const REQUIRED = ["tasks.read", "tasks.events", "time.read", "time.write", "lifecycle.events"];
export type BridgeState = "missing" | "incompatible" | "loading" | "ready";

export class TaskNotesBridge extends Events {
  state: BridgeState = "missing";
  private api: TaskNotesApiV1 | null = null;
  private refs: Array<{ off: () => void }> = [];

  constructor(private app: App, private plugin: Plugin) { super(); }

  start(): void {
    this.app.workspace.onLayoutReady(() => this.probe());
    this.plugin.registerInterval(window.setInterval(() => this.probe(), 5000));
    // Public Obsidian events cover renames/deletes the runtime API doesn't surface.
    this.plugin.registerEvent(this.app.vault.on("rename", () => this.trigger("data")));
    this.plugin.registerEvent(this.app.vault.on("delete", () => this.trigger("data")));
    this.plugin.register(() => this.detach());
  }

  probe(): void {
    const api = (this.app as unknown as { plugins?: { getPlugin(id: string): { api?: TaskNotesApiV1 } | null } })
      .plugins?.getPlugin("tasknotes")?.api ?? null;
    if (api === this.api) return;                       // identity unchanged → nothing to do
    this.detach();
    this.api = api;
    if (!api) return this.setState("missing");
    if (api.apiVersion !== 1 || !REQUIRED.every((c) => api.hasCapability(c))) return this.setState("incompatible");
    this.attach(api);
    if (api.lifecycle.isReady()) this.setState("ready");
    else { this.setState("loading"); this.onLifecycle(api, "layout.ready", () => this.setState("ready")); }
  }

  private attach(api: TaskNotesApiV1): void {
    const sub = (ref: EventRef, off: (r: EventRef) => void) => this.refs.push({ off: () => off(ref) });
    for (const ev of ["task.updated", "task.deleted"] as const)
      sub(api.events.on(ev, () => this.trigger("data")), (r) => api.events.off(r));
    for (const ev of ["cache.changed", "cache.rebuilt", "settings.changed"] as const)
      this.onLifecycle(api, ev, () => this.trigger("data"));
    this.onLifecycle(api, "unloading", () => { this.detach(); this.api = null; this.setState("missing"); });
  }
  private onLifecycle(api: TaskNotesApiV1, ev: string, h: () => void) {
    const ref = api.lifecycle.on(ev as never, h);
    this.refs.push({ off: () => api.lifecycle.off(ref) });
  }
  private detach(): void { this.refs.forEach((r) => { try { r.off(); } catch { /* dead emitter */ } }); this.refs = []; }
  private setState(s: BridgeState): void { if (s !== this.state) { this.state = s; this.trigger("state", s); } }

  // Narrow, typed façade. The rest of the plugin never sees `api`.
  listTasks() { return this.requireApi().tasks.list(); }
  start(path: string, reason: string) { return this.requireApi().time.start(path, undefined, this.ctx(reason)); }
  stop(path: string, reason: string) { return this.requireApi().time.stop(path, this.ctx(reason)); }
  private ctx(reason: string) { return { source: "tasknotes-timer-pane", reason }; }
  private requireApi(): TaskNotesApiV1 { if (!this.api || this.state !== "ready") throw new Error("TaskNotes unavailable"); return this.api; }
}
```

(Do not store event refs with `plugin.registerEvent`. Dynamic re-attachment needs its own `refs` list.)

### Pattern 2: Snapshot store with pure selectors (event-driven data refresh)

**What:** `TimerStore.refresh()` (debounced about 150 ms, trailing) calls `bridge.listTasks()` once. It keeps only tasks with `timeEntries?.length`, parses timestamps once, and precomputes `closedMs` per task. Then it emits `changed`. Selectors are pure functions of `(snapshot, now)`.
**When:** On bridge `data` events, on bridge entering `ready`, after every Controller action (awaited, so the UI confirms right away), and on day rollover.
**Trade-offs:** A full rescan per change is O(markdown files), which is fine for a personal vault after debouncing. Incremental updates from event payloads (`after.timeEntries`) are a later optimization; renames, deletes, and manual edits make incremental logic error-prone.

**Derivations (`model/timeMath.ts`), all in milliseconds:**

| Derived value | Rule |
|---------------|------|
| Open entries | `entries.filter(e => e.startTime && !e.endTime)`. Ignore entries whose `Date.parse` is NaN. |
| Active timers | All `(task, entry)` open pairs. **Primary** = latest `startTime`. Others render as a compact "also running" list with stop buttons. |
| Session elapsed | `max(0, now − start(primary))`. Recomputed every tick, never accumulated, so it doesn't drift after sleep or throttling. |
| Task total | `closedMs(task) + Σ_open (now − start)`, where `closedMs = Σ max(0, end − start)` over closed entries (precomputed). Ignore legacy `duration`. TaskNotes' own `calculateTotalTimeSpent` floors each entry to whole minutes, so the pane can show up to ~1 min/entry more than TaskNotes' minute displays. Document this, and show totals as `h m`. |
| vs estimate | `timeEstimate` is minutes, so the ratio is `totalMs / (timeEstimate·60000)`. Hide the bar when there is no estimate. |
| Today's log | For each entry, clip `[start, end ?? now]` to `[localMidnight, nextMidnight)`. Drop empty segments, list newest first, and give per-task subtotals plus a day total. This **differs from TaskNotes' `computeTimeSummary("today")`**, which counts the whole entry by start time only. Clipping is right for an entry that crosses midnight. |
| Recent tasks | Per task, `lastTouched = max(end ?? start)`. Exclude tasks that are currently active, `archived`, or in a completed status (`catalog.statuses().isCompleted`). Sort descending, take N (default 5). It is derived from data, so it needs no extra storage and stays correct across devices and sync. |

### Pattern 3: Split cadence, with a 1 s render tick separate from data refresh

**What:** The view owns `this.registerInterval(window.setInterval(() => this.tick(), 1000))`. Each `tick()` reads `Date.now()` and updates **only text nodes** (session clock, live total, live today total) from the in-memory snapshot. It does no I/O and makes no TaskNotes calls. It also checks the local date key and calls `store.refresh()` when the day changes. The runtime API doesn't expose TaskNotes' `date-changed` event, so the view does its own midnight check. Skip DOM writes when `!contentEl.isShown()`.
**When:** Always. This mirrors `StatusBarService` (1 s `setInterval` re-render from `currentTrackedTasks`).
**Trade-offs:** An always-on 1 s interval that does nothing when there's no active timer is simpler than starting and stopping it, and costs effectively nothing. Use `registerInterval` on the **view** (a `Component`) so it is cleared automatically on close.

### Pattern 4: Serialized controller actions (stop / pause / resume / switch)

**What:** One queue, one action at a time. Buttons are disabled while `busy`. Each action reads the latest snapshot at execution time, not at click time.
- `stop()`: `bridge.stop(primary.path)`. With "stop all", stop every open entry in sequence.
- `pause()`: same as stop, then persist `pausedTaskPath` via `saveData`. Pause is a stop with "remember to resume".
- `resume()`: `bridge.start(pausedTaskPath)`, then clear it. Clear `pausedTaskPath` automatically whenever the store sees any open entry, so a timer started elsewhere wins. Also clear it if the task disappears.
- `start(path)` / `switchTo(path)`: **stop first, then start.** That order avoids overlapping entries, and TaskNotes won't stop other timers itself. Default setting: "Starting a task stops other running timers" = on. If the start fails after the stop succeeded, show a Notice naming both outcomes.
- Errors go through `api.errors.normalize(e).message` to a `Notice`. Treat "already active" and "no active session" as benign races: refresh and continue.

**Trade-offs:** Stop-then-start isn't atomic across two files, but TaskNotes locks per path (`withTimeTrackingLock`), not across tasks, so true atomicity isn't available. Serializing on our side prevents double-click duplicates.

### Pattern 5: activateView plus layout persistence

```typescript
// main.ts
async onload() {
  await this.loadSettings();
  this.bridge = new TaskNotesBridge(this.app, this); this.bridge.start();
  this.store = new TimerStore(this.bridge); this.controller = new TimerController(this, this.bridge, this.store);
  // Register synchronously in onload so Obsidian can restore saved leaves from workspace.json.
  this.registerView(VIEW_TYPE_TIMER_PANE, (leaf) => new TimerPaneView(leaf, this)); // never keep the instance
  this.addRibbonIcon("timer", "Open TaskNotes timer pane", () => void this.activateView());
  this.addCommand({ id: "open-timer-pane", name: "Open timer pane", callback: () => void this.activateView() });
  this.addCommand({ id: "stop-active-timer", name: "Stop active timer", callback: () => void this.controller.stop() });
  this.addCommand({ id: "toggle-pause", name: "Pause / resume timer", callback: () => void this.controller.togglePause() });
  this.addCommand({ id: "switch-task", name: "Switch timed task…", callback: () => this.controller.pickAndSwitch() });
}

async activateView(): Promise<void> {
  const { workspace } = this.app;
  let leaf = workspace.getLeavesOfType(VIEW_TYPE_TIMER_PANE)[0] ?? null;
  if (!leaf) {
    leaf = workspace.getRightLeaf(false);              // sidebar tab in the existing right tab group
    await leaf?.setViewState({ type: VIEW_TYPE_TIMER_PANE, active: true });
  }
  if (leaf) await workspace.revealLeaf(leaf);           // uncollapses sidebar; awaits deferred load (1.7.2+)
}
// onunload(): do NOT detachLeavesOfType. Obsidian restores the leaf in place after updates.
```

`workspace.ensureSideLeaf(VIEW_TYPE_TIMER_PANE, "right", { active: true, reveal: true })` (since 1.7.2) does the same in one call and is fine to use. Layout persistence comes free: Obsidian serializes the leaf's `type` (plus anything returned from `getState()`) into `workspace.json` and rebuilds it with the factory on the next launch. Override `getState()`/`setState()` only for per-leaf UI preferences such as "today's log collapsed". Durable cross-leaf state like `pausedTaskPath` goes in `saveData`.

**Restored-before-ready rule:** A restored leaf may run `onOpen()` before TaskNotes is ready, or never, if TaskNotes is disabled. Since Obsidian 1.7.2, a sidebar leaf in a background tab is **deferred** and its `onOpen()` doesn't run until it is shown. So the view must:
1. Render immediately from `bridge.state`: "TaskNotes not installed or enabled", "Update TaskNotes to 4.10+", "Loading TaskNotes…", or ready.
2. Subscribe with `this.registerEvent(bridge.on("state", ...))` and `this.registerEvent(store.on("changed", ...))`.
3. Call `bridge.probe()` in `onOpen()` so opening the pane re-checks immediately instead of waiting up to 5 s.
4. Use the PomodoroView `openGeneration`/`isClosed` guard around any `await` in `onOpen()`.

### Pattern 6: Vanilla DOM, mounted once and updated in place (no Svelte/Preact)

**What:** `onOpen()` builds the skeleton once with `contentEl.createDiv/createEl`, `setIcon`, and `setTooltip`. Each section is a small class holding element refs with `update(vm)`. List sections (recent, today) rebuild their `<ul>` only when the store emits `changed` (a few times per minute at most). The tick touches only clock text nodes.
**Why:** TaskNotes itself uses no UI framework, and PomodoroView uses exactly this approach. The pane is about 3 sections and 10 controls. A framework would add bundle size, a compile step (Svelte), and a second lifecycle to manage inside `ItemView` for no real benefit. Use Obsidian CSS variables (`--interactive-accent`, `--text-muted`, `--font-monospace`) so themes work.
**Reconsider only if** the UI grows into editable time-entry tables (a later "edit today's log" feature). Even then, Preact (about 4 kB) beats Svelte for staying framework-light.

## Data Flow

### Write flow (user clicks Pause)

```
[Pause button] → TimerController.pause()  (busy=true, buttons disabled)
   → bridge.stop(primary.path, "pause")
      → api.time.stop(path, {source:"tasknotes-timer-pane"})
         → TaskService.stopTimeTracking → processFrontMatter(timeEntries[i].endTime = now)
         → cacheManager.updateTaskInfoInCache → emitter.trigger("task-updated", {originalTask, updatedTask})
              ├→ TaskNotes StatusBarService.requestUpdate()   (status bar stays consistent)
              └→ runtime events "task.updated" (+ "time.stopped") → Bridge "data" → Store.refresh() (debounced)
   → saveData({pausedTaskPath})
   → await store.refresh()  → "changed" → View.update()  (busy=false)
```

### External change flow (timer started from a task card, a command, or manual YAML edit)

```
TaskNotes UI / user edit → frontmatter changes
  → (TaskNotes path) emitter "task-updated" with originalTask → runtime "task.updated"
  → (manual edit)    metadataCache "changed" → TaskManager (debounced) → "task-updated" without originalTask
                     → runtime "task.created" + "task.updated" (no time.* event)
  → (rename/delete)  vault "rename"/"delete" → our Bridge listens directly (no runtime event for these)
  → Bridge "data" → Store.refresh() → "changed" → View.update()
```

### Clock flow (every second)

```
view interval (1 s) → now = Date.now()
  → if dayKey changed: store.refresh()
  → if visible: sessionEl.setText(fmt(now − primary.start)); totalEl.setText(fmt(closedMs + Σ open)); todayTotalEl…
```

### Startup flow

```
Obsidian loads plugins (order not guaranteed) → our onload: registerView, bridge.start()
  → workspace restores leaves → TimerPaneView constructed (maybe deferred) → renders bridge.state
  → onLayoutReady → bridge.probe()
       api missing?        → state "missing"  (re-probed every 5 s and on view open)
       api v1 + caps?      → attach events; isReady()? "ready" : wait lifecycle "layout.ready"
  → state "ready" → store.refresh() → view shows live data
```

### State Management

```
TimerStore (single source for UI)          TimerController (single writer)
  snapshot {tasks, opens, fetchedAt}  ◀──── refresh() after each action
     │  "changed"                             ▲
     ▼                                        │ intents
  TimerPaneView sections (subscribe)  ────────┘
Persistent: plugin data.json { settings, pausedTaskPath }  ·  workspace.json { leaf type + view getState() }
Authoritative time data: ONLY task frontmatter via TaskNotes (never duplicated or cached across sessions)
```

## Scaling Considerations

The scale here is vault size and the number of time entries, not users.

| Scale | Architecture adjustments |
|-------|--------------------------|
| < 2k notes, < 5k entries | Full `tasks.list()` rescan per debounced change is fine (tens of ms). |
| 2k–20k notes | Keep the debounce at 150–300 ms. Skip refresh while the pane is hidden, setting a `dirty` flag and refreshing when it becomes visible (PomodoroView's `taskCardDirty` idea). |
| 20k+ notes or huge entry histories | Do incremental updates from the `task.updated` payload `after` (replace one task in the snapshot) and fall back to a full rescan only on lifecycle `cache.*`, rename, or delete. Consider `api.query.tasks({ where: { field: …, op: "exists" } })` if a time-entries field is queryable (check `api.catalog.filterProperties()`). |

### Scaling Priorities

1. **First bottleneck:** a refresh storm during bulk edits or sync, when many `task.updated` events arrive at once. Fix: trailing debounce plus a single-flight refresh (if a refresh is running, mark dirty and run once more after).
2. **Second bottleneck:** DOM churn from rebuilding lists every tick. Fix: the tick updates text nodes only, and lists rebuild only on `changed`.

## Anti-Patterns

### Anti-Pattern 1: Reaching into `plugin.taskService` / `plugin.cacheManager` / `plugin.emitter`
**What people do:** Copy what TaskNotes' own views do (`this.plugin.emitter.on(EVENT_TASK_UPDATED, …)`, `cacheManager.getAllCachedTasks()`).
**Why it's wrong:** These are undocumented internals. The emitter object is replaced when TaskNotes reloads, and they bypass the mutation `context` and API error typing. The runtime API exists so companions don't have to do this.
**Do this instead:** Use the `api.*` runtime API through `TaskNotesBridge`, with capability checks.

### Anti-Pattern 2: Writing `timeEntries` frontmatter directly (or via `api.tasks.update`/`time.append`) to start or stop
**Why it's wrong:** It skips `TaskService`'s per-path lock and its "already active" and "no active session" guards, the field-mapping (`fieldMapper.toUserField("timeEntries")`), the `dateModified` update, webhooks, and status-bar consistency.
**Do this instead:** Use only `api.time.start` and `api.time.stop`. Pause and resume are built from these two calls.

### Anti-Pattern 3: Counting seconds in a counter
**What people do:** `elapsed++` every tick.
**Why it's wrong:** It drifts under background throttling, sleep, or popout windows, and resets on reload.
**Do this instead:** Always derive `now − Date.parse(startTime)`.

### Anti-Pattern 4: Querying TaskNotes every second
**Why it's wrong:** `tasks.list()` and `time.active()` scan the whole vault. Doing that every second wastes CPU and battery.
**Do this instead:** Refresh the snapshot when events fire, and let the tick read memory only.

### Anti-Pattern 5: Assuming one active timer
**Why it's wrong:** TaskNotes allows several tasks with open entries at the same time (`api.time.active()` returns an array, and the status bar shows a count). A pane that shows only `active[0]` hides running timers and makes "stop" ambiguous.
**Do this instead:** Show a primary timer (latest start) plus "also running (N)", and stop others before starting (configurable).

### Anti-Pattern 6: Holding view references or detaching leaves on unload
**Why it's wrong:** Obsidian may call the view factory more than once. Storing instances leaks memory. Detaching leaves on unload loses the user's sidebar placement on every plugin update.
**Do this instead:** Use `getLeavesOfType()` when needed, let views subscribe to the store, and leave `onunload` free of leaf detaching.

### Anti-Pattern 7: Relying on `time.started` / `time.stopped` for sync
**Why it's wrong:** These don't fire for manual YAML edits, synced changes from other devices, renames, or deletes.
**Do this instead:** Use `task.updated` + `task.deleted` + lifecycle `cache.*`/`settings.changed` + vault `rename`/`delete`, then recompute from data.

## Integration Points

### External Services

| Service | Integration pattern | Notes |
|---------|---------------------|-------|
| TaskNotes plugin (≥ 4.10.0; tested target 4.13.8, forward-compatible with 5.0 beta) | In-process runtime API v1 via `app.plugins.getPlugin("tasknotes").api` | MIT-licensed. Vendor a minimal type subset of `src/api/runtime-api.ts` and record the source revision. Upstream mentions a future `@tasknotes/runtime-api` package; switch to it when it is published. |
| Obsidian workspace | `registerView`, `getRightLeaf(false)`/`ensureSideLeaf`, `revealLeaf` (awaitable since 1.7.2), deferred leaves | Set `minAppVersion` to at least 1.7.2. Matching TaskNotes 4.13.8's `1.12.2` is simplest. |
| Obsidian vault events | `vault.on("rename" \| "delete")` | Fills gaps in the runtime event coverage. |
| HTTP API | **Not used** (out of scope per PROJECT.md) | — |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| View ↔ Store | View subscribes to `changed`; reads selectors | One-way. The view never writes to the store. |
| View ↔ Controller | Method calls (intents) returning Promises | The Controller exposes `busy` for button state. |
| Controller → Bridge | Typed façade calls (`start`, `stop`, `listTasks`) | The Controller never sees the raw `api`. |
| Bridge → Store | `data` and `state` events | The Store decides when to refresh (debounce). |
| Store → model/ | Pure function calls | Unit-test seam. |
| Plugin data | `loadData`/`saveData` | Settings plus `pausedTaskPath` only, never time data. |

## Suggested Build Order (dependency-driven)

1. **Shell and view lifecycle.** `main.ts`, `registerView`, `activateView`, ribbon, command, an empty `TimerPaneView` with a placeholder, and the layout-persistence check (reload Obsidian and confirm the pane comes back in the sidebar). *No dependencies; confirms Obsidian plumbing.*
2. **TaskNotesBridge and vendored types.** Probe, state machine, capability gate, event attach/detach, and the four empty states in the view. Manual test: TaskNotes disabled, then enabled, then disabled. *Depends on 1.*
3. **Model and Store (read-only pane, the core-value MVP).** `timeMath.ts` with unit tests, `TimerStore` with debounced refresh, the active-task card with the live session clock (1 s tick), the live total vs estimate, and "also running". *Depends on 2. At this point the pane is a working monitor.*
4. **Controller actions.** Stop, pause/resume (with `pausedTaskPath` persisted), `TaskPickerModal` start, switch (stop-then-start), Notices, busy state, and commands for each. *Depends on 3 (needs the snapshot for the primary timer and picker items).*
5. **Secondary lists.** Recent tasks (one-click resume) and today's log with midnight clipping and day rollover. *Depends on 3 (selectors) and 4 (resume action).*
6. **Hardening and polish.** Rename/delete during an active timer, multiple active timers, TaskNotes reload mid-session, sync races ("already active"/"no active session" handled as benign), visibility-paused rendering, `api.ui.taskMenu` on the active card, settings tab, styles. *Depends on 4–5.*

**Research flags:** Phases 1, 3, and 5 follow standard patterns and need no further research. Phase 2 needs a short check of how TaskNotes behaves when disabled and re-enabled at runtime (does `getPlugin` return the new instance right away, and does `unloading` always fire?). Phase 4 needs a quick decision, with the user, on whether switching stops **all** running timers or only the primary one.

## Sources

- TaskNotes source, `callumalpass/tasknotes` `main` (manifest 4.13.8, read 2026-10-13): `src/api/runtime-api.ts`, `src/api/TaskNotesAPI.ts` (`time`, `events`, `lifecycle` namespaces; `startTime`/`stopTime`/`getActiveTimeEntries`; `normalizeUpdatedEvent` time.* derivation), `src/services/TaskService.ts` (`startTimeTracking`/`stopTimeTracking`, `withTimeTrackingLock`), `src/ui/TaskActionCoordinator.ts`, `src/ui/StatusBarService.ts` (1 s ticker plus event refresh), `src/views/PomodoroView.ts`, `src/services/PomodoroTicker.ts`, `src/utils/TaskManager.ts` (metadataCache to `task-updated` without `originalTask`), `src/bootstrap/pluginBootstrap.ts` (`plugin.api = new TaskNotesAPI(plugin)`, `initializeAfterLayoutReady`, `registerActiveViews`), `src/ui/WorkspaceNavigationService.ts` (`activateView`), `src/types.ts` (`EVENT_*`, `TimeEntry`, `TaskInfo`), `src/utils/timeTrackingUtils.ts`. Seam-classified provider tier: LOW (webfetch). Findings are HIGH because they were verified directly against primary source code.
- TaskNotes docs in-repo: `docs/javascript-api.md` (runtime API, companion access, events, lifecycle) and `docs/companion-plugins.md`. Release notes `docs/releases/4.10.0.md` (runtime API added) and `4.11.0.md` (task menu API).
- TaskNotes tag `5.0.0-beta.5`: `src/api/runtime-api.ts` diff (only additions: `tasks.getByPath/getById`, `tasks.lookup-id`) and `TaskNotesAPI.ts` time namespace unchanged. GitHub releases API: 4.13.8 is the stable release, 5.0 is an opt-in beta.
- `callumalpass/tasknotes-workflows` `src/tasknotesBridge.ts` and `main.ts`: the official companion bridge pattern (lazy `getPlugin("tasknotes")?.api`, 5 s `registerInterval` availability probe, lifecycle re-registration).
- Obsidian API `obsidian.d.ts` (obsidianmd/obsidian-api master): `getRightLeaf`, `ensureSideLeaf` (1.7.2), `revealLeaf(): Promise` (1.7.2), `isDeferred`/`loadIfDeferred` (1.7.2), `registerInterval`.
- Obsidian docs, "Views" (activateView pattern; "Never manage references to views") and "Plugin guidelines" ("Don't detach leaves in onunload"). Seam tier for web docs: LOW; consistent with `obsidian.d.ts`.

---
*Architecture research for: Obsidian companion sidebar pane for TaskNotes time tracking*
*Researched: 2026-10-13*
