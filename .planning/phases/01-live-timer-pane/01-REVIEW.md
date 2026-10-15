---
phase: 01-live-timer-pane
reviewed: 2026-10-15T02:51:45Z
depth: quick
files_reviewed: 25
files_reviewed_list:
  - .gitignore
  - README.md
  - esbuild.config.mjs
  - eslint.config.mts
  - manifest.json
  - package.json
  - scripts/seed-dev-vault.mjs
  - src/main.ts
  - src/model/errors.ts
  - src/model/timeMath.ts
  - src/state/TimerController.ts
  - src/state/TimerStore.ts
  - src/state/WriteQueue.ts
  - src/tasknotes/TaskNotesBridge.ts
  - src/tasknotes/runtime-api.types.ts
  - src/ui/TimerPaneView.ts
  - styles.css
  - tests/bridge.test.ts
  - tests/contract.test.ts
  - tests/controller.test.ts
  - tests/fakes/fakeGateway.ts
  - tests/fakes/fakeTaskNotes.ts
  - tests/readPath.test.ts
  - tests/store.test.ts
  - tsconfig.json
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-10-15T02:51:45Z
**Depth:** quick
**Files Reviewed:** 25
**Status:** issues_found

## Summary

This was a quick-depth review. I ran the standard anti-pattern scans across `src/`, `scripts/`, `tests/`, the build configs and `styles.css`. I also read the required files, because the brief made them mandatory reading. The scans came back clean: no hardcoded secrets, no `eval`/`innerHTML`/HTML-injection sinks, no empty catch blocks, no `as any`/`@ts-ignore`/`eslint-disable`, no focused or skipped tests, and no inline styles or `!important`. Every timer goes through `registerInterval`, or through a cancellable `schedule` that `dispose()` releases. The project constraints also hold: only Runtime API v1 calls are made (`time.active`, `time.stop`, `events`, `lifecycle`, `errors.normalize`), nothing writes frontmatter, and the bridge degrades through the missing, incompatible and loading states.

There are no blockers. Four warnings remain:
- the Stop path ignores the session it captured at click time;
- opening the title can create a stray note when the snapshot is stale;
- the "needs an update" message is wrong when TaskNotes is new but lacks a capability;
- `npm run dev` does not copy `styles.css` changes into the dev vault, although the README says it does.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Stop captures the session's `startTime` but never checks it, so it can stop a newer session

**File:** `src/state/TimerController.ts:42-52` (target built at `src/ui/TimerPaneView.ts:196`)
**Issue:** `StopTarget` carries `startTime`, and the view comment says the target is captured "so a refresh landing mid-stop cannot redirect the write". But `stop()` only forwards `target.taskPath` to `gateway.stop`, and `api.time.stop(path)` closes whatever entry is open on that path. Suppose the displayed session is stopped elsewhere (status bar, task card) and then restarted on the same task. This can happen before the click is processed, or while the shared `WriteQueue` is still busy with an earlier write. The pane then closes the brand-new session, which the user never saw, and reports `"stopped"` instead of `"already-stopped"`. Because `startTime` is never read, the field gives a guarantee the code does not keep.
**Fix:** Inside the queued task, re-read `active()` and check that the open entry still matches the target before stopping:
```ts
await queue.run(async () => {
	const live = await gateway.active();
	const match = live.some((a) => a.taskPath === target.taskPath && a.entry?.startTime === target.startTime);
	if (!match) throw new AlreadyStopped(); // map to "already-stopped"
	await gateway.stop(target.taskPath, { source: MUTATION_SOURCE, reason: "user stop", correlationId: newCorrelationId() });
});
```
(This means widening the `gateway` Pick to include `active`.) If you don't want the extra read, remove `startTime` from `StopTarget` and correct the comment, so it no longer promises session-exact stops.

### WR-02: Clicking the title uses `openLinkText`, which creates a new note when the path no longer resolves

**File:** `src/ui/TimerPaneView.ts:176-185`
**Issue:** `openLinkText(primary.taskPath, "", newLeaf)` treats a vault path as link text. If the link does not resolve, Obsidian creates a new empty note at that path. The snapshot can be stale: a rename or delete only triggers a 200 ms debounced refresh, a failed refresh keeps the old snapshot, and the pane may be clicked right after a sync. In those cases a click creates a stray empty `.md` file in the user's vault where the task used to be. The link parser also reads `#`, `^` and `|` in the path as subpath or alias syntax, so a task file whose name contains one of those characters opens the wrong target, or creates a new one.
**Fix:** Resolve the exact file and open it directly:
```ts
const file = this.app.vault.getFileByPath(primary.taskPath);
if (!file) { this.services.store.requestRefresh(); return; }
void this.app.workspace.getLeaf(newLeaf).openFile(file).catch(/* log */);
```

### WR-03: "TaskNotes needs an update" appears when TaskNotes is new enough but lacks the API version or capability

**File:** `src/tasknotes/TaskNotesBridge.ts:225-228`, `src/ui/TimerPaneView.ts:257-264`
**Issue:** When `api.apiVersion !== 1`, or one of `REQUIRED_CAPABILITIES` is missing, the bridge sets `{ kind: "incompatible", version }` with the real installed version, for example `4.13.8` or a future `5.0.0` whose API is v2. The view then shows "This pane needs TaskNotes 4.10 or later. Update it…" next to "Installed version: 4.13.8". That message contradicts itself, and following it (updating TaskNotes) cannot fix the problem. A future TaskNotes with `apiVersion: 2` would get exactly this message.
**Fix:** Tell the two causes apart in the state, for example `{ kind: "incompatible"; version; reason: "too-old" | "unsupported-api" }`. Render separate copy for `unsupported-api`, such as "This version of TaskNotes isn't supported by this pane yet (needs Runtime API v1 with time tracking)."

### WR-04: `npm run dev` does not copy `styles.css` edits to the dev vault, although the README says it does

**File:** `esbuild.config.mjs:18-32`, `README.md:43`
**Issue:** `devVaultAssets` copies `manifest.json` and `styles.css` only in `onStart`, which runs when esbuild rebuilds. esbuild's watcher only watches files in the bundle graph. `styles.css` is not imported from `src/main.ts`, so editing it never triggers a rebuild and never reaches `dev-vault/.obsidian/plugins/tasknotes-timer-pane/`. README line 43 says "Hot Reload reloads the plugin about 0.75 s after `main.js` or `styles.css` changes", which implies CSS edits show up live. In practice they stay stale until the next TS change, which is misleading during UI work.
**Fix:** Watch the two asset files separately in watch mode, for example `fs.watch("styles.css", () => copyFile(...))` (same for `manifest.json`), started next to `context.watch()`. Or correct the README to say CSS changes need a TS save or `npm run deploy`.

## Info

### IN-01: Three copies of the error-to-string helper

**File:** `src/state/TimerStore.ts:18-20`, `src/tasknotes/TaskNotesBridge.ts:92-94`, `src/model/errors.ts:18-22`
**Issue:** `TimerStore.errorMessage` and `TaskNotesBridge.describeError` are the same function. A third variant in `errors.ts` behaves differently (it returns `""` for non-strings). Two functions named `errorMessage` that behave differently make mistakes easy.
**Fix:** Export `describeError` once from `src/model/errors.ts` and use it in both modules.

### IN-02: Every log line, including informational ones, goes to `console.error`

**File:** `src/main.ts:17`, `src/tasknotes/TaskNotesBridge.ts:250`
**Issue:** The shared `log` sends "TaskNotes is still loading after 30 s; the pane keeps checking every 5 s" and similar status messages to `console.error`. That makes the console look like something failed.
**Fix:** Split the dependency into `log`/`warn`, or use `console.warn` for the loading message.

### IN-03: The `role="link"` title also activates on Space

**File:** `src/ui/TimerPaneView.ts:115-119`
**Issue:** Native links activate on Enter only. Space activation is button behavior, so this element behaves like neither ARIA role. It is minor, but it goes against the accessibility intent noted in the comments.
**Fix:** Handle only `Enter`, or change the role to `button`.

### IN-04: An api swap that stays in `ready` does not trigger a refresh

**File:** `src/tasknotes/TaskNotesBridge.ts:230-232`, `325-331`
**Issue:** If the api object changes but no `unloading` event was seen (for example, TaskNotes is disabled and re-enabled within one 5 s probe interval and its unload hook fails), `attach(newApi)` runs. The following `setState({ kind: "ready" })` is then dropped as a duplicate, so no state listener fires and the store keeps the old api's snapshot until the next data event or the 45 s resync.
**Fix:** Call `this.emitData()` after `attach(api)` when the api identity changed.

### IN-05: The seed script's `.obsidian` guard can be bypassed through Windows name normalization

**File:** `scripts/seed-dev-vault.mjs:45-53`
**Issue:** The guard compares the first path segment to `.obsidian`. Win32 strips trailing dots and spaces, so a seed folder named `.obsidian.` or `.obsidian ` passes the check and still writes into `dev-vault/.obsidian/`. The input is tracked repo content and this is a dev-only tool, so the risk is low. Still, the script's header promises this can never happen.
**Fix:** Normalize before comparing: `first.replace(/[. ]+$/, "").toLowerCase() === ".obsidian"`.

---

_Reviewed: 2026-10-15T02:51:45Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
