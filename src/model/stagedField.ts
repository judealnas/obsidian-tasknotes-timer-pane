/*
 * The staged frontmatter key and the check that TaskNotes has it registered as a
 * date user field (SETUP-01, D-02, D-03). Pure, with no Obsidian and no TaskNotes
 * calls: the caller passes what `catalog.userFields()` returned, or null when that
 * read failed.
 *
 * The key is fixed by the Phase 4 discussion (D-02): it is not a setting, and every
 * consumer reads STAGED_FIELD_KEY instead of spelling the key itself.
 */

/** The frontmatter key the Staged list reads and writes. */
export const STAGED_FIELD_KEY = "staged";

/**
 * unknown: the catalog could not be read (or was not a list).
 * missing: no user field has the key exactly.
 * wrong-type / ok: the first user field with the key, by its type.
 * hasDefault: that field has a non-empty default value.
 */
export type FieldStatus =
	| { kind: "unknown" }
	| { kind: "missing" }
	| { kind: "wrong-type"; type: string; hasDefault: boolean }
	| { kind: "ok"; hasDefault: boolean };

/**
 * Whether the staged key is registered as a date user field. Never throws: entries
 * that are not objects or whose key is not a string are skipped, matching is exact
 * and case-sensitive, and the first match in catalog order decides.
 */
export function fieldStatus(userFields: unknown): FieldStatus {
	if (!Array.isArray(userFields)) return { kind: "unknown" };
	for (const entry of userFields as unknown[]) {
		if (typeof entry !== "object" || entry === null) continue;
		const field = entry as { key?: unknown; type?: unknown; defaultValue?: unknown };
		if (typeof field.key !== "string" || field.key !== STAGED_FIELD_KEY) continue;
		// TaskNotes keeps the defaultValue key with value undefined when no default is set (04-01 pin).
		const hasDefault = field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== "";
		if (field.type === "date") return { kind: "ok", hasDefault };
		return { kind: "wrong-type", type: typeof field.type === "string" ? field.type : "unknown", hasDefault };
	}
	return { kind: "missing" };
}
