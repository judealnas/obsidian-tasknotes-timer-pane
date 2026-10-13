# Stack Research

**Domain:** Obsidian companion plugin (TypeScript): a sidebar `ItemView` that drives TaskNotes' regular time tracking in-process
**Researched:** 2026-10-13
**Confidence:** HIGH for the TaskNotes integration surface and package versions (both read straight from source code and the npm registry). MEDIUM for toolchain combinations nobody has run together yet (TS 6.0 + esbuild 0.28).

> **Confidence basis.** The GSD `classify-confidence` seam returns LOW for `github`/`webfetch` and LOW→MEDIUM (verified) for `websearch`. Several findings here go further than a web search. They come from primary artifacts read directly:
> - a shallow clone of `callumalpass/tasknotes` at commit `451679289d94` (2026-10-12, v4.13.8);
> - a clone of `obsidianmd/obsidian-sample-plugin` at commit `07ceb81d` (2026-08-02);
> - `npm view` registry metadata;
> - `obsidianmd/obsidian-releases/desktop-releases.json`.
>
> Those findings are marked HIGH (primary source). Findings that rest only on web search or blogs keep the seam's tier.

---

## Headline finding: TaskNotes has a public, versioned in-process API. Use it, not internals.

TaskNotes **4.10.0** added a documented **JavaScript Runtime API v1** for companion plugins. Release note: "Added a versioned TaskNotes JavaScript runtime API for companion plugins … task, time-tracking, Pomodoro, … event, and extension-registry surfaces". It is still present and growing in **4.13.8** (current, `manifest.json` `minAppVersion: 1.12.2`). The API lives on the plugin instance:

```ts
const tn = this.app.plugins.getPlugin("tasknotes") as { api?: TaskNotesRuntimeApiV1 } | null;
const api = tn?.api;
if (!api || api.apiVersion !== 1 || !api.hasCapability("time.write")) { /* degrade */ }
```

- **Docs:** `docs/javascript-api.md`, published at https://tasknotes.dev/javascript-api/
- **Contract:** `src/api/runtime-api.ts`, exported as `TaskNotesRuntimeApiV1` / `TaskNotesPublicAPI`. The author states it "can later become a standalone `@tasknotes/runtime-api` package". That package **does not exist on npm yet** (verified: npm 404).
- **Assignment:** `plugin.api = new TaskNotesAPI(plugin)` in `src/bootstrap/pluginBootstrap.ts`, called from `initializeCoreServices`.

**Do not** reach into `plugin.taskService`, `plugin.cacheManager`, `plugin.emitter`, `plugin.startTimeTracking()` or `plugin.getActiveTimeSession()`. All of these exist today, but they are undocumented internals. The runtime API wraps exactly these services:

| Runtime API call | Delegates to |
|---|---|
| `api.time.start` | `plugin.taskService.startTimeTracking` |
| `api.time.stop` | `plugin.taskService.stopTimeTracking` |
| `api.events` | `plugin.emitter` (`EVENT_TASK_UPDATED`) |

So the public surface gives you the same frontmatter writes and the same status-bar refresh, behind a capability-checked contract. The PROJECT.md constraint "relies on TaskNotes internals which aren't a stable public API" is **obsolete**. Update it to "relies on TaskNotes Runtime API v1 (TaskNotes ≥ 4.10.0)".

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

**Sync caveat (HIGH, read in `TaskNotesAPI.normalizeUpdatedEvent` and `TaskManager`):** `time.started`/`time.stopped` are *derived* by comparing `before` vs `after` active-entry counts. `before` exists only when the emitter payload carries `originalTask`:

| Write path | Carries `originalTask`? | `time.started`/`time.stopped` fire? |
|---|---|---|
| TaskService writes (status bar, task cards, commands, runtime API) | Yes | Yes |
| Metadata-cache-driven updates (hand-edited frontmatter, Obsidian Sync / git pulls from another device) | No | No (only `task.updated`) |

**Therefore:** subscribe to `task.updated` (plus `lifecycle` `cache.changed`), debounce about 150 ms, and re-derive state from `api.time.active()`. Treat `time.*` as a fast path only. TaskNotes' own status bar does the same thing: it refreshes on every `task-updated` and `data-changed`.

### TypeScript types for the TaskNotes contract

**Vendor a trimmed copy** of the contract into `src/tasknotes/runtime-api.ts`, as type-only declarations. Record the TaskNotes version/commit it was copied from in a header comment. Copy only:

- `TaskNotesRuntimeApiV1`: keep only the namespaces used (`time`, `tasks`, `query`, `events`, `lifecycle`, `catalog`, `errors`, `ui`, `hasCapability`, `apiVersion`)
- `ActiveTimeEntry`, `TaskNotesRuntimeTaskTimeData`, `TaskNotesRuntimeTimeSummary`, `TaskNotesRuntimeEventPayload`, `TaskNotesMutationContext`
- minimal `TaskInfo` / `TimeEntry` shapes: `TimeEntry = { startTime: string; endTime?: string; description?: string; duration?: number }`

Why not `import type … from "tasknotes/src/api/runtime-api"` (the docs' suggestion)? That file imports `../services/NaturalLanguageParser`, `../types`, `../types/settings` and `@tasknotes/model`. Using it means adding the whole TaskNotes repo as a git devDependency, and `tsc` would type-check TaskNotes' sources against your compiler settings. That is fragile and slow. `@tasknotes/model` on npm is `0.2.2` latest while TaskNotes pins `0.3.0-rc.9`, so it is not a clean types source either. Switch to `@tasknotes/runtime-api` if and when it is published.

---

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

---

## Installation

```bash
# No runtime dependencies.

# Dev dependencies (pin exact where noted)
npm install -D obsidian@1.14.4 typescript@~6.0.3 esbuild@0.28.2 \
  eslint@^9.39.5 @eslint/js@^9.39.5 typescript-eslint@^8.71.2 \
  eslint-plugin-obsidianmd@^0.4.2 globals@^17.13.0 jiti@^2.7.0 \
  @types/node@^24.19.2 vitest@^5.0.4

# Optional, only if testing view rendering:
npm install -D obsidian-test-mocks@^7.2.1 jsdom
```

Start from a clone of `obsidianmd/obsidian-sample-plugin`, not from scratch. Keep its `esbuild.config.mjs`, `version-bump.mjs`, `.npmrc`, `eslint.config.mts` and both GitHub workflows. Then apply the changes below.

### tsconfig.json (TS 6-clean; differs from the sample)

The sample's `"moduleResolution": "node"` is **deprecated (error by default) in TS 6.0**. TaskNotes' `baseUrl` and `target: ES6`-era options are similarly deprecated. Use:

```jsonc
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "strict": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "inlineSourceMap": true,
    "inlineSources": true,
    "types": []
  },
  "include": ["src/**/*.ts"]
}
```

### package.json scripts (sample + test)

```json
"dev": "node esbuild.config.mjs",
"build": "tsc -noEmit && node esbuild.config.mjs production",
"lint": "eslint .",
"test": "vitest run",
"version": "node version-bump.mjs && git add manifest.json versions.json"
```

### Typing `app.plugins`

`app.plugins` isn't in the public `obsidian.d.ts`. Add a 5-line module augmentation in `src/tasknotes/obsidian-augment.d.ts` declaring `App.plugins.getPlugin(id: string): Plugin | null`. Don't pull in `obsidian-typings` for one property.

---

## Release Flow (personal use via BRAT)

HIGH: sample-plugin `release.yml` read directly. HIGH/MEDIUM: BRAT behavior from tfthacker.com/brat-developers, cross-checked with the BRAT 2.2.0 manifest.

1. `npm version patch|minor|major`. This bumps `package.json`, then `version-bump.mjs` syncs `manifest.json.version` and `versions.json`. `.npmrc` `tag-version-prefix=""` makes the git tag exactly `1.2.3`, with no `v`. Obsidian's updater expects that.
2. `git push --follow-tags`. The sample's `release.yml` (Node 24, `npm ci && npm run build`, build-provenance attestation) creates a **draft** release with `main.js`, `manifest.json` and `styles.css`.
3. **Publish the draft on GitHub.** BRAT reads GitHub releases through the API, and drafts are not visible, so a draft release is not installable. Alternatively, drop `--draft` from the workflow for a personal plugin. Marking a release as *pre-release* is fine; BRAT's "latest" picks the highest semver release or pre-release.
4. In Obsidian: BRAT → "Add beta plugin" → `<user>/obsidian-tasknotes-timer-pane`. You can optionally freeze to a tag.
5. `manifest-beta.json` is **not needed** (legacy, pre-BRAT-1.1.0). BRAT fetches `manifest.json` from the release assets, not the repo root.
6. Avoid semver pre-release suffixes (`1.0.1-beta.1`) unless you accept that Obsidian's own updater won't offer the following `1.0.1`. Plain incrementing versions are simplest.

Manual install alternative: copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/<id>/`.

---

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

**If TaskNotes is missing, disabled, or `api.apiVersion !== 1`:**
- Render an empty-state in the pane ("TaskNotes ≥ 4.10 required"). Register no TaskNotes listeners.
- Re-attempt binding on `app.workspace.onLayoutReady` and when TaskNotes emits `lifecycle` `ready`. Obsidian has no "plugin enabled" event, so a light retry (e.g. 2 s backoff, capped) or re-check on view focus is the practical fallback.
- Because TaskNotes may load after this plugin, bind inside `onLayoutReady` and `await api.lifecycle.ready()` before the first `active()` call.

**If TaskNotes reloads (settings toggle, update):**
- Its `api` object is replaced, and EventRefs registered on the old emitter go dead. Listen for `lifecycle` `unloading`, drop refs, and rebind on the next `ready`.
- Wrap all of this in one `TaskNotesGateway` class that owns the `api` reference and exposes a small, project-shaped interface (`getActive()`, `stop()`, `start()`, `switchTo()`, `onChange(cb)`). The view never sees `api` directly. That one seam is also what Vitest fakes.

**If the user has multiple concurrent timers** (TaskNotes allows it):
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

Primary (read directly; HIGH):
- `callumalpass/tasknotes` @ `451679289d94` (2026-10-12), v4.13.8. Files read:
  - `src/api/runtime-api.ts`: full contract
  - `src/api/TaskNotesAPI.ts`: `startTime`/`stopTime`/`getActiveTimeEntries`/`normalizeUpdatedEvent`/`onLifecycle`
  - `src/bootstrap/pluginBootstrap.ts`: `plugin.api = new TaskNotesAPI(plugin)`
  - `src/services/TaskService.ts`: `startTimeTracking`/`stopTimeTracking`, per-path lock, same-task guard
  - `src/utils/TaskManager.ts`: metadata-driven `task-updated` without `originalTask`
  - `src/main.ts`: status bar refresh on `task-updated`/`data-changed`
  - `src/views/PomodoroView.ts`: vanilla `ItemView`
  - `docs/javascript-api.md`; `docs/releases/4.10.0.md` (runtime API introduced); `docs/releases/4.11.0.md` (`ui.taskMenu`)
  - `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `manifest.json`
- `obsidianmd/obsidian-sample-plugin` @ `07ceb81d` (2026-08-02): `package.json`, `esbuild.config.mjs`, `tsconfig.json`, `eslint.config.mts`, `.npmrc`, `.github/workflows/release.yml`, `lint.yml`, `AGENTS.md`
- npm registry (`npm view`, 2026-10-13): versions, dist-tags, and peer dependencies for obsidian, typescript, esbuild, eslint, @eslint/js, typescript-eslint, eslint-plugin-obsidianmd, eslint-plugin-import, eslint-plugin-security, vitest, vite, jest, ts-jest, jest-environment-jsdom, obsidian-test-mocks, obsidian-typings, @tasknotes/model, @tasknotes/runtime-api (404), @types/node, globals, jiti
- `obsidianmd/obsidian-releases/desktop-releases.json`: latestVersion 1.14.4
- `TfTHacker/obsidian42-brat` `manifest.json`: 2.2.0; `pjeby/hot-reload` `manifest.json`: 0.3.1

Secondary:
- https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/: TS 6.0 changed defaults and deprecations (official; via WebFetch, cross-checked with search results; MEDIUM by seam, treated as HIGH as the official vendor source)
- https://tfthacker.com/brat-developers: BRAT release requirements, `manifest-beta.json` legacy (author's docs; via WebFetch; MEDIUM)
- https://forum.obsidian.md/t/functional-update-to-brat-version-picker-github-pre-releases-and-frozen-version-updates/98951: BRAT version picker / frozen versions (MEDIUM)
- https://forum.obsidian.md/t/obsidian-cli-exits-with-code-255-when-working-with-beta-community-plugin/113419 and third-party skill pages: Obsidian CLI `plugin:reload` (LOW)
- https://lilting.ch/en/articles/typescript-6-rc, https://noqta.tn/en/blog/typescript-6-release-features-migration-guide-2026: TS 6 migration corroboration (LOW, corroborating only)

---
*Stack research for: Obsidian companion plugin (TaskNotes timer pane)*
*Researched: 2026-10-13*
