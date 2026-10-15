import type { TaskInfo } from "../tasknotes/runtime-api.types";
export function taskMatchQuality(_task: TaskInfo, _query: string): number | null { return null; }
export function filterAndSortTasks(tasks: readonly TaskInfo[], _completed: ReadonlySet<string>, _query: string): TaskInfo[] { return [...tasks]; }
