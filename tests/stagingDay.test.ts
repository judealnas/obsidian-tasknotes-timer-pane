// Pure tests for the staging-day rule (ROLL-01). Each zone block switches
// process.env.TZ at runtime and starts with a sentinel offset assertion, so a zone
// switch that silently did not happen fails the suite. Instants are built inside test
// bodies (after beforeAll), because the local Date constructor reads the zone when it runs.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
	DEFAULT_ROLLOVER_HOUR,
	ROLLOVER_HOURS,
	isRolloverHour,
	rolloverHourLabel,
	stagingDay,
} from "../src/model/stagingDay";

function inZone(zone: string, fn: () => void): void {
	describe(`in ${zone}`, () => {
		let original: string | undefined;
		beforeAll(() => {
			original = process.env.TZ;
			process.env.TZ = zone;
		});
		afterAll(() => {
			if (original === undefined) delete process.env.TZ;
			else process.env.TZ = original;
		});
		fn();
	});
}

/** Local wall-clock instant in the current zone, in ms. */
function local(y: number, m: number, d: number, h: number, min = 0, s = 0, ms = 0): number {
	return new Date(y, m, d, h, min, s, ms).getTime();
}

inZone("America/New_York", () => {
	test("sentinel: the zone switched (offset 300 in January)", () => {
		expect(new Date(Date.UTC(2026, 0, 15)).getTimezoneOffset()).toBe(300);
	});

	test("1:30 AM is the previous staging day with rollover hour 4", () => {
		expect(stagingDay(local(2026, 10, 12, 1, 30), 4)).toBe("2026-11-11");
	});

	test("4:00 AM is the new staging day", () => {
		expect(stagingDay(local(2026, 10, 12, 4, 0), 4)).toBe("2026-11-12");
	});

	test("noon is the same calendar day", () => {
		expect(stagingDay(local(2026, 10, 12, 12, 0), 4)).toBe("2026-11-12");
	});

	test.each([24, -1, 3.5])("an invalid rollover hour %s behaves as the default", (hour) => {
		for (const h of [1, 3, 4, 12]) {
			const now = local(2026, 10, 12, h, 30);
			expect(stagingDay(now, hour)).toBe(stagingDay(now, DEFAULT_ROLLOVER_HOUR));
		}
		expect(stagingDay(local(2026, 10, 12, 1, 30), hour)).toBe("2026-11-11");
	});

	test.each([Number.NaN, Infinity, -Infinity])("a non-finite nowMs %s throws RangeError", (now) => {
		expect(() => stagingDay(now, 4)).toThrow(RangeError);
	});
});

describe("isRolloverHour", () => {
	test("DEFAULT_ROLLOVER_HOUR is 4", () => {
		expect(DEFAULT_ROLLOVER_HOUR).toBe(4);
	});

	test.each([0, 4, 23])("accepts %s", (value) => {
		expect(isRolloverHour(value)).toBe(true);
	});

	test.each([24, -1, 3.5, Number.NaN, Infinity, "4", null, undefined, true])("rejects %s", (value) => {
		expect(isRolloverHour(value)).toBe(false);
	});

	test("ROLLOVER_HOURS is 0..23", () => {
		expect(ROLLOVER_HOURS).toEqual(Array.from({ length: 24 }, (_, i) => i));
		expect(typeof rolloverHourLabel).toBe("function");
	});
});
