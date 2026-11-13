---
phase: "04"
slug: "staging-foundations"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-13"
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| spike script → Obsidian CLI → running Obsidian | Arbitrary JavaScript runs inside whichever vault window the CLI targets (04-01) | JS snippets, vault paths; could reach a real vault if unguarded |
| spike script → TaskNotes runtime api | create/update/toggle mutate task notes (04-01) | Task frontmatter |
| data.json → loadSettings | User-editable, possibly corrupt file read at every onload (04-02, 04-03) | rolloverHour, completionStatus, pause records |
| settings dropdown → savePatch → persistAll | UI value becomes persisted state (04-03) | Plugin settings |
| TaskNotes runtime api → bridge | Another plugin's object; may lack methods, be replaced on reload, or return odd shapes (04-04) | Catalog user fields |
| bridge → TaskNotes write api | Writes into the user's task notes through another plugin (04-05) | Task patches, recurring dates |
| TaskNotes plugin manifest → bridge | Version string from another plugin decides availability (04-05) | Version string |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-04-01 | Tampering | `guarded()` snippets, scripts/staging-spike.mjs | high | mitigate | basePath guard at top of every snippet; `--self-test` prints "self-test ok" and rejects non-dev-vault paths | closed |
| T-04-02 | Elevation of Privilege | `runEval` / argv | medium | mitigate | `execFile` with arg array (3 hits); 0 `shell: true` / `exec(` hits; fixed mode allowlist | closed |
| T-04-03 | Information Disclosure | Q2 field-shape probe | medium | mitigate | 0 hits for `getSettings`/`apiToken`/`plugin.settings` in the spike; only `catalog.userFields()` read | closed |
| T-04-04 | Tampering | scratch tasks in dev vault | low | accept | Dev vault is git-ignored; no mode deletes files | closed |
| T-04-05 | Tampering | `stagingDay` rolloverHour | low | mitigate | `isRolloverHour` / `DEFAULT_ROLLOVER_HOUR` fallback in src/model/stagingDay.ts | closed |
| T-04-06 | Denial of Service | `stagingDay` nowMs | low | mitigate | `RangeError("nowMs must be a finite number")` in src/model/stagingDay.ts | closed |
| T-04-07 | Tampering | `loadSettings` rolloverHour | medium | mitigate | `isRolloverHour` gate in src/settings.ts; settings tests pass | closed |
| T-04-08 | Tampering | `savePatch` / `persistAll` | high | mitigate | `saveSettings({ ...this.deps.getSettings(), ...patch })` (TimerPaneSettingTab.ts:70); `rolloverHour` in `OWNED_KEYS` (main.ts:16); either-order save tests pass | closed |
| T-04-09 | Tampering | rollover dropdown onChange | low | mitigate | `isRolloverHour` + `String(...) === value` re-validation before save | closed |
| T-04-10 | Information Disclosure | save-failure Notice | low | mitigate | Fixed copy "Couldn't save the rollover hour. Try again." | closed |
| T-04-11 | Information Disclosure | registration check data source | medium | mitigate | 0 hits for `plugin.settings`/`apiToken` in TaskNotesBridge.ts; `catalog.userFields` only | closed |
| T-04-12 | Spoofing | `TaskNotesBridge.userFields` | medium | mitigate | featureApi gate + "TaskNotes changed while loading user fields" reload re-check | closed |
| T-04-13 | Tampering | `fieldStatus` input | medium | mitigate | `Array.isArray` guard, malformed entries skipped, never-throws matrix in tests/stagedField.test.ts | closed |
| T-04-14 | Denial of Service | `REQUIRED_CAPABILITIES` | high | mitigate | `REQUIRED_CAPABILITIES` unchanged (`time.read`, `time.write`, `tasks.events`, `lifecycle.events`; TaskNotesBridge.ts:25) | closed |
| T-04-15 | Tampering | `updateTask` patch | high | mitigate | "Staging writes use registered fields only" refusal of `customFrontmatter` before TaskNotes call; behind `featureApi("tasks.write", ...)` | closed |
| T-04-16 | Tampering | `toggleCompleteInstance` date | medium | mitigate | "Recurring completion needs a YYYY-MM-DD day" guard; 4 rejected formats tested | closed |
| T-04-17 | Denial of Service | timers on TaskNotes 4.10–4.12 | high | mitigate | 4.12.3 regression tests in tests/bridge.test.ts ("Timers unaffected by staging") | closed |
| T-04-18 | Spoofing | manifest version check | low | accept | Capability + method checks still run after the `STAGING_MIN_TASKNOTES_VERSION` floor | closed |
| T-04-SC | Tampering | npm/pip/cargo installs | low | accept | No packages installed in any Phase 4 plan | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

Evidence run 2026-11-13: grep-level checks per threat plus `npx vitest run --dir tests stagingDay settings stagedField bridge contract main` → 6 files, 255 tests passed. SUMMARY Threat Flags (04-04, 04-05): none beyond the register.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-04-04 | Spike scratch tasks and the `staged` field live only in the git-ignored dev vault; no mode deletes files | plan 04-01 (plan-time disposition) | 2026-11-12 |
| AR-04-02 | T-04-18 | A spoofed TaskNotes version cannot enable a method TaskNotes lacks, because capability and method checks still gate every call | plan 04-05 (plan-time disposition) | 2026-11-12 |
| AR-04-03 | T-04-SC | No package installs in Phase 4; supply-chain surface unchanged | plans 04-01..04-05 (plan-time disposition) | 2026-11-12 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-13 | 19 | 19 | 0 | gsd-secure-phase orchestrator (L1 short-circuit; plan-time register, ASVS 1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-13
