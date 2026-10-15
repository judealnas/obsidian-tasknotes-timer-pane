/*
 * Pure time math and snapshot derivation. No Obsidian, no TaskNotes runtime calls:
 * everything here is computed from the plain data returned by `time.active()` and
 * the wall clock passed in by the caller.
 */
import type { ActiveTimeEntry } from "../tasknotes/runtime-api.types";
import type { BridgeState } from "../tasknotes/TaskNotesBridge";

/** One of a task's time entries, parsed. An open entry has `endMs === null`. */
export interface ParsedEntry {
	startMs: number;
	endMs: number | null;
}

/** One open time entry, keyed by `(taskPath, startTime)`. */
export interface OpenTimer {
	taskPath: string;
	title: string;
	startTime: string;
	startMs: number;
	/** The task's own time entries, used for the total. */
	entries: ParsedEntry[];
}

/** Every open timer: the displayed one (`primary`) and the rest. */
export interface TimerSnapshot {
	primary: OpenTimer | null;
	others: OpenTimer[];
}

export type PaneState = "running" | "idle" | "loading" | "missing" | "incompatible";

/** Milliseconds since the epoch, or null for a non-string or unparseable value. */
export function parseMs(iso: unknown): number | null {
	if (typeof iso !== "string") return null;
	const ms = Date.parse(iso);
	return Number.isNaN(ms) ? null : ms;
}

/** Elapsed time of a running session; a future start clamps to 0. */
export function sessionMs(startMs: number, nowMs: number): number {
	return Math.max(0, nowMs - startMs);
}

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

/** H:MM:SS with unpadded, unbounded hours. Floors to whole seconds; negative or NaN gives 0:00:00. */
export function formatHms(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return "0:00:00";
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
}

/** Latest start first; equal starts ordered by task path ascending (plain `<`, locale-independent). */
function compareTimers(a: OpenTimer, b: OpenTimer): number {
	if (a.startMs !== b.startMs) return b.startMs - a.startMs;
	if (a.taskPath < b.taskPath) return -1;
	if (a.taskPath > b.taskPath) return 1;
	return 0;
}

/** The displayed timer: the most recently started one, ties broken by path ascending. */
export function selectPrimary(timers: readonly OpenTimer[]): OpenTimer | null {
	let best: OpenTimer | null = null;
	for (const timer of timers) {
		if (best === null || compareTimers(timer, best) < 0) best = timer;
	}
	return best;
}

/**
 * Builds the snapshot from `time.active()`. Every field is treated as untrusted.
 * Entries with a missing or unparseable startTime are dropped (as TaskNotes' status
 * bar does). The archive flag is never read: such timers display like any other.
 */
export function deriveSnapshot(active: readonly ActiveTimeEntry[]): TimerSnapshot {
	const timers: OpenTimer[] = [];
	const items: readonly (ActiveTimeEntry | null | undefined)[] = Array.isArray(active) ? active : [];
	for (const item of items) {
		const startTime: unknown = item?.entry?.startTime;
		const startMs = parseMs(startTime);
		if (startMs === null || typeof startTime !== "string") continue;
		const taskPath = pathOf(item);
		if (taskPath === null) continue;
		const title: unknown = item?.task?.title;
		timers.push({
			taskPath,
			title: typeof title === "string" ? title.trim() : "",
			startTime,
			startMs,
			entries: [],
		});
	}
	const primary = selectPrimary(timers);
	const others = timers.filter((timer) => timer !== primary).sort(compareTimers);
	return { primary, others };
}

function pathOf(item: ActiveTimeEntry | null | undefined): string | null {
	const candidates: unknown[] = [item?.taskPath, item?.task?.path];
	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate !== "") return candidate;
	}
	return null;
}

/** What the pane shows, from the bridge state and the store snapshot. */
export function derivePaneState(bridge: BridgeState, snapshot: TimerSnapshot | null): PaneState {
	switch (bridge.kind) {
		case "missing":
			return "missing";
		case "incompatible":
			return "incompatible";
		case "loading":
			return "loading";
		case "ready":
			if (snapshot === null) return "loading";
			return snapshot.primary ? "running" : "idle";
	}
}
