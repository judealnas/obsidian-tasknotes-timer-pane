---
phase: 04-staging-foundations
plan: 02
subsystem: model
status: complete
tags: [staging-day, rollover, dst, timezone, pure-module, tdd]
requires: []
provides:
  - "src/model/stagingDay.ts: DEFAULT_ROLLOVER_HOUR, ROLLOVER_HOURS, isRolloverHour, rolloverHourLabel, stagingDay"
affects:
  - "plan 04-03 (settings imports DEFAULT_ROLLOVER_HOUR and isRolloverHour)"
  - "phases 6 and 7 (Staged list and rollover compute the staging day per tick)"
tech-stack:
  added: []
  patterns:
    - "Runtime process.env.TZ switching per describe block with per-zone getTimezoneOffset sentinels"
    - "Previous local day built as new Date(y, m, d - 1, 12): local-noon anchor, no ms subtraction"
key-files:
  created:
    - src/model/stagingDay.ts
    - tests/stagingDay.test.ts
  modified: []
key-decisions:
  - "TZ switching at runtime inside the test file works under Vitest 5 default pool on Windows/Node 24; no vitest.config.ts needed"
  - "Test file declares a file-local `process` type instead of referencing @types/node, so tsconfig `types: []` keeps Node globals out of src/"
  - "RED used a signature-only scaffold of stagingDay.ts so the target test failed on its assertion rather than on module load (classifier treats load failure as INVALID_RED)"
requirements-completed: [ROLL-01]
duration: 3 min
completed: 2026-11-12
commits: 3
plan_head_before: 7da54509ee0a0032873cd6760a723d46833df13d
plan_head_after: c4de0ce33d2bbd915ca6b04e61d59ec74afdfc67
actuals:
  tokens: 2820
  tasks: 2
  commits: 3
coverage:
  - deliverable: "stagingDay rollover rule (1:30 AM previous day, 4:00 AM new day) with invalid-hour fallback and non-finite RangeError"
    human_judgment: false
    verification:
      - kind: test
        ref: "tests/stagingDay.test.ts#in America/New_York"
        status: pass
  - deliverable: "DST and timezone safety across UTC, America/New_York, Pacific/Auckland, Asia/Kolkata, America/Santiago with sentinels"
    human_judgment: false
    verification:
      - kind: test
        ref: "tests/stagingDay.test.ts#in Pacific/Auckland, in Asia/Kolkata, in America/Santiago, in UTC"
        status: pass
      - kind: command
        ref: "npx vitest run --dir tests stagingDay"
        status: pass
  - deliverable: "Rollover-hour constants and fixed 12-hour labels (D-05)"
    human_judgment: false
    verification:
      - kind: test
        ref: "tests/stagingDay.test.ts#rolloverHourLabel"
        status: pass
      - kind: command
        ref: "npm run check"
        status: pass
---

# Phase 4 Plan 02: Staging Day Rule Summary

The new pure `stagingDay(nowMs, rolloverHour)` returns the local `YYYY-MM-DD`. Before the rollover hour it steps back one day by building a local-noon `Date`, never by subtracting milliseconds or going through UTC. The same file has the rollover-hour constants, the validator and fixed 12-hour labels. 63 frozen-instant tests in five switched timezones prove it, each zone guarded by offset sentinels.

## Performance

- Start: 2026-11-12T23:23:07Z
- End: 2026-11-12T23:26:24Z
- Duration: about 3 min
- Tasks: 2/2
- Files: 2 created

## Accomplishments

- `src/model/stagingDay.ts`: no imports, no clock reads and no Obsidian. An invalid rollover hour falls back to 4 (T-04-05). A non-finite `nowMs` throws `RangeError("nowMs must be a finite number")` (T-04-06). `rolloverHourLabel` builds labels from the number, not from the locale.
- `tests/stagingDay.test.ts`: an `inZone` helper switches `process.env.TZ` in `beforeAll` and restores it in `afterAll`. Each zone opens with sentinels: base offsets in January and July, plus the offsets on both sides of every DST day tested. The tests cover:
  - US spring-forward and fall-back.
  - Auckland's DST start and end.
  - Kolkata (+05:30).
  - Santiago's missing midnight. 00:00 on 2026-09-06 resolves to 01:00 and still gives 2026-09-06 with rollover 0.
  - Adjacency for rollover 4, 0 and 23.
  - Year end, February, and leap day.
  - The full label table.
- Comments above the DST cases name the wrong answer a millisecond-subtraction version would give: 04:00 on 2026-03-08 would come out as "2026-03-07", and 03:30 on 2026-11-01 as "2026-11-01".

## TDD Gate Compliance

- RED (`62e7339`, `test(04-02)`): the target test was `tests/stagingDay.test.ts > in America/New_York > 1:30 AM is the previous staging day with rollover hour 4`.
  - With every test running, Vitest's `tap-flat` reporter printed an array diff without indentation, so the classifier rejected the report as malformed TAP (`invalid_record`). Rerunning only the target with `-t` gave a well-formed report and `RED_EVIDENCE_OK` (`target_test_failed`, exit 1).
  - Semantic assessment: the target ran and failed on its planned assertion (`expected '' to be '2026-11-11'`) against a scaffold that only had the signatures. The module loaded, nothing errored during collection, and the New York sentinel passed, so the zone switch was real.
- GREEN (`cf186ff`, `feat(04-02)`): the implementation. All 24 Task 1 tests pass.
- REFACTOR: none needed.
- Task 2 (`c4de0ce`) added matrix cases against the implementation from Task 1. They passed on the first run, so this task had no separate RED step. That is expected, because the algorithm came from the Task 1 tracer and the plan says to change it only if a case fails.

## Deviations from Plan

**1. [Rule 3 - Blocking] RED scaffold instead of a missing module**
- Found during: Task 1 RED
- Issue: the plan said RED would fail because the module did not exist. The TDD gate treats a load failure as INVALID_RED.
- Fix: the RED commit added a scaffold with only the signatures, returning empty or false values, so RED failed on an assertion. GREEN replaced it.
- Files: src/model/stagingDay.ts
- Commit: 62e7339

**2. [Rule 3 - Blocking] `process` was untyped under `types: []`**
- Found during: Task 2, `npm run check` (tsc)
- Issue: TS2591 "Cannot find name 'process'" in the test file.
- Fix: a `declare const process: { env: Record<string, string | undefined> }` local to the test file. Adding `/// <reference types="node" />` would have pulled Node globals into the whole program, including src/.
- Files: tests/stagingDay.test.ts
- Commit: c4de0ce

**Total deviations:** 2 auto-fixed (both Rule 3). **Impact:** none on behavior or scope. No `vitest.config.ts` was needed, because the sentinel showed the TZ switch works under the default pool. Santiago's dates matched the installed tz data, so none were replaced.

## Flagged Assumptions (carried, unresolved)

- Changing the rollover hour mid-day moves "today" immediately. `stagingDay` is pure and simply follows the new hour. Phase 7 owns what the Staged tab does when the day jumps.

## Verification

- `npx vitest run --dir tests stagingDay`: 63 passed, five zone describe blocks.
- `npm run check`: typecheck, build, lint with zero warnings, and the full suite (16 files, 444 tests) all pass.
- Acceptance greps:
  - forbidden APIs in src: 0
  - hour-to-ms arithmetic: 0
  - zone names: 5
  - `getTimezoneOffset`: 11
  - required date strings: all present

## Next

Ready for 04-03 (settings), which imports `DEFAULT_ROLLOVER_HOUR` and `isRolloverHour`.

## Self-Check: PASSED

- FOUND: src/model/stagingDay.ts, tests/stagingDay.test.ts
- FOUND commits on gsd/phase-04-plan: 62e7339, cf186ff, c4de0ce
