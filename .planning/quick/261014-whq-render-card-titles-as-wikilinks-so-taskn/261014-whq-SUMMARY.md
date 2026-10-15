---
phase: quick-261014-whq
plan: 01
subsystem: ui
status: complete
tags: [ui, task-link-chip, task-menu, runtime-api]
requires:
  - TaskNotes Runtime API v1 (optional ui.taskMenu.show, capability ui.task-menu, TaskNotes >= 4.11)
  - Obsidian MarkdownRenderer.render / Component
provides:
  - TaskNotesGateway.showTaskMenu (capability-gated, never throws)
  - Card titles rendered as [[vault path]] so TaskNotes' task-link chip appears
  - OpenTimer.displayKey / taskDisplayKey in snapshotSignature (chip stays current)
affects:
  - src/ui/TimerPaneView.ts title rendering and click handling
  - TimerStore change detection (now also on task status/priority/other display fields)
tech-stack:
  added: []
  patterns:
    - Per-card child Component for MarkdownRenderer output, released on re-render, card removal and pane close
    - Render generation counter (titleSeq) to discard stale async renders
    - Event-time ownership check (paneOwnsTitle) instead of TaskNotes class names
key-files:
  created:
    - src/model/taskLink.ts
    - tests/taskLink.test.ts
  modified:
    - src/tasknotes/runtime-api.types.ts
    - src/tasknotes/TaskNotesBridge.ts
    - src/ui/TimerPaneView.ts
    - src/model/timeMath.ts
    - styles.css
    - tests/fakes/fakeTaskNotes.ts
    - tests/fakes/fakeGateway.ts
    - tests/bridge.test.ts
    - tests/contract.test.ts
    - tests/readPath.test.ts
    - tests/store.test.ts
    - .planning/phases/01-live-timer-pane/COVERAGE.md
decisions:
  - "ui.task-menu stays optional (not in REQUIRED_CAPABILITIES); the bridge reaches ready without it"
  - "Card title Markdown is only [[vault path without .md]] with no alias, so TaskNotes' chip shows the task's own title and the title never passes through the Markdown parser"
  - "Task display key = JSON of every top-level TaskInfo field except timeEntries, included in snapshotSignature and the title render key, because TaskNotes never refreshes chips outside markdown leaves"
metrics:
  duration: 5 min
  completed: 2026-10-14
  tasks: 3
  files: 14
actuals:
  tokens: 9700
  tasks: 3
  commits: 3
plan_head_before: e9d87d674c5ce25f4b8380c4328c554749008a64
plan_head_after: 1886e7780dd87a7efee8d12681b181198e60c712
requirements: [DISP-01]
---

# Quick 261014-whq Plan 01: Render card titles as wikilinks so TaskNotes' chip appears Summary

Card titles render `[[<vault path>]]` through Obsidian's MarkdownRenderer (per-card Component), so TaskNotes' task-link chip (status, priority, its own click and context menu) appears in the pane; with no chip, the title is a plain link that keeps DISP-01 and right-click opens TaskNotes' native menu via the optional Runtime API `ui.taskMenu.show`. A task display key in the snapshot signature re-renders the chip on status/priority changes.

## Tasks

| Task | Name | Commit | Key files |
|------|------|--------|-----------|
| 1 (tracer) | Right-click opens TaskNotes' native task menu (types, gateway, view) | 9869a78 | runtime-api.types.ts, TaskNotesBridge.ts, TimerPaneView.ts, fakes, bridge/contract tests, COVERAGE.md |
| 2 | Card titles render as task-link chips with a plain-link fallback | 0977286 | src/model/taskLink.ts, tests/taskLink.test.ts, TimerPaneView.ts, styles.css |
| 3 | Status/priority change re-renders the chip (display key) | 1886e77 | src/model/timeMath.ts, TimerPaneView.ts, readPath/store tests |

Tracer gate after Task 1: `npx vitest run --dir tests bridge contract && npm run check` re-run passed before expanding.

## What was built

- `TaskNotesRuntimeTaskMenuShowOptions { taskPath; event }` and optional `ui?.taskMenu.show` on the vendored contract, pinned in `tests/contract.test.ts`.
- `TaskNotesBridge.showTaskMenu(taskPath, event)`: false unless ready, `ui.task-menu` advertised and `ui.taskMenu.show` is a function; calls it as a method; a rejection is caught and logged ("Opening the TaskNotes task menu failed: ..."); a synchronous throw logs and returns false.
- View: `contextmenu` on the title defers to an already `defaultPrevented` event (the chip's own menu), otherwise calls the gateway and prevents default only when it returns true.
- `taskLinkpath` / `taskWikilink`: strips one trailing lowercase `.md`, rejects `[ ] | # ^ \r \n`, empty and non-string input.
- `updateTitle` / `renderTitleLink`: synchronous key check, text shown immediately for new cards, async render into a detached wrapper with its own Component, stale renders discarded via `titleSeq`, the pane's own `a.internal-link` (matched by `data-href`) gets the title text, `tabindex=-1`, `draggable=false`; an empty render or a throw falls back to text.
- Click/auxclick ownership evaluated at event time (`paneOwnsTitle`): when TaskNotes' chip owns the title, the pane never opens the note; the "Open task note" tooltip is removed over a chip; `tntp-title--chip` styles keep focus visible.
- `discardCard` used on card removal and in `onClose`.
- `taskDisplayKey` + `OpenTimer.displayKey`, included in `snapshotSignature` and `titleRenderKey`.

## Verification

- `npm run check` (tsc, esbuild production, ESLint 0 warnings, Vitest 137 tests in 6 files) passes.
- `npx vitest run --dir tests bridge contract taskLink store readPath` passes.
- `git diff --quiet -- package.json package-lock.json` holds (no dependency changes).
- `npm run deploy` built into `dev-vault/.obsidian/plugins/tasknotes-timer-pane/` (main.js and styles.css current).
- All plan acceptance greps pass (no `getPlugin` in the view, no markup-string DOM writes, taskLink has no obsidian import).

## Deviations from Plan

None - plan executed exactly as written. The global `createDiv` helper passed the obsidianmd lint rules, so the documented fallback was not needed.

## Manual check (not run, user to run in Obsidian desktop)

The Task 3 human-check from the plan is outstanding and recorded in `.planning/WINDOWS.md` as an `unrun-verify` entry: chips render and match a note's `[[link]]`; chip body/status-dot clicks are TaskNotes' only; right-click on the chip shows one menu and status/priority changes refresh the chip within about 1 s; a frontmatter edit refreshes it; with the overlay off, plain links keep click / Ctrl-click / middle-click / Enter and right-click shows TaskNotes' menu; no console errors on stop or pane close.

## Known limitation

Toggling TaskNotes' task-link overlay setting takes effect in the pane at the next title re-render (task/title/display-field change, or reopening the pane), as documented in the plan.

## Self-Check: PASSED

- FOUND: src/model/taskLink.ts, tests/taskLink.test.ts
- FOUND commits: 9869a78, 0977286, 1886e77 (ancestors of HEAD)
