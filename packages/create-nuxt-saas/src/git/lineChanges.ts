import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { CliError } from '../errors';
import type { LineChanges } from '../types/cli';
import { cleanupOnTermination } from '../util/terminationCleanup';

const run = promisify(execFile);

async function numstat(base: string, side: string): Promise<LineChanges> {
  try {
    // No output and status 0 means the files are identical.
    await run('git', ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--numstat', '--text', '--', base, side]);
    return { added: 0, removed: 0 };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 1 &&
      'stdout' in error && typeof error.stdout === 'string') {
      const match = /^(\d+)\t(\d+)\t/.exec(error.stdout);
      if (match) return { added: Number(match[1]), removed: Number(match[2]) };
    }
    throw new CliError(`Unable to count changed lines: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function countLineChanges(base: string, yours: string, kit: string) {
  const dir = await mkdtemp(join(tmpdir(), 'nuxt-saas-numstat-'));
  const cleanup = () => rm(dir, { recursive: true, force: true });
  const stopWatching = cleanupOnTermination(cleanup);
  const old = join(dir, 'base');
  const user = join(dir, 'yours');
  const target = join(dir, 'kit');
  try {
    await Promise.all([writeFile(old, base), writeFile(user, yours), writeFile(target, kit)]);
    const [userChanges, kitChanges] = await Promise.all([numstat(old, user), numstat(old, target)]);
    return { yours: userChanges, kit: kitChanges, base: base ? base.split('\n').length - Number(base.endsWith('\n')) : 0 };
  } finally {
    stopWatching();
    await cleanup();
  }
}
