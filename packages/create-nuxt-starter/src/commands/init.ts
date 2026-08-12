import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CliError } from '../errors';
import { buildManifest, writeManifest } from '../manifest/io';
import { resolveModules } from '../registry/resolve';
import type { Registry, RegistryModule } from '../registry/schema';
import type { Placeholders } from '../render/placeholders';
import { renderKit } from '../render/render';
import { fetchKit } from '../sources/fetchKit';
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

/** Deep-merges a module's structured fragment into a parsed JSON document. */
function mergeFragment(target: Record<string, unknown>, fragment: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(fragment)) {
    const existing = target[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      mergeFragment(existing, value);
      continue;
    }
    // Cloned, not aliased: assigning the fragment itself would let a later
    // module's merge mutate this module's registry data in place.
    target[key] = structuredClone(value);
  }
}

/** Groups structured fragments by the JSON file they target, in install order. */
function collectStructured(modules: RegistryModule[]): Map<string, Record<string, unknown>[]> {
  const byFile = new Map<string, Record<string, unknown>[]>();
  for (const module of modules) {
    for (const [file, fragment] of Object.entries(module.structured)) {
      byFile.set(file, [...(byFile.get(file) ?? []), fragment]);
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
      modules,
      placeholders: options.placeholders,
      destinationRoot: projectRoot,
    });

    for (const [file, fragments] of collectStructured(modules)) {
      const path = join(projectRoot, file);
      if (!(await pathExists(path))) {
        throw new CliError(
          `Module structured data targets "${file}", which no installed module provides.`,
        );
      }
      const document: unknown = JSON.parse(await readFile(path, 'utf8'));
      if (!isPlainObject(document)) {
        throw new CliError(`Structured target "${file}" must contain a JSON object.`);
      }
      for (const fragment of fragments) mergeFragment(document, fragment);
      await writeJsonAtomically(path, document);

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
