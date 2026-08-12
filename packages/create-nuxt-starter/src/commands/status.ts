import { CliError } from '../errors';
import { readManifest } from '../manifest/io';
import { parseMarkers } from '../markers/parse';
import type { Registry } from '../registry/schema';
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

  const registryRevision = options.registry?.kit.revision ?? null;
  return {
    revision: manifest.kit.revision,
    registryRevision,
    updateAvailable: registryRevision !== null && registryRevision !== manifest.kit.revision,
    modules,
    damagedMarkers: [...new Set(damagedMarkers)].sort(),
  };
}
