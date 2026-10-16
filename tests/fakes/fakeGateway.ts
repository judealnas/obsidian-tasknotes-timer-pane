// Fake TaskNotesGateway for store and controller tests: no TaskNotes api, just the
// project-shaped seam the store and view see.
import { errorMessage } from "../../src/model/errors";
import type { Ownership } from "../../src/model/pomodoroOwnership";
import type { BridgeState, TaskNotesGateway } from "../../src/tasknotes/TaskNotesBridge";
import type { ActiveTimeEntry, TaskInfo, TaskNotesMutationContext } from "../../src/tasknotes/runtime-api.types";

export interface GatewayStopCall {
	taskPath: string;
	context: TaskNotesMutationContext;
}

export interface GatewayStartCall {
	taskPath: string;
	context: TaskNotesMutationContext;
}

export interface GatewayMenuCall {
	taskPath: string;
	event: MouseEvent;
}

export interface FakeGateway extends TaskNotesGateway {
	/** Number of `active()` calls so far. */
	readonly activeCalls: number;
	/** Number of `probe()` calls so far. */
	readonly probeCalls: number;
	/** Sets the state and notifies every onState listener (also when the kind is unchanged). */
	setState(state: BridgeState): void;
	/** What later `active()` calls resolve to (deep-copied per call, like TaskNotes). */
	setActive(entries: ActiveTimeEntry[]): void;
	/** Makes the next `active()` call reject with `error`. */
	rejectNextActive(error: unknown): void;
	/** Fires every onData listener, as a TaskNotes data hint would. */
	emitData(): void;
	/** Every `stop()` call so far, in order. */
	readonly stopCalls: GatewayStopCall[];
	/** Makes every later `stop()` reject with `error`; null restores success. */
	failStopWith(error: unknown): void;
	/** Every `start()` call so far, in order. */
	readonly startCalls: GatewayStartCall[];
	/** What `getTask(path)` resolves to; an unset path resolves null. */
	setTask(path: string, task: TaskInfo | null): void;
	/** What `pomodoroOwnership()` resolves to (default readable, no owner). */
	setOwnership(ownership: Ownership): void;
	/** Every `showTaskMenu()` call that TaskNotes took, in order. */
	readonly menuCalls: GatewayMenuCall[];
	/** Whether `showTaskMenu()` reports TaskNotes' menu as available (default true). */
	setTaskMenuAvailable(available: boolean): void;
}

export function createFakeGateway(initial: BridgeState = { kind: "ready" }): FakeGateway {
	let state = initial;
	let fixture: ActiveTimeEntry[] = [];
	let nextRejection: { error: unknown } | null = null;
	let activeCalls = 0;
	let probeCalls = 0;
	let stopFailure: { error: unknown } | null = null;
	const stopCalls: GatewayStopCall[] = [];
	const startCalls: GatewayStartCall[] = [];
	const taskFixtures = new Map<string, TaskInfo | null>();
	let ownership: Ownership = { readable: true, owner: null };
	let taskMenuAvailable = true;
	const menuCalls: GatewayMenuCall[] = [];
	const stateListeners = new Set<(state: BridgeState) => void>();
	const dataListeners = new Set<() => void>();

	return {
		get activeCalls() {
			return activeCalls;
		},
		get probeCalls() {
			return probeCalls;
		},
		startAvailability: () => ({ available: state.kind === "ready", reason: "TaskNotes is not connected" }),
		listTasks: () => Promise.resolve([]),
		statuses: () => Promise.resolve([]),
		completionAvailable: () => state.kind === "ready",
		completeTask: () => Promise.resolve(),
		start(taskPath, _options, context) {
			startCalls.push({ taskPath, context });
			return Promise.resolve();
		},
		pomodoroOwnership: () => Promise.resolve(structuredClone(ownership)),
		getTask: (path) => Promise.resolve(structuredClone(taskFixtures.get(path) ?? null)),
		getState: () => state,
		onState(listener) {
			stateListeners.add(listener);
			return () => {
				stateListeners.delete(listener);
			};
		},
		onData(listener) {
			dataListeners.add(listener);
			return () => {
				dataListeners.delete(listener);
			};
		},
		probe() {
			probeCalls++;
		},
		active() {
			activeCalls++;
			if (nextRejection) {
				const { error } = nextRejection;
				nextRejection = null;
				return Promise.reject(error instanceof Error ? error : new Error(String(error)));
			}
			return Promise.resolve(structuredClone(fixture));
		},
		stop(taskPath, context) {
			stopCalls.push({ taskPath, context });
			if (stopFailure) {
				const { error } = stopFailure;
				return Promise.reject(error instanceof Error ? error : new Error(String(error)));
			}
			// Like TaskNotes: the task as saved, with the first open entry on the path now closed.
			const open = fixture.find((item) => item.taskPath === taskPath && !item.entry.endTime);
			const endTime = new Date().toISOString();
			const timeEntries = (open?.task.timeEntries ?? (open ? [open.entry] : [])).map((entry) =>
				open && entry.startTime === open.entry.startTime && !entry.endTime ? { ...entry, endTime } : { ...entry },
			);
			return Promise.resolve({ title: open?.task.title ?? taskPath, status: open?.task.status ?? "open", path: taskPath, archived: false, timeEntries });
		},
		normalizeError: (error) => ({ code: null, message: errorMessage(error) }),
		showTaskMenu(taskPath, event) {
			if (!taskMenuAvailable) return false;
			menuCalls.push({ taskPath, event });
			return true;
		},
		menuCalls,
		setTaskMenuAvailable(available) {
			taskMenuAvailable = available;
		},
		stopCalls,
		startCalls,
		setTask(path, task) {
			taskFixtures.set(path, task);
		},
		setOwnership(next) {
			ownership = next;
		},
		failStopWith(error) {
			stopFailure = error === null ? null : { error };
		},
		setState(next) {
			state = next;
			for (const listener of [...stateListeners]) listener(next);
		},
		setActive(entries) {
			fixture = entries;
		},
		rejectNextActive(error) {
			nextRejection = { error };
		},
		emitData() {
			for (const listener of [...dataListeners]) listener();
		},
	};
}
