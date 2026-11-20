import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readKitConfig } from '../../src/kit/config';
import { readKitModules } from '../../src/kit/modules';
import type { Tree } from '../../src/render/render';
import { suggest, transitionNotes } from '../../src/transition/notes';
import type { JsonChangeNote, JsonNoteReport } from '../../src/types/json';
import { writeJsonAtomically, writeTextFile } from '../../src/util/fs';
import { makeTempDir } from '../support/fixtureKit';

let root: string;
const note: JsonChangeNote = { id: 'base.home', module: 'base', since: '3.10.0', title: 'Better home', kind: 'feature', files: ['home.txt'] };

beforeEach(async () => { root = await makeTempDir('change-notes'); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

async function writeModule(id: string, change: unknown) {
  await writeJsonAtomically(join(root, 'layers', id, 'module.json'), { title: id, description: id, changes: [change] });
}

async function writeConfig(changes: unknown) {
  await writeJsonAtomically(join(root, 'packages/create-nuxt-saas/kit.json'), { exclude: [], changes });
}

describe('change note validation and selection', () => {
  it.each([
    { id: 'Bad ID' }, { id: 'a..b' }, { since: 'v1.0.0' }, { since: '1.0' },
    { files: ['/etc/file'] }, { files: ['a/../file'] }, { files: ['C:\\absolute'] }, { files: ['.'] },
  ])('rejects invalid note metadata %j in base and module manifests', async (override) => {
    await writeConfig([{ ...note, ...override }]);
    await writeModule('alpha', { ...note, ...override });
    await expect(readKitConfig(root)).rejects.toThrow(/Invalid kit config/);
    await expect(readKitModules(root)).rejects.toThrow(/Invalid module.*changes/);
  });

  it('rejects duplicate note ids even in unrelated layers', async () => {
    await writeModule('alpha', note);
    await writeModule('beta', note);
    await expect(readKitModules(root)).rejects.toThrow(/Duplicate change note id "base.home" in alpha and beta/);
  });

  it('rejects duplicate ids across base and a module before filtering by selection', async () => {
    await writeConfig([note]);
    await writeModule('alpha', note);
    await expect(readKitModules(root)).rejects.toThrow(/Duplicate change note id "base.home" in base and alpha/);
  });

  it('compares each version component numerically in an exclusive-to-inclusive window', () => {
    const notes = [
      { ...note, id: 'old', since: '3.9.0' },
      { ...note, id: 'latest', since: '3.11.0' },
      { ...note, id: 'future', since: '3.100.0' },
    ];
    expect(transitionNotes(notes, [], [], '3.9.0', '3.11.0').map(({ id }) => id)).toEqual(['latest']);
  });

  it('uses paths in the plan if the starting version is unavailable', () => {
    const notes = [note, { ...note, id: 'other', files: ['other.txt'] }];
    expect(transitionNotes(notes, [{ path: 'home.txt', kind: 'update' }], [], null, '3.10.0')).toEqual([
      { ...note, outcome: 'applied', affected: [] },
    ]);
  });

  it('prefers conflict to kept for a note spanning both kinds', () => {
    const first = { ...note, files: ['kept.txt', 'home.txt'] };
    expect(transitionNotes([first], [{ path: 'kept.txt', kind: 'keep-edited' }, { path: 'home.txt', kind: 'conflict' }], [], '3.9.0', '3.10.0')).toEqual([
      { ...first, outcome: 'conflict', affected: ['kept.txt', 'home.txt'] },
    ]);
  });
});

const oldLines = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`);
const mostlyDeleted = oldLines.slice(5);
const added = ['kit addition', ...oldLines];

async function suggestion(yours: string[], kit: string[], notes: JsonNoteReport[] = [], base = oldLines) {
  const path = 'home.txt';
  const file = (lines: string[]) => ({ content: Buffer.from(lines.join('\n') + '\n'), binary: false });
  const before: Tree = new Map([[path, file(base)]]);
  const after: Tree = new Map([[path, file(kit)]]);
  await writeTextFile(join(root, path), yours.join('\r\n') + '\r\n');
  return suggest(root, path, before, after, notes);
}

function report(kind: JsonChangeNote['kind'], declined = false, id = 'base.home'): JsonNoteReport {
  return { ...note, id, kind, outcome: declined ? 'declined' : 'conflict', affected: note.files };
}

describe('suggestions', () => {
  it.each(['fix', 'security'] satisfies JsonChangeNote['kind'][])('takes a non-declined %s over declined notes and the content heuristics', async (kind) => {
    const result = await suggestion(mostlyDeleted, added, [report('fix', true, 'declined'), report(kind)]);
    expect(result).toMatchObject({ action: 'take-kit', notes: ['declined', 'base.home'] });
    expect(result.reason).toBe(`The kit change is a ${kind === 'security' ? 'security fix' : 'fix'}: Better home. You'd lose it otherwise.`);
  });

  it('keeps mine if all covering notes were declined, before considering the content', async () => {
    expect(await suggestion(mostlyDeleted, added, [report('security', true)])).toMatchObject({
      action: 'keep-mine', reason: 'You said no to Better home.', notes: ['base.home'],
    });
  });

  it('combines removals and additions before considering the size of the edit', async () => {
    expect(await suggestion(mostlyDeleted, added, [report('security', true, 'declined'), report('feature')])).toMatchObject({
      action: 'combine', reason: "The kit's additions are probably new features you want.",
    });
  });

  it('keeps mine when at least half of a 10-line file was changed', async () => {
    expect(await suggestion(mostlyDeleted, ['kit rewrote line 1', ...oldLines.slice(1)])).toMatchObject({
      action: 'keep-mine', reason: 'You rewrote most of this file. Copy over only the kit changes you want.',
    });
  });

  it('does not treat many added lines as changes to the original base lines', async () => {
    const replacements = Array.from({ length: 12 }, (_, i) => `added line ${i + 1}`);
    expect(await suggestion([...replacements, ...oldLines.slice(1)], ['kit line 1', ...oldLines.slice(1)])).toMatchObject({
      action: 'by-hand', reason: 'Both sides changed the same lines.',
    });
  });

  it('falls back to by hand for a small base even if rewritten', async () => {
    expect(await suggestion(['yours'], ['kit'], [], ['small base'])).toMatchObject({ action: 'by-hand', notes: [] });
  });
});
