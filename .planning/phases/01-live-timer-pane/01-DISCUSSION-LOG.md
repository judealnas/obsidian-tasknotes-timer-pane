# Phase 1: Live Timer Pane - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the alternatives considered.

**Date:** 2026-10-13
**Phase:** 01-live-timer-pane
**Areas discussed:** Dev vault & build loop, Edge-case timers shown, Verification depth (not selected: Repo & release setup)

---

## Dev vault & build loop

| Option | Description | Selected |
|--------|-------------|----------|
| Separate dev vault | Throwaway vault with TaskNotes and sample tasks | ✓ |
| My real vault | Build into the daily vault | |
| Both, configurable | Env var or local file picks the target | |

| Option | Description | Selected |
|--------|-------------|----------|
| Create it in the repo | Git-ignored `dev-vault/` with seeded tasks | ✓ |
| Create it outside the repo | Path in a local untracked config | |
| I already have one | User supplies the path | |

| Option | Description | Selected |
|--------|-------------|----------|
| Hot Reload plugin | pjeby/hot-reload plus a `.hotreload` marker | ✓ |
| Obsidian CLI reload | esbuild onEnd runs `plugin:reload` | |
| Manual | Toggle the plugin by hand | |

| Option | Description | Selected |
|--------|-------------|----------|
| Latest only | 4.13.x; too-old state via disable or unit test | ✓ |
| Latest + 4.10.0 | Also test the minimum version by hand | |
| You decide | | |

---

## Edge-case timers shown

| Option | Description | Selected |
|--------|-------------|----------|
| Show it, labelled 'Archived' | Never hide a running timer | ✓ |
| Show it like any timer | No label (UI-SPEC assumption) | |
| Hide it | Match the status bar | |

**Primary card when archived and normal timers both run:** options were "Most recent, regardless" and "Prefer non-archived".
**User's choice (free text):** "Actually, the timer for an archived task should automatically be stopped."

Follow-ups:
- When to auto-stop: **Whenever the plugin sees one** (over "only when archived live" and "only while the pane is open")
- Notify: **Yes, a Notice** (later refined, see below)
- Phase: **Phase 1** (over Phase 2)

**Clarification from the user:** "I like the idea of leaving it to TaskNotes built-in mechanisms. Does that auto-stop mechanism not apply when a task is archived? Only when it is assigned as 'done'?"
**Verified in TaskNotes 4.13.8 source:**
- `SettingsLifecycleService.handleAutoStopTimeTracking` only fires on a completed-status transition or a recurring-instance completion.
- `TaskService.toggleArchive` has no time-tracking side effect.
- `api.time.stop` has no stop-time parameter.
- The setting is readable via `api.settings.snapshot()` and `api.model.config()`.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, pane auto-stops | Always auto-stop archived timers | |
| No, label only | Leave all stopping to TaskNotes | |
| Follow TaskNotes' setting | Auto-stop archived timers only when 'Auto-stop tracking' is on | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Always show a Notice | The pane acts where TaskNotes wouldn't | |
| Follow TaskNotes' setting | Mirror 'Completion notification' (default off) | ✓ |

**Notes:** Done or completed tasks are left entirely to TaskNotes. The end time is "now" (the only safe write path).

---

## Verification depth

| Option | Description | Selected |
|--------|-------------|----------|
| Pure logic + fake bridge | Vitest on time math, store, bridge states, auto-stop rules | ✓ |
| Pure logic only | Time math only | |
| Also view rendering | obsidian-test-mocks plus jsdom | |

| Option | Description | Selected |
|--------|-------------|----------|
| Manual UAT checklist | Written checklist in the dev vault | ✓ |
| Checklist + CLI smoke script | Add an `obsidian eval` script | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes: build, tsc, lint, test | Per-plan definition-of-done gate | ✓ |
| Build + test only | Lint advisory | |

---

## Claude's Discretion

- How the dev-vault seed is tracked
- Whether an auto-stop failure shows a Notice
- Exact Notice wording
- "Archived" label placement and class
- Resync, debounce and probe intervals

## Deferred Ideas

- Upstream TaskNotes suggestion: auto-stop on archive
- Repo and release setup (not discussed)
- Deleted or unreadable task files with an open entry
