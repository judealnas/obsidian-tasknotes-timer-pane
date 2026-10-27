---
phase: quick-261027-mcs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/model/cardOrder.ts
  - src/state/CardOrderStore.ts
  - src/main.ts
  - src/ui/TimerPaneView.ts
  - styles.css
  - README.md
  - tests/cardOrder.test.ts
  - tests/cardOrderStore.test.ts
  - tests/main.test.ts
autonomous: true
requirements: [QUICK-261027-mcs]

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "A user can drag a timer card by its handle onto another card and the cards reorder; the handle also reorders with ArrowUp/ArrowDown from the keyboard."
    - "The chosen order survives pane close/reopen and an Obsidian restart (stored in data.json beside the pause records)."
    - "A newly started timer appears at the top; pause and resume keep a card's position (session key is stable); a stopped card disappears and the others keep their relative order."
    - "Reordering never calls TaskNotes and never writes timeEntries; order is pane-local UI state only."
    - "Existing data.json writes are unchanged when no order has been saved (existing exact-equality saved-data tests still pass)."
  artifacts:
    - { path: "src/model/cardOrder.ts", provides: "pure orderTimers / moveKey / moveKeyBy / loadCardOrder" }
    - { path: "src/state/CardOrderStore.ts", provides: "plugin-scoped saved order, subscribe, persist" }
    - { path: "tests/cardOrder.test.ts", provides: "merge / new placement / stale drop / move tests" }
  key_links:
    - "main.ts persistAll writes cardOrder (omitted when empty) and loads it in the settingsReady chain, like pauseRecords."
    - "TimerPaneView.currentTimers applies orderTimers(timers, cardOrder.get()); reorder gestures call cardOrder.set(...)."
---

<objective>
Add drag-and-drop reordering of the timer cards in the pane (keyboard-accessible too), persisted as plugin data.

Purpose: let the user arrange cards as they like instead of always most-recently-started first.
Output: pure ordering model, a small order store, data.json persistence, handle-based drag-and-drop in TimerPaneView, styles, tests.

Constraints honored: vanilla Obsidian DOM API (HTML5 drag events, no library); no runtime dependencies; no TaskNotes access at all (order is pane-local, the gateway and runtime API are untouched); timeEntries never written. Persistence reuses the existing single writer `persistAll` in main.ts (the same mechanism that persists paused state) and the `OWNED_KEYS` convention.

Tracer note: the persistence pattern is already proven by the pause records, so a separate thin tracer slice would add no information here. The three tasks go bottom-up (pure model and store, then persistence wiring, then UI), each independently verifiable.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/ui/TimerPaneView.ts
@src/state/PauseStore.ts
@src/main.ts
@src/model/pauseLedger.ts
@tests/main.test.ts
@styles.css
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure card-order model and CardOrderStore, with tests</name>
  <files>src/model/cardOrder.ts, src/state/CardOrderStore.ts, tests/cardOrder.test.ts, tests/cardOrderStore.test.ts</files>
  <read_first>src/state/PauseStore.ts (store shape to mirror: load once, changedBeforeLoad, subscribe, persist callback with log-on-failure), src/model/pauseLedger.ts (loadPauseRecords: defensive loader of untrusted data.json, MAX_STORED_RECORDS cap), src/model/timeMath.ts (OpenTimer.sessionKey is the card key)</read_first>
  <behavior>
    orderTimers(timers, saved) (generic over items with a string `sessionKey`; returns a new array, never mutates):
    - saved empty: result equals input order (default most-recently-started first is preserved).
    - saved [B, A], live [A, B]: result [B, A].
    - New placement: live [C, A, B] with saved [A, B] (C new): C goes first, then A, B (new timers at the top, matching the default). Two new timers C, D keep their incoming relative order ahead of the saved ones.
    - Stale ids: saved keys with no live timer are ignored in the result (live [A], saved [X, A, Y] gives [A]); no throw.
    - Duplicate keys in saved: first occurrence wins. Duplicate live keys are passed through untouched (the view already dedupes).
    - A paused/resumed session keeps its key, so its position is unchanged (covered by keys, no extra case needed).

    moveKey(order, dragKey, targetKey, after): returns a new array with dragKey removed and reinserted immediately before targetKey (after=false) or immediately after it (after=true). Returns an unchanged copy when dragKey === targetKey or either key is missing from order.
    moveKeyBy(order, key, delta): returns a new array with key moved delta places (clamped to the ends); unchanged copy when key is missing or delta is 0.
    loadCardOrder(data): from untrusted data.json; reads only `cardOrder`; returns [] unless it is an array; keeps only non-empty strings; examines at most the first 1000 items; dedupes keeping the first; never throws.

    CardOrderStore (Obsidian-free, deps `{ log: (message: string) => void; persist?: (order: readonly string[]) => Promise<void> }`):
    - get() returns a readonly copy; empty before load.
    - load(order) runs once: sets the order, notifies; if set() was called before load, the in-memory order wins and load persists it instead of overwriting it.
    - set(order): replaces the order (copy), no-ops (no notify, no persist) when equal to the current one, otherwise notifies listeners then persists (when loaded; before load it marks changed-before-load).
    - subscribe(listener) returns an unsubscribe function; a throwing listener is caught and logged, others still run.
    - serialize() returns a plain array copy for data.json.
    - A rejected or throwing persist is logged with a fixed message ("Saving card order failed.") that carries no path or error text.
  </behavior>
  <action>
    Per the behavior block, write the failing tests first in tests/cardOrder.test.ts (pure functions) and tests/cardOrderStore.test.ts (store; use vi.fn for persist and log, follow tests/pauseStore.test.ts style), run them red, then implement.

    Create src/model/cardOrder.ts exporting orderTimers, moveKey, moveKeyBy and loadCardOrder. It must stay free of any obsidian import so Vitest loads it unmocked. Do not import OpenTimer; type the timers parameter structurally as items having `sessionKey: string`.

    Create src/state/CardOrderStore.ts, mirroring PauseStore's load/subscribe/persist conventions but far smaller (no revision counter, no pending set). Persist failures log through `deps.log` only.

    Do not touch TaskNotes, the gateway, TimerStore or TimerController: order is pane-local UI state and must not influence any TaskNotes data.
  </action>
  <verify>
    <automated>npx vitest run --dir tests cardOrder cardOrderStore</automated>
  </verify>
  <done>Both new test files pass; they cover merge of saved order with live timers, new timers placed at the top, stale ids dropped, duplicates, move helpers, defensive loader, and store load/set/notify/persist/before-load behavior.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Persist and load the card order in main.ts through persistAll</name>
  <files>src/main.ts, tests/main.test.ts</files>
  <read_first>src/main.ts (OWNED_KEYS, extrasOf, persistAll, the settingsReady loadData chain and its catch), tests/main.test.ts (host.data, host.saved, flush, saveSettingsOf, the PauseStore access pattern)</read_first>
  <behavior>
    - With host.data = { cardOrder: ["a", "b"], extraKey: 1 }, after onload and flush, plugin's card order store reports ["a", "b"] and a later settings save writes { extraKey: 1, completionStatus, pauseRecordsVersion: 1, pauseRecords: [], cardOrder: ["a", "b"] }.
    - Calling the store's set(["b", "a"]) after load writes data.json containing cardOrder ["b", "a"] together with the current settings and pause records (one writer, serialized by saveChain).
    - With no saved order (host.data lacking cardOrder, or an empty order), the written object has NO cardOrder key, so every existing exact-equality assertion in tests/main.test.ts passes unmodified.
    - A malformed cardOrder in data.json (not an array, non-strings) loads as an empty order without error; a loadData rejection still loads an empty order and keeps the plugin usable.
  </behavior>
  <action>
    Add "cardOrder" to OWNED_KEYS so it is not copied into `extras` and cannot be written twice. Construct one CardOrderStore in onload next to the PauseStore, with persist: () => this.persistAll() and the same log function; keep it in a private field `cardOrder` (the main tests reach it the way they reach `pauses`). In persistAll, add the `cardOrder` key to the saved object only when the store's serialize() is non-empty (conditional spread), so a user who never reorders keeps byte-identical data.json writes. In the settingsReady chain, after pauses.load, call cardOrder.load(loadCardOrder(data)); in the catch branch also call cardOrder.load([]) beside pauses.load([]). Pass the store to the view as a new `cardOrder` entry in the services object given to `new TimerPaneView(...)` (the view-side typing is done in Task 3; to keep this task type-clean, add the optional-free `cardOrder: CardOrderStore` property to the TimerPaneServices interface in src/ui/TimerPaneView.ts as the only change to that file in this task).
    Add the tests from the behavior block to tests/main.test.ts following its existing patterns. Do not alter existing tests.
  </action>
  <verify>
    <automated>npx vitest run --dir tests main && npx tsc -noEmit</automated>
  </verify>
  <done>New main tests pass, all pre-existing main tests pass unmodified, and tsc is clean.</done>
</task>

<task type="auto">
  <name>Task 3: Handle-based drag-and-drop and keyboard reorder in TimerPaneView, styles, README</name>
  <files>src/ui/TimerPaneView.ts, styles.css, README.md</files>
  <read_first>src/ui/TimerPaneView.ts (buildCard, currentTimers, reconcileCards: moves a card only when out of place; PaneElements), styles.css (.tntp-cards, .tntp-card, .tntp-title, .tntp-visually-hidden), README.md (where pane features are described)</read_first>
  <action>
    View wiring (TimerPaneServices already gained `cardOrder` in Task 2):
    1. In currentTimers, return the timers passed through orderTimers(timers, cardOrder.get()) (import from ../model/cardOrder). reconcileCards already positions cards in the given order without churn, so no change there.
    2. In onOpen, subscribe: this.register(cardOrder.subscribe(() => this.render())) so two open panes stay in sync.
    3. In buildCard, add a handle as the first child of the card: a button with class `tntp-handle`, aria-label "Reorder card", a tooltip via setTooltip ("Drag to reorder, or use Up and Down arrow keys"), icon via setIcon(..., "grip-vertical"), and `draggable` set to "true" on the handle only (not the card, so title text selection, clicks and card buttons keep working). Use the same direct addEventListener style as the other card listeners (they go away with the card), reading the key from this.cards at event time.
    4. Keyboard: keydown ArrowUp / ArrowDown on the handle calls preventDefault and sets the order to moveKeyBy(displayedKeys, key, -1 or +1), where displayedKeys = [...this.cards.keys()] (current display order). After the re-render, refocus the handle (the card element is reused by reconcileCards so focus normally survives; call handle.focus() if document.activeElement is not the handle).
    5. Pointer drag, using HTML5 drag events only: on the handle's dragstart, record this.dragKey = key, set dataTransfer.effectAllowed = "move", setData of a custom type "application/x-tntp-card" with the key, and dataTransfer.setDragImage(card.card, 0, 0); add class `tntp-card--dragging` to the card. On each card's dragover (listener on the card): do nothing unless this.dragKey is set and the key differs; preventDefault, set dropEffect "move", compute `after` from evt.clientY versus the card's getBoundingClientRect() vertical midpoint, and show an indicator by toggling `tntp-card--drop-before` / `tntp-card--drop-after` (clear the other and clear it from all other cards). On drop: preventDefault, then set the order to moveKey(displayedKeys, this.dragKey, targetKey, after). On dragend (always fires, also on cancel): clear this.dragKey and remove every dragging/drop-indicator class. Never move DOM nodes during the drag; the single commit through cardOrder.set triggers the store subscription and render() which reorders in place. Add a private field `dragKey: string | null = null` and reset it in onOpen/onClose.
    6. Persist the full displayed order on every commit (so keys of timers that no longer exist are dropped from data.json at that moment); set() itself no-ops when nothing changed.
    7. Ignore foreign drags: dragover/drop handlers require this.dragKey !== null, so files or text dragged over the pane are untouched.
    8. Reordering must not touch the controller, gateway or store snapshots: only cardOrder.set. Do not add any write path to TaskNotes.

    styles.css: make `.tntp-card` position: relative; place `.tntp-handle` at the top end corner (position absolute, inset-block-start and inset-inline-end using --size-4-* variables), a transparent, borderless, muted-colored button with cursor: grab (grabbing while active), visible focus ring using the theme's focus variables; add padding-inline-end to `.tntp-title` equal to the handle width so a long title never runs under it. Add `.tntp-card--dragging` (reduced opacity) and `.tntp-card--drop-before` / `.tntp-card--drop-after` (a 2px inset box-shadow line in var(--interactive-accent) on the top or bottom edge). Use only theme CSS variables, no inline styles in TS (obsidianmd lint rule), and keep the card's hover/paused styles intact.

    README.md: add one short line to the pane features list stating that cards can be reordered by dragging the handle (or Up/Down arrows on it), new timers appear at the top, and the order is remembered. Match the surrounding wording and format.
  </action>
  <verify>
    <automated>npm run check</automated>
  </verify>
  <done>npm run check (tsc, production build, eslint with zero warnings, full vitest suite) passes. Manual smoke (noted for the user, not blocking): with two or more timers in the dev vault, dragging a handle shows a drop line and reorders, Up/Down on a focused handle reorders, the order survives closing and reopening the pane and an Obsidian restart, a new timer appears at the top, pause/resume keeps position, and the status bar and TaskNotes data are unaffected.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| data.json -> plugin | cardOrder is read from a file that Sync, other devices or hand edits can change |
| drag source -> pane | DOM drag events can originate outside the pane (files, text, other panes) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-01 | Tampering | loadCardOrder (data.json) | low | mitigate | Accept only an array of non-empty strings, cap at 1000 items, dedupe, never throw; malformed input yields an empty order (default ordering). |
| T-quick-02 | Tampering | foreign drag over pane | low | mitigate | dragover/drop act only while this.dragKey (set by our own handle's dragstart) is non-null; foreign drags are not preventDefault-ed. |
| T-quick-03 | Information disclosure | persist failure logging | low | mitigate | Fixed log message "Saving card order failed." with no path or error text, matching PauseStore. |
| T-quick-04 | Tampering | TaskNotes data | low | mitigate | No TaskNotes call and no timeEntries write exist in this change; order lives only in data.json via persistAll. |
| T-quick-SC | Tampering | npm/pip/cargo installs | high | accept | No packages are added or installed by this plan. |
</threat_model>

<verification>
- npx vitest run --dir tests cardOrder cardOrderStore main
- npm run check
- git diff shows no change under src/tasknotes/, src/state/TimerController.ts or src/state/TimerStore.ts
</verification>

<success_criteria>
Cards reorder by drag handle or keyboard, the order persists through data.json using the existing persistAll writer, new timers land on top, stopped timers' stale ids are dropped on the next reorder, existing saved-data tests are untouched and green, and npm run check passes.
</success_criteria>

<output>
Create `.planning/quick/261027-mcs-add-drag-and-drop-reordering-of-the-time/261027-mcs-SUMMARY.md` when done
</output>
