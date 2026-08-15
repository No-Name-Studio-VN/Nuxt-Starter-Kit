import { CliError } from '../errors';
import { assertCleanWorkingTree } from '../git/repo';
import { assertRegistryRevision, readManifest } from '../manifest/io';
import { getModule, type Registry } from '../registry/schema';
import { localKitOption, resolveRevision } from '../sources/resolveRevision';
import { applyUpgrade } from '../upgrade/apply';
import { planTransition, summarizePlan } from '../upgrade/plan';
import type { ChangeReport } from './add';

export interface RemoveOptions {
  projectRoot: string;
  registry: Registry;
  moduleIds: string[];
  check: boolean;
  force: boolean;
  resolveLocalKit?: (revision: string) => string | undefined;
}

export async function runRemove(options: RemoveOptions): Promise<ChangeReport> {
  const manifest = await readManifest(options.projectRoot);
  assertRegistryRevision(
    manifest,
    await resolveRevision({
      template: options.registry.kit.template,
      revision: options.registry.kit.revision,
      ...localKitOption(options.resolveLocalKit, options.registry.kit.revision),
    }),
    'remove',
  );

  const installedIds = manifest.modules.map((module) => module.id);

  for (const id of options.moduleIds) {
    if (!installedIds.includes(id)) {
      throw new CliError(`Module "${id}" is not installed in this project.`);
    }
    // Resolution puts required modules back regardless of the transition's
    // endpoints, so without this the removal would report success and change
    // nothing.
    if (getModule(options.registry, id).required) {
      throw new CliError(
        `Module "${id}" is part of every project and cannot be removed. Delete the directory instead.`,
      );
    }
  }

  const remainingIds = installedIds.filter((id) => !options.moduleIds.includes(id));

  // Emptying the project is not a module operation. The dependency check below
  // cannot catch this on its own: with nothing left to survive the removal, there
  // is no module to report the broken requirement.
  if (remainingIds.length === 0) {
    throw new CliError(
      `Removing ${options.moduleIds.join(', ')} would leave the project with no modules, deleting every file the kit generated. Delete the directory instead.`,
    );
  }

  // Removing something a surviving module needs would leave the project broken.
  for (const id of remainingIds) {
    const module = getModule(options.registry, id);
    const broken = module.requires.filter((required) => options.moduleIds.includes(required));
    if (broken.length > 0) {
      throw new CliError(
        `Cannot remove ${broken.join(', ')}: module "${id}" requires ${broken.length > 1 ? 'them' : 'it'}. Remove "${id}" first.`,
      );
    }
  }

  if (!options.check) {
    await assertCleanWorkingTree(options.projectRoot, { force: options.force });
  }

  const plan = await planTransition({
    projectRoot: options.projectRoot,
    registry: options.registry,
    from: { revision: manifest.kit.revision, moduleIds: installedIds },
    to: { revision: manifest.kit.revision, moduleIds: remainingIds },
    ...(options.resolveLocalKit === undefined ? {} : { resolveLocalKit: options.resolveLocalKit }),
  });

  try {
    const report: ChangeReport = {
      moduleIds: options.moduleIds,
      summary: summarizePlan(plan),
      applied: null,
      conflicted: plan.actions
        .filter((action) => action.type === 'conflict')
        .map((action) => action.path),
      notes: [],
      env: [],
    };

    if (options.check) return report;
    report.applied = await applyUpgrade(plan, options.registry);
    return report;
  } finally {
    await plan.cleanup();
  }
}
