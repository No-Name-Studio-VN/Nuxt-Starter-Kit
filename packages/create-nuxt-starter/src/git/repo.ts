import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CliError } from '../errors';

const run = promisify(execFile);

export async function isGitRepository(root: string): Promise<boolean> {
  try {
    const { stdout } = await run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root });
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

export async function isWorkingTreeClean(root: string): Promise<boolean> {
  const { stdout } = await run('git', ['status', '--porcelain'], { cwd: root });
  return stdout.trim().length === 0;
}

/**
 * Git is this CLI's undo mechanism: an upgrade must be reviewable with `git diff`
 * and revertible with `git restore`, which only holds if the tree was clean first.
 */
export async function assertCleanWorkingTree(
  root: string,
  options: { force: boolean },
): Promise<void> {
  if (!(await isGitRepository(root))) {
    throw new CliError(
      `${root} is not a git repository. Run "git init" and commit first — upgrades rely on git to review and undo changes.`,
    );
  }
  if (options.force) return;
  if (!(await isWorkingTreeClean(root))) {
    throw new CliError(
      'Your working tree has uncommitted changes. Commit or stash them first, or pass --force.',
    );
  }
}
