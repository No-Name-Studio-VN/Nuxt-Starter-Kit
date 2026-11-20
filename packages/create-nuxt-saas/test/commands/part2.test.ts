import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../../src/cli';
import { runInit } from '../../src/commands/init';
import { runUpgrade } from '../../src/commands/upgrade';
import { git } from '../../src/git/snapshot';
import { DEFAULT_TEMPLATE, openKit, type KitSnapshot } from '../../src/kit/source';
import { readState, writeState } from '../../src/project/state';
import { runResolve } from '../../src/commands/resolve';
import { printResolveView, printTransitionReport } from '../../src/report';
import type { ResolveChoice, ResolveView } from '../../src/types/cli';
import { createFixtureKit, makeTempDir } from '../support/fixtureKit';

const home = 'app/pages/index.vue';
const logo = 'public/logo.png';
const identity = { name: 'my-project', description: 'A fixture project' };
let fixture: Awaited<ReturnType<typeof createFixtureKit>>;
let from: KitSnapshot;
let to: KitSnapshot;
let projectRoot: string;
let parent: string;

beforeAll(async () => {
  fixture = await createFixtureKit({ notes: true });
  const source = { kind: 'local', path: fixture.root, allowDirty: false } satisfies Parameters<typeof openKit>[0];
  from = await openKit(source, fixture.v1, DEFAULT_TEMPLATE);
  to = await openKit(source, fixture.v2, DEFAULT_TEMPLATE);
});
afterAll(async () => {
  await Promise.all([from.cleanup(), to.cleanup(), rm(fixture.root, { recursive: true, force: true })]);
});
beforeEach(async () => {
  parent = await makeTempDir('part2');
  projectRoot = join(parent, 'project');
  await runInit({ target: projectRoot, identity, requested: [], kit: from, git: true });
});
afterEach(async () => {
  await rm(parent, { recursive: true, force: true });
});

async function cli(...args: string[]) {
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  try {
    const code = await main([args[0] ?? '', '--json', ...args.slice(1)]);
    const output = stdout.mock.calls.map(([value]) => String(value)).join('');
    const report: unknown = output ? JSON.parse(output) : null;
    return { code, report };
  } finally {
    stdout.mockRestore();
  }
}

async function editHome() {
  const original = await readFile(join(projectRoot, home), 'utf8');
  const content = original.replace('Home v1', 'Your home').replace('Fixture footer', 'Your footer');
  await writeFile(join(projectRoot, home), content);
  return content;
}

function upgrade() {
  return runUpgrade({ projectRoot, from, to, force: true, check: false });
}

it('initializes from a specified local kit ref without checking that ref out', async () => {
  const target = join(parent, 'another-project');
  const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    expect(await main(['init', target, '--kit', fixture.root, '--to', fixture.v1, '--yes'])).toBe(0);
    expect((await readState(target)).commit).toBe(fixture.v1);
    expect((await git(fixture.root, ['rev-parse', 'HEAD'])).trim()).toBe(fixture.v2);
  } finally {
    logs.mockRestore();
  }
});

describe('upgrade change notes', () => {
  it('selects current notes for installed modules and reports all four outcomes', async () => {
    await cli('decline', 'base.logo', '--dir', projectRoot);
    await editHome();
    await writeFile(join(projectRoot, logo), Buffer.from([0, 3]));
    const first = await runUpgrade({ projectRoot, from, to, force: true, check: true });
    expect(first).toMatchObject({
      notes: [
        { id: 'base.home', module: 'base', outcome: 'conflict', affected: [home] },
        { id: 'base.logo', outcome: 'declined', affected: [logo] },
        { id: 'base.new', kind: 'feature', outcome: 'applied', affected: [] },
      ],
      suggestions: [{ path: home, action: 'take-kit', notes: ['base.home'] }],
    });
    await cli('decline', 'base.logo,base.home', '--revert', '--dir', projectRoot);
    const second = await upgrade();
    expect(second).toMatchObject({ notes: expect.arrayContaining([{ id: 'base.logo', outcome: 'kept', affected: [logo], module: 'base', kind: 'feature', title: 'New logo', since: '3.1.0', files: [logo] }]) });
    const markdown = await readFile(join(projectRoot, '.nuxt-saas/upgrade-report.md'), 'utf8');
    expect(markdown).toContain('**You may be missing:** *New logo* (base)');
    expect(markdown).toContain("The kit change is a security fix: Safer home. You'd lose it otherwise.");
  });

  it('checks uncovered paths since the previous kit commit', async () => {
    const result = await cli('notes', '--kit', fixture.root, '--check', '--since', fixture.v1);
    expect(result).toMatchObject({ code: 1, report: { uncovered: expect.arrayContaining(['obsolete.txt']) } });
    for (const path of [home, 'packages/create-nuxt-saas/kit.json', 'docs/x.md']) {
      expect(result.report).not.toMatchObject({ uncovered: expect.arrayContaining([path]) });
    }
  });
});

describe('resolve', () => {
  it('lists a pending conflict and keeps undo restorable after taking kit hunks', async () => {
    const oldHome = await editHome();
    await upgrade();
    expect(await cli('resolve', '--dir', projectRoot)).toMatchObject({ code: 3, report: { decisions: expect.arrayContaining([{ path: home, pending: true, kind: 'conflict', suggestion: expect.objectContaining({ action: 'take-kit' }), notes: [expect.objectContaining({ id: 'base.home' })], resolution: null, hasKitVersion: true }]) } });
    expect(await cli('resolve', home, '--take-kit', '--dir', projectRoot)).toMatchObject({ code: 0, report: { resolved: { path: home, action: 'take-kit' }, decisions: expect.arrayContaining([expect.objectContaining({ path: home, pending: false, resolution: 'take-kit' })]) } });
    expect(await readFile(join(projectRoot, home), 'utf8')).toContain('Your footer');
    expect((await cli('undo', '--check', '--dir', projectRoot)).report).toMatchObject({ restorable: true });
    expect(await cli('undo', '--yes', '--dir', projectRoot)).toMatchObject({ code: 0 });
    expect(await readFile(join(projectRoot, home), 'utf8')).toBe(oldHome);
  });

  it('ignores protected kept files when listing and resolving decisions', async () => {
    const lockfile = 'yarn.lock';
    const userLock = 'my lockfile\n';
    await writeFile(join(projectRoot, lockfile), userLock);
    await editHome();
    expect(await upgrade()).toMatchObject({ changes: expect.arrayContaining([{ path: lockfile, kind: 'keep-edited' }]) });
    expect(await cli('resolve', '--dir', projectRoot)).toMatchObject({ code: 3, report: { decisions: [expect.objectContaining({ path: home })] } });
    expect(await cli('resolve', lockfile, '--take-kit', '--dir', projectRoot)).toMatchObject({ code: 1, report: { error: { message: expect.stringMatching(/protected/i) } } });
    expect(await cli('resolve', home, '--keep-mine', '--dir', projectRoot)).toMatchObject({ code: 0 });
    expect(await readFile(join(projectRoot, lockfile), 'utf8')).toBe(userLock);
  });

  it('applies the combine suggestion without bringing back deleted lines', async () => {
    const path = 'combine.txt';
    await writeFile(join(projectRoot, path), 'a\nc\n');
    expect(await upgrade()).toMatchObject({ suggestions: [expect.objectContaining({ path, action: 'combine' })] });
    expect(await cli('resolve', path, '--combine', '--dir', projectRoot)).toMatchObject({ code: 0 });
    expect(await readFile(join(projectRoot, path), 'utf8')).toBe('a\nd\nc\n');
  });

  it('does not incorporate unrelated edits into the undo snapshot', async () => {
    await editHome();
    await upgrade();
    await writeFile(join(projectRoot, 'new-user-file'), 'new work');
    expect(await cli('resolve', home, '--keep-mine', '--dir', projectRoot)).toMatchObject({ code: 0 });
    expect((await cli('undo', '--check', '--dir', projectRoot)).report).toMatchObject({ restorable: false, blocked: { reason: 'changes', paths: expect.arrayContaining(['new-user-file']) } });
  });

  it('remembers declined note ids and suggests keeping mine on the next upgrade', async () => {
    await editHome();
    await upgrade();
    expect(await cli('resolve', home, '--keep-mine', '--decline', '--dir', projectRoot)).toMatchObject({ code: 0 });
    expect(await readState(projectRoot)).toMatchObject({ declined: ['base.home'] });
    await git(projectRoot, ['restore', '--source=HEAD', '--', '.']);
    expect(await cli('decline', 'base.home', '--dir', projectRoot)).toMatchObject({ code: 0 });
    await editHome();
    expect(await upgrade()).toMatchObject({
      notes: expect.arrayContaining([expect.objectContaining({ id: 'base.home', outcome: 'declined' })]),
      suggestions: [{ path: home, action: 'keep-mine', notes: ['base.home'], reason: 'You said no to Safer home.' }],
    });
  });
});

describe('decline and inspect', () => {
  it('updates refusals idempotently and omits empty declined from persisted state', async () => {
    expect(await readState(projectRoot)).toMatchObject({ declined: [] });
    for (const ids of ['foo,bar', 'foo,foo']) {
      expect(await cli('decline', ids, '--dir', projectRoot)).toEqual({ code: 0, report: { schema: 1, declined: ['bar', 'foo'] } });
    }
    for (let i = 0; i < 2; i++) {
      expect(await cli('decline', 'foo,bar', '--revert', '--dir', projectRoot)).toEqual({ code: 0, report: { schema: 1, declined: [] } });
    }
    expect(await readFile(join(projectRoot, '.nuxt-saas.json'), 'utf8')).not.toContain('declined');
  });

  it('shows changed and deleted feature files from the recorded kit, excluding declined notes', async () => {
    await upgrade();
    await writeFile(join(projectRoot, home), 'edited');
    await rm(join(projectRoot, 'app/pages/new.vue'));
    expect(await cli('inspect', '--kit', fixture.root, '--dir', projectRoot)).toMatchObject({ report: {
      features: { missing: expect.arrayContaining([expect.objectContaining({ id: 'base.new', affected: ['app/pages/new.vue'], outcome: 'kept' })]) },
    } });
    await cli('decline', 'base.new', '--dir', projectRoot);
    expect(await cli('inspect', '--kit', fixture.root, '--dir', projectRoot)).toMatchObject({ code: 0, report: {
      features: { missing: [expect.objectContaining({ id: 'base.home', affected: [home], outcome: 'kept' })], declined: ['base.new'] },
    } });
  });
});

const hunk = (n: number, newline = '\n') => [
  '<<<<<<< yours', `yours ${n}`, '||||||| kit (old)', `base ${n}`, '=======', `kit ${n}`, '>>>>>>> kit (new)', '',
].join(newline);

async function setupConflict(path: string, content: string) {
  await writeFile(join(projectRoot, path), content);
  const state = await readState(projectRoot);
  await writeState(projectRoot, { ...state, conflicts: [...state.conflicts, path] });
}

describe('resolving marker and kept files', () => {
  it.each([
    ['keep-mine', '\n', ['yours 1', 'yours 2']],
    ['take-kit', '\r\n', ['kit 1', 'kit 2']],
    ['combine', '\r\n', ['yours 1\r\nkit 1', 'yours 2\r\nkit 2']],
  ])('resolves both hunks with --%s and preserves their line endings', async (action, newline, sides) => {
    const path = 'conflict.txt';
    await setupConflict(path, ['before', hunk(1, newline) + 'between', hunk(2, newline) + 'after'].join(newline));
    expect(await cli('resolve', '--dir', projectRoot)).toEqual({ code: 3, report: {
      schema: 1, decisions: [{ path, kind: 'conflict', pending: true, suggestion: null, notes: [], resolution: null, hasKitVersion: false }],
    } });
    expect(await cli('resolve', path, `--${action}`, '--dir', projectRoot)).toMatchObject({ code: 0 });
    expect(await readFile(join(projectRoot, path), 'utf8')).toBe(['before', sides[0], 'between', sides[1], 'after'].join(newline));
  });

  it('combines deletion-only and addition hunks independently with CRLF', async () => {
    const path = 'conflict.txt';
    const newline = '\r\n';
    const deletion = [
      '<<<<<<< yours', 'a', 'c', '||||||| kit (old)', 'a', 'b', 'c', 'old ending', '=======',
      'b', 'inserted', 'a', 'b', 'c', 'd', '>>>>>>> kit (new)', '',
    ].join(newline);
    await setupConflict(path, deletion + 'between' + newline + hunk(2, newline));
    expect(await cli('resolve', path, '--combine', '--dir', projectRoot)).toMatchObject({ code: 0 });
    expect(await readFile(join(projectRoot, path), 'utf8')).toBe(
      ['b', 'inserted', 'a', 'c', 'd', 'between', 'yours 2', 'kit 2', ''].join(newline),
    );
  });

  it('does not bring back a deleted base line when the user also added a line', async () => {
    const path = 'conflict.txt';
    await setupConflict(path, [
      '<<<<<<< yours', 'kept', 'user addition', '||||||| kit (old)', 'kept', 'deleted', '=======',
      'kept', 'deleted', 'kit addition', '>>>>>>> kit (new)', '',
    ].join('\n'));
    expect(await cli('resolve', path, '--combine', '--dir', projectRoot)).toMatchObject({ code: 0 });
    expect(await readFile(join(projectRoot, path), 'utf8')).toBe('kept\nuser addition\nkit addition\n');
  });

  it.each([
    hunk(1).replace('||||||| kit (old)\n', ''),
    hunk(1).replace('>>>>>>> kit (new)\n', ''),
    '||||||| kit (old)\nold\n=======\nnew\n>>>>>>> kit (new)\n',
    hunk(1).replace('>>>>>>> kit (new)', '>>>>>>> wrong'),
  ])('rejects malformed/partial markers without changing the file', async (content) => {
    await setupConflict('partial.txt', content);
    expect(await cli('resolve', 'partial.txt', '--keep-mine', '--dir', projectRoot)).toMatchObject({ code: 1, report: { error: { message: expect.stringMatching(/incomplete or malformed/) } } });
    expect(await readFile(join(projectRoot, 'partial.txt'), 'utf8')).toBe(content);
  });

  it('preserves Markdown headings outside the conflict hunks', async () => {
    const heading = 'Heading\n=======\n';
    await setupConflict('conflict.md', heading + hunk(1));
    expect(await cli('resolve', 'conflict.md', '--keep-mine', '--dir', projectRoot)).toMatchObject({ code: 0 });
    expect(await readFile(join(projectRoot, 'conflict.md'), 'utf8')).toBe(heading + 'yours 1\n');
  });

  it('refuses already-resolved files and files outside the decisions', async () => {
    await setupConflict('manual.txt', 'Already resolved by hand.\n');
    expect(await cli('resolve', 'manual.txt', '--combine', '--dir', projectRoot)).toMatchObject({ code: 1, report: { error: { message: 'manual.txt is already resolved.' } } });
    expect(await cli('resolve', home, '--take-kit', '--dir', projectRoot)).toMatchObject({ code: 1, report: { error: { message: expect.stringMatching(/not in the upgrade decisions/) } } });
  });

  it('acknowledges a kept file without replacing it and rejects repeat actions', async () => {
    const text = Buffer.from([0, 3]);
    await writeFile(join(projectRoot, logo), text);
    await upgrade();
    expect(await cli('resolve', logo, '--combine', '--dir', projectRoot)).toMatchObject({ code: 1, report: { error: { message: expect.stringMatching(/nothing to combine/) } } });
    expect(await cli('resolve', logo, '--keep-mine', '--dir', projectRoot)).toMatchObject({ code: 0, report: { decisions: [expect.objectContaining({ kind: 'keep-edited', pending: false, resolution: 'keep-mine' })] } });
    expect(await readFile(join(projectRoot, logo))).toEqual(text);
    expect(await cli('resolve', logo, '--take-kit', '--dir', projectRoot)).toMatchObject({ code: 1, report: { error: { message: expect.stringMatching(/already resolved/) } } });
  });

  it('restores the saved kit copy of a kept file', async () => {
    await writeFile(join(projectRoot, logo), Buffer.from([0, 3]));
    await upgrade();
    expect(await cli('resolve', logo, '--take-kit', '--dir', projectRoot)).toMatchObject({ code: 0 });
    expect(await readFile(join(projectRoot, logo))).toEqual(await readFile(join(to.dir, logo)));
  });

  it('refuses to take the kit copy when no copy was saved', async () => {
    await writeFile(join(projectRoot, 'obsolete.txt'), 'custom text');
    await upgrade();
    expect(await cli('resolve', 'obsolete.txt', '--take-kit', '--dir', projectRoot)).toMatchObject({ code: 1, report: { error: { message: expect.stringMatching(/No saved kit version/) } } });
  });
});

describe('resolve walkthrough', () => {
  it('shows both sides before choosing the suggestion, skips, and quits', async () => {
    await editHome();
    await upgrade();
    await setupConflict('skip.txt', hunk(2));
    await setupConflict('quit.txt', hunk(3));
    const report = vi.spyOn(console, 'log').mockImplementation(() => {});
    const asked: string[] = [];
    const choices: ResolveChoice[] = ['show', 'take-kit', 'skip', 'quit'];
    try {
      const result = await runResolve({ projectRoot, walkthrough: {
        show: printResolveView,
        choose: async (view) => {
          asked.push(view.decision.path);
          const choice = choices.shift();
          if (choice === 'take-kit') expect(view.decision.suggestion?.action).toBe(choice);
          return choice ?? 'quit';
        },
        showSides: console.log,
        showError: console.error,
      } });
      expect(asked).toEqual([home, home, 'skip.txt', 'quit.txt']);
      expect(result.decisions.filter(({ pending }) => pending).map(({ path }) => path)).toEqual(['skip.txt', 'quit.txt']);
      const transcript = report.mock.calls.flat().join('\n');
      expect(transcript).toContain(`[1/3] ${home}   conflict`);
      expect(transcript).toContain('Kit change   Safer home  base · security');
      expect(transcript).toContain('You          removed 1 line · added 1 line');
      expect(transcript).toContain('Suggestion   Take the kit version, then re-apply your edits.');
      expect(transcript).toContain('Hunk 1\nYou\n  <h1>Your home</h1>\nKit\n  <h1>Home v2</h1>');
    } finally {
      report.mockRestore();
    }
  });

  it('reports a failed decision under its file and continues the walkthrough', async () => {
    const broken = 'broken.txt';
    const valid = 'valid.txt';
    const malformed = hunk(1).replace('>>>>>>> kit (new)\n', '');
    await setupConflict(broken, malformed);
    await setupConflict(valid, hunk(2));
    const transcript: string[] = [];
    const outcome = await runResolve({ projectRoot, walkthrough: {
      show: ({ decision }) => { transcript.push(decision.path); },
      choose: async () => 'keep-mine',
      showSides: () => {},
      showError: (message: string) => { transcript.push(message); },
    } });
    expect(transcript).toEqual([broken, expect.stringContaining('incomplete or malformed'), valid]);
    expect(outcome.decisions.filter(({ pending }) => pending).map(({ path }) => path)).toEqual([broken]);
    expect(await readFile(join(projectRoot, broken), 'utf8')).toBe(malformed);
    expect(await readFile(join(projectRoot, valid), 'utf8')).toBe('yours 2\n');
  });

  it('walks kept files only with --all and lets the user decline their notes', async () => {
    await writeFile(join(projectRoot, logo), Buffer.from([0, 3]));
    await upgrade();
    const visited: ResolveView[] = [];
    const walkthrough = {
      show: (view: ResolveView) => { visited.push(view); },
      choose: async (): Promise<ResolveChoice> => 'decline',
      showSides: () => {},
      showError: () => {},
    };
    await runResolve({ projectRoot, walkthrough });
    expect(visited).toEqual([]);
    const result = await runResolve({ projectRoot, all: true, walkthrough });
    expect(visited.map(({ decision }) => decision.path)).toEqual([logo]);
    expect(result.decisions[0]).toMatchObject({ pending: false, resolution: 'keep-mine' });
    expect((await readState(projectRoot)).declined).toEqual(['base.logo']);
  });

  it('prints named missing features and the suggestion in the terminal report', async () => {
    await editHome();
    const transition = await upgrade();
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      printTransitionReport(transition, false);
      const text = output.mock.calls.flat().join('\n');
      expect(text).toContain('You may be missing: Safer home (base).');
      expect(text).toContain(`${home} — Take the kit version.`);
    } finally {
      output.mockRestore();
    }
  });
});
