---
phase: 04-staging-foundations
plan: 03
subsystem: settings
status: complete
tags: [settings, rollover-hour, data-json, persistence, tdd, tracer]
requires:
  - "04-02: src/model/stagingDay.ts (DEFAULT_ROLLOVER_HOUR, ROLLOVER_HOURS, isRolloverHour, rolloverHourLabel)"
provides:
  - "TimerPaneSettings.rolloverHour (default 4), loaded with isRolloverHour fallback"
  - "rolloverHour in OWNED_KEYS, written by persistAll only when not default"
  - "TimerPaneSettingTab.savePatch: every settings save spreads the patch over getSettings()"
  - "Rollover hour dropdown in the existing settings tab"
affects:
  - "phases 6 and 7 read paneSettings.rolloverHour for stagingDay()"
tech-stack:
  added: []
  patterns:
    - "Settings tab saves a Partial patch spread over current settings (D-07)"
    - "Omit-when-default data.json keys (rolloverHour, like cardOrder omit-when-empty)"
key-files:
  created: []
  modified:
    - src/settings.ts
    - src/main.ts
    - src/ui/TimerPaneSettingTab.ts
    - tests/main.test.ts
    - tests/controller.test.ts
    - tests/settings.test.ts
key-decisions:
  - "D-06 copy uses the plan's fallback: 'The staging day starts at this hour. Earlier times count toward the previous day: with the default, 1:30 at night still counts as yesterday.' The first copy tripped obsidianmd/ui/sentence-case on '4 AM'"
  - "Rollover dropdown saves only when String(Number(value)) === value, so '' (Number gives 0), ' 6' and '06' never save"
  - "rolloverHour is omitted from data.json when it equals 4, so users who never change it keep a byte-identical data.json"
requirements-completed: [SETUP-01]
duration: 7 min
completed: 2026-11-12
commits: 4
plan_head_before: b07b037fd71bb1a3e71a1c51edf161e26009d38d
plan_head_after: 8369353c070e7090469ccd264d77a72b615c6ecf
actuals:
  tokens: 5090
  tasks: 2
  commits: 4
coverage:
  - deliverable: "SETUP-01 round trip: rollover hour from the settings tab to data.json beside every other key and back through onload"
    human_judgment: false
    verification:
      - kind: test
        ref: "tests/main.test.ts#a rollover hour chosen in the settings tab reaches data.json beside every other key and loads back on the next onload"
        status: pass
  - deliverable: "D-07 spread fix and either-order saves keep both settings"
    human_judgment: false
    verification:
      - kind: test
        ref: "tests/settings.test.ts#rollover hour settings > choosing a completion status keeps the rollover hour, saving in either order"
        status: pass
  - deliverable: "D-04/D-05/D-06 dropdown: 24 fixed 12-hour labels, description, renders without TaskNotes statuses"
    human_judgment: true
    verification:
      - kind: test
        ref: "tests/settings.test.ts#rollover hour settings"
        status: pass
      - kind: command
        ref: "npm run check"
        status: pass
      - kind: manual
        ref: "Dev vault: Rollover hour shows 4 AM, 24 entries; 6 AM + completion change survive restart with paused cards still paused"
        status: pending
---

# Phase 4 Plan 03: Rollover Hour Setting Summary

The existing settings tab now has a "Rollover hour" dropdown: 24 fixed 12-hour labels, default 4 AM. The chosen hour is saved to data.json and read back on the next onload. The D-07 bug is fixed first: every settings save now goes through `savePatch`, which spreads the patch over `getSettings()`. Saving the completion status no longer drops the rollover hour, and saving the hour no longer drops the completion status. Pause records, card order and unknown data.json keys survive both.

## Performance

- Start: about 2026-11-12T23:27Z
- End: 2026-11-12T23:33:23Z
- Duration: about 7 min
- Tasks: 2/2
- Files: 6 modified

## Accomplishments

- `src/settings.ts`: `TimerPaneSettings` is `{ completionStatus, rolloverHour }`. `loadSettings` accepts only integers 0..23 (`isRolloverHour`). Anything else loads 4 and never throws (T-04-07).
- `src/main.ts`: `"rolloverHour"` is in `OWNED_KEYS`, so a stale or malformed value is never carried back as an extra. `persistAll` writes it right after `completionStatus`, only when it is valid and not 4 (D-01, T-04-08).
- `src/ui/TimerPaneSettingTab.ts`:
  - `saveChoice` is replaced by `savePatch(dropdown, generation, patch, failureMessage)`. It keeps the existing disable-while-saving, the nested-guarded Notice and the generation-checked redisplay.
  - The rollover Setting renders outside the unavailable branch. Its labels come from `rolloverHourLabel`.
  - Changes are re-validated before saving (T-04-09). A failed save shows the fixed Notice "Couldn't save the rollover hour. Try again." and never the raw error (T-04-10).
- Base before Task 1: `b07b037`. `git diff --stat b07b037..HEAD -- src/state src/model` prints nothing.

## TDD Gate Compliance

- Task 1 (tracer):
  - RED (`02e419f`, `test(04-03)`): the target is `tests/main.test.ts > a rollover hour chosen in the settings tab reaches data.json beside every other key and loads back on the next onload`. `RED_EVIDENCE_OK` (`target_test_failed`, exit 1) came from a `tap-flat` run filtered with `-t`. The classifier needed the qualified name that tap-flat emits.
  - Semantic assessment: the module loaded and the other 14 tests were skipped by the filter. The target failed on its first planned assertion, `expected undefined to be 'Rollover hour'`, because the tab had no rollover Setting.
  - GREEN (`141e5bf`, `feat(04-03)`).
  - Tracer gate: interactive mode with `end-of-phase`, and `<verify>` is fully automated. The rerun passed (73 tests, typecheck clean), so expansion continued.
- Task 2:
  - RED (`105b028`, `test(04-03)`): most of the new behavior tests passed against Task 1's implementation, as expected, because Task 1 built the dropdown. One case failed for real: `tests/settings.test.ts > rollover hour settings > a dropdown value "" never saves`. `Number("")` is 0, a valid hour, so the empty value saved hour 0. `RED_EVIDENCE_OK`.
  - The first capture was `invalid_record` (`Non-TAP data`, `Malformed TAP`), because the multi-line `vi.fn()` call diff broke the TAP YAML block. That is the same issue as in 04-02. The assertion was changed to a single-line `mock.calls.length` count, and the rerun classified cleanly.
  - Semantic assessment: the target ran and failed on the planned assertion (`expected 1 to be 0`).
  - GREEN (`8369353`, `feat(04-03)`).
  - REFACTOR: none.

## Deviations from Plan

**1. [Rule 1 - Bug] `host.settings` length expectation in tests/main.test.ts**
- Found during: Task 1 GREEN
- Issue: "loading failures keep the plugin usable" asserted `host.settings` had length 1. The tab now always renders two Settings (D-04).
- Fix: changed the expectation to 2. No `host.saved` expectation changed.
- Commit: 141e5bf

**2. [Rule 3 - Blocking] settings.test.ts fixture and loader updates moved into Task 1**
- Found during: Task 1 verify (`vitest ... settings`, `tsc`)
- Issue: Task 1's verify runs settings.test.ts, and tsc type-checks it. Its fixture literal and exact loader expectations broke as soon as `rolloverHour` joined the type.
- Fix: Task 1 made the Task 2 preamble edits: the `setup(preference, rolloverHour = 7)` fixture, `rolloverHour: 4` in the loader expectations, and `rolloverHour: 7` in the completion `toHaveBeenLastCalledWith` expectations. Task 2 added the new tests.
- Commit: 141e5bf

**3. [Rule 2 - Correctness] Dropdown value round-trip check**
- Found during: Task 2 RED
- Issue: `Number("")`, `Number(" 6")` and `Number("06")` pass `isRolloverHour`.
- Fix: added `String(rolloverHour) === value` to the save guard.
- Commit: 8369353

**4. D-06 copy swap (sanctioned by the plan)**
- `obsidianmd/ui/sentence-case` flagged "4 AM" / "1:30 AM". The plan's fallback copy is used instead: "The staging day starts at this hour. Earlier times count toward the previous day: with the default, 1:30 at night still counts as yesterday."
- Commit: 8369353

**Total deviations:** 3 auto-fixed, plus 1 sanctioned copy swap. **Impact:** no scope change. No staged-key UI, no cross-device merge, and no file under src/state or src/model changed.

## Verification

- `npx vitest run --dir tests main settings controller`: 3 files, all passed.
- `npm run check`: typecheck, build, lint with zero warnings, and the full suite (16 files, 470 tests) all pass.
- Acceptance greps:
  - `getSettings()` in the tab: 3
  - `saveSettings({ completionStatus` in the tab: 0
  - `"rolloverHour"` is on the OWNED_KEYS line
  - `previous day` in the tab: 1
  - inline style: 0
- Human check (pending, end-of-phase): in the dev vault, the Rollover hour dropdown shows 4 AM and has 24 entries. After choosing 6 AM, changing the completion status and restarting, both choices should persist and paused cards should still be paused.

## Next

Phase 6 and 7 consumers can read `rolloverHour` from the plugin's settings and pass it to `stagingDay()`. Plan 04-01 is still in progress at its human checkpoint.

## Self-Check: PASSED

- FOUND: src/settings.ts, src/main.ts, src/ui/TimerPaneSettingTab.ts, tests/main.test.ts, tests/controller.test.ts, tests/settings.test.ts
- FOUND commits on gsd/phase-04-plan: 02e419f, 141e5bf, 105b028, 8369353
