# TaskNotes Timer Pane

## What This Is

An Obsidian plugin that adds a dockable pane for monitoring and controlling TaskNotes' regular (non-Pomodoro) task time tracking. TaskNotes already has a Pomodoro pane, but for normal task timing the only indication that a task is being timed is a small status-bar indicator in the bottom right of the window. This pane fills that gap: keep it open beside your notes to see how long you've spent on the current task, and stop, pause, or switch tasks in one or two clicks.

## Core Value

With the pane open, I can always see what task is being timed and how long I've spent on it, and stop, pause, or switch tasks in one to two clicks, without leaving the pane.

## Requirements

### Validated

- ✓ Sidebar pane opened from the ribbon icon and command palette, revealed rather than duplicated, and restored after restart — v0.2 (Phase 1)
- ✓ Live H:MM:SS session time and total tracked time to the second, one card per running timer — v0.2 (Phase 1; one card per timer replaced the earlier "most recent plus +N more" design)
- ✓ One-click Stop of a timer from the pane — v0.2 (Phase 1)
- ✓ Stays in sync with timers started or stopped anywhere in TaskNotes, via Sync, or by hand-edited frontmatter; reconnects after TaskNotes reloads and after sleep/wake — v0.2 (Phase 1; some native desktop checks skipped and overridden at milestone close)
- ✓ Start task from the pane with a searchable picker while preserving other running timers — v0.2 (Phase 2); automated checks and user desktop acceptance
- ✓ Stop all regular timers while protecting the exact active Pomodoro-owned entry — v0.2 (Phase 2); user confirmed the mixed regular/Pomodoro case
- ✓ Complete timed tasks using a live, persisted completed-status preference — v0.2 (Phase 2); automated checks and user desktop acceptance
- ✓ Pause and resume per card and from the header, persisted across restarts, with Pomodoro-owned timers hidden from the pane — v0.2 (Phase 3); 361 automated tests and user desktop acceptance (the unreadable-ownership note is a deferred follow-up)

### Active

No requirements are active yet; the next milestone defines them (`/gsd-new-milestone`). Candidates carried forward from v0.2:

- [ ] Finish the skipped Phase 1 native desktop checks (already-stopped race, stop failure and recovery, archived timers, completion auto-stop)
- [ ] Observe the muted "Can't check Pomodoro" line on desktop (unreadable ownership)
- [ ] v2 ideas deferred during scoping: recent tasks, today's log, estimate progress, hotkeys

### Out of Scope

- Desktop overlay / always-on-top window outside Obsidian — that's what jane-t/TaskNotesTimer does; this project wants in-Obsidian integration
- Pomodoro controls — TaskNotes already has a Pomodoro pane (possible through `api.pomodoro.*`; revisit in a later version)
- Using TaskNotes' HTTP API — in-process integration chosen instead (no API server/token needed)
- Basing implementation on the zczs520/tasknotes 5.2.3 fork — unknown provenance; user prefers not to rely on it
- Community plugin directory submission (for now) — personal use; manual/BRAT install is enough
- Rich reporting/analytics — not part of the core need
- "Also running" list — superseded in v0.2 by one card per running timer
- Recent tasks, today's log, estimate progress, hotkeys — deferred to v2 during scoping (next-milestone candidates)

## Context

- **Host:** Obsidian desktop, with the TaskNotes plugin (callumalpass/tasknotes) installed. TaskNotes stores tasks as markdown notes with YAML frontmatter; time tracking is stored as `timeEntries` (start/end timestamps) in task frontmatter, and TaskNotes shows an active-timer indicator in the status bar.
- **Inspiration:** https://github.com/jane-t/TaskNotesTimer — Tauri desktop overlay that polls TaskNotes' HTTP API (active-timer endpoint), offers a task dropdown of open/in-progress tasks, START/STOP buttons, large live count-up clock. Good reference for feature set and UX; architecture differs (external app vs. in-Obsidian view).
- **Possible reference (low trust):** https://github.com/zczs520/tasknotes/releases/tag/5.2.3 — a fork that claims to implement this feature; user knows little about it and prefers not to use it.
- **UI precedent:** TaskNotes' own Pomodoro timer pane — the target look/feel for a persistent sidebar pane.
- **Integration approach:** in-process via TaskNotes' documented JavaScript Runtime API v1 (`app.plugins.getPlugin("tasknotes").api`, added in 4.10.0). Writes only through `api.time.start`/`stop` so data stays in TaskNotes' format and its status bar stays consistent. See `.planning/research/SUMMARY.md`.

## Current State

Shipped **v0.2 MVP** on 2026-11-12 (plugin version 0.2.0, distributed through BRAT): about 3,600 lines of TypeScript in `src/` with a Vitest suite, on Obsidian 1.14.4 typings, TS 6, esbuild 0.28 and ESLint 9 with obsidianmd rules. After the phases, quick tasks added wikilink title chips with TaskNotes' task menu, drag-and-drop/keyboard card reordering, and BRAT release plumbing.

Known debt at close: Phase 1 verification is human_needed with skipped native checks; all phase verification reports were stale (the verifier is disabled in config); a dev-only `npm audit` moment advisory via `eslint-plugin-obsidianmd`. See `.planning/MILESTONES.md`.

## Constraints

- **Dependency**: Requires TaskNotes plugin installed and enabled — the pane is a companion, not a replacement
- **Data format**: Must write time entries exactly as TaskNotes does (ideally by calling TaskNotes' own APIs) — avoids corrupting tracked time or desyncing TaskNotes' UI
- **Compatibility**: Relies on TaskNotes Runtime API v1 (TaskNotes >= 4.10.0); never TaskNotes internals — must degrade gracefully if TaskNotes is missing, disabled, too old, or reloaded
- **Platform**: `isDesktopOnly: false`, but verified on desktop only
- **Tech stack**: Obsidian plugin (TypeScript, Obsidian API, esbuild per sample-plugin conventions)
- **Distribution**: Personal use — manual install or BRAT

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| In-Obsidian pane instead of desktop overlay | User wants it integrated into the Obsidian window like the Pomodoro pane | ✓ Good (v0.2) |
| In-process integration via Runtime API v1, not HTTP API or internals | No API server/token setup; documented, versioned companion-plugin surface | ✓ Good (v0.2): covered every need without internals |
| One card per running timer instead of the most recent plus "+N more" | Concurrent timers are normal in TaskNotes; hiding them made the others hard to control | ✓ Good (v0.2) |
| Start adds a concurrent timer; Stop all skips the exact active Pomodoro-owned entry | Independent timer model chosen during Phase 2 discussion; switch action and its setting were removed | Phase 2 accepted |
| Individual Stop closes task time tracking without stopping the Pomodoro countdown | Pane controls regular time entries; Pomodoro countdown controls remain in TaskNotes | User observed and clarified during Phase 2 UAT |
| Pomodoro-owned timers hidden from the pane; if ownership can't be read, show all timers with a note | Pomodoro owns its entry, and pane pause would orphan it. Hiding is simpler than labelling, and the pane stays focused on regular timers (replaces the earlier label-and-hide-pause plan, 2026-10-16) | Phase 3 accepted; unreadable-note visual deferred |
| Full control (start/stop/pause/switch), not just monitoring | Done = stop, pause, or switch in 1–2 clicks from the pane | ✓ Good (v0.2): switch became Start plus concurrent timers |
| Pause implemented as stop + new entry on resume | TaskNotes time tracking has no native pause; time entries are start/end pairs | Phase 3 accepted |
| Pause records live in the plugin's data.json, keyed by session and reconciled against TaskNotes on every refresh | Survives restarts; renames follow vault events; clears only on clear signals (resume, stop, complete, delete, Pomodoro takeover), never by age or a null read | Phase 3 accepted |
| Sidebar view + ribbon icon + command | Matches Pomodoro pane placement; easy to open | ✓ Good (v0.2) |
| Don't base on zczs520 fork | Unknown provenance | ✓ Good (v0.2): not needed |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-12 after v0.2 milestone*
