---
phase: "02"
slug: start-switch-complete
status: verified
threats_open: 0
asvs_level: 1
register_authored_at_plan_time: true
created: "2026-10-16"
---

# Phase 02 Security

Reviewed the threat registers authored in the three Phase 2 plans at the configured source-level depth (ASVS level 1). Duplicate T-02-SC rows describe the same unchanged package boundary and are consolidated below. Desktop testing remains pending; this report does not certify host interaction.

## Trust Boundaries

- Task paths, titles and metadata enter picker rendering from the public TaskNotes API.
- Pane controls request task and timer mutations through the capability-gated bridge.
- Saved settings resolve against the current completed-status catalog.

## Threat Register

| Threat ID | Severity | Disposition | Evidence | Status |
|-----------|----------|-------------|----------|--------|
| T-02-01 | high | mitigate | taskWikilink rejects link-breaking syntax; picker Markdown uses only that path; titles/due use DOM text; tests/taskLink.test.ts | closed |
| T-02-02 | medium | mitigate | TimerController.start rereads active entries inside WriteQueue and never stops another timer; controller duplicate/concurrency tests | closed |
| T-02-03 | medium | mitigate | TaskPickerModal opening/query generations discard stale results; clearRows/release unload explicit Components; picker lifecycle tests | closed |
| T-02-04 | medium | mitigate | Picker chip capture listeners prevent nested actions; selectSuggestion/onChooseSuggestion guard once-only selection; live chip interaction tracked separately | closed |
| T-02-05 | high | mitigate | stopAll captures finite exact identities, rereads active/ownership per target and skips replacements; controller batch tests | closed |
| T-02-06 | medium | mitigate | Awaited sequential stops, deduplicated target set, bounded failures and finally-based busy release in TimerController.stopAll | closed |
| T-02-07 | high | mitigate | getPomodoroOwnedEntryId validates running work session, completion/interruption, path and timestamp; malformed/read failure returns unreadable | closed |
| T-02-08 | low | mitigate | New Stop all feedback exposes counts and fixed messages; raw target errors are used only for benign-race classification | closed |
| T-02-09 | medium | mitigate | loadSettings validates persisted data; resolveCompletionStatus restricts to live completed statuses with first-status fallback; settings tests | closed |
| T-02-10 | medium | mitigate | Complete distinguishes failed/partial/completed; status failure prevents stop and later stop failure never rolls status back; controller tests | closed |
| T-02-11 | high | mitigate | featureApi gates exact capability/callable at invocation; namespace receiver retained; context carried through the one WriteQueue; bridge/controller tests | closed |
| T-02-12 | low | mitigate | New Complete and settings failures emit fixed safe messages without task/status/exception values | closed |
| T-02-SC | high | mitigate | No dependency install or manifest/lockfile change in Phase 2; standard project check passes using existing packages | closed |

## Accepted Risks Log

No additional risk acceptance was requested or recorded. The public path-only stop API leaves an external replacement race between the final read and write; plans and code disclose it and WINDOWS entries 8/9 retain the live checks. This source review does not claim an atomic conditional stop.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-16 | 13 | 13 | 0 | Parent source-level review |

## Sign-Off

- [x] Every planned threat has implementation evidence.
- [x] Blocking open threats: 0.
- [x] Level 1 source review complete.
- [ ] Native Obsidian interaction and external-race UAT pending.
