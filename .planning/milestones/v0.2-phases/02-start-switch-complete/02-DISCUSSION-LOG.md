# Phase 2: Start, Switch & Complete - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the alternatives considered.

**Date:** 2026-10-15
**Phase:** 02-start-switch-complete
**Areas discussed:** Switch with many cards, Picker contents & order, Complete from the pane, Idle state & entry points

---

## Switch with many cards

| Option | Description | Selected |
|--------|-------------|----------|
| One pane-level button | One "Switch task" button opens the picker | |
| Button on each card | Each card replaces its own timer | |
| Both | Pane-level and per-card switch | |

**User's choice:** Switch is no longer needed. Instead, a header with two buttons: "Start task", which opens a task selector modal just like TaskNotes' Pomodoro selector, and "Stop all", which stops all non-Pomodoro timers.

| Pomodoro-owned timer on Stop all | Selected |
|---|---|
| Leave it running | ✓ |
| Stop it too | |
| You decide | |

| Stop all confirmation | Selected |
|---|---|
| No, one click | ✓ |
| Confirm when 2+ timers | |
| Always confirm | |

| Stop all with nothing to stop | Selected |
|---|---|
| Disabled | ✓ |
| Hidden | |

| Switch requirements | Selected |
|---|---|
| Rewrite for the header (CTRL-06 becomes Stop all; CTRL-10 dropped) | ✓ |
| Drop both | |
| Move switch to v2 | |

---

## Picker contents & order

Reference read from the TaskNotes 4.13.8 bundle:
- the Pomodoro selector lists every task with `!archived`, and completed tasks sort last
- with a query, the best match comes first
- with no query, tasks sort by due date, then priority, then title
- search covers title, due, priority, contexts, projects and tags

| Which tasks | Selected |
|---|---|
| Same as TaskNotes | ✓ |
| Hide completed | |
| Same as TaskNotes, minus running | |

| Row look | Selected |
|---|---|
| TaskNotes chip, due date as muted text | ✓ |
| Plain text rows | |
| You decide | |

| Order and search | Selected |
|---|---|
| Copy TaskNotes | ✓ |
| Recently modified first | |
| You decide | |

---

## Complete from the pane

| Where | Selected |
|---|---|
| Button next to Stop | |
| Chip's right-click menu only | |
| Both | ✓ |

| Which status | Selected |
|---|---|
| Same as TaskNotes (first completed status) | |
| A pane setting | ✓ |

| Setting shape | Selected |
|---|---|
| Follow TaskNotes by default (completed statuses read live, plus a "Same as TaskNotes" default) | ✓ |
| Pick one, no default entry | |

| Who stops the timer | Selected |
|---|---|
| Pane always stops it | ✓ |
| Leave it to TaskNotes | |

**Notes:** This deliberately overrides Phase 1 D-05 for the pane's own Complete action.

---

## Idle state & entry points

| Idle look | Selected |
|---|---|
| Header + message | ✓ |
| Big centred button | |
| Both | |

| Picking an already-timed task | Selected |
|---|---|
| Notice, nothing else | ✓ |
| Highlight its card | |
| You decide | |

| Header while TaskNotes is missing, loading or too old | Selected |
|---|---|
| Hide it | |
| Show, disabled | ✓ |

---

## Claude's Discretion

- Busy-state scope and failure Notice wording (CTRL-09), following the existing Stop pattern
- Order of the status write and the stop in Complete
- How a Pomodoro-owned timer is detected (research)
- Header icons and labels, picker placeholder and empty text

## Deferred Ideas

- Switch ("time only this"), removed from v1
- "Create new task" from the picker
