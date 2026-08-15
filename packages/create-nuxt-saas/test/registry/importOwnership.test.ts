import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseMarkers } from '../../src/markers/parse';
import { loadRegistry } from '../../src/registry/load';
import type { Registry } from '../../src/registry/schema';
import { resolveOwnership } from '../../src/render/render';
import { extractImports, isCodeFile, resolveKitImport, toPackageName } from '../support/imports';
import { KIT_ROOT, listKitFiles, mirrorKitTree } from '../support/kitTree';

/**
 * Module boundaries only hold if the code respects them. A file that imports
 * across a boundary its module does not declare compiles perfectly well inside
 * the kit, where every module is present, and breaks the moment someone
 * generates a project without the module on the other side.
 *
 * The CI matrix catches this too, but only for the combinations it happens to
 * build, and only after installing a full project. This check is exhaustive over
 * every pair and runs in seconds — it is what makes a partition provable rather
 * than plausible, and its absence is how `base` came to own the entire backend.
 *
 * It sees explicit imports only. Nuxt auto-imports and components referenced
 * solely as template tags leave no specifier to read; those remain the matrix's
 * job.
 */

interface Violation {
  from: string;
  fromModule: string;
  to: string;
  toModule: string;
  specifier: string;
}

/**
 * The module an import actually belongs to.
 *
 * Inside a marker block that is the block's module, not the file's owner: those
 * lines are deleted when the module is not installed, so a `base` file may reach
 * into `pwa` from inside an `<nsk:pwa>` block without coupling the two. Outside
 * any block it is the owning module, whose files ship whole.
 */
function importerModule(
  blocks: Array<{ moduleId: string; startLine: number; endLine: number }>,
  line: number,
  owner: string,
): string {
  const block = blocks.find(
    (candidate) => line >= candidate.startLine && line <= candidate.endLine,
  );
  return block?.moduleId ?? owner;
}

interface PackageViolation {
  from: string;
  fromModule: string;
  packageName: string;
  declaredBy: string[];
}

let registry: Registry;
let violations: Violation[];
let packageViolations: PackageViolation[];
/** Kit-internal imports actually resolved and checked, to prove this is not a no-op. */
let examined: number;

/** Which modules declare a given npm package in their structured package.json. */
function packageDeclarers(registry: Registry): Map<string, string[]> {
  const declarers = new Map<string, string[]>();
  for (const module of registry.modules) {
    const fragment = module.structured['package.json'];
    for (const section of ['dependencies', 'devDependencies']) {
      const entries = fragment?.[section];
      if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) continue;
      for (const name of Object.keys(entries)) {
        declarers.set(name, [...(declarers.get(name) ?? []), module.id]);
      }
    }
  }
  return declarers;
}

/** Every module reachable from `id` through `requires`, including itself. */
function reachableModules(registry: Registry, id: string): Set<string> {
  const reached = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined || reached.has(current)) continue;
    reached.add(current);
    const module = registry.modules.find((candidate) => candidate.id === current);
    for (const required of module?.requires ?? []) queue.push(required);
  }
  return reached;
}

beforeAll(async () => {
  registry = await loadRegistry();
  const kitFiles = await listKitFiles();
  const owners = await resolveOwnership(await mirrorKitTree(kitFiles), registry.modules);
  const fileSet = new Set(kitFiles);

  const reachable = new Map(
    registry.modules.map((module) => [module.id, reachableModules(registry, module.id)]),
  );

  const declarers = packageDeclarers(registry);

  violations = [];
  packageViolations = [];
  examined = 0;
  for (const path of kitFiles) {
    const owner = owners.get(path);
    if (owner === undefined || !isCodeFile(path)) continue;

    const contents = await readFile(join(KIT_ROOT, path), 'utf8');
    const blocks = parseMarkers(contents, path);

    for (const { specifier, line } of extractImports(contents)) {
      const fromModule = importerModule(blocks, line, owner);
      const target = resolveKitImport(path, specifier, fileSet);

      if (target === null) {
        const packageName = toPackageName(specifier);
        if (packageName === null) continue;

        // Only a package some module declares is checkable. One nobody declares
        // is ambient — provided by Nuxt or arriving transitively — and
        // packageJsonCoverage already holds declarations to the kit's own file.
        const declaredBy = declarers.get(packageName);
        if (declaredBy === undefined) continue;
        examined += 1;

        if (!declaredBy.some((id) => reachable.get(fromModule)?.has(id))) {
          packageViolations.push({ from: path, fromModule, packageName, declaredBy });
        }
        continue;
      }

      // An unowned target is the coverage check's business, not this one's.
      const toModule = owners.get(target);
      if (toModule === undefined) continue;
      examined += 1;

      if (toModule === fromModule) continue;
      if (!reachable.get(fromModule)?.has(toModule)) {
        violations.push({ from: path, fromModule, to: target, toModule, specifier });
      }
    }
  }
}, 120_000);

describe('import ownership', () => {
  /**
   * A silent no-op — an alias table that stopped matching, an extension list
   * that stopped resolving — would leave the check passing while proving
   * nothing. The kit has hundreds of internal imports; a collapse to near zero
   * means the resolver broke, not that the coupling went away.
   */
  it('resolves the kit-internal imports it is meant to police', () => {
    expect(examined).toBeGreaterThan(300);
  });

  it('never imports across a boundary the importing module does not require', () => {
    const reported = violations
      .map(
        (violation) =>
          `${violation.from} (${violation.fromModule}) imports "${violation.specifier}" -> ${violation.to} (${violation.toModule})`,
      )
      .sort();
    expect(reported).toEqual([]);
  });

  /**
   * The same rule for npm packages. A module importing a package another module
   * declares generates a project whose `package.json` is missing it, which no
   * amount of kit-internal path checking can see — this is how `auth`'s lock
   * screen was caught importing `otpauth` from `auth-2fa`.
   */
  it('never imports a package the importing module does not bring with it', () => {
    const reported = packageViolations
      .map(
        (violation) =>
          `${violation.from} (${violation.fromModule}) imports "${violation.packageName}", declared only by ${violation.declaredBy.join(', ')}`,
      )
      .sort();
    expect(reported).toEqual([]);
  });
});
