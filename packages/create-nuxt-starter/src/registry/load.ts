import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError } from '../errors';
import { parseRegistry, type Registry } from './schema';

const bundledRegistryPath = fileURLToPath(new URL('../registry/registry.json', import.meta.url));

export async function loadRegistry(registryPath: string = bundledRegistryPath): Promise<Registry> {
  const absolutePath = resolve(registryPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(absolutePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new CliError(`Unable to read registry at ${absolutePath}: ${message}`);
  }
  return parseRegistry(parsed, absolutePath);
}
