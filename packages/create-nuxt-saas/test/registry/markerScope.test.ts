import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseMarkers } from '../../src/markers/parse';
import { loadRegistry } from '../../src/registry/load';
import type { Registry } from '../../src/registry/schema';
import { resolveOwnership } from '../../src/render/render';
import { extractNamedBindings, isCodeFile, resolveKitImport } from '../support/imports';
import { KIT_ROOT, listKitFiles, mirrorKitTree } from '../support/kitTree';
import { blockDeclarations, reachableModules } from '../support/markers';

/**
 * A marker block deletes its lines when its module is absent. Anything that
 * survives the deletion must therefore not depend on what the block declared — a
 * name declared inside a block compiles perfectly in the kit, where every block
 * survives, and dangles in every project without that module.
 *
 * Both directions of this reached CI during the frontend-only `base` work.
 * Within a file, import sorting hoisted a fragment's import to the top of
 * `server/db/schema.sqlite.ts`, sweeping a type declaration written below it
 * inside the block. Across files, `shared/db.ts` re-exported `DBPasskey` after
 * the declaration it names had moved behind `<nsk:auth>` in `types/db/database.ts`.
 *
 * The cross-file half reads brace clauses only. `export *` names nothing to
 * attribute and a default export cannot be gated on its own, so neither is
 * checkable here; those remain the generation matrix's to catch.
 */

interface Escape {
  file: string;
  detail: string;
}

let sameFile: Escape[];
let crossFile: Escape[];

/** The module a line belongs to: its enclosing block, or the file's owner. */
function moduleAtLine(
  blocks: Array<{ moduleId: string; startLine: number; endLine: number }>,
  line: number,
  owner: string,
): string {
  const block = blocks.find(
    (candidate) => line >= candidate.startLine && line <= candidate.endLine,
  );
  return block?.moduleId ?? owner;
}

/** Strips line comments so prose mentioning a name is not read as a use of it. */
function withoutComments(line: string): string {
  return line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
}

interface KitFile {
  path: string;
  owner: string;
  contents: string;
}

let registry: Registry;

beforeAll(async () => {
  registry = await loadRegistry();
  const kitFiles = await listKitFiles();
  const owners = await resolveOwnership(await mirrorKitTree(kitFiles), registry.modules);
  const fileSet = new Set(kitFiles);

  // Only files a module actually ships. The CLI's own tests carry marker syntax
  // as fixture data, and the registry excludes `packages/**` for that reason.
  const files: KitFile[] = [];
  for (const path of kitFiles) {
    const owner = owners.get(path);
    if (owner === undefined || !isCodeFile(path)) continue;
    files.push({ path, owner, contents: await readFile(join(KIT_ROOT, path), 'utf8') });
  }

  const reachable = new Map(
    registry.modules.map((module) => [module.id, reachableModules(registry, module.id)]),
  );
  /** Per file, the gated names it declares and the module gating each. */
  const gated = new Map(
    files.map((file) => [
      file.path,
      new Map(
        blockDeclarations(file.contents, file.path).map((declaration) => [
          declaration.name,
          declaration.moduleId,
        ]),
      ),
    ]),
  );

  sameFile = [];
  crossFile = [];

  for (const file of files) {
    const declarations = blockDeclarations(file.contents, file.path);
    const lines = file.contents.split('\n');
    const blocks = parseMarkers(file.contents, file.path);

    for (const declaration of declarations) {
      // Lines in any block of the same module come and go with the declaration,
      // so referring to it from one of them is safe.
      const isOwned = (index: number): boolean =>
        blocks.some(
          (candidate) =>
            candidate.moduleId === declaration.moduleId &&
            index >= candidate.startLine &&
            index <= candidate.endLine,
        );

      const used = lines.some(
        (candidate, index) =>
          !isOwned(index) &&
          new RegExp(`\\b${declaration.name}\\b`).test(withoutComments(candidate)),
      );
      if (used) {
        sameFile.push({
          file: file.path,
          detail: `${file.path}:${declaration.line + 1} declares "${declaration.name}" inside <nsk:${declaration.moduleId}> but it is used outside the block`,
        });
      }
    }

    for (const binding of extractNamedBindings(file.contents)) {
      const target = resolveKitImport(file.path, binding.specifier, fileSet);
      if (target === null) continue;

      const gatedBy = gated.get(target)?.get(binding.name);
      if (gatedBy === undefined) continue;

      const importer = moduleAtLine(blocks, binding.line, file.owner);
      if (importer === gatedBy || reachable.get(importer)?.has(gatedBy) === true) continue;

      crossFile.push({
        file: file.path,
        detail: `${file.path}:${binding.line + 1} takes "${binding.name}" from ${target}, where it is gated by <nsk:${gatedBy}> — unreachable from ${importer}`,
      });
    }
  }
}, 120_000);

describe('marker scope', () => {
  it('never declares inside a marker block something used outside it', () => {
    expect(sameFile.map((escape) => escape.detail).sort()).toEqual([]);
  });

  /**
   * The cross-file half. Ownership alone cannot see this: `shared/db.ts` and
   * `types/db/database.ts` are both `database`, so no module boundary is
   * crossed — it is the *name* that is gated, not the file.
   */
  it('never imports a name the exporting file keeps behind a marker it cannot reach', () => {
    expect(crossFile.map((escape) => escape.detail).sort()).toEqual([]);
  });
});
