import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CliError } from '../errors';

const run = promisify(execFile);

async function insideWorkTree(projectRoot: string): Promise<boolean> {
  try {
    const { stdout } = await run('git', ['-C', projectRoot, 'rev-parse', '--is-inside-work-tree'], {
      timeout: 15_000,
    });
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

export async function assertCleanTree(projectRoot: string, force: boolean): Promise<void> {
  if (force) return;
  if (!(await insideWorkTree(projectRoot))) {
    throw new CliError(
      'This project needs git before it can be managed. Initialize a repository or use --force.',
    );
  }
  const { stdout } = await run('git', ['-C', projectRoot, 'status', '--porcelain', '--', '.'], {
    timeout: 15_000,
  });
  if (stdout.trim())
    throw new CliError('Please commit or stash your changes before continuing, or use --force.');
}

export async function initRepository(
  projectRoot: string,
): Promise<'committed' | 'initialised' | 'skipped'> {
  if (await insideWorkTree(projectRoot)) return 'skipped';
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
