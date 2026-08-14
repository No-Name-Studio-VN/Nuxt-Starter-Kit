import { parseMarkers } from './parse';

/**
 * Removes marker blocks belonging to modules that are not installed. Selected
 * modules' blocks — markers included — survive byte-identical, so generated
 * projects keep the structure `add` and `remove` rely on.
 */
export function stripUnselectedBlocks(
  contents: string,
  selectedIds: ReadonlySet<string>,
  label: string,
): string {
  const blocks = parseMarkers(contents, label);
  const removable = blocks.filter((block) => !selectedIds.has(block.moduleId));
  if (removable.length === 0) return contents;

  const removedLines = new Set<number>();
  for (const block of removable) {
    for (let line = block.startLine; line <= block.endLine; line += 1) {
      removedLines.add(line);
    }
  }

  return contents
    .split('\n')
    .filter((_line, index) => !removedLines.has(index))
    .join('\n');
}
