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
  /**
   * Every module the revision's registry defines. Ownership is a property of the
   * kit, not of the selection: if it were resolved over the selected modules
   * alone, a directory glob would swallow the files a module left out claims
   * individually and render them into a project that never asked for them.
   */
  registryModules: RegistryModule[];
  /** The modules this project installs. */
  modules: RegistryModule[];
  placeholders: Placeholders;
  destinationRoot: string;
}

/** A pattern that names one file, with nothing left for the globber to expand. */
function isExactPath(pattern: string): boolean {
  return !/[*?[\]{}]/.test(pattern);
}

/**
 * Maps every kit path a module claims to the module that claims it, failing on a
 * pattern that matches nothing and on two modules claiming the same file.
 * Exported so the kit coverage check can ask the same question rendering asks.
 *
 * Naming a file exactly claims it out of whatever directory glob also covers it —
 * that is how `pwa` owns one component inside `base`'s components directory
 * without `base` having to enumerate the several hundred files it keeps. Two
 * patterns of the same kind claiming one file is still ambiguous, and still an
 * error.
 */
export async function resolveOwnership(
  kitRoot: string,
  modules: RegistryModule[],
): Promise<Map<string, string>> {
  const byGlob = new Map<string, string>();
  const byExactPath = new Map<string, string>();

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
      const claims = isExactPath(pattern) ? byExactPath : byGlob;
      for (const match of matches) {
        if (NEVER_RENDERED.has(match)) continue;
        const existingOwner = claims.get(match);
        if (existingOwner && existingOwner !== module.id) {
          throw new CliError(
            `File "${match}" is claimed by both "${existingOwner}" and "${module.id}".`,
          );
        }
        claims.set(match, module.id);
      }
    }
  }

  return new Map([...byGlob, ...byExactPath]);
}

/**
 * Produces the exact file tree a module selection belongs to: owned files copied
 * verbatim, unselected marker blocks deleted, placeholder tokens substituted.
 * Nothing else — upgrades re-render old revisions with this same function and
 * diff the result, so any nondeterminism here corrupts merges later.
 */
export async function renderKit(options: RenderOptions): Promise<RenderedFile[]> {
  const { kitRoot, modules, registryModules, placeholders, destinationRoot } = options;
  assertKnownPlaceholders(placeholders);

  const selectedIds = new Set(modules.map((module) => module.id));
  const owners = await resolveOwnership(kitRoot, registryModules);
  const rendered: RenderedFile[] = [];

  const ownedPaths = [...owners.entries()]
    .filter(([, moduleId]) => selectedIds.has(moduleId))
    .sort(([left], [right]) => left.localeCompare(right));

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
