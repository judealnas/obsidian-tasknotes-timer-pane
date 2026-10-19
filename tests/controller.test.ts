// D-12 tracer for the write path (CTRL-01): the Stop path end to end through the
// real TaskNotesBridge (fed by the fake TaskNotes), the real TimerStore, WriteQueue
// and TimerController. Pure logic plus fakes, no DOM. Also pins D-05: the pane never
// stops a timer nobody clicked.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stopFailedNotice } from "../src/model/errors";
import { getPomodoroOwnedEntryId, selectRegularStopTargets } from "../src/model/pomodoroOwnership";
import { derivePaneState } from "../src/model/timeMath";
import { TimerController, type StopTarget } from "../src/state/TimerController";
import { REFRESH_DEBOUNCE_MS, TimerStore } from "../src/state/TimerStore";
import { WriteQueue } from "../src/state/WriteQueue";
import { MUTATION_SOURCE, TaskNotesBridge } from "../src/tasknotes/TaskNotesBridge";
import { resolveCompletionStatus } from "../src/settings";
import type { ActiveTimeEntry } from "../src/tasknotes/runtime-api.types";
import { NO_ACTIVE_SESSION_MESSAGE, createFakeTaskNotes, makeActiveEntry, timerSchedule } from "./fakes/fakeTaskNotes";

const REPORT_PATH = "TaskNotes/Tasks/Write quarterly report.md";
const REPORT_START = "2026-10-14T10:00:00.000Z";
const EMAIL_PATH = "TaskNotes/Tasks/Answer email.md";
const EMAIL_START = "2026-10-14T09:00:00.000Z";

function report(overrides: Partial<Parameters<typeof makeActiveEntry>[0]> = {}): ActiveTimeEntry {
	return makeActiveEntry({ taskPath: REPORT_PATH, startTime: REPORT_START, title: "Write quarterly report", ...overrides });
}

function email(overrides: Partial<Parameters<typeof makeActiveEntry>[0]> = {}): ActiveTimeEntry {
	return makeActiveEntry({ taskPath: EMAIL_PATH, startTime: EMAIL_START, title: "Answer email", ...overrides });
}

/** Real bridge, store, queue and controller over a fake TaskNotes, primed with a first refresh. */
async function setup(active: ActiveTimeEntry[]) {
	const tn = createFakeTaskNotes({ active });
	const log = vi.fn<(message: string) => void>();
	const bridge = new TaskNotesBridge({ lookupPlugin: () => tn.plugin, log, schedule: timerSchedule });
	const store = new TimerStore({ gateway: bridge, log, schedule: timerSchedule });
	const queue = new WriteQueue();
	const notify = vi.fn<(message: string) => void>();
	let seq = 0;
	const newCorrelationId = () => `corr-${++seq}`;
	const controller = new TimerController({ gateway: bridge, store, queue, notify, newCorrelationId, log });
	bridge.probe();
	await store.refreshNow();
	const paneState = () => derivePaneState(bridge.getState(), store.getSnapshot());
	const primaryTarget = (): StopTarget => {
		const primary = store.getSnapshot()?.primary;
		if (!primary) throw new Error("no primary timer");
		return { taskPath: primary.taskPath, startTime: primary.startTime, title: primary.title };
	};
	return { tn, bridge, store, controller, notify, log, paneState, primaryTarget };
}

beforeEach(() => {
	vi.useFakeTimers();
});

describe("Complete transaction", () => {
	test("completion is available as a serialized controller action", async () => {
		const ctx = await setup([report()]);
		expect(ctx.controller).toHaveProperty("complete", expect.any(Function));
	});
	test("writes live completed status before stopping the exact entry with context", async () => {
		const ctx = await setup([report()]);
		ctx.tn.setStatuses([{ value: "custom", isCompleted: true }]);
		const complete = vi.spyOn(ctx.tn.api.tasks!, "complete");
		const stop = vi.spyOn(ctx.tn.api.time, "stop");
		expect(await ctx.controller.complete(ctx.primaryTarget())).toBe("completed");
		expect(ctx.tn.completeCalls).toEqual([{ path: REPORT_PATH, status: "custom", context: { source: MUTATION_SOURCE, reason: "user complete", correlationId: "corr-1" } }]);
		expect(complete.mock.invocationCallOrder[0]).toBeLessThan(stop.mock.invocationCallOrder[0]!);
		expect(ctx.tn.stopCalls).toHaveLength(1);
	});
	test("status failure never stops and leaks no task, status or exception text", async () => {
		const ctx = await setup([report()]);
		ctx.tn.failCompleteWith("secret/path status");
		expect(await ctx.controller.complete(ctx.primaryTarget())).toBe("failed");
		expect(ctx.tn.stopCalls).toEqual([]);
		expect(JSON.stringify([ctx.log.mock.calls, ctx.notify.mock.calls])).not.toMatch(/secret|quarterly|TaskNotes\/Tasks|done/);
	});
	test.each(["auto-stop", "replacement"])("skips conditional stop after %s", async mode => {
		const ctx = await setup([report()]);
		const target = ctx.primaryTarget();
		const original = ctx.tn.api.tasks!.complete!.bind(ctx.tn.api.tasks);
		vi.spyOn(ctx.tn.api.tasks!, "complete").mockImplementation(async (...args) => {
			const result = await original(...args);
			ctx.tn.setActive(mode === "auto-stop" ? [] : [report({ startTime: EMAIL_START })]);
			return result;
		});
		expect(await ctx.controller.complete(target)).toBe("completed");
		expect(ctx.tn.stopCalls).toEqual([]);
	});
	test("failed stop is partial with no rollback; benign no-session race succeeds", async () => {
		const ctx = await setup([report()]);
		ctx.tn.failStopWith("private failure");
		expect(await ctx.controller.complete(ctx.primaryTarget())).toBe("partial");
		expect(ctx.tn.completeCalls).toHaveLength(1);
		expect((await ctx.tn.api.time.active())[0]?.task.status).toBe("done");
		expect(ctx.notify).toHaveBeenCalledWith(expect.stringContaining("Task completed"));
		expect(JSON.stringify([ctx.log.mock.calls, ctx.notify.mock.calls])).not.toContain("private failure");
		ctx.tn.failStopWith(NO_ACTIVE_SESSION_MESSAGE);
		expect(await ctx.controller.complete(ctx.primaryTarget())).toBe("completed");
	});
	test("no completed status or missing completion method disables and prevents writes", async () => {
		const ctx = await setup([report()]);
		ctx.tn.setStatuses([]);
		expect(await ctx.controller.completionAvailable()).toBe(false);
		expect(await ctx.controller.complete(ctx.primaryTarget())).toBe("unavailable");
		expect(ctx.tn.completeCalls).toEqual([]);
		ctx.tn.setStatuses([{ value: "done", isCompleted: true }]);
		ctx.tn.api.tasks!.complete = undefined;
		expect(await ctx.controller.completionAvailable()).toBe(false);
		expect(await ctx.controller.complete(ctx.primaryTarget())).toBe("unavailable");
	});
	test("catalog resolver preserves live order and supports explicit, stale and empty choices", () => {
		const statuses = [{ value: "open", isCompleted: false }, { value: "second", isCompleted: true }, { value: "first", isCompleted: true }];
		expect(resolveCompletionStatus(statuses, null)?.value).toBe("second");
		expect(resolveCompletionStatus(statuses, "first")?.value).toBe("first");
		expect(resolveCompletionStatus(statuses, "stale")?.value).toBe("second");
		expect(resolveCompletionStatus([...statuses].reverse(), null)?.value).toBe("first");
		expect(resolveCompletionStatus([], "stale")).toBeNull();
	});
	test("waits for saved preferences, then resolves the current live catalog", async () => {
		const ctx = await setup([report()]);
		let release!: () => void;
		const ready = new Promise<void>(resolve => { release = resolve; });
		let preference: string | null = null;
		const controller = new TimerController({ gateway: ctx.bridge, store: ctx.store, queue: new WriteQueue(),
			notify: ctx.notify, log: ctx.log, newCorrelationId: () => "saved-choice", getSettings: () => ({ completionStatus: preference }), settingsReady: () => ready });
		const pending = controller.complete(ctx.primaryTarget());
		await Promise.resolve();
		expect(ctx.tn.completeCalls).toEqual([]);
		preference = "chosen";
		ctx.tn.setStatuses([{ value: "first", isCompleted: true }, { value: "chosen", isCompleted: true }]);
		release();
		expect(await pending).toBe("completed");
		expect(ctx.tn.completeCalls[0]?.status).toBe("chosen");
	});
	test("catalog failure never writes, post-status timer read failure is partial, refresh failure releases busy", async () => {
		const ctx = await setup([report()]);
		const statuses = vi.spyOn(ctx.bridge, "statuses").mockRejectedValue(new Error("private"));
		expect(await ctx.controller.complete(ctx.primaryTarget())).toBe("failed");
		expect(ctx.tn.completeCalls).toEqual([]);
		statuses.mockRestore();
		vi.spyOn(ctx.bridge, "active").mockRejectedValue(new Error("private"));
		vi.spyOn(ctx.store, "refreshNow").mockRejectedValue(new Error("private"));
		expect(await ctx.controller.complete(ctx.primaryTarget())).toBe("partial");
		expect(ctx.tn.stopCalls).toEqual([]);
		expect(ctx.controller.isBusy()).toBe(false);
	});
	test("Complete cannot enter while another pane action is refreshing", async () => {
		const ctx = await setup([report()]);
		const target = ctx.primaryTarget();
		let release!: () => void;
		let entered!: () => void;
		const barrier = new Promise<void>(resolve => { release = resolve; });
		const started = new Promise<void>(resolve => { entered = resolve; });
		vi.spyOn(ctx.store, "refreshNow").mockImplementation(async () => { entered(); await barrier; });
		const pending = ctx.controller.start({ taskPath: EMAIL_PATH, title: "Email" });
		await started;
		expect(await ctx.controller.complete(target)).toBe("busy");
		expect(ctx.tn.completeCalls).toEqual([]);
		release(); await pending;
	});
	test("busy covers catalog through final refresh and rejects every overlapping mutation", async () => {
		const ctx = await setup([report()]);
		let release!: () => void;
		let entered!: () => void;
		const barrier = new Promise<void>(resolve => { release = resolve; });
		const started = new Promise<void>(resolve => { entered = resolve; });
		vi.spyOn(ctx.store, "refreshNow").mockImplementation(async () => { entered(); await barrier; });
		const target = ctx.primaryTarget();
		const pending = ctx.controller.complete(target);
		expect(ctx.controller.isBusy()).toBe(true);
		await started;
		expect(await ctx.controller.start({ taskPath: EMAIL_PATH, title: "Email" })).toBe("busy");
		expect(await ctx.controller.stop(target)).toBe("busy");
		expect(await ctx.controller.complete(target)).toBe("busy");
		expect(await ctx.controller.stopAll()).toMatchObject({ stopped: 0, failed: 0 });
		expect(ctx.tn.startCalls).toEqual([]);
		expect(ctx.tn.completeCalls).toHaveLength(1);
		expect(ctx.tn.stopCalls).toHaveLength(1);
		release();
		expect(await pending).toBe("completed");
		expect(ctx.controller.isBusy()).toBe(false);
	});
});

describe("Stop all", () => {
	test("vanished targets are skipped and a queued Start waits for the whole batch", async () => {
		const ctx = await setup([report(), email()]);
		const original = ctx.tn.api.time.stop.bind(ctx.tn.api.time);
		let release!: () => void;
		const barrier = new Promise<void>(resolve => { release = resolve; });
		let entered!: () => void;
		const started = new Promise<void>(resolve => { entered = resolve; });
		vi.spyOn(ctx.tn.api.time, "stop").mockImplementation(async (path, context) => {
			entered(); await barrier;
			const result = await original(path, context);
			ctx.tn.setActive([]);
			return result;
		});
		const batch = ctx.controller.stopAll();
		await started;
		const next = ctx.controller.start({ taskPath: "next.md", title: "Next" });
		expect(ctx.controller.isBusy()).toBe(true);
		expect(ctx.tn.startCalls).toHaveLength(0);
		release();
		expect(await batch).toMatchObject({ stopped: 1, skipped: 1 });
		await next;
		expect(ctx.tn.startCalls).toHaveLength(1);
		expect(ctx.controller.isBusy()).toBe(false);
	});
	test("zero targets makes zero writes and malformed ownership fails closed", async () => {
		const empty = await setup([]);
		expect(await empty.controller.stopAll()).toMatchObject({ stopped: 0, failed: 0 });
		expect(empty.tn.stopCalls).toEqual([]);
		const ctx = await setup([report()]);
		vi.spyOn(ctx.tn.api.pomodoro!, "status").mockRejectedValue(new Error("private/path.md"));
		expect(await ctx.controller.stopAll()).toMatchObject({ stopped: 0, ownershipUnreadable: true });
		expect(ctx.tn.stopCalls).toEqual([]);
		expect(JSON.stringify(ctx.notify.mock.calls)).not.toContain("private/path.md");
		expect(ctx.controller.isBusy()).toBe(false);
	});
	test("ownership requires running unfinished uninterrupted work and exact normalized identity", () => {
		const session = { taskPath: REPORT_PATH.replaceAll("/", "\\"), startTime: REPORT_START, timeTrackingStartTime: REPORT_START, type: "work", completed: false };
		const owned = getPomodoroOwnedEntryId({ isRunning: true, currentSession: session });
		expect(selectRegularStopTargets([report(), report({ startTime: EMAIL_START })], owned)).toEqual([{ taskPath: REPORT_PATH, startTime: EMAIL_START }]);
		for (const patch of [{ type: "short-break" }, { type: "long-break" }, { completed: true }, { interrupted: true }]) {
			expect(selectRegularStopTargets([report()], getPomodoroOwnedEntryId({ isRunning: true, currentSession: { ...session, ...patch } }))).toHaveLength(1);
		}
		expect(selectRegularStopTargets([report()], getPomodoroOwnedEntryId({ isRunning: false, currentSession: session }))).toHaveLength(1);
		for (const state of [null, {}, { isRunning: true }, { isRunning: true, currentSession: {} }, { isRunning: true, currentSession: { ...session, timeTrackingStartTime: 5 } }]) expect(getPomodoroOwnedEntryId(state).readable).toBe(false);
	});
	test("rechecks replacements and newly acquired ownership before their turn", async () => {
		const ctx = await setup([report(), email()]);
		const stop = ctx.tn.api.time.stop.bind(ctx.tn.api.time);
		vi.spyOn(ctx.tn.api.time, "stop").mockImplementation(async (path, context) => {
			const result = await stop(path, context);
			ctx.tn.setActive([email({ startTime: REPORT_START })]);
			return result;
		});
		expect(await ctx.controller.stopAll()).toMatchObject({ stopped: 1, skipped: 1 });
		const owned = await setup([report(), email()]);
		const original = owned.tn.api.time.stop.bind(owned.tn.api.time);
		vi.spyOn(owned.tn.api.time, "stop").mockImplementation(async (path, context) => {
			const result = await original(path, context);
			owned.tn.setPomodoro({ isRunning: true, timeRemaining: 10, currentSession: { taskPath: EMAIL_PATH, startTime: EMAIL_START, timeTrackingStartTime: EMAIL_START, type: "work", completed: false } });
			return result;
		});
		expect(await owned.controller.stopAll()).toMatchObject({ stopped: 1, skipped: 1 });
	});
	test("ordinary failure continues sequentially, while lost ownership halts subsequent writes", async () => {
		const ctx = await setup([report(), email()]);
		const stop = ctx.tn.api.time.stop.bind(ctx.tn.api.time);
		let inFlight = 0;
		let maximum = 0;
		const calls: string[] = [];
		vi.spyOn(ctx.tn.api.time, "stop").mockImplementation(async (path, context) => {
			calls.push(path); maximum = Math.max(maximum, ++inFlight);
			try { await Promise.resolve(); if (path === REPORT_PATH) throw new Error("secret"); return await stop(path, context); }
			finally { inFlight--; }
		});
		const pending = ctx.controller.stopAll();
		expect(ctx.controller.isBusy()).toBe(true);
		expect(await pending).toMatchObject({ stopped: 1, failed: 1 });
		expect(calls).toEqual([REPORT_PATH, EMAIL_PATH]);
		expect(maximum).toBe(1);
		expect(ctx.controller.isBusy()).toBe(false);
		const lost = await setup([report(), email()]);
		const original = lost.tn.api.time.stop.bind(lost.tn.api.time);
		vi.spyOn(lost.tn.api.time, "stop").mockImplementation(async (path, context) => {
			const result = await original(path, context);
			vi.spyOn(lost.tn.api.pomodoro!, "status").mockRejectedValue(new Error("unreadable"));
			return result;
		});
		expect(await lost.controller.stopAll()).toMatchObject({ stopped: 1, ownershipUnreadable: true });
		expect(lost.tn.stopCalls).toHaveLength(1);
	});
	test("stops captured regular timers once in first-seen order", async () => {
		const ctx = await setup([report(), email(), report()]);
		expect(await ctx.controller.stopAll()).toMatchObject({ stopped: 2, failed: 0 });
		expect(ctx.tn.stopCalls.map(c => c.path)).toEqual([REPORT_PATH, EMAIL_PATH]);
	});
	test("protects only exact running work ownership", async () => {
		const ctx = await setup([report(), email()]);
		ctx.tn.setPomodoro({ isRunning: true, timeRemaining: 40, currentSession: { taskPath: REPORT_PATH, startTime: REPORT_START, timeTrackingStartTime: REPORT_START, type: "work", completed: false } });
		expect(await ctx.controller.stopAll()).toMatchObject({ stopped: 1 });
		expect(ctx.tn.stopCalls.map(c => c.path)).toEqual([EMAIL_PATH]);
	});
});

afterEach(() => {
	vi.useRealTimers();
});

describe("Stop (CTRL-01)", () => {
	test("one open entry: exactly one api.time.stop with the mutation context, then idle", async () => {
		const ctx = await setup([report()]);
		expect(ctx.paneState()).toBe("running");

		const outcome = await ctx.controller.stop(ctx.primaryTarget());

		expect(outcome).toBe("stopped");
		expect(ctx.tn.stopCalls).toHaveLength(1);
		const call = ctx.tn.stopCalls[0];
		expect(call?.path).toBe(REPORT_PATH);
		expect(call?.context?.source).toBe("tasknotes-timer-pane");
		expect(call?.context?.source).toBe(MUTATION_SOURCE);
		expect(call?.context?.reason).toBe("user stop");
		expect(call?.context?.correlationId).toBeTruthy();
		expect(ctx.paneState()).toBe("idle");
		expect(ctx.notify).not.toHaveBeenCalled();
	});

	test("two open entries: stopping the primary leaves the other as the new primary, unstopped", async () => {
		const ctx = await setup([report(), email()]);
		expect(ctx.store.getSnapshot()?.primary?.taskPath).toBe(REPORT_PATH);

		expect(await ctx.controller.stop(ctx.primaryTarget())).toBe("stopped");

		expect(ctx.tn.stopCalls.map((c) => c.path)).toEqual([REPORT_PATH]);
		expect(ctx.paneState()).toBe("running");
		expect(ctx.store.getSnapshot()?.primary?.taskPath).toBe(EMAIL_PATH);
		expect(ctx.store.getSnapshot()?.others).toEqual([]);
	});

	test("a 'no active session' race is silent and still refreshes", async () => {
		const ctx = await setup([report()]);
		const before = ctx.tn.activeCalls;
		ctx.tn.failStopWith(NO_ACTIVE_SESSION_MESSAGE);

		expect(await ctx.controller.stop(ctx.primaryTarget())).toBe("already-stopped");

		expect(ctx.notify).not.toHaveBeenCalled();
		expect(ctx.tn.activeCalls).toBeGreaterThan(before);
	});

	test("any other failure shows the Stop-failed Notice exactly once", async () => {
		const ctx = await setup([report()]);
		ctx.tn.failStopWith("Disk is read-only");

		expect(await ctx.controller.stop(ctx.primaryTarget())).toBe("failed");

		expect(ctx.notify).toHaveBeenCalledTimes(1);
		expect(ctx.notify).toHaveBeenCalledWith(
			'Couldn\'t stop the timer for "Write quarterly report": Disk is read-only. Try again, or stop it from the TaskNotes status bar.',
		);
		expect(ctx.log).toHaveBeenCalled();
	});

	test("an empty failure message uses 'TaskNotes reported an error'", async () => {
		const ctx = await setup([report()]);
		ctx.tn.failStopWith("");

		expect(await ctx.controller.stop(ctx.primaryTarget())).toBe("failed");

		expect(ctx.notify).toHaveBeenCalledWith(
			'Couldn\'t stop the timer for "Write quarterly report": TaskNotes reported an error. Try again, or stop it from the TaskNotes status bar.',
		);
	});

	test("'Task not found' notifies, then refreshes", async () => {
		const ctx = await setup([report()]);
		const before = ctx.tn.activeCalls;
		ctx.tn.failStopWith("Task not found: " + REPORT_PATH);
		const order: string[] = [];
		ctx.notify.mockImplementation(() => order.push("notify:" + ctx.tn.activeCalls));

		expect(await ctx.controller.stop(ctx.primaryTarget())).toBe("failed");

		expect(ctx.notify).toHaveBeenCalledTimes(1);
		expect(order).toEqual(["notify:" + before]);
		expect(ctx.tn.activeCalls).toBe(before + 1);
	});
});

describe("stopFailedNotice copy", () => {
	test("trims the reason and drops trailing periods", () => {
		expect(stopFailedNotice("A", "  Locked file...  ")).toBe(
			'Couldn\'t stop the timer for "A": Locked file. Try again, or stop it from the TaskNotes status bar.',
		);
		expect(stopFailedNotice("A", " . ")).toBe(
			'Couldn\'t stop the timer for "A": TaskNotes reported an error. Try again, or stop it from the TaskNotes status bar.',
		);
	});
});

describe("WriteQueue", () => {
	test("runs strictly in order; a rejection does not break the chain", async () => {
		vi.useRealTimers();
		const queue = new WriteQueue();
		const events: string[] = [];
		const delay = (ms: number) => new Promise<void>((resolve) => {
			const timers = { setTimeout };
			timers.setTimeout(resolve, ms);
		});

		const first = queue.run(async () => {
			events.push("1 start");
			await delay(20);
			events.push("1 end");
			throw new Error("first failed");
		});
		const second = queue.run(async () => {
			events.push("2 start");
			await delay(5);
			events.push("2 end");
			return 2;
		});
		const third = queue.run(() => {
			events.push("3 start");
			return Promise.resolve(3);
		});

		await expect(first).rejects.toThrow("first failed");
		await expect(second).resolves.toBe(2);
		await expect(third).resolves.toBe(3);
		expect(events).toEqual(["1 start", "1 end", "2 start", "2 end", "3 start"]);
	});
});

describe("no automatic stops (D-05)", () => {
	const doneEntry = () => email({ status: "done" });
	const archivedEntry = () => report({ archived: true });

	test("done-status and archive-flag timers are shown normally and never stopped without a click", async () => {
		const ctx = await setup([doneEntry(), archivedEntry()]);
		for (let i = 0; i < 3; i++) {
			ctx.tn.emitTaskEvent("task.updated");
			await vi.advanceTimersByTimeAsync(REFRESH_DEBOUNCE_MS);
		}

		expect(ctx.tn.stopCalls).toEqual([]);
		expect(ctx.paneState()).toBe("running");
		const snapshot = ctx.store.getSnapshot();
		expect(snapshot?.primary?.taskPath).toBe(REPORT_PATH);
		expect(snapshot?.others.map((timer) => timer.taskPath)).toEqual([EMAIL_PATH]);
		expect(ctx.notify).not.toHaveBeenCalled();
	});

	test("an archive-flag primary stops with one click, like any other timer", async () => {
		const ctx = await setup([doneEntry(), archivedEntry()]);

		expect(await ctx.controller.stop(ctx.primaryTarget())).toBe("stopped");

		expect(ctx.tn.stopCalls).toHaveLength(1);
		expect(ctx.tn.stopCalls[0]?.path).toBe(REPORT_PATH);
		expect(ctx.tn.stopCalls[0]?.context?.reason).toBe("user stop");
		expect(ctx.store.getSnapshot()?.primary?.taskPath).toBe(EMAIL_PATH);
	});
});


describe("Start tracer", () => {
	test("starts alongside existing timers and refreshes without stopping", async () => {
		const ctx = await setup([report()]);
		const states: boolean[] = [];
		ctx.controller.subscribeBusy(() => states.push(ctx.controller.isBusy()));
		expect(await ctx.controller.start({ taskPath: EMAIL_PATH, title: "Email" })).toBe("started");
		expect(ctx.tn.startCalls).toEqual([{ path: EMAIL_PATH, options: {}, context: { source: MUTATION_SOURCE, reason: "user start", correlationId: "corr-1" } }]);
		expect(ctx.tn.stopCalls).toEqual([]);
		expect(ctx.store.getSnapshot()?.others).toHaveLength(1);
		expect(states).toEqual([true, false]);
	});
	test("queued duplicate starts write once and recover busy even when Notice throws", async () => {
		const ctx = await setup([]);
		ctx.notify.mockImplementation(() => { throw new Error("Notice failed"); });
		const target = { taskPath: EMAIL_PATH, title: "Email" };
		expect(await Promise.all([ctx.controller.start(target), ctx.controller.start(target)])).toEqual(["started", "already-running"]);
		expect(ctx.tn.startCalls).toHaveLength(1);
		expect(ctx.tn.stopCalls).toEqual([]);
		expect(ctx.controller.isBusy()).toBe(false);
	});
});

describe("Start failure and serialization", () => {
 test("existing duplicate makes no writes and reports a text-only Notice", async () => {
  const ctx = await setup([report()]);
  expect(await ctx.controller.start({taskPath: REPORT_PATH, title: "<b>Report</b>"})).toBe("already-running");
  expect(ctx.tn.startCalls).toEqual([]); expect(ctx.tn.stopCalls).toEqual([]);
  expect(ctx.notify).toHaveBeenCalledWith("<b>Report</b> is already being timed.");
 });
 test("failed start refreshes, releases busy and admits a later action", async () => {
  const ctx = await setup([]); ctx.tn.failStartWith("Read-only disk");
  const target = { taskPath: REPORT_PATH, title: "Report" };
  expect(await ctx.controller.start(target)).toBe("failed");
  expect(ctx.notify).toHaveBeenCalledTimes(1); expect(ctx.controller.isBusy()).toBe(false);
  ctx.tn.failStartWith(null);
  expect(await ctx.controller.start(target)).toBe("started");
 });
 test("rapid distinct starts never overlap and keep busy through both refreshes", async () => {
  const ctx = await setup([]); const original = ctx.tn.api.time.start!.bind(ctx.tn.api.time);
  let inFlight = 0; let maxInFlight = 0;
  ctx.tn.api.time.start = async function(path, options, context) {
   inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
   await Promise.resolve();
   try { return await original(path, options, context); } finally { inFlight--; }
  };
  const states: boolean[] = []; ctx.controller.subscribeBusy(() => states.push(ctx.controller.isBusy()));
  expect(await Promise.all([ctx.controller.start({taskPath: REPORT_PATH, title: "Report"}),ctx.controller.start({taskPath: EMAIL_PATH, title: "Email"})])).toEqual(["started", "started"]);
  expect(maxInFlight).toBe(1); expect(states[states.length - 1]).toBe(false);
  expect(ctx.tn.stopCalls).toEqual([]); expect(ctx.store.getSnapshot()?.others).toHaveLength(1);
 });
});

test("an external same-task start winning after recheck is already-running without compensation", async () => {
 const ctx = await setup([]);
 ctx.tn.failStartWith("Task is already being timed");
 expect(await ctx.controller.start({taskPath: REPORT_PATH, title: "Report"})).toBe("already-running");
 expect(ctx.tn.stopCalls).toEqual([]); expect(ctx.notify).toHaveBeenCalledWith("Report is already being timed.");
 expect(ctx.controller.isBusy()).toBe(false);
});

// ---- plan 03-04: Start refuses the Pomodoro's task, re-checked inside the queue (D-17) ----
describe("Start Pomodoro guard (D-17)", () => {
	function pomodoroOn(taskPath: string, startTime: string) {
		return { isRunning: true, timeRemaining: 1500, currentSession: { taskPath, startTime, timeTrackingStartTime: startTime, type: "work" as const, completed: false } };
	}
	test("start on the Pomodoro's task writes nothing and explains, before the already-running check", async () => {
		const ctx = await setup([report()]);
		ctx.tn.setPomodoro(pomodoroOn(REPORT_PATH, REPORT_START));
		expect(await ctx.controller.start({ taskPath: REPORT_PATH, title: "Write quarterly report" })).toBe("pomodoro");
		expect(ctx.tn.startCalls).toHaveLength(0);
		expect(ctx.tn.stopCalls).toEqual([]);
		expect(ctx.notify).toHaveBeenCalledTimes(1);
		expect(ctx.notify).toHaveBeenCalledWith("Write quarterly report is being timed by Pomodoro.");
		expect(ctx.controller.isBusy()).toBe(false);
	});
	test("an owner path written differently still matches the target", async () => {
		const ctx = await setup([report()]);
		ctx.tn.setPomodoro(pomodoroOn("./" + REPORT_PATH, REPORT_START));
		expect(await ctx.controller.start({ taskPath: REPORT_PATH, title: "Report" })).toBe("pomodoro");
		expect(ctx.tn.startCalls).toHaveLength(0);
	});
	test("a Pomodoro on another task does not block the start", async () => {
		const ctx = await setup([report()]);
		ctx.tn.setPomodoro(pomodoroOn(REPORT_PATH, REPORT_START));
		expect(await ctx.controller.start({ taskPath: EMAIL_PATH, title: "Email" })).toBe("started");
		expect(ctx.tn.startCalls).toHaveLength(1);
	});
	test("the Pomodoro ending between picker open and choice lets the start proceed", async () => {
		const ctx = await setup([]);
		// The picker saw the Pomodoro on REPORT; by the time the user chose, it had ended.
		ctx.tn.setPomodoro({ isRunning: false, timeRemaining: 0 });
		expect(await ctx.controller.start({ taskPath: REPORT_PATH, title: "Report" })).toBe("started");
		expect(ctx.tn.startCalls).toHaveLength(1);
		expect(ctx.notify).not.toHaveBeenCalled();
	});
	test("a paused Pomodoro owns no entry, so its task can be started (Open Question 1)", async () => {
		const ctx = await setup([]);
		ctx.tn.setPomodoro({ isRunning: false, timeRemaining: 900, currentSession: { taskPath: REPORT_PATH, startTime: REPORT_START, timeTrackingStartTime: REPORT_START, type: "work", completed: false } });
		expect(await ctx.controller.start({ taskPath: REPORT_PATH, title: "Report" })).toBe("started");
		expect(ctx.tn.startCalls).toHaveLength(1);
	});
	test("ownership unreadable inside the queue falls back to the Phase 2 already-running check", async () => {
		const ctx = await setup([report()]);
		vi.spyOn(ctx.bridge, "pomodoroOwnership").mockRejectedValue(new Error("pomodoro down"));
		expect(await ctx.controller.start({ taskPath: REPORT_PATH, title: "Report" })).toBe("already-running");
		expect(ctx.tn.startCalls).toHaveLength(0);
		expect(ctx.notify).toHaveBeenCalledWith("Report is already being timed.");
	});
	test("ownership unreadable inside the queue still starts a task with no open entry", async () => {
		const ctx = await setup([]);
		vi.spyOn(ctx.bridge, "pomodoroOwnership").mockResolvedValue({ readable: false });
		expect(await ctx.controller.start({ taskPath: REPORT_PATH, title: "Report" })).toBe("started");
		expect(ctx.tn.startCalls).toHaveLength(1);
	});
});
