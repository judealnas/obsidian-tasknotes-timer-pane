// Phase 3 tracer (CTRL-02, CTRL-03): pause one card and resume it, end to end through
// the real TaskNotesBridge (fed by the fake TaskNotes), the real TimerStore,
// WriteQueue, TimerController and one shared PauseStore. Pure logic plus fakes, no DOM.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { derivePaneState, timerSessionMs, type OpenTimer } from "../src/model/timeMath";
import { PauseStore } from "../src/state/PauseStore";
import { TimerController } from "../src/state/TimerController";
import { REFRESH_DEBOUNCE_MS, TimerStore } from "../src/state/TimerStore";
import { WriteQueue } from "../src/state/WriteQueue";
import { MUTATION_SOURCE, TaskNotesBridge } from "../src/tasknotes/TaskNotesBridge";
import type { ActiveTimeEntry } from "../src/tasknotes/runtime-api.types";
import { NO_ACTIVE_SESSION_MESSAGE, createFakeTaskNotes, makeActiveEntry, timerSchedule } from "./fakes/fakeTaskNotes";

const REPORT_PATH = "TaskNotes/Tasks/Write quarterly report.md";
const EMAIL_PATH = "TaskNotes/Tasks/Answer email.md";
const NEXT_PATH = "TaskNotes/Tasks/Plan next week.md";
const START = "2026-10-14T10:00:00.000Z";
const START_MS = Date.parse(START);
const MINUTE = 60_000;

function report(): ActiveTimeEntry {
	return makeActiveEntry({ taskPath: REPORT_PATH, startTime: START, title: "Write quarterly report" });
}
function email(): ActiveTimeEntry {
	return makeActiveEntry({ taskPath: EMAIL_PATH, startTime: START, title: "Answer email" });
}
function next(): ActiveTimeEntry {
	return makeActiveEntry({ taskPath: NEXT_PATH, startTime: START, title: "Plan next week" });
}

/** Real bridge, store, queue, controller and pause store over a fake TaskNotes, primed with a first refresh. */
async function setup(active: ActiveTimeEntry[]) {
	const tn = createFakeTaskNotes({ active });
	const log = vi.fn<(message: string) => void>();
	const bridge = new TaskNotesBridge({ lookupPlugin: () => tn.plugin, log, schedule: timerSchedule });
	const pauses = new PauseStore({ log });
	pauses.load([]);
	const store = new TimerStore({ gateway: bridge, log, schedule: timerSchedule, pauses });
	const notify = vi.fn<(message: string) => void>();
	let seq = 0;
	const controller = new TimerController({ gateway: bridge, store, queue: new WriteQueue(), notify, newCorrelationId: () => `corr-${++seq}`, log, pauses });
	bridge.probe();
	await store.refreshNow();
	const timers = (): OpenTimer[] => {
		const snapshot = store.getSnapshot();
		return snapshot?.primary ? [snapshot.primary, ...snapshot.others] : [];
	};
	const card = (path: string): OpenTimer => {
		const found = timers().find(timer => timer.taskPath === path);
		if (!found) throw new Error("no card for " + path);
		return found;
	};
	const pauseCard = (path: string) => {
		const { taskPath, startTime, title } = card(path);
		return controller.pause({ taskPath, startTime, title });
	};
	const resumeCard = (path: string) => {
		const { taskPath, title } = card(path);
		return controller.resume({ taskPath, title });
	};
	const paneState = () => derivePaneState(bridge.getState(), store.getSnapshot());
	return { tn, bridge, pauses, store, controller, notify, log, timers, card, pauseCard, resumeCard, paneState };
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(START_MS + 10 * MINUTE);
});
afterEach(() => {
	vi.useRealTimers();
});

describe("Pause (CTRL-02)", () => {
	test("pausing the only running card closes its entry once and keeps the card, frozen and paused", async () => {
		const ctx = await setup([report()]);

		expect(await ctx.pauseCard(REPORT_PATH)).toBe("paused");

		expect(ctx.tn.stopCalls).toHaveLength(1);
		expect(ctx.tn.stopCalls[0]?.path).toBe(REPORT_PATH);
		expect(ctx.tn.stopCalls[0]?.context?.source).toBe(MUTATION_SOURCE);
		expect(ctx.tn.stopCalls[0]?.context?.reason).toBe("user pause");
		expect(ctx.tn.stopCalls[0]?.context?.correlationId).toBeTruthy();
		expect(ctx.timers()).toHaveLength(1);
		const paused = ctx.card(REPORT_PATH);
		expect(paused.state).toBe("paused");
		expect(paused.accumulatedMs).toBe(10 * MINUTE);
		expect(paused.sessionStartedAt).toBe(START);
		expect(paused.totalKnown).toBe(true);
		expect(timerSessionMs(paused, Date.now())).toBe(10 * MINUTE);
		expect(ctx.notify).not.toHaveBeenCalled();
	});

	test("while paused, time passing never changes the paused Session value", async () => {
		const ctx = await setup([report()]);
		await ctx.pauseCard(REPORT_PATH);
		vi.setSystemTime(START_MS + 55 * MINUTE);
		await ctx.store.refreshNow();
		const paused = ctx.card(REPORT_PATH);
		expect(timerSessionMs(paused, Date.now())).toBe(10 * MINUTE);
		expect(paused.state).toBe("paused");
	});

	test("a paused-only pane is not idle: the paused card is still shown", async () => {
		const ctx = await setup([report()]);
		await ctx.pauseCard(REPORT_PATH);
		expect(ctx.paneState()).toBe("running");
		expect(ctx.store.getSnapshot()?.primary?.state).toBe("paused");
	});

	test("two tasks started at the same instant: pausing one stops only that one", async () => {
		const ctx = await setup([report(), email()]);

		expect(await ctx.pauseCard(REPORT_PATH)).toBe("paused");

		expect(ctx.tn.stopCalls.map(call => call.path)).toEqual([REPORT_PATH]);
		expect(ctx.card(REPORT_PATH).state).toBe("paused");
		expect(ctx.card(EMAIL_PATH).state).toBe("running");
		expect((await ctx.tn.api.time.active()).map(item => item.taskPath)).toEqual([EMAIL_PATH]);
	});

	test("TaskNotes reporting no active session is already-stopped: no pause record, no notice", async () => {
		const ctx = await setup([report()]);
		ctx.tn.failStopWith(NO_ACTIVE_SESSION_MESSAGE);

		expect(await ctx.pauseCard(REPORT_PATH)).toBe("already-stopped");

		expect(ctx.pauses.records()).toEqual([]);
		expect(ctx.notify).not.toHaveBeenCalled();
	});

	test("a timer that vanished before its turn is already-stopped with no write", async () => {
		const ctx = await setup([report()]);
		const target = { taskPath: REPORT_PATH, startTime: START, title: "Write quarterly report" };
		ctx.tn.setActive([]);

		expect(await ctx.controller.pause(target)).toBe("already-stopped");

		expect(ctx.tn.stopCalls).toEqual([]);
		expect(ctx.pauses.records()).toEqual([]);
	});

	test("any other stop failure shows a plain pause notice and records nothing", async () => {
		const ctx = await setup([report()]);
		ctx.tn.failStopWith("Disk is read-only");

		expect(await ctx.pauseCard(REPORT_PATH)).toBe("failed");

		expect(ctx.notify).toHaveBeenCalledWith('Couldn\'t pause the timer for "Write quarterly report": Disk is read-only. Try again.');
		expect(ctx.pauses.records()).toEqual([]);
		expect(ctx.card(REPORT_PATH).state).toBe("running");
		expect(ctx.controller.isBusy()).toBe(false);
	});
});

describe("Resume (CTRL-03)", () => {
	test("resume starts the same task once and Session continues from the paused value", async () => {
		const ctx = await setup([report()]);
		await ctx.pauseCard(REPORT_PATH);
		const key = ctx.card(REPORT_PATH).sessionKey;
		vi.setSystemTime(START_MS + 30 * MINUTE);

		expect(await ctx.resumeCard(REPORT_PATH)).toBe("resumed");

		expect(ctx.tn.startCalls).toHaveLength(1);
		expect(ctx.tn.startCalls[0]?.path).toBe(REPORT_PATH);
		expect(ctx.tn.startCalls[0]?.context?.reason).toBe("user resume");
		expect(ctx.tn.startCalls[0]?.context?.source).toBe(MUTATION_SOURCE);
		const resumed = ctx.card(REPORT_PATH);
		expect(resumed.state).toBe("running");
		expect(resumed.sessionKey).toBe(key);
		expect(resumed.sessionStartedAt).toBe(START);
		expect(timerSessionMs(resumed, START_MS + 33 * MINUTE)).toBe(13 * MINUTE);
		expect(ctx.timers()).toHaveLength(1);
	});

	test("a zero-length gap continues from exactly the frozen value", async () => {
		const ctx = await setup([report()]);
		await ctx.pauseCard(REPORT_PATH);
		await ctx.resumeCard(REPORT_PATH);
		expect(timerSessionMs(ctx.card(REPORT_PATH), Date.now())).toBe(10 * MINUTE);
	});

	test("pause, resume, pause again: both closed segments are summed once, the first start is kept", async () => {
		const ctx = await setup([report()]);
		await ctx.pauseCard(REPORT_PATH);
		vi.setSystemTime(START_MS + 30 * MINUTE);
		await ctx.resumeCard(REPORT_PATH);
		vi.setSystemTime(START_MS + 33 * MINUTE);

		expect(await ctx.pauseCard(REPORT_PATH)).toBe("paused");

		const paused = ctx.card(REPORT_PATH);
		expect(paused.state).toBe("paused");
		expect(paused.accumulatedMs).toBe(13 * MINUTE);
		expect(paused.sessionStartedAt).toBe(START);
		expect(ctx.tn.stopCalls).toHaveLength(2);
		// Total is TaskNotes' tracked time: both closed entries.
		expect(paused.entries.map(entry => entry.endMs !== null)).toEqual([true, true]);
	});

	test("resuming onto the Pomodoro's own entry shows the Pomodoro notice and writes nothing", async () => {
		const ctx = await setup([report()]);
		await ctx.pauseCard(REPORT_PATH);
		vi.setSystemTime(START_MS + 20 * MINUTE);
		const pomodoroStart = new Date().toISOString();
		await ctx.tn.api.time.start!(REPORT_PATH, {});
		ctx.tn.setPomodoro({ isRunning: true, timeRemaining: 1500, currentSession: { taskPath: REPORT_PATH, startTime: pomodoroStart, timeTrackingStartTime: pomodoroStart, type: "work", completed: false } });
		const starts = ctx.tn.startCalls.length;

		expect(await ctx.controller.resume({ taskPath: REPORT_PATH, title: "Write quarterly report" })).toBe("pomodoro");

		expect(ctx.tn.startCalls).toHaveLength(starts);
		expect(ctx.notify).toHaveBeenCalledWith("Write quarterly report is being timed by Pomodoro.");
	});

	test("an already-active start error is already-running with no notice; the next refresh converts the record", async () => {
		const ctx = await setup([report()]);
		await ctx.pauseCard(REPORT_PATH);
		ctx.tn.failStartWith("Time tracking is already active for this task");

		expect(await ctx.resumeCard(REPORT_PATH)).toBe("already-running");

		expect(ctx.notify).not.toHaveBeenCalled();
		expect(ctx.card(REPORT_PATH).state).toBe("paused");
		ctx.tn.failStartWith(null);
		await ctx.tn.api.time.start!(REPORT_PATH, {});
		await ctx.store.refreshNow();
		expect(ctx.card(REPORT_PATH).state).toBe("running");
		expect(ctx.card(REPORT_PATH).accumulatedMs).toBe(10 * MINUTE);
	});

	test("any other start failure shows a plain resume notice and keeps the pause", async () => {
		const ctx = await setup([report()]);
		await ctx.pauseCard(REPORT_PATH);
		ctx.tn.failStartWith("Disk is read-only");

		expect(await ctx.resumeCard(REPORT_PATH)).toBe("failed");

		expect(ctx.notify).toHaveBeenCalledWith('Couldn\'t resume the timer for "Write quarterly report": Disk is read-only. Try again.');
		expect(ctx.card(REPORT_PATH).state).toBe("paused");
	});
});

describe("Pauses and other timers (D-03, D-11)", () => {
	test("starting another task from the pane leaves the pause untouched", async () => {
		const ctx = await setup([report()]);
		await ctx.pauseCard(REPORT_PATH);

		expect(await ctx.controller.start({ taskPath: NEXT_PATH, title: "Plan next week" })).toBe("started");

		expect(ctx.card(REPORT_PATH).state).toBe("paused");
		expect(ctx.card(REPORT_PATH).accumulatedMs).toBe(10 * MINUTE);
		expect(ctx.card(NEXT_PATH).state).toBe("running");
	});

	test("starting another task from TaskNotes leaves the pause untouched", async () => {
		const ctx = await setup([report()]);
		await ctx.pauseCard(REPORT_PATH);
		await ctx.tn.api.time.start!(NEXT_PATH, {});
		ctx.tn.emitTaskEvent("task.updated");
		await vi.advanceTimersByTimeAsync(REFRESH_DEBOUNCE_MS);

		expect(ctx.card(REPORT_PATH).state).toBe("paused");
		expect(ctx.card(NEXT_PATH).state).toBe("running");
	});

	test("starting the paused task from TaskNotes resumes its card, Session continuing", async () => {
		const ctx = await setup([report()]);
		await ctx.pauseCard(REPORT_PATH);
		const key = ctx.card(REPORT_PATH).sessionKey;
		vi.setSystemTime(START_MS + 40 * MINUTE);
		await ctx.tn.api.time.start!(REPORT_PATH, {});
		ctx.tn.emitTaskEvent("task.updated");
		await vi.advanceTimersByTimeAsync(REFRESH_DEBOUNCE_MS);

		const resumed = ctx.card(REPORT_PATH);
		expect(resumed.state).toBe("running");
		expect(resumed.sessionKey).toBe(key);
		expect(timerSessionMs(resumed, START_MS + 45 * MINUTE)).toBe(15 * MINUTE);
		expect(ctx.timers()).toHaveLength(1);
	});

	test("a resumed timer stopped elsewhere loses its record and its card", async () => {
		const ctx = await setup([report()]);
		await ctx.pauseCard(REPORT_PATH);
		await ctx.resumeCard(REPORT_PATH);
		await ctx.tn.api.time.stop(REPORT_PATH);
		await ctx.store.refreshNow();

		expect(ctx.timers()).toEqual([]);
		expect(ctx.pauses.records()).toEqual([]);
	});
});

describe("Stop and Complete on a paused card (D-09)", () => {
	test("Stop on a paused card clears the pause and the card with no TaskNotes write", async () => {
		const ctx = await setup([report()]);
		await ctx.pauseCard(REPORT_PATH);
		expect(ctx.tn.stopCalls).toHaveLength(1);

		expect(await ctx.controller.stopPaused({ taskPath: REPORT_PATH, title: "Write quarterly report" })).toBe("cleared");

		expect(ctx.tn.stopCalls).toHaveLength(1);
		expect(ctx.tn.startCalls).toEqual([]);
		expect(ctx.tn.completeCalls).toEqual([]);
		expect(ctx.pauses.records()).toEqual([]);
		expect(ctx.timers()).toEqual([]);
		expect(ctx.paneState()).toBe("idle");
		expect(ctx.controller.isBusy()).toBe(false);
	});

	test("Stop on a paused card that was started elsewhere meanwhile is not-paused and keeps the record", async () => {
		const ctx = await setup([report()]);
		await ctx.pauseCard(REPORT_PATH);
		await ctx.tn.api.time.start!(REPORT_PATH, {});
		await ctx.store.refreshNow();

		expect(await ctx.controller.stopPaused({ taskPath: REPORT_PATH, title: "Write quarterly report" })).toBe("not-paused");

		expect(ctx.pauses.records()).toHaveLength(1);
		expect(ctx.pauses.records()[0]?.state).toBe("running");
		expect(ctx.card(REPORT_PATH).state).toBe("running");
		expect(ctx.tn.stopCalls).toHaveLength(1);
	});

	test("Complete on a paused card writes the completed status once, stops nothing and clears the pause", async () => {
		const ctx = await setup([report()]);
		await ctx.pauseCard(REPORT_PATH);
		const { taskPath, startTime, title } = ctx.card(REPORT_PATH);

		expect(await ctx.controller.complete({ taskPath, startTime, title })).toBe("completed");

		expect(ctx.tn.completeCalls).toHaveLength(1);
		expect(ctx.tn.completeCalls[0]).toMatchObject({ path: REPORT_PATH, status: "done" });
		expect(ctx.tn.stopCalls).toHaveLength(1);
		expect(ctx.pauses.records()).toEqual([]);
		expect(ctx.timers()).toEqual([]);
		expect(ctx.notify).not.toHaveBeenCalled();
	});

	test("Complete on a paused card whose status write fails keeps the pause and shows the complete notice", async () => {
		const ctx = await setup([report()]);
		await ctx.pauseCard(REPORT_PATH);
		const { taskPath, startTime, title } = ctx.card(REPORT_PATH);
		ctx.tn.failCompleteWith("Disk is read-only");

		expect(await ctx.controller.complete({ taskPath, startTime, title })).toBe("failed");

		expect(ctx.notify).toHaveBeenCalledWith("Couldn't complete the task. Try again in TaskNotes.");
		expect(ctx.pauses.records()).toHaveLength(1);
		expect(ctx.card(REPORT_PATH).state).toBe("paused");
		expect(ctx.tn.stopCalls).toHaveLength(1);
	});
});

describe("Stop all clears pauses (D-10, CTRL-04)", () => {
	test("one running timer and two paused records: one stop write, both pauses cleared, pane idle", async () => {
		const ctx = await setup([report(), email(), next()]);
		await ctx.pauseCard(REPORT_PATH);
		await ctx.pauseCard(EMAIL_PATH);
		expect(ctx.tn.stopCalls).toHaveLength(2);

		expect(await ctx.controller.stopAll()).toMatchObject({ stopped: 1, cleared: 2, failed: 0, ownershipUnreadable: false });

		expect(ctx.tn.stopCalls.map(call => call.path)).toEqual([REPORT_PATH, EMAIL_PATH, NEXT_PATH]);
		expect(ctx.pauses.records()).toEqual([]);
		expect(ctx.timers()).toEqual([]);
		expect(ctx.paneState()).toBe("idle");
	});

	test("only paused records: zero stop writes and every pause cleared", async () => {
		const ctx = await setup([report(), email()]);
		await ctx.pauseCard(REPORT_PATH);
		await ctx.pauseCard(EMAIL_PATH);

		expect(await ctx.controller.stopAll()).toMatchObject({ stopped: 0, cleared: 2 });

		expect(ctx.tn.stopCalls).toHaveLength(2);
		expect(ctx.pauses.records()).toEqual([]);
		expect(ctx.paneState()).toBe("idle");
	});

	test("a Stop all that halts on unreadable Pomodoro ownership keeps paused records", async () => {
		const ctx = await setup([report(), email(), next()]);
		await ctx.pauseCard(REPORT_PATH);
		const status = vi.spyOn(ctx.tn.api.pomodoro!, "status").mockRejectedValue(new Error("unreadable"));

		expect(await ctx.controller.stopAll()).toMatchObject({ stopped: 0, cleared: 0, ownershipUnreadable: true });
		expect(ctx.pauses.records()).toHaveLength(1);
		expect(ctx.tn.stopCalls).toHaveLength(1);

		// Halting mid-batch keeps them too.
		status.mockRestore();
		const original = ctx.tn.api.time.stop.bind(ctx.tn.api.time);
		vi.spyOn(ctx.tn.api.time, "stop").mockImplementation(async (path, context) => {
			const result = await original(path, context);
			vi.spyOn(ctx.tn.api.pomodoro!, "status").mockRejectedValue(new Error("unreadable"));
			return result;
		});
		expect(await ctx.controller.stopAll()).toMatchObject({ stopped: 1, cleared: 0, ownershipUnreadable: true });
		expect(ctx.pauses.records().filter(record => record.state === "paused")).toHaveLength(1);
	});

	test("a resumed timer stopped by Stop all disappears through reconcile, not the paused clear", async () => {
		const ctx = await setup([report()]);
		await ctx.pauseCard(REPORT_PATH);
		await ctx.resumeCard(REPORT_PATH);
		expect(ctx.pauses.records()[0]?.state).toBe("running");

		expect(await ctx.controller.stopAll()).toMatchObject({ stopped: 1, cleared: 0 });

		expect(ctx.pauses.records()).toEqual([]);
		expect(ctx.timers()).toEqual([]);
	});
});

describe("Header state (D-02)", () => {
	test("getHeaderState counts paused cards and resets when the bridge leaves ready", async () => {
		const ctx = await setup([report(), email()]);
		expect(ctx.store.getHeaderState()).toEqual({ readable: true, eligibleCount: 2, pausedCount: 0 });

		await ctx.pauseCard(REPORT_PATH);
		expect(ctx.store.getHeaderState()).toEqual({ readable: true, eligibleCount: 1, pausedCount: 1 });
		await ctx.pauseCard(EMAIL_PATH);
		expect(ctx.store.getHeaderState()).toEqual({ readable: true, eligibleCount: 0, pausedCount: 2 });

		ctx.tn.emitLifecycle("unloading");
		expect(ctx.store.getHeaderState()).toEqual({ readable: false, eligibleCount: 0, pausedCount: 0 });
	});
});

const UNREADABLE_NOTICE = "Couldn't verify Pomodoro ownership. Pause all has stopped; try again when TaskNotes is ready.";

function pomodoroOn(taskPath: string, startTime: string) {
	return { isRunning: true, timeRemaining: 1500, currentSession: { taskPath, startTime, timeTrackingStartTime: startTime, type: "work" as const, completed: false } };
}

/** Logs every TaskNotes read and write the controller makes, in call order. */
function traceCalls(ctx: Awaited<ReturnType<typeof setup>>): string[] {
	const order: string[] = [];
	const time = ctx.tn.api.time;
	const pomodoro = ctx.tn.api.pomodoro!;
	const active = time.active.bind(time);
	const stop = time.stop.bind(time);
	const start = time.start!.bind(time);
	const status = pomodoro.status.bind(pomodoro);
	vi.spyOn(time, "active").mockImplementation(() => { order.push("active"); return active(); });
	vi.spyOn(time, "stop").mockImplementation((path, context) => { order.push("stop:" + path); return stop(path, context); });
	vi.spyOn(time, "start").mockImplementation((path, options, context) => { order.push("start:" + path); return start(path, options, context); });
	vi.spyOn(pomodoro, "status").mockImplementation(() => { order.push("ownership"); return status(); });
	return order;
}

/** The reads between each write and the one before it. */
function readsBeforeEachWrite(order: readonly string[]): string[][] {
	const groups: string[][] = [];
	let current: string[] = [];
	for (const call of order) {
		if (call.startsWith("stop:") || call.startsWith("start:")) {
			groups.push(current);
			current = [];
		} else current.push(call);
	}
	return groups;
}

describe("Pause all (CTRL-02, D-04, D-05)", () => {
	test("pauses A then B in active order, each after fresh active and ownership reads", async () => {
		const ctx = await setup([report(), email()]);
		const order = traceCalls(ctx);

		expect(await ctx.controller.pauseAll()).toEqual({ paused: 2, skipped: 0, failed: 0, ownershipUnreadable: false });

		expect(ctx.tn.stopCalls.map(call => call.path)).toEqual([REPORT_PATH, EMAIL_PATH]);
		expect(ctx.tn.stopCalls.map(call => call.context?.reason)).toEqual(["user pause all", "user pause all"]);
		expect(ctx.tn.stopCalls.every(call => call.context?.source === MUTATION_SOURCE)).toBe(true);
		for (const reads of readsBeforeEachWrite(order)) expect(reads).toEqual(expect.arrayContaining(["active", "ownership"]));
		expect(order.filter(call => call.startsWith("stop:"))).toEqual(["stop:" + REPORT_PATH, "stop:" + EMAIL_PATH]);
		expect(ctx.card(REPORT_PATH).state).toBe("paused");
		expect(ctx.card(EMAIL_PATH).state).toBe("paused");
		expect(ctx.card(REPORT_PATH).title).toBe("Write quarterly report");
		expect(ctx.notify).not.toHaveBeenCalled();
	});

	test("targets are deduplicated (path, startTime) entries in captured active order", async () => {
		const ctx = await setup([email(), report(), email()]);

		expect(await ctx.controller.pauseAll()).toMatchObject({ paused: 2, skipped: 0 });

		expect(ctx.tn.stopCalls.map(call => call.path)).toEqual([EMAIL_PATH, REPORT_PATH]);
	});

	test("skips a target that vanished before its turn and one that became Pomodoro-owned", async () => {
		const ctx = await setup([report(), email(), next()]);
		const stop = ctx.tn.api.time.stop.bind(ctx.tn.api.time);
		vi.spyOn(ctx.tn.api.time, "stop").mockImplementation(async (path, context) => {
			const result = await stop(path, context);
			if (path === REPORT_PATH) {
				// Answer email was stopped elsewhere; the Pomodoro took over Plan next week.
				ctx.tn.setActive([next()]);
				ctx.tn.setPomodoro(pomodoroOn(NEXT_PATH, START));
			}
			return result;
		});

		expect(await ctx.controller.pauseAll()).toEqual({ paused: 1, skipped: 2, failed: 0, ownershipUnreadable: false });

		expect(ctx.tn.stopCalls.map(call => call.path)).toEqual([REPORT_PATH]);
		expect(ctx.notify).not.toHaveBeenCalled();
	});

	test("ownership unreadable at the start: zero writes and the halt notice", async () => {
		const ctx = await setup([report(), email()]);
		vi.spyOn(ctx.tn.api.pomodoro!, "status").mockRejectedValue(new Error("private/path.md"));

		expect(await ctx.controller.pauseAll()).toEqual({ paused: 0, skipped: 0, failed: 0, ownershipUnreadable: true });

		expect(ctx.tn.stopCalls).toEqual([]);
		expect(ctx.notify).toHaveBeenCalledTimes(1);
		expect(ctx.notify).toHaveBeenCalledWith(UNREADABLE_NOTICE);
		expect(ctx.pauses.records()).toEqual([]);
		expect(ctx.controller.isBusy()).toBe(false);
	});

	test("ownership becoming unreadable after the first target: exactly one write, then halt", async () => {
		const ctx = await setup([report(), email()]);
		const stop = ctx.tn.api.time.stop.bind(ctx.tn.api.time);
		vi.spyOn(ctx.tn.api.time, "stop").mockImplementation(async (path, context) => {
			const result = await stop(path, context);
			vi.spyOn(ctx.tn.api.pomodoro!, "status").mockRejectedValue(new Error("unreadable"));
			return result;
		});

		expect(await ctx.controller.pauseAll()).toEqual({ paused: 1, skipped: 0, failed: 0, ownershipUnreadable: true });

		expect(ctx.tn.stopCalls.map(call => call.path)).toEqual([REPORT_PATH]);
		expect(ctx.notify).toHaveBeenCalledWith(UNREADABLE_NOTICE);
		expect(ctx.card(REPORT_PATH).state).toBe("paused");
		expect(ctx.card(EMAIL_PATH).state).toBe("running");
	});

	test("a failing stop is counted failed, later targets continue, and one count-only notice shows", async () => {
		const ctx = await setup([report(), email(), next()]);
		const stop = ctx.tn.api.time.stop.bind(ctx.tn.api.time);
		const calls: string[] = [];
		let inFlight = 0;
		let maximum = 0;
		vi.spyOn(ctx.tn.api.time, "stop").mockImplementation(async (path, context) => {
			calls.push(path);
			maximum = Math.max(maximum, ++inFlight);
			try {
				await Promise.resolve();
				if (path === EMAIL_PATH) throw new Error("secret/Answer email.md is locked");
				return await stop(path, context);
			} finally { inFlight--; }
		});

		expect(await ctx.controller.pauseAll()).toEqual({ paused: 2, skipped: 0, failed: 1, ownershipUnreadable: false });

		expect(calls).toEqual([REPORT_PATH, EMAIL_PATH, NEXT_PATH]);
		expect(maximum).toBe(1);
		expect(ctx.notify).toHaveBeenCalledTimes(1);
		expect(ctx.notify).toHaveBeenCalledWith("Paused 2 timers. 1 timers could not be paused. Try again.");
		expect(JSON.stringify(ctx.notify.mock.calls)).not.toContain("secret");
		expect(JSON.stringify(ctx.notify.mock.calls)).not.toContain("Answer email");
		expect(ctx.card(EMAIL_PATH).state).toBe("running");
	});

	test("a resumed target carries its accumulated Session into the new pause", async () => {
		const ctx = await setup([report()]);
		await ctx.pauseCard(REPORT_PATH);
		vi.setSystemTime(START_MS + 30 * MINUTE);
		await ctx.resumeCard(REPORT_PATH);
		vi.setSystemTime(START_MS + 33 * MINUTE);

		expect(await ctx.controller.pauseAll()).toMatchObject({ paused: 1 });

		const paused = ctx.card(REPORT_PATH);
		expect(paused.state).toBe("paused");
		expect(paused.accumulatedMs).toBe(13 * MINUTE);
		expect(paused.sessionStartedAt).toBe(START);
	});

	test("edge: zero eligible timers makes zero writes and no notice; exactly one makes one write", async () => {
		const empty = await setup([]);
		expect(empty.store.getHeaderState().eligibleCount).toBe(0);
		expect(await empty.controller.pauseAll()).toEqual({ paused: 0, skipped: 0, failed: 0, ownershipUnreadable: false });
		expect(empty.tn.stopCalls).toEqual([]);
		expect(empty.notify).not.toHaveBeenCalled();

		const one = await setup([report()]);
		expect(await one.controller.pauseAll()).toMatchObject({ paused: 1 });
		expect(one.tn.stopCalls).toHaveLength(1);
	});
});

describe("Resume all (CTRL-03, D-05)", () => {
	test("resumes in display order (latest session first, path ascending on ties), one start at a time", async () => {
		const later = new Date(START_MS + MINUTE).toISOString();
		const ctx = await setup([report(), makeActiveEntry({ taskPath: EMAIL_PATH, startTime: later, title: "Answer email" }), next()]);
		await ctx.pauseCard(REPORT_PATH);
		await ctx.pauseCard(NEXT_PATH);
		await ctx.pauseCard(EMAIL_PATH);
		const before = new Map(ctx.timers().map(timer => [timer.taskPath, { key: timer.sessionKey, accumulatedMs: timer.accumulatedMs }]));
		vi.setSystemTime(START_MS + 20 * MINUTE);
		const order = traceCalls(ctx);

		expect(await ctx.controller.resumeAll()).toEqual({ resumed: 3, skipped: 0, pomodoro: 0, failed: 0 });

		expect(ctx.tn.startCalls.map(call => call.path)).toEqual([EMAIL_PATH, NEXT_PATH, REPORT_PATH]);
		expect(ctx.tn.startCalls.map(call => call.context?.reason)).toEqual(["user resume all", "user resume all", "user resume all"]);
		for (const reads of readsBeforeEachWrite(order)) expect(reads).toEqual(expect.arrayContaining(["active", "ownership"]));
		for (const path of [EMAIL_PATH, NEXT_PATH, REPORT_PATH]) {
			const card = ctx.card(path);
			expect(card.state).toBe("running");
			expect(card.sessionKey).toBe(before.get(path)?.key);
			expect(card.accumulatedMs).toBe(before.get(path)?.accumulatedMs);
		}
		expect(ctx.notify).not.toHaveBeenCalled();
	});

	test("skips the readable Pomodoro owner's task (pomodoro) and a task that already has an open entry (skipped)", async () => {
		const ctx = await setup([report(), email(), next()]);
		await ctx.pauseCard(REPORT_PATH);
		await ctx.pauseCard(EMAIL_PATH);
		await ctx.pauseCard(NEXT_PATH);
		vi.setSystemTime(START_MS + 20 * MINUTE);
		const now = new Date().toISOString();
		await ctx.tn.api.time.start!(REPORT_PATH, {});
		await ctx.tn.api.time.start!(EMAIL_PATH, {});
		ctx.tn.setPomodoro(pomodoroOn(EMAIL_PATH, now));
		const starts = ctx.tn.startCalls.length;

		expect(await ctx.controller.resumeAll()).toEqual({ resumed: 1, skipped: 1, pomodoro: 1, failed: 0 });

		expect(ctx.tn.startCalls.slice(starts).map(call => call.path)).toEqual([NEXT_PATH]);
		expect(ctx.notify).toHaveBeenCalledTimes(1);
		expect(ctx.notify).toHaveBeenCalledWith("Resumed 1 timers. 1 timers are being timed by Pomodoro.");
	});

	test("a failed start is counted failed with one count-only notice; later records continue", async () => {
		const ctx = await setup([report(), email()]);
		await ctx.pauseCard(REPORT_PATH);
		await ctx.pauseCard(EMAIL_PATH);
		const start = ctx.tn.api.time.start!.bind(ctx.tn.api.time);
		vi.spyOn(ctx.tn.api.time, "start").mockImplementation((path, options, context) =>
			path === EMAIL_PATH ? Promise.reject(new Error("secret/Answer email.md is locked")) : start(path, options, context));

		expect(await ctx.controller.resumeAll()).toEqual({ resumed: 1, skipped: 0, pomodoro: 0, failed: 1 });

		expect(ctx.notify).toHaveBeenCalledTimes(1);
		expect(ctx.notify).toHaveBeenCalledWith("Resumed 1 timers. 1 timers could not be resumed. Try again.");
		expect(JSON.stringify(ctx.notify.mock.calls)).not.toContain("secret");
		expect(ctx.card(EMAIL_PATH).state).toBe("paused");
		expect(ctx.card(REPORT_PATH).state).toBe("running");
	});

	test("edge: zero paused records makes zero writes and no notice", async () => {
		const ctx = await setup([report()]);
		expect(ctx.store.getHeaderState().pausedCount).toBe(0);

		expect(await ctx.controller.resumeAll()).toEqual({ resumed: 0, skipped: 0, pomodoro: 0, failed: 0 });

		expect(ctx.tn.startCalls).toEqual([]);
		expect(ctx.notify).not.toHaveBeenCalled();
	});
});

describe("Batches hold the write queue (D-05)", () => {
	test("while Pause all runs the controller is busy and a queued Start waits for the whole batch", async () => {
		const ctx = await setup([report(), email()]);
		const order: string[] = [];
		const time = ctx.tn.api.time;
		const stop = time.stop.bind(time);
		const start = time.start!.bind(time);
		let release!: () => void;
		const barrier = new Promise<void>(resolve => { release = resolve; });
		let entered!: () => void;
		const started = new Promise<void>(resolve => { entered = resolve; });
		vi.spyOn(time, "start").mockImplementation((path, options, context) => { order.push("start:" + path); return start(path, options, context); });
		vi.spyOn(time, "stop").mockImplementation(async (path, context) => {
			order.push("stop:" + path);
			entered();
			await barrier;
			return stop(path, context);
		});

		const batch = ctx.controller.pauseAll();
		expect(ctx.controller.isBusy()).toBe(true);
		await started;
		const queued = ctx.controller.start({ taskPath: NEXT_PATH, title: "Plan next week" });
		expect(ctx.controller.isBusy()).toBe(true);
		release();
		expect(await batch).toMatchObject({ paused: 2 });
		await queued;

		expect(order.filter(call => call.startsWith("stop:") || call.startsWith("start:"))).toEqual(["stop:" + REPORT_PATH, "stop:" + EMAIL_PATH, "start:" + NEXT_PATH]);
		expect(ctx.controller.isBusy()).toBe(false);
	});

	test("while Resume all runs the controller is busy and a queued Start waits for the whole batch", async () => {
		const ctx = await setup([report(), email()]);
		await ctx.pauseCard(REPORT_PATH);
		await ctx.pauseCard(EMAIL_PATH);
		const order: string[] = [];
		const time = ctx.tn.api.time;
		const start = time.start!.bind(time);
		let release!: () => void;
		const barrier = new Promise<void>(resolve => { release = resolve; });
		let entered!: () => void;
		const started = new Promise<void>(resolve => { entered = resolve; });
		vi.spyOn(time, "start").mockImplementation(async (path, options, context) => {
			order.push("start:" + path);
			entered();
			await barrier;
			return start(path, options, context);
		});

		const batch = ctx.controller.resumeAll();
		expect(ctx.controller.isBusy()).toBe(true);
		await started;
		const queued = ctx.controller.start({ taskPath: NEXT_PATH, title: "Plan next week" });
		expect(ctx.controller.isBusy()).toBe(true);
		release();
		expect(await batch).toMatchObject({ resumed: 2 });
		await queued;

		const writes = order.filter(call => call.startsWith("start:"));
		expect(writes).toHaveLength(3);
		expect(writes[2]).toBe("start:" + NEXT_PATH);
		expect(ctx.controller.isBusy()).toBe(false);
	});
});
