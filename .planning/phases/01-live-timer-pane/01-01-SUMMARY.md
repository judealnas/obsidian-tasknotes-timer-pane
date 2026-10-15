---
phase: 01-live-timer-pane
plan: 01
subsystem: infra
tags: [obsidian-plugin, walking-skeleton, scaffold, toolchain, dev-vault, esbuild, eslint, vitest, typescript]

requires: []
provides:
  - "Pinned dev toolchain (obsidian 1.14.4, esbuild 0.28.2 exact; TS ~6.0.3; ESLint 9 + obsidianmd 0.4.2; Vitest 5.0.4) with committed lockfile and zero runtime dependencies"
  - "package.json scripts dev, deploy, build, typecheck, lint, test, check (the D-14 gate)"
  - "esbuild.config.mjs with production, deploy and watch modes; DEV_DIR hard-coded to dev-vault/.obsidian/plugins/tasknotes-timer-pane; dev-vault-assets plugin"
  - "manifest.json: id tasknotes-timer-pane, name TaskNotes Timer Pane, 0.1.0, minAppVersion 1.12.2"
  - "src/main.ts: empty TaskNotesTimerPanePlugin extends Plugin"
  - "src/tasknotes/runtime-api.types.ts: vendored type-only TaskNotes Runtime API v1 contract"
  - "tests/contract.test.ts: ten expectTypeOf groups pinning the contract"
affects: [01-02, 01-03, 01-04, 01-05]

actuals:
  tokens: 3150      # chars/4 over hand-written files (12603 chars); 56536 including the generated package-lock.json
  tasks: 3          # Task 1 (checkpoint) resolved by the user; Tasks 2-3 executed here
  commits: 3
plan_head_before: 0abf911c9faa02c71be0fa7f7f0accf7f2ab0d96
plan_head_after: 62cf97d3937a85c87a0de488387de39467d5eaa6

tech-stack:
  added: [obsidian@1.14.4, typescript@6.0.3, esbuild@0.28.2, eslint@9.39.5, "@eslint/js@9.39.5", typescript-eslint@8.71.2, eslint-plugin-obsidianmd@0.4.2, globals@17.13.0, jiti@2.7.0, vitest@5.0.4, "@types/node@24.19.2"]
  patterns:
    - "Repo-local dev vault as the only build target (no env/CLI override)"
    - "Vendored type-only contract pinned by compile-time expectTypeOf tests run under tsc -noEmit"
    - "Type-only imports of obsidian in tested modules (Vitest cannot load the obsidian package)"

key-files:
  created:
    - package.json
    - package-lock.json
    - tsconfig.json
    - eslint.config.mts
    - esbuild.config.mjs
    - manifest.json
    - .gitignore
    - styles.css
    - src/main.ts
    - src/tasknotes/runtime-api.types.ts
    - tests/contract.test.ts
  modified: []

key-decisions:
  - "User approved the six [SUS] pins verbatim (reply \"approved\", 2026-10-14); install used exactly obsidian@1.14.4, eslint@9.39.5, typescript-eslint@8.71.2, globals@17.13.0, vitest@5.0.4, @types/node@24.19.2 plus the audit-approved pins"
  - "eslint.config.mts gains a files: [manifest.json] block (tseslint parser + obsidianmd/validate-manifest) because the recommended config only matches JS/TS files, so the manifest was otherwise never linted"
  - "TaskNotesApiErrorPayload.code is typed string, not a union, because the vendored quote of TaskNotes' error-code union is partial"
  - "events.on handler payload is typed unknown; the pane only re-derives from time.active() on task events"
  - "Phase 01 commits live on branch gsd/phase-01-live-timer-pane: the executor's pre-commit guard refuses to commit on master (protected/default branch)"

patterns-established:
  - "D-14 gate: npm run check = build (tsc -noEmit + production bundle) + lint (--max-warnings 0) + vitest run --dir tests"
  - "Contract drift is a build failure: change a vendored shape and tsc -noEmit fails in tests/contract.test.ts"

requirements-completed: [PANE-03]

coverage:
  - id: D1
    description: "Pinned toolchain installed from the user-approved pins; build and lint pass at zero warnings"
    requirement: "PANE-03"
    verification:
      - kind: other
        ref: "npm run build && npm run lint"
        status: pass
    human_judgment: false
  - id: D2
    description: "npm run deploy writes main.js, manifest.json, styles.css and .hotreload into dev-vault/.obsidian/plugins/tasknotes-timer-pane/ only; DEV_DIR is hard-coded with no process.env read"
    verification:
      - kind: other
        ref: "npm run deploy && test -f dev-vault/.obsidian/plugins/tasknotes-timer-pane/{main.js,manifest.json,styles.css,.hotreload} && test -f main.js"
        status: pass
      - kind: other
        ref: "grep -c 'DEV_DIR = \"dev-vault/.obsidian/plugins/tasknotes-timer-pane\"' esbuild.config.mjs (=1); grep -n process.env esbuild.config.mjs (none)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Vendored type-only TaskNotes Runtime API v1 contract pinned by ten type-level test groups; full D-14 gate green"
    verification:
      - kind: unit
        ref: "tests/contract.test.ts (10 tests)"
        status: pass
      - kind: other
        ref: "npm run check"
        status: pass
    human_judgment: false
  - id: D4
    description: "With dev-vault/ opened in Obsidian, the plugin is listed as TaskNotes Timer Pane 0.1.0 and enables with no console error (PANE-03 groundwork)"
    requirement: "PANE-03"
    verification: []
    human_judgment: true
    rationale: "Only the running Obsidian app loads community plugins from a vault; harvested into the end-of-phase UAT section 0 (plan 01-04, D-13)"

duration: 13min
completed: 2026-10-14
status: complete
---

# Phase 01 Plan 01: Scaffold, Toolchain and Vendored Contract Summary

**Pinned TS 6 / esbuild 0.28 / ESLint 9 + obsidianmd / Vitest 5 toolchain with a repo-local dev-vault deploy loop, an empty `TaskNotesTimerPanePlugin`, and a type-only TaskNotes Runtime API v1 contract pinned by ten compile-time `expectTypeOf` tests**

## Performance

- **Duration:** 13 min (this continuation; Task 1 was the earlier checkpoint)
- **Started:** 2026-10-15T01:52:51Z
- **Completed:** 2026-10-15T02:05:30Z
- **Tasks:** 3 (1 checkpoint resolved by the user, 2 executed)
- **Files modified:** 11 created

## Task 1: Package legitimacy checkpoint (resolved)

- **User reply:** "approved" (2026-10-14), to install exactly the pinned versions: obsidian@1.14.4, eslint@9.39.5, typescript-eslint@8.71.2, globals@17.13.0, vitest@5.0.4, @types/node@24.19.2, plus the audit-approved typescript@6.0.3, esbuild@0.28.2, @eslint/js@9.39.5, eslint-plugin-obsidianmd@0.4.2, jiti@2.7.0.
- **Replacement pins:** none.
- Before the reply, the orchestrator checked each of the six [SUS] pins on the npm registry (the version exists, and the repository is the expected upstream).
- No package-manager command ran before the reply: `node_modules/` and `package-lock.json` did not exist when the checkpoint was reached. That was confirmed again when this continuation started.
- `npm ls --depth=0` after the install shows exactly the approved versions (typescript resolved to 6.0.3).

## Accomplishments

- One `npm install -D` of the approved pins (348 packages). `obsidian` and `esbuild` were then set to exact versions in `package.json`. There are no runtime `dependencies`, and the lockfile is committed.
- The D-14 gate `npm run check` is green: `tsc -noEmit`, the production bundle, ESLint at `--max-warnings 0` across `src/main.ts`, `src/tasknotes/runtime-api.types.ts`, `tests/contract.test.ts` and `manifest.json`, and Vitest with 10 passing tests.
- `npm run deploy` writes `main.js`, `manifest.json`, `styles.css` and an empty `.hotreload` into `dev-vault/.obsidian/plugins/tasknotes-timer-pane/`. `DEV_DIR` is a constant and the config never reads `process.env`.
- The vendored contract is proven to catch drift. Making `TimeEntry.endTime` required, as a temporary test, made `tsc -noEmit` fail. Restoring it made it pass again.

## Task Commits

1. **Task 1: Package legitimacy check**: no commit (human checkpoint; the user replied "approved")
2. **Task 2: Toolchain end to end**: `33fad58` (feat)
3. **Task 3: Vendored contract, pinned by type-level tests**: `2e1c3bf` (test, RED), then `62cf97d` (feat, GREEN)

**Plan metadata:** recorded in the docs commit that follows this SUMMARY

## Files Created/Modified

- `package.json`: name, version 0.1.0, private, ESM, D-14 scripts, pinned devDependencies
- `package-lock.json`: generated lockfile, committed
- `tsconfig.json`: TS 6-clean config (ES2021, bundler resolution, strict, `types: []`, includes src and tests)
- `eslint.config.mts`: obsidianmd recommended config, sentence-case brands override, and a `manifest.json` block
- `esbuild.config.mjs`: production, deploy and watch modes, hard-coded `DEV_DIR`, and the `dev-vault-assets` plugin
- `manifest.json`: plugin identity (`tasknotes-timer-pane`, minAppVersion 1.12.2, isDesktopOnly false)
- `.gitignore`: node_modules/, main.js, dev-vault/, data.json, *.log, .DS_Store
- `styles.css`: header comment only
- `src/main.ts`: `export default class TaskNotesTimerPanePlugin extends Plugin {}`
- `src/tasknotes/runtime-api.types.ts`: type-only TaskNotes Runtime API v1 subset; the header records source commit 451679289d94
- `tests/contract.test.ts`: ten `expectTypeOf` test groups (31 assertion lines)

## Decisions Made

- **Lint fallbacks not needed.** The empty `Plugin` subclass passes obsidianmd recommended lint, so no member was added. No `tests/**` override was needed either, and no rule was relaxed for `src/`.
- **`expectTypeOf` fallback not needed.** Vitest 5.0.4 exports `expectTypeOf` (re-exported from `expect-type`), so the `Equal`/`Expect` substitution was not used.
- `TaskNotesApiErrorPayload.code` is typed `string`. The vendored error-code union is quoted only in part, and the plan 01-03 fake's `"operation_failed"` fits either way.
- `events.on` handlers receive `payload: unknown`, and `lifecycle.on` handlers receive `TaskNotesRuntimeLifecyclePayload`. Both methods are non-generic. A fake with a narrower or generic signature still satisfies them.
- **Tracer gate (Task 2).** This is not auto mode, and `human_verify_mode` is end-of-phase. The tracer's `<human-check>` is explicitly assigned to the end-of-phase UAT (plan 01-04 section 0, D-13), so the automated `<verify>` was re-run (green) and execution continued to Task 3 without a mid-flight checkpoint. The unrun in-Obsidian check is recorded in `.planning/WINDOWS.md` (entry 1, unrun-verify).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `manifest.json` was never linted, so `obsidianmd/validate-manifest` never ran**
- **Found during:** Task 2
- **Issue:** obsidianmd's recommended flat config matches only `**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}` (plus `package.json`). `eslint .` skipped `manifest.json`, and `npx eslint manifest.json` reported "File ignored because no matching configuration was supplied". The plan's guarantee that the manifest passes `obsidianmd/validate-manifest` was therefore not enforced by the gate.
- **Fix:** Added a `{ files: ["manifest.json"], languageOptions: { parser: tseslint.parser }, plugins: { obsidianmd }, rules: { "obsidianmd/validate-manifest": "error" } }` block to `eslint.config.mts`. The block adds a `typescript-eslint` import, a package that is already a pinned devDependency.
- **Verification:** `eslint .` now lists `manifest.json` with 0 problems. As a temporary test, a name containing "plugin" produced `error The 'name' property cannot contain 'plugin' obsidianmd/validate-manifest`. The manifest was then restored.
- **Committed in:** `33fad58`

**2. [Rule 3 - Blocking] Committed on branch `gsd/phase-01-live-timer-pane` rather than `master`**
- **Found during:** Task 2, at the first commit
- **Issue:** The executor's mandatory pre-commit HEAD assertion treats `master` as protected (`git.base-branch --is-protected master` returned `true`) and refuses to commit there. It also forbids self-recovery with `update-ref`.
- **Fix:** Before the first commit, created `gsd/phase-01-live-timer-pane` from `master` at `0abf911` (the `git.phase_branch_template`). `master` is untouched and still at `0abf911`. The uncommitted `.planning/STATE.md` change and the untracked `.planning/milestone.lock` and `.planning/state.json` moved with the working tree. They were not committed by the task commits.
- **Impact:** Later plans in this phase continue on this branch. Merge it into `master` when the phase is accepted, or set `git.allow_default_branch_commits: true` if commits directly on `master` are wanted.

**3. [Verification wording] The Task 3 verify expects "contract.test.ts" in the default Vitest output**
- **Found during:** Task 3
- **Issue:** In a non-TTY shell, Vitest 5's default reporter prints only the totals ("Test Files 1 passed (1) / Tests 10 passed (10)"), not file names.
- **Fix:** No code change. `npx vitest run --dir tests contract --reporter=verbose` lists all ten `tests/contract.test.ts > …` cases as passing. The `test` script is unchanged, as the plan's contract requires.

---

**Total deviations:** 3 (1 missing-critical, 1 blocking, 1 verification wording)
**Impact on plan:** The lint gate now covers what the plan says it covers. The branch change affects where commits live, not their content. No scope creep.

## Issues Encountered

- `npm audit` reports 3 moderate advisories in `moment`, which comes in through `eslint-plugin-obsidianmd`'s own nested `obsidian` dependency. It is used at lint time only and none of it is bundled. This is out of scope and logged in `deferred-items.md`. `npm audit fix --force` would downgrade obsidianmd to 0.1.8, so it was not run.
- npm prints `deprecated eslint@9.39.5`. RESEARCH.md expected this, because ESLint 10 is incompatible with obsidianmd's transitive dependencies.

## Known Stubs

- `src/main.ts`: `TaskNotesTimerPanePlugin` has an empty body. This is intentional per the plan's interfaces. Plan 01-02 adds `onload()`, the view, the ribbon icon, the command and the TaskNotes probe.
- `styles.css`: header comment only. This is intentional, and plan 01-02 adds the rules.

## User Setup Required

None. The in-Obsidian check (open `dev-vault/`, turn off Restricted mode, enable "TaskNotes Timer Pane") runs at the end-of-phase UAT (plan 01-04).

## Next Phase Readiness

- Plan 01-02 can build the read path against `src/tasknotes/runtime-api.types.ts` and the D-14 gate without touching the toolchain files.
- Phase work is on branch `gsd/phase-01-live-timer-pane`, not `master`.

---
*Phase: 01-live-timer-pane*
*Completed: 2026-10-14*

## Self-Check: PASSED

- All 11 key files exist on disk.
- Commits `33fad58`, `2e1c3bf` and `62cf97d` are ancestors of HEAD, and `check evaluation-scope --plan 01-01 --commits-only` resolves all three.
- Task 2 acceptance criteria: AC1 to AC7 PASS. Task 3 acceptance criteria: AC1 (31 lines ≥ 10), AC2, AC3 (0), AC4 (none), AC5 (8) and AC6 (`npm run check` exits 0) PASS.
- Plan verification: `npm run check` exits 0, and `npm run deploy` fills the dev-vault plugin folder.
