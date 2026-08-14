import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadRegistry } from '../../src/registry/load';
import type { Registry } from '../../src/registry/schema';
import { isJsonObject, KIT_ROOT, readJsonObject } from '../support/kitTree';

/**
 * The kit's package.json is the union of every module — it has to be, or the kit
 * could not build. Rendering a subset works by subtracting the modules left
 * behind, which only produces a correct file if every entry belongs to somebody:
 * a dependency no module declares can never be subtracted, so it would ship to
 * every project regardless of what was selected.
 *
 * The three maps below are the ones ownership applies to. Everything else in
 * package.json — name, version, author, type — is project metadata, rendered
 * verbatim through placeholders rather than assembled from modules.
 */
const OWNED_SECTIONS = ['scripts', 'dependencies', 'devDependencies'] as const;

let registry: Registry;
let kitPackageJson: Record<string, unknown>;

/**
 * What the registry says a section should contain. A later module overrides an
 * earlier one, which is the rule the structured merge itself applies when it
 * flattens fragments in registry order — `pwa` extending base's `prepare` script
 * relies on it.
 */
function declaredEntries(section: string): Map<string, unknown> {
  const declared = new Map<string, unknown>();
  for (const module of registry.modules) {
    const fragment = module.structured['package.json'];
    const entries = fragment === undefined ? undefined : fragment[section];
    if (!isJsonObject(entries)) continue;
    for (const [key, value] of Object.entries(entries)) declared.set(key, value);
  }
  return declared;
}

function kitEntries(section: string): Map<string, unknown> {
  const entries = kitPackageJson[section];
  return isJsonObject(entries) ? new Map(Object.entries(entries)) : new Map();
}

beforeAll(async () => {
  registry = await loadRegistry();
  kitPackageJson = await readJsonObject(join(KIT_ROOT, 'package.json'));
});

describe.each(OWNED_SECTIONS)('package.json %s', (section) => {
  it('has an owning module for every entry the kit declares', () => {
    const declared = declaredEntries(section);
    const undeclared = [...kitEntries(section).keys()].filter((key) => !declared.has(key)).sort();
    expect(undeclared).toEqual([]);
  });

  it('declares nothing the kit does not have', () => {
    const kit = kitEntries(section);
    const phantom = [...declaredEntries(section).keys()].filter((key) => !kit.has(key)).sort();
    expect(phantom).toEqual([]);
  });

  it('agrees with the kit on every value', () => {
    const kit = kitEntries(section);
    const mismatched = [...declaredEntries(section).entries()]
      .filter(([key, value]) => kit.has(key) && JSON.stringify(kit.get(key)) !== JSON.stringify(value))
      .map(([key, value]) => `${key}: registry ${JSON.stringify(value)} vs kit ${JSON.stringify(kit.get(key))}`)
      .sort();
    expect(mismatched).toEqual([]);
  });
});
