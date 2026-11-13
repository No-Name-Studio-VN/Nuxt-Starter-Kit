import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CliError } from '../errors';
import { mergeFiles } from '../git/mergeFile';
import type { Tree, TreeFile } from '../render/render';
import { hasSymbolicLink } from '../util/fs';
import { resolveInside } from '../util/paths';
import { isProtected } from './protected';

export type ChangeKind =
  | 'create'
  | 'update'
  | 'merge'
  | 'conflict'
  | 'delete'
  | 'keep-edited'
  | 'keep-protected';
export interface FileChange {
  path: string;
  kind: ChangeKind;
  content?: Buffer;
}
export interface TransitionPlan {
  changes: FileChange[];
}

function normalized(content: Buffer): string {
  return content.toString('utf8').replaceAll('\r\n', '\n');
}

function equal(left: TreeFile, right: TreeFile): boolean {
  return left.binary || right.binary
    ? left.content.equals(right.content)
    : normalized(left.content) === normalized(right.content);
}

async function readUserFile(root: string, path: string): Promise<TreeFile | null | 'owned'> {
  if (await hasSymbolicLink(root, path)) return 'owned';
  try {
    if (!(await lstat(path)).isFile()) return 'owned';
    const content = await readFile(path);
    return { content, binary: content.includes(0) };
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      if (error.code === 'ENOENT') return null;
      if (error.code === 'ENOTDIR') return 'owned';
    }
    throw error;
  }
}

async function merge(
  path: string,
  base: TreeFile | undefined,
  user: TreeFile,
  target: TreeFile,
): Promise<FileChange> {
  const directory = await mkdtemp(join(tmpdir(), 'nsk-transition-'));
  try {
    const oursPath = join(directory, 'ours');
    const basePath = join(directory, 'base');
    const theirsPath = join(directory, 'theirs');
    await writeFile(oursPath, normalized(user.content));
    await writeFile(basePath, base ? normalized(base.content) : '');
    await writeFile(theirsPath, normalized(target.content));
    const result = await mergeFiles({
      oursPath,
      basePath,
      theirsPath,
      labels: { ours: 'yours', base: 'kit (old)', theirs: 'kit (new)' },
    });
    // Git sees LF-only inputs; keep a Windows user's line endings in its output.
    const content = user.content.includes('\r\n')
      ? result.content.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n')
      : result.content;
    return {
      path,
      kind: result.status === 'clean' ? 'merge' : 'conflict',
      content: Buffer.from(content),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function planTransition(
  projectRoot: string,
  base: Tree | null,
  target: Tree,
): Promise<TransitionPlan> {
  const changes: FileChange[] = [];
  const paths = new Set([...(base?.keys() ?? []), ...target.keys()]);
  for (const path of [...paths].sort()) {
    const absolute = resolveInside(projectRoot, path, 'Transition path');
    if (absolute === resolve(projectRoot)) throw new CliError('Transition path must name a file.');
    const oldFile = base?.get(path);
    const newFile = target.get(path);
    const protectedPath = isProtected(path);
    const unchanged = oldFile && newFile && equal(oldFile, newFile);
    if (unchanged && !protectedPath) continue;
    const user = await readUserFile(projectRoot, absolute);
    if (user === 'owned') {
      if (!unchanged) changes.push({ path, kind: 'keep-edited' });
      continue;
    }
    if (protectedPath && !user) {
      if (!oldFile && newFile) {
        changes.push({ path, kind: 'create', content: newFile.content });
      }
      continue;
    }
    if (unchanged) continue;
    if (!newFile) {
      if (user && oldFile) {
        const kind = equal(user, oldFile)
          ? protectedPath
            ? 'keep-protected'
            : 'delete'
          : 'keep-edited';
        changes.push({ path, kind });
      }
      continue;
    }
    if (!user) {
      changes.push(
        oldFile
          ? { path, kind: 'keep-edited' }
          : { path, kind: 'create', content: newFile.content },
      );
      continue;
    }
    if (!oldFile && equal(user, newFile)) continue;
    if (oldFile && equal(user, oldFile)) {
      changes.push(
        protectedPath
          ? { path, kind: 'keep-protected' }
          : { path, kind: 'update', content: newFile.content },
      );
      continue;
    }
    if (user.binary || oldFile?.binary || newFile.binary) {
      changes.push({ path, kind: 'keep-edited' });
      continue;
    }
    changes.push(
      protectedPath ? { path, kind: 'keep-protected' } : await merge(path, oldFile, user, newFile),
    );
  }
  return { changes };
}
