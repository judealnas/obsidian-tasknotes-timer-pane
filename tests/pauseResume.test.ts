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
