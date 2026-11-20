import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { CliError } from '../errors';
import type { KitModule, ModuleGroup } from '../types/modules';
import { pathExists } from '../util/fs';
import { KIT_CONFIG_PATH, readKitConfig, type KitConfig } from './config';
import { changeNotesSchema, collectNotes } from './notes';

export type { KitModule } from '../types/modules';

const moduleSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  group: z.string().min(1).optional(),
  parent: z.string().min(1).optional(),
  requiresOneOf: z.array(z.string()).default([]),
  requires: z.array(z.string()).default([]),
  internal: z.boolean().default(false),
  dependencies: z.array(z.string()).default([]),
  devDependencies: z.array(z.string()).default([]),
  scripts: z.array(z.string()).default([]),
  env: z.array(z.string()).default([]),
  bindings: z.array(z.string()).default([]),
  rootFiles: z.array(z.string()).default([]),
  changes: changeNotesSchema,
});

/** Reads one layer's metadata; callers validate its graph after assembling it. */
export async function readKitModule(kitRoot: string, id: string): Promise<KitModule> {
  const source = join(kitRoot, 'layers', id, 'module.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(source, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new CliError(`Unable to read module at ${source}: ${message}`);
  }

  const result = moduleSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join('.') : '(root)';
    throw new CliError(`Invalid module at ${source}: ${path} ${issue?.message ?? 'is invalid'}`);
  }
  return { id, ...result.data };
}

export async function readKitModules(kitRoot: string, config?: KitConfig): Promise<KitModule[]> {
  const metadata = config ?? (
    (await pathExists(join(kitRoot, KIT_CONFIG_PATH))) ? await readKitConfig(kitRoot) : undefined
  );
  const groups = metadata?.groups;
  const layersRoot = join(kitRoot, 'layers');
  const entries = await readdir(layersRoot, { withFileTypes: true }).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new CliError(`Unable to read modules at ${layersRoot}: ${message}`);
  });
  const modules: KitModule[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    modules.push(await readKitModule(kitRoot, entry.name));
  }

  const byId = new Map(modules.map((module) => [module.id, module]));
  for (const module of modules) {
    for (const id of module.requires) {
      if (!byId.has(id)) {
        throw new CliError(`Module "${module.id}" requires unknown module "${id}".`);
      }
    }
    for (const id of module.requiresOneOf) {
      if (!byId.has(id)) {
        throw new CliError(`Module "${module.id}" lists unknown module "${id}" in requiresOneOf.`);
      }
    }
    if (groups) {
      if (!module.group && !module.internal) {
        throw new CliError(`Module "${module.id}" must declare a group.`);
      }
      if (module.group && !groups.includes(module.group)) {
        throw new CliError(`Module "${module.id}" has unknown group "${module.group}".`);
      }
    }
    if (module.parent) {
      const parent = byId.get(module.parent);
      if (!parent) {
        throw new CliError(`Module "${module.id}" has unknown parent "${module.parent}".`);
      }
      if (!module.requires.includes(parent.id)) {
        throw new CliError(`Module "${module.id}" must list parent "${parent.id}" in requires.`);
      }
      if (groups && parent.group !== module.group) {
        throw new CliError(
          `Module "${module.id}" and its parent "${parent.id}" must be in the same group.`,
        );
      }
    }
  }
  collectNotes(metadata?.changes ?? [], modules);
  // Validate the entire graph, even when the eventual selection is empty.
  resolveSelection(
    modules,
    modules.map((module) => module.id),
  );
  return modules;
}

export function resolveSelection(modules: KitModule[], requested: string[]): string[] {
  const byId = new Map(modules.map((module) => [module.id, module]));
  const resolved: string[] = [];
  const settled = new Set<string>();
  const visiting = new Set<string>();

  function visit(id: string): void {
    if (settled.has(id)) return;
    if (visiting.has(id)) {
      throw new CliError(`Module dependencies contain a cycle at "${id}".`);
    }
    const module = byId.get(id);
    if (!module) {
      throw new CliError(`Unknown module "${id}".`);
    }
    visiting.add(id);
    for (const requiredId of module.requires) visit(requiredId);
    visiting.delete(id);
    settled.add(id);
    resolved.push(id);
  }

  for (const id of requested) visit(id);
  return resolved;
}

export function dependentsOf(modules: KitModule[], installed: string[], id: string): string[] {
  return installed.filter(
    (candidate) => candidate !== id && resolveSelection(modules, [candidate]).includes(id),
  );
}

export function validateSelection(modules: KitModule[], selection: string[]): void {
  const selected = new Set(selection);
  for (const module of modules) {
    if (!selected.has(module.id) || module.requiresOneOf.length === 0) continue;
    if (!module.requiresOneOf.some((id) => selected.has(id))) {
      throw new CliError(`${module.id} needs at least one of ${module.requiresOneOf.join(', ')}.`);
    }
  }
}

export function groupModules(modules: KitModule[], groups?: string[]): ModuleGroup[] {
  if (!groups) {
    return modules.length
      ? [{ name: undefined, entries: modules.map((module) => ({ module, depth: 0 })) }]
      : [];
  }

  const sections: ModuleGroup[] = [];
  for (const name of [...new Set(groups), undefined]) {
    const members = modules.filter((module) => module.group === name);
    if (members.length === 0) continue;
    const ids = new Set(members.map((module) => module.id));
    const children = new Map<string | undefined, KitModule[]>();
    for (const module of members) {
      const parent = module.parent && ids.has(module.parent) ? module.parent : undefined;
      const siblings = children.get(parent) ?? [];
      siblings.push(module);
      children.set(parent, siblings);
    }
    const entries: ModuleGroup['entries'] = [];
    function visit(parent: string | undefined, depth: number): void {
      for (const module of children.get(parent) ?? []) {
        entries.push({ module, depth });
        visit(module.id, depth + 1);
      }
    }
    visit(undefined, 0);
    sections.push({ name, entries });
  }
  return sections;
}
