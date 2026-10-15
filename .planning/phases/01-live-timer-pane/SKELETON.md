# Walking Skeleton — TaskNotes Timer Pane

**Phase:** 1
**Generated:** 2026-10-13

## Capability Proven End-to-End

> With TaskNotes running in the dev vault, the user opens the sidebar pane from the ribbon or command palette, sees the timed task with a live H:MM:SS session clock and total read from `api.time.active()`, and stops it with one click through `api.time.stop()`. TaskNotes' status bar agrees.

Plan 01-01 lays the scaffold: the package-legitimacy gate, the pinned toolchain, the dev-vault deploy loop, the plugin entry point and the vendored TaskNotes contract. The read path is proven by plan 01-02 (pane, bridge, store, live card). The write path is proven by plan 01-05 (Stop through the serialized write queue). Plans 01-03 and 01-04 harden sync and set up the dev vault and UAT. Each later phase adds a slice on top without changing the decisions below.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Host / framework | Obsidian plugin, vanilla DOM in one `ItemView` (`TimerPaneView`), built once in `onOpen` and updated in place. No UI framework. | Matches TaskNotes' own PomodoroView look and lifecycle. About six widgets don't justify a framework (CLAUDE.md, STACK.md). |
| Integration seam | One anti-corruption module, `src/tasknotes/TaskNotesBridge.ts`. It exports the `TaskNotesGateway` interface and the only class that touches `app.plugins.getPlugin("tasknotes").api`. Gated on `apiVersion === 1` plus `hasCapability(...)`, never on version strings for features. | TaskNotes Runtime API v1 (>= 4.10.0) is the only allowed surface (CLAUDE.md). One seam means one place to change if TaskNotes ships API v2, and one interface for tests to fake. |
| TaskNotes types | Vendored, trimmed, type-only copy in `src/tasknotes/runtime-api.types.ts`. Header records source commit `callumalpass/tasknotes@451679289d94` (v4.13.8, MIT). | `@tasknotes/runtime-api` is not on npm. Importing TaskNotes source would pull in its whole tree. |
| Data layer | None of our own. TaskNotes owns time data in task frontmatter. Reads go through `api.time.active()` only (one call per refresh). The only write is `api.time.stop(path, context)` with `context.source = "tasknotes-timer-pane"`. | PROJECT.md data-format constraint: writes must go through TaskNotes' per-path lock and field mapping so the status bar and cards stay in sync. |
| State | Plugin-scoped singletons created in `main.ts`: `TaskNotesBridge` → `TimerStore` (snapshot, 200 ms trailing debounce, single-flight, signature diff, 45 s safety resync) → `WriteQueue` (serial), used by `TimerController` (manual Stop) and reused by Phase 2's start and switch. The view only renders. | State outlives any one view (the safety resync and bridge run with the pane closed), and every write has one serialized path. Phase 2's two-write actions (stop, then start) depend on that. The archive auto-stop that was also planned to share this queue (D-06..D-11) was superseded on 2026-10-13; the pane makes no automatic writes (D-05). |
| Identity model | An open time entry is keyed by `(taskPath, startTime)`. The store holds the plural `OpenTimer[]` derived from `active()`. The displayed timer is derived by `selectPrimary` (latest start, ties broken by path ascending). | TaskNotes allows several concurrent timers (DISP-06). The plural collection is the primary model, and "the current task" is a derived view, never stored. |
| Pure logic | `src/model/timeMath.ts` (`parseMs`, `sessionMs`, `totalMs`, `formatHms`, `selectPrimary`, `deriveSnapshot`, `derivePaneState`, `snapshotSignature`, `detectWakeGap`) and `src/model/errors.ts`. Neither imports `obsidian`. | Vitest can't load the types-only `obsidian` package, so tested modules must stay Obsidian-free. Injected `lookupPlugin`, `schedule` and `notify` keep the bridge, store and controllers testable. |
| Time math | Wall-clock derivation each tick: `max(0, Date.now() − Date.parse(startTime))`. Totals are summed in ms from raw `timeEntries`, never from TaskNotes' minute-floored summaries. | Matches the status bar to the second (DISP-02/03). Correct after sleep/wake with no counter state (SYNC-04). |
| Auth | Not applicable. In-process plugin, no network surface. TaskNotes' HTTP API is out of scope. | PROJECT.md out-of-scope table. |
| Toolchain | TypeScript `~6.0.3` (`tsc -noEmit`), esbuild `0.28.2` (CJS, es2021), ESLint `^9.39.5` with `eslint-plugin-obsidianmd ^0.4.2` and `typescript-eslint ^8.71.2`, Vitest `^5.0.4` (`vitest run --dir tests`, node environment), `obsidian@1.14.4` typings pinned exact, `minAppVersion 1.12.2`. No runtime `dependencies`. | Probe-verified combination (RESEARCH.md). TS 7 and ESLint 10 break the lint chain. |
| Definition of done | `npm run check` = `npm run build` (`tsc -noEmit` + production bundle) + `npm run lint` (`eslint . --max-warnings 0`) + `npm test` (`vitest run --dir tests`). Required green at the end of every plan (D-14). | One command a later phase reuses verbatim. |
| Deployment target | Repo-local, git-ignored dev vault `dev-vault/` (D-01, D-02). `npm run seed` copies the tracked `dev-vault-seed/` notes. `npm run deploy` does a one-shot build into `dev-vault/.obsidian/plugins/tasknotes-timer-pane/`. `npm run dev` does the same in watch mode, and Hot Reload 0.3.1 reloads via the `.hotreload` marker (D-03). The real vault is never a build target. | A bug in the stop path must not touch real `timeEntries` (D-01). |
| Directory layout | `src/main.ts` (plugin shell), `src/tasknotes/` (contract + bridge), `src/model/` (pure), `src/state/` (store, queue, controllers), `src/ui/` (view), `styles.css` (`tntp-` BEM, Obsidian CSS variables only), `tests/` (+ `tests/fakes/`), `scripts/`, `dev-vault-seed/`. | All TaskNotes coupling stays in one folder. Reads (store) and writes (controllers) are split. |

## Stack Touched in Phase 1

- [ ] Project scaffold: TypeScript, esbuild, ESLint + obsidianmd, Vitest, manifest, vendored TaskNotes contract (plan 01-01)
- [ ] Routing: Obsidian view registration, ribbon icon, command, `activateView` reveal-or-create in the right sidebar (plan 01-02)
- [ ] Data read: `api.time.active()` → `TimerStore` → live card (plan 01-02; hardened in 01-03)
- [ ] Data write: `api.time.stop(path, context)` through `WriteQueue` (plan 01-05)
- [ ] UI: Stop timer button wired to the write path; title opens the task note (plans 01-02, 01-05)
- [ ] Deployment: `npm run seed` + `npm run deploy` / `npm run dev` into `dev-vault/`, with Hot Reload (plans 01-01, 01-04)

## Out of Scope (Deferred to Later Slices)

- "Start a task" idle button, fuzzy task picker, start, switch, complete, switch-policy setting (Phase 2: DISP-04, CTRL-05/06/07/09/10)
- Pause and resume with saved pause state, Pomodoro label, hiding pause for Pomodoro timers (Phase 3: DISP-07, CTRL-02/03/04/08)
- Settings tab and plugin `data.json` (no settings exist in Phase 1)
- Recent tasks, today's log, estimate progress, "also running" list with per-row stop, hotkeys, session descriptions (v2)
- Any pane-side auto-stop. Completed tasks, including the user's archive flow (a completed-type status), are TaskNotes' own job (D-05). Timers on tasks with TaskNotes' archive flag display like any other timer (D-06..D-11 superseded 2026-10-13)
- Repo and release setup: GitHub repo, BRAT release, `versions.json`, `version-bump.mjs`, license (deferred in CONTEXT.md)
- Deleted or unreadable task files beyond the basename fallback (deferred in CONTEXT.md)
- TaskNotes HTTP API, TaskNotes internals, direct frontmatter writes (forbidden by PROJECT.md)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without changing its architectural decisions:

- Phase 2: The idle state gets "Start a task". A fuzzy picker can start or switch tasks: stop all, then start, through the same `WriteQueue`. Complete-from-pane. Busy and failure handling for two-write actions.
- Phase 3: Pause and resume owned by the pane: stop, then a new entry, with `{pausedTaskPath, pausedAt}` saved in plugin data. Pomodoro-controlled timers are labelled, and pause is hidden for them.
