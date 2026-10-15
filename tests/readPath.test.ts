// Walking-skeleton read path, end to end through the real modules:
// fake TaskNotes api -> TaskNotesBridge -> TimerStore -> deriveSnapshot -> derivePaneState.
// D-12: pure logic plus a faked TaskNotes boundary; no DOM, no view, no obsidian mocks.
import { describe, expect, test, vi } from "vitest";
import { derivePaneState, formatHms, sessionMs } from "../src/model/timeMath";
import { TimerStore } from "../src/state/TimerStore";
import { TaskNotesBridge, isVersionOlder, type TaskNotesPluginLike } from "../src/tasknotes/TaskNotesBridge";
import type { ActiveTimeEntry, TimeEntry } from "../src/tasknotes/runtime-api.types";

type Handler = (payload?: unknown) => void;

interface FakeRef {
	event: string;
	handler: Handler;
}

/** An in-memory TaskNotes Runtime API v1 with the namespaces the bridge calls. */
function makeFakeTaskNotes(options: { ready?: boolean; capabilities?: string[] } = {}) {
	const capabilities = options.capabilities ?? ["time.read", "time.write", "tasks.events", "lifecycle.events"];
	const handlers = { lifecycle: [] as FakeRef[], events: [] as FakeRef[] };
	const fake = {
		ready: options.ready ?? true,
		fixture: [] as ActiveTimeEntry[],
		activeCalls: 0,
	};
	const on = (list: FakeRef[]) => (event: string, handler: Handler) => {
		const ref: FakeRef = { event, handler };
		list.push(ref);
		return ref;
	};
	const off = (list: FakeRef[]) => (ref: FakeRef) => {
		const index = list.indexOf(ref);
		if (index >= 0) list.splice(index, 1);
	};
	const api = {
		apiVersion: 1,
		capabilities,
		hasCapability: (capability: string) => capabilities.includes(capability),
		lifecycle: {
			ready: () => Promise.resolve(),
			isReady: () => fake.ready,
			on: on(handlers.lifecycle),
			off: off(handlers.lifecycle),
		},
		events: { on: on(handlers.events), off: off(handlers.events) },
		time: {
			active: () => {
				fake.activeCalls++;
				return Promise.resolve(structuredClone(fake.fixture));
			},
		},
	};
	const fire = (kind: "lifecycle" | "events", event: string) => {
		for (const ref of [...handlers[kind]]) if (ref.event === event) ref.handler({ event });
	};
	return { api, fake, handlers, fire };
}

function activeEntry(taskPath: string, startTime: string, title = taskPath): ActiveTimeEntry {
	const entry: TimeEntry = { startTime };
	return {
		taskPath,
		index: 0,
		entry,
		task: { title, status: "open", path: taskPath, archived: false, timeEntries: [entry] },
	};
}

function connect(plugin: TaskNotesPluginLike | null) {
	const log = vi.fn<(message: string) => void>();
	const bridge = new TaskNotesBridge({ lookupPlugin: () => plugin, log });
	const store = new TimerStore({ gateway: bridge, log });
	const paneState = () => derivePaneState(bridge.getState(), store.getSnapshot());
	return { bridge, store, log, paneState };
}

describe("walking skeleton: TaskNotes -> bridge -> store -> pane state", () => {
	test("ready TaskNotes with open entries shows the most recently started timer, then idle after task.updated", async () => {
		const tn = makeFakeTaskNotes();
		tn.fake.fixture = [
			activeEntry("TaskNotes/Tasks/Older.md", "2026-10-14T08:00:00.000Z", "Older"),
			activeEntry("TaskNotes/Tasks/Newest.md", "2026-10-14T09:30:00.000Z", "Newest"),
			activeEntry("TaskNotes/Tasks/Middle.md", "2026-10-14T09:00:00.000Z", "Middle"),
		];
		const { bridge, store, paneState } = connect({ manifest: { version: "4.13.8" }, api: tn.api });

		expect(paneState()).toBe("loading");
		bridge.probe();
		expect(bridge.getState().kind).toBe("ready");

		await store.refreshNow();
		const snapshot = store.getSnapshot();
		expect(snapshot?.primary?.taskPath).toBe("TaskNotes/Tasks/Newest.md");
		expect(snapshot?.primary?.title).toBe("Newest");
		expect(snapshot?.others.map((timer) => timer.taskPath)).toEqual([
			"TaskNotes/Tasks/Middle.md",
			"TaskNotes/Tasks/Older.md",
		]);
		expect(paneState()).toBe("running");

		// The bridge subscribed lifecycle "layout.ready" and events "task.updated".
		expect(tn.handlers.lifecycle.map((ref) => ref.event)).toEqual(["layout.ready"]);
		expect(tn.handlers.events.map((ref) => ref.event)).toEqual(["task.updated"]);

		tn.fake.fixture = [];
		tn.fire("events", "task.updated");
		await vi.waitFor(() => expect(paneState()).toBe("idle"));

		bridge.dispose();
		store.dispose();
		expect(tn.handlers.lifecycle).toHaveLength(0);
		expect(tn.handlers.events).toHaveLength(0);
	});

	test("session clock math: 2,537,000 ms after start reads 0:42:17", () => {
		const start = Date.parse("2026-10-14T09:00:00.000Z");
		expect(formatHms(sessionMs(start, start + 2_537_000))).toBe("0:42:17");
	});

	test("TaskNotes missing shows missing", () => {
		const { bridge, paneState } = connect(null);
		bridge.probe();
		expect(bridge.getState()).toEqual({ kind: "missing" });
		expect(paneState()).toBe("missing");
	});

	test("TaskNotes older than 4.10 without an api shows incompatible with its version", () => {
		const { bridge, paneState } = connect({ manifest: { version: "4.9.3" } });
		bridge.probe();
		expect(bridge.getState()).toEqual({ kind: "incompatible", version: "4.9.3" });
		expect(paneState()).toBe("incompatible");
	});

	test("TaskNotes 4.13.8 without an api yet (mid-onload) shows loading", () => {
		const { bridge, paneState } = connect({ manifest: { version: "4.13.8" } });
		bridge.probe();
		expect(bridge.getState()).toEqual({ kind: "loading" });
		expect(paneState()).toBe("loading");
	});

	test("isReady() false shows loading, then layout.ready connects and refreshes without a reload", async () => {
		const tn = makeFakeTaskNotes({ ready: false });
		tn.fake.fixture = [activeEntry("a.md", "2026-10-14T09:00:00.000Z")];
		const { bridge, store, paneState } = connect({ manifest: { version: "4.13.8" }, api: tn.api });
		bridge.probe();
		expect(bridge.getState().kind).toBe("loading");
		expect(paneState()).toBe("loading");
		await store.refreshNow();
		expect(tn.fake.activeCalls).toBe(0);

		tn.fake.ready = true;
		tn.fire("lifecycle", "layout.ready");
		expect(bridge.getState().kind).toBe("ready");
		await vi.waitFor(() => expect(paneState()).toBe("running"));
	});

	test("apiVersion other than 1 or a missing capability shows incompatible", () => {
		const tn = makeFakeTaskNotes({ capabilities: ["time.read", "tasks.events", "lifecycle.events"] });
		const { bridge } = connect({ manifest: { version: "4.13.8" }, api: tn.api });
		bridge.probe();
		expect(bridge.getState()).toEqual({ kind: "incompatible", version: "4.13.8" });
		expect(tn.handlers.events).toHaveLength(0);

		const v2 = makeFakeTaskNotes();
		const second = connect({ manifest: { version: "9.0.0" }, api: { ...v2.api, apiVersion: 2 } });
		second.bridge.probe();
		expect(second.bridge.getState()).toEqual({ kind: "incompatible", version: "9.0.0" });
	});

	test("a throwing api falls back to missing and logs the message", () => {
		const { bridge, log } = connect({
			manifest: { version: "4.13.8" },
			api: {
				apiVersion: 1,
				hasCapability: () => {
					throw new Error("boom");
				},
			},
		});
		bridge.probe();
		expect(bridge.getState()).toEqual({ kind: "missing" });
		expect(log).toHaveBeenCalledWith("TaskNotes probe failed: boom");
	});

	test("active() rejects while not connected", async () => {
		const { bridge } = connect(null);
		bridge.probe();
		await expect(bridge.active()).rejects.toThrow("TaskNotes is not connected");
	});

	test("isVersionOlder compares numeric segments and treats unknown versions as not older", () => {
		expect(isVersionOlder("4.9.3", "4.10.0")).toBe(true);
		expect(isVersionOlder("4.10.0", "4.10.0")).toBe(false);
		expect(isVersionOlder("4.10", "4.10.0")).toBe(false);
		expect(isVersionOlder("4.13.8", "4.10.0")).toBe(false);
		expect(isVersionOlder("4.10.0-beta.1", "4.10.0")).toBe(false);
		expect(isVersionOlder("3.99.99+build7", "4.10.0")).toBe(true);
		expect(isVersionOlder("dev", "4.10.0")).toBe(false);
		expect(isVersionOlder("", "4.10.0")).toBe(false);
	});
});
