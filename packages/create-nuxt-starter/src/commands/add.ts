import { assertCleanWorkingTree } from '../git/repo';
import { assertRegistryRevision, readManifest } from '../manifest/io';
import { resolveModules } from '../registry/resolve';
import { getModule, type Registry } from '../registry/schema';
import type { ApplyResult } from '../upgrade/apply';
import { applyUpgrade } from '../upgrade/apply';
import type { ActionType } from '../upgrade/plan';
import { planTransition, summarizePlan } from '../upgrade/plan';

export interface ChangeReport {
  moduleIds: string[];
  summary: Record<ActionType, number>;
  applied: ApplyResult | null;
  conflicted: string[];
  notes: string[];
  env: string[];
}

export const EMPTY_SUMMARY: Record<ActionType, number> = {
  skip: 0,
  add: 0,
  overwrite: 0,
  merge: 0,
  conflict: 0,
  delete: 0,
  orphan: 0,
};

export interface AddOptions {
  projectRoot: string;
  registry: Registry;
  moduleIds: string[];
  check: boolean;
  force: boolean;
  resolveLocalKit?: (revision: string) => string | undefined;
}

export async function runAdd(options: AddOptions): Promise<ChangeReport> {
  const manifest = await readManifest(options.projectRoot);

  // Installing at an older revision would also produce a module combination that
  // no CI run has ever built.
  assertRegistryRevision(manifest, options.registry.kit.revision, 'add');

  for (const id of options.moduleIds) getModule(options.registry, id);

  const installedIds = manifest.modules.map((module) => module.id);
  const requested = resolveModules(options.registry, [...installedIds, ...options.moduleIds]);
  const requestedIds = requested.map((module) => module.id);
  const addedIds = requestedIds.filter((id) => !installedIds.includes(id));

  if (addedIds.length === 0) {
    return {
      moduleIds: [],
      summary: EMPTY_SUMMARY,
      applied: null,
      conflicted: [],
      notes: ['Nothing to add — every requested module is already installed.'],
      env: [],
    };
  }

  if (!options.check) {
    await assertCleanWorkingTree(options.projectRoot, { force: options.force });
  }

  const plan = await planTransition({
    projectRoot: options.projectRoot,
    registry: options.registry,
    from: { revision: manifest.kit.revision, moduleIds: installedIds },
    to: { revision: manifest.kit.revision, moduleIds: requestedIds },
    ...(options.resolveLocalKit === undefined ? {} : { resolveLocalKit: options.resolveLocalKit }),
  });

  try {
    const added = requested.filter((module) => addedIds.includes(module.id));
    const report: ChangeReport = {
      moduleIds: addedIds,
      summary: summarizePlan(plan),
      applied: null,
      conflicted: plan.actions
        .filter((action) => action.type === 'conflict')
        .map((action) => action.path),
      notes: added.flatMap((module) => module.notes),
      env: [...new Set(added.flatMap((module) => module.env))],
    };

    if (options.check) return report;
    report.applied = await applyUpgrade(plan, options.registry);
    return report;
  } finally {
    await plan.cleanup();
  }
}
