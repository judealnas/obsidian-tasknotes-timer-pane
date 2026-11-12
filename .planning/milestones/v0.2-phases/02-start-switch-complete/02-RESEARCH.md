# Phase 2: Start, Switch & Complete - Research

**Researched:** 2026-10-15
**Domain:** Obsidian companion-plugin controls over TaskNotes Runtime API v1
**Confidence:** MEDIUM overall; pinned implementation inspected, live integration still requires dev-vault verification.

<user_constraints>
## User Constraints (from CONTEXT.md)

The following decision and deferred blocks are copied verbatim. [VERIFIED: 02-CONTEXT.md, decisions and deferred blocks]

<!-- DATA_R7p4w9Qz_START -->
## Implementation Decisions

### Header and Stop all
- **D-01:** A **header row above the column of cards** holds two buttons, **Start task** and **Stop all**. There is no per-card switch and no switch action at all.
- **D-02:** The header is **always shown**, in every pane state (running, idle, loading, missing, incompatible). Both buttons are **disabled until TaskNotes is ready**. In the missing, loading and incompatible states the existing message stays below the header.
- **D-03:** **Stop all is one click with no confirmation**, the same as the per-card Stop. It stops every running timer **except one owned by an active Pomodoro session**, which keeps running. The Pomodoro entry belongs to Pomodoro, and the pane must not orphan it (PROJECT.md).
- **D-04:** Stop all is **disabled, not hidden**, when it would do nothing: no timers, or only a Pomodoro-owned one. Add a tooltip explaining why. The header layout stays fixed.
- **D-05:** Stop all writes **through the existing serial WriteQueue**, one `api.time.stop(path, context)` per timer, in sequence. It never runs stops in parallel (TaskNotes locks per path, not across paths).

### Start task picker
- **D-06:** Start task opens a **task selector modal modelled on TaskNotes' Pomodoro selector**. The Runtime API exposes no selector (`ui` has only `taskMenu`), so build it with Obsidian's public `SuggestModal`/`FuzzySuggestModal`. Never call TaskNotes internals.
- **D-07:** **Which tasks:** the same set as TaskNotes. All tasks **except archive-flag ones** (`TaskInfo.archived`), and **completed tasks included but sorted last**. Tasks already being timed are **not** filtered out.
- **D-08:** **Order and search copy TaskNotes' Pomodoro selector rules** (4.13.8 bundle, `getFilteredTasks`):
  - **Completed last:** completed tasks always sort after open ones.
  - **With a query:** best match first. TaskNotes ranks by match quality: exact, then prefix, then word-prefix, then substring. Ties are broken by title.
  - **Without a query:** due date ascending (tasks with a due date before those without), then priority high, normal, low, then title.
  - **Fields searched:** title, due, priority (only when not "normal"), contexts, projects, and tags.

  Use Runtime API task fields (`api.tasks.list` / `api.query.tasks`, `api.catalog.statuses()` to know which statuses are completed), never a hard-coded "done".
- **D-09:** **Each picker row shows the TaskNotes chip**, using the same `[[path]]` + `MarkdownRenderer` approach as the card titles (quick task 261014-whq), with the due date as muted text. This is the closest match to TaskNotes' task-card rows that the public API allows. If no chip renders, show a plain title.
- **D-10:** Picking a task **starts it alongside running timers** through `api.time.start(path, {}, context)` on the WriteQueue. No other timer is stopped.
- **D-11:** Picking a task that is **already being timed** shows a Notice, roughly "{title} is already being timed.", and makes **no write**.

### Complete from the pane
- **D-12:** Complete is available **in two places**: a **[Complete] button next to Stop** in each card's action row (`[Stop] [Complete]`), and the **chip's existing right-click TaskNotes menu**. The menu needs no new work.
- **D-13:** A **plugin setting** chooses which status Complete sets. It's a dropdown of TaskNotes' **completed-type statuses, read live from `api.catalog.statuses()`**, plus a default entry **"Same as TaskNotes"**. That entry means the first completed status, which is what TaskNotes' own toggle uses. If the saved status no longer exists, for example because it was renamed in TaskNotes, fall back to "Same as TaskNotes". This is the plugin's first setting, so it adds a settings tab.
- **D-14:** **The pane always stops the timer on Complete.** It sets the status, then stops the timer if it's still open. A "no active session" error is benign: TaskNotes' auto-stop may have stopped it already. This is a **deliberate exception** to "leave completion auto-stop to TaskNotes" (Phase 1 D-05). CTRL-07 must hold even when TaskNotes' `autoStopTimeTrackingOnComplete` setting is off. The status write and the stop go through the WriteQueue as one serialized action.

### Idle state
- **D-15:** Idle is the **header + the existing message** ("No task is being timed" plus body text). There's no separate big button: the header's Start task covers DISP-04's "Start a task" button. The body text should point at the Start task button instead of "start time tracking in TaskNotes".

### Claude's Discretion
- **Busy-state scope (CTRL-09):** follow the existing Stop pattern (per-target busy label and disabled button). Claude decides whether Stop all and Start disable just their own button or the whole header and cards while the action runs.
- **Failure Notices:** wording and whether a partial Stop-all failure reports each task or a summary. Follow the existing `stopFailedNotice` style (sentence case).
- **Order of writes in Complete:** status then stop, or stop then status. Pick whichever avoids racing TaskNotes' own auto-stop and keeps tracked time correct.
- **Detecting a Pomodoro-owned timer** for D-03 and D-04: research which Runtime API signal identifies it (`pomodoro.read` capability and state). If it can't be detected reliably, say so in the plan rather than guess.
- Header button icons, labels and placement details, within the Phase 1 UI-SPEC style (Obsidian CSS variables, `tntp-` classes, no inline styles).
- Picker placeholder text, empty-state text, and the modal title.
<!-- DATA_R7p4w9Qz_END -->

<!-- DATA_U8n2e5Vt_START -->
## Deferred Ideas

- **Switch ("time only this")**: removed from v1 by user decision. Stop all followed by Start task covers it in two clicks. Revisit only if the user asks.
- **"Create new task" from the picker**: TaskNotes has a selector-with-create variant, but its Pomodoro selector doesn't use it. Not discussed. That would be a new capability.
<!-- DATA_U8n2e5Vt_END -->
</user_constraints>

<phase_requirements>
## Phase Requirements

<!-- DATA_H3s6b2Lm_START -->
- [ ] **DISP-04**: When nothing is being timed, user sees an idle state with a "Start a task" button.
- [ ] **CTRL-05**: User can start timing any task from a fuzzy task picker, opened from the pane header. The task starts alongside any running timers.
- [ ] **CTRL-06**: User can stop every running timer, except one owned by an active Pomodoro, with one click from the pane header ("Stop all"). *(Rewritten 2026-10-15: switching was removed; see Phase 2 CONTEXT.)*
- [ ] **CTRL-07**: User can mark the active task complete from the pane, which also stops its timer.
- [ ] **CTRL-09**: Controls are disabled while an action is in progress, and a failed action shows a notice explaining what happened.
<!-- DATA_H3s6b2Lm_END -->

[VERIFIED: .planning/REQUIREMENTS.md:21-36]

| ID | Research support |
|---|---|
| DISP-04 | Persistent header above idle message; keep it outside cards visibility rules. |
| CTRL-05 | Public task listing, public SuggestModal, independent start through shared queue. |
| CTRL-06 | Exact Pomodoro ownership token, sequential stop batch, fail closed when ownership cannot be read. |
| CTRL-07 | Live completed-status catalog, explicit completion status followed by stop, benign double-stop race. |
| CTRL-09 | Plugin-scoped action busy state, finally cleanup, Notice plus authoritative refresh. |
</phase_requirements>

## Summary

Extend the existing gateway → controller → shared WriteQueue → Runtime API boundary. Keep TaskNotes authoritative and refresh after every action. The queue survives rejection; the existing controller already treats a benign stop race silently. [VERIFIED: src/state/WriteQueue.ts:7-22; src/state/TimerController.ts:42-70]

**Primary recommendation:** Plan a working Start task slice first, then Pomodoro-safe Stop all, then Complete and its setting. This decomposition is proposed; it adds no locked scope.

**Source correction:** The installed selector omits tags, ranks by field as well as match quality, and applies query rank before completion. D-08 explicitly requires tags and completed-always-last. Preserve those user decisions and document the deviations. [VERIFIED: dev-vault/.obsidian/plugins/tasknotes/main.js:424, Nce/k2/getFilteredTasks; 02-CONTEXT.md, D-08]

## Architectural Responsibility Map

Recommended responsibilities follow the existing boundaries. [VERIFIED: src/main.ts:23-43; src/tasknotes/TaskNotesBridge.ts:42-58]

| Capability | Primary tier | Secondary tier | Rationale |
|---|---|---|---|
| Header, picker, settings dropdown | Obsidian UI | Pure selector/status helpers | Views use public host UI, never the TaskNotes object. |
| Start, Stop all, Complete | Plugin controller | Shared WriteQueue | One action boundary across panes and paths. |
| Capabilities, subscriptions, API calls | TaskNotesBridge | TaskNotes Runtime API | Isolates unavailable capabilities and API replacement. |
| Timer and ownership snapshots | Plugin state | TaskNotes read APIs | UI uses current observations, not guessed ownership. |
| Timer/status persistence | TaskNotes service | Vault storage | No direct frontmatter writes. |
| Completion preference | Plugin settings | Obsidian persistence | Companion preference, not a TaskNotes setting. |

Recommended data flow: user action → queued controller → current prerequisite reads → bridge public API write → error classification → authoritative store refresh → in-place view update. This extends the existing Stop flow. [VERIFIED: src/state/TimerController.ts:42-70]

## Project Constraints (from AGENTS.md)

No root AGENTS.md was present when checked. Session-supplied AGENTS instructions require clear, efficient language without ambiguous jargon; links for research papers, preferring peer-reviewed sources before arXiv; numbered suggested next prompts. This phase requires no research paper. [VERIFIED: directory read this session; user-provided AGENTS.md instructions]

Honor Runtime API v1 only, graceful degradation, isolated dev-vault testing, public Obsidian APIs, existing CSS conventions, and no switching. [VERIFIED: .planning/PROJECT.md, Constraints; 01-CONTEXT.md, D-01/D-04/D-14; 02-CONTEXT.md, D-01/D-06; styles.css:1-13]

## Standard Stack

Retain the installed/locked stack. No new install or upgrade is recommended; these are repository pins, not registry latest or publication-date claims. [VERIFIED: package.json:18-30; package-lock.json package entries read this session]

| Component | Verbatim repository version | Use |
|---|---|---|
| Obsidian typings | "obsidian": "1.14.4" | SuggestModal, MarkdownRenderer, Component, PluginSettingTab, Setting. |
| TypeScript | "typescript": "~6.0.3"; lock resolves 6.0.3 | Trimmed contracts and helpers. |
| esbuild | "esbuild": "0.28.2" | Existing build/deploy. |
| ESLint | "eslint": "^9.39.5"; lock resolves 9.39.5 | Zero-warning gate. |
| Host rules | "eslint-plugin-obsidianmd": "^0.4.2"; lock resolves 0.4.2 | Obsidian conventions. |
| Vitest | "vitest": "^5.0.4"; lock resolves 5.0.4 | Existing Node-only logic/fake tests. |
| TaskNotes | "version": "4.13.8" | Installed reference. [VERIFIED: dev-vault/.obsidian/plugins/tasknotes/manifest.json:4] |

**Package Legitimacy Audit:** Not applicable: zero external package installs. Do not add a fuzzy search library, UI framework, DOM mock dependency, or upstream source dependency. Current registry versions/publish dates were not queried because no install/upgrade is proposed.

## Public API and Capability Gating

The tagged official API exposes task listing/completion, time start, catalog statuses and Pomodoro status. Its installed implementation supplies the same surfaces. [CITED: https://raw.githubusercontent.com/callumalpass/tasknotes/4.13.8/src/api/runtime-api.ts, lines 606-607, 671-696, 768-796] [VERIFIED: dev-vault/.obsidian/plugins/tasknotes/main.js:3458]

New capability values read verbatim from the installed capability array: "tasks.read", "tasks.write", "catalog.read", "pomodoro.read", "pomodoro.events". Existing required values are exactly ["time.read", "time.write", "tasks.events", "lifecycle.events"], and optional menu is "ui.task-menu". [VERIFIED: dev-vault/.obsidian/plugins/tasknotes/main.js:3458, Xbe array; src/tasknotes/TaskNotesBridge.ts:18-20]

Recommended per-action gates:

| Feature | Capabilities | Failure policy |
|---|---|---|
| Start picker | tasks.read + catalog.read + time.write | Disable with explanatory tooltip; retain display/Stop. |
| Stop all | time.read + time.write + pomodoro.read | Disable if unavailable; halt remaining batch on failed ownership read. |
| Complete | tasks.write + catalog.read + time.write | Disable only Complete if unavailable. |
| Completion setting | catalog.read | Preserve preference while unavailable; explain live options cannot load. |
| Pomodoro event hints | pomodoro.events | Optional; every batch still reads current status. |

These are proposed degradation policies. Do not add every new capability to global REQUIRED_CAPABILITIES and unnecessarily remove working display/Stop. Check capability and callable method shape, following the existing menu method. [VERIFIED: src/tasknotes/TaskNotesBridge.ts:201-218, 255-263]

Use tasks.list without query and filter/sort locally. The installed list implementation gets all tasks when no query is supplied; this avoids query limits/defaults. [VERIFIED: dev-vault/.obsidian/plugins/tasknotes/main.js:3458, listTasks] Extend the trimmed contracts and contract tests, never import upstream implementation source. [VERIFIED: src/tasknotes/runtime-api.types.ts:1-7; tests/contract.test.ts:1-17]

## Architecture Patterns

### Start is an independent action

Inside the shared queued callback, read active entries. An already-running path produces D-11's Notice and zero start writes. Otherwise call public time.start with empty options and context; never stop another task. Rechecking after queue admission prevents stale rapid selections from issuing duplicate writes. [VERIFIED: 02-CONTEXT.md, D-10/D-11; src/state/WriteQueue.ts:15-21]

TaskNotes rejects an already-active same-task start. An external actor can still win between read and write: classify that race as already running, refresh, and never compensate by stopping it. Different task paths can run concurrently. [VERIFIED: dev-vault/.obsidian/plugins/tasknotes/main.js:587, startTimeTracking; 3458, startTime/getActiveTimeEntries]

### Exact Pomodoro ownership

The public session carries the owned task entry's start timestamp. [CITED: https://raw.githubusercontent.com/callumalpass/tasknotes/4.13.8/src/types.ts#L592-L609] The installed service clears its ownership token, starts tracking, then saves the opened entry's timestamp; if a regular timer pre-existed, the start rejects and ownership is not acquired. [VERIFIED: dev-vault/.obsidian/plugins/tasknotes/main.js:3458, startOwnedTimeTracking/assignTaskToCurrentSession]

Verbatim bundle evidence:
<!-- DATA_P3r7m9Vc_START -->
- e.timeTrackingStartTime=void 0
- e.timeTrackingStartTime=(i=(a=r==null?void 0:r.timeEntries)==null?void 0:a.find(s=>!s.endTime))==null?void 0:i.startTime
- this.copyPomodoroState(this.plugin.pomodoroService.getState())
- copyPomodoroState(e){return JSON.parse(JSON.stringify(e))}
<!-- DATA_P3r7m9Vc_END -->
[VERIFIED: dev-vault/.obsidian/plugins/tasknotes/main.js:3458]

Recommended predicate: state is running; current session is work and neither completed nor interrupted; session task path matches the active entry path; nonempty ownership token equals entry start timestamp. Do not substitute Pomodoro session start time. Resume opens another tracked entry. The bundle checks e.type==="work" and passes e.timeTrackingStartTime as its conditional stop timestamp. [VERIFIED: dev-vault/.obsidian/plugins/tasknotes/main.js:3458, completePomodoro/pausePomodoro/stopOwnedTimeTracking]

Recommended Stop-all algorithm:
1. Enter one queue callback and capture a finite current target set; deduplicate by path.
2. Iterate sequentially. Before each stop re-read current active entries and Pomodoro state.
3. Skip vanished/replaced target entries and the currently owned entry.
4. Continue after ordinary per-target failures and report a summary; ownership-read failure halts all further writes.
5. Refresh authoritative state in finally; do not call public controller.stop from inside this batch if stop queues again.

These are proposed safety policies. A batch should not chase timers started externally after its target snapshot.

**API limitation:** Public time.stop accepts a path and context, without expected-start-time or conditional ownership checking. The private Pomodoro stop has an expected timestamp but is forbidden to the pane. Thus check-to-write races against other actors cannot be made atomic. Re-read immediately before each stop and state this narrow limitation explicitly; the pane queue only serializes pane writes. [CITED: https://raw.githubusercontent.com/callumalpass/tasknotes/4.13.8/src/api/runtime-api.ts#L768-L786] [VERIFIED: dev-vault/.obsidian/plugins/tasknotes/main.js:3458, stopTime/stopOwnedTimeTracking]

Keep ownership/read-availability in shared state and its notification signature. Existing store only notifies on changed timer snapshot signatures, so ownership-only changes otherwise leave header availability stale. [VERIFIED: src/state/TimerStore.ts:115-123] Invalidate using existing task/lifecycle hints plus public Pomodoro events where available. The bundle's public event values are "pomodoro.started", "pomodoro.completed", "pomodoro.interrupted"; do not invent public paused/resumed events. [VERIFIED: dev-vault/.obsidian/plugins/tasknotes/main.js:3458, ewe definitions]

### Complete resolves a live completed status

Preserve returned catalog order. Filter completed-type entries and validate the saved preference against them; renamed or no-longer-completed preference falls back to the first completed entry. Do not sort by display order: native toggle uses configured array order. Verbatim native evidence:
<!-- DATA_B6k2d8Qs_START -->
getCompletedStatuses(){return this.statuses.filter(e=>e.isCompleted).map(e=>e.value)}
this.plugin.statusManager.getCompletedStatuses()[0]||"done"
<!-- DATA_B6k2d8Qs_END -->
[VERIFIED: dev-vault/.obsidian/plugins/tasknotes/main.js:433, 587]

Prefer tasks.complete with an explicitly resolved status in its options. It validates completed-type status; setStatus delegates generic property update. Explicit status avoids complete's no-options early return for a task already completed with a different status. [VERIFIED: dev-vault/.obsidian/plugins/tasknotes/main.js:3458, completeTask/setTaskProperty]

Recommended queued action: resolve current valid status; complete task; then read whether the relevant timer remains open and stop it. A no-active-session rejection is benign. On status failure, do not stop. On successful status plus stop failure, report partial success honestly and refresh, never undo completion. If the catalog contains no completed status, disable Complete with an explanation rather than using a hard-coded fallback. [VERIFIED: 02-CONTEXT.md, D-13/D-14; src/model/errors.ts:11-14]

TaskNotes auto-stop listens asynchronously to task updates and acts only on transitions into completion or increased recurring completion count. It can already be stopping before the completion promise resolves; even a fresh active read cannot eliminate the benign double-stop race. [VERIFIED: dev-vault/.obsidian/plugins/tasknotes/main.js:3699, handleAutoStopTimeTracking]

D-14 deliberately requires Complete to stop the task even with auto-stop off, including an already-completed task with an open timer. Stop-all's Pomodoro exclusion does not silently override this explicit Complete decision. Add no Pomodoro stop/pause call or timer restart. [VERIFIED: 02-CONTEXT.md, D-12-D-14]

### SuggestModal with pure selection policy

Use SuggestModal to control filtering/order. FuzzySuggestModal's generic scorer does not implement this contract; upstream's selector also extends SuggestModal. [VERIFIED: node_modules/obsidian/obsidian.d.ts:4935-4952, 9571-9610; dev-vault/.obsidian/plugins/tasknotes/main.js:424]

Verbatim installed rank values:
<!-- DATA_M5q8t2Jw_START -->
t===e?0:t.startsWith(e)?1:t.split(/[^a-z0-9]+/).some(a=>a.startsWith(e))?2:3
10+r
20+i
30+o
40+s
{high:0,normal:1,low:2}
<!-- DATA_M5q8t2Jw_END -->
[VERIFIED: dev-vault/.obsidian/plugins/tasknotes/main.js:424, bM/k2/getFilteredTasks]

Those offsets prioritize title, contexts, projects, non-normal priority, then due. Unknown priority defaults to normal's rank. Upstream ranks first, then compares completion. Its matching predicate omits tags. Implement D-08's completed-last and tag-search choices instead. [VERIFIED: dev-vault/.obsidian/plugins/tasknotes/main.js:424; 02-CONTEXT.md, D-08]

**Remaining interpretation:** D-08 describes exact/prefix/word-prefix/substring without field weights. Recommended literal implementation: compute the best quality across all specified fields, then title, always partitioning completed last. This satisfies the explicit user wording and is deliberately not upstream field-weight parity. If the planner instead retains upstream field weighting and appends tags, record that choice clearly; do not leave tests to invent a rule. This is a proposed interpretation of an ambiguity, not a verified upstream rule.

Fetch the task set once per modal opening; search/filter locally on keystrokes. Do not scan on ticks. Keep already-running tasks selectable so D-11 produces the Notice. Extend the trimmed TaskInfo fields needed by production rather than retaining test-only Object.assign workarounds. [VERIFIED: 02-CONTEXT.md, D-07/D-08/D-11; src/tasknotes/runtime-api.types.ts:20-27]

### Picker chips require lifecycle and pointer ownership

Reuse safe taskWikilink and detached rendering with generation guards. Due text stays separate and muted. Titles never become Markdown source. [VERIFIED: src/model/taskLink.ts:15-32; src/ui/TimerPaneView.ts:277-306, 359-367]

**Modal is not Component:** declaration reads "export class Modal implements HistoryHandler"; SuggestModal extends Modal. Own explicit renderer Components and call load/unload; do not call this.addChild on Modal as though it were ItemView. Release previous row components on every suggestions refresh and close, and discard async results by modal/query generation. [VERIFIED: node_modules/obsidian/obsidian.d.ts:6540, 9571]

TaskNotes chips stop click propagation and invoke edit/status actions. Simply placing an interactive chip in a suggestion can swallow selection or mutate instead of starting. The quick-task evidence documents those handlers. [VERIFIED: .planning/quick/261014-whq-render-card-titles-as-wikilinks-so-taskn/261014-whq-PLAN.md, tasknotes_evidence items 2-3]

Recommended picker-specific policy: row selection starts the task, while chip output provides appearance; prevent chip controls from stealing left-click selection inside this modal. Scoped noninteractive chip content or capture handling can implement it. Preserve native chip ownership on timer cards. This interaction requires live mouse/keyboard UAT: Enter, arrows, Escape, chip body/status area/due whitespace, slow render, close/reopen.

### Shared busy state and settings

Use plugin-scoped action/busy state so every pane disables header and card write controls while a pane action runs. Keep per-target busy labels and batch label, release in finally after refresh, and prevent duplicate modal opens/selections. This proposed scope matches the roadmap's disabled-controls success criterion. [VERIFIED: .planning/ROADMAP.md, Phase 2 success criterion 4; src/main.ts:28-43; src/ui/TimerPaneView.ts:105-106]

Persist only the companion preference using loadData/saveData; validate unknown loaded data; use a default sentinel rather than a real status value; preserve preference during temporary TaskNotes absence. Register the view synchronously before awaited settings load, preserving restart restoration. Use traditional Setting/addDropdown, not settings-definition APIs marked since 1.13.0, because this project supports an earlier minimum host. [VERIFIED: node_modules/obsidian/obsidian.d.ts:7338-7347, 7431-7457; src/main.ts:42-43; .planning/PROJECT.md, Constraints]

## Don't Hand-Roll

| Problem | Use instead | Evidence |
|---|---|---|
| Keyboard suggestion UI | Public SuggestModal | Host declaration 9571-9610; bundle:424. |
| Timer/status persistence | Runtime API time.start/stop and tasks.complete | Bundle:3458. |
| Completed semantics | Live catalog isCompleted/value | Bundle:433. |
| Serialization | Existing WriteQueue | src/state/WriteQueue.ts:7-22. |
| Chip rendering | MarkdownRenderer + taskWikilink | src/model/taskLink.ts:15-32; view:277-306. |
| Benign stop race | Existing errors classifier | src/model/errors.ts:11-14. |

[VERIFIED: source files and ranges in table, opened this session]

## Common Pitfalls

| Risk | Required verification |
|---|---|
| Associated path mistaken for ownership | Pre-existing regular timer remains stoppable; exact owned entry is skipped. |
| Missing ownership read interpreted as no Pomodoro | Stop all disabled; read failure halts remaining writes. |
| Stale queued target stops replacement | Recheck target entry identity before each mutation. |
| Parallel batch or nested queue deadlock | Deferred fake writes prove no overlap; batch queues once. |
| Completed omitted / hard-coded done | Completed included last; custom statuses and renamed preference tested. |
| Auto-stop double stop | Auto-stop on/off, already-completed active task, benign no-active-session race tested. |
| Partial Complete reported as total failure | Status-success/stop-failed Notice reflects actual outcome. |
| Chip captures picker action | Real mouse/Enter starts exactly once without editing task. |
| Async modal outlives bridge/close | Close/unload during load causes no stale rendering/write. |
| Header disappears with cards | Visible in every state, disabled tooltips explain readiness/no-op. |

These are derived implementation risks and recommended checks grounded in the patterns above.

## Code Examples

Reusable existing queue, verbatim. [VERIFIED: src/state/WriteQueue.ts:15-21]
<!-- DATA_F9v3n7Ha_START -->
    run<T>(task: () => Promise<T>): Promise<T> {
        const result = this.tail.then(task);
        this.tail = result.then(
            () => undefined,
            () => undefined,
        );
        return result;
    }
<!-- DATA_F9v3n7Ha_END -->

Proposed control-flow skeleton (names are proposed, not upstream discrete values):

    queue.run:
      read current prerequisites
      execute or skip action
      for batches: await each write without recursively queueing
    finally:
      refresh authoritative state
      release shared busy state

## Verification Plan

Nyquist Validation Architecture is omitted because config explicitly contains "nyquist_validation": false. Definition-of-done remains "check": "npm run build && npm run lint && npm test". [VERIFIED: .planning/config.json, workflow; package.json:11-15]

Extend existing bridge/fake/contract/controller tests and add pure selector, ownership, and preference-resolution coverage. Cover capabilities/method absence, unload during reads, mutation context, serialization, duplicate-start zero write, partial batch failure, ownership changes, catalog edits, and completion races. The existing controller tracer already uses the real bridge/store/queue/controller over fake TaskNotes. [VERIFIED: tests/controller.test.ts:28-47; tests/contract.test.ts:21-115; tests/fakes/fakeGateway.ts:17-38]

Quick command: npm test -- controller bridge contract. Final gate: npm run check. Live manual dev-vault UAT is required for ownership, chip mouse/keyboard interaction, header all states, settings reload, TaskNotes disable/re-enable, and matching status-bar results. These interactions were not run live during research. [VERIFIED: package.json:11-15; 01-CONTEXT.md, D-01/D-12/D-13]

## Environment Availability

| Dependency | Observed | Fallback |
|---|---|---|
| Node | v24.13.1 | node --version executed this session. |
| npm | 11.8.0 | npm --version executed this session. |
| Installed toolchain | Available | Local package manifests/lock read; no install. |
| TaskNotes reference | Dev-vault bundle 4.13.8 | Manifest/main.js read; no live-app claim. |
| Host renderer and Pomodoro interaction | Not live-tested | End-of-phase dev-vault UAT. |
| Context7 tools/ctx7 CLI | Unavailable | No Context7 in inventory; where.exe ctx7 found none; used tagged source and local authoritative declarations. |
| Local subprocess network | Failed | Direct fetch/curl failed; web tool read official tagged API/types. |

The research-plan seam chose Context7 for TaskNotes and Obsidian questions. The CLI fallback was unavailable; direct source inspection supplied evidence. The confidence seam returned MEDIUM for context7/ref with verified and LOW for webfetch/local/official provider IDs. Those provider scores do not mean an unavailable provider was fetched. Overall confidence is MEDIUM because real UI/race checks remain. Cache writes were omitted to honor the parent's write-only-this-research-file assignment.

## Security Domain

Project security enforcement is enabled. ASVS describes web-application security controls; apply a scoped threat review without claiming full compliance for this local plugin. Detailed controls must name their version because identifiers change. [VERIFIED: .planning/config.json, workflow.security_enforcement] [CITED: https://owasp.org/projects/asvs]

| Area | Applicability / proposed control |
|---|---|
| Authentication and login sessions | No new authentication surface; keep in-process integration. |
| Authorization/capability boundary | Gate features; fail closed on unknown Pomodoro ownership. |
| Input validation | Validate preference and resolve against live completed statuses; safe wikilink helper. |
| DOM output | Text-only labels/due; safe path Markdown; no raw markup assignment. |
| Cryptography | No new secret or crypto function required. |
| Business logic and concurrency | Shared queue, exact entry identity, honest partial failure. |

These applicability decisions are recommendations based on current in-process scope. [VERIFIED: .planning/PROJECT.md, Out of Scope/Constraints; src/main.ts:23-43; src/model/taskLink.ts:15-32]

| Threat | STRIDE | Proposed mitigation |
|---|---|---|
| Synced title/path injects markup | Tampering | Title out of Markdown; taskWikilink rejects ambiguous syntax. |
| Stale selection targets replacement entry | Tampering | Revalidate after queue admission. |
| Missing read allows unsafe bulk stop | Tampering | Disable Stop all / halt batch. |
| Chip action differs from row action | Spoofing/tampering | Explicit pointer policy plus live UAT. |
| Render leaks handlers | Denial of service | Components, generations, close cleanup. |

ASVS category names above are descriptive applicability areas, not unverified chapter numbers.

## State of the Art

Existing multi-card UI and the pinned Runtime API are the relevant baseline. Older project prose still describes switching, a primary-plus-count display, and leaving every completion stop to TaskNotes. Phase 2 context and landed quick tasks supersede those statements. [VERIFIED: 02-CONTEXT.md, Phase Boundary/D-14; commits e9d87d6, afa6a41, 72972cc, 3a2b05d inspected this session; src/ui/TimerPaneView.ts:171-176]

## Assumptions Log

No training-derived technical assertion is used as a locked decision. Recommended policies are explicitly proposals, and unresolved behavior is below. No new package requires an installation checkpoint.

## Open Questions

1. **Selector field weighting:** follow explicit completed-last/tag-search requirements. Recommended literal match-quality-across-fields interpretation is a documented deviation from upstream field weights; planner must state its chosen policy.
2. **Picker chip interaction:** recommended row selection needs a real host mouse/keyboard check. Preserve native card chip ownership.
3. **Cross-plugin race:** public conditional stop is unavailable in this pinned contract. Re-read state, document limitation, and exercise Pomodoro assignment/start/pause/resume while batch writes are delayed. Do not call internals.

## Sources

- Installed TaskNotes bundle main.js:424 selector, :433 statuses, :587 TaskService, :599 Pomodoro view, :3458 API/Pomodoro ownership, :3699 completion auto-stop; manifest confirms 4.13.8. These long lines are indexed by function names above.
- [Official Runtime API 4.13.8](https://raw.githubusercontent.com/callumalpass/tasknotes/4.13.8/src/api/runtime-api.ts): public signatures and capabilities.
- [Official Pomodoro types 4.13.8](https://raw.githubusercontent.com/callumalpass/tasknotes/4.13.8/src/types.ts#L592-L609): public ownership/state.
- Installed host declarations node_modules/obsidian/obsidian.d.ts: SuggestModal, FuzzySuggestModal, Modal, PluginSettingTab and Plugin persistence.
- Project sources, canonical context/UI spec/quick-task plan and summary, manifest/lock, requirements/roadmap cited inline.
- [OWASP ASVS](https://owasp.org/projects/asvs): scope/version-aware references.

No known upstream clone was available, so installed bundle and tagged official source were read. Some Obsidian web paths were unavailable; authoritative installed declarations supplied host contracts. No negative compatibility statement rests on absent metadata. No live-app or registry-current claim is inferred from silence.

## Metadata

**Confidence:** MEDIUM overall. Existing contracts/architecture directly inspected; real chip interactions, cross-plugin mutation timing, and documented selector wording differences limit end-to-end confidence.

**Research date:** 2026-10-15. Re-check on TaskNotes upgrade. No runtime implementation, config, or branch changed during this research.
