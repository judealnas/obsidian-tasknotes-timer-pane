/*
 * The only module that touches TaskNotes' runtime API object. It discovers the
 * TaskNotes plugin, gates on Runtime API v1 plus the capabilities this pane needs,
 * owns the TaskNotes event subscriptions, and exposes a small project-shaped
 * gateway. Runtime Obsidian-free (type-only imports) so Vitest can load it.
 */
import { errorMessage } from "../model/errors";
import { getPomodoroOwnedEntryId, type Ownership } from "../model/pomodoroOwnership";
import type {
	ActiveTimeEntry,
	TaskInfo,
	TaskStatus,
	TaskNotesMutationContext,
	TaskNotesRuntimeApiV1,
	TaskNotesRuntimeLifecycleEventName,
	TaskNotesRuntimeEventName,
} from "./runtime-api.types";

export const TASKNOTES_PLUGIN_ID = "tasknotes";
export const MIN_TASKNOTES_VERSION = "4.10.0";
export const REQUIRED_CAPABILITIES = ["time.read", "time.write", "tasks.events", "lifecycle.events"] as const;
/** Optional: TaskNotes' native task menu (4.11+). Not required for ready. */
export const TASK_MENU_CAPABILITY = "ui.task-menu";
export const PROBE_INTERVAL_MS = 5000;
export const MUTATION_SOURCE = "tasknotes-timer-pane";
/** Delay of the one-off probe after TaskNotes unloads, so an update (unload, then load) reconnects fast. */
export const EARLY_PROBE_DELAY_MS = 1000;
/** How long the bridge may sit in loading before it logs one console message. */
export const LOADING_WARN_MS = 30000;

/** Runs `fn` after `ms` milliseconds and returns a function that cancels it. */
export type Schedule = (fn: () => void, ms: number) => () => void;

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
	pomodoroOwnership(): Promise<Ownership>;
	startAvailability(): { available: boolean; reason: string };
	listTasks(): Promise<TaskInfo[]>;
	statuses(): Promise<TaskStatus[]>;
	start(path: string, options: Record<string, never>, context: TaskNotesMutationContext): Promise<void>;
	/** Stops the task's open entry through TaskNotes' own api.time.stop. The only pane write. */
	stop(taskPath: string, context: TaskNotesMutationContext): Promise<void>;
	/** A TaskNotes error as `{ code, message }`; code is null when TaskNotes cannot classify it. */
	normalizeError(error: unknown): { code: string | null; message: string };
	/**
	 * Opens TaskNotes' own task context menu at the mouse event. True when TaskNotes
	 * took the event, and the caller then prevents the default. False when
	 * unavailable. Never throws.
	 */
	showTaskMenu(taskPath: string, event: MouseEvent): boolean;
}

export interface TaskNotesBridgeDeps {
	lookupPlugin: () => TaskNotesPluginLike | null;
	log: (message: string) => void;
	schedule: Schedule;
	now?: () => number;
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

/** For console logs only: never empty, unlike the user-facing errorMessage. */
function describeError(error: unknown): string {
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
	private readonly schedule: Schedule;
	private readonly now: () => number;
	private state: BridgeState = { kind: "loading" };
	private api: TaskNotesRuntimeApiV1 | null = null;
	private offs: Array<() => void> = [];
	/** Api objects TaskNotes has torn down ("unloading"). Never attached again (Pitfall 1). */
	private readonly retired = new WeakSet<object>();
	private cancelEarlyProbe: (() => void) | null = null;
	private loadingSince: number | null = null;
	private loadingWarned = false;
	private disposed = false;
	private readonly stateListeners = new Set<(state: BridgeState) => void>();
	private readonly dataListeners = new Set<() => void>();

	constructor(deps: TaskNotesBridgeDeps) {
		this.lookupPlugin = deps.lookupPlugin;
		this.log = deps.log;
		this.schedule = deps.schedule;
		this.now = deps.now ?? Date.now;
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
		if (this.disposed) return;
		this.evaluate();
		this.watchLoading();
	}

	async active(): Promise<ActiveTimeEntry[]> {
		const api = this.featureApi("time.read", "time.active", api => typeof api.time?.active === "function");
		const active = await api.time.active();
		if (this.connectedApi() !== api) throw new Error("TaskNotes changed while reading timers");
		return active;
	}

	async pomodoroOwnership(): Promise<Ownership> {
		try {
			const api = this.featureApi("pomodoro.read", "pomodoro.status", api => typeof api.pomodoro?.status === "function");
			const state = await api.pomodoro!.status();
			if (this.connectedApi() !== api) return { readable: false };
			return getPomodoroOwnedEntryId(state);
		} catch { return { readable: false }; }
	}

	/**
	 * Forwards the mutation context, so TaskNotes' events attribute the write to the
	 * pane. TaskNotes applies its per-path lock and field mapping; the pane never
	 * writes frontmatter itself.
	 */
	async stop(taskPath: string, context: TaskNotesMutationContext): Promise<void> {
		const api = this.api;
		if (!api || this.state.kind !== "ready") throw new Error("TaskNotes is not connected");
		await api.time.stop(taskPath, context);
	}

	startAvailability(): { available: boolean; reason: string } {
  try {
   const api = this.connectedApi();
   for (const [capability, method, callable] of [
    ["tasks.read", "tasks.list", typeof api.tasks?.list === "function"],
    ["catalog.read", "catalog.statuses", typeof api.catalog?.statuses === "function"],
    ["time.write", "time.start", typeof api.time.start === "function"],
   ] as const) {
    if (!api.hasCapability(capability)) return { available: false, reason: "TaskNotes is missing " + capability };
    if (!callable) return { available: false, reason: "TaskNotes does not provide " + method };
   }
   return { available: true, reason: "Start a task alongside running timers" };
  } catch { return { available: false, reason: "TaskNotes is not connected" }; }
 }

 private connectedApi(): TaskNotesRuntimeApiV1 {
  const api = this.api;
  if (!api || this.state.kind !== "ready" || this.retired.has(api) || this.lookupPlugin()?.api !== api || !api.lifecycle.isReady()) throw new Error("TaskNotes is not connected");
  return api;
 }

 private featureApi(capability: string, method: string, callable: (api: TaskNotesRuntimeApiV1) => boolean): TaskNotesRuntimeApiV1 {
  const api = this.connectedApi();
  if (!api.hasCapability(capability)) throw new Error("TaskNotes is missing " + capability);
  if (!callable(api)) throw new Error("TaskNotes does not provide " + method);
  return api;
 }

 async listTasks(): Promise<TaskInfo[]> {
  const readApi = () => this.featureApi("tasks.read", "tasks.list", api => typeof api.tasks?.list === "function");
  const api = readApi();
  const tasks = await api.tasks!.list();
  if (readApi() !== api) throw new Error("TaskNotes changed while loading tasks");
  return tasks;
 }

 async statuses(): Promise<TaskStatus[]> {
  const readApi = () => this.featureApi("catalog.read", "catalog.statuses", api => typeof api.catalog?.statuses === "function");
  const api = readApi();
  const statuses = await Promise.resolve(api.catalog!.statuses());
  if (readApi() !== api) throw new Error("TaskNotes changed while loading statuses");
  return statuses;
 }

 async start(path: string, options: Record<string, never>, context: TaskNotesMutationContext): Promise<void> {
  const api = this.featureApi("time.write", "time.start", api => typeof api.time.start === "function");
  await api.time.start!(path, options, context);
 }

	normalizeError(error: unknown): { code: string | null; message: string } {
		const api = this.api;
		if (api) {
			try {
				if (api.hasCapability("errors.typed")) {
					const payload = api.errors.normalize(error);
					return {
						code: typeof payload.code === "string" ? payload.code : null,
						message: typeof payload.message === "string" ? payload.message : errorMessage(error),
					};
				}
			} catch (normalizeFailure) {
				this.log("Normalizing a TaskNotes error failed: " + describeError(normalizeFailure));
			}
		}
		return { code: null, message: errorMessage(error) };
	}

	/**
	 * Hands the event to TaskNotes' ui.taskMenu.show. No mutation context: show takes
	 * none, and every menu action is TaskNotes' own write through its own services.
	 */
	showTaskMenu(taskPath: string, event: MouseEvent): boolean {
		const api = this.api;
		if (!api || this.state.kind !== "ready") return false;
		try {
			if (!api.hasCapability(TASK_MENU_CAPABILITY)) return false;
			const ui = api.ui;
			if (typeof ui?.taskMenu?.show !== "function") return false;
			// Called as a method so TaskNotes keeps its receiver.
			const result = ui.taskMenu.show({ taskPath, event });
			Promise.resolve(result).catch((error: unknown) => {
				this.log("Opening the TaskNotes task menu failed: " + describeError(error));
			});
			return true;
		} catch (error) {
			this.log("Opening the TaskNotes task menu failed: " + describeError(error));
			return false;
		}
	}

	/** Releases every TaskNotes subscription and cancels a pending early probe. */
	dispose(): void {
		this.disposed = true;
		this.cancelPendingProbe();
		this.detach();
		this.stateListeners.clear();
		this.dataListeners.clear();
	}

	private evaluate(): void {
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
			// A torn-down api stays torn down, even when Obsidian still returns the old plugin object.
			if (this.retired.has(api)) {
				this.detach();
				this.setState({ kind: "missing" });
				return;
			}
			if (api.apiVersion !== 1 || !REQUIRED_CAPABILITIES.every((capability) => api.hasCapability(capability))) {
				this.detach();
				this.setState({ kind: "incompatible", version });
				return;
			}
			// Re-probing the same live api never adds handlers; only a different api object re-attaches.
			if (api !== this.api) this.attach(api);
			// isReady() is the read gate; the lifecycle ready() promise resolves too early (Pitfall 2).
			this.setState(api.lifecycle.isReady() ? { kind: "ready" } : { kind: "loading" });
		} catch (error) {
			this.log("TaskNotes probe failed: " + describeError(error));
			this.detach();
			this.setState({ kind: "missing" });
		}
	}

	/** Logs once when TaskNotes stays in loading for more than LOADING_WARN_MS. Adds no UI state. */
	private watchLoading(): void {
		if (this.state.kind !== "loading") return;
		const now = this.now();
		if (this.loadingSince === null) {
			this.loadingSince = now;
			return;
		}
		if (!this.loadingWarned && now - this.loadingSince > LOADING_WARN_MS) {
			this.loadingWarned = true;
			this.log("TaskNotes is still loading after 30 s; the pane keeps checking every 5 s");
		}
	}

	/**
	 * Subscribes lifecycle first, then task events, all before the caller reads
	 * isReady(), so a layout.ready firing in between is never missed. TaskNotes refs
	 * are never routed through Obsidian's event registry: they must be released when
	 * TaskNotes reloads.
	 */
	private attach(api: TaskNotesRuntimeApiV1): void {
		this.detach();
		this.api = api;
		const onLifecycle = (event: TaskNotesRuntimeLifecycleEventName, handler: () => void) => {
			const ref = api.lifecycle.on(event, handler);
			this.offs.push(() => api.lifecycle.off(ref));
		};
		const onTask = (event: TaskNotesRuntimeEventName, handler: () => void) => {
			const ref = api.events.on(event, handler);
			this.offs.push(() => api.events.off(ref));
		};
		onLifecycle("unloading", () => this.handleUnloading(api));
		onLifecycle("layout.ready", () => {
			// Refresh even when already ready: TaskNotes installs its metadata listeners late (Pitfall 5).
			this.probe();
			this.emitData();
		});
		onLifecycle("cache.changed", () => this.emitData());
		onLifecycle("cache.rebuilt", () => this.emitData());
		// A settings change (a remapped time-entries field, say) can change what active()
		// returns. The pane reads no settings values itself.
		onLifecycle("settings.changed", () => this.emitData());
		onTask("task.updated", () => this.emitData());
		onTask("task.deleted", () => this.emitData());
	}

	/** TaskNotes is tearing this api down: retire it, release it, and look again shortly. */
	private handleUnloading(api: TaskNotesRuntimeApiV1): void {
		this.retired.add(api);
		if (this.api !== api) return;
		this.detach();
		this.setState({ kind: "missing" });
		this.scheduleEarlyProbe();
	}

	/** Exactly one pending early probe at a time. */
	private scheduleEarlyProbe(): void {
		if (this.disposed) return;
		this.cancelPendingProbe();
		this.cancelEarlyProbe = this.schedule(() => {
			this.cancelEarlyProbe = null;
			this.probe();
		}, EARLY_PROBE_DELAY_MS);
	}

	private cancelPendingProbe(): void {
		const cancel = this.cancelEarlyProbe;
		this.cancelEarlyProbe = null;
		if (cancel) cancel();
	}

	/** Releases every TaskNotes ref, each in its own try/catch so a dead emitter cannot throw out. */
	private detach(): void {
		const offs = this.offs;
		this.offs = [];
		this.api = null;
		for (const off of offs) {
			try {
				off();
			} catch (error) {
				this.log("Releasing a TaskNotes subscription failed: " + describeError(error));
			}
		}
	}

	private setState(next: BridgeState): void {
		if (next.kind !== "loading") {
			this.loadingSince = null;
			this.loadingWarned = false;
		}
		if (next.kind === this.state.kind && versionOf(next) === versionOf(this.state)) return;
		this.state = next;
		for (const listener of [...this.stateListeners]) {
			try {
				listener(next);
			} catch (error) {
				this.log("State listener failed: " + describeError(error));
			}
		}
	}

	private emitData(): void {
		for (const listener of [...this.dataListeners]) {
			try {
				listener();
			} catch (error) {
				this.log("Data listener failed: " + describeError(error));
			}
		}
	}
}
