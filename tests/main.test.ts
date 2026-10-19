import { afterEach, beforeEach, expect, test, vi } from "vitest";
import TaskNotesTimerPanePlugin from "../src/main";
import { emitVault, fireLayoutReady, host, resetHost } from "./fakes/fakeObsidian";
import type { TimerStore, TimerStoreDeps } from "../src/state/TimerStore";
import type { PauseStore } from "../src/state/PauseStore";
import type { TimerPaneSettingTab } from "../src/ui/TimerPaneSettingTab";
import type { TimerPaneSettings } from "../src/settings";
import type { App, PluginManifest } from "obsidian";

vi.mock("obsidian", () => import("./fakes/fakeObsidian"));
// Captures the TimerStore main.ts builds, with its deps, so tests can reach fileCheck and requestRefresh.
const captured = vi.hoisted(() => ({ stores: [] as Array<{ deps: unknown; store: unknown }> }));
vi.mock("../src/state/TimerStore", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/state/TimerStore")>();
	class CapturingTimerStore extends actual.TimerStore {
		constructor(deps: TimerStoreDeps) {
			super(deps);
			captured.stores.push({ deps, store: this });
		}
	}
	return { ...actual, TimerStore: CapturingTimerStore };
});
beforeEach(() => { resetHost(); captured.stores = []; vi.useFakeTimers(); vi.stubGlobal("window", { setTimeout, clearTimeout, setInterval }); });
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

test("a pause change writes data.json with the settings last saved, never an older setting", async () => {
	host.data = { completionStatus: "x", extraKey: 1 };
	const plugin = new TaskNotesTimerPanePlugin({} as App, {} as PluginManifest);
	const calls: unknown[] = [];
	const releases: Array<() => void> = [];
	plugin.saveData = (value: unknown) => {
		calls.push(structuredClone(value));
		return new Promise<void>(resolve => releases.push(resolve));
	};
	plugin.onload();
	await flush();
	const pauses = (plugin as unknown as { pauses: { set(record: unknown): void } }).pauses;
	const settingsSave = saveSettingsOf(host.tabs[0])({ completionStatus: "newer" });
	await flush();
	// The settings write is in flight; this pause save queues behind it.
	pauses.set(PAUSED);
	releases[0]!();
	await settingsSave; await flush();
	releases[1]!();
	await flush();
	expect(calls).toEqual([
		{ extraKey: 1, completionStatus: "newer", pauseRecordsVersion: 1, pauseRecords: [] },
		{ extraKey: 1, completionStatus: "newer", pauseRecordsVersion: 1, pauseRecords: [PAUSED] },
	]);
});

// ---- plan 03-02: vault rename/delete follow the pause (D-12) ----

function started(data: unknown) {
	host.data = data;
	const plugin = new TaskNotesTimerPanePlugin({} as App, {} as PluginManifest);
	plugin.onload();
	const pauses = (plugin as unknown as { pauses: PauseStore }).pauses;
	const entry = captured.stores[0] as { deps: TimerStoreDeps; store: TimerStore };
	const seen: string[][] = [];
	vi.spyOn(entry.store, "requestRefresh").mockImplementation(() => {
		seen.push(pauses.records().map(record => record.taskPath));
	});
	return { plugin, pauses, deps: entry.deps, seen };
}

test("the vault rename handler moves the pause before it requests a refresh", async () => {
	const ctx = started({ pauseRecordsVersion: 1, pauseRecords: [PAUSED] });
	await flush();
	emitVault("rename", { path: "TaskNotes/Tasks/Renamed.md" }, PAUSED.taskPath);
	expect(ctx.seen).toEqual([["TaskNotes/Tasks/Renamed.md"]]);
	expect(ctx.pauses.get("TaskNotes/Tasks/Renamed.md")).toEqual({ ...PAUSED, taskPath: "TaskNotes/Tasks/Renamed.md" });
});

test("the vault delete handler removes the pause before it requests a refresh", async () => {
	const ctx = started({ pauseRecordsVersion: 1, pauseRecords: [PAUSED] });
	await flush();
	emitVault("delete", { path: PAUSED.taskPath });
	expect(ctx.seen).toEqual([[]]);
});

test("a folder rename moves every pause inside it", async () => {
	const ctx = started({ pauseRecordsVersion: 1, pauseRecords: [PAUSED] });
	await flush();
	emitVault("rename", { path: "Archive/Tasks" }, "TaskNotes/Tasks");
	expect(ctx.seen).toEqual([["Archive/Tasks/Write report.md"]]);
});

test("fileCheck is null before layout ready and backed by vault.getFileByPath after it", () => {
	const ctx = started(undefined);
	const fileCheck = ctx.deps.fileCheck;
	expect(fileCheck).toBeTypeOf("function");
	expect(fileCheck!()).toBeNull();
	fireLayoutReady();
	const exists = fileCheck!();
	expect(exists).toBeTypeOf("function");
	host.files.add(PAUSED.taskPath);
	expect(exists!(PAUSED.taskPath)).toBe(true);
	expect(exists!("TaskNotes/Tasks/Gone.md")).toBe(false);
});
