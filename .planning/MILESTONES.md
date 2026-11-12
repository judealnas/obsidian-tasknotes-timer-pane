# Milestones

## v0.2 MVP (Shipped: 2026-11-12)

**Delivered:** A dockable Obsidian pane that shows every regular TaskNotes timer with a live session clock and total, and lets the user start, stop, complete, pause and resume them (singly or all at once) without leaving the pane. Released to BRAT as plugin version 0.2.0.

**Phases completed:** 3 phases, 12 plans, 19 tasks
**Timeline:** 2026-10-13 → 2026-10-27 (15 days, 121 commits; git range `45f0fde..30595a4`)
**Code:** ~3,600 lines of TypeScript in `src/`
**Closeout type:** override_closeout

**Key accomplishments:**
- Capability-gated bridge to the TaskNotes Runtime API v1: reconnects by itself when TaskNotes is disabled, updated or reloaded, survives sleep/wake, and shows honest message states when TaskNotes is missing or too old.
- One card per running timer, with a title chip linking to the task, a live H:MM:SS session and a total to the second, kept in sync with changes made anywhere in TaskNotes, Sync or hand edits.
- One-click Stop, a searchable Start picker, Pomodoro-safe Stop all, and Complete using a persisted completed-status preference, all serialized through one write queue.
- Pane-owned Pause/Resume, per card and from the header, persisted in data.json across restarts and reconciled against TaskNotes (follows renames, clears on delete, completion or Pomodoro takeover).
- Pomodoro-owned timers are hidden from the pane, and the Start picker refuses a task that Pomodoro is timing.
- After the phases: wikilink title chips with TaskNotes' task menu, drag-and-drop/keyboard card reordering, and BRAT release plumbing (quick tasks 261014-whq, 261019-h6t, 261027-mcs).

**Requirements:** 22/22 v1 requirements checked off (CTRL-08 and CTRL-10 dropped by design).

**Known verification overrides:** 4 newly acknowledged, 0 carried forward from a prior close (see STATE.md Deferred Items).
- Phase 01: `01-UAT.md` partial (test 7 accepted as a minor timing discrepancy; native desktop checks 18-22 skipped) and `01-UAT-CHECKLIST.md` without a status.
- Phase 01: `01-VERIFICATION.md` human_needed.
- Phase 01: deferred `npm audit` moment advisory (lint-time dev dependency only).
- All three phase verification reports were stale at close (source changed after the verifier ran, via the post-phase quick tasks; the verifier is disabled in config).

---
