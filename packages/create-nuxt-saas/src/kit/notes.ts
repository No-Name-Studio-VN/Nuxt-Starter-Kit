import { z } from 'zod';
import { CliError } from '../errors';
import type { JsonChangeNote } from '../types/json';
import { assertRelativePath } from '../util/paths';

export type KitChangeNote = Omit<JsonChangeNote, 'module'>;

export const noteIdSchema = z.string().regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/);
const versionPattern = /^\d+\.\d+\.\d+$/;

export const noteFileSchema = z.string().superRefine((path, ctx) => {
  try {
    assertRelativePath(path, 'Note file');
    if (/^[a-z]:|[\\\0]/i.test(path) || path.split('/').some((part) => part === '' || part === '.')) {
      throw new CliError('Note file must be a project-relative POSIX file path.');
    }
  } catch (error) {
    ctx.addIssue({ code: 'custom', message: error instanceof Error ? error.message : String(error) });
  }
});

export const changeNoteSchema = z.object({
  id: noteIdSchema,
  since: z.string().regex(versionPattern),
  title: z.string().trim().min(1),
  kind: z.enum(['feature', 'fix', 'security']).default('feature'),
  files: z.array(noteFileSchema),
});

export const changeNotesSchema = z.array(changeNoteSchema).default([]);

export function collectNotes(base: KitChangeNote[], modules: { id: string; changes: KitChangeNote[] }[], selected?: string[]): JsonChangeNote[] {
  const seen = new Map<string, string>();
  const notes: JsonChangeNote[] = [];
  for (const { id: module, changes } of [{ id: 'base', changes: base }, ...modules]) {
    for (const note of changes) {
      const previous = seen.get(note.id);
      if (previous !== undefined) throw new CliError(`Duplicate change note id "${note.id}" in ${previous} and ${module}.`);
      seen.set(note.id, module);
      if (!selected || module === 'base' || selected.includes(module)) notes.push({ ...note, module });
    }
  }
  return notes;
}

export function compareVersions(left: string | null, right: string | null): number | null {
  if (!left || !right || !versionPattern.test(left) || !versionPattern.test(right)) return null;
  const a = left.split('.').map((part) => BigInt(part));
  const b = right.split('.').map((part) => BigInt(part));
  for (const [index, part] of a.entries()) {
    const other = b[index];
    if (other !== undefined && part !== other) return part < other ? -1 : 1;
  }
  return 0;
}
