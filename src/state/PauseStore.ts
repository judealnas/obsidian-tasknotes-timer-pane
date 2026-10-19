/*
 * Plugin-scoped pause records (Phase 3). Outlives the view, so a pause survives the
 * pane closing; main.ts creates exactly one and hands it to the store and the
 * controller. Records are keyed by normalized task path. Every change bumps
 * `revision`, so a refresh whose reads started before it can tell and re-read.
 * Runtime Obsidian-free so Vitest can load it.
 */
import { normalizeTimerPath } from "../model/pomodoroOwnership";
import { newnessMs, type PauseRecord } from "../model/pauseLedger";

export interface PauseStoreDeps {
	log: (message: string) => void;
	/** Writes the records (main.ts merges them into data.json). Default: nothing to write. */
	persist?: (records: readonly PauseRecord[]) => Promise<void>;
}

function withPath<T extends PauseRecord>(record: T): T {
	return { ...record, taskPath: normalizeTimerPath(record.taskPath) };
}

/** True when `path` is `target` itself or lies inside the folder `target` ("/"-bounded, T-03-09). */
function under(path: string, target: string): boolean {
	return path === target || path.startsWith(target + "/");
}

export class PauseStore {
	private readonly log: (message: string) => void;
	private readonly persist: (records: readonly PauseRecord[]) => Promise<void>;
	private map = new Map<string, PauseRecord>();
	private loaded = false;
	/** True when a record changed before load(): load then writes the merged result. */
	private changedBeforeLoad = false;
	private rev = 0;
	private readonly pending = new Map<string, number>();
	private readonly listeners = new Set<() => void>();
	private resolveReady: () => void = () => undefined;
	private readonly readyPromise: Promise<void>;

	constructor(deps: PauseStoreDeps) {
		this.log = deps.log;
		this.persist = deps.persist ?? (() => Promise.resolve());
		this.readyPromise = new Promise<void>(resolve => {
			this.resolveReady = resolve;
		});
	}

	/** Changes on every record change. */
	get revision(): number {
		return this.rev;
	}

	/**
	 * The stored records, once. A record changed in memory before this call is newer
	 * than the stored one for its path and wins.
	 */
	load(records: readonly PauseRecord[]): void {
		if (this.loaded) return;
		this.loaded = true;
		const merged = new Map<string, PauseRecord>();
		for (const record of records) {
			const normalized = withPath(record);
			merged.set(normalized.taskPath, normalized);
		}
		for (const [path, record] of this.map) merged.set(path, record);
		this.map = merged;
		this.rev++;
		this.resolveReady();
		this.notify();
		if (this.changedBeforeLoad) this.save();
	}

	/** Resolves once load() ran. */
	ready(): Promise<void> {
		return this.readyPromise;
	}

	/** True once load() ran, so a caller can skip awaiting ready(). */
	isLoaded(): boolean {
		return this.loaded;
	}

	records(): PauseRecord[] {
		return [...this.map.values()];
	}

	get(path: string): PauseRecord | undefined {
		return this.map.get(normalizeTimerPath(path));
	}

	set(record: PauseRecord): void {
		const normalized = withPath(record);
		this.map.set(normalized.taskPath, normalized);
		this.changed();
	}

	remove(path: string): void {
		if (this.map.delete(normalizeTimerPath(path))) this.changed();
	}

	/**
	 * Follows a rename or move in the vault (D-12): every record on `oldPath`, or inside
	 * it when it is a folder, moves to the same place under `newPath`. A record moved onto
	 * a path that already has one keeps the newer of the two. Changes, notifies and
	 * persists once. Returns how many records moved.
	 */
	renamePath(oldPath: string, newPath: string): number {
		const from = normalizeTimerPath(oldPath);
		const to = normalizeTimerPath(newPath);
		if (from === "" || to === "" || from === to) return 0;
		const kept = new Map<string, PauseRecord>();
		const moved: PauseRecord[] = [];
		for (const [path, record] of this.map) {
			if (under(path, from)) moved.push({ ...record, taskPath: to + path.slice(from.length) });
			else kept.set(path, record);
		}
		if (moved.length === 0) return 0;
		for (const record of moved) {
			const existing = kept.get(record.taskPath);
			if (existing && newnessMs(existing) > newnessMs(record)) continue;
			kept.set(record.taskPath, record);
		}
		this.map = kept;
		this.changed();
		return moved.length;
	}

	/**
	 * Clears the pauses of a deleted note, or of every note inside a deleted folder (D-12).
	 * Changes, notifies and persists once. Returns how many records were removed.
	 */
	removePath(path: string): number {
		const target = normalizeTimerPath(path);
		if (target === "") return 0;
		let removed = 0;
		for (const key of [...this.map.keys()]) {
			if (!under(key, target)) continue;
			this.map.delete(key);
			removed++;
		}
		if (removed > 0) this.changed();
		return removed;
	}

	/** Replaces every record with the outcome of reconcile(). */
	applyReconcile(next: readonly PauseRecord[]): void {
		const map = new Map<string, PauseRecord>();
		for (const record of next) {
			const normalized = withPath(record);
			map.set(normalized.taskPath, normalized);
		}
		this.map = map;
		this.changed();
	}

	/** Plain copies, in insertion order, for data.json. */
	serialize(): PauseRecord[] {
		return this.records().map(record => ({ ...record }));
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/** Marks a path a pane pause is writing; reconcile keeps its running record meanwhile. */
	beginPending(path: string): void {
		const key = normalizeTimerPath(path);
		this.pending.set(key, (this.pending.get(key) ?? 0) + 1);
	}

	endPending(path: string): void {
		const key = normalizeTimerPath(path);
		const count = (this.pending.get(key) ?? 0) - 1;
		if (count > 0) this.pending.set(key, count);
		else this.pending.delete(key);
	}

	pendingPaths(): ReadonlySet<string> {
		return new Set(this.pending.keys());
	}

	private changed(): void {
		this.rev++;
		this.notify();
		if (this.loaded) this.save();
		else this.changedBeforeLoad = true;
	}

	private save(): void {
		let result: Promise<void>;
		try {
			result = this.persist(this.serialize());
		} catch {
			result = Promise.reject(new Error("persist threw"));
		}
		// The message never carries a task path or the underlying error text.
		result.catch(() => this.log("Saving paused timers failed."));
	}

	private notify(): void {
		for (const listener of [...this.listeners]) {
			try {
				listener();
			} catch {
				this.log("A pause listener failed.");
			}
		}
	}
}
