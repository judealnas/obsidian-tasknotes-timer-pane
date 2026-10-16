import type { TaskStatus } from "./tasknotes/runtime-api.types";

/** Null is separate from every possible TaskNotes status string. */
export interface TimerPaneSettings { completionStatus: string | null; }
export const DEFAULT_SETTINGS: TimerPaneSettings = { completionStatus: null };

export function resolveCompletionStatus(statuses: readonly TaskStatus[], preference: string | null): TaskStatus | null {
	const completed = statuses.filter(status => status.isCompleted === true && typeof status.value === "string");
	return completed.find(status => status.value === preference) ?? completed[0] ?? null;
}
