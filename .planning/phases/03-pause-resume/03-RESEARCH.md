# Phase 3: Pause & Resume - Research

**Researched:** 2026-10-16
**Domain:** Companion-owned pause state over TaskNotes Runtime API v1 (stop/start), Pomodoro-entry hiding, `data.json` persistence
**Confidence:** HIGH for the TaskNotes and Obsidian surfaces (read from the installed 4.13.8 bundle, `obsidian.d.ts` 1.14.4, and this repo's source). MEDIUM for the session-ledger design, which is a recommendation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Pause model with concurrent timers
- **D-01:** **Every running card has its own Pause button**, and any number of tasks can be paused at the same time. Each paused task keeps its own card.
- **D-02:** The header gains **two separate buttons, "Pause all" and "Resume all"**, next to Start task and Stop all. Each is disabled, not hidden, when it would do nothing: Pause all when no regular timer runs, Resume all when nothing is paused. Disabled buttons get an explanatory tooltip, the same pattern as Stop all (Phase 2 D-04).
- **D-03:** **Starting a timer never clears pauses.** Timers run concurrently, so starting task B leaves paused task A paused.
- **D-04:** **Pause all is disabled while Pomodoro ownership can't be read**, the same rule Stop all follows. A bulk action must not risk closing the Pomodoro's hidden entry. Per-card Pause stays available.
- **D-05:** Pause is "stop the entry, remember the pause". Resume is "start a new entry on the same task". Both use `api.time.stop` and `api.time.start` through the existing serial WriteQueue. Pause all and Resume all write one entry at a time, never in parallel (Phase 2 D-05). — **Reversibility:** costly — the persisted pause record format becomes stored user data in `data.json`. Changing it later needs a loader that accepts the old shape.

#### Paused card look and actions
- **D-06:** **Paused cards keep their place in the list**, ordered by start time among the running cards, and only change style: muted, with a "Paused" label. Use the session's first start as the sort key, so a card doesn't jump when it's paused or resumed.
- **D-07:** A paused card shows the **frozen Session value and the task's Total**.
- **D-08:** **After Resume, Session continues from the paused value**, like a stopwatch: the sum of segments since the session first started, excluding paused time. So the pane has to persist the accumulated session time (or equivalent) with each pause. Total is still TaskNotes' tracked total.
- **D-09:** A paused card has **Resume (primary), Stop and Complete**.
  - **Stop** on a paused card ends the pause. The card disappears, and no TaskNotes write is needed because the entry is already closed.
  - **Complete** follows Phase 2 D-13/D-14: set the completed status from settings, then clear the pause. No stop is needed because nothing is running.
- **D-10:** **Stop all also clears every paused card**, so the pane ends up empty. Running timers stop exactly as in Phase 2, skipping the Pomodoro's.

#### When a pause clears
- **D-11:** **If a paused task is started from elsewhere**, for example the status bar, a task card or a command, **treat it as Resume**. The card goes back to running, and Session continues from the paused value.
- **D-12:** **If a paused task is completed elsewhere or deleted, the pause clears.** If the task is renamed or moved, the pause **follows the new path**.
- **D-13:** **Pauses never expire on their own.** There's no midnight or N-hour cutoff. A pause lasts until resumed, stopped, completed, deleted, or taken over by a Pomodoro (D-16).

#### Hiding Pomodoro timers
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

### Deferred Ideas (OUT OF SCOPE)
- **Pane control of Pomodoro**: pause, resume or stop a Pomodoro from its card through `api.pomodoro.pause/resume/stop` (`pomodoro.write`). Possible in TaskNotes 4.13.8. Deferred to a later version by user decision on 2026-10-16.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (REQUIREMENTS.md, verbatim) | Research Support |
|----|-------------|------------------|
| DISP-07 | The timer owned by an active Pomodoro is not shown in the pane. When Pomodoro state can't be read, all timers are shown with a muted note under the header. | §Pomodoro hiding: filter the exact owned entry in `TimerStore.refreshOnce` before `deriveSnapshot`. `ownership.readable === false` drives the note. `getPomodoroOwnedEntryId` already exists. |
| CTRL-02 | User can pause any running timer with one click from its card, or every regular timer from the header ("Pause all"). This closes the entry, and the card shows the task as paused. | §Pause write sequence: `gateway.stop` returns TaskInfo, so the frozen value comes from the closed entry's `endTime`. Pause all copies the `stopAll` loop shape. |
| CTRL-03 | User can resume a paused task with one click from its card, or every paused task from the header ("Resume all"). This opens a new entry on the same task, and the card's session time continues from its paused value. | §Session ledger: `accumulatedMs + (now - segmentStart)`. Resume is `gateway.start`, and the reconcile step turns the record back to running (the same code path as D-11). |
| CTRL-04 | Several tasks can be paused at once, and paused state survives an Obsidian restart. Starting another timer does not clear a pause. A pause clears when its task is resumed, stopped from the pane (including Stop all), completed, deleted, or taken over by a Pomodoro, and follows the task when it is renamed or moved. | §Persistence (merged `data.json`). §Reconcile rules. §Rename/move: Obsidian `vault.on("rename")` is the single authoritative signal, because every TaskNotes move goes through `fileManager.renameFile`. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Use TaskNotes Runtime API v1 only (`app.plugins.getPlugin("tasknotes").api`), never TaskNotes internals. Degrade gracefully if TaskNotes is missing, disabled, too old or reloaded.
- Write time entries only through `api.time.start/stop`. Never write `timeEntries` frontmatter yourself.
- Vanilla Obsidian DOM in `ItemView`, `tntp-` classes, Obsidian CSS variables, no inline styles (obsidianmd lint).
- Register timers with `registerInterval`. Release TaskNotes refs on `unloading`.
- No runtime dependencies. Stack is pinned: TS ~6.0.3, esbuild 0.28.2, ESLint 9, Vitest 5, obsidian 1.14.4. `minAppVersion` 1.12.2.
- Project memory: defer to TaskNotes built-ins and fill only gaps. Archiving is done through a completed-type status, so `archived` must **not** clear or stop anything.
- `workflow.api_coverage_gate: true`: update the COVERAGE.md capability table if new runtime methods are used (`tasks.get` falls under the already-INTEGRATE'd `tasks.read`).

## Summary

TaskNotes 4.13.8 has no pause concept for regular timers. The pane owns pause state. Its own Pomodoro pause uses the same stop-then-new-entry pattern, which confirms the approach. Everything the phase needs is already reachable through public surfaces this repo uses. `time.stop` (returns the updated `TaskInfo`, closing the first open entry), `time.start`, `time.active`, `pomodoro.status`, and the existing event hints. One new read is `api.tasks.get(path)`, which returns `TaskInfo | null` and covers paused tasks, since they no longer appear in `active()`. [VERIFIED: dev-vault/.obsidian/plugins/tasknotes/main.js:3458, `this.tasks={get:e=>this.getTask(e),…`, `async getTask(e){let t=await this.plugin.cacheManager.getTaskInfo(this.normalizeTaskPath(e));return t?cr(t):null}`]

Rename/move: `task.moved` **does** exist in 4.13.8's public event list. It is emitted only when a TaskService update carries an `originalTask` whose path differs. It is **not** emitted for a rename in Obsidian's file explorer, which reaches TaskNotes only as an internal cache `file-renamed` event. All TaskNotes path changes, its own `tasks.move` included, go through `app.fileManager.renameFile` or `vault.rename`. That means Obsidian's public `vault.on("rename", (file, oldPath))` fires in every case. Use that as the only rename signal, and keep `task.moved` out of the contract. Likewise `task.deleted` fires only for TaskNotes' own delete. Obsidian's `vault.on("delete")` covers every deletion. [VERIFIED: main.js:3458 normalizeUpdatedEvent; main.js:433 handleFileRenamed; main.js:3458 moveTask → `fileManager.renameFile(i,o)`]

The core design question is race-safe reconciliation. Make pause state a small **session ledger** held by a plugin-scoped `PauseStore`. Merge it into the existing `TimerStore.refreshOnce`, which reconciles idempotently from observed TaskNotes data on every refresh. External start becomes resume, Pomodoro takeover clears the pause, completion clears it, a vanished entry clears it, a missing file clears it. Explicit pane actions (pause, stop-paused, stop all, complete-paused) mutate the ledger directly inside the WriteQueue. A ledger **revision counter** prevents a refresh whose reads started before a ledger mutation from applying stale conclusions. Mutation-context tagging is kept for attribution, but no logic depends on it.

**Primary recommendation:** Add `src/model/pauseLedger.ts` with pure record types, a `loadPauseRecords` validator and a `reconcile()` function, plus `src/state/PauseStore.ts` for in-memory records, the revision counter and serialized merged persistence. Extend `TimerStore.refreshOnce` to hide the Pomodoro entry, read paused tasks through `gateway.getTask`, reconcile, and derive a snapshot that includes paused cards. Add `pause/resume/pauseAll/resumeAll/stopPaused` to `TimerController` in the existing outcome-object shape.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pause/resume writes | `TimerController` (inside WriteQueue) | `TaskNotesBridge` → `api.time.stop/start` | Same seam as Stop/Start. TaskNotes keeps entry format, locking and status bar sync. |
| Pause records (stored data) | `PauseStore` (plugin-scoped) | Obsidian `loadData/saveData` (`data.json`) | Must outlive the view (Pitfall 5) and share the file with settings. |
| Reconcile (D-11, D-12 completed/deleted, D-16) | Pure `reconcile()` in `src/model/pauseLedger.ts`, called from `TimerStore.refreshOnce` | — | Data-driven and idempotent, so it is testable without Obsidian. |
| Rename/delete follow (D-12) | `main.ts` vault `rename`/`delete` handlers → `PauseStore.renamePath/removePath` | `TimerStore.requestRefresh` | Obsidian events are the only complete signal (see Summary). |
| Pomodoro hiding (D-14/15) | `TimerStore.refreshOnce` (filter before `deriveSnapshot`) | `pomodoroOwnership.ts` | Counts, cards and bulk targets all derive from one filtered list. |
| Paused/running card UI, header buttons, Pomodoro note | `TimerPaneView` | `styles.css` | View renders store state only. |
| Picker "Pomodoro" tag (D-17) | `TaskPickerModal` | `gateway.pomodoroOwnership()` at open | Read once per opening, like the task list. |

## Standard Stack

No new packages. Everything uses the existing pinned stack and public APIs. [VERIFIED: package.json:18-30]

| Surface | Exact API | Source |
|---|---|---|
| Stop and get closed entry | `api.time.stop(path, context): Promise<TaskInfo>` closes the **first** entry without `endTime`, and rejects with `"No active time tracking session for this task"` if none | [VERIFIED: main.js:3458 `stopTime`; main.js:587 `stopTimeTrackingLocked`: `c=(m=l.timeEntries)==null?void 0:m.find(f=>!f.endTime);if(!c)throw new Error("No active time tracking session for this task")`] |
| Start | `api.time.start(path, {}, context)` (already vendored and used) | src/tasknotes/runtime-api.types.ts:134 |
| Read one task | `api.tasks.get(path): Promise<TaskInfo \| null>`. Null when not found, not a task, excluded or not yet cached. Capability `tasks.read` | [VERIFIED: main.js:3458, quoted above] |
| Pomodoro ownership | `api.pomodoro.status()` → `getPomodoroOwnedEntryId` (existing) | src/model/pomodoroOwnership.ts:20-33 |
| Persistence | `Plugin.loadData(): Promise<any>`, `Plugin.saveData(data: any): Promise<void>`, optional `onExternalSettingsChange?()` (@since 1.5.7) | [VERIFIED: node_modules/obsidian/obsidian.d.ts:7338, 7347, 7367] |
| Rename/delete | `vault.on('rename', (file: TAbstractFile, oldPath: string) => any)`, `vault.on('delete', (file: TAbstractFile) => any)` | [VERIFIED: obsidian.d.ts:10445, 10451] |
| File existence | `vault.getFileByPath(path): TFile \| null` (@since 1.5.7) | [VERIFIED: obsidian.d.ts:10212] |

## Package Legitimacy Audit

No external packages are installed in this phase. Not applicable.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 user click (card Pause/Resume/Stop/Complete, header Pause all/Resume all/Stop all)
        │
        ▼
 TimerController ──queue.run──► [fresh reads: active(), pomodoroOwnership()]
        │                              │
        │                              ▼
        │                       gateway.stop / gateway.start  ──► TaskNotes api.time.*
        │                              │                              │ (emits task.updated,
        ▼                              ▼                              │  time.started/stopped)
 PauseStore.apply(mutation) ◄── closed entry endTime from returned TaskInfo
   (revision++, persist merged data.json via serial save chain)
        │                                                             │
        ▼                                                             ▼
 TimerStore.refreshOnce ◄──── data hints (bridge onData) / vault rename|delete / 45 s resync
   1. rev0 = pauseStore.revision
   2. active(), pomodoroOwnership(), getTask(p) for each paused p, statuses()
   3. if pauseStore.revision !== rev0 → dirty, loop again
   4. reconcile(records, observations) → record changes → pauseStore.apply
   5. hide owned entry → deriveSnapshot(running + paused) → signature → notify
        │
        ▼
 TimerPaneView.render: cards (running / paused), header enablement, Pomodoro note
```

### Recommended file layout

```
src/model/pauseLedger.ts      # NEW: record types, loadPauseRecords (validate), reconcile(), sessionMs helpers (pure)
src/state/PauseStore.ts       # NEW: in-memory records, revision, subscribe, serial merged save, rename/remove by path
src/settings.ts               # loadSettings unchanged; add a PersistedData merge helper (or keep in PauseStore)
src/model/timeMath.ts         # OpenTimer gains state ("running"|"paused"), sortMs, accumulatedMs, segmentStartMs
src/state/TimerStore.ts       # refreshOnce: hide owned entry, read paused tasks, reconcile, new getHeaderState()
src/state/TimerController.ts  # pause, resume, pauseAll, resumeAll, stopPaused; stopAll clears paused; complete handles paused
src/tasknotes/TaskNotesBridge.ts  # getTask(path); stop() returns TaskInfo
src/tasknotes/runtime-api.types.ts # tasks.get?(path): Promise<TaskInfo | null>; stop return already TaskInfo
src/ui/TimerPaneView.ts       # Pause/Resume buttons, paused styling, 4-button header, Pomodoro note
src/ui/TaskPickerModal.ts     # Pomodoro tag on owner row
src/main.ts                   # PauseStore wiring; vault rename/delete pass paths; merged saveSettings
```

### Pattern 1: Session ledger record (the stored data, D-05 "costly")

Recommended shape. This is my recommendation, not a locked decision. Keep `data.json` flat so the existing `{ completionStatus }` loads unchanged and no migration is needed:

```ts
// data.json: { "completionStatus": string|null, "pauseRecordsVersion": 1, "pauseRecords": PauseRecord[] }
interface PauseRecordBase {
  taskPath: string;          // normalizeTimerPath()-normalized
  title: string;             // last known title, fallback display if tasks.get returns null
  sessionStartedAt: string;  // ISO; start of the session's FIRST entry; D-06 sort key
  accumulatedMs: number;     // sum of closed segments in this session (>= 0, finite)
}
type PauseRecord =
  | (PauseRecordBase & { state: "paused"; pausedAt: string; lastEntryStart: string })
  | (PauseRecordBase & { state: "running"; entryStart: string }); // resumed: continuing session
```

- A **running** record exists only after a resume, so that Session can continue (D-08) across restarts. A running timer that was never paused has no record and keeps Phase 1 behaviour: Session is `now - entry.startTime`, sorted by `entry.startTime`.
- Session value: paused → `accumulatedMs`. Running with record → `accumulatedMs + max(0, now - entryStartMs)`. Computed from timestamps, never counted ticks (Pitfall 8).
- `lastEntryStart` lets reconcile reject a stale `active()` read that still shows the just-closed entry (see Pitfall 1).
- Version the key (`pauseRecordsVersion: 1`) so a later shape change can write a loader that accepts v1 (D-05 reversibility note).
- `loadPauseRecords(data: unknown)` validates each field like `getPomodoroOwnedEntryId` does. It drops malformed records, never throws, dedupes by normalized path (keep the newest), and clamps `accumulatedMs` to a finite value ≥ 0.

**Alternative considered:** derive Session from TaskNotes' own entries, i.e. the sum of the task's entries with `startTime >= sessionStartedAt`. That stores less, but it pulls in hand-added or edited entries and entries from other devices. Use the explicit `accumulatedMs` that CONTEXT suggests.

### Pattern 2: Reconcile rules (pure, idempotent)

`reconcile(records, obs)`, where `obs = { active (owned entry NOT yet removed), ownership, tasks: Map<path, TaskInfo|null>, completedStatuses: Set<string> | null }`. Apply the rules per record in this order:

1. **Pomodoro takeover (D-16):** `ownership.readable && ownership.owner && normalize(owner.taskPath) === record.taskPath` → delete the record. Check this before rule 2, because a Pomodoro start creates an open entry on the paused path that would otherwise read as "external start = resume".
2. **Paused + open non-owned entry on the same path whose `startTime !== lastEntryStart`** → becomes `running` with `entryStart = that startTime` (D-11; also how the pane's own Resume lands). If ownership is unreadable, still convert. The entry is visible anyway (D-15).
3. **Running record + no open entry with `startTime === entryStart` on that path** → delete. The entry was stopped by the pane's Stop, an external stop, Stop all or auto-stop-on-complete. The pane's own Pause does not hit this rule because it replaces the record with `paused` inside the queue before any refresh can apply (Pattern 3).
4. **Completed elsewhere (D-12):** `completedStatuses !== null && tasks.get(path)?.status ∈ completedStatuses` → delete (paused records only; a running record is handled by rule 3 or stays, as in Phase 2). Never clear on `archived` (project memory).
5. **Deleted (D-12):** don't treat `tasks.get → null` as deletion, because it is also null while TaskNotes' cache is warming. Clear only on a vault `delete` event for the path, or when `vault.getFileByPath(path) === null` once the layout is ready (this catches deletes made while Obsidian was closed, e.g. via Sync). Inject `fileExists(path)` into the store, so the reconcile stays pure.

Reconcile returns `{ next: PauseRecord[], changed: boolean }`. Persist only if `changed`.

### Pattern 3: Pause write sequence (inside `queue.run`)

```ts
// TimerController.pause(target: StopTarget) — sketch, names follow existing controller
await queue.run(async () => {
  const active = await gateway.active();
  const own = await gateway.pomodoroOwnership();            // per-card pause allowed even if unreadable (D-04)
  const open = active.find(a => !a.entry.endTime && sameEntry({ taskPath: a.taskPath, startTime: a.entry.startTime }, target));
  if (!open) return "already-stopped";
  if (own.readable && own.owner && sameEntry(own.owner, target)) return "pomodoro";   // hidden entry; defensive
  const prior = pauseStore.get(target.taskPath);             // running record if this is a resumed session
  const rev = pauseStore.beginPending(target.taskPath);      // reconcile must not run rule 3 for this path meanwhile
  try {
    const task = await gateway.stop(target.taskPath, { source: MUTATION_SOURCE, reason: "user pause", correlationId: newCorrelationId() });
    const closed = task.timeEntries?.find(e => e.startTime === target.startTime && e.endTime);
    const endMs = parseMs(closed?.endTime) ?? Date.now();
    const segment = Math.max(0, endMs - Date.parse(target.startTime));
    pauseStore.set({ state: "paused", taskPath, title, lastEntryStart: target.startTime,
      sessionStartedAt: prior?.sessionStartedAt ?? target.startTime,
      accumulatedMs: (prior?.accumulatedMs ?? 0) + segment, pausedAt: new Date(endMs).toISOString() });
  } finally { pauseStore.endPending(rev); }
});
```

- `gateway.stop` must change from `Promise<void>` to returning the `TaskInfo` (the vendored type already says `Promise<TaskInfo>`). Fall back to `Date.now()` if the entry can't be found.
- "No active session" on stop → benign, so don't create a pause record (the task was stopped by someone else). Any other error → Notice, no record.
- **Resume** = re-read inside the queue. If the Pomodoro owner path equals the record path, show the D-17 notice and write nothing. If a non-owned open entry already exists, do nothing (reconcile converts it). Otherwise call `gateway.start`. Don't touch the record in the controller; the following `store.refreshNow()` converts it through rule 2. If start fails, the record stays paused.
- **Stop on paused card** = `pauseStore.remove(path)` through the queue (no TaskNotes write, D-09). **Stop all** = the existing loop, then `pauseStore.clearAll()` (D-10). Running records disappear through rule 3. Keep its "ownership unreadable → abort" behaviour, and clear paused records even then? The CONTEXT does not say. The recommendation is to clear paused records only when the bulk stop ran. **Complete on paused card** = the existing `complete()` path (its "still-open?" check already skips the stop when nothing is open), then `pauseStore.remove(path)` once the status is written. A partial outcome is impossible because there is no stop.
- **Pause all**: copy `stopAll`'s structure (fresh `active()` + `pomodoroOwnership()` before each target, abort when unreadable, skip vanished targets, count `paused/skipped/failed`, one summary Notice, refresh in `finally`). **Resume all**: iterate a snapshot of paused records in order, with a per-target fresh check, sequentially.

### Pattern 4: Persistence, merged and serialized

Today `saveSettings` calls `this.saveData(settings)`, which would wipe pause records, and `PauseStore` saves would wipe settings. [VERIFIED: src/main.ts:55-60] Use one owner of the file contents:

```ts
// main.ts
let persisted = { completionStatus: null, pauseRecordsVersion: 1, pauseRecords: [] };   // last loaded/written object
let saveChain = Promise.resolve();
const persist = () => (saveChain = saveChain.then(() => this.saveData({
  ...persistedExtras,                       // unknown keys from load, preserved
  completionStatus: this.paneSettings.completionStatus,
  pauseRecordsVersion: 1,
  pauseRecords: pauseStore.serialize(),
})).catch(e => log("Saving timer pane data failed: " + String(e))));
```

- Load once in `onload` (`settingsReady`): `loadSettings(data)` + `loadPauseRecords(data)`. Neither reads the other's keys, so old `data.json` files (`{completionStatus}` only) load with zero pauses.
- Every save writes the **full** current object from memory. Chain the saves so two `saveData` calls never overlap. This is a separate chain from WriteQueue, so data.json writes never block TaskNotes writes.
- Reconcile must not run on records until `settingsReady` resolves. Otherwise an early refresh could see "no records" and a later load would resurrect stale ones. Gate: `TimerStore` awaits `pauseStore.ready()` inside `refreshOnce`.
- Optional: `onExternalSettingsChange()` (Obsidian Sync changed data.json) → reload settings + records, then refresh. Cheap, and it keeps two devices consistent. Recommended.

### Pattern 5: Pomodoro hiding + note (D-14/D-15)

In `refreshOnce`, after reading `active` and `ownership`:
`visible = ownership.readable && ownership.owner ? active.filter(a => !sameEntry({taskPath:a.taskPath,startTime:a.entry.startTime}, ownership.owner)) : active`.
Derive the snapshot, `eligibleCount` and Pause-all targets from `visible` (Stop all already excludes the owner through `selectRegularStopTargets`). Expose `getHeaderState(): { readable, runningRegular, pausedCount }` and include `pausedCount` and the ledger signature in the store signature, so header enablement re-renders on ledger-only changes. That gap is the same one Phase 2 found for ownership. [VERIFIED: src/state/TimerStore.ts:130-136]

Note: if TaskNotes lacks `pomodoro.read`, ownership is permanently `{readable:false}` (bridge catches the error). [VERIFIED: src/tasknotes/TaskNotesBridge.ts pomodoroOwnership] In that case the muted note shows permanently and Stop all and Pause all stay disabled. That is consistent with D-15 and D-04, but call it out in the verification.

### Pattern 6: Rename/move (D-12)

```ts
this.registerEvent(this.app.vault.on("rename", (file, oldPath) => { pauseStore.renamePath(oldPath, file.path); store.requestRefresh(); }));
this.registerEvent(this.app.vault.on("delete", file => { pauseStore.removePath(file.path); store.requestRefresh(); }));
```

`renamePath` and `removePath` match the exact normalized path **and** the `oldPath + "/"` prefix, which covers folder renames and deletes. If Obsidian also fires per-child events, they become no-ops after the prefix pass. The handler must update the record synchronously, before TaskNotes' cache re-indexes and before the next refresh reads `active()` under the new path. Otherwise rule 3 would delete a running record. The revision bump from `renamePath` also forces any in-flight refresh to loop again.

Limitation: a rename that happens while Obsidian is closed, for example via Sync from another device, can't be followed. The paused record then fails rule 5 (file missing) and clears. An optional fallback: a running record with no match on its path but an open entry with the same `entryStart` on another path → rebind. Document this as accepted degradation.

### Anti-Patterns to Avoid
- **Clearing a pause on `tasks.get → null`**: it's null during TaskNotes' cache warm-up after restart, which would silently wipe every pause on launch.
- **Relying on `task.moved`/`task.deleted` events**: they miss explorer renames and deletes (see Summary).
- **Recomputing the frozen value with tick counters or from `pausedAt - sessionStartedAt`**: that includes earlier paused gaps. Always accumulate closed segments.
- **Holding pause state in the View**: it's lost on pane close (Pitfall 5). Keep it in the plugin-scoped `PauseStore`.
- **Parallel `saveData` or settings-only saves**: they lose one half of data.json.
- **Treating `archived` as completion**: user memory says archive is done through a completed status only.
- **Using mutation-context echoes for state logic**: payloads are `unknown` in the vendored contract, and metadata-cache updates carry no context. Data-driven reconcile is sufficient.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Closing/opening entries | frontmatter edits | `api.time.stop/start` | Per-path lock, field mapping, status bar sync |
| Pomodoro entry identity | session-start comparisons | existing `getPomodoroOwnedEntryId` / `sameEntry` | Exact `timeTrackingStartTime` token (Phase 2 research) |
| Rename tracking | polling/diffing task lists | `vault.on("rename", (file, oldPath))` | Fires for every TaskNotes move path |
| Write serialization | new locks | existing `WriteQueue` (TaskNotes writes) + one promise chain (data.json) | Already proven; survives rejection |
| Error classification | string parsing beyond existing | `isNoActiveSessionError`, `gateway.normalizeError` | Existing benign-race handling |

## Runtime State Inventory

Not a rename/refactor phase. The one runtime-state concern is new stored data: `data.json` gains `pauseRecordsVersion` and `pauseRecords`. Existing files load unchanged. Nothing else is registered with the OS, services or secrets.

## Common Pitfalls

### Pitfall 1: Stale refresh resurrects or deletes records
**What goes wrong:** A refresh read `active()` while the paused entry was still open, then applies after Pause wrote the paused record. Rule 2 treats that entry as an external start and flips the card back to running. Or a refresh that read before the resume start applies rule 3 to a just-converted record.
**How to avoid:** (a) the ledger `revision` is captured before reads; on mismatch set `dirty` and loop (the existing `runRefreshLoop` already supports it); (b) `lastEntryStart` guard in rule 2; (c) pending-path set during an in-flight Pause blocks rule 3 for that path.
**Warning signs:** Card flickers paused→running→paused in tests that interleave `emitData()` with a deferred `stop`.

### Pitfall 2: Pause records wiped at startup
**What goes wrong:** Records are read before TaskNotes is ready, or deletion is inferred from `tasks.get` returning null.
**How to avoid:** Show nothing until the bridge is `ready` (the existing snapshot-null → loading). Gate deletion on vault events or `getFileByPath` after `onLayoutReady` only.

### Pitfall 3: Paused-only pane shows "No task is being timed"
`derivePaneState` returns `idle` when `snapshot.primary` is null, and `currentTimers()` returns no cards. [VERIFIED: src/model/timeMath.ts derivePaneState; src/ui/TimerPaneView.ts currentTimers] Paused cards must count as cards: rename the meaning of "running" state to "has cards", or add the paused list to the snapshot and adjust `derivePaneState`. Update the `tntp-pane--running` CSS rule accordingly.

### Pitfall 4: Card key changes on pause/resume
`timerKey = taskPath + startTime`. A resume creates a new entry startTime, so the card would be rebuilt, losing focus and causing a title re-render flash. Key cards that have a ledger record by `taskPath + sessionStartedAt`, and others by `taskPath + startTime`. When a never-paused timer first pauses, `sessionStartedAt === startTime`, so the key is stable across the whole cycle.

### Pitfall 5: Sort order jumps (D-06)
`compareTimers` sorts by `startMs` descending. [VERIFIED: src/model/timeMath.ts compareTimers] Add `sortMs = sessionStartedAt ?? startMs` and sort by that. The `primary/others` split also exists; check whether anything still needs "primary" (the `othersTooltip`/`moreRunningLabel` helpers look Phase 1-legacy).

### Pitfall 6: Pomodoro takeover vs external-start ambiguity
If ownership is unreadable at the moment a Pomodoro starts on a paused task, rule 2 converts the record to running, and Session continues the old value. Once ownership is readable again, the open entry is owned. So also add: a **running** record whose `entryStart` matches the owner → delete (D-16) and hide the card.

### Pitfall 7: Resume after a Pomodoro paused on the same task
TaskNotes' `pausePomodoro` stops its owned entry and sets `isRunning=false`. [VERIFIED: main.js:3458 pausePomodoro] `getPomodoroOwnedEntryId` then reports `owner: null`, so the picker can't mark that task and a pane Start/Resume on it is allowed. A later Pomodoro resume can then hit "already active" and lose ownership (PITFALLS §12). This is an edge case. See Open Question 1.

### Pitfall 8: Header overflow
There are four buttons in a narrow sidebar. Use a wrapping flex row (`flex-wrap: wrap; gap: var(--size-4-2)`) with text labels, and keep `setTooltip` explanations. Icon-only buttons hurt clarity. This is a discretion area.

## Code Examples

### Vendored contract additions
```ts
// runtime-api.types.ts — tasks namespace
readonly tasks?: {
  list(): Promise<TaskInfo[]>;
  get?(path: string): Promise<TaskInfo | null>;   // 4.13.8: cacheManager.getTaskInfo → null if absent
  complete?(path: string, options?: CompleteTaskOptions, context?: TaskNotesMutationContext): Promise<TaskInfo>;
};
```
Add a matching pin in `tests/contract.test.ts`, and update the gateway `stop` signature to `Promise<TaskInfo>`. The bridge `getTask(path)` follows the `listTasks` pattern (`featureApi("tasks.read","tasks.get", …)` plus a re-check that the api is still connected after the await).

### Sequencing a refresh with the ledger
```ts
private async refreshOnce(): Promise<void> {
  if (this.disposed || this.gateway.getState().kind !== "ready") return;
  await this.pauses.ready();
  const generation = this.generation, rev = this.pauses.revision;
  const active = await this.gateway.active();
  const ownership = await this.safeOwnership();
  const tasks = new Map<string, TaskInfo | null>();
  for (const r of this.pauses.records()) tasks.set(r.taskPath, await this.safeGetTask(r.taskPath)); // sequential, small N
  const completed = await this.safeCompletedStatuses();          // null on failure → rule 4 skipped
  if (stale(generation) ) return;
  if (this.pauses.revision !== rev) { this.dirty = true; return; } // re-loop with fresh reads
  this.pauses.applyReconcile(reconcile(this.pauses.records(), { active, ownership, tasks, completed, fileExists: this.fileExists }));
  /* hide owned entry, derive snapshot incl. paused cards, signature (+ledger), notify */
}
```

## State of the Art

| Old (pre-discussion) | Current (CONTEXT 2026-10-16) | Impact |
|---|---|---|
| Single paused task; any start clears it (PITFALLS §5) | Many pauses, starts never clear (D-01/D-03) | Ledger is a list keyed by path |
| Label Pomodoro timer, hide its Pause (DISP-07/CTRL-08) | Hide the Pomodoro entry entirely (D-14) | Filter in the store, not the view |
| Follow renames via `task.moved` (PITFALLS §5) | Obsidian `vault.on("rename")` | `task.moved` misses explorer renames |
| Session restarts at 0 after resume | Stopwatch semantics (D-08) | `accumulatedMs` persisted |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | When a folder is renamed or deleted, Obsidian may emit `rename`/`delete` for the folder and/or for each child file. The prefix-match handler covers both. | Pattern 6 | Low: prefix handling is idempotent either way. |
| A2 | `vault.getFileByPath` is reliable for "file truly gone" once `onLayoutReady` has fired. | Pattern 2 rule 5 | A pause could clear on launch for a file that still exists. Verify manually after a restart. |
| A3 | Clearing paused records on Stop all should happen even when the regular-stop loop aborted because ownership is unreadable. | Pattern 3 | UX choice. Recommendation: clear only when the stop loop ran. Confirm with the user or planner. |
| A4 | `saveData` completes before Obsidian quits, so a pause just before quit is persisted. | Pattern 4 | A pause made in the final moment may be lost (the entry stays closed and the card simply disappears). Low impact. |

## Open Questions

1. **Paused Pomodoro on a task (Pitfall 7).** Should D-17's picker tag and the Resume notice also apply when the Pomodoro work session is *paused* (`isRunning=false`, `currentSession.taskPath` set)? `getPomodoroOwnedEntryId` returns `owner:null` then. Recommendation: extend `Ownership` with a separate `pomodoroTaskPath` (the work session's task while not completed or interrupted, running or paused). Use it for the picker tag and the resume guard only, never for hiding.
2. **Stop all when ownership is unreadable:** should it still clear paused cards? (A3)
3. **Deletion while closed vs rename while closed:** these are indistinguishable at load, and both clear the record. Is that acceptable? Recommendation: yes, and note it in the verification.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node | build/test | ✓ | v24.13.1 | — |
| Vitest | tests | ✓ | 5.0.4 (216 tests passing at baseline) | — |
| TaskNotes in dev vault | manual verification incl. live Pomodoro | ✓ | 4.13.8 bundle present | — |

## Validation Architecture

`workflow.nyquist_validation` is false, so this section is brief. Extend the existing fakes:
- `tests/fakes/fakeGateway.ts`: add `getTask` (fixture map), make `stop` resolve a TaskInfo with the closed entry, add a settable `pomodoroOwnership`, record `startCalls`, and add a deferred-stop hook to interleave `emitData()` (Pitfall 1).
- New `tests/pauseLedger.test.ts` (pure): load/validate (malformed, duplicates, old `{completionStatus}`-only data), each reconcile rule and its ordering (D-16 before D-11), `lastEntryStart` guard, session math across pause/resume/restart.
- `tests/controller.test.ts`: pause/resume/pauseAll/resumeAll/stopPaused/stopAll-clears/complete-paused, Pomodoro notice, sequential writes (assert call order), benign no-active-session.
- `tests/store.test.ts`: owned entry hidden from cards and counts, unreadable → all shown + flag, revision re-loop, paused-only snapshot is not idle.
- `tests/main.test.ts`: merged save preserves both halves, rename/delete path remap including folder prefix.
- Manual (dev vault): restart persistence, external start from the status bar = resume, explorer rename and move, live Pomodoro start on a paused task, picker tag.

Commands: `npm test` (quick and full), `npm run check` (phase gate).

## Security Domain

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2/V3 Authentication/Session | no | — |
| V4 Access Control | yes (capability gating) | `featureApi` capability + callable checks, fail closed on unknown Pomodoro ownership for bulk actions |
| V5 Input Validation | yes | `loadPauseRecords` validates untrusted `data.json` (Sync/hand-edit): types, finite numbers, parseable ISO, normalized paths; drop rather than throw. Task titles rendered with `setText` only |
| V6 Cryptography | no | `crypto.randomUUID` for correlation IDs only (existing) |
| V11 Business logic | yes | Serial writes, exact entry identity, revision-guarded reconcile, honest partial-failure Notices |

| Threat | STRIDE | Mitigation |
|---|---|---|
| Tampered data.json pauses a path outside tasks | Tampering | Records only drive Resume → `api.time.start`, which TaskNotes validates (`requireTask` → `task_not_found`); notice and clear on that code |
| Bulk action closes the Pomodoro entry | Tampering | Pause all disabled when unreadable; per-target re-check of owner before each stop |
| Race with external actors on path-only `time.stop` | Tampering | Re-read just before each write; documented non-atomic limit (Phase 2) |

## Sources

### Primary (HIGH)
- `dev-vault/.obsidian/plugins/tasknotes/main.js` (TaskNotes 4.13.8 bundle): runtime `tasks`/`time`/`pomodoro` namespaces, the event list `ewe` (includes `task.moved`), `normalizeUpdatedEvent`, `normalizeDeletedEvent`, `buildEventPayloadBase`, cache `handleFileRenamed`/`handleFileDeleted`, `moveTask`, `stopTimeTrackingLocked`, `pausePomodoro`, capability array `Xbe`.
- `node_modules/obsidian/obsidian.d.ts` 1.14.4: `loadData`, `saveData`, `onExternalSettingsChange`, `Vault.on('rename'|'delete')`, `getFileByPath`.
- Repo source read this session: `src/main.ts`, `src/settings.ts`, `src/state/{TimerStore,TimerController,WriteQueue}.ts`, `src/model/{timeMath,pomodoroOwnership,taskPicker}.ts`, `src/tasknotes/{TaskNotesBridge,runtime-api.types}.ts`, `src/ui/{TimerPaneView,TaskPickerModal}.ts`, `tests/fakes/fakeGateway.ts`, `tests/contract.test.ts`.
- `.planning/phases/02-start-switch-complete/02-RESEARCH.md` §Exact Pomodoro ownership; `.planning/research/PITFALLS.md` §5, §12.

## Metadata

**Confidence breakdown:**
- TaskNotes/Obsidian surfaces: HIGH, read directly from the installed bundle and the typings
- Ledger and reconcile design: MEDIUM, a recommended design that is consistent with the existing store patterns
- Pitfalls: HIGH for races grounded in the current code; MEDIUM for the Pomodoro edge cases

**Research date:** 2026-10-16
**Valid until:** 2026-11-15 (or until TaskNotes changes from 4.13.8)
