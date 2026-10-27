import { Notice, Plugin } from "obsidian";
import { PauseStore } from "./state/PauseStore";
import { CardOrderStore } from "./state/CardOrderStore";
import { loadCardOrder } from "./model/cardOrder";
import { TimerController } from "./state/TimerController";
import { SAFETY_RESYNC_MS, TimerStore } from "./state/TimerStore";
import { WriteQueue } from "./state/WriteQueue";
import { PROBE_INTERVAL_MS, TASKNOTES_PLUGIN_ID, TaskNotesBridge, type Schedule } from "./tasknotes/TaskNotesBridge";
import { TimerPaneView, VIEW_TYPE_TIMER_PANE } from "./ui/TimerPaneView";
import { DEFAULT_SETTINGS, loadSettings, type TimerPaneSettings } from "./settings";
import { TimerPaneSettingTab } from "./ui/TimerPaneSettingTab";
import { PAUSE_RECORDS_VERSION, loadPauseRecords } from "./model/pauseLedger";

/** The data.json keys this plugin owns; everything else is kept as found. */
const OWNED_KEYS = new Set(["completionStatus", "pauseRecordsVersion", "pauseRecords", "cardOrder"]);

function extrasOf(data: unknown): Record<string, unknown> {
	if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
	const extras: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(data)) if (!OWNED_KEYS.has(key)) extras[key] = value;
	return extras;
}

// `app.plugins` is not in obsidian.d.ts. This is the one property the pane needs.
declare module "obsidian" {
	interface App {
		plugins?: { getPlugin(id: string): (Plugin & { api?: unknown }) | null };
	}
}

export default class TaskNotesTimerPanePlugin extends Plugin {
	private paneSettings: TimerPaneSettings = { ...DEFAULT_SETTINGS };
	private settingsReady: Promise<void> = Promise.resolve();
	private pauses: PauseStore | null = null;
	private cardOrder: CardOrderStore | null = null;
	/** Settings as last written to data.json; a pause-only save writes these. */
	private fileSettings: TimerPaneSettings = { ...DEFAULT_SETTINGS };
	/** Keys in the loaded data.json that this plugin does not own, preserved on every save. */
	private extras: Record<string, unknown> = {};
	/** Serializes saveData calls. Never rejects, so one failed save never blocks the next. */
	private saveChain: Promise<void> = Promise.resolve();

	/**
	 * The one writer of data.json (CTRL-04, T-03-04). Appends a save to the chain; the
	 * object is built when the save runs, so it always holds the newest pauses, and
	 * either the given settings (a settings save) or the settings last written (a pause
	 * save). The returned promise carries this save's own result or rejection.
	 */
	private persistAll(settings?: TimerPaneSettings): Promise<void> {
		const result = this.saveChain.then(async () => {
			const written = settings ? { ...settings } : this.fileSettings;
			const order = this.cardOrder?.serialize() ?? [];
			await this.saveData({
				...this.extras,
				completionStatus: written.completionStatus,
				pauseRecordsVersion: PAUSE_RECORDS_VERSION,
				pauseRecords: this.pauses?.serialize() ?? [],
				// Omitted when empty, so a user who never reorders keeps an unchanged data.json.
				...(order.length > 0 ? { cardOrder: order } : {}),
			});
			this.fileSettings = written;
		});
		this.saveChain = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	onload(): void {
		const log = (message: string) => console.error("[tasknotes-timer-pane] " + message);
		// Cancellable one-off timers; bridge.dispose() cancels any that are still pending.
		const schedule: Schedule = (fn, ms) => {
			const id = window.setTimeout(fn, ms);
			return () => window.clearTimeout(id);
		};
		const bridge = new TaskNotesBridge({
			lookupPlugin: () => this.app.plugins?.getPlugin(TASKNOTES_PLUGIN_ID) ?? null,
			log,
			schedule,
		});
		// The one pause store: plugin-scoped so pauses outlive the pane, shared by store and controller.
		// Every pause change rewrites data.json with the current settings too.
		const pauses = new PauseStore({ log, persist: () => this.persistAll() });
		this.pauses = pauses;
		// Pane-local card order, persisted through the same single writer.
		const cardOrder = new CardOrderStore({ log, persist: () => this.persistAll() });
		this.cardOrder = cardOrder;
		// The vault can only tell a deleted note from one not yet indexed once the layout is ready (Pitfall 2).
		let layoutReady = false;
		const store = new TimerStore({
			gateway: bridge,
			log,
			schedule,
			pauses,
			fileCheck: () => (layoutReady ? (path: string) => this.app.vault.getFileByPath(path) !== null : null),
		});
		// The one serial queue every pane write goes through.
		const queue = new WriteQueue();
		// The only place the plugin creates Notices; state and model code receive this function.
		const notify = (message: string) => {
			new Notice(message);
		};
		const newCorrelationId = () => crypto.randomUUID();
		const controller = new TimerController({ gateway: bridge, store, queue, notify, newCorrelationId, log, pauses,
			getSettings: () => this.paneSettings, settingsReady: () => this.settingsReady });
		this.register(() => {
			store.dispose();
			bridge.dispose();
		});

		// Registered synchronously so Obsidian can restore a saved pane leaf (PANE-03).
		this.registerView(VIEW_TYPE_TIMER_PANE, (leaf) => new TimerPaneView(leaf, { gateway: bridge, store, controller, cardOrder }));
		this.settingsReady = this.loadData().then((data: unknown) => {
			this.paneSettings = loadSettings(data);
			this.fileSettings = { ...this.paneSettings };
			this.extras = extrasOf(data);
			pauses.load(loadPauseRecords(data));
			cardOrder.load(loadCardOrder(data));
		}).catch(() => { log("Loading timer pane settings failed; using defaults."); pauses.load([]); cardOrder.load([]); });
		this.addSettingTab(new TimerPaneSettingTab(this.app, this, {
			gateway: bridge,
			getSettings: () => this.paneSettings,
			ready: () => this.settingsReady,
			saveSettings: async settings => {
				await this.settingsReady;
				await this.persistAll(settings);
				this.paneSettings = { ...settings };
				await store.refreshNow();
			},
		}));

		// Never blocks or waits on TaskNotes: the pane renders whatever state the bridge is in.
		const open = () =>
			void this.activateView().catch((error: unknown) =>
				log("Opening the timer pane failed: " + (error instanceof Error ? error.message : String(error))),
			);
		this.addRibbonIcon("timer", "Open TaskNotes timer", open);
		this.addCommand({ id: "open-timer-pane", name: "Open timer pane", callback: open });

		this.app.workspace.onLayoutReady(() => {
			layoutReady = true;
			bridge.probe();
		});
		this.registerInterval(window.setInterval(() => bridge.probe(), PROBE_INTERVAL_MS));
		// Backstop for anything no event reports; a no-op unless TaskNotes is ready.
		this.registerInterval(window.setInterval(() => store.resync(), SAFETY_RESYNC_MS));
		// Deleting or renaming a note in Obsidian emits no TaskNotes runtime event (Pitfall 4).
		// These are Obsidian-owned events, so Obsidian's registry releases them on unload.
		// The pause changes synchronously, before TaskNotes re-indexes the note under its new
		// path and before the next refresh reads it (D-12). Also works for folders.
		this.registerEvent(this.app.vault.on("delete", file => {
			pauses.removePath(file.path);
			store.requestRefresh();
		}));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			pauses.renamePath(oldPath, file.path);
			store.requestRefresh();
		}));
	}

	/** Reveals the existing pane leaf wherever it is, or creates one in the right sidebar. Never a second leaf. */
	private async activateView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_TIMER_PANE)[0];
		if (existing) {
			await workspace.revealLeaf(existing);
			return;
		}
		await workspace.ensureSideLeaf(VIEW_TYPE_TIMER_PANE, "right", { active: true, reveal: true });
	}
}

