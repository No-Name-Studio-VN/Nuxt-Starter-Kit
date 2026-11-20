import { countLineChanges } from '../git/lineChanges';
import { compareVersions } from '../kit/notes';
import type { Tree } from '../render/render';
import type { JsonChangeNote, JsonNoteReport, JsonSuggestion } from '../types/json';
import { resolveInside } from '../util/paths';
import { normalized, readUserFile, type FileChange } from './plan';

export function transitionNotes(
  notes: JsonChangeNote[],
  changes: FileChange[],
  declined: string[],
  fromVersion: string | null,
  toVersion: string | null,
): JsonNoteReport[] {
  const kinds = new Map(changes.map(({ path, kind }) => [path, kind]));
  const refusals = new Set(declined);
  return notes.flatMap((note): JsonNoteReport[] => {
    const from = compareVersions(fromVersion, note.since);
    const to = compareVersions(note.since, toVersion);
    const relevant = from === null || to === null
      ? note.files.some((path) => kinds.has(path))
      : from < 0 && to <= 0;
    if (!relevant) return [];
    const affected = note.files.filter((path) => kinds.get(path) === 'conflict' || kinds.get(path) === 'keep-edited');
    const outcome = refusals.has(note.id) ? 'declined'
      : affected.some((path) => kinds.get(path) === 'conflict') ? 'conflict'
        : affected.length ? 'kept' : 'applied';
    return [{ ...note, outcome, affected }];
  });
}

export async function suggest(
  projectRoot: string, path: string, base: Tree, target: Tree, reports: JsonNoteReport[],
): Promise<JsonSuggestion> {
  const covering = reports.filter((note) => note.files.includes(path));
  const notes = covering.map(({ id }) => id);
  const fix = covering.find((note) => note.outcome !== 'declined' && note.kind !== 'feature');
  if (fix) {
    return { path, notes, action: 'take-kit', reason: `The kit change is a ${fix.kind === 'security' ? 'security fix' : 'fix'}: ${fix.title}. You'd lose it otherwise.` };
  }
  if (covering.length && covering.every((note) => note.outcome === 'declined')) {
    return { path, notes, action: 'keep-mine', reason: `You said no to ${covering.map(({ title }) => title).join(', ')}.` };
  }
  const yours = await readUserFile(projectRoot, resolveInside(projectRoot, path, 'Conflict path'));
  const old = base.get(path);
  const kit = target.get(path);
  if (yours && yours !== 'owned' && kit) {
    const counts = await countLineChanges(old ? normalized(old.content) : '', normalized(yours.content), normalized(kit.content));
    if (counts.yours.removed && !counts.yours.added && counts.kit.added && !counts.kit.removed) {
      return { path, notes, action: 'combine', reason: "The kit's additions are probably new features you want." };
    }
    if (counts.base >= 10 && counts.yours.removed * 2 >= counts.base) {
      return { path, notes, action: 'keep-mine', reason: 'You rewrote most of this file. Copy over only the kit changes you want.' };
    }
  }
  return { path, notes, action: 'by-hand', reason: 'Both sides changed the same lines.' };
}