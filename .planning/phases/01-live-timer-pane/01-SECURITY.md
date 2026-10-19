---
phase: "01"
slug: live-timer-pane
status: verified
threats_open: 0
asvs_level: 1
register_authored_at_plan_time: true
created: "2026-10-16"
---

# Phase 1 Security Reconciliation

Source-level review of the threat registers already authored in the Phase 1 plans. Current source includes the subsequently accepted Phase 2 extensions; this report identifies those supersessions rather than requiring removal of later functionality. No package install, seed reset, or live-vault mutation was performed.

## Threat Register

| Threat | Severity | Disposition | Evidence | Status |
|--------|----------|-------------|----------|--------|
| T-01-01 | medium | mitigate | TimerPaneView uses DOM text and guarded taskWikilink Markdown; Phase 2 task-link rendering supersedes the original text-only title design | closed |
| T-01-02 | medium | mitigate | Time parsing rejects invalid timestamps; bridge probes and listener notifications catch failures; readPath/bridge tests | closed |
| T-01-03 | high | mitigate | esbuild.config.mjs fixes DEV_DIR to repo-local dev-vault and exposes no destination override | closed |
| T-01-04 | low | accept | Original approved plan accepts installed-plugin trust; Runtime API version/capability gates remain. No new risk acceptance inferred | closed |
| T-01-05 | medium | mitigate | TimerStore trailing debounce, single-flight promise, dirty rerun, signature checks and no retry-on-error loop | closed |
| T-01-06 | medium | mitigate | Bridge retired API WeakSet, unload retirement and guarded detach/off calls; lifecycle tests | closed |
| T-01-07 | low | mitigate | Phase 1 bridge/store logging converts errors to messages, without task-body/event-payload dumps. No blanket claim about later UI error handling | closed |
| T-01-08 | high | mitigate | seed-dev-vault resolves root from import.meta.url, checks destination prefix, refuses .obsidian and non-regular files, copies without deleting | closed |
| T-01-09 | medium | mitigate | dev-vault is ignored; git ls-files dev-vault returns no tracked paths | closed |
| T-01-10 | high | mitigate | Phase 1 Stop uses the capability-gated bridge; no direct frontmatter write. Later Start/Complete APIs are intentional accepted Phase 2 extensions | closed |
| T-01-13 | low | mitigate | Controller Stop carries source, reason and correlationId; controller context assertions | closed |
| T-01-14 | medium | mitigate | Card Stop sends its captured task path; no background completion/archive stop. Same-path replacement limitation is separately documented, not claimed eliminated | closed |
| T-01-SC | high | mitigate | Approved package gate recorded in 01-01 summary/state, committed lockfile, no runtime dependencies and no installs during reconciliation | closed |

T-01-11 and T-01-12 were retired in the plans when automatic archive stopping was removed. Repeated T-01-SC rows describe one package boundary and are consolidated.

## Accepted Risks and Deferred Findings

- The low-severity installed-plugin trust acceptance is inherited from T-01-04 in the original plan.
- The historical dev-tool moment advisory remains documented in deferred-items.md. No dependency refresh or new vulnerability scan was performed; the earlier observation is not presented as a current advisory scan.
- Existing nonblocking review warnings, the accepted timing-display discrepancy, and live-test omissions remain documented. Source-level mitigation review does not claim those were fixed or tested in Obsidian.

## Audit Trail

2026-10-16: Reconciled 13 active planned threats at configured level 1; no open blocking threats. All 216 current automated tests passed. No human test was requested or inferred performed.
