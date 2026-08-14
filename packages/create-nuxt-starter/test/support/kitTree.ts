import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { makeTempDir } from './fixtureKit';

const execFileAsync = promisify(execFile);

/** This repository — the kit the bundled registry describes. */
export const KIT_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/**
 * The kit as a consumer receives it. `giget` ships an archive of the git tree, so
 * tracked files are the definition of "every kit file" — local build output and
 * anything else git ignores was never part of the kit.
 */
export async function listKitFiles(): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
    cwd: KIT_ROOT,
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout.split('\0').filter(Boolean).sort();
}

/**
 * An empty-file mirror of those paths. Ownership only ever asks which patterns
 * match which paths, so contents are irrelevant — and globbing a throwaway tree
 * keeps the check away from `node_modules` and the local `.nuxt` output, which a
 * released kit does not contain.
 */
export async function mirrorKitTree(paths: string[]): Promise<string> {
  const root = await makeTempDir('kit-mirror');
  for (const path of paths) {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, '');
  }
  return root;
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads a JSON file as an object, narrowing without an assertion. */
export async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isJsonObject(parsed)) throw new Error(`Expected ${path} to hold a JSON object.`);
  return parsed;
}
