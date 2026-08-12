import { readFile } from 'node:fs/promises';
import { dirname, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError } from '../errors';
import { pathExists } from '../util/fs';
import { parseRegistry, type Registry } from './schema';

/**
 * Walks up from this module to the package root holding `registry/registry.json`.
 * The depth differs between running from `src/` (tests) and the bundled `dist/`,
 * so the location is discovered rather than hard-coded.
 */
async function findBundledRegistry(): Promise<string> {
  let directory = dirname(fileURLToPath(import.meta.url));
  const { root } = parse(directory);
  while (true) {
    const candidate = resolve(directory, 'registry/registry.json');
    if (await pathExists(candidate)) return candidate;
    if (directory === root) {
      throw new CliError('The bundled registry is missing from this installation.');
    }
    directory = dirname(directory);
  }
}

export async function loadRegistry(registryPath?: string): Promise<Registry> {
  const absolutePath =
    registryPath === undefined ? await findBundledRegistry() : resolve(registryPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(absolutePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new CliError(`Unable to read registry at ${absolutePath}: ${message}`);
  }
  return parseRegistry(parsed, absolutePath);
}
