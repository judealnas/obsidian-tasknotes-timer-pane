/*
 * The one serial queue for every pane write. Plugin-scoped: main.ts creates exactly
 * one, and every write (Stop now, start and switch in Phase 2) runs through it, so
 * two pane writes never overlap even across different tasks (TaskNotes only locks
 * per path). Runtime Obsidian-free so Vitest can load it.
 */
export class WriteQueue {
	/** Settles when the last queued task settles. Never rejects, so the chain never breaks. */
	private tail: Promise<void> = Promise.resolve();

	/**
	 * Runs `task` after every previously queued task has settled, resolved or
	 * rejected. The caller gets this task's own result or rejection.
	 */
	run<T>(task: () => Promise<T>): Promise<T> {
		const result = this.tail.then(task);
		this.tail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}
}
