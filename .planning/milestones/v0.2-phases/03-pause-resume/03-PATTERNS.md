# Phase 3: Pause & Resume - Pattern Map

**Mapped:** 2026-10-16
**Files analyzed:** 18 (2 new source, 10 modified source, 6 tests)
**Analogs found:** 18 / 18 (all analogs are git-tracked; no mirror paths)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/model/pauseLedger.ts` (NEW) | model (pure) | transform / validation | `src/model/pomodoroOwnership.ts` + `src/settings.ts` (`loadSettings`) | exact (pure validator + selector) |
| `src/state/PauseStore.ts` (NEW) | store | event-driven + file-I/O | `src/state/TimerStore.ts` (subscribe/notify) + `src/state/WriteQueue.ts` (promise chain) | role-match |
| `src/settings.ts` | config | file-I/O | itself (`loadSettings`) | exact |
| `src/model/timeMath.ts` | model | transform | itself (`OpenTimer`, `deriveSnapshot`, `compareTimers`, `snapshotSignature`, `derivePaneState`) | exact |
| `src/state/TimerStore.ts` | store | request-response (read) + event-driven | itself (`refreshOnce`, `getStopAllState`) | exact |
| `src/state/TimerController.ts` | controller | request-response (write, queued) | itself (`stopAll`, `start`, `stop`, `complete`) | exact |
| `src/tasknotes/TaskNotesBridge.ts` | service (gateway) | request-response | itself (`listTasks`, `stop`) | exact |
| `src/tasknotes/runtime-api.types.ts` | types | contract | itself (`tasks` namespace, line 128) | exact |
| `src/ui/TimerPaneView.ts` | component | event-driven render | itself (`onOpen` header, `buildCard`, `render`, `reconcileCards`) | exact |
| `src/ui/TaskPickerModal.ts` | component | request-response | itself (`renderSuggestion`, `onChooseSuggestion`) | exact |
| `src/main.ts` | config / wiring | file-I/O + event-driven | itself (`settingsReady`, `saveSettings`, vault events lines 77-78) | exact |
| `styles.css` | config (CSS) | n/a | itself (`.tntp-header` line 184, `.tntp-pane--running` lines 10-11, muted rule line 57) | exact |
| `tests/pauseLedger.test.ts` (NEW) | test | pure | `tests/settings.test.ts` / pomodoro ownership tests | role-match |
| `tests/controller.test.ts` | test | — | itself | exact |
| `tests/store.test.ts` | test | — | itself | exact |
| `tests/main.test.ts` | test | — | itself (`host.data`, `host.saved`) | exact |
| `tests/contract.test.ts` | test | contract pin | itself | exact |
| `tests/fakes/fakeGateway.ts` | test fake | — | itself (`stopCalls`, `stopFailure`) | exact |

## Pattern Assignments

### `src/model/pauseLedger.ts` (NEW; model, transform/validation)

**Analog:** `src/model/pomodoroOwnership.ts` (44 lines). Runtime Obsidian-free, imports types only.

**Imports / reuse** (line 1, 3-12): reuse, do not duplicate.
```ts
import type { ActiveTimeEntry } from "../tasknotes/runtime-api.types";
export type EntryId = { taskPath: string; startTime: string };
export type Ownership = { readable: true; owner: EntryId | null } | { readable: false };
export function normalizeTimerPath(path: string): string { ... }
export function sameEntry(a: EntryId, b: EntryId): boolean { ... }
```
Import `normalizeTimerPath`, `sameEntry`, `Ownership` from `./pomodoroOwnership`; `parseMs` from `./timeMath`.

**Untrusted-input guards to copy** (lines 13-18). They are module-private in the analog, so either export them from `pomodoroOwnership.ts` or copy them:
```ts
function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function timestamp(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}
```

**Validator shape: drop, never throw.** Copy from `src/settings.ts` lines 7-11:
```ts
export function loadSettings(data: unknown): TimerPaneSettings {
	if (!data || typeof data !== "object" || Array.isArray(data)) return { ...DEFAULT_SETTINGS };
	const value = (data as Record<string, unknown>).completionStatus;
	return { completionStatus: typeof value === "string" ? value : null };
}
```
`loadPauseRecords(data: unknown): PauseRecord[]` follows the same pattern. Read only `pauseRecordsVersion` and `pauseRecords`, return `[]` for non-objects, drop malformed entries, dedupe by `normalizeTimerPath` and keep the newest, and clamp `accumulatedMs` to a finite value >= 0. Record shape: RESEARCH Pattern 1.

**Selector style for `reconcile()`.** Copy from `selectRegularStopTargets` (lines 35-44): a single loop with early `continue`, `sameEntry` for identity, and return a new array:
```ts
export function selectRegularStopTargets(active: readonly ActiveTimeEntry[], ownership: Ownership): EntryId[] {
	if (!ownership.readable) return [];
	const targets: EntryId[] = [];
	for (const item of active) {
		const id = { taskPath: item.taskPath, startTime: item.entry.startTime };
		if (item.entry.endTime || !timestamp(id.startTime) || (ownership.owner && sameEntry(id, ownership.owner)) || targets.some(previous => sameEntry(previous, id))) continue;
		targets.push(id);
	}
	return targets;
}
```
Rule order: RESEARCH Pattern 2. Apply D-16 takeover first, plus Pitfall 6 (a running record whose entry is owned gets deleted). `reconcile()` returns `{ next, changed }`. Inject `fileExists` through the observations object so the function stays pure.

---

### `src/state/PauseStore.ts` (NEW; store, event-driven + persistence)

**Analog 1: listener set and safe notify.** `src/state/TimerStore.ts`, the `subscribe` excerpt at view lines 59-64 and `notify` at lines 168-176 (file lines ~59-64 and ~168-176):
```ts
subscribe(listener: () => void): () => void {
	this.listeners.add(listener);
	return () => { this.listeners.delete(listener); };
}
private notify(): void {
	for (const listener of [...this.listeners]) {
		try { listener(); } catch (error) { this.log("Timer listener failed: " + errorMessage(error)); }
	}
}
```
**Analog 2: a serial chain that never breaks.** `src/state/WriteQueue.ts` lines 7-22. Use the same `tail = result.then(() => undefined, () => undefined)` idiom for the serialized `saveData` chain. Keep this chain separate from the TaskNotes WriteQueue (RESEARCH Pattern 4).

Runtime Obsidian-free, like TimerStore and WriteQueue. Take `persist: (records) => Promise<void>` and `log` as constructor deps, the way `TimerStoreDeps` takes `gateway`, `log` and `schedule`. Expose: `ready()`, `revision`, `records()`, `get(path)`, `set`, `remove`, `clearAll`, `renamePath(old, new)` (exact path plus `old + "/"` prefix), `removePath`, `applyReconcile`, `serialize()`, `beginPending/endPending`.

---

### `src/settings.ts` (config, file-I/O)

Leave `loadSettings` unchanged (it ignores unknown keys, so old `{completionStatus}` data loads). If a `PersistedData` merge helper goes here, mirror the `DEFAULT_SETTINGS` constant pattern (line 5): `export const PAUSE_RECORDS_VERSION = 1;`.

---

### `src/model/timeMath.ts` (model, transform)

**Extend `OpenTimer`** (file lines 16-29): add `state: "running" | "paused"`, `sortMs`, `accumulatedMs`, `segmentStartMs | null`, and `sessionStartedAt?`.

**Sort key (D-06, Pitfall 5).** `compareTimers` (file ~lines 143-149) currently uses `startMs`:
```ts
function compareTimers(a: OpenTimer, b: OpenTimer): number {
	if (a.startMs !== b.startMs) return b.startMs - a.startMs;
	if (a.taskPath < b.taskPath) return -1;
	...
```
Switch it to `sortMs` and keep the path tiebreak.

**Signature** (file lines 122-141): append `timer.state`, `accumulatedMs`, and `sessionStartedAt` to the joined fields, so a pause or resume that leaves `active()` unchanged still re-renders.

**`derivePaneState`** (file lines 219-232): `return snapshot.primary ? "running" : "idle";`. A paused-only snapshot must not be idle (Pitfall 3). Base the check on "has any card" (`primary || others.length`), or add a `paused` list and count it.

**`deriveSnapshot`** (file lines 164-189): the per-item untrusted parse loop. Paused cards get a sibling builder from `PauseRecord` + `TaskInfo | null`, using `displayTitle(task?.title ?? record.title, path)` and `parseEntries(task?.timeEntries)`.

Session math: paused value is `accumulatedMs`; running with a record is `accumulatedMs + sessionMs(segmentStartMs, now)` (reuse `sessionMs`, line 46).

---

### `src/state/TimerStore.ts` (store, read + event-driven)

**Analog:** `refreshOnce` (file lines 120-146), shown in full:
```ts
private async refreshOnce(): Promise<void> {
	if (this.disposed || this.gateway.getState().kind !== "ready") return;
	const generation = this.generation;
	try {
		const active = await this.gateway.active();
		let ownership: Ownership;
		try { ownership = await this.gateway.pomodoroOwnership(); }
		catch { ownership = { readable: false }; }
		if (this.disposed || generation !== this.generation || this.gateway.getState().kind !== "ready") return;
		const snapshot = deriveSnapshot(active);
		const signature = snapshotSignature(snapshot) + JSON.stringify(ownership);
		const changed = this.snapshot === null || signature !== this.signature;
		this.snapshot = snapshot;
		this.ownership = ownership;
		this.eligibleCount = selectRegularStopTargets(active, ownership).length;
		this.signature = signature;
		if (changed) this.notify();
	} catch (error) { ... this.ownership = { readable: false }; this.eligibleCount = 0; this.signature = null; this.notify(); ... }
}
```
Changes, following RESEARCH "Sequencing a refresh with the ledger":
1. Add `await this.pauses.ready()` and capture `rev = this.pauses.revision` before the reads.
2. Read each paused task sequentially with a per-call `try/catch` that falls back to null. That is the same inline-catch style as the `ownership` read above. Read completed statuses the same way, with null on failure.
3. If the revision moved, set `this.dirty = true; return;`. `runRefreshLoop` (lines 113-118) already loops on `dirty`.
4. Hide the owned entry before `deriveSnapshot`. Append the ledger signature (`pausedCount` plus records) to `signature`.

**Header state getter.** Copy `getStopAllState` (file lines 30-32):
```ts
getStopAllState(): { eligibleCount: number; readable: boolean } {
	return { eligibleCount: this.eligibleCount, readable: this.ownership.readable };
}
```
Add `getHeaderState(): { readable, eligibleCount, pausedCount }`, or extend the getter. Reset `pausedCount` and related fields in the same three places where `eligibleCount = 0` is reset (the catch block, `handleState`, and the initial field).

Deps: add `pauses: PauseStore` and `fileExists: (path) => boolean` to `TimerStoreDeps`.

---

### `src/state/TimerController.ts` (controller, queued writes)

**`pauseAll`: copy `stopAll`** (file lines 39-74) line for line. Use a fresh `active()` + `pomodoroOwnership()` per target, abort on unreadable ownership, `skipped++` for vanished targets, treat `isNoActiveSessionError` as skipped, show one summary notice, and call `store.refreshNow()` in `finally` with `busy(-1)`:
```ts
async stopAll(): Promise<{ stopped: number; skipped: number; failed: number; ownershipUnreadable: boolean }> {
	const outcome = { stopped: 0, skipped: 0, failed: 0, ownershipUnreadable: false };
	if (this.completing) return outcome;
	const { gateway, queue, store, newCorrelationId, log } = this.deps;
	this.busy(1);
	try {
		await queue.run(async () => {
			const ownership = await gateway.pomodoroOwnership();
			if (!ownership.readable) { outcome.ownershipUnreadable = true; return; }
			const targets = selectRegularStopTargets(await gateway.active(), ownership);
			for (const target of targets) {
				const active = await gateway.active();
				const current = await gateway.pomodoroOwnership();
				if (!current.readable) { outcome.ownershipUnreadable = true; break; }
				if (!selectRegularStopTargets(active, current).some(id => sameEntry(id, target))) { outcome.skipped++; continue; }
				try {
					await gateway.stop(target.taskPath, { source: MUTATION_SOURCE, reason: "user stop all", correlationId: newCorrelationId() });
					outcome.stopped++;
				} catch (error) {
					if (isNoActiveSessionError(gateway.normalizeError(error).message)) outcome.skipped++;
					else outcome.failed++;
				}
			}
		});
	} catch { outcome.failed++; log("Stopping all timers could not finish safely."); }
	finally { try { await store.refreshNow(); } finally { this.busy(-1); } }
	if (outcome.ownershipUnreadable) this.notice("Couldn't verify Pomodoro ownership. Stop all has stopped; try again when TaskNotes is ready.");
	else if (outcome.failed) this.notice(`Stopped ${outcome.stopped} timers. ${outcome.failed} timers could not be stopped. Try again.`);
	return outcome;
}
```
Change for pauseAll: each successful stop goes through the shared per-target pause body (RESEARCH Pattern 3), which writes the paused record from the returned `TaskInfo`. Reasons: `"user pause all"` and `"user resume all"`. Notice wording: `Paused ${n} timers. ${failed} timers could not be paused. Try again.`
Change for stopAll (D-10): call `pauses.clearAll()` inside the queue after the loop. Per A3, only do this when the loop ran, not on the ownership-unreadable early return.

**`pause` (per card).** Combine the `stop()` error classification (file lines 126-157) with the `complete()` in-queue fresh-read check (file ~lines 182-187):
```ts
const active = await gateway.active();
if (active.some(item => !item.entry.endTime && sameEntry({ taskPath: item.taskPath, startTime: item.entry.startTime }, target))) { ... }
```
Per D-04, per-card pause is allowed when ownership is unreadable. Do not abort there.

**`resume` / `resumeAll`.** Copy `start()` (file lines 93-116): the `"already-running"` guard inside the queue, the `/already.*(track|tim|active)/i` catch, and the `Couldn't start the timer for "${title}"` notice. Add the Pomodoro guard: if `own.readable && own.owner && normalizeTimerPath(own.owner.taskPath) === record.taskPath`, call `notice(`${title} is being timed by Pomodoro.`)` and write nothing (D-17).

**`stopPaused`.** `queue.run(async () => pauses.remove(path))`, then `refreshNow`. No gateway call.

**`complete`** (file lines 166-202): the still-open check already skips the stop for paused tasks. Add `pauses.remove(target.taskPath)` after `statusWritten = true`. A paused target needs a `StopTarget`; use `startTime = record.lastEntryStart`, which never matches an open entry.

**Deps:** extend the `TimerControllerDeps.gateway` Pick (line 28) with `getTask` if it is used, and add `pauses: PauseStore`. Outcome type style (lines 17-25): `export type PauseOutcome = "paused" | "already-stopped" | "pomodoro" | "failed" | "busy";`.

---

### `src/tasknotes/TaskNotesBridge.ts` (gateway)

**`getTask`: copy `listTasks`** (file ~lines 226-232), including the re-check that the api is still connected after the await:
```ts
async listTasks(): Promise<TaskInfo[]> {
	const readApi = () => this.featureApi("tasks.read", "tasks.list", api => typeof api.tasks?.list === "function");
	const api = readApi();
	const tasks = await api.tasks!.list();
	if (readApi() !== api) throw new Error("TaskNotes changed while loading tasks");
	return tasks;
}
```
Use `"tasks.get"` and `api.tasks?.get`, returning `TaskInfo | null`. Add the method to `interface TaskNotesGateway` (line 45, next to `listTasks` at line 53).

**`stop` return** (file lines 193-196): change it to `Promise<TaskInfo>` and `return await api.time.stop(taskPath, context);`. The vendored type already returns `TaskInfo` (runtime-api.types.ts line 125).

### `src/tasknotes/runtime-api.types.ts`
Add `get?(path: string): Promise<TaskInfo | null>;` inside `readonly tasks?: { list(): ...` (line 128-129). Pin it in `tests/contract.test.ts`. Update COVERAGE.md if the api_coverage_gate requires it (`tasks.get` falls under `tasks.read`).

---

### `src/ui/TimerPaneView.ts` (component)

**Header buttons.** Copy from `onOpen` (file ~lines 142-148):
```ts
const header = root.createDiv({ cls: "tntp-header" });
const start = header.createEl("button", { text: "Start task", cls: "tntp-start" });
const stopAll = header.createEl("button", { text: "Stop all", cls: "tntp-stop-all" });
this.registerDomEvent(start, "click", () => void this.openPicker());
this.registerDomEvent(stopAll, "click", () => {
	if (!this.services.controller.isBusy() && !stopAll.disabled) void this.services.controller.stopAll();
});
const cards = root.createDiv({ cls: "tntp-cards" });
```
Add `pauseAll` (`tntp-pause-all`) and `resumeAll` (`tntp-resume-all`) the same way. Insert the Pomodoro note `root.createDiv({ cls: ["tntp-label", "tntp-pomodoro-note"], text: "Can't check Pomodoro, showing all timers" })` between the header and `cards`, and toggle it with a class instead of inline style. Add all of them to `this.els` (line ~158).

**Disabled + tooltip logic.** Copy from `render()` (file ~lines 466-469):
```ts
const busy = this.services.controller.isBusy();
els.stopAll.disabled = busy || !stopAllState.readable || stopAllState.eligibleCount === 0;
setTooltip(els.stopAll, busy ? "A timer action is in progress" : !stopAllState.readable ? "Cannot verify Pomodoro ownership" : stopAllState.eligibleCount === 0 ? "No regular timers to stop" : "Stop all regular timers; keep the active Pomodoro timer");
```
Pause all uses the same chain ("No running timers to pause"). Resume all becomes `busy || pausedCount === 0` ("No paused timers"). Stop all enablement must also count paused cards (D-10). Since the Pomodoro timer is now hidden, reword the Stop all tooltip.

**Card actions.** Copy from `buildCard` (file ~lines 241-252):
```ts
const actions = card.createDiv({ cls: "tntp-actions" });
const stop = actions.createEl("button", { cls: ["mod-cta", "tntp-stop"] });
setIcon(stop.createSpan({ cls: "tntp-stop__icon" }), "square");
const stopLabel = stop.createSpan({ cls: "tntp-stop__label", text: STOP_LABEL });
stop.addEventListener("click", () => void this.stopTask(key));
const complete = actions.createEl("button", { cls: "tntp-complete", text: "Complete" });
complete.addEventListener("click", () => {
	const current = this.cards.get(key);
	if (!current || complete.disabled || this.services.controller.isBusy()) return;
	...
});
```
Add a `pauseResume` button (icon `pause`/`play`). It is `mod-cta` on paused cards because Resume is primary (D-09). On a paused card, Stop loses `mod-cta`. Read the current state from `this.cards.get(key).timer` at click time, as Complete does. Add `tntp-card--paused` and a `tntp-label` "Paused" span, toggled in `reconcileCards` with `card.card.toggleClass(...)`.

**Card list.** `currentTimers()` (file ~lines 205-210) returns `[]` unless `state === "running"`. Include paused cards (Pitfall 3). `timerKey` used in `reconcileCards`: key cards that have a record by `taskPath + sessionStartedAt` (Pitfall 4).

---

### `src/ui/TaskPickerModal.ts` (component)

**Row tag.** Copy the due span in `renderSuggestion` (file ~line 66):
```ts
el.addClass("tntp-picker-row");
const chip = el.createDiv({ cls: "tntp-picker-chip", text: task.title });
if (task.due) el.createSpan({ cls: "tntp-picker-due", text: task.due });
```
Add `if (this.pomodoroPath === normalizeTimerPath(task.path)) el.createSpan({ cls: "tntp-picker-pomodoro", text: "Pomodoro" });`. Read ownership once at open, alongside the existing task list load (the `opening` generation guard). Picking that task is blocked in `controller.start`, which re-reads ownership in the queue and shows the D-17 notice. Do not trust the picker-time read alone.

---

### `src/main.ts` (wiring, persistence)

**Current load/save** (file lines 49-60):
```ts
this.settingsReady = this.loadData().then((data: unknown) => { this.paneSettings = loadSettings(data); })
	.catch(() => { log("Loading timer pane settings failed; using defaults."); });
...
saveSettings: async settings => {
	await this.settingsReady;
	await this.saveData(settings);          // <-- wipes pauseRecords; must become merged persist()
	this.paneSettings = { ...settings };
	await store.refreshNow();
},
```
Replace `saveData(settings)` with a merged, chained `persist()` (RESEARCH Pattern 4). Keep unknown keys from the load. In the same `.then`, call `pauseStore.load(loadPauseRecords(data))` and resolve `pauseStore.ready()`, including on the catch path.

**Vault events** (file lines 77-78), currently:
```ts
this.registerEvent(this.app.vault.on("delete", () => store.requestRefresh()));
this.registerEvent(this.app.vault.on("rename", () => store.requestRefresh()));
```
Change to `(file, oldPath) => { pauseStore.renamePath(oldPath, file.path); store.requestRefresh(); }` and `file => { pauseStore.removePath(file.path); ... }`. Update the store synchronously before the refresh (RESEARCH Pattern 6). `fileExists = p => this.app.vault.getFileByPath(p) !== null`. Gate it on layout ready, using the existing `onLayoutReady` at line 71.

Optional: `onExternalSettingsChange()` reloads both halves.

---

### `styles.css`
- Header already wraps: `.tntp-header { display: flex; gap: var(--size-4-2); margin-bottom: var(--size-4-4); flex-wrap: wrap; }` (line 184). Four text buttons fit with no change (Pitfall 8).
- Visibility rules (lines 10-11): `.tntp-pane--running .tntp-message, .tntp-pane:not(.tntp-pane--running) .tntp-cards`. Keep the "running" class meaning "has cards", or rename it consistently.
- Muted color: `color: var(--text-muted);` (lines 57, 172). Use it for `.tntp-card--paused`, `.tntp-pomodoro-note`, and `.tntp-picker-pomodoro`. Copy `.tntp-picker-due` (line 188) for the picker tag.

---

### Tests
- `tests/fakes/fakeGateway.ts`: add `getTask` with a fixture map, a `startCalls` array next to `stopCalls` (lines 31, 47), and a settable ownership (currently fixed at line 66: `pomodoroOwnership: () => Promise.resolve({ readable: true, owner: null })`). Make `stop` (line 92) resolve a `TaskInfo` with the closed entry, and add a deferred-stop hook.
- `tests/main.test.ts`: copy the `host.data = {...}` / `host.saved` assertions (lines 12-20). Assert that the merged save keeps `completionStatus` and `pauseRecords`.
- `tests/pauseLedger.test.ts` (new): a pure Vitest file in the same style as `tests/settings.test.ts`.
- `tests/controller.test.ts` and `tests/store.test.ts`: extend the existing suites (call-order assertions on `stopCalls`).

## Shared Patterns

### Queued write + refresh + busy
**Source:** `src/state/TimerController.ts` lines 39-74 / 93-116
**Apply to:** pause, resume, pauseAll, resumeAll, stopPaused
`this.busy(1); try { await queue.run(async () => {...fresh reads, then write...}) } catch {...} finally { try { await store.refreshNow(); } finally { this.busy(-1); } }`. Every method returns an outcome object and never rejects. Notices go through `this.notice()`, which swallows notify errors.

### Mutation context
**Source:** `TimerController.ts` line 57; `MUTATION_SOURCE` in `TaskNotesBridge.ts` line 25
`{ source: MUTATION_SOURCE, reason: "user pause", correlationId: newCorrelationId() }`. For attribution only; no logic depends on it.

### Benign race classification
**Source:** `src/model/errors.ts` `isNoActiveSessionError`, used at `TimerController.ts` line 60
`if (isNoActiveSessionError(gateway.normalizeError(error).message))` means skipped or already-stopped, with no notice and no pause record.

### Capability-gated gateway method
**Source:** `TaskNotesBridge.ts` `featureApi` (file ~lines 219-224) + `listTasks` re-check
Throws "TaskNotes is missing X" / "does not provide Y". Callers in the store catch the error and fall back (null or unreadable).

### Untrusted data validation
**Source:** `pomodoroOwnership.ts` lines 13-33; `settings.ts` lines 7-11
Validate every field, drop malformed data, never throw, and fail closed (bulk actions are disabled when ownership is unreadable).

### Disabled-with-tooltip header buttons
**Source:** `TimerPaneView.ts` `render()` stop-all lines (file ~467-469), using `setTooltip` from obsidian. No inline styles; use `toggleClass` for state.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| (none fully) | — | — | The PauseStore revision counter and pending-path set are new concepts. The `generation` counter in `TimerStore` (file lines 35, 106, 122, 129) is the nearest idiom, and the planner should model `revision` on it. |

## Metadata

**Analog search scope:** `src/**`, `tests/**`, `styles.css` (29 tracked files)
**Files scanned:** 14
**Pattern extraction date:** 2026-10-16
