import type { SeedTask, SeedTaskResult } from '#layers/admin/types/seedTasks';

// Filled once by Nitro plugins; shared by every seed run.
const seedTasks = new Map<string, SeedTask>();

// The seed summary holds the admin account's result under this key.
const RESERVED_SUMMARY_KEYS = new Set(['admin']);

/**
 * Throws when the id or the summary key is taken, so no module can silently
 * replace another's task or hide its counts in the seed summary.
 */
export function registerSeedTask(task: SeedTask): void {
  if (seedTasks.has(task.id)) {
    throw new Error(`Seed task "${task.id}" is already registered.`);
  }

  const keyTaken =
    RESERVED_SUMMARY_KEYS.has(task.key) ||
    [...seedTasks.values()].some((registered) => registered.key === task.key);
  if (keyTaken) {
    throw new Error(`Seed summary key "${task.key}" of seed task "${task.id}" is already taken.`);
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
    results.push({ key: task.key, label: task.label, counts: await task.run() });
  }

  return results;
}
