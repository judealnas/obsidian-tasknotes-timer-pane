# Phase 4: Staging Foundations - Context

**Gathered:** 2026-11-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds no Staged UI. At the end of it, the plugin:

- knows the fixed frontmatter key that marks a task as staged (`staged`) and what "today" means (the staging day, set by a configurable rollover hour);
- can tell whether the running TaskNotes supports staging and whether `staged` is registered as a date user field;
- saves the new rollover-hour setting without resetting any other setting.

It also runs a dev-vault spike that confirms the TaskNotes behaviors Phases 6 and 7 depend on.

Requirements: **SETUP-01** (narrowed to the rollover hour, see D-02) and **ROLL-01**. **SYNC-05 was removed from scope in this discussion** (D-01).

</domain>

<decisions>
## Implementation Decisions

### Scope change: multi-device
- **D-01:** Multi-device operation is **out of scope**. SYNC-05 (cross-device data.json merge) is dropped from Phase 4 and from v0.3. Phase 4 does not add an `onExternalSettingsChange` merge, tombstones or merge UI.
  - Single-device data safety stays in scope. Every new data.json key (in Phase 4, `rolloverHour`) goes into `OWNED_KEYS` and is written by `persistAll`, so stale "extras" never come back and saving one setting never wipes another.
  - Phases 6 and 7 add their own keys (`stagedOrder`, `doneToday`) the same way.
  - **Reversibility:** reversible. A merge can be added later on top of the same `persistAll`/`OWNED_KEYS` seam.

### Staged field key
- **D-02:** The staged frontmatter key is **hard-coded as `staged`**, one exported constant (for example `STAGED_FIELD_KEY`) in a single module. There is **no settings text box**, no key validation (core-field / `fieldMapping` rejection), and no key-change warning. SETUP-01 now covers only the rollover hour. — **Reversibility:** reversible. Every consumer reads the constant, so turning it into a setting later is a one-module change plus settings UI.
- **D-03:** The field-registration check is still built in this phase as a pure function over `catalog.userFields()` for the key `staged`. It returns `missing`, `wrong-type` (not `date`) or `ok`, plus `unknown` when the catalog can't be read. If the spike shows `userFields()` returns `defaultValue`, the check also reports it (for Phase 6's "no default value" notice).
  - Phase 4 shows this status nowhere. The settings page does not display it; Phase 6's Staged-tab setup notice is its first consumer.
- Carried forward (not re-discussed): unstage writes `{staged: null}` only, with no `customFrontmatter`. The check uses `catalog.userFields()` and never `settings.snapshot()`.

### Rollover-hour setting
- **D-04:** The control is an Obsidian **dropdown** with 24 options, values 0–23, default **4**. The user confirmed a native select is fine: it is one line closed and scrolls when open.
- **D-05:** Labels use the **12-hour format**: "12 AM", "1 AM", … "11 AM", "12 PM", "1 PM", … "11 PM". Labels are fixed strings, not taken from the system locale.
- **D-06:** The setting has a **description** explaining the rule, for example: "The staging day starts at this hour. Earlier times count toward the previous day, so at 4 AM, 1:30 AM is still yesterday." Exact copy is the planner's choice, but it must satisfy the obsidianmd sentence-case lint.
- **D-07:** It saves on change through the shared `saveSettings`, which must spread `getSettings()`. That means **fixing the `saveChoice` spread bug first** (`src/ui/TimerPaneSettingTab.ts:51` currently passes `{ completionStatus: choice }` and drops other keys). `loadSettings` accepts only integers 0–23 and falls back to 4 otherwise.
- Carried forward: `stagingDay(nowMs, rolloverHour)` is pure (`src/model/stagingDay.ts`) and uses local-getter calendar math (`setHours`, not millisecond subtraction), so it is DST-safe. It is never stored. It is proven by frozen-clock tests across a timezone matrix, covering 1:30 AM → previous day, 4:00 AM → new day, and both DST transition days.

### TaskNotes staging contract
- Carried forward: the new bridge methods are feature-gated through `featureApi`: `updateTask` (`tasks.write`), `userFields` (`catalog.read`), `toggleCompleteInstance` (`recurring.write`), `stagingAvailability()` and `recurringAvailability()`. They are **not** added to `REQUIRED_CAPABILITIES`, so Timers keeps working on 4.10–4.12. The staging floor is TaskNotes 4.13.0. Below it, or without the capabilities, availability reports "unavailable". The vendored types and `tests/fakes/fakeGateway.ts` grow to match, and each addition is pinned in `tests/contract.test.ts`.

### Dev-vault spike
- **D-08:** The spike is **scripted** through Obsidian CLI `obsidian eval` against the dev vault, with Claude running it and reporting results. A short manual checklist covers anything the script can't reach.
  - This is a one-off probe. It doesn't reverse Phase 1 D-03 (hot-reload, not CLI `plugin:reload`), and it adds no recurring smoke script.
- **D-09:** The spike runs on **TaskNotes 4.13.8 in the dev vault only** (`C:\Users\ja384\Home\obsidian-tasknotes-timer-pane\dev-vault`). It **never touches the Personal Vault**. Findings are pinned in contract tests. The 4.13.0 floor is accepted on the strength of the earlier research's reading of the 4.13.0 bundle.
- **D-10:** The spike answers four questions, and it runs **first**, before the contract code is finalized:
  1. Raw frontmatter after `tasks.update(path, {staged: null})`: does it leave an empty `staged:` that `readStaged` treats as not staged?
  2. The exact shape of `catalog.userFields()`, including whether `defaultValue` is present.
  3. After registering `staged` as a date user field, does already-cached TaskInfo show it without a TaskNotes reload? The answer sets the Phase 6 setup-notice copy, for example whether to say "reload TaskNotes".
  4. `recurring.toggleCompleteInstance(path, offScheduleDay)`: which instance is recorded? This feeds Phase 7 research.
  - Registering `staged` in the dev vault's TaskNotes settings is expected. Optionally, add it to `dev-vault-seed/`.

### Claude's Discretion
- File and module names for the constant, the `fieldStatus` function and the spike script. The spike script lives under a scratch or `scripts/` path, not `src/`.
- The exact description copy for the rollover hour (within D-06).
- Whether `rolloverHour` is omitted from data.json while it is still the default. Follow the existing `cardOrder` "omit when empty" pattern only if it doesn't complicate `loadSettings`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` § Phase 4: goal, success criteria and notes (updated after this discussion: SYNC-05 removed, key fixed)
- `.planning/REQUIREMENTS.md`: SETUP-01 (narrowed), ROLL-01. SYNC-05 is moved to Out of Scope.
- `.planning/research/STAGING-DECISIONS.md`: settled design log (Q9 key, Q15 registration, Q19 rollover). Q9's "can be changed in settings" is superseded by D-02.

### Research (TaskNotes facts and module design)
- `.planning/research/SUMMARY.md`: Phase 4 scope, the reconciled conflicts (use `catalog.userFields`, not `settings.snapshot`), pitfall list
- `.planning/research/ARCHITECTURE.md`: F1–F7 TaskNotes facts, the DayClock and staging-model module specs, bridge additions, the settings/main.ts integration table
- `.planning/research/PITFALLS.md`: the F1/F2 write path (unregistered keys dropped silently), DST and "today" pitfalls
- `.planning/research/STACK.md`: Runtime API surfaces and capabilities for 4.13.x

### Prior phase decisions
- `.planning/milestones/v0.2-phases/01-live-timer-pane/01-CONTEXT.md` D-03: hot-reload dev loop, no CLI reload (still stands; D-08 is a one-off probe)
- `.planning/milestones/v0.2-phases/03-pause-resume/03-CONTEXT.md`: `persistAll`/`fileSettings` single-writer rules

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/main.ts` `persistAll` / `OWNED_KEYS` / `extrasOf`: the single data.json writer. New settings keys are added here.
- `src/settings.ts` `loadSettings` / `DEFAULT_SETTINGS`: extend with `rolloverHour`, using the same defensive parsing style.
- `src/ui/TimerPaneSettingTab.ts`: the existing dropdown pattern (`addDropdown`, generation guard, disable-while-saving, failure Notice). Reuse it for the rollover-hour dropdown.
- `src/tasknotes/TaskNotesBridge.ts` `featureApi` / `startAvailability` (around line 200): the model for `stagingAvailability()`. `REQUIRED_CAPABILITIES` is at line 21 and must not change.
- `tests/fakes/fakeGateway.ts`, `tests/contract.test.ts`: extend for the new bridge methods and vendored types.

### Established Patterns
- Pure model in `src/model/` with no Obsidian runtime (`timeMath`, `pauseLedger`), tested in Vitest with plain objects and passing `nowMs`.
- Defensive loaders never throw, and they cap their input (`loadPauseRecords`, `loadCardOrder`).
- The obsidianmd lint rules apply: sentence-case UI text, no inline styles, `registerInterval` only.

### Integration Points
- `saveSettings` in `main.ts` (`persistAll(settings)`, then `store.refreshNow()`). The settings tab must pass the full settings object.
- `settings.changed` is already forwarded by the bridge as a data hint, so it is the re-check trigger for `fieldStatus` in later phases.

</code_context>

<specifics>
## Specific Ideas

- The user asked for simplicity: a fixed `staged` key rather than a configurable one.
- A 12-hour clock for the rollover labels.

</specifics>

<deferred>
## Deferred Ideas

- **Cross-device data.json merge (former SYNC-05):** out of scope. Revisit only if multi-device use becomes a goal. If it does, it would need per-key merge rules and possibly tombstones.
- **Configurable staged key:** dropped for simplicity. If it comes back, it needs a settings text box, key validation (core fields and `fieldMapping` values), a key-change warning, and a live registration status.

</deferred>

---

*Phase: 04-staging-foundations*
*Context gathered: 2026-11-12*
