import { constants } from 'node:os';

type Cleanup = () => Promise<void>;

const SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
const pending = new Map<Cleanup, boolean>();
let draining = false;

/** Runs every registered cleanup, then exits like a process killed by `signal` (128 + signal number). */
export async function terminate(
  signal: NodeJS.Signals,
  exit: (code: number) => void = process.exit,
): Promise<void> {
  await runPendingCleanups();
  exit(128 + constants.signals[signal]);
}

export async function runPendingCleanups(): Promise<void> {
  draining = true;
  try {
    for (const beforeOtherCleanups of [true, false]) {
      const cleanups = [...pending].filter(([, first]) => first === beforeOtherCleanups);
      for (const [cleanup] of cleanups) pending.delete(cleanup);
      await Promise.allSettled(cleanups.map(async ([cleanup]) => cleanup()));
    }
  } finally {
    draining = false;
    if (pending.size === 0) uninstall();
  }
}

function handle(signal: NodeJS.Signals): void {
  if (!draining) void terminate(signal);
}

function install(): void {
  for (const signal of SIGNALS) process.on(signal, handle);
}

function uninstall(): void {
  for (const signal of SIGNALS) process.removeListener(signal, handle);
}

/**
 * Registers a cleanup to run if the process is stopped by SIGINT or SIGTERM, which skip `finally`
 * blocks (the app terminates a timed-out or cancelled run that way). The handlers exist only while
 * something is registered or running. Use beforeOtherCleanups when a cleanup still needs resources
 * registered for removal. Returns a function that unregisters the cleanup once it is no longer needed.
 */
export function cleanupOnTermination(cleanup: Cleanup, { beforeOtherCleanups = false } = {}): () => void {
  if (!draining && pending.size === 0) install();
  pending.set(cleanup, beforeOtherCleanups);
  return () => {
    pending.delete(cleanup);
    if (!draining && pending.size === 0) uninstall();
  };
}
