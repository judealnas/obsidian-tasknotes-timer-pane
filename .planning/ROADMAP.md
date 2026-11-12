# Roadmap: TaskNotes Timer Pane

## Milestones

- ✅ **v0.2 MVP**: Phases 1-3 (shipped 2026-11-12). Full details: [milestones/v0.2-ROADMAP.md](milestones/v0.2-ROADMAP.md)
- 🚧 **v0.3 Staging Tasks**: Phases 4-7 (in progress)

## Overview

v0.3 adds a **Staged** tab beside the existing **Timers** tab and renames the plugin to "TaskNotes Task Control" (id unchanged). The user picks today's tasks, orders them, and works down the list. There are four phases:

- **Phase 4 lays the foundations without any new UI.** It adds the rollover-hour setting, the staging-day rule and the TaskNotes contract additions. It carries a dev-vault spike that confirms how TaskNotes actually writes the field.
- **Phase 5 refactors the pane into a two-tab shell.** The Timers tab must behave exactly as in v0.2. This phase is kept apart from new behavior so any regression is caught on its own.
- **Phase 6 builds the Staged tab's core loop:** stage, order, then start, pause, stop or unstage from each card.
- **Phase 7 adds completion, Done today and rollover, then mobile reordering, the rename and the 0.3.0 release.** The recurring-completion semantics in this phase need research first.

Two rules hold in every phase: refresh and render never write, and every write goes through the one shared `WriteQueue`.

## Phases

**Phase Numbering:**
- Integer phases (4, 5, 6, 7): Planned milestone work (continues from v0.2, which ended at Phase 3)
- Decimal phases (4.1, 4.2): Urgent insertions (marked with INSERTED)

<details>
<summary>✅ v0.2 MVP (Phases 1-3): SHIPPED 2026-11-12</summary>

- [x] Phase 1: Live Timer Pane (5/5 plans), completed 2026-10-14 (verification overridden at close: human_needed, partial UAT)
- [x] Phase 2: Start, Switch & Complete (3/3 plans), completed 2026-10-16
- [x] Phase 3: Pause & Resume (4/4 plans), completed 2026-10-16

</details>

### 🚧 v0.3 Staging Tasks (In Progress)

**Milestone Goal:** Let me pick the tasks I'll tackle today, put them in order, and start, stop, pause, or complete each from that list, with the all-timers view one tab away.

- [ ] **Phase 4: Staging Foundations** - Rollover-hour setting, a DST-safe staging day, and a feature-gated TaskNotes staging contract for the fixed `staged` key
- [ ] **Phase 5: Two-Tab Shell** - Pane split into Staged and Timers tabs, with Timers unchanged from v0.2 and the last-active tab remembered
- [ ] **Phase 6: Staged Tab Core** - Stage from the picker, unstage, order, and start/pause/stop each staged task from its card, with setup notices, tab counts and staged markers
- [ ] **Phase 7: Complete, Roll Over & Release 0.3.0** - ✓ completion (recurring-safe on both tabs), Done today, daily rollover, mobile ▲▼ reordering, rename, and BRAT release

## Phase Details

### Phase 4: Staging Foundations

**Goal**: The plugin knows what "today" means for the fixed `staged` field, can tell whether TaskNotes supports staging, and saving one setting never loses another. This phase adds no Staged UI yet.
**Depends on**: Nothing new (builds on shipped v0.2). Can run in parallel with Phase 5.
**Requirements**: SETUP-01, ROLL-01 (SYNC-05 dropped in discussion: multi-device is out of scope)
**Success Criteria** (what must be TRUE):
  1. The user can set the rollover hour (default 4, 0-23, a dropdown labelled in 12-hour format) in the existing settings tab. Changing it, or the completed-status preference, and then restarting Obsidian leaves every other setting, pause record and card order as it was. The staged key is fixed as `staged`.
  2. With the rollover hour at 4, the plugin treats 1:30 AM as the previous staging day and 4:00 AM as the new one. This holds on DST-change days and in non-UTC timezones (shown by frozen-clock tests across a timezone matrix).
  3. On a TaskNotes build that is older than 4.13.0 or lacks the staging capabilities, the staging contract reports "unavailable" while the existing timer features keep working. On a supported build, the field-registration check reports `missing`, `wrong-type` or `ok` for the `staged` key, based on `catalog.userFields()`. Pause and resume still behave exactly as in v0.2.

**Plans**: 4/5 plans executed
Plans:
**Wave 1**
- [x] 04-01-PLAN.md — Dev-vault spike (wave 1, has a human step): guarded `obsidian eval` script answers D-10 Q1-Q4 on TaskNotes 4.13.8, findings pinned for 04-04/04-05
- [x] 04-02-PLAN.md — Staging day (wave 1): pure DST-safe `stagingDay` plus rollover constants and 12-hour labels, proven across a timezone matrix (ROLL-01)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 04-03-PLAN.md — Rollover-hour setting (wave 2): `saveChoice` spread fix first, then the dropdown, loader, `OWNED_KEYS` and `persistAll` (SETUP-01)
- [x] 04-04-PLAN.md — Field-registration check (wave 2): `STAGED_FIELD_KEY`, pure `fieldStatus`, gated `userFields()` and contract pins (SETUP-01)

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 04-05-PLAN.md — Staging write contract (wave 3): `stagingAvailability`/`recurringAvailability`, gated `updateTask`/`toggleCompleteInstance`, fakes and the 4.12 regression proof

**Notes**:
- **Research flag (dev-vault spike, do first):**
  - Confirm on raw frontmatter that the user's chosen unstage write, `{[key]: null}` only (no `customFrontmatter`), leaves a harmless empty `staged:` that reads as not staged.
  - Check the shape of `catalog.userFields()`, including whether it returns `defaultValue`.
  - Check whether a newly registered user field appears on already-cached TaskInfo without a reload. This decides the setup-notice copy.
  - Check `recurring.toggleCompleteInstance` with an off-schedule day.
- Fix the existing `saveChoice` spread bug first; otherwise saving the completed status erases the new settings.
- Add the new keys to `OWNED_KEYS` and `persistAll`.
- The new bridge methods are feature-gated and are NOT added to `REQUIRED_CAPABILITIES`.

### Phase 5: Two-Tab Shell

**Goal**: The pane becomes a two-tab shell (Staged, Timers) in which the Timers tab is the v0.2 pane, unchanged.
**Depends on**: Nothing new (v0.2 pane). Independent of Phase 4.
**Requirements**: TABS-01, TABS-02
**Success Criteria** (what must be TRUE):
  1. The pane shows two tabs, Staged and Timers. The Timers tab shows every regular timed task with the same cards, Start, Pause all, Resume all, Stop all, drag/keyboard reordering and Pomodoro hiding as v0.2. All v0.2 automated tests still pass.
  2. The user can switch between tabs with one click. The Staged tab shows a placeholder empty state, and the header actions change with the tab (Timers keeps Start / Pause all / Resume all / Stop all).
  3. After restarting Obsidian, the pane reopens on the tab that was last active.
  4. Bridge-state messages (TaskNotes missing, disabled, too old, reconnecting) still show correctly. Reconnecting after a TaskNotes reload and after sleep/wake still works from either tab.

**Plans**: TBD
**UI hint**: yes
**Notes**:
- This phase is a pure refactor: no staging behavior. It extracts `TaskCard` and `CardList<K>` and gives each tab its own card map and CSS state modifiers.
- `TaskPickerModal` takes an options object (start mode only for now).
- The active tab is kept in view state (`getState`/`setState`), not in data.json.
- Standard patterns; skip research.

### Phase 6: Staged Tab Core

**Goal**: The user can pick today's tasks, put them in order, and start, pause, stop or unstage each one from the Staged tab, with the Timers tab one click away.
**Depends on**: Phase 4, Phase 5
**Requirements**: SETUP-02, SETUP-03, STAGE-01, STAGE-02, STAGE-03, STAGE-04, STAGE-05, SCARD-01, SCARD-02, SCARD-03, SCARD-04, ORDER-01, ORDER-02, ORDER-03, TABS-03, TABS-04
**Success Criteria** (what must be TRUE):
  1. The Stage picker lists only tasks that are not done, not archived and not already staged. Choosing one writes `staged: <staging day>` and adds the task at the bottom of the Staged tab.
     - Tasks staged elsewhere (hand edit, another device) also appear at the bottom.
     - Missing, empty or invalid values are treated as not staged.
     - A future date stays hidden until that day.
     - Each card shows its days-staged count.
  2. Each staged card offers the right controls for its state, and clicking the title opens the note while right-click opens TaskNotes' task menu:
     - Idle: start, ✓ and ✕.
     - Running: live session and total, with pause, stop, ✓ and ✕.
     - Paused: frozen session, with resume, ✓ and ✕.
     - A task that Pomodoro is timing looks idle, and start is refused with the "being timed by Pomodoro" notice.
  3. ✕ writes `staged: null` and removes the card. If the task's regular timer was running it is stopped, and if it was paused its pause is cleared. A Pomodoro-owned timer is left untouched.
  4. The user can reorder Staged cards by drag and by ArrowUp/Down. The order survives a restart and follows task renames, deleted tasks drop out, and reordering Staged never changes the Timers order (or the reverse).
  5. Tab labels show counts (for example "Staged 4 · Timers 1") and Timers is highlighted while any regular timer runs. Timers cards for staged tasks show a staged marker.
     - If the key isn't registered as a TaskNotes date field, the Staged tab shows how to register it (type date, no default value), Stage is disabled, and nothing is written.
     - If TaskNotes lacks the staging APIs, the Staged tab explains why while Timers keeps working.

**Plans**: TBD
**UI hint**: yes
**Notes**:
- User decisions that differ from the research recommendations:
  - Unstage writes `null` only, with no `customFrontmatter`.
  - The picker HIDES already-staged tasks (to reset the days count, unstage and re-stage).
  - Unstaging a running or paused task stops it or clears its pause (research recommended leaving the timer running).
  - The Staged header has Stage only; bulk actions stay on Timers.
- Staged cards are keyed by path and join StagingStore with TimerStore at render time.
- Order entries are pruned only after a successful read confirms the task is gone.
- In this phase the ✓ button is present on cards. Its full staged semantics (clear `staged`, Done today, recurring-safe) land in Phase 7.
- Standard patterns; skip research.

### Phase 7: Complete, Roll Over & Release 0.3.0

**Goal**: The user can finish staged tasks with ✓ (recurring tasks safely), see what got done today, and trust the list to roll over each morning. The plugin then ships as "TaskNotes Task Control" 0.3.0.
**Depends on**: Phase 6
**Requirements**: DONE-01, CTRL-13, DONE-02, ROLL-02, ROLL-03, ORDER-04, PANE-04
**Success Criteria** (what must be TRUE):
  1. ✓ on a non-recurring staged task sets the configured completed status, stops its timer and clears `staged`. On either tab, ✓ on a recurring task completes only today's instance, never closes the series, and a repeated ✓ never un-completes it.
  2. A "Done today" section on the Staged tab lists the staged tasks completed today, both from the pane and elsewhere (with no write by the pane). The section clears at the rollover hour.
  3. Unfinished staged tasks carry over to the next staging day without any frontmatter writes, and their days-staged count goes up. Rollover takes effect promptly when Obsidian was left open overnight or the machine slept through the rollover hour.
  4. On mobile, ▲▼ buttons let the user reorder cards on both the Staged and Timers tabs.
  5. The plugin shows as "TaskNotes Task Control". The plugin id `tasknotes-timer-pane`, view type, command ids and saved data are unchanged, and upgrading from 0.2.0 through BRAT to the 0.3.0 release keeps the existing pause records and order.

**Plans**: TBD
**UI hint**: yes
**Notes**:
- **Research flag:** run `/gsd-plan-phase --research-phase 7` before planning. It needs to cover:
  - Occurrence snapping in `toggleCompleteInstance`.
  - `occurrence_materialization` and occurrence notes that already exist.
  - Whether the toggle stops timers (assume not; stop explicitly first).
  - The date basis of `completedDate` near midnight (accept either the staging day or the calendar date).
- Always pass the staging day explicitly, and skip the toggle if `complete_instances` already contains it.
- CTRL-13 fixes the existing Timers-tab ✓ bug through one shared `completeTask`.
- Done today comes from the plugin's own completion record, confirmed by TaskNotes status.
- Day change is checked on the 1 s tick and on focus, visibility and wake. Never use a `setTimeout` to the rollover hour.
- UAT includes a native overnight run and a sleep/wake run.
- The release is tagged `0.3.0` with no `v` prefix. Command *names* must not contain the plugin name (lint rule).

## Progress

**Execution Order:**
Phases execute in numeric order: 4 → 5 → 6 → 7 (Phases 4 and 5 are independent and may run in parallel)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Live Timer Pane | v0.2 | 5/5 | Complete | 2026-10-14 |
| 2. Start, Switch & Complete | v0.2 | 3/3 | Complete | 2026-10-16 |
| 3. Pause & Resume | v0.2 | 4/4 | Complete | 2026-10-16 |
| 4. Staging Foundations | v0.3 | 4/5 | In Progress | - |
| 5. Two-Tab Shell | v0.3 | 0/? | Not started | - |
| 6. Staged Tab Core | v0.3 | 0/? | Not started | - |
| 7. Complete, Roll Over & Release 0.3.0 | v0.3 | 0/? | Not started | - |
