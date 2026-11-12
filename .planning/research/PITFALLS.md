# Pitfalls Research

**Domain:** Adding daily task staging (v0.3 "Staging Tasks") to an existing Obsidian companion plugin that drives TaskNotes through Runtime API v1
**Researched:** 2026-11-12
**Confidence:** HIGH for the TaskNotes write, read and recurring behavior below, which was read directly from the TaskNotes 4.13.8 bundle in `dev-vault/.obsidian/plugins/tasknotes/main.js` (minified names quoted so they can be found again). MEDIUM for Sync and multi-device behavior, which comes from Obsidian typings and general knowledge rather than a test. The Personal Vault runs TaskNotes **4.13.0**, but these findings come from **4.13.8**. Re-check the write and delete paths against 4.13.0 before relying on them there.

The v0.1 pitfalls file is in git history. This file covers only what v0.3 adds.

---

## TaskNotes facts these pitfalls rest on (from the 4.13.8 bundle)

| # | Fact | Where in the bundle |
|---|------|------|
| F1 | `api.tasks.update(path, patch, ctx)` calls `requireTask`, then `taskService.updateTask(task, patch)`, with **no filtering or validation at the API layer**. `tasks.patch` is the same function. | `async updateTask(e,t,r){let a=await this.requireTask(e),i=await this.withMutationContext([a.path],r,()=>this.plugin.taskService.updateTask(a,t));return cr(i)}` |
| F2 | The frontmatter writer (`mapToFrontmatter` → `wz`) writes a user field only if its key is in `settings.userFields` **and** its value is not `undefined`. It looks for the value on the patch top level first, then in `patch.customProperties`. Unregistered top-level keys are dropped silently. | `for(let u of a)Object.prototype.hasOwnProperty.call(d,u.key)&&d[u.key]!==void 0?i[u.key]=d[u.key]:c&&...` |
| F3 | Mapped values are then applied with `m!==void 0&&(n[p]=m)`. **`null` is written as a value, not deleted.** `""` is written as an empty string. `undefined` is a no-op. | `dfe`: `Object.entries(u).forEach(([p,m])=>{m!==void 0&&(n[p]=m)})` |
| F4 | `patch.customFrontmatter` is applied **without any registration check**. `null` deletes the key and any other value sets it. This shape is **not** in the documented `TaskNotesTaskPatch` (`extends Partial<TaskInfo>`, `details?`), so it is an undocumented path. | `dfe`: `t.customFrontmatter&&Object.entries(t.customFrontmatter).forEach(([p,m])=>{m===null?delete n[p]:n[p]=m})` |
| F5 | The TaskInfo that `update` returns, and that the cache and the `task.updated` event receive, is `{...originalTask, ...updates}`. **It contains the key you sent even when nothing was written to disk.** The cache is updated straight from this merge. | `ufe`: `let c={...n,...e,...t,path:r,dateModified:a}` → `r.cacheManager.updateTaskInfoInCache(l,f)` → `r.emitter.trigger(nt,{...updatedTask:f})` |
| F6 | On read, `mapFromFrontmatter` copies a frontmatter key onto TaskInfo (top level and `customProperties`) **only if it is a registered user field**. If `staged` is not registered, the pane can't see it through any TaskNotes read API, even when it is in the file. | `if(a.length>0){...for(let d of a)e[d.key]!==void 0&&(c[d.key]=e[d.key],l[d.key]=e[d.key]);...o.customProperties=...}` |
| F7 | Every `updateTask` also writes `dateModified` and re-normalizes `tags`. Staging and unstaging are therefore real content edits that sync and show up in diffs. | `dfe`: `let d={tags:Yo(n.tags),...t,...r,dateModified:a}` |
| F8 | `api.settings.snapshot()` (capability `settings.snapshot`) returns a deep JSON copy of all TaskNotes settings, including `userFields: [{id, displayName?, key, type, defaultValue?}]`. | `getSettingsSnapshot(){return JSON.parse(JSON.stringify(this.plugin.settings))}`; user fields matched by `d.id` / `c.key` / `r.type==="date"` |
| F9 | A user field with a `defaultValue` is stamped onto **every newly created task**. | `Fqe(o, e.userFields, ...)` in task-creation defaults |
| F10 | `recurring.toggleCompleteInstance(path, date?)` is a **toggle**. If the computed instance is already in `complete_instances`, it removes it. | `Ece`: `d=!l.includes(o)` … `else{u.complete_instances=l.filter(T=>T!==o)` |
| F11 | When `date` is omitted, the target is the task's **`scheduled` date** (for non-completion-anchored tasks), not today. Only with no `scheduled` value does it fall back to the local calendar today. | `kM(n,e){if(e)return e;if(n.recurrence_anchor!=="completion"&&n.scheduled)return it(ne(n.scheduled));...}` |
| F12 | Even with an explicit date, a scheduled-anchored task **snaps to an occurrence**. If the date is not an occurrence, TaskNotes completes the latest uncompleted occurrence within one interval before it, otherwise the next one. The date recorded in `complete_instances` can therefore differ from the date you passed. | `XUe` / `Sce` |
| F13 | The `date` string goes through `new Date(t)`. A bare `YYYY-MM-DD` parses as UTC midnight, and TaskNotes formats instances with **UTC** getters (`ae`), so a bare date string round-trips correctly. An ISO string with a time, or a `Date` built from local time, can shift by one day. | `toggleRecurringComplete`: `i=t?new Date(t):void 0`; `ae(n)` uses `getUTCFullYear/Month/Date` |
| F14 | With occurrence notes (`occurrence_materialization === "on_completion"`, or an existing materialized occurrence), completion toggles the status of a **separate occurrence note** rather than only appending to the parent's `complete_instances`. | `toggleRecurringTaskCompleteWithOccurrenceNotes` → `findMaterializedOccurrence` / `materializeOccurrence` → `toggleStatus` |
| F15 | `completedDate` is the **local calendar date** at completion. It knows nothing about the pane's rollover hour. | `Ko()` uses `getFullYear/getMonth/getDate` |
| F16 | Runtime events carry `context` (`source`, `correlationId`, `reason`) and `before`/`after`. Our own writes come back to us as `task.updated` events. | `runtime-api.ts` `TaskNotesRuntimeEventPayload` (via WebFetch of upstream main) |

---

## Critical Pitfalls

### Pitfall 1: Trusting the `tasks.update` return value (or the next read) as proof the `staged` write landed

**What goes wrong:**
The user hasn't registered `staged`, or registered it under a different key, or the setting changed. The pane calls `api.tasks.update(path, { staged: "2026-11-12" })`, which resolves without error. The returned TaskInfo has `staged: "2026-11-12"`, and an immediate `tasks.list`/`tasks.get` shows it too. The card appears in Staged. Nothing was written to the file (F2). Seconds later, Obsidian's metadata cache re-parses the file, TaskNotes rebuilds the TaskInfo from disk (F6), and the card disappears. On restart it is gone for good.

**Why it happens:**
TaskNotes builds the returned task, the cached task and the event payload from `{...original, ...patch}` (F5), not from what it wrote. "No throw" and "the returned object has my field" both look like success.

**How to avoid:**
1. **Gate before writing.** Read `api.settings.snapshot().userFields` (gate on `hasCapability("settings.snapshot")`). Find the field whose `key === configuredKey`. Refuse to stage, and show the setup notice, when it is missing. Re-check on `lifecycle` `settings.changed`, and cache the result: snapshot is a full deep copy (F8), so don't call it per render.
2. **Verify after writing, from disk, not from TaskNotes.** After the update resolves, wait for that file's `app.metadataCache.on("changed")` event (or a short bounded timeout), then read `app.metadataCache.getFileCache(file)?.frontmatter?.[key]`. This is a read-only Obsidian API, not a TaskNotes internal. If the value is absent, show "Staging didn't save: register the `staged` user field in TaskNotes settings" and drop the optimistic card.
3. In the bridge, treat "registered" as a three-state value: `registered`, `missing`, `unknown` (capability absent, or snapshot threw). Use `unknown` to allow the write and rely on step 2. Never treat it as `missing` and block silently.
4. Test with a fake whose `update` mimics F2+F5: it returns the merged task but does not persist unregistered keys. The v0.2 fake almost certainly persists whatever it is given.

**Warning signs:**
A staged card appears and then vanishes within about 1 s. Staged tasks don't survive a restart. `grep staged` over the vault returns nothing after staging.

**Phase to address:**
The staging data-layer phase (the first v0.3 phase: bridge `stage`/`unstage`, registration check, setup notice). This must come before any UI depends on it.

---

### Pitfall 2: "Unstage deletes the key" done with `undefined`, `null` or `""`

**What goes wrong:**
Each obvious patch fails differently:
- `{ staged: undefined }`: a **silent no-op** (F2/F3). The task stays staged, and the card reappears on the next refresh.
- `{ staged: null }`: writes `staged: null` or an empty `staged:` into the YAML (F3). The key stays, so Q11 ("unstaging deletes the key") is violated, Bases and Dataview see a null property, and any `staged != null` or `staged exists` filter misreads it.
- `{ staged: "" }`: writes `staged: ""`, with the same problems plus a type mismatch for a `date` user field.

**Why it happens:**
TaskNotes has explicit delete-on-undefined code for core fields only (`Rqe` handles `due`, `scheduled`, `timeEstimate` and so on). User fields go through the generic `m!==void 0` writer. The only path that really deletes is the undocumented `customFrontmatter: { key: null }` (F4).

**How to avoid:**
- Decide this in the data-layer phase, prove it against the real bundle in the dev vault (write, then read raw frontmatter), and record it as a decision. Options:
  - **(a)** `api.tasks.update(path, { customFrontmatter: { [key]: null } })`. This deletes the key (F4) and goes through TaskNotes' lock, cache and events. Risk: it is not in the documented patch type, so feature-test it at bind time against a scratch value, or at least wrap it so a later TaskNotes change shows up as a verification failure (Pitfall 1, step 2) and not as silent data drift. Add it to the vendored type as an explicitly marked undocumented field, with a compile-time test pinning it.
  - **(b)** Accept `null` as the "unstaged" representation and amend Q11. This is simpler and fully documented-path, but leaves `staged: null` litter in every task ever staged.
- Recommended: **(a)**, with a fallback to (b) if the feature test fails, and a log line.
- Whatever is chosen, the **reader** must treat missing, `null`, `""`, and anything that isn't a valid `YYYY-MM-DD` the same way: not staged. Users edit frontmatter by hand, and TaskNotes' own edit modal may write an emptied user field back as `""`.
- Note that `customFrontmatter` with a non-null value **also bypasses registration** (F4). Don't use it to write `staged` as a way around the setup notice. Reads would still be blind without registration (F6), so the tab would stay empty.

**Warning signs:**
The ✕ button "works" but the card comes back. `staged: null` appears in files.

**Phase to address:**
Staging data-layer phase. Write a test for each of `undefined`, `null`, `""`, and key absent.

---

### Pitfall 3: Computing "today" with UTC or with millisecond subtraction (timezone, DST, rollover hour)

**What goes wrong:**
- `new Date().toISOString().slice(0, 10)` gives the **UTC** date. In UTC-5 after 7 PM, it stages tasks for tomorrow, so they vanish from a list filtered to `staged <= today`.
- `logicalDay = localDate(Date.now() - rolloverHour * 3600_000)` breaks on DST days. On the spring-forward day, 04:30 local is only 3 elapsed hours after midnight, so subtracting 4 h lands on 23:30 the previous day, and the rollover happens at 05:00 instead of 04:00. In autumn it happens an hour early.
- "Days staged" computed as `(Date.parse(today) - Date.parse(staged)) / 86_400_000` across a DST change gives 0.958 or 1.04, so `Math.floor` and `Math.round` disagree.
- Comparing `completedDate === logicalToday` fails between midnight and the rollover hour. TaskNotes writes the **calendar** date (F15), and the pane's logical day is still yesterday, so a task completed at 01:30 never shows in "Done today".

**Why it happens:**
Date-only values have no timezone, so every conversion through `Date` is a chance to shift a day. The rollover hour adds a second notion of "today" that TaskNotes doesn't share.

**How to avoid:**
- Write one pure module (`model/logicalDay.ts`, Obsidian-free, fully tested) and route every date through it:
  - `logicalDay(now: Date, rolloverHour): string`. Take the local calendar Y/M/D from `now`. If `now.getHours() < rolloverHour`, step back one calendar day with `new Date(y, m, d - 1)`, not by subtracting milliseconds. Format with local getters.
  - `daysBetween(a: "YYYY-MM-DD", b): number`. Parse both into `Date.UTC(y, m-1, d)` and divide by 86 400 000. UTC arithmetic has no DST.
  - `isValidDay(s)`: a strict `/^\d{4}-\d{2}-\d{2}$/` check plus a round-trip check. Also accept a datetime value and normalize it (`"2026-11-12T00:00"` → its first 10 characters), because Obsidian's property editor can turn a date property into a datetime.
- Write `staged` as the **logical** day. Staging at 01:00 belongs to the previous logical day, consistent with the list.
- Build "Done today" mainly from the plugin's own record (`{path, logicalDay, completedAt}`). Use `completedDate` only as a secondary signal, matched against **both** the logical day and the calendar day of the record's timestamp.
- For recurring tasks, pass the logical day as a bare `YYYY-MM-DD` string (F13). Never pass a `Date`, `toISOString()` or a datetime.
- Tests: freeze the clock (Vitest `vi.setSystemTime`) and set `TZ` per test file, or use the `process.env.TZ` matrix trick, at minimum for `America/New_York` (both DST transitions), `UTC`, `Pacific/Auckland`, and a non-hour-offset zone (`Asia/Kolkata`). Cover rollover hour 0 and 23, and the change of rollover setting mid-day.

**Warning signs:**
Tasks staged in the evening vanish. Off-by-one "staged 2 days" right after a DST weekend. Done today is empty after a late-night completion.

**Phase to address:**
Staging data-layer phase (the module and its tests), consumed by the rollover / Done-today phase.

---

### Pitfall 4: Rollover never fires while Obsidian stays open (overnight, sleep/wake, clock changes)

**What goes wrong:**
The Staged list and "Done today" are computed once per data refresh. If Obsidian is left open overnight and nothing in TaskNotes changes, the pane keeps showing yesterday's Done today and yesterday's days-staged counts. After a laptop wakes, timers were suspended and the first tick may be hours late. If the device clock is corrected backwards (NTP, or manual and timezone travel), the logical day goes **backwards** and a naive "prune records older than today" either loses today's record or resurrects yesterday's.

**Why it happens:**
Rollover is a time event, not a data event. The v0.2 store only refreshes on TaskNotes events, the 45 s safety resync, and the wake-gap detection in the view tick.

**How to avoid:**
- Derive `logicalDay` in the existing 1 s view tick, which already does wake-gap detection (`TimerPaneView` around line 705). When it differs from the last rendered day, re-render both tabs and request a store refresh. Don't schedule a `setTimeout` for 04:00: it is wrong after sleep, DST or a clock change.
- Prune the Done-today record **only when the logical day moves forward** past an entry's day, and only on load or a forward rollover. If the day goes backwards, keep everything and log once.
- Bound the Done-today record (keep only entries for the current logical day plus a small cap, mirroring `MAX_STORED_ORDER`), so a clock jumping far forward and back can't grow data.json.
- Changing the rollover hour in settings recomputes `logicalDay` immediately. Make sure it doesn't prune the record (treat it like a backwards move until the next forward boundary).

**Warning signs:**
At 9 AM, "Done today" still lists last night's work until you click something. Records disappear after the clock is corrected.

**Phase to address:**
Rollover / Done-today phase. Its UAT must include a native "leave it open across the rollover hour" check and a sleep/wake check. Per the v0.2 retrospective, schedule these as an explicit hands-on session; don't let them get skipped.

---

### Pitfall 5: A refresh-driven "cleanup" write loops forever on our own `task.updated` echoes

**What goes wrong:**
It is tempting to reconcile in the refresh: "task is completed but still has `staged` → clear it", "staged date is in the future → fix it", "recurring instance done today → clear `staged`". Each fix is a `tasks.update`, which emits `task.updated` (F5/F16), which the bridge turns into `emitData()` → refresh → reconcile again. With a working write it settles after one extra round. When the write is **silently dropped** (Pitfall 1: unregistered key, or `undefined`), the condition never clears and the plugin writes to the file in a tight loop. Every loop also bumps `dateModified` (F7), producing Sync churn and conflict risk.

**Why it happens:**
Read paths that write. The v0.2 design never wrote from a refresh, but staging introduces state that seems to need hygiene.

**How to avoid:**
- **Rule: refresh and render never write.** All `staged` writes come from explicit user actions (stage, unstage, ✓ complete) through the existing `WriteQueue`. This matches the "unfinished roll forward without writes" decision and the memory note to defer to TaskNotes' own mechanisms.
- Handle stale state on **read**, not by writing. A task in a completed status, archived, or (for recurring tasks) with today in `complete_instances` is excluded from Staged regardless of its `staged` value. A future `staged` date is shown as not yet due (or treated as today; decide in discuss), never rewritten.
- Tag every pane write with `context.source = "tasknotes-timer-pane"` (already done for time writes). Coalesce echoes through the existing 200 ms debounce. Don't try to skip our own echoes entirely: the refresh is cheap and keeps the pane honest.
- If a cleanup write is ever added, guard it with a per-`(path, value)` "attempted this session" set so it can run at most once.

**Warning signs:**
`dateModified` on a task keeps changing while idle. The console shows repeated updates. Obsidian Sync shows constant uploads.

**Phase to address:**
Staging data-layer phase (state the rule in the plan). Check it in every later phase's code review.

---

### Pitfall 6: Recurring ✓ completes the wrong instance, un-completes, or closes the series

**What goes wrong:**
- Calling `api.tasks.complete(path)` on a recurring task sets a completed status on the whole series (that is why Q16 exists). The branch must be on fresh data at click time.
- Calling `api.recurring.toggleCompleteInstance(path)` **with no date** completes the instance on the task's `scheduled` date (F11), which is often not today, for example an overdue weekly task.
- Passing today on a non-occurrence day completes a **different, snapped** instance (F12). "Done today means `complete_instances` includes today" (Q16) is then false, so the task never appears in Done today.
- A double click, a retry after a timeout, or the button staying enabled while the write is in flight hits the toggle twice and **un-completes** it (F10).
- With occurrence notes (F14), completion changes a **separate occurrence note**. The parent's `complete_instances` may change later or not at all, and an extra file appears. Watching only the parent misses it.
- After the instance completes, the series' status stays open, so a status-based "unfinished" filter keeps showing the task as staged.

**Why it happens:**
The recurring API is a toggle with smart date resolution, designed for calendar UIs, not "I did it today".

**How to avoid:**
- At click time, re-read the task (`api.tasks.get`) inside the `WriteQueue`. If `task.recurrence` is set, use the recurring path. Otherwise use the v0.2 completion path with the user's completed-status preference.
- Always pass the logical day explicitly as a bare `YYYY-MM-DD` (F13).
- **Before calling the toggle, check whether `complete_instances` already contains the target day.** If it does, don't call it (it would un-complete). Treat the task as done and just clear `staged`.
- After the call, read the returned or fresh TaskInfo and record what changed in the plugin's Done-today record: the path and logical day the user acted on, not what TaskNotes chose. Build Done today from **that record**, not from `complete_instances.includes(today)`.
- Disable the ✓ button from click until the queue entry settles (the v0.2 busy-key pattern).
- Order: complete first, then clear `staged`. If clearing fails, the task is done but still staged. The read-side filter (Pitfall 5) hides it from Staged, and the record shows it in Done today. Tell the user with a notice; don't retry automatically.
- Gate on `hasCapability("recurring.write")`. Without it, disable ✓ for recurring tasks and show a notice. Never fall back to `tasks.complete`.
- The dev vault needs a seeded recurring task with `scheduled` in the past, one completion-anchored task, and, if the feature is used, one with occurrence notes.

**Warning signs:**
A recurring task's next due date jumps unexpectedly. A recurring task is missing from Done today. A second click brings a task back.

**Phase to address:**
Completion / Done-today phase. Flag it for **deeper research during planning** (occurrence-notes mode and the 4.13.0 vs 4.13.8 difference).

---

### Pitfall 7: data.json and frontmatter diverge across devices (Obsidian Sync, git)

**What goes wrong:**
`staged` lives in markdown frontmatter, which Sync merges per file. The staged order and the Done-today record live in `.obsidian/plugins/tasknotes-timer-pane/data.json`. That file syncs only if the user enabled community-plugin settings sync, and then as a whole file, with the last writer winning.
- Device B never sees A's order, so A's newly staged tasks join at the bottom on B (acceptable by design: Q3).
- Worse: B keeps an in-memory copy loaded at startup. `persistAll` rewrites the **whole** file on B's next save (a pause, a reorder, a settings change), wiping A's order, A's Done-today record **and A's pause records**.
- `CardOrderStore.load()` runs **once only** (`if (this.loaded) return;`), so a store modelled on it can't take an external reload.

**Why it happens:**
v0.2 had a single-device assumption baked into its single-writer design.

**How to avoid:**
- Implement `Plugin.onExternalSettingsChange()` (in `obsidian.d.ts` `@since 1.5.7`, below the 1.12.2 floor). In it, `loadData()` and **merge**: incoming order first, then append local paths it doesn't know; Done-today as the union for the current logical day; settings take the incoming values. Then re-render. Give the new stores a `replace()` or `merge()` method separate from the one-shot `load()`.
- Keep frontmatter the source of truth for **membership**. data.json only orders and annotates it. Order entries for paths that aren't staged are ignored (as `orderTimers` already does for dead keys), so a stale order never adds tasks.
- Add every new data.json key (`stagedOrder`, `doneToday`, `stagedKey`, `rolloverHour`, `activeTab` if stored) to `OWNED_KEYS` in `main.ts`. Otherwise `extrasOf()` keeps the loaded copy as an "extra" and writes it back. For a key omitted when empty (like `cardOrder`), the stale extra **resurrects** the old value.
- Version the new records the way `pauseRecordsVersion` is versioned, and keep loaders tolerant of other devices' (older or newer plugin) data.

**Warning signs:**
The order resets on one device after using the other. Pauses disappear after using a second device. A cleared list comes back after restart.

**Phase to address:**
Two-tab / ordering phase (order store and `OWNED_KEYS`). Do the `onExternalSettingsChange` merge in the same phase, since that is where the second persisted list appears. Multi-device verification is MEDIUM confidence. If the user doesn't sync plugin settings, note that and keep the merge anyway (it is cheap).

---

## Moderate Pitfalls

### Pitfall 8: Staged tasks renamed, moved, deleted or auto-archived

**What goes wrong:**
The staged order and Done-today record are keyed by path. A rename leaves an order entry pointing at nothing, so the task jumps to the bottom. A delete leaves junk in data.json. TaskNotes' auto-archive on completion (`handleAutoArchive` in `updateTask`) or `storeTitleInFilename` title edits can **move or rename the file during our own completion write**, so the Done-today record we just wrote points at the old path. A rename that arrives through Sync may show up as delete plus create.

**How to avoid:**
- Reuse the v0.2 pattern in `main.ts`: synchronous `vault.on("rename")` / `vault.on("delete")` handlers that remap or drop paths in the staged order and Done-today record, including folder renames (prefix match, as `pauses.renamePath` does), then `store.requestRefresh()`.
- Record Done-today entries keyed by the path in the **returned** TaskInfo from the completion call, not the pre-click path.
- Expect delete-plus-create from Sync. The task loses its place and rejoins at the bottom. Accept that. Don't try to match by title.
- `staged` itself moves with the file (it is frontmatter), so membership is preserved without any write.

**Phase to address:** Two-tab / ordering phase (order remap). Completion phase (returned-path recording).

### Pitfall 9: The user changes the configured key, or picks a dangerous key

**What goes wrong:**
- After a key change, tasks staged under the old key silently disappear from Staged. Their frontmatter still carries the old key forever.
- Keys that collide with TaskNotes core field names or TaskInfo properties (`status`, `scheduled`, `due`, `title`, `path`, `tags`, `archived`, `timeEntries`, or any value in `settings.fieldMapping`) make `task[key]` read the wrong thing. They could also let an "unstage" clobber a core field: `{ status: null }` would go through the core mapper, not the user-field path.
- If the user registers the field with a **default value**, TaskNotes stamps it onto every new task (F9), so every task created becomes "staged" on that date.
- If the field is registered as `text` or `list` rather than `date`, values may come back as arrays or with commas (`Array.isArray(l)?l.join(", "):l` appears in the creation paths).

**How to avoid:**
- Validate the key in the settings tab: non-empty, trimmed, not a core field name or a `fieldMapping` value, not a reserved TaskInfo property. Show inline whether it is registered, and its type (from the snapshot).
- On a key change, show a notice saying tasks staged under the old key won't appear. Don't bulk-migrate in v0.3 (that would be many writes, and conflicts with "no writes on read"). A "migrate" command can be a later idea.
- The setup notice should say: type **date**, **no default value**, key exactly `<configured key>`.
- Parse values defensively. Accept a string; take the first element of an array; ignore anything else.

**Phase to address:** Staging data-layer phase (validation and setup notice). Settings work in the same phase.

### Pitfall 10: Sending more than the one field in `tasks.update`

**What goes wrong:**
Spreading a TaskInfo into the patch (`{...task, staged: day}`) makes TaskNotes rewrite every mapped field, including `timeEntries`. That races with a running timer's own writes and can resurrect a just-closed entry. `title` can trigger a file rename under `storeTitleInFilename`. Even the minimal patch rewrites `dateModified` and `tags` (F7).

**How to avoid:**
Send exactly `{ [key]: value }` (or the `customFrontmatter` form for deletion). Run stage/unstage through the same `WriteQueue` as time writes, so a stage and a stop on the same task never interleave inside the pane. Pin this with a test that asserts the exact patch object.

**Phase to address:** Staging data-layer phase.

### Pitfall 11: The same task in both tabs breaks keyed DOM reuse

**What goes wrong:**
A running staged task appears in both Staged and Timers. If both tabs share one card map, keyed by `sessionKey` or path, one DOM node gets moved between containers, the title-chip `Component` is unloaded under the other tab, or drag code reorders the wrong list. The two tabs also use different keys: Timers are keyed by **session** (`taskPath` + `startTime`), and staged rows by **path**, since one staged row survives pause/resume and new sessions.

**How to avoid:**
Give each tab its own card map, order store and drag handlers. Make the keys explicit (`staged:<path>`, `timer:<sessionKey>`). Factor the card builder so both tabs share rendering code but not instances. The existing `moveKey` / `moveKeyBy` helpers are pure and reusable as they are.

**Phase to address:** Two-tab / ordering phase.

### Pitfall 12: Re-render and scan cost grows with tabs and staging

**What goes wrong:**
- Staged needs `tasks.list` (or `query.tasks`) on top of `time.active()`. Calling it per event, per tab or per card (N × `tasks.get`) multiplies cost. TaskNotes deep-copies each TaskInfo it returns (`cr(...)`).
- Rendering the hidden tab, or calling `MarkdownRenderer.render` for every staged title chip on every refresh, costs far more than the 1 s elapsed-text update.
- Calling `settings.snapshot()` (a full deep copy of TaskNotes settings, about 18 KB in the dev vault) per refresh.

**How to avoid:**
- One debounced store refresh (the existing 200 ms trailing debounce) fetches `active()` and **one** task list. Both tabs derive from that single snapshot. If `query.tasks` with a `where` on the user field is supported (capability `query.tasks`), use it to cut the payload. Otherwise filter in memory; at the Personal Vault's 38 tasks this is free, and it stays fine into the low thousands.
- Render only the active tab's cards. Mark the other dirty and render it on switch. The 1 s tick updates only elapsed `textContent` of visible running cards.
- Re-render a title chip only when its title inputs change (the v0.2 "title render generation" logic). Don't regenerate chips on tab switch.
- Cache the registration check. Invalidate it on `settings.changed`.

**When it breaks:** A noticeable lag on each TaskNotes event at roughly 2–5k tasks if `tasks.list` runs undebounced, or per tab. Chip re-rendering becomes visible at about 20 staged cards.

**Phase to address:** Two-tab / ordering phase (render strategy). Data-layer phase (single list fetch).

### Pitfall 13: Pomodoro-owned timers on staged tasks

**What goes wrong:**
Pomodoro-owned entries stay hidden (v0.3 decision). A staged task that a Pomodoro is timing therefore looks idle and offers ▶ start. Clicking ✓ on it could reach completion code that "stops every active entry for the path", including the Pomodoro's, which orphans the Pomodoro session (the exact v0.2 protection).

**How to avoid:**
Reuse v0.2's ownership check inside the queue: refuse start with the existing notice, and in the complete path stop only regular entries matched by exact `(taskPath, startTime)`. Consider a muted "Pomodoro running" hint on the staged card (display only, no controls), so start isn't offered without any explanation. Confirm this in discuss, since Q25 rejected full Pomodoro display.

**Phase to address:** Two-tab phase (card states). Completion phase (complete path).

### Pitfall 14: Display-name rename breaking things that are keyed by strings

**What goes wrong:**
Renaming to "TaskNotes Task Control" is safe **only** if the `manifest.json` `name` alone changes. Changing any of these breaks existing installs:
- `id` (`tasknotes-timer-pane`): a new plugin folder, so data.json, BRAT tracking and hotkeys are lost.
- `VIEW_TYPE_TIMER_PANE`: saved workspace leaves don't restore, and an orphaned "plugin no longer active" leaf appears.
- Command ids (`open-timer-pane`): user hotkeys are bound to `tasknotes-timer-pane:open-timer-pane`.
- CSS class prefixes: user snippets.
- The GitHub repo name: BRAT stores `owner/repo`.

**How to avoid:**
Change `name`, `description`, `getDisplayText()`, the ribbon tooltip and command **names** only. Keep every id and string key. BRAT needs a GitHub release whose tag is exactly `0.3.0` (no `v`, per `.npmrc` `tag-version-prefix=""`), with `main.js`, `manifest.json` and `styles.css` as assets, and `manifest.json` `version` equal to the tag. Lint consequences (from `eslint-plugin-obsidianmd` 0.4.2 in node_modules):
- `validate-manifest` forbids the words "obsidian" and "plugin" in the name and checks the description format.
- `commands/no-plugin-name-in-command-name` compares command names against the **new** manifest name, so "Open TaskNotes Task Control" would fail; "Open task control pane" passes.

**Phase to address:** Rename/release phase (last). Add a test that pins `VIEW_TYPE`, command ids and the manifest `id`.

---

## Minor Pitfalls

### Pitfall 15: Obsidian review-bot lint rules tripped by tab UI

**What goes wrong:**
Tab code commonly does `el.style.display = "none"` (`no-static-styles-assignment`), uses `document.addEventListener` for drag (`prefer-active-doc`, which matters in popout windows), detects mobile with `navigator.userAgent` (`platform`), injects a `<style>` element (`no-forbidden-elements`), or writes Title Case labels such as "Done Today" or "Staged Tasks" (`ui/sentence-case`). Settings headings made with `createEl("h3")` fail `settingsTab/no-manual-html-headings`. Any API newer than 1.12.2 fails `no-unsupported-api`.

**How to avoid:**
- Toggle CSS classes or `el.toggle(bool)`.
- Use `el.doc` / `activeDocument` for document-level listeners.
- Use `Platform.isMobile` from `obsidian` for showing the up/down buttons. Better still, always render them as visually compact buttons, since they also serve keyboard and accessibility users.
- Keep labels in sentence case ("Done today", "Staged", "Timers").
- Use `new Setting(containerEl).setHeading()` for a "Staging" settings section.
- Run `npm run lint` in each phase's verification.

**Phase to address:** Two-tab phase. Settings work in the data-layer phase.

### Pitfall 16: Tab state persisted in the wrong place

**What goes wrong:**
Storing the active tab in data.json makes it shared across panes and devices, and adds a write per click, which adds Sync churn and conflicts (Pitfall 7). Not storing it at all resets the pane to Staged on every restart.

**How to avoid:**
Store the active tab as **view state** (`getState()` / `setState()` on the `ItemView`). Obsidian then saves it in `workspace.json` per leaf and restores it with the leaf, with no data.json write. Keep the per-tab **order** in data.json (that one is meant to persist).

**Phase to address:** Two-tab phase.

### Pitfall 17: Touch and drag on mobile

**What goes wrong:**
HTML5 drag-and-drop events don't fire from touch on Obsidian mobile, so v0.2's drag reorder silently does nothing there. Up/down buttons that move a row by one place (`moveKeyBy`) give no focus feedback, so a user can't tell which row moved.

**How to avoid:**
Show up/down buttons on mobile (Q5). Keep focus on the moved row's button after the re-render, and disable "up" on the first row and "down" on the last. Mobile is best effort and was verified on desktop only, so test once in Obsidian's mobile emulation (`app.emulateMobile(true)` in the dev console).

**Phase to address:** Two-tab / ordering phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Use the `update` return value as write confirmation | No metadata-cache wait | Phantom staged cards whenever the field isn't registered (Pitfall 1) | Never |
| Unstage with `{ staged: null }` | Documented patch path | `staged: null` litter in every touched task, and a Q11 violation | Only as the fallback if the `customFrontmatter` feature test fails |
| `customFrontmatter: { key: null }` for deletion | Real key deletion | Undocumented, so it can break in a TaskNotes update | Acceptable with a bind-time feature test and the verify-from-disk check |
| `toISOString().slice(0,10)` for dates | One line | Off-by-one days in every non-UTC zone | Never |
| Reconcile `staged` in refresh (auto-clear) | Tidier frontmatter | Write loops and Sync churn (Pitfall 5) | Never in v0.3 |
| Copy `CardOrderStore` as-is for the staged order | Fast | No external reload or merge, so multi-device clobbering (Pitfall 7) | Only if `replace()`/`merge()` is added |
| Done-today from `complete_instances.includes(today)` | No plugin record | Misses snapped and late-night completions (Pitfalls 3 and 6) | Never as the primary signal |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `api.tasks.update` | Assume unregistered keys throw | They are dropped silently (F2). Gate on `settings.snapshot().userFields` and verify from `metadataCache` |
| `api.tasks.update` | Delete with `undefined` | No-op (F3). Use `customFrontmatter: {key: null}` (F4), behind a feature test |
| `api.recurring.toggleCompleteInstance` | Omit `date` | That defaults to the `scheduled` date (F11). Always pass the logical day as a bare `YYYY-MM-DD` |
| `api.recurring.toggleCompleteInstance` | Call it when already complete | It un-completes (F10). Check `complete_instances` first |
| `api.tasks.complete` | Use it on recurring tasks | It closes the series. Branch on fresh `task.recurrence` |
| `api.settings.snapshot` | Call it per render | It is a deep JSON clone. Cache it and invalidate on `settings.changed` |
| TaskNotes events | Write in response to `task.updated` | Echo loop. Refresh only, never write |
| TaskNotes user field config | Register `staged` with a default value | Every new task becomes staged (F9). The setup notice must say "no default" |
| Obsidian data.json | Whole-file save with a stale in-memory copy | Implement `onExternalSettingsChange` and merge |
| `completedDate` | Compare to the logical day | It is the calendar day (F15). Use the plugin's record |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `tasks.list` per event and per tab | Lag after each TaskNotes write | One debounced fetch shared by both tabs | About 2–5k tasks undebounced |
| `tasks.get` per staged card | N round trips and N deep copies | Derive from the single list snapshot | About 50+ staged cards |
| Re-rendering hidden-tab cards and chips | CPU each second, chip flicker | Render the active tab only; chips only on input change | About 20 cards |
| `settings.snapshot()` per refresh | GC churn | Cache it | Any scale (wasteful) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Using the configured key unvalidated as a frontmatter or TaskInfo property name | Overwriting core fields (`status`, `timeEntries`), or prototype keys (`__proto__`) | Validate against a denylist of core and mapped fields plus `^[A-Za-z][\w-]*$` |
| Trusting data.json order and record arrays from another device | Unbounded growth, odd types | Reuse the `loadCardOrder` style: cap, dedupe, type-check, never throw |
| Logging paths or task titles in errors | Private task names in console logs shared for support | Keep v0.2's "message never carries a path" rule |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Staging fails silently when the field is unregistered | "Staging is broken" | A setup notice in the Staged tab with exact instructions (key, type date, no default), re-checked on `settings.changed` |
| Staged card offers start while a hidden Pomodoro times it | Confusing refusal notice | A muted Pomodoro hint, or at least a clear notice (Pitfall 13) |
| "Days staged" shows "0 days" on the first day | Noise | Show nothing on day 0, then "2d" and so on |
| Future `staged` dates (another device's clock, hand edits) vanish | "My task disappeared" | Decide in discuss: show them as today, or in a muted "upcoming" note |
| Done today reshuffles when timers stop | Lost place | Done today in completion order, separate from the manual staged order |

## "Looks Done But Isn't" Checklist

- [ ] **Stage:** verified with the field **unregistered**. The setup notice shows, no phantom card appears, and the raw file is unchanged.
- [ ] **Stage:** raw frontmatter (not TaskInfo) shows `staged: YYYY-MM-DD` with the **logical** day at 01:00 (before rollover) and at 23:00 in a negative-UTC zone.
- [ ] **Unstage:** the key is **gone** from the raw file (not `null`, not `""`).
- [ ] **Reader:** missing, `null`, `""`, an array, and a datetime value all handled.
- [ ] **Complete (non-recurring):** stops only regular entries, uses the completed-status preference, clears `staged`, records Done today under the **returned** path.
- [ ] **Complete (recurring):** passes an explicit date, doesn't un-complete on a second click, isn't closed by the series, appears in Done today when TaskNotes snapped the date, and works with past-`scheduled` and completion-anchored seeds.
- [ ] **Rollover:** fires with Obsidian left open across the hour, after sleep/wake, after a backwards clock change (no lost records), and on DST transition days (unit tests).
- [ ] **Order:** survives restart, a rename (including a folder rename), a delete, and an external data.json change. Pause records survive a second device saving.
- [ ] **OWNED_KEYS:** includes every new data.json key.
- [ ] **Tabs:** active tab restored per leaf via view state; independent orders; the same task in both tabs renders correctly.
- [ ] **No writes on read:** the idle dev vault shows no `dateModified` changes over 5 minutes with the pane open.
- [ ] **Rename:** `id`, `VIEW_TYPE`, command ids unchanged; an existing pane leaf restores after the update; BRAT updates from 0.2.0 to 0.3.0.
- [ ] **Lint:** `npm run lint` clean, including sentence case and command names against the new manifest name.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| `staged: null` litter shipped | LOW | Reader already treats null as unstaged. Optional one-time command to delete null keys via `customFrontmatter` |
| Write loop shipped | MEDIUM | Hotfix to remove the write from the refresh path. Users' `dateModified` values are noisy but not corrupt |
| data.json clobbered across devices | LOW–MEDIUM | Order rebuilds (tasks join at the bottom); Done today rebuilds from `completedDate` as the fallback. Lost pause records are the real loss, which is why the merge matters |
| Wrong recurring instance completed | MEDIUM | The user re-toggles that instance in TaskNotes' calendar or task menu. Record the targeted date in the Done-today record so the error is diagnosable |
| View type or id changed by accident | HIGH | Revert the string in a patch release. Users re-open the pane; data in a new folder must be copied by hand |

## Pitfall-to-Phase Mapping

v0.3 phases continue from v0.2's Phases 1–3. The names below are suggestions for the roadmapper.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Silent drop / phantom write | Phase 4: staging data layer | Fake mimics F2+F5; dev-vault test with the field unregistered; raw frontmatter check |
| 2 Delete semantics | Phase 4 | Raw file shows the key removed; feature test logged |
| 3 Dates / timezone / DST | Phase 4 (module), used in Phase 6 | TZ-matrix unit tests with a frozen clock |
| 5 No writes on read | Phase 4 rule, checked in all phases | Idle `dateModified` check; code review |
| 9 Key validation / default value | Phase 4 (settings) | Settings tests; setup-notice copy |
| 10 Minimal patch | Phase 4 | Test asserting the exact patch |
| 7 data.json merge, OWNED_KEYS | Phase 5: two tabs and ordering | `onExternalSettingsChange` test; extras test |
| 8 Rename / delete remap | Phase 5 (order), Phase 6 (record) | Vault event tests incl. folder rename |
| 11 Per-tab card maps | Phase 5 | Same task in both tabs |
| 12 Render / scan cost | Phase 5 | One list fetch per refresh (spy count) |
| 15–17 Lint, view state, mobile | Phase 5 | `npm run lint`; mobile emulation |
| 13 Pomodoro on staged | Phase 5 (display), Phase 6 (complete path) | Mixed Pomodoro UAT, as in v0.2 |
| 4 Rollover while open | Phase 6: completion, Done today, rollover | Native overnight and sleep/wake UAT session |
| 6 Recurring completion | Phase 6 (**needs deeper research**) | Seeded recurring fixtures; double-click test |
| 14 Rename safety | Phase 7: rename and release 0.3.0 | Pinned-id test; BRAT update from 0.2.0 |

## Sources

- TaskNotes 4.13.8 bundle, `C:\Users\ja384\Home\obsidian-tasknotes-timer-pane\dev-vault\.obsidian\plugins\tasknotes\main.js`, functions `updateTask` (API and `TaskUpdateService`), `dfe`, `wz`, `ufe`, `Rqe`, `Fqe`, `toggleRecurringComplete`, `toggleRecurringTaskCompleteWithOccurrenceNotes`, `Ece`, `kM`, `XUe`/`Sce`, `ae`, `Ko`, `getSettingsSnapshot`. Primary source; HIGH for 4.13.8.
- Upstream contract `callumalpass/tasknotes` `src/api/runtime-api.ts` (main), via WebFetch: `TaskNotesTaskPatch extends Partial<TaskInfo>`, `recurring.toggleCompleteInstance(path, date?, ctx?)`, `settings.snapshot` capability, event payload `context`/`before`/`after`, capability list. MEDIUM per seam (summarized fetch), consistent with the bundle.
- `obsidian.d.ts` 1.14.4 in node_modules: `Plugin.onExternalSettingsChange` `@since 1.5.7`; `FileManager.processFrontMatter`. HIGH.
- `eslint-plugin-obsidianmd` 0.4.2 rules in node_modules: `validate-manifest` (forbidden words "obsidian", "plugin"), `commands/no-plugin-name-in-command-name` (defaults to the manifest name), `no-static-styles-assignment`, `prefer-active-doc`, `platform`, `no-forbidden-elements`, `ui/sentence-case`, `settingsTab/no-manual-html-headings`, `no-unsupported-api`. HIGH.
- This repo: `src/main.ts` (`OWNED_KEYS`, `extrasOf`, `persistAll`, vault rename/delete handlers), `src/state/CardOrderStore.ts` (one-shot `load`), `src/model/cardOrder.ts`, `src/tasknotes/TaskNotesBridge.ts` (event wiring), `src/state/TimerStore.ts` (200 ms debounce, 45 s resync), `.planning/RETROSPECTIVE.md` (skipped native UAT lesson), `.planning/research/STAGING-DECISIONS.md`.
- TaskNotes docs search (user fields live under Settings → Task Properties): [user fields](https://callumalpass.github.io/tasknotes/features/user-fields), [task properties](https://callumalpass.github.io/tasknotes/settings/task-properties). LOW, corroborating only.

---
*Pitfalls research for: v0.3 Staging Tasks (TaskNotes Task Control)*
*Researched: 2026-11-12*
