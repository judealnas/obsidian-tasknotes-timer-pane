/*
 * RED scaffold: signatures only, so the stagingDay tests load and fail on their
 * assertions rather than on a missing module. Replaced by the implementation in GREEN.
 */
export const DEFAULT_ROLLOVER_HOUR = 4;
export const ROLLOVER_HOURS: readonly number[] = [];

export function isRolloverHour(_value: unknown): _value is number {
	return false;
}

export function rolloverHourLabel(_hour: number): string {
	return "";
}

export function stagingDay(_nowMs: number, _rolloverHour: number): string {
	return "";
}
