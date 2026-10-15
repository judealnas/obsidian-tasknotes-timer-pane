---
phase: quick-261014-whq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/tasknotes/runtime-api.types.ts
  - src/tasknotes/TaskNotesBridge.ts
  - src/ui/TimerPaneView.ts
  - src/model/taskLink.ts
  - src/model/timeMath.ts
  - styles.css
  - tests/fakes/fakeTaskNotes.ts
  - tests/fakes/fakeGateway.ts
  - tests/bridge.test.ts
  - tests/contract.test.ts
  - tests/taskLink.test.ts
  - tests/readPath.test.ts
  - tests/store.test.ts
  - .planning/phases/01-live-timer-pane/COVERAGE.md
autonomous: true
requirements: [DISP-01]
tags: [ui, task-link-chip, task-menu, runtime-api]

estimate:
  tokens: 95000
  raw_tokens: 95000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "With TaskNotes' task-link overlay setting on, every card title renders as TaskNotes' own task-link chip (status, priority and whatever TaskNotes' inline-visible properties show), exactly as a [[link]] to that task renders in a note"
    - "Clicking or right-clicking the chip does what it does in a note (TaskNotes' single/double-click actions and its task context menu); the pane never also opens the note for a click the chip handled"
    - "When no chip renders (overlay off, or TaskNotes did not process the link), the title is a plain link showing the task title: click opens the note in the active leaf, Ctrl/Cmd-click and middle-click open a new tab, Enter/Space on the focused title open it (DISP-01 unchanged)"
    - "Right-clicking a title that is not a chip opens TaskNotes' native task menu through Runtime API ui.taskMenu.show when TaskNotes advertises ui.task-menu; without that capability (TaskNotes 4.10), without ui, or when TaskNotes is not ready, nothing special happens and nothing throws"
    - "ui.task-menu is optional: a TaskNotes without it still reaches the ready state and the pane works as before"
    - "Changing a timed task's status or priority (from the chip's menu, elsewhere in TaskNotes, or by editing frontmatter) re-renders that card's title, so the chip never shows a stale status"
    - "The task title never passes through the Markdown parser: the Markdown source is only [[<vault path without .md>]], and a path containing [ ] | # ^ or a line break falls back to plain title text"
    - "Removing a card or closing the pane unloads that card's render Component; a render that finishes after its card was removed or re-rendered is discarded"
  artifacts:
    - path: "src/tasknotes/runtime-api.types.ts"
      provides: "Optional ui.taskMenu.show contract and TaskNotesRuntimeTaskMenuShowOptions"
      contains: "TaskNotesRuntimeTaskMenuShowOptions"
    - path: "src/tasknotes/TaskNotesBridge.ts"
      provides: "Gateway showTaskMenu, capability-gated, never throws"
      contains: "showTaskMenu"
    - path: "src/model/taskLink.ts"
      provides: "Pure wikilink builder for a task path"
      exports: ["taskLinkpath", "taskWikilink"]
    - path: "src/model/timeMath.ts"
      provides: "OpenTimer.displayKey and taskDisplayKey, included in snapshotSignature"
      contains: "displayKey"
    - path: "src/ui/TimerPaneView.ts"
      provides: "Title rendered via MarkdownRenderer with a per-card Component, click and contextmenu ownership rules"
      contains: "MarkdownRenderer.render("
    - path: "tests/taskLink.test.ts"
      provides: "Unit tests for the wikilink builder"
      min_lines: 25
  key_links:
    - from: "src/ui/TimerPaneView.ts"
      to: "src/tasknotes/TaskNotesBridge.ts"
      via: "contextmenu on the title → gateway.showTaskMenu(taskPath, evt); preventDefault only when it returns true"
      pattern: 'gateway\.showTaskMenu\('
    - from: "src/tasknotes/TaskNotesBridge.ts"
      to: "TaskNotes Runtime API v1"
      via: "api.ui.taskMenu.show({ taskPath, event }) after hasCapability(TASK_MENU_CAPABILITY)"
      pattern: 'taskMenu\.show\('
    - from: "src/ui/TimerPaneView.ts"
      to: "src/model/taskLink.ts"
      via: "updateTitle → taskWikilink(taskPath) → MarkdownRenderer.render(app, markdown, wrapper, \"\", component)"
      pattern: 'taskWikilink\('
    - from: "src/model/timeMath.ts"
      to: "src/state/TimerStore.ts"
      via: "snapshotSignature includes displayKey, so the store notifies on a status/priority change"
      pattern: 'displayKey'
---

<objective>
Render each running-timer card's title as a wikilink so TaskNotes' task-link chip (status and priority, with right-click to change them) appears in the pane, just as it does for a `[[link]]` in a note. When no chip renders, the title stays a working internal link, and right-clicking it opens TaskNotes' native task menu through Runtime API `ui.taskMenu.show`.

Purpose: The user changes a timed task's status or priority without leaving the pane, through TaskNotes' own UI. This follows the "defer to TaskNotes built-ins" preference: the chip only appears when TaskNotes' own overlay setting allows it, and every menu action is TaskNotes' own write.
Output: the gateway task-menu method and its contract, the wikilink title rendering with a per-card Component, a task display key that keeps chips current, and tests.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.claude/CLAUDE.md
@src/ui/TimerPaneView.ts
@src/tasknotes/TaskNotesBridge.ts
@src/tasknotes/runtime-api.types.ts
@src/model/timeMath.ts
@tests/fakes/fakeGateway.ts
@tests/fakes/fakeTaskNotes.ts
@styles.css
@.planning/phases/01-live-timer-pane/COVERAGE.md

<tasknotes_evidence>
Established at planning time from the TaskNotes 4.13.8 bundle (`dev-vault/.obsidian/plugins/tasknotes/main.js`) and upstream `src/api/runtime-api.ts` @ 451679289d94. The executor does NOT need to re-investigate these facts:

1. **Reading-mode post-processor.** It returns early unless `settings.enableTaskLinkOverlay` is true. For each `a.internal-link` it calls `processLink(a, ctx.sourcePath, "internal", hasAlias, subpath)`. `ctx.getSectionInfo` is wrapped in try/catch, so a `MarkdownRenderer.render` context with no section info is tolerated: `hasAlias` becomes false. `processLink` resolves `href` with `metadataCache.getFirstLinkpathDest(parseLinktext(href).path, sourcePath)` and reads the task from TaskNotes' cache synchronously. `replaceWithTaskWidget` has no awaited work before `parentNode.replaceChild(chip, a)`, so in 4.13.8 the chip is already in place when `MarkdownRenderer.render` resolves. The plan still classifies ownership at event time (see Task 2), so a future asynchronous chip is handled too.
2. **Chip display text.** When the link text equals the `href`, as with `[[Tasks/Foo]]`, TaskNotes passes no display-text override and the chip shows the task's own `title`. TaskNotes' `disableOverlayOnAlias` check treats text equal to the link path as default text, not an alias, so a link with no alias always gets the chip when the overlay is on. Conclusion: render `[[<linkpath>]]` with **no alias**. The title is never put into Markdown, so no escaping is needed.
3. **Chip events.** The chip root stops propagation of `pointerdown`/`mousedown`/`mouseup`. Its card `contextmenu` handler calls `preventDefault()` and `stopPropagation()` synchronously, then shows TaskNotes' menu. Its card `click` handler calls `stopPropagation()` synchronously, then runs TaskNotes' `singleClickAction` (default `"edit"`; Ctrl/Cmd-click opens a new tab). Clicks on excluded sub-elements (status dot, priority dot, inner links and tags) return early **without** stopping propagation, so they can bubble to the pane's title container. Middle-click (`auxclick`, button 1) is handled with `preventDefault()` and `stopPropagation()`.
4. **No chip refresh outside markdown leaves.** TaskNotes' `refreshReadingModeWidgets` only walks `getLeavesOfType("markdown")` in preview mode, so a chip rendered in this pane never refreshes itself. Separately, `TimerStore` only notifies subscribers when `snapshotSignature` changes, and that signature currently ignores status and priority. Both together explain why Task 3 exists.
5. **Upstream menu contract (verbatim names).** `TaskNotesRuntimeTaskMenuShowOptions extends TaskNotesRuntimeTaskMenuOptions { event: MouseEvent }` with `TaskNotesRuntimeTaskMenuOptions { taskPath: string; targetDate?: Date; onUpdate?: () => void; promoteOccurrenceControls?: boolean }`. `TaskNotesRuntimeTaskMenuApi.show(options): Promise<void>` (also `showAtElement` and `populate`). `TaskNotesRuntimeUiApi { readonly taskMenu }`. `TaskNotesRuntimeApiV1.ui` is required upstream in 4.13.8 but is absent before 4.11. Capability string: `"ui.task-menu"`. In the bundle, `show` awaits `requireTask(taskPath)`, which rejects for an unknown path, and then calls `menu.show(event)` (Obsidian `Menu.showAtMouseEvent`).
6. Obsidian: `Keymap.isModEvent(evt)` returns `'tab'` for Ctrl/Cmd or a middle click. `MarkdownRenderer.render(app, markdown, el, sourcePath, component)` has no `@since` above `minAppVersion` 1.12.2.
</tasknotes_evidence>

<interfaces>
Contracts this plan introduces. These are type signatures for the executor, not implementations.

```ts
// src/tasknotes/runtime-api.types.ts (Task 1)
/** Trimmed from upstream: targetDate, onUpdate and promoteOccurrenceControls are left out. */
export interface TaskNotesRuntimeTaskMenuShowOptions { taskPath: string; event: MouseEvent; }
// new member on TaskNotesRuntimeApiV1 (optional: absent before TaskNotes 4.11)
readonly ui?: { readonly taskMenu: { show(options: TaskNotesRuntimeTaskMenuShowOptions): Promise<void> } };

// src/tasknotes/TaskNotesBridge.ts (Task 1)
export const TASK_MENU_CAPABILITY = "ui.task-menu";
// new member on TaskNotesGateway
showTaskMenu(taskPath: string, event: MouseEvent): boolean;

// src/model/taskLink.ts (Task 2), pure, no Obsidian imports
export function taskLinkpath(taskPath: unknown): string | null;
export function taskWikilink(taskPath: unknown): string | null;

// src/model/timeMath.ts (Task 3)
// new required field on OpenTimer
displayKey: string;
export function taskDisplayKey(task: unknown): string;
```
</interfaces>

<coverage_audit>
| Source | Item | Covered by |
|---|---|---|
| GOAL (quick description) | Card titles render as wikilinks so TaskNotes' chip appears | Task 2 |
| GOAL | Right-click falls back to api.ui.taskMenu when no chip renders | Task 1 (path), Task 2 (ownership rule) |
| REQ DISP-01 | Title shows the task; click opens the note; mod-click opens a new tab | Task 2 keeps it for plain and text titles; Enter/Space unchanged |
| Planning context | Minimal `ui` namespace in the vendored types; gateway method that no-ops without the capability and never throws; fakes updated; unit tests for capability on/off and api missing | Task 1 |
| Planning context | Title-safe Markdown; chip detection rule without TaskNotes class names; no double open; keep open-note on plain links | Task 2 |
| Planning context | Child Component per card, unloaded on card removal and in onClose | Task 2 |
| Planning context | Re-render only when the title inputs change | Task 2 (taskPath, title) + Task 3 (display key). This deliberately extends "taskPath/title" because of evidence item 4: without the display key, a status change made from the chip's own menu would leave a stale chip |
| Constraints (CLAUDE.md) | Runtime API v1 and public Obsidian API only; graceful degradation; no inline styles; sentence case; minAppVersion 1.12.2 | All tasks; lint runs in `npm run check` |
| Memory | Defer to TaskNotes built-ins and honor its settings | The overlay setting gates the chip, and the chip's click/menu behavior is TaskNotes' own; the pane adds only the right-click fallback |

Not done (documented limitation, not a gap): turning TaskNotes' overlay setting on or off takes effect in the pane at the next title re-render (task change, title change, or reopening the pane). TaskNotes' own refresh only covers markdown leaves.
</coverage_audit>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Right-clicking a card title opens TaskNotes' native task menu (types → gateway → view)</name>
  <files>src/tasknotes/runtime-api.types.ts, src/tasknotes/TaskNotesBridge.ts, src/ui/TimerPaneView.ts, tests/fakes/fakeTaskNotes.ts, tests/fakes/fakeGateway.ts, tests/bridge.test.ts, tests/contract.test.ts, .planning/phases/01-live-timer-pane/COVERAGE.md</files>
  <behavior>
    - Bridge ready, "ui.task-menu" advertised, ui.taskMenu.show present: showTaskMenu("TaskNotes/Tasks/A.md", event) returns true, and the fake records exactly one call with that taskPath and the identical event object
    - Capability list without "ui.task-menu": returns false, zero menu calls, and getState() is still { kind: "ready" } (the capability is optional)
    - Capability advertised but the api has no ui namespace (fake option ui: false, like TaskNotes 4.10): returns false and does not throw
    - Plugin lookup returns null (missing), or the api is not ready (loading): returns false with zero menu calls
    - show rejects with new Error("Task not found"): showTaskMenu still returns true; after microtasks flush, log was called with exactly "Opening the TaskNotes task menu failed: Task not found"; no unhandled rejection
    - hasCapability throws after the bridge is ready: returns false, logs once, does not throw
  </behavior>
  <action>
This is the thinnest end-to-end path: vendored contract → bridge → view listener. The title is still plain text in this task. Task 2 changes what is inside the title.

1. `src/tasknotes/runtime-api.types.ts`: add the exported interface `TaskNotesRuntimeTaskMenuShowOptions` with exactly `taskPath: string` and `event: MouseEvent`. Give it a doc comment saying it is trimmed from upstream and that `targetDate`, `onUpdate` and `promoteOccurrenceControls` are left out. Add an optional member `readonly ui?` to `TaskNotesRuntimeApiV1` whose `taskMenu` has only `show(options: TaskNotesRuntimeTaskMenuShowOptions): Promise<void>`, as in the interfaces block. Its doc comment must say: absent before TaskNotes 4.11, gated on the `ui.task-menu` capability, and `showAtElement`/`populate` not vendored. Keep the file type-only. `MouseEvent` is the DOM lib global, so no new import is needed.
2. `src/tasknotes/TaskNotesBridge.ts`: export `TASK_MENU_CAPABILITY = "ui.task-menu"`. Do NOT add it to `REQUIRED_CAPABILITIES`: it is optional, and the bridge must still reach ready without it. Add `showTaskMenu(taskPath: string, event: MouseEvent): boolean` to the `TaskNotesGateway` interface. Its doc comment: "Opens TaskNotes' own task context menu at the mouse event. True when TaskNotes took the event, and the caller then prevents the default. False when unavailable. Never throws." Implement it in `TaskNotesBridge`:
   - Return false unless `this.api` is set and `this.state.kind === "ready"`.
   - Inside a try block, return false unless `api.hasCapability(TASK_MENU_CAPABILITY)` is true and `api.ui?.taskMenu?.show` is a function.
   - Call it as a method, `api.ui.taskMenu.show({ taskPath, event })`, so the receiver is kept.
   - Wrap the returned value in `Promise.resolve(...)` and attach a `.catch` that calls `this.log("Opening the TaskNotes task menu failed: " + describeError(error))`, then return true.
   - In the catch for a synchronous throw, log `"Opening the TaskNotes task menu failed: " + describeError(error)` and return false.
   - Pass no mutation context: `show` takes none, and every menu action is TaskNotes' own write through its own services.
3. `tests/fakes/fakeTaskNotes.ts`:
   - Add `"ui.task-menu"` to `DEFAULT_CAPABILITIES`.
   - Add the option `ui?: boolean` (default true). When it is false, the api object has no `ui` property.
   - Add a `ui.taskMenu.show(options)` implementation, typed against `NonNullable<TaskNotesRuntimeApiV1["ui"]>`. It pushes `{ taskPath: options.taskPath, event: options.event }` onto a new exposed `menuCalls` array and resolves, or rejects with `new Error(message)` after `failMenuWith(message: string | null)` (null restores success).
   - Expose `menuCalls` and `failMenuWith` on `FakeTaskNotes`. Export a `MenuCall` interface for the recorded shape.
4. `tests/fakes/fakeGateway.ts`: implement `showTaskMenu(taskPath, event)`. It records `{ taskPath, event }` in an exposed `menuCalls` array and returns the current availability flag, which defaults to true. Expose `setTaskMenuAvailable(available: boolean)` on `FakeGateway`. When unavailable, it returns false and records nothing.
5. `tests/bridge.test.ts`: add a `describe("task menu (ui.taskMenu, optional ui.task-menu capability)")` block, one test per `<behavior>` bullet. Use the existing `setup()` helper and `createFakeTaskNotes`.
   - Build the event as an object literal cast to `MouseEvent`. Tests run in Node, so there is no real event.
   - For the capability-missing case, pass the four required capabilities plus `"errors.typed"`.
   - To flush the rejection, `await Promise.resolve()` twice, or await `vi.waitFor` on the log.
   - For the throwing case, `vi.spyOn(tn.api, "hasCapability")` AFTER `bridge.probe()`, then make it throw.
6. `tests/contract.test.ts`:
   - Import `TaskNotesRuntimeTaskMenuShowOptions` and add a test pinning that `undefined` is assignable to `Api["ui"]`, i.e. ui is optional.
   - Pin `NonNullable<Api["ui"]>["taskMenu"]["show"]`: parameters exactly `[options: TaskNotesRuntimeTaskMenuShowOptions]` and return `Promise<void>`.
   - Pin `TaskNotesRuntimeTaskMenuShowOptions` as equal to `{ taskPath: string; event: MouseEvent }`.
7. `src/ui/TimerPaneView.ts`:
   - In `buildCard`, add `title.addEventListener("contextmenu", (evt) => this.openTaskMenu(key, evt))`.
   - Add a private `openTaskMenu(key: string, evt: MouseEvent): void`. It returns at once if `evt.defaultPrevented`, because TaskNotes' chip already handled the event; that is the fallback rule and does not depend on any TaskNotes class name. It looks up `this.cards.get(key)` and returns if the card is missing. Otherwise it calls `this.services.gateway.showTaskMenu(card.timer.taskPath, evt)` and calls `evt.preventDefault()` only when that returns true.
   - The taskPath is read at event time from the card, the same way stopTask captures its target.
   - The view never reaches TaskNotes except through the gateway.
8. `.planning/phases/01-live-timer-pane/COVERAGE.md`: replace the row `| ui.taskMenu.showAtElement | OPT-OUT | ... |` with two rows:
   - `| ui.taskMenu.show | INTEGRATE | |`
   - `| ui.taskMenu.showAtElement / ui.taskMenu.populate | OPT-OUT | not needed: right-click passes the mouse event, so show() places the menu at the pointer |`

This task touches 8 files, but four of them (contract pin, two fakes, COVERAGE row) are a few lines each, forced by the type change. The context cost stays small.
  </action>
  <verify>
    <automated>npx vitest run --dir tests bridge contract && npm run check</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n 'TASK_MENU_CAPABILITY = "ui.task-menu"' src/tasknotes/TaskNotesBridge.ts` prints one line
    - `grep -n 'REQUIRED_CAPABILITIES = \["time.read", "time.write", "tasks.events", "lifecycle.events"\] as const' src/tasknotes/TaskNotesBridge.ts` prints one line (unchanged: the menu capability stays optional)
    - `grep -n 'showTaskMenu(taskPath: string, event: MouseEvent): boolean' src/tasknotes/TaskNotesBridge.ts` prints at least one line (interface and class)
    - `grep -n 'readonly ui?:' src/tasknotes/runtime-api.types.ts` and `grep -n 'export interface TaskNotesRuntimeTaskMenuShowOptions' src/tasknotes/runtime-api.types.ts` each print one line
    - `grep -n 'gateway.showTaskMenu(' src/ui/TimerPaneView.ts` and `grep -n '"contextmenu"' src/ui/TimerPaneView.ts` each print at least one line
    - `grep -n '"ui.task-menu"' tests/fakes/fakeTaskNotes.ts` prints at least one line, and `grep -n 'setTaskMenuAvailable' tests/fakes/fakeGateway.ts` prints at least one line
    - `grep -n '| ui.taskMenu.show | INTEGRATE |' .planning/phases/01-live-timer-pane/COVERAGE.md` prints one line
    - `grep -v '^\s*\(//\|/\*\|\*\)' src/ui/TimerPaneView.ts | grep -c 'getPlugin'` prints 0 (the view never looks TaskNotes up itself)
    - `npm run check` exits 0 with no ESLint problems
  </acceptance_criteria>
  <done>Right-clicking a card title in the pane opens TaskNotes' native task menu when TaskNotes advertises ui.task-menu, and does nothing special otherwise. The bridge tests cover capability on/off, api ui missing, not ready/missing, rejection logged, and a throwing capability check. The contract pins the optional ui.taskMenu.show shape. COVERAGE.md records the integration. npm run check passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Card titles render as TaskNotes task-link chips, with a working plain-link fallback</name>
  <files>src/model/taskLink.ts, tests/taskLink.test.ts, src/ui/TimerPaneView.ts, styles.css</files>
  <behavior>
    - taskLinkpath("TaskNotes/Tasks/Write report.md") === "TaskNotes/Tasks/Write report"; taskWikilink of the same path === "[[TaskNotes/Tasks/Write report]]"
    - Only one trailing lowercase ".md" is stripped: "a.md.md" → "a.md"; "notes/plan.markdown" stays "notes/plan.markdown"; "x.MD" stays "x.MD"
    - Link-breaking characters give null from both functions: any of [ ] | # ^ or a \n / \r anywhere in the path (for example "a|b.md", "a#b.md", "a^b.md", "a[b].md", "line\nbreak.md")
    - Empty results give null: "", ".md", and non-string input (undefined, null, 42)
    - The output never contains anything but "[[" + linkpath + "]]" (the functions take only the path, so no title or alias can be injected)
  </behavior>
  <action>
1. Create `src/model/taskLink.ts`, a pure module with no Obsidian imports, so Vitest in Node can load it. Give it a header comment explaining why there is no alias (evidence item 2 in the plan context).
   - `taskLinkpath(taskPath: unknown): string | null` returns null for a non-string. Otherwise it strips exactly one trailing lowercase `.md`, then returns null if the result is empty or contains any of `[`, `]`, `|`, `#`, `^`, `\n`, `\r`. These are the characters that break or re-target Obsidian wikilink syntax. Otherwise it returns the linkpath.
   - `taskWikilink(taskPath: unknown): string | null` returns `"[[" + linkpath + "]]"`, or null when `taskLinkpath` returns null.
   - The full vault path without `.md` resolves unambiguously through `getFirstLinkpathDest` with an empty sourcePath.
2. Create `tests/taskLink.test.ts` covering every `<behavior>` bullet. Write the tests first (RED), then the module (GREEN).
3. `src/ui/TimerPaneView.ts`: render the title through Obsidian's public `MarkdownRenderer.render`. Add `Component` and `MarkdownRenderer` to the existing obsidian import, and import `taskLinkpath` and `taskWikilink` from `../model/taskLink`.

   **Card state.** Extend `CardElements` with:
   - `titleKey: string | null`: the inputs of the last title update
   - `titleSeq: number`: render generation
   - `titleMode: "text" | "markdown"`
   - `titleLink: HTMLAnchorElement | null`: the pane's own plain link inside the rendered output
   - `titleComponent: Component | null`

   Initialize them in `buildCard` to null, 0, "text", null and null. Keep the title container exactly as it is: `div.tntp-title` with `role="link"`, `tabindex="0"`, `aria-labelledby` pointing at the hidden "Open {title}" label, the "Open task note" tooltip, and the Enter/Space keydown that calls `openTask(key, false)`. The Task 1 contextmenu listener also stays.

   **Render key.** Add a module-level function `titleRenderKey(timer: OpenTimer): string` that joins `timer.taskPath` and `timer.title` with `"\u0000"`. Task 3 extends it.

   **updateTitle.** In `reconcileCards`, replace `setTextIfChanged(card.title, timer.title)` with `this.updateTitle(key, card)`. The hidden-label update stays. `updateTitle(key, card)` is synchronous:
   - Compute the next key and return if it equals `card.titleKey`. Otherwise store it and increment `card.titleSeq`, keeping that value as `seq`.
   - If `card.titleMode === "text"`, call `showTitleText(card)` at once, so a new card is never blank and a text-mode rename updates immediately. A card already showing a chip or link keeps that until the new render is ready, which avoids flicker.
   - Compute `markdown = taskWikilink(card.timer.taskPath)` and `linkpath = taskLinkpath(card.timer.taskPath)`. If either is null, call `showTitleText(card)` and return.
   - Otherwise call `void this.renderTitleLink(key, card, seq, markdown, linkpath)`.

   **renderTitleLink.** This is the async method.
   - Synchronously, before any await, create `const component = this.addChild(new Component())`. Create a detached wrapper with Obsidian's global `createDiv({ cls: "tntp-title__md" })`. If the obsidianmd lint rules reject the global helper, use `card.title.doc.createElement("div")` plus `addClass("tntp-title__md")` instead.
   - `await MarkdownRenderer.render(this.app, markdown, wrapper, "", component)` inside try/catch. On a throw, log through `console.error` with the existing `[tasknotes-timer-pane]` prefix (message "Rendering the task link failed: " plus the error message, as openTask does) and call `this.removeChild(component)`. If the card is still current, call `showTitleText(card)`. Then return.
   - The card is current when `this.cards.get(key) === card && card.titleSeq === seq`. If it is not current after the await, call `this.removeChild(component)` and return. This discards a render that lost the race.
   - Find the pane's own plain link. Iterate `wrapper.querySelectorAll<HTMLAnchorElement>("a.internal-link")` and take the first whose `getAttribute("data-href") === linkpath`. Use no `instanceof` checks and no TaskNotes class names.
   - If a link is found: `link.setText(card.timer.title)`, so the plain link shows the pane's title rather than the path. Set `tabindex="-1"` so the container stays the single tab stop, and set `draggable="false"` so dragging the title does not drop an app:// URL.
   - If no link is found and the wrapper has no child elements, treat the render as empty: remove the component, call `showTitleText(card)`, and return.
   - Swap the content in: `card.title.empty()`, then `card.title.appendChild(wrapper)`. Release the previous `card.titleComponent` with `this.removeChild(...)` if it is set. Then set `card.titleComponent = component`, `card.titleLink = link ?? null`, `card.titleMode = "markdown"`, and call `applyTitleOwnership(card)`.

   **Helpers.**
   - `showTitleText(card)` releases any component (removeChild, set it to null), sets `card.titleLink = null` and `card.titleMode = "text"`, writes the title with `card.title.setText(card.timer.title)` (textContent only), and calls `applyTitleOwnership(card)`.
   - `paneOwnsTitle(card)` returns true when `card.titleMode === "text"`, or when `card.titleLink !== null && card.title.contains(card.titleLink)`. This is evaluated at event time, so a chip that replaced the pane's link at any moment is respected.
   - `applyTitleOwnership(card)` toggles the class `tntp-title--chip` when the pane does not own the title. When the pane does not own the title, it removes the container's `aria-label`, because the "Open task note" tooltip would mislead over a chip whose click runs TaskNotes' single-click action. Otherwise it calls `setTooltip(card.title, "Open task note")`. The accessible name keeps coming from aria-labelledby.

   **Clicks.**
   - Replace the title click listener with `(evt) => this.onTitleClick(key, evt)`. It returns if the card is missing, `evt.defaultPrevented`, or `!this.paneOwnsTitle(card)`. When TaskNotes owns the title, even bubbled clicks from the chip's status or priority dots are ignored, so there is never a double open. Otherwise it calls `evt.preventDefault()`, which stops the anchor's own navigation, then `this.openTask(key, Keymap.isModEvent(evt))`.
   - Add an `auxclick` listener that only acts on `evt.button === 1`, with the same ownership and defaultPrevented checks, then `evt.preventDefault()` and `this.openTask(key, Keymap.isModEvent(evt))`. A middle click maps to `'tab'`.
   - The contextmenu rule from Task 1 is unchanged and independent of ownership. The chip's own handler prevents the default before the event can reach the container.

   **Lifecycle.**
   - Add `discardCard(card)`: increment `card.titleSeq` to invalidate an in-flight render, release `card.titleComponent` via `this.removeChild` and set it to null, then `card.card.detach()`.
   - Use it in `reconcileCards` in place of the bare `card.card.detach()`.
   - In `onClose`, call `discardCard` for every card before clearing `this.els` and `this.cards`.

   **Safety.** Never assign markup strings to the DOM. The title only ever reaches the DOM through `setText`.
4. `styles.css`, using classes and Obsidian variables only, no inline styles:
   - Add `.tntp-title__md > p { margin: 0; }`, since Obsidian wraps the link in a paragraph.
   - Add `.tntp-title a.internal-link { color: inherit; text-decoration: none; }`, so a plain link keeps the UI-SPEC title look: text-normal at rest, with accent and underline coming from the container on hover/focus.
   - Scope the existing hover/focus rule to `.tntp-title:not(.tntp-title--chip):hover, .tntp-title:not(.tntp-title--chip):focus-visible`.
   - Add `.tntp-title--chip { cursor: auto; }` and `.tntp-title--chip:focus-visible { box-shadow: 0 0 0 2px var(--background-modifier-border-focus); border-radius: var(--radius-s); }`, so keyboard focus on a chip title is still visible.
  </action>
  <verify>
    <automated>npx vitest run --dir tests taskLink && npm run check</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n 'export function taskLinkpath' src/model/taskLink.ts` and `grep -n 'export function taskWikilink' src/model/taskLink.ts` each print one line
    - `grep -v '^\s*\(//\|/\*\|\*\)' src/model/taskLink.ts | grep -c 'from "obsidian"'` prints 0 (the module stays loadable in Node)
    - `grep -n 'MarkdownRenderer.render(' src/ui/TimerPaneView.ts` prints at least one line; `grep -n 'taskWikilink(' src/ui/TimerPaneView.ts` prints at least one line
    - `grep -n 'removeChild(' src/ui/TimerPaneView.ts` prints at least one line and `grep -n 'addChild(new Component())' src/ui/TimerPaneView.ts` prints one line
    - `grep -n '"tntp-title--chip"' src/ui/TimerPaneView.ts` prints at least one line; `grep -n 'tntp-title--chip' styles.css` and `grep -n 'tntp-title__md' styles.css` each print at least one line
    - `grep -n '"auxclick"' src/ui/TimerPaneView.ts` prints at least one line
    - `grep -v '^\s*\(//\|/\*\|\*\)' src/ui/TimerPaneView.ts | grep -c 'innerHTML\|insertAdjacentHTML\|outerHTML'` prints 0
    - `npm run check` exits 0 with no ESLint problems
  </acceptance_criteria>
  <done>With TaskNotes' overlay on, each card title is TaskNotes' chip, and chip clicks and right-clicks are TaskNotes' own, with no extra open from the pane. With the overlay off, the title is a plain link that opens the note (mod-click or middle-click opens a new tab, Enter/Space works), and right-click opens TaskNotes' menu from Task 1. Each render uses its own Component, unloaded on re-render, card removal and pane close. taskLink tests pass. npm run check passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: A status or priority change re-renders the chip (task display key in the snapshot)</name>
  <files>src/model/timeMath.ts, src/ui/TimerPaneView.ts, tests/readPath.test.ts, tests/store.test.ts</files>
  <behavior>
    - taskDisplayKey of two structurally equal tasks is equal; changing status (open → in-progress) changes it; adding priority "high" changes it; changing only timeEntries (closing an older entry) does not change it
    - taskDisplayKey(null), taskDisplayKey(undefined) and taskDisplayKey("x") are ""; a task with a BigInt field (JSON.stringify throws) gives "" without throwing
    - deriveSnapshot sets displayKey on every OpenTimer to taskDisplayKey(item.task)
    - snapshotSignature differs when only one timer's task status changes, and is still deterministic and order-independent as before
    - TimerStore: after a primed snapshot, a refresh where active() differs only in the task's status notifies subscribers exactly once; a second identical refresh does not notify
  </behavior>
  <action>
1. `src/model/timeMath.ts`:
   - Add the required field `displayKey: string` to `OpenTimer`. Its doc comment: "changes whenever a task field TaskNotes' task-link chip can show changes (status, priority, dates, any inline-visible property); see taskDisplayKey".
   - Add the exported `taskDisplayKey(task: unknown): string`. It returns "" unless `task` is a non-null object. Otherwise it serializes, with `JSON.stringify` inside try/catch, an object holding every own enumerable top-level field of `task` except `timeEntries`. Closed time is already in the signature, and open entries do not change while running. It returns "" on a throw or a non-string result. Do not sort keys: TaskNotes builds TaskInfo with a stable field order, and a reordering would only cause one extra re-render.
   - JSON.stringify escapes control characters, so the key can never contain the signature's `\u0000`/`\u0001` separators. Say so in a comment.
   - In `deriveSnapshot`, set `displayKey: taskDisplayKey(item?.task)`.
   - In `snapshotSignature`, add `timer.displayKey` to the per-timer joined fields, and update its doc comment to list the display key. This makes `TimerStore` notify on a status or priority change, because it only notifies on signature changes (evidence item 4).
2. `src/ui/TimerPaneView.ts`: extend `titleRenderKey(timer)` to also join `timer.displayKey`. A status or priority change then re-renders the card's title Markdown through the Task 2 path, which creates a fresh Component, discards stale renders and swaps without flicker. TaskNotes' post-processor reads its already-updated cache and builds a fresh chip. Nothing else changes in the view.
3. `tests/readPath.test.ts`:
   - Add `displayKey: ""` to the `openTimer` helper's literal, so it still type-checks.
   - Add a `describe("taskDisplayKey")` block covering the taskDisplayKey and deriveSnapshot bullets of `<behavior>`. Build tasks with the existing `activeEntry`/`makeActiveEntry` helpers.
   - TaskInfo does not declare `priority`, so add it with `Object.assign(item.task, { priority: "high" })` instead of widening the vendored type.
   - BigInt literals are fine with the ES2021 target.
4. `tests/store.test.ts`:
   - Rename the test "snapshotSignature is deterministic and keyed on path, start, title and closed time" to also name the display key. Add an assertion that the same entries with a different task status give a different signature.
   - Add a test to the "signature diff" describe: prime the store with `primed([entryA()])`, then `gateway.setActive([entryA({ status: "in-progress" })])`. After `await store.refreshNow()` the subscriber was notified once more; a further identical refresh adds no notification. `entryA` already accepts `status` through `makeActiveEntry`'s input.
  </action>
  <verify>
    <automated>npx vitest run --dir tests store readPath && npm run check</automated>
    <human-check>
      <test>Manual check in Obsidian, run by the user: desktop, dev vault, TaskNotes 4.13.8 enabled, task link overlay on (the dev-vault default). Run `npm run deploy`, then reload the TaskNotes Timer Pane plugin (Hot Reload, or toggle it in Community plugins), and open the timer pane.
        1. Start time tracking on two seed tasks, one with a priority set. Each card title shows TaskNotes' chip (status dot, priority dot, title), matching a [[link]] to the same task in a reading-view note.
        2. Click the chip body: TaskNotes' single-click action runs (default: edit modal) and the pane does not also open the note. Click the status dot: the status cycles and the pane opens nothing.
        3. Right-click the chip: TaskNotes' task menu appears once. Change the status, then the priority, from it: within about 1 s the chip in the pane shows the new status and priority.
        4. Edit the task's status by hand in its frontmatter: the chip in the pane updates.
        5. In TaskNotes settings, turn the task link overlay off, then close and reopen the pane. Titles are plain links showing the task title. Click opens the note in the active leaf; Ctrl-click and middle-click open a new tab; Tab to the title and press Enter, and it opens. Right-click shows TaskNotes' task menu at the pointer, once, and changing priority there works.
        6. Stop one timer: its card disappears, and `obsidian dev:errors` or the developer console shows no errors. Close the pane while a timer runs and reopen it: no errors. Turn the overlay back on afterwards.</test>
      <expected>Chips render and stay current; chip interactions are TaskNotes' own with no duplicate note opening; plain-link titles keep DISP-01 behavior and gain the right-click menu; no console errors on card removal or pane close</expected>
      <why_human>TaskNotes' post-processor, its chip, its context menu and Obsidian's renderer only exist inside a running Obsidian; Vitest runs in Node without them</why_human>
    </human-check>
  </verify>
  <acceptance_criteria>
    - `grep -n 'displayKey: string' src/model/timeMath.ts` prints at least one line and `grep -n 'export function taskDisplayKey' src/model/timeMath.ts` prints one line
    - `grep -n 'timer.displayKey' src/model/timeMath.ts` prints at least one line (inside snapshotSignature) and `grep -n 'displayKey' src/ui/TimerPaneView.ts` prints at least one line (inside titleRenderKey)
    - `grep -n 'describe("taskDisplayKey"' tests/readPath.test.ts` prints one line
    - `npx vitest run --dir tests store readPath` passes and `npm run check` exits 0 with no ESLint problems
    - `git diff --quiet -- package.json package-lock.json` exits 0
  </acceptance_criteria>
  <done>A status or priority change on a timed task, made from the chip's menu, from TaskNotes elsewhere, or by a frontmatter edit, changes the snapshot signature, notifies the store's subscribers, and re-renders that card's title, so the chip is fresh. taskDisplayKey and store tests pass. npm run check passes. The manual check is listed for the user.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Task data → pane DOM | Task titles and paths come from vault frontmatter and file names, which can be user-edited or synced from another device, and are rendered in the pane |
| Pane → TaskNotes UI API | The pane hands a task path and a mouse event to TaskNotes' `ui.taskMenu.show`; any write that follows is TaskNotes' own |
| TaskNotes post-processor → pane DOM | TaskNotes replaces the pane's rendered link with its chip and attaches its own handlers |

## STRIDE Threat Register

Quick-task scope: IDs are prefixed `T-whq-` and do not collide with phase 01's `T-01-*`.

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-whq-01 | Tampering | Title rendering in `TimerPaneView` | medium | mitigate | The only Markdown source is `[[<path without .md>]]` from `taskWikilink`. Paths with `[ ] \| # ^` or line breaks are rejected (tests in `tests/taskLink.test.ts`). The title reaches the DOM only through `setText` (textContent). The Task 2 gate rejects markup-string DOM writes in the view. Obsidian's renderer sanitizes its own output |
| T-whq-02 | Denial of service | `TaskNotesBridge.showTaskMenu`, `renderTitleLink` | low | mitigate | `showTaskMenu` never throws: a sync throw returns false, and a rejection is caught and logged (bridge tests). A render failure or empty output falls back to plain title text. Stale renders are discarded through `titleSeq` and their Components unloaded |
| T-whq-03 | Tampering | Writes made from TaskNotes' task menu or chip | low | accept | Writes happen only after an explicit user choice in TaskNotes' own UI, through TaskNotes' own services, lock and field mapping. The pane adds no write path: `time.stop` remains its only write |
| T-whq-04 | Spoofing | Wrong task targeted, or a double action | low | mitigate | The menu uses the card's `taskPath` read at event time from that card. Clicks are ignored whenever TaskNotes owns the title (`paneOwnsTitle` evaluated at event time), so a chip click never also opens the note. Right-click is handled only when not already `defaultPrevented` |
| T-whq-SC | Tampering | npm installs | high | mitigate | No package installs in this plan. `git diff --quiet -- package.json package-lock.json` holds at plan end (Task 3 acceptance) |
</threat_model>

<verification>
- `npm run check` (tsc, esbuild production build, ESLint with zero warnings, Vitest) exits 0 after each task
- `npx vitest run --dir tests bridge contract taskLink store readPath` passes
- `git diff --quiet -- package.json package-lock.json` exits 0 (no dependency changes)
- The view reaches TaskNotes only through `TaskNotesGateway` (Task 1 gate). The only TaskNotes calls added are `hasCapability` and `ui.taskMenu.show` in the bridge
- Manual check (Task 3 human-check) is run by the user in Obsidian desktop
</verification>

<success_criteria>
- With TaskNotes' overlay on, card titles are TaskNotes' task-link chips that stay current after status and priority changes, and chip clicks and right-clicks behave as in notes with no duplicate open
- With no chip, titles are plain links keeping DISP-01 (click, mod-click or middle-click new tab, Enter/Space), and right-click opens TaskNotes' native menu when `ui.task-menu` is available
- Without `ui.task-menu` or the `ui` namespace, the pane is unchanged and never throws
- Render Components are released on re-render, card removal and pane close
- All automated checks pass; no new dependencies
</success_criteria>

<output>
Create `.planning/quick/261014-whq-render-card-titles-as-wikilinks-so-taskn/261014-whq-SUMMARY.md` when done
</output>
