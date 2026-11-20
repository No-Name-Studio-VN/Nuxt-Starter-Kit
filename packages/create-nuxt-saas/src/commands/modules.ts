import { CliError } from '../errors';
import { dependentsOf, resolveSelection, validateSelection } from '../kit/modules';
import type { KitSnapshot } from '../kit/source';
import { readState, unresolvedConflicts } from '../project/state';
import { render } from '../render/render';
import { planTransition } from '../transition/plan';
import { runTransition, type SafetyOptions, type TransitionReport } from '../transition/run';

export async function runModuleChange(opts: SafetyOptions & {
  add: string[];
  remove: string[];
  kit: KitSnapshot;
}): Promise<TransitionReport> {
  const state = await readState(opts.projectRoot);
  const unresolved = await unresolvedConflicts(opts.projectRoot, state);
  if (unresolved.length > 0) {
    throw new CliError(`Resolve these conflicts before continuing: ${unresolved.join(', ')}.`);
  }
  if (opts.kit.commit !== state.commit) {
    throw new CliError(
      `Kit commit ${opts.kit.commit} does not match project commit ${state.commit}. Fetch the recorded commit before changing modules.`,
    );
  }

  const known = new Set(opts.kit.modules.map((module) => module.id));
  for (const id of [...opts.add, ...opts.remove]) {
    if (!known.has(id)) throw new CliError(`Unknown module "${id}".`);
  }
  const installed = new Set(state.modules);
  const removed = new Set(opts.remove);
  const catalogue = opts.kit.modules;
  const combined = resolveSelection(catalogue, [...state.modules, ...opts.add]);
  let modules = combined;
  if (removed.size > 0) {
    const internal = new Set(
      catalogue.filter((module) => module.internal).map((module) => module.id),
    );
    const roots = combined.filter((id) => !internal.has(id) && !removed.has(id));
    modules = resolveSelection(catalogue, roots).filter((id) => !removed.has(id));
  }
  modules.sort();
  for (const id of removed) {
    const dependents = dependentsOf(catalogue, modules, id);
    if (dependents.length > 0) {
      throw new CliError(`Cannot remove module "${id}"; required by: ${dependents.join(', ')}.`);
    }
  }
  for (const id of removed) {
    if (!installed.has(id)) throw new CliError(`Module "${id}" is not installed.`);
  }
  try {
    validateSelection(catalogue, modules);
  } catch (error) {
    if (!(error instanceof CliError) || removed.size === 0) throw error;
    throw new CliError(`Can't remove ${opts.remove.join(', ')}: ${error.message}`);
  }

  const base = await render(opts.kit, state.modules, state.identity);
  const target = await render(opts.kit, modules, state.identity);
  const plan = await planTransition(opts.projectRoot, base, target);
  return runTransition(opts, opts.remove.length ? 'remove' : 'add', opts.kit, opts.kit, base, target, plan, state, { ...state, modules });
}
