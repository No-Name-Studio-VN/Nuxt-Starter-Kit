import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'tinyglobby';
import { readKitModules, type KitModule } from '../../src/kit/modules';
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
  .filter((path) => path && !/^(?:packages|docs|tests?)\//.test(path))
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

export function importOwners(path: string, source: string) {
  return importsWithLines(source).map((entry) => ({ ...entry, owner: ownerOf(path) }));
}

export async function readLayerModules(root = kitRoot): Promise<KitModule[]> {
  return readKitModules(root);
}

export const boundaryModules = readLayerModules;

export function ownerOf(kitRelativePath: string): string {
  const layerId = /^layers\/([^/]+)\//.exec(kitRelativePath)?.[1];
  return layerId ?? 'base';
}

export function extractImports(source: string): string[] {
  return importsWithLines(source).map(({ specifier }) => specifier);
}

export function targetOwner(path: string, specifier: string, modules: KitModule[]): string {
  if (specifier.startsWith('#layers/')) return specifier.split('/')[1] ?? 'base';
  // Global aliases resolve to the kit root, not to the importing layer.
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
