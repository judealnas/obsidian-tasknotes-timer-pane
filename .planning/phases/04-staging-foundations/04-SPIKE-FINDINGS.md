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
