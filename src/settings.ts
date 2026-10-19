import type { TaskStatus } from "./tasknotes/runtime-api.types";

/** Null is separate from every possible TaskNotes status string. */
export interface TimerPaneSettings { completionStatus: string | null; }
export const DEFAULT_SETTINGS: TimerPaneSettings = { completionStatus: null };

export function loadSettings(data: unknown): TimerPaneSettings {
	if (!data || typeof data !== "object" || Array.isArray(data)) return { ...DEFAULT_SETTINGS };
	const value = (data as Record<string, unknown>).completionStatus;
	return { completionStatus: typeof value === "string" ? value : null };
}

export function resolveCompletionStatus(statuses: readonly TaskStatus[], preference: string | null): TaskStatus | null {
	const completed = statuses.filter(status => status.isCompleted === true && typeof status.value === "string");
	return completed.find(status => status.value === preference) ?? completed[0] ?? null;
}
