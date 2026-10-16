/*
 * Plugin-scoped snapshot of every open TaskNotes timer, refreshed from
 * `gateway.active()`. The view only renders what this store holds.
 * Runtime Obsidian-free so Vitest can load it.
 */
import { deriveSnapshot, snapshotSignature, type TimerSnapshot } from "../model/timeMath";
import { selectRegularStopTargets, type Ownership } from "../model/pomodoroOwnership";
import { reconcile } from "../model/pauseLedger";
import type { BridgeState, Schedule, TaskNotesGateway } from "../tasknotes/TaskNotesBridge";
import type { TaskInfo } from "../tasknotes/runtime-api.types";
import { PauseStore } from "./PauseStore";

/**
 * Trailing debounce for data hints. TaskNotes emits task-updated once from
 * TaskService and again about 300 ms later from its metadata listener; 200 ms
 * coalesces each burst, so a mutation costs at most two refreshes.
 */
export const REFRESH_DEBOUNCE_MS = 200;
/** Safety resync interval (registered by the plugin); runs only while the bridge is ready. */
export const SAFETY_RESYNC_MS = 45000;

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export interface TimerStoreDeps {
	gateway: TaskNotesGateway;
	log: (message: string) => void;
	schedule: Schedule;
	/** The plugin's one pause store, shared with the controller. Default: an empty, loaded store. */
	pauses?: PauseStore;
	/**
	 * Whether a note still exists, or null while that can't be told yet (before
	 * Obsidian's layout is ready). Null skips the missing-file rule. Default: null.
	 */
	fileCheck?: () => ((path: string) => boolean) | null;
}

export class TimerStore {
	getStopAllState(): { eligibleCount: number; readable: boolean } {
		return { eligibleCount: this.eligibleCount, readable: this.ownership.readable };
	}
	private ownership: Ownership = { readable: false };
	private eligibleCount = 0;
	private generation = 0;
	private readonly gateway: TaskNotesGateway;
	private readonly log: (message: string) => void;
	private readonly schedule: Schedule;
	private readonly pauses: PauseStore;
	private readonly fileCheck: () => ((path: string) => boolean) | null;
	/** Null until the first successful refresh after the bridge reaches ready. */
	private snapshot: TimerSnapshot | null = null;
	private signature: string | null = null;
	private cancelDebounce: (() => void) | null = null;
	private inFlight: Promise<void> | null = null;
	private dirty = false;
	private readonly listeners = new Set<() => void>();
	private readonly unsubscribes: Array<() => void>;
	private disposed = false;

	constructor(deps: TimerStoreDeps) {
		this.gateway = deps.gateway;
		this.log = deps.log;
		this.schedule = deps.schedule;
		this.fileCheck = deps.fileCheck ?? (() => null);
		if (deps.pauses) this.pauses = deps.pauses;
		else {
			this.pauses = new PauseStore({ log: deps.log });
			this.pauses.load([]);
		}
		this.unsubscribes = [
			this.gateway.onState((state) => this.handleState(state)),
			this.gateway.onData(() => this.requestRefresh()),
		];
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	getSnapshot(): TimerSnapshot | null {
		return this.snapshot;
	}

	/** Trailing debounce: every call restarts the REFRESH_DEBOUNCE_MS wait. */
	requestRefresh(): void {
		if (this.disposed) return;
		this.cancelPendingRefresh();
		this.cancelDebounce = this.schedule(() => {
			this.cancelDebounce = null;
			void this.refreshNow();
		}, REFRESH_DEBOUNCE_MS);
	}

	/**
	 * Reads `active()` now, single-flight: a call while one is in flight marks it
	 * dirty and returns the same promise, which reads once more before resolving.
	 * Never rejects: a failure is logged and the previous snapshot kept, with no retry.
	 */
	refreshNow(): Promise<void> {
		this.cancelPendingRefresh();
		if (this.inFlight) {
			this.dirty = true;
			return this.inFlight;
		}
		const run = this.runRefreshLoop().finally(() => {
			if (this.inFlight === run) this.inFlight = null;
		});
		this.inFlight = run;
		return run;
	}

	/** Safety resync: refreshes only while the bridge is ready; the probe handles the other states. */
	resync(): void {
		if (this.disposed || this.gateway.getState().kind !== "ready") return;
		void this.refreshNow();
	}

	dispose(): void {
		this.disposed = true;
		this.generation++;
		this.cancelPendingRefresh();
		for (const unsubscribe of this.unsubscribes) unsubscribe();
		this.unsubscribes.length = 0;
		this.listeners.clear();
	}

	private async runRefreshLoop(): Promise<void> {
		do {
			this.dirty = false;
			await this.refreshOnce();
		} while (this.dirty && !this.disposed);
	}

	private async refreshOnce(): Promise<void> {
		if (this.disposed || this.gateway.getState().kind !== "ready") return;
		// Stored pauses must be in memory before any reconcile, or a later load would resurrect stale ones.
		// Awaited only while the load is pending, so a loaded store reads TaskNotes in the same turn.
		if (!this.pauses.isLoaded()) {
			await this.pauses.ready();
			if (this.disposed || this.gateway.getState().kind !== "ready") return;
		}
		const generation = this.generation;
		const revision = this.pauses.revision;
		try {
			const active = await this.gateway.active();
			let ownership: Ownership;
			try { ownership = await this.gateway.pomodoroOwnership(); }
			catch { ownership = { readable: false }; }
			// Paused tasks are not in active(). Sequential, small N; a failed read is null, never a deletion.
			const tasks = new Map<string, TaskInfo | null>();
			for (const record of this.pauses.records()) {
				if (record.state !== "paused") continue;
				let task: TaskInfo | null = null;
				try { task = await this.gateway.getTask(record.taskPath); }
				catch { task = null; }
				tasks.set(record.taskPath, task);
			}
			// Completed-type statuses from TaskNotes' catalog, only while something is paused.
			// A failed read skips the completed rule; it is not an error state.
			let completedStatuses: ReadonlySet<string> | null = null;
			if (tasks.size > 0) {
				try {
					const statuses = await this.gateway.statuses();
					completedStatuses = new Set(statuses.filter(status => status.isCompleted === true && typeof status.value === "string").map(status => status.value));
				} catch {
					completedStatuses = null;
				}
			}
			// The bridge may have left ready while the read was in flight.
			if (this.disposed || generation !== this.generation || this.gateway.getState().kind !== "ready") return;
			// A pane pause or resume changed the ledger after these reads began: read again.
			if (this.pauses.revision !== revision) {
				this.dirty = true;
				return;
			}
			const result = reconcile(this.pauses.records(), {
				active,
				ownership,
				tasks,
				completedStatuses,
				fileExists: this.fileCheck(),
				pending: this.pauses.pendingPaths(),
			});
			if (result.changed) this.pauses.applyReconcile(result.next);
			const snapshot = deriveSnapshot(active, { records: this.pauses.records(), tasks });
			const signature = snapshotSignature(snapshot) + JSON.stringify(ownership);
			const changed = this.snapshot === null || signature !== this.signature;
			this.snapshot = snapshot;
			this.ownership = ownership;
			this.eligibleCount = selectRegularStopTargets(active, ownership).length;
			this.signature = signature;
			if (changed) this.notify();
		} catch (error) {
			if (this.disposed || generation !== this.generation) return;
			this.ownership = { readable: false };
			this.eligibleCount = 0;
			this.signature = null;
			this.notify();
			this.log("Refreshing timers failed: " + errorMessage(error));
		}
	}

	private cancelPendingRefresh(): void {
		const cancel = this.cancelDebounce;
		this.cancelDebounce = null;
		if (cancel) cancel();
	}

	private handleState(state: BridgeState): void {
		this.generation++;
		if (state.kind === "ready") {
			this.requestRefresh();
			return;
		}
		this.cancelPendingRefresh();
		this.snapshot = null;
		this.ownership = { readable: false };
		this.eligibleCount = 0;
		this.signature = null;
		this.notify();
	}

	private notify(): void {
		for (const listener of [...this.listeners]) {
			try {
				listener();
			} catch (error) {
				this.log("Timer listener failed: " + errorMessage(error));
			}
		}
	}
}
