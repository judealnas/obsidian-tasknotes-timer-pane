---
phase: 01-live-timer-pane
verified: 2026-10-16T19:30:00Z
status: human_needed
score: 14/16 consolidated must-have truths verified
covered_files: [".gitignore",".planning/phases/01-live-timer-pane/01-01-PLAN.md",".planning/phases/01-live-timer-pane/01-01-SUMMARY.md",".planning/phases/01-live-timer-pane/01-02-PLAN.md",".planning/phases/01-live-timer-pane/01-02-SUMMARY.md",".planning/phases/01-live-timer-pane/01-03-PLAN.md",".planning/phases/01-live-timer-pane/01-03-SUMMARY.md",".planning/phases/01-live-timer-pane/01-04-PLAN.md",".planning/phases/01-live-timer-pane/01-04-SUMMARY.md",".planning/phases/01-live-timer-pane/01-05-PLAN.md",".planning/phases/01-live-timer-pane/01-05-SUMMARY.md",".planning/phases/01-live-timer-pane/01-UAT-CHECKLIST.md",".planning/phases/01-live-timer-pane/01-UAT.md",".planning/phases/03-pause-resume/03-UAT.md","README.md","dev-vault-seed/TaskNotes/Tasks/Clean up old project archive.md","dev-vault-seed/TaskNotes/Tasks/Draft the migration plan for the legacy billing system so this title wraps across several lines.md","dev-vault-seed/TaskNotes/Tasks/Review pull requests.md","dev-vault-seed/TaskNotes/Tasks/Write quarterly report.md","esbuild.config.mjs","eslint.config.mts","manifest.json","package-lock.json","package.json","scripts/seed-dev-vault.mjs","src/main.ts","src/model/errors.ts","src/model/pauseLedger.ts","src/model/pomodoroOwnership.ts","src/model/taskLink.ts","src/model/taskPicker.ts","src/model/timeMath.ts","src/settings.ts","src/state/PauseStore.ts","src/state/TimerController.ts","src/state/TimerStore.ts","src/state/WriteQueue.ts","src/tasknotes/TaskNotesBridge.ts","src/tasknotes/runtime-api.types.ts","src/ui/TaskPickerModal.ts","src/ui/TimerPaneSettingTab.ts","src/ui/TimerPaneView.ts","styles.css","tests/bridge.test.ts","tests/contract.test.ts","tests/controller.test.ts","tests/fakes/fakeGateway.ts","tests/fakes/fakeObsidian.ts","tests/fakes/fakeTaskNotes.ts","tests/main.test.ts","tests/pauseLedger.test.ts","tests/pauseResume.test.ts","tests/pauseStore.test.ts","tests/readPath.test.ts","tests/settings.test.ts","tests/store.test.ts","tests/taskLink.test.ts","tests/taskPicker.test.ts","tests/taskPickerModal.test.ts","tsconfig.json"]
covered_digest: "v3:sha256:015c76937fd3a3dfd704724eeae026e9cfba240b414c76495d1fe2a3fba5a1cc"
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 13/16 consolidated must-have truths verified
  reason: "Prior report stale: Phase 2 and Phase 3 changed covered source files (24 source/test files, +2974/-67 lines since commit 5fb3f94)."
  gaps_closed:
    - "Deploy writes all four assets to the fixed dev target (upgraded from PRESENT_BEHAVIOR_UNVERIFIED: deployed manifest.json and styles.css byte-match current sources, main.js contains Phase 3 code, .hotreload present; 03-UAT records the 2026-10-16 deploy)"
  gaps_remaining: []
  regressions: []
flagged_prohibitions:
  - plan: 01-04
    verification: test
    status: unverified
    flagged: true
    reason: "Seed containment: source guards present (fixed roots, .obsidian refusal, COPYFILE_EXCL, no delete path); no wired enforcement test exists in tests/. IN-05 still open."
  - plan: 01-05
    statement: "No task writes other than TaskNotes Runtime API calls"
    verification: test
    status: unverified
    flagged: true
    reason: "Source scan of src/ finds no processFrontMatter, vault.modify/process/create/delete, tasks.update, time.append or deleteEntry. The only writes are api.time.stop, api.time.start (Phase 2/3) and api.tasks.complete (Phase 2 D-14), all authorized later. No wired negative enforcement test exists."
behavior_unverified_items:
  - truth: "Seeding preserves existing files and --reset affects only the seed notes; nothing under dev-vault/.obsidian/ is written."
    test: "Run npm run seed, npm run seed, npm run seed -- --reset against a disposable dev-vault copy with an edited seed note and a marker under .obsidian/."
    expected: "Plain re-seed keeps the edited note; --reset restores it; the .obsidian marker survives both; no file outside dev-vault/ changes."
    why_human: "Not rerun (would mutate the vault); no automated seed test is wired. Historical UAT36/37 passed on the original code; scripts/seed-dev-vault.mjs is unchanged since Phase 1."
human_verification:
  - test: "UAT18 already-stopped race (skipped in 01-UAT)."
    expected: "Stop a timer in TaskNotes and immediately click its pane Stop: no failure Notice, pane refreshes."
    why_human: "Native timing window never exercised; controller test 'a no active session race is silent and still refreshes' passes against fake TaskNotes only."
  - test: "UAT19 native Stop failure and recovery (skipped in 01-UAT)."
    expected: "One Stop-failed Notice including the reason; button returns to 'Stop timer' and works later."
    why_human: "Controller tests cover Notice text and refresh; Obsidian Notice rendering and native button recovery not observed."
  - test: "UAT20 archived running timer is an ordinary card (skipped in 01-UAT)."
    expected: "Archived running task keeps a normal card; pane stops nothing; one-click Stop works."
    why_human: "03-UAT test 6 only covers an archived PAUSED task; the running-archived case with installed TaskNotes was not observed."
  - test: "UAT21 completion from TaskNotes UI with auto-stop (skipped in 01-UAT)."
    expected: "TaskNotes stops the timer; pane follows within about 1 s with no extra Notice."
    why_human: "02-UAT test 3 covers the pane's own Complete action, not completion from TaskNotes' UI."
  - test: "UAT22 hand-edited done status does not stop timing (skipped in 01-UAT)."
    expected: "Timer keeps running and the card shows normally; pane adds no stop."
    why_human: "D-05 no-automatic-stop tests pass with fakes; native metadata-cache path not observed."
  - test: "Seed containment behavior (see behavior_unverified_items)."
    expected: "Non-destructive seed, bounded reset, nothing under .obsidian written."
    why_human: "No wired test; not rerun to avoid vault mutation."
  - test: "Two test-tier prohibitions without wired enforcement (seed boundary; no direct task writes)."
    expected: "A negative test enforces each, or the user accepts source inspection as sufficient."
    why_human: "Source inspection is not a passing enforcement test; fail-closed per verifier rules."
  - test: "Historical: package approval preceded the original install (01-01 truth 1)."
    expected: "User confirms the six [SUS] pins were approved before npm install ran."
    why_human: "Past command order cannot be reconstructed from current code."
---

# Phase 1: Live Timer Pane Verification Report

**Phase Goal:** As a TaskNotes user, I want to see and stop my running timer from a sidebar pane, so that I always know what I am timing and for how long.
**Verified:** 2026-10-16T19:30:00Z
**Status:** human_needed
**Re-verification:** Yes. The previous report (5fb3f94) was stale because Phases 2 and 3 changed covered source files. Every Phase 1 truth was checked again against the current code, not the Phase 1-era code.
**Mode:** mvp. The user-story validator returned `valid=true`.

## User Flow Coverage

| Step | Expected | Evidence in current code | Status |
|---|---|---|---|
| Open pane | Ribbon/command opens the pane in the right sidebar, or reveals the existing one | `src/main.ts:128-129` addRibbonIcon("timer","Open TaskNotes timer") and addCommand("open-timer-pane"); `activateView` (lines 153-161, unchanged since Phase 1) reveals `getLeavesOfType(...)[0]` and calls `ensureSideLeaf(...,"right")` only when no leaf exists. Prior user UAT3/4 passed; 03-UAT test 1 (current build) opens the pane after a cold start | VERIFIED |
| Return after restart | Same leaf restored, shows state immediately | `registerView` called synchronously in onload (line 104), before loadData; main.test "registers view synchronously before loading settings". `onOpen` probes and renders at once. UAT5 passed; 03-UAT tests 1 and 5 restart the current build | VERIFIED |
| See what is timed and for how long | Title (opens note), H:MM:SS session ticking every second, total including the running session | bridge `time.active()` → TimerStore → `deriveSnapshot` → TimerPaneView `writeTimes` (`timerSessionMs`, `totalMs`, `formatHms`) on a 1 s `registerInterval`. Title: `openTask` → `openLinkText`, Enter/Space and mod-click handled. readPath tests pass. UAT6, 8, 9 passed | VERIFIED (UAT7 minor discrepancy accepted, see below) |
| Stop | One click closes that entry; pane and status bar agree | Stop button → `stopTask` → `controller.stop` → `queue.run(gateway.stop(taskPath, ctx))` → `api.time.stop` → `store.refreshNow()`. Controller "Stop (CTRL-01)" tests pass. UAT17 passed; 03-UAT tests 8 and 10 exercise Stop/Stop all on the current build | VERIFIED |
| Outcome: always know what is timed and for how long | Live data stays in sync | Sync, reconnect and wake paths below; 03-UAT test 4 (start elsewhere is reflected) and test 7 (rename) on the current build | VERIFIED |

UAT7 is still an accepted minor discrepancy, not a pass: sometimes Total gains a second before the session clock does. The user asked for no fix. The likely cause is that each value is floored independently (`formatHms(totalMs)` vs `formatHms(timerSessionMs)`) when closed entries carry sub-second remainders. This is noted for information only and does not count as a gap.

## Goal Achievement

### Observable Truths

| # | Contract / truth | Status | Evidence (current code) |
|---|---|---|---|
| 1 | SC1: ribbon/command; reveal, no duplicate; restored after restart | VERIFIED | See User Flow. activateView is byte-unchanged since Phase 1. Restart restore is covered on the current build by 03-UAT 1 and 5 |
| 2 | SC2: title opens note; H:MM:SS session every second; total incl. running; most recently started shown first | VERIFIED (UAT7 accepted limitation) | `formatHms` floors (readPath "formatHms", "sessionMs" tests); `totalMs` sums closed + open entries; `compareTimers` puts the latest `sortMs` first with ties by path (readPath "selectPrimary", "identity invariant"). Phase 3 changed the sort key to `sessionStartedAt`, which equals `startTime` for a never-paused timer, so Phase 1 ordering holds. Display is now one card per timer, newest first (Phase 2 CONTEXT supersession) |
| 3 | SC3: one-click Stop reflected by pane and TaskNotes | VERIFIED | `TimerController.stop` (lines 375-406) is unchanged in substance: one `gateway.stop` with `{source:"tasknotes-timer-pane", reason:"user stop", correlationId}`, then refresh. Tests "one open entry: exactly one api.time.stop…", "two open entries: stopping the primary leaves the other…" pass. The `busy`/`completing` guards added in Phase 2/3 return "busy" only while another pane action is in flight |
| 4 | SC4: external starts/stops, hand-edits, Sync, rename/delete reach the pane in about 1 s | VERIFIED | Bridge subscribes `task.updated`, `task.deleted`, `time.started`, `time.stopped`, `cache.changed`, `settings.changed` → `emitData` → store 200 ms debounce. main.ts vault `delete`/`rename` → `requestRefresh` (now also moves/removes pauses first; main.test covers order). 45 s `resync`. Store debounce/single-flight/signature tests pass. UAT10-14 passed; 03-UAT 4 and 7 on the current build |
| 5 | SC5: missing/disabled/old message; self-reconnect; correct after sleep/wake | VERIFIED | `renderMessage` copy unchanged; `isVersionOlder` vs `MIN_TASKNOTES_VERSION = "4.10.0"`; WeakSet `retired`, early 1 s probe, 5 s probe interval; bridge lifecycle and end-to-end reconnect tests pass. Tick recomputes from `Date.now()`; `detectWakeGap` plus visibility/focus handlers request a refresh. UAT15/16 passed |
| 6 | 01-01: approval before install | UNCERTAIN (WARNING) | Historical chronology. Cannot be reconstructed from code |
| 7 | 01-01: `npm run check` toolchain gate | VERIFIED | Orchestrator reports `npm run check` passed today. This verifier ran the suite once: 13 files, 361 tests passed |
| 8 | 01-01: deploy writes all four assets to the fixed dev target only | VERIFIED (upgraded) | `esbuild.config.mjs:16` hard-codes `DEV_DIR`; `process.argv[2]` selects only the mode, and no env var is read. Read-only check: `dev-vault/.obsidian/plugins/tasknotes-timer-pane/` holds `.hotreload`, `manifest.json` and `styles.css` (both byte-identical to the current sources) and a `main.js` containing Phase 3 symbols. 03-UAT records the 2026-10-16 deploy |
| 9 | 01-01/04: ignores, lockfile, zero runtime deps | VERIFIED | `git check-ignore -v` matches dev-vault/, main.js, node_modules/; `git ls-files dev-vault` is empty; package-lock.json is tracked; `dependencies` is `{}` |
| 10 | 01-01: type-only contract pinned by tsc | VERIFIED | contract.test.ts expectTypeOf groups; tsconfig includes tests; `npm run check` passed |
| 11 | 01-02: time/display edge cases, deterministic identity | VERIFIED | readPath tests: floors, future clamp, malformed dates, tie-break, archive ranked normally, identity invariant, basename fallback |
| 12 | 01-03: store debounce, single-flight, no stale publish, error retention, resync gating | VERIFIED | `TimerStore.refreshOnce` keeps the generation guard and adds a pause-revision re-read. The error path keeps `this.snapshot` (no idle flash) and logs only the message. Store tests "rejected active() keeps the previous snapshot…", "retired generation cannot publish…", "resync() while not ready makes no call" pass |
| 13 | 01-03: retired api never reattached; one early probe; watchdog; disposal | VERIFIED | bridge.test "lifecycle (SYNC-03)" group (unloading, new api with no duplicate handlers, disable/re-enable, dispose, watchdog once) passes on the current bridge |
| 14 | 01-05: serial contextual writes, benign race, failure Notice, no autonomous stops | VERIFIED at controller boundary | Single `WriteQueue` constructed once in main.ts and shared by all controller actions; WriteQueue order test; "no automatic stops (D-05)" tests pass. Phase 3 `reconcile` only edits the pause ledger and never calls `gateway.stop`. Native UAT18-22 remain skipped |
| 15 | 01-04: four seeds, non-destructive copy, bounded reset, no .obsidian writes | PRESENT_BEHAVIOR_UNVERIFIED (WARNING) | `scripts/seed-dev-vault.mjs` unchanged since Phase 1: COPYFILE_EXCL without --reset, .obsidian refusal, no delete. No wired test; historical UAT36/37 only |
| 16 | 01-04/02/05: README/checklist, state copy, layout, controls | VERIFIED with documented supersessions | README and checklist present. Message copy unchanged. Phase 2 header/cards/chips and Phase 3 Pause/Resume/Complete buttons are added beside Stop without removing Phase 1 controls |

**Score:** 14/16 verified, 1 present but behavior-unverified (seed), 1 historical uncertainty.

### Intentional Supersessions (still valid in current code)

- Phase 2 CONTEXT replaced the single primary card, `+N more running` and the Tracking row with one card per timer, newest first. `moreRunningLabel` and `othersTooltip` remain as tested helpers but are not rendered.
- 01-05 wording "only api.time.stop anywhere in src/" is superseded by authorized Runtime API writes: `time.start` (Phase 2 Start, Phase 3 Resume) and `tasks.complete` (Phase 2 D-14 Complete). Direct frontmatter or vault writes are still absent.
- 01-05 "no hiding of running timers" is superseded by the rewritten DISP-07 (Phase 3): only the exact Pomodoro-owned entry is hidden, and unreadable ownership hides nothing (store "Pomodoro-owned entry (DISP-07)" tests). Regular timers are never hidden.
- Paused cards (Phase 3) make the pane state "running". This is by design, and a paused-only pane is not idle.

## Required Artifacts and Key Links

`verify.artifacts` / `verify.key-links` were rerun against the current tree for every plan: 01-01 6/6, 3/3; 01-02 6/6, 5/5; 01-03 7/7, 4/4; 01-04 5/5, 2/2; 01-05 5/5, 4/4. In total, 29/29 artifacts and 18/18 links pass. The source review above confirms each link is called in production, not just present as matching text.

## Data-Flow Trace (Level 4)

| Rendered value | Source chain | Status |
|---|---|---|
| Card list / title | `app.plugins.getPlugin("tasknotes").api` → gated `time.active()` → `visibleEntries` (Pomodoro filter) → `deriveSnapshot` → `reconcileCards` | FLOWING |
| Session | `entry.startTime` → `segmentStartMs` (+ `accumulatedMs`, 0 for a never-paused timer) → `Date.now()` diff → `formatHms` | FLOWING |
| Total | `task.timeEntries` → `parseEntries` → `totalMs(entries, now)` | FLOWING |
| Availability message | bridge state → `derivePaneState` → `renderMessage` | FLOWING |
| Post-stop state | `api.time.stop` → `store.refreshNow()` → subscriber `render()` | FLOWING |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full regression suite (run once) | `npx vitest run --dir tests` | 13 files, 361 tests passed | PASS |
| Deployed assets match current sources | `cmp styles.css …/styles.css`; `cmp manifest.json …/manifest.json` | identical | PASS |
| Ignore/lockfile/deps | `git check-ignore -v …`; `git ls-files dev-vault`; package.json deps | ignored; empty; `{}` | PASS |
| User story format | `user-story.validate` | valid=true | PASS |

## Probe Execution

No phase-declared `scripts/*/tests/probe-*.sh` exists. Step 7c is not applicable.

## Requirements Coverage

| Requirement | Source plan | Status | Evidence |
|---|---|---|---|
| PANE-01 | 01-02 | SATISFIED | addRibbonIcon + activateView reveal/ensureSideLeaf right; UAT3/4 |
| PANE-02 | 01-02 | SATISFIED | addCommand "Open timer pane"; UAT3 |
| PANE-03 | 01-01, 01-02, 01-04 | SATISFIED | Synchronous registerView, stable id; UAT5; 03-UAT 1/5 |
| DISP-01 | 01-02 | SATISFIED | Title chip/link → openLinkText; keyboard; UAT6 |
| DISP-02 | 01-02 | SATISFIED | Wall-clock 1 s tick, formatHms floors; UAT7 accepted minor discrepancy |
| DISP-03 | 01-02 | SATISFIED | totalMs to the second including the open entry |
| DISP-05 | 01-02, 01-03 | SATISFIED | missing/incompatible/loading copy + version; bridge tests; UAT15 |
| DISP-06 | 01-02 | SATISFIED | Latest start first (card order); supersession documented |
| CTRL-01 | 01-05 | SATISFIED | Controller Stop tests; UAT17; 03-UAT 8/10 |
| SYNC-01 | 01-03 | SATISFIED | time/task events → debounce; UAT10-12; 03-UAT 4 |
| SYNC-02 | 01-03, 01-04 | SATISFIED | task.updated/cache.changed + vault events + 45 s resync; UAT13/14 |
| SYNC-03 | 01-03, 01-04 | SATISFIED | Retired-api lifecycle + probes; UAT15 |
| SYNC-04 | 01-03, 01-04 | SATISFIED | Wall-clock recompute, wake gap, visibility/focus; UAT16 |

All 13 IDs are claimed by plans and mapped to Phase 1 in REQUIREMENTS.md. No orphaned requirement. DISP-04 and DISP-07 are mapped to Phases 2 and 3.

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|---|---|---|---|
| src, tests, styles.css, scripts, esbuild.config.mjs | TBD/FIXME/XXX/TODO/HACK/placeholder scan | none found | — |
| `src/state/TimerController.ts` `stop()` | Stop is keyed by `taskPath` only; the captured `startTime` is not checked (open review finding WR-01, same-task replacement race) | WARNING (carried) | Rare: if the same task's entry is replaced between click and write, the new entry would be stopped. Still open in 01-REVIEW-DISPOSITION |
| 01-REVIEW-DISPOSITION.md | WR-02..04, IN-01..05 still `open` | INFO (carried) | Not re-adjudicated here |

## Human Verification Required

1. **UAT18 already-stopped race**: stop in TaskNotes, then immediately click the pane's Stop. Expected: no Notice, pane refreshes.
2. **UAT19 Stop failure/recovery**: in dev-vault, temporarily make `api.time.stop` reject. Expected: one Notice, button recovers, and a later Stop works.
3. **UAT20 archived running timer**: archive a running task. Expected: a normal card that stops with one click. (03-UAT 6 only covered a paused archived task.)
4. **UAT21 TaskNotes-UI completion with auto-stop**: expected pane follows in about 1 s with no Notice. (02-UAT 3 covered the pane's own Complete, not this.)
5. **UAT22 hand-edited done status**: expected timer keeps running and the pane adds no stop.
6. **Seed containment**: run seed/re-seed/--reset on a disposable vault, or accept historical UAT36/37 because the script is unchanged.
7. **Two test-tier prohibitions** (seed boundary; no direct task writes): add negative tests, or accept source-inspection evidence explicitly.
8. **Historical approval chronology** (01-01 truth 1): user confirmation only.

## Gaps Summary

No blocking gap. All five roadmap success criteria and all 13 requirements are supported by current code, a passing 361-test suite, and user desktop evidence. That evidence comes from 01-UAT, plus 03-UAT on the current build, which re-covers cold start, restart restore, start-elsewhere sync, rename, Stop and Stop all. Phases 2 and 3 caused no Phase 1 regression. The changes to TimerStore, TimerController, TimerPaneView and main.ts keep the Phase 1 read, stop, sync, reconnect and wake paths intact, and their own tests still pass. The status stays **human_needed** for three reasons: five native checks (UAT18-22) were only skipped and are not counted as passes; seed behavior and two test-tier prohibitions lack wired enforcement; and one historical chronology claim cannot be proven. Compared with the stale report, deploy behavior is upgraded to VERIFIED from read-only on-disk evidence.

---

_Verified: 2026-10-16T19:30:00Z_
_Verifier: Claude (gsd-verifier)_
