import { CliError } from '../errors';
import { getModule, type Registry, type RegistryModule, requiredModuleIds } from './schema';

export function resolveModules(registry: Registry, requestedIds: string[]): RegistryModule[] {
  // Required modules lead so they settle first, which keeps the foundation ahead
  // of its dependents in the result — the order structured fragments merge in.
  const ids = [...requiredModuleIds(registry), ...requestedIds];
  if (ids.length === 0) {
    throw new CliError('Choose at least one module.');
  }

  const resolved: RegistryModule[] = [];
  const settled = new Set<string>();
  const visiting = new Set<string>();

  function visit(id: string): void {
    if (settled.has(id)) return;
    if (visiting.has(id)) {
      throw new CliError(`Module dependencies contain a cycle at "${id}".`);
    }
    visiting.add(id);
    const module = getModule(registry, id);
    for (const requiredId of module.requires) visit(requiredId);
    visiting.delete(id);
    settled.add(id);
    resolved.push(module);
  }

  for (const id of ids) visit(id);

  for (const module of resolved) {
    const conflict = module.conflicts.find((id) => settled.has(id));
    if (conflict) {
      throw new CliError(`Modules "${module.id}" and "${conflict}" cannot be installed together.`);
    }
  }

  return resolved;
}
