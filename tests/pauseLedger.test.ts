// Pure tests for the stored half of the pause ledger (CTRL-04): loadPauseRecords
// validates untrusted data.json content (T-03-01), and PauseStore persists every change.
import { describe, expect, test, vi } from "vitest";
import {
	PAUSE_RECORDS_VERSION,
	loadPauseRecords,
	reconcile,
	type PauseObservations,
	type PauseRecord,
	type PausedRecord,
	type RunningRecord,
} from "../src/model/pauseLedger";
import type { Ownership } from "../src/model/pomodoroOwnership";
import type { ActiveTimeEntry, TaskInfo } from "../src/tasknotes/runtime-api.types";
import { PauseStore } from "../src/state/PauseStore";
import { makeActiveEntry } from "./fakes/fakeTaskNotes";

const PATH = "TaskNotes/Tasks/Write report.md";
const OTHER = "TaskNotes/Tasks/Answer email.md";

function paused(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		state: "paused",
		taskPath: PATH,
		title: "Write report",
		sessionStartedAt: "2026-10-14T09:00:00.000Z",
		accumulatedMs: 600_000,
		pausedAt: "2026-10-14T09:10:00.000Z",
		lastEntryStart: "2026-10-14T09:00:00.000Z",
		...overrides,
	};
}
function running(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		state: "running",
		taskPath: OTHER,
		title: "Answer email",
		sessionStartedAt: "2026-10-14T08:00:00.000Z",
		accumulatedMs: 120_000,
		entryStart: "2026-10-14T08:30:00.000Z",
		...overrides,
	};
}
const data = (records: unknown) => ({ completionStatus: "done", pauseRecordsVersion: PAUSE_RECORDS_VERSION, pauseRecords: records });

describe("loadPauseRecords (CTRL-04 empty predicate)", () => {
	test.each([
		["undefined", undefined],
		["null", null],
		["an array", [paused()]],
		["a string", "pauseRecords"],
		["settings only", { completionStatus: "done" }],
		["an unknown version", { pauseRecordsVersion: 2, pauseRecords: [paused()] }],
		["a missing version", { pauseRecords: [paused()] }],
		["non-array records", { pauseRecordsVersion: 1, pauseRecords: "x" }],
	])("%s loads zero pauses without throwing", (_name, value) => {
		expect(loadPauseRecords(value)).toEqual([]);
	});

	test("a valid paused and a valid running record load as stored", () => {
		expect(loadPauseRecords(data([paused(), running()]))).toEqual([paused(), running()]);
	});
});

describe("loadPauseRecords drops malformed records one by one", () => {
	test.each([
		["missing taskPath", { taskPath: undefined }],
		["empty taskPath", { taskPath: "" }],
		["a taskPath of only separators", { taskPath: "/./" }],
		["unparseable sessionStartedAt", { sessionStartedAt: "yesterday-ish" }],
		["non-finite accumulatedMs", { accumulatedMs: Number.POSITIVE_INFINITY }],
		["non-number accumulatedMs", { accumulatedMs: "600000" }],
		["an unknown state", { state: "stopped" }],
		["paused without pausedAt", { pausedAt: undefined }],
		["paused with unparseable lastEntryStart", { lastEntryStart: "nope" }],
	])("%s is dropped and its valid sibling survives", (_name, patch) => {
		expect(loadPauseRecords(data([paused(patch), running()]))).toEqual([running()]);
	});

	test("running without a parseable entryStart is dropped", () => {
		expect(loadPauseRecords(data([running({ entryStart: 12 }), paused()]))).toEqual([paused()]);
	});

	test("non-object items are dropped", () => {
		expect(loadPauseRecords(data([null, 3, "x", [paused()], paused()]))).toEqual([paused()]);
	});
});

describe("loadPauseRecords repairs what it safely can", () => {
	test("a negative accumulatedMs clamps to 0", () => {
		expect(loadPauseRecords(data([paused({ accumulatedMs: -5 })]))[0]?.accumulatedMs).toBe(0);
	});
	test("a non-string title falls back to the path's basename", () => {
		expect(loadPauseRecords(data([paused({ title: 42 })]))[0]?.title).toBe("Write report");
	});
	test("backslash paths are normalized", () => {
		expect(loadPauseRecords(data([paused({ taskPath: "TaskNotes\\Tasks\\Write report.md" })]))[0]?.taskPath).toBe(PATH);
	});
	test("unknown fields are not carried into the record", () => {
		expect(loadPauseRecords(data([paused({ extra: "x" })]))[0]).toEqual(paused());
	});
});

describe("loadPauseRecords ordering predicate", () => {
	test("duplicates for one normalized path keep the newest pausedAt", () => {
		const older = paused({ pausedAt: "2026-10-14T09:05:00.000Z", accumulatedMs: 1 });
		const newer = paused({ taskPath: "TaskNotes\\Tasks\\Write report.md", pausedAt: "2026-10-14T09:20:00.000Z", accumulatedMs: 2 });
		expect(loadPauseRecords(data([newer, older])).map(record => record.accumulatedMs)).toEqual([2]);
		expect(loadPauseRecords(data([older, newer])).map(record => record.accumulatedMs)).toEqual([2]);
	});
	test("a running record's newness is its entryStart, compared with a paused record's pausedAt", () => {
		const stale = paused({ pausedAt: "2026-10-14T09:10:00.000Z" });
		const resumed = running({ taskPath: PATH, entryStart: "2026-10-14T09:30:00.000Z" });
		expect(loadPauseRecords(data([resumed, stale]))[0]?.state).toBe("running");
	});
	test("on a tie the later array item wins", () => {
		const first = paused({ accumulatedMs: 1 });
		const second = paused({ accumulatedMs: 2 });
		expect(loadPauseRecords(data([first, second])).map(record => record.accumulatedMs)).toEqual([2]);
	});
	test("at most the first 1000 items are examined", () => {
		const items = Array.from({ length: 1001 }, (_, i) => paused({ taskPath: `Tasks/${i}.md` }));
		const loaded = loadPauseRecords(data(items));
		expect(loaded).toHaveLength(1000);
		expect(loaded.some(record => record.taskPath === "Tasks/1000.md")).toBe(false);
	});
});

describe("PauseStore persistence", () => {
	const stored = (): PauseRecord => loadPauseRecords(data([paused()]))[0] as PauseRecord;

	test("every change after load persists the serialized records", async () => {
		const persist = vi.fn((_records: readonly PauseRecord[]) => Promise.resolve());
		const store = new PauseStore({ log: () => undefined, persist });
		const record = stored();
		store.load([]);
		store.set(record);
		store.remove(PATH);
		await Promise.resolve();
		expect(persist.mock.calls.map(call => call[0])).toEqual([[record], []]);
	});

	test("a change before load is kept, merged over the stored records and persisted once loaded", () => {
		const persist = vi.fn((_records: readonly PauseRecord[]) => Promise.resolve());
		const store = new PauseStore({ log: () => undefined, persist });
		const record = stored();
		const newer = { ...record, accumulatedMs: 9 };
		store.set(newer);
		expect(persist).not.toHaveBeenCalled();
		store.load([record]);
		expect(store.records()).toEqual([newer]);
		expect(persist).toHaveBeenCalledWith([newer]);
	});

	test("a failed save is logged without any task path", async () => {
		const log = vi.fn<(message: string) => void>();
		const store = new PauseStore({ log, persist: () => Promise.reject(new Error("private/" + PATH)) });
		store.load([]);
		store.set(stored());
		await Promise.resolve();
		await Promise.resolve();
		expect(log).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(log.mock.calls)).not.toMatch(/Write report|private/);
	});
});

// ---- reconcile clearing and follow rules (plan 03-02: D-12, D-13, D-16) ----

const LAST = "2026-10-14T09:00:00.000Z";
const NEW = "2026-10-14T11:00:00.000Z";
const LATER = "2026-10-14T11:05:00.000Z";
const NOW_MS = Date.parse("2026-10-14T12:00:00.000Z");

function pausedRecord(overrides: Partial<PausedRecord> = {}): PausedRecord {
	return {
		state: "paused",
		taskPath: PATH,
		title: "Write report",
		sessionStartedAt: LAST,
		accumulatedMs: 600_000,
		pausedAt: "2026-10-14T09:10:00.000Z",
		lastEntryStart: LAST,
		...overrides,
	};
}
function runningRecord(overrides: Partial<RunningRecord> = {}): RunningRecord {
	return {
		state: "running",
		taskPath: PATH,
		title: "Write report",
		sessionStartedAt: LAST,
		accumulatedMs: 600_000,
		entryStart: NEW,
		...overrides,
	};
}
function open(taskPath: string, startTime: string): ActiveTimeEntry {
	return makeActiveEntry({ taskPath, startTime, title: "t" });
}
function task(status: string, archived = false): TaskInfo {
	return { title: "Write report", status, path: PATH, archived };
}
function obs(overrides: Partial<PauseObservations> = {}): PauseObservations {
	return {
		active: [],
		ownership: { readable: true, owner: null },
		tasks: new Map(),
		completedStatuses: null,
		fileExists: null,
		pending: new Set(),
		...overrides,
	};
}
const ownerOn = (taskPath: string, startTime: string): Ownership => ({ readable: true, owner: { taskPath, startTime } });

describe("reconcile rule 1: Pomodoro takeover (D-16)", () => {
	test("a paused record whose path is the readable Pomodoro owner's path is deleted", () => {
		const result = reconcile([pausedRecord()], obs({ active: [open(PATH, NEW)], ownership: ownerOn(PATH, NEW) }));
		expect(result).toEqual({ next: [], changed: true });
	});

	test("with ownership unreadable the same input converts the record to running instead (D-11, D-15)", () => {
		const result = reconcile([pausedRecord()], obs({ active: [open(PATH, NEW)], ownership: { readable: false } }));
		expect(result.changed).toBe(true);
		expect(result.next).toEqual([runningRecord({ entryStart: NEW })]);
	});

	test("rule 1 runs before rule 2: a non-owned open entry beside the owner's does not resume the record", () => {
		const result = reconcile([pausedRecord()], obs({ active: [open(PATH, NEW), open(PATH, LATER)], ownership: ownerOn(PATH, NEW) }));
		expect(result).toEqual({ next: [], changed: true });
	});

	test("an owner matched through a backslash path still takes over", () => {
		const result = reconcile([pausedRecord()], obs({ active: [open(PATH, NEW)], ownership: ownerOn(PATH.replace(/\//g, "\\"), NEW) }));
		expect(result.next).toEqual([]);
	});

	test("an owner on a different path leaves the paused record alone", () => {
		const result = reconcile([pausedRecord()], obs({ active: [open(OTHER, NEW)], ownership: ownerOn(OTHER, NEW) }));
		expect(result).toEqual({ next: [pausedRecord()], changed: false });
	});

	test("Pitfall 6: a running record whose entry became the Pomodoro owner is deleted", () => {
		const result = reconcile([runningRecord()], obs({ active: [open(PATH, NEW)], ownership: ownerOn(PATH, NEW) }));
		expect(result).toEqual({ next: [], changed: true });
	});

	test("a running record whose entry is not the owner's start is kept", () => {
		const result = reconcile([runningRecord()], obs({ active: [open(PATH, NEW), open(PATH, LATER)], ownership: ownerOn(PATH, LATER) }));
		expect(result).toEqual({ next: [runningRecord()], changed: false });
	});
});

describe("reconcile rule 3: rename lag", () => {
	test("a running record whose entry is open only under a path holding no record is kept", () => {
		const renamed = runningRecord({ taskPath: "TaskNotes/Tasks/Renamed.md" });
		const result = reconcile([renamed], obs({ active: [open(PATH, NEW)] }));
		expect(result).toEqual({ next: [renamed], changed: false });
	});

	test("a running record whose entry is open only under a path that holds another record is deleted", () => {
		const renamed = runningRecord({ taskPath: "TaskNotes/Tasks/Renamed.md" });
		const other = pausedRecord({ lastEntryStart: NEW });
		const result = reconcile([renamed, other], obs({ active: [open(PATH, NEW)] }));
		expect(result).toEqual({ next: [other], changed: true });
	});

	test("a running record whose entry is open nowhere is deleted", () => {
		expect(reconcile([runningRecord()], obs())).toEqual({ next: [], changed: true });
	});
});

describe("reconcile rule 4: completed elsewhere (D-12)", () => {
	const done = new Set(["done", "cancelled"]);

	test("a paused task whose status is a completed-type status is deleted", () => {
		const result = reconcile([pausedRecord()], obs({ tasks: new Map([[PATH, task("done")]]), completedStatuses: done }));
		expect(result).toEqual({ next: [], changed: true });
	});

	test("completedStatuses null skips the rule", () => {
		const result = reconcile([pausedRecord()], obs({ tasks: new Map([[PATH, task("done")]]), completedStatuses: null }));
		expect(result).toEqual({ next: [pausedRecord()], changed: false });
	});

	test("an archived task with a non-completed status keeps its pause", () => {
		const result = reconcile([pausedRecord()], obs({ tasks: new Map([[PATH, task("open", true)]]), completedStatuses: done }));
		expect(result).toEqual({ next: [pausedRecord()], changed: false });
	});

	test("a null task (cache warming) keeps its pause", () => {
		const result = reconcile([pausedRecord()], obs({ tasks: new Map([[PATH, null]]), completedStatuses: done }));
		expect(result).toEqual({ next: [pausedRecord()], changed: false });
	});
});

describe("reconcile rule 5: file missing (D-12)", () => {
	test("fileExists false deletes a paused record", () => {
		expect(reconcile([pausedRecord()], obs({ fileExists: () => false }))).toEqual({ next: [], changed: true });
	});

	test("fileExists false deletes a running record whose entry is still open", () => {
		const result = reconcile([runningRecord()], obs({ active: [open(PATH, NEW)], fileExists: () => false }));
		expect(result).toEqual({ next: [], changed: true });
	});

	test("fileExists null skips the rule", () => {
		expect(reconcile([pausedRecord()], obs({ fileExists: null }))).toEqual({ next: [pausedRecord()], changed: false });
	});

	test("fileExists true keeps the record", () => {
		expect(reconcile([pausedRecord()], obs({ fileExists: () => true }))).toEqual({ next: [pausedRecord()], changed: false });
	});
});

describe("reconcile pending paths and age", () => {
	test("rules 3 to 5 are skipped for a path a pane pause is writing", () => {
		const result = reconcile(
			[pausedRecord()],
			obs({ tasks: new Map([[PATH, task("done")]]), completedStatuses: new Set(["done"]), fileExists: () => false, pending: new Set([PATH]) }),
		);
		expect(result).toEqual({ next: [pausedRecord()], changed: false });
	});

	test("D-13: a record paused 30 days ago survives reconcile unchanged", () => {
		const old = pausedRecord({ pausedAt: new Date(NOW_MS - 30 * 24 * 3600_000).toISOString() });
		const result = reconcile([old], obs({ tasks: new Map([[PATH, task("open")]]), completedStatuses: new Set(["done"]), fileExists: () => true }));
		expect(result).toEqual({ next: [old], changed: false });
	});
});
