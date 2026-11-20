import { glob } from 'tinyglobby';
import { readKitConfig } from '../kit/config';
import { collectNotes } from '../kit/notes';
import type { JsonInspectFeatures, JsonNoteReport } from '../types/json';
import type { KitSnapshot } from '../kit/source';
import { render, type ProjectIdentity } from '../render/render';
import { readState, unresolvedConflicts } from '../project/state';
import { equal, readUserFile } from '../transition/plan';
import { isProtected } from '../transition/protected';
import { resolveInside, toPosixPath } from '../util/paths';

export type InspectStatus = 'unchanged' | 'edited' | 'deleted' | 'protected';

export interface InspectFile {
  path: string;
  status: InspectStatus;
  layer: string;
  expected: boolean;
}

export interface InspectReport {
  commit: string;
  kit: string;
  modules: string[];
  identity: ProjectIdentity;
  conflicts: { recorded: string[]; unresolved: string[] };
  files: InspectFile[];
  features: JsonInspectFeatures;
  summary: {
    total: number;
    unchanged: number;
    edited: number;
    deleted: number;
    protected: number;
    expected: number;
    scored: number;
    scoredChanged: number;
  };
}

async function globSet(patterns: string[], cwd: string): Promise<Set<string>> {
  if (patterns.length === 0) return new Set();
  const paths = await glob(patterns, {
    cwd,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
  });
  return new Set(paths.map(toPosixPath));
}

/** Read-only comparison of a project against the kit commit it was last rendered from. */
export async function runInspect(opts: {
  projectRoot: string;
  kit: KitSnapshot;
}): Promise<InspectReport> {
  const { projectRoot, kit } = opts;
  const state = await readState(projectRoot);
  const unresolved = await unresolvedConflicts(projectRoot, state);
  const tree = await render(kit, state.modules, state.identity);
  const config = await readKitConfig(kit.dir);
  const selected = new Set(state.modules);
  const rootFiles = await Promise.all(
    kit.modules
      .filter((module) => selected.has(module.id) && module.rootFiles.length > 0)
      .map(async (module) => ({ id: module.id, paths: await globSet(module.rootFiles, kit.dir) })),
  );
  const userOwned = await globSet(config.userOwned, kit.dir);
  // The README is rendered from a template, so it never exists as a kit file to glob.
  if (config.userOwned.includes('README.md')) userOwned.add('README.md');

  function layerOf(path: string): string {
    const layer = /^layers\/([^/]+)\//.exec(path)?.[1];
    if (layer) return layer;
    return rootFiles.find((entry) => entry.paths.has(path))?.id ?? 'base';
  }

  const files: InspectFile[] = [];
  for (const [path, rendered] of tree) {
    let status: InspectStatus = 'protected';
    if (!isProtected(path)) {
      const user = await readUserFile(projectRoot, resolveInside(projectRoot, path, 'Kit file'));
      if (user === 'owned') status = 'edited';
      else if (user === null) status = 'deleted';
      else status = equal(user, rendered) ? 'unchanged' : 'edited';
    }
    files.push({ path, status, layer: layerOf(path), expected: userOwned.has(path) });
  }

  const edited = new Set(files.filter(({ status }) => status === 'edited' || status === 'deleted').map(({ path }) => path));
  const unresolvedPaths = new Set(unresolved);
  const declined = new Set(state.declined);
  const missing = collectNotes(config.changes, kit.modules, state.modules).flatMap((note): JsonNoteReport[] => {
    if (declined.has(note.id)) return [];
    const affected = note.files.filter((path) => edited.has(path));
    if (!affected.length) return [];
    const outcome = affected.some((path) => unresolvedPaths.has(path)) ? 'conflict' : 'kept';
    return [{ ...note, affected, outcome }];
  });
  const count = (status: InspectStatus) => files.filter((file) => file.status === status).length;
  const scored = files.filter((file) => file.status !== 'protected' && !file.expected);
  return {
    commit: kit.commit,
    kit: state.kit,
    modules: state.modules,
    identity: state.identity,
    conflicts: { recorded: state.conflicts, unresolved },
    files,
    features: { missing, declined: state.declined },
    summary: {
      total: files.length,
      unchanged: count('unchanged'),
      edited: count('edited'),
      deleted: count('deleted'),
      protected: count('protected'),
      expected: files.filter((file) => file.status !== 'protected' && file.expected).length,
      scored: scored.length,
      scoredChanged: scored.filter((file) => file.status === 'edited' || file.status === 'deleted')
        .length,
    },
  };
}
