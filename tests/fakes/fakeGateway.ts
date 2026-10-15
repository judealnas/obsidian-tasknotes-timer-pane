// Fake TaskNotesGateway for store and controller tests: no TaskNotes api, just the
// project-shaped seam the store and view see.
import { errorMessage } from "../../src/model/errors";
import type { BridgeState, TaskNotesGateway } from "../../src/tasknotes/TaskNotesBridge";
import type { ActiveTimeEntry, TaskNotesMutationContext } from "../../src/tasknotes/runtime-api.types";

export interface GatewayStopCall {
	taskPath: string;
	context: TaskNotesMutationContext;
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
}

export function createFakeGateway(initial: BridgeState = { kind: "ready" }): FakeGateway {
	let state = initial;
	let fixture: ActiveTimeEntry[] = [];
	let nextRejection: { error: unknown } | null = null;
	let activeCalls = 0;
	let probeCalls = 0;
	let stopFailure: { error: unknown } | null = null;
	const stopCalls: GatewayStopCall[] = [];
	const stateListeners = new Set<(state: BridgeState) => void>();
	const dataListeners = new Set<() => void>();

	return {
		get activeCalls() {
			return activeCalls;
		},
		get probeCalls() {
			return probeCalls;
		},
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
			return Promise.resolve();
		},
		normalizeError: (error) => ({ code: null, message: errorMessage(error) }),
		stopCalls,
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
