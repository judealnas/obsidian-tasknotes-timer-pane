import { describe, expect, test } from "vitest";
import { filterAndSortTasks, taskMatchQuality } from "../src/model/taskPicker";
import type { TaskInfo } from "../src/tasknotes/runtime-api.types";
const task = (title: string, fields: Partial<TaskInfo> = {}): TaskInfo => ({ title, path: title + ".md", status: "open", archived: false, ...fields });
const completed = new Set(["finished"]);
const titles = (tasks: TaskInfo[]) => tasks.map(t => t.title);
describe("task picker policy", () => {
 test("excludes archived tasks but retains completed and already timed tasks", () => {
  const tasks = [task("Archived", { archived: true }), task("Done", { status: "finished" }), task("Running", { timeEntries: [{ startTime: "now" }] })];
  expect(titles(filterAndSortTasks(tasks, completed, ""))).toEqual(["Running", "Done"]);
 });
 test("empty query orders completed last then due presence/date priority and title", () => {
  const tasks = [task("done", { status: "finished", due: "2000-01-01" }), task("no due"), task("late", { due: "2026-02-01" }), task("low", { due: "2026-01-01", priority: "low" }), task("normal", { due: "2026-01-01" }), task("high", { due: "2026-01-01", priority: "high" })];
  expect(titles(filterAndSortTasks(tasks, completed, ""))).toEqual(["high", "normal", "low", "late", "no due", "done"]);
 });
 test.each(["due", "priority", "contexts", "projects", "tags"] as const)("searches %s", field => {
  const value = ["contexts", "projects", "tags"].includes(field) ? ["needle"] : "needle";
  expect(taskMatchQuality(task("Other", { [field]: value }), "NEEDLE")).toBe(0);
 });
 test("normal priority is not searchable", () => { expect(taskMatchQuality(task("Other", { priority: "normal" }), "normal")).toBeNull(); });
 test("ranks exact prefix word prefix substring without field weights", () => {
  const tasks = [task("xneedle"), task("a needle tail"), task("needle tail"), task("needle"), task("Other", { tags: ["needle"] })];
  expect(titles(filterAndSortTasks(tasks, completed, "needle"))).toEqual(["needle", "Other", "needle tail", "a needle tail", "xneedle"]);
 });
 test("best field wins and completed remains last even for exact matches", () => {
  const tasks = [task("needle", { status: "finished" }), task("xneedle"), task("z", { contexts: ["needle"] })];
  expect(titles(filterAndSortTasks(tasks, completed, "needle"))).toEqual(["z", "xneedle", "needle"]);
 });
 test("unknown priority is normal, titles break ties and exact ties stay stable", () => {
  const a = task("same", { priority: "unknown" }); const b = task("same", { priority: "normal" });
  expect(filterAndSortTasks([b, task("Z"), a, task("A")], completed, "")).toEqual([task("A"), b, a, task("Z")]);
 });
 test("unmatched tasks disappear and blank query acts like empty", () => {
  expect(filterAndSortTasks([task("Alpha")], completed, "missing")).toEqual([]);
  expect(titles(filterAndSortTasks([task("B"), task("A")], completed, "  "))).toEqual(["A", "B"]);
 });
});
