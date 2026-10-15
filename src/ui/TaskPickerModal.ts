import { Component, MarkdownRenderer, Notice, SuggestModal, type App } from "obsidian";
import { filterAndSortTasks } from "../model/taskPicker";
import { taskWikilink } from "../model/taskLink";
import type { TimerController } from "../state/TimerController";
import type { TaskNotesGateway } from "../tasknotes/TaskNotesBridge";
import type { TaskInfo } from "../tasknotes/runtime-api.types";

/** Each opening reads once; keystrokes rank the local snapshot through public SuggestModal. */
export class TaskPickerModal extends SuggestModal<TaskInfo> {
 private tasks: TaskInfo[] = [];
 private completed = new Set<string>();
 private generation = 0;
 private opening = 0;
 private opened = false;
 private chosen = false;
 private components = new Set<Component>();
 private offState: (() => void) | null = null;

 constructor(app: App, private readonly gateway: TaskNotesGateway,
  private readonly controller: Pick<TimerController, "start" | "isBusy">,
  private readonly didClose: () => void) {
  super(app);
  this.setPlaceholder("Choose a task to start");
  this.emptyStateText = "Loading tasks…";
 }

 onOpen(): void {
  void super.onOpen();
  this.opened = true;
  this.chosen = false;
  const generation = ++this.opening;
  this.offState = this.gateway.onState(() => {
   if (!this.gateway.startAvailability().available) this.close();
  });
  void this.loadTasks(generation);
 }

 private async loadTasks(generation: number): Promise<void> {
  try {
   const [tasks, statuses] = await Promise.all([this.gateway.listTasks(), this.gateway.statuses()]);
   if (!this.opened || generation !== this.opening || !this.gateway.startAvailability().available) return;
   this.tasks = tasks;
   this.completed = new Set(statuses.filter(status => status.isCompleted).map(status => status.value));
   this.emptyStateText = "No matching tasks";
   // Public input event asks SuggestModal to refresh its list and selection.
   const host = this.inputEl.win as unknown as { Event: typeof Event };
   this.inputEl.dispatchEvent(new host.Event("input"));
  } catch (error) {
   if (!this.opened || generation !== this.opening) return;
   try {
    new Notice("Couldn't load tasks: " + (this.gateway.normalizeError(error).message || "TaskNotes reported an error"));
   } catch (noticeError) {
    console.error("[tasknotes-timer-pane] Showing the task picker error failed", noticeError);
   } finally { this.close(); }
  }
 }

 getSuggestions(query: string): TaskInfo[] {
  this.clearRows();
  return filterAndSortTasks(this.tasks, this.completed, query);
 }

 renderSuggestion(task: TaskInfo, el: HTMLElement): void {
  el.addClass("tntp-picker-row");
  const chip = el.createDiv({ cls: "tntp-picker-chip", text: task.title });
  if (task.due) el.createSpan({ cls: "tntp-picker-due", text: task.due });
  // Capture before TaskNotes' nested controls can open/edit/complete the task.
  chip.addEventListener("click", event => {
   if (event.button !== 0) return;
   event.preventDefault(); event.stopImmediatePropagation();
   this.selectSuggestion(task, event);
  }, true);
  for (const name of ["pointerdown", "mousedown", "contextmenu", "auxclick"] as const) {
   chip.addEventListener(name, event => { event.preventDefault(); event.stopImmediatePropagation(); }, true);
  }
  const markdown = taskWikilink(task.path);
  if (markdown === null) return;
  const generation = this.generation;
  const component = new Component();
  this.components.add(component);
  component.load();
  const wrapper = createDiv({ cls: "tntp-picker-chip__md" });
  void MarkdownRenderer.render(this.app, markdown, wrapper, "", component).then(() => {
   if (!this.opened || generation !== this.generation || !this.components.has(component)) {
    this.release(component); return;
   }
   if (!wrapper.querySelector("a.internal-link, .task-card")) { this.release(component); return; }
   // The row, rather than any nested chip control, owns keyboard selection.
   for (const control of Array.from(wrapper.querySelectorAll<HTMLElement>("a, button, input, [tabindex]"))) control.setAttribute("tabindex", "-1");
   chip.empty(); chip.appendChild(wrapper);
  }).catch((error: unknown) => {
   this.release(component);
   console.error("[tasknotes-timer-pane] Rendering a picker task link failed", error);
  });
 }

 selectSuggestion(task: TaskInfo, event: MouseEvent | KeyboardEvent): void {
  if (!this.opened || this.chosen || this.controller.isBusy() || !this.gateway.startAvailability().available) return;
  super.selectSuggestion(task, event);
 }

 onChooseSuggestion(task: TaskInfo): void {
  // SuggestModal may close before invoking this callback, so closed is not a veto.
  if (this.chosen || this.controller.isBusy() || !this.gateway.startAvailability().available) return;
  this.chosen = true;
  void this.controller.start({ taskPath: task.path, title: task.title });
 }

 onClose(): void {
  this.opened = false;
  ++this.opening;
  this.clearRows();
  this.tasks = [];
  this.offState?.(); this.offState = null;
  this.didClose();
  super.onClose();
 }

 private release(component: Component): void {
  if (this.components.delete(component)) component.unload();
 }

 private clearRows(): void {
  ++this.generation;
  for (const component of this.components) component.unload();
  this.components.clear();
 }
}
