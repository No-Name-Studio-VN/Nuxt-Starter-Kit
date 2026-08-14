import { join } from 'node:path';
import { mergeFiles } from '../git/mergeFile';
import type { ProjectManifest } from '../manifest/io';
import { readManifest, RENDER_VERSION } from '../manifest/io';
import { loadRegistryFromKit } from '../registry/fromKit';
import { resolveModules } from '../registry/resolve';
import type { Registry, RegistryModule } from '../registry/schema';
import { renderKit } from '../render/render';
import type { FetchedKit } from '../sources/fetchKit';
import { fetchKit } from '../sources/fetchKit';
import { pathExists, readTextFile } from '../util/fs';
import { resolveInside } from '../util/paths';
import { isProtectedPath } from './protected';
import { makeRenderWorkspace } from './workspace';

export type FileAction = { path: string; moduleId: string } & (
  | { type: 'skip'; reason: string }
  | { type: 'add'; content: string }
  | { type: 'overwrite'; content: string }
  | { type: 'merge'; content: string }
  | { type: 'conflict'; content: string; conflicts: number }
  | { type: 'delete' }
  | { type: 'orphan'; reason: string }
);

export type ActionType = FileAction['type'];

export interface UpgradePlan {
  projectRoot: string;
  manifest: ProjectManifest;
  fromRevision: string;
  toRevision: string;
  moduleUpdates: Array<{ id: string; from: string; to: string }>;
  actions: FileAction[];
  /** Pristine target-render hashes for every rendered path, protected ones included. */
  targetHashes: Record<string, string>;
  /** Owning module id for every path in the target render. */
  targetOwners: Record<string, string>;
  structuredTargets: string[];
  /** Resolved module ids the project should have after this transition. */
  targetModuleIds: string[];
  droppedModuleIds: string[];
  addedModuleIds: string[];
  renderVersionChanged: boolean;
  cleanup: () => Promise<void>;
}

export interface PlanUpgradeOptions {
  projectRoot: string;
  registry: Registry;
  /** Maps a revision to a local checkout instead of downloading it. */
  resolveLocalKit?: (revision: string) => string | undefined;
}

/** One end of a transition: a kit revision plus the modules installed at it. */
export interface TransitionEndpoint {
  revision: string;
  moduleIds: string[];
}

export interface PlanTransitionOptions {
  projectRoot: string;
  registry: Registry;
  from: TransitionEndpoint;
  to: TransitionEndpoint;
  resolveLocalKit?: (revision: string) => string | undefined;
}

interface RenderedTree {
  root: string;
  files: Map<string, { moduleId: string; hash: string }>;
}

async function renderRevision(options: {
  kitRoot: string;
  registryModules: RegistryModule[];
  modules: RegistryModule[];
  manifest: ProjectManifest;
  destinationRoot: string;
}): Promise<RenderedTree> {
  const rendered = await renderKit({
    kitRoot: options.kitRoot,
    registryModules: options.registryModules,
    modules: options.modules,
    placeholders: options.manifest.placeholders,
    destinationRoot: options.destinationRoot,
  });
  return {
    root: options.destinationRoot,
    files: new Map(
      rendered.map((file) => [file.path, { moduleId: file.moduleId, hash: file.hash }]),
    ),
  };
}

function selectModules(registry: Registry, ids: string[]): RegistryModule[] {
  return ids.length === 0 ? [] : resolveModules(registry, ids);
}

/**
 * Plans the move from one (revision, module set) to another. Upgrading, adding a
 * module, and removing one are all the same operation with different endpoints,
 * so they share one merge and one apply path.
 */
export async function planTransition(options: PlanTransitionOptions): Promise<UpgradePlan> {
  const { projectRoot, registry, from, to } = options;
  const manifest = await readManifest(projectRoot);

  const installedIds = manifest.modules.map((module) => module.id);
  const availableIds = new Set(registry.modules.map((module) => module.id));
  const keptIds = to.moduleIds.filter((id) => availableIds.has(id));
  const droppedModuleIds = installedIds.filter((id) => !availableIds.has(id));

  const workspace = await makeRenderWorkspace();
  const fetched: FetchedKit[] = [];
  const cleanup = async () => {
    await Promise.all(fetched.map((kit) => kit.cleanup()));
    await workspace.cleanup();
  };

  try {
    const oldLocalKit = options.resolveLocalKit?.(from.revision);
    const oldKit = await fetchKit({
      template: manifest.kit.template,
      revision: from.revision,
      ...(oldLocalKit === undefined ? {} : { localKitRoot: oldLocalKit }),
    });
    fetched.push(oldKit);

    const newLocalKit = options.resolveLocalKit?.(to.revision);
    const newKit = await fetchKit({
      template: registry.kit.template,
      revision: to.revision,
      ...(newLocalKit === undefined ? {} : { localKitRoot: newLocalKit }),
    });
    fetched.push(newKit);

    // The old revision's own definitions own the base render: a module's declared
    // paths may have changed since, and rendering the base with today's paths
    // would diff against a tree that never existed.
    const oldRegistry = (await loadRegistryFromKit(oldKit.root)) ?? registry;
    const oldIds = from.moduleIds.filter((id) =>
      oldRegistry.modules.some((module) => module.id === id),
    );

    const targetModules = selectModules(registry, keptIds);
    const base = await renderRevision({
      kitRoot: oldKit.root,
      registryModules: oldRegistry.modules,
      modules: selectModules(oldRegistry, oldIds),
      manifest,
      destinationRoot: join(workspace.root, 'base'),
    });
    const target = await renderRevision({
      kitRoot: newKit.root,
      registryModules: registry.modules,
      modules: targetModules,
      manifest,
      destinationRoot: join(workspace.root, 'target'),
    });

    // A new registry may give an installed module a new dependency; its files are
    // rendered here, so it needs a manifest entry once applied.
    const addedModuleIds = targetModules
      .map((module) => module.id)
      .filter((id) => !installedIds.includes(id));

    // Structured management is a property of the file, not of the module set: the
    // kit's committed copy is the union of every module, so its text differs
    // between revisions for reasons that have nothing to do with what this project
    // installs. Text-merging it would reintroduce entries the project subtracted.
    // Every module in either revision's registry gets a say, installed or not.
    const structuredTargets = new Set<string>();
    for (const module of [...registry.modules, ...oldRegistry.modules, ...manifest.modules]) {
      for (const file of Object.keys(module.structured)) structuredTargets.add(file);
    }

    const actions: FileAction[] = [];
    const targetHashes: Record<string, string> = {};
    const targetOwners: Record<string, string> = {};
    const paths = [...new Set([...base.files.keys(), ...target.files.keys()])].sort();

    for (const path of paths) {
      const baseEntry = base.files.get(path);
      const targetEntry = target.files.get(path);
      if (targetEntry) {
        targetHashes[path] = targetEntry.hash;
        targetOwners[path] = targetEntry.moduleId;
      }

      // Structured targets are merged key-by-key, never as text.
      if (isProtectedPath(path) || structuredTargets.has(path)) continue;

      const moduleId = targetEntry?.moduleId ?? baseEntry?.moduleId;
      if (moduleId === undefined) continue;

      const projectPath = resolveInside(projectRoot, path, 'Project file');
      const projectExists = await pathExists(projectPath);
      const projectContent = projectExists ? await readTextFile(projectPath) : null;

      if (baseEntry && !targetEntry) {
        if (!projectExists) continue;
        const baseContent = await readTextFile(join(base.root, path));
        actions.push(
          projectContent !== null && projectContent === baseContent
            ? { path, moduleId, type: 'delete' }
            : { path, moduleId, type: 'orphan', reason: 'removed upstream but modified locally' },
        );
        continue;
      }

      if (!targetEntry) continue;
      const targetContent = await readTextFile(join(target.root, path));

      if (!baseEntry) {
        if (projectExists) {
          actions.push({
            path,
            moduleId,
            type: 'skip',
            reason: 'new upstream file already exists locally',
          });
          continue;
        }
        if (targetContent === null) {
          actions.push({
            path,
            moduleId,
            type: 'skip',
            reason: 'binary file must be added manually',
          });
          continue;
        }
        actions.push({ path, moduleId, type: 'add', content: targetContent });
        continue;
      }

      if (baseEntry.hash === targetEntry.hash) {
        actions.push({ path, moduleId, type: 'skip', reason: 'unchanged upstream' });
        continue;
      }
      if (!projectExists) {
        actions.push({ path, moduleId, type: 'skip', reason: 'deleted locally' });
        continue;
      }

      const baseContent = await readTextFile(join(base.root, path));
      if (baseContent === null || targetContent === null || projectContent === null) {
        actions.push({ path, moduleId, type: 'skip', reason: 'binary file changed upstream' });
        continue;
      }
      if (projectContent === baseContent) {
        actions.push({ path, moduleId, type: 'overwrite', content: targetContent });
        continue;
      }

      const merged = await mergeFiles({
        oursPath: projectPath,
        basePath: join(base.root, path),
        theirsPath: join(target.root, path),
        labels: {
          ours: 'local',
          base: `base (${from.revision})`,
          theirs: `upstream (${to.revision})`,
        },
      });
      actions.push(
        merged.status === 'clean'
          ? { path, moduleId, type: 'merge', content: merged.content }
          : {
              path,
              moduleId,
              type: 'conflict',
              content: merged.content,
              conflicts: merged.conflicts,
            },
      );
    }

    const moduleUpdates = manifest.modules.flatMap((module) => {
      const updated = registry.modules.find((candidate) => candidate.id === module.id);
      if (updated === undefined || updated.version === module.version) return [];
      return [{ id: module.id, from: module.version, to: updated.version }];
    });

    return {
      projectRoot,
      manifest,
      fromRevision: from.revision,
      toRevision: to.revision,
      moduleUpdates,
      actions,
      targetHashes,
      targetOwners,
      structuredTargets: [...structuredTargets].sort(),
      targetModuleIds: targetModules.map((module) => module.id),
      droppedModuleIds,
      addedModuleIds,
      renderVersionChanged: manifest.renderVersion !== RENDER_VERSION,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/** Moves the whole project to the registry's revision, keeping its module set. */
export async function planUpgrade(options: PlanUpgradeOptions): Promise<UpgradePlan> {
  const manifest = await readManifest(options.projectRoot);
  const available = new Set(options.registry.modules.map((module) => module.id));
  const installedIds = manifest.modules.map((module) => module.id);

  return planTransition({
    projectRoot: options.projectRoot,
    registry: options.registry,
    from: { revision: manifest.kit.revision, moduleIds: installedIds },
    to: {
      revision: options.registry.kit.revision,
      moduleIds: installedIds.filter((id) => available.has(id)),
    },
    ...(options.resolveLocalKit === undefined ? {} : { resolveLocalKit: options.resolveLocalKit }),
  });
}

export function summarizePlan(plan: UpgradePlan): Record<ActionType, number> {
  const summary: Record<ActionType, number> = {
    skip: 0,
    add: 0,
    overwrite: 0,
    merge: 0,
    conflict: 0,
    delete: 0,
    orphan: 0,
  };
  for (const action of plan.actions) summary[action.type] += 1;
  return summary;
}
