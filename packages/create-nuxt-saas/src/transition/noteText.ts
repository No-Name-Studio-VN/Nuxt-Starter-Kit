import type { JsonFileChange, JsonNoteReport, JsonSuggestion } from '../types/json';

export function suggestionLabel(action: JsonSuggestion['action']): string {
  switch (action) {
    case 'keep-mine': return 'Keep mine';
    case 'take-kit': return 'Take the kit version';
    case 'combine': return 'Combine';
    case 'by-hand': return 'Resolve by hand';
  }
}

export function missingNotes(notes: JsonNoteReport[], changes: JsonFileChange[], markdown: boolean): string[] {
  const kinds = new Map(changes.map(({ path, kind }) => [path, kind]));
  const heading = markdown ? '**You may be missing:**' : 'You may be missing:';
  return notes.filter(({ outcome }) => outcome === 'kept' || outcome === 'conflict').map((note) => {
    const title = markdown ? `*${note.title}*` : note.title;
    const files = note.affected.map((path) => kinds.get(path) === 'conflict'
      ? `Your copy of \`${path}\` has a conflict.`
      : `Your copy of \`${path}\` was kept because you'd changed it.`);
    return `${heading} ${title} (${note.module}). ${files.join(' ')}`;
  });
}
