import { join } from 'node:path';
import { pathExists } from '../util/fs';
import { loadRegistry } from './load';
import type { Registry } from './schema';

/** Where a kit checkout may carry its own registry, kit root first. */
const IN_KIT_REGISTRY_PATHS = [
  'registry.json',
  'packages/create-nuxt-starter/registry/registry.json',
];

/**
 * Reads the module definitions as they existed in a given kit revision. The paths
 * a module owns change over time, so rendering an old revision with today's
 * declarations would produce a base tree that never existed — and every merge
 * against it would be wrong.
 */
export async function loadRegistryFromKit(kitRoot: string): Promise<Registry | null> {
  for (const candidate of IN_KIT_REGISTRY_PATHS) {
    const path = join(kitRoot, candidate);
    if (await pathExists(path)) return loadRegistry(path);
  }
  return null;
}
