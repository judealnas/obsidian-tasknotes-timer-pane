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

/**
 * Total tracked time to the second, including running entries. Deliberately not
 * TaskNotes' minute-floored totals (DISP-03).
 */
export function totalMs(entries: readonly ParsedEntry[], nowMs: number): number {
	let sum = 0;
	for (const entry of entries) sum += Math.max(0, (entry.endMs ?? nowMs) - entry.startMs);
	return sum;
}

/** A gap between two 1 s ticks longer than this means the machine slept or timers were throttled. */
export const WAKE_GAP_MS = 3000;

/** True when the time since the previous tick exceeds the threshold (exactly the threshold is not a gap). */
export function detectWakeGap(lastTickMs: number | null, nowMs: number, thresholdMs: number = WAKE_GAP_MS): boolean {
	return lastTickMs !== null && nowMs - lastTickMs > thresholdMs;
}

/** Sum of a timer's closed entries, in ms. Open entries are left out: they grow every tick. */
function closedMs(entries: readonly ParsedEntry[]): number {
	let sum = 0;
	for (const entry of entries) if (entry.endMs !== null) sum += Math.max(0, entry.endMs - entry.startMs);
	return sum;
}

// Control characters never occur in ISO timestamps (or in a sane title or path).
const FIELD_SEPARATOR = "\u0000";
const TIMER_SEPARATOR = "\u0001";

/**
 * A deterministic string for change detection: the primary, then the others in
 * order, each as taskPath, startTime, title and the closed-entry total. TaskNotes
 * returns fresh copies on every call, so object identity cannot be used.
 */
export function snapshotSignature(snapshot: TimerSnapshot): string {
	const timers = snapshot.primary ? [snapshot.primary, ...snapshot.others] : snapshot.others;
	const head = snapshot.primary ? "P" : "-";
	return (
		head +
		TIMER_SEPARATOR +
		timers
			.map((timer) =>
				[timer.taskPath, timer.startTime, timer.title, String(closedMs(timer.entries))].join(FIELD_SEPARATOR),
			)
			.join(TIMER_SEPARATOR)
	);
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
		timers.push({
			taskPath,
			title: displayTitle(item?.task?.title, taskPath),
			startTime,
			startMs,
			entries: parseEntries(item?.task?.timeEntries),
		});
	}
	const primary = selectPrimary(timers);
	const others = timers.filter((timer) => timer !== primary).sort(compareTimers);
	return { primary, others };
}

/**
 * The task's own entries for the total. Keeps entries with a parseable startTime,
 * maps a missing endTime to an open entry, drops an unparseable endTime, and ignores
 * the legacy `duration` field.
 */
function parseEntries(timeEntries: unknown): ParsedEntry[] {
	if (!Array.isArray(timeEntries)) return [];
	const parsed: ParsedEntry[] = [];
	for (const raw of timeEntries as unknown[]) {
		const entry = (raw ?? {}) as { startTime?: unknown; endTime?: unknown };
		const startMs = parseMs(entry.startTime);
		if (startMs === null) continue;
		if (entry.endTime === undefined || entry.endTime === null || entry.endTime === "") {
			parsed.push({ startMs, endMs: null });
			continue;
		}
		const endMs = parseMs(entry.endTime);
		if (endMs === null) continue;
		parsed.push({ startMs, endMs });
	}
	return parsed;
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

/** A trimmed non-empty title, otherwise the file basename without a trailing ".md". */
export function displayTitle(title: unknown, taskPath: string): string {
	if (typeof title === "string") {
		const trimmed = title.trim();
		if (trimmed !== "") return trimmed;
	}
	const basename = taskPath.split("/").pop() ?? taskPath;
	return basename.endsWith(".md") ? basename.slice(0, -".md".length) : basename;
}

/** "+N more running" indicator text. */
export function moreRunningLabel(n: number): string {
	return `+${n} more running`;
}

const TOOLTIP_TITLE_LIMIT = 5;

/** "Also running: A, B" with at most five titles, then ", and {k} more". */
export function othersTooltip(others: readonly OpenTimer[]): string {
	const titles = others.slice(0, TOOLTIP_TITLE_LIMIT).map((timer) => timer.title);
	const rest = others.length - titles.length;
	return `Also running: ${titles.join(", ")}${rest > 0 ? `, and ${rest} more` : ""}`;
}
