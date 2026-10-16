/*
 * The pane's write controller (CTRL-01). Only a user click reaches it: the pane
 * never stops a timer on its own (D-05). Stopping on completion, which also covers
 * the user's archive flow, is TaskNotes' own job through its own setting.
 * Runtime Obsidian-free so Vitest can load it; Notices arrive through `notify`.
 */
import { isNoActiveSessionError, stopFailedNotice } from "../model/errors";
import { sameEntry, selectRegularStopTargets } from "../model/pomodoroOwnership";
import { MUTATION_SOURCE, type TaskNotesGateway } from "../tasknotes/TaskNotesBridge";
import type { TimerStore } from "./TimerStore";
import type { WriteQueue } from "./WriteQueue";

/** The displayed timer, captured by the view at click time. */
export type StopTarget = { taskPath: string; startTime: string; title: string };
export type StartTarget = { taskPath: string; title: string };
export type StartOutcome = "started" | "already-running" | "failed";

/**
 * - "stopped": TaskNotes closed the entry.
 * - "already-stopped": TaskNotes had no open entry (a benign race, no Notice).
 * - "failed": any other error; the Stop-failed Notice was shown.
 */
export type StopOutcome = "stopped" | "already-stopped" | "failed";

export interface TimerControllerDeps {
	gateway: Pick<TaskNotesGateway, "stop" | "normalizeError" | "active" | "start" | "pomodoroOwnership">;
	store: Pick<TimerStore, "refreshNow">;
	queue: WriteQueue;
	notify: (message: string) => void;
	newCorrelationId: () => string;
	log: (message: string) => void;
}

export class TimerController {
	async stopAll(): Promise<{ stopped: number; skipped: number; failed: number; ownershipUnreadable: boolean }> {
		const outcome = { stopped: 0, skipped: 0, failed: 0, ownershipUnreadable: false };
		const { gateway, queue, store, newCorrelationId, log } = this.deps;
		this.busy(1);
		try {
			await queue.run(async () => {
				const ownership = await gateway.pomodoroOwnership();
				if (!ownership.readable) { outcome.ownershipUnreadable = true; return; }
				const targets = selectRegularStopTargets(await gateway.active(), ownership);
				for (const target of targets) {
					const active = await gateway.active();
					const current = await gateway.pomodoroOwnership();
					if (!current.readable) { outcome.ownershipUnreadable = true; break; }
					if (!selectRegularStopTargets(active, current).some(id => sameEntry(id, target))) { outcome.skipped++; continue; }
					try {
						// Public stop is path-only. External replacement after this final read
						// can still race this write; the pane queue cannot make it atomic.
						await gateway.stop(target.taskPath, { source: MUTATION_SOURCE, reason: "user stop all", correlationId: newCorrelationId() });
						outcome.stopped++;
					} catch (error) {
						if (isNoActiveSessionError(gateway.normalizeError(error).message)) outcome.skipped++;
						else outcome.failed++;
					}
				}
			});
		} catch {
			outcome.failed++;
			log("Stopping all timers could not finish safely.");
		} finally {
			try { await store.refreshNow(); } finally { this.busy(-1); }
		}
		if (outcome.ownershipUnreadable) this.notice("Couldn't verify Pomodoro ownership. Stop all has stopped; try again when TaskNotes is ready.");
		else if (outcome.failed) this.notice(`Stopped ${outcome.stopped} timers. ${outcome.failed} timers could not be stopped. Try again.`);
		return outcome;
	}
	private readonly deps: TimerControllerDeps;
	private pending = 0;
	private readonly busyListeners = new Set<() => void>();

	isBusy(): boolean { return this.pending > 0; }
	subscribeBusy(listener: () => void): () => void {
		this.busyListeners.add(listener);
		return () => { this.busyListeners.delete(listener); };
	}
	private busy(delta: number): void {
		this.pending += delta;
		for (const listener of this.busyListeners) { try { listener(); } catch { /* Keep controls recoverable. */ } }
	}
	private notice(message: string): void {
		try { this.deps.notify(message); } catch (error) { this.deps.log("Showing a timer Notice failed: " + String(error)); }
	}

	async start(target: StartTarget): Promise<StartOutcome> {
		const { gateway, queue, store, newCorrelationId, log } = this.deps;
		this.busy(1);
		let outcome: StartOutcome = "failed";
		try {
			outcome = await queue.run(async () => {
				if ((await gateway.active()).some(item => item.taskPath === target.taskPath && !item.entry.endTime)) return "already-running";
				await gateway.start(target.taskPath, {}, { source: MUTATION_SOURCE, reason: "user start", correlationId: newCorrelationId() });
				return "started";
			});
		} catch (error) {
			const { message } = gateway.normalizeError(error);
			if (/already.*(track|tim|active)/i.test(message)) outcome = "already-running";
			else {
				log("Starting the timer failed: " + message);
				this.notice(`Couldn't start the timer for "${target.title}": ${message.trim().replace(/\.+$/, "") || "TaskNotes reported an error"}. Try again.`);
			}
		} finally {
			try { await store.refreshNow(); } finally { this.busy(-1); }
		}
		if (outcome === "already-running") this.notice(target.title + " is already being timed.");
		return outcome;
	}

	constructor(deps: TimerControllerDeps) {
		this.deps = deps;
	}

	/**
	 * Stops exactly the target task, through the shared write queue, then re-derives
	 * the pane from TaskNotes. Never touches any other running timer. Never rejects.
	 */
	async stop(target: StopTarget): Promise<StopOutcome> {
		const { gateway, store, queue, notify, newCorrelationId, log } = this.deps;
		this.busy(1);
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
		try { await store.refreshNow(); } finally { this.busy(-1); }
		return outcome;
	}
}
