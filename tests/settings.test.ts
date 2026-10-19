import { beforeEach, describe, expect, test, vi } from "vitest";
import type { App, Plugin } from "obsidian";
import * as settings from "../src/settings";
import { createFakeGateway } from "./fakes/fakeGateway";
import { host, resetHost } from "./fakes/fakeObsidian";
import { TimerPaneSettingTab } from "../src/ui/TimerPaneSettingTab";

vi.mock("obsidian", () => import("./fakes/fakeObsidian"));
beforeEach(resetHost);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const catalog = [
	{ value: "open", label: "Open", isCompleted: false },
	{ value: "done-b", label: "Done B", isCompleted: true },
	{ value: "done-a", label: "Done A", isCompleted: true },
];
function setup(preference: string | null = null) {
	const gateway = createFakeGateway();
	gateway.statuses = vi.fn(() => Promise.resolve(catalog));
	let current = { completionStatus: preference };
	const saveSettings = vi.fn(async (next: settings.TimerPaneSettings) => { current = next; });
	const tab = new TimerPaneSettingTab({} as App, {} as Plugin, { gateway, getSettings: () => current, saveSettings, ready: () => Promise.resolve() });
	return { gateway, saveSettings, tab };
}

describe("completion settings", () => {
	test("saved data has a narrow validating loader", () => {
		expect(settings).toHaveProperty("loadSettings", expect.any(Function));
	});
	test.each([undefined, null, [], "done-a", 4, {}, { completionStatus: false }, { completionStatus: [] }])("malformed saved data %j becomes Same as TaskNotes", value => {
		expect(settings.loadSettings(value)).toEqual({ completionStatus: null });
	});
	test("accepts an exact string or null and ignores foreign fields", () => {
		expect(settings.loadSettings({ completionStatus: " done-a ", other: true })).toEqual({ completionStatus: " done-a " });
		expect(settings.loadSettings({ completionStatus: null })).toEqual({ completionStatus: null });
	});
	test("reads each display and lists sentinel followed by completed statuses in live order", async () => {
		const ctx = setup("done-a"); ctx.tab.display(); await flush();
		expect(host.settings[0]!.dropdown.options).toEqual([{ value: "default", label: "Same as TaskNotes" }, { value: "0", label: "Done B" }, { value: "1", label: "Done A" }]);
		expect(host.settings[0]!.dropdown.value).toBe("1");
		ctx.gateway.statuses = vi.fn(() => Promise.resolve([catalog[2]!, catalog[1]!]));
		ctx.tab.display(); await flush();
		expect(host.settings[0]!.dropdown.options.map(option => option.label)).toEqual(["Same as TaskNotes", "Done A", "Done B"]);
	});
	test("persists exact choice, then sentinel; display alone never writes stale fallback", async () => {
		const ctx = setup("removed"); ctx.tab.display(); await flush();
		expect(host.settings[0]!.dropdown.value).toBe("default");
		expect(host.settings[0]!.description).toContain("saved status is unavailable");
		expect(ctx.saveSettings).not.toHaveBeenCalled();
		host.settings[0]!.dropdown.change("1"); await flush(); await flush();
		expect(ctx.saveSettings).toHaveBeenLastCalledWith({ completionStatus: "done-a" });
		host.settings[0]!.dropdown.change("default"); await flush();
		expect(ctx.saveSettings).toHaveBeenLastCalledWith({ completionStatus: null });
	});
	test.each(["empty", "failure"])("%s catalog keeps a safe sentinel and normalized explanation", async mode => {
		const ctx = setup("removed");
		ctx.gateway.statuses = () => mode === "empty" ? Promise.resolve([]) : Promise.reject(new Error("private/path status"));
		ctx.tab.display(); await flush();
		expect(host.settings[0]!.dropdown.options).toEqual([{ value: "default", label: "Same as TaskNotes" }]);
		expect(host.settings[0]!.description).not.toContain("private");
		expect(host.settings[0]!.description).toContain(mode === "empty" ? "no completed statuses" : "unavailable");
	});
	test("hide and redisplay discard stale asynchronous catalog reads", async () => {
		const ctx = setup();
		let release!: (value: typeof catalog) => void;
		ctx.gateway.statuses = () => new Promise(resolve => { release = resolve; });
		ctx.tab.display(); await flush(); ctx.tab.hide(); release(catalog); await flush();
		expect(host.settings).toEqual([]);
		ctx.gateway.statuses = () => Promise.resolve([]);
		ctx.tab.display(); await flush();
		expect(host.settings[0]!.dropdown.options).toHaveLength(1);
	});
	test("failed save keeps old choice and emits no raw error", async () => {
		const ctx = setup("done-b");
		ctx.saveSettings.mockRejectedValue(new Error("private/path status"));
		ctx.tab.display(); await flush(); host.settings[0]!.dropdown.change("1"); await flush(); await flush();
		expect(host.notices).toEqual(["Couldn't save the completion status. Try again."]);
		expect(host.settings[0]!.dropdown.value).toBe("0");
	});
});

