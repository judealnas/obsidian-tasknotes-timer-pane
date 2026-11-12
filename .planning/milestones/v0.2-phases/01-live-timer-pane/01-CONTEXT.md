# Phase 1: Live Timer Pane - Context

**Gathered:** 2026-10-13
**Status:** Ready for planning
**Revised:** 2026-10-13. User decision change: D-06..D-11 (archive auto-stop and the "Archived" label) are superseded. See "Archived-task timers" below.

<domain>
## Phase Boundary

The walking skeleton. Phase 1 delivers a right-sidebar `ItemView`, opened from a ribbon icon and a command and restored on restart. While a timer runs, the pane shows:

- the task title, which opens the note
- the live session time (H:MM:SS, ticking)
- the task's total tracked time, including the running session, to the second
- a one-click "Stop timer" button that stops only the displayed timer

When several timers run, the pane shows the most recently started one plus "+N more running". It stays in sync with changes from anywhere: TaskNotes UI, Sync, hand-edited YAML, and sleep/wake. It shows clear states when TaskNotes is missing, disabled, or too old, and reconnects by itself.

Phase 1 adds no automatic behavior of its own. Stopping a timer when its task is completed stays TaskNotes' job (D-05). That includes the user's archive flow, because the user archives by setting a status configured in TaskNotes as completed. A timer whose task has TaskNotes' archive flag is shown like any other timer. (An archive auto-stop was decided here first, as D-06..D-11. It was superseded on 2026-10-13.)

Requirements: PANE-01..03, DISP-01..03, DISP-05, DISP-06, CTRL-01, SYNC-01..04.

Not in this phase:
- "Start a task" button and picker, switch, and complete (Phase 2)
- pause and resume, and the Pomodoro label (Phase 3)

</domain>

<decisions>
## Implementation Decisions

### Dev vault & build loop
- **D-01:** Develop and test only in a **separate dev vault**, never the user's real vault. A bug in the stop path must not be able to damage real `timeEntries`.
- **D-02:** The dev vault lives **inside the repo as a git-ignored folder** (`dev-vault/`). It contains:
  - `.obsidian/plugins/tasknotes-timer-pane/`, the esbuild output target
  - a few seeded task notes: open tasks, one with existing closed `timeEntries` so totals are non-trivial, and one archived
  - short setup notes, for example a `dev-vault/README` or a section in the repo README

  The user installs TaskNotes and Hot Reload into it by hand, once. Commit the seed notes through a tracked template (for example `dev-vault-seed/` copied by a script) or by un-ignoring specific paths; the planner picks. Never commit `.obsidian/plugins/tasknotes/` or other third-party plugin binaries.
- **D-03:** Reload with the **pjeby/hot-reload** plugin (0.3.1) and a `.hotreload` marker file in the plugin output folder. `npm run dev` runs esbuild in watch mode and writes `main.js`, `manifest.json` and `styles.css` into the dev-vault plugin folder. Don't use Obsidian CLI `plugin:reload`.
- **D-04:** Test against the **latest TaskNotes only** (4.13.x). Don't install TaskNotes 4.10.0 by hand. Cover the missing and too-old states by disabling TaskNotes in the dev vault, and with unit tests that fake `apiVersion` and capabilities through the fake gateway.

### Archived-task timers (edge case, resolves the UI-SPEC "unresolved" row)
Verified in TaskNotes 4.13.8 source:
- `SettingsLifecycleService.handleAutoStopTimeTracking` auto-stops a tracker only when the status changes from not-completed to completed (or a recurring instance completes). The setting is `autoStopTimeTrackingOnComplete`, default `true`.
- `TaskService.toggleArchive` never touches time tracking. So archiving a task that isn't done leaves its timer running, and the status bar then hides it.

The user wants completion handling left to TaskNotes.

**Update 2026-10-13 (user decision):** The user archives a task by changing its status to an "archived" status that is configured in TaskNotes as a completed state, so TaskNotes' own completion auto-stop already stops the timer on archive (D-05). The user does not use TaskNotes' Archive action (the `archived` flag). The pane therefore adds no archive auto-stop and no "Archived" label. A timer whose task has the archive flag is shown like any other timer, under the normal primary rule (DISP-06), and counts toward "+N more running". This also settles the archived half of the UI-SPEC E2 row as "display like any other timer". D-06..D-11 below are kept as history only, are not planned, and carry the `[informational, superseded 2026-10-13]` tag.

- **D-05:** The pane does **not** add any auto-stop for completed or done tasks. That stays TaskNotes' job, through its own setting, even though TaskNotes' rule doesn't fire for hand-edited YAML or Sync (no `originalTask`). A running timer on a done task is shown normally.
#### Superseded decisions (2026-10-13, kept as history; not planned)
Rationale for all six: the user archives through a completed-type status, so TaskNotes' completion auto-stop covers it (D-05), and archive-flag timers are shown like any other timer under the normal primary rule (DISP-06).

- **D-06 [informational, superseded 2026-10-13]:** Follow TaskNotes' setting for archived timers:
  - **Setting on:** the plugin auto-stops any running timer whose task is archived (`TaskInfo.archived === true`).
  - **Setting off:** the plugin leaves archived timers running and shows them with a muted **"Archived"** label in the card's status row.

  Read the setting through the Runtime API only, never internals. Prefer `api.settings.snapshot().autoStopTimeTrackingOnComplete` (capability `settings.snapshot`) and fall back to `api.model.config().timeTracking.autoStopOnComplete` (capability `model.read`). Re-read on the lifecycle `settings.changed` event. **If neither capability exists, treat the setting as off:** label only, never auto-stop. — **Reversibility:** reversible
- **D-07 [informational, superseded 2026-10-13]:** Auto-stop runs **whenever the plugin sees an archived running timer, whether or not the pane is open**. That covers:
  - a live archive event (`task.updated`)
  - archived timers found on startup or bridge ready
  - archived timers found on any store refresh or safety resync

  So it lives at plugin or store level, not in the view.
- **D-08 [informational, superseded 2026-10-13]:** Auto-stop writes only through `api.time.stop(path, context)` with `context = { source: "tasknotes-timer-pane", reason: "auto-stop: task archived", correlationId }`. The end time is always "now", because `api.time.stop` has no stop-time parameter. Recording the archive time would mean writing `timeEntries` directly, which is forbidden. An entry may therefore include time after archiving, and that's accepted.
- **D-09 [informational, superseded 2026-10-13]:** Notification follows **TaskNotes' `autoStopTimeTrackingNotification` setting** (default off). Read it from the same source as D-06, either `settings.snapshot()` or `model.config().timeTracking.autoStopNotification`. When it's on, show a `Notice` that mirrors TaskNotes' wording, for example `Auto-stopped time tracking for: {title} (task archived)`. When it's off, stop silently. Auto-stop failures are always logged to the console. Whether a failure also shows a Notice is up to Claude, but avoid a Notice on every resync.
- **D-10 [informational, superseded 2026-10-13]:** Auto-stop must be safe against repeats and races:
  - Allow at most one stop in flight per `(taskPath, startTime)`.
  - Treat a "no active session" error as benign.
  - Use the same serialized write path as the manual Stop.
  - Never retry in a tight loop, since the store refreshes on its own echo events.
  - Unarchiving does nothing.

  If an archived timer would otherwise be the primary card, it may show briefly before the stop lands. That's acceptable; no special hiding is needed.
- **D-11 [informational, superseded 2026-10-13]:** When archived timers are shown (setting off), apply the normal primary rule: latest `startTime` wins, ties broken by path ascending (DISP-06). Archived timers count toward "+N more running" like any other timer.

### Verification depth
- **D-12:** Automated tests use Vitest and cover pure logic plus a fake bridge. No DOM or view tests, and no `obsidian-test-mocks` in Phase 1. Covered:
  - time math: elapsed, total in seconds including the open entry, H:MM:SS format and negative clamp
  - primary selection and tie-break, plus the "+N" count
  - store derivation and change detection by `(taskPath, startTime)`
  - bridge availability states, faked through a `TaskNotesGateway` interface
  - ~~auto-stop rules D-06..D-10: setting on, off, or missing capability; dedupe; benign error~~ (superseded 2026-10-13 along with D-06..D-11; the pane has no auto-stop code to test)
- **D-13:** In-Obsidian behavior is verified with a **written manual UAT checklist** run in the dev vault at the end of the phase. It covers:
  - ribbon and command open and reveal with no duplicate, and restart persistence
  - start and stop from the status bar and task cards
  - hand-edited YAML
  - TaskNotes disable, re-enable and update
  - sleep/wake accuracy (±1 s against the status bar)
  - several timers at once
  - ~~archiving a timed task with auto-stop on, then with it off~~ (superseded 2026-10-13 along with D-06..D-11; the checklist instead checks that an archive-flag timer is shown like any other timer, and that completion, including a completed-type "archived" status, is left to TaskNotes per D-05)
  - Stop failure and "no active session" race

  No Obsidian CLI smoke script.
- **D-14:** Every plan has a definition-of-done gate: `npm run build`, `tsc -noEmit`, `eslint` (including `eslint-plugin-obsidianmd` recommended) and `vitest run` must all pass before the plan counts as complete.

### Claude's Discretion
- How the dev-vault seed is tracked (template folder plus copy script, or selective un-ignore)
- ~~Whether an auto-stop failure shows a Notice, without spamming on resync~~ (superseded 2026-10-13 with D-06..D-11)
- ~~Exact Notice wording (sentence case, mirroring TaskNotes)~~ (superseded 2026-10-13: it covered the auto-stop Notice; the Stop-failed Notice copy is fixed by the UI-SPEC)
- ~~Where the "Archived" label sits in the status row, and its class name (`tntp-` prefix, Label role, `--text-muted`, no accent)~~ (superseded 2026-10-13: no label)
- Safety-resync interval (research suggests 30-60 s), event debounce (150-250 ms), probe interval (UI-SPEC says 5 s)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and contracts
- `.planning/ROADMAP.md` (Phase 1 section): goal, success criteria, and the walking-skeleton note (planner emits SKELETON.md)
- `.planning/REQUIREMENTS.md`: PANE-01..03, DISP-01..03, DISP-05, DISP-06, CTRL-01, SYNC-01..04
- `.planning/phases/01-live-timer-pane/01-UI-SPEC.md`: the **approved** UI contract (DOM structure, spacing, typography, copy, interaction, accessibility). The E2 "archived / Pomodoro as primary" row is resolved for archived timers as "display like any other timer" (2026-10-13; this replaces the earlier D-06/D-11 resolution). The Pomodoro label stays in Phase 3.
- `.planning/PROJECT.md`: constraints (Runtime API v1 only, writes only via `api.time.start`/`stop`, graceful degradation)

### Research
- `.planning/research/SUMMARY.md`: architecture summary (Bridge, Store, timeMath, Controller, View) and pitfalls
- `.planning/research/ARCHITECTURE.md`: bridge availability states, re-attach on API change, readiness timing (`layout.ready` fires once; `isReady()` and `ready()` differ, so verify on cold start)
- `.planning/research/PITFALLS.md`: several concurrent timers, missed external changes (events are hints; re-derive from `active()`), and duplicate `task-updated` events about 300 ms apart
- `.planning/research/STACK.md` and `.claude/CLAUDE.md`: pinned toolchain (obsidian 1.14.4, TS 6.0.3, esbuild 0.28.2, ESLint 9.39.5, eslint-plugin-obsidianmd 0.4.2, Vitest 5.0.4, Hot Reload 0.3.1), tsconfig rules, minAppVersion 1.12.2
- `.planning/research/FEATURES.md`: TS-1..TS-11 feature definitions

### TaskNotes source (upstream callumalpass/tasknotes @ `451679289d94`, v4.13.8)
- `src/api/runtime-api.ts`: the contract to vendor as trimmed types. Relevant here: `time.stop(path, context)` at about line 810 and the lifecycle `settings.changed` event. (`TaskNotesRuntimeModelApi.config()` at about line 547, `TaskNotesRuntimeSettingsApi.snapshot()` at about line 863 and the capabilities `model.read` and `settings.snapshot` were needed only by the superseded D-06/D-09. The pane reads no TaskNotes settings.)
- `src/api/TaskNotesAPI.ts` (around lines 720-1000), historical, for the superseded D-06/D-09 only: `model.config().timeTracking.{autoStopOnComplete, autoStopNotification}`. Its fallbacks (`?? false` / `?? true`) differ from the setting defaults (`true` / `false` in `src/settings/defaults.ts:331-332`).
- `src/services/SettingsLifecycleService.ts`: `handleAutoStopTimeTracking`, TaskNotes' completion-only auto-stop rule. It covers the user's archive flow (an "archived" status configured as completed), so the pane adds nothing (D-05).
- `src/services/TaskService.ts`: `toggleArchive` (about line 1374, no time-tracking side effect, so an archive-flag timer keeps running and the pane shows it like any other timer) and `stopTimeTracking` (about line 1651, per-path lock)
- `docs/features/time-management.md`: user-facing description of the auto-stop settings

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None. This is a greenfield repo: no `src/`, `package.json` or build config yet. Phase 1 scaffolds everything per the obsidian-sample-plugin conventions in `.claude/CLAUDE.md` and STACK.md.

### Established Patterns
- No code patterns yet. Design-level patterns are fixed by the UI-SPEC and research:
  - vanilla DOM built once in `onOpen` and updated in place
  - `tntp-` BEM classes
  - Obsidian CSS variables only
  - `registerInterval` / `registerEvent`
  - one `TaskNotesGateway`/Bridge seam that tests fake

### Integration Points
- `app.plugins.getPlugin("tasknotes").api` (Runtime API v1), gated on `apiVersion === 1` and `hasCapability(...)`
- The dev-vault plugin folder `dev-vault/.obsidian/plugins/tasknotes-timer-pane/` is the esbuild output target

</code_context>

<specifics>
## Specific Ideas

- The user prefers **leaving behavior to TaskNotes' built-in mechanisms** where they exist. The pane invents no toggles of its own and adds no auto-stop: TaskNotes' auto-stop setting handles completion (D-05).
- ~~Archived timers should not quietly keep running when TaskNotes' auto-stop is on. That's the reason for D-06/D-07.~~ Superseded 2026-10-13: the user archives through a completed-type status, which TaskNotes' auto-stop already covers. Archive-flag timers are shown like any other timer.

</specifics>

<deferred>
## Deferred Ideas

- **Upstream suggestion:** TaskNotes could apply its own auto-stop rule on archive as well as on completion. The pane no longer does any archive auto-stop (D-06..D-11 superseded 2026-10-13), so this only matters to users of TaskNotes' Archive action. Not filed; it's just a note.
- **Repo and release setup** (GitHub repo, first BRAT release, manifest author and license): not discussed. The planner applies sensible defaults from STACK.md, or it's handled when the release becomes relevant.
- **Deleted or unreadable task files with an open entry:** not discussed. The UI-SPEC basename fallback covers display; anything more belongs to the Phase 2+ hardening areas.

</deferred>

---

*Phase: 01-live-timer-pane*
*Context gathered: 2026-10-13*
