import type { TaskStatus } from "./tasknotes/runtime-api.types";
import { DEFAULT_ROLLOVER_HOUR, isRolloverHour } from "./model/stagingDay";

/** Null is separate from every possible TaskNotes status string. */
export interface TimerPaneSettings { completionStatus: string | null; rolloverHour: number; }
export const DEFAULT_SETTINGS: TimerPaneSettings = { completionStatus: null, rolloverHour: DEFAULT_ROLLOVER_HOUR };

export function loadSettings(data: unknown): TimerPaneSettings {
	if (!data || typeof data !== "object" || Array.isArray(data)) return { ...DEFAULT_SETTINGS };
	const record = data as Record<string, unknown>;
	const value = record.completionStatus;
	const hour = record.rolloverHour;
	return {
		completionStatus: typeof value === "string" ? value : null,
		rolloverHour: isRolloverHour(hour) ? hour : DEFAULT_ROLLOVER_HOUR,
	};
}

export function resolveCompletionStatus(statuses: readonly TaskStatus[], preference: string | null): TaskStatus | null {
	const completed = statuses.filter(status => status.isCompleted === true && typeof status.value === "string");
	return completed.find(status => status.value === preference) ?? completed[0] ?? null;
}
