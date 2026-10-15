/*
 * The sidebar pane. Builds its DOM once in onOpen and updates it in place from the
 * bridge state and the store snapshot. Visibility of the card and message area is
 * driven only by the root `tntp-pane--{state}` modifier class (styles.css).
 */
import { ItemView, Keymap, setIcon, setTooltip, type PaneType, type WorkspaceLeaf } from "obsidian";
import {
	derivePaneState,
	detectWakeGap,
	formatHms,
	moreRunningLabel,
	othersTooltip,
	sessionMs,
	totalMs,
	type OpenTimer,
	type PaneState,
	type TimerSnapshot,
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
	more: HTMLElement;
	title: HTMLElement;
	titleLabel: HTMLElement;
	clock: HTMLElement;
	total: HTMLElement;
	heading: HTMLElement;
	body: HTMLElement;
	meta: HTMLElement;
	stop: HTMLButtonElement;
	stopLabel: HTMLElement;
}

/** Writes text only when it changed, so the polite live region is not re-announced. */
function setTextIfChanged(el: HTMLElement, text: string): void {
	if (el.textContent !== text) el.setText(text);
}

/** Obsidian tooltips read aria-label, so only rewrite it when the text changed. */
function setTooltipIfChanged(el: HTMLElement, text: string): void {
	if (el.getAttribute("aria-label") !== text) setTooltip(el, text);
}

/** Unique per view instance: several panes may be open at once. */
let titleLabelSeq = 0;

export class TimerPaneView extends ItemView {
	private readonly services: TimerPaneServices;
	private els: PaneElements | null = null;
	/** Wall-clock time of the previous tick, for sleep/wake gap detection. */
	private lastTickMs: number | null = null;
	/** Whether the content was visible on the previous tick, for reveal detection. */
	private wasShown = false;
	/** True from a Stop click until that stop settles; render() keeps the busy label meanwhile. */
	private stopping = false;

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
		this.stopping = false;
		const root = this.contentEl.createDiv({ cls: ["tntp-pane", "tntp-pane--loading"] });

		const card = root.createDiv({ cls: "tntp-card" });
		const status = card.createDiv({ cls: "tntp-status" });
		const live = status.createSpan({ cls: "tntp-status__live" });
		live.createSpan({ cls: "tntp-status__dot" });
		live.createSpan({ cls: "tntp-label", text: "Tracking" });
		const more = status.createSpan({ cls: ["tntp-label", "tntp-status__more"] });

		// The tooltip owns aria-label ("Open task note"); the accessible name
		// "Open {title}" comes from a visually hidden label via aria-labelledby.
		const titleLabelId = `tntp-title-label-${++titleLabelSeq}`;
		const title = card.createDiv({
			cls: "tntp-title",
			attr: { role: "link", tabindex: "0", "aria-labelledby": titleLabelId },
		});
		setTooltip(title, "Open task note");
		const titleLabel = card.createSpan({ cls: "tntp-visually-hidden", attr: { id: titleLabelId } });
		this.registerDomEvent(title, "click", (evt) => this.openPrimary(Keymap.isModEvent(evt)));
		this.registerDomEvent(title, "keydown", (evt) => {
			if (evt.key !== "Enter" && evt.key !== " ") return;
			evt.preventDefault();
			this.openPrimary(false);
		});

		const session = card.createDiv({ cls: ["tntp-stat", "tntp-stat--session"] });
		session.createSpan({ cls: "tntp-label", text: "Session" });
		const clock = session.createSpan({ cls: "tntp-clock", attr: { role: "timer", "aria-live": "off" } });
		const totalRow = card.createDiv({ cls: ["tntp-stat", "tntp-stat--total"] });
		totalRow.createSpan({ cls: "tntp-label", text: "Total" });
		const total = totalRow.createSpan({ cls: "tntp-total" });

		// One click, no confirmation: stopping closes the entry and keeps it (CTRL-01).
		const actions = card.createDiv({ cls: "tntp-actions" });
		const stop = actions.createEl("button", { cls: ["mod-cta", "tntp-stop"] });
		setIcon(stop.createSpan({ cls: "tntp-stop__icon" }), "square");
		const stopLabel = stop.createSpan({ cls: "tntp-stop__label", text: STOP_LABEL });
		this.registerDomEvent(stop, "click", () => void this.stopPrimary());

		const message = root.createDiv({ cls: "tntp-message", attr: { "aria-live": "polite" } });
		const heading = message.createDiv({ cls: "tntp-message__heading" });
		const body = message.createDiv({ cls: "tntp-message__body" });
		const meta = message.createDiv({ cls: ["tntp-label", "tntp-message__meta"] });
		const retry = message.createEl("button", { cls: "tntp-message__retry", text: "Check for TaskNotes" });
		this.registerDomEvent(retry, "click", () => gateway.probe());

		this.els = { root, more, title, titleLabel, clock, total, heading, body, meta, stop, stopLabel };

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
		return Promise.resolve();
	}

	private currentState(): { state: PaneState; primary: OpenTimer | null; snapshot: TimerSnapshot | null } {
		const snapshot = this.services.store.getSnapshot();
		const state = derivePaneState(this.services.gateway.getState(), snapshot);
		return { state, primary: state === "running" ? (snapshot?.primary ?? null) : null, snapshot };
	}

	/** Opens the displayed task's note; a modifier click opens it in a new tab (DISP-01). */
	private openPrimary(newLeaf: PaneType | boolean): void {
		const { primary } = this.currentState();
		if (!primary) return;
		this.app.workspace.openLinkText(primary.taskPath, "", newLeaf).catch((error: unknown) => {
			console.error(
				"[tasknotes-timer-pane] Opening the task note failed: " +
					(error instanceof Error ? error.message : String(error)),
			);
		});
	}

	/**
	 * Stops the displayed timer only. The target is captured at click time, so a
	 * refresh landing mid-stop cannot redirect the write to another task.
	 */
	private async stopPrimary(): Promise<void> {
		const els = this.els;
		if (this.stopping || !els) return;
		const { primary } = this.currentState();
		if (!primary) return;
		const target = { taskPath: primary.taskPath, startTime: primary.startTime, title: primary.title };
		this.stopping = true;
		els.stop.disabled = true;
		setTextIfChanged(els.stopLabel, STOPPING_LABEL);
		try {
			await this.services.controller.stop(target);
		} finally {
			this.stopping = false;
			// The view may have closed while the stop was in flight.
			const current = this.els;
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
		const { state, primary, snapshot } = this.currentState();
		for (const candidate of PANE_STATES) els.root.toggleClass(`tntp-pane--${candidate}`, candidate === state);
		const others = primary ? (snapshot?.others ?? []) : [];
		els.root.toggleClass("tntp-pane--others", others.length > 0);

		if (primary) {
			setTextIfChanged(els.title, primary.title);
			setTextIfChanged(els.titleLabel, `Open ${primary.title}`);
			// Never overwrite the busy state of a stop in flight.
			if (!this.stopping) {
				els.stop.disabled = false;
				setTextIfChanged(els.stopLabel, STOP_LABEL);
			}
			if (others.length > 0) {
				setTextIfChanged(els.more, moreRunningLabel(others.length));
				setTooltipIfChanged(els.more, othersTooltip(others));
			}
			this.writeTimes(primary, Date.now());
			return;
		}
		this.renderMessage(els, state);
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

	private writeTimes(primary: OpenTimer, nowMs: number): void {
		const els = this.els;
		if (!els) return;
		setTextIfChanged(els.clock, formatHms(sessionMs(primary.startMs, nowMs)));
		setTextIfChanged(els.total, formatHms(totalMs(primary.entries, nowMs)));
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
		const { primary } = this.currentState();
		if (primary) this.writeTimes(primary, now);
	}
}
