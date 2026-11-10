import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { CliError } from '../errors';

export interface KitModule {
  id: string;
  title: string;
  description: string;
  requires: string[];
  internal: boolean;
  dependencies: string[];
  devDependencies: string[];
  scripts: string[];
  env: string[];
  bindings: string[];
  rootFiles: string[];
}

const moduleSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  requires: z.array(z.string()).default([]),
  internal: z.boolean().default(false),
  dependencies: z.array(z.string()).default([]),
  devDependencies: z.array(z.string()).default([]),
  scripts: z.array(z.string()).default([]),
  env: z.array(z.string()).default([]),
  bindings: z.array(z.string()).default([]),
  rootFiles: z.array(z.string()).default([]),
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

export async function readKitModules(kitRoot: string): Promise<KitModule[]> {
  const layersRoot = join(kitRoot, 'layers');
  const entries = await readdir(layersRoot, { withFileTypes: true });
  const modules: KitModule[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    modules.push(await readKitModule(kitRoot, entry.name));
  }

  const ids = new Set(modules.map((module) => module.id));
  for (const module of modules) {
    for (const id of module.requires) {
      if (!ids.has(id)) {
        throw new CliError(`Module "${module.id}" requires unknown module "${id}".`);
      }
    }
  }
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
