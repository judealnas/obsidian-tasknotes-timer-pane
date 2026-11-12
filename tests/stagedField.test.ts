// SETUP-01 / D-03: the staged field registration check, plus the fake gateway seam
// Phase 6 consumes it through.
import { describe, expect, test } from "vitest";
import { STAGED_FIELD_KEY, fieldStatus, type FieldStatus } from "../src/model/stagedField";
import { createFakeGateway } from "./fakes/fakeGateway";

describe("STAGED_FIELD_KEY (D-02)", () => {
	test("is the fixed key staged", () => {
		expect(STAGED_FIELD_KEY).toBe("staged");
	});
});

describe("fieldStatus (D-03)", () => {
	const cases: Array<[string, unknown, FieldStatus]> = [
		["null (a failed catalog read) is unknown", null, { kind: "unknown" }],
		["undefined is unknown", undefined, { kind: "unknown" }],
		["an object is unknown", {}, { kind: "unknown" }],
		["a string is unknown", "staged", { kind: "unknown" }],
		["a number is unknown", 42, { kind: "unknown" }],
		["an empty catalog is missing", [], { kind: "missing" }],
		["another field only is missing", [{ key: "spikedefault", type: "text", defaultValue: "x" }], { kind: "missing" }],
		["case differs: Staged is missing", [{ key: "Staged", type: "date" }], { kind: "missing" }],
		["leading space: ' staged' is missing", [{ key: " staged", type: "date" }], { kind: "missing" }],
		["staged as text is wrong-type text", [{ key: "staged", type: "text" }], { kind: "wrong-type", type: "text", hasDefault: false }],
		["staged with no type is wrong-type unknown", [{ key: "staged" }], { kind: "wrong-type", type: "unknown", hasDefault: false }],
		["staged with a non-string type is wrong-type unknown", [{ key: "staged", type: 7 }], { kind: "wrong-type", type: "unknown", hasDefault: false }],
		["malformed entries are skipped, not fatal", [null, 3, { key: 5 }, "staged", { key: "staged", type: "date" }], { kind: "ok", hasDefault: false }],
		["first match wins: text before date is wrong-type", [{ key: "staged", type: "text" }, { key: "staged", type: "date" }], { kind: "wrong-type", type: "text", hasDefault: false }],
		["first match wins: date before text is ok", [{ key: "staged", type: "date" }, { key: "staged", type: "text" }], { kind: "ok", hasDefault: false }],
		["the 4.13.8 shape is ok", [{ id: "field_1", displayName: "Staged", key: "staged", type: "date" }], { kind: "ok", hasDefault: false }],
		["a date default is hasDefault", [{ key: "staged", type: "date", defaultValue: "2026-01-01" }], { kind: "ok", hasDefault: true }],
		["an empty default is no default", [{ key: "staged", type: "date", defaultValue: "" }], { kind: "ok", hasDefault: false }],
		["a null default is no default", [{ key: "staged", type: "date", defaultValue: null }], { kind: "ok", hasDefault: false }],
		["a present-but-undefined default is no default (04-01 pin)", [{ key: "staged", type: "date", defaultValue: undefined }], { kind: "ok", hasDefault: false }],
		["wrong-type carries hasDefault", [{ key: "staged", type: "text", defaultValue: "x" }], { kind: "wrong-type", type: "text", hasDefault: true }],
	];

	test.each(cases)("%s", (_name, input, expected) => {
		expect(fieldStatus(input)).toEqual(expected);
	});

	test("never throws for any input in the table", () => {
		for (const [, input] of cases) expect(() => fieldStatus(input)).not.toThrow();
	});

	test("is stable for a given catalog", () => {
		const catalog = [{ key: "staged", type: "text" }, { key: "staged", type: "date" }];
		expect(fieldStatus(catalog)).toEqual(fieldStatus(structuredClone(catalog)));
	});
});

describe("fake gateway userFields (Phase 6 seam)", () => {
	test("setUserFields makes userFields() resolve a deep copy", async () => {
		const gateway = createFakeGateway();
		expect(typeof gateway.setUserFields).toBe("function");
		const fields = [{ id: "f1", displayName: "Staged", key: "staged", type: "date" }];
		gateway.setUserFields(fields);
		const first = await gateway.userFields();
		expect(first).toEqual(fields);
		first[0]!.type = "text";
		fields[0]!.key = "other";
		expect(fieldStatus(await gateway.userFields())).toEqual({ kind: "ok", hasDefault: false });
	});
	test("defaults to an empty catalog", async () => {
		await expect(createFakeGateway().userFields()).resolves.toEqual([]);
	});
	test("failUserFieldsWith makes userFields() reject; null restores success", async () => {
		const gateway = createFakeGateway();
		gateway.failUserFieldsWith(new Error("catalog broke"));
		await expect(gateway.userFields()).rejects.toThrow("catalog broke");
		gateway.failUserFieldsWith(null);
		await expect(gateway.userFields()).resolves.toEqual([]);
	});
});
