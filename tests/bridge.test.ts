// D-12 bridge-availability tests. Per D-04 the missing and too-old states are faked
// (apiVersion, capabilities, version); no old TaskNotes is ever installed.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fieldStatus } from "../src/model/stagedField";
import { derivePaneState } from "../src/model/timeMath";
import { TimerStore } from "../src/state/TimerStore";
import {
	EARLY_PROBE_DELAY_MS,
	LOADING_WARN_MS,
	PROBE_INTERVAL_MS,
	TaskNotesBridge,
	isVersionOlder,
	type TaskNotesPluginLike,
} from "../src/tasknotes/TaskNotesBridge";
import type {
	TaskNotesRuntimeLifecycleEventName,
	TaskNotesRuntimeEventName,
} from "../src/tasknotes/runtime-api.types";
import { DEFAULT_CAPABILITIES, createFakeTaskNotes, makeActiveEntry, timerSchedule, type FakeTaskNotes } from "./fakes/fakeTaskNotes";

const SUBSCRIBED: ReadonlyArray<TaskNotesRuntimeLifecycleEventName | TaskNotesRuntimeEventName> = [
	"unloading",
	"layout.ready",
	"cache.changed",
	"cache.rebuilt",
	"settings.changed",
	"task.updated",
	"task.deleted",
	"time.started", "time.stopped", "pomodoro.started", "pomodoro.completed", "pomodoro.interrupted",
];

/** A bridge whose plugin lookup returns whatever `current` holds at call time. */
function setup(initial: TaskNotesPluginLike | null, now?: () => number) {
	let current = initial;
	const log = vi.fn<(message: string) => void>();
	const schedule = vi.fn(timerSchedule);
	const bridge = new TaskNotesBridge({ lookupPlugin: () => current, log, schedule, now });
	const data = vi.fn();
	bridge.onData(data);
	return {
		bridge,
		log,
		schedule,
		data,
		setPlugin: (plugin: TaskNotesPluginLike | null) => {
			current = plugin;
		},
	};
}

function expectOneHandlerEach(tn: FakeTaskNotes): void {
	for (const name of SUBSCRIBED) expect(tn.handlerCount(name), name).toBe(1);
	expect(tn.totalHandlers()).toBe(SUBSCRIBED.length);
}

test("Complete is capability/callable gated and keeps the tasks receiver", async () => {
	const tn = createFakeTaskNotes();
	const ctx = setup(tn.plugin); ctx.bridge.probe();
	expect(ctx.bridge.completionAvailable()).toBe(true);
	let receiverChecked = false;
	tn.api.tasks!.complete = function () { expect(this).toBe(tn.api.tasks); receiverChecked = true; return Promise.resolve({ path: "A.md", title: "A", status: "done", archived: false }); };
	await ctx.bridge.completeTask("A.md", "done", { source: "test" });
	expect(receiverChecked).toBe(true);
	const methodMissing = createFakeTaskNotes({ omitMethods: ["tasks.complete"] });
	const missing = setup(methodMissing.plugin); missing.bridge.probe();
	expect(missing.bridge.completionAvailable()).toBe(false);
	await expect(missing.bridge.completeTask("A.md", "done", { source: "test" })).rejects.toThrow("tasks.complete");
	const capabilities = tn.api.capabilities.filter(cap => cap !== "tasks.write");
	const denied = createFakeTaskNotes({ capabilities });
	const gate = setup(denied.plugin); gate.bridge.probe();
	expect(gate.bridge.completionAvailable()).toBe(false);
	await expect(gate.bridge.completeTask("A.md", "done", { source: "test" })).rejects.toThrow("tasks.write");
});

test("Pomodoro and time events coalesce refreshes and release every listener on unload", async () => {
	const tn = createFakeTaskNotes({ active: [makeActiveEntry({ taskPath: "A.md", title: "A", startTime: "2026-10-15T10:00:00Z" })] });
	const ctx = setup(tn.plugin);
	const store = new TimerStore({ gateway: ctx.bridge, log: ctx.log, schedule: timerSchedule });
	ctx.bridge.probe();
	await store.refreshNow();
	const before = tn.activeCalls;
	for (const name of ["pomodoro.started", "pomodoro.completed", "pomodoro.interrupted", "time.started", "time.stopped"] as const) tn.emitTaskEvent(name);
	await vi.advanceTimersByTimeAsync(200);
	expect(tn.activeCalls).toBe(before + 1);
	tn.emitLifecycle("unloading");
	expect(tn.totalHandlers()).toBe(0);
	store.dispose(); ctx.bridge.dispose();
});

test("ownership reads fail closed for missing capability, missing method, malformed data, and retired API", async () => {
	for (const tn of [createFakeTaskNotes({ capabilities: ["time.read", "time.write", "tasks.events", "lifecycle.events"] }), createFakeTaskNotes({ omitMethods: ["pomodoro.status"] })]) {
		const ctx = setup(tn.plugin); ctx.bridge.probe();
		expect(await ctx.bridge.pomodoroOwnership()).toEqual({ readable: false });
		ctx.bridge.dispose();
	}
	const tn = createFakeTaskNotes(); const ctx = setup(tn.plugin); ctx.bridge.probe();
	vi.spyOn(tn.api.pomodoro!, "status").mockResolvedValue({ isRunning: true, timeRemaining: 0 });
	expect(await ctx.bridge.pomodoroOwnership()).toEqual({ readable: false });
	tn.emitLifecycle("unloading");
	expect(await ctx.bridge.pomodoroOwnership()).toEqual({ readable: false });
	ctx.bridge.dispose();
});

test("ownership status retains its namespace receiver and rejects an API replaced during the read", async () => {
	const tn = createFakeTaskNotes(); const ctx = setup(tn.plugin); ctx.bridge.probe();
	vi.spyOn(tn.api.pomodoro!, "status").mockImplementation(function (this: unknown) {
		expect(this).toBe(tn.api.pomodoro);
		ctx.setPlugin(createFakeTaskNotes().plugin);
		return Promise.resolve({ isRunning: false, timeRemaining: 0 });
	});
	expect(await ctx.bridge.pomodoroOwnership()).toEqual({ readable: false });
	ctx.bridge.dispose();
});

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("availability states (RESEARCH Pattern 1, DISP-05)", () => {
	test("getPlugin returning null is missing", () => {
		const { bridge } = setup(null);
		bridge.probe();
		expect(bridge.getState()).toEqual({ kind: "missing" });
		expect(derivePaneState(bridge.getState(), null)).toBe("missing");
	});

	test.each([
		["4.9.3", { kind: "incompatible", version: "4.9.3" }],
		["4.10.0", { kind: "loading" }],
		["4.13.8", { kind: "loading" }],
		["4.10.0-beta.1", { kind: "loading" }],
		["weird", { kind: "loading" }],
	])("a TaskNotes %s plugin with no api is %o", (version, expected) => {
		const { bridge } = setup({ manifest: { version } });
		bridge.probe();
		expect(bridge.getState()).toEqual(expected);
	});

	test("apiVersion 2 is incompatible and subscribes nothing", () => {
		const tn = createFakeTaskNotes({ apiVersion: 2, version: "9.0.0" });
		const { bridge } = setup(tn.plugin);
		bridge.probe();
		expect(bridge.getState()).toEqual({ kind: "incompatible", version: "9.0.0" });
		expect(tn.totalHandlers()).toBe(0);
	});

	test("a missing required capability is incompatible and subscribes nothing", () => {
		const tn = createFakeTaskNotes({ capabilities: ["time.read", "tasks.events", "lifecycle.events"] });
		const { bridge } = setup(tn.plugin);
		bridge.probe();
		expect(bridge.getState()).toEqual({ kind: "incompatible", version: "4.13.8" });
		expect(tn.totalHandlers()).toBe(0);
	});

	test("an attached api that is not ready is loading; a ready one is ready", () => {
		const tn = createFakeTaskNotes({ ready: false });
		const { bridge } = setup(tn.plugin);
		bridge.probe();
		expect(bridge.getState()).toEqual({ kind: "loading" });
		expectOneHandlerEach(tn);
		tn.setReady(true);
		bridge.probe();
		expect(bridge.getState()).toEqual({ kind: "ready" });
		expectOneHandlerEach(tn);
	});

	test("a throwing hasCapability gives missing with one log call", () => {
		const tn = createFakeTaskNotes();
		const { bridge, log } = setup({
			manifest: { version: "4.13.8" },
			api: {
				...tn.api,
				hasCapability: () => {
					throw new Error("boom");
				},
			},
		});
		bridge.probe();
		expect(bridge.getState()).toEqual({ kind: "missing" });
		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith("TaskNotes probe failed: boom");
	});
});

describe("isVersionOlder (DISP-05 encoding)", () => {
	test("compares dot-separated numeric segments, ignores suffixes, never calls an unknown version old", () => {
		expect(isVersionOlder("4.9.3", "4.10.0")).toBe(true);
		expect(isVersionOlder("4.10.0", "4.10.0")).toBe(false);
		expect(isVersionOlder("4.10", "4.10.0")).toBe(false);
		expect(isVersionOlder("4.13.8", "4.10.0")).toBe(false);
		expect(isVersionOlder("4.10.0-beta.1", "4.10.0")).toBe(false);
		expect(isVersionOlder("x.y", "4.10.0")).toBe(false);
		expect(isVersionOlder("3.99.99", "4.10.0")).toBe(true);
		expect(isVersionOlder("3.99.99+build7", "4.10.0")).toBe(true);
	});
});

describe("lifecycle (SYNC-03)", () => {
	test("layout.ready moves loading to ready and emits data", () => {
		const tn = createFakeTaskNotes({ ready: false });
		const { bridge, data } = setup(tn.plugin);
		bridge.probe();
		expect(bridge.getState().kind).toBe("loading");
		tn.setReady(true);
		tn.emitLifecycle("layout.ready");
		expect(bridge.getState().kind).toBe("ready");
		expect(data).toHaveBeenCalledTimes(1);
	});

	test("layout.ready while already ready still emits data (Pitfall 5)", () => {
		const tn = createFakeTaskNotes();
		const { bridge, data } = setup(tn.plugin);
		bridge.probe();
		tn.emitLifecycle("layout.ready");
		expect(bridge.getState().kind).toBe("ready");
		expect(data).toHaveBeenCalledTimes(1);
	});

	test.each(["task.updated", "task.deleted"] as const)("%s emits data", (name) => {
		const tn = createFakeTaskNotes();
		const { bridge, data } = setup(tn.plugin);
		bridge.probe();
		tn.emitTaskEvent(name);
		expect(data).toHaveBeenCalledTimes(1);
	});

	test.each(["cache.changed", "cache.rebuilt", "settings.changed"] as const)("%s emits data", (name) => {
		const tn = createFakeTaskNotes();
		const { bridge, data } = setup(tn.plugin);
		bridge.probe();
		tn.emitLifecycle(name);
		expect(data).toHaveBeenCalledTimes(1);
		expect(bridge.getState().kind).toBe("ready");
	});

	test("unloading sets missing, retires the api, and schedules exactly one early probe at 1000 ms", () => {
		const tn = createFakeTaskNotes();
		const { bridge, schedule } = setup(tn.plugin);
		bridge.probe();
		expect(bridge.getState().kind).toBe("ready");

		tn.emitLifecycle("unloading");
		expect(bridge.getState()).toEqual({ kind: "missing" });
		expect(tn.totalHandlers()).toBe(0);
		expect(schedule).toHaveBeenCalledTimes(1);
		expect(schedule.mock.calls[0]?.[1]).toBe(EARLY_PROBE_DELAY_MS);
		expect(EARLY_PROBE_DELAY_MS).toBe(1000);

		// getPlugin still returns the same plugin object with the same (retired) api.
		bridge.probe();
		bridge.probe();
		bridge.probe();
		expect(bridge.getState()).toEqual({ kind: "missing" });
		expect(tn.totalHandlers()).toBe(0);

		// The early probe also finds the retired api: still missing, nothing re-attached.
		vi.advanceTimersByTime(EARLY_PROBE_DELAY_MS);
		expect(bridge.getState()).toEqual({ kind: "missing" });
		expect(tn.totalHandlers()).toBe(0);
		expect(schedule).toHaveBeenCalledTimes(1);
	});

	test("a new api object after unloading reaches ready through the early probe, with no duplicate handlers", () => {
		const oldTn = createFakeTaskNotes();
		const { bridge, setPlugin } = setup(oldTn.plugin);
		bridge.probe();
		expectOneHandlerEach(oldTn);

		oldTn.emitLifecycle("unloading");
		const newTn = createFakeTaskNotes();
		setPlugin(newTn.plugin);

		vi.advanceTimersByTime(EARLY_PROBE_DELAY_MS - 1);
		expect(bridge.getState()).toEqual({ kind: "missing" });
		vi.advanceTimersByTime(1);
		expect(bridge.getState()).toEqual({ kind: "ready" });

		expect(oldTn.totalHandlers()).toBe(0);
		expectOneHandlerEach(newTn);
		for (let i = 0; i < 5; i++) bridge.probe();
		expectOneHandlerEach(newTn);
		expect(oldTn.totalHandlers()).toBe(0);
	});

	test("TaskNotes disabled (getPlugin null) then re-enabled reconnects on the 5 s probe", () => {
		const oldTn = createFakeTaskNotes();
		const { bridge, setPlugin } = setup(oldTn.plugin);
		bridge.probe();
		oldTn.emitLifecycle("unloading");
		setPlugin(null);
		vi.advanceTimersByTime(EARLY_PROBE_DELAY_MS);
		expect(bridge.getState()).toEqual({ kind: "missing" });

		const newTn = createFakeTaskNotes();
		setPlugin(newTn.plugin);
		bridge.probe(); // what the plugin's 5 s interval does
		expect(bridge.getState()).toEqual({ kind: "ready" });
		expectOneHandlerEach(newTn);
	});

	test("dispose removes every handler and cancels the pending early probe", () => {
		const tn = createFakeTaskNotes();
		const { bridge } = setup(tn.plugin);
		bridge.probe();
		expect(tn.totalHandlers()).toBe(SUBSCRIBED.length);
		bridge.dispose();
		expect(tn.totalHandlers()).toBe(0);

		const tn2 = createFakeTaskNotes();
		const second = setup(tn2.plugin);
		second.bridge.probe();
		tn2.emitLifecycle("unloading");
		expect(vi.getTimerCount()).toBe(1);
		second.bridge.dispose();
		expect(vi.getTimerCount()).toBe(0);

		// A disposed bridge attaches nothing, even when probed again.
		const tn3 = createFakeTaskNotes();
		second.setPlugin(tn3.plugin);
		second.bridge.probe();
		expect(tn3.totalHandlers()).toBe(0);
	});

	test("the loading watchdog logs exactly once across 40 s of probes, then resets after leaving loading", () => {
		let clock = 0;
		const { bridge, log } = setup({ manifest: { version: "4.13.8" } }, () => clock);
		for (clock = 0; clock <= 40_000; clock += PROBE_INTERVAL_MS) bridge.probe();
		expect(bridge.getState()).toEqual({ kind: "loading" });
		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith("TaskNotes is still loading after 30 s; the pane keeps checking every 5 s");
		expect(LOADING_WARN_MS).toBe(30000);
	});

	test("the watchdog re-arms after the bridge leaves loading", () => {
		let clock = 0;
		let plugin: TaskNotesPluginLike | null = { manifest: { version: "4.13.8" } };
		const log = vi.fn<(message: string) => void>();
		const bridge = new TaskNotesBridge({ lookupPlugin: () => plugin, log, schedule: timerSchedule, now: () => clock });
		for (clock = 0; clock <= 35_000; clock += PROBE_INTERVAL_MS) bridge.probe();
		expect(log).toHaveBeenCalledTimes(1);
		plugin = null;
		bridge.probe();
		plugin = { manifest: { version: "4.13.8" } };
		const start = clock;
		for (clock = start; clock <= start + 35_000; clock += PROBE_INTERVAL_MS) bridge.probe();
		expect(log).toHaveBeenCalledTimes(2);
	});
});

describe("end-to-end reconnect through the real TimerStore", () => {
	test("running, unloading -> missing, new api with an open entry, early probe -> running again", async () => {
		const oldTn = createFakeTaskNotes({
			active: [makeActiveEntry({ taskPath: "TaskNotes/Tasks/A.md", startTime: "2026-10-14T09:00:00.000Z", title: "A" })],
		});
		const { bridge, log, setPlugin } = setup(oldTn.plugin);
		const store = new TimerStore({ gateway: bridge, log, schedule: timerSchedule });
		const paneState = () => derivePaneState(bridge.getState(), store.getSnapshot());

		bridge.probe();
		await vi.advanceTimersByTimeAsync(250);
		expect(paneState()).toBe("running");
		expect(store.getSnapshot()?.primary?.title).toBe("A");

		oldTn.emitLifecycle("unloading");
		expect(paneState()).toBe("missing");

		const newTn = createFakeTaskNotes({
			active: [makeActiveEntry({ taskPath: "TaskNotes/Tasks/B.md", startTime: "2026-10-14T10:00:00.000Z", title: "B" })],
		});
		setPlugin(newTn.plugin);
		await vi.advanceTimersByTimeAsync(EARLY_PROBE_DELAY_MS + 250);
		expect(paneState()).toBe("running");
		expect(store.getSnapshot()?.primary?.title).toBe("B");
		expect(oldTn.totalHandlers()).toBe(0);
		expectOneHandlerEach(newTn);

		store.dispose();
		bridge.dispose();
	});
});

describe("getTask (Phase 3 paused cards)", () => {
	const PATH = "TaskNotes/Tasks/A.md";
	test("resolves the task, or null for a path TaskNotes has not cached", async () => {
		const tn = createFakeTaskNotes({ active: [makeActiveEntry({ taskPath: PATH, startTime: "2026-10-14T09:00:00.000Z", title: "A" })] });
		const { bridge } = setup(tn.plugin);
		bridge.probe();
		await expect(bridge.getTask(PATH)).resolves.toMatchObject({ path: PATH, title: "A" });
		await expect(bridge.getTask("TaskNotes/Tasks/Missing.md")).resolves.toBeNull();
	});
	test("rejects when tasks.get is missing or TaskNotes is not connected", async () => {
		const missing = createFakeTaskNotes({ omitMethods: ["tasks.get"] });
		const first = setup(missing.plugin);
		first.bridge.probe();
		await expect(first.bridge.getTask(PATH)).rejects.toThrow("TaskNotes does not provide tasks.get");
		const offline = createFakeTaskNotes({ ready: false });
		const second = setup(offline.plugin);
		second.bridge.probe();
		await expect(second.bridge.getTask(PATH)).rejects.toThrow("TaskNotes is not connected");
	});
});

describe("write facade (CTRL-01)", () => {
	const context = { source: "tasknotes-timer-pane", reason: "user stop", correlationId: "corr-1" };

	test("stop forwards the path and the mutation context to api.time.stop", async () => {
		const tn = createFakeTaskNotes({
			active: [makeActiveEntry({ taskPath: "TaskNotes/Tasks/A.md", startTime: "2026-10-14T09:00:00.000Z" })],
		});
		const { bridge } = setup(tn.plugin);
		bridge.probe();
		await expect(bridge.stop("TaskNotes/Tasks/A.md", context)).resolves.toMatchObject({ path: "TaskNotes/Tasks/A.md" });
		expect(tn.stopCalls).toEqual([{ path: "TaskNotes/Tasks/A.md", context }]);
	});

	test("stop rejects without calling TaskNotes when the bridge is not ready", async () => {
		const tn = createFakeTaskNotes({ ready: false });
		const { bridge } = setup(tn.plugin);
		await expect(bridge.stop("TaskNotes/Tasks/A.md", context)).rejects.toThrow("TaskNotes is not connected");
		bridge.probe();
		expect(bridge.getState().kind).toBe("loading");
		await expect(bridge.stop("TaskNotes/Tasks/A.md", context)).rejects.toThrow("TaskNotes is not connected");
		expect(tn.stopCalls).toEqual([]);
	});

	test("normalizeError uses api.errors.normalize when errors.typed is present", () => {
		const tn = createFakeTaskNotes();
		const normalize = vi.spyOn(tn.api.errors, "normalize");
		const { bridge } = setup(tn.plugin);
		bridge.probe();
		expect(bridge.normalizeError(new Error("Disk is read-only"))).toEqual({
			code: "operation_failed",
			message: "Disk is read-only",
		});
		expect(normalize).toHaveBeenCalledTimes(1);
	});

	test("normalizeError falls back to the plain message without errors.typed, when detached, or when normalize throws", () => {
		const untyped = createFakeTaskNotes({ capabilities: ["time.read", "time.write", "tasks.events", "lifecycle.events"] });
		const normalize = vi.spyOn(untyped.api.errors, "normalize");
		const first = setup(untyped.plugin);
		first.bridge.probe();
		expect(first.bridge.normalizeError(new Error("boom"))).toEqual({ code: null, message: "boom" });
		expect(first.bridge.normalizeError("plain")).toEqual({ code: null, message: "plain" });
		expect(first.bridge.normalizeError({ weird: true })).toEqual({ code: null, message: "" });
		expect(normalize).not.toHaveBeenCalled();

		const detached = setup(null);
		expect(detached.bridge.normalizeError(new Error("boom"))).toEqual({ code: null, message: "boom" });

		const throwing = createFakeTaskNotes();
		vi.spyOn(throwing.api.errors, "normalize").mockImplementation(() => {
			throw new Error("normalize broke");
		});
		const third = setup(throwing.plugin);
		third.bridge.probe();
		expect(third.bridge.normalizeError(new Error("boom"))).toEqual({ code: null, message: "boom" });
		expect(third.log).toHaveBeenCalledWith("Normalizing a TaskNotes error failed: normalize broke");
	});
});

describe("task menu (ui.taskMenu, optional ui.task-menu capability)", () => {
	const TASK = "TaskNotes/Tasks/A.md";
	/** Tests run in Node: a stand-in object, passed through by identity. */
	const fakeEvent = () => ({ type: "contextmenu", clientX: 10, clientY: 20 }) as unknown as MouseEvent;
	const flush = async () => {
		await Promise.resolve();
		await Promise.resolve();
	};

	test("ready with ui.task-menu: hands the task path and the same event to ui.taskMenu.show", () => {
		const tn = createFakeTaskNotes();
		const { bridge } = setup(tn.plugin);
		bridge.probe();
		const event = fakeEvent();
		expect(bridge.showTaskMenu(TASK, event)).toBe(true);
		expect(tn.menuCalls).toHaveLength(1);
		expect(tn.menuCalls[0]?.taskPath).toBe(TASK);
		expect(tn.menuCalls[0]?.event).toBe(event);
	});

	test("without ui.task-menu: returns false, never calls show, and the bridge is still ready", () => {
		const tn = createFakeTaskNotes({
			capabilities: ["time.read", "time.write", "tasks.events", "lifecycle.events", "errors.typed"],
		});
		const { bridge } = setup(tn.plugin);
		bridge.probe();
		expect(bridge.showTaskMenu(TASK, fakeEvent())).toBe(false);
		expect(tn.menuCalls).toHaveLength(0);
		expect(bridge.getState()).toEqual({ kind: "ready" });
	});

	test("capability advertised but no ui namespace (TaskNotes 4.10 shape): returns false without throwing", () => {
		const tn = createFakeTaskNotes({ ui: false });
		const { bridge } = setup(tn.plugin);
		bridge.probe();
		expect(() => bridge.showTaskMenu(TASK, fakeEvent())).not.toThrow();
		expect(bridge.showTaskMenu(TASK, fakeEvent())).toBe(false);
		expect(tn.menuCalls).toHaveLength(0);
	});

	test("TaskNotes missing or not ready: returns false with no menu call", () => {
		const missing = setup(null);
		missing.bridge.probe();
		expect(missing.bridge.showTaskMenu(TASK, fakeEvent())).toBe(false);

		const tn = createFakeTaskNotes({ ready: false });
		const loading = setup(tn.plugin);
		loading.bridge.probe();
		expect(loading.bridge.getState()).toEqual({ kind: "loading" });
		expect(loading.bridge.showTaskMenu(TASK, fakeEvent())).toBe(false);
		expect(tn.menuCalls).toHaveLength(0);
	});

	test("show rejecting: still true, and the failure is logged, not left unhandled", async () => {
		const tn = createFakeTaskNotes();
		tn.failMenuWith("Task not found");
		const { bridge, log } = setup(tn.plugin);
		bridge.probe();
		expect(bridge.showTaskMenu(TASK, fakeEvent())).toBe(true);
		await flush();
		expect(log).toHaveBeenCalledWith("Opening the TaskNotes task menu failed: Task not found");
	});

	test("hasCapability throwing after ready: returns false, logs once, does not throw", () => {
		const tn = createFakeTaskNotes();
		const { bridge, log } = setup(tn.plugin);
		bridge.probe();
		vi.spyOn(tn.api, "hasCapability").mockImplementation(() => {
			throw new Error("capabilities broke");
		});
		let result: boolean | undefined;
		expect(() => {
			result = bridge.showTaskMenu(TASK, fakeEvent());
		}).not.toThrow();
		expect(result).toBe(false);
		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith("Opening the TaskNotes task menu failed: capabilities broke");
		expect(tn.menuCalls).toHaveLength(0);
	});
});

describe("Start feature gates", () => {
 test("catalog reads work independently when tasks.read is unavailable", async () => {
  const tn = createFakeTaskNotes({ capabilities: ["time.read", "time.write", "tasks.events", "lifecycle.events", "catalog.read"] });
  const { bridge } = setup(tn.plugin); bridge.probe();
  expect(bridge.getState().kind).toBe("ready");
  expect(bridge.startAvailability().available).toBe(false);
  await expect(bridge.statuses()).resolves.toEqual([{ value: "done", isCompleted: true }]);
 });
 test.each(["tasks.read", "catalog.read"])("missing %s disables only Start", async capability => {
  const tn = createFakeTaskNotes();
  const original = tn.api.hasCapability.bind(tn.api);
  tn.api.hasCapability = value => value !== capability && original(value);
  const { bridge } = setup(tn.plugin); bridge.probe();
  expect(bridge.getState().kind).toBe("ready");
  expect(bridge.startAvailability()).toEqual({ available: false, reason: "TaskNotes is missing " + capability });
  await expect(bridge.active()).resolves.toEqual([]);
 });
 test.each(["list", "statuses", "start"] as const)("missing %s callable disables only Start", method => {
  const tn = createFakeTaskNotes();
  const namespace = method === "list" ? tn.api.tasks : method === "statuses" ? tn.api.catalog : tn.api.time;
  Reflect.deleteProperty(namespace!, method);
  const { bridge } = setup(tn.plugin); bridge.probe();
  expect(bridge.getState().kind).toBe("ready");
  expect(bridge.startAvailability().available).toBe(false);
  expect(bridge.startAvailability().reason).toContain(method);
 });
 test("preserves namespace receivers and refuses results from a replaced API", async () => {
  const tn = createFakeTaskNotes(); const ctx = setup(tn.plugin); ctx.bridge.probe();
  const tasks = tn.api.tasks!; const catalog = tn.api.catalog!;
  tasks.list = function () { expect(this).toBe(tasks); return Promise.resolve([]); };
  catalog.statuses = function () { expect(this).toBe(catalog); return []; };
  await ctx.bridge.listTasks(); await ctx.bridge.statuses();
  let resolve!: (tasks: []) => void;
  tasks.list = () => new Promise<[]>(r => { resolve = r; });
  const pending = ctx.bridge.listTasks(); ctx.setPlugin(createFakeTaskNotes().plugin); resolve([]);
  await expect(pending).rejects.toThrow();
 });
 test("unload during a task read cannot return stale rows", async () => {
  const tn = createFakeTaskNotes(); const { bridge } = setup(tn.plugin); bridge.probe();
  let resolve!: (tasks: []) => void;
  tn.api.tasks!.list = () => new Promise<[]>(r => { resolve = r; });
  const pending = bridge.listTasks(); tn.emitLifecycle("unloading"); resolve([]);
  await expect(pending).rejects.toThrow(); expect(bridge.startAvailability().available).toBe(false);
 });
});

describe("staging field registration (D-03)", () => {
	const STAGED_DATE = { id: "f1", displayName: "Staged", key: "staged", type: "date" };
	test("a ready bridge on TaskNotes 4.13.8 reads catalog.userFields and fieldStatus reports ok", async () => {
		const tn = createFakeTaskNotes({ version: "4.13.8", userFields: [STAGED_DATE] });
		const { bridge } = setup(tn.plugin);
		bridge.probe();
		const fields = await bridge.userFields();
		expect(fields).toHaveLength(1);
		expect(fields).toEqual([STAGED_DATE]);
		expect(fieldStatus(fields)).toEqual({ kind: "ok", hasDefault: false });
	});
	test("no staged entry is missing; staged as text is wrong-type", async () => {
		const tn = createFakeTaskNotes();
		const { bridge } = setup(tn.plugin);
		bridge.probe();
		expect(fieldStatus(await bridge.userFields())).toEqual({ kind: "missing" });
		tn.setUserFields([{ ...STAGED_DATE, type: "text" }]);
		expect(fieldStatus(await bridge.userFields())).toEqual({ kind: "wrong-type", type: "text", hasDefault: false });
	});
	test("returns a copy, so a caller cannot mutate the fake catalog", async () => {
		const tn = createFakeTaskNotes({ userFields: [STAGED_DATE] });
		const { bridge } = setup(tn.plugin);
		bridge.probe();
		const first = await bridge.userFields();
		first[0]!.type = "text";
		expect(fieldStatus(await bridge.userFields())).toEqual({ kind: "ok", hasDefault: false });
	});
	test("without catalog.userFields the bridge stays ready and userFields() rejects", async () => {
		const tn = createFakeTaskNotes({ omitMethods: ["catalog.userFields"] });
		const { bridge } = setup(tn.plugin);
		bridge.probe();
		expect(bridge.getState()).toEqual({ kind: "ready" });
		await expect(bridge.userFields()).rejects.toThrow("TaskNotes does not provide catalog.userFields");
	});
	test("without catalog.read userFields() rejects", async () => {
		const tn = createFakeTaskNotes({ capabilities: ["time.read", "time.write", "tasks.events", "lifecycle.events"], userFields: [STAGED_DATE] });
		const { bridge } = setup(tn.plugin);
		bridge.probe();
		expect(bridge.getState()).toEqual({ kind: "ready" });
		await expect(bridge.userFields()).rejects.toThrow("TaskNotes is missing catalog.read");
	});
	test("a failed catalog read rejects, and fieldStatus of the null a consumer passes is unknown", async () => {
		const tn = createFakeTaskNotes({ userFields: [STAGED_DATE] });
		const { bridge } = setup(tn.plugin);
		bridge.probe();
		tn.failReadWith("catalog broke");
		await expect(bridge.userFields()).rejects.toThrow("catalog broke");
		expect(fieldStatus(null)).toEqual({ kind: "unknown" });
	});
	test("preserves the catalog receiver and refuses user fields read across a TaskNotes reload", async () => {
		const tn = createFakeTaskNotes({ userFields: [STAGED_DATE] });
		const ctx = setup(tn.plugin);
		ctx.bridge.probe();
		const catalog = tn.api.catalog!;
		let reload = false;
		catalog.userFields = function () {
			expect(this).toBe(catalog);
			if (reload) ctx.setPlugin(createFakeTaskNotes().plugin);
			return [STAGED_DATE];
		};
		await expect(ctx.bridge.userFields()).resolves.toEqual([STAGED_DATE]);
		reload = true;
		await expect(ctx.bridge.userFields()).rejects.toThrow();
	});
	test("rejects while TaskNotes is not connected", async () => {
		const tn = createFakeTaskNotes({ ready: false });
		const { bridge } = setup(tn.plugin);
		bridge.probe();
		await expect(bridge.userFields()).rejects.toThrow("TaskNotes is not connected");
	});
});

describe("staging write contract (SC3)", () => {
	const PATH = "TaskNotes/Tasks/A.md";
	const STAGED_DATE = { id: "f1", displayName: "Staged", key: "staged", type: "date" };
	const CTX = { source: "tasknotes-timer-pane", correlationId: "c1", reason: "stage" };
	const TASK = { title: "A", status: "open", path: PATH, archived: false };
	const readyBridge = (options: Parameters<typeof createFakeTaskNotes>[0] = {}) => {
		const tn = createFakeTaskNotes({ version: "4.13.8", userFields: [STAGED_DATE], tasks: [structuredClone(TASK)], ...options });
		const ctx = setup(tn.plugin);
		ctx.bridge.probe();
		return { tn, ...ctx };
	};
	const stored = async (tn: FakeTaskNotes) => (await tn.api.tasks!.get!(PATH)) as unknown as Record<string, unknown>;

	test("a supported TaskNotes reports staging available and receives a staged write through tasks.update", async () => {
		const { tn, bridge } = readyBridge();
		expect(bridge.stagingAvailability().available).toBe(true);
		expect(bridge.stagingAvailability()).toEqual({ available: true, reason: "Staging is available" });
		await expect(bridge.updateTask(PATH, { staged: "2026-11-12" }, CTX)).resolves.toBeUndefined();
		expect(tn.updateCalls).toEqual([{ path: PATH, patch: { staged: "2026-11-12" }, context: CTX }]);
		expect((await stored(tn)).staged).toBe("2026-11-12");
	});
	test("unstaging writes null and keeps the key, as the 04-01 Pins record", async () => {
		const { tn, bridge } = readyBridge();
		await bridge.updateTask(PATH, { staged: "2026-11-12" }, CTX);
		await bridge.updateTask(PATH, { staged: null }, CTX);
		const task = await stored(tn);
		expect(Object.prototype.hasOwnProperty.call(task, "staged")).toBe(true);
		expect(task.staged).toBeNull();
	});
	test("an undefined value is skipped, not written", async () => {
		const { tn, bridge } = readyBridge();
		await bridge.updateTask(PATH, { staged: "2026-11-12" }, CTX);
		await bridge.updateTask(PATH, { staged: undefined }, CTX);
		expect((await stored(tn)).staged).toBe("2026-11-12");
	});
	test("an unregistered key is echoed but not stored (research F1/F5)", async () => {
		const { tn, bridge } = readyBridge({ userFields: [] });
		await expect(bridge.updateTask(PATH, { staged: "2026-11-12" }, CTX)).resolves.toBeUndefined();
		expect(tn.updateCalls).toHaveLength(1);
		const direct = (await tn.api.tasks!.update!(PATH, { staged: "2026-11-12" }, CTX)) as unknown as Record<string, unknown>;
		expect(direct.staged).toBe("2026-11-12");
		expect(Object.prototype.hasOwnProperty.call(await stored(tn), "staged")).toBe(false);
	});
	test("TaskNotes 4.12.3 stays ready and can start timers, but staging is unavailable", () => {
		const { bridge } = readyBridge({ version: "4.12.3" });
		expect(bridge.getState()).toEqual({ kind: "ready" });
		expect(bridge.startAvailability().available).toBe(true);
		expect(bridge.stagingAvailability()).toEqual({ available: false, reason: "TaskNotes 4.13.0 or newer is needed for staging" });
	});
	test.each(["tasks.read", "tasks.write", "catalog.read"])("without %s staging is unavailable and the bridge stays ready", capability => {
		const { bridge } = readyBridge({ capabilities: DEFAULT_CAPABILITIES.filter(item => item !== capability) });
		expect(bridge.getState()).toEqual({ kind: "ready" });
		expect(bridge.stagingAvailability()).toEqual({ available: false, reason: "TaskNotes is missing " + capability });
	});
	test.each(["tasks.list", "tasks.update", "catalog.userFields"] as const)("without %s staging is unavailable", method => {
		const { bridge } = readyBridge({ omitMethods: [method] });
		expect(bridge.getState()).toEqual({ kind: "ready" });
		expect(bridge.stagingAvailability()).toEqual({ available: false, reason: "TaskNotes does not provide " + method });
	});
	test("without tasks.update an updateTask call rejects", async () => {
		const { bridge } = readyBridge({ omitMethods: ["tasks.update"] });
		await expect(bridge.updateTask(PATH, { staged: "2026-11-12" }, CTX)).rejects.toThrow("TaskNotes does not provide tasks.update");
	});
	test("while loading or missing, staging is not connected and nothing throws", async () => {
		const loading = readyBridge({ ready: false });
		expect(loading.bridge.getState()).toEqual({ kind: "loading" });
		expect(loading.bridge.stagingAvailability()).toEqual({ available: false, reason: "TaskNotes is not connected" });
		await expect(loading.bridge.updateTask(PATH, { staged: "2026-11-12" }, CTX)).rejects.toThrow("TaskNotes is not connected");
		const missing = setup(null);
		missing.bridge.probe();
		expect(missing.bridge.getState()).toEqual({ kind: "missing" });
		expect(missing.bridge.stagingAvailability()).toEqual({ available: false, reason: "TaskNotes is not connected" });
	});
	test("a patch with a customFrontmatter member is refused before TaskNotes is called", async () => {
		const { tn, bridge } = readyBridge();
		await expect(bridge.updateTask(PATH, { customFrontmatter: { staged: null } }, CTX)).rejects.toThrow("Staging writes use registered fields only");
		expect(tn.updateCalls).toHaveLength(0);
	});
	test("a TaskNotes update failure rejects", async () => {
		const { tn, bridge } = readyBridge();
		tn.failUpdateWith("write broke");
		await expect(bridge.updateTask(PATH, { staged: "2026-11-12" }, CTX)).rejects.toThrow("write broke");
	});
});

describe("recurring completion contract", () => {
	const PATH = "TaskNotes/Tasks/Weekly.md";
	const CTX = { source: "tasknotes-timer-pane", correlationId: "c2", reason: "complete-instance" };
	const TASK = { title: "Weekly", status: "open", path: PATH, archived: false };
	const readyBridge = (options: Parameters<typeof createFakeTaskNotes>[0] = {}) => {
		const tn = createFakeTaskNotes({ version: "4.13.8", tasks: [structuredClone(TASK)], ...options });
		const ctx = setup(tn.plugin);
		ctx.bridge.probe();
		return { tn, ...ctx };
	};

	test("a supported TaskNotes reports recurring completion available and receives the explicit day", async () => {
		const { tn, bridge } = readyBridge();
		expect(bridge.recurringAvailability().available).toBe(true);
		expect(bridge.recurringAvailability()).toEqual({ available: true, reason: "Recurring completion is available" });
		await expect(bridge.toggleCompleteInstance(PATH, "2026-11-11", CTX)).resolves.toBeUndefined();
		expect(tn.toggleCalls).toEqual([{ path: PATH, date: "2026-11-11", context: CTX }]);
		const task = (await tn.api.tasks!.get!(PATH)) as unknown as { complete_instances?: string[] };
		expect(task.complete_instances).toEqual(["2026-11-11"]);
	});
	test.each(["2026-11-11T00:00:00Z", "11/11/2026", "", "2026-1-1"])("the date %j is refused before TaskNotes is called", async date => {
		const { tn, bridge } = readyBridge();
		await expect(bridge.toggleCompleteInstance(PATH, date, CTX)).rejects.toThrow("Recurring completion needs a YYYY-MM-DD day");
		expect(tn.toggleCalls).toHaveLength(0);
	});
	test("TaskNotes 4.12.3 stays ready, but recurring completion is unavailable", () => {
		const { bridge } = readyBridge({ version: "4.12.3" });
		expect(bridge.getState()).toEqual({ kind: "ready" });
		expect(bridge.recurringAvailability()).toEqual({ available: false, reason: "TaskNotes 4.13.0 or newer is needed for recurring completion" });
	});
	test("without recurring.write recurring completion is unavailable and the call rejects", async () => {
		const { bridge } = readyBridge({ capabilities: DEFAULT_CAPABILITIES.filter(item => item !== "recurring.write") });
		expect(bridge.getState()).toEqual({ kind: "ready" });
		expect(bridge.recurringAvailability()).toEqual({ available: false, reason: "TaskNotes is missing recurring.write" });
		await expect(bridge.toggleCompleteInstance(PATH, "2026-11-11", CTX)).rejects.toThrow("TaskNotes is missing recurring.write");
	});
	test("without recurring.toggleCompleteInstance recurring completion is unavailable", () => {
		const { bridge } = readyBridge({ omitMethods: ["recurring.toggleCompleteInstance"] });
		expect(bridge.getState()).toEqual({ kind: "ready" });
		expect(bridge.recurringAvailability()).toEqual({ available: false, reason: "TaskNotes does not provide recurring.toggleCompleteInstance" });
	});
	test("with no recurring namespace the bridge stays ready and recurring completion is unavailable", async () => {
		const { bridge } = readyBridge({ recurring: false });
		expect(bridge.getState()).toEqual({ kind: "ready" });
		expect(bridge.recurringAvailability().available).toBe(false);
		await expect(bridge.toggleCompleteInstance(PATH, "2026-11-11", CTX)).rejects.toThrow("TaskNotes does not provide recurring.toggleCompleteInstance");
	});
	test("while not connected recurring completion is unavailable and nothing throws", () => {
		const { bridge } = readyBridge({ ready: false });
		expect(bridge.recurringAvailability()).toEqual({ available: false, reason: "TaskNotes is not connected" });
		const missing = setup(null);
		missing.bridge.probe();
		expect(missing.bridge.recurringAvailability()).toEqual({ available: false, reason: "TaskNotes is not connected" });
	});
	test("a TaskNotes toggle failure rejects", async () => {
		const { tn, bridge } = readyBridge();
		tn.failToggleWith("toggle broke");
		await expect(bridge.toggleCompleteInstance(PATH, "2026-11-11", CTX)).rejects.toThrow("toggle broke");
	});
});
