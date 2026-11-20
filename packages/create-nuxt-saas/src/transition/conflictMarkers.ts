import { CliError } from '../errors';
import type { JsonResolution } from '../types/json';

interface Hunk {
  yours: string;
  base: string;
  kit: string;
}

const markers = ['<<<<<<< yours', '||||||| kit (old)', '=======', '>>>>>>> kit (new)'];

function looksLikeMarker(line: string): boolean {
  return /^(?:<{7,}|\|{7,}|={7,}|>{7,})(?:\s|$)/.test(line);
}

export function hasConflictMarkers(content: string): boolean {
  return content.split(/\r?\n/).some((line) => !line.startsWith('=') && looksLikeMarker(line));
}

function lines(content: string): string[] {
  return content.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function subsequenceIndices(needle: string[], haystack: string[]): number[] | null {
  const matches: number[] = [];
  for (const [index, line] of haystack.entries()) {
    if (line === needle[matches.length]) matches.push(index);
    if (matches.length === needle.length) break;
  }
  return matches.length === needle.length ? matches : null;
}

function lcsLengths(base: string[], kit: string[]): Uint32Array {
  const lengths = new Uint32Array(kit.length + 1);
  for (const line of base) {
    let diagonal = 0;
    for (const [index, other] of kit.entries()) {
      const above = lengths[index + 1] ?? 0;
      lengths[index + 1] = line === other ? diagonal + 1 : Math.max(above, lengths[index] ?? 0);
      diagonal = above;
    }
  }
  return lengths;
}

function lcsSplit(left: string[], right: string[], kit: string[]): number {
  const prefix = lcsLengths(left, kit);
  const suffix = lcsLengths(right.toReversed(), kit.toReversed());
  let best = -1;
  let split = 0;
  for (const [index, length] of prefix.entries()) {
    const score = length + (suffix[kit.length - index] ?? 0);
    if (score > best) {
      best = score;
      split = index;
    }
  }
  return split;
}

function combineHunk({ yours, base, kit }: Hunk): string {
  const baseLines = lines(base);
  const kitLines = lines(kit);
  const kept = subsequenceIndices(lines(yours), baseLines);
  if (!kept) return yours + kit;
  if (kept.length === baseLines.length) return kit;
  const retained = new Set(kept);
  const removed = new Set<number>();

  // Align kit lines with the base, not with the text of deleted lines: identical additions can survive.
  // Split the LCS in halves to reconstruct the alignment without a quadratic-size table.
  function align(old: string[], next: string[], oldOffset: number, kitOffset: number): void {
    if (!old.length || !next.length) return;
    const matches = subsequenceIndices(old, next);
    if (matches) {
      for (const [index, match] of matches.entries()) {
        if (!retained.has(oldOffset + index)) removed.add(kitOffset + match);
      }
    } else if (old.length > 1) {
      const middle = Math.floor(old.length / 2);
      const left = old.slice(0, middle);
      const right = old.slice(middle);
      const split = lcsSplit(left, right, next);
      align(left, next.slice(0, split), oldOffset, kitOffset);
      align(right, next.slice(split), oldOffset + middle, kitOffset + split);
    }
  }
  align(baseLines, kitLines, 0, 0);
  return kitLines.filter((_, index) => !removed.has(index)).join('');
}

export function parseConflict(content: string, path: string) {
  const parts: (string | Hunk)[] = [];
  const hunks: Hunk[] = [];
  let hunk: Hunk | null = null;
  let side: keyof Hunk = 'yours';
  function malformed(): never {
    throw new CliError(`Conflict markers in ${path} are incomplete or malformed. Resolve them by hand.`);
  }

  // Keep each line's original terminator, including any CRLF outside the hunks.
  for (const line of lines(content)) {
    const text = line.replace(/\r?\n$/, '');
    if (!looksLikeMarker(text) || (!hunk && text.startsWith('='))) {
      if (hunk) hunk[side] += line;
      else parts.push(line);
    } else if (text === markers[0] && !hunk) {
      hunk = { yours: '', base: '', kit: '' };
      side = 'yours';
    } else if (text === markers[1] && hunk && side === 'yours') {
      side = 'base';
    } else if (text === markers[2] && hunk && side === 'base') {
      side = 'kit';
    } else if (text === markers[3] && hunk && side === 'kit') {
      hunks.push(hunk);
      parts.push(hunk);
      hunk = null;
    } else malformed();
  }
  if (hunk) malformed();
  if (!hunks.length) throw new CliError(`${path} is already resolved.`);

  function sideContent(side: keyof Hunk): string {
    return parts.map((part) => typeof part === 'string' ? part : part[side]).join('');
  }
  function resolve(action: JsonResolution['action']): string {
    if (action !== 'combine') return sideContent(action === 'keep-mine' ? 'yours' : 'kit');
    return parts.map((part) => typeof part === 'string' ? part : combineHunk(part)).join('');
  }
  return { hunks, resolve };
}
