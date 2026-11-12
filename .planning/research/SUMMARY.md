# Project Research Summary

**Project:** TaskNotes Task Control (formerly TaskNotes Timer Pane; id `tasknotes-timer-pane` unchanged)
**Milestone:** v0.3 Staging Tasks
**Domain:** Obsidian companion plugin for TaskNotes: daily task staging added to an existing timer pane
**Researched:** 2026-11-12
**Confidence:** HIGH (TaskNotes behavior read from the installed 4.13.0 and 4.13.8 bundles and tagged upstream source; existing code seams read from `src/`). MEDIUM on recurring-instance snapping, occurrence materialization and multi-device sync.

> This file replaces the v0.1 SUMMARY.md, which is still in git history. Settled user decisions are in `STAGING-DECISIONS.md`. Its v0.3 resolutions at the top (Q27 two tabs, Q25/Q7 dropped, Q26/Q29 confirmed) override older entries such as Q23.

## Executive Summary

v0.3 adds a **Staged** tab beside the existing **Timers** tab. You pick today's tasks with the ranked picker, put them in order, and work down the list: start, pause, stop, ✓ complete, or ✕ unstage from each card. TaskNotes frontmatter (`staged: YYYY-MM-DD`, a user field the user registers) is the source of truth for *whether* a task is staged. Plugin data (`data.json`) only *orders* and *annotates* that set, through the staged order and the Done-today record. The staged list is **derived** on every refresh from `api.tasks.list()`: unfinished tasks with `staged <= stagingDay`. Rollover happens at a configurable hour and needs no writes.

**No new dependencies are needed.** Every feature maps onto TaskNotes Runtime API v1 surfaces that already ship in 4.13.0: `tasks.update`, `catalog.userFields`, `recurring.toggleCompleteInstance`, and `tasks.list`. The work is vendored type additions, new bridge methods that are feature-gated (not added to `REQUIRED_CAPABILITIES`, so Timers keeps working on any TaskNotes version), one pure date module, new stores that follow the v0.2 PauseStore and CardOrderStore patterns, and a view refactor into a tab shell with a generic `TaskCard` and `CardList<K>`.

The risk sits in TaskNotes write semantics, not in the UI:
- `tasks.update` **silently drops** unregistered keys, yet still echoes them in the returned and cached TaskInfo.
- `undefined` does nothing, and `null` leaves an empty `staged:` line. Only the undocumented `customFrontmatter: {key: null}` actually deletes the key.
- `toggleCompleteInstance` is a toggle. With no date it defaults to the task's `scheduled` date.
- `completedDate` uses the calendar date, which ignores the rollover hour.

Mitigation: check registration with `catalog.userFields()` before any write, use a combined unstage patch, always pass the staging day explicitly, check `complete_instances` before toggling, and keep the plugin's own completion record. Two rules hold everywhere: **refresh and render never write**, and **every write goes through the one shared `WriteQueue`**.

## Key Findings

### Recommended Stack

The v0.2 stack is unchanged: TS 6.0.3, esbuild 0.28.2, ESLint 9 with `eslint-plugin-obsidianmd` 0.4.2, Vitest 5, `obsidian@1.14.4` typings, and `minAppVersion` 1.12.2. Nothing is installed for v0.3. Date math lives in a pure `src/model/stagingDay.ts` built on native `Date` with local getters, not `moment`. There are three reasons: `obsidian` has no runtime in Vitest, `moment().subtract(h,"hours")` gets DST days wrong, and nothing else is needed.

**TaskNotes surfaces (all feature-gated):**
- `api.tasks.update(path, patch, ctx)`, capability `tasks.write`: stage, unstage, and clearing on completion. Send only the one field (Pitfall 10).
- `api.catalog.userFields()`, capability `catalog.read`: an exact setup check (`missing` / `wrong-type` / `ok`) matched by `key`, re-checked on `settings.changed`.
- `api.recurring.toggleCompleteInstance(path, "YYYY-MM-DD", ctx)`, capability `recurring.write` (new): completes today's instance. A bare date string round-trips exactly through TaskNotes' UTC getters.
- `api.tasks.list()` with no query: derive the staged set locally. Don't use `query.tasks` with a user-field predicate, because the query field naming is unverified.
- Existing `task.updated` / `settings.changed` subscriptions are enough. Don't subscribe to `recurring.*` or `task.completed`: they come from the same raw event and would double the refreshes.
- Obsidian: `Platform.isMobile` (not `navigator.userAgent` or `app.isMobile`), `View.getState/setState`, `Plugin.onExternalSettingsChange` (since 1.5.7). Avoid `getSettingDefinitions` (since 1.13, above the floor).

**Explicitly rejected:** `processFrontMatter` (bypasses TaskNotes' lock, cache and events), `tasks.complete` on recurring tasks (closes the whole series), `toggleCompleteInstance` with no date, deciding registration from the update's read-back, and `settings.snapshot()` (see Reconciled conflicts).

### Expected Features

**Must have (v0.3.0):**
- Two tabs (Staged / Timers), last-active tab remembered, counts and a running cue on Timers (GAP-1). This protects the Core Value while the pane is showing Staged.
- Stage from the picker in a "stage" mode that excludes completed and archived tasks, writing `staged: <stagingDay>`. Unstage with ✕.
- Setup notice when the field is missing or has the wrong type. It replaces the Staged empty state and disables Stage. Copy: "register `<key>` as type **date**, **no default value**".
- Staged list derived as unfinished tasks with `staged <= stagingDay`. A future date means "not yet" (quietly deferred). A days-staged badge shows 1d, 2d, and so on.
- Persisted per-tab order. New arrivals join at the **bottom**, while v0.2's `orderTimers` puts them on top, so add a parameter. Drag plus ArrowUp/Down, and ▲▼ buttons on mobile.
- Card states: idle (▶, ✓, ✕), running (also elapsed, pause, stop), and paused (resume, ✓, ✕, with the session time frozen, GAP-3). All states render from the shared TimerStore and PauseStore.
- ✓ complete: regular tasks get a status write, recurring tasks complete today's instance only. Then stop the open entry, clear `staged`, and add the task to Done today.
- Done-today section, cleared at rollover. Rollover at a configurable hour (default 4) with no writes.
- Rename and delete following for the path-keyed order and the record. Empty states.
- Display name "TaskNotes Task Control", release 0.3.0.

**Should have (cheap, optional):** total tracked time shown muted on idle staged cards, and a "staged" dot on Timers cards.

**Defer:** undo ✓ from Done today (GAP-6, v0.3.x), a "Stage" entry in the Timers-card context menu (v0.3.x), estimate progress and today's log (v2), Pomodoro display or start (rejected for v0.3).

**Anti-features:** unstaging must not auto-stop a running timer (GAP-4). Don't add start-on-stage. Don't add auto-archive or red "overdue" styling for tasks that have been staged a long time.

### Architecture Approach

A **source-of-truth split**:
- Membership comes from frontmatter.
- Running and paused state comes from TaskNotes `timeEntries` plus PauseStore.
- Order and the Done-today record live in data.json.
- The staging day is derived on every tick and never stored.

The Staged tab **joins StagingStore and TimerStore by normalized path at render time** and keeps no merged state. Staged cards are keyed by path, not by sessionKey, so a card survives start, pause and stop. Pomodoro-owned entries are already filtered out, so a staged task timed by Pomodoro renders idle, and its ▶ is refused with the v0.2 notice.

**Major components:**
1. **DayClock / staging model** (pure, `src/model/`): `stagingDay`, `daysBetween`, `parseStagedValue`, `readStaged` (top-level property first, then `customProperties`), `deriveStaging`, `fieldStatus`.
2. **StagingStore**: subscribes to the same bridge hints as TimerStore, with a debounce and a single-flight refresh. `tickDay(now)` re-derives from the last task list when the day changes.
3. **StagingController**: stage, unstage, and completeStaged, all through the shared WriteQueue.
4. **StagedOrderStore** and **DoneTodayStore**: path-keyed, with folder-aware `renamePath`, `removePath` and prune. They persist through the single `persistAll`, and their keys are added to `OWNED_KEYS`.
5. **TaskCard** and **CardList<K>**: extracted from `TimerPaneView`, one CardList instance per tab.
6. **TimerPaneView**: becomes a shell holding the tab strip, the shared bridge-state messages, the 1 s tick and the wake/reveal refresh.
7. **Generalized `TimerController.completeTask`**: branches on `task.recurrence`.

**Modified seams:**
- `TaskPickerModal` takes an options object.
- `settings.ts` gains `stagedFieldKey` and `rolloverHour`.
- **Fix existing bug first:** `TimerPaneSettingTab.saveChoice` must spread `getSettings()`, or it erases the new settings.
- Per-tab CSS state modifiers.
- `main.ts` vault rename/delete handlers.

### Critical Pitfalls

1. **Phantom writes when the field isn't registered.** The update returns `{...original, ...patch}` even when nothing reached disk. Avoid it by gating on `catalog.userFields()` before writing, and never trusting the read-back. Optionally, verify the first write from `metadataCache` frontmatter.
2. **Unstage delete semantics.** `undefined` is a no-op, `null` and `""` leave litter, and only `customFrontmatter` deletes the key. See Reconciled conflict 2. Test all four input states (undefined, null, "", absent).
3. **"Today" computed wrongly**, through UTC, millisecond subtraction, DST, or ignoring the rollover hour. Use calendar math with local getters. Check the day on the 1 s tick and on focus or visibility changes, never with a `setTimeout` to 4 AM. Clamp the hour to 0–23. Write timezone-matrix tests with a frozen clock.
4. **Recurring ✓ hits the wrong instance, un-completes, or closes the series.** Always pass the staging day. Skip the toggle if `complete_instances` already includes that day. Never call `tasks.complete` on a recurring task. That bug **already exists in the Timers tab's ✓** (ARCHITECTURE F6), so fix both tabs through one code path. Clear `staged` in a second write, sequenced after the toggle.
5. **Write loops and cross-device divergence.** Refresh and render must never write (an echo of `task.updated` would loop). `persistAll` rewrites the whole data.json, so a second device wipes the first device's order, Done-today record **and pause records**. Implement an `onExternalSettingsChange` merge, add every new key to `OWNED_KEYS` (otherwise stale "extras" come back), and version the records.

Also watch:
- **Dangerous keys:** core field names or `fieldMapping` values (validate the key), and a field `defaultValue` that stamps every new task as staged.
- **Card maps:** the same task appearing in both tabs needs a separate card map per tab.
- **Rename/release:** change only the manifest `name` and display strings. Keep the id, `VIEW_TYPE`, command ids and CSS prefixes. The lint rules forbid the plugin name inside command names, so "Open task control pane" passes and "Open TaskNotes Task Control" fails.

## Reconciled cross-report conflicts

1. **Registration check.** PITFALLS suggested `api.settings.snapshot().userFields`. **Use `api.catalog.userFields()`** (capability `catalog.read`, which the pane already uses for `catalog.statuses()`). It is synchronous, returns only `{id, key, displayName, type, defaultValue?}`, and is documented. **Rejected:** `settings.snapshot()`. It deep-clones all TaskNotes settings, including the HTTP API token, and needs an extra capability. If the `defaultValue` warning needs that field and `catalog.userFields()` doesn't return it, check the shape in Phase 4. Don't fall back to `snapshot`.
2. **Unstage delete (OPEN, decide in requirements).** The reports gave three answers: STACK suggested `{[key]: null, customFrontmatter: {[key]: null}}`, ARCHITECTURE suggested `{[key]: null}` with null meaning unstaged, and PITFALLS suggested feature-testing `customFrontmatter` with null as the fallback.
   - **Recommended: the combined patch** `{[key]: null, customFrontmatter: {[key]: null}}`.
     - The `null` half makes the cached TaskInfo read "unstaged" at once.
     - The `customFrontmatter` half deletes the key, which honours Q11.
     - If a future TaskNotes ignores `customFrontmatter`, the result degrades to a harmless `staged:`.
   - `customFrontmatter` isn't in the documented `TaskNotesTaskPatch`, though it is stable from 4.13.0 to 4.13.8. Record it as a known dependency, pin it in the contract tests, and confirm it in a Phase 4 dev-vault spike.
   - The alternative is to amend Q11 to "null is unstaged". That is simpler and fully documented, but leaves `staged: null` in every task.
   - **Either way, the reader treats missing, `null`, `""`, and anything that isn't a valid `YYYY-MM-DD` as not staged.** Take the first 10 characters of an ISO datetime and the first element of an array.
   - Never use `customFrontmatter` with a non-null value to get around registration.
3. **Done today.** Build it from the **plugin's own completion record**, `{path, day, title}` written at the moment of ✓ and keyed by the path the completion call returns. TaskNotes then confirms the task is still done: its status is completed, or `complete_instances` includes the day for a recurring task.
   - Don't rely on `completedDate` or `complete_instances` alone. `completedDate` is the local calendar date, so between midnight and the rollover hour it is a day ahead of the staging day.
   - The recurring toggle snaps to an occurrence, so the recorded instance may not equal the staging day.
   - When comparing `completedDate`, accept `{stagingDay, calendarToday}`.
   - GAP-5 decides whether tasks completed outside the pane appear.
4. **Minor: where to persist the active tab.** FEATURES said data.json. ARCHITECTURE and PITFALLS (Pitfall 16) say view state via `getState/setState`. **Recommended: view state**, because it is per-leaf, restores with the layout, and stays out of the data.json merge.
5. **Minor: phase numbering.** PITFALLS mapped the work to 4 phases (4 to 7) and ARCHITECTURE to 5 (4 to 8). The order below follows ARCHITECTURE's 5, because it keeps the risky tab refactor separate from new behavior.

## Items for requirements scoping

**FEATURES gaps (each has a recommendation; confirm with the user):**
- **GAP-1 Tab cues.** Counts on both tabs, plus a running accent on Timers. *Recommended: yes.*
- **GAP-2 Already-staged tasks in the stage picker.** *Recommended:* show them marked "staged Nd", sorted after unstaged tasks, because re-staging is the only way to reset the days count. ARCHITECTURE's picker design excludes them, so requirements must pick one.
- **GAP-3 Paused staged card.** *Recommended:* resume, ✓ and ✕, with the session time frozen.
- **GAP-4 Unstaging a running task.** *Recommended:* delete the key only. The timer keeps running in Timers, with an optional notice and no confirm dialog.
- **GAP-5 Completion outside the pane.** *Recommended:* no write when the pane observes it (that would echo through Sync), so the leftover key is harmless. Also confirm whether tasks completed elsewhere but in the record show in Done today.
- **GAP-6 Undo ✓.** *Recommended:* defer to v0.3.x.
- **GAP-7 Header actions per tab.** *Recommended:* Stage on Staged, and Start, Pause all and Stop all on Timers. Whether Stop all also belongs on Staged needs a user call.

**ARCHITECTURE and PITFALLS open questions:**
- Unstage delete representation (Reconciled conflict 2).
- Should the recurring-✓ fix also apply to the Timers tab? *Recommended: yes, through one shared `completeTask`.*
- How should ✓ order its steps (status, stop, clear `staged`)? And can ✓ on an idle card safely stop nothing (`startTime: null`)?
- Does `toggleCompleteInstance` stop a running timer or emit `time.stopped`? Assume it doesn't, and stop the timer explicitly first.
- Behavior with `occurrence_materialization: "on_completion"`, or with an already-materialized occurrence note: TaskNotes toggles a separate note.
- Does a newly registered user field appear on already-cached TaskInfo without a cache rebuild? If not, the setup notice should say "reload TaskNotes".
- Key validation rules: reject core field names, `fieldMapping` values and reserved TaskInfo properties. Warn when a key change orphans tasks staged under the old key (no migration in v0.3). Warn about `defaultValue` and non-date types.
- The multi-device merge scope for data.json. Is plugin-settings sync enabled for the user? Keep the merge either way.
- Should the mobile ▲▼ buttons also appear on Timers cards? (Cheap and consistent.)
- The fate of order entries for tasks that are no longer staged: prune only after a successful read confirms the task is gone.

## Implications for Roadmap

Phases continue from v0.2, which ended at Phase 3.

### Phase 4: Staging contract, settings and pure model (no UI)
**Rationale:** Everything consumes it, all of it can be unit-tested, and it carries the open TaskNotes behaviors.
**Delivers:**
- Vendored types: `tasks.update`, `catalog.userFields`, `recurring.toggleCompleteInstance`, and the TaskInfo fields `recurrence`, `complete_instances`, `completedDate`, `scheduled`, `customProperties`.
- Feature-gated bridge methods and the `stagingAvailability` / `recurringAvailability` checks.
- Fake gateway behavior that mimics the silent drop and the read-back echo. Contract tests.
- `stagingDay.ts` and `staging.ts`.
- `stagedFieldKey` / `rolloverHour` settings with key validation and the setup check. The `saveChoice` spread fix.
- `OWNED_KEYS`, loaders and `persistAll` updates.
**Avoids:** Pitfalls 1, 2, 3, 5, 9 and 10.
**Spike:** in the dev vault, check the unstage patch on raw frontmatter and `toggleCompleteInstance` with an off-schedule day.

### Phase 5: Tab shell refactor (Timers behavior unchanged)
**Rationale:** A pure refactor, guarded by the 361 v0.2 tests and UAT, that isolates regressions before new behavior arrives. It can run in parallel with Phase 4.
**Delivers:**
- `TaskCard` and `CardList<K>` extracted. The tab strip, with the active tab kept in view state. Counts and the running cue.
- Per-tab CSS state and per-tab card maps. Per-tab header actions (GAP-7).
- `TaskPickerModal` options object (start mode only).
- `onExternalSettingsChange` merge scaffolding.
**Avoids:** Pitfalls 7, 11, 12, 15 and 16.

### Phase 6: Staged tab core
**Rationale:** Depends on Phases 4 and 5. It delivers the core "pick, order, work down" loop.
**Delivers:**
- StagedOrderStore, StagingStore and StagingController (stage and unstage).
- Picker stage mode (GAP-2) and the setup notice in the UI.
- Idle, running and paused cards, using the render-time join with TimerStore (GAP-3, GAP-4).
- Bottom-insertion order, drag and keyboard reordering, rename and delete following.
- Days-staged badge and empty states.
**Avoids:** Pitfalls 5, 8 and 13.

### Phase 7: Completion, Done today and rollover
**Rationale:** Needs the stores and the list to exist. Holds the riskiest TaskNotes semantics (recurring).
**Delivers:**
- Generalized `completeTask` with a recurring branch, shared with the Timers tab ✓.
- `completeStaged`, which clears `staged` sequentially.
- DoneTodayStore and the Done-today section, using the record-based logic from Reconciled conflict 3 and the GAP-5 decision.
- DayClock rollover on the tick and on focus, visibility and wake.
**Avoids:** Pitfalls 4 and 6. UAT includes a native overnight run and a sleep/wake run.

### Phase 8: Mobile ▲▼, rename and release 0.3.0
**Rationale:** Polish and release plumbing come last.
**Delivers:**
- `Platform.isMobile` ▲▼ buttons in CardList.
- Manifest `name`, display strings, command *names* and README updated. A test pins the id, `VIEW_TYPE` and command ids.
- BRAT release tagged `0.3.0` (no `v`), plus an upgrade check from 0.2.0.
**Avoids:** Pitfalls 14 and 17.

### Phase Ordering Rationale
- Contract and model come first because they unblock everything and decide the designs for unstage and recurring ✓.
- The refactor comes before features, so any v0.2 regression is caught on its own.
- Completion and rollover come after the list, because they need the stores and the record.
- Release comes last.
- The "no writes on read" and "one WriteQueue" rules are checked in every phase.

### Research Flags
- **Phase 4: needs a dev-vault spike.** Check the `customFrontmatter` delete versus `staged: null` on raw frontmatter, the shape of `catalog.userFields()` (does it include `defaultValue`?), and whether a newly registered field shows on cached TaskInfo.
- **Phase 7: needs deeper research** (`/gsd-plan-phase --research-phase 7`). Covers `toggleCompleteInstance` occurrence snapping, occurrence materialization, whether the toggle stops timers, and the date basis of `completedDate` near midnight.
- **Phases 5, 6 and 8: standard patterns.** They reuse v0.2 seams, so skip research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new dependencies. Surfaces read from the 4.13.0 and 4.13.8 bundles plus upstream contract and docs. The `customFrontmatter` typing gap is MEDIUM. |
| Features | HIGH / MEDIUM | Mostly settled decisions. Seven gaps have recommendations but need user confirmation. Comparisons with reference products (Sunsama, Things, Todoist) come from general knowledge. |
| Architecture | HIGH | Based on the actual `src/` seams with line references. Recurring snapping and cache behavior after registration are MEDIUM (code read, not exercised). |
| Pitfalls | HIGH / MEDIUM | Write-semantics facts come from the bundle. Multi-device sync and mobile touch behavior are MEDIUM. |

**Overall confidence:** HIGH for the plan. MEDIUM for the two behaviors the Phase 4 and Phase 7 spikes must confirm.

### Gaps to Address
- **Unstage representation:** decide in requirements, then confirm in the Phase 4 spike.
- **Recurring completion edge cases:** research in Phase 7, using seeded recurring fixtures and a double-click test.
- **Field registration and the cache:** confirm in the Phase 4 spike, and adjust the setup notice copy.
- **Multi-device data.json:** implement the merge, and verify with MEDIUM confidence (ask the user whether they sync plugin settings).
- **Mobile:** best effort only. Verification is limited to emulation unless the user tests on a device.

## Sources

### Primary (HIGH confidence)
- TaskNotes 4.13.0 bundle (Personal Vault) and 4.13.8 bundle (dev vault): `updateTask`, `m2`/`wz`/`dfe`, `$Ee`/`BEe` (customFrontmatter delete, read-back echo), `p2`/`bz` (user-field mapping), `toggleRecurringComplete`, `hN`/`kM`, `JTe`/`Ece`, `getUserFields`, `normalizeRawEvent`.
- `callumalpass/tasknotes` tag 4.13.0: `src/api/runtime-api.ts` (capabilities, `TaskNotesTaskPatch`, catalog, tasks, recurring, settings), `docs/javascript-api.md`.
- `@tasknotes/model@0.2.2` types: `TaskInfo`, `TaskUpdateInput.customFrontmatter`, `UserMappedField`.
- `obsidian@1.14.4` `obsidian.d.ts`, and `eslint-plugin-obsidianmd` 0.4.2 rule sources.
- This repo's `src/` (TaskNotesBridge, TimerStore, TimerController, CardOrderStore, PauseStore, TimerPaneView, main.ts, settings), `tests/`, and `STAGING-DECISIONS.md`.

### Secondary (MEDIUM confidence)
- Upstream `runtime-api.ts` on main (4.18.1), via WebFetch: event payload `context`/`before`/`after`.
- General knowledge of Sunsama, Things and Todoist "today" UX, and of HTML5 drag not working with touch in mobile WebViews.

### Tertiary (LOW confidence)
- TaskNotes user-fields and task-properties doc pages (corroborating only).

---
*Research completed: 2026-11-12*
*Ready for roadmap: yes*
