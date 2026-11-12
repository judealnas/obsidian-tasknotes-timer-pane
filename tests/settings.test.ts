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
function setup(preference: string | null = null, rolloverHour = 7) {
	const gateway = createFakeGateway();
	gateway.statuses = vi.fn(() => Promise.resolve(catalog));
	let current: settings.TimerPaneSettings = { completionStatus: preference, rolloverHour };
	const saveSettings = vi.fn(async (next: settings.TimerPaneSettings) => { current = next; });
	const tab = new TimerPaneSettingTab({} as App, {} as Plugin, { gateway, getSettings: () => current, saveSettings, ready: () => Promise.resolve() });
	return { gateway, saveSettings, tab, current: () => current };
}

describe("completion settings", () => {
	test("saved data has a narrow validating loader", () => {
		expect(settings).toHaveProperty("loadSettings", expect.any(Function));
	});
	test.each([undefined, null, [], "done-a", 4, {}, { completionStatus: false }, { completionStatus: [] }])("malformed saved data %j becomes Same as TaskNotes", value => {
		expect(settings.loadSettings(value)).toEqual({ completionStatus: null, rolloverHour: 4 });
	});
	test("accepts an exact string or null and ignores foreign fields", () => {
		expect(settings.loadSettings({ completionStatus: " done-a ", other: true })).toEqual({ completionStatus: " done-a ", rolloverHour: 4 });
		expect(settings.loadSettings({ completionStatus: null })).toEqual({ completionStatus: null, rolloverHour: 4 });
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
		expect(ctx.saveSettings).toHaveBeenLastCalledWith({ completionStatus: "done-a", rolloverHour: 7 });
		host.settings[0]!.dropdown.change("default"); await flush();
		expect(ctx.saveSettings).toHaveBeenLastCalledWith({ completionStatus: null, rolloverHour: 7 });
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

const LABELS = [
	"12 AM", "1 AM", "2 AM", "3 AM", "4 AM", "5 AM", "6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM",
	"12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM", "9 PM", "10 PM", "11 PM",
];
const ROLLOVER_DESCRIPTION = "The staging day starts at this hour. Earlier times count toward the previous day: with the default, 1:30 at night still counts as yesterday.";

describe("rollover hour settings", () => {
	test.each([0, 4, 23])("a saved rollover hour %i loads as given", hour => {
		expect(settings.loadSettings({ rolloverHour: hour }).rolloverHour).toBe(hour);
	});
	test.each([24, -1, 3.5, "6", null, NaN, Infinity, true])("a malformed rollover hour %j loads 4", hour => {
		expect(settings.loadSettings({ completionStatus: "done-a", rolloverHour: hour })).toEqual({ completionStatus: "done-a", rolloverHour: 4 });
	});
	test("an out-of-range hour beside foreign fields keeps the completion status exactly", () => {
		expect(settings.loadSettings({ completionStatus: " done-a ", rolloverHour: 99, other: true })).toEqual({ completionStatus: " done-a ", rolloverHour: 4 });
	});
	test("the rollover setting lists 24 fixed 12-hour labels and shows the saved hour", async () => {
		const ctx = setup("done-b", 7); ctx.tab.display(); await flush();
		const rollover = host.settings[1]!;
		expect(rollover.name).toBe("Rollover hour");
		expect(rollover.dropdown.options.map(option => option.value)).toEqual(Array.from({ length: 24 }, (_, i) => String(i)));
		expect(rollover.dropdown.options.map(option => option.label)).toEqual(LABELS);
		expect(rollover.dropdown.value).toBe("7");
	});
	test("the rollover description explains the previous day rule", async () => {
		const ctx = setup(); ctx.tab.display(); await flush();
		expect(host.settings[1]!.description).toBe(ROLLOVER_DESCRIPTION);
		expect(host.settings[1]!.description).toContain("previous day");
	});
	test("choosing a completion status keeps the rollover hour, and choosing an hour keeps the status", async () => {
		const ctx = setup("done-b", 7); ctx.tab.display(); await flush();
		host.settings[0]!.dropdown.change("1"); await flush(); await flush();
		expect(ctx.saveSettings).toHaveBeenLastCalledWith({ completionStatus: "done-a", rolloverHour: 7 });
		const other = setup("done-b", 7); resetHost(); other.tab.display(); await flush();
		host.settings[1]!.dropdown.change("6"); await flush(); await flush();
		expect(other.saveSettings).toHaveBeenLastCalledWith({ completionStatus: "done-b", rolloverHour: 6 });
	});
	test.each(["completion first", "rollover first"])("saving in either order (%s) keeps both choices", async order => {
		const ctx = setup("done-b", 7); ctx.tab.display(); await flush();
		const steps = [() => host.settings[0]!.dropdown.change("1"), () => host.settings[1]!.dropdown.change("6")];
		if (order === "rollover first") steps.reverse();
		for (const step of steps) { step(); await flush(); await flush(); }
		expect(ctx.current()).toEqual({ completionStatus: "done-a", rolloverHour: 6 });
		expect(ctx.saveSettings).toHaveBeenCalledTimes(2);
	});
	test.each(["empty", "failure"])("the rollover setting renders when the status catalog is %s", async mode => {
		const ctx = setup(null, 5);
		ctx.gateway.statuses = () => mode === "empty" ? Promise.resolve([]) : Promise.reject(new Error("private/path status"));
		ctx.tab.display(); await flush();
		expect(host.settings[1]!.name).toBe("Rollover hour");
		expect(host.settings[1]!.dropdown.options).toHaveLength(24);
		expect(host.settings[1]!.dropdown.value).toBe("5");
	});
	test("a failed rollover save shows a fixed Notice and redisplays the old hour", async () => {
		const ctx = setup("done-b", 7);
		ctx.saveSettings.mockRejectedValue(new Error("private/path status"));
		ctx.tab.display(); await flush(); host.settings[1]!.dropdown.change("6"); await flush(); await flush();
		expect(host.notices).toEqual(["Couldn't save the rollover hour. Try again."]);
		expect(host.settings[1]!.dropdown.value).toBe("7");
	});
	test.each(["24", "x", "-1", "3.5", ""])("a dropdown value %j never saves", async value => {
		const ctx = setup("done-b", 7); ctx.tab.display(); await flush();
		host.settings[1]!.dropdown.change(value); await flush();
		expect(ctx.saveSettings.mock.calls.length).toBe(0);
	});
});

