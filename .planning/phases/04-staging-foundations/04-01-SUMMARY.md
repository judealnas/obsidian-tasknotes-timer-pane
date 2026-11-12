---
phase: 04-staging-foundations
plan: 01
subsystem: spike
status: complete
tags: [spike, tasknotes, user-fields, staging, obsidian-cli]
requires: []
provides:
  - scripts/staging-spike.mjs (guarded one-off dev-vault probe, modes userfields, prepare, probe, cleanup)
  - 04-SPIKE-FINDINGS.md (D-10 Q1-Q4 answers and Pins for 04-04 and 04-05)
affects: [04-04, 04-05, phase-06, phase-07]
tech-stack:
  added: []
  patterns:
    - "Obsidian CLI eval via execFile with `vault=<name>` before `eval`, two-call kickoff/poll for timer-using snippets"
    - "Inline basePath vault guard at the top of every eval snippet"
key-files:
  created:
    - scripts/staging-spike.mjs
    - .planning/phases/04-staging-foundations/04-SPIKE-FINDINGS.md
  modified: []
decisions:
  - "TaskNotesUserField vendored as { id, displayName, key, type, defaultValue?: string }; hasDefault tests the value, not key presence (key exists with undefined when no default)"
  - "tasks.update(path, { staged: null }) keeps the key as `staged:` (YAML null); fake TaskNotes must store and return null, not delete the key"
  - "Newly registered user field is visible on tasks.get immediately; Phase 6 setup notice need not say reload TaskNotes"
  - "Q4 (Phase 7 input only): toggleCompleteInstance with an off-schedule date completed the scheduled instance and advanced scheduled; a second identical call did not toggle back"
metrics:
  duration: "continuation; Task 1 by previous executor, Tasks 2-3 about 15 min"
  completed: 2026-11-12
actuals:
  tokens: 7400
  tasks: 3
  commits: 11
plan_head_before: 00c77b51939384297b144ae3f9ebc23713272e0d
plan_head_after: 4ce9f7f8f312405f59f654eb3f1583146337eec1
---

# Phase 4 Plan 01: D-10 dev-vault staging spike Summary

Guarded Obsidian CLI probe against live TaskNotes 4.13.8 in the dev vault answering D-10 Q1-Q4: user fields carry `defaultValue` (undefined when unset), a null unstage leaves `staged:` read back as `null`, a newly registered field is visible without reload, and `toggleCompleteInstance` with an off-schedule date completes the scheduled instance and advances the series.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Tracer: guarded spike script reads catalog.userFields() end-to-end, Q2/Q3 baseline | 7da5450 | scripts/staging-spike.mjs, 04-SPIKE-FINDINGS.md |
| 2 | User registers `staged` (Date) and throwaway `spikedefault` (Text, default x) | n/a (human-action, verified) | none |
| 3 | probe + cleanup modes, Q1-Q4 and Pins recorded | 4ce9f7f | scripts/staging-spike.mjs, 04-SPIKE-FINDINGS.md |

Task 2 verification: `node scripts/staging-spike.mjs userfields` listed `staged` (type `date`) and `spikedefault` (type `text`, `defaultValue: "x"`).

## Key findings (full JSON in 04-SPIKE-FINDINGS.md)

- **Q2:** entries have `id`, `displayName`, `key`, `type`, `defaultValue`. defaultValue present: yes (with default). Without one, `Object.keys` still lists `defaultValue` but its value is `undefined`.
- **Q3:** the hand-written `staged: 2026-11-12` appeared on `tasks.get` (top-level and `customProperties.staged`) right after registration, before any file change, no reload.
- **Q1:** `{ staged: null }` wrote `staged:` (empty YAML value); metadataCache has the key with `null`; returned TaskInfo and `tasks.get` give `staged: null`. Reads as not staged. Pin: null written as null.
- **Q4:** calling with `2026-11-11` (Wednesday) on a Monday weekly series scheduled `2026-11-09` recorded `2026-11-09` and moved `scheduled` to `2026-11-16`; the second identical call recorded `2026-11-16` and moved to `2026-11-23` (no toggle). Status stayed `open`. Phase 7 research input only.

## Deviations from Plan

None in behavior. Notes:
- The probe hardcodes the two scratch paths that `prepare` produced (recorded in the findings) instead of re-finding them by title.
- Each probe question is wrapped so one failure would not lose the others; none failed.
- `actuals.commits` is the measured `00c77b5..HEAD` count (11). It includes the 04-02 and 04-03 commits (9) that landed on this branch between Task 1 and Task 3; 04-01's own task commits are 7da5450 and 4ce9f7f.

## Pending end-of-phase UAT (Task 3 human-check, not blocking)

- In the dev vault, open `TaskNotes/Tasks/Staging spike scratch.md` in source mode and confirm the `staged:` line has no value (matches Q1 after the null write).
- Remove the throwaway `spikedefault` user field from TaskNotes settings (keep `staged`).

## Verification

- `node --check` and `node scripts/staging-spike.mjs --self-test` pass (`self-test ok`, every mode's snippets start with the guard and contain no backslash).
- `node scripts/staging-spike.mjs probe` exited 0 with keys q1-q4; no "refusing vault".
- `grep -cE "unlink|rmdir|\.remove\(|\.trash\(|\.delete\(" scripts/staging-spike.mjs` = 0; `exec(` / `shell: true` = 0; package.json untouched.
- No changes under `src/` or `tests/` from this plan.

## Self-Check: PASSED

- FOUND: scripts/staging-spike.mjs
- FOUND: .planning/phases/04-staging-foundations/04-SPIKE-FINDINGS.md
- FOUND: 7da5450, 4ce9f7f (ancestors of HEAD)
