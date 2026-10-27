/*
 * Plugin-scoped card order, so it outlives the pane and is shared by every open pane.
 * main.ts creates exactly one. Runtime Obsidian-free so Vitest can load it.
 */
export interface CardOrderStoreDeps {
	log: (message: string) => void;
	/** Writes the order (main.ts merges it into data.json). Default: nothing to write. */
	persist?: (order: readonly string[]) => Promise<void>;
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((key, i) => key === b[i]);
}

export class CardOrderStore {
	private readonly log: (message: string) => void;
	private readonly persist: (order: readonly string[]) => Promise<void>;
	private order: string[] = [];
	private loaded = false;
	/** True when set() ran before load(): load then writes the in-memory order. */
	private changedBeforeLoad = false;
	private readonly listeners = new Set<() => void>();

	constructor(deps: CardOrderStoreDeps) {
		this.log = deps.log;
		this.persist = deps.persist ?? (() => Promise.resolve());
	}

	get(): readonly string[] {
		return [...this.order];
	}

	/** The stored order, once. An order set in memory before this call wins. */
	load(order: readonly string[]): void {
		if (this.loaded) return;
		this.loaded = true;
		if (!this.changedBeforeLoad) this.order = [...order];
		this.notify();
		if (this.changedBeforeLoad) this.save();
	}

	set(order: readonly string[]): void {
		if (sameOrder(order, this.order)) return;
		this.order = [...order];
		this.notify();
		if (this.loaded) this.save();
		else this.changedBeforeLoad = true;
	}

	/** A plain copy for data.json. */
	serialize(): string[] {
		return [...this.order];
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private save(): void {
		let result: Promise<void>;
		try {
			result = this.persist(this.serialize());
		} catch {
			result = Promise.reject(new Error("persist threw"));
		}
		// The message never carries a path or the underlying error text.
		result.catch(() => this.log("Saving card order failed."));
	}

	private notify(): void {
		for (const listener of [...this.listeners]) {
			try {
				listener();
			} catch {
				this.log("A card order listener failed.");
			}
		}
	}
}
