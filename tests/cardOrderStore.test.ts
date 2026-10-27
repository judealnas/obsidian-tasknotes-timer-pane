import { expect, test, vi } from "vitest";
import { CardOrderStore } from "../src/state/CardOrderStore";

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function make(persist?: (order: readonly string[]) => Promise<void>) {
	const log = vi.fn();
	const p = vi.fn(persist ?? (() => Promise.resolve()));
	return { log, persist: p, store: new CardOrderStore({ log, persist: p }) };
}

test("empty before load; get returns a copy", () => {
	const { store } = make();
	expect(store.get()).toEqual([]);
	store.load(["a"]);
	const copy = store.get() as string[];
	copy.push("z");
	expect(store.get()).toEqual(["a"]);
});

test("load runs once and notifies", () => {
	const { store, persist } = make();
	const listener = vi.fn();
	store.subscribe(listener);
	store.load(["a", "b"]);
	store.load(["z"]);
	expect(store.get()).toEqual(["a", "b"]);
	expect(listener).toHaveBeenCalledTimes(1);
	expect(persist).not.toHaveBeenCalled();
});

test("set notifies then persists; equal order is a no-op", () => {
	const { store, persist } = make();
	store.load(["a", "b"]);
	const listener = vi.fn();
	store.subscribe(listener);
	store.set(["a", "b"]);
	expect(listener).not.toHaveBeenCalled();
	expect(persist).not.toHaveBeenCalled();
	store.set(["b", "a"]);
	expect(listener).toHaveBeenCalledTimes(1);
	expect(persist).toHaveBeenCalledWith(["b", "a"]);
	expect(store.serialize()).toEqual(["b", "a"]);
});

test("set before load wins and load persists it", () => {
	const { store, persist } = make();
	store.set(["x"]);
	expect(persist).not.toHaveBeenCalled();
	store.load(["a"]);
	expect(store.get()).toEqual(["x"]);
	expect(persist).toHaveBeenCalledWith(["x"]);
});

test("unsubscribe stops notifications; a throwing listener is logged and others run", () => {
	const { store, log } = make();
	store.load([]);
	const good = vi.fn();
	store.subscribe(() => { throw new Error("boom"); });
	const off = store.subscribe(good);
	store.set(["a"]);
	expect(good).toHaveBeenCalledTimes(1);
	expect(log).toHaveBeenCalledWith("A card order listener failed.");
	off();
	store.set(["b"]);
	expect(good).toHaveBeenCalledTimes(1);
});

test("a rejected or throwing persist logs a fixed message", async () => {
	const rejecting = make(() => Promise.reject(new Error("private/path")));
	rejecting.store.load([]);
	rejecting.store.set(["a"]);
	await flush();
	expect(rejecting.log).toHaveBeenCalledWith("Saving card order failed.");
	const throwing = make(() => { throw new Error("private/path"); });
	throwing.store.load([]);
	throwing.store.set(["a"]);
	await flush();
	expect(throwing.log).toHaveBeenCalledWith("Saving card order failed.");
});
