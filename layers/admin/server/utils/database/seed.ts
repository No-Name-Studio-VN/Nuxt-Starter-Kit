import { runSeedTasks } from '#layers/admin/server/utils/seedTasks';
import type { SeedSummary, SeedTaskResult } from '#layers/admin/types/seedTasks';

/** Runs every registered seed task. */
export async function seedDatabase(): Promise<{ summary: SeedSummary; tasks: SeedTaskResult[] }> {
  // registerSeedTask() keeps every key unique.
  const tasks = await runSeedTasks();
  const summary: SeedSummary = Object.fromEntries(tasks.map((task) => [task.key, task.counts]));

  return { summary, tasks };
}
