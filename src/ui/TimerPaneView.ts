/*
 * The sidebar pane. Builds its DOM once in onOpen and updates it in place from the
 * bridge state and the store snapshot. Visibility of the card and message area is
 * driven only by the root `tntp-pane--{state}` modifier class (styles.css).
 */
import { ItemView, type WorkspaceLeaf } from "obsidian";
import { derivePaneState, formatHms, sessionMs, type OpenTimer, type PaneState } from "../model/timeMath";
import type { TimerStore } from "../state/TimerStore";
import type { TaskNotesGateway } from "../tasknotes/TaskNotesBridge";

export const VIEW_TYPE_TIMER_PANE = "tasknotes-timer-pane";

export interface TimerPaneServices {
	gateway: TaskNotesGateway;
	store: TimerStore;
}

const PANE_STATES: readonly PaneState[] = ["running", "idle", "loading", "missing", "incompatible"];

interface PaneElements {
	root: HTMLElement;
	title: HTMLElement;
	clock: HTMLElement;
	heading: HTMLElement;
	body: HTMLElement;
	meta: HTMLElement;
}

/** Writes text only when it changed, so the polite live region is not re-announced. */
function setTextIfChanged(el: HTMLElement, text: string): void {
	if (el.textContent !== text) el.setText(text);
}

export class TimerPaneView extends ItemView {
	private readonly services: TimerPaneServices;
	private els: PaneElements | null = null;

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
		const root = this.contentEl.createDiv({ cls: ["tntp-pane", "tntp-pane--loading"] });

		const card = root.createDiv({ cls: "tntp-card" });
		const status = card.createDiv({ cls: "tntp-status" });
		const live = status.createSpan({ cls: "tntp-status__live" });
		live.createSpan({ cls: "tntp-status__dot" });
		live.createSpan({ cls: "tntp-label", text: "Tracking" });
		const title = card.createDiv({ cls: "tntp-title", attr: { role: "link", tabindex: "0" } });
		const session = card.createDiv({ cls: ["tntp-stat", "tntp-stat--session"] });
		session.createSpan({ cls: "tntp-label", text: "Session" });
		const clock = session.createSpan({ cls: "tntp-clock", attr: { role: "timer", "aria-live": "off" } });

		const message = root.createDiv({ cls: "tntp-message", attr: { "aria-live": "polite" } });
		const heading = message.createDiv({ cls: "tntp-message__heading" });
		const body = message.createDiv({ cls: "tntp-message__body" });
		const meta = message.createDiv({ cls: ["tntp-label", "tntp-message__meta"] });
		const retry = message.createEl("button", { cls: "tntp-message__retry", text: "Check for TaskNotes" });
		this.registerDomEvent(retry, "click", () => gateway.probe());

		this.els = { root, title, clock, heading, body, meta };

		this.register(store.subscribe(() => this.render()));
		this.register(gateway.onState(() => this.render()));
		this.registerInterval(window.setInterval(() => this.tick(), 1000));
		gateway.probe();
		this.render();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.els = null;
		return Promise.resolve();
	}

	private currentState(): { state: PaneState; primary: OpenTimer | null } {
		const snapshot = this.services.store.getSnapshot();
		const state = derivePaneState(this.services.gateway.getState(), snapshot);
		return { state, primary: state === "running" ? (snapshot?.primary ?? null) : null };
	}

	private render(): void {
		const els = this.els;
		if (!els) return;
		const { state, primary } = this.currentState();
		for (const candidate of PANE_STATES) els.root.toggleClass(`tntp-pane--${candidate}`, candidate === state);

		if (primary) {
			setTextIfChanged(els.title, primary.title);
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
	}

	/** Wall-clock tick: recomputes from startTime, never calls TaskNotes. */
	private tick(): void {
		if (!this.contentEl.isShown()) return;
		const { primary } = this.currentState();
		if (primary) this.writeTimes(primary, Date.now());
	}
}
