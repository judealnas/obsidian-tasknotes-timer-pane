# Phase 4: D-10 dev-vault spike findings

- **Date:** 2026-11-12
- **TaskNotes:** 4.13.8 (read live from `app.plugins.getPlugin("tasknotes").manifest.version`)
- **Obsidian:** 1.15.0 (installer 1.8.10); CLI prints an "installer is out of date" notice on every call, harmless
- **Dev vault:** `C:/Users/ja384/Home/obsidian-tasknotes-timer-pane/dev-vault` (the only vault the spike touches, D-09)
- **Driver:** `node scripts/staging-spike.mjs <mode>` (one-off, D-08), which runs `obsidian vault=dev-vault eval code=<guarded snippet>` through `execFile`

## CLI notes (how the driver talks to Obsidian)

- `vault=dev-vault` must come **before** `eval`. Placed after the command it is silently ignored and the
  snippet runs in the focused window. The first live run did exactly that: it targeted the Personal Vault
  and the inline guard threw `staging-spike: refusing vault c:/users/ja384/documents/obsidian vaults/personal vault`
  before any TaskNotes or vault call. The guard is the real boundary (D-09); the argument order is now fixed.
- `eval` prints `=> <value>` and awaits a promise only if it settles without a timer. A snippet that waits
  (`setTimeout`) prints nothing, so every mode runs as two guarded calls: a kickoff that stores the outcome
  on `window.__tntpSpike[mode]` and polls that read it back.
- A `code=` value with a colon and no space fails (exit 4294967295, no output), so snippets always contain
  spaces. The CLI rewrites `\n`-style escapes in values, so snippets contain no backslashes (self-tested).

## Q2 (before registration)

Command: `node scripts/staging-spike.mjs userfields`

```json
{
  "basePath": "C:\\Users\\ja384\\Home\\obsidian-tasknotes-timer-pane\\dev-vault",
  "tasknotesVersion": "4.13.8",
  "userFields": []
}
```

No user fields are registered before Task 2.

## Q3 baseline (before registration)

Command: `node scripts/staging-spike.mjs prepare` (first run created both tasks; the second run, shown here,
reused them and re-applied the same hand edit).

Scratch task paths:

- Plain: `TaskNotes/Tasks/Staging spike scratch.md`
- Weekly: `TaskNotes/Tasks/Staging spike weekly.md`

The plain task's `staged: 2026-11-12` was written through `app.fileManager.processFrontMatter` (simulated hand
edit while the field is unregistered), then read 1500 ms later.

```json
{
  "plain": {
    "path": "TaskNotes/Tasks/Staging spike scratch.md",
    "created": false
  },
  "weekly": {
    "path": "TaskNotes/Tasks/Staging spike weekly.md",
    "created": false
  },
  "plainTasksGet": {
    "staged": "(undefined)",
    "customProperties": "(undefined)"
  },
  "plainCachedFrontmatterStaged": "2026-11-12",
  "plainRawFrontmatter": "---\nstatus: open\npriority: normal\nscheduled: 2026-11-12\ndateCreated: 2026-11-12T18:21:23.944-05:00\ndateModified: 2026-11-12T18:21:23.944-05:00\ntags:\n  - task\nstaged: 2026-11-12\n---",
  "weeklyTasksGet": {
    "recurrence": "DTSTART:20261109;FREQ=WEEKLY;BYDAY=MO",
    "scheduled": "2026-11-09",
    "status": "open",
    "complete_instances": "(undefined)"
  },
  "weeklyRawFrontmatter": "---\nstatus: open\npriority: normal\nscheduled: 2026-11-09\nrecurrence: DTSTART:20261109;FREQ=WEEKLY;BYDAY=MO\ndateCreated: 2026-11-12T18:21:24.877-05:00\ndateModified: 2026-11-12T18:21:24.877-05:00\ntags:\n  - task\n---",
  "userFields": []
}
```

Baseline: while `staged` is unregistered, the hand-written value is in the raw file and in Obsidian's
metadataCache, but `tasks.get(path)` exposes neither `staged` nor `customProperties` (both undefined).

Side observations: `api.tasks.create` applied TaskNotes' defaults (the plain task got `scheduled: 2026-11-12`,
today), and TaskNotes stored the weekly recurrence with a `DTSTART:20261109;` prefix derived from `scheduled`.
The weekly task has no `complete_instances` key yet.

## Registration (Task 2, manual)

The user registered two user fields in the dev vault's TaskNotes settings without reloading TaskNotes or
Obsidian: `staged` (display name "Staged", type Date, no default) and the throwaway `spikedefault` (type Text,
default `x`). Verified with `node scripts/staging-spike.mjs userfields`:

```json
{
  "basePath": "C:\\Users\\ja384\\Home\\obsidian-tasknotes-timer-pane\\dev-vault",
  "tasknotesVersion": "4.13.8",
  "userFields": [
    {
      "id": "field_1794526982054",
      "displayName": "Staged",
      "key": "staged",
      "type": "date"
    },
    {
      "id": "field_1794527001250",
      "displayName": "Spike Default",
      "key": "spikedefault",
      "type": "text",
      "defaultValue": "x"
    }
  ]
}
```

## Post-registration probe

Command: `node scripts/staging-spike.mjs probe` (one guarded snippet, run once, questions in the order
q3, q2, q1, q4 so Q3 sees the task before any write). Afterwards `node scripts/staging-spike.mjs cleanup`
removed the `spikeTouch` key the Q3 probe added (`hadKey: true`). The probe is not idempotent (Q1 overwrites the
hand edit, Q4 advances the series), so these are the first-run results.

## Q3

Is a hand-written `staged:` (written while unregistered) visible on `tasks.get(path)` right after registering
`staged`, without reloading TaskNotes? Read before any file change (`beforeTouch`), then after a
`processFrontMatter` touch of an unrelated key `spikeTouch` and a 1500 ms wait (`afterTouch`).

```json
{
  "beforeTouch": {
    "staged": "2026-11-12",
    "customPropertiesStaged": "2026-11-12"
  },
  "afterTouch": {
    "staged": "2026-11-12",
    "customPropertiesStaged": "2026-11-12"
  },
  "rawFrontmatter": "---\nstatus: open\npriority: normal\nscheduled: 2026-11-12\ndateCreated: 2026-11-12T18:21:23.944-05:00\ndateModified: 2026-11-12T18:21:23.944-05:00\ntags:\n  - task\nstaged: 2026-11-12\nspikeTouch: 2026-11-12T23:45:27.868Z\n---"
}
```

Conclusion: visible immediately after registration, with no reload and no file change (`beforeTouch` already
shows it, as both a top-level `staged` and `customProperties.staged`; the baseline before registration had both
undefined). Phase 6 copy consequence: the setup notice does **not** need to tell the user to reload TaskNotes.

## Q2 (after registration)

`catalog.userFields()` verbatim, plus `Object.keys()` of each entry (`members`):

```json
{
  "userFields": [
    {
      "id": "field_1794526982054",
      "displayName": "Staged",
      "key": "staged",
      "type": "date"
    },
    {
      "id": "field_1794527001250",
      "displayName": "Spike Default",
      "key": "spikedefault",
      "type": "text",
      "defaultValue": "x"
    }
  ],
  "members": {
    "staged": ["id", "displayName", "key", "type", "defaultValue"],
    "spikedefault": ["id", "displayName", "key", "type", "defaultValue"]
  }
}
```

Conclusion: entries carry `id`, `displayName`, `key`, `type` and `defaultValue`. With a default set,
`defaultValue` holds the value (`"x"`). Without one, the `defaultValue` **key still exists** on the object but its
value is `undefined` (JSON.stringify drops it, `Object.keys` lists it). So "has a default" must be decided by the
value (`defaultValue !== undefined && defaultValue !== ""`), never by `"defaultValue" in field`.

## Q1

`tasks.update(plainPath, { staged: "2026-11-12" }, ctx)`, then `tasks.update(plainPath, { staged: null }, ctx)`
(no customFrontmatter), each followed by a 1500 ms wait.

```json
{
  "afterSet": {
    "returned": { "staged": "2026-11-12" },
    "rawFrontmatter": "---\nstatus: open\npriority: normal\nscheduled: 2026-11-12\ndateCreated: 2026-11-12T18:21:23.944-05:00\ndateModified: 2026-11-12T18:45:29.886-05:00\ntags:\n  - task\nstaged: 2026-11-12\nspikeTouch: 2026-11-12T23:45:27.868Z\n---",
    "tasksGet": { "staged": "2026-11-12", "customPropertiesStaged": "2026-11-12" }
  },
  "afterNull": {
    "returned": { "staged": null },
    "rawFrontmatter": "---\nstatus: open\npriority: normal\nscheduled: 2026-11-12\ndateCreated: 2026-11-12T18:21:23.944-05:00\ndateModified: 2026-11-12T18:45:31.889-05:00\ntags:\n  - task\nstaged:\nspikeTouch: 2026-11-12T23:45:27.868Z\n---",
    "cachedHasKey": true,
    "cachedStaged": null,
    "cachedTypeof": "null",
    "tasksGet": { "staged": null, "customPropertiesStaged": null }
  }
}
```

Conclusion: the null write keeps the key and leaves an empty YAML value (`staged:` on its own line). Obsidian's
metadataCache reads it as `null` (key present), and both the returned TaskInfo and `tasks.get(path)` report
`staged: null` (and `customProperties.staged: null`). Under the "missing, null, empty or non-date means not
staged" rule the leftover reads as **not staged**. After `cleanup` the plain task's frontmatter ends with the
line `staged:` (no value) right before the closing `---`.

## Q4

Weekly Monday task (`DTSTART:20261109;FREQ=WEEKLY;BYDAY=MO`, scheduled `2026-11-09`):
`recurring.toggleCompleteInstance(weeklyPath, "2026-11-11", ctx)` (a Wednesday), wait, read; then the identical
call again.

```json
{
  "offScheduleDay": "2026-11-11 (Wednesday)",
  "before": {
    "tasksGet": { "status": "open", "complete_instances": "(undefined)", "scheduled": "2026-11-09", "recurrence": "DTSTART:20261109;FREQ=WEEKLY;BYDAY=MO" },
    "rawFrontmatter": "---\nstatus: open\npriority: normal\nscheduled: 2026-11-09\nrecurrence: DTSTART:20261109;FREQ=WEEKLY;BYDAY=MO\ndateCreated: 2026-11-12T18:21:24.877-05:00\ndateModified: 2026-11-12T18:21:24.877-05:00\ntags:\n  - task\n---"
  },
  "afterFirst": {
    "returned": { "status": "open", "complete_instances": ["2026-11-09"] },
    "tasksGet": { "status": "open", "complete_instances": ["2026-11-09"], "scheduled": "2026-11-16", "recurrence": "DTSTART:20261109;FREQ=WEEKLY;BYDAY=MO" },
    "rawFrontmatter": "---\nstatus: open\npriority: normal\nscheduled: 2026-11-16\nrecurrence: DTSTART:20261109;FREQ=WEEKLY;BYDAY=MO\ndateCreated: 2026-11-12T18:21:24.877-05:00\ndateModified: 2026-11-12T18:45:33.890-05:00\ntags:\n  - task\ncomplete_instances:\n  - 2026-11-09\nskipped_instances: []\n---"
  },
  "afterSecond": {
    "returned": { "status": "open", "complete_instances": ["2026-11-09", "2026-11-16"] },
    "tasksGet": { "status": "open", "complete_instances": ["2026-11-09", "2026-11-16"], "scheduled": "2026-11-23", "recurrence": "DTSTART:20261109;FREQ=WEEKLY;BYDAY=MO" },
    "rawFrontmatter": "---\nstatus: open\npriority: normal\nscheduled: 2026-11-23\nrecurrence: DTSTART:20261109;FREQ=WEEKLY;BYDAY=MO\ndateCreated: 2026-11-12T18:21:24.877-05:00\ndateModified: 2026-11-12T18:45:35.888-05:00\ntags:\n  - task\ncomplete_instances:\n  - 2026-11-09\n  - 2026-11-16\nskipped_instances: []\n---"
  }
}
```

Conclusion: the off-schedule Wednesday was **not** recorded. The first call recorded the current scheduled
instance `2026-11-09` (the Monday before) and advanced `scheduled` to `2026-11-16`. The identical second call did
**not** toggle the first back off: it recorded the new scheduled instance `2026-11-16` and advanced `scheduled`
to `2026-11-23`. Each call therefore completes "the instance at `scheduled`" and moves on; the passed date did not
select the instance here. The series `status` stayed `open` throughout. TaskNotes also wrote
`skipped_instances: []` on the first call. Flagged as input to Phase 7 research, not decided here.

## Pins for 04-04 and 04-05

(a) **Vendored `TaskNotesUserField`**: `{ id: string; displayName: string; key: string; type: string; defaultValue?: string }`
(observed `type` values: `"date"`, `"text"`). **defaultValue present: yes** when a default is set (`"x"` on
`spikedefault`). Without a default the member exists with value `undefined` (absent from JSON). D-03
`hasDefault` must test the value (`field.defaultValue !== undefined && field.defaultValue !== ""`), not key
presence. Fakes for "no default" may omit the key or set it to `undefined`; both must read as no default.

(b) **`tasks.update(path, { staged: null })` semantics**: **null written as null**. The key is kept with an
empty YAML value (`staged:`); metadataCache frontmatter has the key with value `null`; the returned TaskInfo and
`tasks.get(path)` report `staged: null` (and `customProperties.staged: null`). The fake TaskNotes must keep the
key and store and return `null`, not delete it. Setting a day writes `staged: 2026-11-12` and reads back the
string `"2026-11-12"` on both `staged` and `customProperties.staged`.

(c) **Q3 copy consequence for Phase 6**: a newly registered date field is visible on `tasks.get` immediately,
without reloading TaskNotes and without a file change. The setup notice need not say "reload TaskNotes".

(d) **Q4 (input to Phase 7 research only)**: `recurring.toggleCompleteInstance(weeklyPath, "2026-11-11")` on a
weekly-Monday task scheduled `2026-11-09` recorded `2026-11-09` (the scheduled instance, not the Wednesday) and
advanced `scheduled` by one week; a second identical call recorded `2026-11-16` (no toggle-off) and advanced
again. Status stayed `open`.

## Dev-vault state

- `staged` stays registered as a Date user field with no default (Phase 6 needs it).
- The throwaway `spikedefault` field is to be removed by the user from TaskNotes settings at end-of-phase UAT.
- Scratch tasks stay: `TaskNotes/Tasks/Staging spike scratch.md` ends with `staged:` (null) and no `spikeTouch`;
  `TaskNotes/Tasks/Staging spike weekly.md` now has `complete_instances: [2026-11-09, 2026-11-16]`,
  `skipped_instances: []` and `scheduled: 2026-11-23`. Both are harmless git-ignored dev-vault data.
