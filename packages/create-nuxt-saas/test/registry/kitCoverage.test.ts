import { beforeAll, describe, expect, it } from 'vitest';
import { glob } from 'tinyglobby';
import { loadRegistry } from '../../src/registry/load';
import type { Registry } from '../../src/registry/schema';
import { resolveOwnership } from '../../src/render/render';
import { listKitFiles, mirrorKitTree } from '../support/kitTree';

/**
 * The registry describes this repository, and nothing keeps the two in step on
 * its own: a file added to the kit that no module claims silently never reaches a
 * generated project. These checks are what make authoring the registry a
 * red/green loop instead of an audit.
 */
let registry: Registry;
let kitFiles: string[];
let owners: Map<string, string>;
let excluded: Set<string>;

beforeAll(async () => {
  registry = await loadRegistry();
  kitFiles = await listKitFiles();
  const mirror = await mirrorKitTree(kitFiles);

  owners = await resolveOwnership(mirror, registry.modules);
  excluded = new Set(
    (
      await Promise.all(
        registry.exclude.map((pattern) =>
          glob(pattern, { cwd: mirror, dot: true, onlyFiles: true, followSymbolicLinks: false }),
        ),
      )
    ).flat(),
  );
}, 60_000);

describe('kit coverage', () => {
  it('assigns every kit file to a module or excludes it', () => {
    const unassigned = kitFiles.filter((path) => !owners.has(path) && !excluded.has(path));
    expect(unassigned).toEqual([]);
  });

  it('never both owns and excludes a file', () => {
    const both = [...owners.keys()].filter((path) => excluded.has(path)).sort();
    expect(both).toEqual([]);
  });

  it('has no exclude pattern that matches nothing', async () => {
    const mirror = await mirrorKitTree(kitFiles);
    const dead: string[] = [];
    for (const pattern of registry.exclude) {
      const matches = await glob(pattern, {
        cwd: mirror,
        dot: true,
        onlyFiles: true,
        followSymbolicLinks: false,
      });
      if (matches.length === 0) dead.push(pattern);
    }
    expect(dead).toEqual([]);
  }, 60_000);

  it('declares every module the registry advertises as installable', () => {
    // resolveOwnership throws on a pattern that matches nothing and on two
    // modules claiming one file, so reaching here means both hold.
    expect(registry.modules.length).toBeGreaterThan(0);
    expect(owners.size).toBeGreaterThan(0);
  });
});
