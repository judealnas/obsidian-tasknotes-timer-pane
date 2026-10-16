import type { ActiveTimeEntry } from "../tasknotes/runtime-api.types";

export type EntryId = { taskPath: string; startTime: string };
export type Ownership = { readable: true; owner: EntryId | null } | { readable: false };

/** Match vault paths without changing case or timestamp identity. */
export function normalizeTimerPath(path: string): string {
	return path.replace(/\\/g, "/").split("/").filter(part => part !== "" && part !== ".").join("/");
}
export function sameEntry(a: EntryId, b: EntryId): boolean {
	return normalizeTimerPath(a.taskPath) === normalizeTimerPath(b.taskPath) && a.startTime === b.startTime;
}
function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function timestamp(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

/** Malformed data never grants permission to stop an entry. */
export function getPomodoroOwnedEntryId(state: unknown): Ownership {
	if (!record(state) || typeof state.isRunning !== "boolean") return { readable: false };
	const session = state.currentSession;
	if (session === undefined || session === null) return state.isRunning ? { readable: false } : { readable: true, owner: null };
	if (!record(session) || !["work", "short-break", "long-break"].includes(String(session.type)) || typeof session.completed !== "boolean" || (session.interrupted !== undefined && typeof session.interrupted !== "boolean") || !timestamp(session.startTime)) return { readable: false };
	if (!state.isRunning || session.type !== "work" || session.completed || session.interrupted === true) return { readable: true, owner: null };
	// Work sessions may be unassigned, or tracking may be disabled.
	if (session.taskPath === undefined && session.timeTrackingStartTime === undefined) return { readable: true, owner: null };
	if (typeof session.taskPath !== "string" || normalizeTimerPath(session.taskPath) === "") return { readable: false };
	if (session.timeTrackingStartTime === undefined) return { readable: true, owner: null };
	if (!timestamp(session.timeTrackingStartTime)) return { readable: false };
	return { readable: true, owner: { taskPath: normalizeTimerPath(session.taskPath), startTime: session.timeTrackingStartTime } };
}

export function selectRegularStopTargets(active: readonly ActiveTimeEntry[], ownership: Ownership): EntryId[] {
	if (!ownership.readable) return [];
	const targets: EntryId[] = [];
	for (const item of active) {
		const id = { taskPath: item.taskPath, startTime: item.entry.startTime };
		if (item.entry.endTime || !timestamp(id.startTime) || (ownership.owner && sameEntry(id, ownership.owner)) || targets.some(previous => sameEntry(previous, id))) continue;
		targets.push(id);
	}
	return targets;
}
