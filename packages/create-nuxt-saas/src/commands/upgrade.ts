import { CliError } from '../errors';
import { resolveSelection } from '../kit/modules';
import type { KitSnapshot } from '../kit/source';
import { assessUnsaved } from '../project/unsaved';
import { readState, unresolvedConflicts } from '../project/state';
import { render } from '../render/render';
import { planTransition } from '../transition/plan';
import { runTransition, type SafetyOptions, type TransitionReport } from '../transition/run';

export async function runUpgrade(opts: SafetyOptions & {
  from: KitSnapshot;
  to: KitSnapshot;
}): Promise<TransitionReport> {
  const state = await readState(opts.projectRoot);
  const unresolved = await unresolvedConflicts(opts.projectRoot, state);
  if (unresolved.length > 0) {
    throw new CliError(`Resolve these conflicts before continuing: ${unresolved.join(', ')}.`);
  }
  if (opts.from.commit !== state.commit) {
    throw new CliError(
      `Kit commit ${opts.from.commit} does not match project commit ${state.commit}. Fetch the recorded commit before upgrading.`,
    );
  }
  if (opts.from.commit === opts.to.commit && state.kit === opts.to.template) {
    return {
      changes: [],
      conflicts: [],
      followUps: [],
      addedModules: [],
      removedModules: [],
      applied: false,
      upToDate: true,
      unsaved: await assessUnsaved(opts.projectRoot, []),
      backup: null,
      report: null,
      notes: [],
      suggestions: [],
    };
  }

  const known = new Set(opts.to.modules.map((module) => module.id));
  const missing = state.modules.filter((id) => !known.has(id)).sort();
  if (missing.length > 0) {
    throw new CliError(`Installed modules missing from the target kit: ${missing.join(', ')}.`);
  }
  const modules = resolveSelection(opts.to.modules, state.modules).sort();
  const base = await render(opts.from, state.modules, state.identity);
  const target = await render(opts.to, modules, state.identity);
  const plan = await planTransition(opts.projectRoot, base, target);
  return runTransition(opts, 'upgrade', opts.from, opts.to, base, target, plan, state, {
    ...state,
    kit: opts.to.template,
    commit: opts.to.commit,
    modules,
  }, false);
}
