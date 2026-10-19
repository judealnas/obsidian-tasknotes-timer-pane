// D-12 store tests: derivation and change detection by (taskPath, startTime), the
// trailing debounce, single-flight, error retention and resync gating (SYNC-01/02).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { derivePaneState, deriveSnapshot, snapshotSignature } from "../src/model/timeMath";
import { REFRESH_DEBOUNCE_MS, SAFETY_RESYNC_MS, TimerStore } from "../src/state/TimerStore";
import { PauseStore } from "../src/state/PauseStore";
import type { PausedRecord } from "../src/model/pauseLedger";
import type { ActiveTimeEntry } from "../src/tasknotes/runtime-api.types";
import { createFakeGateway, type FakeGateway } from "./fakes/fakeGateway";
import { makeActiveEntry, timerSchedule } from "./fakes/fakeTaskNotes";

const A_START = "2026-10-14T09:00:00.000Z";
const B_START = "2026-10-14T10:00:00.000Z";

function entryA(overrides: Partial<Parameters<typeof makeActiveEntry>[0]> = {}): ActiveTimeEntry {
	return makeActiveEntry({ taskPath: "TaskNotes/Tasks/A.md", startTime: A_START, title: "A", ...overrides });
}

function setup(gateway: FakeGateway = createFakeGateway()) {
	const log = vi.fn<(message: string) => void>();
	const store = new TimerStore({ gateway, log, schedule: timerSchedule });
	const notified = vi.fn();
	store.subscribe(notified);
	return { gateway, store, log, notified };
}

/** Lets the store's first refresh land, then clears the counters the test asserts on. */
async function primed(active: ActiveTimeEntry[] = [entryA()]) {
	const ctx = setup();
	ctx.gateway.setActive(active);
	await ctx.store.refreshNow();
	expect(ctx.store.getSnapshot()).not.toBeNull();
	ctx.notified.mockClear();
	return { ...ctx, baseCalls: ctx.gateway.activeCalls };
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("constants", () => {
	test("Stop all eligibility follows exact ownership and recovers from unreadable state", async () => {
		const ctx = await primed();
		expect(ctx.store.getStopAllState()).toEqual({ eligibleCount: 1, readable: true });
		const ownership = vi.spyOn(ctx.gateway, "pomodoroOwnership");
		ownership.mockResolvedValue({ readable: true, owner: { taskPath: entryA().taskPath, startTime: A_START } });
		await ctx.store.refreshNow();
		expect(ctx.store.getStopAllState()).toEqual({ eligibleCount: 0, readable: true });
		ctx.gateway.setActive([entryA({ startTime: B_START })]);
		await ctx.store.refreshNow();
		expect(ctx.store.getStopAllState().eligibleCount).toBe(1);
		ownership.mockResolvedValue({ readable: false });
		await ctx.store.refreshNow();
		expect(ctx.store.getStopAllState()).toEqual({ eligibleCount: 0, readable: false });
		expect(ctx.store.getSnapshot()?.primary?.startTime).toBe(B_START);
		ownership.mockResolvedValue({ readable: true, owner: null });
		await ctx.store.refreshNow();
		expect(ctx.store.getStopAllState().eligibleCount).toBe(1);
		ctx.gateway.setActive([]);
		await ctx.store.refreshNow();
		expect(ctx.store.getStopAllState().eligibleCount).toBe(0);
	});
	test("debounce 200 ms, safety resync 45 s", () => {
		expect(REFRESH_DEBOUNCE_MS).toBe(200);
		expect(SAFETY_RESYNC_MS).toBe(45000);
	});
});

describe("trailing debounce", () => {
	test("requestRefresh twice 150 ms apart makes exactly one active() call, 200 ms after the second", async () => {
		const { gateway, store } = setup();
		store.requestRefresh();
		await vi.advanceTimersByTimeAsync(150);
		store.requestRefresh();
		await vi.advanceTimersByTimeAsync(199);
		expect(gateway.activeCalls).toBe(0);
		await vi.advanceTimersByTimeAsync(1);
		expect(gateway.activeCalls).toBe(1);
		await vi.advanceTimersByTimeAsync(1000);
		expect(gateway.activeCalls).toBe(1);
	});

	test("burst A then burst B 300 ms later with an unchanged result: at most 2 calls, at most 1 notification", async () => {
		const { gateway, store, notified, baseCalls } = await primed();
		// Burst A: the TaskService task.updated (two hints arriving together).
		gateway.emitData();
		gateway.emitData();
		await vi.advanceTimersByTimeAsync(300);
		// Burst B: the metadata echo about 300 ms later.
		gateway.emitData();
		gateway.emitData();
		await vi.advanceTimersByTimeAsync(1000);
		expect(gateway.activeCalls - baseCalls).toBeLessThanOrEqual(2);
		expect(notified.mock.calls.length).toBeLessThanOrEqual(1);
		expect(notified).not.toHaveBeenCalled();
		store.dispose();
	});

	test("an entry that appears with only a data hint (no time.* event) is visible after the debounce", async () => {
		const { gateway, store } = await primed([]);
		expect(store.getSnapshot()?.primary).toBeNull();
		gateway.setActive([entryA()]);
		gateway.emitData();
		await vi.advanceTimersByTimeAsync(REFRESH_DEBOUNCE_MS);
		expect(store.getSnapshot()?.primary?.taskPath).toBe("TaskNotes/Tasks/A.md");
	});
});

describe("single-flight", () => {
	test("refreshNow while one is in flight: exactly two active() calls, both callers resolve after the second", async () => {
		const { gateway, store } = setup();
		gateway.setActive([entryA()]);
		const seen: number[] = [];
		const first = store.refreshNow().then(() => seen.push(gateway.activeCalls));
		const second = store.refreshNow().then(() => seen.push(gateway.activeCalls));
		await Promise.all([first, second]);
		expect(gateway.activeCalls).toBe(2);
		expect(seen).toEqual([2, 2]);
	});

	test("refreshNow cancels a pending debounce when it starts", async () => {
		const { gateway, store } = setup();
		store.requestRefresh();
		await store.refreshNow();
		expect(gateway.activeCalls).toBe(1);
		await vi.advanceTimersByTimeAsync(1000);
		expect(gateway.activeCalls).toBe(1);
	});
});

describe("signature diff", () => {
	test("identical entries returned as new objects cause no notification", async () => {
		const { gateway, store, notified } = await primed();
		gateway.setActive([entryA()]);
		await store.refreshNow();
		await store.refreshNow();
		expect(notified).not.toHaveBeenCalled();
	});

	test.each([
		["a changed startTime", () => [entryA({ startTime: B_START })]],
		["a changed title", () => [entryA({ title: "A, renamed" })]],
		[
			"a newly closed entry on the task",
			() => [
				entryA({
					timeEntries: [
						{ startTime: "2026-10-14T07:00:00.000Z", endTime: "2026-10-14T07:30:00.000Z" },
						{ startTime: A_START },
					],
				}),
			],
		],
	])("%s notifies once", async (_label, next) => {
		const { gateway, store, notified } = await primed();
		gateway.setActive(next());
		await store.refreshNow();
		expect(notified).toHaveBeenCalledTimes(1);
		await store.refreshNow();
		expect(notified).toHaveBeenCalledTimes(1);
	});

	test("a change to the task's status alone notifies once, so the title chip re-renders", async () => {
		const { gateway, store, notified } = await primed([entryA()]);
		gateway.setActive([entryA({ status: "in-progress" })]);
		await store.refreshNow();
		expect(notified).toHaveBeenCalledTimes(1);
		await store.refreshNow();
		expect(notified).toHaveBeenCalledTimes(1);
	});

	test("the first successful refresh notifies even for an empty result", async () => {
		const { store, notified } = setup();
		await store.refreshNow();
		expect(notified).toHaveBeenCalledTimes(1);
		expect(store.getSnapshot()).toEqual({ primary: null, others: [] });
	});

	test("snapshotSignature is deterministic and keyed on path, start, title, closed time and display key", () => {
		const one = deriveSnapshot([entryA(), makeActiveEntry({ taskPath: "b.md", startTime: B_START })]);
		const two = deriveSnapshot([makeActiveEntry({ taskPath: "b.md", startTime: B_START }), entryA()]);
		expect(snapshotSignature(one)).toBe(snapshotSignature(two));
		const restatused = deriveSnapshot([
			entryA({ status: "in-progress" }),
			makeActiveEntry({ taskPath: "b.md", startTime: B_START }),
		]);
		expect(snapshotSignature(restatused)).not.toBe(snapshotSignature(one));
		expect(snapshotSignature(one)).not.toBe(snapshotSignature(deriveSnapshot([entryA()])));
		expect(snapshotSignature(deriveSnapshot([]))).not.toBe(snapshotSignature(deriveSnapshot([entryA()])));
	});
});

describe("errors", () => {
	test("a rejected active() keeps the previous snapshot, logs only the message, and retries nothing", async () => {
		const { gateway, store, log, notified, baseCalls } = await primed();
		const before = store.getSnapshot();
		gateway.rejectNextActive(new Error("cache busy"));
		await store.refreshNow();
		expect(store.getSnapshot()).toBe(before);
		expect(notified).toHaveBeenCalledTimes(1);
		expect(store.getStopAllState().readable).toBe(false);
		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith("Refreshing timers failed: cache busy");
		await vi.advanceTimersByTimeAsync(10_000);
		expect(gateway.activeCalls).toBe(baseCalls + 1);
	});
});

describe("bridge state", () => {
	test("a retired generation cannot publish after a ready reconnect", async () => {
		const { gateway, store } = setup();
		let release!: (entries: ActiveTimeEntry[]) => void;
		vi.spyOn(gateway, "active").mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
		const pending = store.refreshNow();
		gateway.setState({ kind: "missing" });
		gateway.setState({ kind: "ready" });
		release([entryA()]);
		await pending;
		expect(store.getSnapshot()).toBeNull();
		expect(store.getStopAllState().readable).toBe(false);
		gateway.setActive([]);
		await vi.advanceTimersByTimeAsync(REFRESH_DEBOUNCE_MS);
		expect(store.getSnapshot()?.primary).toBeNull();
		expect(store.getStopAllState()).toEqual({ eligibleCount: 0, readable: true });
	});
	test("resync() while not ready makes no call; while ready exactly one", async () => {
		const gateway = createFakeGateway({ kind: "loading" });
		const { store } = setup(gateway);
		store.resync();
		await vi.advanceTimersByTimeAsync(1000);
		expect(gateway.activeCalls).toBe(0);

		gateway.setState({ kind: "ready" });
		await vi.advanceTimersByTimeAsync(1000);
		const afterReady = gateway.activeCalls;
		store.resync();
		await vi.advanceTimersByTimeAsync(1000);
		expect(gateway.activeCalls).toBe(afterReady + 1);
	});

	test("leaving ready resets the snapshot, notifies once, and cancels a pending debounce", async () => {
		const { gateway, store, notified, baseCalls } = await primed();
		store.requestRefresh();
		gateway.setState({ kind: "missing" });
		expect(store.getSnapshot()).toBeNull();
		expect(notified).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1000);
		expect(gateway.activeCalls).toBe(baseCalls);
	});

	test("after leaving and re-entering ready, an unchanged result notifies again (signature reset)", async () => {
		const { gateway, store, notified } = await primed();
		gateway.setState({ kind: "missing" });
		notified.mockClear();
		gateway.setState({ kind: "ready" });
		await vi.advanceTimersByTimeAsync(REFRESH_DEBOUNCE_MS);
		expect(notified).toHaveBeenCalledTimes(1);
		expect(store.getSnapshot()?.primary?.title).toBe("A");
	});

	test("dispose cancels the pending debounce", async () => {
		const { gateway, store } = setup();
		store.requestRefresh();
		store.dispose();
		await vi.advanceTimersByTimeAsync(1000);
		expect(gateway.activeCalls).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});
});

// ---- plan 03-02: the pause ledger inside refresh (D-12, Pitfall 1) ----

const A_PATH = "TaskNotes/Tasks/A.md";

function pausedA(overrides: Partial<PausedRecord> = {}): PausedRecord {
	return {
		state: "paused",
		taskPath: A_PATH,
		title: "A",
		sessionStartedAt: A_START,
		accumulatedMs: 60_000,
		pausedAt: "2026-10-14T09:01:00.000Z",
		lastEntryStart: A_START,
		...overrides,
	};
}

function withPauses(fileCheck?: () => ((path: string) => boolean) | null) {
	const gateway = createFakeGateway();
	const log = vi.fn<(message: string) => void>();
	const pauses = new PauseStore({ log });
	pauses.load([]);
	const store = new TimerStore({ gateway, log, schedule: timerSchedule, pauses, ...(fileCheck ? { fileCheck } : {}) });
	return { gateway, log, pauses, store };
}

const statusCatalog = [
	{ value: "open", isCompleted: false },
	{ value: "done", isCompleted: true },
];

describe("pause ledger in refresh", () => {
	test("a pause-record change while a refresh awaits its reads causes a re-read and no stale publish", async () => {
		const ctx = withPauses();
		ctx.gateway.setActive([entryA()]);
		const published: Array<string | undefined> = [];
		ctx.store.subscribe(() => published.push(ctx.store.getSnapshot()?.primary?.state));
		const original = ctx.gateway.active.bind(ctx.gateway);
		let release: () => void = () => undefined;
		const active = vi.spyOn(ctx.gateway, "active").mockImplementationOnce(
			() => new Promise(resolve => {
				const stale = original();
				release = () => resolve(stale);
			}),
		);
		const refresh = ctx.store.refreshNow();
		// The pane pauses A while the first read is in flight.
		ctx.pauses.set(pausedA());
		ctx.gateway.setActive([]);
		release();
		await refresh;
		expect(active).toHaveBeenCalledTimes(2);
		expect(published).toEqual(["paused"]);
		expect(ctx.pauses.records()).toEqual([pausedA()]);
	});

	test("completed statuses are read only while at least one paused record exists", async () => {
		const ctx = withPauses();
		const statuses = vi.spyOn(ctx.gateway, "statuses").mockResolvedValue(statusCatalog);
		await ctx.store.refreshNow();
		expect(statuses).not.toHaveBeenCalled();
		ctx.pauses.set(pausedA());
		await ctx.store.refreshNow();
		expect(statuses).toHaveBeenCalledTimes(1);
	});

	test("a paused task with a completed-type status loses its pause on refresh", async () => {
		const ctx = withPauses();
		vi.spyOn(ctx.gateway, "statuses").mockResolvedValue(statusCatalog);
		ctx.pauses.set(pausedA());
		ctx.gateway.setTask(A_PATH, { title: "A", status: "done", path: A_PATH, archived: false });
		await ctx.store.refreshNow();
		expect(ctx.pauses.records()).toEqual([]);
		expect(ctx.store.getSnapshot()?.primary).toBeNull();
	});

	test("a statuses() failure skips the completed rule and is not an error state", async () => {
		const ctx = withPauses();
		vi.spyOn(ctx.gateway, "statuses").mockRejectedValue(new Error("catalog down"));
		ctx.pauses.set(pausedA());
		ctx.gateway.setTask(A_PATH, { title: "A", status: "done", path: A_PATH, archived: false });
		await ctx.store.refreshNow();
		expect(ctx.pauses.records()).toEqual([pausedA()]);
		expect(ctx.store.getSnapshot()?.primary?.state).toBe("paused");
		expect(ctx.log).not.toHaveBeenCalled();
	});

	test("fileCheck reporting the note missing clears the pause", async () => {
		const ctx = withPauses(() => () => false);
		ctx.pauses.set(pausedA());
		await ctx.store.refreshNow();
		expect(ctx.pauses.records()).toEqual([]);
	});

	test("fileCheck returning null (layout not ready) keeps the pause", async () => {
		const ctx = withPauses(() => null);
		ctx.pauses.set(pausedA());
		await ctx.store.refreshNow();
		expect(ctx.pauses.records()).toEqual([pausedA()]);
	});

	test("a readable Pomodoro owner on a paused task clears the pause on refresh", async () => {
		const ctx = withPauses();
		ctx.pauses.set(pausedA());
		ctx.gateway.setActive([entryA({ startTime: B_START })]);
		ctx.gateway.setOwnership({ readable: true, owner: { taskPath: A_PATH, startTime: B_START } });
		await ctx.store.refreshNow();
		expect(ctx.pauses.records()).toEqual([]);
	});
});

// ---- plan 03-04: the Pomodoro-owned entry is hidden from cards and counts (D-14, D-15, DISP-07) ----

const C_START = "2026-10-14T11:00:00.000Z";
const B_PATH = "TaskNotes/Tasks/B.md";
const C_PATH = "TaskNotes/Tasks/C.md";

function cardIds(store: TimerStore): string[] {
	const snapshot = store.getSnapshot();
	if (!snapshot) return [];
	return [snapshot.primary, ...snapshot.others].filter(timer => timer !== null).map(timer => timer.taskPath + "@" + timer.startTime);
}

describe("Pomodoro-owned entry (DISP-07)", () => {
	test("a readable owner hides only its exact entry (adjacency): same path at another start and another path at the same start stay", async () => {
		const ctx = withPauses();
		ctx.gateway.setActive([
			entryA(),
			entryA({ startTime: B_START }),
			makeActiveEntry({ taskPath: B_PATH, startTime: A_START, title: "B" }),
		]);
		ctx.gateway.setOwnership({ readable: true, owner: { taskPath: A_PATH, startTime: A_START } });
		await ctx.store.refreshNow();
		expect(cardIds(ctx.store)).not.toContain(A_PATH + "@" + A_START);
		expect(cardIds(ctx.store)).toEqual(expect.arrayContaining([A_PATH + "@" + B_START, B_PATH + "@" + A_START]));
		expect(cardIds(ctx.store)).toHaveLength(2);
		expect(ctx.store.getHeaderState().eligibleCount).toBe(2);
	});

	test("a readable owner path written differently (backslashes, dot segments) still hides the entry", async () => {
		const ctx = withPauses();
		ctx.gateway.setActive([entryA()]);
		ctx.gateway.setOwnership({ readable: true, owner: { taskPath: "TaskNotes\\Tasks\\./A.md", startTime: A_START } });
		await ctx.store.refreshNow();
		expect(cardIds(ctx.store)).toEqual([]);
	});

	test("no active Pomodoro (owner null, empty predicate): every active entry is a card", async () => {
		const ctx = withPauses();
		ctx.gateway.setActive([entryA(), makeActiveEntry({ taskPath: B_PATH, startTime: B_START, title: "B" })]);
		ctx.gateway.setOwnership({ readable: true, owner: null });
		await ctx.store.refreshNow();
		expect(cardIds(ctx.store)).toHaveLength(2);
		expect(ctx.store.getHeaderState()).toEqual({ readable: true, eligibleCount: 2, pausedCount: 0 });
	});

	test("unreadable ownership: every active entry is a card and the header reports unreadable", async () => {
		const ctx = withPauses();
		ctx.gateway.setActive([entryA(), makeActiveEntry({ taskPath: B_PATH, startTime: B_START, title: "B" })]);
		ctx.gateway.setOwnership({ readable: false });
		await ctx.store.refreshNow();
		expect(cardIds(ctx.store)).toHaveLength(2);
		expect(ctx.store.getHeaderState().readable).toBe(false);
		expect(ctx.store.getHeaderState().eligibleCount).toBe(0);
	});

	test("a rejected ownership read is unreadable and hides nothing", async () => {
		const ctx = withPauses();
		ctx.gateway.setActive([entryA()]);
		vi.spyOn(ctx.gateway, "pomodoroOwnership").mockRejectedValue(new Error("pomodoro down"));
		await ctx.store.refreshNow();
		expect(cardIds(ctx.store)).toEqual([A_PATH + "@" + A_START]);
		expect(ctx.store.getHeaderState().readable).toBe(false);
	});

	test("only the owned entry active (empty predicate): no cards, pane idle, eligibleCount 0", async () => {
		const ctx = withPauses();
		ctx.gateway.setActive([entryA()]);
		ctx.gateway.setOwnership({ readable: true, owner: { taskPath: A_PATH, startTime: A_START } });
		await ctx.store.refreshNow();
		expect(ctx.store.getSnapshot()).toEqual({ primary: null, others: [] });
		expect(derivePaneState({ kind: "ready" }, ctx.store.getSnapshot())).toBe("idle");
		expect(ctx.store.getHeaderState()).toEqual({ readable: true, eligibleCount: 0, pausedCount: 0 });
	});

	test("zero active entries with unreadable ownership (empty predicate): idle and unreadable", async () => {
		const ctx = withPauses();
		ctx.gateway.setActive([]);
		ctx.gateway.setOwnership({ readable: false });
		await ctx.store.refreshNow();
		expect(derivePaneState({ kind: "ready" }, ctx.store.getSnapshot())).toBe("idle");
		expect(ctx.store.getHeaderState().readable).toBe(false);
	});

	test("reconcile still sees the owned entry: a paused record on the owner's task is cleared in the same refresh that hides it (D-16)", async () => {
		const ctx = withPauses();
		ctx.pauses.set(pausedA());
		ctx.gateway.setActive([entryA({ startTime: B_START })]);
		ctx.gateway.setOwnership({ readable: true, owner: { taskPath: A_PATH, startTime: B_START } });
		await ctx.store.refreshNow();
		expect(ctx.pauses.records()).toEqual([]);
		expect(ctx.store.getSnapshot()).toEqual({ primary: null, others: [] });
		expect(ctx.store.getHeaderState().pausedCount).toBe(0);
	});

	test("hiding the owned middle card keeps the others in D-06 order with unchanged sessionKeys (ordering predicate)", async () => {
		const ctx = withPauses();
		const entries = [
			entryA(),
			makeActiveEntry({ taskPath: B_PATH, startTime: B_START, title: "B" }),
			makeActiveEntry({ taskPath: C_PATH, startTime: C_START, title: "C" }),
		];
		ctx.gateway.setActive(entries);
		await ctx.store.refreshNow();
		const all = ctx.store.getSnapshot();
		const before = [all?.primary, ...(all?.others ?? [])].map(timer => timer?.sessionKey);
		ctx.gateway.setOwnership({ readable: true, owner: { taskPath: B_PATH, startTime: B_START } });
		await ctx.store.refreshNow();
		const hidden = ctx.store.getSnapshot();
		const after = [hidden?.primary, ...(hidden?.others ?? [])].map(timer => timer?.sessionKey);
		expect(before).toHaveLength(3);
		expect(after).toEqual(before.filter(key => !key?.startsWith(B_PATH)));
		expect(hidden?.primary?.taskPath).toBe(C_PATH);
	});

	test("the owner changing with identical active entries still notifies", async () => {
		const ctx = withPauses();
		const notified = vi.fn();
		ctx.store.subscribe(notified);
		ctx.gateway.setActive([entryA(), makeActiveEntry({ taskPath: B_PATH, startTime: B_START, title: "B" })]);
		await ctx.store.refreshNow();
		notified.mockClear();
		ctx.gateway.setOwnership({ readable: true, owner: { taskPath: B_PATH, startTime: B_START } });
		await ctx.store.refreshNow();
		expect(notified).toHaveBeenCalledTimes(1);
		ctx.gateway.setOwnership({ readable: true, owner: null });
		await ctx.store.refreshNow();
		expect(notified).toHaveBeenCalledTimes(2);
		await ctx.store.refreshNow();
		expect(notified).toHaveBeenCalledTimes(2);
	});
});
