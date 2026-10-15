// D-12 bridge-availability tests. Per D-04 the missing and too-old states are faked
// (apiVersion, capabilities, version); no old TaskNotes is ever installed.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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
	TaskNotesRuntimeTaskEventName,
} from "../src/tasknotes/runtime-api.types";
import { createFakeTaskNotes, makeActiveEntry, timerSchedule, type FakeTaskNotes } from "./fakes/fakeTaskNotes";

const SUBSCRIBED: ReadonlyArray<TaskNotesRuntimeLifecycleEventName | TaskNotesRuntimeTaskEventName> = [
	"unloading",
	"layout.ready",
	"cache.changed",
	"cache.rebuilt",
	"settings.changed",
	"task.updated",
	"task.deleted",
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
		const store = new TimerStore({ gateway: bridge, log });
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
