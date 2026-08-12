import { CliError } from '../errors';

/** Matches an opening or closing marker in any comment syntax. Kept unambiguous so
 * a hostile kit file cannot trigger catastrophic backtracking. */
const MARKER_PATTERN = /<(\/?)nsk:([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)>/;

export interface MarkerBlock {
  moduleId: string;
  /** 0-indexed line holding the opening marker. */
  startLine: number;
  /** 0-indexed line holding the closing marker. */
  endLine: number;
}

export function parseMarkers(contents: string, label: string): MarkerBlock[] {
  const blocks: MarkerBlock[] = [];
  let open: { moduleId: string; startLine: number } | null = null;

  contents.split('\n').forEach((line, index) => {
    const match = MARKER_PATTERN.exec(line);
    if (!match) return;

    const isClosing = match[1] === '/';
    const moduleId = match[2]!;
    const location = `${label}:${index + 1}`;

    if (!isClosing) {
      if (open) {
        throw new CliError(
          `Marker blocks cannot be nested: "${moduleId}" opens inside "${open.moduleId}" at ${location}.`,
        );
      }
      open = { moduleId, startLine: index };
      return;
    }

    if (!open) {
      throw new CliError(`Marker at ${location} closes "${moduleId}", which was never opened.`);
    }
    if (open.moduleId !== moduleId) {
      throw new CliError(
        `Marker at ${location} closes "${moduleId}", but "${open.moduleId}" is open.`,
      );
    }
    blocks.push({ moduleId, startLine: open.startLine, endLine: index });
    open = null;
  });

  if (open) {
    const unclosed = open as { moduleId: string; startLine: number };
    throw new CliError(
      `Marker block "${unclosed.moduleId}" opened at ${label}:${unclosed.startLine + 1} is never closed.`,
    );
  }

  return blocks;
}
