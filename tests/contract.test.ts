// Type-level pins for the vendored TaskNotes Runtime API v1 contract.
// Every assertion here is checked by `tsc -noEmit` (inside `npm run build`), so a
// drifting shape fails the build. Vitest also runs the file so the D-14 test step
// has a real suite. Only type imports: Vitest cannot load the obsidian package.
import { describe, expectTypeOf, test } from "vitest";
import type { EventRef } from "obsidian";
import type {
	ActiveTimeEntry,
 CompleteTaskOptions,
 PomodoroState,
 PomodoroSession,
 TaskStatus,
 TaskNotesRuntimeEventName,
	TaskInfo,
	TaskNotesApiErrorPayload,
	TaskNotesMutationContext,
	TaskNotesRuntimeApiV1,
	TaskNotesRuntimeLifecycleEventName,
	TaskNotesRuntimeTaskEventName,
	TaskNotesRuntimeTaskMenuShowOptions,
	TimeEntry,
} from "../src/tasknotes/runtime-api.types";

type Api = TaskNotesRuntimeApiV1;

describe("TaskNotes Runtime API v1 contract", () => {
	test("root: apiVersion is the literal 1, capabilities and hasCapability", () => {
		expectTypeOf<Api["apiVersion"]>().toEqualTypeOf<1>();
		expectTypeOf<Api["capabilities"]>().toEqualTypeOf<readonly string[]>();
		expectTypeOf<Api["hasCapability"]>().parameters.toEqualTypeOf<[capability: string]>();
		expectTypeOf<Api["hasCapability"]>().returns.toEqualTypeOf<boolean>();
	});

	test("ActiveTimeEntry has exactly taskPath, task, entry and index", () => {
		expectTypeOf<ActiveTimeEntry>().toEqualTypeOf<{
			taskPath: string;
			task: TaskInfo;
			entry: TimeEntry;
			index: number;
		}>();
	});

	test("TimeEntry: startTime is required, endTime is optional", () => {
		expectTypeOf<TimeEntry["startTime"]>().toEqualTypeOf<string>();
		expectTypeOf<TimeEntry["endTime"]>().toEqualTypeOf<string | undefined>();
		expectTypeOf<Pick<TimeEntry, "endTime">>().toEqualTypeOf<{ endTime?: string }>();
	});

	test("TaskInfo carries the fields the pane and the fakes use", () => {
		expectTypeOf<TaskInfo>().toHaveProperty("title").toEqualTypeOf<string>();
		expectTypeOf<TaskInfo>().toHaveProperty("status").toEqualTypeOf<string>();
		expectTypeOf<TaskInfo>().toHaveProperty("path").toEqualTypeOf<string>();
		expectTypeOf<TaskInfo>().toHaveProperty("archived").toEqualTypeOf<boolean>();
		expectTypeOf<Pick<TaskInfo, "timeEntries">>().toEqualTypeOf<{ timeEntries?: TimeEntry[] }>();
	});

	test("time.active takes nothing and resolves to ActiveTimeEntry[]", () => {
		expectTypeOf<Api["time"]["active"]>().parameters.toEqualTypeOf<[]>();
		expectTypeOf<Api["time"]["active"]>().returns.toEqualTypeOf<Promise<ActiveTimeEntry[]>>();
	});

	test("time.stop takes a path and an optional mutation context", () => {
		expectTypeOf<Api["time"]["stop"]>().parameters.toEqualTypeOf<
			[path: string, context?: TaskNotesMutationContext]
		>();
		expectTypeOf<Api["time"]["stop"]>().returns.toEqualTypeOf<Promise<TaskInfo>>();
	});

	test("TaskNotesMutationContext is exactly source, correlationId and reason", () => {
		expectTypeOf<TaskNotesMutationContext>().toEqualTypeOf<{
			source?: string;
			correlationId?: string;
			reason?: string;
		}>();
	});

	test("lifecycle readiness and off() for both event namespaces", () => {
		expectTypeOf<Api["lifecycle"]["isReady"]>().returns.toEqualTypeOf<boolean>();
		expectTypeOf<Api["lifecycle"]["ready"]>().returns.toEqualTypeOf<Promise<void>>();
		expectTypeOf<Api["events"]["off"]>().parameters.toEqualTypeOf<[ref: EventRef]>();
		expectTypeOf<Api["lifecycle"]["off"]>().parameters.toEqualTypeOf<[ref: EventRef]>();
		expectTypeOf<Api["events"]["on"]>().returns.toEqualTypeOf<EventRef>();
		expectTypeOf<Api["lifecycle"]["on"]>().returns.toEqualTypeOf<EventRef>();
	});

	test("event name unions match TaskNotes verbatim", () => {
		expectTypeOf<TaskNotesRuntimeLifecycleEventName>().toEqualTypeOf<
			| "ready"
			| "layout.ready"
			| "settings.changed"
			| "cache.changed"
			| "cache.rebuilt"
			| "extension.registered"
			| "extension.unregistered"
			| "unloading"
		>();
		expectTypeOf<TaskNotesRuntimeTaskEventName>().toEqualTypeOf<"task.updated" | "task.deleted">();
	});

	test("errors.normalize maps unknown to a payload with message and status", () => {
		expectTypeOf<Api["errors"]["normalize"]>().parameters.toEqualTypeOf<[error: unknown]>();
		expectTypeOf<Api["errors"]["normalize"]>().returns.toEqualTypeOf<TaskNotesApiErrorPayload>();
		expectTypeOf<TaskNotesApiErrorPayload>().toHaveProperty("message").toEqualTypeOf<string>();
		expectTypeOf<TaskNotesApiErrorPayload>().toHaveProperty("status").toEqualTypeOf<number>();
	});

	test("ui is optional (absent before TaskNotes 4.11)", () => {
		expectTypeOf<undefined>().toExtend<Api["ui"]>();
	});

	test("ui.taskMenu.show takes the show options and resolves to void", () => {
		type Show = NonNullable<Api["ui"]>["taskMenu"]["show"];
		expectTypeOf<Show>().parameters.toEqualTypeOf<[options: TaskNotesRuntimeTaskMenuShowOptions]>();
		expectTypeOf<Show>().returns.toEqualTypeOf<Promise<void>>();
	});

	test("TaskNotesRuntimeTaskMenuShowOptions is exactly taskPath and event", () => {
		expectTypeOf<TaskNotesRuntimeTaskMenuShowOptions>().toEqualTypeOf<{ taskPath: string; event: MouseEvent }>();
	});
});

describe("Phase 2 public contract (TaskNotes 4.13.8)", () => {
 test("list/status/start/complete signatures and mutation context", () => {
  expectTypeOf<NonNullable<Api["tasks"]>["list"]>().parameters.toEqualTypeOf<[]>();
  expectTypeOf<NonNullable<Api["tasks"]>["list"]>().returns.toEqualTypeOf<Promise<TaskInfo[]>>();
  expectTypeOf<NonNullable<Api["catalog"]>["statuses"]>().returns.toEqualTypeOf<TaskStatus[]>();
  expectTypeOf<NonNullable<Api["time"]["start"]>>().parameters.toEqualTypeOf<[path: string, options: Record<string, never>, context?: TaskNotesMutationContext]>();
  expectTypeOf<NonNullable<Api["time"]["start"]>>().returns.toEqualTypeOf<Promise<TaskInfo>>();
  expectTypeOf<NonNullable<NonNullable<Api["tasks"]>["complete"]>>().parameters.toEqualTypeOf<[path: string, options?: CompleteTaskOptions, context?: TaskNotesMutationContext]>();
  expectTypeOf<NonNullable<NonNullable<Api["tasks"]>["complete"]>>().returns.toEqualTypeOf<Promise<TaskInfo>>();
  expectTypeOf<CompleteTaskOptions>().toEqualTypeOf<{ status?: string }>();
 });
 test("picker fields and status catalog", () => {
  expectTypeOf<Pick<TaskInfo, "due" | "priority" | "contexts" | "projects" | "tags">>().toEqualTypeOf<{due?: string; priority?: string; contexts?: string[]; projects?: string[]; tags?: string[]}>();
  expectTypeOf<TaskStatus["value"]>().toEqualTypeOf<string>();
  expectTypeOf<TaskStatus["isCompleted"]>().toEqualTypeOf<boolean>();
 });
 test("Pomodoro state and exact task entry ownership fields", () => {
  expectTypeOf<NonNullable<Api["pomodoro"]>["status"]>().parameters.toEqualTypeOf<[]>();
  expectTypeOf<NonNullable<Api["pomodoro"]>["status"]>().returns.toEqualTypeOf<Promise<PomodoroState>>();
  expectTypeOf<PomodoroState["currentSession"]>().toEqualTypeOf<PomodoroSession | undefined>();
  expectTypeOf<PomodoroSession["timeTrackingStartTime"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<PomodoroSession["taskPath"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<PomodoroSession["type"]>().toEqualTypeOf<"work" | "short-break" | "long-break">();
  expectTypeOf<PomodoroSession["completed"]>().toEqualTypeOf<boolean>();
  expectTypeOf<PomodoroSession["interrupted"]>().toEqualTypeOf<boolean | undefined>();
 });
 test("public time and Pomodoro event names", () => {
  expectTypeOf<TaskNotesRuntimeEventName>().toEqualTypeOf<TaskNotesRuntimeTaskEventName | "time.started" | "time.stopped" | "pomodoro.started" | "pomodoro.completed" | "pomodoro.interrupted">();
 });
});
