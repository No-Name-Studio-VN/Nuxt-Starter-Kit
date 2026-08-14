import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CliError } from '../errors';
import { buildManifest, writeManifest } from '../manifest/io';
import { resolveModules } from '../registry/resolve';
import type { Registry, RegistryModule } from '../registry/schema';
import type { Placeholders } from '../render/placeholders';
import { renderKit } from '../render/render';
import { fetchKit } from '../sources/fetchKit';
import { applyStructuredChanges, planStructuredChanges } from '../upgrade/structured';
import { hashContent, pathExists, writeJsonAtomically } from '../util/fs';

export interface InitOptions {
  registry: Registry;
  targetDir: string;
  moduleIds: string[];
  placeholders: Placeholders;
  localKitRoot?: string;
}

export interface InitResult {
  projectRoot: string;
  moduleIds: string[];
  fileCount: number;
  notes: string[];
  env: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface StructuredSplit {
  /** Fragments belonging to modules this project does not install. */
  previous: Record<string, unknown>[];
  /** Fragments belonging to modules this project does install. */
  next: Record<string, unknown>[];
}

/**
 * Splits every module's structured fragments by the JSON file they target.
 *
 * A committed kit file is the union of all its modules — the kit itself has to
 * build, so its `package.json` lists every dependency any module needs. Rendering
 * a subset therefore means taking the unselected modules' entries back out, which
 * is the same three-way merge an upgrade runs: `previous` is what the modules
 * being left behind contributed, `next` is what the selected ones want. Entries
 * two modules share stay put as long as one of them is selected.
 */
function collectStructured(
  registry: Registry,
  selected: RegistryModule[],
): Map<string, StructuredSplit> {
  const selectedIds = new Set(selected.map((module) => module.id));
  const byFile = new Map<string, StructuredSplit>();

  for (const module of registry.modules) {
    for (const [file, fragment] of Object.entries(module.structured)) {
      const split = byFile.get(file) ?? { previous: [], next: [] };
      if (selectedIds.has(module.id)) split.next.push(fragment);
      else split.previous.push(fragment);
      byFile.set(file, split);
    }
  }
  return byFile;
}

async function assertEmptyTarget(projectRoot: string): Promise<void> {
  if (!(await pathExists(projectRoot))) return;
  const entries = await readdir(projectRoot);
  if (entries.length > 0) {
    throw new CliError(`${projectRoot} is not empty. Choose an empty directory.`);
  }
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const projectRoot = resolve(options.targetDir);
  await assertEmptyTarget(projectRoot);

  const modules = resolveModules(options.registry, options.moduleIds);
  const kit = await fetchKit({
    template: options.registry.kit.template,
    revision: options.registry.kit.revision,
    ...(options.localKitRoot === undefined ? {} : { localKitRoot: options.localKitRoot }),
  });

  try {
    await mkdir(projectRoot, { recursive: true });
    const rendered = await renderKit({
      kitRoot: kit.root,
      registryModules: options.registry.modules,
      modules,
      placeholders: options.placeholders,
      destinationRoot: projectRoot,
    });

    const selectedTargets = new Set(modules.flatMap((module) => Object.keys(module.structured)));

    for (const [file, split] of collectStructured(options.registry, modules)) {
      const path = join(projectRoot, file);
      if (!(await pathExists(path))) {
        // Only a selected module can be owed a file: an unselected one having
        // entries to subtract from a file nobody renders is simply a no-op.
        if (!selectedTargets.has(file)) continue;
        throw new CliError(
          `Module structured data targets "${file}", which no installed module provides.`,
        );
      }
      const document: unknown = JSON.parse(await readFile(path, 'utf8'));
      if (!isPlainObject(document)) {
        throw new CliError(`Structured target "${file}" must contain a JSON object.`);
      }
      const changes = planStructuredChanges({ file, document, ...split });
      await writeJsonAtomically(path, applyStructuredChanges(document, changes));

      // Rehash after the rewrite, or the first upgrade would mistake the
      // merged file for a user edit.
      const renderedFile = rendered.find((candidate) => candidate.path === file);
      if (renderedFile) renderedFile.hash = hashContent(await readFile(path, 'utf8'));
    }

    const manifest = buildManifest({
      kit: options.registry.kit,
      placeholders: options.placeholders,
      modules,
      rendered,
    });
    await writeManifest(projectRoot, manifest);

    return {
      projectRoot,
      moduleIds: modules.map((module) => module.id),
      fileCount: rendered.length,
      notes: modules.flatMap((module) => module.notes),
      env: [...new Set(modules.flatMap((module) => module.env))],
    };
  } finally {
    await kit.cleanup();
  }
}
