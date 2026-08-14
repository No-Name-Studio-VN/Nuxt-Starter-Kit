import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from '../../src/registry/load';
import type { Registry } from '../../src/registry/schema';

export const FIXTURE_KIT_V1_ROOT = fileURLToPath(new URL('../fixtures/kit-v1/', import.meta.url));

export const FIXTURE_KIT_V2_ROOT = fileURLToPath(new URL('../fixtures/kit-v2/', import.meta.url));

export function loadFixtureRegistry(): Promise<Registry> {
  return loadRegistry(join(FIXTURE_KIT_V1_ROOT, 'registry.json'));
}

export function loadFixtureRegistryV2(): Promise<Registry> {
  return loadRegistry(join(FIXTURE_KIT_V2_ROOT, 'registry.json'));
}

export function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `nsk-${prefix}-`));
}
