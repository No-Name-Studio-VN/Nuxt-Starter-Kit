import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseMarkers } from '../../src/markers/parse';
import { loadRegistry } from '../../src/registry/load';
import { resolveOwnership } from '../../src/render/render';
import { isCodeFile } from '../support/imports';
import { KIT_ROOT, listKitFiles, mirrorKitTree } from '../support/kitTree';

/**
 * A marker block deletes its lines when its module is absent. Anything the rest
 * of the file still needs must therefore live outside it — a name declared
 * inside a block and used outside compiles perfectly in the kit, where every
 * block survives, and leaves a dangling reference in every project without that
 * module.
 *
 * This is not hypothetical. Import sorting hoisted a fragment's import to the
 * top of `server/db/schema.sqlite.ts`, which swept a type declaration written
 * below it inside the block; and `DBPasskey` was re-exported from `shared/db.ts`
 * after the declaration it names had moved behind a marker. Both reached CI.
 */

interface Escape {
  file: string;
  moduleId: string;
  name: string;
  line: number;
}

/**
 * A module-scope binding: unindented, so nothing inside a function body counts.
 * That restriction is what keeps the check meaningful — a local `const db` in
 * one function and an unrelated `db` in another are not the same name, and
 * flagging them would drown the real cases.
 */
const DECLARATION =
  /^(?:export\s+)?(?:declare\s+)?(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/;

/** A single name on its own line, which inside an export list is a re-export. */
const EXPORT_LIST_ENTRY = /^\s*([A-Z_$][\w$]*)\s*(?:,\s*)?$/i;

/** Whether each line sits inside an `export { … }` / `export type { … }` list. */
function exportListLines(lines: string[]): boolean[] {
  let open = false;
  return lines.map((line) => {
    const wasOpen = open;
    if (/^export\s+(?:type\s+)?\{/.test(line)) open = true;
    else if (open && line.includes('}')) open = false;
    return wasOpen || open;
  });
}

/** Strips line comments so prose mentioning a name is not read as a use of it. */
function withoutComments(line: string): string {
  return line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
}

let escapes: Escape[];

beforeAll(async () => {
  escapes = [];

  // Only files a module actually ships. The CLI's own tests carry marker syntax
  // as fixture data, and the registry excludes `packages/**` for that reason.
  const kitFiles = await listKitFiles();
  const registry = await loadRegistry();
  const owners = await resolveOwnership(await mirrorKitTree(kitFiles), registry.modules);

  for (const path of kitFiles) {
    if (!isCodeFile(path) || !owners.has(path)) continue;
    const contents = await readFile(join(KIT_ROOT, path), 'utf8');
    if (!contents.includes('<nsk:')) continue;

    const lines = contents.split('\n');
    const blocks = parseMarkers(contents, path);
    const inExportList = exportListLines(lines);

    for (const block of blocks) {
      // Lines belonging to any block of the same module are safe to reference
      // from, since they come and go together.
      const sameModule = blocks.filter((candidate) => candidate.moduleId === block.moduleId);
      const isOwned = (index: number): boolean =>
        sameModule.some((candidate) => index >= candidate.startLine && index <= candidate.endLine);

      for (let index = block.startLine + 1; index < block.endLine; index += 1) {
        const line = lines[index];
        if (line === undefined) continue;
        const name =
          DECLARATION.exec(line)?.[1] ??
          (inExportList[index] === true ? EXPORT_LIST_ENTRY.exec(line)?.[1] : undefined);
        if (name === undefined) continue;

        const used = lines.some(
          (candidate, candidateIndex) =>
            !isOwned(candidateIndex) &&
            new RegExp(`\\b${name}\\b`).test(withoutComments(candidate)),
        );
        if (used) escapes.push({ file: path, moduleId: block.moduleId, name, line: index + 1 });
      }
    }
  }
}, 120_000);

describe('marker scope', () => {
  it('never declares inside a marker block something used outside it', () => {
    const reported = escapes
      .map(
        (escape) =>
          `${escape.file}:${escape.line} declares "${escape.name}" inside <nsk:${escape.moduleId}> but it is used outside the block`,
      )
      .sort();
    expect(reported).toEqual([]);
  });
});
