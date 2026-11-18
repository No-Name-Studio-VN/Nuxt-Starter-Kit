import { constants } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import {
  cleanupOnTermination,
  runPendingCleanups,
  terminate,
} from '../../src/util/terminationCleanup';

describe('cleanupOnTermination', () => {
  it('runs registered cleanups and exits with the signal code', async () => {
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    cleanupOnTermination(first);
    cleanupOnTermination(second);
    const exit = vi.fn();

    await terminate('SIGTERM', exit);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(128 + constants.signals.SIGTERM);
  });

  it('does not run a cleanup that was unregistered', async () => {
    const cleanup = vi.fn(async () => {});
    const unregister = cleanupOnTermination(cleanup);
    unregister();
    await runPendingCleanups();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('keeps going when one cleanup fails', async () => {
    const after = vi.fn(async () => {});
    cleanupOnTermination(async () => {
      throw new Error('disk gone');
    });
    cleanupOnTermination(after);
    await runPendingCleanups();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('listens for SIGINT and SIGTERM only while something is registered', async () => {
    const sigint = process.listenerCount('SIGINT');
    const sigterm = process.listenerCount('SIGTERM');
    const unregister = cleanupOnTermination(async () => {});
    expect(process.listenerCount('SIGINT')).toBe(sigint + 1);
    expect(process.listenerCount('SIGTERM')).toBe(sigterm + 1);
    unregister();
    expect(process.listenerCount('SIGINT')).toBe(sigint);
    expect(process.listenerCount('SIGTERM')).toBe(sigterm);
  });
});
