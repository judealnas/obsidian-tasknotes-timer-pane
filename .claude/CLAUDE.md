<!-- GSD:project-start source:PROJECT.md -->

## Project

**TaskNotes Timer Pane**

An Obsidian plugin that adds a dockable pane for monitoring and controlling TaskNotes' regular (non-Pomodoro) task time tracking. TaskNotes already has a Pomodoro pane, but for normal task timing the only indication that a task is being timed is a small status-bar indicator in the bottom right of the window. This pane fills that gap: keep it open beside your notes to see how long you've spent on the current task, and stop, pause, or switch tasks in one or two clicks.

**Core Value:** With the pane open, I can always see what task is being timed and how long I've spent on it, and stop, pause, or switch tasks in one to two clicks, without leaving the pane.

### Constraints

- **Dependency**: Requires TaskNotes plugin installed and enabled — the pane is a companion, not a replacement
- **Data format**: Must write time entries exactly as TaskNotes does (ideally by calling TaskNotes' own APIs) — avoids corrupting tracked time or desyncing TaskNotes' UI
- **Compatibility**: Relies on TaskNotes Runtime API v1 (TaskNotes >= 4.10.0); never TaskNotes internals — must degrade gracefully if TaskNotes is missing, disabled, too old, or reloaded
- **Platform**: `isDesktopOnly: false`, but verified on desktop only
- **Tech stack**: Obsidian plugin (TypeScript, Obsidian API, esbuild per sample-plugin conventions)
- **Distribution**: Personal use — manual install or BRAT

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Headline finding: TaskNotes has a public, versioned in-process API. Use it, not internals.

- **Docs:** `docs/javascript-api.md`, published at https://tasknotes.dev/javascript-api/
- **Contract:** `src/api/runtime-api.ts`, exported as `TaskNotesRuntimeApiV1` / `TaskNotesPublicAPI`. The author states it "can later become a standalone `@tasknotes/runtime-api` package". That package **does not exist on npm yet** (verified: npm 404).
- **Assignment:** `plugin.api = new TaskNotesAPI(plugin)` in `src/bootstrap/pluginBootstrap.ts`, called from `initializeCoreServices`.

| Runtime API call | Delegates to |
|---|---|
| `api.time.start` | `plugin.taskService.startTimeTracking` |
| `api.time.stop` | `plugin.taskService.stopTimeTracking` |
| `api.events` | `plugin.emitter` (`EVENT_TASK_UPDATED`) |

### Exact TaskNotes surfaces this project needs (HIGH, from `src/api/runtime-api.ts` @ 4.13.8)

| Need (PROJECT.md) | Runtime API call | Notes |
|---|---|---|
| Current timed task(s) | `api.time.active(): Promise<ActiveTimeEntry[]>` | `ActiveTimeEntry = { taskPath, task: TaskInfo, entry: TimeEntry, index }`. Scans all cached tasks for entries without `endTime`. **Can return more than one.** TaskNotes allows concurrent timers on different tasks; only same-task double-start throws "Time tracking is already active for this task". |
| Live elapsed (session) | `entry.startTime` (ISO) from `active()`, ticked locally | Don't poll TaskNotes every second. Compute `Date.now() - Date.parse(startTime)` in a `registerInterval` tick. |
| Total tracked on task (+ estimate) | `api.time.task(path): Promise<TaskNotesRuntimeTaskTimeData>` | Returns `summary.totalMinutes`, `totalSessions`, `activeSession.{startTime, elapsedMinutes}` and normalized `timeEntries[]`. Estimate is `task.timeEstimate` (minutes) on `TaskInfo`. |
| Stop | `api.time.stop(path, context?): Promise<TaskInfo>` | Throws if no active session. There is **no** "stop whatever is active" API method; call `active()` and stop by path. |
| Pause / resume | `stop(path)` then later `api.time.start(path, { description? }, context?)` | Matches the PROJECT.md decision (pause = close entry, resume = new entry). |
| Switch task | `for (a of await active()) await stop(a.taskPath)`, then `start(newPath)` | Do these in sequence, not in parallel. TaskNotes serializes per path (`withTimeTrackingLock`), not across paths. |
| Task picker / recent | `api.query.tasks({ where, sort, limit, scope })` or `api.tasks.list(query)` | Canonical fields like `task.status`, `task.dateModified`, `file.path`. `api.catalog.statuses()` gives configured statuses, so the plugin never hard-codes "open"/"done". |
| Today's log | `api.time.summary({ period: "today" })` | Returns `topTasks[{task,title,minutes}]` and totals. For per-entry rows, walk `TaskInfo.timeEntries` from `api.tasks.list()` and filter by date. |
| Sync with status bar / cards / commands | `api.events.on("task.updated" \| "time.started" \| "time.stopped", h): EventRef` → `this.registerEvent(ref)` | See the sync caveat below. |
| TaskNotes readiness / reload | `api.lifecycle.ready()`, `api.lifecycle.on("ready" \| "unloading" \| "cache.changed" \| "settings.changed", h)` | Since 4.10.0. |
| Native task context menu (nice-to-have) | `api.ui.taskMenu.showAtElement({ taskPath, element })` | Since **4.11.0**. Gate on `hasCapability("ui.task-menu")`. |
| Tag our writes | `context = { source: "tasknotes-timer-pane", correlationId, reason }` | Attached to emitted events, so the pane can ignore its own echoes if needed. |
| Errors | `api.errors.isApiError(e)` / `api.errors.toResult(() => …)` | Stable codes: `task_not_found`, `invalid_task_path`, `operation_failed`, … |
| Write path | Carries `originalTask`? | `time.started`/`time.stopped` fire? |
|---|---|---|
| TaskService writes (status bar, task cards, commands, runtime API) | Yes | Yes |
| Metadata-cache-driven updates (hand-edited frontmatter, Obsidian Sync / git pulls from another device) | No | No (only `task.updated`) |

### TypeScript types for the TaskNotes contract

- `TaskNotesRuntimeApiV1`: keep only the namespaces used (`time`, `tasks`, `query`, `events`, `lifecycle`, `catalog`, `errors`, `ui`, `hasCapability`, `apiVersion`)
- `ActiveTimeEntry`, `TaskNotesRuntimeTaskTimeData`, `TaskNotesRuntimeTimeSummary`, `TaskNotesRuntimeEventPayload`, `TaskNotesMutationContext`
- minimal `TaskInfo` / `TimeEntry` shapes: `TimeEntry = { startTime: string; endTime?: string; description?: string; duration?: number }`

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|---|---|---|---|---|
| Obsidian desktop (host) | 1.14.4 (current public; `desktop-releases.json` latest = beta = 1.14.4) | Runtime | What the user runs. | HIGH (primary) |
| `obsidian` (API typings) | **1.14.4, pinned exact** | Type definitions for `Plugin`, `ItemView`, `WorkspaceLeaf`, `setIcon`, `Menu`, `FuzzySuggestModal`, `moment` | Matches the installed app. Pin exact instead of the sample's `"latest"` so a later `npm install` can't silently change API surface. Peer-requires `@codemirror/state 6.7.6` / `@codemirror/view 6.43.13` (npm auto-installs; externalized at bundle time). | HIGH (npm registry) |
| `manifest.json` `minAppVersion` | **`1.12.2`** | Load gate | Same floor as TaskNotes 4.13.8. No point allowing older Obsidian than the dependency itself supports. Avoid APIs flagged `@since` > 1.12.2 in `obsidian.d.ts`. | HIGH |
| TaskNotes (runtime dependency) | **≥ 4.10.0** required (Runtime API v1); 4.13.8 current; `ui.taskMenu` needs ≥ 4.11.0 | Task data and time-tracking writes | See headline. Detect at runtime with `api.apiVersion === 1 && api.hasCapability("time.write")`. Do **not** add a `dependencies` field to the manifest; Obsidian has no plugin-dependency mechanism. | HIGH (primary) |
| TypeScript | **6.0.3** (`~6.0.3`) | Type-check (`tsc -noEmit`) | Newest line that `typescript-eslint@8.71.2` supports (peer `typescript >=4.8.4 <6.1.0`). Greenfield, so write a TS6-clean tsconfig (see below) and you won't need `ignoreDeprecations` before TS 7. | HIGH (versions/peers), MEDIUM (no Obsidian-plugin-specific TS6 reports found) |
| esbuild | **0.28.2** (pin exact) | Bundle `src/main.ts` → `main.js` (CJS, `es2021`, externals per sample) | Sample-plugin standard bundler. Fast, zero-config, no type-checking (that's `tsc`'s job). The sample pins `0.25.5`. 0.28.2 is current (2026-08-08). esbuild 0.x minors may carry breaking changes, but the sample's config uses only long-stable options. Fall back to `0.25.5` if anything breaks. | MEDIUM |
| Node.js | **24 LTS** (local: v24.13.1) | Build tooling only | The sample's release workflow uses Node 24. Vitest 5 requires `^22.12 \|\| ^24 \|\| >=26`. | HIGH |
| npm | 11.x (local 11.8.0) | Package manager | The sample-plugin scripts and `.npmrc` (`tag-version-prefix=""`) assume npm. | HIGH |
| UI layer | **Vanilla Obsidian DOM API** (`ItemView`, `contentEl.createDiv/createEl`, `setIcon`, `registerInterval`) | Sidebar pane | TaskNotes' own `PomodoroView extends ItemView` and builds UI with `createDiv`/`createEl`. That is the look-and-feel target, and TaskNotes has no React/Svelte dependency. A pane with roughly 6 widgets doesn't justify a framework, a second build plugin and lifecycle bridging. | HIGH |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---|---|---|---|
| *(none at runtime)* | — | — | Keep `dependencies` empty. Format durations with plain math + `Intl`. Obsidian exports `moment` if a date helper is needed (`import { moment } from "obsidian"`), so nothing to bundle. |
| `obsidian-test-mocks` | 7.2.1 (published 2026-10-12, peer `obsidian ^1.12.3`, supports Vitest) | In-memory mocks of `obsidian.d.ts` + DOM prototype extensions (`createDiv`, etc.) | Only if you unit-test view rendering. Vitest setup file `obsidian-test-mocks/vitest-setup` mocks the `obsidian` module automatically. TaskNotes itself uses it (with Jest). MEDIUM. |

### Development Tools

| Tool | Version | Purpose | Notes |
|---|---|---|---|
| ESLint | **9.39.5** (the `maintenance` dist-tag; **not 10.x**) | Lint | `eslint-plugin-obsidianmd@0.4.2` pulls `eslint-plugin-import` (peer `eslint ≤ ^9`) and `eslint-plugin-security@2.1.1` (peer `eslint ^9`). ESLint 10 produces peer conflicts and possible rule crashes. The sample and TaskNotes both use `^9.39.4`. HIGH. |
| `@eslint/js` | 9.39.5 | Base JS rules | `eslint-plugin-obsidianmd` peer-requires `^9.30.1`, so `@eslint/js` 10.x conflicts. |
| `typescript-eslint` | 8.71.2 | TS parser/rules (`projectService`) | Peer `eslint ^8.57 \|\| ^9 \|\| ^10`, `typescript <6.1.0`. This is the constraint that rules out TS 7. |
| `eslint-plugin-obsidianmd` | **0.4.2** (2026-08-24) | Official Obsidian review-bot rules (`obsidianmd.configs.recommended`): sentence-case UI text, no detaching leaves in `onunload`, no inline styles, manifest validation, etc. | Same rules the community-plugin review bot applies. Worth keeping even for a personal plugin because they catch real lifecycle bugs. Peer-requires `@eslint/json 0.14.0` (auto-installed). |
| `globals` | 17.13.0 | `globals.browser` for the flat config | As in sample. |
| `jiti` | 2.7.0 | Lets ESLint load `eslint.config.mts` (TypeScript flat config) | As in sample. Drop it if you write `eslint.config.mjs` instead. |
| Vitest | **5.0.4** (pulls `vite` 8.x as peer) | Unit tests for pure logic: elapsed/total math, "today" entry filtering, state derivation from `ActiveTimeEntry[]`, switch/pause sequencing against a fake `api` | Native TS/ESM, no `ts-jest` transform layer, fast watch. Put all TaskNotes access behind a `TaskNotesGateway` interface so tests inject a fake. Test environment `node`, plus `jsdom` only for view tests. MEDIUM (no Obsidian-specific Vitest 5 reports, but the logic under test is framework-free). |
| `@types/node` | 24.x (24.19.2) | Types for build scripts only | Under TS 6, `types` defaults to `[]`, so Node globals won't leak into `src/`. That's good: plugin code must not use Node APIs (keeps mobile-compatibility honest even if you set `isDesktopOnly`). |
| Hot Reload (pjeby/hot-reload) | 0.3.1 | Auto-reloads the plugin in a dev vault when `main.js` changes | Put a `.hotreload` file in the plugin folder. Point esbuild `outfile` (or a copy step, as TaskNotes' `copy-to-vault` esbuild plugin does) at `<devVault>/.obsidian/plugins/tasknotes-timer-pane/`. HIGH. |
| Obsidian CLI (built into desktop ≥ 1.12.2) | n/a | `obsidian plugin:reload id=…`, `obsidian dev:errors`, `obsidian eval` for scripted smoke checks | Optional. There is a forum report of `plugin:reload` exiting 255. MEDIUM/LOW (web search only). |
| BRAT (TfTHacker/obsidian42-brat) | 2.2.0 | Install/update the plugin from GitHub releases | See Release Flow. |

## Installation

# No runtime dependencies.

# Dev dependencies (pin exact where noted)

# Optional, only if testing view rendering:

### tsconfig.json (TS 6-clean; differs from the sample)

### package.json scripts (sample + test)

### Typing `app.plugins`

## Release Flow (personal use via BRAT)

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|---|---|---|
| TaskNotes Runtime API v1 (`plugin.api`) | `plugin.taskService.startTimeTracking(task)` / `plugin.emitter.on("task-updated")` / `plugin.getActiveTimeSession()` internals | Never for new code. Only if a needed capability is missing from the runtime API, behind a feature-detect plus try/catch. Even then, file an issue upstream: the author is actively building the companion-plugin surface (4.10 → 4.11 added `ui.taskMenu`). |
| Runtime API (in-process) | TaskNotes HTTP API (`/api/time/active`, what jane-t/TaskNotesTimer polls) | Out of scope per PROJECT.md. Only sensible for out-of-process tools. |
| Vendored trimmed contract types | Git devDependency on `callumalpass/tasknotes` + `import type` | Once TaskNotes publishes `@tasknotes/runtime-api`, switch to that npm package. |
| TypeScript 6.0.3 | TypeScript 5.9.3 | If any tool in the chain misbehaves on TS 6. 5.9.3 is what the sample (`^5.8.3`) and TaskNotes (`^5.9.2`) actually resolve to, so it's the most-trodden path. |
| Vanilla DOM in `ItemView` | Svelte 5 / Preact | Only if the pane grows into a complex interactive UI (it won't per PROJECT.md scope). Svelte adds `esbuild-svelte` and component lifecycle wiring inside `onOpen`/`onClose`. |
| Vitest 5 | Jest 30 + ts-jest 29 (+ jest-environment-jsdom) | If you want to copy TaskNotes' test setup verbatim. ts-jest peer `typescript <7` is fine with 6.0, but you get more config for no gain. |
| esbuild 0.28.2 | esbuild 0.25.5 (sample's exact pin) | If a 0.26–0.28 change ever bites. Known-good with the sample config. |
| Hot Reload plugin | Obsidian CLI `plugin:reload` in an esbuild `onEnd` hook | If you prefer one fewer plugin in the dev vault and the CLI works reliably on your machine. |

## What NOT to Use

| Avoid | Why | Use Instead |
|---|---|---|
| **TypeScript 7.x** (npm `latest` = 7.0.2, the Go-native compiler) | `typescript-eslint@8.71.2` peer-requires `typescript <6.1.0`, so type-aware linting breaks. TS 7 also removes every TS-6-deprecated option. | `typescript@~6.0.3` |
| **ESLint 10.x** (npm `latest` = 10.12.0) and `@eslint/js` 10.x | `eslint-plugin-obsidianmd@0.4.2` transitively requires ESLint ≤ 9 (`eslint-plugin-import`, `eslint-plugin-security` peers) and peer-requires `@eslint/js ^9.30.1`. | `eslint@^9.39.5`, `@eslint/js@^9.39.5` |
| `"obsidian": "latest"` (sample default) | Non-reproducible installs; typings can drift ahead of the installed app. | Pin `obsidian@1.14.4` exact; bump deliberately. |
| `"moduleResolution": "node"`, `baseUrl`, `target: ES6/ES5` | Deprecated in TS 6.0; errors by default. | `"moduleResolution": "bundler"`, `target: ES2021` |
| TaskNotes internals (`taskService`, `cacheManager`, `emitter`, `statusBarService`) | Undocumented and refactor-prone (TaskNotes already moved model logic into `@tasknotes/model` in 4.10). The runtime API wraps the same services, triggers the same `EVENT_TASK_UPDATED` (so the status bar refreshes), and carries a version + capability contract. | `app.plugins.getPlugin("tasknotes").api` |
| Writing `timeEntries` frontmatter yourself (`processFrontMatter`) | Bypasses TaskNotes' per-path lock, field mapping (users can rename `timeEntries`), cache update and events, so the status bar and cards desync. Violates the PROJECT.md data-format constraint. | `api.time.start/stop` (and `api.time.append/deleteEntry` if ever needed) |
| Relying only on `time.started`/`time.stopped` events | Not emitted for metadata-cache-driven changes (manual frontmatter edits, sync from another device). | Subscribe to `task.updated` + `cache.changed`, re-derive from `api.time.active()` |
| `obsidian-typings` (6.41.0) | Large, tracks private Obsidian internals, couples you to its release cadence. You need one property (`app.plugins`). | Tiny local module augmentation |
| `zczs520/tasknotes` 5.2.3 fork | Unknown provenance (PROJECT.md). Its version number is *ahead* of upstream (4.13.8), so don't confuse its APIs with upstream's. | Upstream callumalpass/tasknotes ≥ 4.10.0 |
| `setInterval` / `window.setInterval` without `registerInterval` | Leaks timers on plugin unload/reload. The obsidianmd lint rules flag related lifecycle mistakes. | `this.registerInterval(window.setInterval(tick, 1000))` |
| `manifest-beta.json` | Legacy BRAT mechanism. | Plain GitHub releases with assets |

## Stack Patterns by Variant

- Render an empty-state in the pane ("TaskNotes ≥ 4.10 required"). Register no TaskNotes listeners.
- Re-attempt binding on `app.workspace.onLayoutReady` and when TaskNotes emits `lifecycle` `ready`. Obsidian has no "plugin enabled" event, so a light retry (e.g. 2 s backoff, capped) or re-check on view focus is the practical fallback.
- Because TaskNotes may load after this plugin, bind inside `onLayoutReady` and `await api.lifecycle.ready()` before the first `active()` call.
- Its `api` object is replaced, and EventRefs registered on the old emitter go dead. Listen for `lifecycle` `unloading`, drop refs, and rebind on the next `ready`.
- Wrap all of this in one `TaskNotesGateway` class that owns the `api` reference and exposes a small, project-shaped interface (`getActive()`, `stop()`, `start()`, `switchTo()`, `onChange(cb)`). The view never sees `api` directly. That one seam is also what Vitest fakes.
- The pane shows a primary item (most recently started) plus a compact "also running" list.
- "Switch" stops *all* active entries before starting the new one, so it means "time only this".

## Version Compatibility

| Package A | Compatible With | Notes |
|---|---|---|
| `typescript-eslint@8.71.2` | `typescript >=4.8.4 <6.1.0`, `eslint ^8.57 \|\| ^9 \|\| ^10` | Hard ceiling on TS version. |
| `eslint-plugin-obsidianmd@0.4.2` | `eslint >=9.19` (declared), effectively `^9` via transitive deps; `@eslint/js ^9.30.1`; `typescript-eslint ^8.35.1`; `@eslint/json 0.14.0` | Declares `obsidian: 1.8.7` as a peer. npm prints a peer warning with `obsidian@1.14.4`; it's harmless (lint-time only). Add `overrides` or `--legacy-peer-deps` only if npm errors. |
| `obsidian@1.14.4` | `@codemirror/state 6.7.6`, `@codemirror/view 6.43.13` (peers) | Externalized by esbuild; never bundled. |
| `vitest@5.0.4` | `vite ^6.4 \|\| ^7 \|\| ^8`, Node `^22.12 \|\| ^24 \|\| >=26`, `@types/node ^22 \|\| >=24` | Node 24.13.1 local: OK. |
| `obsidian-test-mocks@7.2.1` | `obsidian ^1.12.3`, `vitest *` or `jest *` | OK with 1.14.4. |
| `ts-jest@29.4.14` (if Jest chosen) | `typescript >=4.3 <7`, `jest ^29 \|\| ^30` | OK with TS 6.0. |
| TaskNotes Runtime API v1 | TaskNotes ≥ 4.10.0; `ui.taskMenu` ≥ 4.11.0; tested reading 4.13.8 | Gate on `apiVersion === 1` + `hasCapability(...)`, never on version strings. |
| Plugin `minAppVersion 1.12.2` | TaskNotes 4.13.8 `minAppVersion 1.12.2`; BRAT 2.2.0 `minAppVersion 1.11.4` | Consistent floor. |

## Sources

- `callumalpass/tasknotes` @ `451679289d94` (2026-10-12), v4.13.8. Files read:
- `obsidianmd/obsidian-sample-plugin` @ `07ceb81d` (2026-08-02): `package.json`, `esbuild.config.mjs`, `tsconfig.json`, `eslint.config.mts`, `.npmrc`, `.github/workflows/release.yml`, `lint.yml`, `AGENTS.md`
- npm registry (`npm view`, 2026-10-13): versions, dist-tags, and peer dependencies for obsidian, typescript, esbuild, eslint, @eslint/js, typescript-eslint, eslint-plugin-obsidianmd, eslint-plugin-import, eslint-plugin-security, vitest, vite, jest, ts-jest, jest-environment-jsdom, obsidian-test-mocks, obsidian-typings, @tasknotes/model, @tasknotes/runtime-api (404), @types/node, globals, jiti
- `obsidianmd/obsidian-releases/desktop-releases.json`: latestVersion 1.14.4
- `TfTHacker/obsidian42-brat` `manifest.json`: 2.2.0; `pjeby/hot-reload` `manifest.json`: 0.3.1
- https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/: TS 6.0 changed defaults and deprecations (official; via WebFetch, cross-checked with search results; MEDIUM by seam, treated as HIGH as the official vendor source)
- https://tfthacker.com/brat-developers: BRAT release requirements, `manifest-beta.json` legacy (author's docs; via WebFetch; MEDIUM)
- https://forum.obsidian.md/t/functional-update-to-brat-version-picker-github-pre-releases-and-frozen-version-updates/98951: BRAT version picker / frozen versions (MEDIUM)
- https://forum.obsidian.md/t/obsidian-cli-exits-with-code-255-when-working-with-beta-community-plugin/113419 and third-party skill pages: Obsidian CLI `plugin:reload` (LOW)
- https://lilting.ch/en/articles/typescript-6-rc, https://noqta.tn/en/blog/typescript-6-release-features-migration-guide-2026: TS 6 migration corroboration (LOW, corroborating only)

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-fast` for a trivial task inline, with no subagents and no PLAN.md
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
