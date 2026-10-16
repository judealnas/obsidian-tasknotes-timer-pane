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
 TaskNotesRuntimeEventName,
 TaskStatus,
 PomodoroState,
	TimeEntry,
} from "../../src/tasknotes/runtime-api.types";

/** The verbatim TaskService error when a task has no open entry. */
export const NO_ACTIVE_SESSION_MESSAGE = "No active time tracking session for this task";

export const DEFAULT_CAPABILITIES: readonly string[] = [
	"tasks.read",
	"catalog.read",
 "tasks.write",
 "pomodoro.read",
 "pomodoro.events",
	"time.read",
	"time.write",
	"tasks.events",
	"lifecycle.events",
	"errors.typed",
	"ui.task-menu",
];

export interface FakeTaskNotesOptions {
	version?: string;
	apiVersion?: number;
	capabilities?: readonly string[];
	ready?: boolean;
	active?: ActiveTimeEntry[];
 tasks?: TaskInfo[];
 statuses?: TaskStatus[];
 pomodoro?: PomodoroState;
 omitMethods?: Array<"tasks.list" | "tasks.get" | "tasks.complete" | "catalog.statuses" | "time.start" | "pomodoro.status">;
	/** False builds an api with no `ui` namespace, like TaskNotes 4.10. Default true. */
	ui?: boolean;
}

export interface StopCall {
	path: string;
	context?: TaskNotesMutationContext;
}

export interface MenuCall {
	taskPath: string;
	event: MouseEvent;
}

export interface FakeTaskNotes {
	/** What `app.plugins.getPlugin("tasknotes")` would return. */
	plugin: TaskNotesPluginLike & { api: TaskNotesRuntimeApiV1 };
	api: TaskNotesRuntimeApiV1;
	/** Number of `time.active()` calls so far. */
	readonly activeCalls: number;
	readonly stopCalls: StopCall[];
	readonly startCalls: Array<{ path: string; options: Record<string, never>; context?: TaskNotesMutationContext }>;
	setReady(ready: boolean): void;
 setTasks(tasks: TaskInfo[]): void;
 setStatuses(statuses: TaskStatus[]): void;
 setPomodoro(state: PomodoroState): void;
 failReadWith(error: string | null): void;
 failStartWith(error: string | null): void;
 failCompleteWith(error: string | null): void;
 readonly completeCalls: Array<{path: string; status: string | undefined; context?: TaskNotesMutationContext}>;
	setActive(entries: ActiveTimeEntry[]): void;
	emitLifecycle(name: TaskNotesRuntimeLifecycleEventName): void;
	emitTaskEvent(name: TaskNotesRuntimeEventName): void;
	handlerCount(name: TaskNotesRuntimeLifecycleEventName | TaskNotesRuntimeEventName): number;
	totalHandlers(): number;
	/** Makes every later `time.stop` throw `new Error(message)`; null restores normal behavior. */
	failStopWith(message: string | null): void;
	/** Every `ui.taskMenu.show` call so far, in order. */
	readonly menuCalls: MenuCall[];
	/** Makes every later `ui.taskMenu.show` reject with `new Error(message)`; null restores success. */
	failMenuWith(message: string | null): void;
}

interface LifecycleRef extends EventRef {
	name: TaskNotesRuntimeLifecycleEventName;
	handler: (payload: TaskNotesRuntimeLifecyclePayload) => void;
}

interface TaskRef extends EventRef {
	name: TaskNotesRuntimeEventName;
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
 let tasks = options.tasks ?? fixture.map(item => item.task);
 let statuses: TaskStatus[] = options.statuses ?? [{ value: "done", isCompleted: true }];
 let pomodoro: PomodoroState = options.pomodoro ?? { isRunning: false, timeRemaining: 0 };
 let readFailure: string | null = null;
 let startFailure: string | null = null;
 let completeFailure: string | null = null;
 const completeCalls: FakeTaskNotes["completeCalls"] = [];
	let stopFailure: string | null = null;
	const stopCalls: StopCall[] = [];
	const startCalls: Array<{ path: string; options: Record<string, never>; context?: TaskNotesMutationContext }> = [];
	let menuFailure: string | null = null;
	const menuCalls: MenuCall[] = [];
	const lifecycleRefs: LifecycleRef[] = [];
	const taskRefs: TaskRef[] = [];

	const time: TaskNotesRuntimeApiV1["time"] = {
		start(path, options, context) {
			startCalls.push({ path, options, ...(context ? { context } : {}) });
   if (startFailure !== null) return Promise.reject(new Error(startFailure));
			if (fixture.some(item => item.taskPath === path && !item.entry.endTime)) return Promise.reject(new Error("Task is already being timed"));
			const known = tasks.find(task => task.path === path);
			// A restart on the same task keeps its earlier (closed) entries, as TaskNotes does.
			const previous = fixture.filter(item => item.taskPath === path);
			const priorEntries = structuredClone(previous[previous.length - 1]?.task.timeEntries ?? known?.timeEntries ?? []);
			fixture = fixture.filter(item => item.taskPath !== path);
   const item = makeActiveEntry({ taskPath: path, startTime: new Date().toISOString(), timeEntries: priorEntries, ...(known ? {title: known.title, status: known.status} : {}) });
   if (known) { item.task = { ...structuredClone(known), timeEntries: item.task.timeEntries ?? [] }; }
   else tasks.push(item.task);
			fixture.push(item);
			return Promise.resolve(structuredClone(item.task));
		},
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

	const ui: NonNullable<TaskNotesRuntimeApiV1["ui"]> = {
		taskMenu: {
			show(options) {
				menuCalls.push({ taskPath: options.taskPath, event: options.event });
				if (menuFailure !== null) return Promise.reject(new Error(menuFailure));
				return Promise.resolve();
			},
		},
	};

	const api: TaskNotesRuntimeApiV1 = {
		// The option lets tests fake a future apiVersion; the contract type pins the literal 1.
		apiVersion: apiVersion as 1,
		capabilities,
		hasCapability: (capability: string) => capabilities.includes(capability),
		tasks: {
   list: () => readFailure !== null ? Promise.reject(new Error(readFailure)) : Promise.resolve(structuredClone(tasks)),
   get(path) {
    if (readFailure !== null) return Promise.reject(new Error(readFailure));
    // The live copy: a task's newest active() item carries its current entries.
    const live = [...fixture].reverse().find(item => item.taskPath === path)?.task ?? tasks.find(task => task.path === path);
    return Promise.resolve(live ? structuredClone(live) : null);
   },
   complete(path, options, context) {
    const status = options?.status ?? statuses.find(status => status.isCompleted)?.value;
    completeCalls.push({path, status, ...(context ? {context} : {})});
    if (completeFailure !== null) return Promise.reject(new Error(completeFailure));
    const task = tasks.find(task => task.path === path);
    if (!task || !status || !statuses.some(item => item.value === status && item.isCompleted)) return Promise.reject(new Error("Invalid task or completed status"));
    task.status = status;
    for (const entry of fixture) if (entry.taskPath === path) entry.task.status = status;
    return Promise.resolve(structuredClone(task));
   },
  },
  catalog: { statuses: () => { if (readFailure !== null) throw new Error(readFailure); return structuredClone(statuses); } },
  pomodoro: { status: () => readFailure !== null ? Promise.reject(new Error(readFailure)) : Promise.resolve(structuredClone(pomodoro)) },
		time,
		events,
		lifecycle,
		errors,
		...(options.ui === false ? {} : { ui }),
	};

 for (const method of options.omitMethods ?? []) {
  const [namespace, key] = method.split(".");
  const target = namespace === "tasks" ? api.tasks : namespace === "catalog" ? api.catalog : namespace === "time" ? api.time : api.pomodoro;
  if (target && key) Reflect.deleteProperty(target, key);
 }

	return {
  completeCalls,
  setTasks(next) { tasks = next; },
  setStatuses(next) { statuses = next; },
  setPomodoro(next) { pomodoro = next; },
  failReadWith(error) { readFailure = error; },
  failStartWith(error) { startFailure = error; },
  failCompleteWith(error) { completeFailure = error; },
		plugin: { manifest: { version: options.version ?? "4.13.8" }, api },
		api,
		get activeCalls() {
			return activeCalls;
		},
		startCalls,
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
		menuCalls,
		failMenuWith(message) {
			menuFailure = message;
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
