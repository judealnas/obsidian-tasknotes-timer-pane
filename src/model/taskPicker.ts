import type { TaskInfo } from "../tasknotes/runtime-api.types";

/** Lower is a better match; the best field wins without field-specific weights. */
export function taskMatchQuality(task: TaskInfo, query: string): number | null {
 const needle = query.trim().toLowerCase();
 if (!needle) return 0;
 const fields = [task.title, task.due, task.priority?.toLowerCase() === "normal" ? undefined : task.priority, ...(task.contexts ?? []), ...(task.projects ?? []), ...(task.tags ?? [])];
 let best: number | null = null;
 for (const field of fields) {
  if (!field) continue;
  const value = field.toLowerCase();
  const quality = value === needle ? 0 : value.startsWith(needle) ? 1 : value.split(/\s+/).some(word => word.startsWith(needle)) ? 2 : value.includes(needle) ? 3 : null;
  if (quality !== null && (best === null || quality < best)) best = quality;
 }
 return best;
}

function priorityRank(value: string | undefined): number {
 return value?.toLowerCase() === "high" ? 0 : value?.toLowerCase() === "low" ? 2 : 1;
}

/** Completed is the outer partition for both query and empty-query ordering. */
export function filterAndSortTasks(tasks: readonly TaskInfo[], completed: ReadonlySet<string>, query: string): TaskInfo[] {
 const searching = query.trim().length > 0;
 return tasks.map((task, index) => ({ task, index, quality: taskMatchQuality(task, query) }))
  .filter(item => !item.task.archived && item.quality !== null)
  .sort((a, b) => {
   const partition = Number(completed.has(a.task.status)) - Number(completed.has(b.task.status));
   if (partition) return partition;
   if (searching) {
    const match = (a.quality ?? 0) - (b.quality ?? 0);
    if (match) return match;
   } else {
    const dueA = a.task.due ?? ""; const dueB = b.task.due ?? "";
    const presence = Number(!dueA) - Number(!dueB);
    if (presence) return presence;
    const due = dueA.localeCompare(dueB);
    if (due) return due;
    const priority = priorityRank(a.task.priority) - priorityRank(b.task.priority);
    if (priority) return priority;
   }
   return a.task.title.localeCompare(b.task.title) || a.index - b.index;
  }).map(item => item.task);
}
