import { expect, test } from "vitest";
import { loadCardOrder, moveKey, moveKeyBy, orderTimers } from "../src/model/cardOrder";

const t = (...keys: string[]) => keys.map(sessionKey => ({ sessionKey }));
const keys = (items: { sessionKey: string }[]) => items.map(item => item.sessionKey);

test("empty saved order keeps the incoming order and returns a new array", () => {
	const live = t("A", "B");
	const out = orderTimers(live, []);
	expect(keys(out)).toEqual(["A", "B"]);
	expect(out).not.toBe(live);
});

test("saved order is applied", () => {
	expect(keys(orderTimers(t("A", "B"), ["B", "A"]))).toEqual(["B", "A"]);
});

test("new timers go first, keeping their incoming order", () => {
	expect(keys(orderTimers(t("C", "A", "B"), ["A", "B"]))).toEqual(["C", "A", "B"]);
	expect(keys(orderTimers(t("C", "D", "A", "B"), ["B", "A"]))).toEqual(["C", "D", "B", "A"]);
});

test("stale saved ids are ignored", () => {
	expect(keys(orderTimers(t("A"), ["X", "A", "Y"]))).toEqual(["A"]);
});

test("duplicate saved keys: first occurrence wins; duplicate live keys pass through", () => {
	expect(keys(orderTimers(t("A", "B"), ["B", "A", "B"]))).toEqual(["B", "A"]);
	expect(keys(orderTimers(t("A", "A", "B"), ["B", "A"]))).toEqual(["B", "A", "A"]);
});

test("moveKey inserts before or after the target", () => {
	expect(moveKey(["A", "B", "C"], "C", "A", false)).toEqual(["C", "A", "B"]);
	expect(moveKey(["A", "B", "C"], "A", "C", true)).toEqual(["B", "C", "A"]);
	expect(moveKey(["A", "B", "C"], "A", "B", true)).toEqual(["B", "A", "C"]);
});

test("moveKey returns an unchanged copy for same or missing keys", () => {
	const order = ["A", "B"];
	expect(moveKey(order, "A", "A", true)).toEqual(["A", "B"]);
	expect(moveKey(order, "X", "A", true)).toEqual(["A", "B"]);
	expect(moveKey(order, "A", "X", true)).toEqual(["A", "B"]);
	expect(moveKey(order, "A", "A", true)).not.toBe(order);
});

test("moveKeyBy moves and clamps", () => {
	expect(moveKeyBy(["A", "B", "C"], "B", -1)).toEqual(["B", "A", "C"]);
	expect(moveKeyBy(["A", "B", "C"], "B", 1)).toEqual(["A", "C", "B"]);
	expect(moveKeyBy(["A", "B", "C"], "A", -1)).toEqual(["A", "B", "C"]);
	expect(moveKeyBy(["A", "B", "C"], "C", 1)).toEqual(["A", "B", "C"]);
	expect(moveKeyBy(["A", "B", "C"], "A", 9)).toEqual(["B", "C", "A"]);
	expect(moveKeyBy(["A", "B"], "X", 1)).toEqual(["A", "B"]);
	expect(moveKeyBy(["A", "B"], "A", 0)).toEqual(["A", "B"]);
});

test("loadCardOrder is defensive", () => {
	expect(loadCardOrder(undefined)).toEqual([]);
	expect(loadCardOrder(null)).toEqual([]);
	expect(loadCardOrder([])).toEqual([]);
	expect(loadCardOrder({})).toEqual([]);
	expect(loadCardOrder({ cardOrder: "a" })).toEqual([]);
	expect(loadCardOrder({ cardOrder: { 0: "a" } })).toEqual([]);
	expect(loadCardOrder({ cardOrder: ["a", 1, "", null, "b", "a"] })).toEqual(["a", "b"]);
});

test("loadCardOrder examines at most 1000 items", () => {
	const many = Array.from({ length: 1500 }, (_, i) => `k${i}`);
	expect(loadCardOrder({ cardOrder: many })).toHaveLength(1000);
});
