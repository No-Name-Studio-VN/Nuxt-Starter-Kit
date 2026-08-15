import { parseMarkers } from '../../src/markers/parse';
import type { Registry } from '../../src/registry/schema';

/**
 * A module-scope binding: unindented, so nothing inside a function body counts.
 * That restriction is what keeps the checks built on this meaningful — a local
 * `const db` in one function and an unrelated `db` in another are not the same
 * name, and flagging them would drown the real cases.
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

export interface BlockDeclaration {
  name: string;
  moduleId: string;
  /** 0-indexed line the declaration sits on. */
  line: number;
}

/**
 * Names a file declares from inside a marker block, and the module gating each.
 *
 * These are the names that vanish when their module is absent, so they are the
 * names nothing outside the block may depend on — whether that dependant is
 * elsewhere in the same file or in another file entirely.
 */
export function blockDeclarations(contents: string, label: string): BlockDeclaration[] {
  if (!contents.includes('<nsk:')) return [];

  const lines = contents.split('\n');
  const inExportList = exportListLines(lines);
  const declarations: BlockDeclaration[] = [];

  for (const block of parseMarkers(contents, label)) {
    for (let index = block.startLine + 1; index < block.endLine; index += 1) {
      const line = lines[index];
      if (line === undefined) continue;
      const name =
        DECLARATION.exec(line)?.[1] ??
        (inExportList[index] === true ? EXPORT_LIST_ENTRY.exec(line)?.[1] : undefined);
      if (name !== undefined) declarations.push({ name, moduleId: block.moduleId, line: index });
    }
  }

  return declarations;
}

/** Every module reachable from `id` through `requires`, including itself. */
export function reachableModules(registry: Registry, id: string): Set<string> {
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
