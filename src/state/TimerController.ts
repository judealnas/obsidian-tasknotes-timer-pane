/*
 * The pane's write controller (CTRL-01). Only a user click reaches it: the pane
 * never stops a timer on its own (D-05). Explicit Complete is D-14's exception:
 * write the completed status, then close only the same still-open entry.
 * Runtime Obsidian-free so Vitest can load it; Notices arrive through `notify`.
 */
import { isNoActiveSessionError, stopFailedNotice } from "../model/errors";
import { normalizeTimerPath, sameEntry, selectRegularStopTargets, type Ownership } from "../model/pomodoroOwnership";
import { pausedFromStop, type PausedRecord } from "../model/pauseLedger";
import { displayTitle, parseMs } from "../model/timeMath";
import { MUTATION_SOURCE, type TaskNotesGateway } from "../tasknotes/TaskNotesBridge";
import { PauseStore } from "./PauseStore";
import type { TimerStore } from "./TimerStore";
import type { WriteQueue } from "./WriteQueue";
import { resolveCompletionStatus, type TimerPaneSettings } from "../settings";

/** The displayed timer, captured by the view at click time. */
export type StopTarget = { taskPath: string; startTime: string; title: string };
export type StartTarget = { taskPath: string; title: string };
export type StartOutcome = "started" | "already-running" | "pomodoro" | "failed" | "busy";
export type CompleteOutcome = "completed" | "partial" | "unavailable" | "failed" | "busy";
/** A paused card, captured by the view at click time. */
export type ResumeTarget = { taskPath: string; title: string };
/**
 * - "paused": TaskNotes closed the entry and the pane remembers the session.
 * - "already-stopped": no such open entry (a benign race, no Notice, no record).
 * - "pomodoro": the entry belongs to the active Pomodoro; nothing written.
 */
export type PauseOutcome = "paused" | "already-stopped" | "pomodoro" | "failed" | "busy";
export type ResumeOutcome = "resumed" | "already-running" | "pomodoro" | "failed" | "busy";
export type PauseAllOutcome = { paused: number; skipped: number; failed: number; ownershipUnreadable: boolean };
export type ResumeAllOutcome = { resumed: number; skipped: number; pomodoro: number; failed: number };

/** Pane display order (D-06): latest session start first, normalized path ascending on ties. */
function byDisplayOrder(a: PausedRecord, b: PausedRecord): number {
	const aMs = parseMs(a.sessionStartedAt) ?? 0;
	const bMs = parseMs(b.sessionStartedAt) ?? 0;
	if (aMs !== bMs) return bMs - aMs;
	const aPath = normalizeTimerPath(a.taskPath);
	const bPath = normalizeTimerPath(b.taskPath);
	return aPath < bPath ? -1 : aPath > bPath ? 1 : 0;
}

/** The reason part of a write-failed Notice: trimmed, no trailing periods, never empty. */
function noticeReason(message: string): string {
	return message.trim().replace(/\.+$/, "").trim() || "TaskNotes reported an error";
}

/**
 * - "stopped": TaskNotes closed the entry.
 * - "already-stopped": TaskNotes had no open entry (a benign race, no Notice).
 * - "failed": any other error; the Stop-failed Notice was shown.
 */
export type StopOutcome = "stopped" | "already-stopped" | "failed" | "busy";

export interface TimerControllerDeps {
	gateway: Pick<TaskNotesGateway, "stop" | "normalizeError" | "active" | "start" | "pomodoroOwnership" | "statuses" | "completeTask" | "completionAvailable">;
	getSettings?: () => TimerPaneSettings;
	settingsReady?: () => Promise<void>;
	store: Pick<TimerStore, "refreshNow">;
	queue: WriteQueue;
	notify: (message: string) => void;
	newCorrelationId: () => string;
	log: (message: string) => void;
	/** The plugin's one pause store, shared with the store. Default: an empty, loaded store. */
	pauses?: PauseStore;
}

export class TimerController {
	/**
	 * Stops every eligible regular timer, then clears every paused record (D-10), so the
	 * pane ends empty. Pauses are kept when the batch halted on unreadable Pomodoro
	 * ownership (T-03-13). Running records are never removed here: reconcile rule 3
	 * clears those whose entries stopped.
	 */
	async stopAll(): Promise<{ stopped: number; skipped: number; failed: number; cleared: number; ownershipUnreadable: boolean }> {
		const outcome = { stopped: 0, skipped: 0, failed: 0, cleared: 0, ownershipUnreadable: false };
		if (this.completing) return outcome;
		const { gateway, queue, store, newCorrelationId, log } = this.deps;
		const pauses = this.pauses;
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
				if (outcome.ownershipUnreadable) return;
				const records = pauses.records();
				const kept = records.filter(record => record.state !== "paused");
				outcome.cleared = records.length - kept.length;
				if (outcome.cleared > 0) pauses.applyReconcile(kept);
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
	private readonly pauses: PauseStore;
	private pending = 0;
	private completing = false;
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
		if (this.completing) return "busy";
		const { gateway, queue, store, newCorrelationId, log } = this.deps;
		this.busy(1);
		let outcome: StartOutcome = "failed";
		try {
			outcome = await queue.run(async (): Promise<StartOutcome> => {
				// D-17: re-read here, never trusting the picker-time tag. Unreadable falls back to Phase 2.
				let ownership: Ownership;
				try { ownership = await gateway.pomodoroOwnership(); }
				catch { ownership = { readable: false }; }
				if (ownership.readable && ownership.owner && normalizeTimerPath(ownership.owner.taskPath) === normalizeTimerPath(target.taskPath)) return "pomodoro";
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
		if (outcome === "pomodoro") this.notice(target.title + " is being timed by Pomodoro.");
		return outcome;
	}

	constructor(deps: TimerControllerDeps) {
		this.deps = deps;
		if (deps.pauses) this.pauses = deps.pauses;
		else {
			this.pauses = new PauseStore({ log: deps.log });
			this.pauses.load([]);
		}
	}

	/**
	 * Pauses exactly the target entry (CTRL-02, D-05): api.time.stop, then a paused
	 * record built from the entry TaskNotes actually closed. Allowed while Pomodoro
	 * ownership is unreadable (D-04), but never onto the readable owner. Never rejects.
	 */
	async pause(target: StopTarget): Promise<PauseOutcome> {
		if (this.completing) return "busy";
		const { gateway, queue, store, log } = this.deps;
		this.busy(1);
		let outcome: PauseOutcome = "failed";
		try {
			outcome = await queue.run(async (): Promise<PauseOutcome> => {
				const active = await gateway.active();
				if (!active.some(item => !item.entry.endTime && sameEntry({ taskPath: item.taskPath, startTime: item.entry.startTime }, target))) return "already-stopped";
				let ownership: Ownership;
				try { ownership = await gateway.pomodoroOwnership(); }
				catch { ownership = { readable: false }; }
				if (ownership.readable && ownership.owner && sameEntry(ownership.owner, target)) return "pomodoro";
				await this.pauseInQueue(target, "user pause");
				return "paused";
			});
		} catch (error) {
			const { message } = gateway.normalizeError(error);
			if (isNoActiveSessionError(message)) outcome = "already-stopped";
			else {
				// No task path or TaskNotes text in the console (T-03-05).
				log("Pausing a timer failed.");
				this.notice(`Couldn't pause the timer for "${target.title}": ${noticeReason(message)}. Try again.`);
				outcome = "failed";
			}
		} finally {
			try { await store.refreshNow(); } finally { this.busy(-1); }
		}
		if (outcome === "pomodoro") this.notice(`${target.title} is being timed by Pomodoro.`);
		return outcome;
	}

	/**
	 * Resumes a paused task (CTRL-03): a new entry through api.time.start. The record is
	 * left alone here: the refresh turns it back to running (D-11 rule), so a pane
	 * Resume and an external start land the same way. Never rejects.
	 */
	async resume(target: ResumeTarget): Promise<ResumeOutcome> {
		if (this.completing) return "busy";
		const { gateway, queue, store, log } = this.deps;
		this.busy(1);
		let outcome: ResumeOutcome = "failed";
		try {
			outcome = await queue.run(() => this.resumeInQueue(target, "user resume"));
		} catch (error) {
			const { message } = gateway.normalizeError(error);
			if (/already.*(track|tim|active)/i.test(message)) outcome = "already-running";
			else {
				log("Resuming a timer failed.");
				this.notice(`Couldn't resume the timer for "${target.title}": ${noticeReason(message)}. Try again.`);
				outcome = "failed";
			}
		} finally {
			try { await store.refreshNow(); } finally { this.busy(-1); }
		}
		if (outcome === "pomodoro") this.notice(`${target.title} is being timed by Pomodoro.`);
		return outcome;
	}

	/**
	 * The shared in-queue body of Pause and Pause all: api.time.stop, then a paused
	 * record built from the entry TaskNotes actually closed, with the path marked
	 * pending meanwhile. The caller has checked the target. Must run inside queue.run;
	 * never calls another queued method. Rejects with TaskNotes' error.
	 */
	private async pauseInQueue(target: StopTarget, reason: string): Promise<void> {
		const { gateway, newCorrelationId } = this.deps;
		const pauses = this.pauses;
		const path = normalizeTimerPath(target.taskPath);
		const prior = pauses.get(path);
		pauses.beginPending(path);
		try {
			const task = await gateway.stop(target.taskPath, { source: MUTATION_SOURCE, reason, correlationId: newCorrelationId() });
			const entries: unknown = task?.timeEntries;
			const closed = Array.isArray(entries)
				? (entries as Array<{ startTime?: unknown; endTime?: unknown } | null>).find(entry => entry?.startTime === target.startTime && typeof entry.endTime === "string" && entry.endTime !== "")
				: undefined;
			const endMs = parseMs(closed?.endTime) ?? Date.now();
			pauses.set(pausedFromStop({ prior, taskPath: target.taskPath, title: target.title, entryStart: target.startTime, endMs }));
		} finally {
			pauses.endPending(path);
		}
	}

	/**
	 * The shared in-queue body of Resume and Resume all: fresh ownership and active
	 * reads, then api.time.start. Readable ownership is not required, because a start
	 * cannot close the Pomodoro's entry. Must run inside queue.run. Rejects with
	 * TaskNotes' error.
	 */
	private async resumeInQueue(target: ResumeTarget, reason: string): Promise<"resumed" | "already-running" | "pomodoro"> {
		const { gateway, newCorrelationId } = this.deps;
		const path = normalizeTimerPath(target.taskPath);
		let ownership: Ownership;
		try { ownership = await gateway.pomodoroOwnership(); }
		catch { ownership = { readable: false }; }
		// D-17 race: the Pomodoro is timing this task.
		if (ownership.readable && ownership.owner && normalizeTimerPath(ownership.owner.taskPath) === path) return "pomodoro";
		if ((await gateway.active()).some(item => !item.entry.endTime && normalizeTimerPath(item.taskPath) === path)) return "already-running";
		await gateway.start(target.taskPath, {}, { source: MUTATION_SOURCE, reason, correlationId: newCorrelationId() });
		return "resumed";
	}

	/**
	 * Pause all (CTRL-02, D-04, D-05): one queued action that pauses every eligible
	 * regular timer one at a time, in captured active order, re-reading active timers
	 * and Pomodoro ownership before every write. Never guesses ownership: unreadable
	 * at the start writes nothing, and mid-batch halts (T-03-11). Never rejects.
	 */
	async pauseAll(): Promise<PauseAllOutcome> {
		const outcome: PauseAllOutcome = { paused: 0, skipped: 0, failed: 0, ownershipUnreadable: false };
		if (this.completing) return outcome;
		const { gateway, queue, store, log } = this.deps;
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
					const item = active.find(candidate => !candidate.entry.endTime && sameEntry({ taskPath: candidate.taskPath, startTime: candidate.entry.startTime }, target));
					const title = displayTitle(item?.task?.title, target.taskPath);
					try {
						// Path-only public stop: an external replacement after this read can still race it.
						await this.pauseInQueue({ taskPath: target.taskPath, startTime: target.startTime, title }, "user pause all");
						outcome.paused++;
					} catch (error) {
						if (isNoActiveSessionError(gateway.normalizeError(error).message)) outcome.skipped++;
						else outcome.failed++;
					}
				}
			});
		} catch {
			outcome.failed++;
			log("Pausing all timers could not finish safely.");
		} finally {
			try { await store.refreshNow(); } finally { this.busy(-1); }
		}
		// Count-only Notices (T-03-14).
		if (outcome.ownershipUnreadable) this.notice("Couldn't verify Pomodoro ownership. Pause all has stopped; try again when TaskNotes is ready.");
		else if (outcome.failed) this.notice(`Paused ${outcome.paused} timers. ${outcome.failed} timers could not be paused. Try again.`);
		return outcome;
	}

	/**
	 * Resume all (CTRL-03, D-05): one queued action that resumes every paused record
	 * in pane display order, one start at a time, re-reading ownership and active
	 * timers before every write. Skips a record that is no longer paused, the readable
	 * Pomodoro owner's task and a task that already has an open entry. Never rejects.
	 */
	async resumeAll(): Promise<ResumeAllOutcome> {
		const outcome: ResumeAllOutcome = { resumed: 0, skipped: 0, pomodoro: 0, failed: 0 };
		if (this.completing) return outcome;
		const { gateway, queue, store, log } = this.deps;
		const pauses = this.pauses;
		this.busy(1);
		try {
			await queue.run(async () => {
				const captured = pauses.records().filter((record): record is PausedRecord => record.state === "paused").sort(byDisplayOrder);
				for (const record of captured) {
					const current = pauses.get(record.taskPath);
					if (current?.state !== "paused" || current.sessionStartedAt !== record.sessionStartedAt) { outcome.skipped++; continue; }
					try {
						const result = await this.resumeInQueue({ taskPath: record.taskPath, title: record.title }, "user resume all");
						if (result === "resumed") outcome.resumed++;
						else if (result === "pomodoro") outcome.pomodoro++;
						else outcome.skipped++;
					} catch (error) {
						if (/already.*(track|tim|active)/i.test(gateway.normalizeError(error).message)) outcome.skipped++;
						else outcome.failed++;
					}
				}
			});
		} catch {
			outcome.failed++;
			log("Resuming all timers could not finish safely.");
		} finally {
			try { await store.refreshNow(); } finally { this.busy(-1); }
		}
		// Count-only Notices (T-03-14).
		if (outcome.failed) this.notice(`Resumed ${outcome.resumed} timers. ${outcome.failed} timers could not be resumed. Try again.`);
		else if (outcome.pomodoro) this.notice(`Resumed ${outcome.resumed} timers. ${outcome.pomodoro} timers are being timed by Pomodoro.`);
		return outcome;
	}

	/**
	 * Stops exactly the target task, through the shared write queue, then re-derives
	 * the pane from TaskNotes. Never touches any other running timer. Never rejects.
	 */
	async stop(target: StopTarget): Promise<StopOutcome> {
		if (this.completing) return "busy";
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

	/**
	 * Stop on a paused card (D-09): nothing is running, so it only forgets the pause.
	 * Never calls TaskNotes. "not-paused" when the record is gone or running again
	 * (an external start landed first). Never rejects.
	 */
	async stopPaused(target: ResumeTarget): Promise<"cleared" | "not-paused" | "busy"> {
		if (this.completing) return "busy";
		const { queue, store, log } = this.deps;
		const pauses = this.pauses;
		this.busy(1);
		let outcome: "cleared" | "not-paused" = "not-paused";
		try {
			outcome = await queue.run((): Promise<"cleared" | "not-paused"> => {
				if (pauses.get(target.taskPath)?.state !== "paused") return Promise.resolve("not-paused");
				pauses.remove(target.taskPath);
				return Promise.resolve("cleared");
			});
		} catch {
			log("Clearing a paused timer failed.");
		} finally {
			try { await store.refreshNow(); } finally { this.busy(-1); }
		}
		return outcome;
	}

	async completionAvailable(): Promise<boolean> {
		try {
			await this.deps.settingsReady?.();
			return this.deps.gateway.completionAvailable() && resolveCompletionStatus(await this.deps.gateway.statuses(), this.deps.getSettings?.().completionStatus ?? null) !== null;
		} catch { return false; }
	}

	async complete(target: StopTarget): Promise<CompleteOutcome> {
		if (this.isBusy()) return "busy";
		this.completing = true;
		this.busy(1);
		const { gateway, queue, store, newCorrelationId, log } = this.deps;
		let statusWritten = false;
		let outcome: CompleteOutcome = "failed";
		try {
			outcome = await queue.run(async (): Promise<CompleteOutcome> => {
				await this.deps.settingsReady?.();
				if (!gateway.completionAvailable()) return "unavailable";
				const status = resolveCompletionStatus(await gateway.statuses(), this.deps.getSettings?.().completionStatus ?? null);
				if (!status) return "unavailable";
				const context = { source: MUTATION_SOURCE, reason: "user complete", correlationId: newCorrelationId() };
				await gateway.completeTask(target.taskPath, status.value, context);
				statusWritten = true;
				// D-09: a completed paused task leaves the pane. Its card's startTime is the
				// closed lastEntryStart, so the still-open check below makes no stop call.
				if (this.pauses.get(target.taskPath)?.state === "paused") this.pauses.remove(target.taskPath);
				const active = await gateway.active();
				if (active.some(item => !item.entry.endTime && sameEntry({ taskPath: item.taskPath, startTime: item.entry.startTime }, target))) {
					// External replacement can race this path-only public stop after the final read.
					try { await gateway.stop(target.taskPath, context); }
					catch (error) { if (!isNoActiveSessionError(gateway.normalizeError(error).message)) throw error; }
				}
				return "completed";
			});
		} catch {
			outcome = statusWritten ? "partial" : "failed";
			log(statusWritten ? "Task completed, but its timer could not be confirmed stopped." : "Completing the task failed.");
		} finally {
			try { await store.refreshNow(); }
			catch { log("Refreshing timers after completion failed."); }
			finally { this.completing = false; this.busy(-1); }
		}
		if (outcome === "partial") this.notice("Task completed, but its timer could not be confirmed stopped. Check the timer in TaskNotes.");
		else if (outcome === "failed") this.notice("Couldn't complete the task. Try again in TaskNotes.");
		else if (outcome === "unavailable") this.notice("Complete is unavailable. Check TaskNotes and its completed statuses.");
		return outcome;
	}
}
