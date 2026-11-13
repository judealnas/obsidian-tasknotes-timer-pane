# Phase 5: Two-Tab Shell - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-13
**Phase:** 05-two-tab-shell
**Areas discussed:** Tab strip look & keys, Default tab & multiple panes, Staged placeholder, Connection messages vs tabs

---

## Tab strip look & keys

| Option | Description | Selected |
|--------|-------------|----------|
| Underlined text tabs | Two text tabs, active one underlined in the accent color; room for Phase 6 counts | ✓ |
| Segmented control | Two-part toggle with a filled active segment; custom CSS | |
| Icon buttons in a nav row | Compact like the file explorer's header; icons alone are unclear | |

| Option | Description | Selected |
|--------|-------------|----------|
| Text only | Just "Staged" / "Timers" | ✓ |
| Icon + text | e.g. list-checks + Staged, timer + Timers | |

| Option | Description | Selected |
|--------|-------------|----------|
| Arrow keys (ARIA tabs) | One Tab stop; Left/Right switch; Tab moves into content | ✓ |
| Each tab is a button | A Tab stop on each tab; Enter/Space switches | |

| Option | Description | Selected |
|--------|-------------|----------|
| Row under the tabs | That tab's actions on their own wrapping row | ✓ |
| Same row as the tabs | Saves a row; four Timers buttons won't fit a narrow sidebar | |

**User's choice:** All recommended options.

---

## Default tab & multiple panes

| Option | Description | Selected |
|--------|-------------|----------|
| Timers | Upgraders see the pane they had; a running timer is never hidden | ✓ |
| Staged | New workflow first, but a placeholder in Phase 5 | |
| Timers if running, else Staged | Depends on data that may still be loading | |

| Option | Description | Selected |
|--------|-------------|----------|
| Independent | Each pane remembers its own tab (per-leaf view state) | ✓ |
| Kept in sync | Switching in one pane switches the others | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep its current tab | Reveal only brings the pane forward | ✓ |
| Always switch to Timers | Ribbon becomes a "show timers" shortcut | |

| Option | Description | Selected |
|--------|-------------|----------|
| Never auto-switch | The tab changes only on user action | ✓ |
| Switch to Timers | Shows a new timer, but jumps away from Staged | |

**User's choice:** All recommended options.

---

## Staged placeholder

| Option | Description | Selected |
|--------|-------------|----------|
| Final empty-state copy | e.g. "Nothing staged for today"; Phase 6 only wires it up | ✓ |
| "Coming soon" note | Accurate for a dev build; Phase 6 would have to replace it | |
| Blank | Looks broken; nothing for UAT to check | |

| Option | Description | Selected |
|--------|-------------|----------|
| Disabled Stage button | In place now, with an "isn't available yet" tooltip | ✓ |
| No header row | Layout shifts when Phase 6 adds it | |

**User's choice:** All recommended options.

---

## Connection messages vs tabs

| Option | Description | Selected |
|--------|-------------|----------|
| Tabs stay, shared message | Tabs switchable; header disabled; one message replaces the tab body | ✓ |
| Hide tabs, message only | Layout jumps on every reconnect | |
| Message on Timers only | Inconsistent; Phase 6 would add it to Staged anyway | |

| Option | Description | Selected |
|--------|-------------|----------|
| Timers tab only | The note describes the Timers list | ✓ |
| Above the tabs (both) | On Staged it talks about timers you can't see | |

**User's choice:** All recommended options.

---

## Claude's Discretion

- Class and module split (`TaskCard` / `CardList<K>`, per-tab card maps and CSS modifiers), lazy versus eager Staged DOM, and whether a hidden tab skips DOM writes
- View-state key shape and validation of restored values
- `TaskPickerModal` options object
- Focus handling on tab switch, and `hidden` versus CSS for inactive panels
- Exact placeholder and tooltip copy

## Deferred Ideas

- A command or hotkey to jump to a specific tab (offered as a follow-up question but not pursued; it falls under the v2 hotkeys idea PANE-F1)
