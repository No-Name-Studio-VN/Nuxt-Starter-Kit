import type { SeedTask, SeedTaskResult } from '#layers/admin/types/seedTasks';

// Filled once by Nitro plugins; shared by every seed run.
const seedTasks = new Map<string, SeedTask>();

/** Throws when the id is taken, so no module can silently replace another's task. */
export function registerSeedTask(task: SeedTask): void {
  if (seedTasks.has(task.id)) {
    throw new Error(`Seed task "${task.id}" is already registered.`);
  }

  seedTasks.set(task.id, task);
}

/**
 * Runs every registered task in ascending `order`, one after another. A task
 * that throws stops the run and fails the seed.
 */
export async function runSeedTasks(): Promise<SeedTaskResult[]> {
  const tasks = [...seedTasks.values()].sort((a, b) => a.order - b.order);
  const results: SeedTaskResult[] = [];

  for (const task of tasks) {
    results.push(await task.run());
  }

  return results;
}
