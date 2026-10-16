# Phase 3: Pause & Resume - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-16
**Phase:** 03-pause-resume
**Areas discussed:** Pause with concurrent timers, Paused card look & actions, When pause clears, Hidden Pomodoro details

**Before discussion:** The user decided outside the formal flow to hide Pomodoro-owned timers entirely, replacing DISP-07/CTRL-08. When ownership can't be read, the pane shows all timers with a header note. Pane control of Pomodoro through `api.pomodoro.*`, which is possible in 4.13.8, was deferred to a later version.

---

## Pause with concurrent timers

| Option | Description | Selected |
|--------|-------------|----------|
| Any card, many paused | Each running card gets Pause; any number paused at once | |
| Only one paused task | Pausing a second task replaces the first pause | |
| Pause all from header | Header Pause all / Resume | ✓ (with per-card pause too) |

**User's choice:** Pause all from header plus per-card pause.

| Option | Description | Selected |
|--------|-------------|----------|
| Toggle Pause all ↔ Resume all | One button that flips | |
| Two separate buttons | Pause all and Resume all, disabled when they'd do nothing | ✓ |
| Pause all only | Resume per card | |

| Option | Description | Selected |
|--------|-------------|----------|
| No, pauses stay | Starting another timer leaves pauses | ✓ |
| Yes, starting clears all pauses | Original CTRL-04 rule | |

| Option | Description | Selected |
|--------|-------------|----------|
| Pause all disabled when ownership unreadable | Same rule as Stop all | ✓ |
| Allowed anyway | Could close the Pomodoro's entry | |

---

## Paused card look & actions

| Option | Description | Selected |
|--------|-------------|----------|
| Below running cards | Paused cards after running ones, muted | |
| Mixed in by start time | Card keeps its place, restyled | ✓ |
| Separate "Paused" section | Labelled section | |

| Option | Description | Selected |
|--------|-------------|----------|
| Frozen session + total | Last session value frozen, plus total | ✓ |
| Total + paused-for | Ticking paused duration | |
| Total only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Session continues from paused value | Stopwatch across segments | ✓ |
| Restarts at 0:00:00 | Matches TaskNotes' entry view | |

| Option | Description | Selected |
|--------|-------------|----------|
| Resume · Stop · Complete | Stop ends the pause with no write | ✓ |
| Resume · Complete | | |
| Resume · Dismiss (×) | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Stop all also clears paused cards | Clean pane in one click | ✓ |
| Running timers only | | |

---

## When pause clears

| Option | Description | Selected |
|--------|-------------|----------|
| External start = Resume | Session continues | ✓ |
| Clear pause, fresh card | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Completed/deleted clears; rename follows | Matches CTRL-04 | ✓ |
| Keep completed, clear deleted | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Never expire | | ✓ |
| Clear at midnight | | |
| Clear after N hours (setting) | | |

---

## Hidden Pomodoro details

| Option | Description | Selected |
|--------|-------------|----------|
| Show it, notice on pick | Extends D-11 notice | |
| Mark it in the list | Muted "Pomodoro" tag; picking gives the notice | ✓ |
| Leave it out | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep it paused | Pomodoro hidden, pause kept | |
| Clear the pause | Pomodoro took over the task | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Muted line under the header | Shown only while state is unknown | ✓ |
| Header icon with tooltip | | |

---

## Claude's Discretion

- Header layout with four buttons, partial-failure notice wording, persisted pause record shape, detection of external starts and Pomodoro takeovers, and mutation-context tagging.

## Deferred Ideas

- Pane control of Pomodoro (`api.pomodoro.pause/resume/stop`): later version.
