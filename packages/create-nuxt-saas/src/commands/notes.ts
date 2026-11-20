import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ParsedArgs } from 'citty';
import { glob } from 'tinyglobby';
import type { notesArgs } from '../arguments';
import { CliError } from '../errors';
import { git, splitPaths } from '../git/snapshot';
import { readKitConfig } from '../kit/config';
import { kitSource, targetCommit } from '../kit/context';
import { collectNotes, compareVersions } from '../kit/notes';
import { DEFAULT_TEMPLATE, openKit } from '../kit/source';
import { printJson } from '../report';
import { readKitVersion } from '../transition/savedReport';
import { JSON_SCHEMA, type JsonNotesReport } from '../types/json';
import { resolveInside, toPosixPath } from '../util/paths';
import { cleanupOnTermination } from '../util/terminationCleanup';

async function filterPaths(paths: string[], exclude: string[]): Promise<string[]> {
  if (!paths.length || !exclude.length) return paths;
  // Match the renderer's glob rules even for files absent from the current kit.
  const dir = await mkdtemp(join(tmpdir(), 'nuxt-saas-notes-'));
  const cleanup = () => rm(dir, { recursive: true, force: true });
  const stopWatching = cleanupOnTermination(cleanup);
  try {
    for (const path of paths) {
      const absolute = resolveInside(dir, path, 'Changed kit file');
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, '');
    }
    const included = await glob('**/*', { cwd: dir, dot: true, onlyFiles: true, ignore: exclude });
    return included.map(toPosixPath);
  } finally {
    stopWatching();
    await cleanup();
  }
}

export async function notesCommand(args: ParsedArgs<typeof notesArgs>): Promise<number> {
  if (args.check !== (args.since !== undefined)) throw new CliError('Use --check and --since <git ref> together.');
  const template = DEFAULT_TEMPLATE;
  const source = kitSource({ ...args, 'use-uncommitted-kit': false }, template);
  if (source.kind !== 'local') throw new CliError('Use --kit <path> to provide a local kit checkout.');
  const commit = await targetCommit(source, undefined);
  const kit = await openKit(source, commit, template);
  try {
    const config = await readKitConfig(kit.dir);
    const notes = collectNotes(config.changes, kit.modules);
    const report: JsonNotesReport = { schema: JSON_SCHEMA, notes };
    if (args.since !== undefined) {
      const since = await targetCommit(source, args.since);
      const version = await readKitVersion(kit.dir);
      if (compareVersions(version, version) === null) throw new CliError('The kit package.json must have an x.y.z version to check change notes.');
      const covered = new Set(notes.filter(({ since }) => since === version).flatMap(({ files }) => files));
      const diff = ['diff', '--no-renames', '--name-only', '-z'];
      // A file can become a directory (or vice versa); keep the two path sets separate.
      const files = await Promise.all(['D', 'd'].map(async (filter) => {
        const paths = splitPaths(await git(source.path, [...diff, `--diff-filter=${filter}`, since, commit, '--']));
        return filterPaths(paths.filter((path) => !covered.has(path)), config.exclude);
      }));
      report.uncovered = [...new Set(files.flat())].sort();
    }
    if (args.json) printJson(report);
    else if (report.uncovered !== undefined) {
      if (!report.uncovered.length) console.log('All changed kit files have a change note.');
      else {
        console.log('Changed kit files without a change note for this release:');
        for (const path of report.uncovered) console.log(`  ${path}`);
      }
    } else if (!notes.length) console.log('No change notes.');
    else for (const note of notes) console.log(`${note.since}  ${note.id}  ${note.title} (${note.module} · ${note.kind})`);
    return report.uncovered?.length ? 1 : 0;
  } finally {
    await kit.cleanup();
  }
}
