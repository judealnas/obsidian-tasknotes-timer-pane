/*
 * The pane's write controller (CTRL-01). Only a user click reaches it: the pane
 * never stops a timer on its own (D-05). Stopping on completion, which also covers
 * the user's archive flow, is TaskNotes' own job through its own setting.
 * Runtime Obsidian-free so Vitest can load it; Notices arrive through `notify`.
 */
import { isNoActiveSessionError, stopFailedNotice } from "../model/errors";
import { MUTATION_SOURCE, type TaskNotesGateway } from "../tasknotes/TaskNotesBridge";
import type { TimerStore } from "./TimerStore";
import type { WriteQueue } from "./WriteQueue";

/** The displayed timer, captured by the view at click time. */
export type StopTarget = { taskPath: string; startTime: string; title: string };

/**
 * - "stopped": TaskNotes closed the entry.
 * - "already-stopped": TaskNotes had no open entry (a benign race, no Notice).
 * - "failed": any other error; the Stop-failed Notice was shown.
 */
export type StopOutcome = "stopped" | "already-stopped" | "failed";

export interface TimerControllerDeps {
	gateway: Pick<TaskNotesGateway, "stop" | "normalizeError">;
	store: Pick<TimerStore, "refreshNow">;
	queue: WriteQueue;
	notify: (message: string) => void;
	newCorrelationId: () => string;
	log: (message: string) => void;
}

export class TimerController {
	private readonly deps: TimerControllerDeps;

	constructor(deps: TimerControllerDeps) {
		this.deps = deps;
	}

	/**
	 * Stops exactly the target task, through the shared write queue, then re-derives
	 * the pane from TaskNotes. Never touches any other running timer. Never rejects.
	 */
	async stop(target: StopTarget): Promise<StopOutcome> {
		const { gateway, store, queue, notify, newCorrelationId, log } = this.deps;
		let outcome: StopOutcome;
		try {
			await queue.run(() =>
				gateway.stop(target.taskPath, {
					source: MUTATION_SOURCE,
					reason: "user stop",
					correlationId: newCorrelationId(),
				}),
			);
			outcome = "stopped";
		} catch (error) {
			const { message } = gateway.normalizeError(error);
			if (isNoActiveSessionError(message)) {
				outcome = "already-stopped";
			} else {
				// Includes task_not_found (RESEARCH Open Question 1): show the Notice, then refresh.
				log(`Stopping the timer for ${target.taskPath} failed: ${message}`);
				try {
					notify(stopFailedNotice(target.title, message));
				} catch (notifyError) {
					log("Showing the Stop-failed Notice failed: " + String(notifyError));
				}
				outcome = "failed";
			}
		}
		await store.refreshNow();
		return outcome;
	}
}
