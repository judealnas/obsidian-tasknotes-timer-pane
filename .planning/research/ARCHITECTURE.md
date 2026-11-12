# Architecture Research: v0.3 Staging Tasks

**Domain:** Adding daily task staging (Staged tab) to the existing TaskNotes Timer Pane (`ItemView` companion plugin)
**Researched:** 2026-11-12
**Confidence:** HIGH for the existing code seams (read from `src/` on this branch). HIGH for the TaskNotes write/read behavior quoted below (read from the TaskNotes 4.13.8 bundle in `dev-vault/.obsidian/plugins/tasknotes/main.js` and upstream `src/api/runtime-api.ts` / `src/types.ts` on `main`, now 4.18.1). MEDIUM for recurring-date snapping and cache behavior after registering a user field (code read, not exercised).

Scope: only what v0.3 adds or changes. The v0.1 architecture file is in git history.

---

## 1. Findings that change the design (read these first)

These came from reading TaskNotes' code. Each one changes how a component must be written.

| # | Finding | Evidence | Consequence |
|---|---------|----------|-------------|
| F1 | `tasks.update(path, patch)` writes a user field only when `patch[key]` (or `patch.customProperties[key]`) is **not `undefined`** and the key is in `settings.userFields`. Anything else is silently dropped. | `wz()` tail in bundle: `for (u of userFields) hasOwn(d,u.key) && d[u.key]!==void 0 ? i[u.key]=d[u.key] : …` | Staging writes `{ [key]: "YYYY-MM-DD" }`. Confirms Q15: the setup notice is required, because an unregistered key "succeeds" with no write. |
| F2 | **Unstage cannot delete the key through the typed patch.** `undefined` is skipped. `null` passes the filter, and `dfe()` then assigns `frontmatter[key] = null`, which leaves `staged:` (YAML null) in the file. Only `customFrontmatter: { key: null }` deletes (`m===null ? delete n[p]`), but `customFrontmatter` is typed on `TaskCreationData`, **not** on `TaskNotesTaskPatch`. | `dfe()` in bundle; `TaskNotesTaskPatch extends Partial<TaskInfo>` in upstream runtime-api.ts; `customFrontmatter` in `TaskCreationData` in types.ts | Q11 ("unstaging deletes the key") is not achievable through the typed contract. **Recommend:** write `{ [key]: null }` and treat null, empty or unparseable values as "not staged" everywhere. Optionally send `customFrontmatter: { [key]: null }` in the same patch, behind a contract test, to get a real delete. That is out-of-contract, so it's a roadmap decision. Flag it for the phase that builds unstage. |
| F3 | A registered user field shows up on `TaskInfo` both at the top level and in `customProperties`. An unregistered key appears on neither. | `bz()` in bundle: `c[d.key]=e[d.key], l[d.key]=e[d.key] … o.customProperties={…}` | Read order is `task[key] ?? task.customProperties?.[key]`. A hand-typed `staged:` on an unregistered field is invisible to the plugin, so the same setup notice covers reads. |
| F4 | `catalog.userFields()` exists (4.13.8 bundle and upstream) and returns `{ id, key, displayName, type }[]`. | `this.catalog={…userFields:()=>this.getUserFields()…}` | The setup check is a pure function over `catalog.userFields()`: `missing`, `wrong-type` (not `date`) or `ok`. No settings snapshot and no internals. Re-check it on `settings.changed`, which the bridge already forwards as a data hint (`TaskNotesBridge.ts:404`). |
| F5 | `recurring.toggleCompleteInstance(path, date?)` is a **toggle**. With no `date`, it targets the task's **`scheduled` date** (when `recurrence_anchor !== "completion"`), not today. | `kM(n,e){ if(e) return e; if(n.recurrence_anchor!=="completion"&&n.scheduled) return …scheduled…; return today }` | Always pass the plugin's staging day explicitly, and check `complete_instances.includes(day)` first, or a second ✓ un-completes the instance. The date string goes through `new Date("YYYY-MM-DD")` (UTC midnight), which matches TaskNotes' own date-string convention. `Sce()` may snap the target to a nearby occurrence (MEDIUM, verify in the dev vault with an off-schedule day). |
| F6 | `tasks.complete` on a recurring task sets the series' status to completed. | `completeTask()` → `updateProperty(a,"status",i)` | The existing `TimerController.complete` (`TimerController.ts:440`) is wrong for recurring tasks in **both** tabs. The generalized complete should branch on `task.recurrence`. Whether to fix the Timers tab too is a roadmap decision; the recommendation is yes, through one shared code path. |
| F7 | `tasks.list()` with no query returns every cached task, cloned (`cacheManager.getAllTasks().map(cr)`). | `listTasks(e){ return e ? queryTasks(e).tasks : getAllTasks().map(cr) }` | Derive the staged set by filtering `listTasks()` locally. Don't use `query.tasks` with a user-field predicate: the field naming for user fields in queries is unverified, and it needs another capability. That adds risk for no gain at this vault size (38 tasks). |

---

## 2. System overview (v0.3)

```
┌──────────────────────────────── TimerPaneView (ItemView, same VIEW_TYPE) ───────────────────────────────┐
│  PaneShell: tab strip [Staged | Timers] · bridge-state message · 1 s tick · wake/reveal refresh         │
│  ┌──────────────── StagedTab ────────────────┐   ┌──────────────── TimersTab ─────────────────┐        │
│  │ header: Stage task · setup notice         │   │ header: Start · Pause all · Resume · Stop  │        │
│  │ CardList<path>  (order: stagedOrder)      │   │ CardList<sessionKey> (order: cardOrder)    │        │
│  │  TaskCard idle | running | paused         │   │  TaskCard running | paused   (v0.2)        │        │
│  │ "Done today" section (read-only rows)     │   │                                            │        │
│  └───────────────────────────────────────────┘   └────────────────────────────────────────────┘        │
│        TaskPickerModal(mode: "stage")                     TaskPickerModal(mode: "start")               │
└──────────────┬───────────────────────────────────────────────────────────────┬─────────────────────────┘
               │ subscribe / commands                                           │
┌──────────────┴──────── state (plugin-scoped, Obsidian-free) ──────────────────┴─────────────────────────┐
│ StagingStore ──reads──► gateway.listTasks / userFields / statuses        TimerStore (v0.2, unchanged)   │
│      │ uses DayClock, DoneTodayStore                                       ▲  snapshot by taskPath      │
│ StagingController ─┐                                                       │                            │
│      (stage/unstage/complete-staged)  ──► WriteQueue (shared) ◄── TimerController (generalized complete) │
│ StagedOrderStore (path-keyed, rename/delete)   CardOrderStore (v0.2)   PauseStore (v0.2)                │
│ DoneTodayStore (path+day records)                                                                       │
└──────────────┬──────────────────────────────────────────────────────────────────────────────────────────┘
               │ persistAll (single writer of data.json)            vault rename/delete → stores
┌──────────────┴──────── TaskNotesBridge (only TaskNotes touchpoint) ─────────────────────────────────────┐
│ + updateTask · toggleCompleteInstance · userFields · stagingAvailability · recurringAvailability        │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Source-of-truth split (keep this the same everywhere)

| Fact | Owner | Stored in | Why |
|------|-------|-----------|-----|
| *Is the task staged, and since when* | **TaskNotes frontmatter** `staged: YYYY-MM-DD` | the task note | It syncs across devices, can be staged from chat, Bases or by hand, and survives a reinstall. Roll-forward needs no write (Q10). |
| *Running / paused / elapsed* | TaskNotes `timeEntries` + PauseStore | note + data.json | Unchanged from v0.2. |
| *Staged order* | **plugin** `stagedOrder: string[]` (normalized paths) | data.json | Per-device and momentary (Q3). It never reaches TaskNotes. |
| *Done today* | **plugin** `doneToday: {path, day}[]`, filtered by TaskNotes state | data.json | `staged` is cleared on completion (Q12), so the field can't say "it was staged". The record says "this plugin completed it from the staged list today". TaskNotes confirms it is still done. |
| *Current staging day* | DayClock (pure) from `Date.now()` + `rolloverHour` | — | Never stored. Derived every tick. |

**Rule:** plugin data can only *order* or *annotate* what TaskNotes reports. It never makes a task appear staged. A path in `stagedOrder` whose task isn't staged is simply not rendered. Once a successful read confirms that, it is pruned.

---

## 3. Components: new vs modified

### New

| Component | File | Responsibility | Depends on |
|-----------|------|----------------|------------|
| **DayClock** (pure) | `src/model/stagingDay.ts` | `stagingDay(nowMs, rolloverHour): "YYYY-MM-DD"` (local date of now shifted back `rolloverHour` hours, using `setHours` and not ms arithmetic, so DST is safe); `daysBetween(a, b)` in calendar days; `parseStagedValue(unknown): string \| null` (accepts `YYYY-MM-DD`, takes the first 10 characters of an ISO datetime, rejects everything else). | — |
| **staging model** (pure) | `src/model/staging.ts` | `readStaged(task, key)` (F3 order); `deriveStaging({ tasks, key, day, completedStatuses, doneRecords })` → `{ staged: StagedItem[], done: DoneItem[] }`. Staged = has a valid date `<= day` **and** not completed **and** not archived, and for a recurring task, `complete_instances` does not include `day`. Done = record for `day`, task still exists, and (`completedDate === day` or status completed or `complete_instances.includes(day)`). `fieldStatus(userFields, key)` → `ok \| missing \| wrong-type \| unknown`. `orderStaged(items, saved)` puts **fresh items at the bottom** (the opposite of `orderTimers`, `cardOrder.ts:308`), and orders fresh items by staged date and then path. | DayClock |
| **StagedOrderStore** | `src/state/StagedOrderStore.ts` | Same load/set/serialize/subscribe contract as `CardOrderStore` (`CardOrderStore.ts`), but keys are normalized paths, plus `renamePath(old,new)` (folder-aware, copied from `PauseStore.renamePath`, `PauseStore.ts:100`), `removePath`, `append(path)` and `prune(livePaths)`. | `normalizeTimerPath` |
| **DoneTodayStore** | `src/state/DoneTodayStore.ts` | Records `{ path, day, title }`. `add`, `renamePath`, `removePath`, `dropOtherDays(day)` (rollover), `serialize`. Bounded (for example 200). Follows the same `loaded`/`changedBeforeLoad`/persist pattern as PauseStore. | — |
| **StagingStore** | `src/state/StagingStore.ts` | Plugin-scoped snapshot `{ fieldStatus, staged, done, day }`. It subscribes to `gateway.onData`/`onState` (the same hints as TimerStore) with a trailing debounce and single-flight refresh. It reads `listTasks()`, `statuses()` and `userFields()`, then calls `deriveStaging`. `tickDay(nowMs)` recomputes `day`. When the day changes, it re-derives from the last task list (no TaskNotes read and no write) and calls `doneToday.dropOtherDays`. It prunes `stagedOrder` only after a successful read while ready, and never on a failed or null read (the same rule as PauseStore). | gateway, DayClock, StagedOrderStore, DoneTodayStore, settings getter |
| **StagingController** | `src/state/StagingController.ts` | `stage(task)`: queue → `updateTask(path, {[key]: day})` → `stagedOrder.append(path)` → `refreshNow`. `unstage(path)`: queue → `updateTask(path, {[key]: null})` (F2) → `stagedOrder.removePath` → refresh. `completeStaged(item, timer?)`: delegates the completion to `TimerController.completeTask` (below), then in the queue clears the staged field (best effort; failure is harmless because completed tasks are filtered out anyway) and `doneToday.add`. It never writes when `fieldStatus !== "ok"`. | gateway, WriteQueue (shared), TimerController, stores |
| **TaskCard** | `src/ui/TaskCard.ts` | One card DOM, extracted from `TimerPaneView.buildCard` / `updateTitle` / `renderTitleLink` (`TimerPaneView.ts:304-545`). Modes: `idle` (Start, ✓, ✕), `running`/`paused` (+ clock, total, pause/resume, stop). Optional slots: ✕ unstage, "N days staged" badge, mobile ▲▼ (`Platform.isMobile`). Owns title chip rendering, context menu and open-note behavior. | gateway.showTaskMenu, obsidian |
| **CardList&lt;K&gt;** | `src/ui/CardList.ts` | Generic keyed reconcile (from `reconcileCards`, `TimerPaneView.ts:615`), drag/drop and ArrowUp/Down (`wireHandle`, `:260`), and ▲▼ buttons. It is parameterized by `keyOf(item)` and `commit(order)`. One instance per tab. | TaskCard, `moveKey`/`moveKeyBy` |

### Modified

| Component | File | Change |
|-----------|------|--------|
| **runtime-api.types** | `src/tasknotes/runtime-api.types.ts` | `TaskInfo` gains `recurrence?`, `complete_instances?`, `completedDate?`, `scheduled?`, `customProperties?: Record<string, unknown>`. Add `TaskNotesTaskPatch` (`Partial<TaskInfo> & Record<string, unknown>`), `UserMappedField { id; key; displayName?; type }`, `tasks.update?`, `catalog.userFields?`, `recurring?.toggleCompleteInstance`. Pin each one in `tests/contract.test.ts`. |
| **TaskNotesGateway / Bridge** | `src/tasknotes/TaskNotesBridge.ts` | Add `updateTask(path, patch, ctx)` (`tasks.write`), `toggleCompleteInstance(path, date, ctx)` (`recurring.write`), `userFields()` (`catalog.read`), `stagingAvailability()` (the same shape as `startAvailability`, `:200`) and `recurringAvailability()`. Every one goes through `featureApi`. **Don't** add them to `REQUIRED_CAPABILITIES` (`:21`): Timers must keep working on TaskNotes 4.10–4.12, and staging degrades to a notice. Also update `tests/fakes/fakeGateway.ts`. |
| **TimerController** | `src/state/TimerController.ts` | Generalize `complete(target: StopTarget)` (`:440`) into `completeTask({ taskPath, title, startTime: string \| null, recurring: boolean, day })`. The in-queue body branches on recurrence: `toggleCompleteInstance(path, day)` only if `!complete_instances.includes(day)` (F5); otherwise `completeTask(status)`. The "stop only the same still-open entry" logic stays, and `startTime: null` means "stop any open non-Pomodoro entry on this path" (an idle-looking staged card can still race a start). Keep `complete(StopTarget)` as a thin wrapper so existing tests hold. Reuse `start()` as is for the idle ▶ button. |
| **TimerPaneView** | `src/ui/TimerPaneView.ts` | Becomes a shell: the tab strip, the bridge-state message (missing/incompatible/loading are shared by both tabs), the 1 s tick (also calls `stagingStore.tickDay(now)`), and wake/reveal refreshes of **both** stores. The current body moves into `TimersTab` with no behavior change. Persist the active tab via `getState()`/`setState()` (view state, restored with the layout) and not in data.json. `VIEW_TYPE_TIMER_PANE` stays `"tasknotes-timer-pane"` so saved leaves restore. `getDisplayText` becomes "TaskNotes Task Control". |
| **Pane-state CSS** | `styles.css:10-11` | `tntp-pane--running` currently hides or shows the single `.tntp-cards`. Move the modifier onto each tab panel (`tntp-tab--{state}`), because Staged can have cards while Timers is idle. Bridge states (missing, incompatible, loading) stay on the root. |
| **TaskPickerModal** | `src/ui/TaskPickerModal.ts` | Replace the `controller: Pick<TimerController,"start"…>` constructor argument (`:22`) with an options object: `{ placeholder, availability(): {available, reason}, choose(task), exclude?(task, completed) }`. The start mode is the same as today. The stage mode excludes completed and archived tasks (Q14) and tasks already staged for `<= day`, and its `choose` calls `stagingController.stage`. Keep `filterAndSortTasks` (`taskPicker.ts`) unchanged and apply `exclude` before it. |
| **settings** | `src/settings.ts` | `TimerPaneSettings` gains `stagedFieldKey: string` (default `"staged"`, trimmed, non-empty) and `rolloverHour: number` (0–23, default 4). Extend `loadSettings` defensively. |
| **TimerPaneSettingTab** | `src/ui/TimerPaneSettingTab.ts` | Add a key text field (with the live `fieldStatus` as its description) and a rollover-hour dropdown. **Bug to fix first:** `saveChoice` calls `saveSettings({ completionStatus: choice })` (`:231`), which would erase the new settings. It must spread `getSettings()`. |
| **main.ts** | `src/main.ts` | Add `"stagedOrder"`, `"doneToday"`, `"stagedFieldKey"`, `"rolloverHour"` to `OWNED_KEYS` (`:15`). `persistAll` (`:49`) writes them; omit empty `stagedOrder` and `doneToday`, as is done for `cardOrder`. Construct StagedOrderStore, DoneTodayStore, StagingStore and StagingController sharing the one `WriteQueue` and `bridge`. The vault `rename`/`delete` handlers (`:152-159`) also call `stagedOrder.renamePath/removePath` and `doneToday.renamePath/removePath`, then `stagingStore.requestRefresh()`. `saveSettings` refreshes both stores (a key change re-derives everything). Rename the ribbon tooltip and command text. |
| **manifest.json** | — | `name: "TaskNotes Task Control"`, version 0.3.0. The id is unchanged. |

---

## 4. Data flow

### 4a. Computing the staged list (event-driven pull, not polling)

```
TaskNotes event (task.updated | task.deleted | cache.changed | settings.changed | time.*)
   → TaskNotesBridge.emitData()                       (existing, TaskNotesBridge.ts:400-410)
   → StagingStore.requestRefresh()  [200 ms trailing debounce, single-flight]
   → gateway.listTasks()  +  statuses()  +  userFields()
   → fieldStatus(userFields, key)          ─► "missing" ⇒ snapshot with notice, no staged list
   → deriveStaging(tasks, key, day, completed, doneToday.records())
   → stagedOrder.prune(live paths)  (successful read only)
   → notify → StagedTab.render()
DayClock tick (view 1 s tick, plus a plugin interval as a backstop when no view is open)
   → StagingStore.tickDay(now): day changed? → re-derive from last tasks, doneToday.dropOtherDays(day), notify
```

Why a pull on hint, and not patching state from event payloads: it is the pattern TimerStore already uses (`TimerStore.ts:95`). The payloads are typed `unknown` in the vendored contract. Metadata-cache-driven changes (hand edits, Sync) arrive only as `task.updated`. Re-deriving from one list read is simpler and self-healing. The 45 s safety resync (`main.ts:147`) should call `stagingStore.resync()` too.

### 4b. Joining staged items with live timers (no new reconciliation state)

The StagedTab renders from **two** snapshots and joins them by normalized path at render time:

```
timersByPath = Map(normalizeTimerPath(t.taskPath) → OpenTimer)   from TimerStore.getSnapshot() (primary + others)
for item of orderStaged(staging.staged, stagedOrder.get()):
    timer = timersByPath.get(item.path)
    card mode = timer ? timer.state /* running | paused */ : "idle"
    key = item.path        // NOT sessionKey: the card must survive start/pause/stop
```

- One task has at most one OpenTimer. TaskNotes refuses a double start on the same path, and PauseStore is keyed by path. Pomodoro-owned entries are already removed by `visibleEntries` (`TimerStore.ts:30`), so a Pomodoro-timed staged task renders **idle**. Its ▶ goes through `TimerController.start`, which refuses with the "being timed by Pomodoro" notice (`TimerController.ts:148`). This matches the v0.3 decision (no 🍅).
- The elapsed and total values come from the same `timerSessionMs`/`totalMs` the Timers tab uses (`timeMath.ts:70,92`), so both tabs show identical numbers on the same tick.
- An idle card's "Total" can come from `item.task.timeEntries` (already in the `listTasks` result), so no extra read is needed.
- Both stores notify the view independently. A start shows up first in TimerStore and later (on the debounced task.updated) in StagingStore, which is harmless because the join is recomputed on every render.

### 4c. Writes (all through the one WriteQueue)

| Action | Path | TaskNotes calls (in queue) | Plugin data |
|--------|------|----------------------------|-------------|
| Stage (picker) | StagingController.stage | `tasks.update(path, {[key]: day})` | `stagedOrder.append(path)` after success |
| Re-stage an already staged task | same | rewrites `day` (Q10: "refreshes its date") | order unchanged |
| Unstage ✕ | StagingController.unstage | `tasks.update(path, {[key]: null})` (F2) | `stagedOrder.removePath` |
| Start ▶ (idle card) | TimerController.start | `time.start` | — |
| Pause/Resume/Stop (running card) | TimerController (unchanged) | v0.2 | PauseStore |
| ✓ non-recurring | TimerController.completeTask → StagingController | `tasks.complete(status)`, stop the open entry if one exists, then `tasks.update(path,{[key]: null})` | `doneToday.add({path, day})` |
| ✓ recurring | same | `recurring.toggleCompleteInstance(path, day)` only if `day ∉ complete_instances`, stop the entry, clear `staged` | `doneToday.add` |
| Rollover | StagingStore.tickDay | **none** | `doneToday.dropOtherDays` |
| Rename/delete note | main.ts vault events | none | `stagedOrder`, `doneToday`, PauseStore follow |

All mutation contexts use `source: MUTATION_SOURCE` with reasons such as `"user stage"`, `"user unstage"`, `"user complete staged"`.

### 4d. Persistence (data.json via the single `persistAll`)

```jsonc
{
  "completionStatus": null,
  "stagedFieldKey": "staged",        // new
  "rolloverHour": 4,                 // new
  "pauseRecordsVersion": 1, "pauseRecords": [ … ],
  "cardOrder": [ "<sessionKey>", … ],          // Timers tab (v0.2)
  "stagedOrder": [ "TaskNotes/Tasks/a.md", … ], // new, normalized paths, ≤ MAX_STORED_ORDER
  "doneToday": [ { "path": "…", "day": "2026-11-12", "title": "…" } ]  // new
}
```

The stores call `persist: () => this.persistAll()` exactly like PauseStore and CardOrderStore (`main.ts:84-88`). The loader functions (`loadStagedOrder`, `loadDoneToday`) are defensive, capped and never throw, mirroring `loadCardOrder` (`cardOrder.ts:340`).

---

## 5. Patterns to follow

### Pattern 1: Pure derivation and a thin store (the v0.2 pattern, repeated)
**What:** All staging rules (date parsing, `<= today`, completed filter, recurring instance, done-today, ordering, field status, days staged) live in `src/model/staging.ts` + `stagingDay.ts` with no Obsidian and no TaskNotes runtime. StagingStore only sequences reads and calls `deriveStaging`.
**Why:** It matches `timeMath.deriveSnapshot` and `pauseLedger.reconcile`, and lets roughly 80% of the new behavior be tested in Vitest with plain objects. Rollover tests pass `nowMs` and need no fake timers.

```typescript
export function stagingDay(nowMs: number, rolloverHour: number): string {
	const d = new Date(nowMs);
	d.setHours(d.getHours() - rolloverHour); // local-time shift: DST-safe
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
```

### Pattern 2: Render-time join, not a merged store
**What:** Keep TimerStore untouched and join by path in the StagedTab render (4b).
**Why:** TimerStore carries delicate pause reconciliation and Pomodoro filtering that has been accepted in UAT. Making it staging-aware couples two refresh cadences and risks v0.2 regressions. The join is O(n) on tiny n.

### Pattern 3: Feature-gated capabilities, never required
**What:** `stagingAvailability()` checks `tasks.read`, `tasks.write`, `catalog.read` and the presence of `tasks.update`/`catalog.userFields`. `recurringAvailability()` checks `recurring.write`. The Staged tab shows a specific message per failure.
**Why:** It preserves graceful degradation (a PROJECT constraint) and keeps the Timers tab fully working on older TaskNotes.

### Pattern 4: One generic card list, two key spaces
**What:** `CardList<K>` with `keyOf` and `commit`. Timers: `keyOf = t => t.sessionKey`, `commit = cardOrder.set`. Staged: `keyOf = i => i.path`, `commit = stagedOrder.set`.
**Why:** Drag, keyboard and mobile ▲▼ are written once. The two orders stay independent (Q27) because each list commits to its own store.

---

## 6. Anti-patterns to avoid

| Anti-pattern | Why it's bad | Do instead |
|--------------|--------------|------------|
| Writing `staged` with `app.fileManager.processFrontMatter` | Bypasses TaskNotes' lock, cache and events, and violates the data-format constraint. | `api.tasks.update` only, and accept F2's `null`. |
| Treating `stagedOrder` membership as "staged" | Data.json drifts from frontmatter (Sync, chat, hand edits), and tasks reappear after unstage elsewhere. | Membership comes from the frontmatter; order is only a ranking. |
| Calling `toggleCompleteInstance` without a date, or without checking first | It targets the scheduled date (F5), and a second call un-completes. | Always pass `day`, and check `complete_instances` first. |
| Using the calendar date where the staging day is meant | Between midnight and 4 AM, ✓ would complete the wrong recurring instance, and Done today would mismatch `completedDate`. | Use `stagingDay()` for staging comparisons and the instance date. For `completedDate` matching, accept either `day` or the calendar date (TaskNotes writes the calendar date). |
| Keying staged cards by `sessionKey` | The card would be destroyed and rebuilt on start, pause or stop, losing focus and drag state. | Key by normalized path. |
| Pruning `stagedOrder` on a failed or empty read | TaskNotes' cache warm-up returns empty or null, which would wipe the user's order. | Prune only after a successful `listTasks` while the bridge is ready, as `fileCheck`/layoutReady gate PauseStore (`main.ts:96`). |
| A second refresh loop driven by a `setInterval` poll | Wasted reads and drift. | Use bridge hints, the safety resync and the day tick. |

---

## 7. Scaling considerations

| Scale | Concern | Approach |
|-------|---------|----------|
| ~40 tasks (target vault) | none | `listTasks()` per debounced hint is trivial. |
| ~2,000 tasks | `listTasks()` clones every task on each hint, and timer events fire a lot | Skip the StagingStore refresh while no view is open (track view count), and keep the 200 ms debounce. Measure before optimizing. |
| 10k+ tasks | List-and-clone on every `time.*` event | Switch to `query.tasks({ where: <user field> … })` after verifying the user-field query syntax (deferred, not v0.3). |

---

## 8. Suggested build order (dependency-driven)

Phase numbering continues at 4.

1. **Phase 4: Contract, settings and pure staging model** (no UI)
   - Vendored types + bridge methods + fake gateway + contract tests (F1–F5 pinned).
   - `stagingDay.ts`, `staging.ts` (derive, fieldStatus, orderStaged, parse), `settings.ts` additions, the `saveChoice` spread fix, the settings-tab fields, `OWNED_KEYS`/`persistAll`/loaders.
   - *Why first:* everything else consumes these, and all of it can be unit-tested. Verify F2 (null vs delete) and F5 (date snapping) in the dev vault here, because they decide the unstage and recurring designs.
2. **Phase 5: View refactor into tabs (Timers unchanged)**
   - Extract `TaskCard` + `CardList<K>` from TimerPaneView, add the shell with tabs and view-state persistence, move per-tab CSS state, adapt `TaskPickerModal` to options (start mode only).
   - *Why here:* it is a pure refactor guarded by the existing v0.2 tests and UAT, and it isolates regressions before staging adds behavior. It can run in parallel with Phase 4.
3. **Phase 6: Staged tab core** (depends on 4 + 5)
   - StagedOrderStore, StagingStore, StagingController (stage/unstage), picker stage mode, setup notice, idle cards with ▶/✕, render-time join with TimerStore (running cards with elapsed/pause/stop), drag and keyboard order, "staged elsewhere joins at bottom", rename/delete following.
4. **Phase 7: Completion, Done today, rollover** (depends on 6)
   - Generalized `TimerController.completeTask` (recurring branch, idle-card stop safety), StagingController.completeStaged, DoneTodayStore + section, DayClock tick + rollover + days-staged badge, the decision on whether the Timers-tab ✓ also gets the recurring fix.
5. **Phase 8: Mobile ▲▼, rename to "TaskNotes Task Control", release 0.3.0** (depends on 5–7)
   - `Platform.isMobile` buttons in CardList, manifest/display strings, README, BRAT release.

**Ordering rationale:** contract and model first (they unblock everything and carry the two open TaskNotes behaviors). Refactor before features (a regression in v0.2 behavior gets caught on its own). Completion and rollover after the list exists (they need the stores and the record). Release plumbing last.

**Research flags:**
- Phase 4: **needs a dev-vault spike** for F2 (does `{staged: null}` leave `staged:`? Is the `customFrontmatter` delete acceptable?) and F5 (`toggleCompleteInstance` with an off-schedule `day`; behavior with `occurrence_materialization: "on_completion"`).
- Phase 4/6: whether TaskInfo for already-cached tasks picks up a newly registered user field without a cache rebuild (MEDIUM/LOW). If not, the setup notice should say "reload TaskNotes".
- Phase 5: standard patterns, no research needed.
- Phase 7: `Sce()` occurrence snapping and `completedDate` date basis (calendar date vs UTC), verified with a near-midnight test.

---

## 9. Integration points

### External (TaskNotes Runtime API v1)

| Call | Capability | Used by | Gotcha |
|------|-----------|---------|--------|
| `tasks.list()` | tasks.read | StagingStore, picker | Returns clones of every task; filter locally. |
| `tasks.update(path, patch, ctx)` | tasks.write | StagingController | Only registered keys and non-undefined values are written (F1). `null` writes YAML null (F2). |
| `catalog.userFields()` | catalog.read | StagingStore (`fieldStatus`), settings tab | Re-check on `settings.changed`. |
| `catalog.statuses()` | catalog.read | StagingStore (completed filter) | Already used. |
| `recurring.toggleCompleteInstance(path, day, ctx)` | recurring.write | TimerController.completeTask | Toggle; defaults to the scheduled date (F5). |
| `tasks.complete` / `time.start` / `time.stop` / `ui.taskMenu.show` | existing | unchanged | — |
| events `task.updated`, `task.deleted`, lifecycle `settings.changed`/`cache.*` | existing | bridge → both stores | `recurring.instance.completed` doesn't need its own subscription, because `task.updated` covers it. |

### Internal boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| StagedTab ↔ StagingStore + TimerStore | subscribe + `getSnapshot()` | Path join at render time. |
| StagingController ↔ TimerController | direct call (`completeTask`, `start`) | Both use the one WriteQueue. `isBusy()` stays on TimerController, and StagingController increments the same busy counter (pass a shared `busy` callback, or have StagingController call through TimerController for anything that writes time). |
| Stores ↔ main.ts | `persist` callback → `persistAll` | One writer. Add the new keys to `OWNED_KEYS`, or they'll be treated as extras and duplicated. |
| Vault events ↔ path-keyed stores | `renamePath`/`removePath` synchronously, then `requestRefresh` | The same ordering guarantee as PauseStore (D-12). |
| Settings ↔ stores | `getSettings()` closure + `refreshNow` on save | A key change re-derives the whole staged list. The old key's values are left in notes; there's no migration. |

## Sources

- This branch's `src/` (all line references above), `tests/fakes/fakeGateway.ts`, `styles.css`: HIGH
- TaskNotes 4.13.8 bundle, `dev-vault/.obsidian/plugins/tasknotes/main.js`: `wz`/`bz` (user-field map), `dfe`/`Rqe` (frontmatter write/delete), `updateTask`, `completeTask`, `toggleRecurringComplete`, `kM` (recurring default date), `listTasks`, `catalog`: HIGH (code read)
- Upstream `callumalpass/tasknotes` `main` (manifest 4.18.1): `src/api/runtime-api.ts` (`TaskNotesTaskPatch`, `TaskNotesRuntimeRecurringApi`, `TaskNotesRuntimeTaskQuery`, `catalog.userFields`) and `src/types.ts` (`customProperties` on TaskInfo, `customFrontmatter` on TaskCreationData, `complete_instances`, `completedDate`): HIGH
- `.planning/PROJECT.md`, `.planning/research/STAGING-DECISIONS.md`: settled decisions

---
*Architecture research for: v0.3 Staging Tasks (TaskNotes Task Control)*
*Researched: 2026-11-12*
