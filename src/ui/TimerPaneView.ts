/*
 * The sidebar pane. Builds its frame once in onOpen and updates it in place from the
 * bridge state and the store snapshot: one card per open timer, reconciled by key.
 * Visibility of the card list and message area is driven only by the root
 * `tntp-pane--{state}` modifier class (styles.css).
 */
import {
	Component,
	ItemView,
	Keymap,
	MarkdownRenderer,
	Notice,
	SuggestModal,
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
	sessionMs,
	totalMs,
	type OpenTimer,
	type PaneState,
} from "../model/timeMath";
import type { TimerController } from "../state/TimerController";
import type { TimerStore } from "../state/TimerStore";
import type { TaskNotesGateway } from "../tasknotes/TaskNotesBridge";
import type { TaskInfo } from "../tasknotes/runtime-api.types";

export const VIEW_TYPE_TIMER_PANE = "tasknotes-timer-pane";

export interface TimerPaneServices {
	gateway: TaskNotesGateway;
	store: TimerStore;
	controller: Pick<TimerController, "stop" | "start" | "isBusy" | "subscribeBusy">;
}

const STOP_LABEL = "Stop timer";
const STOPPING_LABEL = "Stopping…";

const PANE_STATES: readonly PaneState[] = ["running", "idle", "loading", "missing", "incompatible"];

interface PaneElements {
	root: HTMLElement;
	start: HTMLButtonElement;
	stopAll: HTMLButtonElement;
	cards: HTMLElement;
	heading: HTMLElement;
	body: HTMLElement;
	meta: HTMLElement;
}

/** One running-timer card. `timer` is replaced on every render with the latest data. */
interface CardElements {
	timer: OpenTimer;
	card: HTMLElement;
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
	stop: HTMLButtonElement;
	stopLabel: HTMLElement;
}

/** An open entry is identified by `(taskPath, startTime)`. */
function timerKey(timer: Pick<OpenTimer, "taskPath" | "startTime">): string {
	return `${timer.taskPath}\u0000${timer.startTime}`;
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
	private picker: SuggestModal<TaskInfo> | null = null;

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
		const { gateway, store } = this.services;
		this.contentEl.empty();
		this.lastTickMs = null;
		this.wasShown = false;
		this.stopping.clear();
		this.cards = new Map();
		const root = this.contentEl.createDiv({ cls: ["tntp-pane", "tntp-pane--loading"] });
		const header = root.createDiv({ cls: "tntp-header" });
		const start = header.createEl("button", { text: "Start task", cls: "tntp-start" });
		const stopAll = header.createEl("button", { text: "Stop all", cls: "tntp-stop-all" });
		this.registerDomEvent(start, "click", () => void this.openPicker());
		const cards = root.createDiv({ cls: "tntp-cards" });

		const message = root.createDiv({ cls: "tntp-message", attr: { "aria-live": "polite" } });
		const heading = message.createDiv({ cls: "tntp-message__heading" });
		const body = message.createDiv({ cls: "tntp-message__body" });
		const meta = message.createDiv({ cls: ["tntp-label", "tntp-message__meta"] });
		const retry = message.createEl("button", { cls: "tntp-message__retry", text: "Check for TaskNotes" });
		this.registerDomEvent(retry, "click", () => gateway.probe());

		this.els = { root, start, stopAll, cards, heading, body, meta };

		this.register(store.subscribe(() => this.render()));
		this.register(gateway.onState(() => this.render()));
		this.register(this.services.controller.subscribeBusy(() => this.render()));
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
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.picker?.close();
		this.picker = null;
		for (const card of this.cards.values()) this.discardCard(card);
		this.els = null;
		this.cards = new Map();
		return Promise.resolve();
	}

	private async openPicker(): Promise<void> {
		const { gateway, controller } = this.services;
		if (this.picker || controller.isBusy() || !gateway.startAvailability().available) return;
		const modal = new class extends SuggestModal<TaskInfo> {
			tasks: TaskInfo[] = [];
			chosen = false;
			closed = false;
			getSuggestions(query: string): TaskInfo[] { return this.tasks.filter(task => !task.archived && task.title.toLowerCase().includes(query.toLowerCase())); }
			renderSuggestion(task: TaskInfo, el: HTMLElement): void { el.setText(task.title); }
			onChooseSuggestion(task: TaskInfo): void { if (this.chosen || this.closed) return; this.chosen = true; void controller.start({ taskPath: task.path, title: task.title }); }
			onClose(): void { this.closed = true; }
		}(this.app);
		this.picker = modal;
		const close = modal.onClose.bind(modal);
		modal.onClose = () => { close(); if (this.picker === modal) this.picker = null; };
		modal.setPlaceholder("Choose a task to start");
		modal.open();
		try {
			const [tasks] = await Promise.all([gateway.listTasks(), gateway.statuses()]);
			if (modal.closed || this.picker !== modal || !gateway.startAvailability().available) return;
			modal.tasks = tasks;
			modal.inputEl.dispatchEvent(new Event("input"));
		} catch (error) {
			if (!modal.closed) { new Notice("Couldn't load tasks: " + (gateway.normalizeError(error).message || "TaskNotes reported an error")); modal.close(); }
		}
	}

	/** Every open timer in display order (most recently started first); none unless running. */
	private currentTimers(): { state: PaneState; timers: OpenTimer[] } {
		const snapshot = this.services.store.getSnapshot();
		const state = derivePaneState(this.services.gateway.getState(), snapshot);
		if (state !== "running" || !snapshot?.primary) return { state, timers: [] };
		return { state, timers: [snapshot.primary, ...snapshot.others] };
	}

	private buildCard(parent: HTMLElement, key: string, timer: OpenTimer): CardElements {
		const card = parent.createDiv({ cls: "tntp-card" });
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
		const totalRow = card.createDiv({ cls: ["tntp-stat", "tntp-stat--total"] });
		totalRow.createSpan({ cls: "tntp-label", text: "Total" });
		const total = totalRow.createSpan({ cls: "tntp-total" });

		// One click, no confirmation: stopping closes the entry and keeps it (CTRL-01).
		// Card listeners live on the card itself and go away with it when it is detached.
		const actions = card.createDiv({ cls: "tntp-actions" });
		const stop = actions.createEl("button", { cls: ["mod-cta", "tntp-stop"] });
		setIcon(stop.createSpan({ cls: "tntp-stop__icon" }), "square");
		const stopLabel = stop.createSpan({ cls: "tntp-stop__label", text: STOP_LABEL });
		stop.addEventListener("click", () => void this.stopTask(key));

		return {
			timer,
			card,
			title,
			titleLabel,
			titleKey: null,
			titleSeq: 0,
			titleMode: "text",
			titleLink: null,
			titleComponent: null,
			clock,
			total,
			stop,
			stopLabel,
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
	 * refresh landing mid-stop cannot redirect the write to another task.
	 */
	private async stopTask(key: string): Promise<void> {
		const card = this.cards.get(key);
		if (this.services.controller.isBusy() || this.stopping.has(key) || !card) return;
		const { taskPath, startTime, title } = card.timer;
		this.stopping.add(key);
		card.stop.disabled = true;
		setTextIfChanged(card.stopLabel, STOPPING_LABEL);
		try {
			await this.services.controller.stop({ taskPath, startTime, title });
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
		els.stopAll.disabled = true;
		setTooltip(els.stopAll, "Stop all will be available in the next slice");
		for (const candidate of PANE_STATES) els.root.toggleClass(`tntp-pane--${candidate}`, candidate === state);
		this.reconcileCards(els, timers);
		if (timers.length > 0) {
			this.writeTimes(Date.now());
			return;
		}
		this.renderMessage(els, state);
	}

	/** Keeps exactly one card per open timer, in display order, reusing existing cards. */
	private reconcileCards(els: PaneElements, timers: readonly OpenTimer[]): void {
		const next = new Map<string, CardElements>();
		for (const timer of timers) {
			const key = timerKey(timer);
			const card = this.cards.get(key) ?? this.buildCard(els.cards, key, timer);
			card.timer = timer;
			next.set(key, card);
			this.updateTitle(key, card);
			setTextIfChanged(card.titleLabel, `Open ${timer.title}`);
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
			setTextIfChanged(clock, formatHms(sessionMs(timer.startMs, nowMs)));
			setTextIfChanged(total, formatHms(totalMs(timer.entries, nowMs)));
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
