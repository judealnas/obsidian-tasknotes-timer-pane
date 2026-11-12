# Stack Research: v0.3 Staging Tasks

**Domain:** Obsidian companion plugin for TaskNotes (daily task staging added to an existing timer pane)
**Researched:** 2026-11-12
**Confidence:** HIGH for TaskNotes surfaces (read from the installed 4.13.0 and 4.13.8 bundles and the tagged upstream source). HIGH for Obsidian APIs (installed `obsidian@1.14.4` typings). MEDIUM where noted.

> This file replaces the v0.1 STACK.md, which is still in git history. It covers only what is new for v0.3. The validated v0.2 stack (TS 6, esbuild 0.28.2, ESLint 9 with obsidianmd, Vitest 5, `obsidian@1.14.4` typings, TaskNotesBridge, WriteQueue, CardOrderStore, PauseStore, TaskPickerModal) is unchanged and not re-argued here.

## Headline

**No new dependencies.** Every v0.3 feature is covered by TaskNotes Runtime API v1 surfaces that already ship in 4.13.0, plus long-stable Obsidian APIs. The work is:

1. Extend the vendored types in `src/tasknotes/runtime-api.types.ts`.
2. Add bridge methods.
3. Add one pure date module.

Two findings change the plan as written in STAGING-DECISIONS.md:

1. **Unstaging cannot use `{ staged: undefined }`.** TaskNotes skips undefined user-field values, so that call does nothing. `{ staged: null }` writes an empty `staged:` key. The key is deleted only through the `customFrontmatter: { staged: null }` pass-through, and that field is not in the typed runtime patch. See "Writing and clearing the `staged` field".
2. **There is a public way to read registered user fields: `api.catalog.userFields()`.** It is gated by `catalog.read`, which the pane already uses for `catalog.statuses()`. The setup notice can be exact, with no guessing from write results. `settings.snapshot()` also exists, but don't use it (see "What NOT to use").

## Recommended Stack

### Core technologies (unchanged, with v0.3 notes)

| Technology | Version | Purpose | v0.3 note |
|---|---|---|---|
| TaskNotes Runtime API v1 | **TaskNotes ≥ 4.13.0** (Personal Vault runs 4.13.0; the dev vault runs 4.13.8) | All reads and writes | Raise `MIN_TASKNOTES_VERSION` from `"4.10.0"` to `"4.13.0"` in `TaskNotesBridge.ts`. Keep gating each feature on `hasCapability`. Use the version only for the "needs an update" message. Every surface below exists, with the same behaviour, in both installed bundles (verified by grep; only the minifier's names differ). |
| `obsidian` typings | 1.14.4 (pinned, unchanged) | `Platform`, `View.getState/setState`, DOM helpers | No new APIs past `minAppVersion 1.12.2` are needed. |
| `manifest.json` | `name` becomes `"TaskNotes Task Control"`, `id` stays `tasknotes-timer-pane`, `version` becomes `0.3.0` | Rename and release | Obsidian keys `data.json` and the plugin folder by `id`, so saved card order and pause records survive. The command palette prefixes commands with the manifest `name`, so commands relabel automatically. Also update the view's `getDisplayText()`, the ribbon tooltip and the `package.json` description. |

### Supporting libraries

| Library | Version | Purpose | When to use |
|---|---|---|---|
| *(none added)* | — | — | `dependencies` stays empty. Rollover and days-staged math is a roughly 30-line pure module on `Date` (see "Date and rollover"). |

### Development tools

| Tool | Purpose | Notes |
|---|---|---|
| Existing Vitest fakes (`tests/fakes/fakeTaskNotes.ts`, `tests/fakes/fakeObsidian.ts`) | Fake the new surfaces | Add `tasks.update`, `catalog.userFields`, `recurring.toggleCompleteInstance` and the `recurring.write` capability to the TaskNotes fake. **Add a `Platform` export (`{ isMobile: false, ... }`) to `fakeObsidian.ts`**, because the view will import it and the `obsidian` npm package has no runtime (`"main": ""`). |
| `tests/contract.test.ts` | Pins every vendored shape with `expectTypeOf` | Add pins for each type addition below, so drift fails `tsc -noEmit`. |
| `eslint-plugin-obsidianmd` 0.4.2 (existing) | Catches lifecycle and platform mistakes | Rules that matter here: `platform` (use `Platform`, never `navigator.userAgent`), `no-unsupported-api` (flags APIs newer than `minAppVersion 1.12.2`, such as `getSettingDefinitions` `@since 1.13.0`), `prefer-window-timers`, `regex-lookbehind` (no lookbehind, because mobile iOS is a target). |

## TaskNotes surfaces for v0.3 (exact names, with citations)

Sources:

- "Bundle" means the Personal Vault's TaskNotes **4.13.0** `main.js`, cited by line. Line 3351 holds the runtime API class.
- "Contract" means upstream `src/api/runtime-api.ts` at tag `4.13.0`.
- "Model" means `@tasknotes/model@0.2.2` `dist/types/types.d.ts`.
- "Docs" means `docs/javascript-api.md` at tag `4.13.0`.

### Capabilities to gate on

| Feature | Capability | Method | Evidence |
|---|---|---|---|
| Stage and unstage writes | `tasks.write` (already used by `tasks.complete`) | `api.tasks.update(path, patch, context?)` | Contract L30–63 (capability list), L709–713. Bundle L3351 `update:(e,t,n)=>this.updateTask(e,t,n)`. |
| Read registered user fields (setup notice) | `catalog.read` (already required for start) | `api.catalog.userFields(): UserMappedField[]` (synchronous) | Contract L635–646. Docs L193. Bundle L3351 `getUserFields(){return(this.plugin.settings.userFields??[]).map(t=>({...t}))}`. |
| Complete today's recurring instance | **`recurring.write`** (new) | `api.recurring.toggleCompleteInstance(path, date?, context?): Promise<TaskInfo>` | Contract L836–841. Docs L398. Bundle L3351 `this.recurring={toggleCompleteInstance:(e,t,n)=>this.toggleRecurringComplete(e,t,n),…}`. |
| Non-recurring complete | `tasks.write` | `api.tasks.complete` (already vendored) | Unchanged from v0.2. |
| Reading `staged`, `recurrence`, `complete_instances`, `completedDate` | `tasks.read` | `tasks.list()` / `tasks.get()` (already vendored) | See "Reading user fields". |
| Change events | `tasks.events`, `lifecycle.events` (already required) | Existing `task.updated` and `settings.changed` subscriptions | See "Events". |

Don't use these, even though they exist: `settings.snapshot`, `recurring.events`, `query.tasks`, `recurring.materialize`.

### Reading user fields: top level first, then `customProperties`

TaskNotes' field mapper copies every **registered** user field, keyed by its frontmatter `key`, onto the TaskInfo **twice**: as a top-level property and inside `customProperties`. Bundle L411, end of `p2` (mapFromFrontmatter):

```
for (let d of userFields) e[d.key] !== undefined && (task[d.key] = e[d.key], l[d.key] = e[d.key]);
… task.customProperties = { ...task.customProperties, ...l }
```

Unregistered frontmatter keys are not mapped, so they appear in neither place. Reading from the TaskInfo is therefore only reliable once the field is registered, which matches decision Q15.

**Read rule (HIGH):** if `key` is an own property of the task, use `task[key]`. Otherwise fall back to `task.customProperties?.[key]`. Treat anything that is not a `/^\d{4}-\d{2}-\d{2}/` string as "not staged", including `null`, `""`, numbers and `Date`. Keep the top-level-first order because of `BEe` (Bundle L583): after a write, TaskNotes caches `{...originalTask, ...updates}`. The top-level value is fresh at once, but `customProperties` stays **stale** until Obsidian's metadata cache re-indexes the file.

Put this in a pure helper (`readUserField(task, key): unknown` in `src/model/`). Don't add an index signature to the vendored `TaskInfo`, because that would turn off typo checking for every other field.

**Match registration by `key`, not `id`.** `UserMappedField = { id, displayName, key, type: "text"|"number"|"date"|"boolean"|"list", defaultValue? }` (Model L146–152). Writes go through `m2` (Bundle L411), which loops over the registered fields and checks `updates[u.key]`. So the setting the user types (default `staged`) must equal some `userFields()[i].key`. If the matching field's `type !== "date"`, show a softer warning: writes still work, but TaskNotes' own date picker and date filters won't treat the field as a date.

### Writing and clearing the `staged` field

All writes go through `api.tasks.update(path, patch, { source: MUTATION_SOURCE, ... })`. The runtime implementation (Bundle L3351 `updateTask`) calls `requireTask`, then `withMutationContext`, then `taskService.updateTask(task, patch)`, with **no schema validation of the patch**. It holds TaskNotes' per-path lock, writes `dateModified`, updates the cache and emits `task.updated` (Bundle L588).

| Intent | Patch to send | What TaskNotes does | Evidence |
|---|---|---|---|
| Stage or re-stage for day D | `{ [key]: "YYYY-MM-DD" }` | `m2` copies the value for a registered key into frontmatter. An **unregistered key is silently dropped from frontmatter**, but it still appears on the returned and cached TaskInfo until the file re-indexes. | Bundle L411 `m2`. Bundle L583 `$Ee`, `BEe`. |
| **Unstage (delete the key, Q11)** | `{ [key]: null, customFrontmatter: { [key]: null } }` | `m2` first writes `key: null`. Then `$Ee` handles `customFrontmatter`: a `null` value means `delete frontmatter[key]`. The `[key]: null` part makes the returned and cached TaskInfo read "unstaged" at once, without waiting for the re-index. | Bundle L583: `t.customFrontmatter&&Object.entries(t.customFrontmatter).forEach(([u,p])=>{p===null?delete r[u]:r[u]=p})`. Same code in 4.13.8 (dev-vault bundle L581). |
| ~~`{ [key]: undefined }`~~ | Don't | Does nothing: both `m2` and `$Ee` skip `undefined`. | Bundle L411, L583. |

**Typing caveat (MEDIUM risk):** the runtime contract types the patch as `TaskNotesTaskPatch extends Partial<TaskInfo> { details?: string }` (Contract L441). It allows neither user-field keys nor `customFrontmatter`. `customFrontmatter` comes from the model's `TaskUpdateInput` (Model L79–84), which is what `taskService.updateTask` actually accepts. It is implemented and stable across 4.13.0 to 4.13.8, but it is not part of the documented runtime contract.

The degradation is safe: if a future TaskNotes ignores `customFrontmatter`, the `[key]: null` half still leaves `staged:` empty, and the read rule treats that as unstaged. Record this as a known dependency, and add a contract-test comment pointing here.

**Don't decide registration from the read-back.** The returned TaskInfo echoes an unregistered key even though nothing was written (`BEe`). Check `catalog.userFields()` before writing, and re-check on `settings.changed`.

### Recurring completion

`toggleCompleteInstance(path, date?)` runs `new Date(date)`, which for a `"YYYY-MM-DD"` string is **UTC midnight** (Bundle L3351 `toggleRecurringComplete`). TaskNotes then formats the date back with UTC getters (`le`, Bundle L417: `getUTCFullYear/getUTCMonth/getUTCDate`). So **passing `"YYYY-MM-DD"` round-trips exactly in every timezone (HIGH)**.

Don't pass a local ISO datetime such as `"2026-11-12T00:00"` or `moment().format()`. West of UTC those can shift by a day.

| Rule | Why | Evidence |
|---|---|---|
| **Always pass `date`**, set to the plugin's staging day (rollover-adjusted). | With no date, `hN` uses the task's **`scheduled` date** (unless `recurrence_anchor === "completion"`), and only otherwise calendar today. Either way it ignores the 4 AM rollover. | Bundle L424 `function hN(r,e){if(e)return e;if(r.recurrence_anchor!=="completion"&&r.scheduled)return ut(se(r.scheduled));…return an(fr())}` |
| **It toggles.** Check `task.complete_instances?.includes(day)` first, and don't call it when that is already true. | `JTe` removes the date if it is already present, so a double-click or a completion made elsewhere would un-complete it. | Bundle L424 `JTe`: `d=!l.includes(o)` … `else{u.complete_instances=l.filter(k=>k!==o)}` |
| Clear `staged` in a **second, sequenced** write through `WriteQueue`, after the toggle resolves. | The toggle rewrites only recurrence fields, so `staged` survives. Run the two writes in sequence, not in parallel. TaskNotes locks per path, but two writes back to back can still interleave their re-index. | Bundle L589 / L595 |
| "Done today" for a recurring task means `complete_instances.includes(stagingDay)`. | It is a date string list. TaskNotes never sets `completedDate` for recurring toggles. | Model L45. `BEe` sets `completedDate` only when `!recurrence`. |
| **MEDIUM, verify in phase:** occurrence materialization. | If the task uses `occurrence_materialization` (`on_completion`) or already has a materialized occurrence note for that date, TaskNotes toggles the **occurrence note's status** instead, then reconciles the parent. | Bundle L589 `toggleRecurringTaskCompleteWithOccurrenceNotes`. The vault's one recurring task probably doesn't use this, so check before relying on `complete_instances`. |

**Non-recurring "Done today":** `completedDate` is written as the **local calendar date** at completion (`Rl()`, Bundle L417, local getters, no rollover). Between midnight and the rollover hour, `completedDate` is already the next calendar day while the staging day is still the previous one. Match "done today" against the plugin's own completion record (written by Q12 at the moment of ✓), not `completedDate` alone. If both are used, accept `completedDate ∈ {stagingDay, calendarToday}`.

### Events: no new subscriptions needed

The runtime's `recurring.instance.completed`, `recurring.instance.skipped`, `task.completed` and similar events are **all derived from the same raw task-updated emission**. The runtime diffs `originalTask` against `updatedTask` (Bundle L3351 `normalizeRawEvent`: `l2e(t.complete_instances,n.complete_instances)&&l.push({...o,event:"recurring.instance.completed"})`).

The bridge already subscribes to `task.updated`, `task.deleted`, `cache.changed`, `cache.rebuilt` and `settings.changed`, and each calls `emitData()`. That covers staging changes made anywhere: other devices, hand edits, TaskNotes' own UI.

**Don't add `recurring.*` or `task.completed` handlers.** They fire alongside `task.updated` and would only double the refresh work.

Do use `settings.changed`, which is already wired, to re-run the `catalog.userFields()` registration check, so the setup notice disappears as soon as the user registers the field in TaskNotes settings.

### Vendored type additions (`src/tasknotes/runtime-api.types.ts`)

Update the header to say the file is now trimmed from **4.13.0** (cross-checked against 4.13.8), and that the settings namespace stays out on purpose.

```ts
/** Model L146–152 (@tasknotes/model 0.2.2). Matched by `key`, which is the frontmatter key. */
export type UserMappedFieldType = "text" | "number" | "date" | "boolean" | "list";
export interface UserMappedField {
	id: string;
	displayName: string;
	key: string;
	type: UserMappedFieldType;
	defaultValue?: string | number | boolean | string[];
}

// TaskInfo: add (Model L30–74)
//   recurrence?: string;
//   complete_instances?: string[];
//   completedDate?: string;              // local calendar date, set only for non-recurring tasks
//   customProperties?: Record<string, unknown>;   // registered user fields, keyed by frontmatter key
// (No index signature: read user fields through a readUserField(task, key) helper.)

/**
 * Patch accepted by tasks.update. Upstream types it as Partial<TaskInfo> (Contract L441).
 * TaskNotes' update service also accepts registered user-field keys and
 * `customFrontmatter`, where a null value deletes the key (Bundle L583).
 * Only the shapes this plugin sends are vendored.
 */
export interface TaskNotesTaskPatch {
	[userFieldKey: string]: unknown;
	customFrontmatter?: Record<string, null>;
}

// tasks: add
//   update?(path: string, patch: TaskNotesTaskPatch, context?: TaskNotesMutationContext): Promise<TaskInfo>;
// catalog: add
//   userFields?(): UserMappedField[];
// new optional namespace (Contract L836–851; only the one method vendored):
//   readonly recurring?: {
//     toggleCompleteInstance(path: string, date?: string, context?: TaskNotesMutationContext): Promise<TaskInfo>;
//   };
```

Keep these unchanged: `TaskNotesRuntimeEventName` (don't add recurring events), and `pomodoro` (status only; v0.3 adds no Pomodoro start). Leave `pomodoro.start` out even though STAGING-DECISIONS listed it: Q7 and Q25 are dropped.

**Bridge additions (`TaskNotesBridge.ts`, all through `featureApi(...)` so the existing connected-api and capability checks apply):**

- `userFields(): Promise<UserMappedField[]>` (`catalog.read` / `catalog.userFields`, wrapped in `Promise.resolve`, like `statuses()`)
- `stagingAvailable(): { available: boolean; reason: string }` (`tasks.read`, `tasks.write`/`tasks.update`, `catalog.read`/`catalog.userFields`)
- `setStaged(path, key, day, ctx)` and `clearStaged(path, key, ctx)`, which send the patches above
- `recurringCompletionAvailable(): boolean` (`recurring.write`/`recurring.toggleCompleteInstance`)
- `completeRecurringInstance(path, day, ctx)`

Each read keeps the existing pattern of re-checking that the same api object is still connected after the `await`.

## Obsidian APIs for the new UI

| Need | API | Notes | Confidence |
|---|---|---|---|
| Two tabs inside the pane | **Plain DOM in the existing `ItemView`**: a `div` with `role="tablist"`, two `button role="tab"` elements with `aria-selected`, and two `role="tabpanel"` containers toggled with `toggleClass`/`hidden`. | Obsidian has **no public in-view tab component**. `WorkspaceTabs` (d.ts L11469) is a workspace leaf container, not a widget. Style with your own `tntp-tab*` classes on theme variables (`--interactive-accent`, `--text-muted`, `--background-modifier-border`). Add ArrowLeft/ArrowRight between tabs to match the existing keyboard reordering. Bind events with `registerDomEvent`, as the view does today. | HIGH |
| Remember the active tab per leaf | `View.getState(): Record<string, unknown>` and `View.setState(state, result: ViewStateResult)` (d.ts L10536–10556, `@since 0.9.7`) | This is the Obsidian convention for view UI state: it is saved in the workspace layout and restored with the leaf. Keep **card order** in `data.json` through `persistAll`, as Q26 decides. Call `super.getState()`/`super.setState()` and validate the incoming value. | HIGH |
| Mobile detection (up/down instead of drag) | `import { Platform } from "obsidian"`, then **`Platform.isMobile`** (d.ts L7041–7081, `@since 0.12.2`) | Use `isMobile` ("UI is in mobile mode"), not `isMobileApp`, so tablets and phones both get buttons. `isPhone` and `isTablet` exist if the layout ever needs them. HTML5 `dragstart` (the current handle) doesn't fire from touch in mobile WebViews, so the buttons are required, not just nicer. The `platform` lint rule forbids `navigator` sniffing. **Inject the flag into the view (for example through services or a constructor argument), and don't read `Platform` inside `src/model`**, so Vitest can test both layouts. | HIGH (API). MEDIUM (touch-DnD claim, general WebView knowledge) |
| New settings: field key, rollover hour | Existing `PluginSettingTab.display()` pattern with `Setting.addText` (key) and `addDropdown` with 24 options or `addSlider` 0–23 (hour) (d.ts L8441 / L8480, `@since 0.9.7`) | **Don't adopt `getSettingDefinitions()`** (`@since 1.13.0`). `no-unsupported-api` flags it against `minAppVersion 1.12.2`, and the current tab already works. Validate the key: trim it, require it to be non-empty, and refuse it if it collides with core TaskNotes fields such as `status`, `scheduled` or `due`. | HIGH |
| Setup notice | Inline banner in the Staged tab, plus an optional one-time `Notice` | Text should say: register a user field with key `<key>`, type Date, in TaskNotes settings. Re-check on `settings.changed`. | HIGH |

## Date and rollover

**Don't use `moment` from `"obsidian"` for this.** Use a pure module, for example `src/model/stagingDay.ts`, on native `Date` with **local** getters. There are three reasons:

1. `obsidian`'s npm package has no runtime (`package.json` `"main": ""`). Any value import in `src/model` breaks the Vitest suite, which mocks `obsidian` per file. The model layer is deliberately Obsidian-free today.
2. The arithmetic needs nothing that `moment` adds.
3. Hour subtraction with `moment().subtract(rolloverHour, "hours")` is **wrong on DST days**: it subtracts elapsed time, not wall-clock time, so on spring-forward day the date flips at 5 AM, not 4 AM.

```ts
/** "YYYY-MM-DD" of the staging day: before the rollover hour, it is still yesterday. */
export function stagingDay(now: Date, rolloverHour: number): string {
	const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // local midnight
	if (now.getHours() < rolloverHour) d.setDate(d.getDate() - 1);        // calendar math, DST-safe
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Whole calendar days from `from` to `to`, both "YYYY-MM-DD". Uses UTC so DST can't produce 23/25-hour days. */
export function daysBetween(from: string, to: string): number { /* Date.UTC(y, m-1, d) diff / 86_400_000 */ }
```

- **Staged list:** unfinished tasks with `staged <= stagingDay` (string comparison is valid for zero-padded ISO dates), shown with `daysBetween(staged, stagingDay)`. A task with `staged > stagingDay` (staged ahead, from another device in another timezone) stays hidden until its day.
- **Detecting rollover:** in the existing 1 s `registerInterval` tick, compare `stagingDay(new Date(), hour)` with the last value. On change, re-derive the lists and prune the Done-today record. Also re-check on the existing `visibilitychange` and `focus` handlers, for sleep and wake. **Don't schedule a `setTimeout` for 4 AM**: timers drift or never fire across sleep.
- **Formatting:** the pane shows "staged N days" text only, so `Intl`/`moment` formatting isn't needed. If a localized date label is ever wanted, `import { moment } from "obsidian"` in **UI** code only is fine (Obsidian bundles moment 2.x globally).
- Clamp the rollover hour to an integer 0–23. 0 means midnight, which is plain calendar days.

## Installation

```bash
# Nothing to install. No runtime or dev dependency changes for v0.3.
```

## Alternatives Considered

| Recommended | Alternative | When to use the alternative |
|---|---|---|
| `catalog.userFields()` for the registration check | `api.settings.snapshot().userFields` (capability `settings.snapshot`, Contract L863, Bundle L3351 `JSON.parse(JSON.stringify(this.plugin.settings))`) | Never. It deep-clones **all** TaskNotes settings, including `apiAuthToken`, webhooks and saved views, on every check. `catalog.userFields()` returns the same array, documented for this purpose (Docs L193). |
| Unstage with `{ [key]: null, customFrontmatter: { [key]: null } }` | `{ [key]: null }` alone | If a TaskNotes release rejects or strips `customFrontmatter`. Accept the leftover empty `staged:` key; the read rule already treats it as unstaged. |
| Registered field plus TaskInfo reads (Q15) | `customFrontmatter: { staged: "…" }` writes, which work **without registration**, plus reading `app.metadataCache.getFileCache(file).frontmatter` | Only if the setup step proves too annoying. It skips registration but relies entirely on the untyped pass-through, and bypasses TaskNotes' field mapping when reading. It contradicts Q15, so it is not recommended. |
| `tasks.list()` plus local filtering by `staged` | `api.query.tasks({ where: user.staged … })` (`query.tasks`, Docs L304) | If the vault grows to thousands of tasks. At 38 tasks, one `list()` per refresh is trivial, and it is already the picker's data source. |
| Pure `Date` module for rollover | `moment` from `obsidian` | Only for user-facing localized formatting in UI code. |
| `View.getState/setState` for the active tab | Store the active tab in `data.json` | If the user wants the same tab across all pane instances. Per-leaf state is the Obsidian norm. |
| Up/down buttons on `Platform.isMobile` | Pointer-events drag reimplementation (`pointerdown`/`pointermove`) | Not worth it for best-effort mobile (Q5). |

## What NOT to Use

| Avoid | Why | Use instead |
|---|---|---|
| `tasks.update(path, { staged: undefined })` to unstage | Does nothing: undefined user-field values are skipped (Bundle L411 `m2`, L583 `$Ee`). | `{ [key]: null, customFrontmatter: { [key]: null } }` |
| `processFrontMatter` to write or delete `staged` | Bypasses TaskNotes' per-path lock, cache update and `task.updated` event, which violates the PROJECT.md data-format constraint. | `api.tasks.update` |
| `api.tasks.complete` on recurring tasks | Sets the series status to completed, closing the whole series (Q16). | `api.recurring.toggleCompleteInstance(path, stagingDay)` after a `complete_instances` check |
| `toggleCompleteInstance(path)` with no date | Defaults to the task's **scheduled** date, not today (Bundle L424 `hN`). | Always pass the `"YYYY-MM-DD"` staging day |
| Read-back of the returned TaskInfo to decide whether `staged` "took" | The returned object is `{...original, ...patch}` (Bundle L583 `BEe`) and echoes even dropped keys. | `catalog.userFields()` before writing |
| `settings.snapshot()` | Heavy, and carries secrets. | `catalog.userFields()` |
| New `recurring.*` / `task.completed` event subscriptions | Derived from the same raw event as `task.updated` (Bundle L3351); they would double the refreshes. | The existing `task.updated` handler |
| `moment().subtract(h, "hours")` or a `setTimeout` to the rollover moment | Wrong on DST days, and timers stall across sleep. | `stagingDay(now, hour)` checked on the 1 s tick, focus and visibility |
| `getSettingDefinitions()` (Obsidian 1.13) | Above `minAppVersion 1.12.2`; the lint rule flags it. | The existing `display()` pattern |
| `navigator.userAgent` / `app.isMobile` | The `platform` lint rule bans the first; the second is internal. | `Platform.isMobile` |
| `pomodoro.start` or Pomodoro display | Out of scope in v0.3 (Q7 and Q25 dropped). | Keep v0.2 hiding |
| Any npm dependency (date-fns, dayjs, Svelte, Sortable.js) | Nothing here needs one. TaskNotes bundles dayjs internally, but that is not an API. | Plain TS plus Obsidian DOM |

## Stack Patterns by Variant

**If the `staged` field isn't registered** (`!userFields().some(f => f.key === key)`):
- Show the setup notice in the Staged tab and turn off "Stage" in the picker. The Timers tab works as in v0.2.
- Don't write. A write would show a phantom staged state until re-index, then vanish.

**If it is registered but `type !== "date"`:**
- Work normally, and show a one-line hint to change the type to Date.

**If `recurring.write` is missing:**
- Hide ✓ on recurring staged cards, with the tooltip "Needs TaskNotes recurring support". Never fall back to `tasks.complete`, because that would close the series.

**If `tasks.update` is missing or `tasks.write` is absent:**
- The Staged tab is read-only. It shows the staged list without stage or unstage controls.

**On mobile (`Platform.isMobile`):**
- Render ▲/▼ buttons in place of the drag handle. Keep ArrowUp/Down and the same CardOrderStore move operations, one store per tab.

## Version Compatibility

| Surface | Available since | Checked in | Notes |
|---|---|---|---|
| `tasks.update`, `catalog.userFields`, `recurring.toggleCompleteInstance`, `customFrontmatter` null-delete | Present in 4.13.0 (exact first version not traced) | 4.13.0 (Personal Vault), 4.13.8 (dev vault) | Gate on capabilities, never on version strings. The 4.13.0 floor (Q8) is satisfied. |
| `recurring.write` capability string | In the 4.13.0 capability list | Contract L59, Bundle L3351 | New `hasCapability` check. |
| `Platform.isMobile` | Obsidian 0.12.2 | d.ts 1.14.4 L7041 | |
| `View.getState/setState` | Obsidian 0.9.7 | d.ts L10536/L10556 | |
| `getSettingDefinitions` | Obsidian 1.13.0 | d.ts L7441 | Not used (minAppVersion 1.12.2). |
| `@tasknotes/model` | 0.2.2 (`latest`), 0.3.0-rc.21 (`next`) | npm 2026-11-12 | Types reference only. **Don't depend on it**: vendor the four small shapes instead. `@tasknotes/runtime-api` is still unpublished. |

## Sources

- **Primary, local:** TaskNotes 4.13.0 `main.js` (Personal Vault `.obsidian/plugins/tasknotes/`). Lines read:
  - L3351: runtime API class, capability list, `tasks`/`catalog`/`recurring`/`settings` namespaces, `updateTask`, `toggleRecurringComplete`, `getUserFields`, `getSettingsSnapshot`, `normalizeRawEvent`
  - L411: field mapper `p2`/`m2`
  - L417: date helpers `le`, `an`, `fr`, `Rl`
  - L424: `hN`, `JTe`
  - L583: `$Ee`, `BEe`, `sO.updateTask`
  - L588: cache update and `task.updated` emit
  - L589: `toggleRecurringTaskCompleteWithOccurrenceNotes`

  HIGH (primary source; the GSD seam has no tier for local code reading).
- **Primary, local:** TaskNotes 4.13.8 `main.js` (dev vault), cross-checked for the same code paths (L409 `m2`, L581 `customFrontmatter`, L3458 `tasks`/`updateTask`/`toggleRecurringComplete`). HIGH.
- **Primary, upstream:** `callumalpass/tasknotes` tag `4.13.0`, `src/api/runtime-api.ts`: L30–63 capabilities, L441 `TaskNotesTaskPatch`, L635–646 catalog, L705–730 tasks, L836–851 recurring, L863 settings. HIGH.
- **Primary, upstream:** `callumalpass/tasknotes` tag `4.13.0`, `docs/javascript-api.md`: L193 `catalog.userFields`, L211 `tasks.update`, L304 query fields, L398–400 recurring, L412–419 settings snapshot. HIGH.
- **npm registry:** `@tasknotes/model@0.2.2` tarball, `dist/types/types.d.ts` L30–84 (`TaskInfo`, `TaskUpdateInput` with `customFrontmatter`), L146–152 (`UserMappedField`). HIGH for the shapes.
- **Installed `obsidian@1.14.4` `obsidian.d.ts`:** `Platform` L7041–7081, `moment` export L6654, `addDropdown`/`addSlider` L8441/L8480, `getSettingDefinitions` `@since 1.13.0` L7441, `View.getState/setState` L10536–10556, `WorkspaceTabs` L11469. `obsidian/package.json` has `"main": ""`. HIGH.
- **`eslint-plugin-obsidianmd` 0.4.2 rule sources** (`platform`, `noUnsupportedApi`, `preferWindowTimers`, `regexLookbehind`, `settingsTab/preferSettingDefinitions`). HIGH.
- **Project source:** `src/tasknotes/runtime-api.types.ts`, `src/tasknotes/TaskNotesBridge.ts`, `tests/fakes/fakeObsidian.ts`, `tests/contract.test.ts`, `.planning/research/STAGING-DECISIONS.md`.
- **MEDIUM, general knowledge, not verified here:** HTML5 drag events don't fire from touch in mobile WebViews. Obsidian's YAML parsing keeps unquoted `YYYY-MM-DD` values as strings (the read rule's regex guard covers either case).
