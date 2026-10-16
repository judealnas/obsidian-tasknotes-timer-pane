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

/** Session value from stored timestamps, never counted ticks (D-08). */
export function sessionValueMs(record: PauseRecord, nowMs: number): number {
	if (record.state === "paused") return record.accumulatedMs;
	return record.accumulatedMs + sessionMs(parseMs(record.entryStart) ?? nowMs, nowMs);
}

function openEntriesOn(active: readonly ActiveTimeEntry[], path: string): string[] {
	const starts: string[] = [];
	const items: readonly (ActiveTimeEntry | null | undefined)[] = Array.isArray(active) ? active : [];
	for (const item of items) {
		const startTime: unknown = item?.entry?.startTime;
		if (item?.entry?.endTime || typeof startTime !== "string" || parseMs(startTime) === null) continue;
		const taskPath: unknown = item?.taskPath;
		if (typeof taskPath !== "string" || normalizeTimerPath(taskPath) !== path) continue;
		starts.push(startTime);
	}
	return starts;
}

/**
 * Brings records in line with what TaskNotes reports. Pure: returns new arrays.
 * Rules, per record, in order:
 * - D-11: a paused record with an open entry on its path that is not the entry it
 *   closed and not the readable Pomodoro owner becomes running on that entry (the
 *   latest one if several). This is also how the pane's own Resume lands.
 * - A running record whose entry is no longer open is deleted (stopped elsewhere,
 *   by the pane's Stop, or by auto-stop), unless a pane pause is writing that path.
 * Records never expire by age (D-13), and a null task never deletes one.
 */
export function reconcile(records: readonly PauseRecord[], obs: PauseObservations): { next: PauseRecord[]; changed: boolean } {
	const next: PauseRecord[] = [];
	let changed = false;
	const owner = obs.ownership.readable ? obs.ownership.owner : null;
	for (const record of records) {
		const open = openEntriesOn(obs.active, record.taskPath);
		if (record.state === "paused") {
			let latest: string | null = null;
			for (const startTime of open) {
				if (startTime === record.lastEntryStart) continue;
				if (owner && sameEntry({ taskPath: record.taskPath, startTime }, owner)) continue;
				if (latest === null || (parseMs(startTime) ?? 0) > (parseMs(latest) ?? 0)) latest = startTime;
			}
			if (latest === null) {
				next.push(record);
				continue;
			}
			next.push({
				state: "running",
				taskPath: record.taskPath,
				title: record.title,
				sessionStartedAt: record.sessionStartedAt,
				accumulatedMs: record.accumulatedMs,
				entryStart: latest,
			});
			changed = true;
			continue;
		}
		if (obs.pending.has(record.taskPath) || open.includes(record.entryStart)) {
			next.push(record);
			continue;
		}
		changed = true;
	}
	return { next, changed };
}
