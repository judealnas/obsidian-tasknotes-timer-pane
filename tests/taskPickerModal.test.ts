import { beforeEach, describe, expect, test, vi } from "vitest";
import type { App } from "obsidian";
import { createFakeGateway } from "./fakes/fakeGateway";
const host = vi.hoisted(() => ({ loaded: 0, unloaded: 0, notices: 0, throwNotice: false, renders: [] as Array<() => void> }));
class Element {
 textContent = "";
 children: Element[] = [];
 attrs = new Map<string, string>();
 listeners = new Map<string, (event: MouseEvent) => void>();
 win = { Event, createDiv: () => new Element() };
 doc = { win: this.win };
 addClass(): void {}
 cls: unknown = undefined;
 createDiv(options?: { text?: string; cls?: unknown }): Element { const el = new Element(); el.textContent = options?.text ?? ""; el.cls = options?.cls; this.children.push(el); return el; }
 createSpan(options?: { text?: string; cls?: unknown }): Element { return this.createDiv(options); }
 addEventListener(name: string, fn: (event: MouseEvent) => void): void { this.listeners.set(name, fn); }
 dispatchEvent(): boolean { return true; }
 querySelector(): Element | null { return this.children[0] ?? null; }
 querySelectorAll(): Element[] { return this.children; }
 setAttribute(name: string, value: string): void { this.attrs.set(name, value); }
 empty(): void { this.children = []; this.textContent = ""; }
 appendChild(el: Element): void { this.children.push(el); }
}
vi.mock("obsidian", () => ({
 Component: class { load(): void { host.loaded++; } unload(): void { host.unloaded++; } },
 MarkdownRenderer: { render: (_app: unknown, _markdown: string, wrapper: Element) => new Promise<void>(resolve => { host.renders.push(() => { wrapper.createDiv(); resolve(); }); }) },
 Notice: class { constructor() { host.notices++; if (host.throwNotice) throw new Error("Notice failed"); } },
 SuggestModal: class {
  inputEl = new Element();
  app: App;
  constructor(app: App) { this.app = app; }
  setPlaceholder(): void {}
  onOpen(): void {}
  onClose(): void {}
  close(): void { this.onClose(); }
  selectSuggestion(task: unknown): void { this.close(); (this as unknown as { onChooseSuggestion(t: unknown): void }).onChooseSuggestion(task); }
 }
}));
import { TaskPickerModal } from "../src/ui/TaskPickerModal";
const task = { title: "Task", path: "Task.md", status: "open", archived: false, due: "2026-10-15" };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
describe("task picker lifecycle", () => {
 beforeEach(() => { host.loaded = 0; host.unloaded = 0; host.notices = 0; host.throwNotice = false; host.renders = []; vi.stubGlobal("createDiv", () => new Element()); });
 function setup() {
  const gateway = createFakeGateway();
  gateway.listTasks = () => Promise.resolve([task]);
  const start = vi.fn(() => Promise.resolve("started" as const));
  const closed = vi.fn();
  const modal = new TaskPickerModal({} as App, gateway, { start, isBusy: () => false }, closed);
  return { modal, gateway, start, closed };
 }
 test("unloads row renderers and discards slow results on query change and close", async () => {
  const { modal } = setup(); modal.onOpen(); await flush();
  const el = new Element(); modal.renderSuggestion(task, el as unknown as HTMLElement);
  expect(host.loaded).toBe(1);
  modal.getSuggestions("next"); expect(host.unloaded).toBe(1);
  host.renders[0]!(); await flush(); expect(el.children[0]!.children).toHaveLength(0);
  modal.renderSuggestion(task, new Element() as unknown as HTMLElement);
  modal.onClose(); host.renders[1]!(); await flush(); expect(host.unloaded).toBe(2);
 });
 test("fetches once and closing before a read resolves discards results", async () => {
  const { modal, gateway } = setup();
  let resolve!: (tasks: typeof task[]) => void;
  const load = vi.fn(() => new Promise<typeof task[]>(r => { resolve = r; }));
  gateway.listTasks = load;
  modal.onOpen(); modal.getSuggestions("first"); modal.onClose(); resolve([task]); await flush();
  expect(modal.getSuggestions("")).toEqual([]);
  expect(load).toHaveBeenCalledTimes(1);
 });
 test("mouse and keyboard share once-only selection even when host closes first", async () => {
  const { modal, start } = setup(); modal.onOpen(); await flush();
  modal.selectSuggestion(task, {} as KeyboardEvent); modal.onChooseSuggestion(task);
  expect(start).toHaveBeenCalledTimes(1);
  expect(start).toHaveBeenCalledWith({ taskPath: "Task.md", title: "Task" });
 });
 test("bridge loss closes the picker and blocks stale selection", async () => {
  const { modal, gateway, start, closed } = setup(); modal.onOpen(); await flush();
  gateway.setState({ kind: "missing" }); modal.selectSuggestion(task, {} as MouseEvent);
  expect(closed).toHaveBeenCalledTimes(1); expect(start).not.toHaveBeenCalled();
 });
});

test.each([false, true])("picker read failure closes and releases guards when Notice throws=%s", async throws => {
 const gateway = createFakeGateway(); gateway.listTasks = () => Promise.reject(new Error("Read failed"));
 const closed = vi.fn(); host.notices = 0; host.throwNotice = throws;
 const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
 const modal = new TaskPickerModal({} as App, gateway, { start: () => Promise.resolve("started"), isBusy: () => false }, closed);
 modal.onOpen(); await flush();
 expect(closed).toHaveBeenCalledTimes(1); expect(host.notices).toBe(1);
 expect(modal.getSuggestions("")).toEqual([]);
 host.throwNotice = false; errorLog.mockRestore();
});

// ---- plan 03-04: the Pomodoro row tag (D-17) ----
describe("Pomodoro row tag (D-17)", () => {
 const other = { title: "Other", path: "Other.md", status: "open", archived: false };
 beforeEach(() => { host.loaded = 0; host.unloaded = 0; host.notices = 0; host.throwNotice = false; host.renders = []; vi.stubGlobal("createDiv", () => new Element()); });
 function open(ownership: () => Promise<import("../src/model/pomodoroOwnership").Ownership>) {
  const gateway = createFakeGateway();
  gateway.listTasks = () => Promise.resolve([task, other]);
  const read = vi.fn(ownership);
  gateway.pomodoroOwnership = read;
  const closed = vi.fn();
  const start = vi.fn(() => Promise.resolve("started" as const));
  const modal = new TaskPickerModal({} as App, gateway, { start, isBusy: () => false }, closed);
  return { modal, gateway, read, closed, start };
 }
 function tags(modal: TaskPickerModal, row: typeof task | typeof other): Element[] {
  const el = new Element();
  modal.renderSuggestion(row, el as unknown as HTMLElement);
  return el.children.filter(child => child.cls === "tntp-picker-pomodoro");
 }
 test("a readable owner on Task.md tags only that row with a muted Pomodoro span", async () => {
  const { modal } = open(() => Promise.resolve({ readable: true, owner: { taskPath: "./Task.md", startTime: "2026-10-14T09:00:00.000Z" } }));
  modal.onOpen(); await flush();
  const tagged = tags(modal, task);
  expect(tagged).toHaveLength(1);
  expect(tagged[0]!.textContent).toBe("Pomodoro");
  expect(tags(modal, other)).toHaveLength(0);
 });
 test("no owner tags no row", async () => {
  const { modal } = open(() => Promise.resolve({ readable: true, owner: null }));
  modal.onOpen(); await flush();
  expect(tags(modal, task)).toHaveLength(0);
 });
 test.each([
  ["unreadable", () => Promise.resolve({ readable: false } as const)],
  ["rejected", () => Promise.reject(new Error("pomodoro down"))],
 ])("%s ownership tags no row and the task list still loads", async (_label, ownership) => {
  const { modal, closed } = open(ownership);
  modal.onOpen(); await flush();
  expect(closed).not.toHaveBeenCalled();
  expect(host.notices).toBe(0);
  expect(modal.getSuggestions("").map(row => row.path)).toEqual(expect.arrayContaining(["Task.md", "Other.md"]));
  expect(tags(modal, task)).toHaveLength(0);
 });
 test("ownership is read once per opening, together with the task list", async () => {
  const { modal, read } = open(() => Promise.resolve({ readable: true, owner: null }));
  modal.onOpen(); await flush();
  modal.getSuggestions("t"); modal.getSuggestions("ta");
  expect(read).toHaveBeenCalledTimes(1);
  modal.onClose(); modal.onOpen(); await flush();
  expect(read).toHaveBeenCalledTimes(2);
 });
 test("a close before the ownership read resolves discards it", async () => {
  let resolve!: (value: { readable: true; owner: { taskPath: string; startTime: string } }) => void;
  let calls = 0;
  const { modal } = open(() => {
   calls++;
   if (calls === 1) return new Promise(r => { resolve = r; });
   return new Promise(() => undefined);
  });
  modal.onOpen(); modal.onClose();
  resolve({ readable: true, owner: { taskPath: "Task.md", startTime: "2026-10-14T09:00:00.000Z" } });
  await flush();
  modal.onOpen(); await flush();
  expect(tags(modal, task)).toHaveLength(0);
 });
 test("choosing the tagged row still calls controller.start, which decides", async () => {
  const { modal, start } = open(() => Promise.resolve({ readable: true, owner: { taskPath: "Task.md", startTime: "2026-10-14T09:00:00.000Z" } }));
  modal.onOpen(); await flush();
  modal.onChooseSuggestion(task);
  expect(start).toHaveBeenCalledWith({ taskPath: "Task.md", title: "Task" });
 });
});
