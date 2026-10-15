// Walking-skeleton read path, end to end through the real modules:
// shared fake TaskNotes api -> TaskNotesBridge -> TimerStore -> deriveSnapshot -> derivePaneState.
// D-12: pure logic plus a faked TaskNotes boundary; no DOM, no view, no obsidian mocks.
import { describe, expect, test, vi } from "vitest";
import {
	derivePaneState,
	deriveSnapshot,
	displayTitle,
	formatHms,
	moreRunningLabel,
	othersTooltip,
	selectPrimary,
	sessionMs,
	totalMs,
	type OpenTimer,
	type ParsedEntry,
} from "../src/model/timeMath";
import { TimerStore } from "../src/state/TimerStore";
import { TaskNotesBridge, isVersionOlder, type TaskNotesPluginLike } from "../src/tasknotes/TaskNotesBridge";
import type { ActiveTimeEntry, TimeEntry } from "../src/tasknotes/runtime-api.types";
import { createFakeTaskNotes, makeActiveEntry, timerSchedule } from "./fakes/fakeTaskNotes";

function activeEntry(taskPath: string, startTime: string, title = taskPath): ActiveTimeEntry {
	return makeActiveEntry({ taskPath, startTime, title });
}

function connect(plugin: TaskNotesPluginLike | null) {
	const log = vi.fn<(message: string) => void>();
	const bridge = new TaskNotesBridge({ lookupPlugin: () => plugin, log, schedule: timerSchedule });
	const store = new TimerStore({ gateway: bridge, log, schedule: timerSchedule });
	const paneState = () => derivePaneState(bridge.getState(), store.getSnapshot());
	return { bridge, store, log, paneState };
}

describe("walking skeleton: TaskNotes -> bridge -> store -> pane state", () => {
	test("ready TaskNotes with open entries shows the most recently started timer, then idle after task.updated", async () => {
		const tn = createFakeTaskNotes({
			active: [
				activeEntry("TaskNotes/Tasks/Older.md", "2026-10-14T08:00:00.000Z", "Older"),
				activeEntry("TaskNotes/Tasks/Newest.md", "2026-10-14T09:30:00.000Z", "Newest"),
				activeEntry("TaskNotes/Tasks/Middle.md", "2026-10-14T09:00:00.000Z", "Middle"),
			],
		});
		const { bridge, store, paneState } = connect(tn.plugin);

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

		// The bridge subscribed task.updated (plus its lifecycle and task.deleted hints) once.
		expect(tn.handlerCount("task.updated")).toBe(1);
		expect(tn.handlerCount("layout.ready")).toBe(1);

		tn.setActive([]);
		tn.emitTaskEvent("task.updated");
		await vi.waitFor(() => expect(paneState()).toBe("idle"));

		bridge.dispose();
		store.dispose();
		expect(tn.totalHandlers()).toBe(0);
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
		const tn = createFakeTaskNotes({ ready: false, active: [activeEntry("a.md", "2026-10-14T09:00:00.000Z")] });
		const { bridge, store, paneState } = connect(tn.plugin);
		bridge.probe();
		expect(bridge.getState().kind).toBe("loading");
		expect(paneState()).toBe("loading");
		await store.refreshNow();
		expect(tn.activeCalls).toBe(0);

		tn.setReady(true);
		tn.emitLifecycle("layout.ready");
		expect(bridge.getState().kind).toBe("ready");
		await vi.waitFor(() => expect(paneState()).toBe("running"));
	});

	test("apiVersion other than 1 or a missing capability shows incompatible", () => {
		const tn = createFakeTaskNotes({ capabilities: ["time.read", "tasks.events", "lifecycle.events"] });
		const { bridge } = connect(tn.plugin);
		bridge.probe();
		expect(bridge.getState()).toEqual({ kind: "incompatible", version: "4.13.8" });
		expect(tn.totalHandlers()).toBe(0);

		const v2 = createFakeTaskNotes({ apiVersion: 2, version: "9.0.0" });
		const second = connect(v2.plugin);
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

// ---------------------------------------------------------------------------
// Time math and primary selection (D-12). Inputs mirror the plan's behavior list.
// ---------------------------------------------------------------------------

const NOW = Date.parse("2026-10-14T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

function openTimer(taskPath: string, startMs: number, title = taskPath): OpenTimer {
	return { taskPath, title, startTime: iso(startMs), startMs, entries: [{ startMs, endMs: null }] };
}

const keyOf = (timer: OpenTimer) => `${timer.taskPath}|${timer.startTime}`;
const pathsOf = (snapshot: ReturnType<typeof deriveSnapshot>) => ({
	primary: snapshot.primary?.taskPath ?? null,
	others: snapshot.others.map((timer) => timer.taskPath),
});

describe("formatHms", () => {
	test.each([
		[0, "0:00:00"],
		[7000, "0:00:07"],
		[59999, "0:00:59"],
		[2537000, "0:42:17"],
		[43380000, "12:03:00"],
		[378723000, "105:12:03"],
		[-5000, "0:00:00"],
		[NaN, "0:00:00"],
	])("%d ms reads %s", (ms, expected) => {
		expect(formatHms(ms)).toBe(expected);
	});
});

describe("sessionMs", () => {
	test("a session starting now is 0", () => {
		expect(sessionMs(NOW, NOW)).toBe(0);
		expect(formatHms(sessionMs(NOW, NOW))).toBe("0:00:00");
	});

	test("a start 10 s in the future clamps to 0", () => {
		expect(sessionMs(NOW + 10_000, NOW)).toBe(0);
	});
});

describe("totalMs", () => {
	test("two closed entries plus a running one sum to the second", () => {
		const t0 = Date.parse("2026-10-12T09:00:00.000Z");
		const t1 = Date.parse("2026-10-12T13:10:00.000Z");
		const entries: ParsedEntry[] = [
			{ startMs: t0, endMs: t0 + (45 * 60 + 30) * 1000 },
			{ startMs: t1, endMs: t1 + (22 * 60 + 5) * 1000 },
			{ startMs: NOW - 10_000, endMs: null },
		];
		expect(formatHms(totalMs(entries, NOW))).toBe("1:07:45");
	});

	test("deriveSnapshot entries: legacy duration ignored, unparseable endTime skipped, two open entries both run", () => {
		const start = NOW - 60_000;
		const item = activeEntry("TaskNotes/Tasks/Mixed.md", iso(start), "Mixed");
		item.task.timeEntries = [
			{ startTime: iso(NOW - 3_600_000), endTime: iso(NOW - 3_000_000), duration: 999 },
			{ startTime: iso(NOW - 2_000_000), endTime: "garbage" },
			{ startTime: "not-a-date", endTime: iso(NOW - 1_000_000) },
			{ startTime: iso(NOW - 120_000) },
			{ startTime: iso(start) },
		];
		const primary = deriveSnapshot([item]).primary;
		expect(primary?.entries).toEqual([
			{ startMs: NOW - 3_600_000, endMs: NOW - 3_000_000 },
			{ startMs: NOW - 120_000, endMs: null },
			{ startMs: start, endMs: null },
		]);
		// 10:00 closed + 2:00 running + 1:00 running.
		expect(formatHms(totalMs(primary?.entries ?? [], NOW))).toBe("0:13:00");
	});
});

describe("selectPrimary", () => {
	test("the latest start wins", () => {
		const timers = [openTimer("a.md", NOW - 3000), openTimer("b.md", NOW - 1000), openTimer("c.md", NOW - 2000)];
		expect(selectPrimary(timers)?.taskPath).toBe("b.md");
	});

	test("equal starts go to the smaller path in either input order, and repeat calls agree", () => {
		const y = openTimer("b/y.md", NOW);
		const x = openTimer("a/x.md", NOW);
		expect(selectPrimary([y, x])?.taskPath).toBe("a/x.md");
		expect(selectPrimary([x, y])?.taskPath).toBe("a/x.md");
		expect(selectPrimary([y, x])).toBe(selectPrimary([y, x]));
		expect(selectPrimary([])).toBeNull();
	});
});

describe("deriveSnapshot", () => {
	test("an empty active() result is idle", () => {
		const snapshot = deriveSnapshot([]);
		expect(snapshot).toEqual({ primary: null, others: [] });
		expect(derivePaneState({ kind: "ready" }, snapshot)).toBe("idle");
	});

	test("entries without a startTime or with 'not-a-date' are dropped; a lone one is idle", () => {
		const missing = { ...activeEntry("m.md", ""), entry: {} as TimeEntry };
		const garbage = activeEntry("g.md", "not-a-date");
		expect(deriveSnapshot([missing])).toEqual({ primary: null, others: [] });
		expect(deriveSnapshot([garbage]).primary).toBeNull();
		const kept = deriveSnapshot([missing, garbage, activeEntry("ok.md", iso(NOW))]);
		expect(pathsOf(kept)).toEqual({ primary: "ok.md", others: [] });
	});

	test("three entries give one primary and two others, latest start first", () => {
		const snapshot = deriveSnapshot([
			activeEntry("one.md", iso(NOW - 3000)),
			activeEntry("three.md", iso(NOW - 1000)),
			activeEntry("two.md", iso(NOW - 2000)),
		]);
		expect(pathsOf(snapshot)).toEqual({ primary: "three.md", others: ["two.md", "one.md"] });
	});

	test("two entries with identical startTime resolve to the same primary regardless of input order", () => {
		const b = activeEntry("b/y.md", iso(NOW));
		const a = activeEntry("a/x.md", iso(NOW));
		expect(deriveSnapshot([b, a]).primary?.taskPath).toBe("a/x.md");
		expect(deriveSnapshot([a, b]).primary?.taskPath).toBe("a/x.md");
	});

	test("an archived task's timer is kept and ranked exactly like the same timer without the flag", () => {
		const build = (archivedPath: string | null) =>
			[
				activeEntry("early.md", iso(NOW - 5000)),
				activeEntry("late.md", iso(NOW - 1000)),
				activeEntry("mid.md", iso(NOW - 3000)),
			].map((item) => {
				if (item.taskPath === archivedPath) item.task.archived = true;
				return item;
			});
		const plain = pathsOf(deriveSnapshot(build(null)));
		// Archived timer starts last: it is the primary.
		expect(pathsOf(deriveSnapshot(build("late.md")))).toEqual(plain);
		expect(plain.primary).toBe("late.md");
		// Archived timer starts earlier: it sits in others at the same position.
		expect(pathsOf(deriveSnapshot(build("early.md")))).toEqual(plain);
		expect(plain.others).toEqual(["mid.md", "early.md"]);
	});

	test("identity invariant: N parseable entries give 1 primary + N-1 others, each key exactly once", () => {
		const shared = iso(NOW - 4000);
		const fixture = [
			activeEntry("f.md", iso(NOW - 6000)),
			activeEntry("d.md", shared),
			activeEntry("b.md", iso(NOW - 1000)),
			activeEntry("c.md", shared),
			activeEntry("e.md", iso(NOW - 5000)),
			activeEntry("a.md", iso(NOW - 2000)),
		];
		const snapshot = deriveSnapshot(fixture);
		expect(snapshot.primary).not.toBeNull();
		expect(snapshot.others).toHaveLength(5);
		const all = [snapshot.primary as OpenTimer, ...snapshot.others];
		const keys = new Set(all.map(keyOf));
		expect(keys.size).toBe(6);
		expect(keys).toEqual(new Set(fixture.map((item) => `${item.taskPath}|${item.entry.startTime}`)));
		expect(all.map((timer) => timer.taskPath)).toEqual(["b.md", "a.md", "c.md", "d.md", "e.md", "f.md"]);
	});

	test("an empty title falls back to the file basename", () => {
		const snapshot = deriveSnapshot([activeEntry("TaskNotes/Tasks/Write quarterly report.md", iso(NOW), "")]);
		expect(snapshot.primary?.title).toBe("Write quarterly report");
	});
});

describe("display copy", () => {
	test("displayTitle trims a real title and falls back to the basename without .md", () => {
		expect(displayTitle("", "TaskNotes/Tasks/Write quarterly report.md")).toBe("Write quarterly report");
		expect(displayTitle("  Plan offsite  ", "TaskNotes/Tasks/Plan offsite.md")).toBe("Plan offsite");
		expect(displayTitle(undefined, "a.md")).toBe("a");
		expect(displayTitle("   ", "x/y/z.md")).toBe("z");
	});

	test("moreRunningLabel", () => {
		expect(moreRunningLabel(1)).toBe("+1 more running");
		expect(moreRunningLabel(3)).toBe("+3 more running");
	});

	test("othersTooltip lists up to five titles, then ', and {k} more'", () => {
		const named = (titles: string[]) => titles.map((title, i) => openTimer(`${title}.md`, NOW - i * 1000, title));
		expect(othersTooltip(named(["A", "B"]))).toBe("Also running: A, B");
		expect(othersTooltip(named(["A", "B", "C", "D", "E", "F", "G"]))).toBe(
			"Also running: A, B, C, D, E, and 2 more",
		);
	});
});
