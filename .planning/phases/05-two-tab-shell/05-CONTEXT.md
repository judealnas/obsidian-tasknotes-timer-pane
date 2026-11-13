# Phase 5: Two-Tab Shell - Context

**Gathered:** 2026-11-13
**Status:** Ready for planning

<domain>
## Phase Boundary

The pane becomes a shell with two tabs, **Staged** and **Timers** (TABS-01, TABS-02). The Timers tab is the v0.2 pane, with unchanged behavior: the same cards, Start task / Pause all / Resume all / Stop all, drag and ArrowUp/Down reordering, and Pomodoro hiding. The last-active tab is restored after restart.

This phase is a **pure refactor plus a shell**. The Staged tab is a static placeholder, and the phase adds no staging behavior, writes or new data.json keys. Tab counts, the running cue and staged markers (TABS-03/04) belong to Phase 6. The rename to "TaskNotes Task Control" belongs to Phase 7, so `getDisplayText()`, the ribbon tooltip and command names stay as they are.

</domain>

<decisions>
## Implementation Decisions

### Tab strip
- **D-01:** **Underlined text tabs.** The strip has two text tabs, "Staged" then "Timers", across the pane width. The active tab is underlined in the accent color and the inactive one is muted. Use Obsidian CSS variables only and `tntp-` BEM classes, as in the existing `styles.css`. Tab order is Staged first, then Timers.
- **D-02:** **Labels are text only**, with no icons. This leaves room for Phase 6's counts ("Staged 4 · Timers 1") in a narrow sidebar.
- **D-03:** **Keyboard follows the ARIA tabs pattern.** Use `role="tablist"`/`tab`/`tabpanel`, `aria-selected` and `aria-controls`, with a roving tabindex so the strip is a single Tab stop. Left and Right switch tabs (activation follows focus, since there are only two tabs), Home and End may jump to the first or last tab, and Tab moves into the active panel. Clicking a tab switches it in one click.
- **D-04:** **Header actions sit on their own row under the tab strip**, as a wrapping row like today's `.tntp-header`, and change with the active tab. Timers keeps Start task / Pause all / Resume all / Stop all exactly as in v0.2.

### Default tab and multiple panes
- **D-05:** **With no saved tab, the pane opens on Timers.** That covers a fresh install, the first open after upgrading from 0.2 (the restored leaf has no tab in its state), and any missing or unrecognized saved value. Upgraders see the pane they had, and a running timer is never hidden behind Staged. After that, the remembered tab wins.
- **D-06:** **Each pane keeps its own tab.** Two open panes can show different tabs. This comes from per-leaf view state (`getState`/`setState`, carried forward from the roadmap), and there is no cross-pane tab sync. Card order stays shared across panes through `CardOrderStore`, as in v0.2.
- **D-07:** **Revealing an already-open pane keeps its current tab.** That applies to the ribbon icon and the "Open timer pane" command (`main.ts` `revealLeaf`), which switch nothing.
- **D-08:** **The pane never switches tabs by itself.** It changes tab only when the user clicks or uses the keyboard, so a timer started elsewhere while Staged is showing does not switch to Timers. Phase 6's counts and running cue are how the user notices it.

### Staged placeholder
- **D-09:** **The Staged body shows the final empty-state copy.** It uses the same message style as Timers' idle state, for example heading "Nothing staged for today" and body "Choose Stage above to pick today's tasks." The planner picks the exact copy, which must pass the obsidianmd sentence-case lint. Phase 6 then only wires it up.
- **D-10:** **The Staged header has a Stage button that is disabled**, with a tooltip like "Staging isn't available yet". The header visibly changes per tab (success criterion 2), and Phase 6 enables the button. It never opens the picker in this phase.

### Connection messages and tabs
- **D-11:** **The tabs stay and the connection message is shared.** While TaskNotes is missing, incompatible or still loading, the tab strip stays visible and switchable. The active tab's header buttons are disabled as in v0.2, and the same connection message (heading, body, version meta and the "Check for TaskNotes" retry) takes the place of that tab's body. Reconnecting after a TaskNotes reload or a sleep/wake works the same from either tab, because the 1 s tick, wake-gap detection, the visibility/focus refresh and the bridge subscription stay at shell level and keep running whichever tab is active.
- **D-12:** **The "Can't check Pomodoro. Showing all timers." note appears on the Timers tab only.**

### Claude's Discretion
- How the shell is split into classes or modules: `TaskCard` / `CardList<K>` extraction, a separate card map per tab, and per-tab CSS state modifiers (the roadmap notes give the direction). Whether the Staged tab's DOM is built at open or on first show, and whether a hidden tab skips DOM writes.
- The view-state key name and shape, for example `{ tab: "staged" | "timers" }`, and validation of restored values per D-05.
- The `TaskPickerModal` options object (start mode only for now).
- Focus handling when switching tabs, and whether hidden panels use `hidden` or CSS.
- Exact placeholder and tooltip copy within D-09 and D-10.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 5: Two-Tab Shell": goal, the four success criteria and the refactor notes (`TaskCard`, `CardList<K>`, per-tab card maps and CSS modifiers, picker options object, view state not data.json)
- `.planning/REQUIREMENTS.md`: TABS-01 and TABS-02 (this phase), TABS-03/04 (Phase 6, kept out of scope here)

### Design research
- `.planning/research/SUMMARY.md`: architecture items 5–6 (TaskCard / CardList / shell), GAP-7 (per-tab header actions), resolved question 4 (active tab in view state), and the Phase 5 build-order section
- `.planning/research/STAGING-DECISIONS.md`: the settled staging design that the shell must leave room for (Phase 6 Staged cards keyed by path, joined with TimerStore at render time)

### Prior phase context
- `.planning/phases/04-staging-foundations/04-CONTEXT.md`: single-device data safety (`OWNED_KEYS`/`persistAll`); this phase adds no data.json keys

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ui/TimerPaneView.ts` (721 lines): the whole v0.2 pane and the extraction source. It contains card build and reconcile (`buildCard`, `reconcileCards`, keyed by `sessionKey`), title rendering with TaskNotes chip handling (`updateTitle`/`renderTitleLink`/ownership), drag and keyboard reorder (`wireHandle` with `moveKey`/`moveKeyBy`), the header, the message area (`renderMessage`), the 1 s `tick` with `detectWakeGap`, and visibility/focus refresh.
- `src/model/cardOrder.ts` (`orderTimers`, `moveKey`, `moveKeyBy`) and `src/state/CardOrderStore.ts`: the Timers order stays on its existing data.json key, unchanged.
- `src/model/timeMath.ts` `derivePaneState`: `PaneState` (`running`/`idle`/`loading`/`missing`/`incompatible`) currently drives the root `tntp-pane--{state}` class. The shell has to separate bridge state (shared, D-11) from per-tab content state.
- `src/ui/TaskPickerModal.ts`: its constructor takes `(app, gateway, controller, onClose)` positionally, so it is the target for the options-object refactor.

### Established Patterns
- Show and hide come from CSS state modifiers on the root (`styles.css` lines 10–28: `.tntp-pane--running .tntp-message`, `.tntp-pane--pomodoro-unknown`, and so on). Tabs need per-tab equivalents so one tab's state never hides the other's content.
- The frame is built once in `onOpen` and updated in place. Text is written only when it changes (`setTextIfChanged`), so live regions aren't re-announced. A card moves only when it is out of place, which keeps focus and hover.
- Every listener goes through `registerDomEvent`/`register`/`registerInterval`. There is no raw `setInterval` (obsidianmd lint).
- The view never writes during render. Every write goes through `TimerController` and the shared `WriteQueue`, a roadmap rule for all v0.3 phases.

### Integration Points
- `src/main.ts:117` registers the view. `main.ts:169-174` reveals an existing leaf or calls `ensureSideLeaf(VIEW_TYPE_TIMER_PANE, "right", …)` with no state, so the default tab must come from the view (D-05). `VIEW_TYPE_TIMER_PANE` stays `"tasknotes-timer-pane"`.
- `ItemView.getState()`/`setState()` persist the active tab with the workspace layout (TABS-02).
- **Test gap:** no test in `tests/` imports `TimerPaneView`, so the claim "all v0.2 automated tests still pass" doesn't cover the view. The planner should add view-level tests of the extracted `TaskCard`/`CardList`/shell (the stack notes allow `obsidian-test-mocks` with jsdom), and/or rely on the UAT sandbox (`npm run uat:start`, gsd-dom-verifier) to show that Timers behavior is unchanged.

</code_context>

<specifics>
## Specific Ideas

- The user approved the underlined-text-tabs mockup: "Staged" (active, double underline) next to "Timers", the Timers header row below, then the cards.
- The user chose the recommended option on every question. The intent is a conservative refactor that keeps the v0.2 look and puts nothing in front of a running timer.

</specifics>

<deferred>
## Deferred Ideas

None. The discussion stayed within phase scope. A command or hotkey to jump to a specific tab was mentioned only as a follow-up option and not pursued; it would fall under the v2 hotkeys idea (PANE-F1).

</deferred>

---

*Phase: 05-two-tab-shell*
*Context gathered: 2026-11-13*
