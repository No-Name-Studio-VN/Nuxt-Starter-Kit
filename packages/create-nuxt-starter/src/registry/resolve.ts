import { CliError } from '../errors';
import { getModule, type Registry, type RegistryModule } from './schema';

export function resolveModules(registry: Registry, requestedIds: string[]): RegistryModule[] {
  if (requestedIds.length === 0) {
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

  for (const id of requestedIds) visit(id);

  for (const module of resolved) {
    const conflict = module.conflicts.find((id) => settled.has(id));
    if (conflict) {
      throw new CliError(`Modules "${module.id}" and "${conflict}" cannot be installed together.`);
    }
  }

  return resolved;
}
