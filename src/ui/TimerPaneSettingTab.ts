import { Notice, PluginSettingTab, Setting, type App, type Plugin, type DropdownComponent } from "obsidian";
import { resolveCompletionStatus, type TimerPaneSettings } from "../settings";
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
					if (choice !== undefined && generation === this.generation) void this.saveChoice(dropdown, generation, choice);
				});
			});
	}

	private async saveChoice(dropdown: DropdownComponent, generation: number, choice: string | null): Promise<void> {
		dropdown.setDisabled(true);
		try { await this.deps.saveSettings({ completionStatus: choice }); }
		catch {
			try { new Notice("Couldn't save the completion status. Try again."); }
			catch { console.error("[tasknotes-timer-pane] Showing the settings Notice failed."); }
		}
		finally { if (generation === this.generation) this.display(); }
	}
}
