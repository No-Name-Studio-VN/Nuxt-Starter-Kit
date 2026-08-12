import { z } from 'zod';
import { CliError } from '../errors';
import { assertRelativePath } from '../util/paths';

/**
 * Lowercase alphanumerics and inner hyphens. Written so no quantifier can
 * exchange characters with its neighbour — the registry is a trust boundary,
 * and an ambiguous pattern here is a backtracking denial of service.
 */
export const MODULE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const moduleIdSchema = z
  .string()
  .regex(MODULE_ID_PATTERN, 'must be lowercase letters, numbers, and hyphens');

const kitPathSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      try {
        assertRelativePath(value.replaceAll('*', 'x'), 'path');
        return true;
      } catch {
        return false;
      }
    },
    { message: 'must be a relative path that stays inside the kit' },
  );

const moduleSchema = z.object({
  id: moduleIdSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  version: z.string().min(1),
  paths: z.array(kitPathSchema).min(1),
  requires: z.array(moduleIdSchema).default([]),
  conflicts: z.array(moduleIdSchema).default([]),
  structured: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  env: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});

const registrySchema = z.object({
  schemaVersion: z.literal(2),
  version: z.string().min(1),
  kit: z.object({ template: z.string().min(1), revision: z.string().min(1) }),
  modules: z.array(moduleSchema).min(1),
});

export type RegistryModule = z.infer<typeof moduleSchema>;
export type Registry = z.infer<typeof registrySchema>;

export function parseRegistry(value: unknown, sourceLabel: string): Registry {
  const result = registrySchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join('.') : '(root)';
    throw new CliError(
      `Invalid registry at ${sourceLabel}: ${path} ${issue?.message ?? 'is invalid'}`,
    );
  }

  const registry = result.data;
  const ids = new Set<string>();
  for (const module of registry.modules) {
    if (ids.has(module.id)) {
      throw new CliError(
        `Invalid registry at ${sourceLabel}: module "${module.id}" is declared more than once.`,
      );
    }
    ids.add(module.id);
  }
  for (const module of registry.modules) {
    for (const id of [...module.requires, ...module.conflicts]) {
      if (!ids.has(id)) {
        throw new CliError(
          `Invalid registry at ${sourceLabel}: module "${module.id}" references unknown module "${id}".`,
        );
      }
    }
  }
  return registry;
}

export function getModule(registry: Registry, id: string): RegistryModule {
  const module = registry.modules.find((candidate) => candidate.id === id);
  if (!module) {
    throw new CliError(
      `Unknown module "${id}". Run "nuxt-starter modules" to see what is available.`,
    );
  }
  return module;
}
