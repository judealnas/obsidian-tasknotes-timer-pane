---
gsd_state_version: "1.0"
milestone: v0.3
milestone_name: Staging Tasks
current_phase: 04
current_phase_name: staging-foundations
status: executing
stopped_at: Phase 4 context gathered
last_updated: "2026-11-12T23:12:20.335Z"
last_activity: 2026-11-12
last_activity_desc: v0.3 roadmap created (28/28 requirements mapped)
state_head: acfca09ed49c4b72175da1995f571d521eeb654c
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 5
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-12)

**Core value:** With the pane open, I can always see what task is being timed and how long I've spent on it, and stop, pause, or switch tasks in one to two clicks, without leaving the pane.
**Current focus:** v0.3 Staging Tasks, Phase 4: Staging Foundations (roadmap created; Phases 4-7)

## Current Position

Phase: 04 (staging-foundations) — READY TO EXECUTE
Plan: — (not yet planned)
Status: Ready to execute
Last activity: 2026-11-12 — v0.3 roadmap created (28/28 requirements mapped)

Progress (v0.3): [░░░░░░░░░░] 0% (0/4 phases)

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 2 | 3 | - | - |
| 03 | 4 | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 13 min | 3 tasks | 11 files |
| Phase 01 P02 | 7 min | 2 tasks | 7 files |
| Phase 01 P04 | 3 min | 2 tasks | 8 files |
| Phase 01 P03 | 10 min | 3 tasks | 10 files |
| Phase 01 P05 | 4 min | 1 tasks | 10 files |
| Phase 02 P02 | 12min | 2 tasks | 13 files |
| Phase 02 P03 | 14min | 2 tasks | 17 files |
| Phase 03 P01 | 16 min | 2 tasks | 18 files |
| Phase 03 P02 | 8 min | 2 tasks | 9 files |
| Phase 03 P03 | 8 min | 2 tasks | 5 files |
| Phase 03 P04 | 8 min | 2 tasks | 8 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 4 discussion 2026-11-12]: Multi-device is out of scope, so SYNC-05 is dropped (single-device OWNED_KEYS/persistAll safety stays). The staged key is hard-coded `staged` (no setting, no key validation). Rollover hour is a 24-option dropdown with 12-hour labels and an explanatory description. The spike is scripted via Obsidian CLI eval on the dev vault's TaskNotes 4.13.8 only.
- [v0.3 Roadmap 2026-11-12]: Four coarse phases: 4 Staging Foundations (settings, staging day, contract, data.json merge), 5 Two-Tab Shell (pure refactor, Timers unchanged), 6 Staged Tab Core, 7 Complete/Roll Over/Release 0.3.0. Phases 4 and 5 are independent. Research SUMMARY's Phase 8 (mobile/rename/release) folded into Phase 7.
- [v0.3 Requirements 2026-11-12]: User decisions that differ from the research recommendations: unstage writes `null` only (no customFrontmatter); the Stage picker hides already-staged tasks; unstaging a running/paused task stops it or clears its pause (Pomodoro-owned left untouched); the Staged header has Stage only; tab counts, the running cue, staged markers on Timers cards, and mobile ▲▼ on both tabs are in scope; the cross-device data.json merge (SYNC-05) is in scope; the recurring ✓ fix applies to both tabs (CTRL-13).

- [Phase 03 acceptance 2026-10-16]: Desktop UAT 15/16 passed after deploying the current build; test 15 deferred. User confirmed the 7 judgment-tier prohibitions; VERIFICATION passed; SECURITY verified 18/18 closed.

- [Phase 01 reconciliation 2026-10-16]: Added the missing canonical verification and security reports on gsd/verification-reconciliation. Regression suite: 216 tests passed. Five native checks remain skipped under the no-human-intervention instruction; the accepted timing discrepancy and two enforcement-test evidence limits remain documented. Phase 1 is implementation-complete but not fully verified; no user response or fix work is requested.

- [Verification policy 2026-10-15]: User requested no human intervention. Skip manual Phase 2 tests with reasons, preserve automated evidence, and never count skipped checks as observed passes. Canonical phase verification remains human_needed because the installed completion predicate blocks ordinary skips; no user test response is awaited.

- [Init]: Integrate in-process through TaskNotes Runtime API v1 only (TaskNotes >= 4.10.0), behind one bridge. Write only through `api.time.start`/`stop`. Never use internals.
- [Init]: Switch stops all running timers by default. A setting can make it stop only the displayed timer.
- [Init]: Pause = stop the current entry. Resume = start a new entry on the same task. The pane saves the pause state.
- [Roadmap]: Three vertical MVP slices. Phase 1 is the walking skeleton (read path plus the stop write path).
- [Phase 01]: 01-01: User approved the six [SUS] npm pins verbatim; install used exactly the approved versions
- [Phase 01]: 01-01: eslint.config.mts lints manifest.json explicitly (tseslint parser + obsidianmd/validate-manifest), since obsidianmd recommended only matches JS/TS files
- [Phase 01]: 01-01: Vendored contract types TaskNotesApiErrorPayload.code as string and events.on payload as unknown
- [Phase 01]: 01-01: Phase 01 commits are on branch gsd/phase-01-live-timer-pane because the executor commit guard refuses master; merge at phase acceptance
- [Phase 01]: 01-02: Title accessible name uses aria-labelledby to a hidden 'Open {title}' span, since Obsidian setTooltip writes aria-label
- [Phase 01]: 01-02: deriveSnapshot drops entries with no usable path; TimerStore ignores an active() result that lands after the bridge left ready
- [Phase 01]: 01-02: An empty-string endTime counts as open, matching TaskNotes' !entry.endTime
- [Phase 01]: 01-04: Dev-vault seed is a tracked template (dev-vault-seed/) copied by a copy-only script (COPYFILE_EXCL unless --reset; refuses .obsidian and paths outside dev-vault/)
- [Phase 01]: 01-04: UAT checklist folds in WINDOWS.md entries 1-2 (step 0.3, sections 1-2); they stay open until the checklist is run
- [Phase 01]: 01-03: Bridge retires an api on 'unloading' (WeakSet) and never re-attaches it; one 1 s early probe follows; a disposed bridge ignores probe()
- [Phase 01]: 01-03: Entering ready requests a debounced (200 ms) refresh so the state change and the layout.ready data hint coalesce into one active() call
- [Phase 01]: 01-03: Test timerSchedule reads global timers at call time through a local object; obsidianmd rules cannot be disabled and Node tests have no window
- [Phase 01]: 01-03: Only the 1 s tick skips DOM writes while hidden; event-driven render() still runs so a revealed pane never shows a stale state class
- [Phase 01]: 01-05: TimerController.stop never rejects; it classifies the error, guards notify, and always awaits store.refreshNow()
- [Phase 01]: 01-05: Bridge log helper renamed describeError; user-facing errorMessage (errors.ts) returns '' for non-Error non-string values so the Notice falls back to 'TaskNotes reported an error'
- [Phase 01]: 01-05: 01-05 human-check harvested into end-of-phase UAT sections 6-7; recorded as WINDOWS.md entry 3
- [Phase 02]: Stop all uses exact path/start identity and halts remaining writes on unreadable Pomodoro ownership.
- [Phase 02]: Complete writes live resolved status first and stops only the same still-open entry; partial success never rolls status back.
- [Phase 02]: Completion awaits persisted settings and blocks overlapping pane writes through its final refresh; classic settings support Obsidian 1.12.2.
- [Phase 03]: Pause saves write the settings last written to data.json (fileSettings), so a pause queued behind a pending settings save never reverts it
- [Phase 03]: Cards are keyed by session (normalized path + sessionStartedAt) and sorted by session first start; writes and Pomodoro matching keep exact (taskPath, startTime)
- [Phase 03]: Resume never edits the pause record; the refresh's D-11 reconcile rule converts it, the same path an external TaskNotes start takes
- [Phase 03]: Phase 03 P02: Rule 1 (Pomodoro takeover) runs before D-11; deletes a paused record on the owner's path and a running record whose entry is the owner's
- [Phase 03]: Phase 03 P02: rename collisions keep the newer record (newnessMs, shared with loadPauseRecords); a rename while Obsidian is closed clears via rule 5 (accepted)
- [Phase 03]: 03-03: pauseInQueue/resumeInQueue hold only the write and bookkeeping; callers check targets
- [Phase 03]: 03-03: Pause all Notices only on failure or unreadable-ownership halt; Resume all also on Pomodoro skips; counts only
- [Phase 03]: 03-03: Stop all clears paused records only when not halted on unreadable ownership; running records left to reconcile rule 3
- [Phase 03]: 03-04: TimerStore hides only the exact readable Pomodoro-owned entry (visibleEntries) after reconcile; malformed or unreadable data hides nothing
- [Phase 03]: 03-04: start() re-reads Pomodoro ownership inside queue.run before the already-running check; a paused Pomodoro owns no entry, so its task stays startable

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: Check cold-start readiness timing by hand. `layout.ready` fires only once, and `isReady()` and `ready()` change at different points.
- [Phase 3]: Deferred UAT follow-up: the muted can't-check Pomodoro line (unreadable ownership) has not been observed on desktop; logic is store-tested.
- [Phase 4 research flag]: Dev-vault spike first. Confirm that a `null` unstage reads as not staged on raw frontmatter, the shape of `catalog.userFields()` (`defaultValue`?), whether a newly registered field shows on cached TaskInfo without a reload, and `toggleCompleteInstance` with an off-schedule day.
- [Phase 7 research flag]: Run `/gsd-plan-phase --research-phase 7`. It covers recurring occurrence snapping, occurrence materialization, whether the toggle stops timers, and the date basis of `completedDate` near midnight.
- [v0.2 close]: Phase 1 UAT partial and verification human_needed were acknowledged and deferred at milestone close (see Deferred Items); they carry into the next milestone as candidate work, not as blockers.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261014-whq | Render card titles as wikilinks so TaskNotes' task-link chip appears; fall back to api.ui.taskMenu on right-click | 2026-10-14 | 1886e77 | [261014-whq-render-card-titles-as-wikilinks-so-taskn](./quick/261014-whq-render-card-titles-as-wikilinks-so-taskn/) |
| 2 | Hide TaskNotes' tracking outline on chips in the timer pane | 2026-10-14 | afa6a41 | — |
| 3 | Drop static Tracking label; enlarge card title chip | 2026-10-15 | 72972cc | — |
| 4 | Match timer digits to TaskNotes' Pomodoro timer font | 2026-10-15 | 3a2b05d | — |
| 261019-h6t | Prep plugin for BRAT distribution | 2026-10-19 | 5fc684e | [261019-h6t-prep-plugin-for-brat-distribution](./quick/261019-h6t-prep-plugin-for-brat-distribution/) |
| 261027-mcs | Add drag-and-drop reordering of the timer cards in the pane | 2026-10-27 | 8051ea7 | [261027-mcs-add-drag-and-drop-reordering-of-the-time](./quick/261027-mcs-add-drag-and-drop-reordering-of-the-time/) |

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| uat_gaps | 01/01-UAT-CHECKLIST.md | unknown | 2026-11-12 | v0.2 |
| uat_gaps | 01/01-UAT.md | partial | 2026-11-12 | v0.2 |
| verification_gaps | 01/01-VERIFICATION.md | human_needed | 2026-11-12 | v0.2 |
| deferred_items | 01/deferred-items.md: 01-01 Task 2 npm audit moment advisory (dev dependency only) | acknowledged | 2026-11-12 | v0.2 |

## Session Continuity

Last session: 2026-11-12T22:35:20.447Z
Stopped at: Phase 4 context gathered
Resume file: .planning/phases/04-staging-foundations/04-CONTEXT.md

## Operator Next Steps

- Discuss or plan Phase 4 with /gsd-discuss-phase 4 or /gsd-plan-phase 4 (Phase 5 can be planned in parallel)
