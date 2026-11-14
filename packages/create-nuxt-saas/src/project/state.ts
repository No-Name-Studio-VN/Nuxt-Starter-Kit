import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { CliError } from '../errors';
import type { ProjectIdentity } from '../render/render';
import { hasSymbolicLink, pathExists, writeJsonAtomically } from '../util/fs';
import { assertRelativePath, resolveInside } from '../util/paths';

export interface ProjectState {
  version: 3;
  kit: string;
  commit: string;
  modules: string[];
  identity: ProjectIdentity;
  conflicts: string[];
}

export const STATE_FILE = '.nuxt-saas.json';

const stateSchema = z.object({
  version: z.literal(3),
  kit: z.string().min(1),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  modules: z.array(z.string().min(1)),
  identity: z.object({ name: z.string().min(1), description: z.string() }),
  conflicts: z.array(z.string().min(1)),
});

function parseState(value: unknown): ProjectState {
  const state = stateSchema.parse(value);
  for (const path of state.conflicts) {
    assertRelativePath(path, 'Conflict path');
    if (path === '.') throw new CliError('Conflict path must name a file.');
  }
  return state;
}

export async function readState(projectRoot: string): Promise<ProjectState> {
  const path = join(projectRoot, STATE_FILE);
  if (!(await pathExists(path))) {
    if (await pathExists(join(projectRoot, '.nuxt-saas/manifest.json'))) {
      throw new CliError(
        'This project was created by create-nuxt-saas 2.x, which this version cannot manage. Generate a new project with `npm create nuxt-saas@latest` and move your code across.',
      );
    }
    throw new CliError(`${projectRoot} is not a create-nuxt-saas project.`);
  }
  try {
    if (await hasSymbolicLink(projectRoot, path)) throw new CliError('Unsupported symbolic link.');
    const value: unknown = JSON.parse(await readFile(path, 'utf8'));
    return parseState(value);
  } catch (error) {
    throw new CliError(
      `Unable to read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function writeState(projectRoot: string, state: ProjectState): Promise<void> {
  const path = join(projectRoot, STATE_FILE);
  try {
    if (await hasSymbolicLink(projectRoot, path)) throw new CliError('Unsupported symbolic link.');
    const parsed = parseState(state);
    await writeJsonAtomically(path, {
      version: parsed.version,
      kit: parsed.kit,
      commit: parsed.commit,
      modules: [...parsed.modules].sort(),
      identity: { name: parsed.identity.name, description: parsed.identity.description },
      conflicts: parsed.conflicts,
    });
  } catch (error) {
    throw new CliError(
      `Unable to write ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function unresolvedConflicts(
  projectRoot: string,
  state: ProjectState,
): Promise<string[]> {
  const unresolved: string[] = [];
  for (const path of state.conflicts) {
    const absolute = resolveInside(projectRoot, path, 'Conflict path');
    if (await hasSymbolicLink(projectRoot, absolute)) {
      throw new CliError(`Cannot inspect conflict through a symbolic link: ${path}`);
    }
    try {
      if (/^<<<<<<< /m.test(await readFile(absolute, 'utf8'))) unresolved.push(path);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'ENOENT' || error.code === 'ENOTDIR')
      )
        continue;
      throw error;
    }
  }
  return unresolved;
}
