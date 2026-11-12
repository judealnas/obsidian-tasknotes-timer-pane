/*
 * The staging day (ROLL-01): what "today" means for the Staged list. Pure, with no
 * Obsidian and no clock reads: the caller passes the wall clock as `nowMs`. The result
 * is derived and never stored; it is recomputed from the clock and the rollover hour.
 *
 * DST safety: everything uses local getters and the local Date constructor. The
 * previous day is built as a new local date at noon, never by subtracting
 * milliseconds and never through a UTC or ISO-string method, so a 23- or 25-hour
 * day (or a missing local midnight) cannot move the result.
 */

/** The rollover hour used when none is configured or the stored one is invalid. */
export const DEFAULT_ROLLOVER_HOUR = 4;

/** Every valid rollover hour, 0..23. */
export const ROLLOVER_HOURS: readonly number[] = Object.freeze(Array.from({ length: 24 }, (_, i) => i));

/** True for an integer hour 0..23. */
export function isRolloverHour(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 23;
}

/** Fixed 12-hour label for a rollover hour (D-05): 0 is "12 AM", 13 is "1 PM". */
export function rolloverHourLabel(hour: number): string {
	if (!isRolloverHour(hour)) throw new RangeError("hour must be an integer 0..23");
	const twelve = hour % 12 === 0 ? 12 : hour % 12;
	return `${twelve} ${hour < 12 ? "AM" : "PM"}`;
}

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

/**
 * The local calendar date "YYYY-MM-DD" of `nowMs`, or the previous local calendar
 * date when the local hour is below `rolloverHour`. An invalid `rolloverHour` is
 * treated as DEFAULT_ROLLOVER_HOUR; a non-finite `nowMs` throws RangeError.
 */
export function stagingDay(nowMs: number, rolloverHour: number): string {
	if (!Number.isFinite(nowMs)) throw new RangeError("nowMs must be a finite number");
	const hour = isRolloverHour(rolloverHour) ? rolloverHour : DEFAULT_ROLLOVER_HOUR;
	let day = new Date(nowMs);
	if (day.getHours() < hour) {
		day = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, 12);
	}
	return `${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())}`;
}
