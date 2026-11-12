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

// tsconfig sets `types: []` so Node globals stay out of src/. This file-local
// declaration types the one Node global the zone switch needs.
declare const process: { env: Record<string, string | undefined> };

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

/** Offset in minutes of a local wall-clock instant in the current zone. */
function offsetAt(y: number, m: number, d: number, h: number, min = 0): number {
	return new Date(y, m, d, h, min).getTimezoneOffset();
}

/** [label, y, m (0-based), d, h, min, s, ms, rolloverHour, expected] */
type Row = [string, number, number, number, number, number, number, number, number, string];

function cases(rows: Row[]): void {
	test.each(rows)("%s", (_label, y, m, d, h, min, s, ms, rolloverHour, expected) => {
		expect(stagingDay(local(y, m, d, h, min, s, ms), rolloverHour)).toBe(expected);
	});
}

inZone("UTC", () => {
	test("sentinel: the zone switched (offset 0 in January)", () => {
		expect(new Date(Date.UTC(2026, 0, 15)).getTimezoneOffset()).toBe(0);
		expect(new Date(Date.UTC(2026, 6, 15)).getTimezoneOffset()).toBe(0);
	});

	cases([
		["01:30 is the previous day", 2026, 0, 15, 1, 30, 0, 0, 4, "2026-01-14"],
		["04:00 is the same day", 2026, 0, 15, 4, 0, 0, 0, 4, "2026-01-15"],
	]);
});

inZone("America/New_York", () => {
	test("sentinel: offset 300 in January and 240 in July", () => {
		expect(new Date(Date.UTC(2026, 0, 15)).getTimezoneOffset()).toBe(300);
		expect(new Date(Date.UTC(2026, 6, 15)).getTimezoneOffset()).toBe(240);
	});

	test("sentinel: spring-forward on 2026-03-08 exists in the tz data", () => {
		expect(offsetAt(2026, 2, 8, 1, 0)).toBe(300);
		expect(offsetAt(2026, 2, 8, 4, 0)).toBe(240);
	});

	test("sentinel: fall-back on 2026-11-01 exists in the tz data", () => {
		expect(offsetAt(2026, 10, 1, 0, 30)).toBe(240);
		expect(offsetAt(2026, 10, 1, 4, 0)).toBe(300);
	});

	// Spring-forward (a 23-hour day). A millisecond-subtraction implementation
	// (localDate(now - 4h)) gives "2026-03-07" at 04:00, because only 3 hours have
	// elapsed since midnight, so the day would roll at 05:00 instead of 04:00.
	cases([
		["spring-forward 03:30 is the previous day", 2026, 2, 8, 3, 30, 0, 0, 4, "2026-03-07"],
		["spring-forward 04:00 is the new day", 2026, 2, 8, 4, 0, 0, 0, 4, "2026-03-08"],
		["spring-forward 01:59 with rollover 2 is the previous day", 2026, 2, 8, 1, 59, 0, 0, 2, "2026-03-07"],
		["spring-forward 03:00 with rollover 2 is the new day", 2026, 2, 8, 3, 0, 0, 0, 2, "2026-03-08"],
	]);

	// Fall-back (a 25-hour day). A millisecond-subtraction implementation gives
	// "2026-11-01" at 03:30, because 4.5 hours have elapsed since midnight, so the
	// day would roll at 03:00 instead of 04:00.
	cases([
		["fall-back 01:30 is the previous day", 2026, 10, 1, 1, 30, 0, 0, 4, "2026-10-31"],
		["fall-back 03:30 is the previous day", 2026, 10, 1, 3, 30, 0, 0, 4, "2026-10-31"],
		["fall-back 04:00 is the new day", 2026, 10, 1, 4, 0, 0, 0, 4, "2026-11-01"],
	]);

	// Adjacency at the rollover edge.
	cases([
		["03:59:59.999 with rollover 4 is the previous day", 2026, 10, 12, 3, 59, 59, 999, 4, "2026-11-11"],
		["04:00:00.000 with rollover 4 is the new day", 2026, 10, 12, 4, 0, 0, 0, 4, "2026-11-12"],
		["00:00:00.000 with rollover 0 is the same day", 2026, 10, 12, 0, 0, 0, 0, 0, "2026-11-12"],
		["23:59:59.999 with rollover 0 is the same day", 2026, 10, 12, 23, 59, 59, 999, 0, "2026-11-12"],
		["22:59:59.999 with rollover 23 is the previous day", 2026, 10, 12, 22, 59, 59, 999, 23, "2026-11-11"],
		["23:00:00.000 with rollover 23 is the same day", 2026, 10, 12, 23, 0, 0, 0, 23, "2026-11-12"],
	]);

	// Calendar boundaries.
	cases([
		["2027-01-01 01:30 is the last day of 2026", 2027, 0, 1, 1, 30, 0, 0, 4, "2026-12-31"],
		["2026-03-01 01:30 is 2026-02-28", 2026, 2, 1, 1, 30, 0, 0, 4, "2026-02-28"],
		["2028-03-01 01:30 is the leap day 2028-02-29", 2028, 2, 1, 1, 30, 0, 0, 4, "2028-02-29"],
	]);

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

inZone("Pacific/Auckland", () => {
	test("sentinel: offset -780 in January and -720 in July", () => {
		expect(new Date(Date.UTC(2026, 0, 15)).getTimezoneOffset()).toBe(-780);
		expect(new Date(Date.UTC(2026, 6, 15)).getTimezoneOffset()).toBe(-720);
	});

	test("sentinel: DST starts on 2026-09-27 and ends on 2026-04-05 in the tz data", () => {
		expect(offsetAt(2026, 8, 27, 1, 0)).toBe(-720);
		expect(offsetAt(2026, 8, 27, 4, 0)).toBe(-780);
		expect(offsetAt(2026, 3, 5, 1, 0)).toBe(-780);
		expect(offsetAt(2026, 3, 5, 4, 0)).toBe(-720);
	});

	cases([
		["DST-start 03:30 is the previous day", 2026, 8, 27, 3, 30, 0, 0, 4, "2026-09-26"],
		["DST-start 04:00 is the new day", 2026, 8, 27, 4, 0, 0, 0, 4, "2026-09-27"],
		["DST-end 03:30 is the previous day", 2026, 3, 5, 3, 30, 0, 0, 4, "2026-04-04"],
		["DST-end 04:00 is the new day", 2026, 3, 5, 4, 0, 0, 0, 4, "2026-04-05"],
	]);
});

inZone("Asia/Kolkata", () => {
	test("sentinel: offset -330 (half-hour zone)", () => {
		expect(new Date(Date.UTC(2026, 0, 15)).getTimezoneOffset()).toBe(-330);
		expect(new Date(Date.UTC(2026, 6, 15)).getTimezoneOffset()).toBe(-330);
	});

	cases([
		["04:00 is the same day", 2026, 10, 12, 4, 0, 0, 0, 4, "2026-11-12"],
		["01:30 is the previous day", 2026, 10, 12, 1, 30, 0, 0, 4, "2026-11-11"],
	]);
});

inZone("America/Santiago", () => {
	test("sentinel: offset 180 in January and 240 in July", () => {
		expect(new Date(Date.UTC(2026, 0, 15)).getTimezoneOffset()).toBe(180);
		expect(new Date(Date.UTC(2026, 6, 15)).getTimezoneOffset()).toBe(240);
	});

	test("sentinel: DST starts at local midnight on 2026-09-06 in the tz data", () => {
		expect(offsetAt(2026, 8, 5, 12, 0)).toBe(240);
		expect(offsetAt(2026, 8, 6, 12, 0)).toBe(180);
		// 00:00 does not exist that night: the local constructor moves it to 01:00.
		expect(new Date(2026, 8, 6, 0, 0).getHours()).toBe(1);
	});

	cases([
		["2026-09-06 01:30 with rollover 4 is the previous day", 2026, 8, 6, 1, 30, 0, 0, 4, "2026-09-05"],
		["first existing instant of 2026-09-06 with rollover 0 is that day", 2026, 8, 6, 0, 0, 0, 0, 0, "2026-09-06"],
		["2026-09-05 23:59 with rollover 0 is that day", 2026, 8, 5, 23, 59, 0, 0, 0, "2026-09-05"],
	]);
});

describe("rolloverHourLabel", () => {
	test("maps 0..23 to fixed 12-hour labels", () => {
		expect(ROLLOVER_HOURS.map(rolloverHourLabel)).toEqual([
			"12 AM", "1 AM", "2 AM", "3 AM", "4 AM", "5 AM", "6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM",
			"12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM", "9 PM", "10 PM", "11 PM",
		]);
	});

	test.each([24, -1, 3.5])("throws RangeError for %s", (hour) => {
		expect(() => rolloverHourLabel(hour)).toThrow(RangeError);
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
