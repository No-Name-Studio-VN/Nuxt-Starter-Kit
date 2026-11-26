import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, rename, rmdir, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
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

/** Inspect below the project root, allowing the root itself to be a symlink. */
export async function hasSymbolicLink(root: string, filePath: string): Promise<boolean> {
  let current = resolve(root);
  const segments = relative(current, filePath).split(sep).filter(Boolean);
  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) return true;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'ENOENT' || error.code === 'ENOTDIR')
      )
        return false;
      throw error;
    }
  }
  return false;
}

export function readRegularFile(root: string, path: string): Promise<Buffer | null | 'owned'>;
export function readRegularFile(
  root: string,
  path: string,
  maxBytes: number,
): Promise<Buffer | null | 'owned' | 'tooLarge'>;
/** Reject links and non-regular files. An optional cap applies even if a file grows during the read. */
export async function readRegularFile(
  root: string,
  path: string,
  maxBytes?: number,
): Promise<Buffer | null | 'owned' | 'tooLarge'> {
  try {
    if ((await hasSymbolicLink(root, path)) || !(await lstat(path)).isFile()) return 'owned';
    if (maxBytes === undefined) return await readFile(path);
    const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
    const file = await open(path, flags);
    try {
      const stats = await file.stat();
      const current = await lstat(path);
      if (
        !stats.isFile() ||
        !current.isFile() ||
        stats.dev !== current.dev ||
        stats.ino !== current.ino ||
        (await hasSymbolicLink(root, path))
      )
        return 'owned';
      if (stats.size > maxBytes) return 'tooLarge';
      let buffer = Buffer.allocUnsafe(stats.size + 1);
      let offset = 0;
      while (offset <= maxBytes) {
        if (offset === buffer.length) {
          const grown = Buffer.allocUnsafe(Math.min(maxBytes + 1, buffer.length * 2));
          buffer.copy(grown);
          buffer = grown;
        }
        const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, null);
        if (!bytesRead) return buffer.subarray(0, offset);
        offset += bytesRead;
      }
      return 'tooLarge';
    } finally {
      await file.close();
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      if (error.code === 'ENOENT') return null;
      if (error.code === 'ENOTDIR' || error.code === 'ELOOP') return 'owned';
    }
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

  while (current !== stop && current.startsWith(stop.endsWith(sep) ? stop : `${stop}${sep}`)) {
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
