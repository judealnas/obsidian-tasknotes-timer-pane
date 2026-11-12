# Phase 2: Start, Switch & Complete - Pattern Map

**Mapped:** 2026-10-15
**Files classified:** 23 proposed new/modified files; new filenames are recommendations.
**Analog coverage:** 23 / 23 have at least a partial pattern; new host modal/settings behavior has no exact local implementation.

Scope is Start task, Pomodoro-safe Stop all, and per-card Complete. The phase directory name is historical: do not add switching or a switch setting. Read `02-CONTEXT.md` and `02-RESEARCH.md` for locked behavior and verified public API signatures. This map supplies local implementation patterns, not replacement API research.

## File Classification

| New/modified file | Role | Data flow | Closest tracked analog | Match |
|---|---|---|---|---|
| `src/tasknotes/runtime-api.types.ts` | model | request-response | same file | exact |
| `src/tasknotes/TaskNotesBridge.ts` | service | request-response, pub-sub | same file | exact |
| `src/state/TimerController.ts` | controller | event-driven, request-response | same file | exact |
| `src/state/TimerStore.ts` | store | pub-sub, request-response | same file | exact |
| `src/main.ts` | provider | event-driven | same file | exact |
| `src/model/errors.ts` | utility | transform | same file | exact |
| `src/ui/TimerPaneView.ts` | component | event-driven | same file | exact |
| `styles.css` | config | state-driven presentation | same file | exact |
| `src/model/taskPicker.ts` (new) | utility | transform | `src/model/timeMath.ts` | role-match |
| `src/model/pomodoroOwnership.ts` (new) | utility | transform | `src/model/timeMath.ts` | role-match |
| `src/model/completionStatus.ts` (new) | utility | transform | `src/model/timeMath.ts` | role-match |
| `src/settings.ts` (new) | model | file-I/O, transform | `src/model/timeMath.ts`; `src/main.ts` | partial |
| `src/ui/TaskPickerModal.ts` (new) | component | event-driven, request-response | `src/ui/TimerPaneView.ts` | role-match |
| `src/ui/TimerPaneSettingTab.ts` (new) | component | event-driven, file-I/O | `src/ui/TimerPaneView.ts`; `src/main.ts` | partial |
| `tests/contract.test.ts` | test | contract validation | same file | exact |
| `tests/bridge.test.ts` | test | request-response, pub-sub | `tests/controller.test.ts` and existing suite | exact |
| `tests/controller.test.ts` | test | event-driven, request-response | same file | exact |
| `tests/store.test.ts` | test | pub-sub | `tests/controller.test.ts` and existing suite | exact |
| `tests/fakes/fakeGateway.ts` | test | request-response, pub-sub | same file | exact |
| `tests/fakes/fakeTaskNotes.ts` | test | request-response, pub-sub | same file | exact |
| `tests/taskPicker.test.ts` (new) | test | transform | `tests/contract.test.ts` (suite/import style) | role-match |
| `tests/pomodoroOwnership.test.ts` (new) | test | transform | `tests/contract.test.ts` (suite/import style) | role-match |
| `tests/settings.test.ts` (new; include status resolution) | test | transform | `tests/contract.test.ts` (suite/import style) | role-match |

`src/state/WriteQueue.ts` and `src/model/taskLink.ts` are reuse dependencies: normally no production changes required. `src/model/timeMath.ts` may remain unchanged if ownership state is stored separately. If the planner extends TimerSnapshot instead, include its signature changes explicitly. New UI tests should follow existing Node-only constraints; real host interaction remains manual UAT unless a testable seam can verify it without a new dependency.

## Pattern Assignments

### 1. Gateway and trimmed public contracts

**Applies to:** runtime types, bridge, fake interfaces, contract tests.
**Primary analog:** `src/tasknotes/TaskNotesBridge.ts` (tracked).

Import convention, lines 7-14: runtime helpers imported normally; API shapes imported using `import type` from the local trimmed contract. No TaskNotes implementation imports.

Existing write wrapper, lines 173-177:

```typescript
async stop(taskPath: string, context: TaskNotesMutationContext): Promise<void> {
    const api = this.api;
    if (!api || this.state.kind !== "ready") throw new Error("TaskNotes is not connected");
    await api.time.stop(taskPath, context);
}
```

Add project-shaped `start`, task listing, catalog reading, explicit task completion and Pomodoro state methods. Preserve method receivers (`api.namespace.method(...)`). Bridge methods can reject to the controller; the view must not receive uncaught rejections. Do not copy the menu method's boolean contract onto asynchronous writes.

Optional-feature guard, lines 201-209:

```typescript
const api = this.api;
if (!api || this.state.kind !== "ready") return false;
try {
    if (!api.hasCapability(TASK_MENU_CAPABILITY)) return false;
    const ui = api.ui;
    if (typeof ui?.taskMenu?.show !== "function") return false;
    // Called as a method so TaskNotes keeps its receiver.
    const result = ui.taskMenu.show({ taskPath, event });
```

Use that capability-plus-callable-shape policy per new action. Keep baseline `REQUIRED_CAPABILITIES` (line 18) separate so missing Pomodoro/catalog/task features do not disable existing display and Stop. Expose feature availability and explanations through the gateway/state, rather than letting views touch the API object.

Subscription disposal, lines 294-301:

```typescript
const onLifecycle = (event: TaskNotesRuntimeLifecycleEventName, handler: () => void) => {
    const ref = api.lifecycle.on(event, handler);
    this.offs.push(() => api.lifecycle.off(ref));
};
const onTask = (event: TaskNotesRuntimeTaskEventName, handler: () => void) => {
    const ref = api.events.on(event, handler);
    this.offs.push(() => api.events.off(ref));
};
```

Extend this ownership pattern for optional public Pomodoro event hints. Preserve detach/retired API handling; do not register TaskNotes EventRefs with Obsidian's event registry. Research lists the verified event names; no invented pause/resume event names.

**Contract analog:** `src/tasknotes/runtime-api.types.ts:88-96` defines the narrow API, with literal `apiVersion: 1`, readonly capabilities and typed time methods. Extend only production-used fields/namespaces. Correct its old stop-only comments.

**Test analog:** `tests/contract.test.ts:57-62`:

```typescript
expectTypeOf<Api["time"]["stop"]>().parameters.toEqualTypeOf<
    [path: string, context?: TaskNotesMutationContext]
>();
expectTypeOf<Api["time"]["stop"]>().returns.toEqualTypeOf<Promise<TaskInfo>>();
```

Pin new arguments/results, catalog completion fields, ownership timestamp, and events against the public contract established by research. Do not infer types from fake implementation convenience.

### 2. Serialized controller actions and error copy

**Applies to:** TimerController, error helpers, shared busy state; reuse WriteQueue.
**Primary analog:** `src/state/TimerController.ts` (tracked).

Dependency injection, lines 22-28:

```typescript
export interface TimerControllerDeps {
    gateway: Pick<TaskNotesGateway, "stop" | "normalizeError">;
    store: Pick<TimerStore, "refreshNow">;
    queue: WriteQueue;
    notify: (message: string) => void;
    newCorrelationId: () => string;
    log: (message: string) => void;
}
```

Extend the minimal gateway Pick; keep controller/model code free of runtime Obsidian imports. `src/main.ts:28-36` creates one store, queue and controller for all panes, injects `notify`, and generates correlation IDs. Put shared action busy state on that shared controller (or an explicitly shared state object), not only in each view.

Mutation context and queue admission, controller lines 46-52:

```typescript
await queue.run(() =>
    gateway.stop(target.taskPath, {
        source: MUTATION_SOURCE,
        reason: "user stop",
        correlationId: newCorrelationId(),
    }),
);
```

Queue behavior, `src/state/WriteQueue.ts:15-21`:

```typescript
run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.then(
        () => undefined,
        () => undefined,
    );
    return result;
}
```

Each Start, Stop all or Complete is one queue callback. Recheck current prerequisites inside it. Batch stops use `await` in a loop, never Promise.all and never call a controller method that queues again. Preserve rejection recovery of the tail.

Error handling, controller lines 54-60 and 69-70:

```typescript
const { message } = gateway.normalizeError(error);
if (isNoActiveSessionError(message)) {
    outcome = "already-stopped";
} else {
    log(`Stopping the timer for ${target.taskPath} failed: ${message}`);
    // Existing lines 61-65 protect notify() against throwing.
}
// After action/error handling:
await store.refreshNow();
return outcome;
```

New actions should refresh in `finally` and release shared busy state after refresh, including duplicate-start and partial-failure paths. Preserve non-rejecting UI action outcomes. `src/model/errors.ts:25-28` trims trailing punctuation, substitutes a reason for empty errors, and builds sentence-case Notice copy; add siblings rather than displaying error objects. Complete needs distinct status-success/stop-failure copy. Old controller comments leaving all completion stopping to TaskNotes are superseded by D-14.

**Start:** queued active read; duplicate Notice with zero writes; otherwise `time.start(path, {}, context)`; never stop another timer. An external duplicate-start race must not trigger compensation.

**Stop all:** finite deduplicated initial target set; fresh active/Pomodoro read before each stop; skip removed/replaced/owned entries; fail closed on ownership-read failure; summarize ordinary partial failures. Exact owned-entry predicate belongs in a pure helper. Do not protect every timer with the same associated task path: ownership requires its exact `timeTrackingStartTime` token. Public path-only stop still has the narrow check-to-write race documented in research.

**Complete:** resolve live completed status preserving catalog order; explicit task completion first; stop if still open; no-active-session is benign; status failure must not stop; successful status is not rolled back on stop failure. D-14 remains applicable with TaskNotes auto-stop disabled and with an already-completed active task.

### 3. Store and pure policy helpers

**Applies to:** TimerStore, taskPicker, pomodoroOwnership, completionStatus, settings validation.
**Primary analog:** `src/state/TimerStore.ts` (tracked); pure-style support from tracked `src/model/timeMath.ts`.

Store subscription convention, lines 46-49:

```typescript
this.unsubscribes = [
    this.gateway.onState((state) => this.handleState(state)),
    this.gateway.onData(() => this.requestRefresh()),
];
```

Authoritative refresh and stale-read guard, lines 115-123:

```typescript
const active = await this.gateway.active();
if (this.disposed || this.gateway.getState().kind !== "ready") return;
const snapshot = deriveSnapshot(active);
const signature = snapshotSignature(snapshot);
const changed = this.snapshot === null || signature !== this.signature;
this.snapshot = snapshot;
this.signature = signature;
if (changed) this.notify();
```

Keep single-flight/dirty-loop semantics (`TimerStore.ts:78-88,105-109`). Ownership/read availability and action availability must participate in change notification even when timer snapshot is unchanged. A failed ownership read is unknown, not absence of a Pomodoro. Avoid keeping a stale successful ownership value as permission to stop. Settings/catalog changes must refresh feature availability too.

Pure helper convention, `src/model/timeMath.ts:1-7`: plain input data, type-only local imports, no host calls. Defensive input validation example, lines 39-42:

```typescript
export function parseMs(iso: unknown): number | null {
    if (typeof iso !== "string") return null;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? null : ms;
}
```

Use independent pure helpers for picker filtering/ranking, exact entry ownership, live completion-status resolution and unknown persisted settings normalization. Keep TaskInfo task fields in the production contract, not test-only object augmentation.

Picker helper must exclude archived tasks, include completed and active tasks, partition completed last, search title/due/non-normal priority/contexts/projects/tags. Research establishes upstream differences: planner must explicitly choose query field weighting; literal best match quality across fields is the recommended interpretation. Do not silently inherit FuzzySuggestModal scoring or upstream completed ordering.

### 4. Pane header/cards and picker renderer lifecycle

**Applies to:** TimerPaneView, TaskPickerModal, styles.
**Primary analog:** tracked `src/ui/TimerPaneView.ts`.

Imports, lines 7-17: public Obsidian `Component`, `ItemView`, `MarkdownRenderer`, `setIcon`, `setTooltip`, type-only leaf types; local `taskLinkpath`/`taskWikilink`. New modal uses public `SuggestModal`; do not use TaskNotes modal internals.

Frame/subscription pattern, lines 132-145:

```typescript
const root = this.contentEl.createDiv({ cls: ["tntp-pane", "tntp-pane--loading"] });
const cards = root.createDiv({ cls: "tntp-cards" });
// Message DOM built once here.
this.els = { root, cards, heading, body, meta };
this.register(store.subscribe(() => this.render()));
this.register(gateway.onState(() => this.render()));
```

Build header before cards and outside `.tntp-cards`/`.tntp-message`. `styles.css:9-13` hides these regions by root state; header must remain visible across all five pane states. Extend PaneElements and render availability before `render()`'s early return for running timers (`TimerPaneView.ts:418-428`). Update idle copy at lines 462-464.

Card button pattern, view lines 208-212:

```typescript
const actions = card.createDiv({ cls: "tntp-actions" });
const stop = actions.createEl("button", { cls: ["mod-cta", "tntp-stop"] });
setIcon(stop.createSpan({ cls: "tntp-stop__icon" }), "square");
const stopLabel = stop.createSpan({ cls: "tntp-stop__label", text: STOP_LABEL });
stop.addEventListener("click", () => void this.stopTask(key));
```

Add Complete next to Stop. Existing `styles.css:145-151` makes Stop full width; adapt the action layout deliberately. Use native button semantics, explanatory tooltips, fixed labels/busy labels and `tntp-` classes. Keep Obsidian theme variables and no inline styles. Latest landed typography/chip/card changes supersede stale Phase 1 UI-SPEC details.

Busy target capture, view lines 397-405:

```typescript
const card = this.cards.get(key);
if (this.stopping.has(key) || !card) return;
const { taskPath, startTime, title } = card.timer;
this.stopping.add(key);
card.stop.disabled = true;
setTextIfChanged(card.stopLabel, STOPPING_LABEL);
try {
    await this.services.controller.stop({ taskPath, startTime, title });
```

Reuse capture-at-click and finally cleanup, but derive disabled controls from shared action state so multiple panes agree. Existing reconcile logic (`432-454`) preserves keyed cards/focus; its unconditional stop re-enable at `442-445` must respect global busy/feature availability.

Detached markdown rendering, view lines 263-267 and 277-280:

```typescript
const component = this.addChild(new Component());
const wrapper = createDiv({ cls: "tntp-title__md" });
const isCurrent = () => this.cards.get(key) === card && card.titleSeq === seq;
await MarkdownRenderer.render(this.app, markdown, wrapper, "", component);
// After await:
if (!isCurrent()) {
    this.removeChild(component);
    return;
}
```

Safe markdown source, tracked `src/model/taskLink.ts:30-32`:

```typescript
export function taskWikilink(taskPath: unknown): string | null {
    const linkpath = taskLinkpath(taskPath);
    return linkpath === null ? null : "[[" + linkpath + "]]";
}
```

Copy generation guards, detached wrapper, plain-text fallback, renderer error logging and component cleanup (`TimerPaneView.ts:268-318,359-366`). Never put titles into Markdown source. Picker due text is separate muted text.

**Important adaptation:** SuggestModal is not Component. Own explicit Components and load/unload them; do not copy `this.addChild`/`this.removeChild` onto Modal. Release row components on every suggestion refresh and modal close; generation guards must cover query changes, bridge changes and close. Fetch task/catalog set per opening, search locally, and prevent duplicate modal opens/selections.

**Pointer ownership differs:** timer cards deliberately defer to TaskNotes chips (`TimerPaneView.ts:321-347,381-390`). Preserve that behavior. Inside the picker, selecting any row/chip region must start exactly once rather than execute chip edit/status actions; scope noninteractive chip behavior or capture handling to the modal. Keep SuggestModal keyboard selection. Verify Enter/arrows/Escape and chip body/status/due whitespace in the real dev vault.

### 5. Settings composition and persistence

**Applies to:** main, settings model, setting tab, completion helper.
**Closest local patterns:** `src/main.ts:15-43` composition and injected callbacks; `src/ui/TimerPaneView.ts:125-161` host UI construction. No exact local persistence or PluginSettingTab implementation exists.

Preserve synchronous `registerView` at `src/main.ts:42-43` before awaited `loadData`, so layout restoration remains reliable. Register the new tab using public `PluginSettingTab` and traditional `Setting.addDropdown`; use installed host declarations referenced in research for signatures.

Settings carry one companion preference, using a default sentinel distinct from a status value. Validate unknown loaded data. Live dropdown options use only `isCompleted` catalog entries plus “Same as TaskNotes”; preserve catalog order. A missing/renamed/no-longer-completed saved value resolves to first completed for behavior, without destroying the preference merely because TaskNotes is temporarily unavailable. No completed statuses means Complete disabled with explanation. Do not persist catalog snapshots or TaskNotes settings.

## Shared Patterns

- **Capability boundary, not authentication:** this is an in-process companion; no auth middleware exists or is needed. Only the bridge touches TaskNotes' object.
- **Public writes only:** context includes `source`, `reason`, `correlationId`; no frontmatter mutations or private Pomodoro methods.
- **Authoritative state:** task/Pomodoro/lifecycle events request reads; successful writes refresh; ticks update clocks only.
- **Text safety:** `setText`/`createEl({text})`; safe path-only wikilinks; no raw HTML.
- **Lifetimes:** explicit off callbacks for TaskNotes refs, store/controller subscriptions released by owners, generations for asynchronous UI rendering, shared plugin action state.
- **UI continuity:** keyed card reconciliation and root modifier classes; persistent header and state-specific tooltips; keep current render while replacement chip renders.

## Testing Patterns and Required Adaptations

**Tracked analog:** `tests/controller.test.ts:28-47` composes real bridge/store/queue/controller over fake TaskNotes. Core excerpt:

```typescript
const tn = createFakeTaskNotes({ active });
const log = vi.fn<(message: string) => void>();
const bridge = new TaskNotesBridge({ lookupPlugin: () => tn.plugin, log, schedule: timerSchedule });
const store = new TimerStore({ gateway: bridge, log, schedule: timerSchedule });
const queue = new WriteQueue();
const notify = vi.fn<(message: string) => void>();
const controller = new TimerController({ gateway: bridge, store, queue, notify, newCorrelationId, log });
bridge.probe();
await store.refreshNow();
```

Extend that integration tracer for each new user action. Existing tests use `beforeEach(vi.useFakeTimers)` and `afterEach(vi.useRealTimers)` (`controller.test.ts:50-56`); the queue test (`150-181`) asserts strict event order after rejection. Prefer deferred fake writes to prove no overlap, prerequisites checked after queue admission, busy cleanup and queue recovery.

**Fake gateway:** `tests/fakes/fakeGateway.ts:76-93` counts reads, deep-copies fixtures, consumes one-shot read rejection, records writes and injects write failures. Extend both the interface and factory for new capabilities/catalog/tasks/ownership and call logs.

```typescript
active() {
    activeCalls++;
    // One-shot rejection branch omitted here; see lines 78-82.
    return Promise.resolve(structuredClone(fixture));
},
stop(taskPath, context) {
    stopCalls.push({ taskPath, context });
    // Injected failure branch: lines 87-90.
    return Promise.resolve();
},
```

**Fake Runtime API:** `tests/fakes/fakeTaskNotes.ts:103-116` records path/context, finds the open task entry, rejects no-active-session, and mutates entry endTime. Retain stateful behavior for Start/Complete and optional asynchronous auto-stop so tests observe real refreshed outcomes rather than just spy calls. Add controllable catalog/Pomodoro results and failures. `makeActiveEntry` at `234-251` shares the open entry with `task.timeEntries`; preserve that identity.

Coverage required beyond existing Stop assertions:

- Start alongside existing timers; duplicate selection is Notice plus zero writes; archived filter, completed last, every search field and explicit ranking policy.
- Exact ownership vs associated path, replaced/vanished entries, ownership changes between targets, unknown/read-failed ownership, finite target set and partial stop failures.
- Custom completed status, native-order default, stale saved preference, empty catalog, auto-stop on/off, already-completed open timer, benign double stop, status-failed/no-stop, status-success/stop-failed Notice.
- Optional capability/method absence preserves display/Stop; unloading during reads; ownership-only changes notify even with unchanged timers; shared busy state across subscribers.
- Pure settings normalization/status resolution tests without importing Obsidian runtime. Type-level API pins remain checked by build.

Existing automatic no-stop tests (`controller.test.ts:184-212`) remain valid for passive events. Add explicit Complete-click coverage; do not rewrite passive events into automatic controller completion.

Final automated gate: `npm run check`. Real dev-vault UAT must cover header all states, picker mouse/keyboard/component cleanup, settings reload, TaskNotes reload, Pomodoro transitions and matching status-bar results. No test dependency addition is needed. Nyquist validation remains disabled in current config; this map does not change that setting.

## No Exact Analog Found

| New behavior | Available partial pattern | Planner guidance |
|---|---|---|
| SuggestModal suggestion lifecycle | ItemView chip rendering | Adapt Component ownership; use research and installed public host declarations. |
| PluginSettingTab and persisted settings | main composition + pure validation | Use loadData/saveData and public Setting/addDropdown; preserve synchronous view registration. |
| Picker rank and exact Pomodoro ownership policy | pure timeMath transforms | Implement explicit contract from CONTEXT/RESEARCH; do not pretend a local policy already exists. |
| Global action busy notifications | store subscribe/notify | Add plugin-scoped observable state; view-local stopping Set is insufficient. |

## Metadata

**Analog search scope:** tracked `src/`, `tests/`, `styles.css`; canonical phase context/research/UI/quick-task references.
**Tracked-source gate:** all named local analog paths were confirmed in nonempty `git ls-files` output. No installed bundle, node_modules or dev-vault runtime mirror is assigned as an editable analog.
**Primary strong matches:** bridge, controller, store, pane view, controller integration suite. Supporting tracked helpers/fakes/contracts supply narrow excerpts above.
**Project instructions:** no root AGENTS.md and no local `.codex/skills`/`.agents/skills` directories were present; session-supplied instructions apply.
**Pattern extraction date:** 2026-10-15. Source edits and live host tests were not performed during mapping.
