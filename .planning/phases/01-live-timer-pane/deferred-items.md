# Phase 01 Deferred Items

Out-of-scope discoveries logged during execution. Not fixed by the plan that found them.

| Found in | Item | Why deferred |
|---|---|---|
| 01-01 Task 2 | `npm audit` reports 3 moderate advisories: `moment` 2.29.2-2.30.1 (GHSA-4p3w-j4w9-5jqw, path traversal via a crafted non-string locale name), pulled in through `eslint-plugin-obsidianmd` -> its own nested `obsidian` (0.14.6-1.13.1) -> `moment`. | Lint-time dev dependency only; nothing from it is bundled into `main.js` (obsidian is external, and the plugin's own `obsidian@1.14.4` is not affected). `npm audit fix --force` would downgrade `eslint-plugin-obsidianmd` to 0.1.8, which breaks the pinned lint chain. Revisit when obsidianmd ships a release with an updated `obsidian` dependency. |
