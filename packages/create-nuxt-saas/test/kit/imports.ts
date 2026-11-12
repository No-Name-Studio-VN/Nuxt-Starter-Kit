import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'tinyglobby';
import { z } from 'zod';
import { readKitModule, resolveSelection, type KitModule } from '../../src/kit/modules';
import {
  extractImports as importsWithLines,
  resolveKitImport,
  toKitPath,
  toPackageName,
} from '../support/imports';

export const kitRoot = fileURLToPath(new URL('../../../../', import.meta.url));

export const kitFiles = execFileSync('git', ['ls-files', '-z'], {
  cwd: kitRoot,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
})
  .split('\0')
  .filter((path) => path && !/^(?:packages|docs|tests)\//.test(path))
  .sort();

const fileSet = new Set(kitFiles);
const layersRoot = join(kitRoot, 'layers');
export const layerIds = new Set(
  existsSync(layersRoot)
    ? readdirSync(layersRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [],
);

/** Globs are checked against tracked files only; literal Nuxt route names win. */
export async function trackedMatches(pattern: string): Promise<string[]> {
  if (fileSet.has(pattern)) return [pattern];
  const matches = await glob(pattern, {
    cwd: kitRoot,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
  });
  return matches.filter((path) => fileSet.has(path));
}

// Transitional ownership: removed in Task 15 together with registry/.
// Resolve every registry claim first, so an exact path never falls back into a
// different module's broader glob.
const registrySchema = z.object({
  modules: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      requires: z.array(z.string()).default([]),
      paths: z.array(z.string()),
      structured: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
    }),
  ),
});
const registryJson: unknown = JSON.parse(
  await readFile(join(kitRoot, 'packages/create-nuxt-saas/registry/registry.json'), 'utf8'),
);
const registry = registrySchema.parse(registryJson);
const registryOwners = new Map<string, string>();
const exactOwners = new Map<string, string>();
const transitionalModules: KitModule[] = [];

for (const module of registry.modules) {
  for (const pattern of module.paths) {
    const owners = fileSet.has(pattern) ? exactOwners : registryOwners;
    for (const path of await trackedMatches(pattern)) {
      const previous = owners.get(path);
      if (previous && previous !== module.id) {
        throw new Error(
          `${path}: registry ownership conflicts between ${previous} and ${module.id}`,
        );
      }
      owners.set(path, module.id);
    }
  }
  if (layerIds.has(module.id)) continue;
  const fragment = module.structured['package.json'];
  const packageSection = z.record(z.string(), z.unknown());
  transitionalModules.push({
    id: module.id,
    title: module.title,
    description: module.description,
    requires: module.requires,
    internal: false,
    dependencies: Object.keys(packageSection.parse(fragment?.dependencies ?? {})),
    devDependencies: Object.keys(packageSection.parse(fragment?.devDependencies ?? {})),
    scripts: [],
    env: [],
    bindings: [],
    rootFiles: [],
  });
}
for (const [path, owner] of exactOwners) registryOwners.set(path, owner);

// A root file keeps its registry owner after that module's layer exists: a peel
// leaves files at the root while they still carry another module's marker
// blocks, and they belong to the peeled module until they move into its layer.
function transitionalOwner(path: string): string {
  return registryOwners.get(path) ?? 'base';
}

export function importOwners(path: string, source: string) {
  const owners: string[] = [];
  let markerOwner: string | undefined;
  for (const line of source.split('\n')) {
    for (const match of line.matchAll(/<(\/?)nsk:([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)>/g)) {
      markerOwner = match[1] === '/' ? undefined : match[2];
    }
    owners.push(path.startsWith('layers/') ? ownerOf(path) : (markerOwner ?? ownerOf(path)));
  }
  return importsWithLines(source).map((entry) => ({
    ...entry,
    owner: owners[entry.line] ?? ownerOf(path),
  }));
}

export async function readLayerModules(root = kitRoot): Promise<KitModule[]> {
  const directory = join(root, 'layers');
  if (!existsSync(directory)) return [];
  const modules: KitModule[] = [];
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isDirectory()) modules.push(await readKitModule(root, entry.name));
  }
  return modules;
}

export async function boundaryModules(
  root = kitRoot,
  registryModules = transitionalModules,
): Promise<KitModule[]> {
  const layers = await readLayerModules(root);
  const peeledIds = new Set(layers.map((module) => module.id));
  const modules = [...layers, ...registryModules.filter((module) => !peeledIds.has(module.id))];
  // Layer-only validation would reject valid edges to not-yet-peeled modules.
  // Validate all merged nodes, including modules unreachable from a given file.
  resolveSelection(
    modules,
    modules.map((module) => module.id),
  );
  return modules;
}
// End transitional ownership.

export function ownerOf(kitRelativePath: string): string {
  const layerId = /^layers\/([^/]+)\//.exec(kitRelativePath)?.[1];
  return layerId ?? transitionalOwner(kitRelativePath);
}

export function extractImports(source: string): string[] {
  return importsWithLines(source).map(({ specifier }) => specifier);
}

export function targetOwner(path: string, specifier: string, modules: KitModule[]): string {
  if (specifier.startsWith('#layers/')) return specifier.split('/')[1] ?? 'base';
  // Relative and global-alias specifiers name a concrete kit path; its owner is
  // the target, so a root file still owned by an unpeeled module counts as that
  // module rather than base.
  const kitPath = toKitPath(path, specifier);
  if (kitPath !== null) return ownerOf(resolveKitImport(path, specifier, fileSet) ?? kitPath);
  const name = toPackageName(specifier);
  if (name === null) return 'base';
  return (
    modules.find(
      (module) => module.dependencies.includes(name) || module.devDependencies.includes(name),
    )?.id ?? 'base'
  );
}
