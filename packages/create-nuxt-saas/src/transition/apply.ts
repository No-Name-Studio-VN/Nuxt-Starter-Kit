import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { CliError } from '../errors';
import { hasSymbolicLink, pruneEmptyDirectories } from '../util/fs';
import { resolveInside } from '../util/paths';
import type { TransitionPlan } from './plan';

export async function applyPlan(projectRoot: string, plan: TransitionPlan): Promise<void> {
  for (const change of plan.changes) {
    if (change.kind === 'keep-edited' || change.kind === 'keep-protected') continue;
    const path = resolveInside(projectRoot, change.path, 'Transition path');
    if (path === resolve(projectRoot)) throw new CliError('Transition path must name a file.');
    if (await hasSymbolicLink(projectRoot, path)) {
      throw new CliError(`Cannot apply transition through a symbolic link: ${change.path}`);
    }
    if (change.kind === 'delete') {
      await unlink(path);
      await pruneEmptyDirectories(projectRoot, dirname(path));
      continue;
    }
    if (change.content === undefined)
      throw new CliError(`Missing transition content: ${change.path}`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, change.content);
  }
}
