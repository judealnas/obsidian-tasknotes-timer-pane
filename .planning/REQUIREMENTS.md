# Requirements: TaskNotes Task Control — v0.3 Staging Tasks

**Defined:** 2026-11-12
**Core Value:** With the pane open, I can always see what task is being timed and how long I've spent on it, and stop, pause, or switch tasks in one to two clicks, without leaving the pane.

Design sources: `.planning/research/STAGING-DECISIONS.md` (settled decisions; v0.3 resolutions at top), `.planning/research/SUMMARY.md` (research synthesis). "Today" / "staging day" always means the day as defined by the rollover hour, not the calendar date.

## v0.3 Requirements

### Tabs

- [ ] **TABS-01**: Pane has two tabs: **Staged** and **Timers**; Timers shows every regular timed task exactly as in v0.2 (cards, Start, Pause all, Resume all, Stop all)
- [ ] **TABS-02**: Pane remembers the last-active tab across restarts
- [ ] **TABS-03**: Tab labels show counts (e.g. "Staged 4 · Timers 1"), and the Timers tab is visibly highlighted while any regular timer runs
- [ ] **TABS-04**: Timers-tab cards for staged tasks show a small staged marker

### Setup

- [ ] **SETUP-01**: User can set the rollover hour (default 4 AM, 0–23) in the existing settings tab; saving any one setting never resets another. The staged field key is fixed as `staged` (not configurable; Phase 4 discussion)
- [ ] **SETUP-02**: If the `staged` key isn't registered as a TaskNotes **date** user field (checked via `catalog.userFields()`), the Staged tab shows a setup notice explaining how to register it (type date, no default value) and Stage is disabled; no write is attempted
- [ ] **SETUP-03**: If TaskNotes lacks the staging APIs (older than 4.13.0 or missing capability), the Staged tab explains why and the Timers tab keeps working as before

### Staging

- [ ] **STAGE-01**: User can stage a task from a picker listing tasks that are not done, not archived, and not already staged; staging writes `staged: <staging day>` via `api.tasks.update`
- [ ] **STAGE-02**: Tasks staged outside the pane (hand edit, other device) appear on the Staged tab, appended at the bottom of the order
- [ ] **STAGE-03**: ✕ unstages a task by writing an empty (`null`) `staged` value; if the task's regular timer is running it is stopped, and if paused its pause is cleared; a Pomodoro-owned timer is left untouched
- [ ] **STAGE-04**: Missing, empty/null, or invalid `staged` values count as not staged; a future date stays hidden until that day
- [ ] **STAGE-05**: Each staged card shows how many days the task has been staged (since its `staged` date)

### Staged Cards

- [ ] **SCARD-01**: An idle staged card offers start, ✓ complete, and ✕ unstage; clicking the title opens the note and right-click opens TaskNotes' task menu
- [ ] **SCARD-02**: A running staged card shows the live session and total time, with pause, stop, ✓ and ✕
- [ ] **SCARD-03**: A paused staged card shows the frozen session, with resume, ✓ and ✕
- [ ] **SCARD-04**: A staged task being timed by Pomodoro appears idle, and start is refused with the existing "being timed by Pomodoro" notice

### Ordering

- [ ] **ORDER-01**: User can reorder the Staged tab by drag and by ArrowUp/Down, and the order persists across restarts
- [ ] **ORDER-02**: Staged and Timers orders are independent — reordering one never changes the other
- [ ] **ORDER-03**: Staged order follows task renames, and deleted tasks drop out
- [ ] **ORDER-04**: On mobile, ▲▼ buttons let the user reorder cards on both tabs

### Completion & Done Today

- [ ] **DONE-01**: ✓ on a non-recurring staged task completes it (configured completed status), stops its timer, and clears `staged`
- [ ] **CTRL-13**: On either tab, ✓ on a recurring task completes only today's instance (staging day passed explicitly), never closes the series, and a repeated ✓ never un-completes it
- [ ] **DONE-02**: A "Done today" section on the Staged tab lists staged tasks completed today — from the pane (plugin's own record) or elsewhere (no write by the pane) — until rollover

### Rollover

- [ ] **ROLL-01**: The staging day starts at the rollover hour; at 1:30 AM it is still the previous day (DST-safe calendar math)
- [ ] **ROLL-02**: Unfinished staged tasks roll forward to the next day with no writes, and their days-staged count increases
- [ ] **ROLL-03**: Rollover takes effect promptly even if Obsidian was left open overnight or the machine slept

### Release

- [ ] **PANE-04**: Display name becomes "TaskNotes Task Control"; plugin id (`tasknotes-timer-pane`), view type, command ids and saved data are unchanged; released as 0.3.0 through BRAT

## Future Requirements

Deferred; tracked but not in this roadmap.

- **DONE-F1**: Undo ✓ from the Done today section
- **STAGE-F1**: "Stage" item in the Timers-card context menu
- **SCARD-F1**: Total tracked time shown (muted) on idle staged cards
- **HIST-F1**: Recent tasks, today's log, estimate progress
- **PANE-F1**: Hotkeys
- **VER-F1**: v0.2 leftovers — skipped Phase 1 native desktop checks; observe the unreadable-Pomodoro note

## Out of Scope

| Feature | Reason |
|---------|--------|
| Pomodoro display or 🍅 start on staged cards | User chose to keep v0.2 behavior: Pomodoro-owned entries hidden in both tabs |
| Using TaskNotes' `scheduled` field for staging | Kept free for its intended purpose (Q2) |
| Auto-registering the `staged` user field | No official API; would require TaskNotes internals (Q15) |
| Deleting the key via undocumented `customFrontmatter` | User chose documented-only `null` write; empty `staged:` is harmless |
| Already-staged tasks in the Stage picker / re-staging to reset days | User chose to hide them; unstage + re-stage resets instead |
| Configurable staged field key | Hard-coded as `staged` for simplicity (Phase 4 discussion) |
| Cross-device data.json merge (former SYNC-05) | Multi-device operation is out of scope (Phase 4 discussion); single-device saves still never reset other keys |
| Bulk timer actions on the Staged tab header | Staged header has Stage only; bulk actions stay on Timers |
| Auto-archive / "overdue" styling for long-staged tasks | Anti-feature per research; quiet carry-over with days count instead |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TABS-01 | Phase 5 | Pending |
| TABS-02 | Phase 5 | Pending |
| TABS-03 | Phase 6 | Pending |
| TABS-04 | Phase 6 | Pending |
| SETUP-01 | Phase 4 | Pending |
| SETUP-02 | Phase 6 | Pending |
| SETUP-03 | Phase 6 | Pending |
| STAGE-01 | Phase 6 | Pending |
| STAGE-02 | Phase 6 | Pending |
| STAGE-03 | Phase 6 | Pending |
| STAGE-04 | Phase 6 | Pending |
| STAGE-05 | Phase 6 | Pending |
| SCARD-01 | Phase 6 | Pending |
| SCARD-02 | Phase 6 | Pending |
| SCARD-03 | Phase 6 | Pending |
| SCARD-04 | Phase 6 | Pending |
| ORDER-01 | Phase 6 | Pending |
| ORDER-02 | Phase 6 | Pending |
| ORDER-03 | Phase 6 | Pending |
| ORDER-04 | Phase 7 | Pending |
| DONE-01 | Phase 7 | Pending |
| CTRL-13 | Phase 7 | Pending |
| DONE-02 | Phase 7 | Pending |
| ROLL-01 | Phase 4 | Pending |
| ROLL-02 | Phase 7 | Pending |
| ROLL-03 | Phase 7 | Pending |
| PANE-04 | Phase 7 | Pending |

**Coverage:**
- v0.3 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Requirements defined: 2026-11-12*
*Last updated: 2026-11-12 after Phase 4 discussion (SYNC-05 dropped; staged key fixed)*
