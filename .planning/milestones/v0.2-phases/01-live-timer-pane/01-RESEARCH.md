# Phase 1: Live Timer Pane - Research

**Researched:** 2026-10-13
**Domain:** Obsidian companion plugin (TypeScript, vanilla `ItemView`) integrating in-process with TaskNotes Runtime API v1
**Confidence:** HIGH overall. TaskNotes behavior was read directly from source at `callumalpass/tasknotes@451679289d94` (v4.13.8, the same commit as the project research). Obsidian API was read from `obsidian@1.14.4/obsidian.d.ts`. The toolchain was **executed** end to end in a scratch probe (install, tsc, vitest, esbuild, eslint). Obsidian-internal behavior (`app.plugins` across disable/enable) is ASSUMED and flagged.

> Seam note: `classify-confidence` rates `github`/`webfetch`/`npm` as LOW. Findings below tagged `[VERIFIED: …]` were read verbatim from primary source files opened this session, or proven by running tools. That is why they are treated as HIGH, the same treatment as the project-level research.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Dev vault & build loop
- **D-01:** Develop and test only in a **separate dev vault**, never the user's real vault. A bug in the stop path must not be able to damage real `timeEntries`.
- **D-02:** The dev vault lives **inside the repo as a git-ignored folder** (`dev-vault/`). It contains:
  - `.obsidian/plugins/tasknotes-timer-pane/`, the esbuild output target
  - a few seeded task notes: open tasks, one with existing closed `timeEntries` so totals are non-trivial, and one archived
  - short setup notes, for example a `dev-vault/README` or a section in the repo README

  The user installs TaskNotes and Hot Reload into it by hand, once. Commit the seed notes through a tracked template (for example `dev-vault-seed/` copied by a script) or by un-ignoring specific paths; the planner picks. Never commit `.obsidian/plugins/tasknotes/` or other third-party plugin binaries.
- **D-03:** Reload with the **pjeby/hot-reload** plugin (0.3.1) and a `.hotreload` marker file in the plugin output folder. `npm run dev` runs esbuild in watch mode and writes `main.js`, `manifest.json` and `styles.css` into the dev-vault plugin folder. Don't use Obsidian CLI `plugin:reload`.
- **D-04:** Test against the **latest TaskNotes only** (4.13.x). Don't install TaskNotes 4.10.0 by hand. Cover the missing and too-old states by disabling TaskNotes in the dev vault, and with unit tests that fake `apiVersion` and capabilities through the fake gateway.

#### Archived-task timers (edge case, resolves the UI-SPEC "unresolved" row)
Verified in TaskNotes 4.13.8 source:
- `SettingsLifecycleService.handleAutoStopTimeTracking` auto-stops a tracker only when the status changes from not-completed to completed (or a recurring instance completes). The setting is `autoStopTimeTrackingOnComplete`, default `true`.
- `TaskService.toggleArchive` never touches time tracking. So archiving a task that isn't done leaves its timer running, and the status bar then hides it.

The user wants completion handling left to TaskNotes, and the pane to cover only the archive gap.

- **D-05:** The pane does **not** add any auto-stop for completed or done tasks. That stays TaskNotes' job, through its own setting, even though TaskNotes' rule doesn't fire for hand-edited YAML or Sync (no `originalTask`). A running timer on a done task is shown normally.
- **D-06:** Follow TaskNotes' setting for archived timers:
  - **Setting on:** the plugin auto-stops any running timer whose task is archived (`TaskInfo.archived === true`).
  - **Setting off:** the plugin leaves archived timers running and shows them with a muted **"Archived"** label in the card's status row.

  Read the setting through the Runtime API only, never internals. Prefer `api.settings.snapshot().autoStopTimeTrackingOnComplete` (capability `settings.snapshot`) and fall back to `api.model.config().timeTracking.autoStopOnComplete` (capability `model.read`). Re-read on the lifecycle `settings.changed` event. **If neither capability exists, treat the setting as off:** label only, never auto-stop. — **Reversibility:** reversible
- **D-07:** Auto-stop runs **whenever the plugin sees an archived running timer, whether or not the pane is open**. That covers:
  - a live archive event (`task.updated`)
  - archived timers found on startup or bridge ready
  - archived timers found on any store refresh or safety resync

  So it lives at plugin or store level, not in the view.
- **D-08:** Auto-stop writes only through `api.time.stop(path, context)` with `context = { source: "tasknotes-timer-pane", reason: "auto-stop: task archived", correlationId }`. The end time is always "now", because `api.time.stop` has no stop-time parameter. Recording the archive time would mean writing `timeEntries` directly, which is forbidden. An entry may therefore include time after archiving, and that's accepted.
- **D-09:** Notification follows **TaskNotes' `autoStopTimeTrackingNotification` setting** (default off). Read it from the same source as D-06, either `settings.snapshot()` or `model.config().timeTracking.autoStopNotification`. When it's on, show a `Notice` that mirrors TaskNotes' wording, for example `Auto-stopped time tracking for: {title} (task archived)`. When it's off, stop silently. Auto-stop failures are always logged to the console. Whether a failure also shows a Notice is up to Claude, but avoid a Notice on every resync.
- **D-10:** Auto-stop must be safe against repeats and races:
  - Allow at most one stop in flight per `(taskPath, startTime)`.
  - Treat a "no active session" error as benign.
  - Use the same serialized write path as the manual Stop.
  - Never retry in a tight loop, since the store refreshes on its own echo events.
  - Unarchiving does nothing.

  If an archived timer would otherwise be the primary card, it may show briefly before the stop lands. That's acceptable; no special hiding is needed.
- **D-11:** When archived timers are shown (setting off), apply the normal primary rule: latest `startTime` wins, ties broken by path ascending (DISP-06). Archived timers count toward "+N more running" like any other timer.

#### Verification depth
- **D-12:** Automated tests use Vitest and cover pure logic plus a fake bridge. No DOM or view tests, and no `obsidian-test-mocks` in Phase 1. Covered:
  - time math: elapsed, total in seconds including the open entry, H:MM:SS format and negative clamp
  - primary selection and tie-break, plus the "+N" count
  - store derivation and change detection by `(taskPath, startTime)`
  - bridge availability states, faked through a `TaskNotesGateway` interface
  - auto-stop rules D-06..D-10: setting on, off, or missing capability; dedupe; benign error
- **D-13:** In-Obsidian behavior is verified with a **written manual UAT checklist** run in the dev vault at the end of the phase. It covers:
  - ribbon and command open and reveal with no duplicate, and restart persistence
  - start and stop from the status bar and task cards
  - hand-edited YAML
  - TaskNotes disable, re-enable and update
  - sleep/wake accuracy (±1 s against the status bar)
  - several timers at once
  - archiving a timed task with auto-stop on, then with it off
  - Stop failure and "no active session" race

  No Obsidian CLI smoke script.
- **D-14:** Every plan has a definition-of-done gate: `npm run build`, `tsc -noEmit`, `eslint` (including `eslint-plugin-obsidianmd` recommended) and `vitest run` must all pass before the plan counts as complete.

### Claude's Discretion
- How the dev-vault seed is tracked (template folder plus copy script, or selective un-ignore)
- Whether an auto-stop failure shows a Notice, without spamming on resync
- Exact Notice wording (sentence case, mirroring TaskNotes)
- Where the "Archived" label sits in the status row, and its class name (`tntp-` prefix, Label role, `--text-muted`, no accent)
- Safety-resync interval (research suggests 30-60 s), event debounce (150-250 ms), probe interval (UI-SPEC says 5 s)

### Deferred Ideas (OUT OF SCOPE)
- **Upstream suggestion:** TaskNotes could apply its own auto-stop rule on archive as well as on completion. If it ever does, the pane's archive auto-stop (D-06..D-10) becomes redundant and can be removed. Not filed; it's just a note.
- **Repo and release setup** (GitHub repo, first BRAT release, manifest author and license): not discussed. The planner applies sensible defaults from STACK.md, or it's handled when the release becomes relevant.
- **Deleted or unreadable task files with an open entry:** not discussed. The UI-SPEC basename fallback covers display; anything more belongs to the Phase 2+ hardening areas.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PANE-01 | Open from ribbon; right sidebar; reveal instead of duplicate | Pattern 7 (`getLeavesOfType` → `revealLeaf`, else `ensureSideLeaf`). `revealLeaf` uncollapses the sidedock [VERIFIED: obsidian.d.ts 1.14.4:10985-10992] |
| PANE-02 | Open from command palette | Same `activateView()`; command id/name pass the obsidianmd command rules (probe-verified) |
| PANE-03 | Pane persists across restart | `registerView` synchronously in `onload`; never `detachLeavesOfType` in `onunload` (`obsidianmd/detach-leaves` rule); view renders from bridge state on restore (Pattern 6) |
| DISP-01 | Title shown; click opens note | `entry.task.title` with basename fallback; `openLinkText(path, "", Keymap.isModEvent(evt))` [VERIFIED: obsidian.d.ts:5478-5487, 10860] |
| DISP-02 | Session H:MM:SS ticking, from start time | `timeMath.sessionMs = max(0, now − Date.parse(startTime))`, identical to the TaskNotes status bar computation [VERIFIED: StatusBarService.ts:329-340] |
| DISP-03 | Total incl. running session, to the second | Sum over `ActiveTimeEntry.task.timeEntries` in ms; **not** `api.time.task()`, which floors each entry to whole minutes [VERIFIED: timeTrackingUtils.ts:77-91] |
| DISP-05 | Clear message when missing/disabled/<4.10 | Bridge states `missing / incompatible / loading / ready` with the refined detection in Pattern 1 |
| DISP-06 | Most recently started timer shown | `selectPrimary`: max parsed `startTime`, tie → path ascending; others → "+N more running" |
| CTRL-01 | One-click stop; status bar shows stopped | `api.time.stop(path, ctx)` → TaskService emits `task-updated` with `originalTask` → status bar refreshes 100 ms later [VERIFIED: TaskService.ts:1719-1723; main.ts:437-444] |
| SYNC-01 | External start/stop visible ≤ ~1 s | Subscribe `task.updated` (one raw event covers all TaskNotes writes) → 200 ms trailing debounce → `api.time.active()` |
| SYNC-02 | Sync / hand-edited YAML visible | Metadata path emits `task-updated` **without** `originalTask` after a 300 ms debounce → still `task.updated`. File deletes emit **no** runtime event, so also listen to `vault.on("delete"/"rename")` and run a safety resync [VERIFIED: TaskManager.ts:58, 166-205; TaskService.ts:1869 is the only `task-deleted` emitter] |
| SYNC-03 | Reconnects after disable/enable/update without restart | 5 s probe + `unloading` handling + a **retired-API set** so a torn-down `api` is never re-attached (Pattern 1, Pitfall 1) |
| SYNC-04 | Elapsed correct after sleep/wake | Wall-clock derivation every tick; tick-gap detection (> 3 s) plus `visibilitychange`/`focus` trigger an immediate tick and a store refresh (Pattern 5) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Directives in `.claude/CLAUDE.md` carry the same authority as locked decisions:

- **TaskNotes dependency:** the pane is a companion. It must degrade gracefully when TaskNotes is missing, disabled, too old, or reloaded.
- **Data format:** write time entries only through TaskNotes' own APIs (`api.time.start` / `api.time.stop`). Never `processFrontMatter`, `tasks.update({timeEntries})` or `time.append`.
- **Compatibility:** Runtime API v1 only (TaskNotes ≥ 4.10.0). **Never TaskNotes internals** (`taskService`, `cacheManager`, `emitter`, `statusBarService`).
- **Detection:** gate on `api.apiVersion === 1 && api.hasCapability(...)`, never on version strings for features. A version string is display-only.
- **Platform:** `isDesktopOnly: false`, verified on desktop only. No Node APIs in `src/` (`types: []` in tsconfig enforces this).
- **Stack (pinned):** `obsidian@1.14.4` exact, TypeScript `~6.0.3` (not 7.x), esbuild `0.28.2` exact (fallback 0.25.5), ESLint `^9.39.5` (not 10.x), `@eslint/js ^9.39.5`, `typescript-eslint ^8.71.2`, `eslint-plugin-obsidianmd ^0.4.2`, `globals`, `jiti`, Vitest `^5.0.4`, `@types/node ^24`. `minAppVersion` `1.12.2`. No runtime `dependencies`.
- **UI:** vanilla Obsidian DOM in `ItemView`. No frameworks, `innerHTML` or inline styles.
- **Timers/events:** always `registerInterval(window.setInterval(...))` and `registerEvent`. No bare `setInterval`.
- **Types:** vendor a trimmed, types-only copy of the runtime API contract. Do not import TaskNotes source. `@tasknotes/runtime-api` does not exist on npm.
- **`app.plugins`:** tiny local module augmentation, not `obsidian-typings`.
- **Not used:** TaskNotes HTTP API, `zczs520/tasknotes` fork, `manifest-beta.json`, Obsidian CLI `plugin:reload` (D-03).
- **GSD workflow:** repo edits happen only through GSD commands. Executor tasks run inside `/gsd-execute-phase`.
- **User memory:** follow TaskNotes' own settings and mechanisms (auto-stop, notification). Fill only gaps, gated on TaskNotes settings (this is what D-05..D-09 do).

## Summary

The project research already fixed the stack and architecture (Bridge → Store/timeMath → Controller → View). This phase research **verified and deepened** them against primary sources, and changed several details the planner must carry into tasks:

1. **Readiness is three different signals, and only one is safe for reads.** `lifecycle.ready()` resolves at the *end of TaskNotes `onload`*, which is **before** layout-ready initialization. `isReady()` returns `initializationComplete`, which flips to `true` at the **start** of `initializeAfterLayoutReady`. The `layout.ready` event fires at the **end** of that function and **never fires if an initialization step throws**. `lifecycle.on("ready")` *replays* to late subscribers; `layout.ready` does not. Rule: gate reads on `isReady()`, treat `layout.ready` as an extra refresh trigger, and let the 5 s probe cover the case where `layout.ready` never arrives. Do **not** use `await api.lifecycle.ready()` as the read gate.
2. **One API call per refresh is enough.** `api.time.active()` returns `ActiveTimeEntry[]`, and each `task` is a deep copy including **all** `timeEntries` and `archived`. That one call supplies the primary timer, the total in ms, the "+N" count, titles for the tooltip, and the archived flag for D-06. No `tasks.list()` or `time.task()` is needed in Phase 1.
3. **Stop errors are plain `Error`s, not `TaskNotesApiError`.** `api.errors.normalize(e)` wraps them as `code: "operation_failed"` with the original message. Benign-race detection must therefore match the message `"No active time tracking session for this task"`; the code cannot distinguish it.
4. **Deleting a task file in Obsidian emits no runtime event.** `task-deleted` comes only from `TaskService.deleteTask`. Listen to Obsidian `vault.on("delete" | "rename")` (public API) and keep the safety resync.
5. **The disabled-TaskNotes trap.** On disable, TaskNotes fires `unloading`, then `cleanupPluginRuntime` sets `initializationComplete = false` and destroys the cache. Its emitter (`emitter === cacheManager`) keeps our listeners registered. If a probe ever re-attaches that same dead `api` object, the bridge sits in `loading` forever. Keep a `WeakSet` of retired API objects.
6. **Toolchain probe passed.** `obsidian@1.14.4 + typescript@6.0.3 + esbuild@0.28.2 + eslint@9.39.5 + eslint-plugin-obsidianmd@0.4.2 + typescript-eslint@8.71.2 + vitest@5.0.4` installs with no ERESOLVE. `tsc -noEmit`, `vitest run`, the esbuild bundle and `eslint .` all pass on a skeleton using the patterns below. Two config fixes were needed (Pitfalls 8 and 9).

**Primary recommendation:** Build the four-layer skeleton (Bridge with a retired-API-aware state machine → Store with single-flight debounced `time.active()` refreshes → serialized WriteQueue shared by Stop and archive auto-stop → view that renders from the store and ticks from wall clock). Use the verified configs in Code Examples, and gate every plan on `npm run build && npm run lint && npm test`.

## Architectural Responsibility Map

The "tiers" of an in-process Obsidian plugin: the Obsidian shell (plugin registration and workspace), the presentation layer (the `ItemView`), the application layer (store and controllers, plugin-scoped), the integration layer (the bridge), and the external owner of data (TaskNotes, which writes the frontmatter).

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| View registration, ribbon, command, `activateView` | Obsidian shell (`main.ts`) | — | Must be registered synchronously in `onload` so Obsidian can restore the leaf (PANE-03) |
| Layout persistence | Obsidian (workspace.json) | — | Free. Only `type` is serialized; no `getState` override needed in Phase 1 |
| Rendering card / messages, 1 s tick, visibility handling | Presentation (`TimerPaneView`) | — | View-scoped `registerInterval`/`registerEvent`, cleared on close |
| Time math (session, total, format, primary, +N) | Application, pure module (`model/timeMath.ts`) | — | Obsidian-free, unit-tested (D-12) |
| Snapshot, debounce, change detection, safety resync | Application (`TimerStore`, plugin-scoped) | — | Must run even with the pane closed (D-07 auto-stop) |
| Manual Stop orchestration | Application (`TimerController` + `WriteQueue`) | Presentation (busy button) | One serialized write path for Stop and auto-stop (D-10) |
| Archived-timer auto-stop | Application (`ArchiveAutoStopper`, plugin-scoped) | Integration (settings read) | D-07: lives at store/plugin level, not in the view |
| TaskNotes discovery, version/capability gate, lifecycle, events | Integration (`TaskNotesBridge`) | — | The only module that touches `app.plugins` or `api` |
| Time-entry writes (`endTime`), locking, status bar refresh | External: TaskNotes | — | `api.time.stop` → `TaskService.stopTimeTracking` (per-path lock, field mapping) |
| Persistence of time data | Task note frontmatter (owned by TaskNotes) | — | The pane never writes or caches time data across sessions |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `obsidian` (typings) | 1.14.4 (exact) | Plugin/ItemView/Workspace types | Matches the installed app; latest on npm [VERIFIED: npm registry, published 2026-10-08] |
| `typescript` | ~6.0.3 | `tsc -noEmit` type check | typescript-eslint 8.71.2 peer `>=4.8.4 <6.1.0` [VERIFIED: npm view]. Probe compiled the skeleton clean [VERIFIED: probe run] |
| `esbuild` | 0.28.2 (exact) | Bundle `src/main.ts` → `main.js` (CJS, es2021) | Sample-plugin standard; probe bundle OK [VERIFIED: probe run] |
| TaskNotes (runtime) | ≥ 4.10.0; dev vault uses 4.13.x (D-04) | Data owner + `api.time.*` | Runtime API v1 [VERIFIED: tasknotes manifest.json 4.13.8, runtime-api.ts:38] |

### Supporting (dev only)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `eslint` | ^9.39.5 (the `maintenance` dist-tag) | Lint (D-14) | Always. npm prints `deprecated eslint@9.39.5: This version is no longer supported`. Expected; 10.x is not compatible with obsidianmd's transitive deps (STACK.md) |
| `@eslint/js` | ^9.39.5 | Base rules | Peer of obsidianmd (`^9.30.1`) |
| `typescript-eslint` | ^8.71.2 | TS parser, `projectService` | Always |
| `eslint-plugin-obsidianmd` | ^0.4.2 | Review-bot rules (`no-unsupported-api`, `detach-leaves`, `validate-manifest`, `ui/sentence-case`, …) | Always |
| `globals` | ^17.13.0 | `globals.browser` | Always |
| `jiti` | ^2.7.0 | Load `eslint.config.mts` | Always |
| `vitest` | ^5.0.4 | Unit tests (D-12) | Always; Node 24.13.1 satisfies `^22.12.0\|\|^24.0.0\|\|>=26.0.0` [VERIFIED: npm view engines] |
| `@types/node` | ^24.19.2 | Types for build scripts only | Not visible to `src/` because `types: []` |
| Hot Reload (Obsidian plugin) | 0.3.1 | Dev-vault auto-reload (D-03) | Installed by the user, by hand, into the dev vault only |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `api.time.active()` per refresh | `api.tasks.list()` | `active()` already includes each active task's full `timeEntries`. `tasks.list()` is only needed for Phase 2's picker |
| ms-sum total from `timeEntries` | `api.time.task(path).summary.totalMinutes` | TaskNotes floors each entry to whole minutes, which violates "to the second" (DISP-03) |
| `ensureSideLeaf` | `getRightLeaf(false)` + `setViewState` + `revealLeaf` | Equivalent. `ensureSideLeaf` is one call and `@since 1.7.2` (fine under 1.12.2) |

**Installation (verified to resolve with no ERESOLVE on npm 11.8.0):**
```bash
npm install -D obsidian@1.14.4 typescript@~6.0.3 esbuild@0.28.2 \
  eslint@^9.39.5 @eslint/js@^9.39.5 typescript-eslint@^8.71.2 \
  eslint-plugin-obsidianmd@^0.4.2 globals@^17.13.0 jiti@^2.7.0 \
  vitest@^5.0.4 @types/node@^24.19.2
```

**Version verification (npm registry, 2026-10-13):** obsidian 1.14.4 (2026-10-08) · typescript 6.0.3 (2026-04-16) · esbuild 0.28.2 (2026-08-08) · eslint 9.39.5 (2026-07-10) · @eslint/js 9.39.5 (2026-07-10) · typescript-eslint 8.71.2 (2026-10-12) · eslint-plugin-obsidianmd 0.4.2 (2026-08-24) · globals 17.13.0 (2026-10-01) · jiti 2.7.0 (2026-05-05) · vitest 5.0.4 (2026-10-12) · @types/node 24.19.2 (2026-10-09). npm `latest` tags to **avoid**: typescript 7.0.2, eslint 10.12.0, @eslint/js 10.0.1, @types/node 26.6.5.

## Package Legitimacy Audit

Run via `gsd-tools query package-legitimacy check --ecosystem npm …` on 2026-10-13. Every flag is the seam's `too-new` heuristic. It looks at each package's **latest** publish date, not at the pinned version, and the flagged packages are the canonical ones from official docs and the sample plugin.

| Package | Registry | Age (pinned ver.) | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| obsidian | npm | 5 days (1.14.4) | 142k | github.com/obsidianmd/obsidian-api | [SUS] too-new | Flagged: planner adds checkpoint |
| typescript | npm | 6 mo (6.0.3) | 308M | github.com/microsoft/TypeScript | [OK] | Approved |
| esbuild | npm | 2 mo (0.28.2) | 304M | github.com/evanw/esbuild | [OK] (postinstall `node install.js`) | Approved. The postinstall verifies or fetches the platform binary; known upstream behavior |
| eslint | npm | 3 mo (9.39.5) | 161M | github.com/eslint/eslint | [SUS] too-new (latest 10.x) | Flagged: planner adds checkpoint |
| @eslint/js | npm | 3 mo | 139M | github.com/eslint/eslint | [OK] | Approved |
| typescript-eslint | npm | 1 day (8.71.2) | 89M | github.com/typescript-eslint/typescript-eslint | [SUS] too-new | Flagged: planner adds checkpoint |
| eslint-plugin-obsidianmd | npm | 7 wk | 33k | github.com/obsidianmd/eslint-plugin | [OK] | Approved |
| globals | npm | 12 days | 258M | github.com/sindresorhus/globals | [SUS] too-new | Flagged: planner adds checkpoint |
| jiti | npm | 5 mo | 192M | github.com/unjs/jiti | [OK] | Approved |
| vitest | npm | 1 day (5.0.4) | 125M | github.com/vitest-dev/vitest | [SUS] too-new | Flagged: planner adds checkpoint |
| @types/node | npm | 4 days (24.19.2) | 461M | github.com/DefinitelyTyped/DefinitelyTyped | [SUS] too-new | Flagged: planner adds checkpoint |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `obsidian`, `eslint`, `typescript-eslint`, `globals`, `vitest`, `@types/node`. **Recommendation:** add **one** `checkpoint:human-verify` before the scaffold's `npm install` that lists these six with their repo URLs. All come from the sample plugin or official docs, so the check is quick. Alternatively, pin to slightly older patch versions: `typescript-eslint@8.71.1` or `vitest@5.0.3` would clear the "1 day old" signal.

`postinstall` scan: only esbuild has one (`node install.js`). That is upstream's documented platform-binary installer, so it is not escalated.

## Architecture Patterns

### System Architecture Diagram

```
                ┌──────────── Obsidian shell (main.ts, onload) ────────────┐
 ribbon/cmd ───▶│ activateView(): getLeavesOfType → revealLeaf | ensureSideLeaf│
                └──────────────┬───────────────────────────────────────────┘
                               │ creates (plugin-scoped singletons)
   Obsidian vault "delete"/"rename" ──┐
   5 s probe interval ───────────────┐│
                                     ▼▼
 app.plugins.getPlugin("tasknotes") ──▶ TaskNotesBridge (state machine)
   └─ .api (Runtime API v1)              state: missing│incompatible│loading│ready
        ▲      │ events: task.updated, task.deleted          │ "state" / "data" events
        │      │ lifecycle: layout.ready, cache.changed,     ▼
        │      │   cache.rebuilt, settings.changed, unloading
        │      └──────────────────────────────▶ TimerStore (200 ms trailing debounce,
        │                                        single-flight, 45 s safety resync)
        │                                        refresh(): await api.time.active()
        │                                          → timeMath.deriveSnapshot()
        │                                          → signature changed? emit "changed"
        │                                             │                 │
        │                                             ▼                 ▼
        │                              ArchiveAutoStopper (D-06..D-10)   TimerPaneView
        │                                reads settings (snapshot/model)   render on "changed"
        │                                archived & setting on? ──┐        1 s tick: text only
        │                                                         ▼        (wall clock)
        │                                    WriteQueue (serial) ◀── TimerController.stop()
        │                                         │                      ◀── Stop click
        └──── api.time.stop(path, ctx) ◀──────────┘
               TaskNotes: per-path lock → processFrontMatter(endTime) → emit "task-updated"
               → status bar refresh (+100 ms) and runtime "task.updated" → back to Bridge
```

### Recommended Project Structure
```
src/
├── main.ts                     # Plugin: wire singletons, registerView, ribbon, command, activateView
├── constants.ts                # VIEW_TYPE_TIMER_PANE, MUTATION_SOURCE, intervals
├── obsidian-augment.d.ts       # App.plugins?.getPlugin(id) augmentation
├── tasknotes/
│   ├── runtime-api.types.ts    # Vendored, trimmed, type-only subset (header: source commit 451679289d94, MIT)
│   ├── gateway.ts              # TaskNotesGateway interface (what tests fake)
│   └── TaskNotesBridge.ts      # Implements gateway over the real api; state machine
├── model/
│   ├── timeMath.ts             # parse, sessionMs, totalMs, formatHms, selectPrimary, deriveSnapshot
│   └── errors.ts               # isNoActiveSessionError, errorMessage (pure)
├── state/
│   ├── TimerStore.ts           # snapshot + debounce + single-flight + signature
│   ├── WriteQueue.ts           # serial promise chain
│   ├── TimerController.ts      # stop(displayed) with busy + Notice
│   └── ArchiveAutoStopper.ts   # D-06..D-10
├── ui/
│   └── TimerPaneView.ts        # ItemView: build once, update in place, tick
styles.css                      # tntp- BEM classes, Obsidian variables only (UI-SPEC)
tests/
├── timeMath.test.ts
├── store.test.ts
├── bridge.test.ts              # availability states through a fake app/api
├── autoStop.test.ts
└── fakes/fakeGateway.ts
dev-vault-seed/                 # tracked seed notes (D-02; recommended option)
scripts/seed-dev-vault.mjs      # copies dev-vault-seed/ → dev-vault/ (never touches .obsidian/plugins/tasknotes)
```

### Verbatim contract quotes (the source of truth for vendored types)

Every discrete value used in the code examples below is quoted here verbatim:

- Lifecycle events [VERIFIED: tasknotes src/api/runtime-api.ts:271-279]:
  `| "ready" | "layout.ready" | "settings.changed" | "cache.changed" | "cache.rebuilt" | "extension.registered" | "extension.unregistered" | "unloading";`
- Capabilities used [VERIFIED: runtime-api.ts:40-74]: `"model.read"`, `"tasks.events"`, `"time.read"`, `"time.write"`, `"settings.snapshot"`, `"lifecycle.events"`, `"errors.typed"`
- Task events used [VERIFIED: runtime-api.ts:80-99]: `"task.updated"`, `"task.deleted"`, `"task.archived"`. `"time.started"`/`"time.stopped"` are defined at :228-238.
- Mutation context [VERIFIED: runtime-api.ts:353-357]: `export interface TaskNotesMutationContext { source?: string; correlationId?: string; reason?: string; }`
- Error codes [VERIFIED: runtime-api.ts:359-371]: `"invalid_input", "invalid_task_path", "invalid_status", "task_not_found", "task_file_not_found", "file_already_exists", … "operation_failed"`. Error payload [:375-381]: `{ name: "TaskNotesApiError"; code; message: string; status: number; details?: unknown }`
- Active entry [VERIFIED: runtime-api.ts:453-458]: `export interface ActiveTimeEntry { taskPath: string; task: TaskInfo; entry: TimeEntry; index: number; }`
- Time API [VERIFIED: runtime-api.ts:804-820]: `stop(path: string, context?: TaskNotesMutationContext): Promise<TaskInfo>; active(): Promise<ActiveTimeEntry[]>;`
- Events API [VERIFIED: runtime-api.ts:854-861]: `on<EventName …>(event: EventName, handler: …): EventRef; off(ref: EventRef): void;`
- Settings API [VERIFIED: runtime-api.ts:863-865]: `snapshot(): Readonly<TaskNotesSettings>;`
- Lifecycle API [VERIFIED: runtime-api.ts:904-913]: `ready(): Promise<void>; isReady(): boolean; on<…>(event, handler): EventRef; off(ref: EventRef): void;`
- Lifecycle payload [VERIFIED: runtime-api.ts:890-899]: `{ event; timestamp: string; data?: unknown; settings?: Readonly<TaskNotesSettings>; … rawEvent: string; }`
- Root [VERIFIED: runtime-api.ts:1115-1118]: `readonly apiVersion: TaskNotesRuntimeApiVersion; readonly capabilities: readonly TaskNotesRuntimeApiCapability[]; hasCapability(capability: string): boolean;` with `TASKNOTES_RUNTIME_API_VERSION = 1 as const` [:38]
- Model config timeTracking [VERIFIED: @tasknotes/model@0.3.0-rc.9 dist/types/types.d.ts:176-180]: `export interface TimeTrackingConfig { autoStopOnComplete: boolean; autoStopNotification: boolean; defaultSessionDescription: string; }`
- Settings keys [VERIFIED: tasknotes src/types/settings.ts:177-178]: `autoStopTimeTrackingOnComplete: boolean; autoStopTimeTrackingNotification: boolean;`. Defaults [VERIFIED: src/settings/defaults.ts:331-332]: `autoStopTimeTrackingOnComplete: true, autoStopTimeTrackingNotification: false,`
- `TimeEntry` [VERIFIED: @tasknotes/model types.d.ts:16-21]: `{ startTime: string; endTime?: string; description?: string; duration?: number; }`
- `TaskInfo` fields used [VERIFIED: types.d.ts:30-56]: `title: string; status: string; path: string; archived: boolean; timeEstimate?: number; timeEntries?: TimeEntry[];`
- Stop error strings [VERIFIED: tasknotes src/services/TaskService.ts:1670, 1673, 1586]: `"No active time tracking session for this task"`, `"Active time tracking session has changed"`, `"Time tracking is already active for this task"`
- TaskNotes auto-stop notice [VERIFIED: src/services/SettingsLifecycleService.ts:197]: `` `Auto-stopped time tracking for: ${updatedTask.title}` ``

### Pattern 1: Bridge availability state machine (retired-API aware)

**What:** One class owns discovery, gating, subscriptions and the typed facade. States are `missing | incompatible | loading | ready`. The refined rules from source reading are:

| Observation | State | Evidence |
|-------------|-------|----------|
| `getPlugin("tasknotes")` is null | `missing` | — |
| Plugin present, `api` undefined, `manifest.version` < 4.10.0 | `incompatible` (show "Installed version: x") | `api` exists only since 4.10 (4.8 per ARCHITECTURE.md) |
| Plugin present, `api` undefined, version ≥ 4.10.0 | `loading` (TaskNotes is mid-`onload`; `api` is assigned after `await loadSettings()`) | [VERIFIED: main.ts:287, 311; pluginBootstrap.ts:113] |
| `api` is in the `retired` WeakSet | `missing` | Pitfall 1 |
| `apiVersion !== 1` or a required capability is missing | `incompatible` | [VERIFIED: runtime-api.ts:38, 1115-1118] |
| Attached and `api.lifecycle.isReady()` | `ready` | `isReady: () => this.plugin.initializationComplete === true` [VERIFIED: TaskNotesAPI.ts:914] |
| Attached and not ready | `loading`; re-checked on `layout.ready` **and** on every 5 s probe | `layout.ready` is emitted only inside `try` at the end of `initializeAfterLayoutReady` [VERIFIED: pluginBootstrap.ts:358-393] |

**Required capabilities (Phase 1):** `time.read`, `time.write`, `tasks.events`, `lifecycle.events`. **Optional:** `settings.snapshot`, `model.read`, `errors.typed`. Missing optional capabilities degrade to the D-06 "treat as off" fallback or a generic error message.

**Subscribe before checking:** attach lifecycle listeners first (`unloading`, `layout.ready`, `cache.changed`, `cache.rebuilt`, `settings.changed`), then events (`task.updated`, `task.deleted`), then read `isReady()`. That way a `layout.ready` firing in between is never missed.

**On `unloading`:** `retired.add(api)`, off every ref (inside `try`), drop the reference, set `missing`. Schedule one early probe (about 1 s, via `window.setTimeout` tracked by `plugin.register(() => clearTimeout(id))`) so that an update (unload, then immediate load) reconnects without waiting for the 5 s interval.

**Do not use `plugin.registerEvent` for TaskNotes refs.** The bridge must off them when TaskNotes reloads. Keep a private `refs: Array<() => void>` and also call `detach()` from `plugin.register(...)` for plugin unload.

### Pattern 2: Store: one call, single-flight, trailing debounce, signature diff

- `requestRefresh()`: trailing debounce of **200 ms** (discretion range 150-250). TaskNotes emits `task-updated` once from `TaskService` and again about 300 ms later from the metadata listener [VERIFIED: TaskManager.ts:58 `DEBOUNCE_DELAY = 300`]. The result is at most two refreshes per mutation, both inside about 600 ms (SYNC-01).
- `refreshNow()`: single-flight. If one is running, mark it dirty and run once more when it finishes. Controller paths await this, without the debounce.
- Only `api.time.active()` is called. Derive the snapshot with pure `timeMath.deriveSnapshot(active, now)`, then compute a **signature** string from `(taskPath, startTime, archived, title, closedMs-of-primary-task)` for every open entry. Emit `changed` only when the signature differs. API objects are fresh deep copies on every call, so identity comparison is useless [VERIFIED: TaskNotesAPI.ts:2261-2277, 3469+ `copyTaskInfo`].
- Refresh triggers: bridge `data` (all subscribed events plus vault delete/rename), bridge entering `ready`, a **45 s safety resync** (plugin `registerInterval`, skipped unless `ready`), view visibility/focus/wake, and after every write.
- Keep the **previous snapshot until the new one resolves** (UI-SPEC: no idle flash). On a refresh error, keep the old snapshot, log it, and let the next trigger retry. Never retry in a loop.

### Pattern 3: timeMath (pure; matches TaskNotes' status bar to the second)

- `parseMs(iso)`: `Date.parse`, `NaN` → `null` (skip the entry).
- `sessionMs(start, now) = max(0, now − start)`. This is the same as TaskNotes' `getActiveElapsedMs`: `return Math.max(0, Date.now() - startMs);` [VERIFIED: StatusBarService.ts:340]. The ±1 s UAT comparison against the status bar is therefore deterministic.
- `formatHms(ms)`: floor seconds; `H:MM:SS` with unpadded hours. The status bar uses `M:SS` under 1 h [VERIFIED: StatusBarService.ts:343-358]. The pane always shows `H:MM:SS` (UI-SPEC), so `0:42:17` in the pane appears as `42:17` in the status bar. The UAT checklist should say this.
- `totalMs(task.timeEntries, now)`: sum `max(0, (end ?? now) − start)` for parseable entries. Ignore legacy `duration`. Unparseable `endTime` → skip. This is deliberately **not** TaskNotes' `calculateTotalTimeSpent`, which floors each entry to whole minutes [VERIFIED: timeTrackingUtils.ts:77-91]. It can exceed TaskNotes' minute totals by less than 1 min per entry. Document this in the README.
- `selectPrimary(open[])`: max `startMs`, tie → `taskPath` ascending (`a < b`, not `localeCompare`, so the order is locale-independent). `othersCount = open.length − 1` counts **entries**, including a malformed second open entry on the same task.
- `active()` lists entries where `!entry.endTime`, even ones with **no** `startTime` [VERIFIED: TaskNotesAPI.ts:2265-2266]. The status bar additionally requires `entry.startTime` [VERIFIED: helpers.ts:191]. Drop entries with unparseable `startTime` in `deriveSnapshot` so the pane agrees with the status bar.

### Pattern 4: WriteQueue + Stop + archive auto-stop

- `WriteQueue.run(fn)`: `this.tail = this.tail.then(fn, fn)`-style chaining that never rejects the chain. One instance is shared by `TimerController.stop` and `ArchiveAutoStopper` (D-10).
- **Manual stop (CTRL-01):** capture the displayed `(taskPath, startTime)` at click time. Queue `gateway.stop(taskPath, {source:"tasknotes-timer-pane", reason:"user stop", correlationId})`, then `await store.refreshNow()`. On error, compute `const n = errors.normalize(e)` (or `e instanceof Error ? e.message : String(e)` without `errors.typed`). If `isNoActiveSessionError(n.message)` → refresh, no Notice. Otherwise show the Notice with the UI-SPEC copy.
- `api.time.stop` closes the **first** open entry of that task [VERIFIED: TaskService.ts:1668 `persistedTask.timeEntries?.find((entry) => !entry.endTime)`]. With one open entry per task (the normal case) that is the displayed one. With a malformed task holding two, the pane may show the later entry while TaskNotes closes the earlier one. Accept this; it's an edge case.
- **Auto-stop (D-06..D-10):** after every store refresh, `ArchiveAutoStopper.evaluate(snapshot)`:
  1. `enabled = settings.autoStopOnComplete`. Read `api.settings.snapshot().autoStopTimeTrackingOnComplete` (cap `settings.snapshot`), else `api.model.config().timeTracking.autoStopOnComplete` (cap `model.read`), else `false`. Read the notification flag the same way. Cache both; re-read on bridge `ready` and on `settings.changed` (its payload already carries `settings`, a snapshot [VERIFIED: TaskNotesAPI.ts:2876]).
  2. If enabled: for each open entry with `task.archived === true` whose key `${taskPath}\u0000${startTime}` is not in `attempted`, add the key to `attempted`, then queue `stop(taskPath, {source, reason:"auto-stop: task archived", correlationId})`.
  3. Success with notification on → `new Notice(\`Auto-stopped time tracking for: ${title} (task archived)\`)`. Benign no-active-session → silent. Other error → `console.error` plus **one** Notice per key (discretion; it can't spam because the key is never retried).
  4. `attempted` is cleared when the bridge leaves `ready` (a new TaskNotes session). Unarchiving does nothing.
- Archiving with `moveArchivedTasks` on also moves the file [VERIFIED: TaskService.ts:1396-1400 `buildTaskArchiveMovePlan`]. The path in the next `active()` snapshot is then the new path. Key by the snapshot's path; do not cache paths.
- **Why the pane must do this at all:** the status bar hides archived trackers: `// Skip archived tasks  if (task.archived) return false;` [VERIFIED: StatusBarService.ts:163-164].

### Pattern 5: View tick, visibility, and sleep/wake (SYNC-04)

- `this.registerInterval(window.setInterval(() => this.tick(), 1000))` on the **view**. The interval is view-scoped, so it's cleared on close.
- `tick()`: `now = Date.now()`. If `now − lastTick > 3000`, a wake or throttle gap occurred: `store.requestRefresh()`. Then, if `this.contentEl.isShown()`, set the clock and total text only. No TaskNotes calls per tick.
- `this.registerDomEvent(this.containerEl.doc, "visibilitychange", …)` and `this.registerDomEvent(this.containerEl.win, "focus", …)`. On visible or focus: `tick()` plus `store.requestRefresh()`. Use `containerEl.doc`/`.win` (typed in obsidian.d.ts:309-313) rather than the global `document`, so a pane moved to a popout window listens on the right document.
- Electron suspends timers during OS sleep. Because the value is recomputed from `Date.now()` on the first tick after wake, the clock is correct within ≤ 1 s with no extra code. The gap detection additionally refreshes data that may have changed while asleep (for example via Sync).

### Pattern 6: View lifecycle and restore

- Build the DOM once in `onOpen` (UI-SPEC structure). Subscribe with `this.registerEvent(store.on("changed", …))` and `this.registerEvent(bridge.on("state", …))`. Call `bridge.probe()` and `render()` immediately. Never leave the view blank: the `loading` message is the default class.
- Since 1.7.2, a restored background sidebar leaf is **deferred** and `onOpen` doesn't run until it is shown [VERIFIED: obsidian.d.ts:11255-11267 `isDeferred` / `loadIfDeferred`]. Nothing else depends on the view, so no `loadIfDeferred` is needed.
- Never store the view instance on the plugin (`obsidianmd/no-view-references-in-plugin` is an error).

### Pattern 7: activateView (PANE-01/02)

```typescript
// Signatures verified: obsidian.d.ts 1.14.4 :10976 getLeavesOfType, :10992 revealLeaf (Promise, @since 1.7.2),
// :10928 ensureSideLeaf(type, side, {active, split, reveal, state}) (@since 1.7.2). Probe-compiled.
async activateView(): Promise<void> {
  const { workspace } = this.app;
  const existing = workspace.getLeavesOfType(VIEW_TYPE_TIMER_PANE)[0];
  if (existing) { await workspace.revealLeaf(existing); return; }   // revealLeaf uncollapses the sidedock
  await workspace.ensureSideLeaf(VIEW_TYPE_TIMER_PANE, "right", { active: true, reveal: true });
}
```
Checking `getLeavesOfType` first means a pane the user dragged to the left sidebar or the main area is revealed where it is, not duplicated.

### Anti-Patterns to Avoid
- **`await api.lifecycle.ready()` as the "safe to read" signal:** it resolves before layout-ready initialization and before the metadata listeners exist. Use `isReady()`.
- **Subscribing to `time.started` + `time.stopped` + `task.updated`:** all three come from the same raw `task-updated` event. Each `api.events.on` adds another raw listener that re-runs `normalizeUpdatedEvent` with deep copies [VERIFIED: TaskNotesAPI.ts:2559-2573]. Subscribe to `task.updated` (plus `task.deleted`) only.
- **Reading `active()[0]`:** order is vault-file order, not recency. Always use `selectPrimary`.
- **`api.time.task()` or `summary()` for totals:** minute-floored.
- **Logging the settings snapshot:** it contains `apiAuthToken` [VERIFIED: src/types/settings.ts:209]. Extract the two booleans only.
- **Global `document` / bare `setInterval` / `el.style`:** popout-unsafe or flagged by obsidianmd rules.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stopping a timer | Frontmatter edit of `endTime` | `api.time.stop(path, ctx)` | Per-path lock, field mapping, `dateModified`, events, status bar refresh |
| Finding active timers | Scanning `metadataCache` | `api.time.active()` | TaskNotes' task identification and field mapping (`timeEntries` key is remappable) |
| Reading auto-stop settings | Reading TaskNotes' `data.json` | `api.settings.snapshot()` / `api.model.config()` | Runtime API contract; capability-gated |
| Error text | Parsing stacks | `api.errors.normalize(e).message` | Stable payload shape |
| Sidebar placement / reveal | Manual split manipulation | `ensureSideLeaf` / `revealLeaf` | Handles collapsed docks and deferred views |
| Opening the note | Custom leaf logic | `workspace.openLinkText(path, "", Keymap.isModEvent(evt))` | Respects modifier semantics (`'tab'`, `'split'`, `'window'`) |
| Icons | SVG strings | `setIcon(el, "timer" \| "square")` | Lucide bundled with Obsidian |
| Tooltips | Custom hover elements | `setTooltip(el, text)` | Theme-consistent |
| Dev reload | Custom file watcher | Hot Reload + `.hotreload` | D-03 |

**Key insight:** every problem in this phase that looks like it needs custom plumbing already has a TaskNotes or Obsidian primitive with locking, mapping or theming built in. The custom code is only the *policy*: primary selection, debounce, auto-stop gating.

## Common Pitfalls

### Pitfall 1: Re-attaching a dead TaskNotes API after disable
**What goes wrong:** After TaskNotes is disabled, a probe re-attaches the torn-down `api`. Its `hasCapability` still passes because it's a pure array check, and `isReady()` is `false` forever. The pane shows "Connecting…" indefinitely.
**Why it happens:** `onunload` triggers `unloading`, then `cleanupPluginRuntime` sets `plugin.initializationComplete = false` and destroys the cache [VERIFIED: main.ts:676-681; pluginRuntime.ts:85, 101]. Whether `app.plugins.getPlugin("tasknotes")` still returns the old instance after disable is Obsidian-internal [ASSUMED].
**How to avoid:** a `WeakSet<object>` of retired APIs, added on `unloading`. A probe that finds a retired API reports `missing`.
**Warning signs:** "Connecting to TaskNotes…" persists after disabling TaskNotes; the UAT "disable" step fails.

### Pitfall 2: `layout.ready` never arrives
**What goes wrong:** The bridge waits on `layout.ready` and never becomes `ready`.
**Why it happens:** It fires only once, at the end of `initializeAfterLayoutReady`, inside `try`. A late subscriber misses it, and an init error skips it entirely [VERIFIED: pluginBootstrap.ts:358-393]. Only `"ready"` is replayed to late subscribers [VERIFIED: TaskNotesAPI.ts:2592-2604].
**How to avoid:** the 5 s probe re-evaluates `isReady()` while in `loading`.

### Pitfall 3: Benign-race detection by error code
**What goes wrong:** Treating `code === "operation_failed"` as benign hides real failures. Expecting a dedicated code finds none.
**Why it happens:** TaskService throws plain `Error`s; `normalize` maps every non-API error to `operation_failed` with the original message [VERIFIED: TaskNotesAPI.ts:1011-1023; TaskService.ts:1670].
**How to avoid:** `isNoActiveSessionError = (msg) => /no active time tracking session/i.test(msg)`, unit-tested with the verbatim string.

### Pitfall 4: Deleted task file leaves a ghost card
**What goes wrong:** The user deletes a timed note in the file explorer; the pane keeps showing it until something else triggers a refresh.
**Why it happens:** `task-deleted` is emitted only by `TaskService` deletes [VERIFIED: TaskService.ts:1869 is the only emitter]. The metadata `deleted` path triggers raw `data-changed`, which is not a runtime event [VERIFIED: TaskManager.ts:209-222].
**How to avoid:** the bridge listens to `this.app.vault.on("delete")` and `on("rename")` (via `plugin.registerEvent`; Obsidian-owned, stable) and emits `data`. The safety resync is the backstop.

### Pitfall 5: The metadata path is silent before TaskNotes finishes layout-ready init
**What goes wrong:** Hand edits made in the first seconds after startup don't produce events.
**Why it happens:** `cacheManager.initialize()`, which installs the metadata listeners, runs after several awaits inside `initializeAfterLayoutReady`, while `isReady()` is already `true` [VERIFIED: pluginBootstrap.ts:362, 374; TaskManager.ts:89-96].
**How to avoid:** refresh on `layout.ready` even when already `ready`. The safety resync covers the rest.

### Pitfall 6: Disagreeing with the status bar about archived timers
**What goes wrong:** The user sees a timer in the pane that the status bar doesn't show.
**Why:** `active()` includes archived tasks; the status bar skips them [VERIFIED: StatusBarService.ts:163-164]. This is intended (D-06 "setting off" shows a muted "Archived" label). The UAT script must state it so the tester doesn't file it as a bug.

### Pitfall 7: Status bar and pane formats differ under one hour
`42:17` (status bar) vs `0:42:17` (pane) [VERIFIED: StatusBarService.ts:343-358]. The values match; only the formatting differs. Note it in the UAT ±1 s step.

### Pitfall 8: `eslint.config.mts` fails type-aware lint under `types: []`
**What goes wrong:** `eslint.config.mts 23:5 error Unsafe assignment of an error typed value @typescript-eslint/no-unsafe-assignment`, raised on `tsconfigRootDir: import.meta.dirname` [VERIFIED: probe run output].
**Why:** with TS 6 `types: []`, the default project used for `allowDefaultProject` files has no Node types for `import.meta.dirname`.
**How to avoid:** add `"eslint.config.mts"` to `globalIgnores` and remove it from `allowDefaultProject`. The probe then passed with 0 problems [VERIFIED: probe run].

### Pitfall 9: The sentence-case brand list replaces the defaults
**What goes wrong:** `Use sentence case for UI text. Expected: 'Check for tasknotes'` on the retry button [VERIFIED: probe run output].
**Why:** "TaskNotes" isn't a default brand, and a custom `brands` option **replaces** the default list (`options?.brands ?? DEFAULT_BRANDS`) [VERIFIED: eslint-plugin-obsidianmd 0.4.2 dist/lib/rules/ui/sentenceCaseUtil.js:158].
**How to avoid:** `"obsidianmd/ui/sentence-case": ["warn", { brands: ["TaskNotes", "Obsidian"] }]`. With that override, all UI-SPEC copy, including "Settings → Community plugins" and both Notice templates, lints clean [VERIFIED: probe run]. Run `eslint . --max-warnings 0` so warn-level rules still gate D-14.

### Pitfall 10: Manifest fails `obsidianmd/validate-manifest`
**What goes wrong:** lint errors on `manifest.json`.
**Rules [VERIFIED: validateManifest.js:2-16, 17-28, 210-224]:**
- Required keys: `author, minAppVersion, name, version, id, description, isDesktopOnly`. Optional: `authorUrl, fundingUrl`; nothing else is allowed.
- `id`, `name` and `description` must not contain `obsidian` or `plugin` (case-insensitive **substring**).
- `description` must be 10–250 chars, start with a capital letter, end with `.`, and match `^[A-Za-z0-9\s.,!?'"-]+$` (no parentheses, colons or arrows).

**Verified-passing example:** `"Sidebar pane that shows the task TaskNotes is timing and stops it in one click."`

### Pitfall 11: The eslint/vitest/tsc globs pick up the dev vault
**What goes wrong:** `eslint .` lints `dev-vault/.obsidian/plugins/tasknotes/main.js` (a large third-party bundle) and the built `main.js` copies.
**How to avoid:** `globalIgnores([... "dev-vault", "dev-vault-seed" ...])`, tsconfig `include: ["src/**/*.ts", "tests/**/*.ts"]`, and vitest `include: ["tests/**/*.test.ts"]`.

### Pitfall 12: Hot Reload watches only `main.js` and `styles.css`
Changes to `manifest.json` only refresh the watch list. Reload fires about 0.75 s after the last change, and the folder must contain `.hotreload` because `dev-vault/` is not its own git repo [CITED: github.com/pjeby/hot-reload README]. The esbuild dev plugin should copy `manifest.json` and `styles.css` **and** ensure `.hotreload` exists on start.

## Code Examples

All of the following compiled, linted and tested in the scratch probe (obsidian 1.14.4, TS 6.0.3, eslint 9.39.5 + obsidianmd 0.4.2, vitest 5.0.4, esbuild 0.28.2) unless marked otherwise.

### tsconfig.json (probe-verified)
```jsonc
{
  "compilerOptions": {
    "target": "ES2021", "module": "ESNext", "moduleResolution": "bundler",
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "strict": true, "noImplicitReturns": true, "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true, "isolatedModules": true, "verbatimModuleSyntax": true,
    "skipLibCheck": true, "forceConsistentCasingInFileNames": true,
    "inlineSourceMap": true, "inlineSources": true, "types": []
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```
`verbatimModuleSyntax` requires `import type` / inline `type` for type-only imports (for example `import { ItemView, type WorkspaceLeaf } from "obsidian"`).

### eslint.config.mts (probe-verified, 0 problems)
```typescript
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores, defineConfig } from "eslint/config";

export default defineConfig(
  globalIgnores(["node_modules", "dev-vault", "dev-vault-seed", "esbuild.config.mjs", "version-bump.mjs",
    "versions.json", "main.js", "package.json", "package-lock.json", "tsconfig.json",
    "vitest.config.ts", "eslint.config.mts", "scripts"]),
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: { allowDefaultProject: ["manifest.json"] },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".json"],
      },
    },
  },
  ...obsidianmd.configs.recommended,
  { rules: { "obsidianmd/ui/sentence-case": ["warn", { brands: ["TaskNotes", "Obsidian"] }] } },
);
```

### vitest.config.ts (probe-verified)
```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.test.ts"], environment: "node" } });
```

### package.json scripts (D-14 gate)
```json
"scripts": {
  "dev": "node esbuild.config.mjs",
  "build": "tsc -noEmit && node esbuild.config.mjs production",
  "typecheck": "tsc -noEmit",
  "lint": "eslint . --max-warnings 0",
  "test": "vitest run",
  "check": "npm run build && npm run lint && npm test",
  "seed": "node scripts/seed-dev-vault.mjs",
  "version": "node version-bump.mjs && git add manifest.json versions.json"
}
```
Keep `"type": "module"` (sample). Copy `version-bump.mjs`, `.npmrc` (`tag-version-prefix=""`) and `versions.json` from the sample. The sample's `-skipLibCheck` flag on `tsc` is redundant because tsconfig sets it.

### esbuild.config.mjs (sample config + dev-vault target; `[ASSUMED]` composition, built from probe-verified pieces)
```javascript
import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";
import { copyFile, mkdir, writeFile, access } from "node:fs/promises";

const prod = process.argv[2] === "production";
const DEV_DIR = "dev-vault/.obsidian/plugins/tasknotes-timer-pane";

const devVaultAssets = {
  name: "dev-vault-assets",
  setup(build) {
    build.onStart(async () => {
      await mkdir(DEV_DIR, { recursive: true });
      try { await access(`${DEV_DIR}/.hotreload`); } catch { await writeFile(`${DEV_DIR}/.hotreload`, ""); }
      await copyFile("manifest.json", `${DEV_DIR}/manifest.json`);
      await copyFile("styles.css", `${DEV_DIR}/styles.css`);
    });
  },
};

const context = await esbuild.context({
  banner: { js: "/* bundled by esbuild — see the repository for source */" },
  entryPoints: ["src/main.ts"], bundle: true,
  external: ["obsidian", "electron", "@codemirror/autocomplete", "@codemirror/collab", "@codemirror/commands",
    "@codemirror/language", "@codemirror/lint", "@codemirror/search", "@codemirror/state", "@codemirror/view",
    "@lezer/common", "@lezer/highlight", "@lezer/lr", ...builtinModules],
  format: "cjs", target: "es2021", logLevel: "info",
  sourcemap: prod ? false : "inline", treeShaking: true, minify: prod,
  outfile: prod ? "main.js" : `${DEV_DIR}/main.js`,
  plugins: prod ? [] : [devVaultAssets],
});
if (prod) { await context.rebuild(); process.exit(0); } else { await context.watch(); }
```
Edits to `styles.css` during watch are copied only on the next rebuild. That's acceptable; the planner may add a `fs.watch` on `styles.css` if wanted.

### Module augmentation for `app.plugins` (probe-compiled)
```typescript
// src/obsidian-augment.d.ts
import "obsidian";
declare module "obsidian" {
  interface App {
    plugins?: { getPlugin(id: string): (Plugin & { api?: unknown }) | null };
  }
}
```
`Plugin.manifest: PluginManifest` is public [VERIFIED: obsidian.d.ts:7133], so `plugin.manifest.version` is readable for the "Installed version" meta line.

### Bridge probe core (`[ASSUMED]` composition; every API name is quoted above)
```typescript
const REQUIRED = ["time.read", "time.write", "tasks.events", "lifecycle.events"] as const;
private readonly retired = new WeakSet<object>();

probe(): void {
  const plugin = this.app.plugins?.getPlugin("tasknotes") ?? null;
  const api = (plugin?.api ?? null) as TaskNotesApiV1 | null;
  if (!plugin) return this.toMissing();
  if (!api) return isOlderThan(plugin.manifest.version, "4.10.0")
    ? this.toIncompatible(plugin.manifest.version) : this.setState("loading");
  if (this.retired.has(api)) return this.toMissing();
  if (api.apiVersion !== 1 || !REQUIRED.every((c) => api.hasCapability(c)))
    return this.toIncompatible(plugin.manifest.version);
  if (api !== this.api) this.attach(api);             // lifecycle subs first, then events
  this.setState(api.lifecycle.isReady() ? "ready" : "loading");
}

private attach(api: TaskNotesApiV1): void {
  this.detach();
  this.api = api;
  const life = (ev: TaskNotesRuntimeLifecycleEventName, h: () => void) => {
    const ref = api.lifecycle.on(ev, h); this.offs.push(() => api.lifecycle.off(ref));
  };
  life("unloading", () => { this.retired.add(api); this.detach(); this.api = null; this.setState("missing"); this.scheduleEarlyProbe(); });
  life("layout.ready", () => { this.probe(); this.trigger("data"); });
  life("cache.changed", () => this.trigger("data"));
  life("cache.rebuilt", () => this.trigger("data"));
  life("settings.changed", () => { this.trigger("settings"); this.trigger("data"); });
  for (const ev of ["task.updated", "task.deleted"] as const) {
    const ref = api.events.on(ev, () => this.trigger("data")); this.offs.push(() => api.events.off(ref));
  }
}
private detach(): void { for (const off of this.offs) { try { off(); } catch { /* dead emitter */ } } this.offs = []; }
```

### Seed task note (dev-vault-seed; matches TaskNotes defaults)
TaskNotes identifies tasks by tag `task` by default, and archived by the `archived` tag. With `storeTitleInFilename: true` (the default), the title comes from the **file name** [VERIFIED: src/settings/defaults.ts:255-256, 267; @tasknotes/model dist/esm/defaults.js:3, 24-25].
```markdown
<!-- dev-vault-seed/TaskNotes/Tasks/Write quarterly report.md -->
---
tags:
  - task
status: open
priority: normal
timeEntries:
  - startTime: "2026-10-12T09:00:00.000Z"
    endTime: "2026-10-12T09:45:30.000Z"
  - startTime: "2026-10-12T13:10:00.000Z"
    endTime: "2026-10-12T13:32:05.000Z"
---
```
Archived seed: the same with `tags: [task, archived]`. Quote timestamps so YAML never coerces them [ASSUMED: Obsidian's YAML handling of unquoted ISO dates; quoting is safe either way].

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `plugin.taskService` / `emitter` internals | Runtime API v1 (`plugin.api`) | TaskNotes 4.10.0 | Version- and capability-gated contract |
| `"moduleResolution": "node"` (sample) | `"bundler"` | TS 6.0 deprecations | Sample tsconfig errors under TS 6 |
| `revealLeaf` sync | `await revealLeaf` (deferred views) | Obsidian 1.7.2 | Must await; restored leaves are deferred |
| `"obsidian": "latest"` | exact pin | project decision | Reproducible typings |

**Deprecated/outdated:**
- ESLint 9.x is marked deprecated on npm (`This version is no longer supported`), but it remains required by `eslint-plugin-obsidianmd@0.4.2`'s dependency tree. Re-check when obsidianmd ships ESLint 10 support.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | After TaskNotes is disabled, `app.plugins.getPlugin("tasknotes")` returns null (or the old instance). The design handles both through the retired-API set | Pattern 1 / Pitfall 1 | Low: both branches handled; verify in UAT |
| A2 | Obsidian registers a plugin in `app.plugins` before its `onload` finishes, so "plugin present, api undefined" can be observed briefly | Pattern 1 | Low: if never observed, the branch is dead code |
| A3 | Capability strings `time.read`, `time.write`, `tasks.events`, `lifecycle.events` exist in TaskNotes 4.10.0 (verified only in 4.13.8; D-04 forbids testing 4.10.0) | Pattern 1 | Medium: a 4.10.x user could see "needs an update" unnecessarily. Mitigated by the 4.13.x target |
| A4 | `openLinkText` with a full vault path such as `TaskNotes/Tasks/X.md` opens that exact file | DISP-01 | Low: fallback `vault.getFileByPath(path)` (@since 1.5.7) + `workspace.getLeaf(Keymap.isModEvent(evt)).openFile(f)` |
| A5 | Quoted ISO timestamps in seed YAML are read by TaskNotes as strings | Seed note | Low: dev-only data |
| A6 | Electron fires `visibilitychange`/`focus` after OS wake | Pattern 5 | Low: tick-gap detection covers it regardless |
| A7 | esbuild `onStart` asset copy + `.hotreload` creation behaves as described on Windows paths | esbuild config | Low: verified pieces; first `npm run dev` proves it |

## Open Questions (RESOLVED)

1. **Is `task_not_found` during Stop benign?** RESOLVED (plan 01-05, Task 1): no. Only the message "No active time tracking session for this task" is benign (no Notice, refresh). Every other error, including `task_not_found`, shows the Stop-failed Notice, then refreshes.
   - What we know: if the file was deleted between click and stop, `requireTask` throws `task_not_found` [VERIFIED: TaskNotesAPI.ts:2663-2673].
   - Unclear: the UI-SPEC names only "no active session" as benign.
   - Recommendation: show the Notice (truthful), then refresh. The ghost card disappears either way.
2. **How long should the bridge stay in `loading` when TaskNotes ≥ 4.10 never assigns `api`?** RESOLVED (plan 01-03, Task 1): it stays in `loading` and keeps the 5 s probe. It logs one console message after `LOADING_WARN_MS` (30 s) and adds no new UI state.
3. **Should the safety resync run while the bridge is not `ready`?** RESOLVED (plan 01-03, Task 2): no. `TimerStore.resync()` runs only when ready, and the probe handles the other states.

Planner notes on the remaining research flags (2026-10-13):
- Six [SUS] dev packages: RESOLVED by plan 01-01 Task 1, a `checkpoint:human-verify` with `gate="blocking-human"` before the single `npm install`.
- Assumptions Log A1-A7: carried as flagged assumptions in the plans. A1, A4, A6 and A7 are confirmed by hand in `01-UAT-CHECKLIST.md` section 8 (plan 01-04).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/test | ✓ | v24.13.1 | — |
| npm | install | ✓ | 11.8.0 | — |
| npm registry access | install | ✓ (probe install succeeded) | — | — |
| Obsidian desktop | UAT (D-13) | not probed (GUI app) | user reports 1.14.4 | none: the user runs UAT |
| TaskNotes in dev vault | UAT | user installs by hand (D-02) | 4.13.x | — |
| Hot Reload in dev vault | dev loop | user installs by hand (D-03) | 0.3.1 | manually toggle the plugin off and on |

**Missing dependencies with no fallback:** none for automated gates. The manual UAT needs Obsidian, TaskNotes and Hot Reload installed by the user; the plan should include a `checkpoint:human-action` for that one-time setup.

## Validation Architecture

> `.planning/config.json` has `workflow.nyquist_validation: false`. This section is included because the orchestrator explicitly requested it for test planning.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.4 (node environment) |
| Config file | `vitest.config.ts` (Wave 0) |
| Quick run command | `npx vitest run tests/<file>.test.ts` |
| Full suite command | `npm test` (and the D-14 gate: `npm run check`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISP-02 | sessionMs wall-clock, negative clamp, H:MM:SS unpadded hours | unit | `npx vitest run tests/timeMath.test.ts` | ❌ Wave 0 |
| DISP-03 | totalMs sums closed + open in ms; skips unparseable; ignores `duration` | unit | `npx vitest run tests/timeMath.test.ts` | ❌ Wave 0 |
| DISP-06 | selectPrimary latest start, tie → path asc; +N counts entries; drops missing `startTime` | unit | `npx vitest run tests/timeMath.test.ts` | ❌ Wave 0 |
| SYNC-01/02 | store debounce coalesces bursts; single-flight; signature diff emits once; keeps previous snapshot on error | unit (fake timers + fake gateway) | `npx vitest run tests/store.test.ts` | ❌ Wave 0 |
| DISP-05 / SYNC-03 | bridge: missing, incompatible (old version, apiVersion≠1, missing cap), loading (no api, not ready), ready; unloading → missing; retired api never re-attached; new api object → re-attach | unit (fake `app.plugins` + fake api) | `npx vitest run tests/bridge.test.ts` | ❌ Wave 0 |
| CTRL-01 | controller stop: queues, benign "No active time tracking session for this task" → no notice; other error → notice callback; refreshes after | unit | `npx vitest run tests/controller.test.ts` | ❌ Wave 0 |
| D-06..D-10 | auto-stop on/off/missing-capability; dedupe per (path,startTime); benign error; notification flag; unarchive no-op; shared queue | unit | `npx vitest run tests/autoStop.test.ts` | ❌ Wave 0 |
| PANE-01..03, DISP-01, SYNC-04, status-bar parity | in-Obsidian behavior | manual UAT (D-13) | `UAT checklist` in phase dir | ❌ Wave 0 |

Testing the bridge needs no `obsidian` runtime if `TaskNotesBridge` takes an injected `{ getPlugin(id) }` lookup plus an event-emitter base. Alternatively, test a pure `classifyAvailability(plugin, api, retired)` function and keep the class thin. **Recommend the pure function**: Vitest cannot import the `obsidian` package at runtime (it is types only, `"main": ""` [VERIFIED: obsidian package.json]), so any module that value-imports `obsidian` (`Events`, `Notice`) must stay out of tested files or be mocked with `vi.mock("obsidian", …)`.

### Sampling Rate
- **Per task commit:** `npm test` (fast; pure logic)
- **Per plan:** `npm run check` (D-14)
- **Phase gate:** full check green + UAT checklist executed in the dev vault

### Wave 0 Gaps
- [ ] `package.json`, `tsconfig.json`, `eslint.config.mts`, `vitest.config.ts`, `esbuild.config.mjs`, `manifest.json`, `versions.json`, `version-bump.mjs`, `.npmrc`, `.gitignore` (add `dev-vault/`, `main.js`, `data.json`)
- [ ] `tests/fakes/fakeGateway.ts`: shared fake implementing `TaskNotesGateway`
- [ ] Test files listed above
- [ ] `dev-vault-seed/` + `scripts/seed-dev-vault.mjs`
- [ ] `01-UAT.md` checklist (D-13)

## Security Domain

`security_enforcement: true`, ASVS level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface (in-process; HTTP API not used) |
| V3 Session Management | no | — |
| V4 Access Control | no | Single-user local plugin |
| V5 Input Validation / Output Encoding | yes | Task titles and paths come from user-editable frontmatter. Render only via `setText`/`createEl({text})`, never `innerHTML` (`obsidianmd/no-forbidden-elements`). Parse timestamps defensively (`Date.parse` → skip on NaN). Treat every `active()` field as untrusted (optional chaining) |
| V6 Cryptography | no | `crypto.randomUUID()` for correlation IDs only (not security-relevant) |
| V7 Error Handling & Logging | yes | No raw errors or stacks in the UI (UI-SPEC). Never log `settings.snapshot()`, which contains `apiAuthToken` [VERIFIED: settings.ts:209]. Log normalized `{code, message}` only |
| V14 Configuration / Dependencies | yes | Pinned dev deps; legitimacy audit above; zero runtime deps; the dev vault stays git-ignored and never commits third-party plugin binaries (D-02) |

### Known Threat Patterns for an Obsidian companion plugin

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| HTML/script injection via a task title | Tampering / Elevation | Text-only DOM APIs; lint rule enforcement |
| Corrupting another plugin's data by writing `timeEntries` | Tampering | Writes only via `api.time.stop`; a grep check in verification for `processFrontMatter` / `timeEntries:` writes |
| Leaking TaskNotes secrets via console | Information disclosure | Extract only the two booleans from the snapshot; no snapshot logging |
| Runaway auto-stop loop hammering the vault | Denial of service | `attempted` key set (one attempt per key per session); serialized queue; no retry loop (D-10) |
| Supply-chain (dev deps) | Tampering | Legitimacy audit + human-verify checkpoint before install; lockfile committed |

## Sources

### Primary (HIGH: read verbatim this session or tool-proven)
- `callumalpass/tasknotes@451679289d94f1381a88d1568d99d9606e097ab5` (2026-10-12, v4.13.8; shallow clone):
  - `src/api/runtime-api.ts` (full contract)
  - `src/api/TaskNotesAPI.ts`: time/events/lifecycle namespaces 823-921, model config 971-1001, normalizeError 1011-1023, startTime/stopTime 2197-2234, getActiveTimeEntries 2261-2281, on/onLifecycle 2559-2621, requireTask 2663-2673, normalizeUpdatedEvent 2728-2842, normalizeLifecycleEvent 2862-2882, copyTaskInfo 3469+
  - `src/main.ts`: 281-332 (onload order), 424-454, 633-664, 676-681
  - `src/bootstrap/pluginBootstrap.ts`: 112-133, 358-394
  - `src/bootstrap/pluginRuntime.ts`: 20-101
  - `src/utils/TaskManager.ts`: 51-250, 694-731, 1010-1039, 1102-1130
  - `src/services/TaskService.ts`: 1374-1400, 1556-1586, 1651-1739, 1869
  - `src/services/SettingsLifecycleService.ts`: 45-205
  - `src/ui/StatusBarService.ts`: 157-170, 329-379
  - `src/utils/timeTrackingUtils.ts`: 77-91
  - `src/utils/helpers.ts`: 186-192
  - `src/settings/defaults.ts`: 252-267, 331-332
  - `src/types/settings.ts`: 177-178, 209
  - `docs/javascript-api.md`, `docs/releases/4.10.0.md`, `4.11.0.md`
- `@tasknotes/model@0.3.0-rc.9` (npm pack): `dist/types/types.d.ts` (TimeEntry, TaskInfo, TimeTrackingConfig), `dist/esm/defaults.js` (field mapping)
- `obsidian@1.14.4/obsidian.d.ts` (npm pack): Plugin 7120-7370, ItemView 5391-5415, View 10464-10590, Workspace 10712-10995, WorkspaceLeaf 11250-11270, Keymap 5478-5487, Component 3032-3083, Events 4264-4297, `doc`/`win` 309-313, Vault events 10439-10451, `getFileByPath` 10210-10212
- `obsidianmd/obsidian-sample-plugin@07ceb81d`: package.json, esbuild.config.mjs, tsconfig.json, eslint.config.mts, manifest.json, .npmrc, .gitignore, version-bump.mjs
- `eslint-plugin-obsidianmd@0.4.2` (npm pack): README rule table; `validateManifest.js`, `ui/sentenceCaseUtil.js`, `commands/*` rule sources
- **Toolchain probe (scratchpad):** `npm install` (348 packages, exit 0), `tsc -noEmit` exit 0, `vitest run` 3/3 passed, esbuild bundle OK, `eslint .` 0 problems after the two config fixes; `no-unsupported-api` confirmed by flipping `minAppVersion` to 1.7.1 (2 errors on `revealLeaf`/`ensureSideLeaf`)
- npm registry (`npm view`, 2026-10-13): versions, publish times, peers, engines

### Secondary (MEDIUM)
- pjeby/hot-reload README (WebFetch): watched files, `.hotreload`, 0.75 s debounce
- Project research: `.planning/research/{STACK,ARCHITECTURE,PITFALLS,SUMMARY}.md` (reused, not re-surveyed)

### Tertiary (LOW)
- None used for decisions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, because the full install, compile, lint, test and bundle were executed on the pinned set.
- Architecture: HIGH for TaskNotes semantics (verbatim source); MEDIUM for Obsidian-internal plugin-registry timing (A1, A2), which the design tolerates either way.
- Pitfalls: HIGH, because each cites a source line or a probe output.

**Research date:** 2026-10-13
**Valid until:** about 2026-11-12 (TaskNotes ships often, and 5.0 is in beta). Re-verify the vendored types if TaskNotes 5.0 goes stable before execution.
