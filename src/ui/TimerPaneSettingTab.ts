import { Notice, PluginSettingTab, Setting, type App, type Plugin, type DropdownComponent } from "obsidian";
import { resolveCompletionStatus, type TimerPaneSettings } from "../settings";
import { ROLLOVER_HOURS, isRolloverHour, rolloverHourLabel } from "../model/stagingDay";
import type { TaskNotesGateway } from "../tasknotes/TaskNotesBridge";
import type { TaskStatus } from "../tasknotes/runtime-api.types";

export interface TimerPaneSettingDeps {
	gateway: Pick<TaskNotesGateway, "statuses">;
	getSettings: () => TimerPaneSettings;
	saveSettings: (settings: TimerPaneSettings) => Promise<void>;
	ready: () => Promise<void>;
}

export class TimerPaneSettingTab extends PluginSettingTab {
	private generation = 0;
	constructor(app: App, plugin: Plugin, private readonly deps: TimerPaneSettingDeps) { super(app, plugin); }

	display(): void { void this.render(++this.generation); }
	hide(): void { this.generation++; }

	private async render(generation: number): Promise<void> {
		this.containerEl.empty();
		let statuses: TaskStatus[] = [];
		let unavailable = false;
		try { await this.deps.ready(); statuses = await this.deps.gateway.statuses(); }
		catch { unavailable = true; }
		if (generation !== this.generation) return;
		const completed = statuses.filter(status => status.isCompleted === true);
		const preference = this.deps.getSettings().completionStatus;
		const validExplicit = preference !== null && completed.some(status => status.value === preference);
		const resolved = resolveCompletionStatus(statuses, preference);
		const description = unavailable ? "TaskNotes statuses are unavailable. Try opening these settings again when TaskNotes is ready."
			: !resolved ? "TaskNotes has no completed statuses. Complete is disabled until one is available."
			: preference !== null && !validExplicit ? "The saved status is unavailable. Same as TaskNotes uses the first completed status."
			: "Same as TaskNotes uses the first completed status. Complete sets this status, then stops the task's timer.";
		new Setting(this.containerEl)
			.setName("Completion status")
			.setDesc(description)
			.addDropdown(dropdown => {
				dropdown.addOption("default", "Same as TaskNotes");
				completed.forEach((status, index) => { dropdown.addOption(String(index), status.label ?? status.value); });
				dropdown.setValue(validExplicit ? String(completed.findIndex(status => status.value === preference)) : "default");
				dropdown.onChange(value => {
					const choice = value === "default" ? null : completed[Number(value)]?.value;
					if (choice !== undefined && generation === this.generation) {
						void this.savePatch(dropdown, generation, { completionStatus: choice }, "Couldn't save the completion status. Try again.");
					}
				});
			});
		// Rendered whatever the TaskNotes status catalog did (D-04).
		new Setting(this.containerEl)
			.setName("Rollover hour")
			.setDesc("The staging day starts at this hour. Earlier times count toward the previous day: with the default, 1:30 at night still counts as yesterday.")
			.addDropdown(dropdown => {
				for (const hour of ROLLOVER_HOURS) dropdown.addOption(String(hour), rolloverHourLabel(hour));
				dropdown.setValue(String(this.deps.getSettings().rolloverHour));
				dropdown.onChange(value => {
					// Only an option value saves: the round trip rejects "", " 6" and "06", which Number() accepts.
					const rolloverHour = Number(value);
					if (isRolloverHour(rolloverHour) && String(rolloverHour) === value && generation === this.generation) {
						void this.savePatch(dropdown, generation, { rolloverHour }, "Couldn't save the rollover hour. Try again.");
					}
				});
			});
	}

	/** Saves one changed setting over the current ones, so no other setting is lost (D-07). */
	private async savePatch(dropdown: DropdownComponent, generation: number, patch: Partial<TimerPaneSettings>, failureMessage: string): Promise<void> {
		dropdown.setDisabled(true);
		try { await this.deps.saveSettings({ ...this.deps.getSettings(), ...patch }); }
		catch {
			try { new Notice(failureMessage); }
			catch { console.error("[tasknotes-timer-pane] Showing the settings Notice failed."); }
		}
		finally { if (generation === this.generation) this.display(); }
	}
}
