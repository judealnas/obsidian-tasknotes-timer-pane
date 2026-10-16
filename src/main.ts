import { Notice, Plugin } from "obsidian";
import { TimerController } from "./state/TimerController";
import { SAFETY_RESYNC_MS, TimerStore } from "./state/TimerStore";
import { WriteQueue } from "./state/WriteQueue";
import { PROBE_INTERVAL_MS, TASKNOTES_PLUGIN_ID, TaskNotesBridge, type Schedule } from "./tasknotes/TaskNotesBridge";
import { TimerPaneView, VIEW_TYPE_TIMER_PANE } from "./ui/TimerPaneView";
import { DEFAULT_SETTINGS, loadSettings, type TimerPaneSettings } from "./settings";
import { TimerPaneSettingTab } from "./ui/TimerPaneSettingTab";

// `app.plugins` is not in obsidian.d.ts. This is the one property the pane needs.
declare module "obsidian" {
	interface App {
		plugins?: { getPlugin(id: string): (Plugin & { api?: unknown }) | null };
	}
}

export default class TaskNotesTimerPanePlugin extends Plugin {
	private paneSettings: TimerPaneSettings = { ...DEFAULT_SETTINGS };
	private settingsReady: Promise<void> = Promise.resolve();
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
		const store = new TimerStore({ gateway: bridge, log, schedule });
		// The one serial queue every pane write goes through.
		const queue = new WriteQueue();
		// The only place the plugin creates Notices; state and model code receive this function.
		const notify = (message: string) => {
			new Notice(message);
		};
		const newCorrelationId = () => crypto.randomUUID();
		const controller = new TimerController({ gateway: bridge, store, queue, notify, newCorrelationId, log,
			getSettings: () => this.paneSettings, settingsReady: () => this.settingsReady });
		this.register(() => {
			store.dispose();
			bridge.dispose();
		});

		// Registered synchronously so Obsidian can restore a saved pane leaf (PANE-03).
		this.registerView(VIEW_TYPE_TIMER_PANE, (leaf) => new TimerPaneView(leaf, { gateway: bridge, store, controller }));
		this.settingsReady = this.loadData().then((data: unknown) => { this.paneSettings = loadSettings(data); })
			.catch(() => { log("Loading timer pane settings failed; using defaults."); });
		this.addSettingTab(new TimerPaneSettingTab(this.app, this, {
			gateway: bridge,
			getSettings: () => this.paneSettings,
			ready: () => this.settingsReady,
			saveSettings: async settings => {
				await this.settingsReady;
				await this.saveData(settings);
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

		this.app.workspace.onLayoutReady(() => bridge.probe());
		this.registerInterval(window.setInterval(() => bridge.probe(), PROBE_INTERVAL_MS));
		// Backstop for anything no event reports; a no-op unless TaskNotes is ready.
		this.registerInterval(window.setInterval(() => store.resync(), SAFETY_RESYNC_MS));
		// Deleting or renaming a note in Obsidian emits no TaskNotes runtime event (Pitfall 4).
		// These are Obsidian-owned events, so Obsidian's registry releases them on unload.
		this.registerEvent(this.app.vault.on("delete", () => store.requestRefresh()));
		this.registerEvent(this.app.vault.on("rename", () => store.requestRefresh()));
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

