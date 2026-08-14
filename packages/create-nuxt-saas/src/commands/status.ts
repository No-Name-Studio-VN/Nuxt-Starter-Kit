import { CliError } from '../errors';
import { readManifest } from '../manifest/io';
import { parseMarkers } from '../markers/parse';
import type { Registry } from '../registry/schema';
import { isCommitId } from '../sources/resolveRevision';
import { hashContent, pathExists, readTextFile } from '../util/fs';
import { resolveInside } from '../util/paths';

export interface StatusModule {
  id: string;
  version: string;
  registryVersion: string | null;
  modified: string[];
  missing: string[];
  orphaned: string[];
}

export interface StatusReport {
  revision: string;
  registryRevision: string | null;
  updateAvailable: boolean;
  /**
   * The branch or tag the registry follows, when it names one. Whether that has
   * moved is a network question, so status reports the channel and leaves the
   * answer to `upgrade --check`.
   */
  channel: string | null;
  modules: StatusModule[];
  damagedMarkers: string[];
}

/**
 * Reads only the project and its recorded hashes — no kit is fetched, so this is
 * instant and works offline. Upgrades re-render for the authoritative answer.
 */
export async function runStatus(options: {
  projectRoot: string;
  registry: Registry | null;
}): Promise<StatusReport> {
  const manifest = await readManifest(options.projectRoot);
  const damagedMarkers: string[] = [];
  const modules: StatusModule[] = [];

  for (const module of manifest.modules) {
    const modified: string[] = [];
    const missing: string[] = [];

    for (const [path, recordedHash] of Object.entries(module.files)) {
      const absolute = resolveInside(options.projectRoot, path, 'Project file');
      if (!(await pathExists(absolute))) {
        missing.push(path);
        continue;
      }

      const contents = await readTextFile(absolute);
      if (contents === null) continue;
      if (hashContent(contents) !== recordedHash) modified.push(path);

      try {
        parseMarkers(contents, path);
      } catch (error) {
        if (!(error instanceof CliError)) throw error;
        damagedMarkers.push(path);
      }
    }

    modules.push({
      id: module.id,
      version: module.version,
      registryVersion:
        options.registry?.modules.find((candidate) => candidate.id === module.id)?.version ?? null,
      modified: modified.sort(),
      missing: missing.sort(),
      orphaned: module.orphaned,
    });
  }

  // A registry naming a branch cannot be compared against a project pinned to a
  // commit: the two are never equal, so every project would read as out of date
  // forever. Which way the branch has moved is a network question, left to
  // `upgrade --check`. Two revisions of the same kind still compare fine.
  const registryRevision = options.registry?.kit.revision ?? null;
  const incomparable =
    registryRevision !== null && !isCommitId(registryRevision) && isCommitId(manifest.kit.revision);

  return {
    revision: manifest.kit.revision,
    registryRevision,
    updateAvailable:
      !incomparable && registryRevision !== null && registryRevision !== manifest.kit.revision,
    channel: incomparable ? registryRevision : null,
    modules,
    damagedMarkers: [...new Set(damagedMarkers)].sort(),
  };
}
