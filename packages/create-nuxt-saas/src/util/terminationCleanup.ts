import { constants } from 'node:os';

type Cleanup = () => Promise<void>;

const SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
const pending = new Set<Cleanup>();

/** Runs every registered cleanup, then exits like a process killed by `signal` (128 + signal number). */
export async function terminate(
  signal: NodeJS.Signals,
  exit: (code: number) => void = process.exit,
): Promise<void> {
  await runPendingCleanups();
  exit(128 + constants.signals[signal]);
}

export async function runPendingCleanups(): Promise<void> {
  const cleanups = [...pending];
  pending.clear();
  uninstall();
  await Promise.allSettled(cleanups.map((cleanup) => cleanup()));
}

function handle(signal: NodeJS.Signals): void {
  void terminate(signal);
}

function install(): void {
  for (const signal of SIGNALS) process.once(signal, handle);
}

function uninstall(): void {
  for (const signal of SIGNALS) process.removeListener(signal, handle);
}

/**
 * Registers a cleanup to run if the process is stopped by SIGINT or SIGTERM, which skip `finally`
 * blocks (the app terminates a timed-out or cancelled run that way). The handlers exist only while
 * something is registered. Returns a function that unregisters the cleanup once it is no longer needed.
 */
export function cleanupOnTermination(cleanup: Cleanup): () => void {
  if (pending.size === 0) install();
  pending.add(cleanup);
  return () => {
    pending.delete(cleanup);
    if (pending.size === 0) uninstall();
  };
}
