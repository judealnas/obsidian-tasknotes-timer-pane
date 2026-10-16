/*
 * The pane's session ledger (Phase 3, D-05 to D-08, D-11). TaskNotes has no pause for
 * regular timers, so the pane owns it: Pause closes the entry through api.time.stop and
 * remembers the session here; Resume opens a new entry through api.time.start. A record
 * is keyed by normalized task path (one per task). Pure and runtime Obsidian-free.
 *
 * Stored user data (D-05, costly): the record shape is persisted in data.json under
 * pauseRecordsVersion 1. A later shape change needs a loader that still accepts v1.
 */
import { normalizeTimerPath, sameEntry, type Ownership } from "./pomodoroOwnership";
import { parseMs, sessionMs } from "./timeMath";
import type { ActiveTimeEntry, TaskInfo } from "../tasknotes/runtime-api.types";

export const PAUSE_RECORDS_VERSION = 1;

interface PauseRecordBase {
	/** normalizeTimerPath()-normalized. */
	taskPath: string;
	/** Last known title; the card falls back to it while TaskNotes cannot return the task. */
	title: string;
	/** ISO start of the session's first entry: the D-06 sort key and part of the card key. */
	sessionStartedAt: string;
	/** Sum of this session's closed segments, in ms (finite, >= 0). */
	accumulatedMs: number;
}

/** A paused session: its last entry is closed. */
export interface PausedRecord extends PauseRecordBase {
	state: "paused";
	pausedAt: string;
	/** Start of the entry the pause closed. A stale read still showing it open is not a resume. */
	lastEntryStart: string;
}

/** A resumed session that continues: Session = accumulatedMs + (now - entryStart). */
export interface RunningRecord extends PauseRecordBase {
	state: "running";
	entryStart: string;
}

export type PauseRecord = PausedRecord | RunningRecord;

/** What one refresh observed from TaskNotes, plus the paths a pane pause is writing. */
export interface PauseObservations {
	active: readonly ActiveTimeEntry[];
	ownership: Ownership;
	tasks: ReadonlyMap<string, TaskInfo | null>;
	/** Rule added in plan 03-02; null skips it. */
	completedStatuses: ReadonlySet<string> | null;
	/** Rule added in plan 03-02; null skips it. */
	fileExists: ((path: string) => boolean) | null;
	pending: ReadonlySet<string>;
}

export interface PausedFromStopInput {
	/** The task's record before this pause, if any. */
	prior: PauseRecord | undefined;
	taskPath: string;
	title: string;
	/** Start of the entry the pause closed. */
	entryStart: string;
	/** End of that entry (from the TaskInfo TaskNotes returned). */
	endMs: number;
}

/**
 * The paused record for an entry the pane just closed. It continues the session only
 * when `prior` is the running record of exactly this entry; otherwise a new session
 * starts at `entryStart`. The closed segment is counted once, here.
 */
export function pausedFromStop(input: PausedFromStopInput): PausedRecord {
	const { prior, entryStart, endMs } = input;
	const continuing = prior?.state === "running" && prior.entryStart === entryStart ? prior : null;
	const startMs = parseMs(entryStart) ?? endMs;
	return {
		state: "paused",
		taskPath: normalizeTimerPath(input.taskPath),
		title: input.title,
		sessionStartedAt: continuing?.sessionStartedAt ?? entryStart,
		accumulatedMs: (continuing?.accumulatedMs ?? 0) + Math.max(0, endMs - startMs),
		pausedAt: new Date(endMs).toISOString(),
		lastEntryStart: entryStart,
	};
}

/** At most this many stored items are examined (T-03-01). */
const MAX_STORED_RECORDS = 1000;

function plainRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function timestamp(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

/** One stored item as a record, or null when any required field is malformed. */
function parseStoredRecord(value: unknown): PauseRecord | null {
	if (!plainRecord(value)) return null;
	if (typeof value.taskPath !== "string") return null;
	const taskPath = normalizeTimerPath(value.taskPath);
	if (taskPath === "") return null;
	if (!timestamp(value.sessionStartedAt)) return null;
	if (typeof value.accumulatedMs !== "number" || !Number.isFinite(value.accumulatedMs)) return null;
	const accumulatedMs = Math.max(0, value.accumulatedMs);
	const basename = taskPath.split("/").pop() ?? taskPath;
	const title = typeof value.title === "string" ? value.title : basename.endsWith(".md") ? basename.slice(0, -".md".length) : basename;
	const base = { taskPath, title, sessionStartedAt: value.sessionStartedAt, accumulatedMs };
	if (value.state === "paused") {
		if (!timestamp(value.pausedAt) || !timestamp(value.lastEntryStart)) return null;
		return { state: "paused", ...base, pausedAt: value.pausedAt, lastEntryStart: value.lastEntryStart };
	}
	if (value.state === "running") {
		if (!timestamp(value.entryStart)) return null;
		return { state: "running", ...base, entryStart: value.entryStart };
	}
	return null;
}

/** When a record last changed: the pause for a paused record, the resume entry for a running one. */
function newnessMs(record: PauseRecord): number {
	return Date.parse(record.state === "paused" ? record.pausedAt : record.entryStart);
}

/**
 * Pause records from untrusted data.json content (Sync, other devices, hand edits).
 * Reads only pauseRecordsVersion and pauseRecords, never completionStatus. Returns []
 * unless the version is PAUSE_RECORDS_VERSION and the records are an array; examines
 * at most the first 1000 items; drops malformed items one by one; keeps the newest
 * record per normalized path (a later item wins a tie). Never throws.
 */
export function loadPauseRecords(data: unknown): PauseRecord[] {
	if (!plainRecord(data) || data.pauseRecordsVersion !== PAUSE_RECORDS_VERSION || !Array.isArray(data.pauseRecords)) return [];
	const items = (data.pauseRecords as unknown[]).slice(0, MAX_STORED_RECORDS);
	const byPath = new Map<string, PauseRecord>();
	for (const item of items) {
		const record = parseStoredRecord(item);
		if (record === null) continue;
		const existing = byPath.get(record.taskPath);
		if (existing && newnessMs(existing) > newnessMs(record)) continue;
		// Re-insert so the surviving record takes the later position.
		byPath.delete(record.taskPath);
		byPath.set(record.taskPath, record);
	}
	return [...byPath.values()];
}

/** Session value from stored timestamps, never counted ticks (D-08). */
export function sessionValueMs(record: PauseRecord, nowMs: number): number {
	if (record.state === "paused") return record.accumulatedMs;
	return record.accumulatedMs + sessionMs(parseMs(record.entryStart) ?? nowMs, nowMs);
}

/** Starts of every well-formed open entry, keyed by normalized path. */
function openStartsByPath(active: readonly ActiveTimeEntry[]): Map<string, string[]> {
	const byPath = new Map<string, string[]>();
	const items: readonly (ActiveTimeEntry | null | undefined)[] = Array.isArray(active) ? active : [];
	for (const item of items) {
		const startTime: unknown = item?.entry?.startTime;
		if (item?.entry?.endTime || typeof startTime !== "string" || parseMs(startTime) === null) continue;
		const taskPath: unknown = item?.taskPath;
		if (typeof taskPath !== "string") continue;
		const path = normalizeTimerPath(taskPath);
		if (path === "") continue;
		const starts = byPath.get(path) ?? [];
		starts.push(startTime);
		byPath.set(path, starts);
	}
	return byPath;
}

/**
 * Brings records in line with what TaskNotes reports. Pure: returns new arrays.
 * Rules, per record, in order:
 * 1. D-16: when Pomodoro ownership is readable and the owner is on the record's path,
 *    a paused record is deleted (the Pomodoro took the task over), and so is a running
 *    record whose entry is the owner's (Pitfall 6: it resumed while ownership was unreadable).
 * 2. D-11: a paused record with an open entry on its path that is not the entry it
 *    closed and not the readable Pomodoro owner becomes running on that entry (the
 *    latest one if several). This is also how the pane's own Resume lands.
 * 3. A running record whose entry is no longer open is deleted (stopped elsewhere,
 *    by the pane's Stop, or by auto-stop). Kept while its entry is still reported
 *    open under a path that holds no record: TaskNotes re-indexing after a rename.
 * 4. D-12 completed: a paused record whose task has a completed-type status is deleted.
 *    Only the status counts, never the archive flag.
 * 5. D-12 deleted: a record whose note the vault reports missing is deleted.
 * Rules 3 to 5 skip a path a pane pause is writing. Records never expire by age
 * (D-13), and a null task never deletes one (the cache may be warming).
 */
export function reconcile(records: readonly PauseRecord[], obs: PauseObservations): { next: PauseRecord[]; changed: boolean } {
	const next: PauseRecord[] = [];
	let changed = false;
	const owner = obs.ownership.readable ? obs.ownership.owner : null;
	const ownerPath = owner ? normalizeTimerPath(owner.taskPath) : null;
	const openByPath = openStartsByPath(obs.active);
	const recordPaths = new Set(records.map(record => record.taskPath));
	for (const record of records) {
		const open = openByPath.get(record.taskPath) ?? [];
		// Rule 1 (D-16), before rule 2: a Pomodoro start would otherwise read as an external start.
		if (owner && ownerPath === record.taskPath && (record.state === "paused" || record.entryStart === owner.startTime)) {
			changed = true;
			continue;
		}
		let current: PauseRecord = record;
		if (record.state === "paused") {
			// Rule 2 (D-11).
			let latest: string | null = null;
			for (const startTime of open) {
				if (startTime === record.lastEntryStart) continue;
				if (owner && sameEntry({ taskPath: record.taskPath, startTime }, owner)) continue;
				if (latest === null || (parseMs(startTime) ?? 0) > (parseMs(latest) ?? 0)) latest = startTime;
			}
			if (latest !== null) {
				current = {
					state: "running",
					taskPath: record.taskPath,
					title: record.title,
					sessionStartedAt: record.sessionStartedAt,
					accumulatedMs: record.accumulatedMs,
					entryStart: latest,
				};
				changed = true;
			}
		}
		if (obs.pending.has(record.taskPath)) {
			next.push(current);
			continue;
		}
		// Rule 3: a running record (one that was running before this pass) whose entry is gone.
		if (record.state === "running" && !open.includes(record.entryStart) && !openUnderUnrecordedPath(openByPath, recordPaths, record.entryStart)) {
			changed = true;
			continue;
		}
		// Rule 4 (D-12 completed): paused records only; the task's status, never its archive flag.
		if (current.state === "paused" && obs.completedStatuses !== null) {
			const task = obs.tasks.get(current.taskPath);
			if (task && typeof task.status === "string" && obs.completedStatuses.has(task.status)) {
				changed = true;
				continue;
			}
		}
		// Rule 5 (D-12 deleted).
		if (obs.fileExists !== null && !obs.fileExists(current.taskPath)) {
			changed = true;
			continue;
		}
		next.push(current);
	}
	return { next, changed };
}

/** True when an open entry with this start sits on a path no record holds (rename lag). */
function openUnderUnrecordedPath(openByPath: ReadonlyMap<string, readonly string[]>, recordPaths: ReadonlySet<string>, entryStart: string): boolean {
	for (const [path, starts] of openByPath) {
		if (!recordPaths.has(path) && starts.includes(entryStart)) return true;
	}
	return false;
}
