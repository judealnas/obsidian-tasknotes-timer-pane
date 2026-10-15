/*
 * Vendored, trimmed, type-only subset of callumalpass/tasknotes src/api/runtime-api.ts @ 451679289d94 (v4.13.8, MIT). Do not import TaskNotes source.
 *
 * Only the namespaces and members this plugin uses are kept (see COVERAGE.md).
 * The settings and model namespaces are deliberately left out: the pane reads no
 * TaskNotes settings (D-05). This module declares types only and emits no runtime
 * code. tests/contract.test.ts pins every shape below.
 */
import type { EventRef } from "obsidian";

/** One time-tracking entry in a task's frontmatter. An open entry has no endTime. */
export interface TimeEntry {
	startTime: string;
	endTime?: string;
	description?: string;
	duration?: number;
}

/** The TaskInfo fields this plugin reads (or that test fakes set). */
export interface TaskInfo {
	title: string;
	status: string;
	path: string;
	archived: boolean;
	timeEstimate?: number;
	timeEntries?: TimeEntry[];
}

/** One open time entry, as returned by `time.active()`. */
export interface ActiveTimeEntry {
	taskPath: string;
	task: TaskInfo;
	entry: TimeEntry;
	index: number;
}

/** Attached to TaskNotes' emitted events so a caller can recognise its own writes. */
export interface TaskNotesMutationContext {
	source?: string;
	correlationId?: string;
	reason?: string;
}

/**
 * Normalized error payload from `errors.normalize`. TaskNotes types `code` as a
 * union ("invalid_input", "invalid_task_path", "task_not_found", ..., "operation_failed");
 * it is widened to string here because the vendored quote of that union is partial.
 */
export interface TaskNotesApiErrorPayload {
	name: "TaskNotesApiError";
	code: string;
	message: string;
	status: number;
	details?: unknown;
}

export type TaskNotesRuntimeLifecycleEventName =
	| "ready"
	| "layout.ready"
	| "settings.changed"
	| "cache.changed"
	| "cache.rebuilt"
	| "extension.registered"
	| "extension.unregistered"
	| "unloading";

export type TaskNotesRuntimeTaskEventName = "task.updated" | "task.deleted";

/** Payload passed to `lifecycle.on` handlers (the settings field is omitted). */
export interface TaskNotesRuntimeLifecyclePayload {
	event: TaskNotesRuntimeLifecycleEventName;
	timestamp: string;
	data?: unknown;
	rawEvent: string;
}

/**
 * Options for `ui.taskMenu.show`. Trimmed from upstream
 * TaskNotesRuntimeTaskMenuShowOptions: `targetDate`, `onUpdate` and
 * `promoteOccurrenceControls` are left out.
 */
export interface TaskNotesRuntimeTaskMenuShowOptions {
	taskPath: string;
	event: MouseEvent;
}

/** The TaskNotes Runtime API v1 surface this plugin uses: `app.plugins.getPlugin("tasknotes").api`. */
export interface TaskNotesRuntimeApiV1 {
	readonly apiVersion: 1;
	readonly capabilities: readonly string[];
	hasCapability(capability: string): boolean;

	readonly time: {
		active(): Promise<ActiveTimeEntry[]>;
		stop(path: string, context?: TaskNotesMutationContext): Promise<TaskInfo>;
	};

	readonly events: {
		/** The payload is left as unknown: the pane only re-derives from `time.active()`. */
		on(event: TaskNotesRuntimeTaskEventName, handler: (payload: unknown) => void): EventRef;
		off(ref: EventRef): void;
	};

	readonly lifecycle: {
		ready(): Promise<void>;
		isReady(): boolean;
		on(
			event: TaskNotesRuntimeLifecycleEventName,
			handler: (payload: TaskNotesRuntimeLifecyclePayload) => void,
		): EventRef;
		off(ref: EventRef): void;
	};

	readonly errors: {
		normalize(error: unknown): TaskNotesApiErrorPayload;
	};

	/**
	 * TaskNotes' own UI. Absent before TaskNotes 4.11, so it is optional here; gate
	 * every call on the `ui.task-menu` capability. Only `taskMenu.show` is vendored:
	 * `showAtElement` and `populate` are not used.
	 */
	readonly ui?: {
		readonly taskMenu: {
			show(options: TaskNotesRuntimeTaskMenuShowOptions): Promise<void>;
		};
	};
}
