# Project Research Summary

**Project:** TaskNotes Timer Pane
**Domain:** Obsidian companion plugin (TypeScript): a sidebar ItemView that monitors and controls TaskNotes' regular (non-Pomodoro) time tracking in-process
**Researched:** 2026-10-13
**Confidence:** HIGH (integration surface read directly from TaskNotes source at v4.13.8 / 5.0.0-beta.5)

## Executive Summary

This is a small companion plugin that adds a persistent, glanceable control surface for TaskNotes time tracking. TaskNotes already has all the primitives (start, stop, active entries, time entries, events), but it shows regular tracking only in a status-bar indicator. Nothing in TaskNotes offers **switch** or **pause**. Open issues #2307, #1670, #2326 and #1079 ask for close to exactly this pane.

The main research finding changes a PROJECT.md constraint. TaskNotes 4.10.0 added a **versioned, documented JavaScript Runtime API v1** for companion plugins, at `app.plugins.getPlugin("tasknotes").api` (`apiVersion === 1`, `hasCapability(...)`). All four researchers confirmed this on their own. Build only against this API, through one anti-corruption `TaskNotesBridge`. Never touch `plugin.taskService`, `cacheManager` or `emitter`. The constraint "relies on TaskNotes internals" should be rewritten as "relies on TaskNotes Runtime API v1 (TaskNotes >= 4.10.0)". Events come from two places: `api.events` (`task.*`, `time.started` / `time.stopped`) and `api.lifecycle` (`ready`, `layout.ready`, `cache.changed`, `unloading`, `settings.changed`). Build the UI with vanilla Obsidian DOM, matching TaskNotes' own PomodoroView. Use esbuild per the sample plugin, and Vitest for pure time math.

Key risks:
1. **Several timers can run at once.** TaskNotes allows concurrent timers on different tasks, and `time.start` does not stop other timers.
2. **`time.*` events are incomplete.** They do not fire for file-edit or sync changes, so state must be re-derived from `api.time.active()` on any hint event.
3. **Switch is not atomic.** It is two writes, and TaskNotes only locks per task path.
4. **TaskNotes has no record of pause.** Pause state is owned by the pane and must be saved.

The only safe writes are `api.time.start` and `api.time.stop`.

## Key Findings

### Recommended Stack

Vanilla TypeScript Obsidian plugin, no runtime dependencies. See STACK.md.

**Core technologies:**
- `obsidian` typings **1.14.4 pinned exact**; manifest `minAppVersion` **1.12.2** (same floor as TaskNotes 4.13.8)
- TaskNotes **>= 4.10.0** at runtime (4.13.8 current; `ui.taskMenu` needs >= 4.11.0). Detect at runtime; there is no manifest dependency field.
- Type definitions: **write a trimmed, types-only copy of the TaskNotes API definitions into this repo** (`src/tasknotes/runtime-api.types.ts`) and record the commit it came from. Do not import TaskNotes' source to get its types, because that pulls in its whole source tree. `@tasknotes/runtime-api` is not on npm yet.
- TypeScript **6.0.3** (typescript-eslint 8.71.2 caps at <6.1), esbuild **0.28.2** (fall back to 0.25.5), Node 24, npm 11
- ESLint **9.39.5** (not 10), `eslint-plugin-obsidianmd` 0.4.2, Vitest 5.0.4 for pure logic, Hot Reload 0.3.1 for development
- UI: vanilla `ItemView` + `createDiv` / `createEl` / `setIcon`. No framework.

### Expected Features

**Must have (table stakes):**
- **TS-1** Sidebar view, ribbon icon and command, with no duplicate leaves
- **TS-2** Current task title (click opens the note)
- **TS-3** Live H:MM:SS for the current entry, computed from `startTime` and never kept as a counter
- **TS-4** Idle state with a "Start a task" button
- **TS-5** One-click stop
- **TS-6** Start or switch from a fuzzy task picker
- **TS-7** Stays in sync with changes made elsewhere
- **TS-8** Task total, including the live entry. TaskNotes totals leave out the open entry and round to whole minutes, so compute in seconds.
- **TS-9** Graceful degradation
- **TS-10** Correct after a restart
- **TS-11** Handles several active timers
- **TS-12** Pause and resume, with saved state
- **TS-13** Recent tasks, one-click resume

**Should have (differentiators):**
- **D-1** Estimate progress (`timeEstimate`). Cheap; recommend P1.
- **D-2** Today's log, built from raw entries and clipped at midnight. Do not use `api.time.summary`: it assigns entries to the day they started, rounds each down to minutes, and returns only the top 10 tasks.
- **D-3** Optional entry description, off by default
- **D-4** Complete the task from the pane
- **D-5** Hotkey commands for pause/resume and switch

**Defer (v2+):** estimate reminders and alerts, rich analytics, a custom always-on-top window (Obsidian pop-out windows already cover this), Pomodoro controls.

### Architecture Approach

Data flows one way: View → Controller → Bridge → TaskNotes (writes frontmatter and emits events) → Bridge → Store refresh → View update. See ARCHITECTURE.md.

**Major components:**
1. **TaskNotesBridge.** The only code that talks to TaskNotes.
   - Finds the API and checks version and capabilities. Availability states: missing, incompatible, loading, ready.
   - Subscribes to events and re-attaches if the API object changes. Re-checks on layout-ready, every 5 s, and when the view opens.
   - Adds a mutation context to writes: `{source: "tasknotes-timer-pane", correlationId, reason}`.
2. **TimerStore.** Holds a snapshot of the data and re-derives it with a 150-250 ms debounce whenever any event arrives. Compares by `(taskPath, startTime)` keys, not object identity.
3. **model/timeMath.ts.** Pure functions for elapsed time, totals, the day-clipped today log, and recent tasks. Fully unit tested.
4. **TimerController.** Runs stop, pause, resume, start and switch through one serial queue, with a busy state. Saves pause state. Shows a notice on failure.
5. **TimerPaneView + sections + TaskPickerModal.** Builds the DOM once and updates it in place. Ticks once per second, and stops rendering while the leaf is hidden.

### Critical Pitfalls

1. **Using TaskNotes internals.** Use only `tasknotes.api` behind the Bridge, and check capabilities.
2. **Writing `timeEntries` directly.** `tasks.update`, `time.append` and `processFrontMatter` are not under TaskNotes' lock, and the field name can be remapped. Only call `time.start` and `time.stop`.
3. **Assuming one timer.** Model state as `ActiveEntry[]`. The primary entry is the latest `startTime`, with a "+N others" indicator. `active()` also returns archived tasks.
4. **Non-atomic switch.** Use the serial queue, disable buttons while a write is in flight, and order writes stop then start. If the start fails, show a notice with "Resume A". Accept a gap of up to about 1 s between entries.
5. **Missed external changes.** Treat events as hints. Re-derive from `active()` and run a safety resync every 30-60 s and when the pane becomes visible. Expect `task-updated` twice per mutation, about 300 ms apart.
6. **Pause state lost or stale.** Save `{pausedTaskPath, pausedAt}`. Clear it when any timer starts, or when the task is completed, deleted or archived. Follow `task.moved`.

## Implications for Roadmap

The project uses coarse granularity, so this collapses PITFALLS' six suggested phases into four.

### Phase 1: Bridge + Pane Skeleton + Live Read-Only Display
**Rationale:** Everything depends on the Bridge and the data model. A read-only pane proves the integration, and especially the sync behavior, before any writes exist.
**Delivers:**
- Project scaffold
- Trimmed type definitions and Bridge, with availability states
- Store and timeMath, with tests
- ItemView with ribbon and command
- Current task, live elapsed time, task total, estimate progress
- Display of several active timers
- Idle and unavailable states
- Sync with changes made elsewhere
**Features:** TS-1, 2, 3, 4, 7, 8, 9, 10, 11 (display), D-1
**Avoids:** Pitfalls 1, 3 and 6

### Phase 2: Controls (Stop, Pause/Resume, Switch via Picker)
**Rationale:** The core value is acting in one or two clicks. All the write risks are here.
**Delivers:**
- Controller with serial queue
- Stop, pause/resume with saved state, picker-driven start and switch
- Error notices
- Hotkey commands
**Features:** TS-5, 6, 11 (switch policy), 12, D-5, optionally D-3 and D-4
**Avoids:** Pitfalls 2, 4 and 5

### Phase 3: Recent Tasks + Today's Log
**Rationale:** Both are read-side derivations from raw entries, and both reuse the switch path from Phase 2.
**Delivers:**
- Recent list: top 5-8 tasks, leaving out completed, archived and active ones
- Collapsible today's log, clipped at midnight and computed in seconds
**Features:** TS-13, D-2

### Phase 4: Hardening + Polish
**Rationale:** Catch failures that only appear across reloads, sleep and sync.
**Delivers:**
- Verified behavior across TaskNotes disable/enable and plugin reloads
- Correct elapsed time after sleep/wake
- Pop-out windows
- Behavior under rename and delete
- Rendering only while visible
- Settings tab
- Styling with Obsidian CSS variables
- BRAT-ready release

### Phase Ordering Rationale
- Read before write: sync correctness (Phase 1) is required before writes can be tested (Phase 2).
- Recent tasks and today's log depend on the switch semantics and on timeMath.
- Hardening comes last but is small, because the Bridge design already covers most of it.

### Research Flags
- **Phase 1:** May need light research on readiness timing. `layout.ready` fires only once, and `isReady()` changes at a different point from `ready()`. The researchers documented this; it needs only verification.
- **Phase 2:** Needs `/gsd-discuss-phase` to settle the open decisions below. Deep research is not needed.
- **Phases 3 and 4:** Standard patterns. Skip research.

### Open Decisions for Requirements
1. **Switch policy with several timers (the researchers disagree).** FEATURES recommends stopping **all** active timers (single focus, matching TaskNotesTimer and FR #1670). PITFALLS recommends stopping only the primary and warning if others remain. **Recommendation:** stop all by default, with a settings toggle for "stop other timers when starting" (ARCHITECTURE already lists this setting).
2. **Archived tasks.** `api.time.active()` includes archived tasks, but the status bar leaves them out. Recommendation: show them, labelled as archived, so a running timer is never hidden. Leave them out of the picker and recent list.
3. **Timers owned by Pomodoro.** Pomodoro starts regular trackers and stops only the ones it created. Should pane stop or switch touch them? Recommendation: show them, labelled as Pomodoro, and include them in the switch's stop-all only after confirming the behavior with the user. Pane pause should not apply to them.
4. **Desktop only.** The project is personal and runs on desktop, but the code uses no Node APIs. Recommendation: `isDesktopOnly: false` costs nothing, but test on desktop only. Confirm with the user.
5. **Descriptions on start.** `time.start` with a description does a second write that is not under TaskNotes' lock. Keep D-3 off by default, or defer it.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH / MEDIUM | Versions come from the npm registry. The TS 6 + esbuild 0.28 combination has not been tested together. |
| Features | HIGH | Based on the TaskNotes and TaskNotesTimer source plus issue-tracker demand. Competitor details are MEDIUM. |
| Architecture | HIGH | API surface verified in 4.13.8 and 5.0.0-beta.5. Load order is MEDIUM, but the design does not depend on it. |
| Pitfalls | HIGH | Each pitfall points to TaskNotes source lines. |

**Overall confidence:** HIGH

### Gaps to Address
- The PROJECT.md constraint about internals is out of date. Update it during requirements.
- Behavior of timers started by Pomodoro is unverified against the pane's controls. Test it in Phase 2.
- Exact readiness timing on a cold start needs manual verification in Phase 1.
- TaskNotes v5 is additive so far. Re-check the vendored types when v5 goes stable.

## Sources

### Primary (HIGH confidence)
- callumalpass/tasknotes source @ `451679289d94` (v4.13.8) and tag `5.0.0-beta.5`: `src/api/runtime-api.ts`, `TaskNotesAPI.ts`, `TaskService.ts`, `TaskManager.ts`, `StatusBarService.ts`, `PomodoroView.ts`, `timeTrackingUtils.ts`, `docs/javascript-api.md`, `docs/companion-plugins.md`
- obsidianmd/obsidian-sample-plugin @ `07ceb81d`; `obsidian.d.ts` 1.14.4; npm registry metadata; obsidian-releases `desktop-releases.json`
- jane-t/TaskNotesTimer v2.0.1 source

### Secondary (MEDIUM confidence)
- TaskNotes issues #2307, #2326, #1670, #2366, #1079
- Toggl and Clockify help docs; READMEs of other Obsidian timer plugins

---
*Research completed: 2026-10-13*
*Ready for roadmap: yes*
