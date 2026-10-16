import { afterEach, beforeEach, expect, test, vi } from "vitest";
import TaskNotesTimerPanePlugin from "../src/main";
import { host, resetHost } from "./fakes/fakeObsidian";
import type { TimerPaneSettingTab } from "../src/ui/TimerPaneSettingTab";
import type { App, PluginManifest } from "obsidian";

vi.mock("obsidian", () => import("./fakes/fakeObsidian"));
beforeEach(() => { resetHost(); vi.useFakeTimers(); vi.stubGlobal("window", { setTimeout, clearTimeout, setInterval }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test("registers view synchronously before loading settings and registering tab", async () => {
	host.data = { completionStatus: "removed" };
	const plugin = new TaskNotesTimerPanePlugin({} as App, {} as PluginManifest); plugin.onload();
	expect(host.order).toEqual(["view", "load", "settings"]);
	(host.tabs[0] as TimerPaneSettingTab).display(); await flush();
	expect(host.settings[0]!.dropdown.options).toEqual([{ value: "default", label: "Same as TaskNotes" }]);
	expect(host.saved).toEqual([]);
	host.settings[0]!.dropdown.change("default"); await flush();
	expect(host.saved).toEqual([{ completionStatus: null }]);
});

test("loading failures keep the plugin usable and log a safe explanation", async () => {
	const plugin = new TaskNotesTimerPanePlugin({} as App, {} as PluginManifest);
	vi.spyOn(plugin, "loadData").mockRejectedValue(new Error("private/path"));
	const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
	plugin.onload(); (host.tabs[0] as TimerPaneSettingTab).display(); await flush();
	expect(host.settings).toHaveLength(1);
	expect(log).toHaveBeenCalledWith("[tasknotes-timer-pane] Loading timer pane settings failed; using defaults.");
	log.mockRestore();
});

