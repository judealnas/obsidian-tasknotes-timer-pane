# Phase 4: Staging Foundations - Pattern Map

**Mapped:** 2026-11-12
**Files analyzed:** 13 (5 new, 8 modified)
**Analogs found:** 12 / 13 (all paths verified git-tracked)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/model/stagedField.ts` (NEW: `STAGED_FIELD_KEY`, `fieldStatus`) | utility (pure model) | transform | `src/model/cardOrder.ts` (`loadCardOrder`), `src/settings.ts` (`resolveCompletionStatus`) | role-match |
| `src/model/stagingDay.ts` (NEW) | utility (pure model) | transform | `src/model/timeMath.ts` | role-match |
| `tests/stagingDay.test.ts` (NEW, TZ matrix) | test | transform | `tests/pauseResume.test.ts` (`vi.setSystemTime`), `tests/pauseLedger.test.ts` | partial (no TZ analog) |
| `tests/stagedField.test.ts` (NEW) | test | transform | `tests/pauseLedger.test.ts` / `tests/settings.test.ts` `test.each` | role-match |
| `src/settings.ts` (MOD: `rolloverHour`) | config | transform | itself, `loadSettings` lines 7-11 | exact |
| `src/main.ts` (MOD: `OWNED_KEYS`, `persistAll`) | provider | file-I/O | itself, lines 15, 49-60 | exact |
| `src/ui/TimerPaneSettingTab.ts` (MOD: dropdown + spread fix) | component | request-response | itself, lines 35-46 / 49-57 | exact |
| `tests/settings.test.ts` (MOD) | test | request-response | itself | exact |
| `src/tasknotes/TaskNotesBridge.ts` (MOD: 5 methods) | service | request-response | itself: `startAvailability` 200-213, `featureApi` 221-226, `statuses` 244-250, `completeTask` 266-269, `completionAvailable` 256-264 | exact |
| `src/tasknotes/runtime-api.types.ts` (MOD) | model (types) | — | itself, lines 117-170 | exact |
| `tests/fakes/fakeGateway.ts` (MOD) | test fake | — | itself, lines 23-90 | exact |
| `tests/contract.test.ts` (MOD) | test (type pins) | — | itself, lines 123-131 | exact |
| `scripts/staging-spike.mjs` (NEW, one-off `obsidian eval`) | script | file-I/O / CLI | `scripts/seed-dev-vault.mjs` (header + safety rules only) | partial |

## Pattern Assignments

### `src/settings.ts` — add `rolloverHour`

Current (lines 4-11):
```ts
export interface TimerPaneSettings { completionStatus: string | null; }
export const DEFAULT_SETTINGS: TimerPaneSettings = { completionStatus: null };

export function loadSettings(data: unknown): TimerPaneSettings {
	if (!data || typeof data !== "object" || Array.isArray(data)) return { ...DEFAULT_SETTINGS };
	const value = (data as Record<string, unknown>).completionStatus;
	return { completionStatus: typeof value === "string" ? value : null };
}
```
Extend: `rolloverHour: number` with default `4`; parse with `Number.isInteger(v) && v >= 0 && v <= 23 ? v : 4`. Never throws. NOTE: `tests/settings.test.ts:29-30` asserts `loadSettings(malformed)` `toEqual({ completionStatus: null })` — these expectations must gain `rolloverHour: 4`.

### `src/main.ts` — `OWNED_KEYS` and `persistAll`

Line 15:
```ts
const OWNED_KEYS = new Set(["completionStatus", "pauseRecordsVersion", "pauseRecords", "cardOrder"]);
```
Add `"rolloverHour"`. `persistAll` lines 49-60:
```ts
const written = settings ? { ...settings } : this.fileSettings;
const order = this.cardOrder?.serialize() ?? [];
await this.saveData({
	...this.extras,
	completionStatus: written.completionStatus,
	pauseRecordsVersion: PAUSE_RECORDS_VERSION,
	pauseRecords: this.pauses?.serialize() ?? [],
	// Omitted when empty, so a user who never reorders keeps an unchanged data.json.
	...(order.length > 0 ? { cardOrder: order } : {}),
});
```
Add `rolloverHour: written.rolloverHour` (or omit-when-default per discretion, mirroring the `cardOrder` spread). `saveSettings` wiring (lines 121-130) needs no change; it already passes the full object and sets `this.paneSettings = { ...settings }`.

### `src/ui/TimerPaneSettingTab.ts` — spread bug + rollover dropdown

Bug, line 51 (in `saveChoice`, file line 67 of the 58-line file):
```ts
try { await this.deps.saveSettings({ completionStatus: choice }); }
```
Fix to `{ ...this.deps.getSettings(), completionStatus: choice }`. Generalize `saveChoice` to take a `Partial<TimerPaneSettings>` patch and a failure message so the rollover dropdown reuses it.

Dropdown pattern to copy (lines 35-46 + saveChoice 49-57): `new Setting(this.containerEl).setName(...).setDesc(...).addDropdown(dropdown => { addOption; setValue; onChange(value => { if (generation === this.generation) void this.save...(dropdown, generation, ...) }) })`; saveChoice does `dropdown.setDisabled(true)`, try/catch with nested-guarded `new Notice("Couldn't save ...")`, `finally { if (generation === this.generation) this.display(); }`.
The rollover setting should render even when TaskNotes statuses are unavailable (it does not depend on `gateway.statuses()`); add it after the completion-status Setting but outside any `unavailable` branch. Labels: fixed array "12 AM"…"11 PM" (D-05); sentence-case description (D-06).

### `src/model/stagingDay.ts` (NEW)

Analog header style, `src/model/timeMath.ts` lines 1-5:
```ts
/*
 * Pure time math and snapshot derivation. No Obsidian, no TaskNotes runtime calls:
 * everything here is computed from the plain data returned by `time.active()` and
 * the wall clock passed in by the caller.
 */
```
Same convention: caller passes `nowMs`; no `Date.now()` inside. Use `new Date(nowMs)`, `if (d.getHours() < rolloverHour) d.setDate(d.getDate() - 1)`, return local `YYYY-MM-DD` via `getFullYear/getMonth/getDate` (not ms subtraction, not `toISOString`).

### `src/model/stagedField.ts` (NEW)

Defensive-loader analog, `src/model/cardOrder.ts:46-55`:
```ts
export function loadCardOrder(data: unknown): string[] {
	if (typeof data !== "object" || data === null || Array.isArray(data)) return [];
	const raw = (data as { cardOrder?: unknown }).cardOrder;
	if (!Array.isArray(raw)) return [];
	...
```
`fieldStatus(userFields: unknown): { kind: "ok" | "missing" | "wrong-type" | "unknown"; hasDefault?: boolean }` — `unknown` when input is not an array; find entry whose key (exact field name per spike Q2) equals `STAGED_FIELD_KEY`; type `!== "date"` → `wrong-type`. Lookup-in-catalog analog: `resolveCompletionStatus` `src/settings.ts:13-16`.

### `src/tasknotes/TaskNotesBridge.ts` — feature-gated methods

Do NOT touch `REQUIRED_CAPABILITIES` (line 21). Add method signatures to `TaskNotesGateway` interface (lines 45-70).

Availability analog, lines 200-213:
```ts
startAvailability(): { available: boolean; reason: string } {
  try {
   const api = this.connectedApi();
   for (const [capability, method, callable] of [
    ["tasks.read", "tasks.list", typeof api.tasks?.list === "function"],
    ["catalog.read", "catalog.statuses", typeof api.catalog?.statuses === "function"],
    ["time.write", "time.start", typeof api.time.start === "function"],
   ] as const) {
    if (!api.hasCapability(capability)) return { available: false, reason: "TaskNotes is missing " + capability };
    if (!callable) return { available: false, reason: "TaskNotes does not provide " + method };
   }
   return { available: true, reason: "Start a task alongside running timers" };
  } catch { return { available: false, reason: "TaskNotes is not connected" }; }
 }
```
`stagingAvailability()` → tuples for `tasks.write`/`tasks.update`, `catalog.read`/`catalog.userFields`; `recurringAvailability()` → `recurring.write`/`recurring.toggleCompleteInstance`. Version floor 4.13.0: method presence is the gate (capability-based, not version strings, per CLAUDE.md); if a version check is added, follow the existing `MIN_TASKNOTES_VERSION` comparison.

Read analog (with retire re-check), lines 244-250:
```ts
async statuses(): Promise<TaskStatus[]> {
  const readApi = () => this.featureApi("catalog.read", "catalog.statuses", api => typeof api.catalog?.statuses === "function");
  const api = readApi();
  const statuses = await Promise.resolve(api.catalog!.statuses());
  if (readApi() !== api) throw new Error("TaskNotes changed while loading statuses");
  return statuses;
}
```
→ `userFields()`.

Write analog, lines 266-269:
```ts
async completeTask(path: string, status: string, context: TaskNotesMutationContext): Promise<void> {
  const api = this.featureApi("tasks.write", "tasks.complete", api => typeof api.tasks?.complete === "function");
  await api.tasks!.complete!(path, { status }, context);
}
```
→ `updateTask(path, patch, context)` and `toggleCompleteInstance(path, date, context)`.

### `src/tasknotes/runtime-api.types.ts`

Optional-member convention (lines 128-136): newer methods are `?` optional (`get?`, `complete?`) with a version comment. Add `update?(path, updates: Record<string, unknown>, context?)` to `tasks`, `userFields?(): UserField[]` to `catalog`, and a new optional `readonly recurring?: { toggleCompleteInstance(...) }`. Add a trimmed `UserField` interface (shape from spike Q2; `defaultValue?` optional).

### `tests/contract.test.ts`

Pin style, lines 123-131:
```ts
expectTypeOf<NonNullable<Api["catalog"]>["statuses"]>().returns.toEqualTypeOf<TaskStatus[]>();
expectTypeOf<NonNullable<NonNullable<Api["tasks"]>["complete"]>>().parameters.toEqualTypeOf<[path: string, options?: CompleteTaskOptions, context?: TaskNotesMutationContext]>();
```
Add one `test(...)` per new surface; type-only imports (comment lines 1-4).

### `tests/fakes/fakeGateway.ts`

Lines 23-50 (FakeGateway interface with recorder fields + setters) and 52-80 (closure state + `startAvailability: () => ({ available: state.kind === "ready", reason: "TaskNotes is not connected" })`, `statuses: () => Promise.resolve([])`, `start` pushes to `startCalls`). Add `updateCalls`, `setUserFields(...)`, `stagingAvailability`/`recurringAvailability` mirroring `startAvailability`, `toggleCompleteInstance` recorder.

### `tests/stagingDay.test.ts` — timezone matrix

**No existing TZ analog**: there is no `vitest.config.*`, `package.json` test script is `vitest run --dir tests` (line 14), and no test sets `process.env.TZ`. Frozen-clock analog: `tests/pauseResume.test.ts:66-67` (`vi.useFakeTimers(); vi.setSystemTime(...)`), but since `stagingDay` takes `nowMs`, plain constructed instants suffice. For the matrix, options: (a) separate test files each setting `process.env.TZ` at top before any Date use (Node honors runtime TZ change on Linux/macOS; Windows support is shakier), or (b) add `vitest.config.ts` with `projects` per TZ via `env: { TZ }`, or (c) cross-env in multiple npm scripts. Planner must choose; (b) is the most deterministic and runs on Windows. Cases: 01:30 → previous day, 04:00 → same day, US spring-forward/fall-back days, a southern-hemisphere zone, and a zone where DST happens at midnight (e.g. America/Santiago or Asia/Beirut historically).

### `scripts/staging-spike.mjs` (NEW, one-off)

Copy only the header/safety style of `scripts/seed-dev-vault.mjs` lines 1-19: usage comment, safety rules list, `ROOT` from `import.meta.url` (never cwd), dev-vault path `path.join(ROOT, "dev-vault")`. Must refuse anything outside dev-vault (D-09: never the Personal Vault). Invoke `obsidian eval` via `node:child_process` `execFile` (no shell). No existing CLI analog. Not added to package.json scripts as a recurring command (D-08).

## Shared Patterns

- **Feature gating:** every TaskNotes call goes through `featureApi(capability, method, callable)` (`TaskNotesBridge.ts:221-226`); availability methods never throw and return `{ available, reason }`.
- **Defensive loaders:** never throw, cap input, fall back to defaults (`settings.ts:7-11`, `cardOrder.ts:46-55`).
- **Single data.json writer:** all keys in `OWNED_KEYS` + `persistAll` (`main.ts:15, 49-60`); settings saves must pass the full spread object.
- **Settings UI:** generation guard + disable-while-saving + guarded Notice (`TimerPaneSettingTab.ts:33-34, 49-57`); sentence-case copy (obsidianmd lint).
- **Tests mocking obsidian:** `vi.mock("obsidian", () => import("./fakes/fakeObsidian"))` (`tests/settings.test.ts:8`).

## No Analog Found

| File | Role | Reason |
|---|---|---|
| timezone-matrix mechanism (vitest config / per-TZ runs) | config | No vitest config or TZ handling exists anywhere |
| `obsidian eval` driver in spike script | script | No CLI-driven scripts exist; seed script only covers file copying |

## Metadata

**Analog search scope:** `src/`, `tests/`, `scripts/`, `package.json`
**Files scanned:** ~15
