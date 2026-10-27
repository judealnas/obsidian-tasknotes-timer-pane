---
phase: quick-261027-mcs
plan: 01
subsystem: ui
tags: [drag-and-drop, card-order, persistence]
status: complete
commits: 3
plan_head_before: e5873fcaf7ed7dce8095f947aa76c9e856ee2529
plan_head_after: 118b6f8
key-files:
  created: [src/model/cardOrder.ts, src/state/CardOrderStore.ts, tests/cardOrder.test.ts, tests/cardOrderStore.test.ts]
  modified: [src/main.ts, src/ui/TimerPaneView.ts, styles.css, README.md, tests/main.test.ts]
completed: 2026-10-27
---

# Quick 261027-mcs: Drag-and-drop card reordering Summary

Timer cards can be reordered by dragging a handle or with Up/Down arrows on it; the order persists in data.json via the existing `persistAll` writer and never touches TaskNotes.

## What was built
- `orderTimers` / `moveKey` / `moveKeyBy` / `loadCardOrder` (pure, defensive loader capped at 1000 keys): new timers go on top, stale keys ignored.
- `CardOrderStore`: load-once, set/subscribe/persist, fixed log message on persist failure.
- main.ts: `cardOrder` owned key, written only when non-empty (existing exact-equality tests unchanged), loaded in the settingsReady chain, passed to the view.
- TimerPaneView: handle button (only draggable element), HTML5 dragstart/dragover/drop/dragend, drop-line indicator, foreign drags ignored (`dragKey` guard), store subscription keeps multiple panes in sync.
- styles.css and one README line.

## Deviations from Plan
None. Minor: to keep Task 2 lint/tsc clean, the `cardOrder` function import in the view was added in Task 3 (only the type import in Task 2).

## Verification
`npm run check` passed: tsc, production build, eslint (0 warnings), vitest 381/381. No changes under src/tasknotes/, TimerController or TimerStore. Manual drag smoke test in the dev vault not performed (noted in plan as non-blocking).

## Known Stubs
None.

## Self-Check: PASSED
