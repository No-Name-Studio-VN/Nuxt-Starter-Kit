import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CliError } from '../errors';
import { git, splitPaths, workTree } from '../git/snapshot';

const run = promisify(execFile);

export async function listProjectFiles(projectRoot: string): Promise<string[]> {
  if (!(await workTree(projectRoot))) {
    throw new CliError('Inspecting added files requires a git working tree.');
  }
  const stdout = await git(projectRoot, [
    'ls-files', '-z', '-t', '--cached', '--others', '--exclude-standard', '--deleted', '--', '.',
  ]);
  const files = new Set<string>();
  const deleted = new Set<string>();
  // Git lists a missing tracked path twice, with a cached entry and a deleted entry.
  for (const entry of splitPaths(stdout)) {
    if (entry.startsWith('R ')) deleted.add(entry.slice(2));
    else files.add(entry.slice(2));
  }
  return [...files].filter((path) => !deleted.has(path)).sort();
}

export async function initRepository(
  projectRoot: string,
): Promise<'committed' | 'initialised' | 'skipped'> {
  if (await workTree(projectRoot)) return 'skipped';
  const args = [
    '-c',
    'commit.gpgsign=false',
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'init.templateDir=',
    '-C',
    projectRoot,
  ];
  await run('git', [...args, 'init'], { timeout: 15_000 });
  await run('git', [...args, 'add', '-A'], { timeout: 15_000 });
  try {
    await run('git', [...args, 'commit', '-m', 'chore: scaffold with create-nuxt-saas'], {
      timeout: 15_000,
    });
    return 'committed';
  } catch {
    return 'initialised';
  }
}
