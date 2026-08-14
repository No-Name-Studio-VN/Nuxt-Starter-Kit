import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rename, rmdir, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { CliError } from '../errors';

export async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function listFiles(root: string): Promise<string[]> {
  async function visit(directory: string, prefix: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        throw new CliError(`Unsupported symbolic link: ${relativePath}`);
      }
      if (entry.isDirectory()) {
        files.push(...(await visit(resolve(directory, entry.name), relativePath)));
        continue;
      }
      if (!entry.isFile()) {
        throw new CliError(`Unsupported file type: ${relativePath}`);
      }
      files.push(relativePath);
    }
    return files;
  }
  return visit(root, '');
}

/**
 * Deletes `directory` and its now-childless parents, stopping at `root` or at the
 * first directory that still holds something.
 *
 * Removing a module deletes its files one by one, which leaves the directories
 * that held them standing empty — visible in the editor tree, and a module that
 * promised to leave nothing behind. `rmdir` refuses a non-empty directory, so the
 * emptiness check and the removal are the same call.
 */
export async function pruneEmptyDirectories(root: string, directory: string): Promise<void> {
  const stop = resolve(root);
  let current = resolve(directory);

  while (current !== stop && current.startsWith(`${stop}/`)) {
    try {
      await rmdir(current);
    } catch {
      return;
    }
    current = dirname(current);
  }
}

export async function readTextFile(path: string): Promise<string | null> {
  const contents = await readFile(path);
  if (contents.includes(0)) return null;
  return contents.toString('utf8');
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, 'utf8');
}

export async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });
  const temporaryPath = resolve(directory, `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

export function hashContent(contents: string | Buffer): string {
  return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}
