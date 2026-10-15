// Shared in-memory TaskNotes plugin + Runtime API v1 for the phase's tests.
// Every namespace is typed against the vendored TaskNotesRuntimeApiV1, so a contract
// change breaks the fake at compile time instead of silently drifting.
import type { EventRef } from "obsidian";
import type { Schedule, TaskNotesPluginLike } from "../../src/tasknotes/TaskNotesBridge";
import type {
	ActiveTimeEntry,
	TaskInfo,
	TaskNotesApiErrorPayload,
	TaskNotesMutationContext,
	TaskNotesRuntimeApiV1,
	TaskNotesRuntimeLifecycleEventName,
	TaskNotesRuntimeLifecyclePayload,
	TaskNotesRuntimeTaskEventName,
	TimeEntry,
} from "../../src/tasknotes/runtime-api.types";

/** The verbatim TaskService error when a task has no open entry. */
export const NO_ACTIVE_SESSION_MESSAGE = "No active time tracking session for this task";

export const DEFAULT_CAPABILITIES: readonly string[] = [
	"time.read",
	"time.write",
	"tasks.events",
	"lifecycle.events",
	"errors.typed",
];

export interface FakeTaskNotesOptions {
	version?: string;
	apiVersion?: number;
	capabilities?: readonly string[];
	ready?: boolean;
	active?: ActiveTimeEntry[];
}

export interface StopCall {
	path: string;
	context?: TaskNotesMutationContext;
}

export interface FakeTaskNotes {
	/** What `app.plugins.getPlugin("tasknotes")` would return. */
	plugin: TaskNotesPluginLike & { api: TaskNotesRuntimeApiV1 };
	api: TaskNotesRuntimeApiV1;
	/** Number of `time.active()` calls so far. */
	readonly activeCalls: number;
	readonly stopCalls: StopCall[];
	setReady(ready: boolean): void;
	setActive(entries: ActiveTimeEntry[]): void;
	emitLifecycle(name: TaskNotesRuntimeLifecycleEventName): void;
	emitTaskEvent(name: TaskNotesRuntimeTaskEventName): void;
	handlerCount(name: TaskNotesRuntimeLifecycleEventName | TaskNotesRuntimeTaskEventName): number;
	totalHandlers(): number;
	/** Makes every later `time.stop` throw `new Error(message)`; null restores normal behavior. */
	failStopWith(message: string | null): void;
}

interface LifecycleRef extends EventRef {
	name: TaskNotesRuntimeLifecycleEventName;
	handler: (payload: TaskNotesRuntimeLifecyclePayload) => void;
}

interface TaskRef extends EventRef {
	name: TaskNotesRuntimeTaskEventName;
	handler: (payload: unknown) => void;
}

function removeRef<T>(list: T[], ref: unknown): void {
	const index = list.indexOf(ref as T);
	if (index >= 0) list.splice(index, 1);
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function createFakeTaskNotes(options: FakeTaskNotesOptions = {}): FakeTaskNotes {
	const capabilities = [...(options.capabilities ?? DEFAULT_CAPABILITIES)];
	const apiVersion = options.apiVersion ?? 1;
	let ready = options.ready ?? true;
	let fixture: ActiveTimeEntry[] = options.active ?? [];
	let activeCalls = 0;
	let stopFailure: string | null = null;
	const stopCalls: StopCall[] = [];
	const lifecycleRefs: LifecycleRef[] = [];
	const taskRefs: TaskRef[] = [];

	const time: TaskNotesRuntimeApiV1["time"] = {
		active() {
			activeCalls++;
			return Promise.resolve(structuredClone(fixture.filter((item) => !item.entry.endTime)));
		},
		stop(path: string, context?: TaskNotesMutationContext): Promise<TaskInfo> {
			stopCalls.push(context === undefined ? { path } : { path, context });
			if (stopFailure !== null) return Promise.reject(new Error(stopFailure));
			const items = fixture.filter((item) => item.taskPath === path);
			const task = items[0]?.task;
			const open = task?.timeEntries?.find((entry) => !entry.endTime);
			if (!task || !open) return Promise.reject(new Error(NO_ACTIVE_SESSION_MESSAGE));
			const endTime = new Date().toISOString();
			open.endTime = endTime;
			// Keep the active() view consistent when `entry` is a copy rather than the same object.
			for (const item of items) {
				if (item.entry.startTime === open.startTime && !item.entry.endTime) item.entry.endTime = endTime;
			}
			return Promise.resolve(structuredClone(task));
		},
	};

	const events: TaskNotesRuntimeApiV1["events"] = {
		on(name, handler) {
			const ref: TaskRef = { name, handler };
			taskRefs.push(ref);
			return ref;
		},
		off(ref) {
			removeRef(taskRefs, ref);
		},
	};

	const lifecycle: TaskNotesRuntimeApiV1["lifecycle"] = {
		ready: () => Promise.resolve(),
		isReady: () => ready,
		on(name, handler) {
			const ref: LifecycleRef = { name, handler };
			lifecycleRefs.push(ref);
			return ref;
		},
		off(ref) {
			removeRef(lifecycleRefs, ref);
		},
	};

	const errors: TaskNotesRuntimeApiV1["errors"] = {
		normalize(error: unknown): TaskNotesApiErrorPayload {
			return { name: "TaskNotesApiError", code: "operation_failed", message: messageOf(error), status: 500 };
		},
	};

	const api: TaskNotesRuntimeApiV1 = {
		// The option lets tests fake a future apiVersion; the contract type pins the literal 1.
		apiVersion: apiVersion as 1,
		capabilities,
		hasCapability: (capability: string) => capabilities.includes(capability),
		time,
		events,
		lifecycle,
		errors,
	};

	return {
		plugin: { manifest: { version: options.version ?? "4.13.8" }, api },
		api,
		get activeCalls() {
			return activeCalls;
		},
		stopCalls,
		setReady(next) {
			ready = next;
		},
		setActive(entries) {
			fixture = entries;
		},
		emitLifecycle(name) {
			const payload: TaskNotesRuntimeLifecyclePayload = {
				event: name,
				timestamp: new Date().toISOString(),
				rawEvent: name,
			};
			for (const ref of [...lifecycleRefs]) if (ref.name === name) ref.handler(payload);
		},
		emitTaskEvent(name) {
			for (const ref of [...taskRefs]) if (ref.name === name) ref.handler({ event: name });
		},
		handlerCount(name) {
			return (
				lifecycleRefs.filter((ref) => ref.name === name).length +
				taskRefs.filter((ref) => ref.name === name).length
			);
		},
		totalHandlers() {
			return lifecycleRefs.length + taskRefs.length;
		},
		failStopWith(message) {
			stopFailure = message;
		},
	};
}

export interface MakeActiveEntryInput {
	taskPath: string;
	startTime: string;
	title?: string;
	status?: string;
	archived?: boolean;
	timeEntries?: TimeEntry[];
}

/**
 * One open entry as `time.active()` returns it, with real TaskInfo fields. `status`
 * defaults to "open" and `archived` to false. The open entry is shared by reference
 * with `task.timeEntries`; it is appended when the given entries do not contain it.
 */
export function makeActiveEntry(input: MakeActiveEntryInput): ActiveTimeEntry {
	const timeEntries = input.timeEntries ? [...input.timeEntries] : [];
	let entry = timeEntries.find((candidate) => candidate.startTime === input.startTime && !candidate.endTime);
	if (!entry) {
		entry = { startTime: input.startTime };
		timeEntries.push(entry);
	}
	return {
		taskPath: input.taskPath,
		index: timeEntries.indexOf(entry),
		entry,
		task: {
			title: input.title ?? input.taskPath,
			status: input.status ?? "open",
			path: input.taskPath,
			archived: input.archived ?? false,
			timeEntries,
		},
	};
}

/**
 * A Schedule on the global timers, so Vitest fake timers control it. Tests run in
 * Node, where there is no `window` (production code uses window.setTimeout). The
 * globals are read at call time so timers faked in beforeEach apply.
 */
export const timerSchedule: Schedule = (fn, ms) => {
	const timers = { setTimeout, clearTimeout };
	const id = timers.setTimeout(fn, ms);
	return () => timers.clearTimeout(id);
};
