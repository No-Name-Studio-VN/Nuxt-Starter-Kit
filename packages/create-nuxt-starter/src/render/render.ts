import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { glob } from 'tinyglobby';
import { CliError } from '../errors';
import { stripUnselectedBlocks } from '../markers/strip';
import type { RegistryModule } from '../registry/schema';
import { hashContent, readTextFile, writeTextFile } from '../util/fs';
import { resolveInside } from '../util/paths';
import { applyPlaceholders, assertKnownPlaceholders, type Placeholders } from './placeholders';

/** Kit metadata that describes the kit but is never part of a generated project. */
const NEVER_RENDERED = new Set(['registry.json']);

export interface RenderedFile {
  path: string;
  moduleId: string;
  hash: string;
}

export interface RenderOptions {
  kitRoot: string;
  modules: RegistryModule[];
  placeholders: Placeholders;
  destinationRoot: string;
}

async function resolveOwnership(
  kitRoot: string,
  modules: RegistryModule[],
): Promise<Map<string, string>> {
  const owners = new Map<string, string>();
  for (const module of modules) {
    for (const pattern of module.paths) {
      const matches = await glob(pattern, {
        cwd: kitRoot,
        dot: true,
        onlyFiles: true,
        followSymbolicLinks: false,
      });
      if (matches.length === 0) {
        throw new CliError(
          `Module "${module.id}" declares path "${pattern}", which matches no file in the kit.`,
        );
      }
      for (const match of matches) {
        if (NEVER_RENDERED.has(match)) continue;
        const existingOwner = owners.get(match);
        if (existingOwner && existingOwner !== module.id) {
          throw new CliError(
            `File "${match}" is claimed by both "${existingOwner}" and "${module.id}".`,
          );
        }
        owners.set(match, module.id);
      }
    }
  }
  return owners;
}

/**
 * Produces the exact file tree a module selection belongs to: owned files copied
 * verbatim, unselected marker blocks deleted, placeholder tokens substituted.
 * Nothing else — upgrades re-render old revisions with this same function and
 * diff the result, so any nondeterminism here corrupts merges later.
 */
export async function renderKit(options: RenderOptions): Promise<RenderedFile[]> {
  const { kitRoot, modules, placeholders, destinationRoot } = options;
  assertKnownPlaceholders(placeholders);

  const selectedIds = new Set(modules.map((module) => module.id));
  const owners = await resolveOwnership(kitRoot, modules);
  const rendered: RenderedFile[] = [];

  const ownedPaths = [...owners.entries()].sort(([left], [right]) => left.localeCompare(right));

  for (const [path, moduleId] of ownedPaths) {
    const source = resolveInside(kitRoot, path, 'Kit file');
    const destination = resolveInside(destinationRoot, path, 'Generated file');
    await mkdir(dirname(destination), { recursive: true });

    const contents = await readTextFile(source);
    if (contents === null) {
      const raw = await readFile(source);
      await writeFile(destination, raw);
      rendered.push({ path, moduleId, hash: hashContent(raw) });
      continue;
    }

    const stripped = stripUnselectedBlocks(contents, selectedIds, path);
    const substituted = applyPlaceholders(stripped, placeholders);
    await writeTextFile(destination, substituted);
    rendered.push({ path, moduleId, hash: hashContent(substituted) });
  }

  return rendered;
}
