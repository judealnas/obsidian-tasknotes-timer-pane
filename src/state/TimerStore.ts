/*
 * Plugin-scoped snapshot of every open TaskNotes timer, refreshed from
 * `gateway.active()`. The view only renders what this store holds.
 * Runtime Obsidian-free so Vitest can load it.
 */
import { deriveSnapshot, type TimerSnapshot } from "../model/timeMath";
import type { BridgeState, TaskNotesGateway } from "../tasknotes/TaskNotesBridge";

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export class TimerStore {
	private readonly gateway: TaskNotesGateway;
	private readonly log: (message: string) => void;
	/** Null until the first successful refresh after the bridge reaches ready. */
	private snapshot: TimerSnapshot | null = null;
	private readonly listeners = new Set<() => void>();
	private readonly unsubscribes: Array<() => void>;
	private disposed = false;

	constructor(deps: { gateway: TaskNotesGateway; log: (message: string) => void }) {
		this.gateway = deps.gateway;
		this.log = deps.log;
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

	/** Asks for a refresh. Plan 01-03 adds the trailing debounce and single-flight guard here. */
	requestRefresh(): void {
		void this.refreshNow();
	}

	/** Reads `active()` now. Never rejects: a failure is logged and the previous snapshot kept. */
	async refreshNow(): Promise<void> {
		if (this.disposed || this.gateway.getState().kind !== "ready") return;
		try {
			const active = await this.gateway.active();
			// The bridge may have left ready while the read was in flight.
			if (this.disposed || this.gateway.getState().kind !== "ready") return;
			this.snapshot = deriveSnapshot(active);
			this.notify();
		} catch (error) {
			this.log("Refreshing timers failed: " + errorMessage(error));
		}
	}

	dispose(): void {
		this.disposed = true;
		for (const unsubscribe of this.unsubscribes) unsubscribe();
		this.unsubscribes.length = 0;
		this.listeners.clear();
	}

	private handleState(state: BridgeState): void {
		if (state.kind === "ready") {
			this.requestRefresh();
			return;
		}
		this.snapshot = null;
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
