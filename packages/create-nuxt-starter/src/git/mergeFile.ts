import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CliError } from '../errors';

const run = promisify(execFile);
const MAX_BUFFER = 32 * 1024 * 1024;

export type MergeOutcome =
  | { status: 'clean'; content: string }
  | { status: 'conflict'; content: string; conflicts: number };

export interface MergeFilesOptions {
  oursPath: string;
  basePath: string;
  theirsPath: string;
  labels: { ours: string; base: string; theirs: string };
}

function isExecFileFailure(error: unknown): error is { code: number; stdout: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'number' &&
    'stdout' in error &&
    typeof error.stdout === 'string'
  );
}

/**
 * Three-way merge via `git merge-file`. Git already ships the algorithm, emits the
 * conflict markers every editor understands, and reports the conflict count as its
 * exit code, so there is no reason to carry our own diff3.
 */
export async function mergeFiles(options: MergeFilesOptions): Promise<MergeOutcome> {
  const args = [
    'merge-file',
    '-p',
    '--diff3',
    '-L',
    options.labels.ours,
    '-L',
    options.labels.base,
    '-L',
    options.labels.theirs,
    options.oursPath,
    options.basePath,
    options.theirsPath,
  ];

  try {
    const { stdout } = await run('git', args, { maxBuffer: MAX_BUFFER });
    return { status: 'clean', content: stdout };
  } catch (error) {
    // Exit codes 1..127 are the number of conflicts; anything else is a real failure.
    if (isExecFileFailure(error) && error.code > 0 && error.code <= 127) {
      return { status: 'conflict', content: error.stdout, conflicts: error.code };
    }
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new CliError(`git merge-file failed: ${message}`);
  }
}
