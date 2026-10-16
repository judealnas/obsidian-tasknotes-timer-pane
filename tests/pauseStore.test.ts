// Pure tests for PauseStore.renamePath and removePath (CTRL-04, D-12): pauses follow a
// renamed or moved note or folder, and clear when it is deleted (T-03-09 edge predicate).
import { describe, expect, test, vi } from "vitest";
import type { PauseRecord, PausedRecord, RunningRecord } from "../src/model/pauseLedger";
import { PauseStore } from "../src/state/PauseStore";

function paused(taskPath: string, overrides: Partial<PausedRecord> = {}): PausedRecord {
	return {
		state: "paused",
		taskPath,
		title: "Task",
		sessionStartedAt: "2026-10-14T09:00:00.000Z",
		accumulatedMs: 600_000,
		pausedAt: "2026-10-14T09:10:00.000Z",
		lastEntryStart: "2026-10-14T09:00:00.000Z",
		...overrides,
	};
}
function running(taskPath: string, overrides: Partial<RunningRecord> = {}): RunningRecord {
	return {
		state: "running",
		taskPath,
		title: "Task",
		sessionStartedAt: "2026-10-14T08:00:00.000Z",
		accumulatedMs: 120_000,
		entryStart: "2026-10-14T08:30:00.000Z",
		...overrides,
	};
}

function loaded(records: PauseRecord[]) {
	const persist = vi.fn((_records: readonly PauseRecord[]) => Promise.resolve());
	const store = new PauseStore({ log: () => undefined, persist });
	store.load(records);
	persist.mockClear();
	return { store, persist, rev: store.revision };
}
const paths = (store: PauseStore) => store.records().map(record => record.taskPath).sort();

describe("PauseStore.renamePath", () => {
	test("an exact file rename moves the record, keeps every other field, bumps revision once and persists once", () => {
		const record = paused("T/A.md");
		const { store, persist, rev } = loaded([record, running("T/C.md")]);
		expect(store.renamePath("T/A.md", "T/B.md")).toBe(1);
		expect(store.get("T/B.md")).toEqual({ ...record, taskPath: "T/B.md" });
		expect(store.get("T/A.md")).toBeUndefined();
		expect(store.revision).toBe(rev + 1);
		expect(persist).toHaveBeenCalledTimes(1);
	});

	test("an exact file rename matches only that path", () => {
		const { store } = loaded([paused("T/A.md"), paused("T/A.md.bak"), paused("T/A.mdx")]);
		expect(store.renamePath("T/A.md", "T/B.md")).toBe(1);
		expect(paths(store)).toEqual(["T/A.md.bak", "T/A.mdx", "T/B.md"]);
	});

	test("a folder rename remaps children at a '/' boundary and leaves Projects/AB and Projects/A.md untouched", () => {
		const { store } = loaded([paused("Projects/A/x.md"), running("Projects/A/sub/y.md"), paused("Projects/AB/x.md"), paused("Projects/A.md")]);
		expect(store.renamePath("Projects/A", "Projects/B")).toBe(2);
		expect(paths(store)).toEqual(["Projects/A.md", "Projects/AB/x.md", "Projects/B/sub/y.md", "Projects/B/x.md"]);
	});

	test("a rename onto a path that already has a record keeps the newer record and drops the other", () => {
		const older = paused("T/B.md", { pausedAt: "2026-10-14T09:05:00.000Z", title: "older" });
		const newer = paused("T/A.md", { pausedAt: "2026-10-14T09:20:00.000Z", title: "newer" });
		const { store } = loaded([older, newer]);
		store.renamePath("T/A.md", "T/B.md");
		expect(store.records()).toEqual([{ ...newer, taskPath: "T/B.md" }]);

		const keepTarget = loaded([paused("T/B.md", { pausedAt: "2026-10-14T09:30:00.000Z", title: "target" }), paused("T/A.md", { title: "moved" })]);
		keepTarget.store.renamePath("T/A.md", "T/B.md");
		expect(keepTarget.store.records().map(record => record.title)).toEqual(["target"]);
	});

	test("a running record's newness is its entryStart", () => {
		const target = paused("T/B.md", { pausedAt: "2026-10-14T08:00:00.000Z" });
		const moved = running("T/A.md", { entryStart: "2026-10-14T08:30:00.000Z" });
		const { store } = loaded([target, moved]);
		store.renamePath("T/A.md", "T/B.md");
		expect(store.records()).toEqual([{ ...moved, taskPath: "T/B.md" }]);
	});

	test("backslash and leading-slash inputs are normalized before matching", () => {
		const { store } = loaded([paused("Projects/A/x.md")]);
		expect(store.renamePath("\Projects\A", "/Projects/B/")).toBe(1);
		expect(paths(store)).toEqual(["Projects/B/x.md"]);
	});

	test("a rename that matches nothing changes nothing and does not persist", () => {
		const { store, persist, rev } = loaded([paused("T/A.md")]);
		expect(store.renamePath("T/Z.md", "T/B.md")).toBe(0);
		expect(store.revision).toBe(rev);
		expect(persist).not.toHaveBeenCalled();
	});

	test("before load there are no records and a rename is a no-op", () => {
		const persist = vi.fn((_records: readonly PauseRecord[]) => Promise.resolve());
		const store = new PauseStore({ log: () => undefined, persist });
		expect(store.renamePath("T/A.md", "T/B.md")).toBe(0);
		store.load([]);
		expect(persist).not.toHaveBeenCalled();
	});
});

describe("PauseStore.removePath", () => {
	test("an exact path deletes that record, bumps revision once and persists once", () => {
		const { store, persist, rev } = loaded([paused("T/A.md"), paused("T/B.md")]);
		expect(store.removePath("T/A.md")).toBe(1);
		expect(paths(store)).toEqual(["T/B.md"]);
		expect(store.revision).toBe(rev + 1);
		expect(persist).toHaveBeenCalledTimes(1);
	});

	test("a folder path deletes every record under it and nothing beside it", () => {
		const { store } = loaded([paused("Projects/A/x.md"), running("Projects/B/sub/y.md"), paused("ProjectsX/z.md"), paused("Other/w.md")]);
		expect(store.removePath("Projects")).toBe(2);
		expect(paths(store)).toEqual(["Other/w.md", "ProjectsX/z.md"]);
	});

	test("an unknown path changes nothing and does not persist", () => {
		const { store, persist, rev } = loaded([paused("T/A.md")]);
		expect(store.removePath("T/Unknown.md")).toBe(0);
		expect(store.revision).toBe(rev);
		expect(persist).not.toHaveBeenCalled();
	});

	test("backslash and leading-slash inputs are normalized before matching", () => {
		const { store } = loaded([paused("T/A.md")]);
		expect(store.removePath("\T\A.md")).toBe(1);
		expect(store.records()).toEqual([]);
	});
});
