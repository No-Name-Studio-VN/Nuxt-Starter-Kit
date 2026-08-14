import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { runInit } from '../../src/commands/init';
import { writeTextFile } from '../../src/util/fs';
import {
  FIXTURE_KIT_V1_ROOT,
  FIXTURE_KIT_V2_ROOT,
  loadFixtureRegistry,
  makeTempDir,
} from './fixtureKit';

const run = promisify(execFile);

/** Maps a fixture revision to its checkout, mirroring how upgrades fetch by revision. */
export function resolveFixtureKit(revision: string): string | undefined {
  if (revision === 'v1') return FIXTURE_KIT_V1_ROOT;
  if (revision === 'v2') return FIXTURE_KIT_V2_ROOT;
  return undefined;
}

/** Generates a project from kit-v1 and commits it, so upgrades see a clean tree. */
export async function generateProjectAtV1(moduleIds: string[]): Promise<string> {
  const registry = await loadFixtureRegistry();
  const { projectRoot } = await runInit({
    registry,
    targetDir: join(await makeTempDir('upgrade'), 'app'),
    moduleIds,
    placeholders: { PROJECT_NAME: 'my-app', PROJECT_DESCRIPTION: 'Test' },
    localKitRoot: FIXTURE_KIT_V1_ROOT,
  });

  await run('git', ['init', '--quiet'], { cwd: projectRoot });
  await run('git', ['config', 'user.email', 'test@example.com'], { cwd: projectRoot });
  await run('git', ['config', 'user.name', 'Test'], { cwd: projectRoot });
  await commitAll(projectRoot, 'initial');
  return projectRoot;
}

export async function editFile(projectRoot: string, path: string, contents: string): Promise<void> {
  await writeTextFile(join(projectRoot, path), contents);
}

export function readProjectFile(projectRoot: string, path: string): Promise<string> {
  return readFile(join(projectRoot, path), 'utf8');
}

/** Commits current changes so a test can start from a clean tree after editing. */
export async function commitAll(projectRoot: string, message = 'edit'): Promise<void> {
  await run('git', ['add', '.'], { cwd: projectRoot });
  await run('git', ['commit', '--quiet', '-m', message], { cwd: projectRoot });
}
