// Pure tests for the stored half of the pause ledger (CTRL-04): loadPauseRecords
// validates untrusted data.json content (T-03-01), and PauseStore persists every change.
import { describe, expect, test, vi } from "vitest";
import { PAUSE_RECORDS_VERSION, loadPauseRecords, type PauseRecord } from "../src/model/pauseLedger";
import { PauseStore } from "../src/state/PauseStore";

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
