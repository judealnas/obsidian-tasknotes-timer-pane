/*
 * Plugin-scoped snapshot of every open TaskNotes timer, refreshed from
 * `gateway.active()`. The view only renders what this store holds.
 * Runtime Obsidian-free so Vitest can load it.
 */
import { deriveSnapshot, snapshotSignature, type TimerSnapshot } from "../model/timeMath";
import type { BridgeState, Schedule, TaskNotesGateway } from "../tasknotes/TaskNotesBridge";

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
}

export class TimerStore {
	getStopAllState(): { eligibleCount: number; readable: boolean } { return { eligibleCount: 0, readable: false }; }
	private readonly gateway: TaskNotesGateway;
	private readonly log: (message: string) => void;
	private readonly schedule: Schedule;
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
		try {
			const active = await this.gateway.active();
			// The bridge may have left ready while the read was in flight.
			if (this.disposed || this.gateway.getState().kind !== "ready") return;
			const snapshot = deriveSnapshot(active);
			const signature = snapshotSignature(snapshot);
			const changed = this.snapshot === null || signature !== this.signature;
			this.snapshot = snapshot;
			this.signature = signature;
			if (changed) this.notify();
		} catch (error) {
			this.log("Refreshing timers failed: " + errorMessage(error));
		}
	}

	private cancelPendingRefresh(): void {
		const cancel = this.cancelDebounce;
		this.cancelDebounce = null;
		if (cancel) cancel();
	}

	private handleState(state: BridgeState): void {
		if (state.kind === "ready") {
			this.requestRefresh();
			return;
		}
		this.cancelPendingRefresh();
		this.snapshot = null;
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
