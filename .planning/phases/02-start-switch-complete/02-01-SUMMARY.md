---
phase: 02-start-switch-complete
plan: 01
subsystem: ui
tags: [picker, start, runtime-api, shared-busy]
requires:
  - phase: 01-live-timer-pane
    provides: Bridge, store, serial write queue, timer cards and Stop
provides:
  - Persistent pane header and Start task action alongside existing timers
  - Deterministic searchable task picker with lifecycle-managed chip rows
  - Feature-local capability gates and reusable stateful runtime fakes
affects: [02-02, 02-03]
actuals:
  tasks: 3
  commits: 5
tech-stack:
  added: []
  patterns: [public SuggestModal, explicit row Components, shared controller busy state]
key-files:
  created: [src/model/taskPicker.ts, src/ui/TaskPickerModal.ts, tests/taskPicker.test.ts]
  modified: [src/state/TimerController.ts, src/ui/TimerPaneView.ts, src/tasknotes/TaskNotesBridge.ts, src/tasknotes/runtime-api.types.ts, styles.css]
key-decisions:
  - Start preserves every other running timer; duplicate selections do not write.
  - Completed tasks remain selectable and sort last; archived tasks are excluded.
  - Optional picker capabilities do not make the baseline timer bridge incompatible.
requirements-completed: [DISP-04, CTRL-05, CTRL-09]
coverage:
  - id: start
    description: Start a selected task alongside running timers with duplicate protection and shared busy state
    requirement: CTRL-05
    verification:
      - kind: integration
        ref: tests/controller.test.ts
        status: pass
    human_judgment: false
  - id: picker-policy
    description: Filter archived tasks, partition completed tasks last and rank all required search fields
    verification:
      - kind: unit
        ref: tests/taskPicker.test.ts
        status: pass
    human_judgment: false
  - id: live-picker
    description: Native Obsidian picker keyboard and chip mouse selection, slow rendering, close and reopen
    requirement: DISP-04
    verification: []
    human_judgment: true
    rationale: TaskNotes chip processors and native modal interaction require Obsidian desktop.
completed: 2026-10-15
status: complete
---

# Phase 02 Plan 01 Summary

The pane now starts tasks through a persistent header and a searchable picker without stopping existing timers.

## Accomplishments

- Start uses the shared write queue, rechecks active timers, reports duplicates and refreshes authoritative state.
- The picker follows the agreed candidate, search and ordering rules, renders task chips with text fallback and cleans up stale row renderers.
- Runtime signatures, capability checks, method receivers and retired reads are covered by tests and stateful fakes.

## Task Commits

1. Start tracer: `bd603ac`.
2. Picker policy and lifecycle: RED `e690acb`, implementation `5fb60e7`.
3. Capability gates and runtime contract: RED `b559255`, implementation `62bf520`.

## Verification

The original executor reported 173 passing tests, TypeScript, production build and lint excluding the unrelated nested worktree. It reached the workspace spend cap before writing this summary. Recovery verified these five commits on the current branch and restored this record rather than re-executing committed tasks.

Recovery reran `npm run check` successfully: TypeScript, production build, ESLint with zero warnings, and all 173 tests across 8 test files passed. The generated nested worktree is now excluded from the lint scan.

Live picker checks remain pending in WINDOWS.md entry 5. Stop all was deliberately disabled until plan 02-02 (entry 7).

## Deviations

- Updated `tests/fakes/fakeGateway.ts` to satisfy the extended gateway interface.
- Sandbox permissions required elevated build/commit execution.
- Recovery reconstructed this summary from committed artifacts and the executor's recorded results after its spend-cap failure; duration was not reconstructed.

## Self-Check: PASSED

The new picker/model/test files and all five plan commits exist. Live desktop behavior is explicitly pending.
