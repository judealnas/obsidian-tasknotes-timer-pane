# Phase 4: Staging Foundations - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the alternatives considered.

**Date:** 2026-11-12
**Phase:** 04-staging-foundations
**Areas discussed:** Cross-device merge rules, Staged-key field behavior, Rollover-hour control, Dev-vault spike approach

---

## Cross-device merge rules

| Option | Description | Selected |
|--------|-------------|----------|
| Per-key merge | Incoming settings win. Pauses: the newer record wins per task. Order: incoming order, then local-only paths appended. Done today: union | |
| Incoming wins, keep local pauses | Adopt the incoming file, but merge pause records | |
| Order/Done today per-device | Never take order or Done today from another device | |

Follow-ups (deletion/tombstones, whether the user syncs plugin data, merge Notice) were also offered.

**User's choice:** "This problem is out-of-scope". The same answer was given to all four questions.
**Notes:** SYNC-05 was dropped from Phase 4 and v0.3. Single-device data safety (`OWNED_KEYS`, `persistAll`, the `saveChoice` fix) stays.

---

## Staged-key field behavior

The first round asked about save timing, invalid keys, live registration status and the key-change warning. The user didn't recognize the context, so the questions were re-explained in three steps: what the "settings tab" is (the plugin settings page), what the text box would be for, and why registration matters.

| Option | Description | Selected |
|--------|-------------|----------|
| Configurable text box | SETUP-01 as written, with save on Enter/blur, validation and a status line | |
| Always `staged` | Hard-coded key, no text box | ✓ |

**User's choice:** "for simplicity, hard code the 'staged' key"
**Notes:** Key validation and the key-change warning are now moot. The registration check stays (Phase 6 needs it).

---

## Rollover-hour control

| Option | Description | Selected |
|--------|-------------|----------|
| Dropdown (24 hours) | No invalid values | ✓ |
| Number box 0–23 | Needs validation | |
| Slider 0–23 | Compact, but imprecise to land on an exact hour | |

**User's choice:** Dropdown. The user's first question was whether 24 options would be huge. Claude explained that it is a compact native select (one line closed, scrolls when open), and the user confirmed "dropdown sounds good".
**Label format:** 12-hour ("4 AM"). The user chose this.
**Description explaining the 1:30 AM rule:** yes.

---

## Dev-vault spike approach

| Option | Description | Selected |
|--------|-------------|----------|
| Scripted via Obsidian CLI `eval` + checklist fallback | Claude runs it and reports | ✓ |
| Manual checklist | The user clicks through | |

| Option | Description | Selected |
|--------|-------------|----------|
| Dev vault 4.13.8 only, pin in contract tests | Never touch the Personal Vault | ✓ |
| Also check 4.13.0 | Would require the Personal Vault or a downgrade | |

**User's choice:** Recommended for both.

---

## Claude's Discretion

- Module and constant names, the spike script location, the exact rollover description copy, and whether a default `rolloverHour` is omitted from data.json.

## Deferred Ideas

- Cross-device data.json merge (former SYNC-05).
- Configurable staged key (with validation and a key-change warning).
