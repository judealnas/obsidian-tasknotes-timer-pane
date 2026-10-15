// D-12 store tests: derivation and change detection by (taskPath, startTime), the
// trailing debounce, single-flight, error retention and resync gating (SYNC-01/02).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { deriveSnapshot, snapshotSignature } from "../src/model/timeMath";
import { REFRESH_DEBOUNCE_MS, SAFETY_RESYNC_MS, TimerStore } from "../src/state/TimerStore";
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
		expect(notified).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith("Refreshing timers failed: cache busy");
		await vi.advanceTimersByTimeAsync(10_000);
		expect(gateway.activeCalls).toBe(baseCalls + 1);
	});
});

describe("bridge state", () => {
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
