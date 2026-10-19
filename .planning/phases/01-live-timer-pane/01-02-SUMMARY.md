---
phase: 01-live-timer-pane
plan: 02
subsystem: ui
tags: [obsidian-plugin, tasknotes, walking-skeleton, itemview]

requires:
  - "01-01: pinned toolchain, D-14 gate, dev-vault deploy loop, vendored runtime-api.types.ts"
provides:
  - "src/tasknotes/TaskNotesBridge.ts: TaskNotesGateway, BridgeState, TaskNotesBridge (probe/active/dispose), isVersionOlder, TASKNOTES_PLUGIN_ID, MIN_TASKNOTES_VERSION, REQUIRED_CAPABILITIES, PROBE_INTERVAL_MS, MUTATION_SOURCE"
  - "src/model/timeMath.ts: parseMs, sessionMs, totalMs, formatHms, selectPrimary, deriveSnapshot, derivePaneState, displayTitle, moreRunningLabel, othersTooltip; ParsedEntry, OpenTimer, TimerSnapshot, PaneState"
  - "src/state/TimerStore.ts: TimerStore (subscribe, getSnapshot, requestRefresh, refreshNow, dispose)"
  - "src/ui/TimerPaneView.ts: TimerPaneView, VIEW_TYPE_TIMER_PANE = tasknotes-timer-pane, TimerPaneServices"
  - "src/main.ts: onload wiring, App.plugins augmentation, ribbon 'Open TaskNotes timer', command open-timer-pane 'Open timer pane', activateView reveal-or-create"
  - "styles.css: tntp- BEM rules with Obsidian CSS variables only"
affects: [01-03, 01-04, 01-05]

actuals:
  tokens: 11189     # chars/4 over the 7 files changed (44755 chars)
  tasks: 2
  commits: 3
plan_head_before: 7ada2a8fe5b7fd89c4bc0eb53fb501092818c484
plan_head_after: 1f744c13911e3cb01e9aba7a5de2cf7135f43902

tech-stack:
  added: []
  patterns:
    - "One bridge owns the TaskNotes api reference; TaskNotes refs are kept in a private off-array, never routed through Obsidian registerEvent"
    - "Plural OpenTimer[] snapshot; the displayed timer is derived by selectPrimary, never stored"
    - "View visibility driven only by root tntp-pane--{state} / tntp-pane--others modifier classes"
    - "setTextIfChanged / setTooltipIfChanged so ticks and refreshes do not re-announce the polite live region"

key-files:
  created:
    - src/tasknotes/TaskNotesBridge.ts
    - src/model/timeMath.ts
    - src/state/TimerStore.ts
    - src/ui/TimerPaneView.ts
    - tests/readPath.test.ts
  modified:
    - src/main.ts
    - styles.css

key-decisions:
  - "Title accessible name uses aria-labelledby to a visually hidden 'Open {title}' span, because Obsidian's setTooltip writes aria-label (verified in obsidian.asar) and would otherwise overwrite either the 'Open task note' tooltip or the accessible name"
  - "deriveSnapshot also drops an entry with no usable path (taskPath, else task.path); such an entry can be neither opened nor stopped"
  - "TimerStore ignores an active() result that resolves after the bridge has left ready, so a stale read never resurrects a snapshot outside ready"
  - "An empty-string endTime counts as open, matching TaskNotes' own !entry.endTime test"
  - "activateView() takes no arguments; ribbon and command share one open callback that catches and logs a rejection"

patterns-established:
  - "Fake TaskNotes api in tests records lifecycle/events handlers so tests fire layout.ready and task.updated directly"

requirements-completed: [PANE-01, PANE-02, PANE-03, DISP-01, DISP-02, DISP-03, DISP-05, DISP-06]

coverage:
  - id: D1
    description: "Bridge availability gate: missing, incompatible (with version), loading (no api yet or isReady() false), ready; throwing api falls back to missing; subscriptions released on dispose"
    requirement: "DISP-05"
    verification:
      - kind: unit
        ref: "tests/readPath.test.ts#walking skeleton: TaskNotes -> bridge -> store -> pane state"
        status: pass
    human_judgment: false
  - id: D2
    description: "Read path end to end: probe -> refreshNow -> primary is the latest start -> running; task.updated with an empty fixture -> idle; layout.ready connects from loading without a reload"
    requirement: "DISP-06"
    verification:
      - kind: unit
        ref: "tests/readPath.test.ts#ready TaskNotes with open entries shows the most recently started timer, then idle after task.updated"
        status: pass
    human_judgment: false
  - id: D3
    description: "Time math and primary selection: formatHms floors and clamps, totalMs to the second, path tie-break, dropped entries, archived ranked like any other, identity invariant (1 primary + N-1 others, unique keys)"
    requirement: "DISP-02"
    verification:
      - kind: unit
        ref: "tests/readPath.test.ts#formatHms|sessionMs|totalMs|selectPrimary|deriveSnapshot"
        status: pass
    human_judgment: false
  - id: D4
    description: "Display copy: displayTitle basename fallback, '+N more running', 'Also running: …, and {k} more'"
    requirement: "DISP-06"
    verification:
      - kind: unit
        ref: "tests/readPath.test.ts#display copy"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-14 gate green and the pane deploys into the dev vault"
    verification:
      - kind: other
        ref: "npm run check"
        status: pass
      - kind: other
        ref: "npm run deploy && test -f dev-vault/.obsidian/plugins/tasknotes-timer-pane/{main.js,manifest.json,styles.css,.hotreload}"
        status: pass
    human_judgment: false
  - id: D6
    description: "In Obsidian: ribbon/command reveal one right-sidebar leaf (also after moving it), restart restore, title click and Ctrl/Cmd-click, live session and total, '+1 more running' tooltip, long title wraps, 100:00:00 clock on one line at minimum width, archived timer looks like any other"
    requirement: "PANE-01"
    verification: []
    human_judgment: true
    rationale: "Workspace placement, restart restore, link opening and narrow-width rendering only happen inside the running app; harvested into the end-of-phase UAT (plan 01-04, D-13)"

duration: 7min
completed: 2026-10-14
status: complete
---

# Phase 01 Plan 02: Walking Skeleton Read Path Summary

**The pane opens from the ribbon or command and reads TaskNotes through one capability-gated bridge (`time.active()`, `isReady()` gate, `layout.ready` + `task.updated` subscriptions). It shows the most recently started timer with a title link, a live H:MM:SS session, a total to the second, and "+N more running". When there is nothing to show, it shows the four honest message states.**

## Performance

- **Duration:** about 7 min
- **Started:** 2026-10-15T02:11:27Z
- **Completed:** 2026-10-15T02:18:21Z
- **Tasks:** 2
- **Files:** 5 created, 2 modified

## Accomplishments

- `TaskNotesBridge` implements the interface exactly:
  - Probe rules 1 to 5 sit inside one try/catch that falls back to `missing`.
  - `isVersionOlder` strips prerelease and build suffixes and returns false for unknown versions.
  - Listeners are notified only when the state kind or version changes, each call wrapped in try/catch.
  - `active()` rejects with "TaskNotes is not connected" outside `ready`.
- `timeMath` holds all the pure logic:
  - `formatHms` floors to whole seconds and clamps negative values to 0:00:00.
  - `totalMs` is summed in ms from the task's own `timeEntries`; the legacy `duration` field is ignored.
  - `selectPrimary` picks the latest start and breaks ties by path with a plain `<`.
  - `deriveSnapshot` treats every field as untrusted, and never reads the archive flag.
  - The display-copy helpers (`displayTitle`, `moreRunningLabel`, `othersTooltip`) live here too.
- `TimerStore` refreshes from `gateway.active()` whenever the bridge enters `ready` or reports data. Its snapshot is null outside `ready`. On a failed refresh it logs the message and keeps the previous snapshot.
- `TimerPaneView`:
  - Builds the UI-SPEC DOM once and sets the root `tntp-pane--{state}` and `tntp-pane--others` modifiers.
  - Uses the Copywriting Contract strings verbatim.
  - Ticks once a second from the wall clock, with no TaskNotes calls, and skips the tick while hidden.
  - The title opens the note: Ctrl/Cmd-click opens a new tab, and Enter or Space does a plain open.
- `main.ts`:
  - Calls `registerView` synchronously.
  - Adds the ribbon icon and the command, which share a reveal-or-create `activateView`.
  - Probes on `onLayoutReady` and every 5 s. It detaches no leaves on unload.
- `styles.css` uses Obsidian variables only. The clock is set to `min(calc(var(--font-ui-large) * 1.6), 17cqi)`, nowrap, tabular-nums.
- `tests/readPath.test.ts` (404 lines, 34 tests) covers the end-to-end read path through the real modules plus every Task 2 behavior input.

## Task Commits

1. **Task 1 (tracer): Walking skeleton read path:** `8e48dce` (feat)
2. **Task 2: Complete the running card:** `ecd0648` (test, RED: 6 failing), then `1f744c1` (feat, GREEN: 34/34)

**Tracer gate:** This is not auto mode, and `human_verify_mode` is end-of-phase. Task 1's `<verify>` is automated-only, so it was re-run (all three commands green) and execution moved on to Task 2 with no checkpoint. Tracer verified end to end, then expanded.

## Files Created/Modified

- `src/tasknotes/TaskNotesBridge.ts`: availability state machine, event attach/detach, gateway
- `src/model/timeMath.ts`: pure time math, snapshot derivation, display copy
- `src/state/TimerStore.ts`: snapshot store
- `src/ui/TimerPaneView.ts`: `ItemView` with the card, the message states and the tick
- `src/main.ts`: plugin wiring, plus the `App.plugins` module augmentation
- `styles.css`: `tntp-` rules
- `tests/readPath.test.ts`: read-path and time-math tests

## Decisions Made

See `key-decisions` in the frontmatter. The non-obvious one is the title's accessible name. In the installed Obsidian bundle, `setTooltip` is `e.setAttribute("aria-label", t)`, and the tooltip reads `aria-label` on hover. A single attribute therefore can't hold both the "Open task note" tooltip and the "Open {title}" accessible name. `aria-labelledby` takes precedence over `aria-label` for the accessible name, so it points at a visually hidden span.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] The title's accessible name would have been lost to the tooltip**
- **Found during:** Task 2
- **Issue:** The plan asks for both `setTooltip(titleEl, "Open task note")` and `aria-label="Open {title}"`. Obsidian's `setTooltip` writes `aria-label` (verified in `obsidian.asar`), so one value would overwrite the other.
- **Fix:** Added a visually hidden `span.tntp-visually-hidden` with a per-view unique id, holding "Open {title}", and set `aria-labelledby` on the title to point at it. Added the matching `.tntp-visually-hidden` rule. That rule uses the standard 1px clip pattern, which has no color literals.
- **Files modified:** `src/ui/TimerPaneView.ts`, `styles.css`
- **Commit:** `1f744c1`

**2. [Rule 2 - Missing Critical] Untrusted-data hardening in `deriveSnapshot` and `TimerStore`**
- **Found during:** Task 1
- **Issue:** An active entry with no usable path can't be opened or stopped. A slow `active()` that resolves after the bridge has left `ready` would have resurrected a stale snapshot.
- **Fix:** `deriveSnapshot` takes `taskPath`, falls back to `task.path`, and drops the entry when neither is a usable path. `refreshNow` re-checks `ready` and its disposed state after the await.
- **Files modified:** `src/model/timeMath.ts`, `src/state/TimerStore.ts`
- **Commit:** `8e48dce`

**3. [Interface detail] `activateView` catches its own rejection at the call site**
- The ribbon and the command share one `open` callback: `void this.activateView().catch(log)`. A rejected reveal is logged instead of becoming an unhandled rejection. The plan's `() => void this.activateView()` shape is otherwise kept.

The vendored contract (`runtime-api.types.ts`, `tests/contract.test.ts`) and every toolchain file are unchanged. `git diff --quiet` passed before each task commit.

---

**Total deviations:** 3 (2 missing-critical, 1 interface detail)
**Impact on plan:** All three are small correctness and accessibility fixes. No scope creep, and the exported names are exactly as in the Interfaces block.

## Issues Encountered

- The non-TTY Vitest reporter prints only totals. `--reporter=verbose` lists the `readPath.test.ts` cases (the same note as 01-01).
- Bash heredocs containing Python triple-quoted strings failed to parse in this harness, so file edits went through the Edit tool instead. There was no effect on the output.

## Known Stubs

None. The Stop action is deliberately absent: plan 01-05 adds it, as the UI-SPEC DOM notes. The debounce and single-flight guard behind `requestRefresh()` belong to plan 01-03.

## Threat Flags

None. No new surface beyond the plan's threat model. All text goes through `setText`, `createEl({ text })` or `setTooltip`, there are no HTML-string APIs or style assignments, and the pane makes no writes.

## User Setup Required

None. The in-Obsidian checks are in the end-of-phase UAT (plan 01-04), and they are recorded in `.planning/WINDOWS.md` as an `unrun-verify` entry.

## Next Phase Readiness

- Ready for 01-03 (sync hardening): it adds the debounce and single-flight guard behind `TimerStore.requestRefresh()`, plus the lifecycle and vault listeners in the bridge.
- Ready for 01-05 (Stop): `MUTATION_SOURCE` is exported, and the card has room for `tntp-actions`.

---
*Phase: 01-live-timer-pane*
*Completed: 2026-10-14*

## Self-Check: PASSED

- All 7 key files exist on disk.
- Commits `8e48dce`, `ecd0648` and `1f744c1` are on this branch. `check evaluation-scope --plan 01-02 --commits-only` resolves all three.
- Task 1 acceptance criteria AC1 to AC10 pass, and every key_links pattern matches. Task 2 acceptance criteria AC1 to AC6 pass.
- Plan verification: `npm run check` exits 0 (44 tests). `npm run deploy` writes `main.js`, `manifest.json`, `styles.css` and `.hotreload` to the dev-vault plugin folder.
