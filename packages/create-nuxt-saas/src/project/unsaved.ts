import { git, splitPaths, workTree, type WorkTree } from '../git/snapshot';
import type { FileChange } from '../transition/plan';
import type { JsonUnsaved } from '../types/json';

export async function assessUnsaved(
  projectRoot: string,
  changes: FileChange[],
  repository?: WorkTree | null,
): Promise<JsonUnsaved | null> {
  const repo = repository === undefined ? await workTree(projectRoot) : repository;
  if (!repo) return null;
  const status = await git(projectRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.']);
  const entries = splitPaths(status);
  const paths = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    paths.add(entry.slice(3));
    if (/R/.test(entry.slice(0, 2))) {
      const source = entries[++i];
      if (source) paths.add(source);
    } else if (/C/.test(entry.slice(0, 2))) {
      i++;
    }
  }
  const kinds = new Map(changes.map(({ path, kind }) => [path, kind]));
  const unsaved: JsonUnsaved = { total: 0, risky: [], touched: [], untouched: 0 };
  for (const path of [...paths].sort()) {
    if (!path.startsWith(repo.prefix)) continue;
    const relativePath = path.slice(repo.prefix.length);
    const kind = kinds.get(relativePath);
    unsaved.total++;
    if (kind === 'conflict' || kind === 'keep-edited') unsaved.risky.push({ path: relativePath, kind });
    else if (kind && kind !== 'keep-protected') unsaved.touched.push(relativePath);
    else unsaved.untouched++;
  }
  return unsaved;
}
