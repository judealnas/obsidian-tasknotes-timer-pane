/*
 * RED skeleton (04-04 Task 1): the real check lands in the GREEN commit.
 */

export const STAGED_FIELD_KEY = "staged";

export type FieldStatus =
	| { kind: "unknown" }
	| { kind: "missing" }
	| { kind: "wrong-type"; type: string; hasDefault: boolean }
	| { kind: "ok"; hasDefault: boolean };

export function fieldStatus(_userFields: unknown): FieldStatus {
	return { kind: "unknown" };
}
