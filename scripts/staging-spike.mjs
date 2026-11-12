// One-off D-10 spike: probes TaskNotes 4.13.8 staging behavior in the dev vault through the
// Obsidian CLI (`obsidian eval`) and prints JSON findings (Phase 4, plan 04-01, D-08).
//
//   node scripts/staging-spike.mjs --self-test      offline check of the dev-vault guard predicate (no CLI)
//   node scripts/staging-spike.mjs --print <mode>   print the guarded snippet for <mode> without running it
//                                                   (manual fallback: paste it into the dev vault's DevTools console)
//   node scripts/staging-spike.mjs userfields       catalog.userFields() plus the TaskNotes version
//   node scripts/staging-spike.mjs prepare          create or reuse the two scratch tasks, hand-write `staged:` (Q3 baseline)
//
// This is a probe, not a tool: it is not wired into package.json and adds no recurring smoke command.
//
// Safety rules (D-09):
//   - The script only talks to the dev vault (<main checkout>/dev-vault). The repo root comes from this
//     script's own location, never from the cwd; inside a .claude/worktrees/<name> checkout the dev vault
//     is resolved in the main checkout.
//   - Every eval snippet starts with the vault guard: it compares app.vault.adapter.basePath (normalized)
//     to the dev-vault path and throws before any TaskNotes or vault call when they differ. The guard runs
//     in the DevTools console too, so pasting a snippet into another vault's window throws.
//   - The script never reads TaskNotes' whole settings object (it holds the HTTP API token); the field
//     shape comes from catalog.userFields() only.
//   - The script has no code path that removes a file. Scratch tasks stay in the git-ignored dev vault.
//   - The CLI runs through execFile with an argument array, never a shell. Modes come from a fixed allowlist.
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function mainRootOf(root) {
	const segments = root.split(/[\\/]+/);
	const fold = (s) => (process.platform === "win32" ? s.toLowerCase() : s);
	for (let i = 0; i + 2 < segments.length; i += 1) {
		if (fold(segments[i]) === ".claude" && fold(segments[i + 1]) === "worktrees" && segments[i + 2]) {
			return segments.slice(0, i).join(path.sep) || path.sep;
		}
	}
	return root;
}

const MAIN_ROOT = mainRootOf(ROOT);
const EXPECTED_VAULT = path.join(MAIN_ROOT, "dev-vault");
const CONTEXT = { source: "tasknotes-timer-pane", reason: "staging-spike" };
const PLAIN_TITLE = "Staging spike scratch";
const WEEKLY_TITLE = "Staging spike weekly";
const CLI_TIMEOUT_MS = 20000;
const RESULT_DEADLINE_MS = 90000;

function normalizeVaultPath(p) {
	return String(p ?? "")
		.replace(/\\/g, "/")
		.replace(/\/+$/, "")
		.toLowerCase();
}

function isDevVault(actual) {
	return normalizeVaultPath(actual) === normalizeVaultPath(EXPECTED_VAULT);
}

// The synchronous vault guard, inlined at the top of every snippet. The expected path is embedded with
// JSON.stringify. Snippets contain no backslashes (the CLI rewrites `\n`-style escapes in values), so the
// in-app normalization splits on String.fromCharCode(92) instead of using a regex escape.
function guardSource() {
	return [
		"const __tntpActual = String(app.vault.adapter.basePath || '').split(String.fromCharCode(92)).join('/').replace(/[/]+$/, '').toLowerCase();",
		`if (__tntpActual !== ${JSON.stringify(normalizeVaultPath(EXPECTED_VAULT))}) { throw new Error('staging-spike: refusing vault ' + __tntpActual); }`,
	].join("\n");
}

// Shared helpers available to every mode body. They only use the public runtime api and public Obsidian API.
const HELPERS = `
const ctx = ${JSON.stringify(CONTEXT)};
const show = (v) => (v === undefined ? '(undefined)' : v);
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const findByTitle = async (title) => (await api.tasks.list()).find((t) => t.title === title) || null;
const frontmatterBlock = async (p) => {
	const text = await app.vault.adapter.read(p);
	const lines = text.split(String.fromCharCode(10));
	if (lines[0].trim() !== '---') { return null; }
	const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
	return end < 0 ? null : lines.slice(0, end + 1).join(String.fromCharCode(10));
};
const cachedFrontmatter = (p) => {
	const file = app.vault.getFileByPath(p);
	const cache = file ? app.metadataCache.getFileCache(file) : null;
	return cache && cache.frontmatter ? cache.frontmatter : null;
};
const ensureTask = async (title, extra) => {
	const existing = await findByTitle(title);
	if (existing) { return { path: existing.path, created: false }; }
	const made = await api.tasks.create({ title, ...extra }, ctx);
	return { path: made.path, created: true };
};
`;

const MODES = {
	userfields: `
return {
	basePath: app.vault.adapter.basePath,
	tasknotesVersion: app.plugins.getPlugin('tasknotes').manifest.version,
	userFields: api.catalog.userFields(),
};
`,
	prepare: `
const plain = await ensureTask(${JSON.stringify(PLAIN_TITLE)}, {});
const weekly = await ensureTask(${JSON.stringify(WEEKLY_TITLE)}, { recurrence: 'FREQ=WEEKLY;BYDAY=MO', scheduled: '2026-11-09' });
await wait(1500);
const plainFile = app.vault.getFileByPath(plain.path);
if (!plainFile) { throw new Error('staging-spike: scratch file not found ' + plain.path); }
await app.fileManager.processFrontMatter(plainFile, (fm) => { fm.staged = '2026-11-12'; });
await wait(1500);
const info = await api.tasks.get(plain.path);
const weeklyInfo = await api.tasks.get(weekly.path);
return {
	plain,
	weekly,
	plainTasksGet: info ? { staged: show(info.staged), customProperties: show(info.customProperties) } : '(task not found)',
	plainCachedFrontmatterStaged: show((cachedFrontmatter(plain.path) || {}).staged),
	plainRawFrontmatter: await frontmatterBlock(plain.path),
	weeklyTasksGet: weeklyInfo ? { recurrence: show(weeklyInfo.recurrence), scheduled: show(weeklyInfo.scheduled), status: show(weeklyInfo.status), complete_instances: show(weeklyInfo.complete_instances) } : '(task not found)',
	weeklyRawFrontmatter: await frontmatterBlock(weekly.path),
	userFields: api.catalog.userFields(),
};
`,
};

// Async IIFE: guard first, then the TaskNotes api, then the mode body. Resolves to JSON text.
// This form is what --print emits (DevTools awaits it).
function guarded(body) {
	return [
		"(async () => {",
		guardSource(),
		"const api = app.plugins.getPlugin('tasknotes')?.api;",
		"if (!api || !api.lifecycle.isReady()) { throw new Error('staging-spike: TaskNotes api missing or not ready'); }",
		HELPERS,
		"const result = await (async () => {",
		body,
		"})();",
		"return JSON.stringify(result);",
		"})()",
	].join("\n");
}

// The CLI prints an awaited value only when the promise settles without a timer, so a mode that waits runs
// as two guarded calls: the kickoff stores the outcome on window.__tntpSpike[mode], and a poll reads it.
function kickoffSource(mode) {
	return [
		"(() => {",
		guardSource(),
		"window.__tntpSpike = window.__tntpSpike || {};",
		`window.__tntpSpike[${JSON.stringify(mode)}] = { done: false };`,
		`${guarded(MODES[mode])}.then(`,
		`(json) => { window.__tntpSpike[${JSON.stringify(mode)}] = { done: true, json }; },`,
		`(err) => { window.__tntpSpike[${JSON.stringify(mode)}] = { done: true, error: String((err && err.message) || err) }; });`,
		"return 'started';",
		"})()",
	].join("\n");
}

function pollSource(mode) {
	return [
		"(() => {",
		guardSource(),
		`const state = (window.__tntpSpike || {})[${JSON.stringify(mode)}];`,
		"return state && state.done ? JSON.stringify(state) : 'pending';",
		"})()",
	].join("\n");
}

function assertTransportSafe(source) {
	if (source.includes("\\")) {
		throw new Error("internal: snippet contains a backslash, which the Obsidian CLI rewrites");
	}
	return source;
}

function cli(args) {
	return new Promise((resolve, reject) => {
		execFile("obsidian", args, { timeout: CLI_TIMEOUT_MS, windowsHide: true }, (err, stdout, stderr) => {
			if (err) {
				reject(new Error(`obsidian CLI failed: ${err.message}${stderr ? `\n${stderr}` : ""}`));
				return;
			}
			resolve(String(stdout));
		});
	});
}

let checkedHelp = false;

// `obsidian help` documents `eval code=<javascript>` and a global `vault=<name>` option. The vault option
// must come BEFORE the command: placed after it, the CLI silently ignores it and evaluates in the focused
// window (observed: it targeted the Personal Vault, and the guard refused). The guard is still the real
// boundary: vault=dev-vault only picks the window.
async function runEvalOnce(source) {
	if (!checkedHelp) {
		const help = await cli(["help"]);
		if (!/^\s*eval\s/m.test(help) || !help.includes("code=")) {
			throw new Error("obsidian CLI does not document `eval code=`; use --print and the DevTools fallback");
		}
		checkedHelp = true;
	}
	const out = await cli(["vault=dev-vault", "eval", `code=${assertTransportSafe(source)}`]);
	const lines = out.split(/\r?\n/).filter((line) => line.trim() !== "");
	const last = lines[lines.length - 1] ?? "";
	if (last.startsWith("=> ")) return last.slice(3);
	if (last.startsWith("Error")) throw new Error(last);
	throw new Error(`unexpected CLI output: ${last || "(empty)"}`);
}

async function runEval(mode) {
	const started = await runEvalOnce(kickoffSource(mode));
	if (started !== "started") throw new Error(`unexpected kickoff result: ${started}`);
	const deadline = Date.now() + RESULT_DEADLINE_MS;
	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 750));
		const polled = await runEvalOnce(pollSource(mode));
		if (polled === "pending") continue;
		const state = JSON.parse(polled);
		if (state.error) throw new Error(state.error);
		return JSON.parse(state.json);
	}
	throw new Error(`timed out waiting for mode ${mode}`);
}

function selfTest() {
	const cases = [
		[EXPECTED_VAULT, true],
		[EXPECTED_VAULT.toUpperCase(), true],
		[EXPECTED_VAULT.replace(/\//g, "\\"), true],
		[EXPECTED_VAULT.replace(/\\/g, "/") + "/", true],
		["C:/Users/ja384/Documents/Obsidian Vaults/Personal Vault", false],
		["C:\\Users\\ja384\\Documents\\Obsidian Vaults\\Personal Vault", false],
		[path.join(MAIN_ROOT, "dev-vault-old"), false],
		["C:/other/tree/dev-vault", false],
		[path.join(MAIN_ROOT, "elsewhere", "dev-vault"), false],
		["", false],
	];
	let wrong = 0;
	for (const [input, expected] of cases) {
		const got = isDevVault(input);
		if (got !== expected) {
			wrong += 1;
			console.error(`wrong verdict for ${JSON.stringify(input)}: expected ${expected}, got ${got}`);
		}
	}
	for (const mode of Object.keys(MODES)) {
		for (const source of [guarded(MODES[mode]), kickoffSource(mode), pollSource(mode)]) {
			if (source.includes("\\")) {
				wrong += 1;
				console.error(`snippet for ${mode} contains a backslash`);
			}
			const guardAt = source.indexOf("adapter.basePath");
			const apiAt = source.indexOf("getPlugin(");
			if (guardAt < 0 || !source.includes("refusing vault") || (apiAt >= 0 && apiAt < guardAt)) {
				wrong += 1;
				console.error(`snippet for ${mode} does not start with the vault guard`);
			}
		}
	}
	if (wrong > 0) {
		console.error(`self-test failed: ${wrong} wrong verdict(s)`);
		process.exit(1);
	}
	console.log(`expected vault: ${EXPECTED_VAULT}`);
	console.log("self-test ok");
}

function usage() {
	console.error(
		`usage: node scripts/staging-spike.mjs --self-test | --print <mode> | <mode>\nmodes: ${Object.keys(MODES).join(", ")}`,
	);
	process.exit(2);
}

const args = process.argv.slice(2);
const hasMode = (m) => Object.prototype.hasOwnProperty.call(MODES, m);

if (args.length === 1 && args[0] === "--self-test") {
	selfTest();
} else if (args.length === 2 && args[0] === "--print" && hasMode(args[1])) {
	console.log(guarded(MODES[args[1]]));
} else if (args.length === 1 && hasMode(args[0])) {
	try {
		const result = await runEval(args[0]);
		console.log(JSON.stringify(result, null, 2));
	} catch (err) {
		console.error(err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
} else {
	usage();
}
