// Evaluates JavaScript in the UAT Obsidian instance over the Chrome DevTools Protocol (CDP).
//
//   node scripts/uat/cdp.mjs eval    [--port 9333] --expr "<js>"   print the value of <js> as JSON
//   node scripts/uat/cdp.mjs prepare [--port 9333] [--timeout-ms n] dismiss the trust modal, enable community
//                                                                   plugins, wait for TaskNotes, print a status object
//
// Safety rules (threat T-i5w-03):
//   - Always connects to 127.0.0.1. There is no host argument.
//   - Only targets a CDP "page" whose title contains "Obsidian" (the same rule the launcher uses).
//   - The value goes to stdout as JSON; diagnostics go to stderr; any failure exits non-zero.
//   - No dependencies: Node 24's global fetch and WebSocket only.

const DEFAULT_PORT = 9333;
const DEFAULT_TIMEOUT_MS = 90_000;

// Runs inside Obsidian. Kept here so PowerShell never has to quote JavaScript.
const PREPARE_EXPRESSION = `(async () => {
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	for (let i = 0; i < 300 && !(window.app && window.app.plugins); i++) await sleep(100);
	if (!(window.app && window.app.plugins)) throw new Error("window.app.plugins never appeared");
	// The "Do you trust the author of this vault?" modal can appear late, so keep checking for a while.
	for (let i = 0; i < 20; i++) {
		const close = document.querySelector(".modal-container .modal-close-button");
		if (close) close.click();
		await sleep(150);
	}
	await app.plugins.setEnable(true);
	let api = null;
	for (let i = 0; i < 200 && !api; i++) {
		api = app.plugins.getPlugin("tasknotes")?.api ?? null;
		if (!api) await sleep(100);
	}
	let obsidianVersion = null;
	try { obsidianVersion = require("obsidian").apiVersion ?? null; } catch (e) { obsidianVersion = null; }
	const paneLoaded = Boolean(app.plugins.getPlugin("tasknotes-timer-pane"));
	if (!api) {
		return { tasknotesVersion: null, apiVersion: null, timeWrite: false, paneLoaded, obsidianVersion };
	}
	await api.lifecycle.ready();
	return {
		tasknotesVersion: app.plugins.getPlugin("tasknotes")?.manifest?.version ?? null,
		apiVersion: api.apiVersion,
		timeWrite: api.hasCapability("time.write"),
		paneLoaded,
		obsidianVersion,
	};
})()`;

function fail(message) {
	console.error(`cdp.mjs: ${message}`);
	process.exit(1);
}

function parseArgs(argv) {
	const [command, ...rest] = argv;
	const opts = { command, port: DEFAULT_PORT, timeoutMs: DEFAULT_TIMEOUT_MS, expr: undefined };
	for (let i = 0; i < rest.length; i++) {
		const key = rest[i];
		const value = rest[i + 1];
		if (value === undefined) fail(`missing value for ${key}`);
		if (key === "--port") opts.port = Number(value);
		else if (key === "--timeout-ms") opts.timeoutMs = Number(value);
		else if (key === "--expr") opts.expr = value;
		else fail(`unknown argument ${key}`);
		i++;
	}
	if (!Number.isInteger(opts.port) || opts.port <= 0 || opts.port > 65535) fail(`invalid port ${opts.port}`);
	if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) fail(`invalid timeout ${opts.timeoutMs}`);
	return opts;
}

async function findTarget(port) {
	let list;
	try {
		list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
	} catch (e) {
		fail(`nothing answers CDP on 127.0.0.1:${port} (${e.message}); run npm run uat:start`);
	}
	const page = list.find((t) => t.type === "page" && typeof t.title === "string" && t.title.includes("Obsidian"));
	if (!page) fail(`no Obsidian page target on 127.0.0.1:${port}`);
	return page;
}

function evaluate(wsUrl, expression, timeoutMs) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(wsUrl);
		const timer = setTimeout(() => {
			ws.close();
			reject(new Error(`timed out after ${timeoutMs} ms`));
		}, timeoutMs);
		const finish = (fn, arg) => {
			clearTimeout(timer);
			ws.close();
			fn(arg);
		};
		ws.onopen = () => {
			ws.send(JSON.stringify({
				id: 1,
				method: "Runtime.evaluate",
				params: { expression, awaitPromise: true, returnByValue: true },
			}));
		};
		ws.onerror = () => finish(reject, new Error("WebSocket error"));
		ws.onmessage = (m) => {
			const msg = JSON.parse(typeof m.data === "string" ? m.data : String(m.data));
			if (msg.id !== 1) return;
			if (msg.error) return finish(reject, new Error(`CDP error: ${msg.error.message}`));
			const { result, exceptionDetails } = msg.result;
			if (exceptionDetails) {
				const text = exceptionDetails.exception?.description ?? exceptionDetails.text ?? "exception";
				return finish(reject, new Error(`evaluation threw: ${text}`));
			}
			finish(resolve, result.value);
		};
	});
}

const opts = parseArgs(process.argv.slice(2));
let expression;
if (opts.command === "eval") {
	if (!opts.expr) fail("eval needs --expr <js>");
	expression = opts.expr;
} else if (opts.command === "prepare") {
	expression = PREPARE_EXPRESSION;
} else {
	fail("usage: cdp.mjs eval --port <n> --expr <js> | cdp.mjs prepare --port <n> [--timeout-ms <n>]");
}

const target = await findTarget(opts.port);
try {
	const value = await evaluate(target.webSocketDebuggerUrl, expression, opts.timeoutMs);
	console.log(JSON.stringify(value ?? null));
} catch (e) {
	fail(e.message);
}
