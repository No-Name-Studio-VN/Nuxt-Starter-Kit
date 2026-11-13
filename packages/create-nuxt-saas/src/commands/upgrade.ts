import { CliError } from '../errors';
import { resolveSelection } from '../kit/modules';
import type { KitSnapshot } from '../kit/source';
import { assertCleanTree } from '../project/git';
import { readState, unresolvedConflicts, writeState } from '../project/state';
import { render } from '../render/render';
import { applyPlan } from '../transition/apply';
import { followUpsFor } from '../transition/followUps';
import { planTransition } from '../transition/plan';
import type { TransitionReport } from './modules';

export async function runUpgrade(opts: {
  projectRoot: string;
  from: KitSnapshot;
  to: KitSnapshot;
  check: boolean;
  force: boolean;
}): Promise<TransitionReport & { upToDate: boolean }> {
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
    };
  }

  const known = new Set(opts.to.modules.map((module) => module.id));
  const missing = state.modules.filter((id) => !known.has(id)).sort();
  if (missing.length > 0) {
    throw new CliError(`Installed modules missing from the target kit: ${missing.join(', ')}.`);
  }
  const installed = new Set(state.modules);
  const modules = resolveSelection(opts.to.modules, state.modules).sort();
  if (!opts.check) await assertCleanTree(opts.projectRoot, opts.force);

  const base = await render(opts.from, state.modules, state.identity);
  const target = await render(opts.to, modules, state.identity);
  const plan = await planTransition(opts.projectRoot, base, target);
  const conflicts = plan.changes
    .filter((change) => change.kind === 'conflict')
    .map((change) => change.path)
    .sort();
  const report: TransitionReport & { upToDate: boolean } = {
    changes: plan.changes,
    conflicts,
    followUps: followUpsFor(base, target, plan.changes, modules),
    addedModules: modules.filter((id) => !installed.has(id)),
    removedModules: [],
    applied: !opts.check,
    upToDate: false,
  };
  if (opts.check) return report;

  await applyPlan(opts.projectRoot, plan);
  await writeState(opts.projectRoot, {
    ...state,
    kit: opts.to.template,
    commit: opts.to.commit,
    modules,
    conflicts,
  });
  return report;
}
