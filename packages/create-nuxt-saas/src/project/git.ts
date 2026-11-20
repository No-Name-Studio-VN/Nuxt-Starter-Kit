import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { workTree } from '../git/snapshot';

const run = promisify(execFile);

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
