---
phase: "03"
slug: pause-resume
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
register_authored_at_plan_time: true
created: "2026-10-16"
---

# Phase 03 Security

Reviewed the threat registers authored in the four Phase 3 plans at the configured source-level depth (ASVS level 1, block on `high`). Every threat had a parseable plan-time disposition and grep-level evidence of its mitigation, so the auditor short-circuit applied (threats_open 0, register authored at plan time, ASVS 1). The four T-03-SC rows describe the same unchanged package boundary and are consolidated below. Desktop behavior was confirmed separately in 03-UAT.md.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| data.json to plugin | Pause records are read from a file that Sync, other devices or hand edits can change | Task paths, timestamps, titles (low sensitivity) |
| TaskNotes runtime to pane | `time.active()`, `tasks.get()`, `time.stop()` results and Pomodoro status are external mutable state | Task metadata, time entries |
| Pane click to TaskNotes writes | A click (single or batch) requests path-only stop or start writes | Task paths, mutation context |
| Obsidian vault events to pause store | Rename and delete events carry paths the plugin does not control | File paths |
| TaskNotes Pomodoro status to pane | Ownership snapshot may be malformed and changes between picker open and choice | Task path, entry start time |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-01 | Tampering | `loadPauseRecords` | high | mitigate | `src/model/pauseLedger.ts:131`: version and array checks, `MAX_STORED_RECORDS = 1000`, per-item `parseStoredRecord` drop, newest per normalized path, never throws | closed |
| T-03-02 | Tampering | `TimerController.pause` | high | mitigate | `TimerController.pause` re-reads `active()` in the queue with `sameEntry`, refuses the readable owner; `pauseInQueue` builds the record from the entry TaskNotes closed | closed |
| T-03-03 | Tampering | `TimerController.resume` | high | mitigate | `resumeInQueue` re-reads ownership and active entries in the queue; returns "pomodoro" or "already-running" without writing | closed |
| T-03-04 | Denial of Service | data.json saves | medium | mitigate | `src/main.ts:38-57` single `saveChain`; `persistAll` merges settings, pauses and unknown keys at execution time | closed |
| T-03-05 | Information Disclosure | Notices and logs | low | mitigate | Notices via `new Notice(string)`; pause/resume/persistence/pause-store logs carry no task path ("Pausing a timer failed.", "Saving paused timers failed."); no innerHTML in `src/` | closed |
| T-03-06 | Repudiation | pane writes | low | mitigate | Every stop/start passes `{ source: MUTATION_SOURCE, reason, correlationId }` (`TimerController.ts:95,150,254,281`) | closed |
| T-03-07 | Denial of Service | startup reconcile | high | mitigate | `fileCheck` is null until `onLayoutReady`, then `vault.getFileByPath` (`main.ts:87,131`); null task never clears (pauseLedger tests) | closed |
| T-03-08 | Tampering | refresh vs. pause write | medium | mitigate | `TimerStore.ts:169,198` captures `pauses.revision` and re-reads on mismatch; pending paths skip clearing rules | closed |
| T-03-09 | Spoofing | `renamePath` / `removePath` | medium | mitigate | `PauseStore.ts:23` matches exact path or `target + "/"` prefix after normalization | closed |
| T-03-10 | Tampering | completion rule | low | mitigate | `pauseLedger.ts:234-236` clears only on a catalog completed-type status; `completedStatuses === null` skips; archived flag not consulted | closed |
| T-03-11 | Tampering | `pauseAll` | high | mitigate | `pauseAll` returns on unreadable ownership, re-reads active and ownership before every target, skips owned/vanished/replaced via `selectRegularStopTargets` + `sameEntry`, breaks mid-batch | closed |
| T-03-12 | Denial of Service | batch actions | medium | mitigate | Finite captured target lists, sequential awaits, per-target try/catch counts failures, `busy(-1)` in `finally`, in-queue helpers never re-enter the queue | closed |
| T-03-13 | Tampering | `stopAll` pause clearing | low | mitigate | `stopAll` returns before clearing when `ownershipUnreadable`; clears only `state === "paused"` records | closed |
| T-03-14 | Information Disclosure | batch Notices | low | mitigate | Pause all / Resume all / Stop all Notices contain counts only | closed |
| T-03-15 | Spoofing | owned-entry filter | high | mitigate | `getPomodoroOwnedEntryId` (`pomodoroOwnership.ts:21`) returns `readable:false` on malformed input; hiding only on exact `sameEntry` match | closed |
| T-03-16 | Tampering | picker start | medium | mitigate | `TimerController.start` re-reads ownership inside the write queue (D-17) before any write | closed |
| T-03-17 | Information Disclosure | Pomodoro line and Notices | low | accept | Static line text; D-17 Notice holds only the user-chosen title as a plain string | closed |
| T-03-SC | Tampering | npm installs | high | mitigate | No change to `package.json` or `package-lock.json` across the phase (`git diff d4764ec..HEAD`) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-17 | The Pomodoro line is static text and the D-17 Notice shows only the title the user just chose, as a plain string; no further control is warranted for a personal-use plugin | plan 03-04 (plan-time disposition) | 2026-10-16 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-16 | 18 | 18 | 0 | /gsd-secure-phase (orchestrator, L1 grep short-circuit) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-16
