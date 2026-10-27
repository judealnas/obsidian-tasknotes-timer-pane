/*
 * The sidebar pane. Builds its frame once in onOpen and updates it in place from the
 * bridge state and the store snapshot: one card per timer session (running or
 * paused), reconciled by session key.
 * Visibility of the card list and message area is driven only by the root
 * `tntp-pane--{state}` modifier class (styles.css).
 */
import {
	Component,
	ItemView,
	Keymap,
	MarkdownRenderer,
	setIcon,
	setTooltip,
	type PaneType,
	type WorkspaceLeaf,
} from "obsidian";
import { taskLinkpath, taskWikilink } from "../model/taskLink";
import {
	derivePaneState,
	detectWakeGap,
	formatHms,
	timerSessionMs,
	totalMs,
	type OpenTimer,
	type PaneState,
} from "../model/timeMath";
import { moveKey, moveKeyBy, orderTimers } from "../model/cardOrder";
import type { CardOrderStore } from "../state/CardOrderStore";
import type { TimerController } from "../state/TimerController";
import type { TimerStore } from "../state/TimerStore";
import type { TaskNotesGateway } from "../tasknotes/TaskNotesBridge";
import { TaskPickerModal } from "./TaskPickerModal";

export const VIEW_TYPE_TIMER_PANE = "tasknotes-timer-pane";

export interface TimerPaneServices {
	gateway: TaskNotesGateway;
	store: TimerStore;
	cardOrder: CardOrderStore;
	controller: Pick<TimerController, "stop" | "start" | "stopAll" | "complete" | "pause" | "resume" | "stopPaused" | "pauseAll" | "resumeAll" | "completionAvailable" | "isBusy" | "subscribeBusy">;
}

const STOP_LABEL = "Stop timer";
const STOPPING_LABEL = "Stopping…";

const PANE_STATES: readonly PaneState[] = ["running", "idle", "loading", "missing", "incompatible"];

interface PaneElements {
	root: HTMLElement;
	start: HTMLButtonElement;
	pauseAll: HTMLButtonElement;
	resumeAll: HTMLButtonElement;
	stopAll: HTMLButtonElement;
	pomodoroNote: HTMLElement;
	cards: HTMLElement;
	heading: HTMLElement;
	body: HTMLElement;
	meta: HTMLElement;
}

/** Shown in Total while TaskNotes cannot return a paused card's task. */
const UNKNOWN_TOTAL = "—";

/** One card (running or paused). `timer` is replaced on every render with the latest data. */
interface CardElements {
	timer: OpenTimer;
	card: HTMLElement;
	/** Drag handle; the only draggable element of the card. */
	handle: HTMLButtonElement;
	title: HTMLElement;
	titleLabel: HTMLElement;
	/** Inputs of the last title update (see titleRenderKey). */
	titleKey: string | null;
	/** Title render generation: a render that finishes with an older value is discarded. */
	titleSeq: number;
	/** "text": plain title text; "markdown": the rendered wikilink (TaskNotes' chip or a plain link). */
	titleMode: "text" | "markdown";
	/** The pane's own plain link inside the rendered output; null when none was found. */
	titleLink: HTMLAnchorElement | null;
	/** Owns the current title render; unloaded on re-render, card removal and pane close. */
	titleComponent: Component | null;
	clock: HTMLElement;
	total: HTMLElement;
	/** Pause on a running card, Resume on a paused one (D-01, D-09). */
	pauseResume: HTMLButtonElement;
	pauseResumeIcon: HTMLElement;
	pauseResumeLabel: HTMLElement;
	/** The state the pause/resume button last showed; null before the first render. */
	shownState: OpenTimer["state"] | null;
	stop: HTMLButtonElement;
	stopLabel: HTMLElement;
	complete: HTMLButtonElement;
}

/**
 * The inputs a card title is rendered from; a new value triggers a re-render. The
 * display key matters because TaskNotes never refreshes a chip outside markdown
 * leaves: a status or priority change must re-render it here.
 */
function titleRenderKey(timer: OpenTimer): string {
	return [timer.taskPath, timer.title, timer.displayKey].join("\u0000");
}

/** Writes text only when it changed, so the polite live region is not re-announced. */
function setTextIfChanged(el: HTMLElement, text: string): void {
	if (el.textContent !== text) el.setText(text);
}

/** Unique per card: several panes and cards may be open at once. */
let titleLabelSeq = 0;

export class TimerPaneView extends ItemView {
	private readonly services: TimerPaneServices;
	private els: PaneElements | null = null;
	/** Cards by timer key, in display order. */
	private cards = new Map<string, CardElements>();
	/** Wall-clock time of the previous tick, for sleep/wake gap detection. */
	private lastTickMs: number | null = null;
	/** Whether the content was visible on the previous tick, for reveal detection. */
	private wasShown = false;
	/** Keys of timers from a Stop click until that stop settles; render() keeps their busy label. */
	private readonly stopping = new Set<string>();
	private picker: TaskPickerModal | null = null;
	private completionReady = false;
	private completionGeneration = 0;
	private closed = true;
	/** Key of the card being dragged by its handle; null unless our own drag is active. */
	private dragKey: string | null = null;

	constructor(leaf: WorkspaceLeaf, services: TimerPaneServices) {
		super(leaf);
		this.services = services;
	}

	getViewType(): string {
		return VIEW_TYPE_TIMER_PANE;
	}

	getDisplayText(): string {
		return "TaskNotes timer";
	}

	getIcon(): string {
		return "timer";
	}

	onOpen(): Promise<void> {
		this.closed = false;
		const { gateway, store } = this.services;
		this.contentEl.empty();
		this.lastTickMs = null;
		this.wasShown = false;
		this.stopping.clear();
		this.cards = new Map();
		this.dragKey = null;
		const root = this.contentEl.createDiv({ cls: ["tntp-pane", "tntp-pane--loading"] });
		const header = root.createDiv({ cls: "tntp-header" });
		// D-02: Start task, Pause all, Resume all, Stop all; text labels in a wrapping row.
		const start = header.createEl("button", { text: "Start task", cls: "tntp-start" });
		const pauseAll = header.createEl("button", { text: "Pause all", cls: "tntp-pause-all" });
		const resumeAll = header.createEl("button", { text: "Resume all", cls: "tntp-resume-all" });
		const stopAll = header.createEl("button", { text: "Stop all", cls: "tntp-stop-all" });
		this.registerDomEvent(start, "click", () => void this.openPicker());
		this.registerDomEvent(pauseAll, "click", () => {
			if (!this.services.controller.isBusy() && !pauseAll.disabled) void this.services.controller.pauseAll();
		});
		this.registerDomEvent(resumeAll, "click", () => {
			if (!this.services.controller.isBusy() && !resumeAll.disabled) void this.services.controller.resumeAll();
		});
		this.registerDomEvent(stopAll, "click", () => {
			if (!this.services.controller.isBusy() && !stopAll.disabled) void this.services.controller.stopAll();
		});
		// D-15: shown only while TaskNotes is ready but Pomodoro ownership cannot be read.
		const pomodoroNote = root.createDiv({ cls: ["tntp-label", "tntp-pomodoro-note"], text: "Can't check Pomodoro. Showing all timers." });
		const cards = root.createDiv({ cls: "tntp-cards" });

		const message = root.createDiv({ cls: "tntp-message", attr: { "aria-live": "polite" } });
		const heading = message.createDiv({ cls: "tntp-message__heading" });
		const body = message.createDiv({ cls: "tntp-message__body" });
		const meta = message.createDiv({ cls: ["tntp-label", "tntp-message__meta"] });
		const retry = message.createEl("button", { cls: "tntp-message__retry", text: "Check for TaskNotes" });
		this.registerDomEvent(retry, "click", () => gateway.probe());

		this.els = { root, start, pauseAll, resumeAll, stopAll, pomodoroNote, cards, heading, body, meta };

		this.register(store.subscribe(() => { this.render(); void this.refreshCompletion(); }));
		this.register(gateway.onState(() => { this.render(); void this.refreshCompletion(); }));
		this.register(this.services.controller.subscribeBusy(() => this.render()));
		// Keeps two open panes in the same order.
		this.register(this.services.cardOrder.subscribe(() => this.render()));
		this.registerInterval(window.setInterval(() => this.tick(), 1000));
		// The pane's own document and window, so this also works in a pop-out window.
		// Electron may suspend timers in the background or during OS sleep: tick at once
		// from the wall clock and re-read TaskNotes when the pane can be seen again.
		this.registerDomEvent(this.containerEl.doc, "visibilitychange", () => {
			if (this.containerEl.doc.visibilityState !== "visible") return;
			this.tick();
			store.requestRefresh();
		});
		this.registerDomEvent(this.containerEl.win, "focus", () => {
			this.tick();
			store.requestRefresh();
		});
		gateway.probe();
		this.render();
		void this.refreshCompletion();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.closed = true;
		this.completionGeneration++;
		this.completionReady = false;
		this.picker?.close();
		this.picker = null;
		this.dragKey = null;
		for (const card of this.cards.values()) this.discardCard(card);
		this.els = null;
		this.cards = new Map();
		return Promise.resolve();
	}

	private openPicker(): void {
  const { gateway, controller } = this.services;
  if (this.picker || controller.isBusy() || !gateway.startAvailability().available) return;
  const modal = new TaskPickerModal(this.app, gateway, controller, () => {
   if (this.picker === modal) this.picker = null;
  });
  this.picker = modal;
  modal.open();
 }

	/** Every open timer in display order (the saved order, new timers on top); none unless running. */
	private currentTimers(): { state: PaneState; timers: OpenTimer[] } {
		const snapshot = this.services.store.getSnapshot();
		const state = derivePaneState(this.services.gateway.getState(), snapshot);
		if (state !== "running" || !snapshot?.primary) return { state, timers: [] };
		return { state, timers: orderTimers([snapshot.primary, ...snapshot.others], this.services.cardOrder.get()) };
	}

	/** Commits a new display order; the store subscription re-renders every pane. */
	private commitOrder(order: string[]): void {
		this.services.cardOrder.set(order);
	}

	private clearDropMarks(): void {
		for (const { card } of this.cards.values()) {
			card.removeClass("tntp-card--drop-before");
			card.removeClass("tntp-card--drop-after");
		}
	}

	private clearDragMarks(): void {
		this.clearDropMarks();
		for (const { card } of this.cards.values()) card.removeClass("tntp-card--dragging");
	}

	/** Handle events: keyboard reorder and the HTML5 drag source. */
	private wireHandle(card: HTMLElement, handle: HTMLButtonElement, key: string): void {
		handle.addEventListener("keydown", (evt) => {
			if (evt.key !== "ArrowUp" && evt.key !== "ArrowDown") return;
			evt.preventDefault();
			this.commitOrder(moveKeyBy([...this.cards.keys()], key, evt.key === "ArrowUp" ? -1 : 1));
			if (handle.ownerDocument.activeElement !== handle) handle.focus();
		});
		handle.addEventListener("dragstart", (evt) => {
			this.dragKey = key;
			const transfer = evt.dataTransfer;
			if (transfer) {
				transfer.effectAllowed = "move";
				transfer.setData("application/x-tntp-card", key);
				transfer.setDragImage(card, 0, 0);
			}
			card.addClass("tntp-card--dragging");
		});
		handle.addEventListener("dragend", () => {
			this.dragKey = null;
			this.clearDragMarks();
		});
		// Only our own handle's drag is acted on; foreign drags are left alone.
		card.addEventListener("dragover", (evt) => {
			if (this.dragKey === null || this.dragKey === key) return;
			evt.preventDefault();
			if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";
			const rect = card.getBoundingClientRect();
			const after = evt.clientY > rect.top + rect.height / 2;
			this.clearDropMarks();
			card.toggleClass("tntp-card--drop-before", !after);
			card.toggleClass("tntp-card--drop-after", after);
		});
		card.addEventListener("drop", (evt) => {
			const dragKey = this.dragKey;
			if (dragKey === null || dragKey === key) return;
			evt.preventDefault();
			const rect = card.getBoundingClientRect();
			const after = evt.clientY > rect.top + rect.height / 2;
			this.dragKey = null;
			this.clearDragMarks();
			this.commitOrder(moveKey([...this.cards.keys()], dragKey, key, after));
		});
	}

	private buildCard(parent: HTMLElement, key: string, timer: OpenTimer): CardElements {
		const card = parent.createDiv({ cls: "tntp-card" });
		const handle = card.createEl("button", { cls: "tntp-handle", attr: { "aria-label": "Reorder card", draggable: "true" } });
		setIcon(handle, "grip-vertical");
		setTooltip(handle, "Drag to reorder, or use Up and Down arrow keys");
		this.wireHandle(card, handle, key);
		// The tooltip owns aria-label ("Open task note"); the accessible name
		// "Open {title}" comes from a visually hidden label via aria-labelledby.
		const titleLabelId = `tntp-title-label-${++titleLabelSeq}`;
		const title = card.createDiv({
			cls: "tntp-title",
			attr: { role: "link", tabindex: "0", "aria-labelledby": titleLabelId },
		});
		setTooltip(title, "Open task note");
		const titleLabel = card.createSpan({ cls: "tntp-visually-hidden", attr: { id: titleLabelId } });
		title.addEventListener("click", (evt) => this.onTitleClick(key, evt));
		title.addEventListener("auxclick", (evt) => this.onTitleAuxClick(key, evt));
		title.addEventListener("keydown", (evt) => {
			if (evt.key !== "Enter" && evt.key !== " ") return;
			evt.preventDefault();
			this.openTask(key, false);
		});
		title.addEventListener("contextmenu", (evt) => this.openTaskMenu(key, evt));

		const session = card.createDiv({ cls: ["tntp-stat", "tntp-stat--session"] });
		session.createSpan({ cls: "tntp-label", text: "Session" });
		const clock = session.createSpan({ cls: "tntp-clock", attr: { role: "timer", "aria-live": "off" } });
		session.createSpan({ cls: ["tntp-label", "tntp-card__paused"], text: "Paused" });
		const totalRow = card.createDiv({ cls: ["tntp-stat", "tntp-stat--total"] });
		totalRow.createSpan({ cls: "tntp-label", text: "Total" });
		const total = totalRow.createSpan({ cls: "tntp-total" });

		// One click, no confirmation: stopping closes the entry and keeps it (CTRL-01).
		// Card listeners live on the card itself and go away with it when it is detached.
		const actions = card.createDiv({ cls: "tntp-actions" });
		const pauseResume = actions.createEl("button", { cls: "tntp-pause-resume" });
		const pauseResumeIcon = pauseResume.createSpan({ cls: "tntp-pause-resume__icon" });
		const pauseResumeLabel = pauseResume.createSpan({ cls: "tntp-pause-resume__label" });
		// The target is read from the card at click time, so a refresh cannot redirect the write.
		pauseResume.addEventListener("click", () => {
			const current = this.cards.get(key);
			if (!current || pauseResume.disabled || this.services.controller.isBusy()) return;
			const { taskPath, startTime, title, state } = current.timer;
			if (state === "paused") void this.services.controller.resume({ taskPath, title });
			else void this.services.controller.pause({ taskPath, startTime, title });
		});
		const stop = actions.createEl("button", { cls: ["mod-cta", "tntp-stop"] });
		setIcon(stop.createSpan({ cls: "tntp-stop__icon" }), "square");
		const stopLabel = stop.createSpan({ cls: "tntp-stop__label", text: STOP_LABEL });
		stop.addEventListener("click", () => void this.stopTask(key));
		const complete = actions.createEl("button", { cls: "tntp-complete", text: "Complete" });
		complete.addEventListener("click", () => {
			const current = this.cards.get(key);
			if (!current || complete.disabled || this.services.controller.isBusy()) return;
			const { taskPath, startTime, title } = current.timer;
			void this.services.controller.complete({ taskPath, startTime, title });
		});

		return {
			timer,
			card,
			handle,
			title,
			titleLabel,
			titleKey: null,
			titleSeq: 0,
			titleMode: "text",
			titleLink: null,
			titleComponent: null,
			clock,
			total,
			pauseResume,
			pauseResumeIcon,
			pauseResumeLabel,
			shownState: null,
			stop,
			stopLabel,
			complete,
		};
	}

	/**
	 * Brings a card's title up to date. Synchronous: a text title updates at once, and a
	 * card already showing a chip or link keeps it until the new render is ready.
	 */
	private updateTitle(key: string, card: CardElements): void {
		const next = titleRenderKey(card.timer);
		if (next === card.titleKey) return;
		card.titleKey = next;
		const seq = ++card.titleSeq;
		// A new card is never blank, and a text-mode rename shows immediately.
		if (card.titleMode === "text") this.showTitleText(card);
		const markdown = taskWikilink(card.timer.taskPath);
		const linkpath = taskLinkpath(card.timer.taskPath);
		if (markdown === null || linkpath === null) {
			this.showTitleText(card);
			return;
		}
		void this.renderTitleLink(key, card, seq, markdown, linkpath);
	}

	/**
	 * Renders "[[linkpath]]" through Obsidian's renderer so TaskNotes' post-processor can
	 * turn it into its chip (when TaskNotes' overlay setting is on). The task title never
	 * passes through the Markdown parser.
	 */
	private async renderTitleLink(
		key: string,
		card: CardElements,
		seq: number,
		markdown: string,
		linkpath: string,
	): Promise<void> {
		const component = this.addChild(new Component());
		const wrapper = createDiv({ cls: "tntp-title__md" });
		const isCurrent = () => this.cards.get(key) === card && card.titleSeq === seq;
		try {
			await MarkdownRenderer.render(this.app, markdown, wrapper, "", component);
		} catch (error) {
			console.error(
				"[tasknotes-timer-pane] Rendering the task link failed: " +
					(error instanceof Error ? error.message : String(error)),
			);
			this.removeChild(component);
			if (isCurrent()) this.showTitleText(card);
			return;
		}
		// The card was removed or re-rendered meanwhile: this render lost the race.
		if (!isCurrent()) {
			this.removeChild(component);
			return;
		}
		let link: HTMLAnchorElement | null = null;
		for (const candidate of Array.from(wrapper.querySelectorAll<HTMLAnchorElement>("a.internal-link"))) {
			if (candidate.getAttribute("data-href") === linkpath) {
				link = candidate;
				break;
			}
		}
		if (link) {
			// The plain link shows the pane's title, not the path. The container stays the
			// single tab stop, and dragging the title does not drop an app:// URL.
			link.setText(card.timer.title);
			link.setAttribute("tabindex", "-1");
			link.setAttribute("draggable", "false");
		} else if (wrapper.childElementCount === 0) {
			this.removeChild(component);
			this.showTitleText(card);
			return;
		}
		card.title.empty();
		card.title.appendChild(wrapper);
		if (card.titleComponent) this.removeChild(card.titleComponent);
		card.titleComponent = component;
		card.titleLink = link;
		card.titleMode = "markdown";
		this.applyTitleOwnership(card);
	}

	/** Plain title text (textContent only), releasing any rendered link. */
	private showTitleText(card: CardElements): void {
		if (card.titleComponent) {
			this.removeChild(card.titleComponent);
			card.titleComponent = null;
		}
		card.titleLink = null;
		card.titleMode = "text";
		card.title.setText(card.timer.title);
		this.applyTitleOwnership(card);
	}

	/**
	 * True when clicks on the title are the pane's to handle: plain text, or the pane's
	 * own link is still in place. Evaluated at event time, so a chip that replaced the
	 * link at any moment is respected.
	 */
	private paneOwnsTitle(card: CardElements): boolean {
		return card.titleMode === "text" || (card.titleLink !== null && card.title.contains(card.titleLink));
	}

	/**
	 * Over a chip the "Open task note" tooltip would mislead, since a chip click runs
	 * TaskNotes' single-click action. The accessible name still comes from aria-labelledby.
	 */
	private applyTitleOwnership(card: CardElements): void {
		const owned = this.paneOwnsTitle(card);
		card.title.toggleClass("tntp-title--chip", !owned);
		if (owned) setTooltip(card.title, "Open task note");
		else card.title.removeAttribute("aria-label");
	}

	/** A click TaskNotes' chip handled (or one bubbling from its dots) never also opens the note. */
	private onTitleClick(key: string, evt: MouseEvent): void {
		const card = this.cards.get(key);
		if (!card || evt.defaultPrevented || !this.paneOwnsTitle(card)) return;
		// Stops the anchor's own navigation.
		evt.preventDefault();
		this.openTask(key, Keymap.isModEvent(evt));
	}

	/** Middle click opens a new tab, like a link in a note. */
	private onTitleAuxClick(key: string, evt: MouseEvent): void {
		if (evt.button !== 1) return;
		const card = this.cards.get(key);
		if (!card || evt.defaultPrevented || !this.paneOwnsTitle(card)) return;
		evt.preventDefault();
		this.openTask(key, Keymap.isModEvent(evt));
	}

	/** Detaches a card, invalidating an in-flight title render and unloading its Component. */
	private discardCard(card: CardElements): void {
		card.titleSeq++;
		if (card.titleComponent) {
			this.removeChild(card.titleComponent);
			card.titleComponent = null;
		}
		card.card.detach();
	}

	/** Opens a card's task note; a modifier click opens it in a new tab (DISP-01). */
	private openTask(key: string, newLeaf: PaneType | boolean): void {
		const card = this.cards.get(key);
		if (!card) return;
		this.app.workspace.openLinkText(card.timer.taskPath, "", newLeaf).catch((error: unknown) => {
			console.error(
				"[tasknotes-timer-pane] Opening the task note failed: " +
					(error instanceof Error ? error.message : String(error)),
			);
		});
	}

	/**
	 * Right-click on a title: TaskNotes' native task menu. A chip TaskNotes rendered
	 * prevents the default itself, so an already-handled event is left alone (no
	 * TaskNotes class names involved). The target is read from the card at event time.
	 */
	private openTaskMenu(key: string, evt: MouseEvent): void {
		if (evt.defaultPrevented) return;
		const card = this.cards.get(key);
		if (!card) return;
		if (this.services.gateway.showTaskMenu(card.timer.taskPath, evt)) evt.preventDefault();
	}

	/**
	 * Stops that card's timer only. The target is captured at click time, so a
	 * refresh landing mid-stop cannot redirect the write to another task. On a paused
	 * card nothing is running: Stop only forgets the pause (D-09).
	 */
	private async stopTask(key: string): Promise<void> {
		const card = this.cards.get(key);
		if (this.services.controller.isBusy() || this.stopping.has(key) || !card) return;
		const { taskPath, startTime, title, state } = card.timer;
		this.stopping.add(key);
		card.stop.disabled = true;
		setTextIfChanged(card.stopLabel, STOPPING_LABEL);
		try {
			if (state === "paused") await this.services.controller.stopPaused({ taskPath, title });
			else await this.services.controller.stop({ taskPath, startTime, title });
		} finally {
			this.stopping.delete(key);
			// The card, or the whole view, may be gone once the stop settles.
			const current = this.cards.get(key);
			if (current) {
				current.stop.disabled = false;
				setTextIfChanged(current.stopLabel, STOP_LABEL);
			}
			this.render();
		}
	}

	private render(): void {
		const els = this.els;
		if (!els) return;
		const { state, timers } = this.currentTimers();
		const gate = this.services.gateway.startAvailability();
		els.start.disabled = !gate.available || this.services.controller.isBusy();
		setTooltip(els.start, gate.reason);
		const header = this.services.store.getHeaderState();
		const busy = this.services.controller.isBusy();
		const busyTip = "A timer action is in progress";
		els.pauseAll.disabled = busy || !header.readable || header.eligibleCount === 0;
		setTooltip(els.pauseAll, busy ? busyTip : !header.readable ? "Cannot verify Pomodoro ownership" : header.eligibleCount === 0 ? "No running timers to pause" : "Pause all running timers");
		els.resumeAll.disabled = busy || header.pausedCount === 0;
		setTooltip(els.resumeAll, busy ? busyTip : header.pausedCount === 0 ? "No paused timers to resume" : "Resume all paused timers");
		const nothingToStop = header.eligibleCount === 0 && header.pausedCount === 0;
		els.stopAll.disabled = busy || !header.readable || nothingToStop;
		setTooltip(els.stopAll, busy ? "A timer action is in progress" : !header.readable ? "Cannot verify Pomodoro ownership" : nothingToStop ? "No timers to stop" : "Stop all timers and clear paused ones");
		for (const candidate of PANE_STATES) els.root.toggleClass(`tntp-pane--${candidate}`, candidate === state);
		els.root.toggleClass("tntp-pane--pomodoro-unknown", this.services.gateway.getState().kind === "ready" && !header.readable);
		this.reconcileCards(els, timers);
		if (timers.length > 0) {
			this.writeTimes(Date.now());
			return;
		}
		this.renderMessage(els, state);
	}

	private async refreshCompletion(): Promise<void> {
		const generation = ++this.completionGeneration;
		this.completionReady = false;
		this.render();
		const ready = await this.services.controller.completionAvailable();
		if (this.closed || generation !== this.completionGeneration) return;
		this.completionReady = ready;
		this.render();
	}

	/**
	 * Keeps exactly one card per session, in display order, reusing existing cards. The
	 * key is the session (path plus first start), so pause and resume keep the card.
	 */
	private reconcileCards(els: PaneElements, timers: readonly OpenTimer[]): void {
		const next = new Map<string, CardElements>();
		for (const timer of timers) {
			const key = timer.sessionKey;
			if (next.has(key)) continue;
			const card = this.cards.get(key) ?? this.buildCard(els.cards, key, timer);
			card.timer = timer;
			next.set(key, card);
			this.updateTitle(key, card);
			setTextIfChanged(card.titleLabel, `Open ${timer.title}`);
			this.updatePauseResume(card);
			card.complete.disabled = this.services.controller.isBusy() || !this.completionReady;
			setTooltip(card.complete, this.services.controller.isBusy() ? "A timer action is in progress" : this.completionReady ? "Complete this task and stop its timer" : "No completed status is available from TaskNotes");
			// Never overwrite the busy state of a stop in flight.
			if (!this.stopping.has(key)) {
				card.stop.disabled = this.services.controller.isBusy();
				setTextIfChanged(card.stopLabel, STOP_LABEL);
			}
		}
		for (const [key, card] of this.cards) if (!next.has(key)) this.discardCard(card);
		// Move a card only when it is out of place, so focus and hover survive a refresh.
		let i = 0;
		for (const card of next.values()) {
			if (els.cards.children[i] !== card.card) els.cards.insertBefore(card.card, els.cards.children[i] ?? null);
			i++;
		}
		this.cards = next;
	}

	/** Pause on running cards; Resume (primary) on paused cards, where Stop loses mod-cta (D-09). */
	private updatePauseResume(card: CardElements): void {
		const paused = card.timer.state === "paused";
		if (card.shownState !== card.timer.state) {
			card.shownState = card.timer.state;
			card.card.toggleClass("tntp-card--paused", paused);
			setIcon(card.pauseResumeIcon, paused ? "play" : "pause");
			setTextIfChanged(card.pauseResumeLabel, paused ? "Resume" : "Pause");
			card.pauseResume.toggleClass("mod-cta", paused);
			card.stop.toggleClass("mod-cta", !paused);
		}
		const busy = this.services.controller.isBusy();
		card.pauseResume.disabled = busy;
		setTooltip(card.pauseResume, busy ? "A timer action is in progress" : paused ? "Resume this timer" : "Pause this timer");
	}

	private renderMessage(els: PaneElements, state: PaneState): void {
		let heading = "";
		let body = "";
		let meta = "";
		switch (state) {
			case "idle":
				heading = "No task is being timed";
				body = "Choose Start task above to start a timer.";
				break;
			case "loading":
				body = "Connecting to TaskNotes…";
				break;
			case "missing":
				heading = "TaskNotes is not enabled";
				body =
					"This pane needs the TaskNotes plugin. Install or enable it in Settings → Community plugins, and the pane will connect on its own.";
				break;
			case "incompatible": {
				heading = "TaskNotes needs an update";
				body =
					"This pane needs TaskNotes 4.10 or later. Update it in Settings → Community plugins, and the pane will connect on its own.";
				const bridge = this.services.gateway.getState();
				const version = bridge.kind === "incompatible" ? bridge.version : null;
				if (version) meta = `Installed version: ${version}`;
				break;
			}
			case "running":
				break;
		}
		setTextIfChanged(els.heading, heading);
		setTextIfChanged(els.body, body);
		setTextIfChanged(els.meta, meta);
	}

	private writeTimes(nowMs: number): void {
		for (const { timer, clock, total } of this.cards.values()) {
			// From stored timestamps: frozen while paused, continuing after a resume (D-07, D-08).
			setTextIfChanged(clock, formatHms(timerSessionMs(timer, nowMs)));
			setTextIfChanged(total, timer.totalKnown ? formatHms(totalMs(timer.entries, nowMs)) : UNKNOWN_TOTAL);
		}
	}

	/**
	 * Wall-clock tick: every duration is recomputed from startTime and Date.now(), never
	 * counted, so the first tick after sleep is already right. It never calls TaskNotes;
	 * after a wake gap or a reveal it asks the store for a (debounced) refresh.
	 */
	private tick(): void {
		const now = Date.now();
		const { store } = this.services;
		// A wake or throttle gap: data may have changed while timers were suspended.
		if (detectWakeGap(this.lastTickMs, now)) store.requestRefresh();
		this.lastTickMs = now;
		const shown = this.contentEl.isShown();
		// Revealed (sidebar tab switched back, pane expanded): re-read TaskNotes.
		if (shown && !this.wasShown) store.requestRefresh();
		this.wasShown = shown;
		// Hidden: no DOM writes.
		if (!shown) return;
		this.writeTimes(now);
	}
}
