---
phase: 04-staging-foundations
plan: 05
subsystem: tasknotes-bridge
status: complete
tags: [staging, recurring, sc3, setup-01, contract, feature-gate]
requires:
  - 04-01 (spike pins: null unstage keeps the key; Q4 toggle finding)
  - 04-04 (TaskNotesUserField, catalog.userFields, fake userFields)
provides:
  - STAGING_MIN_TASKNOTES_VERSION = "4.13.0"
  - TaskNotesGateway.stagingAvailability / updateTask
  - TaskNotesGateway.recurringAvailability / toggleCompleteInstance
  - TaskNotesTaskPatch, optional tasks.update, optional recurring.toggleCompleteInstance (vendored types)
  - fake TaskNotes tasks.update (pinned semantics) and recurring namespace; fake gateway recorders and availability setters
affects:
  - Phase 6 (staging writes go through updateTask, gated on stagingAvailability)
  - Phase 7 (recurring completion goes through toggleCompleteInstance, gated on recurringAvailability)
tech-stack:
  added: []
  patterns:
    - "Availability method = connectedApi + manifest-version floor + capability/method tuples (startAvailability shape), never throws"
    - "Gated write = guard rule, then featureApi, method call keeps the receiver, echo dropped (resolve void)"
key-files:
  created:
    - .planning/phases/04-staging-foundations/tdd/red-04-05-t1.json
    - .planning/phases/04-staging-foundations/tdd/red-04-05-t1.tap
    - .planning/phases/04-staging-foundations/tdd/red-04-05-t2.json
    - .planning/phases/04-staging-foundations/tdd/red-04-05-t2.tap
  modified:
    - src/tasknotes/runtime-api.types.ts
    - src/tasknotes/TaskNotesBridge.ts
    - tests/fakes/fakeTaskNotes.ts
    - tests/fakes/fakeGateway.ts
    - tests/bridge.test.ts
    - tests/contract.test.ts
decisions:
  - "Staging and recurring completion share one 4.13.0 floor (STAGING_MIN_TASKNOTES_VERSION) read from the TaskNotes manifest; an unparseable version is not treated as older, so the capability/method checks decide"
  - "The fake TaskNotes tasks.update keeps a null-written key (stores null) per 04-01 Pin (b); undefined is skipped; unregistered non-TaskInfo keys are echoed but not stored"
  - "The fake recurring.toggleCompleteInstance toggles the exact date given (no occurrence snapping); real 4.13.8 completes the scheduled instance instead (Q4), which Phase 7 research owns"
metrics:
  duration: "~6.5 min"
  completed: 2026-11-12
  tasks: 3
  files: 10
estimate:
  tokens: 60000
  tasks: 3
actuals:
  tokens: 8700
  tasks: 3
  commits: 5
plan_head_before: ff3136c16872df5e2971dce147e14185d27e1baa
plan_head_after: 17125f837f63af4dee52212576aa24a0ff27e18e
---

# Phase 4 Plan 05: Staging and recurring write contract Summary

The bridge can now tell whether the running TaskNotes supports staging and recurring completion. Each check is a never-throwing availability method with a 4.13.0 floor and capability/method tuples. The bridge also owns two gated writes:
- `updateTask` refuses `customFrontmatter`.
- `toggleCompleteInstance` accepts only a bare `YYYY-MM-DD`.

Neither touches `REQUIRED_CAPABILITIES`, so Timers on TaskNotes 4.10-4.12 work exactly as in v0.2.

## What was built

- `runtime-api.types.ts`:
  - `TaskNotesTaskPatch = Partial<TaskInfo> & Record<string, unknown>`.
  - Optional `tasks.update(path, updates, context?)`.
  - Optional `recurring.toggleCompleteInstance(path, date?, context?)`.
  - All return `Promise<TaskInfo>` and carry the 4.13.x comments.
- `TaskNotesBridge.ts`:
  - `STAGING_MIN_TASKNOTES_VERSION = "4.13.0"` sits next to `MIN_TASKNOTES_VERSION`.
  - `stagingAvailability()` checks these tuples: `tasks.read`/`tasks.list`, `tasks.write`/`tasks.update`, `catalog.read`/`catalog.userFields`.
  - `recurringAvailability()` checks `recurring.write`/`recurring.toggleCompleteInstance`.
  - Both report "TaskNotes 4.13.0 or newer is needed for ..." below the floor and "TaskNotes is not connected" when not ready.
  - `updateTask` throws "Staging writes use registered fields only" for a patch with its own `customFrontmatter` member. Otherwise it goes through `featureApi("tasks.write", "tasks.update", ...)`.
  - `toggleCompleteInstance` throws "Recurring completion needs a YYYY-MM-DD day" unless the date matches `/^\d{4}-\d{2}-\d{2}$/`. Otherwise it goes through `featureApi("recurring.write", "recurring.toggleCompleteInstance", ...)`.
  - Both writes forward the context and resolve void.
  - The four members are on `TaskNotesGateway`, with doc comments.
  - `REQUIRED_CAPABILITIES` is unchanged.
- `tests/fakes/fakeTaskNotes.ts`:
  - `tasks.update` follows the pinned semantics:
    - It stores TaskInfo keys and registered user-field keys that are not undefined. Null is stored and the key is kept.
    - It drops other keys and echoes `{...storedBefore, ...patch}`.
    - It also has `updateCalls`, `failUpdateWith`, and rejects an unknown path.
  - The new `recurring` namespace (option `recurring`, default true) provides `toggleCompleteInstance`, `toggleCalls` and `failToggleWith`.
  - `"recurring.write"` is in `DEFAULT_CAPABILITIES`.
  - `omitMethods` now accepts `"tasks.update"` and `"recurring.toggleCompleteInstance"`.
- `tests/fakes/fakeGateway.ts` gains:
  - the `updateCalls` and `toggleCalls` recorders, with `updateTask` and `toggleCompleteInstance`
  - `stagingAvailability` and `recurringAvailability`
  - the `setStagingAvailable` and `setRecurringAvailable` setters (default true)
- Tests:
  - bridge describes:
    - "staging write contract (SC3)", 15 cases
    - "recurring completion contract", 11 cases, including all four rejected date formats
    - "Timers unaffected by staging (SC3)", 3 cases. 4.12.3 with every staging and recurring piece removed stays ready, and active/start/stop reach the fake.
  - The contract pins cover `tasks.update`, `TaskNotesTaskPatch` and `recurring.toggleCompleteInstance`.

## TDD Gate Compliance

- Task 1 (tracer):
  - RED (`81b0f2c`): the target is `tests/bridge.test.ts > staging write contract (SC3) > a supported TaskNotes reports staging available and receives a staged write through tasks.update`. The classifier returned `RED_EVIDENCE_OK` (`target_test_failed`, exit 1, tap-flat with `-t`).
  - Semantic check: the module loaded and the target failed on the planned single-line assertion (`expected false to be true`). The skeleton `stagingAvailability()` returned unavailable.
  - GREEN: `aebd99b`.
  - Tracer gate: interactive mode, `human_verify_mode: end-of-phase`, and `<verify>` is fully automated. The rerun passed (72 bridge tests, tsc and eslint clean), so expansion continued.
- Task 2:
  - RED (`3ca274a`): the target is `tests/bridge.test.ts > recurring completion contract > a supported TaskNotes reports recurring completion available and receives the explicit day`. The classifier returned `RED_EVIDENCE_OK`, and the target failed on `expected false to be true` against the skeleton.
  - GREEN: `eb652c9`.
- Task 3: test-only (type pins plus a regression proof of behavior Tasks 1 and 2 already built). No RED was possible without breaking working code, so it was committed once as `test` (`17125f8`). See Deviations.
- REFACTOR: none needed.

## Verification

- `npx vitest run --dir tests bridge`: 83 passed after Task 2, 86 after Task 3.
- `npx vitest run --dir tests contract bridge pauseResume controller store`: 7 files, 246 tests passed. `contract.test.ts` and `pauseResume.test.ts` are both in the run.
- `npm run check`: exit 0 (tsc, esbuild production, eslint `--max-warnings 0`, 17 files and 539 tests).
- Acceptance greps:
  - `STAGING_MIN_TASKNOTES_VERSION = "4.13.0"` appears once.
  - `REQUIRED_CAPABILITIES` is still `["time.read", "time.write", "tasks.events", "lifecycle.events"]`.
  - `"tasks.write", "tasks.update"` is present.
  - `"recurring.write", "recurring.toggleCompleteInstance"` is present.
  - "Recurring completion needs a YYYY-MM-DD day" appears once.
  - The contract file contains `TaskNotesTaskPatch` and `toggleCompleteInstance`.
- `git diff --stat ff3136c..HEAD -- src/state src/ui src/model` prints nothing (BASE = `ff3136c`).
- `grep -rnE "processFrontMatter|fileManager" src` prints nothing.

## Deviations from Plan

**1. [Rule 3 - Blocking] RED commits include type/fake scaffolding and skeleton bridge methods**
- Found during: Task 1 and Task 2 RED (same approach as 04-04).
- Issue: tests alone would fail on missing members, either at typecheck or as a load fault, which is INVALID_RED.
- Fix: the RED commits carry the vendored types, the fake support, and skeleton bridge methods that report unavailable and resolve without calling TaskNotes. Each GREEN commit replaced its skeletons.
- Commits: 81b0f2c, 3ca274a.

**2. [TDD scope] Task 3 has no RED commit**
- Its behavior was already built in Tasks 1 and 2, and the task is limited to tests (the type pins and the v0.2 regression proof). Nothing would fail, so a RED commit would have been an `unexpected_green`.

**3. [Rule 1 - Lint] An explicit variable annotation replaced the `as` cast in the fake toggle**
- `@typescript-eslint/no-unnecessary-type-assertion` flagged the cast. Fixed inside Task 2 GREEN (`eb652c9`).

**4. [Rule 2] Extra cases beyond the plan's behavior list**
- An undefined value is skipped.
- `tasks.read`/`tasks.list` gating is checked.
- `updateTask` and `toggleCompleteInstance` reject when the method or capability is missing.
- TaskNotes write failures propagate.
- A 4.13.8 TaskNotes missing every staging method stays ready.

## Known Stubs

None. All RED skeletons were replaced in their GREEN commits.

The fake toggle's "exact date" behavior is deliberate per the plan. It does not model real TaskNotes 4.13.8, which completes the scheduled instance (04-01 Q4), and Phase 7 research owns that.

## Threat Flags

None beyond the plan's threat model:
- T-04-15: `customFrontmatter` is refused before TaskNotes is called (tested).
- T-04-16: only a bare YYYY-MM-DD date reaches TaskNotes (tested with four formats).
- T-04-17: `REQUIRED_CAPABILITIES` is unchanged, and the 4.12.3 regression is tested.
- T-04-18: the capability and method checks still run after the version floor.

## Self-Check: PASSED

- FOUND: tdd/red-04-05-t1.{json,tap}, tdd/red-04-05-t2.{json,tap}, and all 6 modified source/test files.
- FOUND commits: 81b0f2c, aebd99b, 3ca274a, eb652c9, 17125f8 (5 = `git rev-list --count ff3136c..HEAD`).
