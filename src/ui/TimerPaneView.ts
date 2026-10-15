/*
 * The sidebar pane. Builds its DOM once in onOpen and updates it in place from the
 * bridge state and the store snapshot. Visibility of the card and message area is
 * driven only by the root `tntp-pane--{state}` modifier class (styles.css).
 */
import { ItemView, Keymap, setTooltip, type PaneType, type WorkspaceLeaf } from "obsidian";
import {
	derivePaneState,
	formatHms,
	moreRunningLabel,
	othersTooltip,
	sessionMs,
	totalMs,
	type OpenTimer,
	type PaneState,
	type TimerSnapshot,
} from "../model/timeMath";
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
	more: HTMLElement;
	title: HTMLElement;
	titleLabel: HTMLElement;
	clock: HTMLElement;
	total: HTMLElement;
	heading: HTMLElement;
	body: HTMLElement;
	meta: HTMLElement;
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

		const message = root.createDiv({ cls: "tntp-message", attr: { "aria-live": "polite" } });
		const heading = message.createDiv({ cls: "tntp-message__heading" });
		const body = message.createDiv({ cls: "tntp-message__body" });
		const meta = message.createDiv({ cls: ["tntp-label", "tntp-message__meta"] });
		const retry = message.createEl("button", { cls: "tntp-message__retry", text: "Check for TaskNotes" });
		this.registerDomEvent(retry, "click", () => gateway.probe());

		this.els = { root, more, title, titleLabel, clock, total, heading, body, meta };

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

	/** Wall-clock tick: recomputes from startTime, never calls TaskNotes. */
	private tick(): void {
		if (!this.contentEl.isShown()) return;
		const { primary } = this.currentState();
		if (primary) this.writeTimes(primary, Date.now());
	}
}
