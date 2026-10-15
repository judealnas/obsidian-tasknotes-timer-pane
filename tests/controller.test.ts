// D-12 tracer for the write path (CTRL-01): the Stop path end to end through the
// real TaskNotesBridge (fed by the fake TaskNotes), the real TimerStore, WriteQueue
// and TimerController. Pure logic plus fakes, no DOM. Also pins D-05: the pane never
// stops a timer nobody clicked.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stopFailedNotice } from "../src/model/errors";
import { derivePaneState } from "../src/model/timeMath";
import { TimerController, type StopTarget } from "../src/state/TimerController";
import { REFRESH_DEBOUNCE_MS, TimerStore } from "../src/state/TimerStore";
import { WriteQueue } from "../src/state/WriteQueue";
import { MUTATION_SOURCE, TaskNotesBridge } from "../src/tasknotes/TaskNotesBridge";
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
