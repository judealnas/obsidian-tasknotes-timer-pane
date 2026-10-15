/*
 * Error classification and user-facing error copy for pane writes. Pure, runtime
 * Obsidian-free, so Vitest can load it.
 */

/**
 * TaskService throws a plain Error with this text when the task has no open entry,
 * so the error code cannot tell this case apart (RESEARCH Pitfall 3). For a Stop it
 * is a benign race: the timer already stopped somewhere else.
 */
const NO_ACTIVE_SESSION = /no active time tracking session/i;

export function isNoActiveSessionError(message: string): boolean {
	return NO_ACTIVE_SESSION.test(message);
}

/** An Error gives its message, a string gives itself, anything else gives "". */
export function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "";
}

/** The Stop-failed Notice (01-UI-SPEC Copywriting Contract, "Error state"). */
export function stopFailedNotice(title: string, reason: string): string {
	const trimmed = reason.trim().replace(/\.+$/, "").trim();
	const r = trimmed === "" ? "TaskNotes reported an error" : trimmed;
	return `Couldn't stop the timer for "${title}": ${r}. Try again, or stop it from the TaskNotes status bar.`;
}
