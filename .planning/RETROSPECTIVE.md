# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v0.2 — MVP

**Shipped:** 2026-11-12 (plugin release 0.2.0 on 2026-10-27)
**Phases:** 3 | **Plans:** 12 | **Sessions:** not tracked

### What Was Built
- A capability-gated bridge to the TaskNotes Runtime API v1 that reconnects by itself, survives sleep/wake, and shows honest message states when TaskNotes is missing or too old.
- A sidebar pane with one card per running timer: a title chip, a live session clock and a total, kept in sync with changes from anywhere.
- Start (fuzzy picker), Stop, Pomodoro-safe Stop all, and Complete, all serialized through one write queue.
- Pane-owned Pause/Resume, per card and in bulk, persisted in data.json and reconciled against TaskNotes, with Pomodoro-owned timers hidden.
- After the phases: wikilink title chips, card reordering, and BRAT release plumbing.

### What Worked
- Vertical MVP slices with a walking skeleton first: Phase 1 proved both the read path and the `api.time.stop` write path before any other feature was added.
- Staying strictly on the public Runtime API v1. Every need was covered without TaskNotes internals, and a vendored type-only contract pinned by compile-time tests caught drift early.
- TDD with red-test commits before each feature (`test(...)` then `feat(...)`), which kept the write-queue and reconcile logic honest. By Phase 3 there were 361 automated tests.
- Quick tasks handled small UX polish (chips, fonts, reordering) without reopening phases.

### What Was Inefficient
- Phase 1 verification never reached `passed`. Native desktop checks were skipped under a no-human-intervention instruction, so verification stayed `human_needed` and needed an override at close.
- Post-phase quick tasks left every phase's verification report stale. Once the verifier was disabled in config, nothing refreshed the reports.
- GSD tooling friction: the deferred-items scanner reads table rows, but the acknowledge writer only matches bullets and headings. `deferred-items.md` had to be converted to a bullet list to close.

### Patterns Established
- One bridge class owns the TaskNotes `api`, and the view never touches it. A shared fake TaskNotes drives the tests.
- A serial write queue for every TaskNotes write. Pomodoro ownership is re-checked inside the queue, and timers are matched by exact `(taskPath, startTime)`.
- Pane-owned state (pauses, card order) persisted through one serialized, merged data.json writer.
- Defer to TaskNotes' own settings and mechanisms, and fill only the gaps.

### Key Lessons
1. Schedule the native desktop UAT as an explicit hands-on session per phase. Skipped native checks accumulate into an override at milestone close.
2. Keep the verifier on, or re-run `/gsd-execute-phase N` after quick tasks that touch phase-covered source, so verification doesn't go stale silently.
3. Write deferred items as bullets, not tables, so the GSD acknowledge flow can close them.

### Cost Observations
- Model mix: not tracked
- Sessions: not tracked
- Notable: the 3 phases executed in about 4 days (2026-10-13 to 10-16). The remaining time to release went to quick tasks and BRAT packaging.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v0.2 | n/a | 3 | Walking skeleton plus vertical MVP slices, TDD red/green commits, verifier disabled late |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v0.2 | 361+ (at Phase 3) | not measured | 0 runtime dependencies |

### Top Lessons (Verified Across Milestones)

1. (Needs a second milestone to cross-validate.)
