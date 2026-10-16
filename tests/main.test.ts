import { afterEach, beforeEach, expect, test, vi } from "vitest";
import TaskNotesTimerPanePlugin from "../src/main";
import { host, resetHost } from "./fakes/fakeObsidian";
import type { TimerPaneSettingTab } from "../src/ui/TimerPaneSettingTab";
import type { TimerPaneSettings } from "../src/settings";
import type { App, PluginManifest } from "obsidian";

vi.mock("obsidian", () => import("./fakes/fakeObsidian"));
beforeEach(() => { resetHost(); vi.useFakeTimers(); vi.stubGlobal("window", { setTimeout, clearTimeout, setInterval }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

const PAUSED = {
	state: "paused",
	taskPath: "TaskNotes/Tasks/Write report.md",
	title: "Write report",
	sessionStartedAt: "2026-10-14T09:00:00.000Z",
	accumulatedMs: 600_000,
	pausedAt: "2026-10-14T09:10:00.000Z",
	lastEntryStart: "2026-10-14T09:00:00.000Z",
};

/** The settings tab's own save path, the one the dropdown calls. */
function saveSettingsOf(tab: unknown): (settings: TimerPaneSettings) => Promise<void> {
	return (tab as { deps: { saveSettings: (settings: TimerPaneSettings) => Promise<void> } }).deps.saveSettings;
}

test("registers view synchronously before loading settings and registering tab", async () => {
	host.data = { completionStatus: "removed" };
	const plugin = new TaskNotesTimerPanePlugin({} as App, {} as PluginManifest); plugin.onload();
	expect(host.order).toEqual(["view", "load", "settings"]);
	(host.tabs[0] as TimerPaneSettingTab).display(); await flush();
	expect(host.settings[0]!.dropdown.options).toEqual([{ value: "default", label: "Same as TaskNotes" }]);
	expect(host.saved).toEqual([]);
	host.settings[0]!.dropdown.change("default"); await flush();
	expect(host.saved).toEqual([{ completionStatus: null, pauseRecordsVersion: 1, pauseRecords: [] }]);
});

test("loading failures keep the plugin usable and log a safe explanation", async () => {
	const plugin = new TaskNotesTimerPanePlugin({} as App, {} as PluginManifest);
	vi.spyOn(plugin, "loadData").mockRejectedValue(new Error("private/path"));
	const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
	plugin.onload(); (host.tabs[0] as TimerPaneSettingTab).display(); await flush();
	expect(host.settings).toHaveLength(1);
	expect(log).toHaveBeenCalledWith("[tasknotes-timer-pane] Loading timer pane settings failed; using defaults.");
	await saveSettingsOf(host.tabs[0])({ completionStatus: "done" });
	expect(host.saved).toEqual([{ completionStatus: "done", pauseRecordsVersion: 1, pauseRecords: [] }]);
	log.mockRestore();
});

test("stored pauses survive a restart and a settings save keeps them, the settings and unknown keys together", async () => {
	host.data = { completionStatus: "x", pauseRecordsVersion: 1, pauseRecords: [PAUSED], extraKey: 1 };
	const plugin = new TaskNotesTimerPanePlugin({} as App, {} as PluginManifest); plugin.onload();
	await flush();
	await saveSettingsOf(host.tabs[0])({ completionStatus: "done" });
	expect(host.saved).toEqual([{ extraKey: 1, completionStatus: "done", pauseRecordsVersion: 1, pauseRecords: [PAUSED] }]);
});

test("back-to-back settings saves never overlap, run in order and end with the newest setting and the pauses", async () => {
	host.data = { completionStatus: "x", pauseRecordsVersion: 1, pauseRecords: [PAUSED] };
	const plugin = new TaskNotesTimerPanePlugin({} as App, {} as PluginManifest);
	const calls: unknown[] = [];
	const releases: Array<() => void> = [];
	let inFlight = 0;
	let maxInFlight = 0;
	plugin.saveData = (value: unknown) => {
		calls.push(structuredClone(value));
		maxInFlight = Math.max(maxInFlight, ++inFlight);
		return new Promise<void>(resolve => releases.push(() => { inFlight--; resolve(); }));
	};
	plugin.onload();
	await flush();
	const save = saveSettingsOf(host.tabs[0]);
	const first = save({ completionStatus: "first" });
	await flush();
	const second = save({ completionStatus: "second" });
	await flush();
	expect(calls).toHaveLength(1);
	releases[0]!();
	await flush();
	expect(calls).toHaveLength(2);
	releases[1]!();
	await Promise.all([first, second]);
	expect(maxInFlight).toBe(1);
	expect(calls.map(call => (call as { completionStatus: unknown }).completionStatus)).toEqual(["first", "second"]);
	expect(calls[1]).toEqual({ completionStatus: "second", pauseRecordsVersion: 1, pauseRecords: [PAUSED] });
});

test("a failed settings save rejects to the caller and does not break later saves", async () => {
	host.data = { completionStatus: "x" };
	const plugin = new TaskNotesTimerPanePlugin({} as App, {} as PluginManifest); plugin.onload();
	await flush();
	const save = saveSettingsOf(host.tabs[0]);
	host.failSave = true;
	await expect(save({ completionStatus: "lost" })).rejects.toThrow();
	host.failSave = false;
	await save({ completionStatus: "kept" });
	expect(host.saved).toEqual([{ completionStatus: "kept", pauseRecordsVersion: 1, pauseRecords: [] }]);
});
