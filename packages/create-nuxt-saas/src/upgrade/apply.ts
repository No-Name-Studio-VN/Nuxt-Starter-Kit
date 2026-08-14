import { readFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CliError } from '../errors';
import type { ManifestModule, ProjectManifest } from '../manifest/io';
import { RENDER_VERSION, writeManifest } from '../manifest/io';
import type { Registry } from '../registry/schema';
import { substituteFragment } from '../render/placeholders';
import {
  hashContent,
  pathExists,
  pruneEmptyDirectories,
  writeJsonAtomically,
  writeTextFile,
} from '../util/fs';
import { resolveInside } from '../util/paths';
import type { UpgradePlan } from './plan';
import { isProtectedPath } from './protected';
import type { StructuredChange } from './structured';
import { applyStructuredChanges, planStructuredChanges } from './structured';

export interface ApplyResult {
  written: string[];
  deleted: string[];
  conflicted: string[];
  orphaned: string[];
  structured: StructuredChange[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * What each module under management declared for a shared JSON file, last time
 * and this time. A module removed by this transition appears in `previous` only,
 * so its entries are dropped; a module the registry dropped appears in neither,
 * so its entries are left alone along with its files.
 */
function fragmentsFor(
  file: string,
  manifest: ProjectManifest,
  registry: Registry,
  plan: UpgradePlan,
): { previous: Record<string, unknown>[]; next: Record<string, unknown>[] } {
  const targetIds = new Set(plan.targetModuleIds);

  // Fragments are stored as authored, tokens and all, so they get the project's
  // placeholders here — otherwise a `{{PROJECT_NAME}}` in the registry would never
  // match the substituted value sitting in the file.
  const substitute = (fragment: Record<string, unknown>): Record<string, unknown> =>
    substituteFragment(fragment, manifest.placeholders);

  const previous: Record<string, unknown>[] = [];
  for (const module of manifest.modules) {
    if (plan.droppedModuleIds.includes(module.id)) continue;
    const fragment = module.structured[file];
    if (fragment) previous.push(substitute(fragment));
  }

  const next: Record<string, unknown>[] = [];
  for (const module of registry.modules) {
    if (!targetIds.has(module.id)) continue;
    const fragment = module.structured[file];
    if (fragment) next.push(substitute(fragment));
  }

  return { previous, next };
}

async function applyStructuredFile(options: {
  projectRoot: string;
  file: string;
  manifest: ProjectManifest;
  registry: Registry;
  plan: UpgradePlan;
}): Promise<{ changes: StructuredChange[]; hash: string | null }> {
  const path = resolveInside(options.projectRoot, options.file, 'Structured target');
  if (!(await pathExists(path))) return { changes: [], hash: null };

  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isPlainObject(parsed)) {
    throw new CliError(`Structured target "${options.file}" must contain a JSON object.`);
  }

  const { previous, next } = fragmentsFor(
    options.file,
    options.manifest,
    options.registry,
    options.plan,
  );
  const changes = planStructuredChanges({
    file: options.file,
    document: parsed,
    previous,
    next,
  });

  if (changes.some((change) => change.type !== 'skip')) {
    await writeJsonAtomically(path, applyStructuredChanges(parsed, changes));
  }
  return { changes, hash: hashContent(await readFile(path, 'utf8')) };
}

/**
 * Rebuilds a module's file map. Protected paths keep their previous hash (the
 * upgrade never rewrote them, so the old hash still describes what is on disk);
 * structured targets take their post-merge hash; everything else takes the
 * pristine target-render hash. Paths absent from the target render are dropped —
 * they were deleted or orphaned.
 */
function rebuildFiles(
  module: ManifestModule,
  plan: UpgradePlan,
  structuredHashes: Record<string, string>,
): Record<string, string> {
  const files: Record<string, string> = {};

  for (const [path, hash] of Object.entries(module.files)) {
    if (isProtectedPath(path)) files[path] = hash;
  }

  for (const [path, owner] of Object.entries(plan.targetOwners)) {
    if (owner !== module.id || isProtectedPath(path)) continue;
    const hash = structuredHashes[path] ?? plan.targetHashes[path];
    if (hash !== undefined) files[path] = hash;
  }

  return files;
}

export async function applyUpgrade(plan: UpgradePlan, registry: Registry): Promise<ApplyResult> {
  const result: ApplyResult = {
    written: [],
    deleted: [],
    conflicted: [],
    orphaned: [],
    structured: [],
  };

  for (const action of plan.actions) {
    const path = resolveInside(plan.projectRoot, action.path, 'Project file');
    switch (action.type) {
      case 'add':
      case 'overwrite':
      case 'merge':
        await writeTextFile(path, action.content);
        result.written.push(action.path);
        break;
      case 'conflict':
        await writeTextFile(path, action.content);
        result.written.push(action.path);
        result.conflicted.push(action.path);
        break;
      case 'delete':
        await rm(path, { force: true });
        await pruneEmptyDirectories(plan.projectRoot, dirname(path));
        result.deleted.push(action.path);
        break;
      case 'orphan':
        result.orphaned.push(action.path);
        break;
      case 'skip':
        break;
    }
  }

  const structuredHashes: Record<string, string> = {};
  for (const file of plan.structuredTargets) {
    const { changes, hash } = await applyStructuredFile({
      projectRoot: plan.projectRoot,
      file,
      manifest: plan.manifest,
      registry,
      plan,
    });
    result.structured.push(...changes);
    if (hash !== null) structuredHashes[file] = hash;
  }

  const orphanedByModule = new Map<string, string[]>();
  for (const action of plan.actions) {
    if (action.type !== 'orphan') continue;
    orphanedByModule.set(action.moduleId, [
      ...(orphanedByModule.get(action.moduleId) ?? []),
      action.path,
    ]);
  }

  const existingModules: ManifestModule[] = plan.manifest.modules.flatMap((module) => {
    // Modules the registry dropped keep their entry untouched, so their files stay
    // accounted for. Modules this transition removed lose theirs entirely.
    if (plan.droppedModuleIds.includes(module.id)) return [module];
    if (!plan.targetModuleIds.includes(module.id)) return [];

    const updated = registry.modules.find((candidate) => candidate.id === module.id);
    if (updated === undefined) return [module];

    return [
      {
        ...module,
        version: updated.version,
        files: rebuildFiles(module, plan, structuredHashes),
        structured: updated.structured,
        orphaned: [
          ...new Set([...module.orphaned, ...(orphanedByModule.get(module.id) ?? [])]),
        ].sort(),
      },
    ];
  });

  // A module the new registry pulled in as a dependency owns files on disk now,
  // so it needs an entry of its own.
  const addedModules: ManifestModule[] = plan.addedModuleIds.flatMap((id) => {
    const added = registry.modules.find((candidate) => candidate.id === id);
    if (added === undefined) return [];
    const entry: ManifestModule = {
      id: added.id,
      version: added.version,
      files: {},
      structured: added.structured,
      orphaned: [],
    };
    return [{ ...entry, files: rebuildFiles(entry, plan, structuredHashes) }];
  });

  await writeManifest(plan.projectRoot, {
    ...plan.manifest,
    renderVersion: RENDER_VERSION,
    kit: { template: plan.manifest.kit.template, revision: plan.toRevision },
    modules: [...existingModules, ...addedModules],
  });

  return result;
}
