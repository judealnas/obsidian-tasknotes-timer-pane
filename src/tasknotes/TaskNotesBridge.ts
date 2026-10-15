/*
 * The only module that touches TaskNotes' runtime API object. It discovers the
 * TaskNotes plugin, gates on Runtime API v1 plus the capabilities this pane needs,
 * owns the TaskNotes event subscriptions, and exposes a small project-shaped
 * gateway. Runtime Obsidian-free (type-only imports) so Vitest can load it.
 */
import type { ActiveTimeEntry, TaskNotesRuntimeApiV1 } from "./runtime-api.types";

export const TASKNOTES_PLUGIN_ID = "tasknotes";
export const MIN_TASKNOTES_VERSION = "4.10.0";
export const REQUIRED_CAPABILITIES = ["time.read", "time.write", "tasks.events", "lifecycle.events"] as const;
export const PROBE_INTERVAL_MS = 5000;
export const MUTATION_SOURCE = "tasknotes-timer-pane";

export type BridgeState =
	| { kind: "missing" }
	| { kind: "incompatible"; version: string | null }
	| { kind: "loading" }
	| { kind: "ready" };

export interface TaskNotesPluginLike {
	manifest: { version: string };
	api?: unknown;
}

export interface TaskNotesGateway {
	getState(): BridgeState;
	onState(listener: (state: BridgeState) => void): () => void;
	onData(listener: () => void): () => void;
	probe(): void;
	active(): Promise<ActiveTimeEntry[]>;
}

/** Numeric segments of a dotted version, without any "-prerelease" / "+build" suffix; null if any segment is non-numeric. */
function parseVersion(version: string): number[] | null {
	if (typeof version !== "string") return null;
	const core = version.trim().split(/[-+]/)[0] ?? "";
	if (core === "") return null;
	const segments: number[] = [];
	for (const part of core.split(".")) {
		if (!/^\d+$/.test(part)) return null;
		segments.push(Number(part));
	}
	return segments;
}

/**
 * True when `version` is strictly older than `minimum`. Missing segments count as 0.
 * An unparseable version on either side returns false, so an unknown version reads
 * as "loading", never as a false "needs an update".
 */
export function isVersionOlder(version: string, minimum: string): boolean {
	const a = parseVersion(version);
	const b = parseVersion(minimum);
	if (!a || !b) return false;
	const length = Math.max(a.length, b.length);
	for (let i = 0; i < length; i++) {
		const x = a[i] ?? 0;
		const y = b[i] ?? 0;
		if (x < y) return true;
		if (x > y) return false;
	}
	return false;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function readVersion(plugin: TaskNotesPluginLike): string | null {
	const version: unknown = (plugin.manifest as { version?: unknown } | undefined)?.version;
	return typeof version === "string" ? version : null;
}

function versionOf(state: BridgeState): string | null {
	return state.kind === "incompatible" ? state.version : null;
}

export class TaskNotesBridge implements TaskNotesGateway {
	private readonly lookupPlugin: () => TaskNotesPluginLike | null;
	private readonly log: (message: string) => void;
	private state: BridgeState = { kind: "loading" };
	private api: TaskNotesRuntimeApiV1 | null = null;
	private offs: Array<() => void> = [];
	private readonly stateListeners = new Set<(state: BridgeState) => void>();
	private readonly dataListeners = new Set<() => void>();

	constructor(deps: { lookupPlugin: () => TaskNotesPluginLike | null; log: (message: string) => void }) {
		this.lookupPlugin = deps.lookupPlugin;
		this.log = deps.log;
	}

	getState(): BridgeState {
		return this.state;
	}

	onState(listener: (state: BridgeState) => void): () => void {
		this.stateListeners.add(listener);
		return () => {
			this.stateListeners.delete(listener);
		};
	}

	onData(listener: () => void): () => void {
		this.dataListeners.add(listener);
		return () => {
			this.dataListeners.delete(listener);
		};
	}

	/** Re-evaluates TaskNotes availability. Safe to call at any time and as often as needed. */
	probe(): void {
		try {
			const plugin = this.lookupPlugin();
			if (!plugin) {
				this.detach();
				this.setState({ kind: "missing" });
				return;
			}
			const version = readVersion(plugin);
			const api = (plugin.api ?? null) as TaskNotesRuntimeApiV1 | null;
			if (!api) {
				// TaskNotes older than 4.10 has no runtime API; a newer one assigns it mid-onload.
				this.detach();
				this.setState(
					version !== null && isVersionOlder(version, MIN_TASKNOTES_VERSION)
						? { kind: "incompatible", version }
						: { kind: "loading" },
				);
				return;
			}
			if (api.apiVersion !== 1 || !REQUIRED_CAPABILITIES.every((capability) => api.hasCapability(capability))) {
				this.detach();
				this.setState({ kind: "incompatible", version });
				return;
			}
			if (api !== this.api) this.attach(api);
			// isReady() is the read gate; the lifecycle ready() promise resolves too early (Pitfall 2).
			this.setState(api.lifecycle.isReady() ? { kind: "ready" } : { kind: "loading" });
		} catch (error) {
			this.log("TaskNotes probe failed: " + errorMessage(error));
			this.detach();
			this.setState({ kind: "missing" });
		}
	}

	async active(): Promise<ActiveTimeEntry[]> {
		const api = this.api;
		if (!api || this.state.kind !== "ready") throw new Error("TaskNotes is not connected");
		return await api.time.active();
	}

	dispose(): void {
		this.detach();
		this.stateListeners.clear();
		this.dataListeners.clear();
	}

	/**
	 * Subscribes lifecycle first, then task events. TaskNotes refs are never routed
	 * through Obsidian's registerEvent: they must be released when TaskNotes reloads.
	 */
	private attach(api: TaskNotesRuntimeApiV1): void {
		this.detach();
		this.api = api;
		const layoutRef = api.lifecycle.on("layout.ready", () => {
			this.probe();
			this.emitData();
		});
		this.offs.push(() => api.lifecycle.off(layoutRef));
		const updatedRef = api.events.on("task.updated", () => this.emitData());
		this.offs.push(() => api.events.off(updatedRef));
	}

	private detach(): void {
		const offs = this.offs;
		this.offs = [];
		this.api = null;
		for (const off of offs) {
			try {
				off();
			} catch (error) {
				this.log("Releasing a TaskNotes subscription failed: " + errorMessage(error));
			}
		}
	}

	private setState(next: BridgeState): void {
		if (next.kind === this.state.kind && versionOf(next) === versionOf(this.state)) return;
		this.state = next;
		for (const listener of [...this.stateListeners]) {
			try {
				listener(next);
			} catch (error) {
				this.log("State listener failed: " + errorMessage(error));
			}
		}
	}

	private emitData(): void {
		for (const listener of [...this.dataListeners]) {
			try {
				listener();
			} catch (error) {
				this.log("Data listener failed: " + errorMessage(error));
			}
		}
	}
}
