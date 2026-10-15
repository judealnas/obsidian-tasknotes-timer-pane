/*
 * The sidebar pane. Builds its frame once in onOpen and updates it in place from the
 * bridge state and the store snapshot: one card per open timer, reconciled by key.
 * Visibility of the card list and message area is driven only by the root
 * `tntp-pane--{state}` modifier class (styles.css).
 */
import { ItemView, Keymap, setIcon, setTooltip, type PaneType, type WorkspaceLeaf } from "obsidian";
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

export const VIEW_TYPE_TIMER_PANE = "tasknotes-timer-pane";

export interface TimerPaneServices {
	gateway: TaskNotesGateway;
	store: TimerStore;
	controller: Pick<TimerController, "stop">;
}

const STOP_LABEL = "Stop timer";
const STOPPING_LABEL = "Stopping…";

const PANE_STATES: readonly PaneState[] = ["running", "idle", "loading", "missing", "incompatible"];

interface PaneElements {
	root: HTMLElement;
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
	clock: HTMLElement;
	total: HTMLElement;
	stop: HTMLButtonElement;
	stopLabel: HTMLElement;
}

/** An open entry is identified by `(taskPath, startTime)`. */
function timerKey(timer: Pick<OpenTimer, "taskPath" | "startTime">): string {
	return `${timer.taskPath}\u0000${timer.startTime}`;
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
		const cards = root.createDiv({ cls: "tntp-cards" });

		const message = root.createDiv({ cls: "tntp-message", attr: { "aria-live": "polite" } });
		const heading = message.createDiv({ cls: "tntp-message__heading" });
		const body = message.createDiv({ cls: "tntp-message__body" });
		const meta = message.createDiv({ cls: ["tntp-label", "tntp-message__meta"] });
		const retry = message.createEl("button", { cls: "tntp-message__retry", text: "Check for TaskNotes" });
		this.registerDomEvent(retry, "click", () => gateway.probe());

		this.els = { root, cards, heading, body, meta };

		this.register(store.subscribe(() => this.render()));
		this.register(gateway.onState(() => this.render()));
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
		this.els = null;
		this.cards = new Map();
		return Promise.resolve();
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
		const status = card.createDiv({ cls: "tntp-status" });
		const live = status.createSpan({ cls: "tntp-status__live" });
		live.createSpan({ cls: "tntp-status__dot" });
		live.createSpan({ cls: "tntp-label", text: "Tracking" });

		// The tooltip owns aria-label ("Open task note"); the accessible name
		// "Open {title}" comes from a visually hidden label via aria-labelledby.
		const titleLabelId = `tntp-title-label-${++titleLabelSeq}`;
		const title = card.createDiv({
			cls: "tntp-title",
			attr: { role: "link", tabindex: "0", "aria-labelledby": titleLabelId },
		});
		setTooltip(title, "Open task note");
		const titleLabel = card.createSpan({ cls: "tntp-visually-hidden", attr: { id: titleLabelId } });
		title.addEventListener("click", (evt) => this.openTask(key, Keymap.isModEvent(evt)));
		title.addEventListener("keydown", (evt) => {
			if (evt.key !== "Enter" && evt.key !== " ") return;
			evt.preventDefault();
			this.openTask(key, false);
		});

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

		return { timer, card, title, titleLabel, clock, total, stop, stopLabel };
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
	 * Stops that card's timer only. The target is captured at click time, so a
	 * refresh landing mid-stop cannot redirect the write to another task.
	 */
	private async stopTask(key: string): Promise<void> {
		const card = this.cards.get(key);
		if (this.stopping.has(key) || !card) return;
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
			setTextIfChanged(card.title, timer.title);
			setTextIfChanged(card.titleLabel, `Open ${timer.title}`);
			// Never overwrite the busy state of a stop in flight.
			if (!this.stopping.has(key)) {
				card.stop.disabled = false;
				setTextIfChanged(card.stopLabel, STOP_LABEL);
			}
		}
		for (const [key, card] of this.cards) if (!next.has(key)) card.card.detach();
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
				body = "Start time tracking on a task in TaskNotes and it will show up here.";
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
