---
phase: 04-staging-foundations
plan: 04
subsystem: tasknotes-bridge
status: complete
tags: [staging, user-fields, setup-01, d-02, d-03, contract]
requires:
  - 04-01 (spike pins for TaskNotesUserField)
provides:
  - STAGED_FIELD_KEY, FieldStatus, fieldStatus (src/model/stagedField.ts)
  - TaskNotesUserField type and optional catalog.userFields
  - TaskNotesGateway.userFields / TaskNotesBridge.userFields
  - fake TaskNotes and fake gateway userFields support
affects:
  - Phase 6 setup notice (first consumer of fieldStatus)
  - 04-05 (shares fakeTaskNotes.ts)
tech-stack:
  added: []
  patterns:
    - "Feature-gated read via featureApi + readApi() !== api retire re-check (same as statuses())"
    - "Pure never-throwing classifier over untyped catalog data"
key-files:
  created:
    - src/model/stagedField.ts
    - tests/stagedField.test.ts
    - .planning/phases/04-staging-foundations/tdd/red-04-04-t1.json
    - .planning/phases/04-staging-foundations/tdd/red-04-04-t1.tap
    - .planning/phases/04-staging-foundations/tdd/red-04-04-t2.json
    - .planning/phases/04-staging-foundations/tdd/red-04-04-t2.tap
  modified:
    - src/tasknotes/runtime-api.types.ts
    - src/tasknotes/TaskNotesBridge.ts
    - tests/fakes/fakeTaskNotes.ts
    - tests/fakes/fakeGateway.ts
    - tests/bridge.test.ts
    - tests/contract.test.ts
decisions:
  - "TaskNotesUserField vendored as { id; displayName; key; type; defaultValue?: string } exactly per the 04-01 pin (displayName required, not optional as the plan's interface sketch guessed)"
  - "fieldStatus hasDefault tests the value (not undefined, null or empty string), never key presence, because TaskNotes keeps a defaultValue key set to undefined"
  - "userFields() stays out of REQUIRED_CAPABILITIES; it is gated on catalog.read and the method's presence only"
metrics:
  duration: "~5 min"
  completed: 2026-11-12
  tasks: 2
  files: 12
estimate:
  tokens: 55000
  tasks: 2
actuals:
  tokens: 5400
  tasks: 2
  commits: 4
plan_head_before: b23af273176b07773439fded508b049c391c9f47
plan_head_after: b14857b90dc11ff7ec2e24a67f03443e127e3635
---

# Phase 4 Plan 04: Staged field registration check Summary

The fixed `staged` key now lives in one constant. A pure, never-throwing `fieldStatus()` classifies `catalog.userFields()` as unknown, missing, wrong-type or ok, with `hasDefault`. It reads through a `catalog.read`-gated `TaskNotesBridge.userFields()` that has the reload re-check, and the shape is pinned to what the 04-01 spike saw on TaskNotes 4.13.8.

## What was built

- `src/model/stagedField.ts`: `STAGED_FIELD_KEY = "staged"`, the `FieldStatus` union, and `fieldStatus(userFields: unknown)`.
  - Input that is not an array gives unknown. Entries that are not objects, or whose key is not a string, are skipped.
  - Matching is exact and case-sensitive, and the first match in catalog order decides.
  - `type === "date"` gives ok. Any other type gives wrong-type, with the type string or "unknown".
- `runtime-api.types.ts`: `TaskNotesUserField` and an optional `catalog.userFields?()` (4.13.0+).
- `TaskNotesBridge.userFields()` is modeled on `statuses()`. It uses `featureApi("catalog.read", "catalog.userFields", ...)`, calls through `Promise.resolve`, and throws "TaskNotes changed while loading user fields" if the api object changed during the read. `TaskNotesGateway.userFields()` is the interface member.
- `REQUIRED_CAPABILITIES` is unchanged: `["time.read", "time.write", "tasks.events", "lifecycle.events"]`.
- Fakes:
  - fake TaskNotes gains the `userFields` option, a synchronous `catalog.userFields` (structuredClone, honors `failReadWith`), `setUserFields`, and `"catalog.userFields"` in `omitMethods`.
  - fake gateway gains `userFields`, `setUserFields` (deep copy) and `failUserFieldsWith`.
- Tests:
  - bridge describe "staging field registration (D-03)": ok/missing/wrong-type end to end, copy isolation, omitted method stays ready, missing `catalog.read`, read failure, receiver plus reload refusal, and the not-connected case.
  - `tests/stagedField.test.ts` covers the 21-case matrix plus the fake gateway seam.
  - contract describe "Phase 4 staging contract (TaskNotes 4.13.8)".
- D-03: nothing in `src/ui` or `src/main.ts` calls `fieldStatus` or `userFields(`. No settings or whole-settings read was added.

## TDD Gate Compliance

- Task 1 (tracer):
  - RED (`ca058a2`): the target is `tests/bridge.test.ts > staging field registration (D-03) > a ready bridge on TaskNotes 4.13.8 reads catalog.userFields and fieldStatus reports ok`. The classifier returned `RED_EVIDENCE_OK` (`target_test_failed`, exit 1, tap-flat filtered with `-t`).
  - The first capture was `invalid_record` (`Non-TAP data`, `Malformed TAP`): the multi-line `toEqual` diff broke the TAP YAML block, as in 04-02 and 04-03. A single-line `toHaveLength(1)` assertion now runs before the `toEqual`.
  - To get an assertion-level RED instead of an import fault, the RED commit carries the vendored type, the fake support and minimal skeletons. `fieldStatus` returned unknown and `bridge.userFields()` resolved `[]`.
  - Semantic assessment: the module loaded, the target ran, and it failed on the planned assertion (`expected [] to have a length of 1 but got +0`).
  - GREEN: `587a387`.
  - Tracer gate: interactive mode, `human_verify_mode: end-of-phase`, and `<verify>` is fully automated. The rerun passed (57 bridge tests, tsc and eslint clean), so expansion continued.
- Task 2:
  - RED (`4c85d8b`): the target is `tests/stagedField.test.ts > fake gateway userFields (Phase 6 seam) > setUserFields makes userFields() resolve a deep copy`, with `RED_EVIDENCE_OK`.
  - As expected, the fieldStatus matrix and the contract pins already passed against Task 1's implementation.
  - Semantic assessment: the target ran and failed on `expected 'undefined' to be 'function'`, because the fake gateway had no `setUserFields`.
  - GREEN: `b14857b`.
  - REFACTOR: none needed for either task.

## Verification

- `npx vitest run --dir tests stagedField contract bridge settings`: 4 files, 145 tests passed.
- `npm run check`: exit 0 (tsc, esbuild production, eslint `--max-warnings 0`, 17 files and 507 tests).
- Acceptance greps:
  - `STAGED_FIELD_KEY` export count is 1.
  - No other `"staged"` literal appears in src.
  - `REQUIRED_CAPABILITIES` is unchanged.
  - `catalog.userFields` appears in the bridge.
  - `userFields(): Promise<TaskNotesUserField[]>` appears 2 times (interface and class).
  - The contract pin is present.
  - There are no `fieldStatus` or `userFields(` hits in src/ui or src/main.ts, and no `.snapshot(` in src.

## Deviations from Plan

**1. [Rule 3 - Blocking] RED commits include type/fake scaffolding and skeleton stubs**
- Found during: Task 1 RED
- Issue: a bare RED (tests only) fails on a missing-module import, which tdd.md classifies as INVALID_RED.
- Fix:
  - The Task 1 RED commit carries `TaskNotesUserField`, the fake TaskNotes support, a skeleton `fieldStatus` that returns unknown, and a `bridge.userFields()` that resolves `[]`. GREEN replaced both skeletons.
  - Task 2's RED used an explicit `typeof gateway.setUserFields` assertion for the same reason.
- Commits: ca058a2, 4c85d8b

**2. [Pin-driven] `displayName` is required, not optional**
- The plan's interface sketch had `displayName?: string; defaultValue?: unknown`. The authoritative 04-01 pin is `displayName: string; defaultValue?: string`, and the contract pin enforces that exact set.

**3. [Rule 2] hasDefault also treats null as no default**
- Per the plan's action text (the spike pin mentions only undefined and ""). The matrix covers absent, undefined, null and "".

## Known Stubs

None. Both RED skeletons were replaced in their GREEN commits.

## Threat Flags

None. No new surface beyond the plan's threat model:
- T-04-11: only `catalog.userFields()` is read.
- T-04-12: the featureApi check plus the reload re-check, tested.
- T-04-13: the never-throws matrix.
- T-04-14: the bridge stays ready without `catalog.userFields`, tested.

## Self-Check: PASSED

- FOUND: src/model/stagedField.ts, tests/stagedField.test.ts, tdd/red-04-04-t1.{json,tap}, tdd/red-04-04-t2.{json,tap}
- FOUND commits: ca058a2, 587a387, 4c85d8b, b14857b (4 = `git rev-list --count b23af27..HEAD`)
