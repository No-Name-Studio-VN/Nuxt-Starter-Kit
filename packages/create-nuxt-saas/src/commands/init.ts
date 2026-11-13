import { cp, lstat, mkdir, mkdtemp, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { CliError } from '../errors';
import { resolveSelection } from '../kit/modules';
import type { KitSnapshot } from '../kit/source';
import { initRepository } from '../project/git';
import { writeState } from '../project/state';
import { render, type ProjectIdentity } from '../render/render';
import { followUpsFor } from '../transition/followUps';
import { hasSymbolicLink, pathExists } from '../util/fs';
import { resolveInside } from '../util/paths';
import { sanitizeProjectName } from '../util/projectName';

export interface InitReport {
  target: string;
  modules: string[];
  git: 'committed' | 'initialised' | 'skipped';
  followUps: string[];
}

async function checkTarget(target: string): Promise<boolean> {
  if (!(await pathExists(target))) return false;
  const entry = await lstat(target);
  if (entry.isSymbolicLink())
    throw new CliError(`Cannot initialize a symbolic link target: ${target}`);
  if (!entry.isDirectory() || (await readdir(target)).length > 0) {
    throw new CliError(`Target ${target} is not empty.`);
  }
  return true;
}

async function publish(temporary: string, target: string): Promise<void> {
  // Check again after rendering; never recursively remove a user's existing target.
  if (await checkTarget(target)) await rmdir(target);
  try {
    await rename(temporary, target);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EXDEV')) throw error;
    // Claim the destination exclusively so cleanup only removes a directory we own.
    await mkdir(target);
    try {
      for (const entry of await readdir(temporary)) {
        await cp(join(temporary, entry), join(target, entry), {
          recursive: true,
          dereference: false,
          force: false,
          errorOnExist: true,
        });
      }
    } catch (copyError) {
      await rm(target, { recursive: true, force: true });
      throw copyError;
    }
  }
}

export async function runInit(opts: {
  target: string;
  identity: ProjectIdentity;
  requested: string[];
  kit: KitSnapshot;
  git: boolean;
}): Promise<InitReport> {
  const target = resolve(opts.target);
  const modules = resolveSelection(opts.kit.modules, opts.requested).sort();
  const identity = {
    name: sanitizeProjectName(opts.identity.name),
    description: opts.identity.description,
  };
  const parent = dirname(target);
  let temporary: string;
  try {
    await mkdir(parent, { recursive: true });
    await checkTarget(target);
    temporary = await mkdtemp(join(parent, '.nuxt-saas-'));
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(
      `Unable to prepare project directory ${parent}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    const tree = await render(opts.kit, modules, identity);
    for (const [path, file] of tree) {
      const absolute = resolveInside(temporary, path, 'Rendered path');
      if (absolute === temporary) throw new CliError('Rendered path must name a file.');
      if (await hasSymbolicLink(temporary, absolute)) {
        throw new CliError(`Cannot write through a symbolic link: ${path}`);
      }
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, file.content);
    }
    await writeState(temporary, {
      version: 3,
      kit: opts.kit.template,
      commit: opts.kit.commit,
      modules,
      identity,
      conflicts: [],
    });
    const git = opts.git ? await initRepository(temporary) : 'skipped';
    const followUps = followUpsFor(null, tree, [], modules);
    await publish(temporary, target);
    return { target, modules, git, followUps };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
