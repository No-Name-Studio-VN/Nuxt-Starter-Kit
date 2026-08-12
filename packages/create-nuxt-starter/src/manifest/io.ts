import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CliError } from '../errors';
import type { RegistryModule } from '../registry/schema';
import type { RenderedFile } from '../render/render';
import { pathExists, writeJsonAtomically } from '../util/fs';
import {
  MANIFEST_SCHEMA_VERSION,
  parseManifest,
  RENDER_VERSION,
  type ProjectManifest,
} from './schema';

export { MANIFEST_SCHEMA_VERSION, RENDER_VERSION } from './schema';
export type { ManifestModule, ProjectManifest } from './schema';

export const MANIFEST_PATH = '.nuxt-starter/manifest.json';

export interface BuildManifestOptions {
  kit: { template: string; revision: string };
  placeholders: Record<string, string>;
  modules: RegistryModule[];
  rendered: RenderedFile[];
}

export function buildManifest(options: BuildManifestOptions): ProjectManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    renderVersion: RENDER_VERSION,
    kit: options.kit,
    placeholders: options.placeholders,
    modules: options.modules.map((module) => ({
      id: module.id,
      version: module.version,
      files: Object.fromEntries(
        options.rendered
          .filter((file) => file.moduleId === module.id)
          .map((file) => [file.path, file.hash]),
      ),
      orphaned: [],
    })),
  };
}

export async function readManifest(projectRoot: string): Promise<ProjectManifest> {
  const path = join(projectRoot, MANIFEST_PATH);
  if (!(await pathExists(path))) {
    throw new CliError(`${projectRoot} is not a Nuxt Starter Kit project (no ${MANIFEST_PATH}).`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new CliError(`Unable to read ${path}: ${message}`);
  }
  return parseManifest(parsed, path);
}

export async function writeManifest(projectRoot: string, manifest: ProjectManifest): Promise<void> {
  await writeJsonAtomically(join(projectRoot, MANIFEST_PATH), manifest);
}
