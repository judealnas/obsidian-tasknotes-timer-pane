/*
 * Pane-local card order: pure helpers, no obsidian import. The saved order is a list of
 * card (session) keys. It never reaches TaskNotes.
 */

/** Upper bound on saved keys read from data.json (T-quick-01). */
export const MAX_STORED_ORDER = 1000;

/**
 * Live items in display order: items with no saved key first (new timers at the top, in
 * their incoming order), then the rest in saved order. Saved keys with no live item are
 * ignored. Returns a new array.
 */
export function orderTimers<T extends { sessionKey: string }>(timers: readonly T[], saved: readonly string[]): T[] {
	if (saved.length === 0) return [...timers];
	const rank = new Map<string, number>();
	for (const key of saved) if (!rank.has(key)) rank.set(key, rank.size);
	const fresh: T[] = [];
	const known: T[] = [];
	for (const timer of timers) (rank.has(timer.sessionKey) ? known : fresh).push(timer);
	// Stable sort keeps the incoming order of equal ranks (duplicate live keys).
	known.sort((a, b) => (rank.get(a.sessionKey) ?? 0) - (rank.get(b.sessionKey) ?? 0));
	return [...fresh, ...known];
}

/** Moves `dragKey` immediately before (or after) `targetKey`. An unchanged copy when nothing can move. */
export function moveKey(order: readonly string[], dragKey: string, targetKey: string, after: boolean): string[] {
	if (dragKey === targetKey || !order.includes(dragKey) || !order.includes(targetKey)) return [...order];
	const rest = order.filter(key => key !== dragKey);
	const at = rest.indexOf(targetKey) + (after ? 1 : 0);
	rest.splice(at, 0, dragKey);
	return rest;
}

/** Moves `key` by `delta` places, clamped to the ends. An unchanged copy when nothing can move. */
export function moveKeyBy(order: readonly string[], key: string, delta: number): string[] {
	const from = order.indexOf(key);
	if (from < 0 || delta === 0) return [...order];
	const rest = order.filter(candidate => candidate !== key);
	const to = Math.max(0, Math.min(rest.length, from + delta));
	rest.splice(to, 0, key);
	return rest;
}

/** The saved order from untrusted data.json. Never throws; anything unusable gives []. */
export function loadCardOrder(data: unknown): string[] {
	if (typeof data !== "object" || data === null || Array.isArray(data)) return [];
	const raw = (data as { cardOrder?: unknown }).cardOrder;
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	for (const item of (raw as unknown[]).slice(0, MAX_STORED_ORDER)) {
		if (typeof item === "string" && item !== "") seen.add(item);
	}
	return [...seen];
}
