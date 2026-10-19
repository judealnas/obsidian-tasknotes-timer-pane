---
quick_id: 261019-h6t
status: complete
subsystem: release
tags: [brat, release, github-actions, docs]
key-files:
  created: [versions.json, version-bump.mjs, .npmrc, .github/workflows/release.yml, LICENSE]
  modified: [package.json, .gitignore, eslint.config.mts, manifest.json, README.md]
actuals:
  tasks: 2
  commits: 2
plan_head_before: 016b3084ad46c14da1f6d19fed6d1007fedbc547
plan_head_after: 5fc684eb86b3e79788cd862bee1d66e70eb34d71
completed: 2026-10-19
---

# Quick 261019-h6t: Prep plugin for BRAT distribution Summary

**Tag-driven GitHub release workflow (check, tag/manifest match, gh release with main.js/manifest.json/styles.css), npm version hook syncing manifest.json and versions.json, MIT license, and a README covering Pause/Resume, BRAT install and releasing.**

## Commits

- `2ef5d66` chore(release): add BRAT release plumbing
- `5fc684e` docs: refresh description and README for BRAT distribution

## Verification

- `npm run check` passed before each commit (build, tsc, ESLint at zero warnings, Vitest 13 files / 361 tests).
- `npm_package_version=0.1.0 node version-bump.mjs` left manifest.json byte-identical to HEAD and versions.json identical to the hand-written file.
- Version stays 0.1.0. No tag, push or `npm version` run.

## Deviations from Plan

**1. [Rule 3 - Blocking] ESLint config entry for version-bump.mjs**
- **Found during:** Task 1
- **Issue:** ESLint failed on `version-bump.mjs`: not in the TS project service, then `obsidianmd/no-nodejs-modules` and `no-undef` (`process`) warnings.
- **Fix:** Added `version-bump.mjs` to `allowDefaultProject` and a file-scoped block with `globals.node` and `obsidianmd/no-nodejs-modules` off (it is a build script, never bundled). The file stays linted.
- **Files modified:** eslint.config.mts
- **Commit:** 2ef5d66

## Notes

- README Pomodoro bullet describes the picker marker and start refusal rather than a resume refusal, since reconcile rule D-16 clears a pause when a Pomodoro takes the task.

## Self-Check: PASSED

- All created files exist; commits 2ef5d66 and 5fc684e are ancestors of HEAD.
