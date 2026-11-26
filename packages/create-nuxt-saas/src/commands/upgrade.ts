import { CliError } from '../errors';
import { resolveSelection, validateSelection } from '../kit/modules';
import { assertSameKitMajor, type KitSnapshot } from '../kit/source';
import { readState, unresolvedConflicts } from '../project/state';
import { assessUnsaved } from '../project/unsaved';
import { render } from '../render/render';
import { planTransition } from '../transition/plan';
import { runTransition, type SafetyOptions, type TransitionReport } from '../transition/run';

export async function runUpgrade(
  opts: SafetyOptions & {
    from: KitSnapshot;
    to: KitSnapshot;
  },
): Promise<TransitionReport> {
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
    validateSelection(opts.to.modules, state.modules);
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

  await assertSameKitMajor(opts.from, opts.to);

  const known = new Set(opts.to.modules.map((module) => module.id));
  const missing = state.modules.filter((id) => !known.has(id)).sort();
  if (missing.length > 0) {
    throw new CliError(`Installed modules missing from the target kit: ${missing.join(', ')}.`);
  }
  // Only add newly introduced defaults. An existing default that the project removed stays removed.
  const previous = new Set(opts.from.modules.map((module) => module.id));
  const newDefaults = opts.to.modules
    .filter((module) => module.installByDefault && !previous.has(module.id))
    .map((module) => module.id);
  const modules = resolveSelection(opts.to.modules, [...state.modules, ...newDefaults]).sort();
  validateSelection(opts.to.modules, modules);

  const base = await render(opts.from, state.modules, state.identity);
  const target = await render(opts.to, modules, state.identity);
  const plan = await planTransition(opts.projectRoot, base, target);
  return runTransition(
    opts,
    'upgrade',
    opts.from,
    opts.to,
    base,
    target,
    plan,
    state,
    {
      ...state,
      kit: opts.to.template,
      commit: opts.to.commit,
      modules,
    },
    false,
  );
}
