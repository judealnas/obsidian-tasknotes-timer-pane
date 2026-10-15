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
 createDiv(options?: { text?: string }): Element { const el = new Element(); el.textContent = options?.text ?? ""; this.children.push(el); return el; }
 createSpan(options?: { text?: string }): Element { return this.createDiv(options); }
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
