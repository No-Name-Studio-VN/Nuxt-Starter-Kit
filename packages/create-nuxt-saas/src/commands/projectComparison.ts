import { isUtf8 } from 'node:buffer';
import { execFile } from 'node:child_process';
import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { promisify } from 'node:util';
import { CliError } from '../errors';
import type { KitSnapshot } from '../kit/source';
import type { ProjectState } from '../project/state';
import { renderFiles } from '../render/render';
import { normalized } from '../transition/plan';
import { isProtected } from '../transition/protected';
import { JSON_SCHEMA, type JsonProjectComparison, type JsonProjectFilePatch } from '../types/json';
import { hashContent, readRegularFile } from '../util/fs';
import { isInside, resolveInside } from '../util/paths';
import { cleanupOnTermination } from '../util/terminationCleanup';

export const MAX_PROJECT_PATCH_BYTES = 1_500_000;
const run = promisify(execFile);

function previewable(path: string): boolean {
  return (
    !isProtected(path) &&
    !win32.isAbsolute(path) &&
    !path.includes('\0') &&
    !path.includes('\\') &&
    path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

function entryPath(directory: string, projectRoot: string, path: string): string {
  // Exact path membership (including case) without using user-controlled names in the scratch store.
  const key = hashContent(`${projectRoot}\0${path}`).slice('sha256:'.length);
  return join(directory, 'entries', key);
}

export async function prepareProjectComparison(
  projectRoot: string,
  directory: string,
  kit: KitSnapshot,
  state: ProjectState,
): Promise<JsonProjectComparison> {
  const stats = await lstat(directory);
  const canonicalRoot = await realpath(projectRoot);
  if (
    !stats.isDirectory() ||
    (process.platform !== 'win32' && (stats.mode & 0o077) !== 0) ||
    isInside(canonicalRoot, await realpath(directory))
  ) {
    throw new CliError(
      'The baseline directory must be a private scratch directory outside the project.',
    );
  }
  const entries = join(directory, 'entries');
  await mkdir(entries, { mode: 0o700 });
  const remove = () => rm(entries, { recursive: true, force: true });
  const stopWatching = cleanupOnTermination(remove);
  try {
    for await (const [path, file] of renderFiles(kit, state.modules, state.identity, {
      include: previewable,
      maxBytes: MAX_PROJECT_PATCH_BYTES,
    })) {
      const entry =
        file === 'tooLarge' || file.content.length > MAX_PROJECT_PATCH_BYTES
          ? 'L'
          : file.binary || !isUtf8(file.content)
            ? 'B'
            : Buffer.concat([Buffer.from('T'), file.content]);
      await writeFile(entryPath(directory, canonicalRoot, path), entry, {
        mode: 0o600,
        flag: 'wx',
      });
    }
    return { schema: JSON_SCHEMA, projectComparison: true, commit: kit.commit };
  } catch (error) {
    await remove();
    throw error;
  } finally {
    stopWatching();
  }
}

export async function projectFilePatch(
  projectRoot: string,
  directory: string,
  path: string,
  maxBytes: number,
): Promise<JsonProjectFilePatch> {
  const file: Pick<JsonProjectFilePatch, 'schema' | 'path'> = { schema: JSON_SCHEMA, path };
  if (!previewable(path)) return { ...file, status: 'unavailable' };
  if (!(await lstat(directory)).isDirectory())
    throw new CliError('The project comparison has closed. Reopen it to refresh the baseline.');
  const canonicalRoot = await realpath(projectRoot);
  const base = await readRegularFile(
    directory,
    entryPath(directory, canonicalRoot, path),
    MAX_PROJECT_PATCH_BYTES + 1,
  );
  if (base === null) return { ...file, status: 'missing' };
  if (base === 'owned') return { ...file, status: 'unavailable' };
  if (base === 'tooLarge') return { ...file, status: 'tooLarge' };
  const kind = base.toString('ascii', 0, 1);
  if (kind === 'L') return { ...file, status: 'tooLarge' };
  if (kind === 'B') return { ...file, status: 'binary' };
  if (kind !== 'T') return { ...file, status: 'unavailable' };

  const currentPath = resolveInside(canonicalRoot, path, 'Project file');
  const current = await readRegularFile(canonicalRoot, currentPath, MAX_PROJECT_PATCH_BYTES);
  if (current === 'owned') return { ...file, status: 'unavailable' };
  if (current === 'tooLarge') return { ...file, status: 'tooLarge' };
  if (current && (current.includes(0) || !isUtf8(current))) return { ...file, status: 'binary' };
  const before = normalized(base.subarray(1));
  const after = current === null ? null : normalized(current);
  if (before === after) return { ...file, status: 'unchanged' };

  // Git sees only private, bounded copies, never project paths or symlinks. Keep the literal
  // project-relative names in the patch, and use /dev/null for a deletion (including empty files).
  const scratch = await mkdtemp(join(tmpdir(), 'nuxt-saas-project-patch-'));
  const remove = () => rm(scratch, { recursive: true, force: true });
  const oldPath = `a/${path}`;
  const newPath = after === null ? '/dev/null' : `b/${path}`;
  const parent = path.split('/').slice(0, -1).join('/');
  const writeSides = async () => {
    await mkdir(join(scratch, 'a', parent), { recursive: true });
    await writeFile(join(scratch, oldPath), before);
    if (after !== null) {
      await mkdir(join(scratch, 'b', parent), { recursive: true });
      await writeFile(join(scratch, newPath), after);
    }
  };
  const written = writeSides();
  const controller = new AbortController();
  const stopWatching = cleanupOnTermination(async () => {
    controller.abort();
    // Let recursive mkdir finish before removing the temporary directory.
    await Promise.allSettled([written]);
    await remove();
  });
  try {
    await written;
    try {
      await run(
        'git',
        [
          '-c',
          'core.quotePath=false',
          'diff',
          '--no-index',
          '--no-ext-diff',
          '--no-textconv',
          '--no-color',
          '--no-prefix',
          '--text',
          '--',
          oldPath,
          newPath,
        ],
        { cwd: scratch, maxBuffer: maxBytes, signal: controller.signal },
      );
      return { ...file, status: 'unchanged' };
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
          return { ...file, status: 'tooLarge' };
        if (
          error.code === 1 &&
          'stdout' in error &&
          typeof error.stdout === 'string' &&
          error.stdout
        ) {
          return { ...file, status: 'text', patch: error.stdout };
        }
      }
      throw new CliError(
        'Git could not generate the selected file patch. Check that Git is available and retry.',
      );
    }
  } finally {
    stopWatching();
    await remove();
  }
}
